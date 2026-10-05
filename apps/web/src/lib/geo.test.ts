import { describe, expect, it } from "vitest";
import {
  addTrackPoint,
  center,
  distanceM,
  fitView,
  fromWorld,
  mapsLink,
  openRing,
  parseShapes,
  perimeterM,
  polygonAreaHa,
  projectShapes,
  selfIntersects,
  toKml,
  toWorld,
  type LngLat,
} from "./geo";

// Quadrado de 1 km × 1 km perto de Balsas (MA).
const LAT = -7.53;
const LNG = -46.04;
const dLat = 1000 / ((6_371_008.8 * Math.PI) / 180);
const dLng = dLat / Math.cos((LAT * Math.PI) / 180);
const square: LngLat[] = [
  [LNG, LAT],
  [LNG + dLng, LAT],
  [LNG + dLng, LAT + dLat],
  [LNG, LAT + dLat],
];

describe("área e medidas", () => {
  it("quadrado de 1 km tem 100 ha e 4 km de perímetro", () => {
    expect(polygonAreaHa(square)).toBeCloseTo(100, 0);
    expect(perimeterM(square)).toBeCloseTo(4000, -1);
  });

  it("anel fechado (último = primeiro) dá a mesma área; menos de 3 pontos dá zero", () => {
    expect(polygonAreaHa([...square, square[0]])).toBeCloseTo(polygonAreaHa(square), 6);
    expect(openRing([...square, square[0]])).toHaveLength(4);
    expect(polygonAreaHa(square.slice(0, 2))).toBe(0);
  });

  it("ordem horária ou anti-horária não muda a área", () => {
    expect(polygonAreaHa([...square].reverse())).toBeCloseTo(polygonAreaHa(square), 6);
  });

  it("GPS: ignora ponto a menos de 5 m do anterior", () => {
    const a: LngLat = [LNG, LAT];
    const near: LngLat = [LNG + dLng / 1000, LAT]; // 1 m
    const far: LngLat = [LNG + dLng / 100, LAT]; // 10 m
    expect(distanceM(a, far)).toBeCloseTo(10, 0);
    expect(addTrackPoint(addTrackPoint([a], near), far)).toEqual([a, far]);
  });

  it("centro e link de rota", () => {
    const [x, y] = center(square);
    expect(x).toBeCloseTo(LNG + dLng / 2, 9);
    expect(y).toBeCloseTo(LAT + dLat / 2, 9);
    expect(mapsLink([-46.04, -7.53])).toBe("https://www.google.com/maps/search/?api=1&query=-7.530000,-46.040000");
  });
});

describe("leitura de arquivos", () => {
  it("KML do Google Earth: nome, altitude e anel fechado", () => {
    const kml = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
      <Placemark><name><![CDATA[T-12 & vizinho]]></name><Polygon><outerBoundaryIs><LinearRing><coordinates>
        -46.04,-7.53,0 -46.03,-7.53,0 -46.03,-7.52,0 -46.04,-7.52,0 -46.04,-7.53,0
      </coordinates></LinearRing></outerBoundaryIs><innerBoundaryIs><LinearRing><coordinates>
        -46.035,-7.525,0 -46.034,-7.525,0 -46.034,-7.524,0
      </coordinates></LinearRing></innerBoundaryIs></Polygon></Placemark>
      <Placemark><name>Sede</name><Point><coordinates>-46.0,-7.5,0</coordinates></Point></Placemark>
    </Document></kml>`;
    const shapes = parseShapes(kml);
    expect(shapes).toHaveLength(1);
    expect(shapes[0].name).toBe("T-12 & vizinho");
    expect(shapes[0].ring).toHaveLength(4);
    expect(shapes[0].ring[0]).toEqual([-46.04, -7.53]);
  });

  it("GeoJSON com nome em português e MultiPolygon", () => {
    const geo = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: { nome: "T-01" }, geometry: { type: "Polygon", coordinates: [[...square, square[0]]] } },
        {
          type: "Feature",
          properties: {},
          geometry: { type: "MultiPolygon", coordinates: [[square], [square.map(([x, y]) => [x + 1, y])]] },
        },
      ],
    };
    const shapes = parseShapes(JSON.stringify(geo));
    expect(shapes.map((s) => s.name)).toEqual(["T-01", "Área 2 (1)", "Área 2 (2)"]);
    expect(polygonAreaHa(shapes[0].ring)).toBeCloseTo(100, 0);
  });

  it("exporta KML e lê de volta igual", () => {
    const kml = toKml("Fazenda <Boa> Vista", [{ name: "T-1 & T-2", ring: square }]);
    expect(kml).toContain("<name>Fazenda &lt;Boa&gt; Vista</name>");
    const [back] = parseShapes(kml);
    expect(back.name).toBe("T-1 & T-2");
    expect(back.ring).toEqual(square);
  });

  it("arquivo que não é mapa vira lista vazia", () => {
    expect(parseShapes("isso não é mapa")).toEqual([]);
    expect(parseShapes("{ quebrado")).toEqual([]);
    expect(parseShapes('{"type":"Point","coordinates":[1,2]}')).toEqual([]);
  });
});

describe("desenho", () => {
  it("cabe no quadro, mantém a proporção e põe o norte para cima", () => {
    const east = square.map(([x, y]) => [x + dLng * 2, y] as LngLat);
    const [a, b] = projectShapes([square, east], 300, 100, 10);
    const nums = (p: string) => p.match(/-?\d+(\.\d+)?/g)!.map(Number);
    for (const n of [...nums(a.path), ...nums(b.path)]) {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(300);
    }
    expect(b.label[0]).toBeGreaterThan(a.label[0]); // leste fica à direita
    const ys = nums(a.path).filter((_, i) => i % 2 === 1);
    // primeiro ponto é o sul (y maior, mais embaixo)
    expect(ys[0]).toBeGreaterThan(Math.min(...ys));
  });
});

describe("mapa em ladrilhos", () => {
  it("toWorld e fromWorld são inversos", () => {
    const p: LngLat = [LNG, LAT];
    const back = fromWorld(toWorld(p, 15), 15);
    expect(back[0]).toBeCloseTo(LNG, 9);
    expect(back[1]).toBeCloseTo(LAT, 9);
    expect(toWorld([0, 0], 0)).toEqual([128, 128]);
    expect(toWorld([-180, 0], 1)[0]).toBe(0);
  });

  it("fitView enquadra o talhão com folga", () => {
    const ring: LngLat[] = [
      [LNG, LAT],
      [LNG + dLng, LAT],
      [LNG + dLng, LAT + dLat],
      [LNG, LAT + dLat],
    ];
    const { center: c, zoom } = fitView([ring], 400, 400);
    // 1 km em ~ 0,8 × 400 px: zoom 15 (≈ 4,8 m/px) cabe, 16 não.
    expect(zoom).toBe(15);
    expect(c[0]).toBeCloseTo(LNG + dLng / 2, 4);
    expect(c[1]).toBeCloseTo(LAT + dLat / 2, 4);
    expect(fitView([], 400, 400).zoom).toBe(4);
  });

  it("selfIntersects acha o desenho em 8", () => {
    const square: LngLat[] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    expect(selfIntersects(square)).toBe(false);
    expect(selfIntersects([square[0], square[1], square[3], square[2]])).toBe(true);
    expect(selfIntersects([...square, square[0]])).toBe(false);
  });
});
