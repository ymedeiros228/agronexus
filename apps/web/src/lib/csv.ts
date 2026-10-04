import { KIND_LABEL } from "./catalog";
import { alive, db, type Farm, type Finding, type Plot, type Season, type Visit } from "./db";
import { formatDate } from "./format";
import { latestSeason } from "./season";

/**
 * Planilha das visitas: uma linha por achado (visita sem achado vira uma linha).
 * Separador ";" e BOM para o Excel em português abrir com acentos e colunas certas.
 */

const HEADER = [
  "Data",
  "Fazenda",
  "Município",
  "Produtor",
  "Talhão",
  "Área (ha)",
  "Safra",
  "Cultivar",
  "Estágio",
  "Tipo",
  "Achado",
  "Quantidade",
  "Obs. do achado",
  "Observações da visita",
  "Recomendação",
  "Retorno",
];

export function csvCell(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return "﻿" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
}

export function visitRows(
  visits: Visit[],
  farms: Farm[],
  plots: Plot[],
  seasons: Season[],
  findings: Finding[],
): (string | number | null)[][] {
  const farmById = new Map(farms.map((f) => [f.id, f]));
  const plotById = new Map(plots.map((p) => [p.id, p]));
  const seasonById = new Map(seasons.map((s) => [s.id, s]));
  const byVisit = new Map<string, Finding[]>();
  for (const f of findings) byVisit.set(f.visitId, [...(byVisit.get(f.visitId) ?? []), f]);

  const sorted = [...visits].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt));
  const out: (string | number | null)[][] = [];
  for (const v of sorted) {
    const farm = farmById.get(v.farmId);
    const plot = plotById.get(v.plotId);
    const season =
      (v.seasonId ? seasonById.get(v.seasonId) : undefined) ??
      latestSeason(seasons.filter((s) => s.plotId === v.plotId));
    const base = [
      formatDate(v.date),
      farm?.name ?? "",
      farm?.municipality ?? "",
      farm?.owner ?? "",
      plot?.name ?? "",
      plot?.areaHa != null ? String(plot.areaHa).replace(".", ",") : "",
      season?.label ?? "",
      season?.cultivar ?? "",
      v.stage,
    ];
    const tail = [v.observations, v.recommendation, v.followUpDate ? formatDate(v.followUpDate) : ""];
    const fs = (byVisit.get(v.id) ?? []).sort((a, b) => a.createdAt - b.createdAt);
    if (fs.length === 0) out.push([...base, "", "", "", "", ...tail]);
    for (const f of fs) out.push([...base, KIND_LABEL[f.kind], f.name, f.amount, f.note, ...tail]);
  }
  return out;
}

export async function exportVisitsCsv(): Promise<Blob> {
  const [farms, plots, seasons, visits, findings] = await Promise.all([
    db.farms.toArray(),
    db.plots.toArray(),
    db.seasons.toArray(),
    db.visits.toArray(),
    db.findings.toArray(),
  ]);
  const rows = visitRows(alive(visits), alive(farms), alive(plots), alive(seasons), alive(findings));
  return new Blob([toCsv([HEADER, ...rows])], { type: "text/csv;charset=utf-8" });
}
