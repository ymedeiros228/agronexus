"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Empty, LinkButton, PageSkeleton } from "@/components/ui";
import { VisitForm } from "@/components/visit-form";
import { alive, db } from "@/lib/db";

function EditVisit() {
  const id = useSearchParams().get("id") ?? "";

  const data = useLiveQuery(async () => {
    const visit = await db.visits.get(id);
    if (!visit || visit.deletedAt) return { visit: null };
    const [findings, photos] = await Promise.all([
      db.findings.where("visitId").equals(id).toArray(),
      db.photos.where("visitId").equals(id).toArray(),
    ]);
    return {
      visit,
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

  const { visit, findings, photos } = data;
  return (
    <VisitForm
      // Carrega os valores salvos uma vez; mudanças de fora não sobrescrevem o que está sendo digitado.
      key={visit.id}
      visitId={visit.id}
      seasonId={visit.seasonId ?? null}
      initial={{
        farmId: visit.farmId,
        plotId: visit.plotId,
        date: visit.date,
        stage: visit.stage,
        observations: visit.observations,
        recommendation: visit.recommendation,
        followUpDate: visit.followUpDate,
        findings: findings.map((f) => ({ id: f.id, kind: f.kind, name: f.name, amount: f.amount, note: f.note })),
        photos: photos.map((p) => ({
          id: p.id,
          blob: p.blob,
          label: p.label,
          takenAt: p.takenAt,
          lat: p.lat,
          lng: p.lng,
        })),
      }}
    />
  );
}

export default function EditVisitPage() {
  return (
    <Suspense fallback={null}>
      <EditVisit />
    </Suspense>
  );
}
