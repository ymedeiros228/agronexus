import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

/**
 * Postgres de verdade (PGlite) com o mínimo do Supabase que as migrações usam: auth.users,
 * auth.uid(), os papéis anon/authenticated e o storage. Aplica todas as migrações de
 * `supabase/migrations/` em ordem. Só para testes.
 */

const MIGRATIONS = join(__dirname, "..", "..", "..", "..", "..", "supabase", "migrations");

const SUPABASE_STUB = `
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
alter table storage.objects enable row level security;
grant usage on schema public, auth, storage to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant select, insert on storage.objects to authenticated;
`;

export type Session = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
};

export type Server = {
  /** Consultas como a pessoa (`null` = visitante sem login), com RLS valendo. */
  as(userId: string | null): Session;
  /** Consultas como o dono do banco (sem RLS), para preparar o teste. */
  admin: Session;
  newUser(email: string, meta?: Record<string, unknown>): Promise<string>;
  close(): Promise<void>;
};

export async function startServer(): Promise<Server> {
  const pg = new PGlite();
  await pg.exec(SUPABASE_STUB);
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await pg.exec(readFileSync(join(MIGRATIONS, file), "utf8"));
  }

  const admin: Session = {
    async query(sql, params) {
      return (await pg.query(sql, params)).rows as never;
    },
  };

  // Uma transação por consulta: o papel e o usuário valem só ali dentro.
  const as = (userId: string | null): Session => ({
    async query(sql, params) {
      return pg.transaction(async (tx) => {
        await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? ""]);
        await tx.exec(`set local role ${userId ? "authenticated" : "anon"}`);
        return (await tx.query(sql, params)).rows as never;
      });
    },
  });

  return {
    as,
    admin,
    async newUser(email, meta = {}) {
      const [row] = await admin.query<{ id: string }>(
        "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
        [email, JSON.stringify(meta)],
      );
      return row.id;
    },
    close: () => pg.close(),
  };
}
