import { beforeEach, describe, expect, it } from "vitest";
import { db, newBase } from "./db";
import { DEMO_PREFIX, buildDemo, demoLoaded, loadDemo, removeDemo } from "./demo";
import { polygonAreaHa } from "./geo";
import { stockOf } from "./stock";

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

const NOW = new Date(2026, 9, 4, 12).getTime();

describe("buildDemo", () => {
  const d = buildDemo(NOW);

  it("usa a safra de hoje e a anterior", () => {
    expect(new Set(d.seasons.map((s) => s.label))).toEqual(new Set(["2026/27", "2025/26"]));
    expect(new Set(d.sales.map((s) => s.seasonLabel))).toEqual(new Set(["2026/27", "2025/26"]));
  });

  it("todas as referências apontam para registros do próprio exemplo", () => {
    const ids = new Set(Object.values(d).flatMap((rows) => rows.map((r: { id: string }) => r.id)));
    for (const rows of Object.values(d)) {
      for (const r of rows as Record<string, unknown>[]) {
        expect(String(r.id).startsWith(DEMO_PREFIX)).toBe(true);
        for (const k of ["farmId", "plotId", "seasonId", "visitId", "supplyId", "operationId"]) {
          if (r[k] != null) expect(ids.has(r[k] as string), `${r.id}.${k}`).toBe(true);
        }
      }
    }
  });

  it("área informada bate com o contorno", () => {
    for (const p of d.plots) expect(Math.abs(polygonAreaHa(p.boundary!) - p.areaHa!) / p.areaHa!).toBeLessThan(0.02);
  });

  it("estoque nunca fica negativo", () => {
    for (const s of stockOf(d.supplies, d.stockMoves, d.operations)) expect(s.balance).toBeGreaterThanOrEqual(0);
  });
});

describe("loadDemo / removeDemo", () => {
  it("carrega, marca e apaga só o exemplo e o que foi criado dentro dele", async () => {
    await db.farms.add({ ...newBase(), id: "minha", name: "Minha", municipality: "", owner: "" });
    await loadDemo(NOW);
    expect(await demoLoaded()).toBe(true);
    expect(await db.plots.count()).toBe(6);

    // Visita nova feita pelo usuário num talhão de exemplo, com achado.
    await db.visits.add({
      ...newBase(),
      id: "nova",
      farmId: `${DEMO_PREFIX}f1`,
      plotId: `${DEMO_PREFIX}p1`,
      date: "2026-10-04",
      stage: "V4",
      observations: "",
      recommendation: "",
      followUpDate: null,
      followUpDone: false,
    });
    await db.findings.add({ ...newBase(), id: "achado", visitId: "nova", kind: "praga", name: "x", amount: "", note: "" });

    await removeDemo();
    expect(await demoLoaded()).toBe(false);
    expect(await db.farms.toCollection().primaryKeys()).toEqual(["minha"]);
    for (const t of db.tables.filter((t) => t.name !== "farms" && t.name !== "meta")) expect(await t.count(), t.name).toBe(0);
  });
});
