"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight, CloudRain, X } from "lucide-react";
import { ClientField } from "@/components/client-bits";
import { ShapeThumb } from "@/components/map-bits";
import { VisitRow } from "@/components/visit-row";
import { Button, Card, Chip, Empty, Field, inputClass, LinkButton, PageSkeleton, PageTitle, rejectField, SectionTitle } from "@/components/ui";
import { toast } from "@/components/toaster";
import { editFarm } from "@/lib/clients";
import { alive, db, newBase, removeFarm, removeRainfall, restoreRemoved } from "@/lib/db";
import { formatDate, plotLabel, todayISO } from "@/lib/format";
import { formatNumberBR, parseNumberBR, seasonLabels } from "@/lib/operations";
import { SEASON_LABEL_PATTERN, daysSince, latestSeason, normalizeSeasonLabel, seasonLabelFor } from "@/lib/season";

export default function FarmPage() {
  return (
    <Suspense fallback={null}>
      <Farm />
    </Suspense>
  );
}

function Farm() {
  const id = useSearchParams().get("id") ?? "";
  const router = useRouter();
  const [plotOpen, setPlotOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const data = useLiveQuery(async () => {
    const farm = await db.farms.get(id);
    const [plots, visits, rain, clients] = await Promise.all([
      db.plots.where("farmId").equals(id).toArray(),
      db.visits.where("farmId").equals(id).reverse().sortBy("date"),
      db.rainfall.where("farmId").equals(id).reverse().sortBy("date"),
      db.clients.orderBy("name").toArray(),
    ]);
    const livePlots = alive(plots);
    const seasons = alive(await db.seasons.where("plotId").anyOf(livePlots.map((p) => p.id)).toArray());
    return {
      farm: farm && !farm.deletedAt ? farm : null,
      plots: livePlots,
      seasons,
      visits: alive(visits),
      rain: alive(rain),
      clients: alive(clients),
    };
  }, [id]);

  async function addPlot(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const name = String(f.get("name") ?? "").trim();
    if (!name) return;
    const seasonText = String(f.get("season") ?? "").trim();
    const label = seasonText ? normalizeSeasonLabel(seasonText) : seasonLabelFor();
    if (!label) return rejectField(form, "season", "Use o formato 2026/27.");
    const plot = { ...newBase(), farmId: id, name, areaHa: parseNumberBR(String(f.get("area") ?? "")) };
    await db.transaction("rw", db.plots, db.seasons, async () => {
      await db.plots.add(plot);
      await db.seasons.add({
        ...newBase(),
        plotId: plot.id,
        label,
        cultivar: String(f.get("cultivar") ?? "").trim(),
        plantingDate: String(f.get("planting") ?? "") || null,
      });
    });
    form.reset();
    setPlotOpen(false);
    toast(`${plotLabel(name)} cadastrado.`);
  }

  async function addRain(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const mm = parseNumberBR(String(f.get("mm") ?? ""));
    if (mm == null) return;
    await db.rainfall.add({ ...newBase(), farmId: id, date: String(f.get("date")), mm });
    form.reset();
    toast(`Chuva de ${formatNumberBR(mm, 1)} mm anotada.`);
  }

  async function saveFarm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get("name") ?? "").trim();
    if (!name) return;
    await editFarm(id, {
      name,
      municipality: String(f.get("municipality") ?? ""),
      clientName: String(f.get("client") ?? ""),
    });
    setEditOpen(false);
    toast("Fazenda atualizada.");
  }

  async function remove() {
    if (!data?.farm) return;
    const n = data.visits.length;
    const extra = n ? `, os talhões e ${n === 1 ? "1 visita" : `${n} visitas`}` : " e os talhões";
    if (!window.confirm(`Remover ${data.farm.name}${extra}? Faça um backup antes, se tiver dúvida.`)) return;
    const at = await removeFarm(id);
    toast(`${data.farm.name} removida.`, { undo: () => restoreRemoved(at) });
    router.push("/fazendas");
  }

  if (!data) return <PageSkeleton />;
  if (!data.farm) {
    return (
      <Empty
        title="Fazenda não encontrada"
        text="Ela pode ter sido removida deste aparelho."
        action={<LinkButton href="/fazendas">Voltar às fazendas</LinkButton>}
      />
    );
  }

  const { farm, plots, seasons, visits, rain, clients } = data;
  const client = clients.find((c) => c.id === farm.clientId);
  const plotName = new Map(plots.map((p) => [p.id, p.name]));
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffISO = cutoff.toISOString().slice(0, 10);
  const last30 = rain.filter((r) => r.date >= cutoffISO).reduce((sum, r) => sum + r.mm, 0);
  const reportLabel = seasonLabels(seasons)[0];
  const totalArea = plots.reduce((sum, p) => sum + (p.areaHa ?? 0), 0);
  const maxRain = Math.max(1, ...rain.slice(0, 8).map((r) => r.mm));

  return (
    <>
      <div>
        {client ? (
          <Link href={`/cliente?id=${client.id}`} className="text-sm text-brand">
            ← {client.name}
          </Link>
        ) : (
          <Link href="/fazendas" className="text-sm text-brand">
            ← Fazendas
          </Link>
        )}
      </div>
      <PageTitle
        title={farm.name}
        subtitle={[farm.municipality, farm.owner].filter(Boolean).join(" · ") || undefined}
        action={
          <Button variant="ghost" onClick={() => setEditOpen((o) => !o)}>
            {editOpen ? "Cancelar" : "Editar"}
          </Button>
        }
      />

      {editOpen ? (
        <Card className="space-y-4">
          <form onSubmit={saveFarm} className="space-y-4">
            <Field label="Nome da fazenda">
              <input name="name" required defaultValue={farm.name} className={inputClass} />
            </Field>
            <Field label="Município">
              <input name="municipality" defaultValue={farm.municipality} className={inputClass} />
            </Field>
            <ClientField clients={clients} defaultValue={client?.name ?? farm.owner} />
            <Button type="submit" className="w-full">
              Salvar fazenda
            </Button>
          </form>
          <Button variant="danger" className="w-full" onClick={remove}>
            Remover fazenda
          </Button>
        </Card>
      ) : null}

      <dl className="grid grid-cols-3 gap-2">
        {[
          { label: plots.length === 1 ? "Talhão" : "Talhões", value: String(plots.length) },
          { label: "Área", value: totalArea ? `${formatNumberBR(totalArea, totalArea >= 1000 ? 0 : 1)} ha` : "—" },
          { label: "Chuva 30 dias", value: `${formatNumberBR(last30, 1)} mm` },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-border bg-surface px-3 py-2.5">
            <dt className="text-xs text-muted">{stat.label}</dt>
            <dd className="mt-0.5 truncate text-base font-semibold tabular-nums sm:text-lg">{stat.value}</dd>
          </div>
        ))}
      </dl>

      {reportLabel ? (
        <Link
          href={`/safra?rotulo=${encodeURIComponent(reportLabel)}&fazenda=${farm.id}`}
          className="block text-sm font-medium text-brand"
        >
          Relatório da safra {reportLabel} desta fazenda ›
        </Link>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <SectionTitle>Talhões</SectionTitle>
          <div className="flex items-center gap-1">
            <LinkButton href={`/mapa?fazenda=${farm.id}`} variant="ghost">
              Mapa
            </LinkButton>
            <Button variant="ghost" onClick={() => setPlotOpen((o) => !o)}>
              {plotOpen ? "Cancelar" : "+ Talhão"}
            </Button>
          </div>
        </div>

        {plotOpen ? (
          <Card>
            <form onSubmit={addPlot} className="space-y-4">
              <Field label="Nome do talhão">
                <input name="name" required autoFocus className={inputClass} placeholder="Ex.: T-12" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Área (ha)">
                  <input name="area" inputMode="decimal" className={inputClass} placeholder="120" />
                </Field>
                <Field label="Safra">
                  <input name="season" pattern={SEASON_LABEL_PATTERN} title="Ex.: 2026/27" className={inputClass} defaultValue={seasonLabelFor()} />
                </Field>
              </div>
              <Field label="Cultivar">
                <input name="cultivar" className={inputClass} placeholder="Nome da cultivar" />
              </Field>
              <Field label="Data de plantio">
                <input name="planting" type="date" className={inputClass} />
              </Field>
              <Button type="submit" className="w-full">
                Salvar talhão
              </Button>
            </form>
          </Card>
        ) : null}

        {plots.length === 0 && !plotOpen ? (
          <Empty title="Nenhum talhão" text="Cadastre os talhões para registrar visitas nesta fazenda." />
        ) : (
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {plots.map((plot) => {
              const season = latestSeason(seasons.filter((s) => s.plotId === plot.id));
              const last = visits.find((v) => v.plotId === plot.id);
              return (
                <li key={plot.id}>
                  <Card>
                    <Link href={`/talhao?id=${plot.id}`} className="group flex items-start gap-3">
                      <ShapeThumb rings={[plot.boundary]} size="size-14" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="flex min-w-0 items-center gap-1 font-semibold">
                            <span className="truncate">{plotLabel(plot.name)}</span>
                            <ChevronRight className="size-4 shrink-0 text-muted transition group-hover:text-brand" />
                          </p>
                          {season ? <Chip tone="muted">{season.label}</Chip> : null}
                        </div>
                        <p className="mt-0.5 text-sm text-muted">
                          {plot.areaHa ? `${formatNumberBR(plot.areaHa, 2)} ha` : "Área não informada"}
                          {season?.cultivar ? ` · ${season.cultivar}` : ""}
                        </p>
                        {season?.plantingDate ? (
                          <p className="text-sm text-muted">
                            Plantio {formatDate(season.plantingDate)} ·{" "}
                            <span className="font-medium text-foreground">{daysSince(season.plantingDate)} dias</span>
                          </p>
                        ) : null}
                        {last ? (
                          <p className="text-sm text-muted">
                            Última visita {formatDate(last.date)} · {last.stage}
                          </p>
                        ) : null}
                      </div>
                    </Link>
                    <div className="mt-3">
                      <LinkButton
                        href={`/visitas/nova?fazenda=${farm.id}&talhao=${plot.id}`}
                        variant="secondary"
                        className="w-full"
                      >
                        Registrar visita
                      </LinkButton>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <SectionTitle>Chuva</SectionTitle>
          <span className="flex items-center gap-1.5 text-sm text-muted">
            <CloudRain className="size-4 text-sky-500" /> {formatNumberBR(last30, 1)} mm em 30 dias
          </span>
        </div>
        <Card>
          <form onSubmit={addRain} className="grid grid-cols-[minmax(0,1fr)_5rem_auto] items-end gap-3">
            <Field label="Data">
              <input name="date" type="date" required defaultValue={todayISO()} className={`${inputClass} min-w-0`} />
            </Field>
            <Field label="mm">
              <input name="mm" required inputMode="decimal" className={`${inputClass} min-w-0`} placeholder="0" />
            </Field>
            <Button type="submit">Anotar</Button>
          </form>
          {rain.length > 0 ? (
            <ul className="mt-4 divide-y divide-border">
              {rain.slice(0, 8).map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="w-24 shrink-0 tabular-nums">{formatDate(r.date)}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-border/60" aria-hidden>
                    <span className="block h-full rounded-full bg-sky-500" style={{ width: `${(r.mm / maxRain) * 100}%` }} />
                  </span>
                  <span className="w-16 shrink-0 text-right font-medium tabular-nums">{formatNumberBR(r.mm, 1)} mm</span>
                  <button
                    type="button"
                    onClick={async () => {
                      const at = await removeRainfall(r.id);
                      toast(`Chuva de ${formatDate(r.date)} removida.`, { undo: () => restoreRemoved(at) });
                    }}
                    className="-m-2 grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-danger/10 hover:text-danger"
                    aria-label={`Remover chuva de ${formatDate(r.date)}`}
                  >
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      </section>

      <section className="space-y-3">
        <SectionTitle>Visitas</SectionTitle>
        {visits.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">Nenhuma visita nesta fazenda ainda.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {visits.map((v) => (
              <VisitRow key={v.id} visit={v} plotName={plotName.get(v.plotId) ?? "Talhão"} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
