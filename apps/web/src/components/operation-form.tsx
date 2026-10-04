"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { OperationIcon } from "@/components/operation-bits";
import { SuppliesEditor, rowsFromUses, rowsToUses, validateRows, type SupplyRow } from "@/components/operation-supplies";
import { PlotPickerFields, usePlotPicker } from "@/components/plot-picker";
import { Button, Card, Empty, Field, LinkButton, PageTitle, inputClass } from "@/components/ui";
import { alive, db, removeOperation, type OperationKind, type OperationStatus } from "@/lib/db";
import { todayISO } from "@/lib/format";
import {
  OPERATION_KINDS,
  STATUS_NAME,
  formatNumberBR,
  parseNumberBR,
  saveOperation,
  type OperationInput,
} from "@/lib/operations";
import { stockOf } from "@/lib/stock";

type Props = {
  /** Presente na edição. */
  id?: string;
  initial?: OperationInput;
  initialUses?: { moveId: string; supplyId: string; qty: number }[];
  defaultFarmId?: string;
  defaultPlotId?: string;
  defaultKind?: OperationKind;
};

const STATUSES: OperationStatus[] = ["concluida", "andamento", "planejada"];

export function OperationForm({ id, initial, initialUses, defaultFarmId, defaultPlotId, defaultKind }: Props) {
  const router = useRouter();
  const picker = usePlotPicker(initial?.farmId ?? defaultFarmId ?? "", initial?.plotId ?? defaultPlotId ?? "");
  const today = todayISO();
  const [rows, setRows] = useState<SupplyRow[]>(() => rowsFromUses(initialUses ?? []));
  const stock = useLiveQuery(async () => {
    const [supplies, moves, ops] = await Promise.all([db.supplies.toArray(), db.stockMoves.toArray(), db.operations.toArray()]);
    return stockOf(alive(supplies), alive(moves), alive(ops)).sort((a, b) =>
      a.supply.name.localeCompare(b.supply.name, "pt-BR", { numeric: true }),
    );
  });

  const [kind, setKind] = useState<OperationKind>(initial?.kind ?? defaultKind ?? "aplicacao");
  const [status, setStatus] = useState<OperationStatus>(initial?.status ?? "concluida");
  const [date, setDate] = useState(initial?.date ?? today);
  const [doneDate, setDoneDate] = useState(initial?.doneDate ?? today);
  const [area, setArea] = useState(formatNumberBR(initial?.areaHa, 2));
  const [description, setDescription] = useState(initial?.description ?? "");
  const [cost, setCost] = useState(formatNumberBR(initial?.cost, 2));
  const [bags, setBags] = useState(formatNumberBR(initial?.yieldBags, 1));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const plotArea = picker.plot?.areaHa ?? null;
  const areaHa = parseNumberBR(area) ?? plotArea;
  const bagsN = parseNumberBR(bags);
  const yieldPreview = kind === "colheita" && bagsN != null && areaHa ? bagsN / areaHa : null;

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!picker.farmId || !picker.plotId) {
      setError("Escolha a fazenda e o talhão.");
      return;
    }
    if (area.trim() && parseNumberBR(area) == null) {
      setError("A área precisa ser um número, por exemplo 120 ou 85,5.");
      return;
    }
    if (cost.trim() && parseNumberBR(cost) == null) {
      setError("O custo precisa ser um número, por exemplo 15.000 ou 1.250,50.");
      return;
    }
    const rowsError = validateRows(rows, areaHa);
    if (rowsError) {
      setError(rowsError);
      return;
    }
    setError("");
    setSaving(true);
    const input: OperationInput = {
      farmId: picker.farmId,
      plotId: picker.plotId,
      kind,
      status,
      // Registro novo já concluído: a data é a da conclusão.
      date: status === "concluida" && !id ? doneDate : date,
      doneDate: status === "concluida" ? doneDate : null,
      areaHa,
      description,
      cost: parseNumberBR(cost),
      yieldBags: kind === "colheita" ? bagsN : null,
    };
    try {
      const uses = await rowsToUses(rows, areaHa);
      const savedId = await saveOperation(input, today, id, uses);
      router.push(`/operacoes?destaque=${savedId}`);
    } catch {
      setSaving(false);
      setError("Não foi possível salvar. Tente de novo.");
    }
  }

  async function remove() {
    if (!id || !window.confirm("Excluir esta operação?")) return;
    await removeOperation(id);
    router.push("/operacoes");
  }

  if (!picker.loaded) return null;

  if (picker.farms.length === 0) {
    return (
      <>
        <PageTitle title="Nova operação" />
        <Empty
          title="Cadastre uma fazenda primeiro"
          text="A operação precisa de uma fazenda e um talhão."
          action={<LinkButton href="/fazendas">Cadastrar fazenda</LinkButton>}
        />
      </>
    );
  }

  const hint = OPERATION_KINDS.find((k) => k.kind === kind)?.hint;

  return (
    <form onSubmit={save} className="space-y-6">
      <div>
        <Link href="/operacoes" className="text-sm text-brand">
          ← Operações
        </Link>
      </div>
      <PageTitle title={id ? "Editar operação" : "Nova operação"} subtitle="O que foi feito (ou vai ser feito) no talhão." />

      <Card className="space-y-4">
        <PlotPickerFields picker={picker} />
      </Card>

      <section className="space-y-2">
        <p className="text-sm font-medium">Tipo</p>
        <div className="grid grid-cols-3 gap-2">
          {OPERATION_KINDS.map((k) => (
            <button
              key={k.kind}
              type="button"
              onClick={() => setKind(k.kind)}
              aria-pressed={kind === k.kind}
              className={`flex flex-col items-center gap-1.5 rounded-2xl border p-3 text-sm font-medium transition ${
                kind === k.kind ? "border-brand bg-brand-soft text-brand-strong ring-2 ring-brand/20" : "border-border bg-surface"
              }`}
            >
              <OperationIcon kind={k.kind} className="size-9" />
              {k.label}
            </button>
          ))}
        </div>
      </section>

      <Card className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-medium">Situação</p>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-background p-1">
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                aria-pressed={status === s}
                className={`min-h-10 whitespace-nowrap rounded-lg px-1 text-[13px] font-medium transition sm:text-sm ${
                  status === s ? "bg-surface text-foreground shadow-sm" : "text-muted"
                }`}
              >
                {STATUS_NAME[s]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {status === "concluida" ? (
            <Field label="Concluída em">
              <input type="date" required value={doneDate} onChange={(e) => setDoneDate(e.target.value)} className={inputClass} />
            </Field>
          ) : (
            <Field label={status === "planejada" ? "Data prevista" : "Começou em"}>
              <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
            </Field>
          )}
          <Field label="Área (ha)">
            <input
              inputMode="decimal"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder={plotArea ? `${formatNumberBR(plotArea, 2)} (talhão)` : "Ex.: 120"}
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="O que foi feito" hint={hint}>
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
        </Field>

        {kind === "colheita" ? (
          <Field label="Sacas colhidas (60 kg)" hint="Com a área, o app calcula a produtividade em sacas por hectare.">
            <input inputMode="decimal" value={bags} onChange={(e) => setBags(e.target.value)} placeholder="Ex.: 7.440" className={inputClass} />
          </Field>
        ) : null}
        {yieldPreview != null ? (
          <p className="rounded-xl bg-brand-soft px-3 py-2 text-sm font-medium text-brand-strong">
            Produtividade: {formatNumberBR(yieldPreview, 1)} sc/ha
          </p>
        ) : null}

        <div className="border-t border-border pt-4">
          <SuppliesEditor
            rows={rows}
            onChange={setRows}
            stock={stock ?? []}
            areaHa={areaHa}
            kind={kind}
            onUseCost={(value) => setCost(formatNumberBR(value, 2))}
          />
        </div>

        <Field label="Custo total (R$)" hint="Opcional. Insumo + serviço. Entra no custo por hectare da safra.">
          <input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="Ex.: 18.500" className={inputClass} />
        </Field>
        {kind === "plantio" && status === "concluida" ? (
          <p className="text-xs text-muted">Se a safra do talhão estiver sem data de plantio, esta data é usada.</p>
        ) : null}
      </Card>

      {error ? (
        <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={saving} className="w-full min-h-14 text-base">
        {saving ? "Salvando…" : id ? "Salvar alterações" : "Salvar operação"}
      </Button>
      {id ? (
        <Button type="button" variant="danger" className="w-full" onClick={remove}>
          Excluir operação
        </Button>
      ) : null}
    </form>
  );
}
