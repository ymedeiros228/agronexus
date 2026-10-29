"use client";

import { useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { ShapePreview } from "@/components/map-bits";
import { Button, Card, Field, SectionTitle, inputClass } from "@/components/ui";
import { parseCoords, suggestUtmZone, toUtm, utmZoneOf, type CoordFormat, type Hemisphere, type Order } from "@/lib/coords";
import { center, openRing, perimeterM, polygonAreaHa, selfIntersects, type LngLat } from "@/lib/geo";
import { formatNumberBR } from "@/lib/operations";

const FORMAT_NAME: Record<CoordFormat, string> = {
  decimal: "graus decimais",
  gms: "graus, minutos e segundos (GMS)",
  utm: "UTM SIRGAS 2000",
  wkt: "WKT",
  geojson: "GeoJSON",
};

/** Fusos UTM do Brasil. */
const ZONES = [18, 19, 20, 21, 22, 23, 24, 25];

/** Casas fixas na tabela de vértices: coordenada não perde zero no fim. */
const fixedBR = (n: number, digits: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

const km = (m: number) => (m >= 1000 ? `${formatNumberBR(m / 1000, 2)} km` : `${formatNumberBR(m, 0)} m`);

/** Contorno salvo em texto editável: uma linha "latitude, longitude" por vértice, como o Google Maps copia. */
function ringToText(ring: LngLat[]): string {
  return openRing(ring).map(([lng, lat]) => `${lat.toFixed(7)}, ${lng.toFixed(7)}`).join("\n");
}

export function CoordsEditor({
  plotName,
  initial,
  known,
  onPick,
  onCancel,
}: {
  plotName: string;
  /** Contorno atual do talhão, para editar as coordenadas dele. */
  initial: LngLat[] | null;
  /** Contornos da fazenda, para sugerir o fuso UTM. */
  known: LngLat[][];
  onPick: (ring: LngLat[]) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(() => (initial ? ringToText(initial) : ""));
  const [order, setOrder] = useState<Order | undefined>(undefined);
  const [utm, setUtm] = useState<{ zone: number; hemisphere: Hemisphere }>(() => suggestUtmZone(initial ? [initial, ...known] : known));
  const parsed = parseCoords(text, { utm, order });
  const ring = parsed.points;
  const ok = ring.length >= 3;
  const crossed = ok && selfIntersects(ring);
  const zone = ok ? utmZoneOf(center(ring)[0]) : utm.zone;

  return (
    <section className="space-y-3">
      <SectionTitle>Coordenadas do talhão {plotName}</SectionTitle>
      <Card className="space-y-4">
        <p className="text-sm text-muted">
          Cole do CAR, do SIGEF, do memorial descritivo, do GPS de mão ou do Google Maps, ou digite. Um vértice por linha, na ordem
          do contorno.
        </p>
        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-brand">Formatos aceitos</summary>
          <ul className="mt-2 space-y-1 text-muted">
            <li>
              Graus decimais: <code className="text-foreground">-7.5325, -46.0356</code> ou <code className="text-foreground">-7,5325; -46,0356</code>
            </li>
            <li>
              GMS: <code className="text-foreground">7°31&apos;57&quot; S 46°02&apos;08&quot; O</code>
            </li>
            <li>
              UTM: <code className="text-foreground">385745,44 9167249,06</code> ou <code className="text-foreground">E 385.745 N 9.167.249</code>
            </li>
            <li>
              WKT: <code className="text-foreground">POLYGON((-46.0356 -7.5325, …))</code>
            </li>
          </ul>
        </details>
        <Field label="Vértices">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            spellCheck={false}
            autoCapitalize="off"
            className={`${inputClass} font-mono text-sm leading-relaxed`}
            placeholder={"-7.5325, -46.0356\n-7.5330, -46.0300\n-7.5400, -46.0310"}
          />
        </Field>

        {parsed.format ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p>
              <span className="text-muted">Lido como </span>
              <span className="font-medium">{FORMAT_NAME[parsed.format]}</span>
              {parsed.format === "decimal" && parsed.order ? (
                <span className="text-muted"> · {parsed.order === "latlng" ? "latitude, longitude" : "longitude, latitude"}</span>
              ) : null}
              <span className="text-muted">
                {" "}
                · {ring.length} {ring.length === 1 ? "vértice" : "vértices"}
              </span>
            </p>
            {parsed.format === "decimal" && parsed.order ? (
              <Button
                type="button"
                variant="ghost"
                className="min-h-9 px-2"
                onClick={() => setOrder(parsed.order === "latlng" ? "lnglat" : "latlng")}
              >
                <ArrowLeftRight aria-hidden className="size-4" /> Inverter
              </Button>
            ) : null}
          </div>
        ) : null}

        {parsed.format === "utm" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fuso UTM" hint="Do CAR ou do memorial">
              <select value={utm.zone} onChange={(e) => setUtm((u) => ({ ...u, zone: Number(e.target.value) }))} className={inputClass}>
                {ZONES.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Hemisfério">
              <select
                value={utm.hemisphere}
                onChange={(e) => setUtm((u) => ({ ...u, hemisphere: e.target.value as Hemisphere }))}
                className={inputClass}
              >
                <option value="S">Sul</option>
                <option value="N">Norte</option>
              </select>
            </Field>
          </div>
        ) : null}

        {parsed.problems.length ? (
          <div role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
            <p className="font-medium">
              {parsed.problems.length === 1 ? "1 linha não foi entendida" : `${parsed.problems.length} linhas não foram entendidas`}:
            </p>
            <ul className="mt-1 space-y-0.5">
              {parsed.problems.slice(0, 5).map((p) => (
                <li key={p.line} className="truncate">
                  Linha {p.line}: <span className="font-mono">{p.text}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {ok ? (
          <>
            <ShapePreview ring={ring} className="h-36" />
            <p className="text-sm">
              Área: <span className="font-semibold">{formatNumberBR(polygonAreaHa(ring), 2)} ha</span>
              <span className="text-muted"> · perímetro {km(perimeterM(ring))}</span>
            </p>
            {crossed ? (
              <p className="rounded-xl bg-warn/10 px-3 py-2 text-sm text-warn">
                As linhas do contorno se cruzam: confira a ordem dos vértices. A área pode estar errada.
              </p>
            ) : null}
            <details className="text-sm">
              <summary className="cursor-pointer font-medium text-brand">Ver os {ring.length} vértices</summary>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-left tabular-nums">
                  <thead className="text-xs text-muted">
                    <tr>
                      <th className="py-1 pr-2 font-medium">#</th>
                      <th className="py-1 pr-2 font-medium">Latitude</th>
                      <th className="py-1 pr-2 font-medium">Longitude</th>
                      <th className="py-1 pr-2 font-medium">E (fuso {zone})</th>
                      <th className="py-1 font-medium">N</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {ring.map((p, i) => {
                      const u = toUtm(p, zone);
                      return (
                        <tr key={i}>
                          <td className="py-1 pr-2 text-muted">{i + 1}</td>
                          <td className="py-1 pr-2">{fixedBR(p[1], 7)}</td>
                          <td className="py-1 pr-2">{fixedBR(p[0], 7)}</td>
                          <td className="py-1 pr-2">{fixedBR(u.e, 2)}</td>
                          <td className="py-1">{fixedBR(u.n, 2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        ) : null}

        <Button className="w-full" disabled={!ok || parsed.problems.length > 0} onClick={() => onPick(ring)}>
          Usar este contorno
        </Button>
        <Button variant="ghost" className="w-full" onClick={onCancel}>
          Cancelar
        </Button>
      </Card>
    </section>
  );
}
