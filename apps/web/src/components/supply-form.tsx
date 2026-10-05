"use client";

import { toast } from "@/components/toaster";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, Card, Field, PageTitle, inputClass } from "@/components/ui";
import { removeSupply, type SupplyCategory, restoreRemoved } from "@/lib/db";
import { formatNumberBR, parseNumberBR } from "@/lib/operations";
import { SUPPLY_CATEGORIES, UNITS, saveSupply, type SupplyInput } from "@/lib/stock";

export function SupplyForm({ id, initial }: { id?: string; initial?: SupplyInput }) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState<SupplyCategory>(initial?.category ?? "fungicida");
  const [unit, setUnit] = useState(initial?.unit ?? "L");
  const [minQty, setMinQty] = useState(formatNumberBR(initial?.minQty, 2));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (minQty.trim() && parseNumberBR(minQty) == null) {
      setError("O estoque mínimo precisa ser um número, por exemplo 50 ou 12,5.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const savedId = await saveSupply({ name, category, unit, minQty: parseNumberBR(minQty), notes }, id);
      toast(id ? "Insumo atualizado." : "Insumo cadastrado.");
      router.push(`/insumo?id=${savedId}`);
    } catch (err) {
      setSaving(false);
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    }
  }

  async function remove() {
    if (!id || !window.confirm("Excluir este insumo e as entradas dele?")) return;
    const result = await removeSupply(id);
    if (result.ok) {
      toast("Insumo excluído.", { undo: () => restoreRemoved(result.at) });
      router.push("/insumos");
    } else {
      setError(
        `Este insumo foi usado em ${result.usedIn} ${result.usedIn === 1 ? "operação" : "operações"}. Para não perder o histórico, ele não pode ser excluído.`,
      );
    }
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <div>
        <Link href={id ? `/insumo?id=${id}` : "/insumos"} className="text-sm text-brand">
          ← {id ? "Insumo" : "Insumos"}
        </Link>
      </div>
      <PageTitle title={id ? "Editar insumo" : "Novo insumo"} subtitle="Com o nome que vocês usam na fazenda." />

      <Card className="space-y-4">
        <Field label="Nome">
          <input
            required
            autoFocus={!id}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: o nome comercial do produto"
            className={inputClass}
          />
        </Field>
        <Field label="Categoria">
          <select value={category} onChange={(e) => setCategory(e.target.value as SupplyCategory)} className={inputClass}>
            {SUPPLY_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Unidade" hint={id ? "Mudar não converte o que já foi lançado." : undefined}>
            <select value={unit} onChange={(e) => setUnit(e.target.value)} className={inputClass}>
              {UNITS.map((u) => (
                <option key={u.key} value={u.key}>
                  {u.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={`Estoque mínimo (${unit})`} hint="Opcional. Abaixo disso, o painel avisa.">
            <input inputMode="decimal" value={minQty} onChange={(e) => setMinQty(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <Field label="Observações">
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
        </Field>
      </Card>

      {error ? (
        <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={saving} className="w-full min-h-14 text-base">
        {saving ? "Salvando…" : id ? "Salvar alterações" : "Salvar insumo"}
      </Button>
      {id ? (
        <Button type="button" variant="danger" className="w-full" onClick={remove}>
          Excluir insumo
        </Button>
      ) : null}
    </form>
  );
}
