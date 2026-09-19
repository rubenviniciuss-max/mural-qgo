import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LogOut, BellRing, Loader2, Settings2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useMyAccess } from "@/lib/permissions";
import { currentPermission, enablePush, hasActivePushSubscription, pushSupported } from "@/lib/push-client";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

        <Tabs defaultValue="mural">
          <TabsList>
            <TabsTrigger value="mural">Mural</TabsTrigger>
            <TabsTrigger value="tarefas">Minhas Tarefas</TabsTrigger>
            <TabsTrigger value="config">
              <Settings2 className="w-3.5 h-3.5" /> Configurações
            </TabsTrigger>
          </TabsList>
          <TabsContent value="mural">
            <MuralTab access={access} />
          </TabsContent>
          <TabsContent value="tarefas">
            {access.userId && <TarefasTab userId={access.userId} />}
          </TabsContent>
          <TabsContent value="config">
            <ConfiguracoesTab access={access} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
