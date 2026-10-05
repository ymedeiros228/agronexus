"use client";

import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { HandCoins, Receipt } from "lucide-react";
import { Card, Empty, LinkButton, PageTitle, SectionTitle } from "@/components/ui";
import { EXPENSE_NAME, seasonFinance } from "@/lib/finance";
import { formatDate, todayISO } from "@/lib/format";
import { KIND_NAME, formatBRL, formatNumberBR, seasonLabels, seasonStats } from "@/lib/operations";
import { accountWide, farmsOfSeason, forFarm } from "@/lib/report";
import { loadReportInput } from "@/lib/report-data";

function Finance() {
  const router = useRouter();
  const params = useSearchParams();
  const asked = params.get("safra") ?? "";
  const askedFarm = params.get("fazenda") ?? "";
  const data = useLiveQuery(async () => ({ input: await loadReportInput(), today: todayISO() }));
  if (!data) return null;

  const { input: all, today } = data;
  const labels = seasonLabels(all.seasons);
  if (labels.length === 0) {
    return (
      <>
        <PageTitle title="Financeiro" />
        <Empty
          title="Cadastre a safra primeiro"
          text="Vendas e despesas são lançadas por safra. Abra um talhão e cadastre a safra."
          action={<LinkButton href="/fazendas">Ir para fazendas e talhões</LinkButton>}
        />
      </>
    );
  }

  const label = labels.includes(asked) ? asked : labels[0];
  const farmOptions = farmsOfSeason(all, label);
  const farmId = farmOptions.length > 1 && farmOptions.some((f) => f.id === askedFarm) ? askedFarm : "";
  const farmName = new Map(all.farms.map((f) => [f.id, f.name]));
  const input = farmId ? forFarm(all, farmId) : all;
  const outside = farmId ? accountWide(all, label) : null;
  const go = (l: string, f: string) => router.replace(`/financeiro?safra=${encodeURIComponent(l)}${f ? `&fazenda=${f}` : ""}`);
  const q = `${encodeURIComponent(label)}${farmId ? `&fazenda=${farmId}` : ""}`;
  const stats = seasonStats(label, input.seasons, input.plots, input.operations, today);
  const f = seasonFinance(label, stats, input.sales, input.expenses);
  const sales = input.sales.filter((s) => s.seasonLabel === label).sort((a, b) => (a.date < b.date ? 1 : -1));
  const expenses = input.expenses.filter((e) => e.seasonLabel === label).sort((a, b) => (a.date < b.date ? 1 : -1));
  const composition = [
    ...stats.costByKind.map((k) => ({ key: `op-${k.kind}`, label: KIND_NAME[k.kind], amount: k.cost, group: "Operação" })),
    ...f.expensesByCategory.map((e) => ({ key: `ex-${e.category}`, label: EXPENSE_NAME[e.category], amount: e.amount, group: "Despesa" })),
  ].sort((a, b) => b.amount - a.amount);

  return (
    <>
      <PageTitle
        title="Financeiro"
        subtitle="Vendas, despesas e margem da safra."
        action={
          <label className="shrink-0">
            <span className="sr-only">Safra</span>
            <select
              value={label}
              onChange={(e) => go(e.target.value, farmId)}
              className="min-h-10 rounded-xl border border-border bg-surface px-3 text-sm font-medium"
            >
              {labels.map((l) => (
                <option key={l} value={l}>
                  Safra {l}
                </option>
              ))}
            </select>
          </label>
        }
      />

      {farmOptions.length > 1 ? (
        <label className="block sm:max-w-sm">
          <span className="sr-only">Fazenda</span>
          <select
            value={farmId}
            onChange={(e) => go(label, e.target.value)}
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

      {outside && (outside.sales > 0 || outside.expenses > 0) ? (
        <p className="rounded-xl bg-accent/10 px-3 py-2 text-sm">
          Não entram nesta fazenda os lançamentos da conta toda:
          {outside.expenses > 0 ? ` ${formatBRL(outside.expensesCost)} em despesas` : ""}
          {outside.expenses > 0 && outside.sales > 0 ? " e" : ""}
          {outside.sales > 0 ? ` ${formatBRL(outside.revenue)} em vendas` : ""}.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Receita"
          value={f.soldBags > 0 ? formatBRL(f.revenue) : "—"}
          sub={
            f.avgPrice != null
              ? `${formatNumberBR(f.soldBags, 0)} sc a ${formatBRL(f.avgPrice, 2)}/sc`
              : "Lance as vendas da safra"
          }
        />
        <Stat
          label="Custo total"
          value={f.totalCost > 0 ? formatBRL(f.totalCost) : "—"}
          sub={
            f.totalCost > 0
              ? `Operações ${formatBRL(f.operationsCost)} + despesas ${formatBRL(f.expensesCost)}`
              : "Custos das operações e despesas"
          }
        />
        <Stat
          label="Margem"
          value={f.margin != null ? formatBRL(f.margin) : "—"}
          sub={
            f.marginPerHa != null
              ? `${formatBRL(f.marginPerHa)} por hectare${stats.open > 0 ? " · até agora" : ""}`
              : "Aparece com a primeira venda"
          }
          tone={f.margin == null ? undefined : f.margin >= 0 ? "good" : "bad"}
        />
        <Stat
          label="Ponto de equilíbrio"
          value={f.breakEvenYield != null ? `${formatNumberBR(f.breakEvenYield, 1)} sc/ha` : "—"}
          sub={
            f.breakEvenYield != null
              ? stats.yieldPerHa != null
                ? `Para pagar o custo. Colhido: ${formatNumberBR(stats.yieldPerHa, 1)} sc/ha`
                : "Para pagar o custo, ao preço médio de venda"
              : "Precisa de custo e de venda"
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <SectionTitle>Vendas ({sales.length})</SectionTitle>
              <LinkButton href={`/financeiro/venda?safra=${q}`} className="min-h-9 px-3">
                <HandCoins className="size-4" /> Registrar venda
              </LinkButton>
            </div>
            {sales.length === 0 ? (
              <Card>
                <p className="text-sm text-muted">Nenhuma venda lançada nesta safra.</p>
              </Card>
            ) : (
              <Card className="divide-y divide-border p-0">
                {sales.map((s) => (
                  <Row
                    key={s.id}
                    href={`/financeiro/venda?id=${s.id}${farmId ? `&fazenda=${farmId}` : ""}`}
                    title={`${formatNumberBR(s.bags, 0)} sc × ${formatBRL(s.pricePerBag, 2)}`}
                    sub={[formatDate(s.date), !farmId && s.farmId ? farmName.get(s.farmId) : "", s.buyer, s.note]
                      .filter(Boolean)
                      .join(" · ")}
                    amount={formatBRL(s.bags * s.pricePerBag)}
                  />
                ))}
              </Card>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <SectionTitle>Despesas gerais ({expenses.length})</SectionTitle>
              <LinkButton href={`/financeiro/despesa?safra=${q}`} variant="secondary" className="min-h-9 px-3">
                <Receipt className="size-4" /> Lançar despesa
              </LinkButton>
            </div>
            <p className="text-xs text-muted">
              Custos que não são de uma operação: arrendamento, salários, manutenção, juros… Os das operações entram sozinhos.
            </p>
            {expenses.length === 0 ? (
              <Card>
                <p className="text-sm text-muted">Nenhuma despesa geral lançada nesta safra.</p>
              </Card>
            ) : (
              <Card className="divide-y divide-border p-0">
                {expenses.map((e) => (
                  <Row
                    key={e.id}
                    href={`/financeiro/despesa?id=${e.id}${farmId ? `&fazenda=${farmId}` : ""}`}
                    title={EXPENSE_NAME[e.category]}
                    sub={[formatDate(e.date), !farmId && e.farmId ? farmName.get(e.farmId) : "", e.description]
                      .filter(Boolean)
                      .join(" · ")}
                    amount={formatBRL(e.amount)}
                  />
                ))}
              </Card>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section className="space-y-3">
            <SectionTitle>Grão da safra</SectionTitle>
            <Card className="space-y-2 text-sm">
              <Line label="Produzido (colheitas)">{f.producedBags > 0 ? `${formatNumberBR(f.producedBags, 0)} sc` : "—"}</Line>
              <Line label="Vendido">{f.soldBags > 0 ? `${formatNumberBR(f.soldBags, 0)} sc` : "—"}</Line>
              <Line label="A vender">
                {f.unsoldBags != null ? (
                  <span className={f.unsoldBags < 0 ? "text-danger" : ""}>{formatNumberBR(f.unsoldBags, 0)} sc</span>
                ) : (
                  "—"
                )}
              </Line>
              {f.unsoldBags != null && f.unsoldBags < 0 ? (
                <p className="text-xs text-danger">Vendeu mais do que colheu: falta registrar colheita ou é venda antecipada.</p>
              ) : null}
              {f.breakEvenPrice != null ? (
                <p className="border-t border-border pt-2 text-xs text-muted">
                  Com {formatNumberBR(stats.yieldPerHa, 1)} sc/ha, o custo se paga vendendo a partir de{" "}
                  <span className="font-semibold text-foreground">{formatBRL(f.breakEvenPrice, 2)}/sc</span>.
                </p>
              ) : null}
            </Card>
          </section>

          {composition.length ? (
            <section className="space-y-3">
              <SectionTitle>Composição do custo</SectionTitle>
              <Card className="space-y-3">
                {composition.map((c) => (
                  <div key={c.key} className="space-y-1">
                    <div className="flex justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate">
                        {c.label} <span className="text-xs text-muted">· {c.group}</span>
                      </span>
                      <span className="shrink-0 text-muted">{Math.round((c.amount / f.totalCost) * 100)}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-border/60">
                      <div
                        className={`h-full rounded-full ${c.group === "Operação" ? "bg-brand" : "bg-accent"}`}
                        style={{ width: `${(c.amount / f.totalCost) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
                {stats.plannedCost > 0 ? (
                  <p className="text-xs text-muted">Fora da conta: {formatBRL(stats.plannedCost)} em operações planejadas.</p>
                ) : null}
              </Card>
            </section>
          ) : null}

          <Link href={`/safra?rotulo=${q}`} className="block text-sm font-medium text-brand">
            Relatório completo da safra {label} ›
          </Link>
        </aside>
      </div>
    </>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "good" | "bad" }) {
  return (
    <Card className="p-3.5 sm:p-4">
      <span className="block text-xs text-muted">{label}</span>
      <span
        className={`block text-xl font-semibold tracking-tight sm:text-2xl ${
          tone === "good" ? "text-brand-strong" : tone === "bad" ? "text-danger" : ""
        }`}
      >
        {value}
      </span>
      <span className="block text-xs text-muted">{sub}</span>
    </Card>
  );
}

function Row({ href, title, sub, amount }: { href: string; title: string; sub: string; amount: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 p-3.5 active:bg-brand-soft">
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        {sub ? <span className="block truncate text-sm text-muted">{sub}</span> : null}
      </span>
      <span className="shrink-0 font-semibold tabular-nums">{amount}</span>
    </Link>
  );
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p className="flex justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="font-medium">{children}</span>
    </p>
  );
}

export default function FinancePage() {
  return (
    <Suspense fallback={null}>
      <Finance />
    </Suspense>
  );
}
