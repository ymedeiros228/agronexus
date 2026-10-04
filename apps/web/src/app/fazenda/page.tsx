"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { VisitRow } from "@/components/visit-row";
import { Button, Card, Chip, Empty, Field, LinkButton, PageTitle, SectionTitle, inputClass } from "@/components/ui";
import { alive, db, newBase, removeRainfall } from "@/lib/db";
import { formatDate, todayISO } from "@/lib/format";

/** Safra de soja: o ano agrícola começa em julho. Ex.: out/2026 vira "2026/27". */
function currentSeasonLabel(): string {
  const d = new Date();
  const start = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
  return `${start}/${String(start + 1).slice(2)}`;
}

export default function FarmPage() {
  return (
    <Suspense fallback={null}>
      <Farm />
    </Suspense>
  );
}

function Farm() {
  const id = useSearchParams().get("id") ?? "";
  const [plotOpen, setPlotOpen] = useState(false);

  const data = useLiveQuery(async () => {
    const farm = await db.farms.get(id);
    const [plots, visits, rain] = await Promise.all([
      db.plots.where("farmId").equals(id).toArray(),
      db.visits.where("farmId").equals(id).reverse().sortBy("date"),
      db.rainfall.where("farmId").equals(id).reverse().sortBy("date"),
    ]);
    const livePlots = alive(plots);
    const seasons = alive(await db.seasons.where("plotId").anyOf(livePlots.map((p) => p.id)).toArray());
    return {
      farm: farm && !farm.deletedAt ? farm : null,
      plots: livePlots,
      seasons,
      visits: alive(visits),
      rain: alive(rain),
    };
  }, [id]);

  async function addPlot(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const name = String(f.get("name") ?? "").trim();
    if (!name) return;
    const area = parseFloat(String(f.get("area") ?? "").replace(",", "."));
    const plot = { ...newBase(), farmId: id, name, areaHa: Number.isFinite(area) ? area : null };
    await db.transaction("rw", db.plots, db.seasons, async () => {
      await db.plots.add(plot);
      await db.seasons.add({
        ...newBase(),
        plotId: plot.id,
        label: String(f.get("season") ?? "").trim() || currentSeasonLabel(),
        cultivar: String(f.get("cultivar") ?? "").trim(),
        plantingDate: String(f.get("planting") ?? "") || null,
      });
    });
    form.reset();
    setPlotOpen(false);
  }

  async function addRain(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const mm = parseFloat(String(f.get("mm") ?? "").replace(",", "."));
    if (!Number.isFinite(mm) || mm < 0) return;
    await db.rainfall.add({ ...newBase(), farmId: id, date: String(f.get("date")), mm });
    form.reset();
  }

  if (!data) return null;
  if (!data.farm) {
    return (
      <Empty
        title="Fazenda não encontrada"
        text="Ela pode ter sido removida deste aparelho."
        action={<LinkButton href="/fazendas">Voltar às fazendas</LinkButton>}
      />
    );
  }

  const { farm, plots, seasons, visits, rain } = data;
  const plotName = new Map(plots.map((p) => [p.id, p.name]));
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffISO = cutoff.toISOString().slice(0, 10);
  const last30 = rain.filter((r) => r.date >= cutoffISO).reduce((sum, r) => sum + r.mm, 0);

  return (
    <>
      <div>
        <Link href="/fazendas" className="text-sm text-brand">
          ← Fazendas
        </Link>
      </div>
      <PageTitle
        title={farm.name}
        subtitle={[farm.municipality, farm.owner].filter(Boolean).join(" · ") || undefined}
      />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <SectionTitle>Talhões</SectionTitle>
          <Button variant="ghost" onClick={() => setPlotOpen((o) => !o)}>
            {plotOpen ? "Cancelar" : "+ Talhão"}
          </Button>
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
                  <input name="season" className={inputClass} defaultValue={currentSeasonLabel()} />
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
          <ul className="space-y-3">
            {plots.map((plot) => {
              const season = seasons
                .filter((s) => s.plotId === plot.id)
                .sort((a, b) => b.createdAt - a.createdAt)[0];
              return (
                <li key={plot.id}>
                  <Card>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{plot.name}</p>
                        <p className="mt-0.5 text-sm text-muted">
                          {plot.areaHa ? `${plot.areaHa} ha` : "Área não informada"}
                          {season?.cultivar ? ` · ${season.cultivar}` : ""}
                        </p>
                        {season?.plantingDate ? (
                          <p className="text-sm text-muted">Plantio: {formatDate(season.plantingDate)}</p>
                        ) : null}
                      </div>
                      {season ? <Chip tone="muted">Safra {season.label}</Chip> : null}
                    </div>
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
          <Chip tone="muted">Últimos 30 dias: {last30.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mm</Chip>
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
                <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                  <span>{formatDate(r.date)}</span>
                  <span className="flex items-center gap-3">
                    <span className="font-medium">{r.mm.toLocaleString("pt-BR")} mm</span>
                    <button
                      onClick={() => removeRainfall(r.id)}
                      className="text-muted hover:text-danger"
                      aria-label={`Remover chuva de ${formatDate(r.date)}`}
                    >
                      ✕
                    </button>
                  </span>
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
          visits.map((v) => (
            <VisitRow key={v.id} visit={v} farmName={farm.name} plotName={plotName.get(v.plotId) ?? "Talhão"} />
          ))
        )}
      </section>
    </>
  );
}
