"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { OperationForm } from "@/components/operation-form";
import { Empty, LinkButton } from "@/components/ui";
import { alive, db } from "@/lib/db";
import { operationInput } from "@/lib/operations";

function EditOperation() {
  const id = useSearchParams().get("id") ?? "";
  const data = useLiveQuery(async () => {
    const op = await db.operations.get(id);
    if (!op || op.deletedAt) return null;
    const moves = alive(await db.stockMoves.where("operationId").equals(id).toArray());
    const uses = moves
      .filter((m) => m.kind === "uso")
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((m) => ({ moveId: m.id, supplyId: m.supplyId, qty: m.qty }));
    return { op, uses };
  }, [id]);

  if (data === undefined) return null;
  if (!data) {
    return (
      <Empty
        title="Operação não encontrada"
        text="Ela pode ter sido removida deste aparelho."
        action={<LinkButton href="/operacoes">Voltar às operações</LinkButton>}
      />
    );
  }
  // key: carrega os valores salvos uma vez; mudanças de fora não sobrescrevem o que está sendo digitado.
  const { op, uses } = data;
  return <OperationForm key={op.id} id={op.id} initial={operationInput(op)} initialUses={uses} />;
}

export default function EditOperationPage() {
  return (
    <Suspense fallback={null}>
      <EditOperation />
    </Suspense>
  );
}
