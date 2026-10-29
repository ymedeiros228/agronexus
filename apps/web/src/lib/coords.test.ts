import { describe, expect, it } from "vitest";
import { fromUtm, parseCoordNumber, parseCoords, suggestUtmZone, toDms, toGeoJson, toUtm, toWkt, utmZoneOf, vertexRows } from "./coords";
import { polygonAreaHa, type LngLat } from "./geo";

/** Valores de referência calculados com o proj4 (SIRGAS 2000 / GRS80) em 29/10/2026. */
const REF = [
  { name: "Balsas (MA)", p: [-46.0356, -7.5325] as LngLat, zone: 23, e: 385745.442, n: 9167249.057 },
  { name: "Sorriso (MT)", p: [-55.7114, -12.5425] as LngLat, zone: 21, e: 639999.829, n: 8613114.672 },
  { name: "Passo Fundo (RS)", p: [-52.4064, -28.262] as LngLat, zone: 22, e: 362047.406, n: 6872972.193 },
  { name: "Boa Vista (RR)", p: [-60.6733, 2.8195] as LngLat, zone: 20, e: 758663.371, n: 311900.441 },
  { name: "Meridiano central 23", p: [-45, -10] as LngLat, zone: 23, e: 500000, n: 8894587.509 },
];

const close = (a: LngLat, b: LngLat, digits = 7) => {
  expect(a[0]).toBeCloseTo(b[0], digits);
  expect(a[1]).toBeCloseTo(b[1], digits);
};

describe("UTM SIRGAS 2000", () => {
  it.each(REF)("$name: igual ao proj4 em milímetros, ida e volta", ({ p, zone, e, n }) => {
    const u = toUtm(p);
    expect(u.zone).toBe(zone);
    expect(u.e).toBeCloseTo(e, 2);
    expect(u.n).toBeCloseTo(n, 2);
    close(fromUtm(u), p, 8);
  });

  it("fuso pela longitude e sugestão pelo contorno que já existe", () => {
    expect(utmZoneOf(-46.03)).toBe(23);
    expect(utmZoneOf(-48.01)).toBe(22);
    expect(utmZoneOf(-35)).toBe(25);
    expect(suggestUtmZone([])).toEqual({ zone: 23, hemisphere: "S" });
    expect(suggestUtmZone([[[-55.7, -12.5], [-55.6, -12.5], [-55.6, -12.4]]])).toEqual({ zone: 21, hemisphere: "S" });
  });

  it("quadrado de 1 km em UTM tem ~100 ha", () => {
    const zone = { zone: 23, hemisphere: "S" as const };
    const ring = [
      [500000, 9000000],
      [501000, 9000000],
      [501000, 9001000],
      [500000, 9001000],
    ].map(([e, n]) => fromUtm({ e, n, ...zone }));
    // Perto do meridiano central a escala é 0,9996: no terreno o lado tem 1.000,4 m.
    expect(polygonAreaHa(ring)).toBeCloseTo(100.08, 1);
  });
});

describe("números de coordenada", () => {
  it("vírgula ou ponto decimal; ponto de milhar no UTM; nunca lê 6.512 como seis mil", () => {
    expect(parseCoordNumber("-6,5123")).toBe(-6.5123);
    expect(parseCoordNumber("-6.5123")).toBe(-6.5123);
    expect(parseCoordNumber("6.512")).toBe(6.512);
    expect(parseCoordNumber("9.281.234,56")).toBe(9281234.56);
    expect(parseCoordNumber("9.281.234")).toBe(9281234);
    expect(parseCoordNumber("423456.78")).toBe(423456.78);
    expect(parseCoordNumber("−46,1")).toBe(-46.1);
    expect(parseCoordNumber("abc")).toBeNull();
  });
});

describe("leitura dos vértices", () => {
  it("graus decimais como o Google Maps copia (latitude, longitude)", () => {
    const r = parseCoords("-7.5325, -46.0356\n-7.5330, -46.0300\n-7.5400, -46.0310");
    expect(r.format).toBe("decimal");
    expect(r.order).toBe("latlng");
    expect(r.points).toHaveLength(3);
    close(r.points[0], [-46.0356, -7.5325]);
  });

  it("graus decimais com vírgula, ponto e vírgula, cabeçalho e vértice numerado", () => {
    const r = parseCoords("Vértice;Latitude;Longitude\n1;-7,5325;-46,0356\n2;-7,5330;-46,0300\n3;-7,5400;-46,0310");
    expect(r.problems).toEqual([]);
    close(r.points[2], [-46.031, -7.54]);
  });

  it("longitude primeiro é percebida (no Brasil a longitude é menor que -28)", () => {
    const r = parseCoords("-46.0356 -7.5325\n-46.0300 -7.5330\n-46.0310 -7.5400");
    expect(r.order).toBe("lnglat");
    close(r.points[0], [-46.0356, -7.5325]);
    // E a ordem pode ser forçada.
    expect(parseCoords("-46.0356 -7.5325", { order: "latlng" }).problems).toHaveLength(0);
  });

  it("GMS com hemisfério (S, O, W, L) antes ou depois, aspas tortas e vírgula nos segundos", () => {
    const r = parseCoords(`7°31'57,0" S 46°02'08,2" O\nS 7 31 58.0, W 46 02 00.0\n7º32'24"S;46º01'51,6"W`);
    expect(r.format).toBe("gms");
    expect(r.problems).toEqual([]);
    close(r.points[0], [-(46 + 2 / 60 + 8.2 / 3600), -(7 + 31 / 60 + 57 / 3600)]);
    close(r.points[1], [-(46 + 2 / 60), -(7 + 31 / 60 + 58 / 3600)]);
    expect(r.points[2][1]).toBeCloseTo(-7.54, 7);
  });

  it("UTM com fuso informado, ponto de milhar, rótulos E/N e N antes de E", () => {
    const zone = { zone: 23, hemisphere: "S" as const };
    const r = parseCoords("E 385.745,442 m e N 9.167.249,057 m\n385800 9167300\nN 9167200; E 385700", { utm: zone });
    expect(r.format).toBe("utm");
    expect(r.problems).toEqual([]);
    close(r.points[0], REF[0].p, 6);
    expect(r.points[2][0]).toBeLessThan(r.points[0][0]);
  });

  it("UTM sem fuso não chuta: cada linha vira problema", () => {
    const r = parseCoords("385745 9167249\n385800 9167300");
    expect(r.format).toBe("utm");
    expect(r.points).toHaveLength(0);
    expect(r.problems).toHaveLength(2);
  });

  it("WKT (o do Sicor) e linha que não dá para ler", () => {
    const wkt = parseCoords("POLYGON((-46.1 -7.5, -46.0 -7.5, -46.0 -7.6, -46.1 -7.5))");
    expect(wkt.format).toBe("wkt");
    expect(wkt.points).toHaveLength(3);
    const bad = parseCoords("-7.5325, -46.0356\nperto da porteira azul 3\n-7.54, -46.03");
    expect(bad.problems).toEqual([{ line: 2, text: "perto da porteira azul 3" }]);
  });
});

describe("exportação", () => {
  const ring: LngLat[] = [
    [-46.0356, -7.5325],
    [-46.03, -7.533],
    [-46.031, -7.54],
  ];

  it("WKT fechado com 7 casas, que volta igual pela leitura", () => {
    const wkt = toWkt(ring);
    expect(wkt).toBe("POLYGON((-46.0356000 -7.5325000, -46.0300000 -7.5330000, -46.0310000 -7.5400000, -46.0356000 -7.5325000))");
    expect(parseCoords(wkt).points).toEqual(ring);
    expect(toWkt(ring.slice(0, 2))).toBe("");
  });

  it("GeoJSON com o anel fechado", () => {
    const geo = JSON.parse(toGeoJson("Talhão 3", ring));
    expect(geo.features[0].properties.name).toBe("Talhão 3");
    expect(geo.features[0].geometry.coordinates[0]).toHaveLength(4);
  });

  it("GMS no padrão brasileiro e planilha de vértices com UTM", () => {
    expect(toDms(-7.5325, "lat")).toBe(`7°31'57,00" S`);
    expect(toDms(-46.0356, "lng")).toBe(`46°02'08,16" O`);
    const [first] = vertexRows(ring);
    expect(first.slice(0, 3)).toEqual([1, "-7,5325000", "-46,0356000"]);
    expect(first[7]).toBe("23S");
    expect(first[5]).toBe("385745,44");
  });
});
