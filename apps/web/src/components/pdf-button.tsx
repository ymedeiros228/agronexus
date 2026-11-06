"use client";

import { useEffect, useState } from "react";
import { Download, FileText, LoaderCircle, Send } from "lucide-react";
import { Button } from "@/components/ui";
import { toast } from "@/components/toaster";
import { saveFile } from "@/lib/save-file";
import { shareFile } from "@/lib/share-file";

export type MadePdf = { blob: Blob; fileName: string; title: string };

/**
 * Relatório em PDF em dois toques: "Gerar" monta o arquivo no aparelho; "Enviar" abre o
 * Compartilhar do celular (WhatsApp) com o arquivo anexado. São dois toques porque o iPhone
 * só abre o Compartilhar logo depois de um toque, e montar o PDF com fotos leva alguns segundos.
 * `version` muda quando os dados mudam: o PDF pronto fica velho e precisa ser gerado de novo.
 */
export function PdfButton({
  make,
  version,
  preload,
  primary = false,
  label = "Relatório em PDF",
}: {
  make: () => Promise<MadePdf>;
  version: string;
  /** Baixa o código do PDF com sinal, para o service worker guardar e o botão funcionar depois sem internet. */
  preload?: () => Promise<unknown>;
  /** Botão em destaque (logo depois de salvar a visita). */
  primary?: boolean;
  label?: string;
}) {
  const [state, setState] = useState<{ kind: "idle" } | { kind: "busy" } | { kind: "ready"; pdf: MadePdf; version: string; url: string }>({ kind: "idle" });
  const ready = state.kind === "ready" && state.version === version ? state.pdf : null;
  const url = state.kind === "ready" ? state.url : null;
  useEffect(() => {
    if (!preload || !navigator.onLine) return;
    const t = setTimeout(() => preload().catch(() => undefined), 1500);
    return () => clearTimeout(t);
  }, [preload]);
  // Solta o arquivo da memória quando outro PDF é gerado ou a tela fecha.
  useEffect(() => (url ? () => URL.revokeObjectURL(url) : undefined), [url]);

  async function generate() {
    setState({ kind: "busy" });
    try {
      const pdf = await make();
      setState({ kind: "ready", pdf, version, url: URL.createObjectURL(pdf.blob) });
    } catch (e) {
      console.error(e);
      setState({ kind: "idle" });
      toast("Não foi possível montar o PDF. Tente de novo.");
    }
  }

  async function send(pdf: MadePdf) {
    const how = await shareFile(pdf.blob, pdf.fileName, pdf.title);
    if (how === "saved") toast("PDF baixado. Anexe no WhatsApp pela conversa.");
  }

  if (!ready) {
    return (
      <Button className="w-full" variant={primary ? "primary" : "secondary"} onClick={generate} disabled={state.kind === "busy"}>
        {state.kind === "busy" ? <LoaderCircle className="size-4 animate-spin" /> : <FileText className="size-4" />}
        {state.kind === "busy" ? "Montando o PDF…" : label}
      </Button>
    );
  }
  const kb = Math.max(1, Math.round(ready.blob.size / 1024));
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Button onClick={() => send(ready)}>
          <Send className="size-4" /> Enviar PDF
        </Button>
        <Button variant="secondary" aria-label="Baixar PDF" title="Baixar PDF" onClick={() => saveFile(ready.blob, ready.fileName, "application/pdf")}>
          <Download className="size-4" />
        </Button>
      </div>
      <p className="text-center text-xs text-muted">
        Pronto: {ready.fileName} ({kb < 1024 ? `${kb} KB` : `${(kb / 1024).toFixed(1).replace(".", ",")} MB`}).{" "}
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" className="font-medium text-brand underline">
            Ver antes de enviar
          </a>
        ) : null}
      </p>
    </div>
  );
}
