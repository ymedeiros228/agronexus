"use client";

import Link from "next/link";
import { Suspense, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Button, Card, Empty, LinkButton, SectionTitle } from "@/components/ui";
import { KIND_LABEL } from "@/lib/catalog";
import { EXPENSE_NAME } from "@/lib/finance";
import { formatDate, todayISO } from "@/lib/format";
import { KIND_NAME, formatBRL, formatNumberBR, seasonLabels } from "@/lib/operations";
import { accountWide, farmsOfSeason, forFarm, seasonReport, type SeasonReport } from "@/lib/report";
import { loadReportInput } from "@/lib/report-data";
import { CATEGORY_NAME, formatQty } from "@/lib/stock";

const sc = (n: number | null) => (n != null ? `${formatNumberBR(n, 1)} sc/ha` : "—");
const brl = (n: number | null) => (n != null ? formatBRL(n) : "—");
const day = (iso: string | null) => (iso ? formatDate(iso) : "—");

function summaryText(r: SeasonReport, farms: string): string {
  const lines = [
    `AgroNexus · Relatório da safra ${r.label}`,
    farms,
    "",
    `Área: ${formatNumberBR(r.areaHa, 1)} ha (${r.plots.length} ${r.plots.length === 1 ? "talhão" : "talhões"})`,
    r.yieldPerHa != null
      ? `Produtividade: ${sc(r.yieldPerHa)} (${formatNumberBR(r.bags, 0)} sacas em ${formatNumberBR(r.harvestedHa, 1)} ha colhidos)`
      : "Produtividade: colheita ainda não registrada",
    r.finance.totalCost > 0
      ? `Custo realizado: ${formatBRL(r.finance.totalCost)}${r.finance.costPerHa != null ? ` (${formatBRL(r.finance.costPerHa)}/ha)` : ""}`
      : null,
    r.finance.breakEvenPrice != null ? `Custo por saca: ${formatBRL(r.finance.breakEvenPrice, 2)}` : null,
    r.finance.soldBags > 0
      ? `Vendido: ${formatNumberBR(r.finance.soldBags, 0)} sc a ${formatBRL(r.finance.avgPrice!, 2)}/sc (${formatBRL(r.finance.revenue)})`
      : null,
    r.finance.margin != null ? `Margem: ${formatBRL(r.finance.margin)}${r.finance.marginPerHa != null ? ` (${formatBRL(r.finance.marginPerHa)}/ha)` : ""}` : null,
    "",
    "Por talhão:",
    ...r.plots.map(
      (p) =>
        `• ${p.plotName}${p.cultivar ? ` (${p.cultivar})` : ""}: ${sc(p.yieldPerHa)}${p.costPerHa != null ? ` · ${formatBRL(p.costPerHa)}/ha` : ""}`,
    ),
    r.findings.length ? "" : null,
    r.findings.length ? `Ocorrências mais vistas: ${r.findings.slice(0, 3).map((f) => f.name).join(", ")}` : null,
  ];
  return lines.filter((l) => l !== null).join("\n");
}

function Report() {
  const router = useRouter();
  const params = useSearchParams();
  const label = params.get("rotulo") ?? "";
  const askedFarm = params.get("fazenda") ?? "";
  const [feedback, setFeedback] = useState("");
  const data = useLiveQuery(async () => {
    const input = await loadReportInput();
    const today = todayISO();
    return { input, today, labels: seasonLabels(input.seasons) };
  });

  if (!data) return null;
  if (!data.labels.includes(label)) {
    return (
      <Empty
        title="Safra não encontrada"
        text="Escolha uma safra na lista."
        action={<LinkButton href="/safras">Ver safras</LinkButton>}
      />
    );
  }

  const farmOptions = farmsOfSeason(data.input, label);
  // Com uma fazenda só, o relatório é o da conta toda (inclui os lançamentos sem fazenda).
  const farmId = farmOptions.length > 1 && farmOptions.some((f) => f.id === askedFarm) ? askedFarm : "";
  const r = seasonReport(label, farmId ? forFarm(data.input, farmId) : data.input, data.today);
  const outside = farmId ? accountWide(data.input, label) : null;
  const farmNames = [...new Set(r.plots.map((p) => p.farmName))].join(", ");
  const maxKind = Math.max(...r.costByKind.map((k) => k.cost), 1);
  const linkTo = (l: string, f = farmId) =>
    `/safra?rotulo=${encodeURIComponent(l)}${f ? `&fazenda=${encodeURIComponent(f)}` : ""}`;

  async function share() {
    const text = summaryText(r, farmNames);
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setFeedback("Resumo copiado. Cole no WhatsApp.");
    } catch {
      /* compartilhamento cancelado */
    }
  }

  return (
    <>
      <div className="no-print">
        <Link href="/safras" className="text-sm text-brand">
          ← Safras
        </Link>
      </div>

      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Relatório da safra</p>
        <h1 className="text-2xl font-semibold tracking-tight">Safra {r.label}</h1>
        <p className="text-sm text-muted">
          {farmNames || "Sem fazenda"} · gerado em {formatDate(data.today)}
        </p>
      </header>

      {farmOptions.length > 1 ? (
        <label className="no-print block sm:max-w-sm">
          <span className="sr-only">Fazenda</span>
          <select
            value={farmId}
            onChange={(e) => router.replace(linkTo(label, e.target.value))}
            className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm font-medium"
          >
            <option value="">Todas as fazendas ({farmOptions.length})</option>
            {farmOptions.map((f) => (
              <option key={f.id} value={f.id}>
                Só {f.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="no-print grid grid-cols-2 gap-2 sm:max-w-sm">
        <Button onClick={share}>Compartilhar</Button>
        <Button variant="secondary" onClick={() => window.print()}>
          PDF / imprimir
        </Button>
      </div>
      {feedback ? (
        <p role="status" className="no-print rounded-xl bg-brand-soft px-3 py-2 text-sm text-brand-strong">
          {feedback}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Área" value={`${formatNumberBR(r.areaHa, 1)} ha`} sub={`${r.plots.length} ${r.plots.length === 1 ? "talhão" : "talhões"}`} />
        <Stat
          label="Produção"
          value={r.bags > 0 ? `${formatNumberBR(r.bags, 0)} sc` : "—"}
          sub={r.harvestedHa > 0 ? `${formatNumberBR(r.harvestedHa, 1)} ha colhidos` : "Colheita não registrada"}
        />
        <Stat label="Produtividade" value={sc(r.yieldPerHa)} sub="Sacas de 60 kg por hectare colhido" />
        <Stat
          label="Custo realizado"
          value={r.finance.totalCost > 0 ? formatBRL(r.finance.totalCost) : "—"}
          sub={
            r.finance.expensesCost > 0
              ? `Operações ${formatBRL(r.finance.operationsCost)} + despesas ${formatBRL(r.finance.expensesCost)}`
              : r.plannedCost > 0
                ? `Previsto ainda: ${formatBRL(r.plannedCost)}`
                : "Operações concluídas e em andamento"
          }
        />
        <Stat label="Custo por hectare" value={brl(r.finance.costPerHa)} sub="Custo realizado ÷ área" />
        <Stat
          label="Custo por saca"
          value={r.finance.breakEvenPrice != null ? formatBRL(r.finance.breakEvenPrice, 2) : "—"}
          sub="Custo/ha ÷ produtividade"
        />
      </div>

      {r.finance.soldBags > 0 || r.finance.expensesCost > 0 ? (
        <Section title="Financeiro">
          <Card className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
            <Fact label="Receita (vendas)">{r.finance.soldBags > 0 ? formatBRL(r.finance.revenue) : "—"}</Fact>
            <Fact label="Preço médio">{r.finance.avgPrice != null ? `${formatBRL(r.finance.avgPrice, 2)}/sc` : "—"}</Fact>
            <Fact label="Margem" tone={r.finance.margin == null ? undefined : r.finance.margin >= 0 ? "good" : "bad"}>
              {r.finance.margin != null ? formatBRL(r.finance.margin) : "—"}
              {r.finance.marginPerHa != null ? (
                <span className="block text-xs font-normal text-muted">{formatBRL(r.finance.marginPerHa)}/ha</span>
              ) : null}
            </Fact>
            <Fact label="Ponto de equilíbrio">
              {r.finance.breakEvenYield != null ? `${formatNumberBR(r.finance.breakEvenYield, 1)} sc/ha` : "—"}
            </Fact>
            {r.finance.unsoldBags != null ? (
              <Fact label="Grão a vender">{`${formatNumberBR(r.finance.unsoldBags, 0)} sc`}</Fact>
            ) : null}
          </Card>
        </Section>
      ) : null}

      {r.openOps > 0 ? (
        <Card className={`text-sm ${r.lateOps ? "border-danger/40" : ""}`}>
          {r.openOps} {r.openOps === 1 ? "operação ainda aberta" : "operações ainda abertas"}
          {r.lateOps ? `, ${r.lateOps} atrasada${r.lateOps > 1 ? "s" : ""}` : ""}. Os números mudam quando forem concluídas.{" "}
          <Link href="/operacoes" className="no-print font-medium text-brand underline">
            Ver operações
          </Link>
        </Card>
      ) : null}

      <Section title="Por talhão">
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border text-xs text-muted">
              <tr>
                <Th>Talhão</Th>
                <Th>Cultivar</Th>
                <Th>Plantio</Th>
                <Th>Colheita</Th>
                <Th right>Área</Th>
                <Th right>Produtividade</Th>
                <Th right>Custo/ha (operações)</Th>
                <Th right>Visitas</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {r.plots.map((p) => (
                <tr key={p.plotId}>
                  <Td>
                    <Link href={`/talhao?id=${p.plotId}`} className="font-medium text-brand">
                      {p.plotName}
                    </Link>
                    <span className="block text-xs text-muted">{p.farmName}</span>
                  </Td>
                  <Td>{p.cultivar || "—"}</Td>
                  <Td>{day(p.plantingDate)}</Td>
                  <Td>{day(p.harvestDate)}</Td>
                  <Td right>{p.areaHa != null ? `${formatNumberBR(p.areaHa, 1)} ha` : "—"}</Td>
                  <Td right>{sc(p.yieldPerHa)}</Td>
                  <Td right>{brl(p.costPerHa)}</Td>
                  <Td right>{p.visits}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        {r.costByKind.length ? (
          <Section title="Custo realizado por tipo de operação">
            <Card className="space-y-3">
              {r.costByKind.map((k) => (
                <div key={k.kind} className="space-y-1">
                  <div className="flex justify-between gap-2 text-sm">
                    <span>{KIND_NAME[k.kind]}</span>
                    <span className="font-medium">
                      {formatBRL(k.cost)}
                      {r.areaHa > 0 ? <span className="font-normal text-muted"> · {formatBRL(k.cost / r.areaHa)}/ha</span> : null}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-border/60">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${(k.cost / maxKind) * 100}%` }} />
                  </div>
                </div>
              ))}
            </Card>
          </Section>
        ) : null}

        {r.finance.expensesByCategory.length ? (
          <Section title="Despesas gerais">
            <Card className="space-y-2 text-sm">
              {r.finance.expensesByCategory.map((e) => (
                <p key={e.category} className="flex justify-between gap-3">
                  <span>{EXPENSE_NAME[e.category]}</span>
                  <span className="font-medium">
                    {formatBRL(e.amount)}
                    {r.areaHa > 0 ? <span className="font-normal text-muted"> · {formatBRL(e.amount / r.areaHa)}/ha</span> : null}
                  </span>
                </p>
              ))}
            </Card>
          </Section>
        ) : null}

        {r.supplies.length ? (
          <Section title="Insumos usados (operações concluídas)">
            <Card className="divide-y divide-border p-0">
              {r.supplies.map((s) => (
                <div key={s.supplyId} className="flex items-start justify-between gap-3 p-3.5 text-sm">
                  <span className="min-w-0">
                    <span className="block font-medium">{s.name}</span>
                    <span className="block text-xs text-muted">{CATEGORY_NAME[s.category]}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-medium">{formatQty(s.qty, s.unit)}</span>
                    <span className="block text-xs text-muted">
                      {s.perHa != null ? `${formatNumberBR(s.perHa, 3)} ${s.unit}/ha` : ""}
                      {s.estCost != null ? ` · ≈ ${formatBRL(s.estCost)}` : ""}
                    </span>
                  </span>
                </div>
              ))}
            </Card>
          </Section>
        ) : null}

        <Section title={`Fitossanidade (${r.visits} ${r.visits === 1 ? "visita" : "visitas"})`}>
          {r.findings.length ? (
            <Card className="divide-y divide-border p-0">
              {r.findings.map((f) => (
                <div key={f.name} className="flex items-center justify-between gap-3 p-3.5 text-sm">
                  <span className="min-w-0">
                    <span className="block font-medium">{f.name}</span>
                    <span className="block text-xs text-muted">{KIND_LABEL[f.kind]}</span>
                  </span>
                  <span className="shrink-0 text-right text-xs text-muted">
                    em {f.visits} {f.visits === 1 ? "visita" : "visitas"}
                    <span className="block">
                      {f.plots} {f.plots === 1 ? "talhão" : "talhões"}
                    </span>
                  </span>
                </div>
              ))}
            </Card>
          ) : (
            <Card>
              <p className="text-sm text-muted">{r.visits ? "Nenhuma ocorrência anotada nas visitas." : "Nenhuma visita registrada nesta safra."}</p>
            </Card>
          )}
        </Section>

        {r.rain.length ? (
          <Section title="Chuva anotada no ano agrícola">
            <Card className="space-y-2 text-sm">
              {r.rain.map((x) => (
                <p key={x.farmName} className="flex justify-between gap-3">
                  <span>{x.farmName}</span>
                  <span className="font-medium">{formatNumberBR(x.mm, 1)} mm</span>
                </p>
              ))}
              {r.period ? (
                <p className="text-xs text-muted">
                  De {formatDate(r.period.from)} a {formatDate(r.period.to)}, só o que foi anotado no app.
                </p>
              ) : null}
            </Card>
          </Section>
        ) : null}
      </div>

      {r.history.length > 1 ? (
        <Section title="Comparação entre safras">
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="border-b border-border text-xs text-muted">
                <tr>
                  <Th>Safra</Th>
                  <Th right>Área</Th>
                  <Th right>Produtividade</Th>
                  <Th right>Custo/ha</Th>
                  <Th right>Margem/ha</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {r.history.map((h) => (
                  <tr key={h.label} className={h.label === r.label ? "bg-brand-soft/60 font-medium" : ""}>
                    <Td>
                      {h.label === r.label ? (
                        h.label
                      ) : (
                        <Link href={linkTo(h.label)} className="text-brand">
                          {h.label}
                        </Link>
                      )}
                    </Td>
                    <Td right>{h.areaHa ? `${formatNumberBR(h.areaHa, 1)} ha` : "—"}</Td>
                    <Td right>{sc(h.yieldPerHa)}</Td>
                    <Td right>{brl(h.costPerHa)}</Td>
                    <Td right>{brl(h.marginPerHa)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </Section>
      ) : null}

      {outside && (outside.sales > 0 || outside.expenses > 0) ? (
        <Card className="text-sm">
          Fora deste relatório, lançados para a conta toda nesta safra:
          {outside.expenses > 0 ? ` ${formatBRL(outside.expensesCost)} em despesas gerais` : ""}
          {outside.expenses > 0 && outside.sales > 0 ? " e" : ""}
          {outside.sales > 0 ? ` ${formatBRL(outside.revenue)} em vendas` : ""}. Para entrarem aqui, edite o lançamento e
          escolha a fazenda.
        </Card>
      ) : null}

      <p className="text-xs text-muted">
        Calculado só com o que foi registrado no AgroNexus. Custo realizado = operações concluídas ou em andamento +
        despesas gerais. Custo dos insumos é estimado pelo preço médio das entradas. Margem = vendas lançadas − custo
        realizado.
      </p>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 break-inside-avoid">
      <SectionTitle>{title}</SectionTitle>
      {children}
    </section>
  );
}

function Fact({ label, children, tone }: { label: string; children: ReactNode; tone?: "good" | "bad" }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className={`font-semibold ${tone === "good" ? "text-brand-strong" : tone === "bad" ? "text-danger" : ""}`}>{children}</p>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card className="p-3.5 sm:p-4">
      <span className="block text-xs text-muted">{label}</span>
      <span className="block text-xl font-semibold tracking-tight">{value}</span>
      <span className="block text-xs text-muted">{sub}</span>
    </Card>
  );
}

function Th({ children, right = false }: { children: ReactNode; right?: boolean }) {
  return <th className={`px-3.5 py-2.5 font-medium ${right ? "text-right" : ""}`}>{children}</th>;
}

function Td({ children, right = false }: { children: ReactNode; right?: boolean }) {
  return <td className={`px-3.5 py-2.5 align-top ${right ? "whitespace-nowrap text-right tabular-nums" : ""}`}>{children}</td>;
}

export default function SeasonReportPage() {
  return (
    <Suspense fallback={null}>
      <Report />
    </Suspense>
  );
}
