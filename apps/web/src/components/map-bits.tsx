import { MapPinned } from "lucide-react";
import type { LngLat } from "@/lib/geo";
import { polygonAreaHa, projectShapes } from "@/lib/geo";
import { fitFontSize, plotShortName } from "@/lib/format";
import { formatNumberBR } from "@/lib/operations";
import type { Alert, PlotStatus } from "@/lib/panel";

/** Desenho de um contorno, para conferir a forma antes de salvar. */
export function ShapePreview({ ring, className = "h-40" }: { ring: LngLat[]; className?: string }) {
  const [shape] = projectShapes([ring], 300, 180, 12);
  if (!shape) return null;
  return (
    <svg viewBox="0 0 300 180" className={`w-full rounded-xl bg-brand-soft/50 ${className}`} role="img" aria-label="Contorno do talhão">
      <path d={shape.path} className="fill-brand/25 stroke-brand" strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}

export type Tone = "danger" | "warn" | "ok" | "none";

export const TONE: Record<Tone, { shape: string; dot: string; label: string }> = {
  danger: { shape: "fill-danger/30 stroke-danger", dot: "bg-danger", label: "Atrasado (retorno ou operação)" },
  warn: { shape: "fill-warn/30 stroke-warn", dot: "bg-warn", label: "Sem visita recente ou retorno hoje" },
  ok: { shape: "fill-brand/30 stroke-brand", dot: "bg-brand", label: "Em dia" },
  none: { shape: "fill-muted/15 stroke-muted", dot: "bg-muted", label: "Sem safra cadastrada" },
};

/** Cor do talhão no mapa pela situação no painel. */
export function toneOf(status: PlotStatus, alerts: Alert[]): Tone {
  const mine = alerts.filter((a) => a.plotId === status.plot.id);
  if (mine.some((a) => a.kind === "followup-overdue" || a.kind === "operation-late")) return "danger";
  if (mine.length) return "warn";
  return status.season ? "ok" : "none";
}

export const hasShape = (s: PlotStatus) => (s.plot.boundary?.length ?? 0) >= 3;

/** Mapa pequeno, só para olhar (o painel usa). */
export function MiniMap({ statuses, alerts }: { statuses: PlotStatus[]; alerts: Alert[] }) {
  const drawn = statuses.filter(hasShape);
  const shapes = projectShapes(
    drawn.map((s) => s.plot.boundary as LngLat[]),
    400,
    240,
    14,
  );
  return (
    <svg viewBox="0 0 400 240" className="h-auto w-full rounded-xl bg-brand-soft/40" role="img" aria-label="Mapa dos talhões">
      {shapes.map((shape, i) => (
        <g key={drawn[i].plot.id}>
          <path d={shape.path} className={TONE[toneOf(drawn[i], alerts)].shape} strokeWidth={2} strokeLinejoin="round" />
          <text
            x={shape.label[0]}
            y={shape.label[1] + 5}
            textAnchor="middle"
            fontSize={fitFontSize(plotShortName(drawn[i].plot.name), shape.width, 16)}
            className="fill-foreground stroke-surface font-semibold"
            strokeWidth={4}
            paintOrder="stroke"
          >
            {plotShortName(drawn[i].plot.name)}
          </text>
        </g>
      ))}
      <title>{drawn.map((s) => `${s.plot.name}: ${formatNumberBR(polygonAreaHa(s.plot.boundary!), 1)} ha`).join(", ")}</title>
    </svg>
  );
}

/** Desenho pequeno dos contornos; sem contorno cadastrado, mostra um ícone. */
export function ShapeThumb({ rings, size = "size-16" }: { rings: (LngLat[] | undefined | null)[]; size?: string }) {
  const drawn = rings.filter((r): r is LngLat[] => (r?.length ?? 0) >= 3);
  if (!drawn.length) {
    return (
      <span className={`grid ${size} shrink-0 place-items-center rounded-xl bg-brand-soft text-brand`} aria-hidden>
        <MapPinned className="size-6" />
      </span>
    );
  }
  return (
    <svg viewBox="0 0 64 64" className={`${size} shrink-0 rounded-xl bg-brand-soft`} aria-hidden>
      {projectShapes(drawn, 64, 64, 7).map((shape, i) => (
        <path key={i} d={shape.path} className="fill-brand/35 stroke-brand" strokeWidth={1.5} strokeLinejoin="round" />
      ))}
    </svg>
  );
}
