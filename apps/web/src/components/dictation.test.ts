import { describe, expect, it } from "vitest";
import { appendDictation } from "./dictation";

describe("appendDictation", () => {
  it("começa com maiúscula no texto vazio", () => {
    expect(appendDictation("", " lagarta na bordadura")).toBe("Lagarta na bordadura");
  });
  it("junta com espaço e mantém minúscula no meio da frase", () => {
    expect(appendDictation("Lagarta na bordadura", "sul")).toBe("Lagarta na bordadura sul");
  });
  it("maiúscula depois de ponto", () => {
    expect(appendDictation("Boa sanidade. ", "percevejo no centro")).toBe("Boa sanidade. Percevejo no centro");
  });
  it("ignora trecho vazio", () => {
    expect(appendDictation("Texto", "  ")).toBe("Texto");
  });
});
