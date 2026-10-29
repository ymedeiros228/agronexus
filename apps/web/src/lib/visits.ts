import { visitKindInfo } from "./catalog";
import { alive, db, newBase, type Finding, type FindingKind, type Photo, type StandCount, type Visit, type VisitKind } from "./db";
import { authorFromProfile, getProfile } from "./profile";
import { latestSeason } from "./season";
import { cleanStand } from "./stand";

/**
 * Gravação de visitas com achados e fotos.
 * Na edição, compara com o que está salvo: só toca no que mudou e marca como
 * excluído o que saiu, para a sincronização futura saber exatamente o que mudou.
 */

export type FindingInput = { id?: string; kind: FindingKind; name: string; amount: string; note: string };
export type PhotoInput = {
  id?: string;
  blob: Blob;
  label: string;
  takenAt: number;
  lat: number | null;
  lng: number | null;
};
export type VisitInput = {
  farmId: string;
  plotId: string;
  date: string;
  stage: string;
  observations: string;
  recommendation: string;
  followUpDate: string | null;
  findings: FindingInput[];
  photos: PhotoInput[];
  /** Sem tipo = monitoramento. */
  kind?: VisitKind;
  stand?: StandCount | null;
};

/** Contagem só nos tipos que contam estande; ponto inválido sai. */
function standFor(kind: VisitKind, stand: StandCount | null | undefined): StandCount | null {
  return visitKindInfo(kind).stand ? cleanStand(stand) : null;
}

/**
 * Espaçamento e população informados na contagem passam para a safra: na próxima visita já vêm
 * preenchidos. Dentro de uma transação que inclua `seasons`.
 */
async function rememberStandBasis(seasonId: string | null | undefined, stand: StandCount | null, now: number) {
  if (!seasonId || !stand) return;
  const season = await db.seasons.get(seasonId);
  if (!season || season.deletedAt) return;
  const patch: { rowSpacingM?: number; targetPopulation?: number } = {};
  if (stand.spacingM && stand.spacingM !== season.rowSpacingM) patch.rowSpacingM = stand.spacingM;
  if (stand.targetPerHa && stand.targetPerHa !== season.targetPopulation) patch.targetPopulation = stand.targetPerHa;
  if (Object.keys(patch).length) await db.seasons.update(seasonId, { ...patch, updatedAt: now });
}

function cleanFindings(list: FindingInput[]): FindingInput[] {
  return list
    .map((f) => ({ ...f, name: f.name.trim(), amount: f.amount.trim(), note: f.note.trim() }))
    .filter((f) => f.name);
}

async function currentSeasonId(plotId: string): Promise<string | null> {
  return latestSeason(alive(await db.seasons.where("plotId").equals(plotId).toArray()))?.id ?? null;
}

/**
 * Grava a visita nova com o autor (cópia do perfil) e dá por feitos os retornos que estavam
 * pendentes no talhão em visitas até esta data: quem voltou ao talhão cumpriu o retorno.
 */
export async function createVisit(input: VisitInput): Promise<string> {
  const author = authorFromProfile(await getProfile());
  const visit: Visit = {
    ...newBase(),
    farmId: input.farmId,
    plotId: input.plotId,
    seasonId: await currentSeasonId(input.plotId),
    date: input.date,
    stage: input.stage,
    observations: input.observations.trim(),
    recommendation: input.recommendation.trim(),
    followUpDate: input.followUpDate,
    followUpDone: false,
    kind: input.kind ?? "monitoramento",
    stand: standFor(input.kind ?? "monitoramento", input.stand),
    ...(author ? { author } : {}),
  };
  await db.transaction("rw", [db.visits, db.findings, db.photos, db.seasons], async () => {
    await rememberStandBasis(visit.seasonId, visit.stand ?? null, visit.updatedAt);
    await db.visits
      .where("plotId")
      .equals(input.plotId)
      .filter((v) => !v.deletedAt && !!v.followUpDate && !v.followUpDone && v.date <= input.date)
      .modify({ followUpDone: true, updatedAt: visit.updatedAt });
    await db.visits.add(visit);
    const fs: Finding[] = cleanFindings(input.findings).map((f) => ({
      ...newBase(),
      visitId: visit.id,
      kind: f.kind,
      name: f.name,
      amount: f.amount,
      note: f.note,
    }));
    if (fs.length) await db.findings.bulkAdd(fs);
    const ps: Photo[] = input.photos.map((p) => ({
      ...newBase(),
      visitId: visit.id,
      blob: p.blob,
      label: p.label,
      takenAt: p.takenAt,
      lat: p.lat,
      lng: p.lng,
    }));
    if (ps.length) await db.photos.bulkAdd(ps);
  });
  return visit.id;
}

export async function updateVisit(id: string, input: VisitInput): Promise<void> {
  const now = Date.now();
  const seasonIdIfMoved = await currentSeasonId(input.plotId);

  await db.transaction("rw", [db.visits, db.findings, db.photos, db.seasons], async () => {
    const old = await db.visits.get(id);
    if (!old || old.deletedAt) throw new Error("Visita não encontrada.");

    const followUpDate = input.followUpDate;
    // Mudou de talhão: passa para a safra vigente do novo talhão.
    const seasonId = old.plotId === input.plotId ? (old.seasonId ?? null) : seasonIdIfMoved;
    const kind = input.kind ?? old.kind ?? "monitoramento";
    const stand = standFor(kind, input.stand === undefined ? old.stand : input.stand);
    await rememberStandBasis(seasonId, stand, now);
    await db.visits.update(id, {
      farmId: input.farmId,
      plotId: input.plotId,
      seasonId,
      kind,
      stand,
      date: input.date,
      stage: input.stage,
      observations: input.observations.trim(),
      recommendation: input.recommendation.trim(),
      followUpDate,
      // Retorno remarcado volta a ficar pendente.
      followUpDone: followUpDate === old.followUpDate ? old.followUpDone : false,
      updatedAt: now,
    });

    const savedFindings = alive(await db.findings.where("visitId").equals(id).toArray());
    const findings = cleanFindings(input.findings);
    const keepF = new Set(findings.map((f) => f.id).filter(Boolean));
    for (const f of savedFindings) {
      if (!keepF.has(f.id)) await db.findings.update(f.id, { deletedAt: now, updatedAt: now });
    }
    for (const f of findings) {
      const saved = f.id ? savedFindings.find((s) => s.id === f.id) : undefined;
      if (!saved) {
        await db.findings.add({ ...newBase(), visitId: id, kind: f.kind, name: f.name, amount: f.amount, note: f.note });
      } else if (saved.kind !== f.kind || saved.name !== f.name || saved.amount !== f.amount || saved.note !== f.note) {
        await db.findings.update(saved.id, { kind: f.kind, name: f.name, amount: f.amount, note: f.note, updatedAt: now });
      }
    }

    const savedPhotos = alive(await db.photos.where("visitId").equals(id).toArray());
    const keepP = new Set(input.photos.map((p) => p.id).filter(Boolean));
    for (const p of savedPhotos) {
      if (!keepP.has(p.id)) await db.photos.update(p.id, { deletedAt: now, updatedAt: now });
    }
    for (const p of input.photos) {
      const saved = p.id ? savedPhotos.find((s) => s.id === p.id) : undefined;
      if (!saved) {
        await db.photos.add({
          ...newBase(),
          visitId: id,
          blob: p.blob,
          label: p.label,
          takenAt: p.takenAt,
          lat: p.lat,
          lng: p.lng,
        });
      } else if (saved.label !== p.label) {
        await db.photos.update(saved.id, { label: p.label, updatedAt: now });
      }
    }
  });
}
