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
      await s.admin.query("insert into public.acessos_fazenda (conta_id, usuario_id, fazenda_id) values ($1, $2, $3)", [conta, u, `f-${papel}`]);
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
  const de = (tabela: string, id: string, fazenda: string | null, extra: Record<string, unknown> = {}) => ({
    tabela,
    id,
    dados: { id, ...(fazenda && tabela !== "farms" ? { farmId: fazenda } : {}), ...extra },
    atualizado_em: 1,
    removido_em: null,
  });

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
    // Mentir a fazenda no lote não adianta: o servidor calcula pelo registro.
    await expect(envia(tecnico, conta, [{ ...de("farms", "F2", null), fazenda_id: "F1", atualizado_em: 9 }])).rejects.toThrow(/sem-permissao/);
    // Talhão sem fazenda: só quem vê tudo.
    await expect(envia(tecnico, conta, [de("plots", "p-sem", null)])).rejects.toThrow(/sem-permissao/);
  });

  it("safra e achado herdam a fazenda do pai, no mesmo lote ou já gravado", async () => {
    await envia(dono, conta, [de("plots", "p1", "F1"), de("seasons", "s-1", null, { plotId: "p1" })]);
    await envia(dono, conta, [de("plots", "p2", "F2")]);
    await envia(dono, conta, [de("seasons", "s-2", null, { plotId: "p2" })]);
    const ids = (await recebe(tecnico, conta)).map((r) => r.id);
    expect(ids).toContain("s-1");
    expect(ids).not.toContain("s-2");
  });

  it("técnico que cria operação com custo não grava o custo", async () => {
    await envia(tecnico, conta, [op("o-tec", "F1", 999)]);
    expect((await recebe(dono, conta)).find((r) => r.id === "o-tec")!.dados).not.toHaveProperty("cost");
  });
});

describe("convites e pessoas da conta", () => {
  const convida = (u: string, conta: string, papel: string, fazendas: string[] = [], custos = false) =>
    s.as(u).query<{ criar_convite: string }>("select public.criar_convite($1, $2, $3, $4)", [conta, papel, fazendas, custos]).then((r) => r[0].criar_convite);
  const aceita = (u: string, codigo: string) =>
    s.as(u).query<{ aceitar_convite: string | null }>("select public.aceitar_convite($1)", [codigo]).then((r) => r[0].aceitar_convite);
  const membros = (u: string, conta: string) =>
    s.as(u).query<{ usuario_id: string; papel: string; fazendas: string[] }>("select * from public.membros_da_conta($1)", [conta]);

  let dono: string, conta: string;
  beforeAll(async () => {
    dono = await s.newUser("dono-conv@teste.br", { nome: "Yuri" });
    conta = await contaDe(dono);
  });

  it("convite aceito com minúscula e espaço põe a pessoa na conta com papel e fazendas", async () => {
    const codigo = await convida(dono, conta, "tecnico", ["F1"]);
    expect(codigo).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    const ana = await s.newUser("ana-conv@teste.br", { nome: "Ana", convite: codigo });
    await aceita(ana, `  ${codigo.toLowerCase()} `);
    const ela = (await membros(dono, conta)).find((m) => m.usuario_id === ana)!;
    expect(ela).toMatchObject({ papel: "tecnico", fazendas: ["F1"] });
    expect(await aceita(await s.newUser("outro-conv@teste.br"), codigo)).toBeNull();
  });

  it("convite inexistente e vencido não entram (mesma resposta para tudo)", async () => {
    const u = await s.newUser("x-conv@teste.br");
    expect(await aceita(u, "ZZZZZZ")).toBeNull();
    const codigo = await convida(dono, conta, "leitor");
    await s.admin.query("update public.convites set expira_em = now() - interval '1 day' where codigo = $1", [codigo]);
    expect(await aceita(u, codigo)).toBeNull();
  });

  it("técnico não convida; gestor não convida dono", async () => {
    const tec = (await membros(dono, conta)).find((m) => m.papel === "tecnico")!.usuario_id;
    await expect(convida(tec, conta, "leitor")).rejects.toThrow(/so-quem-gerencia/);
    const gestor = await s.newUser("gestor-conv@teste.br");
    await aceita(gestor, await convida(dono, conta, "gestor"));
    await expect(convida(gestor, conta, "dono")).rejects.toThrow(/so-dono-convida-dono/);
  });

  it("o último dono não sai nem se rebaixa", async () => {
    await expect(s.as(dono).query("select public.tirar_membro($1, $2)", [conta, dono])).rejects.toThrow(/ultimo-dono/);
    await expect(s.as(dono).query("select public.mudar_membro($1, $2, 'gestor', '{}', false)", [conta, dono])).rejects.toThrow(/ultimo-dono/);
  });

  it("quem é tirado deixa de receber na hora", async () => {
    const ze = await s.newUser("ze-conv@teste.br");
    await aceita(ze, await convida(dono, conta, "rt"));
    expect(await recebe(ze, conta)).toBeDefined();
    await s.as(dono).query("select public.tirar_membro($1, $2)", [conta, ze]);
    await expect(recebe(ze, conta)).rejects.toThrow(/sem-acesso/);
  });

  it("mudar papel troca as fazendas", async () => {
    const tec = (await membros(dono, conta)).find((m) => m.papel === "tecnico")!.usuario_id;
    await s.as(dono).query("select public.mudar_membro($1, $2, 'estagiario', $3, false)", [conta, tec, ["F2", "F3"]]);
    expect((await membros(dono, conta)).find((m) => m.usuario_id === tec)).toMatchObject({ papel: "estagiario", fazendas: ["F2", "F3"] });
  });

  it("quem já é membro não aceita convite (nem o dono se rebaixa assim)", async () => {
    const outroDono = await s.newUser("dono2-conv@teste.br");
    const codigo = await convida(dono, conta, "leitor");
    expect(await aceita(dono, codigo)).toBeNull();
    await aceita(outroDono, codigo);
    expect(await aceita(outroDono, await convida(dono, conta, "dono"))).toBeNull();
    expect((await membros(dono, conta)).find((m) => m.usuario_id === dono)!.papel).toBe("dono");
  });

  it("convite de quem deixou de gerenciar não vale, e quem gerencia revoga", async () => {
    const g = await s.newUser("gestor2-conv@teste.br");
    await aceita(g, await convida(dono, conta, "gestor"));
    const doGestor = await convida(g, conta, "tecnico");
    await s.as(dono).query("select public.mudar_membro($1, $2, 'leitor', '{}', false)", [conta, g]);
    expect(await aceita(await s.newUser("y-conv@teste.br"), doGestor)).toBeNull();

    const codigo = await convida(dono, conta, "leitor");
    await expect(s.as(g).query("select public.revogar_convite($1)", [codigo])).rejects.toThrow(/so-quem-gerencia/);
    await s.as(dono).query("select public.revogar_convite($1)", [codigo]);
    expect(await aceita(await s.newUser("w-conv@teste.br"), codigo)).toBeNull();
  });

  it("5 códigos errados em uma hora bloqueiam, até com o código certo", async () => {
    const chutador = await s.newUser("chute-conv@teste.br");
    for (const chute of ["AAAAAA", "BBBBBB", "CCCCCC", "DDDDDD", "EEEEEE"]) expect(await aceita(chutador, chute)).toBeNull();
    const certo = await convida(dono, conta, "leitor");
    await expect(aceita(chutador, certo)).rejects.toThrow(/muitas-tentativas/);
    await s.admin.query("update privado.tentativas_convite set em = now() - interval '2 hours'");
    expect(await aceita(chutador, certo)).toBe(conta);
  });

  it("só quem gerencia vê os e-mails da equipe", async () => {
    const l = await s.newUser("leitor-conv@teste.br");
    await aceita(l, await convida(dono, conta, "leitor"));
    const vistos = await s.as(l).query<{ usuario_id: string; email: string | null }>("select * from public.membros_da_conta($1)", [conta]);
    expect(vistos.find((m) => m.usuario_id === dono)!.email).toBeNull();
    expect(vistos.find((m) => m.usuario_id === l)!.email).toBe("leitor-conv@teste.br");
    const peloDono = await s.as(dono).query<{ usuario_id: string; email: string | null }>("select * from public.membros_da_conta($1)", [conta]);
    expect(peloDono.find((m) => m.usuario_id === l)!.email).toBe("leitor-conv@teste.br");
  });
});
