import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ClipboardList, BellRing, ChevronRight } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { corDoUsuario } from "@/lib/colors";
import type { MuralAccess } from "@/lib/permissions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

type AvisoResumo = {
  id: string;
  autor_id: string;
  autor_nome: string;
  texto: string;
  criado_em: string;
};

type TarefaResumo = { id: string; feita: boolean };

function initials(nome: string) {
  const parts = nome.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function primeiroNome(nome: string) {
  return nome.trim().split(/\s+/)[0] || nome;
}

function saudacao() {
  const hora = new Date().getHours();
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

export function InicioTab({
  access,
  onNavigate,
}: {
  access: MuralAccess;
  onNavigate: (aba: "tarefas" | "mural") => void;
}) {
  // Consultas próprias desta tela (chaves e queries separadas das já usadas
  // em Mural/Minhas Tarefas) — assim a tela de Início só LÊ o que já existe,
  // sem interferir no cache das outras abas nem marcar nada como lido: quem
  // marca "avisos não lidos" como lidos continua sendo só a aba Mural, ao
  // abrir de fato o feed (aqui é só um resumo, pra não "gastar" a leitura só
  // de dar uma olhada no Início).
  const tarefasQuery = useQuery({
    queryKey: ["mural-inicio-tarefas", access.userId],
    enabled: !!access.userId,
    queryFn: async () => {
      const { data, error } = await supabase.from("mural_tarefas").select("id, feita");
      if (error) throw error;
      return data as TarefaResumo[];
    },
  });

  const avisosQuery = useQuery({
    queryKey: ["mural-inicio-avisos"],
    enabled: !!access.userId,
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mural_avisos")
        .select("id, autor_id, autor_nome, texto, criado_em")
        .order("fixado", { ascending: false })
        .order("criado_em", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data as AvisoResumo[];
    },
  });

  const avisosIdsKey = useMemo(
    () => (avisosQuery.data ?? []).map((a) => a.id).join(","),
    [avisosQuery.data],
  );

  // Quais desses últimos avisos eu (o usuário logado) já li — a mesma tabela
  // que a aba Mural usa pra marcar leitura, só que aqui filtrando só a minha
  // linha, já que aqui não precisamos saber quem mais leu.
  const leiturasQuery = useQuery({
    queryKey: ["mural-inicio-leituras", avisosIdsKey, access.userId],
    enabled: !!access.userId && (avisosQuery.data?.length ?? 0) > 0,
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mural_aviso_leituras")
        .select("aviso_id")
        .eq("user_id", access.userId as string)
        .in("aviso_id", (avisosQuery.data ?? []).map((a) => a.id));
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.aviso_id));
    },
  });

  const tarefas = tarefasQuery.data ?? [];
  const pendentesCount = tarefas.filter((t) => !t.feita).length;

  const avisos = avisosQuery.data ?? [];
  const lidos = leiturasQuery.data ?? new Set<string>();
  // "Não lido" = não fui eu que postei e ainda não tem registro de leitura —
  // é exatamente o mesmo critério que a aba Mural usa pra marcar como lido
  // assim que a lista carrega lá.
  const naoLidosCount = avisos.filter((a) => a.autor_id !== access.userId && !lidos.has(a.id)).length;

  const primeiroNomeUsuario = primeiroNome(access.nome || "");

  return (
    <div className="space-y-6">
      <div>
        <h2>
          {saudacao()}{primeiroNomeUsuario ? `, ${primeiroNomeUsuario}` : ""}! 👋
        </h2>
        <p className="text-sm text-muted-foreground mt-1">Aqui está seu resumo de hoje.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          onClick={() => onNavigate("tarefas")}
          className="panel p-4 text-left flex items-center gap-3 transition-transform hover:-translate-y-0.5"
        >
          <div className="flex items-center justify-center rounded-lg btn-gold shrink-0 w-11 h-11">
            <ClipboardList className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-muted-foreground">Minhas tarefas</p>
            <p className="font-bold text-base">
              {tarefasQuery.isLoading ? "…" : `${pendentesCount} ${pendentesCount === 1 ? "tarefa pendente" : "tarefas pendentes"}`}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </button>

        <button
          onClick={() => onNavigate("mural")}
          className={`panel p-4 text-left flex items-center gap-3 transition-transform hover:-translate-y-0.5 ${
            naoLidosCount > 0 ? "blink-alert" : ""
          }`}
        >
          <div className="flex items-center justify-center rounded-lg btn-gold shrink-0 w-11 h-11">
            <BellRing className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-muted-foreground">Avisos não lidos</p>
            <p className="font-bold text-base">
              {avisosQuery.isLoading
                ? "…"
                : naoLidosCount === 0
                  ? "Tudo em dia"
                  : `${naoLidosCount} ${naoLidosCount === 1 ? "aviso novo" : "avisos novos"}`}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </button>
      </div>

      <div>
        <p className="text-xs uppercase text-muted-foreground mb-2">Últimos avisos</p>

        {avisosQuery.isLoading && (
          <p className="text-sm text-muted-foreground text-center py-6">Carregando...</p>
        )}
        {!avisosQuery.isLoading && avisos.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhum aviso ainda.</p>
        )}

        <div className="space-y-2">
          {avisos.map((aviso) => {
            const souAutor = aviso.autor_id === access.userId;
            const lido = souAutor || lidos.has(aviso.id);
            return (
              <button
                key={aviso.id}
                onClick={() => onNavigate("mural")}
                className="panel p-3 w-full text-left flex items-start gap-3"
              >
                <Avatar style={{ boxShadow: `0 0 0 2px ${corDoUsuario(aviso.autor_id)}` }} className="shrink-0">
                  <AvatarFallback className="font-semibold" style={{ color: corDoUsuario(aviso.autor_id) }}>
                    {initials(aviso.autor_nome)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm" style={{ color: corDoUsuario(aviso.autor_id) }}>
                      {aviso.autor_nome}
                    </span>
                    <Badge
                      variant="outline"
                      className={lido ? "text-muted-foreground" : "text-gold border-gold"}
                    >
                      {lido ? "LIDO" : "NOVO"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(aviso.criado_em), { addSuffix: true, locale: ptBR })}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap break-words text-[13px] text-foreground/80 font-normal">
                    {aviso.texto}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
