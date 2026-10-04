import {
  alive,
  db,
  newBase,
  type Operation,
  type StockMove,
  type Supply,
  type SupplyCategory,
} from "./db";
import { formatNumberBR } from "./operations";

/**
 * Insumos e estoque (tela 9). O saldo sai só do que foi registrado:
 * entradas, usos em operações concluídas e ajustes de contagem.
 */

export const SUPPLY_CATEGORIES: { key: SupplyCategory; label: string }[] = [
  { key: "semente", label: "Semente" },
  { key: "fertilizante", label: "Fertilizante" },
  { key: "corretivo", label: "Corretivo de solo" },
  { key: "herbicida", label: "Herbicida" },
  { key: "inseticida", label: "Inseticida" },
  { key: "fungicida", label: "Fungicida" },
  { key: "adjuvante", label: "Adjuvante / óleo" },
  { key: "biologico", label: "Inoculante / biológico" },
  { key: "combustivel", label: "Combustível" },
  { key: "outro", label: "Outro" },
];

export const CATEGORY_NAME = Object.fromEntries(SUPPLY_CATEGORIES.map((c) => [c.key, c.label])) as Record<
  SupplyCategory,
  string
>;

export const UNITS: { key: string; label: string }[] = [
  { key: "L", label: "litro (L)" },
  { key: "kg", label: "quilo (kg)" },
  { key: "sc", label: "saco (sc)" },
  { key: "t", label: "tonelada (t)" },
  { key: "un", label: "unidade (un)" },
  { key: "mL", label: "mililitro (mL)" },
  { key: "g", label: "grama (g)" },
];

export function formatQty(n: number, unit: string): string {
  return `${formatNumberBR(n, 2)} ${unit}`;
}

/** Quantidade com sinal, para o histórico: +200 L, −60 L. */
export function formatSignedQty(n: number, unit: string): string {
  return `${n < 0 ? "−" : "+"}${formatNumberBR(Math.abs(n), 2)} ${unit}`;
}

export type SupplyStock = {
  supply: Supply;
  /** Entradas − usos em operações concluídas ± ajustes. */
  balance: number;
  /** Quanto as operações planejadas ou em andamento vão usar. */
  planned: number;
  /** R$ por unidade: valor pago nas entradas ÷ quantidade dessas entradas. Null sem preço anotado. */
  avgCost: number | null;
  /** Valor do saldo pelo preço médio. Null sem preço ou com saldo zero/negativo. */
  value: number | null;
  /** Saldo no mínimo definido pelo usuário ou abaixo dele. */
  low: boolean;
  /** O saldo não cobre o que as operações abertas vão usar. */
  short: boolean;
  /** Último movimento (data AAAA-MM-DD), para ordenar e mostrar. */
  lastDate: string | null;
};

/** Data efetiva de um movimento: o uso segue a data da operação. */
export function moveDate(m: StockMove, op?: Operation): string {
  if (m.kind === "uso" && op) return op.status === "concluida" ? (op.doneDate ?? op.date) : op.date;
  return m.date;
}

/**
 * Saldo de cada insumo. `operations` deve ter só as operações vivas:
 * uso de operação removida não conta.
 */
export function stockOf(supplies: Supply[], moves: StockMove[], operations: Operation[]): SupplyStock[] {
  const opById = new Map(operations.map((o) => [o.id, o]));
  const acc = new Map<string, { balance: number; planned: number; paidQty: number; paid: number; lastDate: string | null }>();
  for (const s of supplies) acc.set(s.id, { balance: 0, planned: 0, paidQty: 0, paid: 0, lastDate: null });

  for (const m of moves) {
    const a = acc.get(m.supplyId);
    if (!a) continue;
    let date: string | null = m.date;
    if (m.kind === "entrada") {
      a.balance += m.qty;
      if (m.cost != null && m.qty > 0) {
        a.paid += m.cost;
        a.paidQty += m.qty;
      }
    } else if (m.kind === "ajuste") {
      a.balance += m.qty;
    } else {
      const op = m.operationId ? opById.get(m.operationId) : undefined;
      if (!op) continue;
      if (op.status === "concluida") a.balance -= m.qty;
      else a.planned += m.qty;
      date = moveDate(m, op);
    }
    if (date && (!a.lastDate || date > a.lastDate)) a.lastDate = date;
  }

  return supplies.map((supply) => {
    const a = acc.get(supply.id)!;
    // Arredonda para não mostrar 0,0000001 depois de somas com vírgula.
    const balance = Math.round(a.balance * 1000) / 1000;
    const avgCost = a.paidQty > 0 ? a.paid / a.paidQty : null;
    return {
      supply,
      balance,
      planned: a.planned,
      avgCost,
      value: avgCost != null && balance > 0 ? balance * avgCost : null,
      low: supply.minQty != null && balance <= supply.minQty,
      short: a.planned > 0 && balance - a.planned < 0,
      lastDate: a.lastDate,
    };
  });
}

export type StockAlert = {
  kind: "stock-short" | "stock-negative" | "stock-low";
  title: string;
  text: string;
  href: string;
  weight: number;
};

/** Avisos de estoque para o painel. */
export function stockAlerts(stock: SupplyStock[]): StockAlert[] {
  const out: StockAlert[] = [];
  for (const s of stock) {
    const { supply, balance, planned } = s;
    const href = `/insumo?id=${supply.id}`;
    if (s.short) {
      out.push({
        kind: "stock-short",
        title: supply.name,
        text: `Vai faltar ${formatQty(planned - balance, supply.unit)} para as operações planejadas`,
        href,
        weight: 950,
      });
    } else if (balance < 0) {
      out.push({
        kind: "stock-negative",
        title: supply.name,
        text: `Saldo negativo (${formatQty(balance, supply.unit)}): falta registrar entrada`,
        href,
        weight: 700,
      });
    } else if (s.low) {
      out.push({
        kind: "stock-low",
        title: supply.name,
        text: `Estoque baixo: ${formatQty(balance, supply.unit)} (mínimo ${formatQty(supply.minQty!, supply.unit)})`,
        href,
        weight: 300,
      });
    }
  }
  return out;
}

export type Use = { name: string; qty: number; unit: string; supplyId: string };

/** Insumos usados em cada operação. */
export function usesByOperation(moves: StockMove[], supplies: Supply[]): Map<string, Use[]> {
  const supplyById = new Map(supplies.map((s) => [s.id, s]));
  const out = new Map<string, Use[]>();
  for (const m of moves) {
    if (m.kind !== "uso" || !m.operationId) continue;
    const s = supplyById.get(m.supplyId);
    if (!s) continue;
    out.set(m.operationId, [...(out.get(m.operationId) ?? []), { name: s.name, qty: m.qty, unit: s.unit, supplyId: s.id }]);
  }
  return out;
}

export type SupplyInput = Pick<Supply, "name" | "category" | "unit" | "minQty" | "notes">;

export async function saveSupply(input: SupplyInput, id?: string): Promise<string> {
  const data: SupplyInput = { ...input, name: input.name.trim(), notes: input.notes.trim() };
  if (!data.name) throw new Error("Informe o nome do insumo.");
  if (id) {
    await db.supplies.update(id, { ...data, updatedAt: Date.now() });
    return id;
  }
  const row: Supply = { ...newBase(), ...data };
  await db.supplies.add(row);
  return row.id;
}

export type EntryInput = { supplyId: string; date: string; qty: number; cost: number | null; note: string };

/** Entrada (compra/recebimento). Com `id`, edita uma entrada existente. */
export async function saveEntry(input: EntryInput, id?: string): Promise<string> {
  if (!(input.qty > 0)) throw new Error("A quantidade precisa ser maior que zero.");
  const data = { ...input, note: input.note.trim() };
  if (id) {
    const old = await db.stockMoves.get(id);
    if (!old || old.deletedAt || old.kind !== "entrada") throw new Error("Entrada não encontrada.");
    await db.stockMoves.update(id, { ...data, updatedAt: Date.now() });
    return id;
  }
  const row: StockMove = { ...newBase(), ...data, kind: "entrada", operationId: null };
  await db.stockMoves.add(row);
  return row.id;
}

/**
 * Contagem de estoque: grava a diferença entre o contado e o saldo do app.
 * Devolve null se não havia diferença.
 */
export async function saveCount(
  supplyId: string,
  counted: number,
  currentBalance: number,
  date: string,
  note: string,
): Promise<string | null> {
  const diff = Math.round((counted - currentBalance) * 1000) / 1000;
  if (diff === 0) return null;
  const row: StockMove = {
    ...newBase(),
    supplyId,
    kind: "ajuste",
    qty: diff,
    date,
    cost: null,
    operationId: null,
    note: note.trim(),
  };
  await db.stockMoves.add(row);
  return row.id;
}

/** Saldo atual de um insumo, direto do banco. */
export async function currentStock(supplyId: string): Promise<SupplyStock | undefined> {
  const [supply, moves, ops] = await Promise.all([
    db.supplies.get(supplyId),
    db.stockMoves.where("supplyId").equals(supplyId).toArray(),
    db.operations.toArray(),
  ]);
  if (!supply || supply.deletedAt) return undefined;
  return stockOf([supply], alive(moves), alive(ops))[0];
}
