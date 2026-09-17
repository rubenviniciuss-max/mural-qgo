// Som via Web Audio API — não depende de nenhum arquivo de áudio.
//
// IMPORTANTE (limitação real, não é bug): isto só toca quando o Mural já
// está ABERTO na tela (aba em primeiro plano). Quando o app está fechado e
// chega uma notificação push, quem decide o som é o sistema operacional do
// celular/computador — nenhum navegador (Chrome, Safari, etc.) permite que
// uma página escolha um som personalizado (sino, sirene ou qualquer outro)
// para tocar numa notificação em segundo plano. Isso vale pra qualquer site,
// não é uma limitação só do Mural. O que dá pra fazer em segundo plano é só
// o padrão de vibração (já configurado no service worker, funciona no
// Android — o iOS ignora vibração também).
let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

/** Toque de sino (com mesmo Web Audio, sem arquivo externo): fundamental +
 * harmônicos que desaparecem em velocidades diferentes, imitando o "corpo"
 * de um sino de verdade em vez de um bipe eletrônico. */
export function playNotificationPing() {
  const audioCtx = getContext();
  if (!audioCtx) return;
  // Navegadores suspendem o AudioContext até haver uma interação do usuário;
  // como o app já foi aberto/clicado antes, isso normalmente já está "running".
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => undefined);
  }

  const now = audioCtx.currentTime;
  const fundamental = 880; // Lá5
  // Proporções de harmônicos típicas de sino (não são múltiplos inteiros,
  // por isso soa "metálico" em vez de um tom puro).
  const parcials: Array<[number, number, number]> = [
    [1, 0.28, 1.1], // [multiplicador de frequência, volume, duração em s]
    [2.01, 0.16, 0.9],
    [2.99, 0.09, 0.7],
    [4.2, 0.05, 0.45],
  ];

  for (const [mult, peak, duration] of parcials) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = fundamental * mult;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  }
}
