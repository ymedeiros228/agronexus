"use client";

import Link from "next/link";
import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Button, Card, Empty, Field, inputClass, LinkButton, PageSkeleton, PageTitle } from "@/components/ui";
import { toast } from "@/components/toaster";
import { alive, db, removeStockMove, type StockMove, type Supply, restoreRemoved } from "@/lib/db";
import { formatDate, todayISO } from "@/lib/format";
import { formatBRL, formatNumberBR, parseNumberBR } from "@/lib/operations";
import { currentStock, formatQty, formatSignedQty, saveCount, saveEntry } from "@/lib/stock";

function Movement() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const data = useLiveQuery(async () => {
    const supplies = alive(await db.supplies.toArray()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { numeric: true }));
    const move = id ? ((await db.stockMoves.get(id)) ?? null) : null;
    return { supplies, move: move && !move.deletedAt ? move : null };
  }, [id]);

  if (!data) return <PageSkeleton />;
  if (id && !data.move) {
    return (
      <Empty
        title="Lançamento não encontrado"
        text="Ele pode ter sido removido deste aparelho."
        action={<LinkButton href="/insumos">Voltar aos insumos</LinkButton>}
      />
    );
  }
  if (data.supplies.length === 0) {
    return (
      <>
        <PageTitle title="Entrada de insumo" />
        <Empty
          title="Cadastre o insumo primeiro"
          text="Depois lance as compras e recebimentos dele."
          action={<LinkButton href="/insumos/novo">Cadastrar insumo</LinkButton>}
        />
      </>
    );
  }
  if (data.move?.kind === "ajuste") return <AdjustmentView move={data.move} supplies={data.supplies} />;
  if (data.move?.kind === "uso") {
    return (
      <Empty
        title="Este uso faz parte de uma operação"
        text="Para mudar a quantidade, edite a operação."
        action={<LinkButton href={`/operacao?id=${data.move.operationId}`}>Abrir operação</LinkButton>}
      />
    );
  }
  const preset = data.move?.supplyId ?? params.get("insumo") ?? "";
  const supplyId = data.supplies.some((s) => s.id === preset) ? preset : data.supplies[0].id;
  if (!data.move && params.get("tipo") === "contagem") {
    return <CountForm key={supplyId} supplies={data.supplies} initialSupplyId={supplyId} />;
  }
  return <EntryForm key={data.move?.id ?? supplyId} supplies={data.supplies} initialSupplyId={supplyId} move={data.move} />;
}

function SupplySelect({
  supplies,
  value,
  onChange,
}: {
  supplies: Supply[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <Field label="Insumo">
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        {supplies.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} ({s.unit})
          </option>
        ))}
      </select>
    </Field>
  );
}

function EntryForm({ supplies, initialSupplyId, move }: { supplies: Supply[]; initialSupplyId: string; move: StockMove | null }) {
  const router = useRouter();
  const [supplyId, setSupplyId] = useState(initialSupplyId);
  const [date, setDate] = useState(move?.date ?? todayISO());
  const [qty, setQty] = useState(formatNumberBR(move?.qty, 3));
  const [cost, setCost] = useState(formatNumberBR(move?.cost, 2));
  const [note, setNote] = useState(move?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const supply = supplies.find((s) => s.id === supplyId)!;
  const qtyN = parseNumberBR(qty);
  const costN = parseNumberBR(cost);
  const unitPrice = qtyN && costN != null ? costN / qtyN : null;

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!qtyN) {
      setError("Informe a quantidade, por exemplo 200 ou 12,5.");
      return;
    }
    if (cost.trim() && costN == null) {
      setError("O valor precisa ser um número, por exemplo 15.000 ou 1.250,50.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await saveEntry({ supplyId, date, qty: qtyN, cost: costN, note }, move?.id);
      toast(move ? "Entrada atualizada." : "Entrada lançada no estoque.");
      router.push(`/insumo?id=${supplyId}`);
    } catch (err) {
      setSaving(false);
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    }
  }

  async function remove() {
    if (!move || !window.confirm("Excluir esta entrada? O saldo do insumo diminui.")) return;
    const at = await removeStockMove(move.id);
    toast("Entrada excluída.", { undo: () => restoreRemoved(at) });
    router.push(`/insumo?id=${move.supplyId}`);
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <div>
        <Link href={`/insumo?id=${supplyId}`} className="text-sm text-brand">
          ← {supply.name}
        </Link>
      </div>
      <PageTitle title={move ? "Editar entrada" : "Entrada de insumo"} subtitle="Compra ou recebimento que entrou no estoque." />

      <Card className="space-y-4">
        <SupplySelect supplies={supplies} value={supplyId} onChange={setSupplyId} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data">
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </Field>
          <Field label={`Quantidade (${supply.unit})`}>
            <input
              inputMode="decimal"
              required
              autoFocus={!move}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="Ex.: 200"
              className={inputClass}
            />
          </Field>
        </div>
        <Field label="Valor total pago (R$)" hint="Opcional. Com ele, o app calcula o preço médio e o valor do estoque.">
          <input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="Ex.: 20.000" className={inputClass} />
        </Field>
        {unitPrice != null ? (
          <p className="rounded-xl bg-brand-soft px-3 py-2 text-sm font-medium text-brand-strong">
            {formatBRL(unitPrice, 2)} por {supply.unit}
          </p>
        ) : null}
        <Field label="Fornecedor / nota fiscal">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opcional" className={inputClass} />
        </Field>
      </Card>

      {error ? (
        <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={saving} className="w-full min-h-14 text-base">
        {saving ? "Salvando…" : move ? "Salvar alterações" : "Lançar entrada"}
      </Button>
      {move ? (
        <Button type="button" variant="danger" className="w-full" onClick={remove}>
          Excluir entrada
        </Button>
      ) : null}
    </form>
  );
}

function CountForm({ supplies, initialSupplyId }: { supplies: Supply[]; initialSupplyId: string }) {
  const router = useRouter();
  const [supplyId, setSupplyId] = useState(initialSupplyId);
  const [counted, setCounted] = useState("");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const stock = useLiveQuery(() => currentStock(supplyId), [supplyId]);

  const supply = supplies.find((s) => s.id === supplyId)!;
  const countedN = parseNumberBR(counted);
  const diff = stock && countedN != null ? Math.round((countedN - stock.balance) * 1000) / 1000 : null;

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (countedN == null || !stock) {
      setError("Informe quanto foi contado, por exemplo 180 ou 12,5.");
      return;
    }
    setError("");
    setSaving(true);
    await saveCount(supplyId, countedN, stock.balance, date, note);
    toast("Contagem registrada.");
    router.push(`/insumo?id=${supplyId}`);
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <div>
        <Link href={`/insumo?id=${supplyId}`} className="text-sm text-brand">
          ← {supply.name}
        </Link>
      </div>
      <PageTitle title="Contagem de estoque" subtitle="Conte o que tem no depósito. O app lança a diferença como ajuste." />

      <Card className="space-y-4">
        <SupplySelect supplies={supplies} value={supplyId} onChange={setSupplyId} />
        {stock ? (
          <p className="text-sm">
            Saldo no app: <span className="font-semibold">{formatQty(stock.balance, supply.unit)}</span>
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Quantidade contada (${supply.unit})`}>
            <input
              inputMode="decimal"
              required
              autoFocus
              value={counted}
              onChange={(e) => setCounted(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Data">
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </Field>
        </div>
        {diff != null ? (
          <p
            className={`rounded-xl px-3 py-2 text-sm font-medium ${
              diff === 0 ? "bg-brand-soft text-brand-strong" : "bg-warn/10 text-warn"
            }`}
          >
            {diff === 0 ? "Bate com o app. Nada a ajustar." : `Diferença: ${formatSignedQty(diff, supply.unit)}`}
          </p>
        ) : null}
        <Field label="Motivo da diferença">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: embalagem danificada, uso não lançado" className={inputClass} />
        </Field>
      </Card>

      {error ? (
        <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={saving || diff === 0} className="w-full min-h-14 text-base">
        {saving ? "Salvando…" : "Lançar ajuste"}
      </Button>
    </form>
  );
}

function AdjustmentView({ move, supplies }: { move: StockMove; supplies: Supply[] }) {
  const router = useRouter();
  const supply = supplies.find((s) => s.id === move.supplyId);

  async function remove() {
    if (!window.confirm("Excluir este ajuste? O saldo volta a ser o de antes da contagem.")) return;
    const at = await removeStockMove(move.id);
    toast("Ajuste excluído.", { undo: () => restoreRemoved(at) });
    router.push(`/insumo?id=${move.supplyId}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/insumo?id=${move.supplyId}`} className="text-sm text-brand">
          ← {supply?.name ?? "Insumo"}
        </Link>
      </div>
      <PageTitle title="Ajuste de contagem" subtitle={formatDate(move.date)} />
      <Card className="space-y-2">
        <p className="text-2xl font-semibold">{formatSignedQty(move.qty, supply?.unit ?? "")}</p>
        {move.note ? <p className="text-sm">{move.note}</p> : <p className="text-sm text-muted">Sem motivo anotado.</p>}
        <p className="text-xs text-muted">Para corrigir, exclua este ajuste e faça uma nova contagem.</p>
      </Card>
      <Button type="button" variant="danger" className="w-full" onClick={remove}>
        Excluir ajuste
      </Button>
    </div>
  );
}

export default function MovementPage() {
  return (
    <Suspense fallback={null}>
      <Movement />
    </Suspense>
  );
}
