"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Button, Card, Chip, Empty, Field, LinkButton, PageTitle, SectionTitle, inputClass } from "@/components/ui";
import { OperationRow } from "@/components/operation-row";
import { KIND_LABEL } from "@/lib/catalog";
import { addSeason, alive, db, removePlot, updatePlot, updateSeason, type Finding, type Season, type Visit } from "@/lib/db";
import { formatDate, todayISO } from "@/lib/format";
import { usesByOperation } from "@/lib/stock";
import { formatBRL, formatNumberBR, yieldByPlot } from "@/lib/operations";
import { daysSince, latestSeason, nextSeasonLabel } from "@/lib/season";

type Panel = "plot" | "season" | "new-season" | null;

export default function PlotPage() {
  return (
    <Suspense fallback={null}>
      <Plot />
    </Suspense>
  );
}

function Plot() {
  const id = useSearchParams().get("id") ?? "";
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>(null);

  const data = useLiveQuery(async () => {
    const plot = await db.plots.get(id);
    if (!plot || plot.deletedAt) return { plot: null };
    const [farm, seasons, visits, operations] = await Promise.all([
      db.farms.get(plot.farmId),
      db.seasons.where("plotId").equals(id).toArray(),
      db.visits.where("plotId").equals(id).toArray(),
      db.operations.where("plotId").equals(id).toArray(),
    ]);
    const liveVisits = alive(visits).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt));
    const findings = alive(await db.findings.where("visitId").anyOf(liveVisits.map((v) => v.id)).toArray());
    const ops = alive(operations).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    const [moves, supplies] = await Promise.all([
      db.stockMoves.where("operationId").anyOf(ops.map((o) => o.id)).toArray(),
      db.supplies.toArray(),
    ]);
    const uses = usesByOperation(alive(moves), alive(supplies));
    return { plot, farm, seasons: alive(seasons), visits: liveVisits, findings, operations: ops, uses, today: todayISO() };
  }, [id]);

  if (!data) return null;
  if (!data.plot) {
    return (
      <Empty
        title="Talhão não encontrado"
        text="Ele pode ter sido removido deste aparelho."
        action={<LinkButton href="/fazendas">Voltar às fazendas</LinkButton>}
      />
    );
  }

  const { plot, farm, seasons, visits, findings, operations, uses, today } = data;
  const current = latestSeason(seasons);
  const seasonOf = (v: { seasonId?: string | null }) => (seasons.some((s) => s.id === v.seasonId) ? v.seasonId : current?.id);
  const currentVisits = visits.filter((v) => seasonOf(v) === current?.id);
  const currentOps = operations.filter((o) => seasonOf(o) === current?.id);
  const harvest = current ? yieldByPlot(current.label, seasons, currentOps)[0] : undefined;
  const opCost = currentOps.reduce((s, o) => s + (o.cost ?? 0), 0);
  const older = seasons.filter((s) => s.id !== current?.id).sort((a, b) => b.createdAt - a.createdAt);
  const findingsByVisit = new Map<string, Finding[]>();
  for (const f of findings) findingsByVisit.set(f.visitId, [...(findingsByVisit.get(f.visitId) ?? []), f]);
  const lastVisit = currentVisits[0];

  async function savePlot(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get("name") ?? "").trim();
    if (!name) return;
    const area = parseFloat(String(f.get("area") ?? "").replace(",", "."));
    await updatePlot(id, { name, areaHa: Number.isFinite(area) ? area : null });
    setPanel(null);
  }

  async function saveSeason(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const values = {
      label: String(f.get("label") ?? "").trim(),
      cultivar: String(f.get("cultivar") ?? "").trim(),
      plantingDate: String(f.get("planting") ?? "") || null,
    };
    if (!values.label) return;
    if (panel === "new-season") await addSeason(id, values);
    else if (current) await updateSeason(current.id, values);
    setPanel(null);
  }

  async function remove() {
    const n = visits.length;
    const msg = n
      ? `Remover o talhão ${plot.name} e ${n === 1 ? "1 visita" : `${n} visitas`} dele?`
      : `Remover o talhão ${plot.name}?`;
    if (!window.confirm(msg)) return;
    await removePlot(id);
    router.push(farm ? `/fazenda?id=${farm.id}` : "/fazendas");
  }

  return (
    <>
      <div>
        <Link href={farm ? `/fazenda?id=${farm.id}` : "/fazendas"} className="text-sm text-brand">
          ← {farm?.name ?? "Fazendas"}
        </Link>
      </div>
      <PageTitle
        title={`Talhão ${plot.name}`}
        subtitle={[farm?.name, plot.areaHa ? `${plot.areaHa} ha` : null].filter(Boolean).join(" · ") || undefined}
        action={
          <Button variant="ghost" onClick={() => setPanel((p) => (p === "plot" ? null : "plot"))}>
            {panel === "plot" ? "Cancelar" : "Editar"}
          </Button>
        }
      />

      {panel === "plot" ? (
        <Card className="space-y-4">
          <form onSubmit={savePlot} className="space-y-4">
            <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
              <Field label="Nome do talhão">
                <input name="name" required defaultValue={plot.name} className={inputClass} />
              </Field>
              <Field label="Área (ha)">
                <input
                  name="area"
                  inputMode="decimal"
                  defaultValue={plot.areaHa?.toString().replace(".", ",") ?? ""}
                  className={inputClass}
                />
              </Field>
            </div>
            <Button type="submit" className="w-full">
              Salvar talhão
            </Button>
          </form>
          <Button variant="danger" className="w-full" onClick={remove}>
            Remover talhão
          </Button>
        </Card>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <SectionTitle>Safra atual</SectionTitle>
          <div className="flex gap-1">
            {current ? (
              <Button variant="ghost" onClick={() => setPanel((p) => (p === "season" ? null : "season"))}>
                {panel === "season" ? "Cancelar" : "Editar"}
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => setPanel((p) => (p === "new-season" ? null : "new-season"))}>
              {panel === "new-season" ? "Cancelar" : "+ Safra"}
            </Button>
          </div>
        </div>

        {panel === "season" || panel === "new-season" ? (
          <SeasonForm
            key={panel}
            season={panel === "season" ? current : undefined}
            suggestedLabel={current ? nextSeasonLabel(current.label) : undefined}
            onSubmit={saveSeason}
          />
        ) : null}

        {current ? (
          <Card className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{current.cultivar || "Cultivar não informada"}</p>
                <p className="mt-0.5 text-sm text-muted">
                  {current.plantingDate
                    ? `Plantio ${formatDate(current.plantingDate)} · ${daysSince(current.plantingDate)} dias`
                    : "Data de plantio não informada"}
                </p>
                {lastVisit ? (
                  <p className="text-sm text-muted">
                    Última visita {formatDate(lastVisit.date)} · {lastVisit.stage}
                  </p>
                ) : null}
              </div>
              <Chip tone="muted">Safra {current.label}</Chip>
            </div>
            {harvest || opCost > 0 ? (
              <div className="grid grid-cols-2 gap-3 rounded-xl bg-background p-3 text-sm">
                <div>
                  <p className="text-xs text-muted">Produtividade</p>
                  <p className="font-semibold">{harvest ? `${formatNumberBR(harvest.perHa, 1)} sc/ha` : "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted">Custo anotado</p>
                  <p className="font-semibold">
                    {opCost > 0 ? formatBRL(opCost) : "—"}
                    {opCost > 0 && plot.areaHa ? (
                      <span className="block text-xs font-normal text-muted">{formatBRL(opCost / plot.areaHa)}/ha</span>
                    ) : null}
                  </p>
                </div>
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <LinkButton href={`/visitas/nova?fazenda=${plot.farmId}&talhao=${plot.id}`}>Registrar visita</LinkButton>
              <LinkButton href={`/operacoes/nova?fazenda=${plot.farmId}&talhao=${plot.id}`} variant="secondary">
                Operação
              </LinkButton>
            </div>
          </Card>
        ) : (
          <Empty title="Sem safra" text="Cadastre a safra para acompanhar cultivar e dias após o plantio." />
        )}
      </section>

      <FindingsSummary visits={currentVisits} findingsByVisit={findingsByVisit} />

      {currentOps.length > 0 ? (
        <section className="space-y-3">
          <SectionTitle>Operações desta safra</SectionTitle>
          {currentOps.map((o) => (
            <OperationRow
              key={o.id}
              op={o}
              today={today}
              farmName={farm?.name ?? "Fazenda"}
              plotName={plot.name}
              uses={uses.get(o.id)}
            />
          ))}
        </section>
      ) : null}

      <section className="space-y-3">
        <SectionTitle>Visitas desta safra</SectionTitle>
        {currentVisits.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">Nenhuma visita nesta safra ainda.</p>
          </Card>
        ) : (
          <Timeline visits={currentVisits} findingsByVisit={findingsByVisit} />
        )}
      </section>

      {older.length > 0 ? (
        <section className="space-y-3">
          <SectionTitle>Safras anteriores</SectionTitle>
          {older.map((s) => {
            const vs = visits.filter((v) => seasonOf(v) === s.id);
            return (
              <details key={s.id} className="group rounded-2xl border border-border bg-surface">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
                  <span>
                    <span className="font-medium">Safra {s.label}</span>
                    <span className="block text-sm text-muted">
                      {s.cultivar || "Cultivar não informada"} · {vs.length} {vs.length === 1 ? "visita" : "visitas"}
                    </span>
                  </span>
                  <span className="text-muted transition group-open:rotate-90">›</span>
                </summary>
                {vs.length ? (
                  <div className="border-t border-border p-3">
                    <Timeline visits={vs} findingsByVisit={findingsByVisit} />
                  </div>
                ) : null}
              </details>
            );
          })}
        </section>
      ) : null}
    </>
  );
}

function SeasonForm({
  season,
  suggestedLabel,
  onSubmit,
}: {
  season?: Season;
  suggestedLabel?: string;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Card>
      <form onSubmit={onSubmit} className="space-y-4">
        {!season ? (
          <p className="text-sm text-muted">
            A safra nova passa a ser a atual. As visitas antigas continuam guardadas na safra delas.
          </p>
        ) : null}
        <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3">
          <Field label="Safra">
            <input name="label" required defaultValue={season?.label ?? suggestedLabel ?? ""} className={inputClass} />
          </Field>
          <Field label="Cultivar">
            <input name="cultivar" defaultValue={season?.cultivar ?? ""} className={inputClass} />
          </Field>
        </div>
        <Field label="Data de plantio">
          <input name="planting" type="date" defaultValue={season?.plantingDate ?? ""} className={inputClass} />
        </Field>
        <Button type="submit" className="w-full">
          {season ? "Salvar safra" : "Começar safra nova"}
        </Button>
      </form>
    </Card>
  );
}

/** O que apareceu no talhão na safra: quantas visitas e quando foi visto por último. */
function FindingsSummary({ visits, findingsByVisit }: { visits: Visit[]; findingsByVisit: Map<string, Finding[]> }) {
  const rows = new Map<string, { name: string; kind: Finding["kind"]; count: number; lastDate: string; lastAmount: string }>();
  // visits já vem da mais recente para a mais antiga
  for (const v of visits) {
    for (const f of findingsByVisit.get(v.id) ?? []) {
      const key = f.name.toLowerCase();
      const row = rows.get(key);
      if (row) row.count += 1;
      else rows.set(key, { name: f.name, kind: f.kind, count: 1, lastDate: v.date, lastAmount: f.amount });
    }
  }
  if (rows.size === 0) return null;
  return (
    <section className="space-y-3">
      <SectionTitle>Achados nesta safra</SectionTitle>
      <Card className="divide-y divide-border p-0">
        {[...rows.values()].map((r) => (
          <div key={r.name} className="flex items-start justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="font-medium">{r.name}</p>
              <p className="mt-0.5 text-sm text-muted">
                Visto por último em {formatDate(r.lastDate)}
                {r.lastAmount ? ` · ${r.lastAmount}` : ""}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <Chip tone="muted">{KIND_LABEL[r.kind]}</Chip>
              <p className="mt-1 text-xs text-muted">
                {r.count} {r.count === 1 ? "visita" : "visitas"}
              </p>
            </div>
          </div>
        ))}
      </Card>
    </section>
  );
}

function Timeline({ visits, findingsByVisit }: { visits: Visit[]; findingsByVisit: Map<string, Finding[]> }) {
  return (
    <ol className="space-y-3">
      {visits.map((v) => {
        const fs = findingsByVisit.get(v.id) ?? [];
        return (
          <li key={v.id}>
            <Link href={`/visita?id=${v.id}`} className="block active:scale-[0.99]">
              <Card className="transition hover:border-brand/40">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{formatDate(v.date)}</p>
                  <Chip>{v.stage}</Chip>
                </div>
                {fs.length ? (
                  <p className="mt-2 flex flex-wrap gap-1.5">
                    {fs.map((f) => (
                      <Chip key={f.id} tone="muted">
                        {f.name}
                        {f.amount ? ` · ${f.amount}` : ""}
                      </Chip>
                    ))}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-muted">Sem achados</p>
                )}
                {v.recommendation ? <p className="mt-2 line-clamp-2 text-sm text-muted">{v.recommendation}</p> : null}
              </Card>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
