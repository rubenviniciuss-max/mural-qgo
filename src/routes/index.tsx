import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/")({
  component: LandingPage,
  head: () => ({
    meta: [{ title: "Mural QGO" }],
  }),
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
