import type { Farm, Finding, Operation, Plot, Rainfall, Season, Visit } from "./db";
import { KIND_NAME, isLate } from "./operations";
import { daysSince, latestSeason } from "./season";

/**
 * Painel do gestor (ADR 0007): situação de cada talhão e o que pede atenção.
 * Funções puras para poder testar sem banco.
 */

/** Padrões iniciais, a validar com agrônomo e produtores (ADR 0007). */
export const NO_VISIT_ALERT_DAYS = 7;
/** Depois disso a lavoura provavelmente já foi colhida; não cobra visita. */
export const MAX_CYCLE_DAYS = 150;

export type PlotStatus = {
  plot: Plot;
  season?: Season;
  lastVisit?: Visit;
  daysSinceVisit: number | null;
  dap: number | null;
  lastFindings: Finding[];
};

export type FarmStatus = {
  farm: Farm;
  rain7: number;
  rain30: number;
  plots: PlotStatus[];
};

export type Alert = {
  kind: "followup-overdue" | "followup-today" | "no-visit" | "operation-late";
  farmName: string;
  plotName: string;
  text: string;
  href: string;
  /** Maior = mais urgente. */
  weight: number;
};

type Input = {
  farms: Farm[];
  plots: Plot[];
  seasons: Season[];
  visits: Visit[];
  findings: Finding[];
  rainfall: Rainfall[];
  operations?: Operation[];
};

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function isoDaysAgo(today: string, days: number): string {
  const d = new Date(`${today}T12:00:00`);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

const byDateDesc = (a: Visit, b: Visit) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt);

export function buildPanel(input: Input, today: string): { farms: FarmStatus[]; alerts: Alert[] } {
  const now = new Date(`${today}T12:00:00`).getTime();
  const findingsByVisit = new Map<string, Finding[]>();
  for (const f of input.findings) findingsByVisit.set(f.visitId, [...(findingsByVisit.get(f.visitId) ?? []), f]);

  const alerts: Alert[] = [];
  const farms: FarmStatus[] = [];
  const cut7 = isoDaysAgo(today, 7);
  const cut30 = isoDaysAgo(today, 30);

  for (const farm of [...input.farms].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))) {
    const rain = input.rainfall.filter((r) => r.farmId === farm.id && r.date <= today);
    const plots = input.plots
      .filter((p) => p.farmId === farm.id)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { numeric: true }));

    const statuses = plots.map((plot): PlotStatus => {
      const seasons = input.seasons.filter((s) => s.plotId === plot.id);
      const season = latestSeason(seasons);
      // Visita sem safra (backup antigo) conta para a safra vigente.
      const visits = input.visits
        .filter((v) => v.plotId === plot.id && (seasons.some((s) => s.id === v.seasonId) ? v.seasonId : season?.id) === season?.id)
        .sort(byDateDesc);
      const lastVisit = visits[0];
      const planted = season?.plantingDate && season.plantingDate <= today ? season.plantingDate : null;
      const dap = planted ? daysSince(planted, now) : null;
      const daysSinceVisit = lastVisit ? daysSince(lastVisit.date, now) : null;

      // Talhão plantado (ou já visitado), ainda no ciclo e não maduro: cobra visita.
      const inCycle = (dap === null || dap <= MAX_CYCLE_DAYS) && lastVisit?.stage !== "R8";
      const reference = daysSinceVisit ?? dap;
      if (inCycle && reference !== null && reference > NO_VISIT_ALERT_DAYS) {
        alerts.push({
          kind: "no-visit",
          farmName: farm.name,
          plotName: plot.name,
          text: lastVisit ? `Sem visita há ${daysSinceVisit} dias` : `Nenhuma visita desde o plantio (${dap} dias)`,
          href: `/talhao?id=${plot.id}`,
          weight: 100 + reference,
        });
      }

      for (const v of input.visits.filter((x) => x.plotId === plot.id && x.followUpDate && !x.followUpDone)) {
        const due = v.followUpDate!;
        if (due < today) {
          alerts.push({
            kind: "followup-overdue",
            farmName: farm.name,
            plotName: plot.name,
            text: `Retorno atrasado (era ${ddmm(due)})`,
            href: `/visita?id=${v.id}`,
            weight: 1000 + daysSince(due, now),
          });
        } else if (due === today) {
          alerts.push({
            kind: "followup-today",
            farmName: farm.name,
            plotName: plot.name,
            text: "Retorno marcado para hoje",
            href: `/visita?id=${v.id}`,
            weight: 500,
          });
        }
      }

      for (const o of (input.operations ?? []).filter((x) => x.plotId === plot.id && isLate(x, today))) {
        alerts.push({
          kind: "operation-late",
          farmName: farm.name,
          plotName: plot.name,
          text: `${KIND_NAME[o.kind]} atrasada (prevista para ${ddmm(o.date)})`,
          href: `/operacao?id=${o.id}`,
          weight: 900 + daysSince(o.date, now),
        });
      }

      return {
        plot,
        season,
        lastVisit,
        daysSinceVisit,
        dap,
        lastFindings: lastVisit ? (findingsByVisit.get(lastVisit.id) ?? []).sort((a, b) => a.createdAt - b.createdAt) : [],
      };
    });

    farms.push({
      farm,
      rain7: rain.filter((r) => r.date > cut7).reduce((s, r) => s + r.mm, 0),
      rain30: rain.filter((r) => r.date > cut30).reduce((s, r) => s + r.mm, 0),
      plots: statuses,
    });
  }

  alerts.sort((a, b) => b.weight - a.weight);
  return { farms, alerts };
}
