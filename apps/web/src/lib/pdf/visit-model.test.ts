import { describe, expect, it } from "vitest";
import { newBase, type Farm, type MapPoint, type Plot, type Season, type Visit } from "../db";
import type { LngLat } from "../geo";
import { drawPlot, standHeadline, visitFileName, visitPdfModel } from "./visit-model";

// Quadrado de ~1,1 km × 1,1 km perto de Balsas (MA).
const square: LngLat[] = [
  [-46.0, -7.5],
  [-45.99, -7.5],
  [-45.99, -7.51],
  [-46.0, -7.51],
];

const visit = (extra: Partial<Visit> = {}): Visit =>
  ({
    ...newBase(),
    id: "v1",
    farmId: "f1",
    plotId: "t1",
    date: "2026-11-05",
    stage: "V4",
    observations: " Lavoura bonita. ",
    recommendation: "Aplicar inseticida.",
    followUpDate: "2026-11-12",
    followUpDone: false,
    kind: "monitoramento",
    ...extra,
  }) as Visit;

const farm = { ...newBase(), id: "f1", name: "Fazenda Santa Luzia", owner: "João", municipality: "Balsas - MA" } as Farm;
const plot = { ...newBase(), id: "t1", farmId: "f1", name: "Talhão 1", areaHa: 120, boundary: square } as Plot;
const season = { ...newBase(), id: "s1", plotId: "t1", label: "2026/27", cultivar: "TMG 2383", plantingDate: "2026-10-05" } as Season;
const author = { name: "Ana", role: "engenheiro", registry: "CREA-MA 1", company: "", phone: "", supervisorName: "", supervisorRegistry: "" };

describe("visitFileName", () => {
  it("monta um nome de arquivo sem acento nem espaço", () => {
    expect(visitFileName("Fazenda São João", "Talhão 2", "2026-11-05")).toBe("visita-fazenda-sao-joao-talhao-2-2026-11-05.pdf");
  });
});

describe("visitPdfModel", () => {
  const m = visitPdfModel({
    visit: visit(),
    farm,
    plot,
    season,
    findings: [{ ...newBase(), visitId: "v1", kind: "praga", name: "Lagarta", amount: "2 por pano", note: "" }],
    dap: 31,
    author,
    photos: [],
    points: [],
    now: new Date(2026, 10, 5),
  });

  it("leva os dados da visita sem repetir a data (que já vai no cabeçalho)", () => {
    expect(m.date).toBe("05/11/2026");
    expect(m.info.map((c) => c.label)).not.toContain("Data da visita");
    expect(m.info).toContainEqual({ label: "Após o plantio", value: "31 dias" });
    expect(m.info).toContainEqual({ label: "Cultivar", value: "TMG 2383" });
    expect(m.producer).toBe("João");
    expect(m.observations).toBe("Lavoura bonita.");
    expect(m.followUp).toBe("12/11/2026");
    expect(m.findings[0]).toMatchObject({ kindLabel: expect.any(String), name: "Lagarta", amount: "2 por pano" });
  });

  it("assina com quem fez a visita e desenha o talhão", () => {
    expect(m.signature?.name).toBe("Ana");
    expect(m.signature?.role).toContain("CREA-MA 1");
    expect(m.map?.path.startsWith("M")).toBe(true);
    expect(m.footer).toBe("Gerado pelo AgroNexus em 05/11/2026");
  });

  it("sem autor não tem assinatura; sem contorno não tem mapa", () => {
    const bare = visitPdfModel({ visit: visit(), farm, plot: { ...plot, boundary: null }, findings: [], dap: null, author: null, photos: [], points: [] });
    expect(bare.signature).toBeNull();
    expect(bare.map).toBeNull();
    expect(bare.info.find((c) => c.label === "Área do talhão")?.value).toBe("120 ha");
  });
});

describe("drawPlot", () => {
  it("cabe no desenho, com norte para cima e escala redonda", () => {
    const point = { ...newBase(), farmId: "f1", kind: "armadilha", name: "A1", note: "", lng: -45.995, lat: -7.505 } as MapPoint;
    const d = drawPlot(square, [point], { stand: { spacingM: 0.5, targetPerHa: null, points: [{ plants: 10, meters: 1, lat: -7.501, lng: -45.999 }] } });
    const nums = d.path.match(/-?\d+(\.\d+)?/g)!.map(Number);
    for (const n of nums) {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(240);
    }
    // O ponto no meio do quadrado fica no meio do desenho.
    expect(d.points[0].x).toBeCloseTo(120, 0);
    expect(d.points[0].y).toBeCloseTo(85, 0);
    // A contagem perto do canto norte fica no alto (y pequeno).
    expect(d.stand[0].y).toBeLessThan(40);
    expect(["200 m", "500 m", "100 m"]).toContain(d.scale.label);
    expect(d.areaHa).toBeGreaterThan(110);
  });
});

describe("standHeadline", () => {
  it("resume a contagem em plantas/ha e % do planejado", () => {
    const v = visit({ kind: "estande", stand: { spacingM: 0.5, targetPerHa: 260_000, points: [{ plants: 13, meters: 1, lat: null, lng: null }] } });
    expect(standHeadline(v)).toBe("260.000 plantas/ha · 100% do planejado");
    expect(standHeadline(visit())).toBe("");
  });
});
