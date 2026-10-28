"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import {
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarX2,
  Check,
  ClipboardList,
  Navigation,
  Plus,
  Sprout,
  UserRoundPen,
  type LucideIcon,
} from "lucide-react";
import { LoadDemoButton } from "./demo-bits";
import { ShapeThumb } from "./map-bits";
import { useProfile } from "./profile-bits";
import { Card, LinkButton, PageSkeleton } from "./ui";
import { VisitRow } from "./visit-row";
import { OfflineNote } from "./welcome";
import { buildAgenda, newVisitHref, UPCOMING_DAYS, type AgendaItem, type AgendaKind } from "@/lib/agenda";
import { alive, db } from "@/lib/db";
import { greeting, plotLabel, todayISO, todayLong } from "@/lib/format";
import { center, mapsLink } from "@/lib/geo";
import { NO_VISIT_ALERT_DAYS } from "@/lib/panel";

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const GROUPS: { kind: AgendaKind; title: string; hint: string; icon: LucideIcon; stripe: string; tone: string }[] = [
  { kind: "overdue", title: "Atrasados", hint: "Retorno combinado que passou da data", icon: CalendarX2, stripe: "bg-danger", tone: "text-danger" },
  { kind: "today", title: "Hoje", hint: "Retorno combinado para hoje", icon: CalendarCheck, stripe: "bg-brand", tone: "text-brand" },
  {
    kind: "no-visit",
    title: "Visitar logo",
    hint: `Lavoura no ciclo sem visita há mais de ${NO_VISIT_ALERT_DAYS} dias`,
    icon: CalendarClock,
    stripe: "bg-warn",
    tone: "text-warn",
  },
  { kind: "upcoming", title: "Próximos dias", hint: `Retornos dos próximos ${UPCOMING_DAYS} dias`, icon: CalendarDays, stripe: "bg-border", tone: "text-muted" },
];

function reason(item: AgendaItem): string {
  const { kind, days, due } = item;
  if (kind === "overdue") return `Retorno atrasado ${plural(days, "dia", "dias")} (era ${ddmm(due!)})`;
  if (kind === "today") return "Retorno combinado para hoje";
  if (kind === "upcoming") return days === 1 ? `Retorno amanhã (${ddmm(due!)})` : `Retorno em ${days} dias (${ddmm(due!)})`;
  const base = item.lastVisit ? `Sem visita há ${days} dias` : `Nenhuma visita desde o plantio (${days} dias)`;
  return item.alsoDue ? `${base}; retorno marcado para ${ddmm(item.alsoDue)}` : base;
}

function lastVisitLine(item: AgendaItem): string {
  const v = item.lastVisit;
  // "Sem visita" já diz isso no motivo.
  if (!v) return item.kind === "no-visit" ? "" : "Nenhuma visita nesta safra";
  const parts = [`Última visita ${ddmm(v.date)}`];
  if (item.stage) parts.push(item.stage);
  parts.push(item.lastFindings ? plural(item.lastFindings, "achado", "achados") : "sem achados");
  return parts.join(" · ");
}

const actionClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition active:scale-[0.98]";

function AgendaCard({ item, stripe, tone }: { item: AgendaItem; stripe: string; tone: string }) {
  const ring = item.plot.boundary;
  const producer = item.client?.name || item.farm.owner;
  return (
    <Card className="relative overflow-hidden p-0">
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${stripe}`} />
      <Link href={`/talhao?id=${item.plot.id}`} className="flex gap-3 p-4 pb-3 pl-5 active:bg-brand-soft/40">
        <ShapeThumb rings={[ring]} size="size-14" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate font-semibold">{plotLabel(item.plot.name)}</p>
            {item.dap !== null ? (
              <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold tabular-nums text-brand-strong">
                {item.dap} DAP
              </span>
            ) : null}
          </div>
          <p className="truncate text-sm text-muted">{[producer, item.farm.name].filter(Boolean).join(" · ")}</p>
          <p className={`mt-1.5 text-sm font-medium ${tone}`}>{reason(item)}</p>
          {lastVisitLine(item) ? <p className="mt-0.5 text-xs text-muted">{lastVisitLine(item)}</p> : null}
        </div>
      </Link>
      <div className="flex gap-2 px-4 pb-4 pl-5">
        <Link href={newVisitHref(item)} className={`${actionClass} flex-1 bg-brand text-white shadow-sm hover:bg-brand-strong`}>
          <ClipboardList className="size-4" /> Visitar
        </Link>
        {ring && ring.length >= 3 ? (
          <a
            href={mapsLink(center(ring))}
            target="_blank"
            rel="noopener noreferrer"
            className={`${actionClass} border border-border bg-surface hover:bg-brand-soft`}
          >
            <Navigation className="size-4" /> Rota
          </a>
        ) : null}
      </div>
    </Card>
  );
}

/**
 * Agenda do engenheiro (ADR 0008): o que visitar hoje em todos os clientes, do mais urgente
 * para o menos. Tela inicial do modo campo.
 */
export function TodayView() {
  const profile = useProfile();
  const data = useLiveQuery(async () => {
    const [farms, plots, seasons, visits, findings, clients] = await Promise.all([
      db.farms.toArray(),
      db.plots.toArray(),
      db.seasons.toArray(),
      db.visits.toArray(),
      db.findings.toArray(),
      db.clients.toArray(),
    ]);
    const today = todayISO();
    const liveFarms = alive(farms);
    const farmIds = new Set(liveFarms.map((f) => f.id));
    const livePlots = alive(plots).filter((p) => farmIds.has(p.farmId));
    const plotIds = new Set(livePlots.map((p) => p.id));
    const liveVisits = alive(visits).filter((v) => plotIds.has(v.plotId));
    const agenda = buildAgenda(
      {
        farms: liveFarms,
        plots: livePlots,
        seasons: alive(seasons).filter((s) => plotIds.has(s.plotId)),
        visits: liveVisits,
        findings: alive(findings),
        clients: alive(clients),
      },
      today,
    );
    return {
      agenda,
      farms: liveFarms,
      plotName: new Map(livePlots.map((p) => [p.id, p.name])),
      doneToday: liveVisits.filter((v) => v.date === today).sort((a, b) => b.createdAt - a.createdAt),
      hasClients: alive(clients).length > 0,
    };
  });

  if (!data || profile === undefined) return <PageSkeleton />;

  const { agenda, doneToday } = data;
  const firstName = profile?.name.split(" ")[0];
  const farmName = new Map(data.farms.map((f) => [f.id, f.name]));
  const urgent = agenda.overdue.length + agenda.today.length + agenda["no-visit"].length;
  const summary =
    data.farms.length === 0
      ? "Comece pela sua carteira de clientes."
      : urgent > 0
        ? `${plural(urgent, "talhão pede", "talhões pedem")} visita.`
        : "Nenhum talhão pendente. Tudo em dia.";

  return (
    <>
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0f2b1c] via-[#14532f] to-[#1c6b41] p-5 text-white shadow-lg shadow-[#1c6b41]/20 sm:p-6">
        <Sprout aria-hidden className="pointer-events-none absolute -bottom-10 -right-8 size-48 text-white/[0.07]" strokeWidth={1.4} />
        <div className="relative">
          <p className="text-sm text-white/70">{todayLong()}</p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight sm:text-3xl">
            {greeting()}
            {firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="mt-1 text-white/80">{summary}</p>
          {data.farms.length > 0 ? (
            <ul className="mt-4 flex flex-wrap gap-2 text-sm">
              {agenda.overdue.length ? (
                <li className="rounded-full bg-[#f97066]/25 px-3 py-1 font-medium ring-1 ring-[#f97066]/40">
                  {plural(agenda.overdue.length, "atrasado", "atrasados")}
                </li>
              ) : null}
              {agenda.today.length ? (
                <li className="rounded-full bg-white/15 px-3 py-1 font-medium ring-1 ring-white/20">{agenda.today.length} para hoje</li>
              ) : null}
              {agenda["no-visit"].length ? (
                <li className="rounded-full bg-white/10 px-3 py-1 ring-1 ring-white/15">{agenda["no-visit"].length} sem visita</li>
              ) : null}
              <li className="rounded-full bg-white/10 px-3 py-1 ring-1 ring-white/15">
                {doneToday.length ? `${plural(doneToday.length, "visita feita", "visitas feitas")} hoje` : "Nenhuma visita hoje ainda"}
              </li>
            </ul>
          ) : null}
          {data.farms.length > 0 ? (
            <Link
              href="/visitas/nova"
              className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-xl bg-white px-5 font-semibold text-[#14532f] shadow-sm transition active:scale-[0.98]"
            >
              <Plus className="size-5" /> Nova visita
            </Link>
          ) : null}
        </div>
      </section>

      {!profile?.name ? (
        <Card className="flex items-center gap-3 border-warn/40 bg-warn/5">
          <UserRoundPen aria-hidden className="size-6 shrink-0 text-warn" />
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-medium">Seu nome ainda não sai no relatório.</span>{" "}
            <span className="text-muted">Preencha função e registro para o produtor saber quem visitou.</span>
          </p>
          <LinkButton href="/perfil" variant="secondary" className="shrink-0">
            Preencher
          </LinkButton>
        </Card>
      ) : null}

      {data.farms.length === 0 ? (
        <FirstSteps profileDone={!!profile?.name} hasClients={data.hasClients} />
      ) : agenda.total === 0 ? (
        <Card className="flex items-center gap-3">
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
            <Check className="size-6" />
          </span>
          <p className="text-sm">
            <span className="font-medium">Nada pendente nos seus clientes.</span>{" "}
            <span className="text-muted">Retornos e talhões sem visita aparecem aqui assim que chegarem perto da data.</span>
          </p>
        </Card>
      ) : (
        GROUPS.filter((g) => agenda[g.kind].length > 0).map((g) => (
          <section key={g.kind} className="space-y-3" aria-labelledby={`grupo-${g.kind}`}>
            <div className="flex items-baseline justify-between gap-3">
              <h2 id={`grupo-${g.kind}`} className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                <g.icon aria-hidden className={`size-5 ${g.tone}`} />
                {g.title}
                <span className="text-base font-normal tabular-nums text-muted">{agenda[g.kind].length}</span>
              </h2>
              <p className="hidden text-sm text-muted sm:block">{g.hint}</p>
            </div>
            <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {agenda[g.kind].map((item) => (
                <li key={item.key}>
                  <AgendaCard item={item} stripe={g.stripe} tone={g.tone} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {doneToday.length > 0 ? (
        <section className="space-y-3" aria-labelledby="feitas-hoje">
          <h2 id="feitas-hoje" className="text-lg font-semibold tracking-tight">
            Feitas hoje
          </h2>
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {doneToday.map((v) => (
              <li key={v.id}>
                <VisitRow visit={v} farmName={farmName.get(v.farmId)} plotName={data.plotName.get(v.plotId) ?? ""} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

/** Primeiros passos de quem vai a campo: é uma sequência de verdade, por isso numerada. */
function FirstSteps({ profileDone, hasClients }: { profileDone: boolean; hasClients: boolean }) {
  const steps = [
    { done: profileDone, title: "Seu perfil", text: "Nome, função e registro, que saem no relatório.", href: "/perfil", cta: "Preencher" },
    // Só aparece sem fazenda, então este passo nunca está feito; com cliente, falta a fazenda.
    {
      done: false,
      title: "Cliente e fazenda",
      text: hasClients
        ? "Falta a fazenda do cliente e os talhões com o plantio."
        : "O produtor que você atende, a fazenda e os talhões com o plantio.",
      href: hasClients ? "/clientes" : "/clientes?novo=1",
      cta: "Cadastrar",
    },
    { done: false, title: "Primeira visita", text: "Estágio, achados com foto, recomendação e retorno.", href: "/visitas/nova", cta: "Começar" },
  ];
  const next = steps.findIndex((s) => !s.done);
  return (
    <>
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={s.title}>
            <Card className={`flex items-center gap-3 ${i === next ? "border-brand/50" : ""}`}>
              <span
                aria-hidden
                className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold ${
                  s.done ? "bg-brand text-white" : i === next ? "bg-brand-soft text-brand-strong" : "bg-border/60 text-muted"
                }`}
              >
                {s.done ? <Check className="size-5" /> : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block font-medium ${s.done ? "text-muted line-through decoration-1" : ""}`}>{s.title}</span>
                <span className="block text-sm text-muted">{s.text}</span>
              </span>
              {i === next ? (
                <LinkButton href={s.href} className="shrink-0">
                  {s.cta}
                </LinkButton>
              ) : null}
            </Card>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
        Quer ver como fica com dados? <LoadDemoButton className="text-brand" />
      </div>
      <OfflineNote />
    </>
  );
}
