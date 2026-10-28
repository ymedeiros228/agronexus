import type { Client, Farm, Finding, Plot, Season, Visit } from "./db";
import { visitState } from "./panel";
import { daysSince } from "./season";

/**
 * Agenda do engenheiro ("Hoje"): os talhões de todos os clientes que pedem visita.
 * Cada talhão aparece uma vez só, no grupo mais urgente. Função pura, como o painel.
 */

export type AgendaKind = "overdue" | "today" | "no-visit" | "upcoming";

export type AgendaItem = {
  key: string;
  kind: AgendaKind;
  farm: Farm;
  plot: Plot;
  client?: Client;
  /** Visita que marcou o retorno (atrasado, de hoje ou dos próximos dias). */
  followUpVisitId?: string;
  due: string | null;
  /** Atrasados: dias de atraso. Sem visita: dias sem visita. Próximos: dias até o retorno. */
  days: number;
  lastVisit?: Visit;
  lastFindings: number;
  stage: string;
  dap: number | null;
  /** Visita feita no talhão há mais tempo que o limite também tem retorno marcado. */
  alsoDue: string | null;
};

export type Agenda = Record<AgendaKind, AgendaItem[]> & { total: number };

/** Quantos dias à frente entram em "Próximos dias". */
export const UPCOMING_DAYS = 7;

type Input = {
  farms: Farm[];
  plots: Plot[];
  seasons: Season[];
  visits: Visit[];
  findings: Finding[];
  clients: Client[];
};

const byName = (a: string, b: string) => a.localeCompare(b, "pt-BR", { numeric: true });

export function buildAgenda(input: Input, today: string): Agenda {
  const noon = (iso: string) => new Date(`${iso}T12:00:00`).getTime();
  const farmById = new Map(input.farms.map((f) => [f.id, f]));
  const clientById = new Map(input.clients.map((c) => [c.id, c]));
  const findingsPerVisit = new Map<string, number>();
  for (const f of input.findings) findingsPerVisit.set(f.visitId, (findingsPerVisit.get(f.visitId) ?? 0) + 1);

  const agenda: Agenda = { overdue: [], today: [], "no-visit": [], upcoming: [], total: 0 };

  for (const plot of input.plots) {
    const farm = farmById.get(plot.farmId);
    if (!farm) continue;
    const state = visitState(plot.id, input.seasons, input.visits, today);
    // Retorno pendente mais antigo do talhão (de qualquer safra: retorno combinado é compromisso).
    const pending = input.visits
      .filter((v) => v.plotId === plot.id && v.followUpDate && !v.followUpDone)
      .sort((a, b) => (a.followUpDate! < b.followUpDate! ? -1 : 1))[0];
    const due = pending?.followUpDate ?? null;
    const daysToDue = due && due > today ? daysSince(today, noon(due)) : 0;

    let kind: AgendaKind | null = null;
    let days = 0;
    if (due && due < today) {
      kind = "overdue";
      days = daysSince(due, noon(today));
    } else if (due === today) {
      kind = "today";
    } else if (state.noVisitDays !== null) {
      kind = "no-visit";
      days = state.noVisitDays;
    } else if (due && daysToDue <= UPCOMING_DAYS) {
      kind = "upcoming";
      days = daysToDue;
    }
    if (!kind) continue;

    agenda[kind].push({
      key: `${kind}-${plot.id}`,
      kind,
      farm,
      plot,
      client: farm.clientId ? clientById.get(farm.clientId) : undefined,
      followUpVisitId: kind === "no-visit" ? undefined : pending?.id,
      due: kind === "no-visit" ? null : due,
      days,
      lastVisit: state.lastVisit,
      lastFindings: state.lastVisit ? (findingsPerVisit.get(state.lastVisit.id) ?? 0) : 0,
      stage: state.lastVisit?.stage ?? "",
      dap: state.dap,
      alsoDue: kind === "no-visit" ? due : null,
    });
  }

  const place = (a: AgendaItem, b: AgendaItem) =>
    byName(a.client?.name ?? a.farm.owner ?? "", b.client?.name ?? b.farm.owner ?? "") ||
    byName(a.farm.name, b.farm.name) ||
    byName(a.plot.name, b.plot.name);
  agenda.overdue.sort((a, b) => b.days - a.days || place(a, b));
  agenda.today.sort(place);
  agenda["no-visit"].sort((a, b) => b.days - a.days || place(a, b));
  agenda.upcoming.sort((a, b) => a.days - b.days || place(a, b));
  agenda.total = agenda.overdue.length + agenda.today.length + agenda["no-visit"].length + agenda.upcoming.length;
  return agenda;
}

/** Endereço da nova visita já com fazenda e talhão escolhidos. */
export function newVisitHref(item: Pick<AgendaItem, "farm" | "plot">): string {
  return `/visitas/nova?fazenda=${item.farm.id}&talhao=${item.plot.id}`;
}
