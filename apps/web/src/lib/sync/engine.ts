import { db, getMeta, setMeta, SYNCED_TABLES, type SyncedTable } from "../db";
import { isDemoRow } from "../demo";

/**
 * Envio e recebimento (Etapa 2). O aparelho é a fonte enquanto não há sinal; quando há:
 * 1) recebe o que mudou na conta, sem pisar no que ainda não subiu daqui;
 * 2) envia o que está pendente (foto: o arquivo antes do registro).
 * No servidor vence a edição mais recente (`updatedAt`); o que ele recusar volta e substitui a cópia daqui.
 * Toda gravação já marca o registro como pendente (ganchos em db.ts), então as telas não mudam.
 */

/** Linha da tabela `registros` do servidor (supabase/migrations). */
export type RemoteRow = {
  tabela: string;
  id: string;
  dados: Record<string, unknown>;
  atualizado_em: number;
  removido_em: number | null;
  servidor_em: string;
};

export type OutgoingRow = Omit<RemoteRow, "servidor_em">;

/** Resposta do envio: aceito (só o carimbo importa) ou recusado com a versão que ficou no servidor. */
export type PushResult = RemoteRow & { aceito: boolean };

/** O que o motor precisa do servidor. Na vida real, o Supabase (`supabase-remote.ts`); nos testes, um falso. */
export interface Remote {
  pull(account: string, since: string | null, limit: number): Promise<RemoteRow[]>;
  push(account: string, rows: OutgoingRow[]): Promise<PushResult[]>;
  uploadPhoto(path: string, blob: Blob): Promise<void>;
  downloadPhoto(path: string): Promise<Blob | null>;
}

type LocalRow = Record<string, unknown> & {
  id: string;
  updatedAt: number;
  deletedAt?: number;
  _pendente?: 0 | 1;
  _sync?: string;
};

export const CURSOR_KEY = "syncCursor";
/** Linhas por pedido ao servidor. */
const PAGE = 500;
const BATCH = 200;
/**
 * Volta um pouco no tempo a cada rodada: uma gravação que terminou depois de outra pode ter
 * carimbo anterior a ela. Reler é barato (versão que já temos é pulada pelo `_sync`).
 */
const OVERLAP_MS = 2 * 60_000;

const LOCAL_ONLY = new Set(["_pendente", "_sync", "blob"]);
const isSynced = (t: string): t is SyncedTable => (SYNCED_TABLES as readonly string[]).includes(t);
const tables = () => SYNCED_TABLES.map((t) => db.table(t));

export const photoPath = (account: string, photoId: string) => `${account}/${photoId}`;

export function toRemote(table: SyncedTable, row: LocalRow): OutgoingRow {
  const dados = Object.fromEntries(Object.entries(row).filter(([k]) => !LOCAL_ONLY.has(k)));
  return { tabela: table, id: row.id, dados, atualizado_em: row.updatedAt, removido_em: row.deletedAt ?? null };
}

/** Versão do servidor gravada aqui: sem pendência e com o carimbo dele (o gancho do banco não marca). */
function fromRemote(row: RemoteRow, blob?: unknown): LocalRow {
  return { ...(row.dados as LocalRow), ...(blob ? { blob } : {}), _pendente: 0, _sync: row.servidor_em };
}

/** O conteúdo do registro, sem o estado local: muda quando alguém edita. */
const signature = (table: SyncedTable, row: LocalRow) => JSON.stringify(toRemote(table, row).dados);

/** O que falta subir, sem o exemplo (nem o que foi criado dentro dele). */
export async function pendingRows(): Promise<{ table: SyncedTable; row: LocalRow }[]> {
  const out: { table: SyncedTable; row: LocalRow }[] = [];
  for (const table of SYNCED_TABLES) {
    const rows = (await db.table(table).where("_pendente").equals(1).toArray()) as LocalRow[];
    for (const row of rows) if (!isDemoRow(row)) out.push({ table, row });
  }
  return out;
}

export async function countPending(): Promise<number> {
  return (await pendingRows()).length;
}

/** Recebe o que mudou na conta desde a última vez. */
export async function receive(remote: Remote, account: string): Promise<void> {
  const cursor = (await getMeta<string>(CURSOR_KEY)) ?? null;
  let since = cursor ? new Date(Date.parse(cursor) - OVERLAP_MS).toISOString() : null;
  let next = cursor;
  // Foto que não baixou segura o carimbo: a próxima rodada pede de novo a partir dela.
  let stuck = false;
  for (;;) {
    const rows = await remote.pull(account, since, PAGE);
    const { blobs, missing } = await downloadPhotos(remote, account, rows);
    await db.transaction("rw", tables(), async () => {
      for (const row of rows) {
        if (!isSynced(row.tabela)) continue; // tabela de uma versão mais nova do app
        const table = db.table(row.tabela);
        const local = (await table.get(row.id)) as LocalRow | undefined;
        if (local?._pendente === 1) continue; // o daqui ainda não subiu: vale ele, o servidor decide no envio
        if (local?._sync === row.servidor_em) continue; // já temos esta versão
        if (row.tabela !== "photos") {
          await table.put(fromRemote(row));
          continue;
        }
        const blob = local?.blob ?? blobs.get(row.id);
        if (blob) await table.put(fromRemote(row, blob));
      }
    });
    for (const row of rows) {
      if (missing.has(row.id)) stuck = true;
      if (!stuck && (!next || row.servidor_em > next)) next = row.servidor_em;
    }
    if (rows.length < PAGE) break;
    since = rows[rows.length - 1].servidor_em;
  }
  if (next && next !== cursor) await setMeta(CURSOR_KEY, next);
}

/** Baixa as fotos que vieram de outro aparelho. Fora da transação: download não pode ficar dentro dela. */
async function downloadPhotos(remote: Remote, account: string, rows: RemoteRow[]) {
  const blobs = new Map<string, Blob>();
  const missing = new Set<string>();
  for (const row of rows) {
    if (row.tabela !== "photos") continue;
    const local = (await db.photos.get(row.id)) as LocalRow | undefined;
    // Foto removida que nunca esteve aqui: não há o que guardar.
    if (local?._pendente === 1 || local?.blob || (!local && row.removido_em != null)) continue;
    const blob = await remote.downloadPhoto(photoPath(account, row.id));
    if (blob) blobs.set(row.id, blob);
    else missing.add(row.id);
  }
  return { blobs, missing };
}

/** Envia o que está pendente, em lotes. */
export async function send(remote: Remote, account: string): Promise<void> {
  const pending = await pendingRows();
  // Arquivo antes do registro: o outro aparelho nunca recebe uma foto que não consegue baixar.
  for (const { table, row } of pending) {
    if (table === "photos" && !row.deletedAt && row.blob instanceof Blob) {
      await remote.uploadPhoto(photoPath(account, row.id), row.blob);
    }
  }
  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH);
    const sent = new Map(batch.map(({ table, row }) => [`${table}:${row.id}`, signature(table, row)]));
    const result = await remote.push(
      account,
      batch.map(({ table, row }) => toRemote(table, row)),
    );
    await db.transaction("rw", tables(), async () => {
      for (const r of result) {
        if (!isSynced(r.tabela)) continue;
        const table = db.table(r.tabela);
        const current = (await table.get(r.id)) as LocalRow | undefined;
        // Mudou durante o envio: continua pendente e sobe na próxima rodada.
        if (!current || signature(r.tabela, current) !== sent.get(`${r.tabela}:${r.id}`)) continue;
        if (r.aceito) await table.update(r.id, { _pendente: 0, _sync: r.servidor_em });
        else await table.put(fromRemote(r, current.blob));
      }
    });
  }
}

/** Mensagem para a pessoa: falha de rede do navegador vem em inglês e sem explicação. */
export function friendlyError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  if (/failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(message)) {
    return "Sem conexão com o servidor. Confira a internet e tente de novo.";
  }
  return message;
}

export type SyncState = { running: boolean; error: string | null; lastOk: number | null };

let state: SyncState = { running: false, error: null, lastOk: null };
const listeners = new Set<() => void>();

export const getSyncState = () => state;

export function subscribeSync(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

let running: Promise<void> | null = null;
let again = false;

/**
 * Uma rodada completa (receber e enviar). Pedido durante uma rodada não se perde:
 * ao terminar, roda mais uma vez para levar o que foi gravado nesse meio-tempo.
 */
export function syncNow(remote: Remote, account: string): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    setState({ running: true });
    try {
      do {
        again = false;
        await receive(remote, account);
        await send(remote, account);
      } while (again);
      setState({ error: null, lastOk: Date.now() });
    } catch (e) {
      setState({ error: friendlyError(e) });
    } finally {
      running = null;
      setState({ running: false });
    }
  })();
  return running;
}
