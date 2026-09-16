import { MessageSquareText } from "lucide-react";

export function Logo({ size = 40 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="flex items-center justify-center rounded-lg btn-gold"
        style={{ width: size, height: size }}
      >
        <MessageSquareText style={{ width: size * 0.55, height: size * 0.55 }} />
      </div>
      <span className="font-bold text-lg text-gold-gradient">Mural QGO</span>
    </div>
  );
}
