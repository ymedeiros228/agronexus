import { beforeEach, describe, expect, it } from "vitest";
import { exportBackup, importBackup } from "./backup";
import { db, newBase } from "./db";

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

async function seed() {
  await db.farms.add({ ...newBase(), id: "f1", name: "Fazenda", municipality: "Balsas", owner: "" });
  await db.visits.add({
    ...newBase(),
    id: "v1",
    farmId: "f1",
    plotId: "p1",
    seasonId: null,
    date: "2026-10-03",
    stage: "V4",
    observations: "",
    recommendation: "",
    followUpDate: null,
    followUpDone: false,
  });
  await db.photos.add({
    ...newBase(),
    id: "ph1",
    visitId: "v1",
    blob: new Blob([new Uint8Array([255, 216, 255, 0, 1, 2, 250])], { type: "image/jpeg" }),
    label: "Sem alteração",
    takenAt: 1,
    lat: null,
    lng: null,
  });
}

const asFile = async (blob: Blob) => new File([await blob.text()], "backup.json", { type: "application/json" });

describe("backup", () => {
  it("ida e volta preserva registros e os bytes da foto", async () => {
    await seed();
    const file = await asFile(await exportBackup());
    await Promise.all(db.tables.map((t) => t.clear()));

    expect(await importBackup(file)).toBe(3);
    expect((await db.farms.get("f1"))?.municipality).toBe("Balsas");
    const photo = await db.photos.get("ph1");
    expect(photo?.label).toBe("Sem alteração");
    expect(photo?.blob.type).toBe("image/jpeg");
    expect([...new Uint8Array(await photo!.blob.arrayBuffer())]).toEqual([255, 216, 255, 0, 1, 2, 250]);
  });

  it("não sobrescreve o que está mais novo no aparelho e não grava de novo o que já tem", async () => {
    await seed();
    const file = await asFile(await exportBackup());
    await db.farms.update("f1", { name: "Nome novo", updatedAt: Date.now() + 1_000 });

    expect(await importBackup(file)).toBe(0);
    expect((await db.farms.get("f1"))?.name).toBe("Nome novo");
  });

  it("recusa arquivo que não é backup", async () => {
    await expect(importBackup(new File(["{}"], "x.json"))).rejects.toThrow("não é um backup");
    await expect(importBackup(new File(["isso não é json"], "x.json"))).rejects.toThrow("não é um backup");
  });
});
