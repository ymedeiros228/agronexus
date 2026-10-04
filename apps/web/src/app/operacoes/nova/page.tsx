"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { OperationForm } from "@/components/operation-form";
import { OPERATION_KINDS } from "@/lib/operations";

function NewOperation() {
  const params = useSearchParams();
  const kind = OPERATION_KINDS.find((k) => k.kind === params.get("tipo"))?.kind;
  return (
    <OperationForm
      defaultFarmId={params.get("fazenda") ?? ""}
      defaultPlotId={params.get("talhao") ?? ""}
      defaultKind={kind}
    />
  );
}

export default function NewOperationPage() {
  return (
    <Suspense fallback={null}>
      <NewOperation />
    </Suspense>
  );
}
