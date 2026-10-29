import { describe, expect, it } from "vitest";
import type { StandCount } from "./db";
import { cleanStand, perHa, standReportLines, summarizeStand } from "./stand";

const point = (plants: number, meters = 1) => ({ plants, meters, lat: null, lng: null });

describe("estande", () => {
  it("plantas/ha = plantas por metro ÷ espaçamento × 10.000", () => {
    expect(perHa(13, 0.5)).toBe(260_000);
    expect(perHa(11, 0.45)).toBeCloseTo(244_444.4, 1);
    expect(perHa(13, null)).toBeNull();
    expect(perHa(13, 0)).toBeNull();
  });

  it("média ponderada pelos metros, mínimo, máximo e % da população planejada", () => {
    const stand: StandCount = { spacingM: 0.5, targetPerHa: 260_000, points: [point(12), point(14), point(26, 2)] };
    const s = summarizeStand(stand)!;
    expect(s.points).toBe(3);
    expect(s.perMeter).toBe(13); // 52 plantas em 4 m
    expect(s.minPerMeter).toBe(12);
    expect(s.maxPerMeter).toBe(14);
    expect(s.perHa).toBe(260_000);
    expect(s.minPerHa).toBe(240_000);
    expect(s.maxPerHa).toBe(280_000);
    expect(s.pctOfTarget).toBe(100);
    expect(s.cvPct).toBeCloseTo(7.69, 1);
  });

  it("sem espaçamento, só plantas por metro; ponto inválido sai da conta", () => {
    const s = summarizeStand({ spacingM: null, targetPerHa: 260_000, points: [point(10), point(Number.NaN), point(8, 0)] })!;
    expect(s.points).toBe(1);
    expect(s.perHa).toBeNull();
    expect(s.pctOfTarget).toBeNull();
    expect(s.cvPct).toBeNull();
    expect(cleanStand({ spacingM: 0.5, targetPerHa: null, points: [point(5, 0)] })).toBeNull();
    expect(summarizeStand(null)).toBeNull();
  });

  it("texto do relatório: sementes no plantio, plantas no estande", () => {
    const stand: StandCount = { spacingM: 0.5, targetPerHa: 260_000, points: [point(12), point(14)] };
    expect(standReportLines(stand, "estande")).toEqual([
      "13 plantas/m · 260.000 plantas/ha (100% da população planejada de 260.000)",
      "2 pontos · mín. 12 e máx. 14 plantas/m · variação 11% · espaçamento 0,5 m",
    ]);
    expect(standReportLines({ spacingM: null, targetPerHa: null, points: [point(15)] }, "plantio")).toEqual([
      "15 sementes/m",
      "1 ponto",
    ]);
    expect(standReportLines(null, "estande")).toEqual([]);
  });
});
