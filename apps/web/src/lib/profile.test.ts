import { beforeEach, describe, expect, it } from "vitest";
import { db, newBase, type Visit } from "./db";
import {
  authorFromProfile,
  chooseMode,
  cleanProfile,
  emptyProfile,
  getProfile,
  profileProblems,
  saveProfile,
  signatureLines,
  type Profile,
} from "./profile";
import { visitReportText } from "./visit-report";

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

const intern: Profile = {
  ...emptyProfile(),
  name: " Ana   Lima ",
  role: "estagiario",
  registry: "não se aplica",
  company: "Sementes Cerrado",
  phone: "(99) 98888-7777",
  supervisorName: "João Silva",
  supervisorRegistry: "CREA-MA 12345/D",
};

describe("perfil", () => {
  it("estagiário e monitor exigem responsável técnico; nome é obrigatório", () => {
    expect(profileProblems({ ...intern, supervisorName: "" })).toEqual(["Informe o responsável técnico que assina com você."]);
    expect(profileProblems({ ...emptyProfile(), role: "engenheiro" })).toEqual(["Informe o seu nome."]);
    expect(profileProblems(intern)).toEqual([]);
  });

  it("limpa espaços e o que não se aplica à função", () => {
    const clean = cleanProfile(intern);
    expect(clean.name).toBe("Ana Lima");
    expect(clean.registry).toBe("");
    const eng = cleanProfile({ ...intern, role: "engenheiro", registry: "CREA-MA 1/D" });
    expect(eng.registry).toBe("CREA-MA 1/D");
    expect(eng.supervisorName).toBe("");
  });

  it("escolher o modo não apaga o resto do perfil", async () => {
    await chooseMode("gestao");
    expect((await getProfile())?.role).toBe("produtor");
    await saveProfile({ ...intern, mode: "campo" });
    await chooseMode("gestao");
    const p = await getProfile();
    expect(p?.mode).toBe("gestao");
    expect(p?.name).toBe("Ana Lima");
  });

  it("assinatura com função, contato e supervisão", () => {
    expect(signatureLines(authorFromProfile(cleanProfile(intern)))).toEqual([
      "Ana Lima · Estagiário(a) de Agronomia",
      "Sementes Cerrado · (99) 98888-7777",
      "Sob supervisão de Eng. Agr. João Silva, CREA-MA 12345/D",
    ]);
    expect(authorFromProfile({ ...intern, name: " " })).toBeNull();
    expect(signatureLines(null)).toEqual([]);
  });
});

describe("relatório da visita", () => {
  const visit: Visit = {
    ...newBase(),
    farmId: "f1",
    plotId: "p1",
    date: "2026-12-20",
    stage: "R3",
    observations: "Lavoura uniforme.",
    recommendation: "Reavaliar percevejo.",
    followUpDate: "2026-12-27",
    followUpDone: false,
  };

  it("traz produtor, achados, recomendação e assinatura no fim", () => {
    const text = visitReportText({
      visit,
      farm: { ...newBase(), name: "Santa Luzia", municipality: "", owner: "João Ribeiro" },
      plot: { ...newBase(), farmId: "f1", name: "3", areaHa: null },
      season: { ...newBase(), plotId: "p1", label: "2026/27", cultivar: "BRS 8381", plantingDate: "2026-11-01" },
      findings: [{ ...newBase(), visitId: visit.id, kind: "praga", name: "Percevejo-marrom", amount: "1 por metro", note: "" }],
      dap: 49,
      author: authorFromProfile(cleanProfile(intern)),
    });
    expect(text.split("\n")).toEqual([
      "*Relatório de visita — Santa Luzia · Talhão 3*",
      "Produtor: João Ribeiro",
      "Data: 20/12/2026 · Estágio: R3 · 49 dias após o plantio",
      "Cultivar: BRS 8381 (safra 2026/27)",
      "",
      "*Achados*",
      "- Praga: Percevejo-marrom — 1 por metro",
      "",
      "*Observações*",
      "Lavoura uniforme.",
      "",
      "*Recomendação*",
      "Reavaliar percevejo.",
      "",
      "Retorno combinado: 27/12/2026",
      "",
      "—",
      "Ana Lima · Estagiário(a) de Agronomia",
      "Sementes Cerrado · (99) 98888-7777",
      "Sob supervisão de Eng. Agr. João Silva, CREA-MA 12345/D",
    ]);
  });

  it("sem autor não tem assinatura", () => {
    const text = visitReportText({ visit, findings: [], dap: null, author: null });
    expect(text).not.toContain("—\n");
    expect(text.endsWith("Retorno combinado: 27/12/2026")).toBe(true);
  });
});
