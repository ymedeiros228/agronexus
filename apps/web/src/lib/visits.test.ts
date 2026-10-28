import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { alive, db, newBase } from "./db";
import { saveProfile, emptyProfile } from "./profile";
import { createVisit, updateVisit, type VisitInput } from "./visits";

let clock = 1_000;
function setNow(t: number) {
  clock = t;
}

beforeEach(async () => {
  vi.spyOn(Date, "now").mockImplementation(() => clock);
  setNow(1_000);
  await Promise.all(db.tables.map((t) => t.clear()));
  await db.farms.add({ ...newBase(), id: "f1", name: "Fazenda", municipality: "", owner: "" });
  await db.plots.bulkAdd([
    { ...newBase(), id: "p1", farmId: "f1", name: "T-1", areaHa: null },
    { ...newBase(), id: "p2", farmId: "f1", name: "T-2", areaHa: null },
  ]);
  setNow(1_100);
  await db.seasons.add({ ...newBase(), id: "s1-old", plotId: "p1", label: "2025/26", cultivar: "", plantingDate: null });
  setNow(1_200);
  await db.seasons.add({ ...newBase(), id: "s1-new", plotId: "p1", label: "2026/27", cultivar: "", plantingDate: null });
  await db.seasons.add({ ...newBase(), id: "s2", plotId: "p2", label: "2026/27", cultivar: "", plantingDate: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const photoBlob = () => new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });

function input(over: Partial<VisitInput> = {}): VisitInput {
  return {
    farmId: "f1",
    plotId: "p1",
    date: "2026-10-03",
    stage: "V4",
    observations: "  folhas ok  ",
    recommendation: "",
    followUpDate: "2026-10-10",
    findings: [
      { kind: "praga", name: " Percevejo-marrom ", amount: "2", note: "" },
      { kind: "doenca", name: "Ferrugem-asiática", amount: "", note: "baixeiro" },
      { kind: "outro", name: "   ", amount: "", note: "" },
    ],
    photos: [
      { blob: photoBlob(), label: "Ferrugem-asiática", takenAt: 5, lat: null, lng: null },
      { blob: photoBlob(), label: "", takenAt: 6, lat: -6.1, lng: -44.2 },
    ],
    ...over,
  };
}

describe("createVisit", () => {
  it("grava a visita na safra vigente, limpa espaços e ignora achado sem nome", async () => {
    setNow(2_000);
    const id = await createVisit(input());
    const visit = await db.visits.get(id);
    expect(visit?.seasonId).toBe("s1-new");
    expect(visit?.observations).toBe("folhas ok");
    expect(visit?.followUpDone).toBe(false);

    const findings = await db.findings.where("visitId").equals(id).toArray();
    expect(findings.map((f) => f.name).sort()).toEqual(["Ferrugem-asiática", "Percevejo-marrom"]);
    const photos = await db.photos.where("visitId").equals(id).toArray();
    expect(photos).toHaveLength(2);
    expect(visit?.author).toBeUndefined();
  });

  it("grava quem registrou, copiado do perfil", async () => {
    await saveProfile({ ...emptyProfile(), name: "Ana Lima", role: "estagiario", supervisorName: "João Silva" });
    const id = await createVisit(input());
    const visit = await db.visits.get(id);
    expect(visit?.author).toMatchObject({ name: "Ana Lima", role: "estagiario", supervisorName: "João Silva" });
  });

  it("voltar ao talhão dá por feitos os retornos pendentes de antes, só daquele talhão", async () => {
    setNow(2_000);
    const old = await createVisit(input({ date: "2026-10-03", followUpDate: "2026-10-10" }));
    const other = await createVisit(input({ plotId: "p2", date: "2026-10-03", followUpDate: "2026-10-10" }));
    const later = await createVisit(input({ date: "2026-10-20", followUpDate: "2026-10-30" }));
    setNow(3_000);
    // Visita lançada com data anterior (esquecida no caderno) não fecha o retorno de uma visita mais nova.
    await createVisit(input({ date: "2026-10-15", followUpDate: null }));
    const [a, b, c] = await db.visits.bulkGet([old, other, later]);
    expect(a?.followUpDone).toBe(true);
    expect(a?.updatedAt).toBe(2_000);
    expect(b?.followUpDone).toBe(false);
    expect(c?.followUpDone).toBe(false);
  });
});

describe("updateVisit", () => {
  async function setup() {
    setNow(2_000);
    const id = await createVisit(input());
    const findings = (await db.findings.where("visitId").equals(id).sortBy("name")) ?? [];
    const photos = await db.photos.where("visitId").equals(id).sortBy("takenAt");
    return { id, findings, photos };
  }

  it("só altera o que mudou e marca como excluído o que saiu", async () => {
    const { id, findings, photos } = await setup();
    const [ferrugem, percevejo] = findings; // ordem alfabética
    setNow(3_000);
    await updateVisit(
      id,
      input({
        findings: [
          { id: ferrugem.id, kind: "doenca", name: "Ferrugem-asiática", amount: "", note: "baixeiro" }, // igual
          { kind: "praga", name: "Lagarta-da-soja", amount: "1", note: "" }, // novo
          // percevejo saiu
        ],
        photos: [
          { id: photos[0].id, blob: photos[0].blob, label: "Mancha-alvo", takenAt: 5, lat: null, lng: null }, // rótulo mudou
          // segunda foto saiu
        ],
      }),
    );

    const after = await db.findings.where("visitId").equals(id).toArray();
    const byId = new Map(after.map((f) => [f.id, f]));
    expect(byId.get(ferrugem.id)?.updatedAt).toBe(2_000);
    expect(byId.get(percevejo.id)?.deletedAt).toBe(3_000);
    expect(alive(after).map((f) => f.name).sort()).toEqual(["Ferrugem-asiática", "Lagarta-da-soja"]);

    const afterPhotos = await db.photos.where("visitId").equals(id).toArray();
    const p0 = afterPhotos.find((p) => p.id === photos[0].id);
    expect(p0?.label).toBe("Mancha-alvo");
    expect(p0?.updatedAt).toBe(3_000);
    expect(afterPhotos.find((p) => p.id === photos[1].id)?.deletedAt).toBe(3_000);
  });

  it("achado editado ganha updatedAt novo", async () => {
    const { id, findings } = await setup();
    const [ferrugem] = findings;
    setNow(3_000);
    await updateVisit(id, input({ findings: [{ id: ferrugem.id, kind: "doenca", name: "Ferrugem-asiática", amount: "alta", note: "" }] }));
    const f = await db.findings.get(ferrugem.id);
    expect(f?.amount).toBe("alta");
    expect(f?.updatedAt).toBe(3_000);
  });

  it("retorno remarcado volta a ficar pendente; mesma data mantém o estado", async () => {
    const { id } = await setup();
    await db.visits.update(id, { followUpDone: true });
    await updateVisit(id, input());
    expect((await db.visits.get(id))?.followUpDone).toBe(true);
    await updateVisit(id, input({ followUpDate: "2026-10-20" }));
    expect((await db.visits.get(id))?.followUpDone).toBe(false);
  });

  it("mantém a safra original; trocar de talhão passa para a safra do novo talhão", async () => {
    const { id } = await setup();
    await db.visits.update(id, { seasonId: "s1-old" });
    await updateVisit(id, input());
    expect((await db.visits.get(id))?.seasonId).toBe("s1-old");
    await updateVisit(id, input({ plotId: "p2" }));
    expect((await db.visits.get(id))?.seasonId).toBe("s2");
  });

  it("recusa visita excluída", async () => {
    const { id } = await setup();
    await db.visits.update(id, { deletedAt: 9 });
    await expect(updateVisit(id, input())).rejects.toThrow();
  });
});
