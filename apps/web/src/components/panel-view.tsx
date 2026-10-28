"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  CalendarClock,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  LandPlot,
  Package,
  Sprout,
  Tractor,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { Welcome } from "@/components/welcome";
import { MiniMap, hasShape } from "@/components/map-bits";
import { OperationRow } from "@/components/operation-row";
import { VisitRow } from "@/components/visit-row";
import { Card, Chip, LinkButton, PageSkeleton, SectionTitle } from "@/components/ui";
import { LAST_BACKUP_KEY } from "@/lib/backup";
import { alive, db, getMeta, type OperationKind } from "@/lib/db";
import { formatDate, greeting, todayISO, todayLong, plotLabel } from "@/lib/format";
import { KIND_NAME, formatBRL, formatBRLShort, formatNumberBR, seasonLabels, seasonStats, yieldByPlot } from "@/lib/operations";
import { NO_VISIT_ALERT_DAYS, buildPanel, type FarmStatus, type PlotStatus } from "@/lib/panel";
import { DEMO_PREFIX } from "@/lib/demo";
import { seasonFinance } from "@/lib/finance";
import { daysSince } from "@/lib/season";
import { stockAlerts, stockOf, usesByOperation } from "@/lib/stock";

/** Item do "Pede atenção": talhão (visita, retorno, operação) ou estoque. */
type Attention = {
  key: string;
  title: string;
  sub: string;
  text: string;
  href: string;
  danger: boolean;
  weight: number;
  icon: LucideIcon;
};

const ALERT_ICON: Record<string, LucideIcon> = {
  "followup-overdue": CalendarClock,
  "followup-today": CalendarClock,
  "no-visit": ClipboardList,
  "operation-late": Tractor,
};

/** Depois de quanto tempo sem backup o aviso aparece. */
const BACKUP_NAG_MS = 3 * 86_400_000;

const mm = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mm`;

const KIND_COLOR: Record<OperationKind, string> = {
  preparo: "#d97706",
  plantio: "#1c6b41",
  adubacao: "#0284c7",
  aplicacao: "#10b981",
  colheita: "#eab308",
  outro: "#94a3b8",
};

export function PanelView() {
  const [chosenLabel, setChosenLabel] = useState<string>();

  const data = useLiveQuery(async () => {
    const [farms, plots, seasons, visits, findings, rainfall, operations, supplies, moves, sales, expenses, lastBackupAt] =
      await Promise.all([
        db.farms.toArray(),
        db.plots.toArray(),
        db.seasons.toArray(),
        db.visits.orderBy("date").reverse().toArray(),
        db.findings.toArray(),
        db.rainfall.toArray(),
        db.operations.toArray(),
        db.supplies.toArray(),
        db.stockMoves.toArray(),
        db.sales.toArray(),
        db.expenses.toArray(),
        getMeta<number>(LAST_BACKUP_KEY),
      ]);
    const today = todayISO();
    const liveFarms = alive(farms);
    const livePlots = alive(plots).filter((p) => liveFarms.some((f) => f.id === p.farmId));
    const plotIds = new Set(livePlots.map((p) => p.id));
    const live = alive(visits).filter((v) => plotIds.has(v.plotId));
    const liveOps = alive(operations).filter((o) => plotIds.has(o.plotId));
    const liveSeasons = alive(seasons).filter((s) => plotIds.has(s.plotId));
    const liveSupplies = alive(supplies);
    const liveMoves = alive(moves);
    const ofLiveFarm = (r: { farmId?: string | null }) => !r.farmId || liveFarms.some((f) => f.id === r.farmId);
    const liveSales = alive(sales).filter(ofLiveFarm);
    const liveExpenses = alive(expenses).filter(ofLiveFarm);
    const since = lastBackupAt ?? 0;
    const changed = [...live, ...liveOps, ...liveSupplies, ...liveMoves, ...liveSales, ...liveExpenses].filter(
      (r) => r.updatedAt > since && !r.id.startsWith(DEMO_PREFIX),
    ).length;
    const panel = buildPanel(
      {
        farms: liveFarms,
        plots: livePlots,
        seasons: liveSeasons,
        visits: live,
        findings: alive(findings),
        rainfall: alive(rainfall),
        operations: liveOps,
      },
      today,
    );
    const upcoming = live
      .filter((v) => v.followUpDate && !v.followUpDone && v.followUpDate > today)
      .sort((a, b) => (a.followUpDate! < b.followUpDate! ? -1 : 1));
    const recentOps = [...liveOps].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5);
    const attention: Attention[] = [
      ...panel.alerts.map((a) => ({
        key: `${a.kind}-${a.href}`,
        title: plotLabel(a.plotName),
        sub: a.farmName,
        text: a.text,
        href: a.href,
        danger: a.kind === "followup-overdue" || a.kind === "operation-late",
        weight: a.weight,
        icon: ALERT_ICON[a.kind] ?? ClipboardList,
      })),
      ...stockAlerts(stockOf(liveSupplies, liveMoves, alive(operations))).map((a) => ({
        key: `${a.kind}-${a.href}`,
        title: a.title,
        sub: "Estoque",
        text: a.text,
        href: a.href,
        danger: a.kind !== "stock-low",
        weight: a.weight,
        icon: Package,
      })),
    ].sort((a, b) => b.weight - a.weight);
    return {
      today,
      farms: liveFarms,
      plots: livePlots,
      seasons: liveSeasons,
      visits: live,
      operations: liveOps,
      sales: liveSales,
      expenses: liveExpenses,
      unsaved: Date.now() - since > BACKUP_NAG_MS ? changed : 0,
      panel,
      attention,
      uses: usesByOperation(liveMoves, liveSupplies),
      upcoming,
      recentOps,
    };
  });

  if (!data) return <PageSkeleton />;

  const { today, panel } = data;
  const farmName = new Map(data.farms.map((f) => [f.id, f.name]));
  const plotName = new Map(data.plots.map((p) => [p.id, p.name]));
  const labels = seasonLabels(data.seasons);
  const label = chosenLabel && labels.includes(chosenLabel) ? chosenLabel : labels[0];
  const stats = label ? seasonStats(label, data.seasons, data.plots, data.operations, today) : null;
  const money = label && stats ? seasonFinance(label, stats, data.sales, data.expenses) : null;
  const yields = label ? yieldByPlot(label, data.seasons, data.operations) : [];
  const mapFarm = panel.farms.find((f) => f.plots.some(hasShape));
  /** Sem colheita na safra escolhida, a média mostra a última safra colhida como referência. */
  const pastYield =
    stats && stats.yieldPerHa == null
      ? labels
          .filter((l) => l < (label ?? ""))
          .map((l) => ({ label: l, stats: seasonStats(l, data.seasons, data.plots, data.operations, today) }))
          .find((p) => p.stats.yieldPerHa != null)
      : undefined;

  if (data.farms.length === 0) {
    return <Welcome />;
  }

  const pending = data.attention.length;
  const visits7 = data.visits.filter((v) => daysSince(v.date) <= 7).length;

  return (
    <>
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0f2b1c] via-[#14532f] to-[#1c6b41] p-5 text-white shadow-lg shadow-[#1c6b41]/20 sm:p-6">
        <Sprout aria-hidden className="pointer-events-none absolute -bottom-10 -right-8 size-48 text-white/[0.07]" strokeWidth={1.4} />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-white/70">{todayLong()}</p>
            <h1 className="mt-0.5 text-2xl font-semibold tracking-tight sm:text-3xl">{greeting()}</h1>
          </div>
          {labels.length > 0 ? (
            <label className="shrink-0">
              <span className="sr-only">Safra</span>
              <select
                value={label}
                onChange={(e) => setChosenLabel(e.target.value)}
                className="min-h-10 rounded-full bg-white/10 px-3.5 text-sm font-medium text-white ring-1 ring-white/25 backdrop-blur-sm"
              >
                {labels.map((l) => (
                  <option key={l} value={l} className="text-foreground">
                    Safra {l}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <p className="relative mt-3 flex items-center gap-2 text-sm font-medium">
          <span aria-hidden className={`size-2 rounded-full ${pending ? "bg-amber-300" : "bg-accent"}`} />
          {pending ? `${pending} ${pending === 1 ? "item pede" : "itens pedem"} atenção hoje` : "Tudo em dia nas lavouras"}
        </p>
        <dl className="relative mt-4 grid grid-cols-3 divide-x divide-white/15 rounded-2xl bg-white/10 py-3 text-center ring-1 ring-white/10">
          <HeroStat label="Fazendas" value={data.farms.length} />
          <HeroStat label="Talhões" value={data.plots.length} />
          <HeroStat label="Visitas 7 dias" value={visits7} />
        </dl>
      </section>

      {data.unsaved > 0 ? (
        <Card className="flex flex-col gap-3 border-warn/40 bg-warn/5 sm:flex-row sm:items-center">
          <p className="flex-1 text-sm">
            <span className="font-semibold">
              {data.unsaved === 1 ? "1 registro ainda não está" : `${data.unsaved} registros ainda não estão`} em nenhum
              backup.
            </span>{" "}
            Se o celular quebrar ou o navegador for limpo, eles se perdem.
          </p>
          <LinkButton href="/dados" variant="secondary" className="shrink-0">
            Fazer backup agora
          </LinkButton>
        </Card>
      ) : null}

      {stats ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            icon={LandPlot}
            label="Área da safra"
            value={stats.areaHa ? `${formatNumberBR(stats.areaHa, 1)} ha` : "—"}
            sub={stats.areaHa ? `${stats.plots} ${stats.plots === 1 ? "talhão" : "talhões"}` : "Informe a área dos talhões"}
          />
          <Kpi
            icon={TrendingUp}
            label="Produtividade média"
            value={stats.yieldPerHa != null ? `${formatNumberBR(stats.yieldPerHa, 1)} sc/ha` : "—"}
            sub={
              stats.yieldPerHa != null
                ? `${formatNumberBR(stats.harvestedHa, 1)} ha colhidos`
                : pastYield
                  ? `Safra ${pastYield.label}: ${formatNumberBR(pastYield.stats.yieldPerHa, 1)} sc/ha`
                  : "Aparece quando registrar a colheita"
            }
          />
          <Kpi
            icon={CircleDollarSign}
            label="Custo por hectare"
            value={money?.costPerHa != null ? formatBRL(money.costPerHa) : "—"}
            sub={
              money && money.totalCost > 0
                ? `Realizado ${formatBRL(money.totalCost)}${stats.plannedCost > 0 ? ` · previsto +${formatBRL(stats.plannedCost)}` : ""}`
                : stats.plannedCost > 0
                  ? `Previsto ${formatBRL(stats.plannedCost)} (nada realizado)`
                  : "Anote o custo nas operações"
            }
          />
          <Kpi
            icon={Tractor}
            label="Operações abertas"
            value={String(stats.open)}
            sub={
              stats.late > 0
                ? `${stats.late} atrasada${stats.late > 1 ? "s" : ""}`
                : stats.doneToday > 0
                  ? `${stats.doneToday} concluída${stats.doneToday > 1 ? "s" : ""} hoje`
                  : "Nenhuma atrasada"
            }
            warn={stats.late > 0}
          />
          <Link
            href={`/safra?rotulo=${encodeURIComponent(label!)}`}
            className="col-span-2 -mt-1 justify-self-end text-sm font-medium text-brand lg:col-span-4"
          >
            Relatório da safra {label} ›
          </Link>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {data.attention.length > 0 ? (
            <section className="space-y-3">
              <SectionTitle>Pede atenção</SectionTitle>
              <Card className="divide-y divide-border p-0">
                {data.attention.map((a) => (
                  <Link key={a.key} href={a.href} className="group flex items-center gap-3 p-3.5 transition hover:bg-brand-soft/40 active:bg-brand-soft">
                    <span
                      aria-hidden
                      className={`grid size-10 shrink-0 place-items-center rounded-xl ${a.danger ? "bg-danger/10 text-danger" : "bg-warn/10 text-warn"}`}
                    >
                      <a.icon className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-baseline gap-1.5">
                        <span className="max-w-full shrink-0 truncate font-semibold">{a.title}</span>
                        <span className="min-w-0 truncate text-xs text-muted">{a.sub}</span>
                      </span>
                      <span className={`block text-sm ${a.danger ? "text-danger" : "text-muted"}`}>{a.text}</span>
                    </span>
                    <ChevronRight aria-hidden className="size-4 shrink-0 text-muted transition group-hover:translate-x-0.5" />
                  </Link>
                ))}
              </Card>
            </section>
          ) : null}

          {panel.farms.map((f) => (
            <FarmBlock key={f.farm.id} status={f} />
          ))}

          {data.visits.length > 0 ? (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <SectionTitle>Últimas visitas</SectionTitle>
                <Link href="/visitas" className="text-sm font-medium text-brand">
                  Ver todas
                </Link>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {data.visits.slice(0, 4).map((v) => (
                  <VisitRow
                    key={v.id}
                    visit={v}
                    farmName={farmName.get(v.farmId) ?? "Fazenda"}
                    plotName={plotName.get(v.plotId) ?? "Talhão"}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="space-y-6">
          {mapFarm ? (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <SectionTitle>Mapa · {mapFarm.farm.name}</SectionTitle>
                <Link href={`/mapa?fazenda=${mapFarm.farm.id}`} className="text-sm font-medium text-brand">
                  Abrir
                </Link>
              </div>
              <Link href={`/mapa?fazenda=${mapFarm.farm.id}`} className="block">
                <Card className="p-2 transition hover:border-brand/40">
                  <MiniMap statuses={mapFarm.plots} alerts={panel.alerts} />
                </Card>
              </Link>
            </section>
          ) : null}

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <SectionTitle>Operações recentes</SectionTitle>
              <Link href="/operacoes" className="text-sm font-medium text-brand">
                Ver todas
              </Link>
            </div>
            {data.recentOps.length === 0 ? (
              <Card className="space-y-3">
                <p className="text-sm text-muted">Registre plantio, aplicações e colheita para acompanhar custo e produtividade.</p>
                <LinkButton href="/operacoes/nova" variant="secondary" className="w-full">
                  Registrar operação
                </LinkButton>
              </Card>
            ) : (
              data.recentOps.map((o) => (
                <OperationRow
                  key={o.id}
                  op={o}
                  today={today}
                  farmName={farmName.get(o.farmId) ?? "Fazenda"}
                  plotName={plotName.get(o.plotId) ?? "?"}
                  uses={data.uses.get(o.id)}
                />
              ))
            )}
          </section>

          {stats && stats.costByKind.length > 0 ? (
            <section className="space-y-3">
              <SectionTitle>Custos por tipo de operação</SectionTitle>
              <Card>
                <CostDonut items={stats.costByKind} total={stats.cost} />
              </Card>
            </section>
          ) : null}

          {yields.length > 0 ? (
            <section className="space-y-3">
              <SectionTitle>Produtividade por talhão</SectionTitle>
              <Card className="space-y-3">
                {yields.map((y) => {
                  const best = yields[0].perHa;
                  return (
                    <div key={y.plotId} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{plotLabel(plotName.get(y.plotId))}</span>
                        <span>{formatNumberBR(y.perHa, 1)} sc/ha</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-border/60">
                        <div className="h-full rounded-full bg-brand" style={{ width: `${(y.perHa / best) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </Card>
            </section>
          ) : null}

          {data.upcoming.length > 0 ? (
            <section className="space-y-3">
              <SectionTitle>Próximos retornos</SectionTitle>
              {data.upcoming.map((v) => (
                <VisitRow
                  key={v.id}
                  visit={v}
                  farmName={farmName.get(v.farmId) ?? "Fazenda"}
                  plotName={plotName.get(v.plotId) ?? "Talhão"}
                  showFollowUp
                />
              ))}
            </section>
          ) : null}
        </aside>
      </div>
    </>
  );
}

function HeroStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-2">
      <dt className="text-[11px] font-medium uppercase tracking-wider text-white/60">{label}</dt>
      <dd className="mt-0.5 text-xl font-semibold tabular-nums">{value.toLocaleString("pt-BR")}</dd>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  warn = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub: ReactNode;
  warn?: boolean;
}) {
  return (
    <Card className="flex flex-col gap-2 p-3.5 sm:flex-row sm:items-start sm:gap-3 sm:p-4">
      <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand sm:size-11">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs text-muted">{label}</span>
        <span className="block text-xl font-semibold tabular-nums tracking-tight sm:text-2xl">{value}</span>
        <span className={`block text-xs ${warn ? "font-medium text-danger" : "text-muted"}`}>{sub}</span>
      </span>
    </Card>
  );
}

function CostDonut({ items, total }: { items: { kind: OperationKind; cost: number }[]; total: number }) {
  const stops = items.map((item, idx) => {
    const before = items.slice(0, idx).reduce((s, i) => s + i.cost, 0);
    return `${KIND_COLOR[item.kind]} ${(before / total) * 100}% ${((before + item.cost) / total) * 100}%`;
  });
  return (
    <div className="flex items-center gap-5">
      <div
        className="relative grid size-32 shrink-0 place-items-center rounded-full"
        style={{ background: `conic-gradient(${stops.join(", ")})` }}
        role="img"
        aria-label={`Custo total ${formatBRL(total)}`}
      >
        <div className="grid size-[5.5rem] place-items-center rounded-full bg-surface text-center">
          <span>
            <span className="block text-base font-semibold tabular-nums">{formatBRLShort(total)}</span>
            <span className="block text-[10px] text-muted">em operações</span>
          </span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
        {items.map((i) => (
          <li key={i.kind} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: KIND_COLOR[i.kind] }} />
              <span className="truncate">{KIND_NAME[i.kind]}</span>
            </span>
            <span className="text-muted">{Math.round((i.cost / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FarmBlock({ status }: { status: FarmStatus }) {
  const { farm, plots, rain7, rain30 } = status;
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <Link href={`/fazenda?id=${farm.id}`} className="min-w-0 truncate text-xs font-semibold uppercase tracking-wider text-muted">
          {farm.name} ›
        </Link>
        <span className="text-xs text-muted">
          Chuva 7 dias: {mm(rain7)} · 30 dias: {mm(rain30)}
        </span>
      </div>
      {plots.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">
            Nenhum talhão.{" "}
            <Link href={`/fazenda?id=${farm.id}`} className="text-brand underline">
              Cadastrar
            </Link>
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {plots.map((p) => (
            <PlotCard key={p.plot.id} status={p} />
          ))}
        </div>
      )}
    </section>
  );
}

function PlotCard({ status }: { status: PlotStatus }) {
  const { plot, season, lastVisit, daysSinceVisit, dap, lastFindings } = status;
  const late = daysSinceVisit !== null && daysSinceVisit > NO_VISIT_ALERT_DAYS && lastVisit?.stage !== "R8";
  const details = [season?.cultivar, dap !== null ? `${dap} DAP` : null, plot.areaHa ? `${formatNumberBR(plot.areaHa, 2)} ha` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link href={`/talhao?id=${plot.id}`} className="block h-full active:scale-[0.99]">
      <Card className="h-full transition hover:border-brand/40">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium">{plotLabel(plot.name)}</p>
            {details ? <p className="mt-0.5 text-sm text-muted">{details}</p> : null}
          </div>
          {lastVisit ? <Chip>{lastVisit.stage}</Chip> : <Chip tone="muted">Sem visita</Chip>}
        </div>
        {lastVisit ? (
          <>
            <p className={`mt-2 text-sm ${late ? "font-medium text-warn" : "text-muted"}`}>
              Última visita {daysSinceVisit === 0 ? "hoje" : daysSinceVisit === 1 ? "ontem" : `há ${daysSinceVisit} dias`} (
              {formatDate(lastVisit.date)})
            </p>
            {lastFindings.length ? (
              <p className="mt-2 flex flex-wrap gap-1.5">
                {lastFindings.map((f) => (
                  <Chip key={f.id} tone="muted">
                    {f.name}
                    {f.amount ? ` · ${f.amount}` : ""}
                  </Chip>
                ))}
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted">Nada encontrado na última visita</p>
            )}
          </>
        ) : (
          <p className="mt-2 text-sm text-muted">
            {season ? `Nenhuma visita na safra ${season.label}` : "Cadastre a safra para acompanhar"}
          </p>
        )}
      </Card>
    </Link>
  );
}
