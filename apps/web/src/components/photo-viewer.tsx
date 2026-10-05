"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { BlobImg } from "./blob-img";

export type ViewerPhoto = { id: string; blob: Blob; label: string; takenAt: number };

/** Fotos da visita em grade; um toque abre em tela cheia, com setas, deslizar e teclado. */
export function PhotoGallery({ photos }: { photos: ViewerPhoto[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((p, i) => (
          <figure key={p.id} className="space-y-1.5">
            <button
              type="button"
              onClick={() => setOpen(i)}
              className="block w-full overflow-hidden rounded-xl transition active:scale-[0.98] print:pointer-events-none"
              aria-label={`Abrir foto ${i + 1}${p.label ? `: ${p.label}` : ""}`}
            >
              <BlobImg blob={p.blob} alt={p.label || "Foto da visita"} className="aspect-square w-full transition hover:scale-[1.03]" />
            </button>
            <figcaption className="text-xs text-muted">{p.label || "Diagnóstico não definido"}</figcaption>
          </figure>
        ))}
      </div>
      {open !== null ? <Viewer photos={photos} start={open} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function Viewer({ photos, start, onClose }: { photos: ViewerPhoto[]; start: number; onClose: () => void }) {
  const [i, setI] = useState(start);
  const touchX = useRef<number | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const n = photos.length;
  const go = (d: number) => setI((v) => (v + d + n) % n);
  const p = photos[i];

  useEffect(() => {
    closeRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setI((v) => (v + 1) % n);
      if (e.key === "ArrowLeft") setI((v) => (v - 1 + n) % n);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [n, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Foto da visita"
      className="no-print fixed inset-0 z-50 flex flex-col bg-black text-white"
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null || n < 2) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        touchX.current = null;
      }}
    >
      <div className="flex items-center justify-between gap-3 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <p className="text-sm tabular-nums text-white/70">
          {n > 1 ? `${i + 1} de ${n}` : ""}
        </p>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="grid size-11 place-items-center rounded-full bg-white/10 hover:bg-white/20"
        >
          <X className="size-5" />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2">
        <BlobImg key={p.id} blob={p.blob} alt={p.label || "Foto da visita"} className="max-h-full max-w-full !object-contain" />
        {n > 1 ? (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Foto anterior"
              className="absolute left-2 grid size-11 place-items-center rounded-full bg-white/10 hover:bg-white/20"
            >
              <ChevronLeft className="size-6" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Próxima foto"
              className="absolute right-2 grid size-11 place-items-center rounded-full bg-white/10 hover:bg-white/20"
            >
              <ChevronRight className="size-6" />
            </button>
          </>
        ) : null}
      </div>
      <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center">
        <p className="font-medium">{p.label || "Diagnóstico não definido"}</p>
        <p className="mt-0.5 text-sm text-white/60">
          {new Date(p.takenAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
        </p>
      </div>
    </div>
  );
}
