/**
 * Contorno de talhão: área, leitura de arquivos KML/GeoJSON e desenho em SVG.
 * Pontos são [longitude, latitude], como no GeoJSON. Funciona sem internet.
 */

export type LngLat = [number, number];

const EARTH_RADIUS_M = 6_371_008.8;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Projeção local em metros (equirretangular). Para talhões (poucos km) o erro é desprezível. */
function toMeters(ring: LngLat[]): [number, number][] {
  const lat0 = rad(ring.reduce((s, p) => s + p[1], 0) / ring.length);
  const cos0 = Math.cos(lat0);
  return ring.map(([lng, lat]) => [EARTH_RADIUS_M * rad(lng) * cos0, EARTH_RADIUS_M * rad(lat)]);
}

/** Tira o último ponto se ele repete o primeiro (anel fechado do GeoJSON/KML). */
export function openRing(ring: LngLat[]): LngLat[] {
  if (ring.length > 1) {
    const [a, b] = [ring[0], ring[ring.length - 1]];
    if (a[0] === b[0] && a[1] === b[1]) return ring.slice(0, -1);
  }
  return ring;
}

/** Área do polígono em hectares. Menos de 3 pontos: 0. */
export function polygonAreaHa(ring: LngLat[]): number {
  const pts = toMeters(openRing(ring));
  if (pts.length < 3) return 0;
  let twice = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    twice += x1 * y2 - x2 * y1;
  }
  return Math.abs(twice) / 2 / 10_000;
}

/** Distância em metros entre dois pontos. */
export function distanceM(a: LngLat, b: LngLat): number {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Perímetro em metros (fechando o polígono). */
export function perimeterM(ring: LngLat[]): number {
  const pts = openRing(ring);
  if (pts.length < 2) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length; i++) sum += distanceM(pts[i], pts[(i + 1) % pts.length]);
  return sum;
}

/** Centro (média dos vértices), bom o bastante para rótulo e link de rota. */
export function center(ring: LngLat[]): LngLat {
  const pts = openRing(ring);
  return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
}

/** Só acrescenta o ponto do GPS se ele andou pelo menos `minM` metros desde o último. */
export function addTrackPoint(track: LngLat[], p: LngLat, minM = 5): LngLat[] {
  const last = track[track.length - 1];
  return last && distanceM(last, p) < minM ? track : [...track, p];
}

const validPoint = (p: unknown): p is LngLat =>
  Array.isArray(p) &&
  typeof p[0] === "number" &&
  typeof p[1] === "number" &&
  Math.abs(p[0]) <= 180 &&
  Math.abs(p[1]) <= 90;

export type ImportedShape = { name: string; ring: LngLat[] };

function fromGeoJson(data: unknown): ImportedShape[] {
  const out: ImportedShape[] = [];
  const visit = (node: unknown, name: string) => {
    if (!node || typeof node !== "object") return;
    const n = node as { type?: string; features?: unknown[]; geometry?: unknown; properties?: Record<string, unknown>; coordinates?: unknown; geometries?: unknown[] };
    if (n.type === "FeatureCollection") n.features?.forEach((f, i) => visit(f, `${name || "Área"} ${i + 1}`));
    else if (n.type === "Feature") {
      const p = n.properties ?? {};
      const label = [p.name, p.nome, p.Name, p.NOME, p.talhao, p.TALHAO].find((v) => typeof v === "string" || typeof v === "number");
      visit(n.geometry, label != null ? String(label) : name);
    } else if (n.type === "GeometryCollection") n.geometries?.forEach((g) => visit(g, name));
    else if (n.type === "Polygon" && Array.isArray(n.coordinates)) {
      const ring = (n.coordinates[0] as unknown[] | undefined)?.filter(validPoint) ?? [];
      if (ring.length >= 3) out.push({ name, ring: openRing(ring.map((p) => [p[0], p[1]])) });
    } else if (n.type === "MultiPolygon" && Array.isArray(n.coordinates)) {
      const polys = n.coordinates as unknown[][];
      polys.forEach((poly, i) => {
        const ring = (poly?.[0] as unknown[] | undefined)?.filter(validPoint) ?? [];
        if (ring.length >= 3) {
          out.push({ name: polys.length > 1 ? `${name} (${i + 1})` : name, ring: openRing(ring.map((p) => [p[0], p[1]])) });
        }
      });
    }
  };
  visit(data, "");
  return out;
}

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();

function parseKmlCoords(text: string): LngLat[] {
  return text
    .trim()
    .split(/\s+/)
    .map((tuple) => tuple.split(",").map(Number))
    .filter((p) => p.length >= 2 && validPoint([p[0], p[1]]))
    .map((p) => [p[0], p[1]] as LngLat);
}

function fromKml(text: string): ImportedShape[] {
  const out: ImportedShape[] = [];
  const placemarks = text.match(/<Placemark[\s>][\s\S]*?<\/Placemark>/gi) ?? [];
  placemarks.forEach((pm, i) => {
    const name = decode(/<name>([\s\S]*?)<\/name>/i.exec(pm)?.[1] ?? "") || `Área ${i + 1}`;
    const polygons = pm.match(/<Polygon[\s>][\s\S]*?<\/Polygon>/gi) ?? [];
    polygons.forEach((poly, j) => {
      const outer = /<outerBoundaryIs>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/i.exec(poly)?.[1] ?? /<coordinates>([\s\S]*?)<\/coordinates>/i.exec(poly)?.[1];
      const ring = openRing(parseKmlCoords(outer ?? ""));
      if (ring.length >= 3) out.push({ name: polygons.length > 1 ? `${name} (${j + 1})` : name, ring });
    });
  });
  return out;
}

/** Lê os polígonos de um arquivo KML ou GeoJSON. Nada reconhecido: lista vazia. */
export function parseShapes(text: string): ImportedShape[] {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return fromGeoJson(JSON.parse(trimmed));
    } catch {
      return [];
    }
  }
  if (/<kml[\s>]/i.test(trimmed) || /<Placemark/i.test(trimmed)) return fromKml(trimmed);
  return [];
}

export type Projected = { path: string; label: [number, number] };

/**
 * Projeta vários contornos num quadro de `width` × `height` (SVG), mantendo a proporção.
 * Norte para cima.
 */
export function projectShapes(rings: LngLat[][], width: number, height: number, pad = 16): Projected[] {
  const all = rings.flat();
  if (all.length === 0) return [];
  const lat0 = rad(all.reduce((s, p) => s + p[1], 0) / all.length);
  const cos0 = Math.cos(lat0);
  const xy = (p: LngLat): [number, number] => [p[0] * cos0, -p[1]];
  const pts = all.map(xy);
  const minX = Math.min(...pts.map((p) => p[0]));
  const maxX = Math.max(...pts.map((p) => p[0]));
  const minY = Math.min(...pts.map((p) => p[1]));
  const maxY = Math.max(...pts.map((p) => p[1]));
  const spanX = maxX - minX || 1e-9;
  const spanY = maxY - minY || 1e-9;
  const scale = Math.min((width - 2 * pad) / spanX, (height - 2 * pad) / spanY);
  const offX = (width - spanX * scale) / 2;
  const offY = (height - spanY * scale) / 2;
  const map = (p: LngLat): [number, number] => {
    const [x, y] = xy(p);
    return [offX + (x - minX) * scale, offY + (y - minY) * scale];
  };
  return rings.map((ring) => {
    const mapped = openRing(ring).map(map);
    const path = mapped.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ") + " Z";
    return { path, label: map(center(ring)) };
  });
}

const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Arquivo KML com os contornos (abre no Google Earth e em outros programas de mapa). */
export function toKml(docName: string, shapes: ImportedShape[]): string {
  const placemarks = shapes
    .map(({ name, ring }) => {
      const pts = openRing(ring);
      const coords = [...pts, pts[0]].map(([lng, lat]) => `${lng},${lat},0`).join(" ");
      return `<Placemark><name>${escapeXml(name)}</name><Polygon><outerBoundaryIs><LinearRing><coordinates>${coords}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${escapeXml(docName)}</name>\n${placemarks}\n</Document></kml>\n`;
}

/** Link para abrir o ponto no app de mapas do celular (rota até o talhão). */
export function mapsLink([lng, lat]: LngLat): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`;
}
