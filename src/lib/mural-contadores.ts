import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ---------------------------------------------------------------
// Contadores usados na tela de Início (os dois balões) e nas bolinhas das
// abas "Minhas Tarefas" e "Mural" — de propósito usando as MESMAS chaves de
// query (React Query) e o MESMO formato de consulta que MuralTab.tsx e
// TarefasTab.tsx já usam. Isso faz os dois lados (a aba em si, e o
// resumo/bolinha) compartilharem o mesmo cache: quando a aba Mural marca um
// aviso como lido, ou recebe um aviso novo pelo Realtime, o resumo aqui
// atualiza sozinho, sem duplicar consulta no banco nem correr o risco de
// ficar com números diferentes em lugares diferentes da tela.
// ---------------------------------------------------------------

export type AvisoContagem = {
  id: string;
  autor_id: string;
  autor_nome: string;
  texto: string;
  fixado: boolean;
  todos: boolean;
  criado_em: string;
  editado_em: string | null;
};

/** Resumo de avisos: lista completa + quantos ainda não foram lidos por mim. */
export function useResumoAvisos(userId: string | null) {
  // Mesma chave ("mural-avisos") e mesma consulta que a aba Mural usa.
  const avisosQuery = useQuery({
    queryKey: ["mural-avisos"],
    enabled: !!userId,
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mural_avisos")
        .select("*")
        .order("fixado", { ascending: false })
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return data as AvisoContagem[];
    },
  });

  const avisos = avisosQuery.data ?? [];
  const avisoIdsKey = useMemo(() => avisos.map((a) => a.id).join(","), [avisos]);

  // Mesma chave ("mural-leituras") e mesmo formato (mapa aviso_id -> quem
  // leu) que a aba Mural usa pra mostrar "quem já leu" pra quem postou.
  const leiturasQuery = useQuery({
    queryKey: ["mural-leituras", avisoIdsKey],
    enabled: avisos.length > 0,
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mural_aviso_leituras")
        .select("aviso_id, user_id")
        .in("aviso_id", avisos.map((a) => a.id));
      if (error) throw error;
      const map: Record<string, Set<string>> = {};
      (data ?? []).forEach((r) => {
        (map[r.aviso_id] ??= new Set()).add(r.user_id);
      });
      return map;
    },
  });

  const leituras = leiturasQuery.data ?? {};

  function jaLi(avisoId: string, autorId: string): boolean {
    if (autorId === userId) return true; // sou o autor — não conta como "não lido" pra mim
    return !!leituras[avisoId]?.has(userId as string);
  }

  const naoLidosCount = avisos.filter((a) => !jaLi(a.id, a.autor_id)).length;

  return {
    avisos,
    loading: avisosQuery.isLoading,
    naoLidosCount,
    jaLi,
  };
}

/** Marca UM aviso como lido — usado quando a pessoa clica direto numa
 *  mensagem (ex.: na lista "Últimos avisos" do Início), sem precisar abrir
 *  a aba Mural inteira pra isso contar como leitura. */
export function useMarcarAvisoLido(userId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (avisoId: string) => {
      if (!userId) return;
      const { error } = await supabase
        .from("mural_aviso_leituras")
        .upsert({ aviso_id: avisoId, user_id: userId }, { onConflict: "aviso_id,user_id", ignoreDuplicates: true });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mural-leituras"] });
    },
  });
}

/** Quantas tarefas pessoais ainda estão pendentes (não concluídas). Chave
 *  própria (não a mesma da aba Minhas Tarefas) — a aba carrega notas/etapas
 *  também, aqui só precisamos de "feita" pra contar, então uma consulta bem
 *  mais leve. A aba Minhas Tarefas e o MuralTab (botão "Adicionar às minhas
 *  tarefas") invalidam esta chave também, pra bolinha acompanhar na hora. */
export function useTarefasPendentesCount(userId: string | null) {
  const q = useQuery({
    queryKey: ["mural-tarefas-pendentes-count", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from("mural_tarefas").select("id, feita");
      if (error) throw error;
      return (data ?? []).filter((t) => !t.feita).length;
    },
  });
  return { count: q.data ?? 0, loading: q.isLoading };
}
