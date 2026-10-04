"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus } from "lucide-react";
import { OperationRow } from "@/components/operation-row";
import { Card, Empty, LinkButton, PageTitle, SectionTitle } from "@/components/ui";
import { alive, db, type Operation } from "@/lib/db";
import { todayISO } from "@/lib/format";
import { isLate } from "@/lib/operations";

type Filter = "abertas" | "concluidas" | "todas";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "abertas", label: "Abertas" },
  { key: "concluidas", label: "Concluídas" },
  { key: "todas", label: "Todas" },
];

function Operations() {
  const highlight = useSearchParams().get("destaque");
  const [filter, setFilter] = useState<Filter>("todas");

  const data = useLiveQuery(async () => {
    const [ops, farms, plots] = await Promise.all([db.operations.toArray(), db.farms.toArray(), db.plots.toArray()]);
    return { ops: alive(ops), farms: alive(farms), plots: alive(plots), today: todayISO() };
  });

  if (!data) return null;
  const { today } = data;
  const farmName = new Map(data.farms.map((f) => [f.id, f.name]));
  const plotName = new Map(data.plots.map((p) => [p.id, p.name]));
  // Esconde operações de fazenda ou talhão removidos.
  const ops = data.ops.filter((o) => farmName.has(o.farmId) && plotName.has(o.plotId));

  const late = ops.filter((o) => isLate(o, today)).sort((a, b) => (a.date < b.date ? -1 : 1));
  const open = ops
    .filter((o) => o.status !== "concluida" && !isLate(o, today))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const done = ops
    .filter((o) => o.status === "concluida")
    .sort((a, b) => ((b.doneDate ?? b.date) < (a.doneDate ?? a.date) ? -1 : 1));

  const groups: { title: string; list: Operation[] }[] = [
    ...(filter !== "concluidas" ? [{ title: "Atrasadas", list: late }, { title: "Planejadas e em andamento", list: open }] : []),
    ...(filter !== "abertas" ? [{ title: "Concluídas", list: done }] : []),
  ].filter((g) => g.list.length > 0);

  return (
    <>
      <PageTitle
        title="Operações"
        subtitle="Preparo, plantio, adubação, aplicação e colheita de cada talhão."
        action={
          <LinkButton href="/operacoes/nova" className="shrink-0">
            <Plus className="size-4" /> Operação
          </LinkButton>
        }
      />

      {ops.length === 0 ? (
        <Empty
          title="Nenhuma operação ainda"
          text="Registre o que foi feito nos talhões. Com área, custo e colheita, o painel mostra custo por hectare e produtividade."
          action={<LinkButton href="/operacoes/nova">Registrar operação</LinkButton>}
        />
      ) : (
        <>
          <div className="flex gap-2" role="tablist" aria-label="Filtrar operações">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                role="tab"
                aria-selected={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={`min-h-9 rounded-full px-4 text-sm font-medium transition ${
                  filter === f.key ? "bg-brand text-white" : "border border-border bg-surface text-muted"
                }`}
              >
                {f.label}
                {f.key === "abertas" && late.length + open.length > 0 ? ` (${late.length + open.length})` : ""}
              </button>
            ))}
          </div>

          {groups.length === 0 ? (
            <Card>
              <p className="text-sm text-muted">Nada aqui com este filtro.</p>
            </Card>
          ) : (
            groups.map((g) => (
              <section key={g.title} className="space-y-3">
                <SectionTitle>
                  {g.title} ({g.list.length})
                </SectionTitle>
                <div className="grid gap-3 lg:grid-cols-2">
                  {g.list.map((o) => (
                    <OperationRow
                      key={o.id}
                      op={o}
                      today={today}
                      farmName={farmName.get(o.farmId) ?? "Fazenda"}
                      plotName={plotName.get(o.plotId) ?? "?"}
                      highlight={o.id === highlight}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </>
      )}
    </>
  );
}

export default function OperationsPage() {
  return (
    <Suspense fallback={null}>
      <Operations />
    </Suspense>
  );
}
