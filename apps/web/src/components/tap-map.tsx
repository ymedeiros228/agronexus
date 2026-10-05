"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { CloudDownload, Crosshair, Minus, Plus } from "lucide-react";
import { toast } from "@/components/toaster";
import { Button, Card, SectionTitle } from "@/components/ui";
import {
  fitView,
  fromWorld,
  openRing,
  perimeterM,
  polygonAreaHa,
  selfIntersects,
  tilesInView,
  toWorld,
  type LngLat,
} from "@/lib/geo";
import { formatNumberBR } from "@/lib/operations";

const MIN_ZOOM = 3;
const MAX_ZOOM = 19;
/** Imagem de satélite gratuita da Esri (exige o crédito no canto do mapa). */
const tileUrl = (z: number, x: number, y: number) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
/** Zooms a mais e a menos que "Guardar área" baixa em volta da vista atual. */
const SAVE_DEEPER = 2;
const SAVE_WIDER = 2;
const noop = () => () => {};
/** Arrastou menos que isso: foi um toque, marca ponto. */
const TAP_PX = 8;

type View = { center: LngLat; zoom: number };
type Gesture =
  | { kind: "pan"; startX: number; startY: number; moved: boolean; start: View }
  | { kind: "pinch"; anchor: LngLat; startZoom: number; startDist: number }
  | { kind: "vertex"; index: number };

const clampZoom = (z: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
const km = (m: number) => (m >= 1000 ? `${formatNumberBR(m / 1000, 2)} km` : `${formatNumberBR(m, 0)} m`);

/**
 * Desenhar o contorno tocando nos cantos do talhão sobre a imagem de satélite.
 * Mapa próprio em ladrilhos (sem biblioteca): arrastar move, pinça ou roda dão zoom,
 * arrastar um ponto ajusta e arrastar o ponto do meio de um lado cria um canto novo.
 */
export function TapDrawer({
  initial,
  neighbors,
  onDone,
  onCancel,
}: {
  initial: LngLat[];
  neighbors: LngLat[][];
  onDone: (ring: LngLat[]) => void;
  onCancel: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [points, setPoints] = useState<LngLat[]>(() => openRing(initial));
  const [me, setMe] = useState<LngLat | null>(null);
  const [tiles, setTiles] = useState<"loading" | "ok" | "fail">("loading");
  const [gpsError, setGpsError] = useState("");
  const [saving, setSaving] = useState<{ done: number; total: number } | null>(null);
  // Guardar para usar sem internet depende do service worker (que guarda os ladrilhos baixados).
  const canSave = useSyncExternalStore(noop, () => !!navigator.serviceWorker?.controller, () => false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  function locate(zoomTo = true) {
    if (!("geolocation" in navigator)) {
      setGpsError("Este aparelho não tem GPS disponível no navegador.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p: LngLat = [pos.coords.longitude, pos.coords.latitude];
        setMe(p);
        setGpsError("");
        if (zoomTo) setView({ center: p, zoom: 17 });
      },
      () => setGpsError("Não foi possível ler sua localização. Arraste o mapa até o talhão."),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }

  // Tamanho do quadro e vista inicial: o contorno atual, os talhões vizinhos ou o GPS.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const ref = initial.length >= 3 ? [initial] : neighbors;
    if (ref.length) {
      setView(fitView(ref, el.clientWidth, el.clientHeight));
    } else {
      setView({ center: [-50, -14], zoom: 4 });
      locate();
    }
    return () => ro.disconnect();
    // Só na abertura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Roda do mouse com zoom no ponto do cursor (precisa ser não passivo para não rolar a página).
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAround(e.clientX - r.left, e.clientY - r.top, -e.deltaY * 0.002);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toScreen(p: LngLat, v: View, s: { w: number; h: number }): [number, number] {
    const [x, y] = toWorld(p, v.zoom);
    const [cx, cy] = toWorld(v.center, v.zoom);
    return [x - cx + s.w / 2, y - cy + s.h / 2];
  }

  function toLngLat(sx: number, sy: number, v: View): LngLat {
    const el = box.current!;
    const [cx, cy] = toWorld(v.center, v.zoom);
    return fromWorld([cx + sx - el.clientWidth / 2, cy + sy - el.clientHeight / 2], v.zoom);
  }

  /** Muda o zoom mantendo parado o ponto da tela (sx, sy). */
  function zoomAround(sx: number, sy: number, delta: number) {
    const v = viewRef.current;
    const el = box.current;
    if (!v || !el) return;
    const anchor = toLngLat(sx, sy, v);
    const zoom = clampZoom(v.zoom + delta);
    const [ax, ay] = toWorld(anchor, zoom);
    setView({ zoom, center: fromWorld([ax - sx + el.clientWidth / 2, ay - sy + el.clientHeight / 2], zoom) });
  }

  function local(e: ReactPointerEvent) {
    const r = box.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function pinchInfo() {
    const [a, b] = [...pointers.current.values()];
    return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dist: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    const v = viewRef.current;
    if (!v || (e.target as Element).closest("button")) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ponteiro já solto: segue sem captura.
    }
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 2) {
      const { mid, dist } = pinchInfo();
      gesture.current = { kind: "pinch", anchor: toLngLat(mid.x, mid.y, v), startZoom: v.zoom, startDist: dist };
      return;
    }
    if (pointers.current.size > 2) return;
    const target = (e.target as Element).closest<SVGElement>("[data-vertex],[data-mid]");
    if (target?.dataset.vertex) {
      gesture.current = { kind: "vertex", index: Number(target.dataset.vertex) };
    } else if (target?.dataset.mid) {
      const i = Number(target.dataset.mid);
      setPoints((pts) => [...pts.slice(0, i + 1), toLngLat(p.x, p.y, v), ...pts.slice(i + 1)]);
      gesture.current = { kind: "vertex", index: i + 1 };
    } else {
      gesture.current = { kind: "pan", startX: p.x, startY: p.y, moved: false, start: v };
    }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    const v = viewRef.current;
    const el = box.current;
    if (!g || !v || !el) return;
    if (g.kind === "pinch" && pointers.current.size === 2) {
      const { mid, dist } = pinchInfo();
      const zoom = clampZoom(g.startZoom + Math.log2(dist / g.startDist));
      const [ax, ay] = toWorld(g.anchor, zoom);
      setView({ zoom, center: fromWorld([ax - mid.x + el.clientWidth / 2, ay - mid.y + el.clientHeight / 2], zoom) });
    } else if (g.kind === "vertex") {
      const at = toLngLat(p.x, p.y, v);
      setPoints((pts) => pts.map((q, i) => (i === g.index ? at : q)));
    } else if (g.kind === "pan") {
      const dx = p.x - g.startX;
      const dy = p.y - g.startY;
      if (!g.moved && Math.hypot(dx, dy) < TAP_PX) return;
      g.moved = true;
      const [cx, cy] = toWorld(g.start.center, g.start.zoom);
      setView({ zoom: g.start.zoom, center: fromWorld([cx - dx, cy - dy], g.start.zoom) });
    }
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.delete(e.pointerId)) return;
    const g = gesture.current;
    const v = viewRef.current;
    if (g?.kind === "pan" && !g.moved && v) {
      const p = local(e);
      setPoints((pts) => [...pts, toLngLat(p.x, p.y, v)]);
    }
    // Depois da pinça, o dedo que sobra não deve virar toque nem arrasto.
    gesture.current = pointers.current.size ? { kind: "pinch", anchor: [0, 0], startZoom: 0, startDist: 0 } : null;
  }

  /** Baixa os ladrilhos da vista atual (e zooms vizinhos); o service worker guarda para o campo. */
  async function saveOffline() {
    const v = viewRef.current;
    if (!v || !size || saving) return;
    const base = Math.round(v.zoom);
    const urls = new Set<string>();
    for (let z = Math.max(MIN_ZOOM, base - SAVE_WIDER); z <= Math.min(MAX_ZOOM - 1, base + SAVE_DEEPER); z++) {
      for (const t of tilesInView(v.center, z, size.w, size.h)) urls.add(tileUrl(t.z, t.x, t.y));
    }
    const queue = [...urls];
    let done = 0;
    let failed = 0;
    setSaving({ done, total: queue.length });
    const worker = async () => {
      for (let url = queue.pop(); url; url = queue.pop()) {
        try {
          if (!(await fetch(url, { mode: "cors" })).ok) failed++;
        } catch {
          failed++;
        }
        setSaving({ done: ++done, total: urls.size });
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    setSaving(null);
    toast(
      failed === urls.size
        ? "Sem internet agora. Guarde a área quando tiver sinal."
        : `Área guardada (${urls.size - failed} imagens). O mapa dessa região abre sem internet.`,
    );
  }

  const area = polygonAreaHa(points);
  const crossed = selfIntersects(points);

  return (
    <section className="space-y-3">
      <SectionTitle>Desenhar no mapa</SectionTitle>
      <Card className="space-y-4">
        <p className="text-sm text-muted">
          Toque nos cantos do talhão, um depois do outro. Arraste para mover o mapa e use dois dedos para o zoom. Arraste um
          ponto para ajustar; o ponto pequeno no meio de um lado vira um canto novo.
        </p>
        <div
          ref={box}
          role="application"
          aria-label="Mapa de satélite para desenhar o contorno"
          className="relative h-[min(65vh,520px)] min-h-72 touch-none select-none overflow-hidden rounded-xl bg-[#1d2a22]"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {view && size ? (
            <>
              <Tiles view={view} size={size} onStatus={setTiles} />
              <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden>
                {neighbors.map((ring, i) => (
                  <path
                    key={i}
                    d={pathOf(ring.map((q) => toScreen(q, view, size)), true)}
                    fill="rgba(255,255,255,0.12)"
                    stroke="white"
                    strokeWidth={1.5}
                    strokeDasharray="6 4"
                  />
                ))}
                {points.length ? (
                  <Drawing pts={points.map((q) => toScreen(q, view, size))} crossed={crossed} />
                ) : null}
                {me ? (
                  <circle cx={toScreen(me, view, size)[0]} cy={toScreen(me, view, size)[1]} r={7} fill="#3b82f6" stroke="white" strokeWidth={3} />
                ) : null}
              </svg>
            </>
          ) : null}
          <div className="absolute right-2 top-2 flex flex-col gap-2">
            <MapButton label="Aproximar" onClick={() => size && zoomAround(size.w / 2, size.h / 2, 1)}>
              <Plus className="size-5" />
            </MapButton>
            <MapButton label="Afastar" onClick={() => size && zoomAround(size.w / 2, size.h / 2, -1)}>
              <Minus className="size-5" />
            </MapButton>
            <MapButton label="Ir para minha localização" onClick={() => locate()}>
              <Crosshair className="size-5" />
            </MapButton>
          </div>
          {tiles === "fail" ? (
            <p className="absolute inset-x-2 top-2 mr-14 rounded-lg bg-black/70 px-3 py-2 text-xs text-white">
              Sem internet a imagem de satélite não carrega. Dá para desenhar mesmo assim ou caminhar com o GPS.
            </p>
          ) : null}
          <p className="pointer-events-none absolute bottom-0 right-0 rounded-tl-md bg-black/55 px-1.5 py-0.5 text-[10px] text-white/90">
            Imagens: Esri, Maxar, Earthstar Geographics
          </p>
        </div>
        {gpsError ? <p className="text-sm text-warn">{gpsError}</p> : null}
        {canSave ? (
          <button
            type="button"
            onClick={saveOffline}
            disabled={!!saving}
            className="flex w-full items-center justify-center gap-2 text-sm font-medium text-brand disabled:text-muted"
          >
            <CloudDownload className="size-4" />
            {saving
              ? `Guardando… ${Math.round((saving.done / saving.total) * 100)}%`
              : "Guardar esta área para usar sem internet"}
          </button>
        ) : null}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-background p-2">
            <p className="text-xl font-semibold tabular-nums">{points.length}</p>
            <p className="text-xs text-muted">pontos</p>
          </div>
          <div className="rounded-xl bg-background p-2">
            <p className="text-xl font-semibold tabular-nums">{formatNumberBR(area, 2)}</p>
            <p className="text-xs text-muted">hectares</p>
          </div>
          <div className="rounded-xl bg-background p-2">
            <p className="text-xl font-semibold tabular-nums">{km(points.length > 1 ? perimeterM(points) : 0)}</p>
            <p className="text-xs text-muted">perímetro</p>
          </div>
        </div>
        {crossed ? (
          <p role="alert" className="rounded-xl bg-warn/10 px-3 py-2 text-sm text-warn">
            Linhas do contorno se cruzam e a área sai errada. Arraste os pontos para desfazer o “8”.
          </p>
        ) : null}
        <div className="grid grid-cols-3 gap-2">
          <Button variant="secondary" disabled={!points.length} onClick={() => setPoints((p) => p.slice(0, -1))}>
            Desfazer
          </Button>
          <Button
            variant="secondary"
            disabled={!points.length}
            onClick={() => window.confirm("Apagar todos os pontos marcados?") && setPoints([])}
          >
            Limpar
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
        <Button className="w-full" disabled={points.length < 3 || crossed} onClick={() => onDone(points)}>
          Concluir contorno
        </Button>
      </Card>
    </section>
  );
}

function pathOf(pts: [number, number][], close: boolean) {
  return pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ") + (close ? " Z" : "");
}

function Drawing({ pts, crossed }: { pts: [number, number][]; crossed: boolean }) {
  const color = crossed ? "#f97316" : "#facc15";
  return (
    <>
      <path
        d={pathOf(pts, pts.length >= 3)}
        fill={pts.length >= 3 ? "rgba(250,204,21,0.22)" : "none"}
        stroke={color}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      {pts.length >= 2
        ? pts.map(([x, y], i) => {
            if (pts.length < 3 && i === pts.length - 1) return null;
            const [nx, ny] = pts[(i + 1) % pts.length];
            return (
              <circle
                key={`m${i}`}
                data-mid={i}
                cx={(x + nx) / 2}
                cy={(y + ny) / 2}
                r={6}
                fill="rgba(255,255,255,0.55)"
                stroke={color}
                strokeWidth={1.5}
                className="pointer-events-auto cursor-copy"
              />
            );
          })
        : null}
      {pts.map(([x, y], i) => (
        <circle
          key={`v${i}`}
          data-vertex={i}
          cx={x}
          cy={y}
          r={i === 0 ? 10 : 8}
          fill={i === 0 ? color : "white"}
          stroke="#111"
          strokeWidth={2}
          className="pointer-events-auto cursor-move"
        />
      ))}
    </>
  );
}

function MapButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid size-11 place-items-center rounded-xl bg-white text-[#14231a] shadow-md active:scale-95"
    >
      {children}
    </button>
  );
}

/** Ladrilhos que cobrem o quadro no zoom inteiro mais próximo, esticados para o zoom fracionado. */
function Tiles({
  view,
  size,
  onStatus,
}: {
  view: View;
  size: { w: number; h: number };
  onStatus: (s: "ok" | "fail") => void;
}) {
  return (
    <>
      {tilesInView(view.center, view.zoom, size.w, size.h).map((t) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={t.key}
          src={tileUrl(t.z, t.x, t.y)}
          alt=""
          crossOrigin="anonymous"
          draggable={false}
          onLoad={() => onStatus("ok")}
          onError={() => onStatus("fail")}
          className="pointer-events-none absolute max-w-none"
          style={{ left: t.left, top: t.top, width: t.size + 0.5, height: t.size + 0.5 }}
        />
      ))}
    </>
  );
}
