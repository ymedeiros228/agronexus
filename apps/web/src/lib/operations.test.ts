import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, newBase, type Operation, type Plot, type Season } from "./db";
import {
  completeOperation,
  isLate,
  parseNumberBR,
  saveOperation,
  seasonLabels,
  seasonStats,
  yieldByPlot,
  type OperationInput,
} from "./operations";
import { buildPanel } from "./panel";

const base = (id: string, createdAt = 1) => ({ id, createdAt, updatedAt: createdAt });
const TODAY = "2027-02-20";

describe("parseNumberBR", () => {
  it("entende o jeito brasileiro de escrever números", () => {
    expect(parseNumberBR("120")).toBe(120);
    expect(parseNumberBR("85,5")).toBe(85.5);
    expect(parseNumberBR("1.250,50")).toBe(1250.5);
    expect(parseNumberBR("15.000")).toBe(15000);
    expect(parseNumberBR("7.440")).toBe(7440);
    expect(parseNumberBR("1.234.567")).toBe(1234567);
    expect(parseNumberBR("R$ 2.000")).toBe(2000);
    expect(parseNumberBR("12.5")).toBe(12.5);
    expect(parseNumberBR("")).toBeNull();
    expect(parseNumberBR("abc")).toBeNull();
    expect(parseNumberBR("-3")).toBeNull();
  });
});

describe("isLate", () => {
  it("só planejada com data passada está atrasada", () => {
    expect(isLate({ status: "planejada", date: "2027-02-19" }, TODAY)).toBe(true);
    expect(isLate({ status: "planejada", date: TODAY }, TODAY)).toBe(false);
    expect(isLate({ status: "andamento", date: "2027-01-01" }, TODAY)).toBe(false);
    expect(isLate({ status: "concluida", date: "2027-01-01" }, TODAY)).toBe(false);
  });
});

describe("estatísticas da safra", () => {
  const plots: Plot[] = [
    { ...base("p1"), farmId: "f1", name: "T-1", areaHa: 100 },
    { ...base("p2"), farmId: "f1", name: "T-2", areaHa: 50 },
    { ...base("p3"), farmId: "f1", name: "T-3", areaHa: 999 },
  ];
  const seasons: Season[] = [
    { ...base("s1"), plotId: "p1", label: "2026/27", cultivar: "", plantingDate: null },
    { ...base("s2"), plotId: "p2", label: "2026/27", cultivar: "", plantingDate: null },
    { ...base("s3"), plotId: "p3", label: "2025/26", cultivar: "", plantingDate: null },
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
  const ops: Operation[] = [
    op("a", { cost: 30_000 }),
    op("b", { kind: "plantio", cost: 15_000 }),
    op("c", { plotId: "p2", seasonId: "s2", cost: 4_500 }),
    op("d", { kind: "colheita", yieldBags: 6_500, cost: null }),
    op("e", { plotId: "p2", seasonId: "s2", kind: "colheita", areaHa: 50, yieldBags: 3_100 }),
    op("f", { status: "planejada", date: "2027-02-10", doneDate: null }),
    op("g", { status: "andamento", date: "2027-02-18", doneDate: null }),
    op("h", { status: "concluida", doneDate: TODAY }),
    op("old", { plotId: "p3", seasonId: "s3", cost: 1_000_000 }),
    op("x", { kind: "colheita", status: "planejada", yieldBags: 99_999 }),
  ];

  it("soma área, custo e produtividade só da safra escolhida", () => {
    const s = seasonStats("2026/27", seasons, plots, ops, TODAY);
    expect(s.plots).toBe(2);
    expect(s.areaHa).toBe(150);
    expect(s.cost).toBe(49_500);
    expect(s.costPerHa).toBe(330);
    expect(s.costByKind).toEqual([
      { kind: "aplicacao", cost: 34_500 },
      { kind: "plantio", cost: 15_000 },
    ]);
    expect(s.harvestedHa).toBe(150);
    expect(s.bags).toBe(9_600);
    expect(s.yieldPerHa).toBe(64);
    expect(s.open).toBe(3); // f, g, x
    expect(s.late).toBe(2); // f e x (planejadas com data passada)
    expect(s.doneToday).toBe(1); // h
  });

  it("sem custo anotado não inventa custo por hectare; sem colheita não há produtividade", () => {
    const s = seasonStats("2026/27", seasons, plots, [op("a", {})], TODAY);
    expect(s.costPerHa).toBeNull();
    expect(s.yieldPerHa).toBeNull();
  });

  it("produtividade por talhão, do maior para o menor", () => {
    expect(yieldByPlot("2026/27", seasons, ops)).toEqual([
      { plotId: "p1", bags: 6_500, areaHa: 100, perHa: 65 },
      { plotId: "p2", bags: 3_100, areaHa: 50, perHa: 62 },
    ]);
  });

  it("lista as safras da mais nova para a mais antiga", () => {
    expect(seasonLabels(seasons)).toEqual(["2026/27", "2025/26"]);
  });

  it("operação atrasada entra no Pede atenção", () => {
    const { alerts } = buildPanel(
      {
        farms: [{ ...base("f1"), name: "Fazenda", municipality: "", owner: "" }],
        plots: [plots[0]],
        seasons: [],
        visits: [],
        findings: [],
        rainfall: [],
        operations: [op("f", { status: "planejada", date: "2027-02-10", doneDate: null })],
      },
      TODAY,
    );
    expect(alerts.map((a) => a.text)).toEqual(["Aplicação atrasada (prevista para 10/02)"]);
  });
});

describe("saveOperation", () => {
  let clock = 1_000;
  beforeEach(async () => {
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    clock = 1_000;
    await Promise.all(db.tables.map((t) => t.clear()));
    await db.plots.bulkAdd([
      { ...newBase(), id: "p1", farmId: "f1", name: "T-1", areaHa: 100 },
      { ...newBase(), id: "p2", farmId: "f1", name: "T-2", areaHa: 50 },
    ]);
    await db.seasons.bulkAdd([
      { ...newBase(), id: "s1", plotId: "p1", label: "2026/27", cultivar: "", plantingDate: null },
      { ...newBase(), id: "s2", plotId: "p2", label: "2026/27", cultivar: "", plantingDate: "2026-11-02" },
    ]);
  });
  afterEach(() => vi.restoreAllMocks());

  const input = (over: Partial<OperationInput> = {}): OperationInput => ({
    farmId: "f1",
    plotId: "p1",
    kind: "aplicacao",
    status: "planejada",
    date: "2027-02-25",
    doneDate: "2027-02-25",
    areaHa: 100,
    description: "  fungicida  ",
    cost: null,
    yieldBags: 10,
    ...over,
  });

  it("grava na safra vigente, limpa campos que não se aplicam", async () => {
    const id = await saveOperation(input(), TODAY);
    const op = await db.operations.get(id);
    expect(op?.seasonId).toBe("s1");
    expect(op?.description).toBe("fungicida");
    expect(op?.doneDate).toBeNull(); // planejada não tem conclusão
    expect(op?.yieldBags).toBeNull(); // só colheita tem sacas
  });

  it("concluir pelo atalho grava a data de hoje", async () => {
    const id = await saveOperation(input(), TODAY);
    clock = 2_000;
    await completeOperation(id, TODAY);
    const op = await db.operations.get(id);
    expect(op?.status).toBe("concluida");
    expect(op?.doneDate).toBe(TODAY);
    expect(op?.updatedAt).toBe(2_000);
  });

  it("plantio concluído preenche a data de plantio vazia da safra, sem sobrescrever a que existe", async () => {
    await saveOperation(input({ kind: "plantio", status: "concluida", doneDate: "2026-11-10" }), TODAY);
    expect((await db.seasons.get("s1"))?.plantingDate).toBe("2026-11-10");
    await saveOperation(input({ plotId: "p2", kind: "plantio", status: "concluida", doneDate: "2026-11-20" }), TODAY);
    expect((await db.seasons.get("s2"))?.plantingDate).toBe("2026-11-02");
  });

  it("mudar de talhão na edição muda a safra", async () => {
    const id = await saveOperation(input(), TODAY);
    await saveOperation(input({ plotId: "p2" }), TODAY, id);
    expect((await db.operations.get(id))?.seasonId).toBe("s2");
  });
});
