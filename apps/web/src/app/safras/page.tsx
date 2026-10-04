"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { FileText } from "lucide-react";
import { Card, Empty, LinkButton, PageTitle } from "@/components/ui";
import { todayISO } from "@/lib/format";
import { formatBRL, formatNumberBR, seasonLabels, seasonStats } from "@/lib/operations";
import { seasonFinance } from "@/lib/finance";
import { loadReportInput } from "@/lib/report-data";
import { latestSeason } from "@/lib/season";

export default function SeasonsPage() {
  const data = useLiveQuery(async () => ({ input: await loadReportInput(), today: todayISO() }));
  if (!data) return null;

  const { input, today } = data;
  const labels = seasonLabels(input.seasons);
  const current = new Set(
    input.plots.map((p) => latestSeason(input.seasons.filter((s) => s.plotId === p.id))?.label).filter(Boolean),
  );

  if (labels.length === 0) {
    return (
      <>
        <PageTitle title="Safras" />
        <Empty
          title="Nenhuma safra cadastrada"
          text="Abra um talhão e cadastre a safra (cultivar e data de plantio). As operações e visitas entram nela."
          action={<LinkButton href="/fazendas">Ir para fazendas e talhões</LinkButton>}
        />
      </>
    );
  }

  return (
    <>
      <PageTitle title="Safras" subtitle="Resumo de cada safra e relatório para imprimir ou mandar." />
      <ul className="grid gap-3 lg:grid-cols-2">
        {labels.map((label) => {
          const s = seasonStats(label, input.seasons, input.plots, input.operations, today);
          const money = seasonFinance(label, s, input.sales, input.expenses);
          const harvestPct = s.areaHa > 0 ? Math.min(100, (s.harvestedHa / s.areaHa) * 100) : 0;
          return (
            <li key={label}>
              <Link href={`/safra?rotulo=${encodeURIComponent(label)}`} className="block h-full active:scale-[0.99]">
                <Card className="h-full space-y-3 transition hover:border-brand/40">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold">Safra {label}</p>
                      <p className="text-sm text-muted">
                        {s.plots} {s.plots === 1 ? "talhão" : "talhões"}
                        {s.areaHa ? ` · ${formatNumberBR(s.areaHa, 1)} ha` : ""}
                        {current.has(label) ? " · em andamento" : ""}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-brand">
                      <FileText className="size-4" /> Relatório
                    </span>
                  </div>
                  <dl className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <dt className="text-xs text-muted">Produtividade</dt>
                      <dd className="font-semibold">{s.yieldPerHa != null ? `${formatNumberBR(s.yieldPerHa, 1)} sc/ha` : "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Custo/ha</dt>
                      <dd className="font-semibold">{money.costPerHa != null ? formatBRL(money.costPerHa) : "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">{money.marginPerHa != null ? "Margem/ha" : "Abertas"}</dt>
                      {money.marginPerHa != null ? (
                        <dd className={`font-semibold ${money.marginPerHa < 0 ? "text-danger" : "text-brand-strong"}`}>
                          {formatBRL(money.marginPerHa)}
                        </dd>
                      ) : (
                        <dd className={`font-semibold ${s.late ? "text-danger" : ""}`}>
                          {s.open}
                          {s.late ? ` (${s.late} atras.)` : ""}
                        </dd>
                      )}
                    </div>
                  </dl>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted">
                      <span>Colheita</span>
                      <span>
                        {s.areaHa > 0
                          ? `${formatNumberBR(s.harvestedHa, 1)} de ${formatNumberBR(s.areaHa, 1)} ha`
                          : "Informe a área dos talhões"}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-border/60">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${harvestPct}%` }} />
                    </div>
                  </div>
                </Card>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
