import { center, openRing, type LngLat } from "./geo";

/**
 * Coordenadas digitadas ou coladas (Etapa 4): graus decimais, graus-minutos-segundos (GMS),
 * UTM no SIRGAS 2000 e WKT. SIRGAS 2000 e WGS 84 diferem em centímetros: para talhão, são o mesmo.
 * Tudo vira [longitude, latitude], como no resto do app.
 */

// Elipsoide GRS80, o do SIRGAS 2000.
const A = 6_378_137;
const F = 1 / 298.257222101;
const E2 = F * (2 - F);
const EP2 = E2 / (1 - E2);
const K0 = 0.9996;
const FALSE_EASTING = 500_000;
const FALSE_NORTHING_SOUTH = 10_000_000;

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export type Hemisphere = "S" | "N";
export type Utm = { e: number; n: number; zone: number; hemisphere: Hemisphere };

/** Fuso UTM de uma longitude (o Brasil vai do 18 ao 25). */
export function utmZoneOf(lng: number): number {
  return Math.min(60, Math.max(1, Math.floor((lng + 180) / 6) + 1));
}

const centralMeridian = (zone: number) => (zone - 1) * 6 - 180 + 3;

/** Distância ao longo do meridiano, do equador até a latitude (em radianos). */
function meridianArc(phi: number): number {
  const e4 = E2 * E2;
  const e6 = e4 * E2;
  return (
    A *
    ((1 - E2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * phi -
      ((3 * E2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * phi) +
      ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * phi) -
      ((35 * e6) / 3072) * Math.sin(6 * phi))
  );
}

/** Geográfica → UTM (fórmulas de Snyder; erro de milímetros dentro do fuso). */
export function toUtm([lng, lat]: LngLat, zone = utmZoneOf(lng)): Utm {
  const phi = rad(lat);
  const sin = Math.sin(phi);
  const cos = Math.cos(phi);
  const tan = Math.tan(phi);
  const N = A / Math.sqrt(1 - E2 * sin * sin);
  const T = tan * tan;
  const C = EP2 * cos * cos;
  const a = cos * rad(lng - centralMeridian(zone));
  const e =
    K0 * N * (a + ((1 - T + C) * a ** 3) / 6 + ((5 - 18 * T + T * T + 72 * C - 58 * EP2) * a ** 5) / 120) + FALSE_EASTING;
  let n =
    K0 *
    (meridianArc(phi) +
      N * tan * (a ** 2 / 2 + ((5 - T + 9 * C + 4 * C * C) * a ** 4) / 24 + ((61 - 58 * T + T * T + 600 * C - 330 * EP2) * a ** 6) / 720));
  const hemisphere: Hemisphere = lat < 0 ? "S" : "N";
  if (hemisphere === "S") n += FALSE_NORTHING_SOUTH;
  return { e, n, zone, hemisphere };
}

/** UTM → geográfica. */
export function fromUtm({ e, n, zone, hemisphere }: Utm): LngLat {
  const x = e - FALSE_EASTING;
  const y = hemisphere === "S" ? n - FALSE_NORTHING_SOUTH : n;
  const e4 = E2 * E2;
  const e6 = e4 * E2;
  const mu = y / K0 / (A * (1 - E2 / 4 - (3 * e4) / 64 - (5 * e6) / 256));
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const sin1 = Math.sin(phi1);
  const cos1 = Math.cos(phi1);
  const tan1 = Math.tan(phi1);
  const C1 = EP2 * cos1 * cos1;
  const T1 = tan1 * tan1;
  const N1 = A / Math.sqrt(1 - E2 * sin1 * sin1);
  const R1 = (A * (1 - E2)) / (1 - E2 * sin1 * sin1) ** 1.5;
  const D = x / (N1 * K0);
  const lat =
    phi1 -
    ((N1 * tan1) / R1) *
      (D ** 2 / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * EP2) * D ** 4) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * EP2 - 3 * C1 * C1) * D ** 6) / 720);
  const lng =
    rad(centralMeridian(zone)) +
    (D - ((1 + 2 * T1 + C1) * D ** 3) / 6 + ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * EP2 + 24 * T1 * T1) * D ** 5) / 120) / cos1;
  return [deg(lng), deg(lat)];
}

/**
 * Número de coordenada: vírgula decimal ("-6,5123") ou ponto ("-6.5123"). Com vírgula, ponto é
 * milhar ("9.281.234,56"); sem vírgula, dois ou mais pontos também são milhar ("9.281.234").
 * Não usa o parseNumberBR porque lá "6.512" vira seis mil (aqui é latitude).
 */
export function parseCoordNumber(raw: string): number | null {
  const s = raw.trim().replace(/[−–]/g, "-");
  if (!/^[-+]?\d[\d.,]*$/.test(s)) return null;
  let t = s;
  if (s.includes(",")) t = s.replace(/\./g, "").replace(",", ".");
  else if ((s.match(/\./g) ?? []).length > 1) t = s.replace(/\./g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export type CoordFormat = "decimal" | "gms" | "utm" | "wkt" | "geojson";
export type Order = "latlng" | "lnglat";

export type ParsedCoords = {
  format: CoordFormat | null;
  points: LngLat[];
  /** Linhas que não deu para ler (número da linha a partir de 1 e o texto). */
  problems: { line: number; text: string }[];
  /** Só nos graus decimais sem hemisfério: qual número veio primeiro. */
  order?: Order;
};

const inBrazilLng = (v: number) => v <= -28 && v >= -75;

/** Um valor GMS ("6°30'44,3\"S", "S 6 30 44.3", "46º07'24\" O"). Volta grau decimal com sinal e o eixo. */
function parseDms(text: string): { value: number; axis: "lat" | "lng" | null } | null {
  const m = /^([NSLOEW])?\s*(-)?\s*(\d{1,3})\s*[°º:\s]\s*(\d{1,2})\s*(?:['’′:\s]\s*(\d{1,2}(?:[.,]\d+)?)\s*(?:["”″]|'')?)?\s*([NSLOEW])?$/i.exec(
    text.trim(),
  );
  if (!m) return null;
  const [, before, minus, d, mi, se, after] = m;
  const minutes = Number(mi);
  const seconds = se ? Number(se.replace(",", ".")) : 0;
  if (minutes >= 60 || seconds >= 60) return null;
  const hemi = (before ?? after ?? "").toUpperCase();
  let value = Number(d) + minutes / 60 + seconds / 3600;
  if (minus || hemi === "S" || hemi === "O" || hemi === "W") value = -value;
  const axis = hemi === "N" || hemi === "S" ? "lat" : hemi ? "lng" : null;
  return { value, axis };
}

/** Separa uma linha GMS em duas coordenadas: pelo hemisfério, por ";" / tab, ou pela vírgula entre elas. */
function splitDmsLine(line: string): [string, string] | null {
  const byLetter = /^(.*?[NSLOEW])\s*[,;\t]?\s*(.+)$/i.exec(line.trim());
  if (byLetter && parseDms(byLetter[1]) && parseDms(byLetter[2])) return [byLetter[1], byLetter[2]];
  const parts = line.split(/\s*[;\t]\s*|\s*,\s+(?=[-NSLOEW\d])/i).filter(Boolean);
  return parts.length === 2 ? [parts[0], parts[1]] : null;
}

/** Números soltos da linha (UTM e graus decimais), sem separadores no fim. */
function numbersOf(line: string): number[] {
  const tokens = line.replace(/[−–]/g, "-").match(/[-+]?\d[\d.,]*/g) ?? [];
  return tokens.map((t) => parseCoordNumber(t.replace(/[.,]+$/, ""))).filter((n): n is number => n !== null);
}

function wktPoints(text: string): LngLat[] {
  // Primeiro anel do primeiro polígono (o contorno de fora); POINT e LINESTRING também servem.
  const body = /\(\s*\(?\s*([^()]+)\)/.exec(text)?.[1] ?? "";
  return openRing(
    body
      .split(",")
      .map((pair) => pair.trim().split(/\s+/).map(Number))
      .filter((p) => p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))
      .map((p) => [p[0], p[1]] as LngLat),
  );
}

/**
 * Lê vértices colados ou digitados, um por linha. Reconhece o formato sozinho; UTM precisa do fuso e
 * do hemisfério (`utm`). `order` força a ordem dos graus decimais ("latlng" é o padrão do Google Maps).
 */
export function parseCoords(
  text: string,
  opts: { utm?: { zone: number; hemisphere: Hemisphere }; order?: Order } = {},
): ParsedCoords {
  const trimmed = text.trim();
  if (!trimmed) return { format: null, points: [], problems: [] };
  if (/^(MULTI)?(POLYGON|POINT|LINESTRING)\s*(Z\s*)?\(/i.test(trimmed)) {
    const points = wktPoints(trimmed);
    return { format: "wkt", points, problems: points.length ? [] : [{ line: 1, text: trimmed.slice(0, 60) }] };
  }

  const lines = trimmed.split(/\r?\n/).map((l) => l.trim());
  const content = lines.filter(Boolean);
  // Grau nenhum passa de 180: número grande é UTM, mesmo com "E" e "N" escritos na linha.
  const looksUtm = content.some((l) => numbersOf(l).some((n) => Math.abs(n) > 1000));
  const looksDms =
    !looksUtm && content.some((l) => /[°º'"″′]/.test(l) || /\d\s*[NSLOEW]\b/i.test(l) || /^[NSLOEW]\s*\d/i.test(l));

  const points: LngLat[] = [];
  const problems: ParsedCoords["problems"] = [];
  let order: Order | undefined;

  lines.forEach((line, i) => {
    if (!/\d/.test(line)) return; // linha vazia ou cabeçalho ("Vértice;Latitude;Longitude")
    if (looksDms) {
      const pair = splitDmsLine(line);
      const a = pair && parseDms(pair[0]);
      const b = pair && parseDms(pair[1]);
      if (!a || !b) return void problems.push({ line: i + 1, text: line });
      // Hemisfério manda; sem ele, latitude primeiro.
      const latFirst = a.axis === "lat" || b.axis === "lng" || (a.axis === null && b.axis === null);
      points.push(latFirst ? [b.value, a.value] : [a.value, b.value]);
      return;
    }
    const nums = numbersOf(line);
    // Vértice numerado ("1; 423456,78; 9281234,56" ou "P1 ..."): fica com os dois últimos números.
    const pair = nums.length >= 2 ? nums.slice(-2) : null;
    if (!pair) return void problems.push({ line: i + 1, text: line });
    if (looksUtm) {
      if (!opts.utm) return void problems.push({ line: i + 1, text: line });
      // Rótulos "N ... E ..." invertem a ordem; o padrão é E (leste) e depois N (norte).
      const nFirst = /\bN\b[^E]*\bE\b/i.test(line) || (pair[0] > 1_500_000 && pair[1] < 1_000_000);
      const [e, n] = nFirst ? [pair[1], pair[0]] : pair;
      if (e < 100_000 || e > 900_000 || n < 0 || n > 10_000_000) return void problems.push({ line: i + 1, text: line });
      points.push(fromUtm({ e, n, ...opts.utm }));
      return;
    }
    const [x, y] = pair;
    if (Math.abs(x) > 180 || Math.abs(y) > 180) return void problems.push({ line: i + 1, text: line });
    // Ordem: a escolhida; senão, longitude é o número que só pode ser longitude no Brasil.
    const lineOrder: Order = opts.order ?? (inBrazilLng(x) && !inBrazilLng(y) ? "lnglat" : "latlng");
    order ??= lineOrder;
    const [lat, lng] = lineOrder === "latlng" ? [x, y] : [y, x];
    if (Math.abs(lat) > 90) return void problems.push({ line: i + 1, text: line });
    points.push([lng, lat]);
  });

  return {
    format: looksDms ? "gms" : looksUtm ? "utm" : "decimal",
    points: openRing(points),
    problems,
    ...(order ? { order } : {}),
  };
}

/** Fuso sugerido para quem digita UTM: o do contorno que já existe ou o da fazenda. Sem nada, 23 (MA, TO, PI, BA). */
export function suggestUtmZone(known: LngLat[][]): { zone: number; hemisphere: Hemisphere } {
  const ring = known.find((r) => r.length >= 3);
  if (!ring) return { zone: 23, hemisphere: "S" };
  const [lng, lat] = center(ring);
  return { zone: utmZoneOf(lng), hemisphere: lat < 0 ? "S" : "N" };
}

const fixed = (n: number, digits: number) => n.toFixed(digits);

/** WKT do polígono, fechado, com 7 casas decimais (padrão pedido no Sicor/crédito rural). */
export function toWkt(ring: LngLat[]): string {
  const pts = openRing(ring);
  if (pts.length < 3) return "";
  const closed = [...pts, pts[0]];
  return `POLYGON((${closed.map(([lng, lat]) => `${fixed(lng, 7)} ${fixed(lat, 7)}`).join(", ")}))`;
}

export function toGeoJson(name: string, ring: LngLat[]): string {
  const pts = openRing(ring);
  return JSON.stringify(
    {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { name },
          geometry: { type: "Polygon", coordinates: [[...pts, pts[0]].map(([lng, lat]) => [Number(fixed(lng, 7)), Number(fixed(lat, 7))])] },
        },
      ],
    },
    null,
    2,
  );
}

/** Linhas da planilha de vértices: número, latitude, longitude, GMS e UTM (fuso do próprio contorno). */
export function vertexRows(ring: LngLat[]): (string | number)[][] {
  const pts = openRing(ring);
  if (!pts.length) return [];
  const zone = utmZoneOf(center(pts)[0]);
  return pts.map((p, i) => {
    const u = toUtm(p, zone);
    return [
      i + 1,
      fixed(p[1], 7).replace(".", ","),
      fixed(p[0], 7).replace(".", ","),
      toDms(p[1], "lat"),
      toDms(p[0], "lng"),
      fixed(u.e, 2).replace(".", ","),
      fixed(u.n, 2).replace(".", ","),
      `${u.zone}${u.hemisphere}`,
    ];
  });
}

export const VERTEX_HEADER = ["Vértice", "Latitude", "Longitude", "Latitude (GMS)", "Longitude (GMS)", "E (UTM)", "N (UTM)", "Fuso"];

/** Grau decimal → GMS no padrão brasileiro: 6°30'44,30" S, 46°07'24,40" O. */
export function toDms(value: number, axis: "lat" | "lng"): string {
  const hemi = axis === "lat" ? (value < 0 ? "S" : "N") : value < 0 ? "O" : "L";
  let total = Math.round(Math.abs(value) * 360_000); // centésimos de segundo
  const d = Math.floor(total / 360_000);
  total -= d * 360_000;
  const m = Math.floor(total / 6000);
  const s = (total - m * 6000) / 100;
  return `${d}°${String(m).padStart(2, "0")}'${s.toFixed(2).padStart(5, "0").replace(".", ",")}" ${hemi}`;
}
