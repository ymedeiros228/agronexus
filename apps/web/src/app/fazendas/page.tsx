"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Button, Card, Empty, Field, PageTitle, inputClass } from "@/components/ui";
import { alive, db, newBase } from "@/lib/db";

export default function FarmsPage() {
  const [open, setOpen] = useState(false);
  const data = useLiveQuery(async () => {
    const [farms, plots] = await Promise.all([db.farms.orderBy("name").toArray(), db.plots.toArray()]);
    return { farms: alive(farms), plots: alive(plots) };
  });

  async function addFarm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const name = String(f.get("name") ?? "").trim();
    if (!name) return;
    await db.farms.add({
      ...newBase(),
      name,
      municipality: String(f.get("municipality") ?? "").trim(),
      owner: String(f.get("owner") ?? "").trim(),
    });
    form.reset();
    setOpen(false);
  }

  if (!data) return null;

  return (
    <>
      <PageTitle
        title="Fazendas"
        action={
          <Button variant={open ? "secondary" : "primary"} onClick={() => setOpen((o) => !o)}>
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
              <input name="municipality" className={inputClass} placeholder="Ex.: Balsas" />
            </Field>
            <Field label="Produtor / responsável">
              <input name="owner" className={inputClass} />
            </Field>
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
          action={<Button onClick={() => setOpen(true)}>+ Fazenda</Button>}
        />
      ) : (
        <ul className="space-y-3">
          {data.farms.map((farm) => {
            const count = data.plots.filter((p) => p.farmId === farm.id).length;
            return (
              <li key={farm.id}>
                <Link href={`/fazenda?id=${farm.id}`} className="block active:scale-[0.99]">
                  <Card className="transition hover:border-brand/40">
                    <p className="font-medium">{farm.name}</p>
                    <p className="mt-0.5 text-sm text-muted">
                      {[farm.municipality, farm.owner].filter(Boolean).join(" · ") || "Sem detalhes"}
                    </p>
                    <p className="mt-2 text-sm text-muted">
                      {count} {count === 1 ? "talhão" : "talhões"}
                    </p>
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
