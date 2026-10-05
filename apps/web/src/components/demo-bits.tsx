"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { FlaskConical, Sparkles } from "lucide-react";
import { demoLoaded, loadDemo, removeDemo } from "@/lib/demo";

/** Botão da tela de boas-vindas: enche o app com a fazenda de exemplo. */
export function LoadDemoButton({ className = "" }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await loadDemo();
        } finally {
          setBusy(false);
        }
      }}
      className={`inline-flex min-h-12 items-center gap-2 rounded-xl px-5 font-semibold ring-1 ring-white/30 transition hover:bg-white/10 active:scale-[0.98] disabled:opacity-60 ${className}`}
    >
      <Sparkles className="size-4" /> {busy ? "Carregando…" : "Ver com fazenda de exemplo"}
    </button>
  );
}

/** Faixa no topo enquanto o exemplo estiver no aparelho. */
export function DemoBanner() {
  const on = useLiveQuery(demoLoaded, [], false);
  const [busy, setBusy] = useState(false);
  if (!on) return null;
  return (
    <div className="no-print flex items-center gap-3 rounded-2xl border border-warn/30 bg-warn/10 px-4 py-2.5 text-sm">
      <FlaskConical aria-hidden className="size-5 shrink-0 text-warn" />
      <p className="min-w-0 flex-1">
        <span className="font-medium">Fazenda de exemplo</span>
        <span className="hidden text-muted sm:inline"> · explore à vontade, nada aqui é seu</span>
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          if (!confirm("Apagar a fazenda de exemplo? O que você cadastrou fora dela continua.")) return;
          setBusy(true);
          try {
            await removeDemo();
          } finally {
            setBusy(false);
          }
        }}
        className="shrink-0 rounded-lg px-2.5 py-1.5 font-semibold text-danger transition hover:bg-danger/10 disabled:opacity-50"
      >
        {busy ? "Apagando…" : "Apagar exemplo"}
      </button>
    </div>
  );
}
