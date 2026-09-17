import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useSession() {
  const [userId, setUserId] = useState<string | null | undefined>(undefined); // undefined = ainda carregando
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
      setEmail(data.session?.user.email ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
      setEmail(session?.user.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { userId: userId ?? null, email, loading: userId === undefined };
}

export type MuralAccess = {
  userId: string | null;
  nome: string;
  ativo: boolean;
  admin: boolean;
  somPreferido: "sino" | "sirene" | "bipe";
  loading: boolean;
};

export function useMyAccess(): MuralAccess {
  const { userId, loading: sessionLoading } = useSession();

  const q = useQuery({
    queryKey: ["mural-my-access", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mural_usuarios")
        .select("nome, ativo, admin, som_preferido")
        .eq("id", userId as string)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const somPreferido = q.data?.som_preferido;

  return {
    userId: userId ?? null,
    nome: q.data?.nome ?? "",
    ativo: q.data?.ativo ?? false,
    admin: q.data?.admin ?? false,
    somPreferido: somPreferido === "sirene" || somPreferido === "bipe" ? somPreferido : "sino",
    loading: sessionLoading || (!!userId && q.isLoading),
  };
}

export function useInvalidateMyAccess() {
  const qc = useQueryClient();
  return (userId: string | null) => qc.invalidateQueries({ queryKey: ["mural-my-access", userId] });
}
