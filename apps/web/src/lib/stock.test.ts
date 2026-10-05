import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportBackup, importBackup } from "./backup";
import { alive, db, newBase, removeOperation, removePlot, removeSupply, type Operation, type StockMove, type Supply } from "./db";
import { completeOperation, saveOperation, type OperationInput } from "./operations";
import { currentStock, saveCount, saveEntry, saveSupply, stockAlerts, stockOf, usesByOperation } from "./stock";

const base = (id: string) => ({ id, createdAt: 1, updatedAt: 1 });
const TODAY = "2027-01-15";

const supply = (id: string, over: Partial<Supply> = {}): Supply => ({
  ...base(id),
  name: id.toUpperCase(),
  category: "fungicida",
  unit: "L",
  minQty: null,
  notes: "",
  ...over,
});

const move = (id: string, over: Partial<StockMove>): StockMove => ({
  ...base(id),
  supplyId: "fung",
  kind: "entrada",
  qty: 0,
  date: "2027-01-01",
  cost: null,
  operationId: null,
  note: "",
  ...over,
});

const op = (id: string, over: Partial<Operation> = {}): Operation => ({
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

describe("saldo do estoque", () => {
  const supplies = [supply("fung", { minQty: 50 }), supply("oleo", { unit: "L" })];
  const ops = [op("feita"), op("prevista", { status: "planejada", date: "2027-02-01", doneDate: null })];
  const moves = [
    move("e1", { qty: 200, cost: 20_000 }), // R$ 100/L
    move("e2", { qty: 100, cost: 13_000 }), // R$ 130/L → média 110
    move("e3", { qty: 50 }), // sem preço: entra no saldo, não na média
    move("u1", { kind: "uso", qty: 120, operationId: "feita" }),
    move("u2", { kind: "uso", qty: 90, operationId: "prevista" }),
    move("u3", { kind: "uso", qty: 999, operationId: "removida" }),
    move("a1", { kind: "ajuste", qty: -5 }),
  ];

  it("entradas − usos em operação concluída ± ajustes; uso de operação aberta é previsto", () => {
    const [fung] = stockOf(supplies, moves, ops);
    expect(fung.balance).toBe(225); // 200 + 100 + 50 − 120 − 5
    expect(fung.planned).toBe(90);
    expect(fung.avgCost).toBe(110);
    expect(fung.value).toBe(225 * 110);
    expect(fung.low).toBe(false);
    expect(fung.short).toBe(false);
  });

  it("sem preço nas entradas não inventa valor", () => {
    const [, oleo] = stockOf(supplies, [move("x", { supplyId: "oleo", qty: 30 })], ops);
    expect(oleo.balance).toBe(30);
    expect(oleo.avgCost).toBeNull();
    expect(oleo.value).toBeNull();
  });

  it("avisa quando vai faltar, quando o saldo fica negativo e quando chega no mínimo", () => {
    const stock = stockOf(
      [supply("fung", { minQty: 50 }), supply("oleo"), supply("herb", { unit: "L", minQty: 40 })],
      [
        move("1", { qty: 60 }),
        move("2", { kind: "uso", qty: 100, operationId: "prevista" }),
        move("3", { supplyId: "oleo", kind: "uso", qty: 10, operationId: "feita" }),
        move("4", { supplyId: "herb", qty: 40 }),
      ],
      ops,
    );
    expect(stockAlerts(stock).map((a) => [a.kind, a.text])).toEqual([
      ["stock-short", "Vai faltar 40 L para as operações planejadas"],
      ["stock-negative", "Saldo negativo (-10 L): falta registrar entrada"],
      ["stock-low", "Estoque baixo: 40 L (mínimo 40 L)"],
    ]);
  });

  it("lista os insumos de cada operação", () => {
    const uses = usesByOperation(moves, supplies);
    expect(uses.get("feita")).toEqual([{ name: "FUNG", qty: 120, unit: "L", supplyId: "fung" }]);
    expect(uses.has("removida")).toBe(true); // o filtro de operação viva é de quem chama
  });
});

describe("estoque no banco", () => {
  let clock = 1_000;
  beforeEach(async () => {
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    clock = 1_000;
    await Promise.all(db.tables.map((t) => t.clear()));
    await db.plots.add({ ...newBase(), id: "p1", farmId: "f1", name: "T-1", areaHa: 100 });
    await db.seasons.add({ ...newBase(), id: "s1", plotId: "p1", label: "2026/27", cultivar: "", plantingDate: null });
  });
  afterEach(() => vi.restoreAllMocks());

  const input = (over: Partial<OperationInput> = {}): OperationInput => ({
    farmId: "f1",
    plotId: "p1",
    kind: "aplicacao",
    status: "planejada",
    date: "2027-01-20",
    doneDate: null,
    areaHa: 100,
    description: "",
    cost: null,
    yieldBags: null,
    ...over,
  });

  it("operação grava os insumos; só baixa do estoque quando é concluída", async () => {
    const fung = await saveSupply({ name: " Fungicida X ", category: "fungicida", unit: "L", minQty: null, notes: "" });
    expect((await db.supplies.get(fung))?.name).toBe("Fungicida X");
    await saveEntry({ supplyId: fung, date: "2027-01-02", qty: 200, cost: 20_000, note: "NF 123" });

    const id = await saveOperation(input(), TODAY, undefined, [{ supplyId: fung, qty: 60 }]);
    let s = await currentStock(fung);
    expect([s?.balance, s?.planned]).toEqual([200, 60]);

    await completeOperation(id, TODAY);
    s = await currentStock(fung);
    expect([s?.balance, s?.planned]).toEqual([140, 0]);
    const uses = alive(await db.stockMoves.where("operationId").equals(id).toArray());
    expect(uses.map((m) => m.date)).toEqual([TODAY]); // acompanha a data de conclusão
  });

  it("editar a operação ajusta, remove e acrescenta usos sem duplicar", async () => {
    const a = await saveSupply({ name: "A", category: "herbicida", unit: "L", minQty: null, notes: "" });
    const b = await saveSupply({ name: "B", category: "adjuvante", unit: "L", minQty: null, notes: "" });
    const c = await saveSupply({ name: "C", category: "inseticida", unit: "L", minQty: null, notes: "" });
    const id = await saveOperation(input({ status: "concluida", doneDate: "2027-01-10" }), TODAY, undefined, [
      { supplyId: a, qty: 10 },
      { supplyId: b, qty: 5 },
    ]);
    const [ma] = alive(await db.stockMoves.where("supplyId").equals(a).toArray());

    clock = 2_000;
    await saveOperation(input({ status: "concluida", doneDate: "2027-01-10" }), TODAY, id, [
      { moveId: ma.id, supplyId: a, qty: 12 },
      { supplyId: c, qty: 3 },
    ]);
    const uses = alive(await db.stockMoves.where("operationId").equals(id).toArray());
    expect(uses.map((m) => [m.supplyId, m.qty])).toHaveLength(2);
    expect(uses.map((m) => [m.supplyId, m.qty])).toEqual(
      expect.arrayContaining([
        [a, 12],
        [c, 3],
      ]),
    );
    expect(uses.find((m) => m.supplyId === a)?.id).toBe(ma.id);
    expect((await currentStock(b))?.balance).toBe(0); // uso removido devolve ao saldo
  });

  it("remover operação ou talhão tira os usos; insumo usado não pode ser excluído", async () => {
    const a = await saveSupply({ name: "A", category: "herbicida", unit: "L", minQty: null, notes: "" });
    await saveEntry({ supplyId: a, date: "2027-01-02", qty: 50, cost: null, note: "" });
    const id = await saveOperation(input({ status: "concluida", doneDate: "2027-01-10" }), TODAY, undefined, [
      { supplyId: a, qty: 20 },
    ]);
    expect(await removeSupply(a)).toEqual({ ok: false, usedIn: 1 });

    await removeOperation(id);
    expect((await currentStock(a))?.balance).toBe(50);
    expect(alive(await db.stockMoves.where("operationId").equals(id).toArray())).toEqual([]);

    const id2 = await saveOperation(input({ status: "concluida", doneDate: "2027-01-11" }), TODAY, undefined, [
      { supplyId: a, qty: 5 },
    ]);
    await removePlot("p1");
    expect(alive(await db.stockMoves.where("operationId").equals(id2).toArray())).toEqual([]);

    expect(await removeSupply(a)).toMatchObject({ ok: true });
    expect(alive(await db.stockMoves.where("supplyId").equals(a).toArray())).toEqual([]);
  });

  it("contagem grava só a diferença", async () => {
    const a = await saveSupply({ name: "A", category: "semente", unit: "sc", minQty: null, notes: "" });
    await saveEntry({ supplyId: a, date: "2027-01-02", qty: 100, cost: null, note: "" });
    expect(await saveCount(a, 100, 100, TODAY, "")).toBeNull();
    await saveCount(a, 97, 100, TODAY, "3 sacos rasgados");
    expect((await currentStock(a))?.balance).toBe(97);
  });

  it("entrada recusa quantidade zero", async () => {
    await expect(saveEntry({ supplyId: "x", date: TODAY, qty: 0, cost: null, note: "" })).rejects.toThrow("maior que zero");
  });

  it("backup leva insumos e movimentos", async () => {
    const a = await saveSupply({ name: "A", category: "semente", unit: "sc", minQty: 10, notes: "" });
    await saveEntry({ supplyId: a, date: "2027-01-02", qty: 100, cost: 50_000, note: "" });
    const file = new File([await (await exportBackup()).text()], "b.json");
    await Promise.all(db.tables.map((t) => t.clear()));
    expect(await importBackup(file)).toBe(4); // talhão, safra, insumo, entrada
    expect((await db.supplies.get(a))?.minQty).toBe(10);
  });
});
