/**
 * O que cada papel pode fazer no aparelho. O servidor confere de novo (supabase/migrations):
 * aqui é para o menu, os botões e a mensagem de bloqueio.
 */

export type Papel = "dono" | "gestor" | "rt" | "tecnico" | "estagiario" | "produtor" | "leitor";

export type Pode =
  | "registrar"
  | "assinar"
  | "editarDosOutros"
  | "verCustos"
  | "estoque"
  | "verEstoque"
  | "relatorios"
  | "relatorioVisita"
  | "convidar"
  | "apagarConta";

export const PAPEIS: { value: Papel; label: string; text: string }[] = [
  { value: "dono", label: "Dono", text: "Responde pela conta: tudo, inclusive pessoas e plano." },
  { value: "gestor", label: "Gestor", text: "Tudo da operação: fazendas, custos, estoque e equipe." },
  { value: "rt", label: "Responsável técnico", text: "Visitas, recomendações e assina os relatórios." },
  { value: "tecnico", label: "Técnico de campo / Monitor", text: "Registra visitas nas fazendas que recebeu. Não vê custos." },
  { value: "estagiario", label: "Estagiário", text: "Registra visitas que vão para revisão do supervisor." },
  { value: "produtor", label: "Produtor convidado", text: "Vê as visitas e os relatórios das fazendas dele." },
  { value: "leitor", label: "Só leitura", text: "Vê as fazendas que recebeu, sem mexer em nada." },
];

const TODOS: Papel[] = PAPEIS.map((p) => p.value);

const REGRAS: Record<Pode, Papel[]> = {
  registrar: ["dono", "gestor", "rt", "tecnico", "estagiario"],
  assinar: ["rt"],
  editarDosOutros: ["dono", "gestor", "rt"],
  verCustos: ["dono", "gestor"],
  estoque: ["dono", "gestor", "rt"],
  verEstoque: ["dono", "gestor", "rt", "tecnico", "estagiario"],
  relatorios: ["dono", "gestor", "rt", "produtor", "leitor"],
  relatorioVisita: TODOS,
  convidar: ["dono", "gestor"],
  apagarConta: ["dono"],
};

export function can(papel: Papel, acao: Pode, opts: { veCustos?: boolean; temRegistro?: boolean } = {}): boolean {
  if (acao === "verCustos" && opts.veCustos && (papel === "rt" || papel === "produtor")) return true;
  if (acao === "assinar" && papel === "dono" && opts.temRegistro) return true;
  return REGRAS[acao].includes(papel);
}

const O_QUE: Record<Pode, string> = {
  registrar: "registra",
  assinar: "assina relatórios",
  editarDosOutros: "edita o que outra pessoa registrou",
  verCustos: "vê custos",
  estoque: "mexe no estoque",
  verEstoque: "vê o estoque",
  relatorios: "gera os relatórios da safra",
  relatorioVisita: "gera o relatório da visita",
  convidar: "convida pessoas",
  apagarConta: "apaga a conta",
};

/** "Só quem gerencia a conta vê custos. Fale com Ana." */
export function blockedMessage(acao: Pode, quemLibera: string): string {
  return `Só quem gerencia a conta ${O_QUE[acao]}. Fale com ${quemLibera.trim() || "quem gerencia a conta"}.`;
}
