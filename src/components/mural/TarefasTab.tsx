import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Loader2, ChevronDown, ChevronRight, Star, X, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

type Etapa = { texto: string; concluida: boolean; atual: boolean };

type Tarefa = {
  id: string;
  texto: string;
  feita: boolean;
  ordem: number;
  criado_em: string;
  notas: string | null;
  etapas: Etapa[];
};

function etapasSeguras(valor: unknown): Etapa[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
    .map((e) => ({
      texto: typeof e.texto === "string" ? e.texto : "",
      concluida: !!e.concluida,
      atual: !!e.atual,
    }));
}

export function TarefasTab({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const [novaTarefa, setNovaTarefa] = useState("");
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());

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
    },
    onError: (e: any) => toast.error(e.message),
  });

  const alternar = useMutation({
    mutationFn: async (t: Tarefa) => {
      const { error } = await supabase.from("mural_tarefas").update({ feita: !t.feita }).eq("id", t.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mural-minhas-tarefas", userId] }),
    onError: (e: any) => toast.error(e.message),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("mural_tarefas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mural-minhas-tarefas", userId] }),
    onError: (e: any) => toast.error(e.message),
  });

  const salvarNotas = useMutation({
    mutationFn: async ({ id, notas }: { id: string; notas: string }) => {
      const { error } = await supabase.from("mural_tarefas").update({ notas }).eq("id", id);
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mural-minhas-tarefas", userId] }),
    onError: (e: any) => toast.error(e.message),
  });

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
        Suas anotações pessoais — só você vê essa lista. Abra uma tarefa pra anotar detalhes ou dividir em etapas.
      </p>

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
            onSalvarNotas={(notas) => salvarNotas.mutate({ id: t.id, notas })}
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
              onSalvarNotas={(notas) => salvarNotas.mutate({ id: t.id, notas })}
              onSalvarEtapas={(etapas) => salvarEtapas.mutate({ id: t.id, etapas })}
            />
          ))}
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
  onSalvarNotas,
  onSalvarEtapas,
}: {
  tarefa: Tarefa;
  expandida: boolean;
  onToggleExpandida: () => void;
  onToggle: () => void;
  onRemove: () => void;
  onSalvarNotas: (notas: string) => void;
  onSalvarEtapas: (etapas: Etapa[]) => void;
}) {
  const [notasRascunho, setNotasRascunho] = useState(tarefa.notas ?? "");
  const [novaEtapa, setNovaEtapa] = useState("");
  const etapaAtualIdx = tarefa.etapas.findIndex((e) => e.atual);

  function adicionarEtapa() {
    const texto = novaEtapa.trim();
    if (!texto) return;
    onSalvarEtapas([...tarefa.etapas, { texto, concluida: false, atual: tarefa.etapas.length === 0 }]);
    setNovaEtapa("");
  }

  function alternarConcluidaEtapa(idx: number) {
    const proximo = tarefa.etapas.map((e, i) => (i === idx ? { ...e, concluida: !e.concluida } : e));
    onSalvarEtapas(proximo);
  }

  function marcarAtual(idx: number) {
    const proximo = tarefa.etapas.map((e, i) => ({ ...e, atual: i === idx }));
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
        <button
          className="flex-1 min-w-0 flex items-center gap-1.5 text-left"
          onClick={onToggleExpandida}
        >
          {expandida ? (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          )}
          <span className={`truncate ${tarefa.feita ? "line-through text-success" : ""}`}>
            {tarefa.texto}
          </span>
          {etapaAtualIdx >= 0 && (
            <span className="text-xs text-gold underline shrink-0">
              · {tarefa.etapas[etapaAtualIdx].texto}
            </span>
          )}
        </button>
        <Button variant="ghost" size="icon" onClick={onRemove}>
          <Trash2 className="w-4 h-4 text-destructive" />
        </Button>
      </div>

      {expandida && (
        <div className="mt-3 pl-6 space-y-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Notas</p>
            <Textarea
              placeholder="Detalhes, contexto, o que falta..."
              rows={2}
              value={notasRascunho}
              onChange={(e) => setNotasRascunho(e.target.value)}
              onBlur={() => {
                if (notasRascunho !== (tarefa.notas ?? "")) onSalvarNotas(notasRascunho);
              }}
            />
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-1">
              Etapas — marque a estrela na etapa em que você está agora
            </p>
            <div className="space-y-1">
              {tarefa.etapas.map((etapa, idx) => (
                <div key={idx} className="flex items-center gap-2">
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
                  <button
                    className="shrink-0"
                    title={etapa.atual ? "Etapa atual" : "Marcar como etapa atual"}
                    onClick={() => marcarAtual(idx)}
                  >
                    <Star
                      className={`w-3.5 h-3.5 ${etapa.atual ? "fill-gold text-gold" : "text-muted-foreground"}`}
                    />
                  </button>
                  <span
                    className={`flex-1 text-sm ${etapa.concluida ? "line-through text-success" : ""} ${
                      etapa.atual ? "underline decoration-gold decoration-2 underline-offset-2" : ""
                    }`}
                  >
                    {etapa.texto}
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
