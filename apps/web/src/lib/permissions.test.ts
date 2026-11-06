import { describe, expect, it } from "vitest";
import { blockedMessage, can, PAPEIS, type Papel, type Pode } from "./permissions";

// Tabela "Papéis e hierarquia" do design (docs/superpowers/specs/2026-11-06-login-contas-permissoes-design.md).
const TABELA: Record<Pode, Papel[]> = {
  registrar: ["dono", "gestor", "rt", "tecnico", "estagiario"],
  assinar: ["rt"],
  editarDosOutros: ["dono", "gestor", "rt"],
  verCustos: ["dono", "gestor"],
  estoque: ["dono", "gestor", "rt"],
  verEstoque: ["dono", "gestor", "rt", "tecnico", "estagiario"],
  relatorios: ["dono", "gestor", "rt", "produtor", "leitor"],
  relatorioVisita: ["dono", "gestor", "rt", "tecnico", "estagiario", "produtor", "leitor"],
  convidar: ["dono", "gestor"],
  apagarConta: ["dono"],
};
const TODOS = PAPEIS.map((p) => p.value);

describe("can", () => {
  it.each(Object.entries(TABELA) as [Pode, Papel[]][])("%s segue a tabela do design", (acao, quem) => {
    for (const papel of TODOS) expect([papel, can(papel, acao)]).toEqual([papel, quem.includes(papel)]);
  });

  it("rt e produtor veem custos só com a permissão extra", () => {
    expect(can("rt", "verCustos", { veCustos: true })).toBe(true);
    expect(can("produtor", "verCustos", { veCustos: true })).toBe(true);
    expect(can("tecnico", "verCustos", { veCustos: true })).toBe(false);
  });

  it("dono assina quando tem registro profissional (conta de autônomo)", () => {
    expect(can("dono", "assinar", { temRegistro: true })).toBe(true);
    expect(can("gestor", "assinar", { temRegistro: true })).toBe(false);
  });
});

describe("blockedMessage", () => {
  it("diz quem libera", () => {
    expect(blockedMessage("verCustos", "Ana")).toBe("Só quem gerencia a conta vê custos. Fale com Ana.");
    expect(blockedMessage("convidar", "")).toBe("Só quem gerencia a conta convida pessoas. Fale com quem gerencia a conta.");
  });
});
