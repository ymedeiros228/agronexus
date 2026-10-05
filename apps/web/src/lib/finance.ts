import { db, newBase, type Expense, type ExpenseCategory, type Sale } from "./db";
import type { SeasonStats } from "./operations";

/**
 * Financeiro da safra: vendas, despesas gerais, margem e ponto de equilíbrio.
 * Só usa o que foi lançado; sem venda, não há receita nem margem.
 */

export const EXPENSE_CATEGORIES: { key: ExpenseCategory; label: string }[] = [
  { key: "arrendamento", label: "Arrendamento" },
  { key: "mao_de_obra", label: "Mão de obra" },
  { key: "manutencao", label: "Manutenção de máquinas" },
  { key: "frete", label: "Frete e armazenagem" },
  { key: "assistencia", label: "Assistência técnica" },
  { key: "administrativo", label: "Administrativo" },
  { key: "impostos", label: "Impostos e taxas" },
  { key: "juros", label: "Juros e financiamento" },
  { key: "outro", label: "Outro" },
];

export const EXPENSE_NAME = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.key, c.label])) as Record<
  ExpenseCategory,
  string
>;

export type SeasonFinance = {
  revenue: number;
  soldBags: number;
  avgPrice: number | null;
  producedBags: number;
  /** Produzido − vendido. Null enquanto não há colheita registrada. */
  unsoldBags: number | null;
  operationsCost: number;
  expensesCost: number;
  totalCost: number;
  expensesByCategory: { category: ExpenseCategory; amount: number }[];
  /** Custo total (operações + despesas) por hectare. */
  costPerHa: number | null;
  /** Receita − custo total. Null sem venda lançada. */
  margin: number | null;
  marginPerHa: number | null;
  /** Sacas por hectare para pagar o custo, ao preço médio de venda. */
  breakEvenYield: number | null;
  /** Preço por saca para pagar o custo, com a produtividade registrada. */
  breakEvenPrice: number | null;
};

export function seasonFinance(label: string, stats: SeasonStats, sales: Sale[], expenses: Expense[]): SeasonFinance {
  const mySales = sales.filter((s) => s.seasonLabel === label);
  const myExpenses = expenses.filter((e) => e.seasonLabel === label);

  const soldBags = mySales.reduce((sum, s) => sum + s.bags, 0);
  const revenue = mySales.reduce((sum, s) => sum + s.bags * s.pricePerBag, 0);
  const avgPrice = soldBags > 0 ? revenue / soldBags : null;

  const byCategory = new Map<ExpenseCategory, number>();
  for (const e of myExpenses) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);
  const expensesCost = myExpenses.reduce((sum, e) => sum + e.amount, 0);
  const totalCost = stats.cost + expensesCost;
  const area = stats.areaHa;
  const costPerHa = totalCost > 0 && area > 0 ? totalCost / area : null;
  const margin = soldBags > 0 ? revenue - totalCost : null;

  return {
    revenue,
    soldBags,
    avgPrice,
    producedBags: stats.bags,
    unsoldBags: stats.bags > 0 ? stats.bags - soldBags : null,
    operationsCost: stats.cost,
    expensesCost,
    totalCost,
    expensesByCategory: [...byCategory.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount),
    costPerHa,
    margin,
    marginPerHa: margin != null && area > 0 ? margin / area : null,
    breakEvenYield: costPerHa != null && avgPrice ? costPerHa / avgPrice : null,
    breakEvenPrice: costPerHa != null && stats.yieldPerHa ? costPerHa / stats.yieldPerHa : null,
  };
}

export type SaleInput = Pick<Sale, "seasonLabel" | "date" | "bags" | "pricePerBag" | "buyer" | "note" | "farmId">;

export async function saveSale(input: SaleInput, id?: string): Promise<string> {
  if (!(input.bags > 0)) throw new Error("Informe quantas sacas foram vendidas.");
  if (!(input.pricePerBag > 0)) throw new Error("Informe o preço por saca.");
  const data = { ...input, buyer: input.buyer.trim(), note: input.note.trim(), farmId: input.farmId || null };
  if (id) {
    await db.sales.update(id, { ...data, updatedAt: Date.now() });
    return id;
  }
  const row: Sale = { ...newBase(), ...data };
  await db.sales.add(row);
  return row.id;
}

export type ExpenseInput = Pick<Expense, "seasonLabel" | "date" | "category" | "description" | "amount" | "farmId">;

export async function saveExpense(input: ExpenseInput, id?: string): Promise<string> {
  if (!(input.amount > 0)) throw new Error("Informe o valor da despesa.");
  const data = { ...input, description: input.description.trim(), farmId: input.farmId || null };
  if (id) {
    await db.expenses.update(id, { ...data, updatedAt: Date.now() });
    return id;
  }
  const row: Expense = { ...newBase(), ...data };
  await db.expenses.add(row);
  return row.id;
}
