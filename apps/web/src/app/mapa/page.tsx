"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Download, Navigation } from "lucide-react";
import { Button, Card, Empty, LinkButton, PageTitle, SectionTitle } from "@/components/ui";
import { alive, db } from "@/lib/db";
import { formatDate, todayISO } from "@/lib/format";
import { center, mapsLink, polygonAreaHa, projectShapes, toKml, type LngLat } from "@/lib/geo";
import { formatNumberBR } from "@/lib/operations";
import { buildPanel, type Alert, type PlotStatus } from "@/lib/panel";

type Tone = "danger" | "warn" | "ok" | "none";

const TONE: Record<Tone, { shape: string; dot: string; label: string }> = {
  danger: { shape: "fill-danger/30 stroke-danger", dot: "bg-danger", label: "Atrasado (retorno ou operação)" },
  warn: { shape: "fill-warn/30 stroke-warn", dot: "bg-warn", label: "Sem visita recente ou retorno hoje" },
  ok: { shape: "fill-brand/30 stroke-brand", dot: "bg-brand", label: "Em dia" },
  none: { shape: "fill-muted/15 stroke-muted", dot: "bg-muted", label: "Sem safra cadastrada" },
};

// Quadro menor = texto maior quando o SVG encolhe na tela do celular.
const W = 600;
const H = 390;

function toneOf(status: PlotStatus, alerts: Alert[]): Tone {
  const mine = alerts.filter((a) => a.plotId === status.plot.id);
  if (mine.some((a) => a.kind === "followup-overdue" || a.kind === "operation-late")) return "danger";
  if (mine.length) return "warn";
  return status.season ? "ok" : "none";
}

function saveFile(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function FarmMap() {
  const router = useRouter();
  const params = useSearchParams();
  const [picked, setPicked] = useState<string | null>(params.get("talhao"));

  const data = useLiveQuery(async () => {
    const [farms, plots, seasons, visits, findings, rainfall, operations] = await Promise.all([
      db.farms.toArray(),
      db.plots.toArray(),
      db.seasons.toArray(),
      db.visits.toArray(),
      db.findings.toArray(),
      db.rainfall.toArray(),
      db.operations.toArray(),
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
    return { farms: liveFarms, panel };
  });

  if (!data) return null;
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
  const asked = params.get("fazenda");
  const farm =
    data.farms.find((f) => f.id === asked) ?? data.farms.find((f) => withShapes(f.id)) ?? data.farms[0];
  const statuses = data.panel.farms.find((f) => f.farm.id === farm.id)?.plots ?? [];
  const drawn = statuses.filter((s) => (s.plot.boundary?.length ?? 0) >= 3);
  const missing = statuses.filter((s) => (s.plot.boundary?.length ?? 0) < 3);
  const projected = projectShapes(
    drawn.map((s) => s.plot.boundary as LngLat[]),
    W,
    H,
    28,
  );
  const selected = drawn.find((s) => s.plot.id === picked) ?? null;
  const totalArea = drawn.reduce((sum, s) => sum + polygonAreaHa(s.plot.boundary!), 0);

  function exportKml() {
    const kml = toKml(
      farm.name,
      drawn.map((s) => ({ name: s.plot.name, ring: s.plot.boundary! })),
    );
    const slug = farm.name.normalize("NFD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
    saveFile(kml, `talhoes-${slug || "fazenda"}.kml`, "application/vnd.google-earth.kml+xml");
  }

  return (
    <>
      <PageTitle
        title="Mapa"
        subtitle={drawn.length ? `${drawn.length} ${drawn.length === 1 ? "talhão" : "talhões"} · ${formatNumberBR(totalArea, 1)} ha pelo contorno` : "Talhões da fazenda pelo contorno."}
        action={
          data.farms.length > 1 ? (
            <label className="shrink-0">
              <span className="sr-only">Fazenda</span>
              <select
                value={farm.id}
                onChange={(e) => {
                  setPicked(null);
                  router.replace(`/mapa?fazenda=${e.target.value}`);
                }}
                className="min-h-10 max-w-44 rounded-xl border border-border bg-surface px-3 text-sm font-medium"
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

      {drawn.length === 0 ? (
        <Empty
          title="Nenhum talhão com contorno nesta fazenda"
          text="Abra um talhão e use “Caminhar o contorno (GPS)” ou importe um arquivo KML/GeoJSON (Google Earth, CAR)."
          action={statuses[0] ? <LinkButton href={`/talhao?id=${statuses[0].plot.id}`}>Abrir talhão {statuses[0].plot.name}</LinkButton> : undefined}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-3 lg:col-span-2">
            <Card className="p-2">
              <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Mapa dos talhões da ${farm.name}`}>
                <defs>
                  <pattern id="grade" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M40 0H0V40" fill="none" className="stroke-border" strokeWidth={1} />
                  </pattern>
                </defs>
                <rect width={W} height={H} fill="url(#grade)" rx={12} />
                {projected.map((shape, i) => {
                  const s = drawn[i];
                  const tone = toneOf(s, data.panel.alerts);
                  const isSel = selected?.plot.id === s.plot.id;
                  return (
                    <g
                      key={s.plot.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`Talhão ${s.plot.name}`}
                      onClick={() => setPicked(s.plot.id)}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setPicked(s.plot.id)}
                      className="cursor-pointer outline-none"
                    >
                      <path
                        d={shape.path}
                        className={TONE[tone].shape}
                        strokeWidth={isSel ? 4 : 2}
                        strokeLinejoin="round"
                      />
                      <text
                        x={shape.label[0]}
                        y={shape.label[1]}
                        textAnchor="middle"
                        className="fill-foreground stroke-surface text-[24px] font-semibold"
                        strokeWidth={4}
                        paintOrder="stroke"
                      >
                        {s.plot.name}
                      </text>
                      <text
                        x={shape.label[0]}
                        y={shape.label[1] + 22}
                        textAnchor="middle"
                        className="fill-muted stroke-surface text-[17px]"
                        strokeWidth={4}
                        paintOrder="stroke"
                      >
                        {formatNumberBR(polygonAreaHa(s.plot.boundary!), 1)} ha
                      </text>
                    </g>
                  );
                })}
                <g transform={`translate(${W - 30} 36)`} aria-hidden>
                  <path d="M0 -18 L7 4 L0 0 L-7 4 Z" className="fill-foreground" />
                  <text y={22} textAnchor="middle" className="fill-foreground text-[15px] font-semibold">
                    N
                  </text>
                </g>
              </svg>
            </Card>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              {(Object.keys(TONE) as Tone[]).map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <span aria-hidden className={`size-2.5 rounded-full ${TONE[t].dot}`} /> {TONE[t].label}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted">Desenho sem imagem de satélite: funciona sem internet. Toque num talhão para ver detalhes.</p>
          </div>

          <aside className="space-y-6">
            {selected ? (
              <PlotInfo status={selected} alerts={data.panel.alerts.filter((a) => a.plotId === selected.plot.id)} />
            ) : (
              <Card>
                <p className="text-sm text-muted">Toque num talhão no mapa ou na lista abaixo.</p>
              </Card>
            )}

            <section className="space-y-3">
              <SectionTitle>Talhões</SectionTitle>
              <Card className="divide-y divide-border p-0">
                {drawn.map((s) => {
                  const tone = toneOf(s, data.panel.alerts);
                  return (
                    <button
                      key={s.plot.id}
                      type="button"
                      onClick={() => setPicked(s.plot.id)}
                      aria-pressed={selected?.plot.id === s.plot.id}
                      className={`flex w-full items-center gap-3 p-3 text-left text-sm ${selected?.plot.id === s.plot.id ? "bg-brand-soft" : ""}`}
                    >
                      <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${TONE[tone].dot}`} />
                      <span className="min-w-0 flex-1 truncate font-medium">Talhão {s.plot.name}</span>
                      <span className="shrink-0 text-muted">{formatNumberBR(polygonAreaHa(s.plot.boundary!), 1)} ha</span>
                    </button>
                  );
                })}
              </Card>
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
              <Button variant="secondary" className="w-full" onClick={exportKml}>
                <Download className="size-4" /> Baixar contornos (KML)
              </Button>
            </section>
          </aside>
        </div>
      )}
    </>
  );
}

function PlotInfo({ status, alerts }: { status: PlotStatus; alerts: Alert[] }) {
  const { plot, season, lastVisit, dap, daysSinceVisit } = status;
  const area = polygonAreaHa(plot.boundary!);
  return (
    <Card className="space-y-3">
      <div>
        <p className="text-lg font-semibold">Talhão {plot.name}</p>
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
