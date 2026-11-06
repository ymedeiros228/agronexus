import { pdf } from "@react-pdf/renderer";
import { alive, db } from "../db";
import { authorFromProfile, getProfile } from "../profile";
import { daysSince, latestSeason } from "../season";
import { VisitPdf } from "./visit-pdf";
import { standHeadline, visitPdfModel, type PdfPhoto } from "./visit-model";

/**
 * Gera o PDF da visita no próprio aparelho (funciona sem internet).
 * Este arquivo só é carregado quando a pessoa toca em "Gerar PDF" (import dinâmico),
 * para a biblioteca de PDF não pesar na abertura do app.
 */

/** Foto reduzida para o PDF: ~1200 px no lado maior, JPEG. Mantém o arquivo leve para o WhatsApp. */
export async function photoForPdf(blob: Blob, maxSide = 1200, quality = 0.78): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", quality);
}

export async function visitPdfBlob(visitId: string): Promise<{ blob: Blob; fileName: string; title: string }> {
  const visit = await db.visits.get(visitId);
  if (!visit || visit.deletedAt) throw new Error("Visita não encontrada.");
  const [farm, plot, seasons, findings, photos, points, profile] = await Promise.all([
    db.farms.get(visit.farmId),
    db.plots.get(visit.plotId),
    db.seasons.where("plotId").equals(visit.plotId).toArray(),
    db.findings.where("visitId").equals(visitId).toArray(),
    db.photos.where("visitId").equals(visitId).toArray(),
    db.points.where("plotId").equals(visit.plotId).toArray(),
    getProfile(),
  ]);
  const client = farm?.clientId ? await db.clients.get(farm.clientId) : undefined;
  const live = alive(seasons);
  const season = live.find((s) => s.id === visit.seasonId) ?? latestSeason(live);
  const dap = season?.plantingDate ? daysSince(season.plantingDate, new Date(`${visit.date}T12:00:00`).getTime()) : null;

  const pdfPhotos: PdfPhoto[] = [];
  for (const p of alive(photos).sort((a, b) => a.takenAt - b.takenAt)) {
    try {
      const gps = p.lat != null && p.lng != null ? `GPS ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}` : "";
      pdfPhotos.push({ src: await photoForPdf(p.blob), caption: [p.label, gps].filter(Boolean).join(" · ") });
    } catch {
      // Foto que o navegador não consegue abrir: fica de fora em vez de travar o relatório.
    }
  }

  const model = visitPdfModel({
    visit,
    farm,
    plot,
    client: client && !client.deletedAt ? client : undefined,
    season,
    findings: alive(findings).sort((a, b) => a.createdAt - b.createdAt),
    dap,
    author: visit.author ?? authorFromProfile(profile),
    photos: pdfPhotos,
    points: alive(points),
    logo: profile?.logo || undefined,
  });
  const blob = await pdf(<VisitPdf m={model} headline={standHeadline(visit)} />).toBlob();
  return { blob, fileName: model.fileName, title: `${model.title} - ${model.farmName}` };
}
