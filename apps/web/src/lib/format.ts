export function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** "1 - Baixada" vira "Talhão 1 - Baixada"; nome que já começa com "Talhão" fica como está. */
export function plotLabel(name: string | undefined): string {
  if (!name) return "Talhão ?";
  return /^talh[aã]o\b/i.test(name.trim()) ? name.trim() : `Talhão ${name.trim()}`;
}

/** Nome curto para rótulo no mapa: "Talhão 1 - Baixada" vira "1 - Baixada". */
export function plotShortName(name: string): string {
  return name.trim().replace(/^talh[aã]o\s+/i, "") || name.trim();
}

/**
 * Tamanho da fonte para o texto caber em `width` (largura média de letra ~0,58 da fonte),
 * entre `min` e `max`.
 */
export function fitFontSize(text: string, width: number, max: number, min = 9): number {
  return Math.max(min, Math.min(max, (width * 0.9) / (text.length * 0.58)));
}

/** Reduz a foto no aparelho antes de guardar, para não encher a memória do celular. */
export async function compressImage(file: File, maxSide = 1600, quality = 0.8): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("falha ao comprimir"))), "image/jpeg", quality),
  );
}

export function getPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  });
}
