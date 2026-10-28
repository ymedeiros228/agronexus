"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Button, Card, Empty, Field, inputClass, PageSkeleton, PageTitle } from "@/components/ui";
import { ChevronRight } from "lucide-react";
import { ClientField } from "@/components/client-bits";
import { ShapeThumb } from "@/components/map-bits";
import { toast } from "@/components/toaster";
import { createFarm } from "@/lib/clients";
import { alive, db } from "@/lib/db";
import { formatNumberBR } from "@/lib/operations";

export default function FarmsPage() {
  return (
    <Suspense fallback={null}>
      <Farms />
    </Suspense>
  );
}

function Farms() {
  const router = useRouter();
  // Vindo da ficha do cliente (?cliente=), o formulário já abre com ele escolhido.
  const clientId = useSearchParams().get("cliente") ?? "";
  const [opened, setOpened] = useState(false);
  const data = useLiveQuery(async () => {
    const [farms, plots, clients] = await Promise.all([db.farms.orderBy("name").toArray(), db.plots.toArray(), db.clients.orderBy("name").toArray()]);
    return { farms: alive(farms), plots: alive(plots), clients: alive(clients) };
  });
  const preset = data?.clients.find((c) => c.id === clientId);
  const open = opened || !!preset;

  function close() {
    setOpened(false);
    if (clientId) router.replace("/fazendas");
  }

  async function addFarm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get("name") ?? "").trim();
    if (!name) return;
    const farm = await createFarm({
      name,
      municipality: String(f.get("municipality") ?? ""),
      clientName: String(f.get("client") ?? ""),
    });
    toast(`${farm.name} cadastrada. Agora os talhões.`);
    router.push(`/fazenda?id=${farm.id}`);
  }

  if (!data) return <PageSkeleton />;

  return (
    <>
      <PageTitle
        title="Fazendas"
        action={
          <Button variant={open ? "secondary" : "primary"} onClick={() => (open ? close() : setOpened(true))}>
            {open ? "Cancelar" : "+ Fazenda"}
          </Button>
        }
      />

      {open ? (
        <Card>
          <form onSubmit={addFarm} className="space-y-4">
            <Field label="Nome da fazenda">
              <input name="name" required autoFocus className={inputClass} placeholder="Ex.: Fazenda Boa Esperança" />
            </Field>
            <Field label="Município">
              <input name="municipality" defaultValue={preset?.municipality} className={inputClass} placeholder="Ex.: Balsas" />
            </Field>
            <ClientField clients={data.clients} defaultValue={preset?.name} />
            <Button type="submit" className="w-full">
              Salvar fazenda
            </Button>
          </form>
        </Card>
      ) : null}

      {data.farms.length === 0 && !open ? (
        <Empty
          title="Nenhuma fazenda ainda"
          text="Cadastre a primeira para começar a registrar visitas."
          action={<Button onClick={() => setOpened(true)}>+ Fazenda</Button>}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {data.farms.map((farm) => {
            const plots = data.plots.filter((p) => p.farmId === farm.id);
            const area = plots.reduce((sum, p) => sum + (p.areaHa ?? 0), 0);
            return (
              <li key={farm.id}>
                <Link href={`/fazenda?id=${farm.id}`} className="group block active:scale-[0.99]">
                  <Card className="flex items-center gap-4 transition group-hover:border-brand/40 group-hover:shadow-md">
                    <ShapeThumb rings={plots.map((p) => p.boundary)} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{farm.name}</p>
                      <p className="mt-0.5 truncate text-sm text-muted">
                        {[farm.municipality, farm.owner].filter(Boolean).join(" · ") || "Sem detalhes"}
                      </p>
                      <p className="mt-2 flex flex-wrap gap-x-3 text-sm">
                        <span>
                          <b className="font-semibold tabular-nums">{plots.length}</b>{" "}
                          <span className="text-muted">{plots.length === 1 ? "talhão" : "talhões"}</span>
                        </span>
                        {area > 0 ? (
                          <span>
                            <b className="font-semibold tabular-nums">{formatNumberBR(area, 1)}</b> <span className="text-muted">ha</span>
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <ChevronRight className="size-5 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-brand" />
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
