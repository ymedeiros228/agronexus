import { beforeEach, describe, expect, it } from "vitest";
import { db, newBase, removeFarm, removePlot, removeVisit } from "./db";

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

async function seed() {
  await db.farms.add({ ...newBase(), id: "f1", name: "Fazenda", municipality: "", owner: "" });
  await db.plots.bulkAdd([
    { ...newBase(), id: "p1", farmId: "f1", name: "T-1", areaHa: 10 },
    { ...newBase(), id: "p2", farmId: "f1", name: "T-2", areaHa: 20 },
  ]);
  await db.seasons.bulkAdd([
    { ...newBase(), id: "s1", plotId: "p1", label: "2026/27", cultivar: "", plantingDate: null },
    { ...newBase(), id: "s2", plotId: "p2", label: "2026/27", cultivar: "", plantingDate: null },
  ]);
  const visit = { date: "2026-10-03", stage: "V4", observations: "", recommendation: "", followUpDate: null, followUpDone: false };
  await db.visits.bulkAdd([
    { ...newBase(), ...visit, id: "v1", farmId: "f1", plotId: "p1", seasonId: "s1" },
    { ...newBase(), ...visit, id: "v2", farmId: "f1", plotId: "p2", seasonId: "s2" },
  ]);
  await db.findings.bulkAdd([
    { ...newBase(), id: "a1", visitId: "v1", kind: "praga", name: "Lagarta", amount: "", note: "" },
    { ...newBase(), id: "a2", visitId: "v2", kind: "praga", name: "Percevejo", amount: "", note: "" },
  ]);
  await db.photos.add({ ...newBase(), id: "ph1", visitId: "v1", blob: new Blob([]), label: "", takenAt: 1, lat: null, lng: null });
}

const isGone = async (table: string, id: string) => !!(await db.table(table).get(id))?.deletedAt;

describe("exclusão em cascata", () => {
  it("visita leva achados e fotos", async () => {
    await seed();
    await removeVisit("v1");
    expect(await isGone("findings", "a1")).toBe(true);
    expect(await isGone("photos", "ph1")).toBe(true);
    expect(await isGone("findings", "a2")).toBe(false);
  });

  it("talhão leva safras, visitas, achados e fotos só dele", async () => {
    await seed();
    await removePlot("p1");
    for (const [t, id] of [["seasons", "s1"], ["visits", "v1"], ["findings", "a1"], ["photos", "ph1"]]) {
      expect(await isGone(t, id)).toBe(true);
    }
    for (const [t, id] of [["plots", "p2"], ["seasons", "s2"], ["visits", "v2"], ["findings", "a2"]]) {
      expect(await isGone(t, id)).toBe(false);
    }
  });

  it("fazenda leva tudo e mantém a data da exclusão de um talhão já removido", async () => {
    await seed();
    await removePlot("p1");
    const firstMark = (await db.plots.get("p1"))!.deletedAt;
    await removeFarm("f1");
    for (const [t, id] of [["plots", "p2"], ["seasons", "s2"], ["visits", "v2"], ["findings", "a2"]]) {
      expect(await isGone(t, id)).toBe(true);
    }
    expect((await db.plots.get("p1"))!.deletedAt).toBe(firstMark);
  });
});
