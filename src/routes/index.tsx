import { createFileRoute, redirect } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  component: Redirecionando,
  head: () => ({
    meta: [{ title: "Mural da Equipe" }],
  }),
  // Sem tela de apresentação: quem abre a raiz do Mural vai direto pro app
  // (se já tiver sessão) ou pra tela de login.
  //
  // Importante: quando o Hub QGO abre o Mural, ele manda o login pronto num
  // "#access_token=...&refresh_token=..." grudado nessa mesma URL raiz. Se
  // essa checagem não rodasse AQUI, bem cedo, a página simplesmente
  // redirecionava sem nunca ler esse pedaço da URL — e assim que acontecesse
  // qualquer navegação no navegador, o "#access_token=..." era jogado fora
  // antes do Supabase ter a chance de lê-lo, e a tela de login pedia
  // e-mail/senha de novo mesmo a pessoa já estando autenticada. Fazendo essa
  // checagem já na URL raiz, o token é lido e a sessão é criada antes de
  // qualquer navegação acontecer.
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    throw redirect({ to: data.session ? "/app" : "/auth" });
  },
});

// Só aparece durante o instante em que a sessão está sendo checada — o
// redirecionamento acima sempre acontece em seguida.
function Redirecionando() {
  return (
    <div className="min-h-screen flex items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="w-4 h-4 animate-spin" />
      Carregando o Mural da Equipe…
    </div>
  );
}
