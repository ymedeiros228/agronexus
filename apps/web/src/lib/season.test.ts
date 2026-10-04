import { describe, expect, it } from "vitest";
import { daysSince, latestSeason, nextSeasonLabel, seasonLabelFor } from "./season";

describe("seasonLabelFor", () => {
  it("vira o ano agrícola em julho", () => {
    expect(seasonLabelFor(new Date(2026, 5, 30))).toBe("2025/26");
    expect(seasonLabelFor(new Date(2026, 6, 1))).toBe("2026/27");
    expect(seasonLabelFor(new Date(2026, 9, 3))).toBe("2026/27");
    expect(seasonLabelFor(new Date(2027, 0, 15))).toBe("2026/27");
  });

  it("trata a virada do século", () => {
    expect(seasonLabelFor(new Date(2099, 8, 1))).toBe("2099/00");
  });
});

describe("nextSeasonLabel", () => {
  it("avança um ano", () => {
    expect(nextSeasonLabel("2026/27")).toBe("2027/28");
    expect(nextSeasonLabel(" 2099/00 ")).toBe("2100/01");
  });

  it("rótulo fora do padrão volta a safra atual", () => {
    expect(nextSeasonLabel("safrinha")).toBe(seasonLabelFor());
  });
});

describe("latestSeason", () => {
  it("pega a cadastrada por último", () => {
    expect(latestSeason([{ createdAt: 1 }, { createdAt: 3 }, { createdAt: 2 }])).toEqual({ createdAt: 3 });
    expect(latestSeason([])).toBeUndefined();
  });
});

describe("daysSince", () => {
  it("conta dias corridos e nunca fica negativo", () => {
    const noon = (iso: string) => new Date(`${iso}T12:00:00`).getTime();
    expect(daysSince("2026-10-01", noon("2026-10-01"))).toBe(0);
    expect(daysSince("2026-09-01", noon("2026-10-01"))).toBe(30);
    expect(daysSince("2026-10-05", noon("2026-10-01"))).toBe(0);
  });
});
