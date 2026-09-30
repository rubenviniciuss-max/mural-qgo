import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LogOut, BellRing, Loader2, Settings2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useMyAccess } from "@/lib/permissions";
import { useResumoAvisos, useTarefasPendentesCount } from "@/lib/mural-contadores";
import { currentPermission, enablePush, hasActivePushSubscription, pushSupported } from "@/lib/push-client";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InicioTab } from "@/components/mural/InicioTab";
import { MuralTab } from "@/components/mural/MuralTab";
import { TarefasTab } from "@/components/mural/TarefasTab";
import { ConfiguracoesTab } from "@/components/mural/ConfiguracoesTab";
import { AdminUsuariosDialog } from "@/components/mural/AdminUsuariosDialog";

export const Route = createFileRoute("/_authenticated/app")({
  ssr: false,
  component: AppPage,
});

function AppPage() {
  const access = useMyAccess();
  const [pushBannerVisible, setPushBannerVisible] = useState(false);
  const [enabling, setEnabling] = useState(false);
  // Controlado (em vez de "defaultValue" solto) pra dar pra navegar pra uma
  // aba a partir de um clique nos balões da tela de Início.
  const [aba, setAba] = useState("inicio");

  // Mesmos contadores usados nos balões do Início — aqui só pra desenhar a
  // bolinha de quantidade em cima das abas, visível mesmo quando a pessoa
  // não está na aba Início. Compartilham cache com as abas Mural/Minhas
  // Tarefas (ver src/lib/mural-contadores.ts), então não duplica consulta.
  const { naoLidosCount } = useResumoAvisos(access.userId);
  const { count: tarefasPendentesCount } = useTarefasPendentesCount(access.userId);

  // Antes, isso só mostrava o banner quando a permissão nunca tinha sido
  // pedida ("default"). Só que a inscrição de push pode morrer sozinha —
  // cache do navegador limpo, celular trocado, PWA reinstalada — mesmo com
  // a permissão continuando "concedida". Nesse caso a pessoa parava de
  // receber notificação e não tinha nenhum aviso disso (nada reaparecia pra
  // ela reativar). Agora, se a permissão já foi concedida antes mas não há
  // inscrição ativa, a gente tenta reativar sozinho, sem pedir nada — e só
  // mostra o banner (pedindo clique) se realmente precisar de permissão.
  useEffect(() => {
    if (!pushSupported() || !access.userId) return;
    const permissao = currentPermission();
    if (permissao === "denied") return;

    hasActivePushSubscription().then(async (has) => {
      if (has) {
        setPushBannerVisible(false);
        return;
      }
      if (permissao === "granted") {
        const result = await enablePush(access.userId as string);
        setPushBannerVisible(!result.ok);
        return;
      }
      setPushBannerVisible(true);
    });
  }, [access.userId]);

  async function ativarNotificacoes() {
    if (!access.userId) return;
    setEnabling(true);
    const result = await enablePush(access.userId);
    setEnabling(false);
    if (result.ok) {
      toast.success("Notificações ativadas! Você vai receber os avisos mesmo com o app fechado.");
      setPushBannerVisible(false);
    } else {
      toast.error(result.reason || "Não foi possível ativar as notificações.");
    }
  }

  async function sair() {
    await supabase.auth.signOut();
    window.location.replace("/auth");
  }

  if (access.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gold" />
      </div>
    );
  }

  if (!access.ativo) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-xl font-semibold">Acesso negado</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sua conta ainda não tem acesso ao Mural. Fale com o administrador.
          </p>
          <Button variant="outline" className="mt-4" onClick={sair}>
            Sair
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border sticky top-0 z-10 bg-background/90 backdrop-blur-md">
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center justify-between gap-2">
          <Logo size={36} />
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden sm:inline">{access.nome}</span>
            {access.admin && <AdminUsuariosDialog />}
            <Button variant="ghost" size="icon" onClick={sair} title="Sair">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        {pushBannerVisible && (
          <div className="panel p-3 mb-4 flex items-center gap-3">
            <BellRing className="w-5 h-5 text-gold shrink-0" />
            <p className="text-sm flex-1">
              Ative as notificações para ser avisado assim que alguém postar no mural — mesmo com o app fechado.
            </p>
            <Button size="sm" onClick={ativarNotificacoes} disabled={enabling}>
              {enabling ? <Loader2 className="w-4 h-4 animate-spin" /> : "Ativar"}
            </Button>
          </div>
        )}

        <Tabs value={aba} onValueChange={setAba}>
          <TabsList>
            <TabsTrigger value="inicio">Início</TabsTrigger>
            <TabsTrigger value="tarefas" className="gap-1.5">
              Minhas Tarefas
              <ContadorBolinha count={tarefasPendentesCount} />
            </TabsTrigger>
            <TabsTrigger value="mural" className="gap-1.5">
              Mural
              <ContadorBolinha count={naoLidosCount} />
            </TabsTrigger>
            <TabsTrigger value="config">
              <Settings2 className="w-3.5 h-3.5" /> Configurações
            </TabsTrigger>
          </TabsList>
          <TabsContent value="inicio">
            <InicioTab access={access} onNavigate={setAba} />
          </TabsContent>
          <TabsContent value="tarefas">
            {access.userId && <TarefasTab userId={access.userId} />}
          </TabsContent>
          <TabsContent value="mural">
            <MuralTab access={access} />
          </TabsContent>
          <TabsContent value="config">
            <ConfiguracoesTab access={access} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

// Bolinha de quantidade em cima das abas (Minhas Tarefas / Mural) — mesmo
// visual usado nos balões da tela de Início. Some sozinha quando zera.
function ContadorBolinha({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full btn-gold text-[10px] font-bold leading-none">
      {count > 99 ? "99+" : count}
    </span>
  );
}
