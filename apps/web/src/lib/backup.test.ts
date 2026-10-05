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

  it("gera JSON válido sem fotos e com várias fotos", async () => {
    const empty = JSON.parse(await (await exportBackup()).text());
    expect(empty.app).toBe("agronexus");
    expect(empty.photos).toEqual([]);
    expect(empty.farms).toEqual([]);

    await seed();
    const photo = (await db.photos.get("ph1"))!;
    await db.photos.add({ ...photo, id: "ph2", label: "Segunda" });
    const full = JSON.parse(await (await exportBackup()).text());
    expect(full.photos.map((p: { id: string }) => p.id).sort()).toEqual(["ph1", "ph2"]);
    expect(full.photos[0].blob).toMatch(/^data:image\/jpeg;base64,/);
    expect(full.farms).toHaveLength(1);
  });

  it("restaura fotos em mais de um lote", async () => {
    await seed();
    const photo = (await db.photos.get("ph1"))!;
    await db.photos.bulkAdd(Array.from({ length: 44 }, (_, i) => ({ ...photo, id: `extra-${i}` })));
    const file = await asFile(await exportBackup());
    await Promise.all(db.tables.map((t) => t.clear()));

    expect(await importBackup(file)).toBe(2 + 45);
    expect(await db.photos.count()).toBe(45);
    expect(await db.visits.count()).toBe(1);
  });

  it("recusa fotos antes do cabeçalho do backup", async () => {
    const file = new File([`{"photos":[{"id":"x","updatedAt":1,"visitId":"v","blob":"data:,"}],"app":"agronexus","version":1}`], "b.json");
    await expect(importBackup(file)).rejects.toThrow("não é um backup");
    expect(await db.photos.count()).toBe(0);
  });

  it("não sobrescreve o que está mais novo no aparelho e não grava de novo o que já tem", async () => {
    await seed();
    const file = await asFile(await exportBackup());
    await db.farms.update("f1", { name: "Nome novo", updatedAt: Date.now() + 1_000 });

    expect(await importBackup(file)).toBe(0);
    expect((await db.farms.get("f1"))?.name).toBe("Nome novo");
  });

  it("deixa de fora registro sem os campos obrigatórios e padroniza o rótulo da safra", async () => {
    const backup = {
      app: "agronexus",
      version: 1,
      farms: [
        { id: "f1", updatedAt: 1, name: "Boa" },
        { id: "f2", updatedAt: 1 },
      ],
      sales: [
        { id: "s1", updatedAt: 1, seasonLabel: "2026/2027", date: "2027-03-01", bags: 10, pricePerBag: 120 },
        { id: "s2", updatedAt: 1, seasonLabel: "2026/27", date: "2027-03-01", bags: "dez", pricePerBag: 120 },
      ],
    };
    expect(await importBackup(new File([JSON.stringify(backup)], "b.json"))).toBe(2);
    expect(await db.farms.get("f2")).toBeUndefined();
    expect((await db.sales.get("s1"))?.seasonLabel).toBe("2026/27");
    expect(await db.sales.get("s2")).toBeUndefined();
  });

  it("recusa arquivo que não é backup", async () => {
    await expect(importBackup(new File(["{}"], "x.json"))).rejects.toThrow("não é um backup");
    await expect(importBackup(new File(["isso não é json"], "x.json"))).rejects.toThrow("não é um backup");
  });
});
