// Som via Web Audio API — não depende de nenhum arquivo de áudio.
//
// IMPORTANTE (limitação real, não é bug): isto só toca quando o Mural já
// está ABERTO na tela (aba em primeiro plano). Quando o app está fechado e
// chega uma notificação push, quem decide o som é o sistema operacional do
// celular/computador — nenhum navegador (Chrome, Safari, etc.) permite que
// uma página escolha um som personalizado (sino, sirene ou qualquer outro)
// para tocar numa notificação em segundo plano. Isso vale pra qualquer site,
// não é uma limitação só do Mural. O que dá pra fazer em segundo plano é só
// o padrão de vibração (configurado no service worker, funciona no Android —
// o iOS ignora vibração também), e por isso a preferência de som escolhida
// aqui também é salva no servidor (mural_usuarios.som_preferido) pra
// escolher um padrão de vibração diferente por pessoa.

export type SomPreferido = "sino" | "sirene" | "bipe";

export const OPCOES_SOM: { valor: SomPreferido; rotulo: string; descricao: string }[] = [
  { valor: "sino", rotulo: "Sino", descricao: "Toque suave, tipo campainha" },
  { valor: "sirene", rotulo: "Sirene", descricao: "Alternado, chama mais atenção" },
  { valor: "bipe", rotulo: "Bipe", descricao: "Curto e discreto" },
];

const CHAVE_LOCAL = "mural-som-preferido";

export function getSomPreferidoLocal(): SomPreferido {
  if (typeof window === "undefined") return "sino";
  const v = window.localStorage.getItem(CHAVE_LOCAL);
  return v === "sino" || v === "sirene" || v === "bipe" ? v : "sino";
}

export function setSomPreferidoLocal(som: SomPreferido) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CHAVE_LOCAL, som);
}

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

function resumeSeNecessario(audioCtx: AudioContext) {
  // Navegadores suspendem o AudioContext até haver uma interação do usuário;
  // como o app já foi aberto/clicado antes, isso normalmente já está "running".
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => undefined);
  }
}

/** Toque de sino: fundamental + harmônicos que desaparecem em velocidades
 * diferentes, imitando o "corpo" de um sino de verdade em vez de um bipe
 * eletrônico. */
export function playSino() {
  const audioCtx = getContext();
  if (!audioCtx) return;
  resumeSeNecessario(audioCtx);

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

/** Sirene: dois tons alternando (efeito "wail"), como um alarme. */
export function playSirene() {
  const audioCtx = getContext();
  if (!audioCtx) return;
  resumeSeNecessario(audioCtx);

  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sawtooth";

  const duracaoTotal = 1.1;
  const baixa = 520;
  const alta = 900;
  const ciclo = 0.22; // duração de cada "sobe/desce"
  osc.frequency.setValueAtTime(baixa, now);
  for (let t = 0; t < duracaoTotal; t += ciclo) {
    osc.frequency.linearRampToValueAtTime(t % (ciclo * 2) < ciclo ? alta : baixa, now + t + ciclo);
  }

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.14, now + 0.05);
  gain.gain.setValueAtTime(0.14, now + duracaoTotal - 0.15);
  gain.gain.linearRampToValueAtTime(0.0001, now + duracaoTotal);

  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + duracaoTotal + 0.05);
}

/** Bipe: curto e discreto, um único tom eletrônico. */
export function playBipe() {
  const audioCtx = getContext();
  if (!audioCtx) return;
  resumeSeNecessario(audioCtx);

  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "square";
  osc.frequency.value = 1046; // Dó6
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.12, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.2);
}

const TOCADORES: Record<SomPreferido, () => void> = {
  sino: playSino,
  sirene: playSirene,
  bipe: playBipe,
};

export function tocarSom(som: SomPreferido) {
  TOCADORES[som]();
}

/** Toca o som escolhido pela pessoa (lido do localStorage deste navegador). */
export function playNotificationPing() {
  tocarSom(getSomPreferidoLocal());
}
