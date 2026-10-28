import Dexie from "dexie";
import { describe, expect, it } from "vitest";

describe("migração v1 → v2", () => {
  it("põe cada visita antiga na safra vigente do talhão, sem mexer em updatedAt", async () => {
    const old = new Dexie("agronexus");
    old.version(1).stores({
      farms: "id, name, updatedAt",
      plots: "id, farmId, updatedAt",
      seasons: "id, plotId, updatedAt",
      visits: "id, farmId, plotId, date, updatedAt",
      findings: "id, visitId, updatedAt",
      photos: "id, visitId, updatedAt",
      rainfall: "id, farmId, date, updatedAt",
    });
    await old.open();
    await old.table("seasons").bulkAdd([
      { id: "s-old", plotId: "p1", label: "2025/26", createdAt: 1, updatedAt: 1 },
      { id: "s-new", plotId: "p1", label: "2026/27", createdAt: 2, updatedAt: 2 },
      { id: "s-gone", plotId: "p1", label: "errada", createdAt: 3, updatedAt: 3, deletedAt: 3 },
      { id: "s-long", plotId: "p2", label: "2024/2025", createdAt: 1, updatedAt: 1 },
    ]);
    await old.table("farms").bulkAdd([
      { id: "f1", name: "Santa Luzia", municipality: "Balsas", owner: "João Ribeiro", createdAt: 1, updatedAt: 1 },
      { id: "f2", name: "Retiro", municipality: "Balsas", owner: "joão  ribeiro", createdAt: 2, updatedAt: 2 },
      { id: "f3", name: "Sem dono", municipality: "", owner: "", createdAt: 3, updatedAt: 3 },
    ]);
    await old.table("visits").bulkAdd([
      { id: "v1", plotId: "p1", farmId: "f1", date: "2026-10-01", createdAt: 5, updatedAt: 5 },
      { id: "v2", plotId: "p-sem-safra", farmId: "f1", date: "2026-10-01", createdAt: 5, updatedAt: 5 },
    ]);
    old.close();

    const { db } = await import("./db");
    const v1 = await db.visits.get("v1");
    expect(v1?.seasonId).toBe("s-new");
    expect(v1?.updatedAt).toBe(5);
    expect((await db.visits.get("v2"))?.seasonId).toBeNull();
    expect(await db.visits.where("seasonId").equals("s-new").count()).toBe(1);

    // v6: rótulo padronizado; o que não é par de anos fica como estava.
    const long = await db.seasons.get("s-long");
    expect(long?.label).toBe("2024/25");
    expect(long?.updatedAt).toBe(1);
    expect((await db.seasons.get("s-gone"))?.label).toBe("errada");

    // v7: o produtor escrito nas fazendas vira cliente da carteira.
    const [f1, f2, f3] = await db.farms.bulkGet(["f1", "f2", "f3"]);
    expect(f1?.clientId).toBeTruthy();
    expect(f2?.clientId).toBe(f1?.clientId);
    expect(f3?.clientId).toBeUndefined();
    expect(f1?.updatedAt).toBe(1);
    const clients = await db.clients.toArray();
    expect(clients.map((c) => [c.name, c.municipality])).toEqual([["João Ribeiro", "Balsas"]]);

    // v8: tudo o que já existia fica pendente, para subir no primeiro login.
    expect(await db.farms.where("_pendente").equals(1).count()).toBe(3);
    expect(await db.visits.where("_pendente").equals(1).count()).toBe(2);
    expect(await db.clients.where("_pendente").equals(1).count()).toBe(1);
    expect(f1?._pendente).toBe(1);
  });
});
