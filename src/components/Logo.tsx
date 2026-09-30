import logo from "@/assets/logo.png";

// Antes era um ícone genérico (MessageSquareText) num quadrado dourado, com
// o texto "Mural QGO" — mas esse Mural é usado tanto pela Tree Prime quanto
// pela QGO Prime, então uma marca de uma das duas empresas não fazia
// sentido pra quem é da outra. Agora usa a mesma logo neutra (combinando as
// duas empresas) já criada pra Central de Certificados, e o nome também
// virou neutro.
export function Logo({ size = 40 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2">
      <img
        src={logo}
        alt="Mural da Equipe"
        className="shrink-0 rounded-lg object-cover"
        style={{ width: size, height: size }}
      />
      <span className="font-bold text-lg text-gold-gradient">Mural da Equipe</span>
    </div>
  );
}
