import { alive, db } from "./db";
import type { ReportInput } from "./report";

/** Muda sempre que algum registro do relatório muda: o PDF já montado fica velho. */
export function inputVersion(input: ReportInput): string {
  let max = 0;
  let n = 0;
  for (const list of Object.values(input)) {
    for (const r of list as { updatedAt?: number }[]) {
      n++;
      if ((r.updatedAt ?? 0) > max) max = r.updatedAt ?? 0;
    }
  }
  return `${max}.${n}`;
}

/** Carrega do aparelho tudo o que o relatório usa, só registros vivos de fazendas e talhões vivos. */
export async function loadReportInput(): Promise<ReportInput> {
  const [farms, plots, seasons, operations, visits, findings, rainfall, supplies, stockMoves, sales, expenses] = await Promise.all([
    db.farms.toArray(),
    db.plots.toArray(),
    db.seasons.toArray(),
    db.operations.toArray(),
    db.visits.toArray(),
    db.findings.toArray(),
    db.rainfall.toArray(),
    db.supplies.toArray(),
    db.stockMoves.toArray(),
    db.sales.toArray(),
    db.expenses.toArray(),
  ]);
  const liveFarms = alive(farms);
  const farmIds = new Set(liveFarms.map((f) => f.id));
  const livePlots = alive(plots).filter((p) => farmIds.has(p.farmId));
  const plotIds = new Set(livePlots.map((p) => p.id));
  const ofLiveFarm = (r: { farmId?: string | null }) => !r.farmId || farmIds.has(r.farmId);
  return {
    farms: liveFarms,
    plots: livePlots,
    seasons: alive(seasons).filter((s) => plotIds.has(s.plotId)),
    operations: alive(operations).filter((o) => plotIds.has(o.plotId)),
    visits: alive(visits).filter((v) => plotIds.has(v.plotId)),
    findings: alive(findings),
    rainfall: alive(rainfall).filter((r) => farmIds.has(r.farmId)),
    supplies: alive(supplies),
    stockMoves: alive(stockMoves),
    sales: alive(sales).filter(ofLiveFarm),
    expenses: alive(expenses).filter(ofLiveFarm),
  };
}
