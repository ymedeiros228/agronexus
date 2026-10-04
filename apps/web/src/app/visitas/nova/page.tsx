"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { VisitForm } from "@/components/visit-form";

function NewVisit() {
  const params = useSearchParams();
  return <VisitForm defaultFarmId={params.get("fazenda") ?? ""} defaultPlotId={params.get("talhao") ?? ""} />;
}

export default function NewVisitPage() {
  return (
    <Suspense fallback={null}>
      <NewVisit />
    </Suspense>
  );
}
