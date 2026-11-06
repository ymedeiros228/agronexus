"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { CloudDownload, Crosshair, Maximize2, Minus, Plus } from "lucide-react";
import { toast } from "@/components/toaster";
import { fitView, fromWorld, tilesInView, toWorld, type LngLat } from "@/lib/geo";

/**
 * Mapa de satélite próprio, em ladrilhos (sem biblioteca): arrastar move, pinça ou roda dão zoom,
 * toque marca. Usado no mapa da fazenda; o desenho do contorno (`tap-map.tsx`) reaproveita as peças.
 */

export const MIN_ZOOM = 3;
export const MAX_ZOOM = 19;
/** Imagem de satélite gratuita da Esri (exige o crédito no canto do mapa). */
export const tileUrl = (z: number, x: number, y: number) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
/** Zooms a mais e a menos que "Guardar área" baixa em volta da vista atual. */
const SAVE_DEEPER = 2;
const SAVE_WIDER = 2;
/** Arrastou menos que isso: foi um toque. */
export const TAP_PX = 8;
const noop = () => () => {};

export type View = { center: LngLat; zoom: number };
export type Size = { w: number; h: number };
/** Converte longitude/latitude em pixels do quadro. */
export type Project = (p: LngLat) => [number, number];

export const clampZoom = (z: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));

export function toScreen(p: LngLat, v: View, s: Size): [number, number] {
  const [x, y] = toWorld(p, v.zoom);
  const [cx, cy] = toWorld(v.center, v.zoom);
  return [x - cx + s.w / 2, y - cy + s.h / 2];
}

export function screenToLngLat(sx: number, sy: number, v: View, s: Size): LngLat {
  const [cx, cy] = toWorld(v.center, v.zoom);
  return fromWorld([cx + sx - s.w / 2, cy + sy - s.h / 2], v.zoom);
}

/** Pontos de tela em caminho SVG. */
export function pathOf(pts: [number, number][], close: boolean) {
  return pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ") + (close ? " Z" : "");
}

/** O service worker guarda os ladrilhos baixados: sem ele, "guardar área" não serve. */
export function useCanSaveOffline() {
  return useSyncExternalStore(noop, () => !!navigator.serviceWorker?.controller, () => false);
}

/** Baixa os ladrilhos da vista (e zooms vizinhos) para o service worker guardar. Devolve quantos vieram. */
export async function saveArea(v: View, s: Size, onProgress: (done: number, total: number) => void) {
  const base = Math.round(v.zoom);
  const urls = new Set<string>();
  for (let z = Math.max(MIN_ZOOM, base - SAVE_WIDER); z <= Math.min(MAX_ZOOM - 1, base + SAVE_DEEPER); z++) {
    for (const t of tilesInView(v.center, z, s.w, s.h)) urls.add(tileUrl(t.z, t.x, t.y));
  }
  const queue = [...urls];
  let done = 0;
  let failed = 0;
  onProgress(0, urls.size);
  const worker = async () => {
    for (let url = queue.pop(); url; url = queue.pop()) {
      try {
        if (!(await fetch(url, { mode: "cors" })).ok) failed++;
      } catch {
        failed++;
      }
      onProgress(++done, urls.size);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  const ok = urls.size - failed;
  toast(ok === 0 ? "Sem internet agora. Guarde a área quando tiver sinal." : `Área guardada (${ok} imagens). O mapa dessa região abre sem internet.`);
  return ok;
}

export function MapButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
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
export function Tiles({ view, size, onStatus }: { view: View; size: Size; onStatus: (s: "ok" | "fail") => void }) {
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

export const ATTRIBUTION = "Imagens: Esri, Maxar, Earthstar Geographics";

type Gesture =
  | { kind: "pan"; startX: number; startY: number; moved: boolean; start: View }
  | { kind: "pinch"; anchor: LngLat; startZoom: number; startDist: number }
  | { kind: "idle" };

/**
 * Mapa de satélite para olhar e marcar.
 * - `fit`: contornos que a vista enquadra ao abrir e quando `fitKey` muda (troca de fazenda).
 * - `overlay`: desenho em SVG por cima; elementos com `data-hit="id"` e `pointer-events-auto` viram alvo de toque (`onHit`).
 * - `onTap`: toque fora de um alvo, com a posição no chão.
 * - `focus`: quando muda, a vista centraliza nele (ex.: ponto escolhido na lista).
 */
export function SatMap({
  fit,
  fitKey,
  overlay,
  onTap,
  onHit,
  onLocate,
  focus,
  crosshair = false,
  label,
  className = "h-[min(62vh,560px)] min-h-80",
  children,
}: {
  fit: LngLat[][];
  fitKey?: string;
  overlay?: (project: Project, view: View) => ReactNode;
  onTap?: (p: LngLat) => void;
  onHit?: (id: string) => void;
  onLocate?: (p: LngLat, accuracyM: number) => void;
  focus?: LngLat | null;
  crosshair?: boolean;
  label: string;
  className?: string;
  children?: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [me, setMe] = useState<{ p: LngLat; acc: number } | null>(null);
  const [tiles, setTiles] = useState<"loading" | "ok" | "fail">("loading");
  const [gpsError, setGpsError] = useState("");
  const [saving, setSaving] = useState<{ done: number; total: number } | null>(null);
  const canSave = useCanSaveOffline();
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture>({ kind: "idle" });
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  function fitAll(el: HTMLDivElement) {
    setView(fit.length ? fitView(fit, el.clientWidth, el.clientHeight, 17) : { center: [-50, -14], zoom: 4 });
  }

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Enquadra ao abrir e a cada troca de fazenda.
  useEffect(() => {
    if (box.current) fitAll(box.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  // Foco novo (ponto escolhido na lista): centraliza, ajustando o estado na própria renderização.
  const [lastFocus, setLastFocus] = useState(focus);
  if (focus !== lastFocus) {
    setLastFocus(focus);
    if (focus && view) setView({ center: focus, zoom: Math.max(view.zoom, 16) });
  }

  // Roda do mouse com zoom no ponto do cursor (não passivo, para não rolar a página).
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

  const sizeNow = (): Size => ({ w: box.current!.clientWidth, h: box.current!.clientHeight });

  function zoomAround(sx: number, sy: number, delta: number) {
    const v = viewRef.current;
    if (!v || !box.current) return;
    const s = sizeNow();
    const anchor = screenToLngLat(sx, sy, v, s);
    const zoom = clampZoom(v.zoom + delta);
    const [ax, ay] = toWorld(anchor, zoom);
    setView({ zoom, center: fromWorld([ax - sx + s.w / 2, ay - sy + s.h / 2], zoom) });
  }

  function locate() {
    if (!("geolocation" in navigator)) {
      setGpsError("Este aparelho não tem GPS disponível no navegador.");
      return;
    }
    setGpsError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p: LngLat = [pos.coords.longitude, pos.coords.latitude];
        setMe({ p, acc: pos.coords.accuracy });
        setView((v) => ({ center: p, zoom: Math.max(v?.zoom ?? 17, 17) }));
        onLocate?.(p, pos.coords.accuracy);
      },
      () => setGpsError("Não foi possível ler sua localização. Confira se o GPS está ligado e se o navegador tem permissão."),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 10_000 },
    );
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
      gesture.current = { kind: "pinch", anchor: screenToLngLat(mid.x, mid.y, v, sizeNow()), startZoom: v.zoom, startDist: dist };
    } else if (pointers.current.size === 1) {
      gesture.current = { kind: "pan", startX: p.x, startY: p.y, moved: false, start: v };
    }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (!box.current) return;
    const s = sizeNow();
    if (g.kind === "pinch" && pointers.current.size === 2) {
      const { mid, dist } = pinchInfo();
      const zoom = clampZoom(g.startZoom + Math.log2(dist / g.startDist));
      const [ax, ay] = toWorld(g.anchor, zoom);
      setView({ zoom, center: fromWorld([ax - mid.x + s.w / 2, ay - mid.y + s.h / 2], zoom) });
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
    if (g.kind === "pan" && !g.moved && v) {
      const hit = (e.target as Element).closest<SVGElement | HTMLElement>("[data-hit]");
      // Marcando (cruz na tela): todo toque é posição, inclusive em cima de um talhão.
      if (hit?.dataset.hit && onHit && !crosshair) onHit(hit.dataset.hit);
      else if (onTap) {
        const p = local(e);
        onTap(screenToLngLat(p.x, p.y, v, sizeNow()));
      }
    }
    // Depois da pinça, o dedo que sobra não vira toque nem arrasto.
    gesture.current = { kind: "idle" };
  }

  async function save() {
    const v = viewRef.current;
    if (!v || !size || saving) return;
    await saveArea(v, size, (done, total) => setSaving({ done, total }));
    setSaving(null);
  }

  const project: Project | null = view && size ? (p) => toScreen(p, view, size) : null;

  return (
    <div className="space-y-2">
      <div
        ref={box}
        role="application"
        aria-label={label}
        className={`relative touch-none select-none overflow-hidden rounded-2xl bg-[#1d2a22] ${crosshair ? "cursor-crosshair" : "cursor-grab"} ${className}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {view && size && project ? (
          <>
            <Tiles view={view} size={size} onStatus={setTiles} />
            <svg className="pointer-events-none absolute inset-0 size-full">
              {overlay?.(project, view)}
              {me ? <MeDot at={project(me.p)} accPx={me.acc / metersPerPixel(me.p[1], view.zoom)} /> : null}
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
          <MapButton label="Minha localização" onClick={locate}>
            <Crosshair className="size-5" />
          </MapButton>
          {fit.length ? (
            <MapButton label="Ver a fazenda inteira" onClick={() => box.current && fitAll(box.current)}>
              <Maximize2 className="size-5" />
            </MapButton>
          ) : null}
        </div>
        {tiles === "fail" ? (
          <p className="absolute left-2 top-2 mr-16 rounded-lg bg-black/70 px-3 py-2 text-xs text-white">
            Sem internet a imagem de satélite não carrega. Os talhões e pontos continuam aqui.
          </p>
        ) : null}
        {children}
        <p className="pointer-events-none absolute bottom-0 right-0 rounded-tl-md bg-black/55 px-1.5 py-0.5 text-[10px] text-white/90">
          {ATTRIBUTION}
        </p>
      </div>
      {gpsError ? <p className="text-sm text-warn">{gpsError}</p> : null}
      {me ? (
        <p className="text-xs text-muted">
          Você está aqui (precisão de {Math.round(me.acc)} m). {me.acc > 30 ? "Espere o GPS firmar para marcar ponto." : ""}
        </p>
      ) : null}
      {canSave ? (
        <button
          type="button"
          onClick={save}
          disabled={!!saving}
          className="flex w-full items-center justify-center gap-2 py-1 text-sm font-medium text-brand disabled:text-muted"
        >
          <CloudDownload className="size-4" />
          {saving ? `Guardando… ${Math.round((saving.done / Math.max(saving.total, 1)) * 100)}%` : "Guardar esta área para usar sem internet"}
        </button>
      ) : null}
    </div>
  );
}

/** Metros por pixel no zoom e latitude dados (Mercator). */
export function metersPerPixel(lat: number, zoom: number) {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

function MeDot({ at: [x, y], accPx }: { at: [number, number]; accPx: number }) {
  return (
    <g aria-hidden>
      {accPx > 10 ? <circle cx={x} cy={y} r={Math.min(accPx, 400)} fill="rgba(59,130,246,0.15)" stroke="rgba(59,130,246,0.5)" /> : null}
      <circle cx={x} cy={y} r={8} fill="#3b82f6" stroke="white" strokeWidth={3} />
    </g>
  );
}
