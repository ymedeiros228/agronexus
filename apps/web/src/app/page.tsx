"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { VisitRow } from "@/components/visit-row";
import { Card, Chip, Empty, LinkButton, PageTitle, SectionTitle } from "@/components/ui";
import { LAST_BACKUP_KEY } from "@/lib/backup";
import { alive, db, getMeta } from "@/lib/db";
import { formatDate, todayISO } from "@/lib/format";
import { NO_VISIT_ALERT_DAYS, buildPanel, type FarmStatus, type PlotStatus } from "@/lib/panel";

/** Depois de quanto tempo sem backup o aviso aparece. */
const BACKUP_NAG_MS = 3 * 86_400_000;

const mm = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mm`;

export default function Home() {
  const data = useLiveQuery(async () => {
    const [farms, plots, seasons, visits, findings, rainfall, lastBackupAt] = await Promise.all([
      db.farms.toArray(),
      db.plots.toArray(),
      db.seasons.toArray(),
      db.visits.orderBy("date").reverse().toArray(),
      db.findings.toArray(),
      db.rainfall.toArray(),
      getMeta<number>(LAST_BACKUP_KEY),
    ]);
    const today = todayISO();
    const live = alive(visits);
    const since = lastBackupAt ?? 0;
    const unsaved = Date.now() - since > BACKUP_NAG_MS ? live.filter((v) => v.updatedAt > since).length : 0;
    const liveFarms = alive(farms);
    const livePlots = alive(plots);
    const panel = buildPanel(
      {
        farms: liveFarms,
        plots: livePlots,
        seasons: alive(seasons),
        visits: live,
        findings: alive(findings),
        rainfall: alive(rainfall),
      },
      today,
    );
    const upcoming = live
      .filter((v) => v.followUpDate && !v.followUpDone && v.followUpDate > today)
      .sort((a, b) => (a.followUpDate! < b.followUpDate! ? -1 : 1));
    return { farms: liveFarms, plots: livePlots, visits: live, unsaved, panel, upcoming };
  });

  if (!data) return null;

  const farmName = new Map(data.farms.map((f) => [f.id, f.name]));
  const plotName = new Map(data.plots.map((p) => [p.id, p.name]));
  const { alerts, farms } = data.panel;

  return (
    <>
      <PageTitle title="Painel" subtitle="Como estão suas lavouras hoje. Funciona sem internet." />

      {data.farms.length === 0 ? (
        <Empty
          title="Comece cadastrando uma fazenda"
          text="Depois adicione os talhões e registre a primeira visita."
          action={<LinkButton href="/fazendas">Cadastrar fazenda</LinkButton>}
        />
      ) : (
        <LinkButton href="/visitas/nova" className="w-full min-h-14 text-base">
          + Nova visita
        </LinkButton>
      )}

      {data.unsaved > 0 ? (
        <Card className="space-y-3 border-warn/40 bg-warn/5">
          <p className="text-sm">
            <span className="font-semibold">
              {data.unsaved === 1 ? "1 visita ainda não está" : `${data.unsaved} visitas ainda não estão`} em nenhum
              backup.
            </span>{" "}
            Se o celular quebrar ou o navegador for limpo, elas se perdem.
          </p>
          <LinkButton href="/dados" variant="secondary" className="w-full">
            Fazer backup agora
          </LinkButton>
        </Card>
      ) : null}

      {alerts.length > 0 ? (
        <section className="space-y-3">
          <SectionTitle>Pede atenção</SectionTitle>
          <Card className="divide-y divide-border p-0">
            {alerts.map((a) => (
              <Link key={`${a.kind}-${a.href}`} href={a.href} className="flex items-center gap-3 p-4 active:bg-brand-soft">
                <span
                  aria-hidden
                  className={`size-2.5 shrink-0 rounded-full ${a.kind === "followup-overdue" ? "bg-danger" : "bg-warn"}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {a.farmName} <span className="text-muted">· {a.plotName}</span>
                  </span>
                  <span className="block text-sm text-muted">{a.text}</span>
                </span>
                <span aria-hidden className="text-muted">
                  ›
                </span>
              </Link>
            ))}
          </Card>
        </section>
      ) : null}

      {farms.map((f) => (
        <FarmBlock key={f.farm.id} status={f} />
      ))}

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

      {data.visits.length > 0 ? (
        <section className="space-y-3">
          <SectionTitle>Últimas visitas</SectionTitle>
          {data.visits.slice(0, 5).map((v) => (
            <VisitRow
              key={v.id}
              visit={v}
              farmName={farmName.get(v.farmId) ?? "Fazenda"}
              plotName={plotName.get(v.plotId) ?? "Talhão"}
            />
          ))}
        </section>
      ) : null}
    </>
  );
}

function FarmBlock({ status }: { status: FarmStatus }) {
  const { farm, plots, rain7, rain30 } = status;
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <Link href={`/fazenda?id=${farm.id}`} className="min-w-0 truncate text-xs font-semibold uppercase tracking-wider text-muted">
          {farm.name} ›
        </Link>
        <span className="shrink-0 text-xs text-muted">
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
        plots.map((p) => <PlotCard key={p.plot.id} status={p} />)
      )}
    </section>
  );
}

function PlotCard({ status }: { status: PlotStatus }) {
  const { plot, season, lastVisit, daysSinceVisit, dap, lastFindings } = status;
  const late = daysSinceVisit !== null && daysSinceVisit > NO_VISIT_ALERT_DAYS && lastVisit?.stage !== "R8";
  const details = [season?.cultivar, dap !== null ? `${dap} DAP` : null, plot.areaHa ? `${plot.areaHa} ha` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link href={`/talhao?id=${plot.id}`} className="block active:scale-[0.99]">
      <Card className="transition hover:border-brand/40">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium">Talhão {plot.name}</p>
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
