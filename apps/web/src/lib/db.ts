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

class AgroDB extends Dexie {
  farms!: EntityTable<Farm, "id">;
  plots!: EntityTable<Plot, "id">;
  seasons!: EntityTable<Season, "id">;
  visits!: EntityTable<Visit, "id">;
  findings!: EntityTable<Finding, "id">;
  photos!: EntityTable<Photo, "id">;
  rainfall!: EntityTable<Rainfall, "id">;

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

export function removeRainfall(id: string) {
  const now = Date.now();
  return db.rainfall.update(id, { deletedAt: now, updatedAt: now });
}

export function removeVisit(id: string) {
  const now = Date.now();
  return db.visits.update(id, { deletedAt: now, updatedAt: now });
}

export function setFollowUpDone(id: string, done: boolean) {
  return db.visits.update(id, { followUpDone: done, updatedAt: Date.now() });
}
