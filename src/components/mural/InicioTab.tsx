import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ClipboardList, BellRing, ChevronRight } from "lucide-react";

import { corDoUsuario } from "@/lib/colors";
import type { MuralAccess } from "@/lib/permissions";
import { useResumoAvisos, useMarcarAvisoLido, useTarefasPendentesCount } from "@/lib/mural-contadores";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

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
  // Hooks compartilhados com a bolinha das abas (mesmas chaves de cache que
  // a aba Mural/Minhas Tarefas já usam) — ver src/lib/mural-contadores.ts.
  // Só LEEM o que já existe: abrir o Início nunca marca nada como lido —
  // isso só acontece de fato quando a pessoa clica numa mensagem específica
  // (abaixo) ou abre a aba Mural de verdade.
  const { avisos, loading: avisosLoading, naoLidosCount, jaLi } = useResumoAvisos(access.userId);
  const { count: pendentesCount, loading: tarefasLoading } = useTarefasPendentesCount(access.userId);
  const marcarLida = useMarcarAvisoLido(access.userId);

  const ultimosAvisos = avisos.slice(0, 5);
  const primeiroNomeUsuario = primeiroNome(access.nome || "");

  function abrirAviso(avisoId: string, autorId: string) {
    if (autorId !== access.userId) marcarLida.mutate(avisoId);
    onNavigate("mural");
  }

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
              {tarefasLoading ? "…" : `${pendentesCount} ${pendentesCount === 1 ? "tarefa pendente" : "tarefas pendentes"}`}
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
              {avisosLoading
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

        {avisosLoading && <p className="text-sm text-muted-foreground text-center py-6">Carregando...</p>}
        {!avisosLoading && ultimosAvisos.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhum aviso ainda.</p>
        )}

        <div className="space-y-2">
          {ultimosAvisos.map((aviso) => {
            const lido = jaLi(aviso.id, aviso.autor_id);
            return (
              <button
                key={aviso.id}
                onClick={() => abrirAviso(aviso.id, aviso.autor_id)}
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
