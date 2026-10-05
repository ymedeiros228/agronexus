import { describe, expect, it } from "vitest";
import { plotLabel } from "./format";

describe("plotLabel", () => {
  it("põe 'Talhão' só quando o nome ainda não tem", () => {
    expect(plotLabel("1 - Baixada")).toBe("Talhão 1 - Baixada");
    expect(plotLabel("Talhão Norte")).toBe("Talhão Norte");
    expect(plotLabel("talhao 3")).toBe("talhao 3");
    expect(plotLabel("Talhãozinho")).toBe("Talhão Talhãozinho");
    expect(plotLabel(undefined)).toBe("Talhão ?");
  });
});
