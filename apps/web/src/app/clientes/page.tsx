"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Search } from "lucide-react";
import { ClientAvatar, ClientFields, ContactButtons, clientInput } from "@/components/client-bits";
import { toast } from "@/components/toaster";
import { Button, Card, Chip, Empty, inputClass, PageSkeleton, PageTitle } from "@/components/ui";
import { createClient, filterClients, summarizeClients } from "@/lib/clients";
import { alive, db } from "@/lib/db";
import { formatDate, todayISO } from "@/lib/format";

export default function ClientsPage() {
  return (
    <Suspense fallback={null}>
      <Clients />
    </Suspense>
  );
}

function Clients() {
  const router = useRouter();
  // "Novo cliente" do botão + chega como ?novo=1.
  const asked = useSearchParams().get("novo") === "1";
  const [opened, setOpened] = useState(false);
  const open = opened || asked;
  const [query, setQuery] = useState("");

  const list = useLiveQuery(async () => {
    const [clients, farms, visits] = await Promise.all([db.clients.toArray(), db.farms.toArray(), db.visits.toArray()]);
    return summarizeClients(alive(clients), alive(farms), alive(visits), todayISO());
  });

  function close() {
    setOpened(false);
    if (asked) router.replace("/clientes");
  }

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = clientInput(e.currentTarget);
    if (!input.name.trim()) return;
    const id = await createClient(input);
    toast(`${input.name.trim()} cadastrado. Agora as fazendas.`);
    router.push(`/cliente?id=${id}`);
  }

  if (!list) return <PageSkeleton />;

  const shown = filterClients(list, query);
  const farmCount = list.reduce((n, c) => n + c.farms.length, 0);

  return (
    <>
      <PageTitle
        title="Clientes"
        subtitle={
          list.length
            ? `${list.length} ${list.length === 1 ? "produtor" : "produtores"} · ${farmCount} ${farmCount === 1 ? "fazenda" : "fazendas"}`
            : undefined
        }
        action={
          <Button variant={open ? "secondary" : "primary"} onClick={() => (open ? close() : setOpened(true))}>
            {open ? "Cancelar" : "+ Cliente"}
          </Button>
        }
      />

      {open ? (
        <Card>
          <form onSubmit={add} className="space-y-4">
            <ClientFields autoFocus />
            <Button type="submit" className="w-full">
              Salvar cliente
            </Button>
          </form>
        </Card>
      ) : null}

      {list.length === 0 ? (
        open ? null : (
          <Empty
            title="Nenhum cliente ainda"
            text="Cadastre o produtor que você atende. As fazendas, os talhões e as visitas ficam organizados por ele."
            action={<Button onClick={() => setOpened(true)}>+ Cliente</Button>}
          />
        )
      ) : (
        <>
          {list.length > 3 ? (
            <label className="relative block">
              <span className="sr-only">Buscar cliente</span>
              <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className={`${inputClass} pl-11`}
                placeholder="Cliente, fazenda ou município"
              />
            </label>
          ) : null}

          {shown.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Nenhum cliente com “{query}”.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {shown.map(({ client, farms, lastVisit, overdue }) => (
                <li key={client.id}>
                  <Card className="flex items-center gap-3">
                    <Link href={`/cliente?id=${client.id}`} className="group flex min-w-0 flex-1 items-center gap-3">
                      <ClientAvatar name={client.name} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold group-hover:text-brand">{client.name}</span>
                        <span className="block truncate text-sm text-muted">
                          {farms.length
                            ? farms.map((f) => f.name).join(", ")
                            : "Nenhuma fazenda"}
                          {client.municipality ? ` · ${client.municipality}` : ""}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                          {lastVisit ? `Última visita ${formatDate(lastVisit)}` : "Sem visita"}
                          {overdue ? <Chip tone="warn">{overdue === 1 ? "1 retorno atrasado" : `${overdue} retornos atrasados`}</Chip> : null}
                        </span>
                      </span>
                    </Link>
                    <ContactButtons name={client.name} phone={client.phone} compact />
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
