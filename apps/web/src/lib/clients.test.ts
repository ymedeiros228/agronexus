import { beforeEach, describe, expect, it } from "vitest";
import {
  createClient,
  createFarm,
  editFarm,
  filterClients,
  initials,
  linkOwnersToClients,
  summarizeClients,
  updateClient,
  whatsappLink,
} from "./clients";
import { alive, db, newBase, planClientsFromOwners, removeClient, restoreRemoved, type Farm, type Visit } from "./db";

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

const farm = (id: string, owner: string, over: Partial<Farm> = {}): Farm => ({
  ...newBase(),
  id,
  name: `Fazenda ${id}`,
  municipality: "Balsas",
  owner,
  ...over,
});

describe("planClientsFromOwners", () => {
  it("um cliente por produtor, sem diferenciar maiúscula, acento e espaço", () => {
    const { clients, links } = planClientsFromOwners(
      [farm("f1", "João Ribeiro"), farm("f2", " joao  ribeiro "), farm("f3", "Maria"), farm("f4", "")],
      [],
      5,
    );
    expect(clients.map((c) => c.name)).toEqual(["João Ribeiro", "Maria"]);
    expect(clients[0].municipality).toBe("Balsas");
    expect(links.map(([f]) => f)).toEqual(["f1", "f2", "f3"]);
    expect(links[0][1]).toBe(links[1][1]);
  });

  it("reaproveita cliente existente e ignora fazenda já ligada", () => {
    const existing = [{ ...newBase(), id: "c1", name: "Maria", phone: "", municipality: "", notes: "" }];
    const { clients, links } = planClientsFromOwners(
      [farm("f1", "MARIA"), farm("f2", "Outro", { clientId: "c9" })],
      existing,
      5,
    );
    expect(clients).toHaveLength(0);
    expect(links).toEqual([["f1", "c1"]]);
  });

  it("cliente só de fazenda removida nasce removido", () => {
    const { clients } = planClientsFromOwners([farm("f1", "Antigo", { deletedAt: 9 })], [], 5);
    expect(clients[0].deletedAt).toBe(9);
  });
});

describe("fazenda com cliente", () => {
  it("cria o cliente pelo nome digitado ou usa o que já existe", async () => {
    const f1 = await createFarm({ name: " Santa Luzia ", municipality: "Balsas", clientName: "João Ribeiro" });
    const f2 = await createFarm({ name: "Retiro", municipality: "Balsas", clientName: "joão ribeiro" });
    const f3 = await createFarm({ name: "Própria", municipality: "", clientName: "" });
    expect(f1.name).toBe("Santa Luzia");
    expect(f1.clientId).toBeTruthy();
    expect(f2.clientId).toBe(f1.clientId);
    expect(f2.owner).toBe("João Ribeiro");
    expect(f3.clientId).toBeNull();
    expect(await db.clients.count()).toBe(1);
  });

  it("trocar o cliente na edição liga a fazenda ao outro", async () => {
    const f = await createFarm({ name: "Santa Luzia", municipality: "", clientName: "João" });
    await editFarm(f.id, { name: "Santa Luzia", municipality: "", clientName: "Maria" });
    const saved = await db.farms.get(f.id);
    expect(saved?.owner).toBe("Maria");
    expect((await db.clients.get(saved!.clientId!))?.name).toBe("Maria");
  });

  it("renomear o cliente atualiza o produtor das fazendas", async () => {
    const id = await createClient({ name: "Joao", phone: "", municipality: "", notes: "" });
    const f = await createFarm({ name: "Santa Luzia", municipality: "", clientName: "Joao" });
    await updateClient(id, { name: "João Ribeiro", phone: "(99) 98877-1020", municipality: "Balsas", notes: "" });
    expect((await db.farms.get(f.id))?.owner).toBe("João Ribeiro");
    expect((await db.clients.get(id))?.phone).toBe("(99) 98877-1020");
  });

  it("liga fazendas de backup antigo aos clientes sem mexer no updatedAt", async () => {
    await db.farms.bulkAdd([farm("f1", "Maria", { updatedAt: 7 }), farm("f2", "Maria")]);
    expect(await linkOwnersToClients()).toBe(2);
    const [f1, f2] = await db.farms.bulkGet(["f1", "f2"]);
    expect(f1?.clientId).toBe(f2?.clientId);
    expect(f1?.updatedAt).toBe(7);
    expect(await linkOwnersToClients()).toBe(0);
  });
});

describe("removeClient", () => {
  it("leva as fazendas e o que há nelas; desfazer volta tudo", async () => {
    const f = await createFarm({ name: "Santa Luzia", municipality: "", clientName: "João" });
    const other = await createFarm({ name: "Outra", municipality: "", clientName: "Maria" });
    await db.plots.add({ ...newBase(), id: "p1", farmId: f.id, name: "T-1", areaHa: 10 });
    const at = await removeClient(f.clientId!);
    expect((await db.farms.get(f.id))?.deletedAt).toBe(at);
    expect((await db.plots.get("p1"))?.deletedAt).toBe(at);
    expect((await db.farms.get(other.id))?.deletedAt).toBeUndefined();
    await restoreRemoved(at);
    expect(alive(await db.clients.toArray())).toHaveLength(2);
    expect((await db.plots.get("p1"))?.deletedAt).toBeUndefined();
  });
});

describe("carteira", () => {
  const visit = (id: string, farmId: string, date: string, over: Partial<Visit> = {}): Visit => ({
    ...newBase(),
    id,
    farmId,
    plotId: "p",
    date,
    stage: "",
    observations: "",
    recommendation: "",
    followUpDate: null,
    followUpDone: false,
    ...over,
  });

  it("resume última visita, retornos atrasados e busca por fazenda ou município sem acento", () => {
    const clients = [
      { ...newBase(), id: "c1", name: "Maria Alves", phone: "", municipality: "Tasso Fragoso", notes: "" },
      { ...newBase(), id: "c2", name: "João Ribeiro", phone: "", municipality: "Balsas", notes: "" },
    ];
    const farms = [farm("f1", "João", { clientId: "c2", name: "Santa Luzia" }), farm("f2", "Maria", { clientId: "c1" })];
    const list = summarizeClients(clients, farms, [
      visit("v1", "f1", "2026-12-01", { followUpDate: "2026-12-10" }),
      visit("v2", "f1", "2026-12-12"),
    ], "2026-12-20");
    expect(list.map((c) => c.client.name)).toEqual(["João Ribeiro", "Maria Alves"]);
    expect(list[0].lastVisit).toBe("2026-12-12");
    expect(list[0].overdue).toBe(1);
    expect(filterClients(list, "santa luz").map((c) => c.client.id)).toEqual(["c2"]);
    expect(filterClients(list, "TASSO").map((c) => c.client.id)).toEqual(["c1"]);
    expect(filterClients(list, "joao")).toHaveLength(1);
    expect(filterClients(list, "")).toHaveLength(2);
  });

  it("monta link do WhatsApp com 55 e iniciais do nome", () => {
    expect(whatsappLink("(99) 98877-1020")).toBe("https://wa.me/5599988771020");
    expect(whatsappLink("+55 99 98877-1020")).toBe("https://wa.me/5599988771020");
    expect(whatsappLink("1234")).toBeNull();
    expect(initials("João da Silva")).toBe("JS");
    expect(initials("maria")).toBe("M");
  });
});
