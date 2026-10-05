"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Footprints, MapPinned, Navigation, Upload } from "lucide-react";
import { Button, Card, SectionTitle } from "@/components/ui";
import { updatePlot, type Plot } from "@/lib/db";
import {
  addTrackPoint,
  center,
  mapsLink,
  parseShapes,
  perimeterM,
  polygonAreaHa,
  projectShapes,
  type ImportedShape,
  type LngLat,
} from "@/lib/geo";
import { formatNumberBR } from "@/lib/operations";

/** Ponto com precisão pior que isso não entra no contorno automático. */
const MAX_ACCURACY_M = 25;

export function ShapePreview({ ring, className = "h-40" }: { ring: LngLat[]; className?: string }) {
  const [shape] = projectShapes([ring], 300, 180, 12);
  if (!shape) return null;
  return (
    <svg viewBox="0 0 300 180" className={`w-full rounded-xl bg-brand-soft/50 ${className}`} role="img" aria-label="Contorno do talhão">
      <path d={shape.path} className="fill-brand/25 stroke-brand" strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}

const km = (m: number) => (m >= 1000 ? `${formatNumberBR(m / 1000, 2)} km` : `${formatNumberBR(m, 0)} m`);

export function BoundaryCard({ plot }: { plot: Plot }) {
  const [mode, setMode] = useState<"view" | "record" | "import">("view");
  const [message, setMessage] = useState("");
  const ring = plot.boundary && plot.boundary.length >= 3 ? plot.boundary : null;

  async function save(next: LngLat[]) {
    await updatePlot(plot.id, { boundary: next });
    setMode("view");
    setMessage("Contorno salvo.");
  }

  async function clear() {
    if (!window.confirm("Apagar o contorno deste talhão?")) return;
    await updatePlot(plot.id, { boundary: null });
    setMessage("");
  }

  if (mode === "record") return <Recorder onDone={save} onCancel={() => setMode("view")} />;
  if (mode === "import") return <Importer plotName={plot.name} onPick={save} onCancel={() => setMode("view")} />;

  const area = ring ? polygonAreaHa(ring) : 0;
  const declared = plot.areaHa;
  const differs = ring && (!declared || Math.abs(area - declared) / declared > 0.02);

  return (
    <section className="space-y-3">
      <SectionTitle>Contorno e mapa</SectionTitle>
      <Card className="space-y-3">
        {ring ? (
          <>
            <ShapePreview ring={ring} />
            <p className="text-sm">
              Área pelo contorno: <span className="font-semibold">{formatNumberBR(area, 2)} ha</span>
              <span className="text-muted"> · perímetro {km(perimeterM(ring))}</span>
            </p>
            {differs ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-warn/10 px-3 py-2 text-sm">
                <span>
                  {declared
                    ? `Área cadastrada: ${formatNumberBR(declared, 2)} ha (diferença de ${formatNumberBR(Math.abs(area - declared), 2)} ha).`
                    : "O talhão está sem área cadastrada."}
                </span>
                <button
                  type="button"
                  className="font-semibold text-brand-strong underline"
                  onClick={async () => {
                    await updatePlot(plot.id, { areaHa: Math.round(area * 100) / 100 });
                    setMessage(`Área do talhão atualizada para ${formatNumberBR(area, 2)} ha.`);
                  }}
                >
                  Usar {formatNumberBR(area, 2)} ha
                </button>
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <a
                href={mapsLink(center(ring))}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm font-semibold"
              >
                <Navigation className="size-4" /> Rota até aqui
              </a>
              <Link
                href={`/mapa?fazenda=${plot.farmId}&talhao=${plot.id}`}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm font-semibold"
              >
                <MapPinned className="size-4" /> Mapa da fazenda
              </Link>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <button type="button" className="font-medium text-brand" onClick={() => setMode("record")}>
                Refazer pelo GPS
              </button>
              <button type="button" className="font-medium text-brand" onClick={() => setMode("import")}>
                Importar outro arquivo
              </button>
              <button type="button" className="font-medium text-danger" onClick={clear}>
                Apagar contorno
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted">
              Com o contorno, o talhão aparece no mapa da fazenda, a área é conferida e dá para abrir a rota até ele.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button onClick={() => setMode("record")}>
                <Footprints className="size-4" /> Caminhar o contorno (GPS)
              </Button>
              <Button variant="secondary" onClick={() => setMode("import")}>
                <Upload className="size-4" /> Importar KML ou GeoJSON
              </Button>
            </div>
          </>
        )}
        {message ? (
          <p role="status" className="rounded-xl bg-brand-soft px-3 py-2 text-sm text-brand-strong">
            {message}
          </p>
        ) : null}
      </Card>
    </section>
  );
}

function Recorder({ onDone, onCancel }: { onDone: (ring: LngLat[]) => void; onCancel: () => void }) {
  const [track, setTrack] = useState<LngLat[]>([]);
  const [fix, setFix] = useState<{ p: LngLat; acc: number } | null>(null);
  const [auto, setAuto] = useState(true);
  const [error, setError] = useState(() =>
    typeof navigator !== "undefined" && "geolocation" in navigator ? "" : "Este aparelho não tem GPS disponível no navegador.",
  );
  const autoRef = useRef(auto);

  useEffect(() => {
    autoRef.current = auto;
  }, [auto]);

  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        const p: LngLat = [pos.coords.longitude, pos.coords.latitude];
        setFix({ p, acc: pos.coords.accuracy });
        setError("");
        if (autoRef.current && pos.coords.accuracy <= MAX_ACCURACY_M) setTrack((t) => addTrackPoint(t, p));
      },
      (err) =>
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Sem permissão para usar a localização. Libere nas configurações do navegador."
            : "Não foi possível ler o GPS. Vá para céu aberto e espere alguns segundos.",
        ),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 },
    );
    // Tela ligada enquanto grava (onde o navegador permite).
    let lock: { release: () => Promise<void> } | null = null;
    const wake = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    wake
      ?.request("screen")
      .then((l) => (lock = l))
      .catch(() => {});
    return () => {
      navigator.geolocation.clearWatch(watch);
      lock?.release().catch(() => {});
    };
  }, []);

  const area = polygonAreaHa(track);

  return (
    <section className="space-y-3">
      <SectionTitle>Caminhar o contorno</SectionTitle>
      <Card className="space-y-4">
        <p className="text-sm text-muted">
          Mantenha a tela ligada e ande (ou vá de moto/carro devagar) pela borda do talhão. Ao voltar ao ponto de partida,
          toque em Concluir. Nos cantos, dá para tocar em “Marcar ponto aqui”.
        </p>
        <p className={`text-sm font-medium ${error ? "text-danger" : fix && fix.acc > MAX_ACCURACY_M ? "text-warn" : "text-brand-strong"}`}>
          {error
            ? error
            : fix
              ? `GPS: precisão de ${formatNumberBR(fix.acc, 0)} m${fix.acc > MAX_ACCURACY_M ? " (fraca, esperando melhorar)" : ""}`
              : "Esperando o sinal do GPS…"}
        </p>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-background p-2">
            <p className="text-xl font-semibold">{track.length}</p>
            <p className="text-xs text-muted">pontos</p>
          </div>
          <div className="rounded-xl bg-background p-2">
            <p className="text-xl font-semibold">{formatNumberBR(area, 2)}</p>
            <p className="text-xs text-muted">hectares</p>
          </div>
          <div className="rounded-xl bg-background p-2">
            <p className="text-xl font-semibold">{km(track.length > 1 ? perimeterM(track) : 0)}</p>
            <p className="text-xs text-muted">perímetro</p>
          </div>
        </div>
        {track.length >= 3 ? <ShapePreview ring={track} className="h-32" /> : null}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" disabled={!fix} onClick={() => fix && setTrack((t) => [...t, fix.p])}>
            Marcar ponto aqui
          </Button>
          <Button variant="secondary" onClick={() => setAuto((a) => !a)} aria-pressed={auto}>
            {auto ? "Pausar gravação" : "Retomar gravação"}
          </Button>
          <Button variant="ghost" disabled={track.length === 0} onClick={() => setTrack((t) => t.slice(0, -1))}>
            Desfazer último
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
        <Button className="w-full" disabled={track.length < 3} onClick={() => onDone(track)}>
          Concluir contorno
        </Button>
      </Card>
    </section>
  );
}

const norm = (s: string) => s.toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]/g, "");

function Importer({ plotName, onPick, onCancel }: { plotName: string; onPick: (ring: LngLat[]) => void; onCancel: () => void }) {
  const [shapes, setShapes] = useState<ImportedShape[]>([]);
  const [chosen, setChosen] = useState(0);
  const [error, setError] = useState("");

  async function read(e: ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = "";
    if (!file) return;
    if (/\.kmz$/i.test(file.name)) {
      setError("Arquivo .kmz é compactado. No Google Earth, salve como .kml e importe de novo.");
      return;
    }
    const found = parseShapes(await file.text());
    if (found.length === 0) {
      setError("Não achei nenhum polígono nesse arquivo. Use KML ou GeoJSON com a área do talhão.");
      setShapes([]);
      return;
    }
    setError("");
    setShapes(found);
    const target = norm(plotName);
    const match = found.findIndex((s) => norm(s.name) === target || (target && norm(s.name).includes(target)));
    setChosen(match >= 0 ? match : 0);
  }

  return (
    <section className="space-y-3">
      <SectionTitle>Importar contorno</SectionTitle>
      <Card className="space-y-4">
        <p className="text-sm text-muted">
          Arquivo .kml (Google Earth, CAR) ou .geojson com o desenho do talhão. Se tiver vários, escolha qual é este.
        </p>
        <label className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-semibold">
          <Upload className="size-4" /> Escolher arquivo
          <input
            type="file"
            accept=".kml,.geojson,.json,application/vnd.google-earth.kml+xml,application/geo+json,application/json"
            className="sr-only"
            onChange={read}
          />
        </label>
        {error ? (
          <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
        {shapes.length > 0 ? (
          <>
            {shapes.length > 1 ? (
              <fieldset className="max-h-64 space-y-1 overflow-y-auto">
                <legend className="mb-1 text-sm font-medium">Qual é o talhão {plotName}?</legend>
                {shapes.map((s, i) => (
                  <label key={i} className="flex items-center gap-3 rounded-xl border border-border p-2.5 text-sm">
                    <input type="radio" name="shape" checked={chosen === i} onChange={() => setChosen(i)} className="size-4 accent-brand" />
                    <span className="min-w-0 flex-1 truncate">{s.name}</span>
                    <span className="shrink-0 text-muted">{formatNumberBR(polygonAreaHa(s.ring), 2)} ha</span>
                  </label>
                ))}
              </fieldset>
            ) : null}
            <ShapePreview ring={shapes[chosen].ring} className="h-32" />
            <p className="text-sm">
              {shapes[chosen].name}: <span className="font-semibold">{formatNumberBR(polygonAreaHa(shapes[chosen].ring), 2)} ha</span>
            </p>
            <Button className="w-full" onClick={() => onPick(shapes[chosen].ring)}>
              Usar este contorno
            </Button>
          </>
        ) : null}
        <Button variant="ghost" className="w-full" onClick={onCancel}>
          Cancelar
        </Button>
      </Card>
    </section>
  );
}
