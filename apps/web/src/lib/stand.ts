import type { StandCount, StandPoint, VisitKind } from "./db";
import { formatNumberBR } from "./operations";

/**
 * Contagem de estande (Etapa 3): plantas em alguns metros de linha, em vários pontos do talhão.
 * plantas/ha = plantas por metro ÷ espaçamento entre linhas (m) × 10.000 m².
 * Ex.: 13 plantas/m com 0,5 m de espaçamento = 260.000 plantas/ha.
 * Só faz a conta: não diz se o estande está bom ou ruim (isso é com o agrônomo).
 */

const M2_PER_HA = 10_000;

export const perMeter = (p: StandPoint) => p.plants / p.meters;

export function perHa(plantsPerMeter: number, spacingM: number | null | undefined): number | null {
  return spacingM && spacingM > 0 ? (plantsPerMeter / spacingM) * M2_PER_HA : null;
}

export type StandSummary = {
  points: number;
  perMeter: number;
  minPerMeter: number;
  maxPerMeter: number;
  perHa: number | null;
  minPerHa: number | null;
  maxPerHa: number | null;
  /** Média em relação à população planejada, em %. */
  pctOfTarget: number | null;
  /** Coeficiente de variação entre os pontos, em %: quanto o estande muda de um ponto para outro. */
  cvPct: number | null;
};

/** Tira pontos sem metragem ou com contagem inválida. Sem ponto nenhum, não há contagem. */
export function cleanStand(stand: StandCount | null | undefined): StandCount | null {
  if (!stand) return null;
  const points = stand.points.filter(
    (p) => Number.isFinite(p.plants) && p.plants >= 0 && Number.isFinite(p.meters) && p.meters > 0,
  );
  if (!points.length) return null;
  const positive = (n: number | null) => (n != null && Number.isFinite(n) && n > 0 ? n : null);
  return { spacingM: positive(stand.spacingM), targetPerHa: positive(stand.targetPerHa), points };
}

export function summarizeStand(stand: StandCount | null | undefined): StandSummary | null {
  const clean = cleanStand(stand);
  if (!clean) return null;
  const values = clean.points.map(perMeter);
  // Média ponderada pelos metros: 30 plantas em 2 m pesam mais que 12 em 1 m.
  const totalPlants = clean.points.reduce((s, p) => s + p.plants, 0);
  const totalMeters = clean.points.reduce((s, p) => s + p.meters, 0);
  const mean = totalPlants / totalMeters;
  const min = Math.min(...values);
  const max = Math.max(...values);
  let cvPct: number | null = null;
  if (values.length >= 2 && mean > 0) {
    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / (values.length - 1);
    cvPct = (Math.sqrt(variance) / avg) * 100;
  }
  const ha = perHa(mean, clean.spacingM);
  return {
    points: values.length,
    perMeter: mean,
    minPerMeter: min,
    maxPerMeter: max,
    perHa: ha,
    minPerHa: perHa(min, clean.spacingM),
    maxPerHa: perHa(max, clean.spacingM),
    pctOfTarget: ha != null && clean.targetPerHa ? (ha / clean.targetPerHa) * 100 : null,
    cvPct,
  };
}

/** No plantio se contam sementes no sulco; depois, plantas emergidas. */
export const standUnit = (kind: VisitKind | undefined) => (kind === "plantio" ? "sementes" : "plantas");

/** Linhas do relatório: "13 plantas/m · 260.000 plantas/ha (100% da população planejada de 260.000)". */
export function standReportLines(stand: StandCount | null | undefined, kind: VisitKind | undefined): string[] {
  const s = summarizeStand(stand);
  const clean = cleanStand(stand);
  if (!s || !clean) return [];
  const unit = standUnit(kind);
  const first = [`${formatNumberBR(s.perMeter, 1)} ${unit}/m`];
  if (s.perHa != null) {
    let ha = `${formatNumberBR(s.perHa, 0)} ${unit}/ha`;
    if (s.pctOfTarget != null) ha += ` (${formatNumberBR(s.pctOfTarget, 0)}% da população planejada de ${formatNumberBR(clean.targetPerHa, 0)})`;
    first.push(ha);
  }
  const second = [`${s.points} ${s.points === 1 ? "ponto" : "pontos"}`];
  if (s.points > 1) second.push(`mín. ${formatNumberBR(s.minPerMeter, 1)} e máx. ${formatNumberBR(s.maxPerMeter, 1)} ${unit}/m`);
  if (s.cvPct != null) second.push(`variação ${formatNumberBR(s.cvPct, 0)}%`);
  if (clean.spacingM) second.push(`espaçamento ${formatNumberBR(clean.spacingM, 2)} m`);
  return [first.join(" · "), second.join(" · ")];
}
