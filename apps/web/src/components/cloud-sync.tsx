"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { Session } from "@supabase/supabase-js";
import { getAccount, getSupabase, linkAccount, supabaseRemote } from "@/lib/sync/cloud";
import { countPending, friendlyError, getSyncState, subscribeSync, syncNow } from "@/lib/sync/engine";
import { toast } from "./toaster";

/** Sessão do Supabase: `undefined` enquanto lê; `null` sem login (ou sem nuvem configurada). */
let session: Session | null | undefined;
let started = false;
const sessionListeners = new Set<() => void>();

function startSession() {
  if (started) return;
  started = true;
  const sb = getSupabase();
  if (!sb) {
    session = null;
    return;
  }
  const set = (s: Session | null) => {
    session = s;
    sessionListeners.forEach((l) => l());
  };
  void sb.auth.getSession().then(({ data }) => set(data.session));
  sb.auth.onAuthStateChange((_event, s) => set(s));
}

function subscribeSession(listener: () => void) {
  startSession();
  sessionListeners.add(listener);
  return () => void sessionListeners.delete(listener);
}

export function useSession(): Session | null | undefined {
  return useSyncExternalStore(subscribeSession, () => session, () => undefined);
}

/** Estado da nuvem para as telas. `linked`: há login e este aparelho já está ligado à conta. */
export function useCloudStatus() {
  const current = useSession();
  const account = useLiveQuery(async () => (await getAccount()) ?? null);
  const pending = useLiveQuery(countPending) ?? 0;
  const state = useSyncExternalStore(subscribeSync, getSyncState, getSyncState);
  const linked = !!current && !!account && account.userId === current.user.id;
  return { session: current, account, linked, pending, state };
}

let runner: (() => void) | null = null;

/** "Enviar agora" e "tentar de novo". Sem login, não faz nada. */
export function requestSync() {
  runner?.();
}

/**
 * Envio automático enquanto houver login (montado uma vez, no layout): ao abrir, ao voltar
 * para o app, quando o sinal volta, a cada minuto e 2 s depois de cada gravação. iPhone não
 * tem envio em segundo plano, por isso esses gatilhos.
 */
export function CloudSync() {
  const { session: current, account, linked, pending } = useCloudStatus();
  const accountId = linked ? account!.accountId : null;

  // Login que chegou pelo link do e-mail (confirmação de cadastro): liga o aparelho à conta.
  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !current || account === undefined || account?.userId === current.user.id) return;
    linkAccount(sb, current.user).catch((e) => toast(friendlyError(e)));
  }, [current, account]);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !accountId) return;
    const remote = supabaseRemote(sb);
    const run = () => {
      if (navigator.onLine) void syncNow(remote, accountId);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    runner = run;
    run();
    const timer = setInterval(run, 60_000);
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      runner = null;
      clearInterval(timer);
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [accountId]);

  // Gravou algo: espera 2 s (costuma vir mais de uma gravação seguida) e envia.
  useEffect(() => {
    if (!accountId || !pending) return;
    const t = setTimeout(() => runner?.(), 2000);
    return () => clearTimeout(t);
  }, [pending, accountId]);

  return null;
}
