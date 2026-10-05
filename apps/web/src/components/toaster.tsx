"use client";

import { useEffect, useSyncExternalStore } from "react";
import { CheckCircle2, Undo2, X } from "lucide-react";

/** Aviso curto no rodapé ("Visita excluída · Desfazer"). Um por vez: o novo substitui o anterior. */
type Toast = { id: number; text: string; undo?: () => Promise<unknown> | unknown };

const DURATION_MS = 6000;
let current: Toast | null = null;
let seq = 0;
const listeners = new Set<() => void>();

function set(t: Toast | null) {
  current = t;
  listeners.forEach((l) => l());
}

export function toast(text: string, opts: { undo?: Toast["undo"] } = {}) {
  set({ id: ++seq, text, undo: opts.undo });
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function Toaster() {
  const t = useSyncExternalStore(subscribe, () => current, () => null);

  useEffect(() => {
    if (!t) return;
    const timer = setTimeout(() => current?.id === t.id && set(null), DURATION_MS);
    return () => clearTimeout(timer);
  }, [t]);

  return (
    <div
      aria-live="polite"
      className="no-print pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 md:bottom-6 md:pl-64"
    >
      {t ? (
        <div
          key={t.id}
          role="status"
          className="toast-in pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl bg-sidebar px-4 py-3 text-sm text-white shadow-xl"
        >
          <CheckCircle2 aria-hidden className="size-5 shrink-0 text-accent" />
          <p className="min-w-0 flex-1">{t.text}</p>
          {t.undo ? (
            <button
              type="button"
              onClick={async () => {
                const undo = t.undo!;
                set(null);
                await undo();
                toast("Desfeito.");
              }}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-semibold text-accent transition hover:bg-white/10"
            >
              <Undo2 className="size-4" /> Desfazer
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => set(null)}
            aria-label="Fechar aviso"
            className="-mr-1 grid size-8 shrink-0 place-items-center rounded-full text-white/60 hover:bg-white/10"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
