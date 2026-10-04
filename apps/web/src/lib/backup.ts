import { db, setMeta, type Farm, type Finding, type Photo, type Plot, type Rainfall, type Season, type Visit } from "./db";

/**
 * Backup e restauração dos dados locais em um único arquivo JSON.
 * Fotos viajam como data URL. A restauração faz "mesclar": só grava registros
 * novos ou mais recentes que os do aparelho, então nunca apaga nada.
 */

const VERSION = 1;

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

export async function countLocalRecords() {
  const [farms, plots, visits, photos, rainfall] = await Promise.all([
    db.farms.filter((r) => !r.deletedAt).count(),
    db.plots.filter((r) => !r.deletedAt).count(),
    db.visits.filter((r) => !r.deletedAt).count(),
    db.photos.filter((r) => !r.deletedAt).count(),
    db.rainfall.filter((r) => !r.deletedAt).count(),
  ]);
  return { farms, plots, visits, photos, rainfall };
}

export async function exportBackup(): Promise<Blob> {
  const [farms, plots, seasons, visits, findings, photos, rainfall] = await Promise.all([
    db.farms.toArray(),
    db.plots.toArray(),
    db.seasons.toArray(),
    db.visits.toArray(),
    db.findings.toArray(),
    db.photos.toArray(),
    db.rainfall.toArray(),
  ]);
  const photosOut = await Promise.all(photos.map(async (p) => ({ ...p, blob: await blobToDataUrl(p.blob) })));
  const payload = {
    app: "agronexus",
    version: VERSION,
    exportedAt: new Date().toISOString(),
    farms,
    plots,
    seasons,
    visits,
    findings,
    photos: photosOut,
    rainfall,
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
async function merge<T extends Row>(
  rows: unknown,
  get: (ids: string[]) => PromiseLike<(T | undefined)[]>,
  put: (rows: T[]) => PromiseLike<unknown>,
): Promise<number> {
  if (!Array.isArray(rows)) return 0;
  const valid = rows.filter(isRow) as T[];
  const existing = await get(valid.map((r) => r.id));
  const toWrite = valid.filter((r, i) => !existing[i] || existing[i]!.updatedAt < r.updatedAt);
  if (toWrite.length) await put(toWrite);
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
  await db.transaction(
    "rw",
    [db.farms, db.plots, db.seasons, db.visits, db.findings, db.photos, db.rainfall],
    async () => {
      written += await merge<Farm>(data.farms, (ids) => db.farms.bulkGet(ids), (r) => db.farms.bulkPut(r));
      written += await merge<Plot>(data.plots, (ids) => db.plots.bulkGet(ids), (r) => db.plots.bulkPut(r));
      written += await merge<Season>(data.seasons, (ids) => db.seasons.bulkGet(ids), (r) => db.seasons.bulkPut(r));
      written += await merge<Visit>(data.visits, (ids) => db.visits.bulkGet(ids), (r) => db.visits.bulkPut(r));
      written += await merge<Finding>(data.findings, (ids) => db.findings.bulkGet(ids), (r) => db.findings.bulkPut(r));
      written += await merge<Photo>(photos, (ids) => db.photos.bulkGet(ids), (r) => db.photos.bulkPut(r));
      written += await merge<Rainfall>(data.rainfall, (ids) => db.rainfall.bulkGet(ids), (r) => db.rainfall.bulkPut(r));
    },
  );
  return written;
}
