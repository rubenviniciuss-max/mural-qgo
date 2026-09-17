import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Loader2, ChevronDown, ChevronRight, X, CheckCircle2, Pencil } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

type Etapa = { texto: string; concluida: boolean };

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
        Suas anotações pessoais — só você vê essa lista. Abra uma tarefa pra dividir em etapas.
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
    onSalvarEtapas([...tarefa.etapas, { texto, concluida: false }]);
    setNovaEtapa("");
  }

  function alternarConcluidaEtapa(idx: number) {
    const proximo = tarefa.etapas.map((e, i) => (i === idx ? { ...e, concluida: !e.concluida } : e));
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
