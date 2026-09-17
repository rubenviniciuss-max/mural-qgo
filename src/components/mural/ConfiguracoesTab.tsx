import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, BellRing, Loader2, Play, Check } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { currentPermission, enablePush, hasActivePushSubscription, pushSupported } from "@/lib/push-client";
import { OPCOES_SOM, getSomPreferidoLocal, setSomPreferidoLocal, tocarSom, type SomPreferido } from "@/lib/sound";
import type { MuralAccess } from "@/lib/permissions";
import { Button } from "@/components/ui/button";

export function ConfiguracoesTab({ access }: { access: MuralAccess }) {
  const qc = useQueryClient();
  const [ativando, setAtivando] = useState(false);
  const [inscrito, setInscrito] = useState<boolean | null>(null);
  const [somSelecionado, setSomSelecionado] = useState<SomPreferido>(access.somPreferido);
  const [salvandoSom, setSalvandoSom] = useState<SomPreferido | null>(null);

  const suportado = pushSupported();
  const permissao = currentPermission();

  useEffect(() => {
    if (!suportado) return;
    hasActivePushSubscription().then(setInscrito);
  }, [suportado]);

  // Mantém em sincronia se o valor salvo no servidor mudar (ex.: carregou depois).
  useEffect(() => {
    setSomSelecionado(access.somPreferido);
  }, [access.somPreferido]);

  async function ativarNotificacoes() {
    if (!access.userId) return;
    setAtivando(true);
    const result = await enablePush(access.userId);
    setAtivando(false);
    if (result.ok) {
      toast.success("Notificações ativadas! Você vai receber os avisos mesmo com o app fechado.");
      setInscrito(true);
    } else {
      toast.error(result.reason || "Não foi possível ativar as notificações.");
    }
  }

  async function escolherSom(som: SomPreferido) {
    tocarSom(som);
    setSomSelecionado(som);
    setSomPreferidoLocal(som);
    if (!access.userId) return;
    setSalvandoSom(som);
    const { error } = await supabase.from("mural_usuarios").update({ som_preferido: som }).eq("id", access.userId);
    setSalvandoSom(null);
    if (error) {
      toast.error("Não foi possível salvar o som escolhido.");
      return;
    }
    qc.invalidateQueries({ queryKey: ["mural-my-access", access.userId] });
  }

  let statusTexto = "Verificando...";
  let StatusIcon = Bell;
  let statusCor = "text-muted-foreground";
  if (!suportado) {
    statusTexto = "Este navegador não suporta notificações.";
    StatusIcon = BellOff;
  } else if (permissao === "denied") {
    statusTexto = "Notificações bloqueadas — libere nas configurações do navegador/celular pra esse site.";
    StatusIcon = BellOff;
    statusCor = "text-destructive";
  } else if (inscrito) {
    statusTexto = "Notificações ativadas neste dispositivo.";
    StatusIcon = BellRing;
    statusCor = "text-success";
  } else if (inscrito === false) {
    statusTexto = "Notificações ainda não ativadas neste dispositivo.";
    StatusIcon = Bell;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="panel p-4 space-y-3">
        <h3 className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-gold" /> Notificações
        </h3>
        <p className="text-sm text-muted-foreground">
          Funciona no computador e no celular (Android e iPhone). No iPhone, primeiro adicione o Mural à Tela de
          Início (compartilhar → "Adicionar à Tela de Início") — o Safari só permite notificações depois disso.
        </p>
        <div className={`flex items-center gap-2 text-sm ${statusCor}`}>
          <StatusIcon className="w-4 h-4 shrink-0" />
          {statusTexto}
        </div>
        <Button onClick={ativarNotificacoes} disabled={ativando || !suportado || permissao === "denied"}>
          {ativando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
          {inscrito ? "Reativar / atualizar notificações" : "Ativar notificações"}
        </Button>
      </div>

      <div className="panel p-4 space-y-3">
        <h3 className="flex items-center gap-2">
          <Play className="w-4 h-4 text-gold" /> Som de notificação
        </h3>
        <p className="text-sm text-muted-foreground">
          Escolha o som que toca quando o Mural está aberto na tela e um aviso novo chega. Clique num som pra
          escolher e já ouvir como fica.
        </p>
        <div className="grid sm:grid-cols-3 gap-2">
          {OPCOES_SOM.map((opcao) => {
            const selecionado = somSelecionado === opcao.valor;
            return (
              <button
                key={opcao.valor}
                onClick={() => escolherSom(opcao.valor)}
                className={`panel p-3 text-left transition-colors ${
                  selecionado ? "border-gold bg-accent" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{opcao.rotulo}</span>
                  {salvandoSom === opcao.valor ? (
                    <Loader2 className="w-4 h-4 animate-spin text-gold" />
                  ) : selecionado ? (
                    <Check className="w-4 h-4 text-gold" />
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{opcao.descricao}</p>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Com o app fechado, quem decide o som é o próprio celular/computador — nenhum site consegue tocar um som
          personalizado nessa hora, em nenhuma plataforma. O que muda com o app fechado, no Android, é o padrão de
          vibração (o iPhone não vibra por notificação push).
        </p>
      </div>
    </div>
  );
}
