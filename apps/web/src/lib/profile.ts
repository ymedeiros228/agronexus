import { getMeta, setMeta, type VisitAuthor } from "./db";

/**
 * Perfil de quem usa este aparelho (ADR 0008). Vai no relatório da visita e decide a tela inicial:
 * "campo" abre a agenda do dia; "gestao" abre o painel da safra.
 */

/** "rtv" é o valor guardado da função Comercial (nome antigo; perfis já salvos continuam valendo). */
export type Role = "estagiario" | "tecnico" | "engenheiro" | "consultor" | "pesquisador" | "monitor" | "rtv" | "produtor" | "outro";
export type Mode = "campo" | "gestao";

export type Profile = {
  name: string;
  role: Role;
  registry: string;
  company: string;
  phone: string;
  supervisorName: string;
  supervisorRegistry: string;
  mode: Mode;
  /** Logo da empresa ou do profissional (imagem pequena em data URL). Vai no cabeçalho do PDF. */
  logo?: string;
};

export const PROFILE_KEY = "profile";

export const ROLES: { value: Role; label: string; text: string }[] = [
  { value: "engenheiro", label: "Engenheiro(a) agrônomo(a)", text: "Da revenda, da cooperativa, da fazenda ou autônomo" },
  { value: "consultor", label: "Consultor(a)", text: "Consultoria técnica, independente ou de empresa" },
  { value: "estagiario", label: "Estagiário(a) de Agronomia", text: "O relatório sai com o nome do responsável técnico" },
  { value: "tecnico", label: "Técnico(a) agrícola", text: "Técnico em agropecuária ou agrícola" },
  { value: "rtv", label: "Comercial", text: "RTV, CTV, DM, promotor ou gerente comercial" },
  { value: "pesquisador", label: "Pesquisador(a)", text: "Pesquisa, ensaios e experimentos" },
  { value: "monitor", label: "Monitor(a) de pragas", text: "Faz as contagens no campo" },
  { value: "produtor", label: "Produtor(a) ou gestor(a)", text: "Dono, gerente ou administrador da fazenda" },
  { value: "outro", label: "Outra função", text: "" },
];

const ROLE_LABEL = Object.fromEntries(ROLES.map((r) => [r.value, r.label])) as Record<Role, string>;

export function roleLabel(role: string): string {
  return ROLE_LABEL[role as Role] ?? role;
}

/** Quem não assina sozinho: o relatório precisa do responsável técnico. */
export function needsSupervisor(role: Role): boolean {
  return role === "estagiario" || role === "monitor";
}

/** Para quem o campo do responsável aparece (obrigatório ou não). */
export function asksSupervisor(role: Role): boolean {
  return role !== "engenheiro" && role !== "consultor" && role !== "pesquisador" && role !== "produtor";
}

/** Registro profissional que faz sentido para a função. Vazio = não pergunta. */
export function registryLabel(role: Role): string {
  switch (role) {
    case "engenheiro":
      return "CREA";
    case "tecnico":
      return "Registro (CFTA/CRTA)";
    case "consultor":
    case "pesquisador":
    case "rtv":
    case "outro":
      return "Registro profissional (se tiver)";
    default:
      return "";
  }
}

/** Modo que combina com a função, sugerido quando a pessoa ainda não escolheu. */
export function modeFor(role: Role): Mode {
  return role === "produtor" ? "gestao" : "campo";
}

export function emptyProfile(mode: Mode = "campo"): Profile {
  return {
    name: "",
    role: mode === "gestao" ? "produtor" : "engenheiro",
    registry: "",
    company: "",
    phone: "",
    supervisorName: "",
    supervisorRegistry: "",
    mode,
  };
}

/** Problemas que impedem salvar o perfil. Vazio = pode salvar. */
export function profileProblems(p: Profile): string[] {
  const problems: string[] = [];
  if (!p.name.trim()) problems.push("Informe o seu nome.");
  if (needsSupervisor(p.role) && !p.supervisorName.trim()) {
    problems.push("Informe o responsável técnico que assina com você.");
  }
  return problems;
}

/** Limpa o perfil antes de gravar: tira espaços e o que não se aplica à função. */
export function cleanProfile(p: Profile): Profile {
  const t = (s: string) => s.replace(/\s+/g, " ").trim();
  const supervisor = asksSupervisor(p.role);
  return {
    ...p,
    name: t(p.name),
    registry: registryLabel(p.role) ? t(p.registry) : "",
    company: t(p.company),
    phone: t(p.phone),
    supervisorName: supervisor ? t(p.supervisorName) : "",
    supervisorRegistry: supervisor ? t(p.supervisorRegistry) : "",
  };
}

export function getProfile(): Promise<Profile | undefined> {
  return getMeta<Profile>(PROFILE_KEY);
}

export function saveProfile(p: Profile) {
  return setMeta(PROFILE_KEY, cleanProfile(p));
}

/** Escolha feita na primeira tela: grava só o modo, sem apagar o que já houver no perfil. */
export async function chooseMode(mode: Mode) {
  const current = await getProfile();
  return setMeta(PROFILE_KEY, { ...(current ?? emptyProfile(mode)), mode });
}

/** Cópia do perfil que fica gravada na visita. Sem nome, não há autor a registrar. */
export function authorFromProfile(p: Profile | undefined): VisitAuthor | null {
  if (!p?.name.trim()) return null;
  return {
    name: p.name,
    role: p.role,
    registry: p.registry,
    company: p.company,
    phone: p.phone,
    supervisorName: p.supervisorName,
    supervisorRegistry: p.supervisorRegistry,
  };
}

/**
 * Assinatura do relatório, linha a linha:
 * "Ana Lima · Estagiário(a) de Agronomia", "Sementes Cerrado · (99) 98888-7777",
 * "Sob supervisão de Eng. Agr. João Silva, CREA-MA 12345/D".
 */
export function signatureLines(a: VisitAuthor | null | undefined): string[] {
  if (!a?.name) return [];
  const lines = [[a.name, roleLabel(a.role), a.registry].filter(Boolean).join(" · ")];
  const contact = [a.company, a.phone].filter(Boolean).join(" · ");
  if (contact) lines.push(contact);
  if (a.supervisorName) {
    lines.push(`Sob supervisão de Eng. Agr. ${a.supervisorName}${a.supervisorRegistry ? `, ${a.supervisorRegistry}` : ""}`);
  }
  return lines;
}
