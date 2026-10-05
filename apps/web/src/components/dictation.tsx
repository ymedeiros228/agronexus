"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type TextareaHTMLAttributes } from "react";
import { Mic, Square } from "lucide-react";
import { toast } from "./toaster";
import { inputClass } from "./ui";

/** O que usamos da Web Speech API (não está nos tipos do TypeScript). */
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function recognitionClass(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => Recognition) | null;
}

const noop = () => () => {};

/** Junta o trecho ditado ao texto: espaço no meio e primeira letra maiúscula depois de ponto. */
export function appendDictation(text: string, piece: string): string {
  const p = piece.trim();
  if (!p) return text;
  const t = text.trimEnd();
  if (!t) return p.charAt(0).toUpperCase() + p.slice(1);
  const capital = /[.!?]$/.test(t);
  return `${t} ${capital ? p.charAt(0).toUpperCase() + p.slice(1) : p}`;
}

const ERRORS: Record<string, string> = {
  "not-allowed": "Permita o uso do microfone para ditar.",
  "service-not-allowed": "Permita o uso do microfone para ditar.",
  network: "O ditado precisa de internet neste aparelho. Digite o texto ou tente com sinal.",
  "no-speech": "Não ouvi nada. Toque no microfone e fale perto do aparelho.",
  "audio-capture": "Nenhum microfone encontrado.",
};

/**
 * Caixa de texto com botão de ditar (português). No campo, com luva ou mão suja,
 * falar é mais rápido que digitar. Sem suporte no navegador, vira uma caixa comum.
 */
export function DictationTextarea({
  value,
  onValue,
  className = "",
  ...props
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & {
  value: string;
  onValue: (v: string) => void;
}) {
  const supported = useSyncExternalStore(noop, () => recognitionClass() !== null, () => false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const rec = useRef<Recognition | null>(null);
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);
  useEffect(() => () => rec.current?.stop(), []);

  function toggle() {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const Rec = recognitionClass();
    if (!Rec) return;
    const r = new Rec();
    r.lang = "pt-BR";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let partial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) {
          latest.current = appendDictation(latest.current, res[0].transcript);
          onValue(latest.current);
        } else {
          partial += res[0].transcript;
        }
      }
      setInterim(partial);
    };
    r.onerror = (e) => {
      if (e.error !== "aborted") toast(ERRORS[e.error] ?? "Não foi possível usar o ditado.");
    };
    r.onend = () => {
      setListening(false);
      setInterim("");
      rec.current = null;
    };
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      toast("Não foi possível usar o ditado.");
    }
  }

  return (
    <div className="relative">
      <textarea
        {...props}
        value={value}
        onChange={(e) => onValue(e.target.value)}
        className={`${inputClass} ${supported ? "resize-none pr-14" : ""} ${className}`}
      />
      {supported ? (
        <button
          type="button"
          onClick={toggle}
          aria-pressed={listening}
          aria-label={listening ? "Parar ditado" : "Ditar por voz"}
          className={`absolute bottom-2.5 right-2.5 grid size-10 place-items-center rounded-full transition active:scale-95 ${
            listening ? "animate-pulse bg-danger text-white" : "bg-brand-soft text-brand hover:bg-brand hover:text-white"
          }`}
        >
          {listening ? <Square className="size-4" fill="currentColor" /> : <Mic className="size-5" />}
        </button>
      ) : null}
      {listening ? (
        <p aria-live="polite" className="mt-1.5 text-xs text-muted">
          {interim ? `“${interim}”` : "Ouvindo… fale e toque no quadrado para parar."}
        </p>
      ) : null}
    </div>
  );
}
