import { describe, expect, it } from "vitest";
import { newBase, type Farm, type Finding, type Operation, type Plot, type Season, type Visit } from "../db";
import type { LngLat } from "../geo";
import { seasonReport, visitsOfSeason, type ReportInput } from "../report";
import { drawFarm, seasonFileName, seasonPdfModel } from "./season-model";

const sq = (x: number): LngLat[] => [
  [x, -7.5],
  [x + 0.01, -7.5],
  [x + 0.01, -7.51],
  [x, -7.51],
];
const farm = { ...newBase(), id: "f1", name: "Santa Luzia", owner: "João", municipality: "Balsas - MA", clientId: "c1" } as Farm;
const plots = [
  { ...newBase(), id: "t1", farmId: "f1", name: "Talhão 1", areaHa: 100, boundary: sq(-46) },
  { ...newBase(), id: "t2", farmId: "f1", name: "Talhão 2", areaHa: 50, boundary: sq(-45.98) },
] as Plot[];
const seasons = [
  { ...newBase(), id: "s1", plotId: "t1", label: "2026/27", cultivar: "TMG 2383", plantingDate: "2026-10-05" },
  { ...newBase(), id: "s2", plotId: "t2", label: "2026/27", cultivar: "BRS 1003", plantingDate: "2026-10-10" },
] as Season[];
const visit = (id: string, plotId: string, date: string, extra: Partial<Visit> = {}) =>
  ({ ...newBase(), id, farmId: "f1", plotId, seasonId: plotId === "t1" ? "s1" : "s2", date, stage: "V4", observations: "", recommendation: "", followUpDate: null, followUpDone: false, ...extra }) as Visit;
const visits = [
  visit("v1", "t1", "2026-11-05", { recommendation: "Aplicar inseticida." }),
  visit("v2", "t1", "2026-11-20"),
  visit("v3", "t2", "2026-11-12"),
];
const finding = (visitId: string, name: string): Finding => ({ ...newBase(), visitId, kind: "praga", name, amount: "", note: "" }) as Finding;
const findings = [finding("v1", "Lagarta"), finding("v2", "lagarta "), finding("v3", "Lagarta"), finding("v3", "Percevejo")];
const harvest = {
  ...newBase(),
  plotId: "t1",
  seasonId: "s1",
  kind: "colheita",
  status: "concluida",
  date: "2027-02-10",
  doneDate: "2027-02-10",
  areaHa: 100,
  yieldBags: 6500,
  cost: 0,
} as unknown as Operation;

const input: ReportInput = {
  farms: [farm],
  plots,
  seasons,
  operations: [harvest],
  visits,
  findings,
  rainfall: [],
  supplies: [],
  stockMoves: [],
  sales: [],
  expenses: [],
};

const model = (withFinance = false) =>
  seasonPdfModel({
    label: "2026/27",
    producer: "João Ribeiro",
    farms: [farm],
    plots,
    seasons,
    visits: visitsOfSeason("2026/27", input),
    findings,
    report: seasonReport("2026/27", input, "2027-03-01"),
    photos: [],
    author: null,
    withFinance,
    now: new Date(2027, 2, 1),
  });

describe("seasonPdfModel", () => {
  it("resume a safra do cliente: área, talhões, visitas e produtividade", () => {
    const m = model();
    expect(m.title).toBe("Relatório final da safra 2026/27");
    expect(m.headTitle).toBe("João Ribeiro");
    expect(m.sub).toBe("Santa Luzia · Balsas - MA");
    const cell = (l: string) => m.summary.find((c) => c.label === l)?.value;
    expect(cell("Área")).toBe("150 ha");
    expect(cell("Visitas técnicas")).toBe("3");
    expect(m.plots.rows[0]).toEqual(["Talhão 1", "TMG 2383", "05/10/2026", "10/02/2027", "100 ha", "65 sc/ha"]);
    expect(m.period).toContain("Plantio em 05/10/2026");
    expect(m.period).toContain("colheita começou em 10/02/2027");
  });

  it("junta a mesma praga escrita de jeitos diferentes, com a primeira e a última vez", () => {
    const lagarta = model().findings[0];
    expect(lagarta).toMatchObject({ name: "Lagarta", visits: 3, plots: 2, first: "05/11/2026", last: "20/11/2026" });
  });

  it("monta a linha do tempo por talhão, em ordem de data, com DAP e recomendação", () => {
    const t1 = model().timeline.find((t) => t.plot === "Talhão 1")!;
    expect(t1.rows.map((r) => r.date)).toEqual(["05/11/2026", "20/11/2026"]);
    expect(t1.rows[0]).toMatchObject({ dap: "31", seen: "Lagarta", recommendation: "Aplicar inseticida." });
  });

  it("só mostra custos no modo gestão", () => {
    expect(model(false).finance).toEqual([]);
  });

  it("nome do arquivo sem barra nem acento", () => {
    expect(seasonFileName("2026/27", "João Ribeiro")).toBe("safra-2026-27-joao-ribeiro.pdf");
  });
});

describe("drawFarm", () => {
  it("desenha os talhões com contorno lado a lado, dentro do desenho", () => {
    const d = drawFarm(plots, (p) => p.name)!;
    expect(d.shapes).toHaveLength(2);
    expect(d.shapes[0].x).toBeLessThan(d.shapes[1].x);
    for (const sh of d.shapes) {
      expect(sh.x).toBeGreaterThan(0);
      expect(sh.x).toBeLessThan(d.width);
    }
    expect(drawFarm([{ ...plots[0], boundary: null }], (p) => p.name)).toBeNull();
  });
});
