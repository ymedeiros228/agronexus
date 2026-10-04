import { alive, db } from "./db";
import type { ReportInput } from "./report";

/** Carrega do aparelho tudo o que o relatório usa, só registros vivos de fazendas e talhões vivos. */
export async function loadReportInput(): Promise<ReportInput> {
  const [farms, plots, seasons, operations, visits, findings, rainfall, supplies, stockMoves] = await Promise.all([
    db.farms.toArray(),
    db.plots.toArray(),
    db.seasons.toArray(),
    db.operations.toArray(),
    db.visits.toArray(),
    db.findings.toArray(),
    db.rainfall.toArray(),
    db.supplies.toArray(),
    db.stockMoves.toArray(),
  ]);
  const liveFarms = alive(farms);
  const farmIds = new Set(liveFarms.map((f) => f.id));
  const livePlots = alive(plots).filter((p) => farmIds.has(p.farmId));
  const plotIds = new Set(livePlots.map((p) => p.id));
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
  };
}
