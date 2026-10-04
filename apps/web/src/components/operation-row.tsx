"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { OperationIcon, StatusPill } from "@/components/operation-bits";
import type { Operation } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { KIND_NAME, completeOperation, formatBRL, formatNumberBR, isLate } from "@/lib/operations";
import { formatQty, type Use } from "@/lib/stock";

export function OperationRow({
  op,
  farmName,
  plotName,
  today,
  uses = [],
  highlight = false,
}: {
  op: Operation;
  farmName: string;
  plotName: string;
  today: string;
  uses?: Use[];
  highlight?: boolean;
}) {
  const late = isLate(op, today);
  const shownDate = op.status === "concluida" ? (op.doneDate ?? op.date) : op.date;
  const meta = [
    formatDate(shownDate),
    farmName,
    op.areaHa ? `${formatNumberBR(op.areaHa, 2)} ha` : null,
    op.cost != null ? formatBRL(op.cost) : null,
    op.kind === "colheita" && op.yieldBags != null && op.areaHa
      ? `${formatNumberBR(op.yieldBags / op.areaHa, 1)} sc/ha`
      : null,
  ].filter(Boolean);

  return (
    <div
      className={`flex items-start gap-3 rounded-2xl border bg-surface p-3.5 transition ${
        highlight ? "border-brand ring-2 ring-brand/20" : "border-border hover:border-brand/40"
      }`}
    >
      <OperationIcon kind={op.kind} />
      <Link href={`/operacao?id=${op.id}`} className="min-w-0 flex-1">
        <span className="block truncate font-medium">
          {KIND_NAME[op.kind]} <span className="text-muted">· Talhão {plotName}</span>
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
          <StatusPill status={op.status} late={late} />
          <span className="min-w-0">{meta.join(" · ")}</span>
        </span>
        {op.description ? <span className="mt-1.5 line-clamp-2 block text-sm">{op.description}</span> : null}
        {uses.length ? (
          <span className="mt-1.5 flex flex-wrap gap-1.5">
            {uses.map((u, i) => (
              <span key={`${u.supplyId}-${i}`} className="rounded-full bg-border/60 px-2.5 py-0.5 text-xs text-muted">
                {u.name} · {formatQty(u.qty, u.unit)}
              </span>
            ))}
          </span>
        ) : null}
      </Link>
      {op.status !== "concluida" ? (
        <button
          type="button"
          onClick={() => completeOperation(op.id, today)}
          aria-label={`Marcar ${KIND_NAME[op.kind]} do talhão ${plotName} como concluída`}
          title="Marcar como concluída"
          className="grid size-10 shrink-0 place-items-center self-center rounded-full border border-border text-brand transition hover:bg-brand-soft"
        >
          <Check className="size-5" />
        </button>
      ) : null}
    </div>
  );
}
