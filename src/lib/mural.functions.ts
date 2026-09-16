import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
      const { sendWebPush } = await import("@/lib/webpush.server");

      const VAPID_PUBLIC_KEY = process.env["VAPID_PUBLIC_KEY"];
      const VAPID_PRIVATE_KEY = process.env["VAPID_PRIVATE_KEY"];
      const VAPID_SUBJECT = process.env["VAPID_SUBJECT"];
      if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
        console.error("[mural] VAPID não configurado — pulando push.");
        return { sent: 0, failed: 0 };
      }

      // destinatarios == null/undefined -> aviso "para todos" (empurra pra
      // todo mundo, menos quem postou). destinatarios == [] com valores ->
      // empurra só pra essas pessoas (ainda excluindo quem postou, por
      // garantia, mesmo que a lista já não devesse incluí-lo).
      let subsQuery = supabaseAdmin
        .from("mural_push_subscriptions")
        .select("id, endpoint, p256dh, auth, user_id")
        .neq("user_id", context.userId);
      if (Array.isArray(data.destinatarios)) {
        subsQuery = subsQuery.in("user_id", data.destinatarios);
      }
      const { data: subs, error } = await subsQuery;
      if (error) throw error;

      let sent = 0;
      let failed = 0;
      const preview = data.texto.length > 120 ? `${data.texto.slice(0, 117)}...` : data.texto;

      await Promise.all(
        (subs ?? []).map(async (sub) => {
          try {
            const result = await sendWebPush(
              { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
              { title: `Novo aviso de ${data.autorNome}`, body: preview, url: "/app" },
              { publicKey: VAPID_PUBLIC_KEY, privateKey: VAPID_PRIVATE_KEY, subject: VAPID_SUBJECT },
            );
            if (result.expired) {
              await supabaseAdmin.from("mural_push_subscriptions").delete().eq("id", sub.id);
            }
            if (result.ok) sent++;
            else failed++;
          } catch (e) {
            console.error("[mural] falha ao enviar push", e);
            failed++;
          }
        }),
      );

      return { sent, failed };
    } catch (e) {
      // Nunca deixa o erro subir e travar a UI de quem postou o aviso.
      console.error("[mural] notifyNewAviso falhou por completo", e);
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
