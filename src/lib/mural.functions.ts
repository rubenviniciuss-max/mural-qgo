import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Padrão de vibração por som escolhido (só o Android obedece isso com o app
// fechado — o iPhone ignora vibração de notificação push. O som em si nunca
// pode ser trocado nessa hora, em nenhuma plataforma).
const VIBRA_POR_SOM: Record<string, number[]> = {
  sino: [150, 80, 150],
  sirene: [100, 60, 100, 60, 100, 60, 100, 60, 300],
  bipe: [120],
};

// ---------------------------------------------------------------
// Helper compartilhado: manda push pra uma lista de user_ids (busca as
// inscrições e o som preferido de cada um, envia em paralelo, e já limpa
// inscrições expiradas). Usado tanto por aviso novo quanto por comentário
// novo — antes só existia pra aviso, e por isso comentário nunca notificava
// ninguém.
// ---------------------------------------------------------------
type SupabaseAdminClient = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

async function dispararPushParaUsuarios(
  supabaseAdmin: SupabaseAdminClient,
  userIds: string[],
  payload: { title: string; body: string; url: string },
): Promise<{ sent: number; failed: number }> {
  if (userIds.length === 0) return { sent: 0, failed: 0 };

  const VAPID_PUBLIC_KEY = process.env["VAPID_PUBLIC_KEY"];
  const VAPID_PRIVATE_KEY = process.env["VAPID_PRIVATE_KEY"];
  const VAPID_SUBJECT = process.env["VAPID_SUBJECT"];
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
    console.error("[mural] VAPID não configurado — pulando push.");
    return { sent: 0, failed: 0 };
  }

  const { sendWebPush } = await import("@/lib/webpush.server");

  // As duas consultas não dependem uma da outra — rodar em paralelo em vez
  // de uma depois da outra economiza uma ida-e-volta ao banco, o que ajuda
  // a mandar o push mais rápido (parte do "demora pra enviar" reportado).
  const [{ data: subs, error }, { data: usuariosAtivos }] = await Promise.all([
    supabaseAdmin
      .from("mural_push_subscriptions")
      .select("id, endpoint, p256dh, auth, user_id")
      .in("user_id", userIds),
    supabaseAdmin.from("mural_usuarios").select("id, som_preferido").in("id", userIds),
  ]);
  if (error) throw error;

  const somPorUsuario = new Map(
    ((usuariosAtivos ?? []) as { id: string; som_preferido: string }[]).map((u) => [u.id, u.som_preferido]),
  );

  let sent = 0;
  let failed = 0;

  await Promise.all(
    (subs ?? []).map(async (sub) => {
      const som = somPorUsuario.get(sub.user_id) ?? "sino";
      const enviar = () =>
        sendWebPush(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          { ...payload, vibrate: VIBRA_POR_SOM[som] ?? VIBRA_POR_SOM.sino },
          { publicKey: VAPID_PUBLIC_KEY, privateKey: VAPID_PRIVATE_KEY, subject: VAPID_SUBJECT },
        );
      try {
        let result = await enviar();
        if (result.expired) {
          // Inscrição morta (navegador desinstalado, permissão revogada faz
          // tempo etc.) — limpa aqui pra não ficar tentando de novo pra
          // sempre, mesmo que a pessoa nunca mais abra o Mural.
          await supabaseAdmin.from("mural_push_subscriptions").delete().eq("id", sub.id);
        } else if (!result.ok) {
          // Falha que não é "inscrição morta" costuma ser algo passageiro no
          // serviço de push (erro 5xx, limite momentâneo etc.) — tenta mais
          // uma vez antes de desistir, em vez de simplesmente não notificar.
          console.error("[mural] push falhou (status " + result.status + "), tentando de novo uma vez");
          result = await enviar();
          if (result.expired) {
            await supabaseAdmin.from("mural_push_subscriptions").delete().eq("id", sub.id);
          }
        }
        if (result.ok) sent++;
        else {
          failed++;
          console.error("[mural] push falhou após nova tentativa (status " + result.status + ")");
        }
      } catch (e) {
        console.error("[mural] falha ao enviar push", e);
        failed++;
      }
    }),
  );

  return { sent, failed };
}

// ---------------------------------------------------------------
// Disparar push notification para todo mundo (menos quem postou) quando
// um novo aviso é criado no Mural. Chamado pelo cliente logo depois de
// inserir o aviso (o insert em si usa RLS direto, sem passar por aqui).
// Falha aqui nunca deve impedir o post de aparecer — é só o "sininho".
// ---------------------------------------------------------------
export const notifyNewAviso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { avisoId: string; autorNome: string; texto: string; destinatarios?: string[] | null }) => d)
  .handler(async ({ data, context }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      // destinatarios == null/undefined -> aviso "para todos" (empurra pra
      // todo mundo ativo, menos quem postou). destinatarios == [] com
      // valores -> empurra só pra essas pessoas.
      let publico: string[];
      if (Array.isArray(data.destinatarios)) {
        publico = data.destinatarios.filter((id) => id !== context.userId);
      } else {
        const { data: ativos, error } = await supabaseAdmin.from("mural_usuarios").select("id").eq("ativo", true);
        if (error) throw error;
        publico = (ativos ?? []).map((u) => u.id).filter((id) => id !== context.userId);
      }

      const preview = data.texto.length > 120 ? `${data.texto.slice(0, 117)}...` : data.texto;
      return await dispararPushParaUsuarios(supabaseAdmin, publico, {
        title: `Novo aviso de ${data.autorNome}`,
        body: preview,
        url: "/app",
      });
    } catch (e) {
      // Nunca deixa o erro subir e travar a UI de quem postou o aviso.
      console.error("[mural] notifyNewAviso falhou por completo", e);
      return { sent: 0, failed: 0 };
    }
  });

// ---------------------------------------------------------------
// Disparar push notification quando alguém COMENTA num aviso — antes só
// existia para aviso novo, então comentário nunca chegava a notificar
// ninguém que não estivesse com o Mural aberto na hora. O público é quem já
// podia ver o aviso (destinatários dele, ou todo mundo ativo se for "para
// todos") mais o autor original do aviso (que precisa saber que comentaram
// no que ele postou, mesmo não estando nos "destinatários" do próprio
// aviso) — menos quem comentou agora.
// ---------------------------------------------------------------
export const notifyNewComentario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { avisoId: string; autorNome: string; texto: string }) => d)
  .handler(async ({ data, context }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const { data: aviso, error: avisoError } = await supabaseAdmin
        .from("mural_avisos")
        .select("autor_id, todos")
        .eq("id", data.avisoId)
        .maybeSingle();
      if (avisoError) throw avisoError;
      if (!aviso) return { sent: 0, failed: 0 };

      const publicoSet = new Set<string>();
      if (aviso.todos) {
        const { data: ativos, error } = await supabaseAdmin.from("mural_usuarios").select("id").eq("ativo", true);
        if (error) throw error;
        (ativos ?? []).forEach((u) => publicoSet.add(u.id));
      } else {
        const { data: dests, error } = await supabaseAdmin
          .from("mural_aviso_destinatarios")
          .select("user_id")
          .eq("aviso_id", data.avisoId);
        if (error) throw error;
        (dests ?? []).forEach((d) => publicoSet.add(d.user_id));
      }
      publicoSet.add(aviso.autor_id);
      publicoSet.delete(context.userId);

      const preview = data.texto.length > 120 ? `${data.texto.slice(0, 117)}...` : data.texto;
      return await dispararPushParaUsuarios(supabaseAdmin, Array.from(publicoSet), {
        title: `${data.autorNome} comentou no mural`,
        body: preview,
        url: "/app",
      });
    } catch (e) {
      console.error("[mural] notifyNewComentario falhou por completo", e);
      return { sent: 0, failed: 0 };
    }
  });

// ---------------------------------------------------------------
// Admin adiciona uma pessoa da equipe ao Mural pelo e-mail (a conta já
// precisa existir no Supabase Auth compartilhado da QGO — por exemplo,
// quem já tem login no Painel Operacional).
// ---------------------------------------------------------------
export const adminAddUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { email: string; nome: string; admin?: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: me, error: meError } = await context.supabase
      .from("mural_usuarios")
      .select("admin, ativo")
      .eq("id", context.userId)
      .maybeSingle();
    if (meError) throw meError;
    if (!me?.admin || !me.ativo) {
      throw new Error("Apenas administradores do Mural podem adicionar pessoas.");
    }

    const email = data.email.trim().toLowerCase();
    if (!email) throw new Error("Informe um e-mail.");

    const { data: found, error: lookupError } = await supabaseAdmin.rpc(
      "mural_lookup_user_by_email" as never,
      { p_email: email } as never,
    );
    if (lookupError) throw lookupError;
    const row = Array.isArray(found) ? found[0] : found;
    if (!row?.id) {
      throw new Error(
        "Não encontramos uma conta com esse e-mail. A pessoa precisa já ter login em alguma ferramenta da QGO.",
      );
    }

    const { error: upsertError } = await supabaseAdmin.from("mural_usuarios").upsert({
      id: row.id,
      nome: data.nome.trim() || email,
      admin: !!data.admin,
      ativo: true,
    });
    if (upsertError) throw upsertError;

    return { ok: true };
  });
