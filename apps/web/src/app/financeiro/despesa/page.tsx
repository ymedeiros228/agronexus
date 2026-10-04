"use client";

import Link from "next/link";
import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Button, Card, Empty, Field, LinkButton, PageTitle, inputClass } from "@/components/ui";
import { alive, db, removeExpense, type Expense, type ExpenseCategory } from "@/lib/db";
import { EXPENSE_CATEGORIES, saveExpense } from "@/lib/finance";
import { todayISO } from "@/lib/format";
import { formatNumberBR, parseNumberBR, seasonLabels } from "@/lib/operations";

function ExpenseEntry() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const data = useLiveQuery(async () => {
    const labels = seasonLabels(alive(await db.seasons.toArray()));
    const expense = id ? ((await db.expenses.get(id)) ?? null) : null;
    return { labels, expense: expense && !expense.deletedAt ? expense : null };
  }, [id]);

  if (!data) return null;
  if (id && !data.expense) {
    return (
      <Empty
        title="Despesa não encontrada"
        text="Ela pode ter sido removida deste aparelho."
        action={<LinkButton href="/financeiro">Voltar ao financeiro</LinkButton>}
      />
    );
  }
  const label = data.expense?.seasonLabel ?? params.get("safra") ?? data.labels[0] ?? "";
  const labels = data.labels.includes(label) || !label ? data.labels : [label, ...data.labels];
  return <ExpenseForm key={data.expense?.id ?? "nova"} expense={data.expense} labels={labels} initialLabel={label} />;
}

function ExpenseForm({ expense, labels, initialLabel }: { expense: Expense | null; labels: string[]; initialLabel: string }) {
  const router = useRouter();
  const [seasonLabel, setSeasonLabel] = useState(initialLabel);
  const [date, setDate] = useState(expense?.date ?? todayISO());
  const [category, setCategory] = useState<ExpenseCategory | "">(expense?.category ?? "");
  const [description, setDescription] = useState(expense?.description ?? "");
  const [amount, setAmount] = useState(formatNumberBR(expense?.amount, 2));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const back = `/financeiro?safra=${encodeURIComponent(seasonLabel)}`;

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = parseNumberBR(amount);
    if (!category) {
      setError("Escolha o tipo da despesa.");
      return;
    }
    if (!value) {
      setError("Informe o valor, por exemplo 15.000 ou 1.250,50.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await saveExpense({ seasonLabel, date, category, description, amount: value }, expense?.id);
      router.push(back);
    } catch (err) {
      setSaving(false);
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    }
  }

  async function remove() {
    if (!expense || !window.confirm("Excluir esta despesa?")) return;
    await removeExpense(expense.id);
    router.push(back);
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <div>
        <Link href={back} className="text-sm text-brand">
          ← Financeiro
        </Link>
      </div>
      <PageTitle
        title={expense ? "Editar despesa" : "Lançar despesa"}
        subtitle="Custo da safra que não é de uma operação no talhão."
      />

      <Card className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Safra">
            <select value={seasonLabel} onChange={(e) => setSeasonLabel(e.target.value)} className={inputClass}>
              {labels.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Data">
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <Field label="Tipo">
          <select
            required
            value={category}
            onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
            className={inputClass}
          >
            <option value="" disabled>
              Escolha…
            </option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Valor (R$)">
          <input
            inputMode="decimal"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Ex.: 15.000"
            className={inputClass}
          />
        </Field>
        <Field label="Descrição">
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opcional" className={inputClass} />
        </Field>
      </Card>

      {error ? (
        <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={saving} className="w-full min-h-14 text-base">
        {saving ? "Salvando…" : expense ? "Salvar alterações" : "Salvar despesa"}
      </Button>
      {expense ? (
        <Button type="button" variant="danger" className="w-full" onClick={remove}>
          Excluir despesa
        </Button>
      ) : null}
    </form>
  );
}

export default function ExpensePage() {
  return (
    <Suspense fallback={null}>
      <ExpenseEntry />
    </Suspense>
  );
}
