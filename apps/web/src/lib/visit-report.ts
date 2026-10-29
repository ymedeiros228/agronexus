import { KIND_LABEL, visitKindInfo } from "./catalog";
import type { Client, Farm, Finding, Plot, Season, Visit, VisitAuthor } from "./db";
import { formatDate, plotLabel } from "./format";
import { signatureLines } from "./profile";
import { standReportLines } from "./stand";

/**
 * Texto do relatório da visita para o WhatsApp (negrito com *asteriscos*).
 * Termina com a identificação de quem registrou e, se for o caso, do responsável técnico.
 */

export type VisitReportInput = {
  visit: Visit;
  farm?: Farm;
  plot?: Plot;
  client?: Client;
  season?: Season;
  findings: Finding[];
  /** Dias após o plantio na data da visita. */
  dap: number | null;
  /** Quem assina: o autor gravado na visita ou, nas visitas antigas, o perfil atual. */
  author: VisitAuthor | null;
};

export function visitReportText({ visit, farm, plot, client, season, findings, dap, author }: VisitReportInput): string {
  const producer = client?.name || farm?.owner;
  const lines = [
    `*Relatório de visita — ${farm?.name ?? "Fazenda"} · ${plotLabel(plot?.name)}*`,
    ...(producer ? [`Produtor: ${producer}`] : []),
    // Monitoramento é o padrão: só os outros tipos aparecem escritos.
    ...(visit.kind && visit.kind !== "monitoramento" ? [`Tipo: ${visitKindInfo(visit.kind).label}`] : []),
    `Data: ${formatDate(visit.date)}${visit.stage ? ` · Estágio: ${visit.stage}` : ""}${dap !== null ? ` · ${dap} dias após o plantio` : ""}`,
  ];
  if (season?.cultivar) lines.push(`Cultivar: ${season.cultivar} (safra ${season.label})`);
  const stand = standReportLines(visit.stand, visit.kind);
  if (stand.length) lines.push("", visit.kind === "plantio" ? "*Sementes no sulco*" : "*Estande*", ...stand);
  if (findings.length) {
    lines.push("", "*Achados*");
    findings.forEach((f) =>
      lines.push(`- ${KIND_LABEL[f.kind]}: ${f.name}${f.amount ? ` — ${f.amount}` : ""}${f.note ? ` (${f.note})` : ""}`),
    );
  }
  if (visit.observations) lines.push("", "*Observações*", visit.observations);
  if (visit.recommendation) lines.push("", "*Recomendação*", visit.recommendation);
  if (visit.followUpDate) lines.push("", `Retorno combinado: ${formatDate(visit.followUpDate)}`);
  const signature = signatureLines(author);
  if (signature.length) lines.push("", "—", ...signature);
  return lines.join("\n");
}
