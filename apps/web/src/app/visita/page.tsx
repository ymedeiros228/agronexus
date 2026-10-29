"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Bug, CircleHelp, ClipboardList, MessageCircle, Microscope, Sprout, type LucideIcon } from "lucide-react";
import { PhotoGallery } from "@/components/photo-viewer";
import { Button, Card, Chip, Empty, LinkButton, PageSkeleton, SectionTitle } from "@/components/ui";
import { toast } from "@/components/toaster";
import { KIND_LABEL, visitKindInfo } from "@/lib/catalog";
import { whatsappLink } from "@/lib/clients";
import { alive, db, removeVisit, restoreRemoved, setFollowUpDone, type FindingKind } from "@/lib/db";
import { formatDate, plotLabel } from "@/lib/format";
import { formatNumberBR } from "@/lib/operations";
import { authorFromProfile, getProfile, signatureLines } from "@/lib/profile";
import { daysSince, latestSeason } from "@/lib/season";
import { cleanStand, standReportLines, standUnit, summarizeStand } from "@/lib/stand";
import { visitReportText } from "@/lib/visit-report";

export default function VisitPage() {
  return (
    <Suspense fallback={null}>
      <Visit />
    </Suspense>
  );
}

/** Cor e ícone de cada tipo de achado, para bater o olho na lista. */
const FINDING_STYLE: Record<FindingKind, { icon: LucideIcon; tone: string }> = {
  praga: { icon: Bug, tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  doenca: { icon: Microscope, tone: "bg-danger/10 text-danger" },
  daninha: { icon: Sprout, tone: "bg-brand-soft text-brand" },
  outro: { icon: CircleHelp, tone: "bg-border/60 text-muted" },
};

function Visit() {
  const id = useSearchParams().get("id") ?? "";
  const router = useRouter();
  const [feedback, setFeedback] = useState("");

  const data = useLiveQuery(async () => {
    const visit = await db.visits.get(id);
    if (!visit || visit.deletedAt) return { visit: null };
    const [farm, plot, seasons, findings, photos, profile] = await Promise.all([
      db.farms.get(visit.farmId),
      db.plots.get(visit.plotId),
      db.seasons.where("plotId").equals(visit.plotId).toArray(),
      db.findings.where("visitId").equals(id).toArray(),
      db.photos.where("visitId").equals(id).toArray(),
      getProfile(),
    ]);
    const client = farm?.clientId ? await db.clients.get(farm.clientId) : undefined;
    const liveSeasons = alive(seasons);
    return {
      visit,
      farm,
      plot,
      client: client && !client.deletedAt ? client : undefined,
      // Visitas anteriores ao perfil não têm autor gravado: assina quem usa o aparelho hoje.
      author: visit.author ?? authorFromProfile(profile),
      // Visitas de backups antigos não têm safra: usa a vigente.
      season: liveSeasons.find((s) => s.id === visit.seasonId) ?? latestSeason(liveSeasons),
      findings: alive(findings).sort((a, b) => a.createdAt - b.createdAt),
      photos: alive(photos).sort((a, b) => a.takenAt - b.takenAt),
    };
  }, [id]);

  if (!data) return <PageSkeleton />;
  if (!data.visit) {
    return (
      <Empty
        title="Visita não encontrada"
        text="Ela pode ter sido removida deste aparelho."
        action={<LinkButton href="/">Voltar ao início</LinkButton>}
      />
    );
  }

  const { visit, farm, plot, client, author, season, findings, photos } = data;
  const dap = season?.plantingDate
    ? daysSince(season.plantingDate, new Date(`${visit.date}T12:00:00`).getTime())
    : null;
  const report = visitReportText({ visit, farm, plot, client, season, findings, dap, author });
  const kindInfo = visitKindInfo(visit.kind);
  const stand = cleanStand(visit.stand);
  const standSummary = summarizeStand(stand);
  const unit = standUnit(visit.kind);
  const signature = signatureLines(author);
  // Com o telefone do cliente, o relatório vai direto para a conversa com ele.
  const wa = client ? whatsappLink(client.phone) : null;

  async function share() {
    const text = report;
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setFeedback("Resumo copiado. Cole no WhatsApp.");
    } catch {
      setFeedback("Não foi possível compartilhar.");
    }
  }

  async function toggleFollowUp() {
    await setFollowUpDone(id, !visit.followUpDone);
  }

  async function remove() {
    if (!window.confirm("Excluir esta visita?")) return;
    const at = await removeVisit(id);
    toast("Visita excluída.", { undo: () => restoreRemoved(at) });
    router.push("/");
  }

  return (
    <>
      <div className="no-print">
        <Link href={farm ? `/fazenda?id=${farm.id}` : "/"} className="text-sm text-brand">
          ← {farm?.name ?? "Início"}
        </Link>
      </div>

      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0f2b1c] via-[#14532f] to-[#1c6b41] p-5 text-white shadow-lg shadow-[#1c6b41]/20 sm:p-6 print:bg-none print:p-0 print:text-black print:shadow-none">
        <ClipboardList aria-hidden className="pointer-events-none absolute -bottom-8 -right-6 size-40 text-white/[0.06] print:hidden" />
        <p className="text-xs font-semibold uppercase tracking-wider text-white/60 print:text-muted">
          {["Relatório de visita", visit.kind && visit.kind !== "monitoramento" ? kindInfo.label : null, formatDate(visit.date)]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{plotLabel(plot?.name)}</h1>
        <p className="mt-0.5 text-white/75 print:text-muted">
          {[farm?.name ?? "Fazenda", client?.name || farm?.owner, farm?.municipality].filter(Boolean).join(" · ")}
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-2">
          {[
            ["Estágio", visit.stage || "—"],
            ["Dias após plantio", dap !== null ? String(dap) : "—"],
            ["Cultivar", season?.cultivar || "—"],
            ["Safra", season?.label ?? "—"],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0 rounded-xl bg-white/10 px-3 py-2 ring-1 ring-white/10 print:bg-transparent print:ring-border">
              <dt className="truncate text-[11px] font-medium uppercase tracking-wider text-white/60 print:text-muted">{label}</dt>
              <dd className="truncate font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </header>

      {wa && client ? (
        <a
          href={`${wa}?text=${encodeURIComponent(report)}`}
          target="_blank"
          rel="noreferrer"
          className="no-print inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-strong active:scale-[0.98]"
        >
          <MessageCircle aria-hidden className="size-5 shrink-0" />
          <span className="truncate">Enviar para {client.name} no WhatsApp</span>
        </a>
      ) : null}
      <div className="no-print grid grid-cols-3 gap-2">
        <Button variant={wa ? "secondary" : "primary"} onClick={share}>
          Compartilhar
        </Button>
        <Button variant="secondary" onClick={() => window.print()}>
          PDF
        </Button>
        <LinkButton href={`/visitas/editar?id=${visit.id}`} variant="secondary">
          Editar
        </LinkButton>
      </div>
      {feedback ? (
        <p role="status" className="no-print text-sm text-brand">
          {feedback}
        </p>
      ) : null}

      {stand && standSummary ? (
        <section className="space-y-3">
          <SectionTitle>{visit.kind === "plantio" ? "Sementes no sulco" : "Estande"}</SectionTitle>
          <Card className="space-y-3">
            <dl className="grid grid-cols-3 gap-2">
              {[
                [`${unit}/m`, formatNumberBR(standSummary.perMeter, 1)],
                [`${unit}/ha`, standSummary.perHa != null ? formatNumberBR(standSummary.perHa, 0) : "—"],
                ["Do planejado", standSummary.pctOfTarget != null ? `${formatNumberBR(standSummary.pctOfTarget, 0)}%` : "—"],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0 rounded-xl bg-brand-soft px-3 py-2">
                  <dt className="truncate text-xs text-muted">{label}</dt>
                  <dd className="truncate text-lg font-semibold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="text-sm text-muted">{standReportLines(stand, visit.kind)[1]}</p>
            <ol className="flex flex-wrap gap-1.5 text-xs">
              {stand.points.map((p, i) => (
                <li key={i} className="rounded-full bg-border/50 px-2.5 py-1 tabular-nums">
                  {i + 1}: {formatNumberBR(p.plants, 0)} em {formatNumberBR(p.meters, 2)} m
                </li>
              ))}
            </ol>
          </Card>
        </section>
      ) : null}

      {kindInfo.findings || findings.length > 0 ? (
        <section className="space-y-3">
          <SectionTitle>Achados</SectionTitle>
          {findings.length === 0 ? (
            <Card>
              <p className="text-sm text-muted">Nenhum achado registrado.</p>
            </Card>
          ) : (
            <Card className="divide-y divide-border p-0">
              {findings.map((f) => {
                const k = FINDING_STYLE[f.kind];
                return (
                  <div key={f.id} className="flex items-start gap-3 p-4">
                    <span aria-hidden className={`grid size-10 shrink-0 place-items-center rounded-xl ${k.tone}`}>
                      <k.icon className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{f.name}</p>
                      <p className="mt-0.5 text-sm text-muted">
                        {KIND_LABEL[f.kind]}
                        {f.note ? ` · ${f.note}` : ""}
                      </p>
                      {f.amount ? (
                        <p className="mt-1.5">
                          <Chip tone="muted">{f.amount}</Chip>
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </Card>
          )}
        </section>
      ) : null}

      {photos.length > 0 ? (
        <section className="space-y-3">
          <SectionTitle>Fotos</SectionTitle>
          <PhotoGallery photos={photos} />
        </section>
      ) : null}

      {visit.observations ? (
        <section className="space-y-2">
          <SectionTitle>Observações</SectionTitle>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{visit.observations}</p>
        </section>
      ) : null}

      {visit.recommendation ? (
        <section className="space-y-2">
          <SectionTitle>Recomendação</SectionTitle>
          <Card className="bg-brand-soft">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{visit.recommendation}</p>
          </Card>
        </section>
      ) : null}

      {visit.followUpDate ? (
        <section className="space-y-2">
          <SectionTitle>Retorno</SectionTitle>
          <Card className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium">{formatDate(visit.followUpDate)}</p>
              <Chip tone={visit.followUpDone ? "brand" : "warn"}>{visit.followUpDone ? "Feito" : "Pendente"}</Chip>
            </div>
            <Button variant="secondary" className="no-print" onClick={toggleFollowUp}>
              {visit.followUpDone ? "Reabrir" : "Marcar como feito"}
            </Button>
          </Card>
        </section>
      ) : null}

      {signature.length ? (
        <section className="space-y-2">
          <SectionTitle>Responsável pela visita</SectionTitle>
          <Card className="print:border-0 print:p-0">
            {signature.map((line, i) => (
              <p key={line} className={i === 0 ? "font-semibold" : "text-sm text-muted"}>
                {line}
              </p>
            ))}
          </Card>
        </section>
      ) : (
        <Card className="no-print flex flex-wrap items-center justify-between gap-3 border-dashed">
          <p className="min-w-48 flex-1 text-sm text-muted">Preencha o seu perfil para o relatório sair com o seu nome e registro.</p>
          <LinkButton href="/perfil" variant="secondary">
            Meu perfil
          </LinkButton>
        </Card>
      )}

      <div className="no-print pt-2">
        <Button variant="danger" className="w-full" onClick={remove}>
          Excluir visita
        </Button>
      </div>
    </>
  );
}
