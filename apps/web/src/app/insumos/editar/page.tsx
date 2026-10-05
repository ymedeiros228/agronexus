"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { SupplyForm } from "@/components/supply-form";
import { Empty, LinkButton, PageSkeleton } from "@/components/ui";
import { db } from "@/lib/db";

function EditSupply() {
  const id = useSearchParams().get("id") ?? "";
  const supply = useLiveQuery(async () => (await db.supplies.get(id)) ?? null, [id]);

  if (supply === undefined) return <PageSkeleton />;
  if (!supply || supply.deletedAt) {
    return (
      <Empty
        title="Insumo não encontrado"
        text="Ele pode ter sido removido deste aparelho."
        action={<LinkButton href="/insumos">Voltar aos insumos</LinkButton>}
      />
    );
  }
  const { name, category, unit, minQty, notes } = supply;
  return <SupplyForm key={supply.id} id={supply.id} initial={{ name, category, unit, minQty, notes }} />;
}

export default function EditSupplyPage() {
  return (
    <Suspense fallback={null}>
      <EditSupply />
    </Suspense>
  );
}
