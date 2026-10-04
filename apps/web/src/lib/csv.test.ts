import { describe, expect, it } from "vitest";
import { csvCell, operationRows, toCsv, visitRows } from "./csv";
import type { Farm, Finding, Operation, Plot, Season, Visit } from "./db";

const base = (id: string, createdAt = 1) => ({ id, createdAt, updatedAt: createdAt });

describe("csvCell", () => {
  it("só põe aspas quando precisa", () => {
    expect(csvCell("Percevejo-marrom")).toBe("Percevejo-marrom");
    expect(csvCell("2; por pano")).toBe('"2; por pano"');
    expect(csvCell('disse "ok"')).toBe('"disse ""ok"""');
    expect(csvCell("linha 1\nlinha 2")).toBe('"linha 1\nlinha 2"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(12.5)).toBe("12.5");
  });
});

describe("toCsv", () => {
  it("começa com BOM e usa CRLF", () => {
    expect(toCsv([["a", "b"], ["c", "d"]])).toBe("﻿a;b\r\nc;d\r\n");
  });
});

describe("visitRows", () => {
  const farms: Farm[] = [{ ...base("f1"), name: "Boa Esperança", municipality: "Balsas", owner: "João" }];
  const plots: Plot[] = [{ ...base("p1"), farmId: "f1", name: "T-12", areaHa: 120.5 }];
  const seasons: Season[] = [
    { ...base("s-old", 1), plotId: "p1", label: "2025/26", cultivar: "Antiga", plantingDate: null },
    { ...base("s-new", 2), plotId: "p1", label: "2026/27", cultivar: "Nova", plantingDate: "2026-10-20" },
  ];
  const visit = (id: string, date: string, seasonId?: string | null): Visit => ({
    ...base(id),
    farmId: "f1",
    plotId: "p1",
    seasonId,
    date,
    stage: "R3",
    observations: "",
    recommendation: "Monitorar",
    followUpDate: null,
    followUpDone: false,
  });
  const finding = (id: string, visitId: string, name: string, createdAt: number): Finding => ({
    ...base(id, createdAt),
    visitId,
    kind: "praga",
    name,
    amount: "2 por pano",
    note: "",
  });

  it("uma linha por achado, visita sem achado vira uma linha, ordem por data", () => {
    const rows = visitRows(
      [visit("v2", "2026-12-10", "s-new"), visit("v1", "2026-03-01", "s-old")],
      farms,
      plots,
      seasons,
      [finding("a", "v2", "Percevejo-verde", 2), finding("b", "v2", "Percevejo-marrom", 1)],
    );
    expect(rows).toHaveLength(3);
    expect(rows[0].slice(0, 9)).toEqual(["01/03/2026", "Boa Esperança", "Balsas", "João", "T-12", "120,5", "2025/26", "Antiga", "R3"]);
    expect(rows[0][10]).toBe("");
    expect(rows[1][10]).toBe("Percevejo-marrom");
    expect(rows[2][10]).toBe("Percevejo-verde");
    expect(rows[1][9]).toBe("Praga");
    expect(rows[1][14]).toBe("Monitorar");
  });

  it("visita sem safra (backup antigo) usa a safra vigente do talhão", () => {
    const [row] = visitRows([visit("v3", "2026-11-01")], farms, plots, seasons, []);
    expect(row[6]).toBe("2026/27");
    expect(row[7]).toBe("Nova");
  });

  it("operações: data de conclusão, insumos e produtividade com vírgula", () => {
    const op = (id: string, over: Partial<Operation>): Operation => ({
      ...base(id),
      farmId: "f1",
      plotId: "p1",
      seasonId: "s-new",
      kind: "aplicacao",
      status: "concluida",
      date: "2027-01-05",
      doneDate: "2027-01-06",
      areaHa: 120.5,
      description: "Fungicida; 2ª aplicação",
      cost: 18_500.5,
      yieldBags: null,
      ...over,
    });
    const rows = operationRows(
      [op("c", { kind: "colheita", date: "2027-03-01", doneDate: "2027-03-02", yieldBags: 7_833, cost: null }), op("a", {}), op("x", { plotId: "removido" })],
      farms,
      plots,
      seasons,
      new Map([["a", [{ name: "Produto X", qty: 60.25, unit: "L", supplyId: "s" }]]]),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual([
      "06/01/2027",
      "Boa Esperança",
      "T-12",
      "2026/27",
      "Aplicação",
      "Concluída",
      "120,5",
      "Fungicida; 2ª aplicação",
      "Produto X 60,25 L",
      "18500,5",
      "",
      "",
    ]);
    expect(rows[1][11]).toBe("65"); // 7833 / 120,5
  });
});
