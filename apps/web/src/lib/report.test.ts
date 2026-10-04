import { describe, expect, it } from "vitest";
import type { Finding, Operation, Plot, Season, StockMove, Supply, Visit } from "./db";
import { seasonReport, type ReportInput } from "./report";
import { seasonPeriod } from "./season";

const base = (id: string, createdAt = 1) => ({ id, createdAt, updatedAt: createdAt });
const TODAY = "2027-03-20";

const plots: Plot[] = [
  { ...base("p1"), farmId: "f1", name: "T-2", areaHa: 100 },
  { ...base("p2"), farmId: "f1", name: "T-10", areaHa: 50 },
];
const seasons: Season[] = [
  { ...base("old", 1), plotId: "p1", label: "2025/26", cultivar: "Antiga", plantingDate: "2025-11-01" },
  { ...base("s1", 2), plotId: "p1", label: "2026/27", cultivar: "Cultivar A", plantingDate: "2026-11-05" },
  { ...base("s2", 2), plotId: "p2", label: "2026/27", cultivar: "Cultivar B", plantingDate: "2026-11-12" },
];
const op = (id: string, over: Partial<Operation>): Operation => ({
  ...base(id),
  farmId: "f1",
  plotId: "p1",
  seasonId: "s1",
  kind: "aplicacao",
  status: "concluida",
  date: "2027-01-10",
  doneDate: "2027-01-10",
  areaHa: 100,
  description: "",
  cost: null,
  yieldBags: null,
  ...over,
});
const visit = (id: string, plotId: string, seasonId: string | null | undefined): Visit => ({
  ...base(id),
  farmId: "f1",
  plotId,
  seasonId,
  date: "2027-01-05",
  stage: "R3",
  observations: "",
  recommendation: "",
  followUpDate: null,
  followUpDone: false,
});
const finding = (id: string, visitId: string, name: string): Finding => ({
  ...base(id),
  visitId,
  kind: "praga",
  name,
  amount: "",
  note: "",
});
const supply: Supply = { ...base("sup"), name: "Produto X", category: "fungicida", unit: "L", minQty: null, notes: "" };
const move = (id: string, over: Partial<StockMove>): StockMove => ({
  ...base(id),
  supplyId: "sup",
  kind: "entrada",
  qty: 0,
  date: "2026-12-01",
  cost: null,
  operationId: null,
  note: "",
  ...over,
});

const input: ReportInput = {
  farms: [{ ...base("f1"), name: "Boa Vista", municipality: "", owner: "" }],
  plots,
  seasons,
  operations: [
    op("a1", { cost: 30_000 }),
    op("a2", { plotId: "p2", seasonId: "s2", areaHa: 50, cost: 12_000 }),
    op("plan", { status: "planejada", date: "2027-03-01", doneDate: null, cost: 5_000 }),
    op("h1", { kind: "colheita", doneDate: "2027-03-02", yieldBags: 6_600 }),
    op("h2", { plotId: "p2", seasonId: "s2", kind: "colheita", areaHa: 50, doneDate: "2027-03-10", yieldBags: 3_000 }),
    op("velha", { seasonId: "old", cost: 99_000, kind: "colheita", yieldBags: 5_000 }),
  ],
  visits: [visit("v1", "p1", "s1"), visit("v2", "p2", "s2"), visit("v3", "p2", undefined), visit("vOld", "p1", "old")],
  findings: [
    finding("f1", "v1", "Percevejo-marrom"),
    finding("f2", "v2", "percevejo-marrom "),
    finding("f3", "v3", "Lagarta"),
    finding("f4", "vOld", "Ferrugem"),
  ],
  rainfall: [
    { ...base("r1"), farmId: "f1", date: "2026-12-01", mm: 40 },
    { ...base("r2"), farmId: "f1", date: "2027-01-15", mm: 25.5 },
    { ...base("r0"), farmId: "f1", date: "2026-05-01", mm: 999 }, // safra anterior
  ],
  supplies: [supply],
  stockMoves: [
    move("e", { qty: 300, cost: 30_000 }),
    move("u1", { kind: "uso", qty: 50, operationId: "a1" }),
    move("u2", { kind: "uso", qty: 25, operationId: "a2" }),
    move("u3", { kind: "uso", qty: 40, operationId: "plan" }), // planejada: não entra
  ],
};

describe("seasonPeriod", () => {
  it("ano agrícola de julho a junho", () => {
    expect(seasonPeriod("2026/27")).toEqual({ from: "2026-07-01", to: "2027-06-30" });
    expect(seasonPeriod("safrinha")).toBeNull();
  });
});

describe("seasonReport", () => {
  const r = seasonReport("2026/27", input, TODAY);

  it("totais da safra com custo realizado e custo por saca", () => {
    expect(r.areaHa).toBe(150);
    expect(r.bags).toBe(9_600);
    expect(r.yieldPerHa).toBe(64);
    expect(r.cost).toBe(42_000);
    expect(r.plannedCost).toBe(5_000);
    expect(r.costPerHa).toBe(280);
    expect(r.costPerBag).toBe(280 / 64);
    expect([r.openOps, r.lateOps]).toEqual([1, 1]);
  });

  it("uma linha por talhão, em ordem natural", () => {
    expect(r.plots.map((p) => [p.plotName, p.cultivar, p.yieldPerHa, p.costPerHa, p.harvestDate, p.visits])).toEqual([
      ["T-2", "Cultivar A", 66, 300, "2027-03-02", 1],
      ["T-10", "Cultivar B", 60, 240, "2027-03-10", 2],
    ]);
  });

  it("insumos só de operações concluídas, com estimativa pelo preço médio", () => {
    expect(r.supplies).toEqual([
      { supplyId: "sup", name: "Produto X", unit: "L", category: "fungicida", qty: 75, perHa: 0.5, estCost: 7_500 },
    ]);
  });

  it("ocorrências agrupadas pelo nome; visita sem safra conta na vigente; safra antiga fica de fora", () => {
    expect(r.findings).toEqual([
      { name: "Percevejo-marrom", kind: "praga", visits: 2, plots: 2 },
      { name: "Lagarta", kind: "praga", visits: 1, plots: 1 },
    ]);
    expect(r.visits).toBe(3);
  });

  it("chuva só do ano agrícola", () => {
    expect(r.rain).toEqual([{ farmName: "Boa Vista", mm: 65.5 }]);
  });

  it("comparação com safras anteriores", () => {
    expect(r.history).toEqual([
      { label: "2026/27", areaHa: 150, yieldPerHa: 64, costPerHa: 280 },
      { label: "2025/26", areaHa: 100, yieldPerHa: 50, costPerHa: 990 },
    ]);
  });
});
