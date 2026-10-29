import type { FindingKind, VisitKind } from "./db";

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

/**
 * Tipos de visita. Cada um mostra só o que importa: o plantio conta sementes no sulco, o estande
 * conta plantas emergidas e o monitoramento anota pragas e doenças. Observações, recomendação,
 * fotos e retorno aparecem em todos.
 */
export const VISIT_KINDS: {
  kind: VisitKind;
  label: string;
  hint: string;
  stageRequired: boolean;
  findings: boolean;
  stand: boolean;
}[] = [
  { kind: "monitoramento", label: "Monitoramento", hint: "Pragas, doenças e daninhas", stageRequired: true, findings: true, stand: false },
  { kind: "plantio", label: "Plantio", hint: "Sementes por metro e distribuição no sulco", stageRequired: false, findings: false, stand: true },
  { kind: "estande", label: "Estande", hint: "Plantas por metro e por hectare", stageRequired: false, findings: true, stand: true },
  { kind: "pos-venda", label: "Pós-venda", hint: "Acompanhar o que foi vendido ao produtor", stageRequired: true, findings: true, stand: false },
  { kind: "pre-colheita", label: "Pré-colheita", hint: "Maturação, perdas e ponto de colheita", stageRequired: true, findings: true, stand: false },
  { kind: "vistoria", label: "Vistoria / perda", hint: "Laudo para seguro, Proagro ou crédito", stageRequired: true, findings: true, stand: false },
  { kind: "outra", label: "Outra", hint: "Qualquer outro motivo de visita", stageRequired: false, findings: true, stand: false },
];

/** Selo curto da visita: o estágio ou, sem estágio (ex.: contagem de estande), o tipo. */
export function visitBadge(v: { stage: string; kind?: VisitKind }): string {
  return v.stage || visitKindInfo(v.kind).label;
}

/** Tipo da visita; as antigas (sem tipo) são de monitoramento. */
export function visitKindInfo(kind: VisitKind | null | undefined) {
  return VISIT_KINDS.find((k) => k.kind === kind) ?? VISIT_KINDS[0];
}

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
