"use client";

import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowDownToLine, ClipboardCheck, PackagePlus, Pencil, Scale } from "lucide-react";
import { OperationIcon } from "@/components/operation-bits";
import { StockBadge, SupplyIcon } from "@/components/supply-bits";
import { Card, Empty, LinkButton, PageSkeleton, SectionTitle } from "@/components/ui";
import { alive, db, type Operation, type StockMove } from "@/lib/db";
import { formatDate, plotLabel } from "@/lib/format";
import { KIND_NAME, formatBRL, formatNumberBR } from "@/lib/operations";
import { CATEGORY_NAME, formatQty, formatSignedQty, moveDate, stockOf } from "@/lib/stock";

function SupplyDetail() {
  const id = useSearchParams().get("id") ?? "";
  const data = useLiveQuery(async () => {
    const supply = await db.supplies.get(id);
    if (!supply || supply.deletedAt) return null;
    const [moves, ops, farms, plots] = await Promise.all([
      db.stockMoves.where("supplyId").equals(id).toArray(),
      db.operations.toArray(),
      db.farms.toArray(),
      db.plots.toArray(),
    ]);
    const liveOps = alive(ops);
    const liveMoves = alive(moves);
    return {
      supply,
      stock: stockOf([supply], liveMoves, liveOps)[0],
      moves: liveMoves,
      opById: new Map(liveOps.map((o) => [o.id, o])),
      farmName: new Map(alive(farms).map((f) => [f.id, f.name])),
      plotName: new Map(alive(plots).map((p) => [p.id, p.name])),
    };
  }, [id]);

  if (data === undefined) return <PageSkeleton />;
  if (data === null) {
    return (
      <Empty
        title="Insumo não encontrado"
        text="Ele pode ter sido removido deste aparelho."
        action={<LinkButton href="/insumos">Voltar aos insumos</LinkButton>}
      />
    );
  }

  const { supply, stock, opById } = data;
  const unit = supply.unit;
  const history = data.moves
    .filter((m) => m.kind !== "uso" || (m.operationId && opById.has(m.operationId)))
    .map((m) => ({ move: m, op: m.operationId ? opById.get(m.operationId) : undefined }))
    .map((r) => ({ ...r, date: moveDate(r.move, r.op) }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.move.createdAt - a.move.createdAt));

  return (
    <>
      <div>
        <Link href="/insumos" className="text-sm text-brand">
          ← Insumos
        </Link>
      </div>

      <div className="flex items-start gap-3">
        <SupplyIcon category={supply.category} className="size-12" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{supply.name}</h1>
          <p className="mt-0.5 text-sm text-muted">
            {CATEGORY_NAME[supply.category]} · em {unit}
          </p>
        </div>
        <LinkButton href={`/insumos/editar?id=${supply.id}`} variant="secondary" className="shrink-0 px-3">
          <Pencil className="size-4" /> <span className="sr-only sm:not-sr-only">Editar</span>
        </LinkButton>
      </div>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs text-muted">Saldo em estoque</p>
            <p className={`text-3xl font-semibold tracking-tight ${stock.balance < 0 ? "text-danger" : ""}`}>
              {formatQty(stock.balance, unit)}
            </p>
          </div>
          <StockBadge stock={stock} />
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
          <Info label="Previsto em operações abertas">{stock.planned > 0 ? formatQty(stock.planned, unit) : "—"}</Info>
          <Info label="Depois delas">{stock.planned > 0 ? formatQty(stock.balance - stock.planned, unit) : "—"}</Info>
          <Info label="Preço médio de compra">
            {stock.avgCost != null ? `${formatBRL(stock.avgCost, 2)}/${unit}` : "Sem preço anotado"}
          </Info>
          <Info label="Estoque mínimo">{supply.minQty != null ? formatQty(supply.minQty, unit) : "Não definido"}</Info>
        </dl>
        {stock.value != null ? <p className="text-sm text-muted">Valor do saldo: {formatBRL(stock.value)}</p> : null}
        {supply.notes ? <p className="whitespace-pre-line text-sm">{supply.notes}</p> : null}
        <div className="grid grid-cols-2 gap-2">
          <LinkButton href={`/insumos/movimento?tipo=entrada&insumo=${supply.id}`}>
            <PackagePlus className="size-4" /> Entrada
          </LinkButton>
          <LinkButton href={`/insumos/movimento?tipo=contagem&insumo=${supply.id}`} variant="secondary">
            <ClipboardCheck className="size-4" /> Contagem
          </LinkButton>
        </div>
      </Card>

      <section className="space-y-3">
        <SectionTitle>Histórico</SectionTitle>
        {history.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">Nenhum lançamento ainda. Registre a primeira entrada (compra ou recebimento).</p>
          </Card>
        ) : (
          <Card className="divide-y divide-border p-0">
            {history.map(({ move, op, date }) => (
              <MoveRow
                key={move.id}
                move={move}
                op={op}
                date={date}
                unit={unit}
                place={op ? `${plotLabel(data.plotName.get(op.plotId))} · ${data.farmName.get(op.farmId) ?? "Fazenda"}` : ""}
              />
            ))}
          </Card>
        )}
      </section>
    </>
  );
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

function MoveRow({
  move,
  op,
  date,
  unit,
  place,
}: {
  move: StockMove;
  op?: Operation;
  date: string;
  unit: string;
  place: string;
}) {
  const planned = move.kind === "uso" && op?.status !== "concluida";
  const icon =
    move.kind === "uso" && op ? (
      <OperationIcon kind={op.kind} />
    ) : (
      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
        {move.kind === "entrada" ? <ArrowDownToLine className="size-5" /> : <Scale className="size-5" />}
      </span>
    );
  const title =
    move.kind === "entrada" ? "Entrada" : move.kind === "ajuste" ? "Ajuste de contagem" : `${KIND_NAME[op!.kind]} · ${place}`;
  const details = [
    formatDate(date),
    planned ? (op?.status === "andamento" ? "em andamento" : "planejada") : null,
    move.kind === "entrada" && move.cost != null
      ? `${formatBRL(move.cost)} (${formatBRL(move.cost / move.qty, 2)}/${unit})`
      : null,
    move.note || null,
  ].filter(Boolean);
  const signed = move.kind === "uso" ? -move.qty : move.qty;
  const href = move.kind === "uso" ? `/operacao?id=${move.operationId}` : `/insumos/movimento?id=${move.id}`;

  return (
    <Link href={href} className="flex items-center gap-3 p-3.5 active:bg-brand-soft">
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        <span className="block truncate text-sm text-muted">{details.join(" · ")}</span>
      </span>
      <span
        className={`shrink-0 text-right text-sm font-semibold ${
          planned ? "text-muted" : signed < 0 ? "text-danger" : "text-brand-strong"
        }`}
      >
        {planned ? `${formatNumberBR(move.qty, 2)} ${unit}` : formatSignedQty(signed, unit)}
        {planned ? <span className="block text-[11px] font-normal">previsto</span> : null}
      </span>
    </Link>
  );
}

export default function SupplyPage() {
  return (
    <Suspense fallback={null}>
      <SupplyDetail />
    </Suspense>
  );
}
