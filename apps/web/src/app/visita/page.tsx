"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Button, Card, Chip, Empty, LinkButton, SectionTitle } from "@/components/ui";
import { KIND_LABEL } from "@/lib/catalog";
import { alive, db, removeVisit, setFollowUpDone } from "@/lib/db";
import { formatDate } from "@/lib/format";

function PhotoImg({ blob, alt }: { blob: Blob; alt: string }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let active = true;
    const u = URL.createObjectURL(blob);
    // setState fora do corpo síncrono do efeito; também funciona no modo estrito do React.
    Promise.resolve().then(() => {
      if (active) setUrl(u);
    });
    return () => {
      active = false;
      URL.revokeObjectURL(u);
    };
  }, [blob]);
  if (!url) return <div className="aspect-square rounded-xl bg-border/50" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className="aspect-square w-full rounded-xl object-cover" />;
}

export default function VisitPage() {
  return (
    <Suspense fallback={null}>
      <Visit />
    </Suspense>
  );
}

function Visit() {
  const id = useSearchParams().get("id") ?? "";
  const router = useRouter();
  const [feedback, setFeedback] = useState("");

  const data = useLiveQuery(async () => {
    const visit = await db.visits.get(id);
    if (!visit || visit.deletedAt) return { visit: null };
    const [farm, plot, seasons, findings, photos] = await Promise.all([
      db.farms.get(visit.farmId),
      db.plots.get(visit.plotId),
      db.seasons.where("plotId").equals(visit.plotId).toArray(),
      db.findings.where("visitId").equals(id).toArray(),
      db.photos.where("visitId").equals(id).toArray(),
    ]);
    return {
      visit,
      farm,
      plot,
      season: alive(seasons).sort((a, b) => b.createdAt - a.createdAt)[0],
      findings: alive(findings).sort((a, b) => a.createdAt - b.createdAt),
      photos: alive(photos).sort((a, b) => a.takenAt - b.takenAt),
    };
  }, [id]);

  if (!data) return null;
  if (!data.visit) {
    return (
      <Empty
        title="Visita não encontrada"
        text="Ela pode ter sido removida deste aparelho."
        action={<LinkButton href="/">Voltar ao início</LinkButton>}
      />
    );
  }

  const { visit, farm, plot, season, findings, photos } = data;

  function summary(): string {
    const lines = [
      `*Relatório de visita — ${farm?.name ?? "Fazenda"} · ${plot?.name ?? "Talhão"}*`,
      `Data: ${formatDate(visit.date)} · Estágio: ${visit.stage}`,
    ];
    if (season?.cultivar) lines.push(`Cultivar: ${season.cultivar} (safra ${season.label})`);
    if (findings.length) {
      lines.push("", "*Achados*");
      findings.forEach((f) =>
        lines.push(`- ${KIND_LABEL[f.kind]}: ${f.name}${f.amount ? ` — ${f.amount}` : ""}${f.note ? ` (${f.note})` : ""}`),
      );
    }
    if (visit.observations) lines.push("", "*Observações*", visit.observations);
    if (visit.recommendation) lines.push("", "*Recomendação*", visit.recommendation);
    if (visit.followUpDate) lines.push("", `Retorno combinado: ${formatDate(visit.followUpDate)}`);
    return lines.join("\n");
  }

  async function share() {
    const text = summary();
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
    await removeVisit(id);
    router.push("/");
  }

  return (
    <>
      <div className="no-print">
        <Link href={farm ? `/fazenda?id=${farm.id}` : "/"} className="text-sm text-brand">
          ← {farm?.name ?? "Início"}
        </Link>
      </div>

      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Relatório de visita</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {farm?.name ?? "Fazenda"} <span className="text-muted">· {plot?.name ?? "Talhão"}</span>
        </h1>
        <p className="text-sm text-muted">
          {formatDate(visit.date)} · Estágio {visit.stage}
          {season?.cultivar ? ` · ${season.cultivar}` : ""}
          {season ? ` · safra ${season.label}` : ""}
        </p>
      </header>

      <div className="no-print grid grid-cols-2 gap-3">
        <Button onClick={share}>Compartilhar</Button>
        <Button variant="secondary" onClick={() => window.print()}>
          Imprimir / PDF
        </Button>
      </div>
      {feedback ? (
        <p role="status" className="no-print text-sm text-brand">
          {feedback}
        </p>
      ) : null}

      <section className="space-y-3">
        <SectionTitle>Achados</SectionTitle>
        {findings.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">Nenhum achado registrado.</p>
          </Card>
        ) : (
          <Card className="divide-y divide-border p-0">
            {findings.map((f) => (
              <div key={f.id} className="flex items-start justify-between gap-3 p-4">
                <div>
                  <p className="font-medium">{f.name}</p>
                  {f.note ? <p className="mt-0.5 text-sm text-muted">{f.note}</p> : null}
                </div>
                <div className="text-right">
                  <Chip tone="muted">{KIND_LABEL[f.kind]}</Chip>
                  {f.amount ? <p className="mt-1 text-sm">{f.amount}</p> : null}
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>

      {photos.length > 0 ? (
        <section className="space-y-3">
          <SectionTitle>Fotos</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            {photos.map((p) => (
              <figure key={p.id} className="space-y-1.5">
                <PhotoImg blob={p.blob} alt={p.label || "Foto da visita"} />
                <figcaption className="text-xs text-muted">{p.label || "Diagnóstico não definido"}</figcaption>
              </figure>
            ))}
          </div>
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

      <div className="no-print pt-2">
        <Button variant="danger" className="w-full" onClick={remove}>
          Excluir visita
        </Button>
      </div>
    </>
  );
}
