import { describe, expect, it } from "vitest";
import { buildAgenda, newVisitHref } from "./agenda";
import type { Client, Farm, Finding, Plot, Season, Visit } from "./db";

const base = (id: string, createdAt = 1) => ({ id, createdAt, updatedAt: createdAt });
const TODAY = "2026-12-20";

const clients: Client[] = [
  { ...base("c1"), name: "Maria Alves", phone: "", municipality: "", notes: "" },
  { ...base("c2"), name: "João Ribeiro", phone: "", municipality: "", notes: "" },
];
const farms: Farm[] = [
  { ...base("f1"), name: "Santa Luzia", municipality: "", owner: "João Ribeiro", clientId: "c2" },
  { ...base("f2"), name: "Boa Esperança", municipality: "", owner: "Maria Alves", clientId: "c1" },
];
const plot = (id: string, farmId: string, name = id): Plot => ({ ...base(id), farmId, name, areaHa: null });
const season = (plotId: string, plantingDate: string | null): Season => ({
  ...base(`s-${plotId}`, 2),
  plotId,
  label: "2026/27",
  cultivar: "",
  plantingDate,
});
const visit = (id: string, plotId: string, date: string, over: Partial<Visit> = {}): Visit => ({
  ...base(id),
  farmId: plotId.startsWith("a") ? "f1" : "f2",
  plotId,
  seasonId: `s-${plotId}`,
  date,
  stage: "R2",
  observations: "",
  recommendation: "",
  followUpDate: null,
  followUpDone: false,
  ...over,
});

function agenda(plots: Plot[], seasons: Season[], visits: Visit[], findings: Finding[] = []) {
  return buildAgenda({ farms, plots, seasons, visits, findings, clients }, TODAY);
}

describe("buildAgenda", () => {
  it("separa atrasados, hoje, sem visita e próximos dias, cada talhão uma vez", () => {
    const plots = [plot("a1", "f1"), plot("a2", "f1"), plot("b1", "f2"), plot("b2", "f2"), plot("b3", "f2")];
    const seasons = plots.map((p) => season(p.id, "2026-11-01"));
    const result = agenda(plots, seasons, [
      visit("v1", "a1", "2026-12-15", { followUpDate: "2026-12-18" }), // atrasado 2 dias
      visit("v2", "a2", "2026-12-17", { followUpDate: TODAY }), // hoje
      visit("v3", "b1", "2026-12-01"), // sem visita há 19 dias
      visit("v4", "b2", "2026-12-19", { followUpDate: "2026-12-23" }), // daqui a 3 dias
      visit("v5", "b3", "2026-12-19", { followUpDate: "2027-01-10" }), // longe demais
    ]);
    expect(result.overdue.map((i) => [i.plot.id, i.days, i.followUpVisitId])).toEqual([["a1", 2, "v1"]]);
    expect(result.today.map((i) => i.plot.id)).toEqual(["a2"]);
    expect(result["no-visit"].map((i) => [i.plot.id, i.days])).toEqual([["b1", 19]]);
    expect(result.upcoming.map((i) => [i.plot.id, i.days, i.due])).toEqual([["b2", 3, "2026-12-23"]]);
    expect(result.total).toBe(4);
    expect(result.overdue[0].client?.name).toBe("João Ribeiro");
  });

  it("retorno feito não cobra; talhão sem visita com retorno futuro avisa a data", () => {
    const plots = [plot("a1", "f1"), plot("a2", "f1")];
    const seasons = plots.map((p) => season(p.id, "2026-11-01"));
    const result = agenda(plots, seasons, [
      visit("v1", "a1", "2026-12-18", { followUpDate: "2026-12-19", followUpDone: true }),
      visit("v2", "a2", "2026-12-01", { followUpDate: "2026-12-24" }),
    ]);
    expect(result.overdue).toHaveLength(0);
    expect(result["no-visit"].map((i) => [i.plot.id, i.alsoDue])).toEqual([["a2", "2026-12-24"]]);
    expect(result.upcoming).toHaveLength(0);
  });

  it("plantado sem nenhuma visita entra em sem visita; não plantado e lavoura madura não", () => {
    const plots = [plot("a1", "f1"), plot("a2", "f1"), plot("a3", "f1")];
    const result = agenda(
      plots,
      [season("a1", "2026-12-01"), season("a2", null), season("a3", "2026-10-01")],
      [visit("v1", "a3", "2026-12-01", { stage: "R8" })],
    );
    expect(result["no-visit"].map((i) => [i.plot.id, i.days, i.lastVisit])).toEqual([["a1", 19, undefined]]);
  });

  it("ordena atrasados do mais antigo para o mais novo e empata pelo nome do cliente", () => {
    const plots = [plot("a1", "f1"), plot("b1", "f2"), plot("b2", "f2")];
    const seasons = plots.map((p) => season(p.id, "2026-11-01"));
    const result = agenda(plots, seasons, [
      visit("v1", "a1", "2026-12-10", { followUpDate: "2026-12-15" }),
      visit("v2", "b1", "2026-12-10", { followUpDate: "2026-12-15" }),
      visit("v3", "b2", "2026-12-10", { followUpDate: "2026-12-12" }),
    ]);
    // b2 (8 dias); depois a1 e b1 com 5 dias: João antes de Maria.
    expect(result.overdue.map((i) => i.plot.id)).toEqual(["b2", "a1", "b1"]);
  });

  it("conta os achados da última visita e leva fazenda e talhão para a nova visita", () => {
    const plots = [plot("a1", "f1")];
    const result = agenda(plots, [season("a1", "2026-11-01")], [visit("v1", "a1", "2026-12-01")], [
      { ...base("x"), visitId: "v1", kind: "praga", name: "Percevejo", amount: "", note: "" },
      { ...base("y"), visitId: "v1", kind: "doenca", name: "Ferrugem", amount: "", note: "" },
    ]);
    const item = result["no-visit"][0];
    expect(item.lastFindings).toBe(2);
    expect(item.stage).toBe("R2");
    expect(newVisitHref(item)).toBe("/visitas/nova?fazenda=f1&talhao=a1");
  });
});
