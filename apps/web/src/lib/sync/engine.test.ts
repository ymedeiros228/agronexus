import { beforeEach, describe, expect, it } from "vitest";
import { createFarm } from "../clients";
import { db, getMeta, newBase, restoreRemoved, removeFarm } from "../db";
import { loadDemo } from "../demo";
import {
  CURSOR_KEY,
  countPending,
  getSyncState,
  photoPath,
  receive,
  send,
  syncNow,
  type OutgoingRow,
  type PushResult,
  type Remote,
  type RemoteRow,
  friendlyError,
} from "./engine";

const ACCOUNT = "conta-1";

/** Servidor falso com a mesma regra da função `enviar_registros`: vence a edição mais recente. */
class FakeServer implements Remote {
  rows = new Map<string, RemoteRow>();
  files = new Map<string, Blob>();
  offline = new Set<string>();
  pushes = 0;
  /** Roda depois que o servidor gravou e antes de a resposta chegar ao aparelho. */
  duringPush?: () => Promise<void>;
  private clock = 0;

  stamp() {
    return new Date(Date.UTC(2026, 9, 28, 12) + ++this.clock * 1000).toISOString();
  }

  /** Outro aparelho gravou direto no servidor. */
  put(row: OutgoingRow) {
    const saved = { ...row, dados: JSON.parse(JSON.stringify(row.dados)), servidor_em: this.stamp() };
    this.rows.set(`${row.tabela}:${row.id}`, saved);
    return saved;
  }

  async pull(_account: string, since: string | null, limit: number) {
    return [...this.rows.values()]
      .filter((r) => !since || r.servidor_em > since)
      .sort((a, b) => a.servidor_em.localeCompare(b.servidor_em))
      .slice(0, limit);
  }

  async push(_account: string, rows: OutgoingRow[]): Promise<PushResult[]> {
    this.pushes++;
    const out = rows.map((r) => {
      const current = this.rows.get(`${r.tabela}:${r.id}`);
      if (current && current.atualizado_em > r.atualizado_em) return { ...current, aceito: false };
      return { ...this.put(r), aceito: true };
    });
    await this.duringPush?.();
    return out;
  }

  async uploadPhoto(path: string, blob: Blob) {
    this.files.set(path, blob);
  }

  async downloadPhoto(path: string) {
    return this.offline.has(path) ? null : (this.files.get(path) ?? null);
  }
}

let server: FakeServer;

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  server = new FakeServer();
});

const farmRow = (id: string, name: string, updatedAt: number): OutgoingRow => ({
  tabela: "farms",
  id,
  dados: { id, name, municipality: "", owner: "", createdAt: 1, updatedAt },
  atualizado_em: updatedAt,
  removido_em: null,
});

describe("pendência automática", () => {
  it("toda gravação do app fica pendente; o que vem da nuvem não", async () => {
    const farm = await createFarm({ name: "Santa Luzia", municipality: "", clientName: "João" });
    expect((await db.farms.get(farm.id))?._pendente).toBe(1);
    expect((await db.clients.get(farm.clientId!))?._pendente).toBe(1);

    server.put(farmRow("f-outro", "Do outro aparelho", 5));
    await receive(server, ACCOUNT);
    const received = await db.farms.get("f-outro");
    expect(received?._pendente).toBe(0);
    expect(received?.name).toBe("Do outro aparelho");

    // Editar aqui o que veio de lá volta a ficar pendente.
    await db.farms.update("f-outro", { name: "Editada aqui", updatedAt: 6 });
    expect((await db.farms.get("f-outro"))?._pendente).toBe(1);
  });

  it("remover e desfazer também sobem", async () => {
    const farm = await createFarm({ name: "Santa Luzia", municipality: "", clientName: "" });
    await send(server, ACCOUNT);
    const at = await removeFarm(farm.id);
    expect(await countPending()).toBe(1);
    await send(server, ACCOUNT);
    expect(server.rows.get(`farms:${farm.id}`)?.removido_em).toBe(at);
    await restoreRemoved(at);
    await send(server, ACCOUNT);
    expect(server.rows.get(`farms:${farm.id}`)?.removido_em).toBeNull();
  });
});

describe("envio", () => {
  it("sobe o pendente, guarda o carimbo e não manda o exemplo", async () => {
    await loadDemo();
    const farm = await createFarm({ name: "Santa Luzia", municipality: "Balsas", clientName: "João" });
    expect(await countPending()).toBe(2); // fazenda e cliente; o exemplo não conta

    await send(server, ACCOUNT);
    expect([...server.rows.keys()].sort()).toEqual([`clients:${farm.clientId}`, `farms:${farm.id}`].sort());
    const saved = await db.farms.get(farm.id);
    expect(saved?._pendente).toBe(0);
    expect(saved?._sync).toBe(server.rows.get(`farms:${farm.id}`)?.servidor_em);
    expect(server.rows.get(`farms:${farm.id}`)?.dados).not.toHaveProperty("_pendente");
    expect(await countPending()).toBe(0);
  });

  it("reenviar não duplica e a própria versão não volta como novidade", async () => {
    await createFarm({ name: "Santa Luzia", municipality: "", clientName: "" });
    await send(server, ACCOUNT);
    await send(server, ACCOUNT);
    expect(server.rows.size).toBe(1);
    expect(server.pushes).toBe(1); // nada pendente na segunda vez

    await receive(server, ACCOUNT);
    expect(await countPending()).toBe(0);
  });

  it("foto: o arquivo sobe antes do registro, e o registro vai sem o arquivo", async () => {
    await db.photos.add({
      ...newBase(),
      id: "ph1",
      visitId: "v1",
      blob: new Blob(["jpg"], { type: "image/jpeg" }),
      label: "",
      takenAt: 1,
      lat: null,
      lng: null,
    });
    await send(server, ACCOUNT);
    expect(server.files.has(photoPath(ACCOUNT, "ph1"))).toBe(true);
    expect(server.rows.get("photos:ph1")?.dados).not.toHaveProperty("blob");
  });

  it("o que mudou durante o envio continua pendente e sobe na rodada seguinte", async () => {
    const farm = await createFarm({ name: "Santa Luzia", municipality: "", clientName: "" });
    server.duringPush = async () => {
      server.duringPush = undefined;
      await db.farms.update(farm.id, { name: "Santa Luzia II", updatedAt: Date.now() + 1 });
    };
    await send(server, ACCOUNT);
    expect((await db.farms.get(farm.id))?._pendente).toBe(1);

    await send(server, ACCOUNT);
    expect(server.rows.get(`farms:${farm.id}`)?.dados.name).toBe("Santa Luzia II");
    expect((await db.farms.get(farm.id))?._pendente).toBe(0);
  });

  it("servidor com edição mais recente: a cópia daqui é trocada pela de lá", async () => {
    server.put(farmRow("f1", "Nome novo (outro aparelho)", 200));
    await db.farms.add({ id: "f1", name: "Nome velho", municipality: "", owner: "", createdAt: 1, updatedAt: 100 });

    await syncNow(server, ACCOUNT);
    const local = await db.farms.get("f1");
    expect(local?.name).toBe("Nome novo (outro aparelho)");
    expect(local?._pendente).toBe(0);
    expect(server.rows.get("farms:f1")?.dados.name).toBe("Nome novo (outro aparelho)");
  });
});

describe("recebimento", () => {
  it("traz o que veio de outro aparelho sem pisar no que ainda não subiu daqui", async () => {
    await db.farms.add({ id: "f-local", name: "Editada aqui", municipality: "", owner: "", createdAt: 1, updatedAt: 300 });
    server.put(farmRow("f-local", "Versão antiga da nuvem", 100));
    server.put(farmRow("f-nova", "Nova do outro aparelho", 150));

    await receive(server, ACCOUNT);
    expect((await db.farms.get("f-local"))?.name).toBe("Editada aqui");
    expect((await db.farms.get("f-nova"))?.name).toBe("Nova do outro aparelho");
    expect(await getMeta(CURSOR_KEY)).toBe(server.rows.get("farms:f-nova")?.servidor_em);
  });

  it("foto que não baixou segura o carimbo e vem na próxima rodada", async () => {
    server.files.set(photoPath(ACCOUNT, "ph1"), new Blob(["jpg"], { type: "image/jpeg" }));
    server.offline.add(photoPath(ACCOUNT, "ph1"));
    const photo = server.put({
      tabela: "photos",
      id: "ph1",
      dados: { id: "ph1", visitId: "v1", label: "Percevejo", takenAt: 1, lat: null, lng: null, createdAt: 1, updatedAt: 1 },
      atualizado_em: 1,
      removido_em: null,
    });
    server.put(farmRow("f-depois", "Depois da foto", 2));

    await receive(server, ACCOUNT);
    expect(await db.photos.get("ph1")).toBeUndefined();
    expect((await db.farms.get("f-depois"))?.name).toBe("Depois da foto");
    expect(await getMeta(CURSOR_KEY)).toBeUndefined();

    server.offline.clear();
    await receive(server, ACCOUNT);
    const saved = await db.photos.get("ph1");
    expect(saved?.label).toBe("Percevejo");
    expect(saved?.blob).toBeInstanceOf(Blob);
    expect(await getMeta(CURSOR_KEY)).toBe(server.rows.get("farms:f-depois")?.servidor_em);
    expect(photo.servidor_em < server.rows.get("farms:f-depois")!.servidor_em).toBe(true);
  });

  it("edição de uma foto que já está aqui mantém o arquivo", async () => {
    const blob = new Blob(["jpg"], { type: "image/jpeg" });
    await db.photos.add({ ...newBase(), id: "ph1", visitId: "v1", blob, label: "", takenAt: 1, lat: null, lng: null });
    await send(server, ACCOUNT);
    server.files.clear(); // nem precisa baixar de novo
    server.put({
      tabela: "photos",
      id: "ph1",
      dados: { ...(server.rows.get("photos:ph1")!.dados), label: "Ferrugem", updatedAt: Date.now() + 5 },
      atualizado_em: Date.now() + 5,
      removido_em: null,
    });
    await receive(server, ACCOUNT);
    const saved = await db.photos.get("ph1");
    expect(saved?.label).toBe("Ferrugem");
    expect(saved?.blob).toBeInstanceOf(Blob);
  });
});

describe("rodada", () => {
  it("guarda o erro para a tela e limpa quando volta a funcionar", async () => {
    await createFarm({ name: "Santa Luzia", municipality: "", clientName: "" });
    const broken: Remote = { ...server, pull: server.pull.bind(server), push: async () => Promise.reject(new Error("sem sinal")), uploadPhoto: server.uploadPhoto.bind(server), downloadPhoto: server.downloadPhoto.bind(server) };
    await syncNow(broken, ACCOUNT);
    expect(getSyncState().error).toBe("sem sinal");
    expect(await countPending()).toBe(1);

    await syncNow(server, ACCOUNT);
    expect(getSyncState().error).toBeNull();
    expect(friendlyError(new TypeError("Failed to fetch"))).toBe("Sem conexão com o servidor. Confira a internet e tente de novo.");
    expect(getSyncState().lastOk).not.toBeNull();
    expect(await countPending()).toBe(0);
  });
});
