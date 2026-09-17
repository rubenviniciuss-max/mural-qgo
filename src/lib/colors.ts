// Dá uma cor fixa e sempre igual pra cada pessoa (baseada no id dela), pra
// diferenciar quem escreveu de que foi escrito — sem isso, o nome do autor e
// o texto da mensagem ficavam praticamente do mesmo jeito visualmente,
// confundindo quem tá lendo.

// Paleta pensada pra funcionar bem no fundo escuro dourado do Mural: cores
// bem distintas entre si, sem chegar perto do dourado (--gold), que já é
// usado pra destaque/marca — assim o nome de ninguém "confunde" com a
// identidade visual do app.
const PALETA = [
  "#6ea8fe", // azul
  "#7ee2b8", // verde-água
  "#f28b82", // vermelho suave
  "#c8a2f0", // lilás
  "#f5a97f", // laranja
  "#7fd4e0", // ciano
  "#f588c8", // rosa
  "#b8e070", // verde-limão
];

function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/** Cor consistente (sempre a mesma) pra um dado id de usuário. */
export function corDoUsuario(userId: string | null | undefined): string {
  if (!userId) return "var(--gold)";
  return PALETA[hashString(userId) % PALETA.length];
}
