import type { LngLat } from "../geo";
import { formatNumberBR } from "../operations";

/**
 * Desenho de contornos no PDF (sem satélite: funciona sem internet e não depende de licença de imagem).
 * Projeção local em metros (equiretangular na latitude média), norte para cima.
 * Na escala de uma fazenda o erro é desprezível.
 */

export type Projector = {
  project: (p: LngLat) => { x: number; y: number };
  /** Pontos do PDF por metro. */
  k: number;
};

export function fitProjection(all: LngLat[], width: number, height: number, pad: number): Projector {
  const lat0 = all.reduce((s, p) => s + p[1], 0) / Math.max(all.length, 1);
  const mx = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const my = 110_574;
  const xs = all.map((p) => p[0] * mx);
  const ys = all.map((p) => p[1] * my);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const k = Math.min((width - 2 * pad) / Math.max(maxX - minX, 1), (height - 2 * pad) / Math.max(maxY - minY, 1));
  const ox = (width - (maxX - minX) * k) / 2;
  const oy = (height - (maxY - minY) * k) / 2;
  return {
    k,
    project: ([lng, lat]) => ({ x: ox + (lng * mx - minX) * k, y: oy + (maxY - lat * my) * k }),
  };
}

/** Caminho SVG fechado de um anel já aberto (sem repetir o primeiro ponto). */
export function ringPath(ring: LngLat[], project: Projector["project"]): string {
  return (
    ring
      .map((p, i) => {
        const q = project(p);
        return `${i ? "L" : "M"}${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
      })
      .join(" ") + " Z"
  );
}

/** Escala "redonda" (1, 2 ou 5 × 10ⁿ metros) mais próxima de um quarto da largura do desenho. */
export function scaleBar(k: number, width: number): { px: number; label: string } {
  const target = width / 4 / k;
  const pow = 10 ** Math.floor(Math.log10(target));
  let m = pow;
  for (const f of [5, 2, 1]) {
    if (f * pow <= target) {
      m = f * pow;
      break;
    }
  }
  return { px: m * k, label: m >= 1000 ? `${formatNumberBR(m / 1000, 1)} km` : `${formatNumberBR(m, 0)} m` };
}

/** Centro aproximado (média dos vértices) para pôr o nome do talhão. */
export function ringCenter(ring: LngLat[]): LngLat {
  const n = ring.length || 1;
  return [ring.reduce((s, p) => s + p[0], 0) / n, ring.reduce((s, p) => s + p[1], 0) / n];
}
