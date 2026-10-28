import { linkOwnersToClients } from "./clients";
import { db, setMeta, withoutSyncFields, type Photo } from "./db";
import { JsonStreamError, readJsonObject } from "./json-stream";
import { PROFILE_KEY, getProfile, type Profile } from "./profile";
import { normalizeSeasonLabel } from "./season";

/**
 * Backup e restauração dos dados locais em um único arquivo JSON.
 * Fotos viajam como data URL. A restauração faz "mesclar": só grava registros
 * novos ou mais recentes que os do aparelho, então nunca apaga nada.
 */

const VERSION = 1;

/**
 * Tabelas que vão no backup, além das fotos. Tabela nova entra aqui.
 * Backups antigos simplesmente não têm as chaves das tabelas mais novas.
 */
const TABLES = [
  "farms",
  "plots",
  "seasons",
  "visits",
  "findings",
  "rainfall",
  "operations",
  "supplies",
  "stockMoves",
  "sales",
  "expenses",
  "clients",
] as const;

type TableName = (typeof TABLES)[number];

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  // Em blocos, para não estourar a pilha com fotos grandes.
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${blob.type || "application/octet-stream"};base64,${btoa(bin)}`;
}

async function dataUrlToBlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob();
}

/** Registros vivos de cada tabela, para a tela de dados. */
export async function countLocalRecords(): Promise<Record<TableName | "photos", number>> {
  const names = [...TABLES, "photos"] as const;
  const counts = await Promise.all(names.map((t) => db.table(t).filter((r: { deletedAt?: number }) => !r.deletedAt).count()));
  return Object.fromEntries(names.map((t, i) => [t, counts[i]])) as Record<TableName | "photos", number>;
}

/**
 * Monta o arquivo em pedaços, uma foto por vez: com muitas fotos, um JSON.stringify único
 * passaria do tamanho máximo de texto do navegador. O conteúdo é o mesmo JSON de sempre.
 */
export async function exportBackup(): Promise<Blob> {
  const header = { app: "agronexus", version: VERSION, exportedAt: new Date().toISOString() };
  // Cada foto vira um Blob próprio, para a string base64 dela poder ser liberada logo.
  const parts: (string | Blob)[] = [JSON.stringify(header).slice(0, -1)];
  const profile = await getProfile();
  if (profile) parts.push(`,"profile":${JSON.stringify(profile)}`);
  for (const t of TABLES) parts.push(`,${JSON.stringify(t)}:${JSON.stringify((await db.table(t).toArray()).map(withoutSyncFields))}`);
  parts.push(`,"photos":[`);
  const ids = await db.photos.toCollection().primaryKeys();
  let first = true;
  for (const id of ids) {
    const p = await db.photos.get(id);
    if (!p) continue;
    parts.push(new Blob([`${first ? "" : ","}${JSON.stringify({ ...withoutSyncFields(p), blob: await blobToDataUrl(p.blob) })}`]));
    first = false;
  }
  parts.push("]}");
  return new Blob(parts, { type: "application/json" });
}

export const LAST_BACKUP_KEY = "lastBackupAt";

/** Chamar depois que o arquivo de backup foi entregue ao usuário. */
export function markBackupDone(at: number) {
  return setMeta(LAST_BACKUP_KEY, at);
}

type Row = { id: string; updatedAt: number };

function isRow(value: unknown): value is Row {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Row).id === "string" &&
    typeof (value as Row).updatedAt === "number"
  );
}

/**
 * Campos de que o app depende em cada tabela. Registro sem eles (arquivo editado ou corrompido)
 * fica de fora da restauração em vez de quebrar as telas.
 */
const REQUIRED: Record<TableName | "photos", Record<string, "string" | "number" | "boolean">> = {
  farms: { name: "string" },
  plots: { farmId: "string", name: "string" },
  seasons: { plotId: "string", label: "string" },
  visits: { farmId: "string", plotId: "string", date: "string" },
  findings: { visitId: "string", kind: "string", name: "string" },
  rainfall: { farmId: "string", date: "string", mm: "number" },
  operations: { farmId: "string", plotId: "string", kind: "string", status: "string", date: "string" },
  supplies: { name: "string", category: "string", unit: "string" },
  stockMoves: { supplyId: "string", kind: "string", qty: "number", date: "string" },
  sales: { seasonLabel: "string", date: "string", bags: "number", pricePerBag: "number" },
  expenses: { seasonLabel: "string", date: "string", category: "string", amount: "number" },
  clients: { name: "string" },
  photos: { visitId: "string" },
};

function hasRequired(row: Row, table: TableName | "photos"): boolean {
  const r = row as unknown as Record<string, unknown>;
  return Object.entries(REQUIRED[table]).every(([field, type]) =>
    type === "number" ? Number.isFinite(r[field]) : typeof r[field] === type,
  );
}

/** Rótulo da safra no padrão "2026/27", como o app grava hoje (backups antigos podem ter "2026/2027"). */
function normalizeLabels(row: Row, table: TableName | "photos"): Row {
  const field = table === "seasons" ? "label" : table === "sales" || table === "expenses" ? "seasonLabel" : null;
  if (!field) return row;
  const label = normalizeSeasonLabel((row as unknown as Record<string, string>)[field]);
  return label ? { ...row, [field]: label } : row;
}

/** Grava só o que é novo ou mais recente que o registro que já está no aparelho. */
async function merge(rows: unknown, table: TableName | "photos"): Promise<number> {
  if (!Array.isArray(rows)) return 0;
  // O estado de envio é de cada aparelho: o que vem do arquivo fica pendente aqui.
  const valid = rows
    .filter((r): r is Row => isRow(r) && hasRequired(r, table))
    .map((r) => withoutSyncFields(normalizeLabels(r, table)));
  const existing: (Row | undefined)[] = await db.table(table).bulkGet(valid.map((r) => r.id));
  const toWrite = valid.filter((r, i) => !existing[i] || existing[i]!.updatedAt < r.updatedAt);
  if (toWrite.length) await db.table(table).bulkPut(toWrite);
  return toWrite.length;
}

const PHOTO_BATCH = 20;
const NOT_BACKUP = "Esse arquivo não é um backup do AgroNexus.";

/**
 * Lê o arquivo aos poucos (ver json-stream.ts): as tabelas são gravadas juntas, numa transação,
 * antes da primeira foto; as fotos vão em lotes. Arquivo cortado no meio pode deixar parte das
 * fotos gravada, o que não faz mal: restaurar de novo só completa o que faltou.
 */
export async function importBackup(file: File): Promise<number> {
  const data: Record<string, unknown> = {};
  let tablesDone = false;
  let pending: Photo[] = [];
  let written = 0;

  const isBackup = () => data.app === "agronexus" && data.version === VERSION;

  const writeTables = async () => {
    if (tablesDone) return;
    if (!isBackup()) throw new Error(NOT_BACKUP);
    tablesDone = true;
    await db.transaction("rw", [...TABLES.map((t) => db.table(t)), db.meta], async () => {
      for (const t of TABLES) written += await merge(data[t], t);
      await restoreProfile(data.profile);
    });
  };

  const writePhotos = async () => {
    const batch = pending;
    pending = [];
    if (batch.length) await db.transaction("rw", db.photos, async () => (written += await merge(batch, "photos")));
  };

  try {
    await readJsonObject(
      file,
      "photos",
      (key, value) => {
        if (key !== "photos") data[key] = value;
      },
      async (p) => {
        await writeTables();
        if (!isRow(p) || typeof (p as unknown as { blob: unknown }).blob !== "string") return;
        const raw = p as unknown as Omit<Photo, "blob"> & { blob: string };
        pending.push({ ...raw, blob: await dataUrlToBlob(raw.blob) });
        if (pending.length >= PHOTO_BATCH) await writePhotos();
      },
    );
  } catch (err) {
    if (err instanceof JsonStreamError) throw new Error(NOT_BACKUP);
    throw err;
  }
  await writeTables();
  await writePhotos();
  // Backup de antes da carteira de clientes: o produtor escrito na fazenda vira cliente.
  await linkOwnersToClients();
  return written;
}

/** O perfil do arquivo só entra se este aparelho ainda não tem um (não troca quem está usando). */
async function restoreProfile(value: unknown) {
  if (typeof value !== "object" || value === null) return;
  const p = value as Partial<Profile>;
  if (typeof p.name !== "string" || typeof p.role !== "string" || typeof p.mode !== "string") return;
  if (await getProfile()) return;
  await setMeta(PROFILE_KEY, value);
}
