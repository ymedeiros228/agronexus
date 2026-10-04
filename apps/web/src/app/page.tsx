"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { VisitRow } from "@/components/visit-row";
import { Card, Empty, LinkButton, PageTitle, SectionTitle } from "@/components/ui";
import { alive, db } from "@/lib/db";

export default function Home() {
  const data = useLiveQuery(async () => {
    const [farms, plots, visits] = await Promise.all([
      db.farms.toArray(),
      db.plots.toArray(),
      db.visits.orderBy("date").reverse().toArray(),
    ]);
    return { farms: alive(farms), plots: alive(plots), visits: alive(visits) };
  });

  if (!data) return null;

  const farmName = new Map(data.farms.map((f) => [f.id, f.name]));
  const plotName = new Map(data.plots.map((p) => [p.id, p.name]));
  const pending = data.visits
    .filter((v) => v.followUpDate && !v.followUpDone)
    .sort((a, b) => (a.followUpDate! < b.followUpDate! ? -1 : 1));
  const recent = data.visits.slice(0, 8);

  return (
    <>
      <PageTitle title="Início" subtitle="Seu caderno de monitoramento de soja. Funciona sem internet." />

      {data.farms.length === 0 ? (
        <Empty
          title="Comece cadastrando uma fazenda"
          text="Depois adicione os talhões e registre a primeira visita."
          action={<LinkButton href="/fazendas">Cadastrar fazenda</LinkButton>}
        />
      ) : (
        <LinkButton href="/visitas/nova" className="w-full min-h-14 text-base">
          + Nova visita
        </LinkButton>
      )}

      {pending.length > 0 ? (
        <section className="space-y-3">
          <SectionTitle>Retornos pendentes</SectionTitle>
          {pending.map((v) => (
            <VisitRow
              key={v.id}
              visit={v}
              farmName={farmName.get(v.farmId) ?? "Fazenda"}
              plotName={plotName.get(v.plotId) ?? "Talhão"}
              showFollowUp
            />
          ))}
        </section>
      ) : null}

      <section className="space-y-3">
        <SectionTitle>Últimas visitas</SectionTitle>
        {recent.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">Nenhuma visita registrada ainda.</p>
          </Card>
        ) : (
          recent.map((v) => (
            <VisitRow
              key={v.id}
              visit={v}
              farmName={farmName.get(v.farmId) ?? "Fazenda"}
              plotName={plotName.get(v.plotId) ?? "Talhão"}
            />
          ))
        )}
      </section>
    </>
  );
}
