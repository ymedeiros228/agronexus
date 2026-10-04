import { describe, expect, it } from "vitest";
import type { Farm, Finding, Plot, Rainfall, Season, Visit } from "./db";
import { buildPanel } from "./panel";

const base = (id: string, createdAt = 1) => ({ id, createdAt, updatedAt: createdAt });
const TODAY = "2026-12-20";

const farm: Farm = { ...base("f1"), name: "Boa Esperança", municipality: "", owner: "" };
const plot = (id: string, name: string): Plot => ({ ...base(id), farmId: "f1", name, areaHa: null });
const season = (id: string, plotId: string, plantingDate: string | null, createdAt = 2): Season => ({
  ...base(id, createdAt),
  plotId,
  label: "2026/27",
  cultivar: "",
  plantingDate,
});
const visit = (id: string, plotId: string, date: string, over: Partial<Visit> = {}): Visit => ({
  ...base(id),
  farmId: "f1",
  plotId,
  seasonId: undefined,
  date,
  stage: "R2",
  observations: "",
  recommendation: "",
  followUpDate: null,
  followUpDone: false,
  ...over,
});
const empty = { findings: [] as Finding[], rainfall: [] as Rainfall[] };

describe("buildPanel", () => {
  it("monta a situação do talhão com a última visita, DAP e achados", () => {
    const findings: Finding[] = [
      { ...base("a"), visitId: "v2", kind: "doenca", name: "Ferrugem-asiática", amount: "", note: "" },
      { ...base("b"), visitId: "v1", kind: "praga", name: "Lagarta-da-soja", amount: "", note: "" },
    ];
    const { farms } = buildPanel(
      {
        farms: [farm],
        plots: [plot("p1", "T-1")],
        seasons: [season("s1", "p1", "2026-11-01")],
        visits: [visit("v1", "p1", "2026-12-10"), visit("v2", "p1", "2026-12-18", { stage: "R3" })],
        findings,
        rainfall: [],
      },
      TODAY,
    );
    const s = farms[0].plots[0];
    expect(s.lastVisit?.id).toBe("v2");
    expect(s.daysSinceVisit).toBe(2);
    expect(s.dap).toBe(49);
    expect(s.lastFindings.map((f) => f.name)).toEqual(["Ferrugem-asiática"]);
  });

  it("ordena talhões pelo número (T-2 antes de T-10)", () => {
    const { farms } = buildPanel(
      { farms: [farm], plots: [plot("a", "T-10"), plot("b", "T-2")], seasons: [], visits: [], ...empty },
      TODAY,
    );
    expect(farms[0].plots.map((p) => p.plot.name)).toEqual(["T-2", "T-10"]);
  });

  it("avisa talhão sem visita há mais de 7 dias e plantado sem nenhuma visita", () => {
    const { alerts } = buildPanel(
      {
        farms: [farm],
        plots: [plot("p1", "T-1"), plot("p2", "T-2"), plot("p3", "T-3")],
        seasons: [season("s1", "p1", "2026-11-01"), season("s2", "p2", "2026-12-01"), season("s3", "p3", "2026-12-18")],
        visits: [visit("v1", "p1", "2026-12-05")],
        ...empty,
      },
      TODAY,
    );
    expect(alerts.map((a) => [a.plotName, a.text])).toEqual([
      ["T-2", "Nenhuma visita desde o plantio (19 dias)"],
      ["T-1", "Sem visita há 15 dias"],
    ]);
  });

  it("não cobra visita de lavoura madura, fora do ciclo, ainda não plantada ou de safra antiga", () => {
    const { alerts } = buildPanel(
      {
        farms: [farm],
        plots: [plot("p1", "T-1"), plot("p2", "T-2"), plot("p3", "T-3"), plot("p4", "T-4")],
        seasons: [
          season("s1", "p1", "2026-09-01"),
          season("s2", "p2", "2026-06-01"),
          season("s3", "p3", "2027-01-10"),
          season("s4-old", "p4", "2025-11-01", 1),
          season("s4", "p4", null, 5),
        ],
        visits: [
          visit("v1", "p1", "2026-12-01", { stage: "R8" }),
          visit("v4", "p4", "2026-03-01", { seasonId: "s4-old" }),
        ],
        ...empty,
      },
      TODAY,
    );
    expect(alerts).toEqual([]);
  });

  it("retorno atrasado vem antes de retorno de hoje; feito não aparece", () => {
    const { alerts } = buildPanel(
      {
        farms: [farm],
        plots: [plot("p1", "T-1")],
        seasons: [season("s1", "p1", "2026-12-15")],
        visits: [
          visit("v1", "p1", "2026-12-16", { followUpDate: "2026-12-20" }),
          visit("v2", "p1", "2026-12-17", { followUpDate: "2026-12-18" }),
          visit("v3", "p1", "2026-12-18", { followUpDate: "2026-12-10", followUpDone: true }),
        ],
        ...empty,
      },
      TODAY,
    );
    expect(alerts.map((a) => a.kind)).toEqual(["followup-overdue", "followup-today"]);
    expect(alerts[0].text).toBe("Retorno atrasado (era 18/12)");
  });

  it("soma chuva de 7 e 30 dias, ignorando data futura", () => {
    const rainfall: Rainfall[] = [
      { ...base("r1"), farmId: "f1", date: "2026-12-20", mm: 10 },
      { ...base("r2"), farmId: "f1", date: "2026-12-14", mm: 5 },
      { ...base("r3"), farmId: "f1", date: "2026-12-13", mm: 7 },
      { ...base("r4"), farmId: "f1", date: "2026-11-20", mm: 100 },
      { ...base("r5"), farmId: "f1", date: "2026-12-25", mm: 50 },
    ];
    const { farms } = buildPanel({ farms: [farm], plots: [], seasons: [], visits: [], findings: [], rainfall }, TODAY);
    expect(farms[0].rain7).toBe(15);
    expect(farms[0].rain30).toBe(22);
  });
});
