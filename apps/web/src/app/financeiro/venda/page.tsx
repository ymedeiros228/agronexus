"use client";

import Link from "next/link";
import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Button, Card, Empty, Field, LinkButton, PageTitle, inputClass } from "@/components/ui";
import { alive, db, removeSale, type Sale } from "@/lib/db";
import { saveSale } from "@/lib/finance";
import { todayISO } from "@/lib/format";
import { formatBRL, formatNumberBR, parseNumberBR, seasonLabels } from "@/lib/operations";

function SaleEntry() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const data = useLiveQuery(async () => {
    const labels = seasonLabels(alive(await db.seasons.toArray()));
    const sale = id ? ((await db.sales.get(id)) ?? null) : null;
    return { labels, sale: sale && !sale.deletedAt ? sale : null };
  }, [id]);

  if (!data) return null;
  if (id && !data.sale) {
    return (
      <Empty
        title="Venda não encontrada"
        text="Ela pode ter sido removida deste aparelho."
        action={<LinkButton href="/financeiro">Voltar ao financeiro</LinkButton>}
      />
    );
  }
  const label = data.sale?.seasonLabel ?? params.get("safra") ?? data.labels[0] ?? "";
  const labels = data.labels.includes(label) || !label ? data.labels : [label, ...data.labels];
  return <SaleForm key={data.sale?.id ?? "nova"} sale={data.sale} labels={labels} initialLabel={label} />;
}

function SaleForm({ sale, labels, initialLabel }: { sale: Sale | null; labels: string[]; initialLabel: string }) {
  const router = useRouter();
  const [seasonLabel, setSeasonLabel] = useState(initialLabel);
  const [date, setDate] = useState(sale?.date ?? todayISO());
  const [bags, setBags] = useState(formatNumberBR(sale?.bags, 1));
  const [price, setPrice] = useState(formatNumberBR(sale?.pricePerBag, 2));
  const [buyer, setBuyer] = useState(sale?.buyer ?? "");
  const [note, setNote] = useState(sale?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const bagsN = parseNumberBR(bags);
  const priceN = parseNumberBR(price);
  const back = `/financeiro?safra=${encodeURIComponent(seasonLabel)}`;

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!bagsN || !priceN) {
      setError("Informe as sacas e o preço por saca, por exemplo 1.200 e 118,50.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await saveSale({ seasonLabel, date, bags: bagsN, pricePerBag: priceN, buyer, note }, sale?.id);
      router.push(back);
    } catch (err) {
      setSaving(false);
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    }
  }

  async function remove() {
    if (!sale || !window.confirm("Excluir esta venda?")) return;
    await removeSale(sale.id);
    router.push(back);
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <div>
        <Link href={back} className="text-sm text-brand">
          ← Financeiro
        </Link>
      </div>
      <PageTitle title={sale ? "Editar venda" : "Registrar venda"} subtitle="Venda de soja da safra, como foi fechada." />

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
        <div className="grid grid-cols-2 gap-3">
          <Field label="Sacas (60 kg)">
            <input
              inputMode="decimal"
              required
              autoFocus={!sale}
              value={bags}
              onChange={(e) => setBags(e.target.value)}
              placeholder="Ex.: 1.200"
              className={inputClass}
            />
          </Field>
          <Field label="Preço por saca (R$)">
            <input inputMode="decimal" required value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Ex.: 118,50" className={inputClass} />
          </Field>
        </div>
        <p className="-mt-2 text-xs text-muted">Preço líquido: o que entra para você por saca, já descontados frete e taxas, se houver.</p>
        {bagsN && priceN ? (
          <p className="rounded-xl bg-brand-soft px-3 py-2 text-sm font-medium text-brand-strong">Total: {formatBRL(bagsN * priceN)}</p>
        ) : null}
        <Field label="Comprador">
          <input value={buyer} onChange={(e) => setBuyer(e.target.value)} placeholder="Opcional" className={inputClass} />
        </Field>
        <Field label="Observação">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: contrato, entrega, prazo de pagamento" className={inputClass} />
        </Field>
      </Card>

      {error ? (
        <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={saving} className="w-full min-h-14 text-base">
        {saving ? "Salvando…" : sale ? "Salvar alterações" : "Salvar venda"}
      </Button>
      {sale ? (
        <Button type="button" variant="danger" className="w-full" onClick={remove}>
          Excluir venda
        </Button>
      ) : null}
    </form>
  );
}

export default function SalePage() {
  return (
    <Suspense fallback={null}>
      <SaleEntry />
    </Suspense>
  );
}
