/** Safra de soja: o ano agrícola começa em julho. Ex.: out/2026 vira "2026/27". */
export function seasonLabelFor(date: Date = new Date()): string {
  const start = date.getMonth() >= 6 ? date.getFullYear() : date.getFullYear() - 1;
  return `${start}/${String(start + 1).slice(2)}`;
}

/** "2026/27" vira "2027/28". Rótulo fora do padrão volta a safra atual. */
export function nextSeasonLabel(label: string): string {
  const m = /^(\d{4})\/\d{2}$/.exec(label.trim());
  if (!m) return seasonLabelFor();
  const start = Number(m[1]) + 1;
  return `${start}/${String(start + 1).slice(2)}`;
}

/** Ano agrícola da safra: "2026/27" vai de 01/07/2026 a 30/06/2027. Rótulo fora do padrão: null. */
export function seasonPeriod(label: string): { from: string; to: string } | null {
  const m = /^(\d{4})\/\d{2}$/.exec(label.trim());
  if (!m) return null;
  const y = Number(m[1]);
  return { from: `${y}-07-01`, to: `${y + 1}-06-30` };
}

/** A safra vigente de um talhão é a cadastrada por último. */
export function latestSeason<T extends { createdAt: number }>(seasons: T[]): T | undefined {
  return seasons.reduce<T | undefined>((best, s) => (!best || s.createdAt > best.createdAt ? s : best), undefined);
}

/** Dias corridos desde uma data AAAA-MM-DD (nunca negativo). */
export function daysSince(iso: string, now: number = Date.now()): number {
  const start = new Date(`${iso}T00:00:00`).getTime();
  return Math.max(0, Math.floor((now - start) / 86_400_000));
}
