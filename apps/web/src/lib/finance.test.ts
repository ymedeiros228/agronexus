import { beforeEach, describe, expect, it } from "vitest";
import { exportBackup, importBackup } from "./backup";
import { db, removeFarm, type Expense, type Sale } from "./db";
import { saveExpense, saveSale, seasonFinance } from "./finance";
import type { SeasonStats } from "./operations";

const base = (id: string) => ({ id, createdAt: 1, updatedAt: 1 });

const stats = (over: Partial<SeasonStats> = {}): SeasonStats => ({
  plots: 2,
  areaHa: 100,
  cost: 300_000,
  plannedCost: 0,
  costPerHa: 3_000,
  costByKind: [],
  harvestedHa: 100,
  bags: 6_000,
  yieldPerHa: 60,
  open: 0,
  late: 0,
  doneToday: 0,
  ...over,
});

const sale = (id: string, over: Partial<Sale>): Sale => ({
  ...base(id),
  seasonLabel: "2026/27",
  date: "2027-04-01",
  bags: 0,
  pricePerBag: 0,
  buyer: "",
  note: "",
  ...over,
});

const expense = (id: string, over: Partial<Expense>): Expense => ({
  ...base(id),
  seasonLabel: "2026/27",
  date: "2027-01-01",
  category: "arrendamento",
  description: "",
  amount: 0,
  ...over,
});

describe("financeiro da safra", () => {
  it("receita, preço médio, margem e ponto de equilíbrio só com o que foi lançado", () => {
    const f = seasonFinance(
      "2026/27",
      stats(),
      [
        sale("a", { bags: 3_000, pricePerBag: 120 }),
        sale("b", { bags: 1_000, pricePerBag: 128 }),
        sale("velha", { seasonLabel: "2025/26", bags: 9_999, pricePerBag: 1 }),
      ],
      [expense("e1", { amount: 80_000 }), expense("e2", { category: "mao_de_obra", amount: 20_000 })],
    );
    expect(f.revenue).toBe(488_000);
    expect(f.soldBags).toBe(4_000);
    expect(f.avgPrice).toBe(122);
    expect(f.unsoldBags).toBe(2_000);
    expect(f.totalCost).toBe(400_000);
    expect(f.costPerHa).toBe(4_000);
    expect(f.margin).toBe(88_000);
    expect(f.marginPerHa).toBe(880);
    expect(f.breakEvenYield).toBeCloseTo(4_000 / 122);
    expect(f.breakEvenPrice).toBeCloseTo(4_000 / 60);
    expect(f.expensesByCategory).toEqual([
      { category: "arrendamento", amount: 80_000 },
      { category: "mao_de_obra", amount: 20_000 },
    ]);
  });

  it("sem venda não inventa receita nem margem; sem colheita não há saldo de grão", () => {
    const f = seasonFinance("2026/27", stats({ bags: 0, yieldPerHa: null, harvestedHa: 0 }), [], []);
    expect(f.avgPrice).toBeNull();
    expect(f.margin).toBeNull();
    expect(f.unsoldBags).toBeNull();
    expect(f.breakEvenYield).toBeNull();
    expect(f.breakEvenPrice).toBeNull();
    expect(f.costPerHa).toBe(3_000);
  });
});

describe("vendas e despesas no banco", () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });

  it("valida, grava, edita e vai no backup", async () => {
    await expect(
      saveSale({ seasonLabel: "2026/27", date: "2027-04-01", bags: 0, pricePerBag: 120, buyer: "", note: "" }),
    ).rejects.toThrow("sacas");
    const id = await saveSale({ seasonLabel: "2026/27", date: "2027-04-01", bags: 500, pricePerBag: 120, buyer: " Trading ", note: "" });
    await saveSale({ seasonLabel: "2026/27", date: "2027-04-01", bags: 600, pricePerBag: 121, buyer: "Trading", note: "" }, id);
    expect((await db.sales.get(id))?.bags).toBe(600);
    expect((await db.sales.get(id))?.buyer).toBe("Trading");
    await saveExpense({ seasonLabel: "2026/27", date: "2027-01-01", category: "arrendamento", description: "", amount: 50_000 });

    const file = new File([await (await exportBackup()).text()], "b.json");
    await Promise.all(db.tables.map((t) => t.clear()));
    expect(await importBackup(file)).toBe(2);
  });

  it("guarda a fazenda e some junto quando a fazenda é excluída", async () => {
    await db.farms.bulkAdd([
      { ...base("f1"), name: "A", municipality: "", owner: "" },
      { ...base("f2"), name: "B", municipality: "", owner: "" },
    ]);
    const mine = await saveSale({ seasonLabel: "2026/27", date: "2027-04-01", bags: 10, pricePerBag: 100, buyer: "", note: "", farmId: "f1" });
    const other = await saveExpense({ seasonLabel: "2026/27", date: "2027-01-01", category: "frete", description: "", amount: 10, farmId: "f2" });
    const account = await saveExpense({ seasonLabel: "2026/27", date: "2027-01-01", category: "juros", description: "", amount: 10, farmId: "" });
    expect((await db.expenses.get(account))?.farmId).toBeNull();

    await removeFarm("f1");
    expect((await db.sales.get(mine))?.deletedAt).toBeTruthy();
    expect((await db.expenses.get(other))?.deletedAt).toBeFalsy();
    expect((await db.expenses.get(account))?.deletedAt).toBeFalsy();
  });
});
