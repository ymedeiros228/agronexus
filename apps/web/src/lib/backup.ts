import { db, setMeta, type Photo } from "./db";

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

export async function exportBackup(): Promise<Blob> {
  const rows = await Promise.all(TABLES.map((t) => db.table(t).toArray()));
  const photos = await db.photos.toArray();
  const photosOut = await Promise.all(photos.map(async (p) => ({ ...p, blob: await blobToDataUrl(p.blob) })));
  const payload = {
    app: "agronexus",
    version: VERSION,
    exportedAt: new Date().toISOString(),
    ...Object.fromEntries(TABLES.map((t, i) => [t, rows[i]])),
    photos: photosOut,
  };
  return new Blob([JSON.stringify(payload)], { type: "application/json" });
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

/** Grava só o que é novo ou mais recente que o registro que já está no aparelho. */
async function merge(rows: unknown, table: string): Promise<number> {
  if (!Array.isArray(rows)) return 0;
  const valid = rows.filter(isRow);
  const existing: (Row | undefined)[] = await db.table(table).bulkGet(valid.map((r) => r.id));
  const toWrite = valid.filter((r, i) => !existing[i] || existing[i]!.updatedAt < r.updatedAt);
  if (toWrite.length) await db.table(table).bulkPut(toWrite);
  return toWrite.length;
}

export async function importBackup(file: File): Promise<number> {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error("Esse arquivo não é um backup do AgroNexus.");
  }
  if (data.app !== "agronexus" || data.version !== VERSION) {
    throw new Error("Esse arquivo não é um backup do AgroNexus.");
  }

  const photoRows = Array.isArray(data.photos) ? data.photos : [];
  const photos: Photo[] = [];
  for (const p of photoRows) {
    if (isRow(p) && typeof (p as unknown as { blob: unknown }).blob === "string") {
      const raw = p as unknown as Omit<Photo, "blob"> & { blob: string };
      photos.push({ ...raw, blob: await dataUrlToBlob(raw.blob) });
    }
  }

  let written = 0;
  await db.transaction("rw", [...TABLES.map((t) => db.table(t)), db.photos], async () => {
    for (const t of TABLES) written += await merge(data[t], t);
    written += await merge(photos, "photos");
  });
  return written;
}
