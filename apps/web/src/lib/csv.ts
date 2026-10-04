import { KIND_LABEL } from "./catalog";
import { alive, db, type Farm, type Finding, type Operation, type Plot, type Season, type Visit } from "./db";
import { formatDate } from "./format";
import { KIND_NAME, STATUS_NAME } from "./operations";
import { latestSeason } from "./season";
import { CATEGORY_NAME, stockOf, usesByOperation, type SupplyStock, type Use } from "./stock";

/** Número no formato do Excel em português: vírgula decimal, sem separador de milhar. */
function num(n: number | null | undefined, digits = 2): string {
  return n == null ? "" : n.toLocaleString("pt-BR", { maximumFractionDigits: digits, useGrouping: false });
}

function csvBlob(rows: (string | number | null | undefined)[][]): Blob {
  return new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
}

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
  return csvBlob([HEADER, ...rows]);
}

const OPERATION_HEADER = [
  "Data",
  "Fazenda",
  "Talhão",
  "Safra",
  "Tipo",
  "Situação",
  "Área (ha)",
  "O que foi feito",
  "Insumos",
  "Custo (R$)",
  "Sacas (60 kg)",
  "Produtividade (sc/ha)",
];

/** Uma linha por operação, da mais antiga para a mais nova. */
export function operationRows(
  operations: Operation[],
  farms: Farm[],
  plots: Plot[],
  seasons: Season[],
  uses: Map<string, Use[]>,
): string[][] {
  const farmName = new Map(farms.map((f) => [f.id, f.name]));
  const plotName = new Map(plots.map((p) => [p.id, p.name]));
  const seasonLabel = new Map(seasons.map((s) => [s.id, s.label]));
  const dateOf = (o: Operation) => (o.status === "concluida" ? (o.doneDate ?? o.date) : o.date);
  return [...operations]
    .filter((o) => farmName.has(o.farmId) && plotName.has(o.plotId))
    .sort((a, b) => (dateOf(a) < dateOf(b) ? -1 : dateOf(a) > dateOf(b) ? 1 : a.createdAt - b.createdAt))
    .map((o) => [
      formatDate(dateOf(o)),
      farmName.get(o.farmId)!,
      plotName.get(o.plotId)!,
      (o.seasonId && seasonLabel.get(o.seasonId)) || "",
      KIND_NAME[o.kind],
      STATUS_NAME[o.status],
      num(o.areaHa),
      o.description,
      (uses.get(o.id) ?? []).map((u) => `${u.name} ${num(u.qty, 3)} ${u.unit}`).join(", "),
      num(o.cost),
      num(o.yieldBags, 1),
      o.kind === "colheita" && o.yieldBags != null && o.areaHa ? num(o.yieldBags / o.areaHa, 1) : "",
    ]);
}

export async function exportOperationsCsv(): Promise<Blob> {
  const [ops, farms, plots, seasons, moves, supplies] = await Promise.all([
    db.operations.toArray(),
    db.farms.toArray(),
    db.plots.toArray(),
    db.seasons.toArray(),
    db.stockMoves.toArray(),
    db.supplies.toArray(),
  ]);
  const uses = usesByOperation(alive(moves), alive(supplies));
  return csvBlob([OPERATION_HEADER, ...operationRows(alive(ops), alive(farms), alive(plots), alive(seasons), uses)]);
}

const STOCK_HEADER = [
  "Insumo",
  "Categoria",
  "Unidade",
  "Saldo",
  "Previsto em operações abertas",
  "Estoque mínimo",
  "Preço médio (R$ por unidade)",
  "Valor do saldo (R$)",
];

export function stockRows(stock: SupplyStock[]): string[][] {
  return [...stock]
    .sort((a, b) => a.supply.name.localeCompare(b.supply.name, "pt-BR", { numeric: true }))
    .map((s) => [
      s.supply.name,
      CATEGORY_NAME[s.supply.category],
      s.supply.unit,
      num(s.balance, 3),
      num(s.planned, 3),
      num(s.supply.minQty, 3),
      num(s.avgCost),
      num(s.value),
    ]);
}

export async function exportStockCsv(): Promise<Blob> {
  const [supplies, moves, ops] = await Promise.all([db.supplies.toArray(), db.stockMoves.toArray(), db.operations.toArray()]);
  return csvBlob([STOCK_HEADER, ...stockRows(stockOf(alive(supplies), alive(moves), alive(ops)))]);
}
