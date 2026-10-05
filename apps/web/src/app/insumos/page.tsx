"use client";

import Link from "next/link";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { PackagePlus, Plus, Search } from "lucide-react";
import { StockBadge, SupplyIcon, needsAttention } from "@/components/supply-bits";
import { Card, Empty, LinkButton, PageTitle, inputClass } from "@/components/ui";
import { alive, db, type SupplyCategory } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { formatBRL } from "@/lib/operations";
import { CATEGORY_NAME, SUPPLY_CATEGORIES, formatQty, stockOf } from "@/lib/stock";

type Filter = "todos" | "atencao" | SupplyCategory;

export default function SuppliesPage() {
  const [filter, setFilter] = useState<Filter>("todos");
  const [query, setQuery] = useState("");

  const stock = useLiveQuery(async () => {
    const [supplies, moves, ops] = await Promise.all([db.supplies.toArray(), db.stockMoves.toArray(), db.operations.toArray()]);
    return stockOf(alive(supplies), alive(moves), alive(ops)).sort((a, b) =>
      a.supply.name.localeCompare(b.supply.name, "pt-BR", { numeric: true }),
    );
  });

  if (!stock) return null;

  const attention = stock.filter(needsAttention);
  const priced = stock.filter((s) => s.value != null);
  const unpriced = stock.filter((s) => s.balance > 0 && s.avgCost == null).length;
  const totalValue = priced.reduce((sum, s) => sum + (s.value ?? 0), 0);
  const categories = SUPPLY_CATEGORIES.filter((c) => stock.some((s) => s.supply.category === c.key));
  const q = query.trim().toLocaleLowerCase("pt-BR");
  const shown = stock.filter(
    (s) =>
      (filter === "todos" || (filter === "atencao" ? needsAttention(s) : s.supply.category === filter)) &&
      (!q || s.supply.name.toLocaleLowerCase("pt-BR").includes(q)),
  );

  const actions = (
    <div className="flex shrink-0 gap-2">
      <LinkButton href="/insumos/novo" variant="secondary" className="px-3">
        <Plus className="size-4" /> <span className="hidden sm:inline">Insumo</span>
      </LinkButton>
      <LinkButton href="/insumos/movimento?tipo=entrada">
        <PackagePlus className="size-4" /> Entrada
      </LinkButton>
    </div>
  );

  if (stock.length === 0) {
    return (
      <>
        <PageTitle title="Insumos e estoque" action={actions} />
        <Empty
          title="Nenhum insumo ainda"
          text="Cadastre sementes, adubos e defensivos e lance as compras. Ao registrar uma operação com insumo, o estoque baixa sozinho quando ela é concluída."
          action={<LinkButton href="/insumos/novo">Cadastrar insumo</LinkButton>}
        />
      </>
    );
  }

  return (
    <>
      <PageTitle
        title="Insumos e estoque"
        subtitle="Saldo pelas entradas, pelos ajustes e pelas operações concluídas."
        action={actions}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Summary label="Insumos" value={String(stock.length)} sub={`${categories.length} ${categories.length === 1 ? "categoria" : "categorias"}`} />
        <Summary
          label="Valor em estoque"
          value={priced.length ? formatBRL(totalValue) : "—"}
          sub={unpriced ? `${unpriced} sem preço de compra` : "Pelo preço médio das entradas"}
        />
        <Summary
          label="Vai faltar"
          value={String(stock.filter((s) => s.short).length)}
          sub="Para operações planejadas"
          warn={stock.some((s) => s.short)}
        />
        <Summary
          label="Estoque baixo"
          value={String(stock.filter((s) => !s.short && (s.low || s.balance < 0)).length)}
          sub="Abaixo do mínimo ou negativo"
          warn={stock.some((s) => !s.short && (s.low || s.balance < 0))}
        />
      </div>

      <div className="space-y-3">
        <label className="relative block">
          <span className="sr-only">Buscar insumo</span>
          <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar pelo nome"
            className={`${inputClass} pl-10`}
          />
        </label>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0" role="tablist" aria-label="Filtrar insumos">
          {[
            { key: "todos" as Filter, label: "Todos" },
            ...(attention.length ? [{ key: "atencao" as Filter, label: `Pede atenção (${attention.length})` }] : []),
            ...categories.map((c) => ({ key: c.key as Filter, label: c.label })),
          ].map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={`min-h-9 shrink-0 whitespace-nowrap rounded-full px-4 text-sm font-medium transition ${
                filter === f.key ? "bg-brand text-white" : "border border-border bg-surface text-muted"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">Nenhum insumo com esse filtro.</p>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {shown.map((s) => (
            <li key={s.supply.id}>
              <Link
                href={`/insumo?id=${s.supply.id}`}
                className="flex h-full items-center gap-3 rounded-2xl border border-border bg-surface p-3.5 transition hover:border-brand/40 active:scale-[0.99]"
              >
                <SupplyIcon category={s.supply.category} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{s.supply.name}</span>
                  <span className="mt-0.5 block truncate text-sm text-muted">
                    {CATEGORY_NAME[s.supply.category]}
                    {s.lastDate ? ` · último lançamento ${formatDate(s.lastDate)}` : ""}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1.5">
                    <StockBadge stock={s} />
                    {s.planned > 0 ? (
                      <span className="text-xs text-muted">Previsto: {formatQty(s.planned, s.supply.unit)}</span>
                    ) : null}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className={`block text-lg font-semibold ${s.balance < 0 ? "text-danger" : ""}`}>
                    {formatQty(s.balance, s.supply.unit)}
                  </span>
                  <span className="block text-xs text-muted">{s.value != null ? formatBRL(s.value) : "em estoque"}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Summary({ label, value, sub, warn = false }: { label: string; value: string; sub: string; warn?: boolean }) {
  return (
    <Card className="p-3.5 sm:p-4">
      <span className="block text-xs text-muted">{label}</span>
      <span className={`block text-xl font-semibold tracking-tight sm:text-2xl ${warn ? "text-danger" : ""}`}>{value}</span>
      <span className="block text-xs text-muted">{sub}</span>
    </Card>
  );
}
