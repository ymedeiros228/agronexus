import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { db, getMeta, setMeta, SYNCED_TABLES } from "../db";
import { demoLoaded, removeDemo } from "../demo";
import { countPending, type OutgoingRow, type PushResult, type Remote, type RemoteRow } from "./engine";

/**
 * Conta na nuvem (Supabase). Sem as variáveis de ambiente o app funciona como sempre, só no aparelho.
 * A chave pública (publishable) pode ir para o navegador; a de serviço nunca entra aqui.
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const cloudConfigured = !!(SUPABASE_URL && SUPABASE_KEY);

let client: SupabaseClient | null = null;

/** Cliente do Supabase, só no navegador e só com a nuvem configurada. */
export function getSupabase(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_KEY || typeof window === "undefined") return null;
  client ??= createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return client;
}

function fail(context: string, error: { message: string } | null) {
  if (error) throw new Error(`${context}: ${error.message}`);
}

export function supabaseRemote(sb: SupabaseClient): Remote {
  return {
    async pull(account, since, limit) {
      let query = sb
        .from("registros")
        .select("tabela, id, dados, atualizado_em, removido_em, servidor_em")
        .eq("conta_id", account);
      if (since) query = query.gt("servidor_em", since);
      const { data, error } = await query.order("servidor_em").limit(limit);
      fail("Receber", error);
      return (data ?? []) as RemoteRow[];
    },
    async push(account, rows: OutgoingRow[]) {
      const { data, error } = await sb.rpc("enviar_registros", { conta: account, lote: rows });
      fail("Enviar", error);
      return (data ?? []) as PushResult[];
    },
    async uploadPhoto(path, blob) {
      const { error } = await sb.storage.from("fotos").upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: false });
      // Já existe = subiu numa tentativa anterior que caiu antes de terminar. A foto não muda depois de tirada.
      if (error && !/exist|duplicate/i.test(error.message)) throw new Error(`Foto: ${error.message}`);
    },
    async downloadPhoto(path) {
      const { data, error } = await sb.storage.from("fotos").download(path);
      return error || !data ? null : data;
    },
  };
}

/** Quem está ligado à nuvem neste aparelho e em qual conta os dados ficam. */
export type CloudAccount = { userId: string; email: string; accountId: string };
export const ACCOUNT_KEY = "cloudAccount";

export function getAccount(): Promise<CloudAccount | undefined> {
  return getMeta<CloudAccount>(ACCOUNT_KEY);
}

function needsInternet(what: string) {
  if (!navigator.onLine) throw new Error(`${what} precisa de internet. Depois o app funciona sem sinal.`);
}

function requireClient(): SupabaseClient {
  const sb = getSupabase();
  if (!sb) throw new Error("A conta na nuvem ainda não está ligada nesta versão do app.");
  return sb;
}

/**
 * Liga este aparelho à conta da pessoa que entrou. Se os dados aqui são de outra pessoa e já
 * subiram, apaga; se ainda não subiram, recusa (seria perder trabalho de alguém).
 */
let linking: Promise<CloudAccount> | null = null;

export function linkAccount(sb: SupabaseClient, user: User): Promise<CloudAccount> {
  // Entrar e o link do e-mail podem chegar juntos: uma ligação por vez.
  linking ??= doLink(sb, user).finally(() => (linking = null));
  return linking;
}

async function doLink(sb: SupabaseClient, user: User): Promise<CloudAccount> {
  const previous = await getAccount();
  if (previous?.userId === user.id) return previous;
  if (previous && previous.userId !== user.id) {
    const pending = await countPending();
    if (pending) {
      await sb.auth.signOut({ scope: "local" });
      throw new Error(
        `Este aparelho tem ${pending === 1 ? "1 registro" : `${pending} registros`} de ${previous.email} que ainda não subiram. Entre com essa conta e espere enviar.`,
      );
    }
    await wipeDevice();
  }
  // O exemplo é só para conhecer o app: não convive com dados de verdade na nuvem.
  if (await demoLoaded()) await removeDemo();
  const { data, error } = await sb.from("membros").select("conta_id").eq("usuario_id", user.id).order("criado_em").limit(1).maybeSingle();
  fail("Conta", error);
  if (!data) throw new Error("Conta sem cadastro no servidor. Saia e entre de novo; se continuar, fale com o suporte.");
  const account: CloudAccount = { userId: user.id, email: user.email ?? "", accountId: data.conta_id as string };
  await setMeta(ACCOUNT_KEY, account);
  return account;
}

export async function signIn(email: string, password: string): Promise<CloudAccount> {
  const sb = requireClient();
  needsInternet("Entrar pela primeira vez");
  const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
  if (error) {
    if (/invalid login/i.test(error.message)) throw new Error("E-mail ou senha errados.");
    if (/not confirmed/i.test(error.message)) throw new Error("Falta confirmar o e-mail: abra o link que chegou na sua caixa de entrada.");
    throw new Error(error.message);
  }
  return linkAccount(sb, data.user);
}

export async function signUp(name: string, email: string, password: string): Promise<"entrou" | "confirmar-email"> {
  const sb = requireClient();
  needsInternet("Criar a conta");
  if (name.trim().length < 3) throw new Error("Escreva o seu nome.");
  if (password.length < 8) throw new Error("A senha precisa de pelo menos 8 caracteres.");
  const { data, error } = await sb.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { nome: name.trim() }, emailRedirectTo: `${window.location.origin}/entrar` },
  });
  if (error) throw new Error(/registered|exists/i.test(error.message) ? "Este e-mail já tem conta. Use “Entrar”." : error.message);
  if (!data.session || !data.user) return "confirmar-email";
  await linkAccount(sb, data.user);
  return "entrou";
}

export async function sendPasswordReset(email: string) {
  const sb = requireClient();
  needsInternet("Recuperar a senha");
  const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/entrar?nova-senha=1` });
  if (error) throw new Error(error.message);
}

export async function updatePassword(password: string) {
  const sb = requireClient();
  if (password.length < 8) throw new Error("A senha precisa de pelo menos 8 caracteres.");
  const { error } = await sb.auth.updateUser({ password });
  if (error) throw new Error(error.message);
}

/**
 * Sair: só com tudo enviado. Depois apaga os dados deste aparelho, porque ele pode ser de
 * outra pessoa (e o perfil, para o relatório de quem entrar depois não sair com outro nome).
 */
export async function signOut() {
  const pending = await countPending();
  if (pending) {
    throw new Error(
      `Ainda ${pending === 1 ? "falta 1 registro" : `faltam ${pending} registros`} para subir. Conecte à internet e espere enviar antes de sair.`,
    );
  }
  await getSupabase()?.auth.signOut({ scope: "local" });
  await wipeDevice();
}

/** Aparelho como novo: dados, perfil, exemplo, marca do recebimento e a ligação com a conta. */
async function wipeDevice() {
  await db.transaction("rw", [...SYNCED_TABLES.map((t) => db.table(t)), db.meta], async () => {
    for (const t of SYNCED_TABLES) await db.table(t).clear();
    await db.meta.clear();
  });
}
