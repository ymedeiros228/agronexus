"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { OperationForm } from "@/components/operation-form";
import { Empty, LinkButton } from "@/components/ui";
import { db } from "@/lib/db";
import { operationInput } from "@/lib/operations";

function EditOperation() {
  const id = useSearchParams().get("id") ?? "";
  const op = useLiveQuery(async () => (await db.operations.get(id)) ?? null, [id]);

  if (op === undefined) return null;
  if (!op || op.deletedAt) {
    return (
      <Empty
        title="Operação não encontrada"
        text="Ela pode ter sido removida deste aparelho."
        action={<LinkButton href="/operacoes">Voltar às operações</LinkButton>}
      />
    );
  }
  // key: carrega os valores salvos uma vez; mudanças de fora não sobrescrevem o que está sendo digitado.
  return <OperationForm key={op.id} id={op.id} initial={operationInput(op)} />;
}

export default function EditOperationPage() {
  return (
    <Suspense fallback={null}>
      <EditOperation />
    </Suspense>
  );
}
