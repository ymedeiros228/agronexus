"use client";

import { useSyncExternalStore } from "react";
import { CloudCheck, CloudUpload, RefreshCw, WifiOff } from "lucide-react";
import { requestSync, useCloudStatus } from "./cloud-sync";

function subscribe(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

const pill = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium";
const records = (n: number) => (n === 1 ? "1 registro" : `${n} registros`);

/**
 * Situação do sinal e do envio, no topo (celular) e no pé da barra lateral (computador).
 * Sem login, só aparece sem internet, como antes.
 */
export function OnlineBadge() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  const { linked, pending, state } = useCloudStatus();

  if (!online) {
    return (
      <span role="status" className={`${pill} bg-warn/10 text-warn`}>
        <WifiOff aria-hidden className="size-3.5" />
        {linked && pending ? `Sem internet · ${records(pending)} esperando sinal` : "Sem internet · salvando neste aparelho"}
      </span>
    );
  }
  if (!linked) return null;
  if (state.error && !state.running) {
    return (
      <button type="button" onClick={requestSync} title={state.error} className={`${pill} bg-danger/10 text-danger`}>
        <RefreshCw aria-hidden className="size-3.5" />
        Não enviou · tentar de novo
      </button>
    );
  }
  if (state.running || pending) {
    return (
      <span role="status" className={`${pill} bg-brand-soft text-brand-strong`}>
        <CloudUpload aria-hidden className={`size-3.5 ${state.running ? "animate-pulse" : ""}`} />
        {state.running ? "Enviando…" : `${records(pending)} para enviar`}
      </span>
    );
  }
  return (
    <span role="status" className={`${pill} bg-brand-soft/70 text-brand-strong`}>
      <CloudCheck aria-hidden className="size-3.5" />
      Salvo na nuvem
    </span>
  );
}
