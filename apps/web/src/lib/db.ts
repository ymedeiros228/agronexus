import Dexie, { type EntityTable } from "dexie";
import type { LngLat } from "./geo";
import { normalizeSeasonLabel } from "./season";

/**
 * Armazenamento local-first (ADR 0004).
 * Todo registro tem UUID gerado no cliente, para a sincronização futura ser idempotente.
 * `deletedAt` marca exclusão lógica; nada é apagado de verdade.
 */

type Base = {
  id: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
  /** 1 = mudou neste aparelho e ainda não subiu para a nuvem. Posto pelos ganchos do banco (`markPendingOnWrite`). */
  _pendente?: 0 | 1;
  /** `servidor_em` da última versão que veio ou foi aceita pela nuvem. Só a sincronização grava. */
  _sync?: string;
};

/** Cliente da carteira do engenheiro: o produtor dono de uma ou mais fazendas. */
export type Client = Base & {
  name: string;
  phone: string;
  municipality: string;
  notes: string;
};

export type Farm = Base & {
  name: string;
  municipality: string;
  /** Nome do produtor. Repete o nome do cliente, para backups e planilhas antigos. */
  owner: string;
  /** Cliente da carteira. Ausente em fazendas de antes da v7 sem produtor informado. */
  clientId?: string | null;
};

export type Plot = Base & {
  farmId: string;
  name: string;
  areaHa: number | null;
  /** Contorno [longitude, latitude], gravado pelo GPS ou importado de KML/GeoJSON. */
  boundary?: LngLat[] | null;
};

export type Season = Base & {
  plotId: string;
  label: string; // ex.: "2026/27"
  cultivar: string;
  plantingDate: string | null; // AAAA-MM-DD
};

/** Quem registrou a visita: cópia do perfil no dia, para o relatório não mudar depois. */
export type VisitAuthor = {
  name: string;
  role: string;
  registry: string;
  company: string;
  phone: string;
  supervisorName: string;
  supervisorRegistry: string;
};

export type Visit = Base & {
  farmId: string;
  plotId: string;
  /** Safra do talhão no dia da visita. Ausente em visitas de backups antigos. */
  seasonId?: string | null;
  date: string; // AAAA-MM-DD
  stage: string;
  observations: string;
  recommendation: string;
  followUpDate: string | null;
  followUpDone: boolean;
  /** Ausente em visitas de antes da v7: o relatório usa o perfil atual. */
  author?: VisitAuthor | null;
};

export type FindingKind = "praga" | "doenca" | "daninha" | "outro";

export type Finding = Base & {
  visitId: string;
  kind: FindingKind;
  name: string;
  amount: string; // texto livre com a medida, ex.: "2 por pano"
  note: string;
};

export type Photo = Base & {
  visitId: string;
  blob: Blob;
  /** Diagnóstico confirmado pelo técnico. Base para treinar IA no futuro (ADR 0005). */
  label: string;
  takenAt: number;
  lat: number | null;
  lng: number | null;
};

export type Rainfall = Base & {
  farmId: string;
  date: string; // AAAA-MM-DD
  mm: number;
};

export type OperationKind = "preparo" | "plantio" | "adubacao" | "aplicacao" | "colheita" | "outro";
export type OperationStatus = "planejada" | "andamento" | "concluida";

/** Operação agrícola feita (ou planejada) pelo produtor num talhão. Registro dele, não recomendação do app. */
export type Operation = Base & {
  farmId: string;
  plotId: string;
  seasonId: string | null;
  kind: OperationKind;
  status: OperationStatus;
  date: string; // AAAA-MM-DD: data prevista ou de início
  doneDate: string | null; // quando foi concluída
  areaHa: number | null; // área trabalhada
  description: string; // o que foi feito / produto usado, como o produtor anotou
  cost: number | null; // custo total em R$ (insumo + serviço)
  yieldBags: number | null; // só colheita: sacas de 60 kg colhidas
};

export type SupplyCategory =
  | "semente"
  | "fertilizante"
  | "corretivo"
  | "herbicida"
  | "inseticida"
  | "fungicida"
  | "adjuvante"
  | "biologico"
  | "combustivel"
  | "outro";

/** Insumo do estoque, com o nome que o produtor usa. O app não sugere produto. */
export type Supply = Base & {
  name: string;
  category: SupplyCategory;
  unit: string; // "kg", "L", "sc", "t", "un", "g", "mL"
  minQty: number | null; // estoque mínimo definido pelo usuário (aviso no painel)
  notes: string;
};

/**
 * Movimento de estoque.
 * - entrada: compra/recebimento; `cost` é o valor total pago.
 * - uso: insumo de uma operação; só baixa do saldo quando a operação está concluída.
 * - ajuste: diferença achada na contagem (pode ser negativa).
 */
export type StockMoveKind = "entrada" | "uso" | "ajuste";

export type StockMove = Base & {
  supplyId: string;
  kind: StockMoveKind;
  qty: number;
  date: string; // AAAA-MM-DD
  cost: number | null;
  operationId: string | null;
  note: string; // fornecedor, nota fiscal, motivo do ajuste
};

/** Venda de grão da safra (rótulo "2026/27"), como o produtor fechou. */
export type Sale = Base & {
  seasonLabel: string;
  date: string; // AAAA-MM-DD
  bags: number; // sacas de 60 kg
  pricePerBag: number; // R$ líquido por saca
  buyer: string;
  note: string;
  /** Fazenda de onde saiu o grão. Null/ausente = da conta toda. */
  farmId?: string | null;
};

export type ExpenseCategory =
  | "arrendamento"
  | "mao_de_obra"
  | "manutencao"
  | "frete"
  | "assistencia"
  | "administrativo"
  | "impostos"
  | "juros"
  | "outro";

/** Despesa da safra que não é de uma operação (arrendamento, salários, manutenção...). */
export type Expense = Base & {
  seasonLabel: string;
  date: string; // AAAA-MM-DD
  category: ExpenseCategory;
  description: string;
  amount: number; // R$
  /** Fazenda da despesa. Null/ausente = da conta toda (não entra no relatório de uma fazenda só). */
  farmId?: string | null;
};

/** Configurações deste aparelho (não vão para o backup). */
export type Meta = { key: string; value: unknown };

class AgroDB extends Dexie {
  farms!: EntityTable<Farm, "id">;
  plots!: EntityTable<Plot, "id">;
  seasons!: EntityTable<Season, "id">;
  visits!: EntityTable<Visit, "id">;
  findings!: EntityTable<Finding, "id">;
  photos!: EntityTable<Photo, "id">;
  rainfall!: EntityTable<Rainfall, "id">;
  operations!: EntityTable<Operation, "id">;
  supplies!: EntityTable<Supply, "id">;
  stockMoves!: EntityTable<StockMove, "id">;
  sales!: EntityTable<Sale, "id">;
  expenses!: EntityTable<Expense, "id">;
  clients!: EntityTable<Client, "id">;
  meta!: EntityTable<Meta, "key">;

  constructor() {
    super("agronexus");
    this.version(1).stores({
      farms: "id, name, updatedAt",
      plots: "id, farmId, updatedAt",
      seasons: "id, plotId, updatedAt",
      visits: "id, farmId, plotId, date, updatedAt",
      findings: "id, visitId, updatedAt",
      photos: "id, visitId, updatedAt",
      rainfall: "id, farmId, date, updatedAt",
    });
    // v2: visita guarda a safra; tabela meta para configurações locais.
    this.version(2)
      .stores({
        visits: "id, farmId, plotId, seasonId, date, updatedAt",
        meta: "key",
      })
      .upgrade(async (tx) => {
        const latest = new Map<string, Season>();
        for (const s of (await tx.table<Season>("seasons").toArray()).filter((r) => !r.deletedAt)) {
          const cur = latest.get(s.plotId);
          if (!cur || s.createdAt > cur.createdAt) latest.set(s.plotId, s);
        }
        // Migração não é edição do usuário: updatedAt fica como estava.
        await tx
          .table<Visit>("visits")
          .toCollection()
          .modify((v) => {
            if (v.seasonId === undefined) v.seasonId = latest.get(v.plotId)?.id ?? null;
          });
      });
    // v3: operações agrícolas.
    this.version(3).stores({
      operations: "id, farmId, plotId, seasonId, date, status, updatedAt",
    });
    // v4: insumos e movimentos de estoque.
    this.version(4).stores({
      supplies: "id, name, category, updatedAt",
      stockMoves: "id, supplyId, operationId, date, updatedAt",
    });
    // v5: vendas e despesas gerais da safra.
    this.version(5).stores({
      sales: "id, seasonLabel, date, updatedAt",
      expenses: "id, seasonLabel, date, updatedAt",
    });
    // v6: rótulo da safra padronizado ("2026/2027" e "26/27" viram "2026/27").
    // Rótulo que não é par de anos fica como está. updatedAt não muda.
    this.version(6)
      .stores({})
      .upgrade(async (tx) => {
        const fix = (field: "label" | "seasonLabel") => (r: Record<string, unknown>) => {
          const label = normalizeSeasonLabel(String(r[field] ?? ""));
          if (label) r[field] = label;
        };
        await tx.table("seasons").toCollection().modify(fix("label"));
        await tx.table("sales").toCollection().modify(fix("seasonLabel"));
        await tx.table("expenses").toCollection().modify(fix("seasonLabel"));
      });
    // v7: carteira de clientes. Cada produtor ("owner") das fazendas vira um cliente.
    this.version(7)
      .stores({
        clients: "id, name, updatedAt",
        farms: "id, name, clientId, updatedAt",
      })
      .upgrade(async (tx) => {
        const farms = await tx.table<Farm>("farms").toArray();
        const { clients, links } = planClientsFromOwners(farms, [], Date.now());
        if (clients.length) await tx.table<Client>("clients").bulkAdd(clients);
        // Migração não é edição do usuário: updatedAt das fazendas fica como estava.
        for (const [farmId, clientId] of links) await tx.table<Farm>("farms").update(farmId, { clientId });
      });
    // v8: envio para a nuvem. Índice da pendência em todas as tabelas de dados; o que já existia
    // fica pendente, para subir inteiro no primeiro login.
    this.version(8)
      .stores({
        farms: "id, name, clientId, updatedAt, _pendente",
        plots: "id, farmId, updatedAt, _pendente",
        seasons: "id, plotId, updatedAt, _pendente",
        visits: "id, farmId, plotId, seasonId, date, updatedAt, _pendente",
        findings: "id, visitId, updatedAt, _pendente",
        photos: "id, visitId, updatedAt, _pendente",
        rainfall: "id, farmId, date, updatedAt, _pendente",
        operations: "id, farmId, plotId, seasonId, date, status, updatedAt, _pendente",
        supplies: "id, name, category, updatedAt, _pendente",
        stockMoves: "id, supplyId, operationId, date, updatedAt, _pendente",
        sales: "id, seasonLabel, date, updatedAt, _pendente",
        expenses: "id, seasonLabel, date, updatedAt, _pendente",
        clients: "id, name, updatedAt, _pendente",
      })
      .upgrade(async (tx) => {
        for (const t of SYNCED_TABLES) await tx.table(t).toCollection().modify({ _pendente: 1 });
      });
    markPendingOnWrite(this);
  }
}

/** Tabelas que vão para a nuvem (e para o backup, além do perfil). `meta` é do aparelho e fica fora. */
export const SYNCED_TABLES = [
  "farms",
  "plots",
  "seasons",
  "visits",
  "findings",
  "photos",
  "rainfall",
  "operations",
  "supplies",
  "stockMoves",
  "sales",
  "expenses",
  "clients",
] as const;
export type SyncedTable = (typeof SYNCED_TABLES)[number];

/**
 * Toda gravação marca o registro como pendente de envio, sem cada tela precisar lembrar.
 * Só a sincronização grava `_sync` (o carimbo do servidor): gravação que traz carimbo novo veio
 * da nuvem ou acabou de subir, e não marca. Backup e exemplo chegam sem esses campos.
 */
function markPendingOnWrite(db: Dexie) {
  for (const name of SYNCED_TABLES) {
    const table = db.table(name);
    table.hook("creating", (_key, obj: Base) => {
      if (obj._sync === undefined) obj._pendente = 1;
    });
    table.hook("updating", (mods: Partial<Base>) => (mods._sync !== undefined ? undefined : { _pendente: 1 }));
  }
}

/** Tira os campos da sincronização: backup e exemplo não levam o estado de envio deste aparelho. */
export function withoutSyncFields<T extends object>(row: T): T {
  const { _pendente, _sync, ...rest } = row as T & Pick<Base, "_pendente" | "_sync">;
  void _pendente;
  void _sync;
  return rest as T;
}

/** Nome para comparar clientes: sem diferença de maiúscula, acento ou espaço sobrando. */
export function clientKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Clientes que faltam para as fazendas que têm produtor escrito mas nenhum cliente ligado.
 * Reaproveita o cliente que já existe com o mesmo nome. Pura, para a migração e a restauração.
 */
export function planClientsFromOwners(
  farms: Farm[],
  existing: Client[],
  now: number,
): { clients: Client[]; links: [farmId: string, clientId: string][] } {
  const byKey = new Map(existing.filter((c) => !c.deletedAt).map((c) => [clientKey(c.name), c]));
  const clients: Client[] = [];
  const links: [string, string][] = [];
  for (const farm of [...farms].sort((a, b) => a.createdAt - b.createdAt)) {
    const name = farm.owner?.replace(/\s+/g, " ").trim();
    if (farm.clientId || !name) continue;
    let client = byKey.get(clientKey(name));
    if (!client) {
      client = { id: crypto.randomUUID(), createdAt: now, updatedAt: now, name, phone: "", municipality: farm.municipality ?? "", notes: "" };
      // Cliente de fazenda já removida nasce removido, para não aparecer vazio na carteira.
      if (farm.deletedAt) client.deletedAt = farm.deletedAt;
      byKey.set(clientKey(name), client);
      clients.push(client);
    } else if (client.deletedAt && !farm.deletedAt) {
      delete client.deletedAt;
    }
    links.push([farm.id, client.id]);
  }
  return { clients, links };
}

export const db = new AgroDB();

export function newBase(): Base {
  const now = Date.now();
  return { id: crypto.randomUUID(), createdAt: now, updatedAt: now };
}

export function alive<T extends { deletedAt?: number }>(rows: T[]): T[] {
  return rows.filter((r) => !r.deletedAt);
}

let lastMark = 0;

/** Carimbo de remoção, sempre diferente do anterior: é por ele que o "desfazer" acha a cascata. */
function gone() {
  const now = (lastMark = Math.max(Date.now(), lastMark + 1));
  return { deletedAt: now, updatedAt: now };
}

/**
 * As funções de remover devolvem o carimbo `deletedAt` usado: a cascata inteira
 * leva o mesmo, e `restoreRemoved` desfaz tudo de uma vez.
 */
export async function removeRainfall(id: string): Promise<number> {
  const mark = gone();
  await db.rainfall.update(id, mark);
  return mark.deletedAt;
}

/** Achados e fotos das visitas removidas também saem (dentro de uma transação que inclua findings e photos). */
async function removeVisitChildren(visitIds: string[], mark: ReturnType<typeof gone>) {
  if (visitIds.length === 0) return;
  await db.findings.where("visitId").anyOf(visitIds).filter((r) => !r.deletedAt).modify(mark);
  await db.photos.where("visitId").anyOf(visitIds).filter((r) => !r.deletedAt).modify(mark);
}

export async function removeVisit(id: string): Promise<number> {
  const mark = gone();
  await db.transaction("rw", [db.visits, db.findings, db.photos], async () => {
    await db.visits.update(id, mark);
    await removeVisitChildren([id], mark);
  });
  return mark.deletedAt;
}

export function setFollowUpDone(id: string, done: boolean) {
  return db.visits.update(id, { followUpDone: done, updatedAt: Date.now() });
}

export function updateFarm(id: string, patch: Pick<Farm, "name" | "municipality" | "owner"> & Partial<Pick<Farm, "clientId">>) {
  return db.farms.update(id, { ...patch, updatedAt: Date.now() });
}

export function updatePlot(id: string, patch: Partial<Pick<Plot, "name" | "areaHa" | "boundary">>) {
  return db.plots.update(id, { ...patch, updatedAt: Date.now() });
}

export function updateSeason(id: string, patch: Pick<Season, "label" | "cultivar" | "plantingDate">) {
  return db.seasons.update(id, { ...patch, updatedAt: Date.now() });
}

export function addSeason(plotId: string, data: Pick<Season, "label" | "cultivar" | "plantingDate">) {
  return db.seasons.add({ ...newBase(), plotId, ...data });
}

/** Uso de insumo de operações removidas também sai (dentro de uma transação que inclua stockMoves). */
async function removeUses(operationIds: string[], mark: ReturnType<typeof gone>) {
  if (operationIds.length === 0) return;
  await db.stockMoves.where("operationId").anyOf(operationIds).filter((m) => !m.deletedAt).modify(mark);
}

const PLOT_TABLES = () => [db.plots, db.seasons, db.visits, db.findings, db.photos, db.operations, db.stockMoves];

/** Talhões com safras, visitas (achados e fotos), operações e uso de insumo delas. Dentro de uma transação. */
async function removePlotsCascade(plotIds: string[], mark: ReturnType<typeof gone>) {
  if (plotIds.length === 0) return;
  await db.plots.where("id").anyOf(plotIds).filter((r) => !r.deletedAt).modify(mark);
  await db.seasons.where("plotId").anyOf(plotIds).filter((r) => !r.deletedAt).modify(mark);
  const visits = await db.visits.where("plotId").anyOf(plotIds).filter((r) => !r.deletedAt).primaryKeys();
  await db.visits.where("id").anyOf(visits).modify(mark);
  await removeVisitChildren(visits, mark);
  const ops = await db.operations.where("plotId").anyOf(plotIds).filter((r) => !r.deletedAt).primaryKeys();
  await db.operations.where("id").anyOf(ops).modify(mark);
  await removeUses(ops, mark);
}

/** Remove o talhão com safras, visitas e operações (exclusão lógica). */
export async function removePlot(id: string): Promise<number> {
  const mark = gone();
  await db.transaction("rw", PLOT_TABLES(), () => removePlotsCascade([id], mark));
  return mark.deletedAt;
}

const FARM_TABLES = () => [db.farms, db.rainfall, db.sales, db.expenses, ...PLOT_TABLES()];

/** Fazenda com talhões (e tudo deles), chuvas, vendas e despesas. Dentro de uma transação com FARM_TABLES. */
async function removeFarmCascade(id: string, mark: ReturnType<typeof gone>) {
  await db.farms.update(id, mark);
  await removePlotsCascade(await db.plots.where("farmId").equals(id).primaryKeys(), mark);
  // Visitas e operações também têm farmId; pega as que estejam num talhão já removido antes.
  const visits = await db.visits.where("farmId").equals(id).filter((r) => !r.deletedAt).primaryKeys();
  await db.visits.where("id").anyOf(visits).modify(mark);
  await removeVisitChildren(visits, mark);
  const ops = await db.operations.where("farmId").equals(id).filter((r) => !r.deletedAt).primaryKeys();
  await db.operations.where("id").anyOf(ops).modify(mark);
  await removeUses(ops, mark);
  await db.rainfall.where("farmId").equals(id).filter((r) => !r.deletedAt).modify(mark);
  // Vendas e despesas não têm índice de fazenda; são poucas, filtra na memória.
  await db.sales.filter((r) => r.farmId === id && !r.deletedAt).modify(mark);
  await db.expenses.filter((r) => r.farmId === id && !r.deletedAt).modify(mark);
}

/** Remove a fazenda com talhões (e tudo deles), chuvas, vendas e despesas (exclusão lógica). */
export async function removeFarm(id: string): Promise<number> {
  const mark = gone();
  await db.transaction("rw", FARM_TABLES(), async () => {
    await removeFarmCascade(id, mark);
  });
  return mark.deletedAt;
}

/** Remove o cliente e as fazendas dele, com tudo o que há nelas (exclusão lógica, um só "desfazer"). */
export async function removeClient(id: string): Promise<number> {
  const mark = gone();
  await db.transaction("rw", [db.clients, ...FARM_TABLES()], async () => {
    await db.clients.update(id, mark);
    const farms = await db.farms.where("clientId").equals(id).filter((f) => !f.deletedAt).primaryKeys();
    for (const farmId of farms) await removeFarmCascade(farmId, mark);
  });
  return mark.deletedAt;
}

export async function removeOperation(id: string): Promise<number> {
  const mark = gone();
  await db.transaction("rw", [db.operations, db.stockMoves], async () => {
    await db.operations.update(id, mark);
    await removeUses([id], mark);
  });
  return mark.deletedAt;
}

export async function removeStockMove(id: string): Promise<number> {
  const mark = gone();
  await db.stockMoves.update(id, mark);
  return mark.deletedAt;
}

export async function removeSale(id: string): Promise<number> {
  const mark = gone();
  await db.sales.update(id, mark);
  return mark.deletedAt;
}

export async function removeExpense(id: string): Promise<number> {
  const mark = gone();
  await db.expenses.update(id, mark);
  return mark.deletedAt;
}

/**
 * Remove o insumo e as entradas/ajustes dele. Recusa se ele foi usado em alguma operação,
 * para não apagar parte do registro da operação.
 */
export async function removeSupply(id: string): Promise<{ ok: true; at: number } | { ok: false; usedIn: number }> {
  return db.transaction("rw", [db.supplies, db.stockMoves, db.operations], async () => {
    const moves = alive(await db.stockMoves.where("supplyId").equals(id).toArray());
    const opIds = [...new Set(moves.filter((m) => m.kind === "uso" && m.operationId).map((m) => m.operationId!))];
    const usedIn = alive((await db.operations.bulkGet(opIds)).filter((o): o is Operation => !!o)).length;
    if (usedIn > 0) return { ok: false, usedIn } as const;
    const mark = gone();
    await db.supplies.update(id, mark);
    await db.stockMoves.where("supplyId").equals(id).filter((m) => !m.deletedAt).modify(mark);
    return { ok: true, at: mark.deletedAt } as const;
  });
}

const DATA_TABLES = () => db.tables.filter((t) => t.name !== "meta");

/** Desfaz uma remoção: volta tudo o que foi removido com o carimbo `at`. */
export async function restoreRemoved(at: number) {
  const now = Date.now();
  await db.transaction("rw", DATA_TABLES(), async () => {
    for (const t of DATA_TABLES()) {
      await t
        .filter((r: { deletedAt?: number }) => r.deletedAt === at)
        .modify((r: { deletedAt?: number; updatedAt: number }) => {
          delete r.deletedAt;
          r.updatedAt = now;
        });
    }
  });
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined;
}

export function setMeta(key: string, value: unknown) {
  return db.meta.put({ key, value });
}
