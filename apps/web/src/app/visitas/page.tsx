"use client";

import Link from "next/link";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Bug, Leaf, Plus, Sprout, Microscope } from "lucide-react";
import { VisitRow } from "@/components/visit-row";
import { Card, Chip, Empty, LinkButton, PageTitle } from "@/components/ui";
import { KIND_LABEL } from "@/lib/catalog";
import { alive, db, type FindingKind } from "@/lib/db";
import { formatDate } from "@/lib/format";

const KIND_ICON: Record<FindingKind, typeof Bug> = { praga: Bug, doenca: Microscope, daninha: Sprout, outro: Leaf };
const KIND_TONE: Record<FindingKind, string> = {
  praga: "bg-warn/10 text-warn",
  doenca: "bg-danger/10 text-danger",
  daninha: "bg-brand-soft text-brand",
  outro: "bg-border/60 text-muted",
};

type Tab = "ocorrencias" | "visitas";

export default function MonitoringPage() {
  const [tab, setTab] = useState<Tab>("ocorrencias");
  const [kind, setKind] = useState<FindingKind | "todas">("todas");

  const data = useLiveQuery(async () => {
    const [visits, findings, farms, plots] = await Promise.all([
      db.visits.orderBy("date").reverse().toArray(),
      db.findings.toArray(),
      db.farms.toArray(),
      db.plots.toArray(),
    ]);
    return { visits: alive(visits), findings: alive(findings), farms: alive(farms), plots: alive(plots) };
  });

  if (!data) return null;
  const farmName = new Map(data.farms.map((f) => [f.id, f.name]));
  const plotName = new Map(data.plots.map((p) => [p.id, p.name]));
  const visits = data.visits.filter((v) => farmName.has(v.farmId) && plotName.has(v.plotId));
  const visitById = new Map(visits.map((v) => [v.id, v]));
  const occurrences = data.findings
    .filter((f) => visitById.has(f.visitId) && (kind === "todas" || f.kind === kind))
    .map((f) => ({ f, v: visitById.get(f.visitId)! }))
    .sort((a, b) => (a.v.date < b.v.date ? 1 : a.v.date > b.v.date ? -1 : 0));

  return (
    <>
      <PageTitle
        title="Monitoramento"
        subtitle="Pragas, doenças e plantas daninhas encontradas nas visitas."
        action={
          <LinkButton href="/visitas/nova" className="shrink-0">
            <Plus className="size-4" /> Visita
          </LinkButton>
        }
      />

      {visits.length === 0 ? (
        <Empty
          title="Nenhuma visita ainda"
          text="Cada visita de monitoramento aparece aqui, com o que foi encontrado em cada talhão."
          action={<LinkButton href="/visitas/nova">Registrar visita</LinkButton>}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-border/40 p-1" role="tablist">
            {(
              [
                ["ocorrencias", "Ocorrências"],
                ["visitas", `Visitas (${visits.length})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={`min-h-10 rounded-lg text-sm font-medium ${tab === key ? "bg-surface shadow-sm" : "text-muted"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "ocorrencias" ? (
            <>
              <div className="flex flex-wrap gap-2">
                {(["todas", "praga", "doenca", "daninha", "outro"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={kind === k}
                    onClick={() => setKind(k)}
                    className={`min-h-9 rounded-full px-3.5 text-sm font-medium ${
                      kind === k ? "bg-brand text-white" : "border border-border bg-surface text-muted"
                    }`}
                  >
                    {k === "todas" ? "Todas" : KIND_LABEL[k]}
                  </button>
                ))}
              </div>
              {occurrences.length === 0 ? (
                <Card>
                  <p className="text-sm text-muted">Nenhuma ocorrência registrada com este filtro.</p>
                </Card>
              ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                  {occurrences.map(({ f, v }) => {
                    const Icon = KIND_ICON[f.kind];
                    return (
                      <Link
                        key={f.id}
                        href={`/visita?id=${v.id}`}
                        className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-3.5 transition hover:border-brand/40"
                      >
                        <span aria-hidden className={`grid size-10 shrink-0 place-items-center rounded-xl ${KIND_TONE[f.kind]}`}>
                          <Icon className="size-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-2">
                            <span className="truncate font-medium">{f.name}</span>
                            <Chip tone="muted">{v.stage}</Chip>
                          </span>
                          <span className="block truncate text-sm text-muted">
                            {farmName.get(v.farmId)} · Talhão {plotName.get(v.plotId)} · {formatDate(v.date)}
                          </span>
                          {f.amount || f.note ? (
                            <span className="mt-1 block text-sm">{[f.amount, f.note].filter(Boolean).join(" — ")}</span>
                          ) : null}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {visits.map((v) => (
                <VisitRow
                  key={v.id}
                  visit={v}
                  farmName={farmName.get(v.farmId) ?? "Fazenda"}
                  plotName={plotName.get(v.plotId) ?? "Talhão"}
                />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
