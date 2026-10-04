import { Bug, Droplets, FlaskConical, Fuel, Layers, Leaf, Microscope, Package, Shield, Sprout, type LucideIcon } from "lucide-react";
import type { SupplyCategory } from "@/lib/db";
import type { SupplyStock } from "@/lib/stock";

const ICONS: Record<SupplyCategory, LucideIcon> = {
  semente: Sprout,
  fertilizante: FlaskConical,
  corretivo: Layers,
  herbicida: Leaf,
  inseticida: Bug,
  fungicida: Shield,
  adjuvante: Droplets,
  biologico: Microscope,
  combustivel: Fuel,
  outro: Package,
};

export function SupplyIcon({ category, className = "size-10" }: { category: SupplyCategory; className?: string }) {
  const Icon = ICONS[category];
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center rounded-xl bg-brand-soft text-brand ${className}`}>
      <Icon className="size-5" />
    </span>
  );
}

/** Selo de situação do estoque, ou nada se está tudo certo. */
export function StockBadge({ stock }: { stock: SupplyStock }) {
  const [text, tone] = stock.short
    ? ["Vai faltar", "bg-danger/10 text-danger"]
    : stock.balance < 0
      ? ["Saldo negativo", "bg-danger/10 text-danger"]
      : stock.low
        ? ["Estoque baixo", "bg-warn/10 text-warn"]
        : [null, ""];
  if (!text) return null;
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>{text}</span>;
}

export function needsAttention(s: SupplyStock): boolean {
  return s.short || s.low || s.balance < 0;
}
