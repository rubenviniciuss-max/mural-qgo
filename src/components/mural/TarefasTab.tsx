import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2, Loader2, ChevronDown, ChevronRight, X, CheckCircle2, Pencil, Building2, ShieldCheck, TrendingUp } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { relatorioLucroCertificados } from "@/lib/mural.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

/** "concluida_em" guarda quando a etapa foi marcada (ISO, preenchido no
 *  clique) — null enquanto não concluída, e limpo de volta pra null se a
 *  pessoa desmarcar. Hoje alimenta dois lugares: a data mostrada ao lado da
 *  etapa (ex.: "ENVIADO NA CERTIFICADORA — no dia 06/11/2026") e, pra etapa
 *  "PAGO" dos certificados, o relatório de lucro (relatorioLucroCertificados,
 *  em mural.functions.ts). */
type Etapa = { texto: string; concluida: boolean; concluida_em: string | null };

function fmtBRL(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDataBR(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR");
}

type Tarefa = {
  id: string;
  texto: string;
  feita: boolean;
  ordem: number;
  criado_em: string;
  notas: string | null;
  etapas: Etapa[];
};

// As 4 etapas padrão de toda abertura de empresa — antes a pessoa tinha que
// digitar e adicionar uma por uma toda vez que abria uma empresa nova. Agora
// o botão "Nova abertura de empresa" já cria a tarefa com essas 4 etapas
// prontas, na ordem certa.
const ETAPAS_ABERTURA = ["FAZER VIABILIDADE", "ASSINATURA", "INSCRIÇÃO MUNICIPAL", "PROCURAÇÃO"];

// As 3 etapas padrão de todo certificado digital, na ordem em que o processo
// de fato acontece — mesmo esquema da "abertura de empresa": o botão "Novo
// certificado" já cria a tarefa com essas 3 etapas prontas.
const ETAPAS_CERTIFICADO = ["PAGO", "ENVIADO NA CERTIFICADORA", "BAIXADO"];

function etapasSeguras(valor: unknown): Etapa[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
    .map((e) => ({
      texto: typeof e.texto === "string" ? e.texto : "",
      concluida: !!e.concluida,
      concluida_em: typeof e.concluida_em === "string" ? e.concluida_em : null,
    }));
}

export function TarefasTab({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const [novaTarefa, setNovaTarefa] = useState("");
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  const [mostrarAbertura, setMostrarAbertura] = useState(false);
  const [nomeAbertura, setNomeAbertura] = useState("");
  const [mostrarCertificado, setMostrarCertificado] = useState(false);
  const [nomeCertificado, setNomeCertificado] = useState("");

  const tarefasQuery = useQuery({
    queryKey: ["mural-minhas-tarefas", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mural_tarefas")
        .select("*")
        .order("feita", { ascending: true })
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((t: any) => ({ ...t, etapas: etapasSeguras(t.etapas) })) as Tarefa[];
    },
  });

  const adicionar = useMutation({
    mutationFn: async () => {
      const texto = novaTarefa.trim();
      if (!texto) return;
      const { error } = await supabase.from("mural_tarefas").insert({ user_id: userId, texto });
      if (error) throw error;
    },
    onSuccess: () => {
      setNovaTarefa("");
      qc.invalidateQueries({ queryKey: ["mural-minhas-tarefas", userId] });
      // Atualiza a bolinha/balão de "tarefas pendentes" na hora, sem
      // esperar o próximo refetch daquele contador.
      qc.invalidateQueries({ queryKey: ["mural-tarefas-pendentes-count", userId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Cria a tarefa de "abertura de empresa" já com as 4 etapas padrão
  // preenchidas, em vez de a pessoa ter que adicionar cada etapa na mão
  // toda vez que abre uma empresa nova.
  const adicionarAbertura = useMutation({
    mutationFn: async () => {
      const nome = nomeAbertura.trim();
      if (!nome) return;
      const texto = `ABERTURA ${nome.toUpperCase()}`;
      const etapas: Etapa[] = ETAPAS_ABERTURA.map((etapaTexto) => ({ texto: etapaTexto, concluida: false, concluida_em: null }));
      const { error } = await supabase.from("mural_tarefas").insert({ user_id: userId, texto, etapas: etapas as any });
      if (error) throw error;
    },
    onSuccess: () => {
      setNomeAbertura("");
      setMostrarAbertura(false);
      qc.invalidateQueries({ queryKey: ["mural-minhas-tarefas", userId] });
      qc.invalidateQueries({ queryKey: ["mural-tarefas-pendentes-count", userId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Cria a tarefa de "certificado" já com as 3 etapas padrão preenchidas,
  // mesmo esquema da abertura de empresa acima.
  const adicionarCertificado = useMutation({
    mutationFn: async () => {
      const nome = nomeCertificado.trim();
      if (!nome) return;
      const texto = `CERTIFICADO ${nome.toUpperCase()}`;
      const etapas: Etapa[] = ETAPAS_CERTIFICADO.map((etapaTexto) => ({ texto: etapaTexto, concluida: false, concluida_em: null }));
      const { error } = await supabase.from("mural_tarefas").insert({ user_id: userId, texto, etapas: etapas as any });
      if (error) throw error;
    },
    onSuccess: () => {
      setNomeCertificado("");
      setMostrarCertificado(false);
      qc.invalidateQueries({ queryKey: ["mural-minhas-tarefas", userId] });
      qc.invalidateQueries({ queryKey: ["mural-tarefas-pendentes-count", userId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const alternar = useMutation({
    mutationFn: async (t: Tarefa) => {
      const { error } = await supabase.from("mural_tarefas").update({ feita: !t.feita }).eq("id", t.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mural-minhas-tarefas", userId] });
      qc.invalidateQueries({ queryKey: ["mural-tarefas-pendentes-count", userId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("mural_tarefas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mural-minhas-tarefas", userId] });
      qc.invalidateQueries({ queryKey: ["mural-tarefas-pendentes-count", userId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const atualizarTexto = useMutation({
    mutationFn: async ({ id, texto }: { id: string; texto: string }) => {
      const limpo = texto.trim();
      if (!limpo) throw new Error("O nome da tarefa não pode ficar vazio.");
      const { error } = await supabase.from("mural_tarefas").update({ texto: limpo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mural-minhas-tarefas", userId] }),
    onError: (e: any) => toast.error(e.message),
  });

  const salvarEtapas = useMutation({
    mutationFn: async ({ id, etapas }: { id: string; etapas: Etapa[] }) => {
      const { error } = await supabase.from("mural_tarefas").update({ etapas: etapas as any }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mural-minhas-tarefas", userId] });
      // Qualquer etapa pode ter mudado (inclusive "PAGO" de um certificado),
      // e essa consulta é leve — mais simples invalidar sempre do que
      // descobrir aqui se a etapa alterada era mesmo a de pagamento.
      qc.invalidateQueries({ queryKey: ["mural-lucro-certificados"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Relatório de lucro dos certificados — soma de TODOS os colaboradores
  // (não só o que está logado), por isso não depende de userId. Atualiza
  // sozinho quando qualquer etapa é marcada/desmarcada (ver salvarEtapas).
  const relatorioLucroFn = useServerFn(relatorioLucroCertificados);
  const lucroQuery = useQuery({
    queryKey: ["mural-lucro-certificados"],
    queryFn: () => relatorioLucroFn(),
  });
  const lucro = lucroQuery.data;

  function toggleExpandida(id: string) {
    setExpandidas((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  const tarefas = tarefasQuery.data ?? [];
  const pendentes = tarefas.filter((t) => !t.feita);
  const concluidas = tarefas.filter((t) => t.feita);

  return (
    <div className="space-y-4 max-w-2xl">
      <p className="text-sm text-muted-foreground">
        Suas anotações pessoais — só você vê essa lista. Abra uma tarefa pra dividir em etapas.
      </p>

      <LucroCertificadosCard lucro={lucro} loading={lucroQuery.isLoading} />

      <div className="flex gap-2">
        <Input
          placeholder="Nova tarefa..."
          value={novaTarefa}
          onChange={(e) => setNovaTarefa(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && adicionar.mutate()}
        />
        <Button onClick={() => adicionar.mutate()} disabled={adicionar.isPending || !novaTarefa.trim()}>
          {adicionar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        </Button>
      </div>

      {mostrarAbertura ? (
        <div className="panel p-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            Cria a tarefa já com as 4 etapas de sempre: Fazer viabilidade, Assinatura, Inscrição municipal e
            Procuração.
          </p>
          <div className="flex gap-2">
            <Input
              autoFocus
              placeholder="Nome da empresa..."
              value={nomeAbertura}
              onChange={(e) => setNomeAbertura(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") adicionarAbertura.mutate();
                if (e.key === "Escape") setMostrarAbertura(false);
              }}
            />
            <Button
              onClick={() => adicionarAbertura.mutate()}
              disabled={adicionarAbertura.isPending || !nomeAbertura.trim()}
            >
              {adicionarAbertura.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Criar"}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setMostrarAbertura(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setMostrarAbertura(true)} className="gap-1.5">
          <Building2 className="w-4 h-4" /> Nova abertura de empresa
        </Button>
      )}

      {mostrarCertificado ? (
        <div className="panel p-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            Cria a tarefa já com as 3 etapas de sempre: Pago, Enviado na certificadora e Baixado.
          </p>
          <div className="flex gap-2">
            <Input
              autoFocus
              placeholder="Nome do cliente..."
              value={nomeCertificado}
              onChange={(e) => setNomeCertificado(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") adicionarCertificado.mutate();
                if (e.key === "Escape") setMostrarCertificado(false);
              }}
            />
            <Button
              onClick={() => adicionarCertificado.mutate()}
              disabled={adicionarCertificado.isPending || !nomeCertificado.trim()}
            >
              {adicionarCertificado.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Criar"}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setMostrarCertificado(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setMostrarCertificado(true)} className="gap-1.5">
          <ShieldCheck className="w-4 h-4" /> Novo certificado
        </Button>
      )}

      {tarefasQuery.isLoading && <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>}

      {!tarefasQuery.isLoading && tarefas.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">Nenhuma tarefa por aqui ainda.</p>
      )}

      <div className="space-y-2">
        {pendentes.map((t) => (
          <TarefaRow
            key={t.id}
            tarefa={t}
            expandida={expandidas.has(t.id)}
            onToggleExpandida={() => toggleExpandida(t.id)}
            onToggle={() => alternar.mutate(t)}
            onRemove={() => remover.mutate(t.id)}
            onSalvarTexto={(texto) => atualizarTexto.mutate({ id: t.id, texto })}
            onSalvarEtapas={(etapas) => salvarEtapas.mutate({ id: t.id, etapas })}
          />
        ))}
      </div>

      {concluidas.length > 0 && (
        <div className="space-y-2 pt-2">
          <p className="text-xs uppercase text-muted-foreground">Concluídas</p>
          {concluidas.map((t) => (
            <TarefaRow
              key={t.id}
              tarefa={t}
              expandida={expandidas.has(t.id)}
              onToggleExpandida={() => toggleExpandida(t.id)}
              onToggle={() => alternar.mutate(t)}
              onRemove={() => remover.mutate(t.id)}
              onSalvarTexto={(texto) => atualizarTexto.mutate({ id: t.id, texto })}
              onSalvarEtapas={(etapas) => salvarEtapas.mutate({ id: t.id, etapas })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

type LucroCertificados = {
  totalPagos: number;
  totalLucro: number;
  porMes: { mes: string; quantidade: number; lucro: number }[];
};

const NOMES_MES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** "2026-11" -> "novembro/2026". */
function fmtMes(chave: string): string {
  const m = chave.match(/^(\d{4})-(\d{2})$/);
  if (!m) return "sem data";
  const idx = Number(m[2]) - 1;
  return `${NOMES_MES[idx] ?? m[2]}/${m[1]}`;
}

/** Card de lucro dos certificados — soma de todos os colaboradores (ver
 *  relatorioLucroCertificados). Cada certificado vendido custa R$ 170,00 e
 *  dá R$ 105,00 de lucro; o card conta quantos já foram marcados como
 *  "Pago" e o total acumulado, com o detalhe por mês escondido atrás de um
 *  "ver por mês" pra não poluir a tela por padrão. */
function LucroCertificadosCard({
  lucro,
  loading,
}: {
  lucro: LucroCertificados | undefined;
  loading: boolean;
}) {
  const [verPorMes, setVerPorMes] = useState(false);

  if (loading && !lucro) {
    return <div className="panel p-3 text-xs text-muted-foreground">Carregando lucro dos certificados...</div>;
  }
  if (!lucro) return null;

  return (
    <div className="panel p-3 space-y-2">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-success shrink-0" />
        <div className="flex-1">
          <p className="text-xs text-muted-foreground">Lucro com certificados (todos os colaboradores)</p>
          <p className="text-lg font-semibold text-success">{fmtBRL(lucro.totalLucro)}</p>
        </div>
        <p className="text-xs text-muted-foreground shrink-0">
          {lucro.totalPagos} {lucro.totalPagos === 1 ? "certificado pago" : "certificados pagos"}
        </p>
      </div>

      {lucro.porMes.length > 0 && (
        <div>
          <button
            className="text-xs text-muted-foreground underline"
            onClick={() => setVerPorMes((v) => !v)}
          >
            {verPorMes ? "Esconder por mês" : "Ver por mês"}
          </button>
          {verPorMes && (
            <div className="mt-2 space-y-1">
              {lucro.porMes.map((m) => (
                <div key={m.mes} className="flex items-center justify-between text-xs">
                  <span className="capitalize text-muted-foreground">{fmtMes(m.mes)}</span>
                  <span>
                    {m.quantidade} {m.quantidade === 1 ? "certificado" : "certificados"} —{" "}
                    <span className="font-medium">{fmtBRL(m.lucro)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TarefaRow({
  tarefa,
  expandida,
  onToggleExpandida,
  onToggle,
  onRemove,
  onSalvarTexto,
  onSalvarEtapas,
}: {
  tarefa: Tarefa;
  expandida: boolean;
  onToggleExpandida: () => void;
  onToggle: () => void;
  onRemove: () => void;
  onSalvarTexto: (texto: string) => void;
  onSalvarEtapas: (etapas: Etapa[]) => void;
}) {
  const [editandoTexto, setEditandoTexto] = useState(false);
  const [textoRascunho, setTextoRascunho] = useState(tarefa.texto);
  const [novaEtapa, setNovaEtapa] = useState("");

  function iniciarEdicaoTexto() {
    setTextoRascunho(tarefa.texto);
    setEditandoTexto(true);
  }

  function confirmarEdicaoTexto() {
    const limpo = textoRascunho.trim();
    if (limpo && limpo !== tarefa.texto) onSalvarTexto(limpo);
    setEditandoTexto(false);
  }

  function cancelarEdicaoTexto() {
    setTextoRascunho(tarefa.texto);
    setEditandoTexto(false);
  }

  function adicionarEtapa() {
    const texto = novaEtapa.trim();
    if (!texto) return;
    onSalvarEtapas([...tarefa.etapas, { texto, concluida: false, concluida_em: null }]);
    setNovaEtapa("");
  }

  // Ao marcar, grava a data/hora de agora (concluida_em) — é o que alimenta
  // a data mostrada ao lado da etapa e, pra etapa "PAGO" de um certificado,
  // o relatório de lucro. Ao desmarcar, limpa a data de volta.
  function alternarConcluidaEtapa(idx: number) {
    const proximo = tarefa.etapas.map((e, i) =>
      i === idx ? { ...e, concluida: !e.concluida, concluida_em: !e.concluida ? new Date().toISOString() : null } : e,
    );
    onSalvarEtapas(proximo);
  }

  function removerEtapa(idx: number) {
    onSalvarEtapas(tarefa.etapas.filter((_, i) => i !== idx));
  }

  return (
    <div className={`panel p-3 ${tarefa.feita ? "border-success/40" : ""}`}>
      <div className="flex items-center gap-3">
        {tarefa.feita ? (
          <button onClick={onToggle} title="Concluída — clique para reabrir" className="shrink-0">
            <CheckCircle2 className="w-5 h-5 text-success fill-success/20" />
          </button>
        ) : (
          <Checkbox checked={tarefa.feita} onCheckedChange={onToggle} />
        )}
        {editandoTexto ? (
          <Input
            autoFocus
            className="flex-1 h-8"
            value={textoRascunho}
            onChange={(e) => setTextoRascunho(e.target.value)}
            onBlur={confirmarEdicaoTexto}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmarEdicaoTexto();
              if (e.key === "Escape") cancelarEdicaoTexto();
            }}
          />
        ) : (
          <button
            className="flex-1 min-w-0 flex items-center gap-1.5 text-left"
            onClick={onToggleExpandida}
          >
            {expandida ? (
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            )}
            <span className={`shrink-0 ${tarefa.feita ? "line-through text-success" : ""}`}>
              {tarefa.texto}
            </span>
            {!expandida && tarefa.etapas.length > 0 && (
              <span className="min-w-0 truncate text-xs text-muted-foreground">
                {tarefa.etapas.map((e, i) => (
                  <span key={i} className={e.concluida ? "line-through text-success" : ""}>
                    {i > 0 ? "; " : ""}
                    {i + 1}.{e.texto}
                  </span>
                ))}
              </span>
            )}
          </button>
        )}
        {!editandoTexto && (
          <Button variant="ghost" size="icon" onClick={iniciarEdicaoTexto} title="Editar nome da tarefa">
            <Pencil className="w-4 h-4 text-muted-foreground" />
          </Button>
        )}
        <Button variant="ghost" size="icon" onClick={onRemove}>
          <Trash2 className="w-4 h-4 text-destructive" />
        </Button>
      </div>

      {expandida && (
        <div className="mt-3 pl-6 space-y-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Etapas, em ordem</p>
            <div className="space-y-1">
              {tarefa.etapas.map((etapa, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="w-4 text-xs text-muted-foreground text-right shrink-0 tabular-nums">
                    {idx + 1}.
                  </span>
                  {etapa.concluida ? (
                    <button
                      onClick={() => alternarConcluidaEtapa(idx)}
                      title="Concluída — clique para reabrir"
                      className="shrink-0"
                    >
                      <CheckCircle2 className="w-4 h-4 text-success fill-success/20" />
                    </button>
                  ) : (
                    <Checkbox checked={etapa.concluida} onCheckedChange={() => alternarConcluidaEtapa(idx)} />
                  )}
                  <span
                    className={`flex-1 text-sm ${etapa.concluida ? "line-through text-success" : ""}`}
                  >
                    {etapa.texto}
                    {etapa.concluida && etapa.concluida_em && (
                      <span className="no-underline text-xs text-muted-foreground"> — no dia {fmtDataBR(etapa.concluida_em)}</span>
                    )}
                  </span>
                  <button onClick={() => removerEtapa(idx)}>
                    <X className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              ))}
              {tarefa.etapas.length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhuma etapa ainda.</p>
              )}
            </div>
            <div className="flex gap-2 mt-2">
              <Input
                placeholder="Nova etapa..."
                value={novaEtapa}
                onChange={(e) => setNovaEtapa(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && adicionarEtapa()}
              />
              <Button size="sm" variant="outline" onClick={adicionarEtapa} disabled={!novaEtapa.trim()}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
