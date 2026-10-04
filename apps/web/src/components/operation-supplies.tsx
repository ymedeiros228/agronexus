"use client";

import { Plus, X } from "lucide-react";
import { inputClass } from "@/components/ui";
import type { OperationKind, SupplyCategory } from "@/lib/db";
import { formatBRL, formatNumberBR, parseNumberBR } from "@/lib/operations";
import { SUPPLY_CATEGORIES, UNITS, formatQty, saveSupply, type SupplyStock } from "@/lib/stock";

export const NEW_SUPPLY = "__novo__";

export type SupplyRow = {
  key: string;
  moveId?: string;
  supplyId: string;
  amount: string;
  perHa: boolean;
  newName: string;
  newUnit: string;
  newCategory: SupplyCategory | "";
};

const DEFAULT_CATEGORY: Partial<Record<OperationKind, SupplyCategory>> = {
  plantio: "semente",
  adubacao: "fertilizante",
};

export function rowsFromUses(uses: { moveId: string; supplyId: string; qty: number }[]): SupplyRow[] {
  return uses.map((u) => ({
    key: u.moveId,
    moveId: u.moveId,
    supplyId: u.supplyId,
    amount: formatNumberBR(u.qty, 3),
    perHa: false,
    newName: "",
    newUnit: "L",
    newCategory: "",
  }));
}

/** Quantidade total da linha (converte dose por hectare pela área). */
export function rowTotal(row: SupplyRow, areaHa: number | null): number | null {
  const n = parseNumberBR(row.amount);
  if (n == null) return null;
  if (!row.perHa) return n;
  return areaHa ? n * areaHa : null;
}

const isBlank = (r: SupplyRow) => !r.amount.trim() && (r.supplyId === "" || (r.supplyId === NEW_SUPPLY && !r.newName.trim()));

/** Confere as linhas. Devolve a mensagem de erro ou null. */
export function validateRows(rows: SupplyRow[], areaHa: number | null): string | null {
  for (const r of rows) {
    if (isBlank(r)) continue;
    if (!r.supplyId) return "Escolha o insumo em todas as linhas (ou remova a linha).";
    if (r.supplyId === NEW_SUPPLY && !r.newName.trim()) return "Informe o nome do insumo novo.";
    if (r.supplyId === NEW_SUPPLY && !r.newCategory) return "Escolha a categoria do insumo novo.";
    if (r.perHa && !areaHa) return "Para usar dose por hectare, informe a área.";
    const total = rowTotal(r, areaHa);
    if (total == null || total <= 0) return "Informe a quantidade de cada insumo, por exemplo 60 ou 0,5.";
  }
  return null;
}

/** Cadastra os insumos novos e devolve os usos para gravar com a operação. */
export async function rowsToUses(rows: SupplyRow[], areaHa: number | null) {
  const out: { moveId?: string; supplyId: string; qty: number }[] = [];
  for (const r of rows) {
    if (isBlank(r)) continue;
    const supplyId =
      r.supplyId === NEW_SUPPLY
        ? await saveSupply({
            name: r.newName,
            category: r.newCategory as SupplyCategory,
            unit: r.newUnit,
            minQty: null,
            notes: "",
          })
        : r.supplyId;
    out.push({ moveId: r.moveId, supplyId, qty: rowTotal(r, areaHa)! });
  }
  return out;
}

export function SuppliesEditor({
  rows,
  onChange,
  stock,
  areaHa,
  kind,
  onUseCost,
}: {
  rows: SupplyRow[];
  onChange: (rows: SupplyRow[]) => void;
  stock: SupplyStock[];
  areaHa: number | null;
  kind: OperationKind;
  onUseCost: (value: number) => void;
}) {
  const byId = new Map(stock.map((s) => [s.supply.id, s]));
  const set = (key: string, patch: Partial<SupplyRow>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  function add() {
    onChange([
      ...rows,
      {
        key: crypto.randomUUID(),
        supplyId: stock.length ? "" : NEW_SUPPLY,
        amount: "",
        perHa: false,
        newName: "",
        newUnit: "L",
        newCategory: DEFAULT_CATEGORY[kind] ?? "",
      },
    ]);
  }

  let cost = 0;
  let unpriced = 0;
  for (const r of rows) {
    const total = rowTotal(r, areaHa);
    if (total == null || !r.supplyId) continue;
    const avg = byId.get(r.supplyId)?.avgCost;
    if (avg != null) cost += total * avg;
    else unpriced++;
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">Insumos usados</p>
        <p className="text-xs text-muted">Opcional. Baixa do estoque quando a operação estiver concluída.</p>
      </div>

      {rows.map((r) => {
        const s = byId.get(r.supplyId);
        const unit = r.supplyId === NEW_SUPPLY ? r.newUnit : (s?.supply.unit ?? "");
        const n = parseNumberBR(r.amount);
        const counterpart =
          n == null || !unit
            ? null
            : r.perHa
              ? areaHa
                ? `= ${formatQty(n * areaHa, unit)} no total`
                : "Informe a área para calcular o total"
              : areaHa
                ? `= ${formatNumberBR(n / areaHa, 3)} ${unit}/ha`
                : null;
        return (
          <div key={r.key} className="space-y-2 rounded-xl border border-border p-3">
            <div className="flex gap-2">
              <label className="min-w-0 flex-1">
                <span className="sr-only">Insumo</span>
                <select
                  value={r.supplyId}
                  onChange={(e) => set(r.key, { supplyId: e.target.value })}
                  className={inputClass}
                >
                  <option value="" disabled>
                    Escolha o insumo…
                  </option>
                  {stock.map((x) => (
                    <option key={x.supply.id} value={x.supply.id}>
                      {x.supply.name} ({formatQty(x.balance, x.supply.unit)})
                    </option>
                  ))}
                  <option value={NEW_SUPPLY}>+ Cadastrar insumo novo</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() => onChange(rows.filter((x) => x.key !== r.key))}
                aria-label="Remover insumo"
                className="grid size-12 shrink-0 place-items-center rounded-xl text-muted hover:bg-danger/10 hover:text-danger"
              >
                <X className="size-5" />
              </button>
            </div>

            {r.supplyId === NEW_SUPPLY ? (
              <div className="grid grid-cols-2 gap-2">
                <label className="col-span-2">
                  <span className="sr-only">Nome do insumo novo</span>
                  <input
                    value={r.newName}
                    onChange={(e) => set(r.key, { newName: e.target.value })}
                    placeholder="Nome do insumo"
                    className={inputClass}
                  />
                </label>
                <label>
                  <span className="sr-only">Categoria</span>
                  <select
                    value={r.newCategory}
                    onChange={(e) => set(r.key, { newCategory: e.target.value as SupplyCategory })}
                    className={inputClass}
                  >
                    <option value="" disabled>
                      Categoria…
                    </option>
                    {SUPPLY_CATEGORIES.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="sr-only">Unidade</span>
                  <select value={r.newUnit} onChange={(e) => set(r.key, { newUnit: e.target.value })} className={inputClass}>
                    {UNITS.map((u) => (
                      <option key={u.key} value={u.key}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}

            <div className="flex gap-2">
              <label className="min-w-0 flex-1">
                <span className="sr-only">Quantidade</span>
                <input
                  inputMode="decimal"
                  value={r.amount}
                  onChange={(e) => set(r.key, { amount: e.target.value })}
                  placeholder={r.perHa ? "Dose por hectare" : "Quantidade total"}
                  className={inputClass}
                />
              </label>
              <div className="grid shrink-0 grid-cols-2 gap-1 rounded-xl bg-background p-1" role="group" aria-label="Como informar">
                {[false, true].map((perHa) => (
                  <button
                    key={String(perHa)}
                    type="button"
                    aria-pressed={r.perHa === perHa}
                    onClick={() => set(r.key, { perHa })}
                    className={`min-h-10 whitespace-nowrap rounded-lg px-2.5 text-[13px] font-medium ${
                      r.perHa === perHa ? "bg-surface text-foreground shadow-sm" : "text-muted"
                    }`}
                  >
                    {perHa ? `${unit || "un"}/ha` : `${unit || "un"} total`}
                  </button>
                ))}
              </div>
            </div>
            {counterpart ? <p className="text-xs text-muted">{counterpart}</p> : null}
          </div>
        );
      })}

      <button
        type="button"
        onClick={add}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm font-medium text-brand hover:bg-brand-soft"
      >
        <Plus className="size-4" /> Adicionar insumo
      </button>

      {cost > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-brand-soft px-3 py-2 text-sm text-brand-strong">
          <span>
            Insumos pelo preço médio: <span className="font-semibold">{formatBRL(cost)}</span>
            {unpriced ? ` (${unpriced} sem preço de compra)` : ""}
          </span>
          <button type="button" onClick={() => onUseCost(Math.round(cost * 100) / 100)} className="font-semibold underline">
            Usar no custo
          </button>
        </div>
      ) : null}
    </div>
  );
}
