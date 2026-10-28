import { alive, clientKey, db, newBase, planClientsFromOwners, type Client, type Farm, type Visit } from "./db";

/**
 * Carteira de clientes (frente do engenheiro, ADR 0008): produtor → fazendas → talhões.
 * O nome do cliente também fica em `farm.owner`, para backups, planilhas e versões antigas.
 */

export type ClientInput = Pick<Client, "name" | "phone" | "municipality" | "notes">;

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

export async function createClient(input: ClientInput): Promise<string> {
  const client: Client = {
    ...newBase(),
    name: clean(input.name),
    phone: clean(input.phone),
    municipality: clean(input.municipality),
    notes: input.notes.trim(),
  };
  if (!client.name) throw new Error("Informe o nome do cliente.");
  await db.clients.add(client);
  return client.id;
}

/** Atualiza o cliente; se o nome mudou, as fazendas dele passam a mostrar o nome novo. */
export async function updateClient(id: string, input: ClientInput): Promise<void> {
  const name = clean(input.name);
  if (!name) throw new Error("Informe o nome do cliente.");
  const now = Date.now();
  await db.transaction("rw", db.clients, db.farms, async () => {
    const old = await db.clients.get(id);
    if (!old || old.deletedAt) throw new Error("Cliente não encontrado.");
    await db.clients.update(id, {
      name,
      phone: clean(input.phone),
      municipality: clean(input.municipality),
      notes: input.notes.trim(),
      updatedAt: now,
    });
    if (old.name !== name) {
      await db.farms
        .where("clientId")
        .equals(id)
        .filter((f) => !f.deletedAt)
        .modify({ owner: name, updatedAt: now });
    }
  });
}

/**
 * Acha o cliente pelo nome (sem diferenciar maiúscula e acento) ou cria um novo.
 * Nome vazio = fazenda sem cliente. Dentro de uma transação que inclua `clients`.
 */
async function clientFor(name: string, municipality: string): Promise<Client | null> {
  const n = clean(name);
  if (!n) return null;
  const key = clientKey(n);
  const found = alive(await db.clients.toArray()).find((c) => clientKey(c.name) === key);
  if (found) return found;
  const client: Client = { ...newBase(), name: n, phone: "", municipality: clean(municipality), notes: "" };
  await db.clients.add(client);
  return client;
}

export type FarmInput = { name: string; municipality: string; clientName: string };

export async function createFarm(input: FarmInput): Promise<Farm> {
  const name = clean(input.name);
  if (!name) throw new Error("Informe o nome da fazenda.");
  return db.transaction("rw", db.clients, db.farms, async () => {
    const client = await clientFor(input.clientName, input.municipality);
    const farm: Farm = {
      ...newBase(),
      name,
      municipality: clean(input.municipality),
      owner: client?.name ?? "",
      clientId: client?.id ?? null,
    };
    await db.farms.add(farm);
    return farm;
  });
}

export async function editFarm(id: string, input: FarmInput): Promise<void> {
  const name = clean(input.name);
  if (!name) throw new Error("Informe o nome da fazenda.");
  await db.transaction("rw", db.clients, db.farms, async () => {
    const client = await clientFor(input.clientName, input.municipality);
    await db.farms.update(id, {
      name,
      municipality: clean(input.municipality),
      owner: client?.name ?? "",
      clientId: client?.id ?? null,
      updatedAt: Date.now(),
    });
  });
}

/**
 * Liga a clientes as fazendas que só têm o produtor escrito (backup antigo restaurado,
 * fazenda de exemplo). Devolve quantas fazendas foram ligadas.
 */
export async function linkOwnersToClients(): Promise<number> {
  return db.transaction("rw", db.clients, db.farms, async () => {
    const [farms, clients] = await Promise.all([db.farms.toArray(), db.clients.toArray()]);
    const plan = planClientsFromOwners(farms, clients, Date.now());
    if (plan.clients.length) await db.clients.bulkAdd(plan.clients);
    // Não é edição do usuário: updatedAt fica como estava (igual à migração v7).
    for (const [farmId, clientId] of plan.links) await db.farms.update(farmId, { clientId });
    return plan.links.length;
  });
}

export type ClientSummary = {
  client: Client;
  farms: Farm[];
  /** Fazenda, município e nome juntos, sem acento, para a busca. */
  search: string;
  lastVisit: string | null;
  overdue: number;
};

/** Linha de cada cliente na carteira, com a última visita e os retornos atrasados. Pura. */
export function summarizeClients(clients: Client[], farms: Farm[], visits: Visit[], today: string): ClientSummary[] {
  return clients
    .map((client) => {
      const own = farms.filter((f) => f.clientId === client.id).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
      const farmIds = new Set(own.map((f) => f.id));
      const theirs = visits.filter((v) => farmIds.has(v.farmId));
      const lastVisit = theirs.reduce<string | null>((max, v) => (!max || v.date > max ? v.date : max), null);
      const overdue = theirs.filter((v) => v.followUpDate && !v.followUpDone && v.followUpDate < today).length;
      const search = clientKey([client.name, client.municipality, ...own.flatMap((f) => [f.name, f.municipality])].join(" "));
      return { client, farms: own, search, lastVisit, overdue };
    })
    .sort((a, b) => a.client.name.localeCompare(b.client.name, "pt-BR"));
}

export function filterClients(list: ClientSummary[], query: string): ClientSummary[] {
  const words = clientKey(query).split(" ").filter(Boolean);
  return words.length ? list.filter((c) => words.every((w) => c.search.includes(w))) : list;
}

/** Link do WhatsApp: só dígitos, com o 55 do Brasil quando o número veio sem ele. */
export function whatsappLink(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return `https://wa.me/${digits.length <= 11 ? `55${digits}` : digits}`;
}

export function telLink(phone: string): string | null {
  const digits = phone.replace(/[^\d+]/g, "");
  return digits.replace(/\D/g, "").length >= 8 ? `tel:${digits}` : null;
}

/** Iniciais para o avatar: "João Ribeiro" → "JR". */
export function initials(name: string): string {
  const parts = clean(name).split(" ").filter((p) => p.length > 2 || /^[A-ZÁÉÍÓÚ]/.test(p));
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}
