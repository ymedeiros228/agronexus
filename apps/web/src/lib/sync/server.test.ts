// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startServer, type Server } from "./pglite-harness";

/** O SQL do Supabase (supabase/migrations) num Postgres local, com RLS de verdade. */

let s: Server;
beforeAll(async () => {
  s = await startServer();
}, 60_000);
afterAll(() => s?.close());

const contaDe = async (userId: string) =>
  (await s.admin.query<{ conta_id: string }>("select conta_id from public.membros where usuario_id = $1", [userId]))[0].conta_id;

const envia = (userId: string, conta: string, rows: unknown[]) =>
  s.as(userId).query<{ aceito: boolean }>("select * from public.enviar_registros($1, $2)", [conta, JSON.stringify(rows)]);

const recebe = (userId: string | null, conta: string) =>
  s.as(userId).query<{ tabela: string; id: string; dados: Record<string, unknown> }>("select * from public.receber_registros($1, null, 1000)", [conta]);

const linha = (id: string, dados: Record<string, unknown> = {}, atualizado = 1) => ({
  tabela: "farms",
  id,
  dados: { id, ...dados },
  atualizado_em: atualizado,
  removido_em: null,
});

describe("contas e isolamento", () => {
  it("cada pessoa nova ganha a sua conta como dona", async () => {
    const ana = await s.newUser("ana@teste.br", { nome: "Ana" });
    const membros = await s.as(ana).query<{ papel: string }>("select papel from public.membros");
    expect(membros).toEqual([{ papel: "dono" }]);
  });

  it("uma pessoa não vê os registros de outra conta, e o visitante não vê nada", async () => {
    const a = await s.newUser("a@teste.br");
    const b = await s.newUser("b@teste.br");
    const contaA = await contaDe(a);
    expect((await envia(a, contaA, [linha("f-a")]))[0].aceito).toBe(true);

    expect((await recebe(a, contaA)).map((r) => r.id)).toEqual(["f-a"]);
    await expect(recebe(b, contaA)).rejects.toThrow(/sem-acesso/);
    await expect(s.as(b).query("select id from public.registros")).rejects.toThrow(/permission denied/);
    await expect(s.as(null).query("select id from public.registros")).rejects.toThrow(/permission denied/);
    await expect(recebe(null, contaA)).rejects.toThrow(/permission denied/);
  });

  it("vence a edição mais recente e reenviar não duplica", async () => {
    const u = await s.newUser("c@teste.br");
    const conta = await contaDe(u);
    await envia(u, conta, [linha("f-c", { name: "nova" }, 10)]);
    const [velha] = await envia(u, conta, [linha("f-c", { name: "velha" }, 5)]);
    expect(velha.aceito).toBe(false);
    await envia(u, conta, [linha("f-c", { name: "nova" }, 10)]);
    expect((await recebe(u, conta)).map((r) => r.dados.name)).toEqual(["nova"]);
  });
});

describe("papéis, tipo de conta e administrador", () => {
  it("a conta nasce com o tipo escolhido no cadastro", async () => {
    const u = await s.newUser("empresa@teste.br", { nome: "Ana", tipo: "empresa", empresa: "Agro Sul" });
    const contas = await s.as(u).query("select nome, tipo, papel from public.minhas_contas()");
    expect(contas).toEqual([{ nome: "Agro Sul", tipo: "empresa", papel: "dono" }]);
  });

  it("quem se cadastra com convite não ganha conta própria", async () => {
    const u = await s.newUser("convidado@teste.br", { nome: "Zé", convite: "KX4TPM" });
    expect(await s.as(u).query("select * from public.minhas_contas()")).toEqual([]);
  });

  it("só o administrador lista todas as contas", async () => {
    const comum = await s.newUser("comum@teste.br");
    await expect(s.as(comum).query("select * from public.admin_contas()")).rejects.toThrow(/so-admin/);
    expect((await s.as(comum).query<{ sou_admin: boolean }>("select public.sou_admin()"))[0].sou_admin).toBe(false);

    const yuri = await s.newUser("admin@teste.br");
    await s.admin.query("insert into privado.administradores (usuario_id) values ($1)", [yuri]);
    const todas = await s.as(yuri).query<{ conta_id: string }>("select * from public.admin_contas()");
    expect(todas.length).toBeGreaterThanOrEqual(2);
    // Ninguém se faz admin pela API.
    await expect(s.as(comum).query("insert into privado.administradores (usuario_id) values ($1)", [comum])).rejects.toThrow(/permission denied/);
  });

  it("leitor e produtor não gravam; técnico e estagiário gravam", async () => {
    const dono = await s.newUser("dono-papeis@teste.br");
    const conta = await contaDe(dono);
    for (const papel of ["leitor", "produtor", "tecnico", "estagiario"]) {
      const u = await s.newUser(`${papel}@teste.br`, { convite: "X" });
      await s.admin.query("insert into public.membros (conta_id, usuario_id, papel) values ($1, $2, $3)", [conta, u, papel]);
      const tentativa = envia(u, conta, [linha(`f-${papel}`)]);
      if (papel === "leitor" || papel === "produtor") await expect(tentativa).rejects.toThrow(/sem-permissao/);
      else expect((await tentativa)[0].aceito).toBe(true);
    }
  });
});

describe("acesso por fazenda e dinheiro", () => {
  const op = (id: string, fazenda: string, cost: number | null, extra: Record<string, unknown> = {}, at = 1) => ({
    tabela: "operations",
    id,
    dados: { id, farmId: fazenda, cost, description: "", ...extra },
    atualizado_em: at,
    removido_em: null,
    fazenda_id: fazenda,
  });
  const de = (tabela: string, id: string, fazenda: string | null) => ({ tabela, id, dados: { id }, atualizado_em: 1, removido_em: null, fazenda_id: fazenda });

  let dono: string, tecnico: string, produtor: string, conta: string;
  beforeAll(async () => {
    dono = await s.newUser("dono-faz@teste.br");
    conta = await contaDe(dono);
    tecnico = await s.newUser("tec-faz@teste.br", { convite: "X" });
    produtor = await s.newUser("prod-faz@teste.br", { convite: "X" });
    for (const [u, papel] of [[tecnico, "tecnico"], [produtor, "produtor"]]) {
      await s.admin.query("insert into public.membros (conta_id, usuario_id, papel) values ($1, $2, $3)", [conta, u, papel]);
      await s.admin.query("insert into public.acessos_fazenda (conta_id, usuario_id, fazenda_id) values ($1, $2, 'F1')", [conta, u]);
    }
    await envia(dono, conta, [
      de("farms", "F1", "F1"),
      de("farms", "F2", "F2"),
      de("supplies", "s1", null),
      de("sales", "v1", "F1"),
      de("expenses", "d1", null),
      op("o1", "F1", 5000),
    ]);
  });

  it("técnico recebe a fazenda dele e o que é da conta toda, sem a outra fazenda nem dinheiro", async () => {
    const rows = await recebe(tecnico, conta);
    expect(rows.map((r) => r.id).sort()).toEqual(["F1", "o1", "s1"]);
    expect(rows.find((r) => r.id === "o1")!.dados).not.toHaveProperty("cost");
  });

  it("produtor recebe só a fazenda atribuída", async () => {
    expect((await recebe(produtor, conta)).map((r) => r.id).sort()).toEqual(["F1", "o1"]);
  });

  it("dono recebe tudo, com custo", async () => {
    const rows = await recebe(dono, conta);
    expect(rows).toHaveLength(6);
    expect(rows.find((r) => r.id === "o1")!.dados.cost).toBe(5000);
  });

  it("técnico edita a operação sem o custo e o custo do gestor continua no servidor", async () => {
    const semCusto = { ...op("o1", "F1", null, {}, 2), dados: { id: "o1", farmId: "F1", description: "aplicou" } };
    const [r] = await envia(tecnico, conta, [semCusto]);
    expect(r.aceito).toBe(true);
    const o1 = (await recebe(dono, conta)).find((x) => x.id === "o1")!;
    expect(o1.dados).toMatchObject({ description: "aplicou", cost: 5000 });
  });

  it("técnico não grava venda nem registro de outra fazenda", async () => {
    await expect(envia(tecnico, conta, [de("sales", "v2", "F1")])).rejects.toThrow(/sem-permissao/);
    await expect(envia(tecnico, conta, [de("plots", "p2", "F2")])).rejects.toThrow(/sem-permissao/);
    // Mudar a fazenda de um registro para uma que ele vê também não passa.
    await expect(envia(tecnico, conta, [{ ...de("farms", "F2", "F1"), atualizado_em: 9 }])).rejects.toThrow(/sem-permissao/);
  });
});
