import type {
  Expense,
  Farm,
  Finding,
  FindingKind,
  Operation,
  OperationKind,
  Plot,
  Rainfall,
  Sale,
  Season,
  StockMove,
  Supply,
  SupplyCategory,
  Visit,
} from "./db";
import { seasonFinance, type SeasonFinance } from "./finance";
import { isLate, isSpent, seasonLabels, seasonStats } from "./operations";
import { latestSeason, seasonPeriod } from "./season";
import { stockOf } from "./stock";

/**
 * Relatório da safra (tela 13) e comparação entre safras.
 * Tudo sai do que foi registrado; o que não tem dado fica null e a tela mostra "—".
 */

export type ReportInput = {
  farms: Farm[];
  plots: Plot[];
  seasons: Season[];
  operations: Operation[];
  visits: Visit[];
  findings: Finding[];
  rainfall: Rainfall[];
  supplies: Supply[];
  stockMoves: StockMove[];
  sales: Sale[];
  expenses: Expense[];
};

export type PlotLine = {
  plotId: string;
  plotName: string;
  farmName: string;
  cultivar: string;
  plantingDate: string | null;
  harvestDate: string | null;
  areaHa: number | null;
  harvestedHa: number;
  bags: number;
  yieldPerHa: number | null;
  cost: number;
  costPerHa: number | null;
  visits: number;
  openOps: number;
};

export type SupplyLine = {
  supplyId: string;
  name: string;
  unit: string;
  category: SupplyCategory;
  qty: number;
  /** Quantidade por hectare da área da safra. */
  perHa: number | null;
  /** qty × preço médio das entradas. Estimativa: null sem preço. */
  estCost: number | null;
};

export type FindingLine = { name: string; kind: FindingKind; visits: number; plots: number };

export type HistoryLine = {
  label: string;
  areaHa: number;
  yieldPerHa: number | null;
  /** Custo total (operações + despesas gerais) por hectare. */
  costPerHa: number | null;
  marginPerHa: number | null;
};

export type SeasonReport = {
  label: string;
  period: { from: string; to: string } | null;
  plots: PlotLine[];
  areaHa: number;
  harvestedHa: number;
  bags: number;
  yieldPerHa: number | null;
  cost: number;
  plannedCost: number;
  costPerHa: number | null;
  /** Custo por hectare ÷ produtividade: quantas reais custou cada saca. */
  costPerBag: number | null;
  costByKind: { kind: OperationKind; cost: number }[];
  supplies: SupplyLine[];
  findings: FindingLine[];
  visits: number;
  rain: { farmName: string; mm: number }[];
  openOps: number;
  lateOps: number;
  history: HistoryLine[];
  finance: SeasonFinance;
};

const byName = (a: string, b: string) => a.localeCompare(b, "pt-BR", { numeric: true });

export function seasonReport(label: string, input: ReportInput, today: string): SeasonReport {
  const farmById = new Map(input.farms.map((f) => [f.id, f]));
  const seasonsOfLabel = input.seasons.filter((s) => s.label === label);
  const seasonIds = new Set(seasonsOfLabel.map((s) => s.id));
  const ops = input.operations.filter((o) => o.seasonId && seasonIds.has(o.seasonId));
  const stats = seasonStats(label, input.seasons, input.plots, input.operations, today);

  // Visita sem safra (backup antigo) conta para a safra vigente do talhão, como no painel.
  const latestByPlot = new Map<string, Season | undefined>();
  const seasonOfVisit = (v: Visit) => {
    if (v.seasonId && input.seasons.some((s) => s.id === v.seasonId)) return v.seasonId;
    if (!latestByPlot.has(v.plotId)) latestByPlot.set(v.plotId, latestSeason(input.seasons.filter((s) => s.plotId === v.plotId)));
    return latestByPlot.get(v.plotId)?.id ?? null;
  };
  const visits = input.visits.filter((v) => {
    const sid = seasonOfVisit(v);
    return sid !== null && seasonIds.has(sid);
  });

  const plots: PlotLine[] = [];
  for (const season of seasonsOfLabel) {
    const plot = input.plots.find((p) => p.id === season.plotId);
    if (!plot) continue;
    const plotOps = ops.filter((o) => o.seasonId === season.id);
    const harvests = plotOps.filter((o) => o.kind === "colheita" && o.status === "concluida" && o.yieldBags != null && o.areaHa);
    const harvestedHa = harvests.reduce((s, o) => s + (o.areaHa ?? 0), 0);
    const bags = harvests.reduce((s, o) => s + (o.yieldBags ?? 0), 0);
    const cost = plotOps.filter(isSpent).reduce((s, o) => s + (o.cost ?? 0), 0);
    plots.push({
      plotId: plot.id,
      plotName: plot.name,
      farmName: farmById.get(plot.farmId)?.name ?? "",
      cultivar: season.cultivar,
      plantingDate: season.plantingDate,
      harvestDate: harvests.reduce<string | null>((max, o) => {
        const d = o.doneDate ?? o.date;
        return !max || d > max ? d : max;
      }, null),
      areaHa: plot.areaHa,
      harvestedHa,
      bags,
      yieldPerHa: harvestedHa > 0 ? bags / harvestedHa : null,
      cost,
      costPerHa: cost > 0 && plot.areaHa ? cost / plot.areaHa : null,
      visits: visits.filter((v) => v.plotId === plot.id).length,
      openOps: plotOps.filter((o) => o.status !== "concluida").length,
    });
  }
  plots.sort((a, b) => byName(a.farmName, b.farmName) || byName(a.plotName, b.plotName));

  // Insumos das operações concluídas da safra.
  const doneOps = new Set(ops.filter((o) => o.status === "concluida").map((o) => o.id));
  const stock = new Map(stockOf(input.supplies, input.stockMoves, input.operations).map((s) => [s.supply.id, s]));
  const qtyBySupply = new Map<string, number>();
  for (const m of input.stockMoves) {
    if (m.kind === "uso" && m.operationId && doneOps.has(m.operationId)) {
      qtyBySupply.set(m.supplyId, (qtyBySupply.get(m.supplyId) ?? 0) + m.qty);
    }
  }
  const supplies: SupplyLine[] = [];
  for (const [supplyId, qty] of qtyBySupply) {
    const s = stock.get(supplyId);
    if (!s) continue;
    supplies.push({
      supplyId,
      name: s.supply.name,
      unit: s.supply.unit,
      category: s.supply.category,
      qty,
      perHa: stats.areaHa > 0 ? qty / stats.areaHa : null,
      estCost: s.avgCost != null ? qty * s.avgCost : null,
    });
  }
  supplies.sort((a, b) => byName(a.category, b.category) || byName(a.name, b.name));

  // Ocorrências: em quantas visitas e talhões cada uma apareceu.
  const visitById = new Map(visits.map((v) => [v.id, v]));
  const found = new Map<string, { name: string; kind: FindingKind; visits: Set<string>; plots: Set<string> }>();
  for (const f of input.findings) {
    const v = visitById.get(f.visitId);
    if (!v || !f.name.trim()) continue;
    const key = f.name.trim().toLocaleLowerCase("pt-BR");
    const cur = found.get(key) ?? { name: f.name.trim(), kind: f.kind, visits: new Set(), plots: new Set() };
    cur.visits.add(v.id);
    cur.plots.add(v.plotId);
    found.set(key, cur);
  }
  const findings = [...found.values()]
    .map((f) => ({ name: f.name, kind: f.kind, visits: f.visits.size, plots: f.plots.size }))
    .sort((a, b) => b.visits - a.visits || byName(a.name, b.name));

  // Chuva anotada no ano agrícola, por fazenda que tem talhão na safra.
  const period = seasonPeriod(label);
  const farmIds = new Set(
    seasonsOfLabel.map((s) => input.plots.find((p) => p.id === s.plotId)?.farmId).filter((id): id is string => !!id),
  );
  const rain = [...farmIds]
    .map((farmId) => ({
      farmName: farmById.get(farmId)?.name ?? "",
      mm: input.rainfall
        .filter((r) => r.farmId === farmId && (!period || (r.date >= period.from && r.date <= period.to)))
        .reduce((s, r) => s + r.mm, 0),
    }))
    .filter((r) => r.mm > 0)
    .sort((a, b) => byName(a.farmName, b.farmName));

  const history = seasonLabels(input.seasons).map((l) => {
    const s = seasonStats(l, input.seasons, input.plots, input.operations, today);
    const f = seasonFinance(l, s, input.sales, input.expenses);
    return { label: l, areaHa: s.areaHa, yieldPerHa: s.yieldPerHa, costPerHa: f.costPerHa, marginPerHa: f.marginPerHa };
  });

  return {
    label,
    period,
    plots,
    areaHa: stats.areaHa,
    harvestedHa: stats.harvestedHa,
    bags: stats.bags,
    yieldPerHa: stats.yieldPerHa,
    cost: stats.cost,
    plannedCost: stats.plannedCost,
    costPerHa: stats.costPerHa,
    costPerBag: stats.costPerHa != null && stats.yieldPerHa ? stats.costPerHa / stats.yieldPerHa : null,
    costByKind: stats.costByKind,
    supplies,
    findings,
    visits: visits.length,
    rain,
    openOps: ops.filter((o) => o.status !== "concluida").length,
    lateOps: ops.filter((o) => isLate(o, today)).length,
    history,
    finance: seasonFinance(label, stats, input.sales, input.expenses),
  };
}
