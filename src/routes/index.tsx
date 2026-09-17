import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  component: LandingPage,
  head: () => ({
    meta: [{ title: "Mural QGO" }],
  }),
  // Importante: quando o Hub QGO abre o Mural, ele manda o login pronto num
  // "#access_token=...&refresh_token=..." grudado nessa mesma URL raiz. Se
  // essa checagem não rodasse AQUI, bem cedo, a página simplesmente mostrava
  // os botões "Entrar"/"Acessar o Mural" sem nunca ler esse pedaço da URL —
  // e assim que a pessoa clicasse num desses links (navegação só no
  // navegador, sem recarregar a página), o "#access_token=..." era jogado
  // fora antes do Supabase ter a chance de lê-lo, e a tela de login pedia
  // e-mail/senha de novo mesmo a pessoa já estando autenticada. Fazendo essa
  // checagem já na URL raiz, o token é lido e a sessão é criada antes de
  // qualquer navegação acontecer.
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/app" });
  },
});

function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto max-w-4xl px-4 py-4 flex items-center justify-between">
          <Logo />
          <Button asChild variant="outline" size="sm">
            <Link to="/auth">Entrar</Link>
          </Button>
        </div>
      </header>

      <main className="flex-1 flex items-center">
        <section className="mx-auto max-w-4xl px-4 py-16 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-6">
            Avisos da equipe, num só lugar
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto mb-8">
            Compartilhe avisos e combine reuniões com toda a equipe, e mantenha suas próprias
            tarefas do dia a dia só para você.
          </p>
          <Button asChild size="lg">
            <Link to="/auth">Acessar o Mural</Link>
          </Button>
        </section>
      </main>

      <footer className="border-t border-border py-6 text-center text-sm text-muted-foreground">
        Acesso restrito à equipe QGO Prime.
      </footer>
    </div>
  );
}
