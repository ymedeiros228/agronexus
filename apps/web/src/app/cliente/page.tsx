"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight, ClipboardPlus } from "lucide-react";
import { ClientAvatar, ClientFields, ContactButtons, clientInput } from "@/components/client-bits";
import { ShapeThumb } from "@/components/map-bits";
import { PdfButton } from "@/components/pdf-button";
import { toast } from "@/components/toaster";
import { Button, Card, Empty, LinkButton, PageSkeleton, PageTitle, SectionTitle } from "@/components/ui";
import { VisitRow } from "@/components/visit-row";
import { telLink, updateClient, whatsappLink } from "@/lib/clients";
import { alive, db, removeClient, restoreRemoved } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { formatNumberBR, seasonLabels } from "@/lib/operations";

/** Visitas mostradas na ficha; o resto fica em Visitas. */
const RECENT_VISITS = 6;

/** Código do PDF (pesado): só baixa quando a ficha abre. */
const loadPdfCode = () => import("@/lib/pdf/render");

export default function ClientPage() {
  return (
    <Suspense fallback={null}>
      <ClientDetail />
    </Suspense>
  );
}

function ClientDetail() {
  const id = useSearchParams().get("id") ?? "";
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [pickedLabel, setPickedLabel] = useState("");

  const data = useLiveQuery(async () => {
    const client = await db.clients.get(id);
    const farms = alive(await db.farms.where("clientId").equals(id).toArray()).sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR"),
    );
    const farmIds = farms.map((f) => f.id);
    const [plots, visits] = await Promise.all([
      db.plots.where("farmId").anyOf(farmIds).toArray(),
      db.visits.where("farmId").anyOf(farmIds).toArray(),
    ]);
    const livePlots = alive(plots);
    const seasons = alive(await db.seasons.where("plotId").anyOf(livePlots.map((p) => p.id)).toArray());
    const findings = await db.findings.where("visitId").anyOf(visits.map((v) => v.id)).toArray();
    const photos = await db.photos.where("visitId").anyOf(visits.map((v) => v.id)).count();
    return {
      client: client && !client.deletedAt ? client : null,
      farms,
      plots: livePlots,
      // Safras do cliente, da mais nova para a mais velha.
      labels: seasonLabels(seasons),
      // Muda quando algo do relatório da safra muda: o PDF pronto fica velho.
      version: [...seasons, ...visits, ...findings, ...livePlots].reduce((m, r) => Math.max(m, r.updatedAt), 0) + `.${visits.length}.${findings.length}.${photos}`,
      visits: alive(visits).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt),
    };
  }, [id]);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = clientInput(e.currentTarget);
    if (!input.name.trim()) return;
    await updateClient(id, input);
    setEditOpen(false);
    toast("Cliente atualizado.");
  }

  async function remove() {
    if (!data?.client) return;
    const n = data.farms.length;
    const extra = n ? ` e ${n === 1 ? "a fazenda" : `as ${n} fazendas`}, com talhões e visitas` : "";
    if (!window.confirm(`Remover ${data.client.name}${extra}? Faça um backup antes, se tiver dúvida.`)) return;
    const at = await removeClient(id);
    toast(`${data.client.name} removido.`, { undo: () => restoreRemoved(at) });
    router.push("/clientes");
  }

  if (!data) return <PageSkeleton />;
  if (!data.client) {
    return (
      <Empty
        title="Cliente não encontrado"
        text="O cadastro pode ter sido removido deste aparelho."
        action={<LinkButton href="/clientes">Voltar aos clientes</LinkButton>}
      />
    );
  }

  const { client, farms, plots, visits, labels, version } = data;
  const label = labels.includes(pickedLabel) ? pickedLabel : (labels[0] ?? "");
  const area = plots.reduce((sum, p) => sum + (p.areaHa ?? 0), 0);
  const farmName = new Map(farms.map((f) => [f.id, f.name]));
  const plotName = new Map(plots.map((p) => [p.id, p.name]));
  // Com uma fazenda só, a visita já abre nela.
  const visitHref = farms.length === 1 ? `/visitas/nova?fazenda=${farms[0].id}` : "/visitas/nova";
  const hasContact = !!(whatsappLink(client.phone) || telLink(client.phone));

  return (
    <>
      <div>
        <Link href="/clientes" className="text-sm text-brand">
          ← Clientes
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <ClientAvatar name={client.name} size="size-14 text-lg" />
        <div className="min-w-0 flex-1">
          <PageTitle
            title={client.name}
            subtitle={[client.municipality, client.phone].filter(Boolean).join(" · ") || undefined}
            action={
              <Button variant="ghost" onClick={() => setEditOpen((o) => !o)}>
                {editOpen ? "Cancelar" : "Editar"}
              </Button>
            }
          />
        </div>
      </div>

      {editOpen ? (
        <Card className="space-y-4">
          <form onSubmit={save} className="space-y-4">
            <ClientFields client={client} />
            <Button type="submit" className="w-full">
              Salvar cliente
            </Button>
          </form>
          <Button variant="danger" className="w-full" onClick={remove}>
            Remover cliente
          </Button>
        </Card>
      ) : null}

      {farms.length || hasContact ? (
        // Celular: "Nova visita" numa linha e os contatos embaixo; do tablet para cima, tudo numa linha.
        <div className="flex flex-col gap-2 sm:flex-row">
          {farms.length ? (
            <LinkButton href={visitHref} className="min-h-12 sm:flex-1">
              <ClipboardPlus aria-hidden className="size-5" /> Nova visita
            </LinkButton>
          ) : null}
          {hasContact ? (
            <div className="flex gap-2 sm:flex-1">
              <ContactButtons name={client.name} phone={client.phone} />
            </div>
          ) : null}
        </div>
      ) : null}

      {client.notes ? (
        <Card className="bg-brand-soft/40">
          <p className="whitespace-pre-line text-sm">{client.notes}</p>
        </Card>
      ) : null}

      <dl className="grid grid-cols-3 gap-2">
        {[
          { label: farms.length === 1 ? "Fazenda" : "Fazendas", value: String(farms.length) },
          { label: "Área", value: area ? `${formatNumberBR(area, area >= 1000 ? 0 : 1)} ha` : "—" },
          { label: "Última visita", value: visits[0] ? formatDate(visits[0].date).slice(0, 5) : "—" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-border bg-surface px-3 py-2.5">
            <dt className="text-xs text-muted">{stat.label}</dt>
            <dd className="mt-0.5 truncate text-base font-semibold tabular-nums sm:text-lg">{stat.value}</dd>
          </div>
        ))}
      </dl>

      {label ? (
        <section className="space-y-2" aria-labelledby="relatorio-safra">
          <SectionTitle>
            <span id="relatorio-safra">Relatório final da safra</span>
          </SectionTitle>
          <Card className="space-y-3">
            <p className="text-sm text-muted">
              Do plantio à colheita: talhões, visitas, ocorrências, recomendações e fotos, num PDF para mandar a {client.name}.
            </p>
            {labels.length > 1 ? (
              <label className="block">
                <span className="sr-only">Safra</span>
                <select
                  value={label}
                  onChange={(e) => setPickedLabel(e.target.value)}
                  className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm font-medium"
                >
                  {labels.map((l) => (
                    <option key={l} value={l}>
                      Safra {l}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <PdfButton
              label={`Relatório da safra ${label} em PDF`}
              version={`${label}.${version}`}
              preload={loadPdfCode}
              make={async () => (await loadPdfCode()).seasonPdfBlob({ label, clientId: client.id })}
            />
          </Card>
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <SectionTitle>Fazendas</SectionTitle>
          <LinkButton href={`/fazendas?cliente=${client.id}`} variant="ghost">
            + Fazenda
          </LinkButton>
        </div>
        {farms.length === 0 ? (
          <Empty
            title="Nenhuma fazenda"
            text="Cadastre a fazenda e os talhões deste cliente para registrar as visitas."
            action={<LinkButton href={`/fazendas?cliente=${client.id}`}>+ Fazenda</LinkButton>}
          />
        ) : (
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {farms.map((farm) => {
              const own = plots.filter((p) => p.farmId === farm.id);
              const ha = own.reduce((sum, p) => sum + (p.areaHa ?? 0), 0);
              return (
                <li key={farm.id}>
                  <Link href={`/fazenda?id=${farm.id}`} className="group block active:scale-[0.99]">
                    <Card className="flex items-center gap-4 transition group-hover:border-brand/40 group-hover:shadow-md">
                      <ShapeThumb rings={own.map((p) => p.boundary)} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{farm.name}</p>
                        <p className="mt-0.5 truncate text-sm text-muted">
                          {own.length} {own.length === 1 ? "talhão" : "talhões"}
                          {ha > 0 ? ` · ${formatNumberBR(ha, 1)} ha` : ""}
                          {farm.municipality ? ` · ${farm.municipality}` : ""}
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
      </section>

      {visits.length ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <SectionTitle>Últimas visitas</SectionTitle>
            {visits.length > RECENT_VISITS ? (
              <span className="text-sm text-muted">
                {RECENT_VISITS} de {visits.length}
              </span>
            ) : null}
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {visits.slice(0, RECENT_VISITS).map((v) => (
              <VisitRow
                key={v.id}
                visit={v}
                farmName={farms.length > 1 ? farmName.get(v.farmId) : undefined}
                plotName={plotName.get(v.plotId) ?? "Talhão"}
              />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
