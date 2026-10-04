import { alive, db, newBase, type Operation, type OperationKind, type OperationStatus, type Plot, type Season } from "./db";
import { latestSeason } from "./season";

export const OPERATION_KINDS: { kind: OperationKind; label: string; hint: string }[] = [
  { kind: "preparo", label: "Preparo", hint: "Ex.: dessecação, gradagem, calagem" },
  { kind: "plantio", label: "Plantio", hint: "Ex.: cultivar, população, espaçamento" },
  { kind: "adubacao", label: "Adubação", hint: "Ex.: adubo e dose usados" },
  { kind: "aplicacao", label: "Aplicação", hint: "Ex.: produto, dose e alvo, como foi feito" },
  { kind: "colheita", label: "Colheita", hint: "Ex.: umidade, perdas, observações" },
  { kind: "outro", label: "Outro", hint: "Descreva o que foi feito" },
];

export const KIND_NAME: Record<OperationKind, string> = Object.fromEntries(
  OPERATION_KINDS.map((k) => [k.kind, k.label]),
) as Record<OperationKind, string>;

export const STATUS_NAME: Record<OperationStatus, string> = {
  planejada: "Planejada",
  andamento: "Em andamento",
  concluida: "Concluída",
};

/** Saca de soja: 60 kg. */
export const BAG_KG = 60;

/**
 * Aceita "1.234,5", "1234,5", "15.000" (milhar) e "12.5". Vazio ou inválido vira null.
 * Sem vírgula, ponto seguido de grupos de 3 dígitos é separador de milhar, como se escreve no Brasil.
 */
export function parseNumberBR(text: string): number | null {
  const s = text.trim().replace(/\s/g, "").replace(/^R\$/i, "");
  if (!s) return null;
  const normalized = s.includes(",")
    ? s.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(\.\d{3})+$/.test(s)
      ? s.replace(/\./g, "")
      : s;
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function formatNumberBR(n: number | null | undefined, digits = 1): string {
  return n == null ? "" : n.toLocaleString("pt-BR", { maximumFractionDigits: digits });
}

export function formatBRL(n: number, digits = 0): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: digits });
}

/** Planejada com data já passada. */
export function isLate(op: Pick<Operation, "status" | "date">, today: string): boolean {
  return op.status === "planejada" && op.date < today;
}

export type OperationInput = Pick<
  Operation,
  "farmId" | "plotId" | "kind" | "status" | "date" | "doneDate" | "areaHa" | "description" | "cost" | "yieldBags"
>;

function clean(input: OperationInput, today: string): OperationInput {
  const status = input.status;
  return {
    ...input,
    description: input.description.trim(),
    doneDate: status === "concluida" ? input.doneDate || today : null,
    yieldBags: input.kind === "colheita" ? input.yieldBags : null,
  };
}

async function seasonFor(plotId: string): Promise<Season | undefined> {
  return latestSeason(alive(await db.seasons.where("plotId").equals(plotId).toArray()));
}

/** Plantio concluído preenche a data de plantio da safra, se ela estiver vazia. */
async function fillPlantingDate(op: OperationInput, seasonId: string | null) {
  if (op.kind !== "plantio" || op.status !== "concluida" || !seasonId) return;
  const season = await db.seasons.get(seasonId);
  if (season && !season.plantingDate) {
    await db.seasons.update(seasonId, { plantingDate: op.doneDate ?? op.date, updatedAt: Date.now() });
  }
}

/** Insumo usado na operação. `moveId` vem preenchido quando o uso já existia (edição). */
export type UseInput = { moveId?: string; supplyId: string; qty: number };

/**
 * Grava os usos de insumo da operação (diferença com o que já existia).
 * Sem `uses`, só acompanha a data da operação.
 */
async function syncUses(opId: string, date: string, uses: UseInput[] | undefined) {
  const existing = alive(await db.stockMoves.where("operationId").equals(opId).toArray()).filter((m) => m.kind === "uso");
  const now = Date.now();
  if (!uses) {
    for (const m of existing) if (m.date !== date) await db.stockMoves.update(m.id, { date, updatedAt: now });
    return;
  }
  const valid = uses.filter((u) => u.supplyId && u.qty > 0);
  const keep = new Set(valid.map((u) => u.moveId).filter(Boolean));
  for (const m of existing) if (!keep.has(m.id)) await db.stockMoves.update(m.id, { deletedAt: now, updatedAt: now });
  for (const u of valid) {
    const old = u.moveId ? existing.find((m) => m.id === u.moveId) : undefined;
    if (old) {
      if (old.qty !== u.qty || old.supplyId !== u.supplyId || old.date !== date) {
        await db.stockMoves.update(old.id, { qty: u.qty, supplyId: u.supplyId, date, updatedAt: now });
      }
    } else {
      await db.stockMoves.add({
        ...newBase(),
        supplyId: u.supplyId,
        kind: "uso",
        qty: u.qty,
        date,
        cost: null,
        operationId: opId,
        note: "",
      });
    }
  }
}

export async function saveOperation(input: OperationInput, today: string, id?: string, uses?: UseInput[]): Promise<string> {
  const data = clean(input, today);
  const effectiveDate = data.doneDate ?? data.date;
  if (!id) {
    const op: Operation = { ...newBase(), ...data, seasonId: (await seasonFor(data.plotId))?.id ?? null };
    await db.transaction("rw", [db.operations, db.seasons, db.stockMoves], async () => {
      await db.operations.add(op);
      await fillPlantingDate(data, op.seasonId);
      await syncUses(op.id, effectiveDate, uses);
    });
    return op.id;
  }
  const moved = await seasonFor(data.plotId);
  await db.transaction("rw", [db.operations, db.seasons, db.stockMoves], async () => {
    const old = await db.operations.get(id);
    if (!old || old.deletedAt) throw new Error("Operação não encontrada.");
    const seasonId = old.plotId === data.plotId ? old.seasonId : (moved?.id ?? null);
    await db.operations.update(id, { ...data, seasonId, updatedAt: Date.now() });
    await fillPlantingDate(data, seasonId);
    await syncUses(id, effectiveDate, uses);
  });
  return id;
}

export function operationInput(op: Operation): OperationInput {
  const { farmId, plotId, kind, status, date, doneDate, areaHa, description, cost, yieldBags } = op;
  return { farmId, plotId, kind, status, date, doneDate, areaHa, description, cost, yieldBags };
}

export async function completeOperation(id: string, today: string) {
  const op = await db.operations.get(id);
  if (!op || op.deletedAt) return;
  await saveOperation({ ...operationInput(op), status: "concluida", doneDate: today }, today, id);
}

/** Custo já gasto: operação concluída ou em andamento. Planejada é previsão, não gasto. */
export function isSpent(op: Pick<Operation, "status">): boolean {
  return op.status !== "planejada";
}

export type SeasonStats = {
  /** Talhões que têm safra com este rótulo e a soma da área deles. */
  plots: number;
  areaHa: number;
  /** Custo realizado (operações concluídas ou em andamento). */
  cost: number;
  /** Custo anotado em operações planejadas. */
  plannedCost: number;
  costPerHa: number | null;
  costByKind: { kind: OperationKind; cost: number }[];
  harvestedHa: number;
  bags: number;
  yieldPerHa: number | null;
  open: number;
  late: number;
  doneToday: number;
};

/**
 * Números da safra para o painel. Só usa o que foi registrado:
 * sem custo anotado, não há custo por hectare; sem colheita, não há produtividade.
 */
export function seasonStats(
  label: string,
  seasons: Season[],
  plots: Plot[],
  operations: Operation[],
  today: string,
): SeasonStats {
  const seasonIds = new Set(seasons.filter((s) => s.label === label).map((s) => s.id));
  const plotIds = new Set(seasons.filter((s) => seasonIds.has(s.id)).map((s) => s.plotId));
  const areaHa = plots.filter((p) => plotIds.has(p.id)).reduce((sum, p) => sum + (p.areaHa ?? 0), 0);
  const ops = operations.filter((o) => o.seasonId && seasonIds.has(o.seasonId));

  const byKind = new Map<OperationKind, number>();
  let cost = 0;
  let plannedCost = 0;
  for (const o of ops) {
    if (o.cost == null) continue;
    if (!isSpent(o)) {
      plannedCost += o.cost;
      continue;
    }
    cost += o.cost;
    byKind.set(o.kind, (byKind.get(o.kind) ?? 0) + o.cost);
  }

  const harvests = ops.filter((o) => o.kind === "colheita" && o.status === "concluida" && o.yieldBags != null && o.areaHa);
  const harvestedHa = harvests.reduce((s, o) => s + (o.areaHa ?? 0), 0);
  const bags = harvests.reduce((s, o) => s + (o.yieldBags ?? 0), 0);

  return {
    plots: plotIds.size,
    areaHa,
    cost,
    plannedCost,
    costPerHa: cost > 0 && areaHa > 0 ? cost / areaHa : null,
    costByKind: [...byKind.entries()].map(([kind, c]) => ({ kind, cost: c })).sort((a, b) => b.cost - a.cost),
    harvestedHa,
    bags,
    yieldPerHa: harvestedHa > 0 ? bags / harvestedHa : null,
    open: ops.filter((o) => o.status !== "concluida").length,
    late: ops.filter((o) => isLate(o, today)).length,
    doneToday: ops.filter((o) => o.status === "concluida" && o.doneDate === today).length,
  };
}

/** Produtividade de cada talhão na safra, a partir das colheitas concluídas. */
export function yieldByPlot(
  label: string,
  seasons: Season[],
  operations: Operation[],
): { plotId: string; bags: number; areaHa: number; perHa: number }[] {
  const seasonIds = new Set(seasons.filter((s) => s.label === label).map((s) => s.id));
  const acc = new Map<string, { bags: number; areaHa: number }>();
  for (const o of operations) {
    if (o.kind !== "colheita" || o.status !== "concluida" || o.yieldBags == null || !o.areaHa) continue;
    if (!o.seasonId || !seasonIds.has(o.seasonId)) continue;
    const cur = acc.get(o.plotId) ?? { bags: 0, areaHa: 0 };
    acc.set(o.plotId, { bags: cur.bags + o.yieldBags, areaHa: cur.areaHa + o.areaHa });
  }
  return [...acc.entries()]
    .map(([plotId, v]) => ({ plotId, ...v, perHa: v.bags / v.areaHa }))
    .sort((a, b) => b.perHa - a.perHa);
}

/** Safras existentes, da mais recente para a mais antiga (pelo rótulo "2026/27"). */
export function seasonLabels(seasons: Season[]): string[] {
  return [...new Set(seasons.map((s) => s.label))].sort((a, b) => b.localeCompare(a, "pt-BR", { numeric: true }));
}
