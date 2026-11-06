import { alive, db, newBase, type MapPoint, type Plot, type PointKind } from "./db";
import { escapeXml, openRing as openRingOf, pointInRing, toKml, type ImportedShape, type LngLat } from "./geo";

/**
 * Pontos marcados no mapa da fazenda (Etapa 4): sede, porteira, armadilha, amostra de solo,
 * reboleira, água. Marcados tocando no satélite, pelo GPS ou por coordenada.
 */

export const POINT_KINDS: { kind: PointKind; label: string; color: string }[] = [
  { kind: "sede", label: "Sede", color: "#2563eb" },
  { kind: "porteira", label: "Porteira", color: "#64748b" },
  { kind: "armadilha", label: "Armadilha", color: "#dc2626" },
  { kind: "amostra", label: "Amostra de solo", color: "#a16207" },
  { kind: "reboleira", label: "Reboleira", color: "#ea580c" },
  { kind: "agua", label: "Água / poço", color: "#0891b2" },
  { kind: "outro", label: "Outro", color: "#7c3aed" },
];

export function pointKindInfo(kind: PointKind) {
  return POINT_KINDS.find((k) => k.kind === kind) ?? POINT_KINDS[POINT_KINDS.length - 1];
}

/** Talhão em que o ponto caiu, pelo contorno. Fora de todos: nenhum. */
export function plotAt(p: LngLat, plots: Plot[]): Plot | null {
  return plots.find((pl) => (pl.boundary?.length ?? 0) >= 3 && pointInRing(p, pl.boundary!)) ?? null;
}

export type PointInput = { kind: PointKind; name: string; note: string; lng: number; lat: number };

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

async function farmPlots(farmId: string) {
  return alive(await db.plots.where("farmId").equals(farmId).toArray());
}

export async function createPoint(farmId: string, input: PointInput): Promise<MapPoint> {
  const plot = plotAt([input.lng, input.lat], await farmPlots(farmId));
  const point: MapPoint = {
    ...newBase(),
    farmId,
    plotId: plot?.id ?? null,
    kind: input.kind,
    name: clean(input.name) || pointKindInfo(input.kind).label,
    note: input.note.trim(),
    lng: input.lng,
    lat: input.lat,
  };
  await db.points.add(point);
  return point;
}

/** Mudou de lugar: o talhão é achado de novo pelo contorno. */
export async function updatePoint(id: string, input: PointInput): Promise<void> {
  const old = await db.points.get(id);
  if (!old || old.deletedAt) throw new Error("Ponto não encontrado.");
  const plot = plotAt([input.lng, input.lat], await farmPlots(old.farmId));
  await db.points.update(id, {
    kind: input.kind,
    name: clean(input.name) || pointKindInfo(input.kind).label,
    note: input.note.trim(),
    lng: input.lng,
    lat: input.lat,
    plotId: plot?.id ?? null,
    updatedAt: Date.now(),
  });
}

/** Exclusão lógica; o carimbo serve para o "Desfazer" (`restoreRemoved`). */
export async function removePoint(id: string): Promise<number> {
  const now = Date.now();
  await db.points.update(id, { deletedAt: now, updatedAt: now });
  return now;
}

/** KML da fazenda: talhões e pontos, para abrir no Google Earth. */
export function farmKml(farmName: string, plots: ImportedShape[], points: MapPoint[]): string {
  const kml = toKml(farmName, plots);
  if (!points.length) return kml;
  const marks = points
    .map(
      (p) =>
        `<Placemark><name>${escapeXml(p.name)}</name><description>${escapeXml([pointKindInfo(p.kind).label, p.note].filter(Boolean).join(" · "))}</description><Point><coordinates>${p.lng.toFixed(7)},${p.lat.toFixed(7)},0</coordinates></Point></Placemark>`,
    )
    .join("");
  return kml.replace("</Document>", `${marks}</Document>`);
}

const r7 = (n: number) => Math.round(n * 1e7) / 1e7;

/** GeoJSON da fazenda: um polígono por talhão e um ponto por marcação (QGIS, CAR, outros sistemas). */
export function farmGeoJson(plots: ImportedShape[], points: MapPoint[]): string {
  const polygons = plots
    .filter((s) => s.ring.length >= 3)
    .map((s) => {
      const ring = openRingOf(s.ring);
      return {
        type: "Feature",
        properties: { name: s.name, tipo: "talhão" },
        geometry: { type: "Polygon", coordinates: [[...ring, ring[0]].map(([lng, lat]) => [r7(lng), r7(lat)])] },
      };
    });
  const marks = points.map((p) => ({
    type: "Feature",
    properties: { name: p.name, tipo: pointKindInfo(p.kind).label, nota: p.note },
    geometry: { type: "Point", coordinates: [r7(p.lng), r7(p.lat)] },
  }));
  return JSON.stringify({ type: "FeatureCollection", features: [...polygons, ...marks] }, null, 2);
}
