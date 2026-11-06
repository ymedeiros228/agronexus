import { KIND_LABEL, visitKindInfo } from "../catalog";
import type { Farm, Finding, FindingKind, Plot, Season, Visit, VisitAuthor } from "../db";
import { formatDate, plotLabel } from "../format";
import { openRing, type LngLat } from "../geo";
import { formatBRL, formatNumberBR } from "../operations";
import type { SeasonReport } from "../report";
import { fileSlug } from "../save-file";
import { daysSince } from "../season";
import { fitProjection, ringCenter, ringPath, scaleBar } from "./drawing";
import { signatureOf, standHeadline, type InfoCell, type PdfPhoto, type Signature } from "./visit-model";

/**
 * Relatório final da safra do cliente (do plantio à colheita), no mesmo visual do PDF da visita.
 * Puro (sem React nem banco): `render.tsx` carrega os dados e `season-pdf.tsx` desenha.
 */

export type SeasonPdfInput = {
  label: string;
  /** Nome do cliente (produtor). Vazio quando o relatório é de fazendas sem cliente. */
  producer: string;
  farms: Farm[];
  plots: Plot[];
  seasons: Season[];
  /** Visitas da safra (já filtradas por `visitsOfSeason`). */
  visits: Visit[];
  findings: Finding[];
  report: SeasonReport;
  photos: PdfPhoto[];
  author: VisitAuthor | null;
  logo?: string;
  /** Modo gestão: inclui custo, venda e margem. Modo campo fica só na parte técnica. */
  withFinance: boolean;
  now?: Date;
};

export type TimelineRow = {
  date: string;
  dap: string;
  kind: string;
  stage: string;
  /** Achados e contagem, numa linha. */
  seen: string;
  recommendation: string;
};

export type FarmDrawing = {
  width: number;
  height: number;
  shapes: { path: string; label: string; x: number; y: number }[];
  scale: { px: number; label: string };
};

export type SeasonPdfModel = {
  title: string;
  headTitle: string;
  sub: string;
  period: string;
  summary: InfoCell[];
  plots: { header: string[]; rows: string[][] };
  map: FarmDrawing | null;
  timeline: { plot: string; rows: TimelineRow[] }[];
  findings: { kind: FindingKind; kindLabel: string; name: string; visits: number; plots: number; first: string; last: string }[];
  finance: InfoCell[];
  photos: PdfPhoto[];
  signature: Signature | null;
  logo?: string;
  footer: string;
  fileName: string;
  visitCount: number;
};

const byName = (a: string, b: string) => a.localeCompare(b, "pt-BR", { numeric: true });
const sc = (n: number | null) => (n != null ? `${formatNumberBR(n, 1)} sc/ha` : "—");
const day = (iso: string | null) => (iso ? formatDate(iso) : "—");
const toISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** "safra-2026-27-joao-ribeiro.pdf" */
export function seasonFileName(label: string, who: string): string {
  return `safra-${fileSlug(label, "safra")}-${fileSlug(who, "relatorio")}.pdf`;
}

export function seasonPdfModel(input: SeasonPdfInput): SeasonPdfModel {
  const { label, producer, farms, plots, seasons, visits, findings, report: r, photos, author, logo, withFinance } = input;
  const now = input.now ?? new Date();
  const farmById = new Map(farms.map((f) => [f.id, f]));
  const plotById = new Map(plots.map((p) => [p.id, p]));
  const seasonOfPlot = new Map(seasons.filter((s) => s.label === label).map((s) => [s.plotId, s]));
  const manyFarms = farms.length > 1;
  const plotName = (p: Plot | undefined) => {
    const name = plotLabel(p?.name);
    return manyFarms && p ? `${farmById.get(p.farmId)?.name ?? ""} · ${name}` : name;
  };

  // Período: do primeiro plantio à última colheita registrada (ou até hoje).
  const plantings = r.plots.map((p) => p.plantingDate).filter((d): d is string => !!d).sort();
  const harvests = r.plots.map((p) => p.harvestDate).filter((d): d is string => !!d).sort();
  const allHarvested = r.plots.length > 0 && r.plots.every((p) => p.harvestDate);
  const period = plantings.length
    ? `Plantio em ${formatDate(plantings[0])}${harvests.length ? ` · colheita ${allHarvested ? "até" : "começou em"} ${formatDate(harvests[allHarvested ? harvests.length - 1 : 0])}` : " · colheita ainda não registrada"}`
    : "";

  const rainMm = r.rain.reduce((s, x) => s + x.mm, 0);
  const summary: InfoCell[] = [
    { label: "Área", value: `${formatNumberBR(r.areaHa, r.areaHa >= 1000 ? 0 : 1)} ha` },
    { label: r.plots.length === 1 ? "Talhão" : "Talhões", value: String(r.plots.length) },
    { label: "Visitas técnicas", value: String(visits.length) },
    { label: "Produtividade média", value: sc(r.yieldPerHa) },
    { label: "Produção colhida", value: r.bags > 0 ? `${formatNumberBR(r.bags, 0)} sacas` : "—" },
    { label: "Chuva anotada", value: rainMm > 0 ? `${formatNumberBR(rainMm, 0)} mm` : "—" },
  ];

  const plotsTable = {
    header: ["Talhão", "Cultivar", "Plantio", "Colheita", "Área", "Produtividade"],
    rows: r.plots
      .map((p) => [
      manyFarms ? `${p.farmName} · ${plotLabel(p.plotName)}` : plotLabel(p.plotName),
      p.cultivar || "—",
      day(p.plantingDate),
      day(p.harvestDate),
      p.areaHa != null ? `${formatNumberBR(p.areaHa, 1)} ha` : "—",
      sc(p.yieldPerHa),
    ])
      // Mesma ordem da linha do tempo: pelo nome que aparece no relatório.
      .sort((a, b) => byName(a[0], b[0])),
  };

  // Linha do tempo por talhão: cada visita com o que foi visto e o que foi recomendado.
  const findingsByVisit = new Map<string, Finding[]>();
  for (const f of findings) {
    if (!f.name.trim()) continue;
    findingsByVisit.set(f.visitId, [...(findingsByVisit.get(f.visitId) ?? []), f]);
  }
  const byPlot = new Map<string, Visit[]>();
  for (const v of visits) byPlot.set(v.plotId, [...(byPlot.get(v.plotId) ?? []), v]);
  const timeline = [...byPlot.entries()]
    .map(([plotId, vs]) => {
      const plot = plotById.get(plotId);
      const planting = seasonOfPlot.get(plotId)?.plantingDate ?? null;
      return {
        plot: plotName(plot),
        rows: vs
          .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
          .map((v) => {
            const fs = (findingsByVisit.get(v.id) ?? []).map((f) => (f.amount.trim() ? `${f.name.trim()} (${f.amount.trim()})` : f.name.trim()));
            const stand = standHeadline(v);
            return {
              date: formatDate(v.date),
              dap: planting && v.date >= planting ? `${daysSince(planting, new Date(`${v.date}T12:00:00`).getTime())}` : "—",
              kind: visitKindInfo(v.kind).label,
              stage: v.stage || "—",
              seen: [stand, ...fs].filter(Boolean).join("; ") || "Sem ocorrências anotadas",
              recommendation: v.recommendation.trim(),
            };
          }),
      };
    })
    .sort((a, b) => byName(a.plot, b.plot));

  // Ocorrências ao longo do ciclo: quantas visitas, quantos talhões, primeira e última vez.
  const visitById = new Map(visits.map((v) => [v.id, v]));
  const seen = new Map<string, { name: string; kind: FindingKind; visits: Set<string>; plots: Set<string>; first: string; last: string }>();
  for (const f of findings) {
    const v = visitById.get(f.visitId);
    if (!v || !f.name.trim()) continue;
    const key = f.name.trim().toLocaleLowerCase("pt-BR");
    const cur = seen.get(key) ?? { name: f.name.trim(), kind: f.kind, visits: new Set(), plots: new Set(), first: v.date, last: v.date };
    cur.visits.add(v.id);
    cur.plots.add(v.plotId);
    if (v.date < cur.first) cur.first = v.date;
    if (v.date > cur.last) cur.last = v.date;
    seen.set(key, cur);
  }
  const findingRows = [...seen.values()]
    .sort((a, b) => b.visits.size - a.visits.size || byName(a.name, b.name))
    .map((f) => ({
      kind: f.kind,
      kindLabel: KIND_LABEL[f.kind],
      name: f.name,
      visits: f.visits.size,
      plots: f.plots.size,
      first: formatDate(f.first),
      last: formatDate(f.last),
    }));

  const fin = r.finance;
  const finance: InfoCell[] = withFinance
    ? [
        fin.totalCost > 0 ? { label: "Custo realizado", value: formatBRL(fin.totalCost) } : null,
        fin.costPerHa != null ? { label: "Custo por hectare", value: formatBRL(fin.costPerHa) } : null,
        fin.breakEvenPrice != null ? { label: "Custo por saca", value: formatBRL(fin.breakEvenPrice, 2) } : null,
        fin.soldBags > 0 ? { label: "Receita", value: formatBRL(fin.revenue) } : null,
        fin.margin != null ? { label: "Margem", value: formatBRL(fin.margin) } : null,
        fin.marginPerHa != null ? { label: "Margem por hectare", value: formatBRL(fin.marginPerHa) } : null,
      ].filter((c): c is InfoCell => c !== null)
    : [];

  const farmNames = farms.map((f) => f.name).sort(byName);
  const municipalities = [...new Set(farms.map((f) => f.municipality).filter(Boolean))];
  const who = producer || farmNames.join(", ") || "Fazenda";
  return {
    title: `Relatório final da safra ${label}`,
    headTitle: who,
    sub: [producer ? farmNames.join(", ") : "", municipalities.join(", ")].filter(Boolean).join(" · "),
    period,
    summary,
    plots: plotsTable,
    map: drawFarm(r.plots.map((p) => plotById.get(p.plotId)).filter((p): p is Plot => !!p), (p) => plotLabel(p.name)),
    timeline,
    findings: findingRows,
    finance,
    photos,
    signature: signatureOf(author),
    logo,
    footer: `Gerado pelo AgroNexus em ${formatDate(toISODate(now))}`,
    fileName: seasonFileName(label, who),
    visitCount: visits.length,
  };
}

/** Todos os talhões com contorno num desenho só, cada um com o nome no meio. */
export function drawFarm(plots: Plot[], labelOf: (p: Plot) => string, width = 520, height = 230, pad = 16): FarmDrawing | null {
  const rings = plots
    .filter((p) => p.boundary && p.boundary.length >= 3)
    .map((p) => ({ plot: p, ring: openRing(p.boundary as LngLat[]) }));
  if (!rings.length) return null;
  const { project, k } = fitProjection(rings.flatMap((r) => r.ring), width, height, pad);
  return {
    width,
    height,
    shapes: rings.map(({ plot, ring }) => {
      const c = project(ringCenter(ring));
      return { path: ringPath(ring, project), label: labelOf(plot), x: c.x, y: c.y };
    }),
    scale: scaleBar(k, width),
  };
}
