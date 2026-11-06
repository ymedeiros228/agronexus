import { beforeEach, describe, expect, it } from "vitest";
import { db, newBase, restoreRemoved, type Plot } from "./db";
import type { LngLat } from "./geo";
import { createPoint, farmGeoJson, farmKml, plotAt, pointKindInfo, removePoint, updatePoint } from "./points";

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

// Quadrado de ~1 km perto de Balsas (MA).
const square: LngLat[] = [
  [-46.0, -7.5],
  [-45.99, -7.5],
  [-45.99, -7.51],
  [-46.0, -7.51],
];
const plot = (id: string, boundary: LngLat[] | null): Plot =>
  ({ ...newBase(), id, farmId: "f1", name: `Talhão ${id}`, areaHa: 100, boundary }) as Plot;

describe("plotAt", () => {
  it("acha o talhão pelo contorno e ignora quem não tem contorno", () => {
    const plots = [plot("sem", null), plot("t1", square)];
    expect(plotAt([-45.995, -7.505], plots)?.id).toBe("t1");
    expect(plotAt([-45.9, -7.505], plots)).toBeNull();
  });
});

describe("criar, mudar e remover ponto", () => {
  it("grava o talhão, refaz ao mover e volta com Desfazer", async () => {
    await db.plots.add(plot("t1", square));
    const p = await createPoint("f1", { kind: "armadilha", name: "  ", note: " lagarta ", lng: -45.995, lat: -7.505 });
    expect(p.plotId).toBe("t1");
    expect(p.name).toBe("Armadilha");
    expect(p.note).toBe("lagarta");

    await updatePoint(p.id, { kind: "sede", name: "Casa", note: "", lng: -45.9, lat: -7.505 });
    const moved = await db.points.get(p.id);
    expect(moved?.plotId).toBeNull();
    expect(moved?.name).toBe("Casa");

    const at = await removePoint(p.id);
    expect((await db.points.get(p.id))?.deletedAt).toBe(at);
    await restoreRemoved(at);
    expect((await db.points.get(p.id))?.deletedAt).toBeFalsy();
  });
});

describe("exportar a fazenda", () => {
  const point = { ...newBase(), farmId: "f1", plotId: null, kind: "agua" as const, name: "Poço & bomba", note: "", lng: -45.12345678, lat: -7.1 };

  it("KML leva talhões e pontos, com o texto escapado", () => {
    const kml = farmKml("Fazenda", [{ name: "T1", ring: square }], [point]);
    expect(kml).toContain("<Point><coordinates>-45.1234568,-7.1000000,0</coordinates></Point>");
    expect(kml).toContain("Poço &amp; bomba");
  });

  it("GeoJSON fecha o polígono e marca o tipo do ponto", () => {
    const geo = JSON.parse(farmGeoJson([{ name: "T1", ring: square }, { name: "vazio", ring: [] }], [point]));
    expect(geo.features).toHaveLength(2);
    const ring = geo.features[0].geometry.coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(geo.features[1].properties.tipo).toBe(pointKindInfo("agua").label);
    expect(geo.features[1].geometry.coordinates).toEqual([-45.1234568, -7.1]);
  });
});
