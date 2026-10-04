import type { FindingKind } from "./db";

/**
 * Catálogo preliminar de soja. Fontes públicas e nomenclatura de uso comum no campo.
 * PRECISA ser validado por um agrônomo antes de uso real.
 * Propositalmente NÃO traz níveis de ação nem recomendações de produto.
 */

export const STAGES: { code: string; label: string }[] = [
  { code: "VE", label: "VE — Emergência" },
  { code: "VC", label: "VC — Cotilédones abertos" },
  { code: "V1", label: "V1 — Primeiro trifólio" },
  { code: "V2", label: "V2" },
  { code: "V3", label: "V3" },
  { code: "V4", label: "V4" },
  { code: "V5", label: "V5" },
  { code: "V6", label: "V6" },
  { code: "R1", label: "R1 — Início do florescimento" },
  { code: "R2", label: "R2 — Florescimento pleno" },
  { code: "R3", label: "R3 — Início da formação de vagem" },
  { code: "R4", label: "R4 — Vagem completamente desenvolvida" },
  { code: "R5", label: "R5 — Início do enchimento de grão" },
  { code: "R6", label: "R6 — Grão cheio" },
  { code: "R7", label: "R7 — Início da maturação" },
  { code: "R8", label: "R8 — Maturação plena" },
];

export const KIND_LABEL: Record<FindingKind, string> = {
  praga: "Praga",
  doenca: "Doença",
  daninha: "Planta daninha",
  outro: "Outro",
};

export const FINDING_PRESETS: { kind: FindingKind; name: string }[] = [
  { kind: "praga", name: "Percevejo-marrom" },
  { kind: "praga", name: "Percevejo-verde" },
  { kind: "praga", name: "Percevejo-barriga-verde" },
  { kind: "praga", name: "Lagarta-da-soja" },
  { kind: "praga", name: "Lagarta falsa-medideira" },
  { kind: "praga", name: "Helicoverpa" },
  { kind: "praga", name: "Mosca-branca" },
  { kind: "doenca", name: "Ferrugem-asiática" },
  { kind: "doenca", name: "Mancha-alvo" },
  { kind: "doenca", name: "Mancha-parda" },
  { kind: "doenca", name: "Oídio" },
  { kind: "doenca", name: "Antracnose" },
  { kind: "doenca", name: "Mofo-branco" },
  { kind: "daninha", name: "Buva" },
  { kind: "daninha", name: "Capim-amargoso" },
];

export const DIAGNOSIS_OPTIONS: string[] = [
  "Sem alteração",
  ...FINDING_PRESETS.filter((p) => p.kind !== "daninha").map((p) => p.name),
  "Deficiência nutricional",
  "Dano de herbicida",
  "Não identificado",
];
