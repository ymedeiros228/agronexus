import { FlaskConical, Shovel, SprayCan, Sprout, Wheat, Wrench, type LucideIcon } from "lucide-react";
import type { OperationKind, OperationStatus } from "@/lib/db";
import { STATUS_NAME } from "@/lib/operations";

const ICONS: Record<OperationKind, LucideIcon> = {
  preparo: Shovel,
  plantio: Sprout,
  adubacao: FlaskConical,
  aplicacao: SprayCan,
  colheita: Wheat,
  outro: Wrench,
};

const TONES: Record<OperationKind, string> = {
  preparo: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  plantio: "bg-brand-soft text-brand",
  adubacao: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  aplicacao: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  colheita: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  outro: "bg-border/60 text-muted",
};

export function OperationIcon({ kind, className = "size-10" }: { kind: OperationKind; className?: string }) {
  const Icon = ICONS[kind];
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center rounded-xl ${TONES[kind]} ${className}`}>
      <Icon className="size-5" />
    </span>
  );
}

export function StatusPill({ status, late = false }: { status: OperationStatus; late?: boolean }) {
  const tone = late
    ? "bg-danger/10 text-danger"
    : status === "concluida"
      ? "bg-brand-soft text-brand-strong"
      : status === "andamento"
        ? "bg-sky-500/10 text-sky-700 dark:text-sky-400"
        : "bg-warn/10 text-warn";
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {late ? "Atrasada" : STATUS_NAME[status]}
    </span>
  );
}
