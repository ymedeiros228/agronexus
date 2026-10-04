import Dexie, { type EntityTable } from "dexie";

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
};

export type Farm = Base & {
  name: string;
  municipality: string;
  owner: string;
};

export type Plot = Base & {
  farmId: string;
  name: string;
  areaHa: number | null;
};

export type Season = Base & {
  plotId: string;
  label: string; // ex.: "2026/27"
  cultivar: string;
  plantingDate: string | null; // AAAA-MM-DD
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
  }
}

export const db = new AgroDB();

export function newBase(): Base {
  const now = Date.now();
  return { id: crypto.randomUUID(), createdAt: now, updatedAt: now };
}

export function alive<T extends { deletedAt?: number }>(rows: T[]): T[] {
  return rows.filter((r) => !r.deletedAt);
}

function gone() {
  const now = Date.now();
  return { deletedAt: now, updatedAt: now };
}

export function removeRainfall(id: string) {
  return db.rainfall.update(id, gone());
}

export function removeVisit(id: string) {
  return db.visits.update(id, gone());
}

export function setFollowUpDone(id: string, done: boolean) {
  return db.visits.update(id, { followUpDone: done, updatedAt: Date.now() });
}

export function updateFarm(id: string, patch: Pick<Farm, "name" | "municipality" | "owner">) {
  return db.farms.update(id, { ...patch, updatedAt: Date.now() });
}

export function updatePlot(id: string, patch: Pick<Plot, "name" | "areaHa">) {
  return db.plots.update(id, { ...patch, updatedAt: Date.now() });
}

export function updateSeason(id: string, patch: Pick<Season, "label" | "cultivar" | "plantingDate">) {
  return db.seasons.update(id, { ...patch, updatedAt: Date.now() });
}

export function addSeason(plotId: string, data: Pick<Season, "label" | "cultivar" | "plantingDate">) {
  return db.seasons.add({ ...newBase(), plotId, ...data });
}

/** Remove o talhão com visitas e operações (exclusão lógica). */
export async function removePlot(id: string) {
  const mark = gone();
  await db.transaction("rw", [db.plots, db.visits, db.operations], async () => {
    await db.plots.update(id, mark);
    await db.visits.where("plotId").equals(id).filter((v) => !v.deletedAt).modify(mark);
    await db.operations.where("plotId").equals(id).filter((r) => !r.deletedAt).modify(mark);
  });
}

/** Remove a fazenda com talhões, visitas, operações e chuvas (exclusão lógica). */
export async function removeFarm(id: string) {
  const mark = gone();
  await db.transaction("rw", [db.farms, db.plots, db.visits, db.rainfall, db.operations], async () => {
    await db.farms.update(id, mark);
    await db.plots.where("farmId").equals(id).filter((r) => !r.deletedAt).modify(mark);
    await db.visits.where("farmId").equals(id).filter((r) => !r.deletedAt).modify(mark);
    await db.rainfall.where("farmId").equals(id).filter((r) => !r.deletedAt).modify(mark);
    await db.operations.where("farmId").equals(id).filter((r) => !r.deletedAt).modify(mark);
  });
}

export function removeOperation(id: string) {
  return db.operations.update(id, gone());
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined;
}

export function setMeta(key: string, value: unknown) {
  return db.meta.put({ key, value });
}
