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

    expect(await s.as(a).query("select id from public.registros where id = 'f-a'")).toHaveLength(1);
    expect(await s.as(b).query("select id from public.registros where id = 'f-a'")).toHaveLength(0);
    await expect(s.as(null).query("select id from public.registros")).rejects.toThrow(/permission denied/);
  });

  it("vence a edição mais recente e reenviar não duplica", async () => {
    const u = await s.newUser("c@teste.br");
    const conta = await contaDe(u);
    await envia(u, conta, [linha("f-c", { name: "nova" }, 10)]);
    const [velha] = await envia(u, conta, [linha("f-c", { name: "velha" }, 5)]);
    expect(velha.aceito).toBe(false);
    await envia(u, conta, [linha("f-c", { name: "nova" }, 10)]);
    const rows = await s.as(u).query<{ dados: { name: string } }>("select dados from public.registros where id = 'f-c'");
    expect(rows.map((r) => r.dados.name)).toEqual(["nova"]);
  });
});
