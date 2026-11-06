"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Download, LocateFixed, MapPin, MapPinPlus, Navigation, Pencil, Trash2, X } from "lucide-react";
import { TONE, toneOf, type Tone } from "@/components/map-bits";
import { SatMap, pathOf, type Project } from "@/components/sat-map";
import { toast } from "@/components/toaster";
import { Button, Card, Empty, Field, LinkButton, PageSkeleton, PageTitle, SectionTitle, inputClass } from "@/components/ui";
import { toDms } from "@/lib/coords";
import { alive, db, restoreRemoved, type MapPoint, type PointKind } from "@/lib/db";
import { formatDate, getPosition, plotLabel, plotShortName, todayISO } from "@/lib/format";
import { center, mapsLink, polygonAreaHa, type LngLat } from "@/lib/geo";
import { formatNumberBR } from "@/lib/operations";
import { buildPanel, type Alert, type PlotStatus } from "@/lib/panel";
import { POINT_KINDS, createPoint, farmGeoJson, farmKml, pointKindInfo, removePoint, updatePoint } from "@/lib/points";
import { fileSlug, saveFile } from "@/lib/save-file";

/** O que está aberto embaixo do mapa: talhão, ponto ou o formulário de ponto. */
type Picked = { kind: "plot"; id: string } | { kind: "point"; id: string } | null;
type Draft = { id?: string; kind: PointKind; name: string; note: string; at: LngLat };

function FarmMap() {
  const router = useRouter();
  const params = useSearchParams();
  const asked = params.get("talhao");
  const [picked, setPicked] = useState<Picked>(asked ? { kind: "plot", id: asked } : null);
  const [marking, setMarking] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [focus, setFocus] = useState<LngLat | null>(null);
  const [gpsBusy, setGpsBusy] = useState(false);

  const data = useLiveQuery(async () => {
    const [farms, plots, seasons, visits, findings, rainfall, operations, points] = await Promise.all([
      db.farms.toArray(),
      db.plots.toArray(),
      db.seasons.toArray(),
      db.visits.toArray(),
      db.findings.toArray(),
      db.rainfall.toArray(),
      db.operations.toArray(),
      db.points.toArray(),
    ]);
    const liveFarms = alive(farms).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    const livePlots = alive(plots).filter((p) => liveFarms.some((f) => f.id === p.farmId));
    const panel = buildPanel(
      {
        farms: liveFarms,
        plots: livePlots,
        seasons: alive(seasons),
        visits: alive(visits),
        findings: alive(findings),
        rainfall: alive(rainfall),
        operations: alive(operations),
      },
      todayISO(),
    );
    return { farms: liveFarms, panel, points: alive(points) };
  });

  if (!data) return <PageSkeleton />;
  if (data.farms.length === 0) {
    return (
      <>
        <PageTitle title="Mapa" />
        <Empty
          title="Cadastre uma fazenda primeiro"
          text="Depois desenhe o contorno de cada talhão na página dele."
          action={<LinkButton href="/fazendas">Cadastrar fazenda</LinkButton>}
        />
      </>
    );
  }

  const withShapes = (farmId: string) =>
    data.panel.farms.find((f) => f.farm.id === farmId)?.plots.some((p) => (p.plot.boundary?.length ?? 0) >= 3) ?? false;
  const askedFarm = params.get("fazenda");
  const farm = data.farms.find((f) => f.id === askedFarm) ?? data.farms.find((f) => withShapes(f.id)) ?? data.farms[0];
  const statuses = data.panel.farms.find((f) => f.farm.id === farm.id)?.plots ?? [];
  const drawn = statuses.filter((s) => (s.plot.boundary?.length ?? 0) >= 3);
  const missing = statuses.filter((s) => (s.plot.boundary?.length ?? 0) < 3);
  const points = data.points.filter((p) => p.farmId === farm.id).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const totalArea = drawn.reduce((sum, s) => sum + polygonAreaHa(s.plot.boundary!), 0);
  const selPlot = picked?.kind === "plot" ? (drawn.find((s) => s.plot.id === picked.id) ?? null) : null;
  const selPoint = picked?.kind === "point" ? (points.find((p) => p.id === picked.id) ?? null) : null;
  const tones = new Map(drawn.map((s) => [s.plot.id, toneOf(s, data.panel.alerts)]));
  const plotName = (id?: string | null) => drawn.find((s) => s.plot.id === id)?.plot.name;

  function startDraft(at: LngLat) {
    setMarking(false);
    setPicked(null);
    setDraft((d) => (d ? { ...d, at } : { kind: "armadilha", name: "", note: "", at }));
  }

  async function pointHere() {
    setGpsBusy(true);
    const pos = await getPosition();
    setGpsBusy(false);
    if (!pos) {
      toast("Não foi possível ler o GPS. Ligue a localização ou toque no mapa.");
      return;
    }
    const at: LngLat = [pos.lng, pos.lat];
    setFocus(at);
    startDraft(at);
  }

  async function saveDraft(d: Draft) {
    const input = { kind: d.kind, name: d.name, note: d.note, lng: d.at[0], lat: d.at[1] };
    if (d.id) {
      await updatePoint(d.id, input);
      toast("Ponto atualizado.");
      setPicked({ kind: "point", id: d.id });
    } else {
      const p = await createPoint(farm.id, input);
      toast(`Ponto salvo${p.plotId ? ` em ${plotLabel(plotName(p.plotId))}` : ""}.`);
      setPicked({ kind: "point", id: p.id });
    }
    setDraft(null);
  }

  async function deletePoint(p: MapPoint) {
    const at = await removePoint(p.id);
    setPicked(null);
    toast("Ponto excluído.", { undo: () => restoreRemoved(at) });
  }

  const shapes = () => drawn.map((s) => ({ name: s.plot.name, ring: s.plot.boundary! }));
  const slug = fileSlug(farm.name, "fazenda");

  function overlay(project: Project, view: { zoom: number }) {
    const showLabels = view.zoom >= 12.5;
    return (
      <>
        {drawn.map((s) => {
          const tone = TONE[tones.get(s.plot.id) ?? "none"];
          const pts = s.plot.boundary!.map(project);
          const sel = selPlot?.plot.id === s.plot.id;
          return (
            <path
              key={s.plot.id}
              data-hit={`plot:${s.plot.id}`}
              d={pathOf(pts, true)}
              fill={tone.hex}
              fillOpacity={sel ? 0.35 : 0.18}
              stroke={sel ? "#fff" : tone.hex}
              strokeWidth={sel ? 3.5 : 2.5}
              strokeLinejoin="round"
              className="pointer-events-auto cursor-pointer"
            />
          );
        })}
        {drawn.map((s) => {
              const xs = s.plot.boundary!.map((q) => project(q)[0]);
              // Só escreve o nome quando o talhão tem largura na tela para ele.
              if (Math.max(...xs) - Math.min(...xs) < 70) return null;
              const [x, y] = project(center(s.plot.boundary!));
              return (
                <text key={`l${s.plot.id}`} x={x} y={y} textAnchor="middle" className="fill-white text-[13px] font-semibold" stroke="rgba(0,0,0,0.75)" strokeWidth={3.5} paintOrder="stroke">
                  {plotShortName(s.plot.name)}
                  <tspan x={x} dy={16} className="text-[11px] font-medium">
                    {formatNumberBR(polygonAreaHa(s.plot.boundary!), 1)} ha
                  </tspan>
                </text>
              );
            })}
        {points.map((p) => {
          const [x, y] = project([p.lng, p.lat]);
          const sel = selPoint?.id === p.id;
          return (
            <g key={p.id} data-hit={`point:${p.id}`} className="pointer-events-auto cursor-pointer">
              <circle cx={x} cy={y} r={18} fill="transparent" />
              <path d={pinPath(x, y, sel ? 1.25 : 1)} fill={pointKindInfo(p.kind).color} stroke="#fff" strokeWidth={2} />
              <circle cx={x} cy={y - (sel ? 17 : 14)} r={sel ? 4.5 : 3.5} fill="#fff" />
              {showLabels ? (
                <text x={x} y={y + 14} textAnchor="middle" className="fill-white text-[11px] font-medium" stroke="rgba(0,0,0,0.75)" strokeWidth={3} paintOrder="stroke">
                  {p.name}
                </text>
              ) : null}
            </g>
          );
        })}
        {draft ? <DraftPin at={project(draft.at)} color={pointKindInfo(draft.kind).color} /> : null}
      </>
    );
  }

  return (
    <>
      <PageTitle
        title="Mapa"
        subtitle={
          drawn.length
            ? `${drawn.length} ${drawn.length === 1 ? "talhão" : "talhões"} · ${formatNumberBR(totalArea, 1)} ha · ${points.length} ${points.length === 1 ? "ponto" : "pontos"}`
            : "Talhões e pontos da fazenda sobre o satélite."
        }
        action={
          data.farms.length > 1 ? (
            <label className="shrink-0">
              <span className="sr-only">Fazenda</span>
              <select
                value={farm.id}
                onChange={(e) => {
                  setPicked(null);
                  setDraft(null);
                  router.replace(`/mapa?fazenda=${e.target.value}`);
                }}
                className="min-h-10 max-w-64 rounded-xl border border-border bg-surface px-3 text-sm font-medium"
              >
                {data.farms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <SatMap
            label={`Mapa de satélite da ${farm.name}`}
            fit={[...drawn.map((s) => s.plot.boundary!), ...(points.length ? [points.map((p) => [p.lng, p.lat] as LngLat)] : [])]}
            fitKey={farm.id}
            focus={focus}
            crosshair={marking}
            overlay={overlay}
            onHit={(hit) => {
              if (marking) return;
              const [kind, id] = hit.split(":");
              setDraft(null);
              setPicked({ kind: kind as "plot" | "point", id });
            }}
            onTap={(at) => (marking ? startDraft(at) : setPicked(null))}
          >
            {marking ? (
              <p className="pointer-events-none absolute inset-x-2 bottom-7 mx-auto w-fit rounded-full bg-black/75 px-4 py-2 text-center text-sm font-medium text-white">
                Toque no lugar do ponto
              </p>
            ) : null}
          </SatMap>

          <div className="grid grid-cols-2 gap-2">
            <Button variant={marking ? "primary" : "secondary"} onClick={() => setMarking((m) => !m)} aria-pressed={marking}>
              {marking ? <X className="size-4" /> : <MapPinPlus className="size-4" />}
              {marking ? "Cancelar" : "Marcar no mapa"}
            </Button>
            <Button variant="secondary" onClick={pointHere} disabled={gpsBusy}>
              <LocateFixed className="size-4" /> {gpsBusy ? "Lendo GPS…" : "Ponto onde estou"}
            </Button>
          </div>

          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            {(Object.keys(TONE) as Tone[]).map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <span aria-hidden className={`size-2.5 rounded-full ${TONE[t].dot}`} /> {TONE[t].label}
              </li>
            ))}
          </ul>
          {drawn.length === 0 ? (
            <p className="rounded-xl bg-warn/10 px-3 py-2 text-sm text-warn">
              Nenhum talhão desta fazenda tem contorno. Abra um talhão e desenhe no satélite, caminhe com o GPS ou cole as coordenadas.
            </p>
          ) : null}
        </div>

        <aside className="space-y-6">
          {draft ? (
            <PointForm key={draft.id ?? "novo"} draft={draft} onChange={setDraft} onSave={saveDraft} onCancel={() => setDraft(null)} />
          ) : selPoint ? (
            <PointInfo
              point={selPoint}
              plotName={plotName(selPoint.plotId)}
              onEdit={() => setDraft({ id: selPoint.id, kind: selPoint.kind, name: selPoint.name, note: selPoint.note, at: [selPoint.lng, selPoint.lat] })}
              onDelete={() => deletePoint(selPoint)}
            />
          ) : selPlot ? (
            <PlotInfo status={selPlot} alerts={data.panel.alerts.filter((a) => a.plotId === selPlot.plot.id)} />
          ) : (
            <Card>
              <p className="text-sm text-muted">Toque num talhão ou num ponto do mapa para ver os detalhes. Para marcar sede, armadilha, amostra de solo ou reboleira, use os botões abaixo do mapa.</p>
            </Card>
          )}

          {drawn.length ? (
            <section className="space-y-3">
              <SectionTitle>Talhões</SectionTitle>
              <Card className="divide-y divide-border p-0">
                {drawn.map((s) => (
                  <button
                    key={s.plot.id}
                    type="button"
                    onClick={() => {
                      setDraft(null);
                      setPicked({ kind: "plot", id: s.plot.id });
                      setFocus(center(s.plot.boundary!));
                    }}
                    aria-pressed={selPlot?.plot.id === s.plot.id}
                    className={`flex w-full items-center gap-3 p-3 text-left text-sm ${selPlot?.plot.id === s.plot.id ? "bg-brand-soft" : ""}`}
                  >
                    <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${TONE[tones.get(s.plot.id) ?? "none"].dot}`} />
                    <span className="min-w-0 flex-1 truncate font-medium">{plotLabel(s.plot.name)}</span>
                    <span className="shrink-0 text-muted">{formatNumberBR(polygonAreaHa(s.plot.boundary!), 1)} ha</span>
                  </button>
                ))}
              </Card>
            </section>
          ) : null}
          {missing.length ? (
            <p className="text-xs text-muted">
              Sem contorno:{" "}
              {missing.map((s, i) => (
                <span key={s.plot.id}>
                  {i ? ", " : ""}
                  <Link href={`/talhao?id=${s.plot.id}`} className="text-brand underline">
                    {s.plot.name}
                  </Link>
                </span>
              ))}
            </p>
          ) : null}

          <section className="space-y-3">
            <SectionTitle>Pontos</SectionTitle>
            {points.length ? (
              <Card className="divide-y divide-border p-0">
                {points.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setDraft(null);
                      setPicked({ kind: "point", id: p.id });
                      setFocus([p.lng, p.lat]);
                    }}
                    aria-pressed={selPoint?.id === p.id}
                    className={`flex w-full items-center gap-3 p-3 text-left text-sm ${selPoint?.id === p.id ? "bg-brand-soft" : ""}`}
                  >
                    <MapPin aria-hidden className="size-4 shrink-0" style={{ color: pointKindInfo(p.kind).color }} />
                    <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                    <span className="shrink-0 text-xs text-muted">{plotShortName(plotName(p.plotId) ?? "") || pointKindInfo(p.kind).label}</span>
                  </button>
                ))}
              </Card>
            ) : (
              <p className="text-sm text-muted">Nenhum ponto marcado nesta fazenda.</p>
            )}
          </section>

          {drawn.length || points.length ? (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => saveFile(farmKml(farm.name, shapes(), points), `mapa-${slug}.kml`, "application/vnd.google-earth.kml+xml")}>
                <Download className="size-4" /> KML
              </Button>
              <Button variant="secondary" onClick={() => saveFile(farmGeoJson(shapes(), points), `mapa-${slug}.geojson`, "application/geo+json")}>
                <Download className="size-4" /> GeoJSON
              </Button>
            </div>
          ) : null}
        </aside>
      </div>
    </>
  );
}

/** Alfinete com a ponta em (x, y). */
function pinPath(x: number, y: number, s: number) {
  const r = 9 * s;
  const h = 24 * s;
  return `M${x} ${y} C${x - 2 * s} ${y - 8 * s} ${x - r} ${y - 11 * s} ${x - r} ${y - h + r} A${r} ${r} 0 1 1 ${x + r} ${y - h + r} C${x + r} ${y - 11 * s} ${x + 2 * s} ${y - 8 * s} ${x} ${y} Z`;
}

function DraftPin({ at: [x, y], color }: { at: [number, number]; color: string }) {
  return (
    <g aria-hidden>
      <circle cx={x} cy={y} r={14} fill="none" stroke="#facc15" strokeWidth={2.5} className="motion-safe:animate-ping" style={{ transformOrigin: `${x}px ${y}px` }} />
      <path d={pinPath(x, y, 1.3)} fill={color} stroke="#facc15" strokeWidth={3} />
      <circle cx={x} cy={y - 18} r={4.5} fill="#fff" />
    </g>
  );
}

const coordText = ([lng, lat]: LngLat) => `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

function PointForm({
  draft,
  onChange,
  onSave,
  onCancel,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  onSave: (d: Draft) => Promise<void>;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Card className="space-y-4 border-brand/40">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-lg font-semibold">{draft.id ? "Editar ponto" : "Novo ponto"}</p>
          <p className="text-xs text-muted">
            {coordText(draft.at)} · {toDms(draft.at[1], "lat")} {toDms(draft.at[0], "lng")}
          </p>
          <p className="mt-1 text-xs text-muted">Para mudar o lugar, toque em “Marcar no mapa” e toque de novo no satélite.</p>
        </div>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Tipo</legend>
        <div className="flex flex-wrap gap-2">
          {POINT_KINDS.map((k) => (
            <button
              key={k.kind}
              type="button"
              aria-pressed={draft.kind === k.kind}
              onClick={() => onChange({ ...draft, kind: k.kind })}
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm ${draft.kind === k.kind ? "border-transparent bg-foreground text-background" : "border-border bg-surface"}`}
            >
              <span aria-hidden className="size-2.5 rounded-full" style={{ background: k.color }} /> {k.label}
            </button>
          ))}
        </div>
      </fieldset>
      <Field label="Nome" hint={`Vazio: fica “${pointKindInfo(draft.kind).label}”.`}>
        <input className={inputClass} value={draft.name} maxLength={60} onChange={(e) => onChange({ ...draft, name: e.target.value })} placeholder="Ex.: Armadilha 3" />
      </Field>
      <Field label="Observação">
        <textarea className={inputClass} rows={2} value={draft.note} onChange={(e) => onChange({ ...draft, note: e.target.value })} placeholder="Ex.: feromônio trocado em 05/11" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onSave(draft);
            } finally {
              setBusy(false);
            }
          }}
        >
          Salvar ponto
        </Button>
      </div>
    </Card>
  );
}

function PointInfo({ point, plotName, onEdit, onDelete }: { point: MapPoint; plotName?: string; onEdit: () => void; onDelete: () => void }) {
  const info = pointKindInfo(point.kind);
  return (
    <Card className="space-y-3">
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-1 grid size-9 shrink-0 place-items-center rounded-full text-white" style={{ background: info.color }}>
          <MapPin className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">{point.name}</p>
          <p className="text-sm text-muted">
            {info.label} · {plotName ? plotLabel(plotName) : "fora dos talhões"}
          </p>
        </div>
      </div>
      {point.note ? <p className="text-sm">{point.note}</p> : null}
      <p className="text-xs text-muted">
        {coordText([point.lng, point.lat])}
        <br />
        {toDms(point.lat, "lat")} {toDms(point.lng, "lng")}
      </p>
      <div className="grid grid-cols-3 gap-2">
        <Button variant="secondary" onClick={onEdit}>
          <Pencil className="size-4" /> Editar
        </Button>
        <a
          href={mapsLink([point.lng, point.lat])}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm font-semibold"
        >
          <Navigation className="size-4" /> Rota
        </a>
        <Button variant="danger" onClick={onDelete}>
          <Trash2 className="size-4" /> Excluir
        </Button>
      </div>
    </Card>
  );
}

function PlotInfo({ status, alerts }: { status: PlotStatus; alerts: Alert[] }) {
  const { plot, season, lastVisit, dap, daysSinceVisit } = status;
  const area = polygonAreaHa(plot.boundary!);
  return (
    <Card className="space-y-3">
      <div>
        <p className="text-lg font-semibold">{plotLabel(plot.name)}</p>
        <p className="text-sm text-muted">
          {[season ? `Safra ${season.label}` : "Sem safra", season?.cultivar, dap != null ? `${dap} DAP` : null].filter(Boolean).join(" · ")}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-muted">Área (contorno)</dt>
          <dd className="font-medium">{formatNumberBR(area, 2)} ha</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Área cadastrada</dt>
          <dd className="font-medium">{plot.areaHa != null ? `${formatNumberBR(plot.areaHa, 2)} ha` : "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Última visita</dt>
          <dd className="font-medium">
            {lastVisit ? `${formatDate(lastVisit.date)}${daysSinceVisit ? ` (há ${daysSinceVisit} d)` : ""}` : "Nenhuma"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Estágio</dt>
          <dd className="font-medium">{lastVisit?.stage ?? "—"}</dd>
        </div>
      </dl>
      {alerts.length ? (
        <ul className="space-y-1 text-sm">
          {alerts.map((a) => (
            <li key={`${a.kind}-${a.href}`}>
              <Link href={a.href} className="text-danger underline">
                {a.text}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <LinkButton href={`/talhao?id=${plot.id}`}>Abrir talhão</LinkButton>
        <a
          href={mapsLink(center(plot.boundary!))}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm font-semibold"
        >
          <Navigation className="size-4" /> Rota
        </a>
      </div>
    </Card>
  );
}

export default function MapPage() {
  return (
    <Suspense fallback={null}>
      <FarmMap />
    </Suspense>
  );
}
