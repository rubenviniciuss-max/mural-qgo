// Beep curto via Web Audio API — não depende de nenhum arquivo de áudio.
let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

export function playNotificationPing() {
  const audioCtx = getContext();
  if (!audioCtx) return;
  // Navegadores suspendem o AudioContext até haver uma interação do usuário;
  // como o app já foi aberto/clicado antes, isso normalmente já está "running".
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => undefined);
  }

  const now = audioCtx.currentTime;
  // Dois tons curtos e agradáveis, tipo "ding-dong" discreto.
  const tones: Array<[number, number]> = [
    [880, now],
    [1174.66, now + 0.12],
  ];

  for (const [freq, start] of tones) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(start);
    osc.stop(start + 0.3);
  }
}
