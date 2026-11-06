import { KIND_LABEL, visitKindInfo } from "../catalog";
import type { Client, Farm, Finding, FindingKind, MapPoint, Plot, Season, Visit, VisitAuthor } from "../db";
import { formatDate, plotLabel } from "../format";
import { openRing, polygonAreaHa, type LngLat } from "../geo";
import { formatNumberBR } from "../operations";
import { pointKindInfo } from "../points";
import { roleLabel, signatureLines } from "../profile";
import { cleanStand, perHa, perMeter, standReportLines, standUnit, summarizeStand } from "../stand";
import { fileSlug } from "../save-file";

/**
 * O que vai no PDF da visita, já em texto. Sem React nem biblioteca de PDF: dá para testar
 * e o desenho (`visit-pdf.tsx`) só arruma na página. Usa as mesmas funções do texto do WhatsApp.
 */

export type PdfPhoto = { src: string; caption: string };

export type VisitPdfInput = {
  visit: Visit;
  farm?: Farm;
  plot?: Plot;
  client?: Client;
  season?: Season;
  findings: Finding[];
  dap: number | null;
  author: VisitAuthor | null;
  /** Fotos já convertidas em imagem para o PDF (data URL), na ordem em que foram tiradas. */
  photos: PdfPhoto[];
  /** Pontos do mapa que caíram neste talhão. */
  points: MapPoint[];
  /** Logo de quem assina (data URL), do perfil. */
  logo?: string;
  /** Quando o PDF foi gerado. */
  now?: Date;
};

export type InfoCell = { label: string; value: string };
export type FindingRow = { kind: FindingKind; kindLabel: string; name: string; amount: string; note: string };
export type MapDrawing = {
  width: number;
  height: number;
  path: string;
  points: { x: number; y: number; color: string; label: string }[];
  stand: { x: number; y: number }[];
  /** Barra de escala: comprimento em pixels e o texto ("200 m"). */
  scale: { px: number; label: string };
  areaHa: number;
};

export type VisitPdfModel = {
  title: string;
  kindLabel: string;
  farmName: string;
  plotName: string;
  producer: string;
  date: string;
  info: InfoCell[];
  stand: { title: string; lines: string[]; rows: string[][]; header: string[] } | null;
  findings: FindingRow[];
  observations: string;
  recommendation: string;
  followUp: string;
  map: MapDrawing | null;
  photos: PdfPhoto[];
  signature: { name: string; role: string; lines: string[]; supervisor: string } | null;
  logo?: string;
  footer: string;
  fileName: string;
};

export function visitPdfModel(input: VisitPdfInput): VisitPdfModel {
  const { visit, farm, plot, client, season, findings, dap, author, photos, points, logo } = input;
  const kind = visitKindInfo(visit.kind);
  const now = input.now ?? new Date();
  // A data já vai em destaque no cabeçalho.
  const info: InfoCell[] = [];
  if (visit.stage) info.push({ label: "Estágio", value: visit.stage });
  if (dap !== null) info.push({ label: "Após o plantio", value: `${dap} dias` });
  if (season?.cultivar) info.push({ label: "Cultivar", value: season.cultivar });
  if (season?.label) info.push({ label: "Safra", value: season.label });
  if (season?.plantingDate) info.push({ label: "Plantio", value: formatDate(season.plantingDate) });
  const ring = plot?.boundary && plot.boundary.length >= 3 ? plot.boundary : null;
  const area = ring ? polygonAreaHa(ring) : plot?.areaHa ?? null;
  if (area != null) info.push({ label: "Área do talhão", value: `${formatNumberBR(area, 1)} ha` });
  if (farm?.municipality) info.push({ label: "Município", value: farm.municipality });

  const clean = cleanStand(visit.stand);
  const unit = standUnit(visit.kind);
  const stand = clean
    ? {
        title: visit.kind === "plantio" ? "Sementes no sulco" : "Estande",
        lines: standReportLines(visit.stand, visit.kind),
        header: ["Ponto", `${capitalize(unit)}`, "Metros", `${capitalize(unit)}/m`, ...(clean.spacingM ? [`${capitalize(unit)}/ha`] : [])],
        rows: clean.points.map((p, i) => {
          const m = perMeter(p);
          const ha = perHa(m, clean.spacingM);
          return [
            String(i + 1),
            formatNumberBR(p.plants, 0),
            formatNumberBR(p.meters, 1),
            formatNumberBR(m, 1),
            ...(clean.spacingM ? [ha != null ? formatNumberBR(ha, 0) : "—"] : []),
          ];
        }),
      }
    : null;

  const signature = author?.name
    ? {
        name: author.name,
        role: [roleLabel(author.role), author.registry].filter(Boolean).join(" · "),
        lines: signatureLines(author).slice(1).filter((l) => !l.startsWith("Sob supervisão")),
        supervisor: author.supervisorName
          ? `Responsável técnico: Eng. Agr. ${author.supervisorName}${author.supervisorRegistry ? `, ${author.supervisorRegistry}` : ""}`
          : "",
      }
    : null;

  const farmName = farm?.name ?? "Fazenda";
  return {
    title: kind.kind === "monitoramento" ? "Relatório de visita técnica" : `Relatório de visita: ${kind.label.toLowerCase()}`,
    kindLabel: kind.label,
    farmName,
    plotName: plotLabel(plot?.name),
    producer: client?.name || farm?.owner || "",
    date: formatDate(visit.date),
    info,
    stand,
    findings: findings.map((f) => ({ kind: f.kind, kindLabel: KIND_LABEL[f.kind], name: f.name, amount: f.amount, note: f.note })),
    observations: visit.observations.trim(),
    recommendation: visit.recommendation.trim(),
    followUp: visit.followUpDate ? formatDate(visit.followUpDate) : "",
    map: ring ? drawPlot(ring, points, visit) : null,
    photos,
    signature,
    logo,
    footer: `Gerado pelo AgroNexus em ${formatDate(toISODate(now))}`,
    fileName: visitFileName(farmName, plot?.name, visit.date),
  };
}

/** "visita-fazenda-santa-luzia-talhao-1-2026-11-05.pdf" */
export function visitFileName(farmName: string, plotName: string | undefined, date: string): string {
  return `visita-${fileSlug(farmName, "fazenda")}-${fileSlug(plotName ?? "", "talhao")}-${date}.pdf`;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const toISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Escala "redonda" mais próxima de um quarto da largura do desenho. */
function niceMeters(target: number): number {
  const pow = 10 ** Math.floor(Math.log10(target));
  for (const k of [5, 2, 1]) if (k * pow <= target) return k * pow;
  return pow;
}

/**
 * Desenho do talhão em coordenadas do PDF, com norte para cima.
 * Projeção local em metros (equiretangular na latitude do talhão): na escala de um talhão o erro é desprezível.
 */
export function drawPlot(ring: LngLat[], points: MapPoint[], visit: Pick<Visit, "stand">, width = 240, height = 170, pad = 14): MapDrawing {
  const pts = openRing(ring);
  const lat0 = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const mx = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const my = 110_574;
  const toM = ([lng, lat]: LngLat) => [lng * mx, lat * my] as const;
  const ms = pts.map(toM);
  const xs = ms.map((p) => p[0]);
  const ys = ms.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const k = Math.min((width - 2 * pad) / Math.max(maxX - minX, 1), (height - 2 * pad) / Math.max(maxY - minY, 1));
  const ox = (width - (maxX - minX) * k) / 2;
  const oy = (height - (maxY - minY) * k) / 2;
  const project = (p: LngLat) => {
    const [x, y] = toM(p);
    return { x: ox + (x - minX) * k, y: oy + (maxY - y) * k };
  };
  const path = pts.map((p, i) => {
    const q = project(p);
    return `${i ? "L" : "M"}${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
  }).join(" ") + " Z";
  const scaleM = niceMeters((width / 4) / k);
  return {
    width,
    height,
    path,
    points: points.map((p) => ({ ...project([p.lng, p.lat]), color: pointKindInfo(p.kind).color, label: p.name })),
    stand: (visit.stand?.points ?? [])
      .filter((p) => p.lat != null && p.lng != null)
      .map((p) => project([p.lng!, p.lat!])),
    scale: { px: scaleM * k, label: scaleM >= 1000 ? `${formatNumberBR(scaleM / 1000, 1)} km` : `${formatNumberBR(scaleM, 0)} m` },
    areaHa: polygonAreaHa(ring),
  };
}

/** Resumo curto do estande para o destaque do PDF ("260.000 plantas/ha · 98% do planejado"). */
export function standHeadline(visit: Visit): string {
  const s = summarizeStand(visit.stand);
  if (!s) return "";
  const unit = standUnit(visit.kind);
  if (s.perHa == null) return `${formatNumberBR(s.perMeter, 1)} ${unit}/m`;
  return `${formatNumberBR(s.perHa, 0)} ${unit}/ha${s.pctOfTarget != null ? ` · ${formatNumberBR(s.pctOfTarget, 0)}% do planejado` : ""}`;
}
