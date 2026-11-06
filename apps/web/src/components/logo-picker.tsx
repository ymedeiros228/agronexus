"use client";

import { useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import { toast } from "@/components/toaster";

/** Maior lado da logo guardada: nítida no cabeçalho do PDF e leve no aparelho e no backup. */
const LOGO_PX = 400;

/**
 * Reduz a imagem no próprio aparelho e devolve em data URL. Fica em PNG para manter o fundo
 * transparente das logos; só vira JPEG se o PNG passar de ~300 KB (foto em vez de logo).
 */
async function logoFromFile(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, LOGO_PX / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bmp.width * k));
  canvas.height = Math.max(1, Math.round(bmp.height * k));
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const png = canvas.toDataURL("image/png");
  if (png.length < 400_000) return png;
  // JPEG não tem transparência: pinta o fundo de branco antes.
  const ctx = canvas.getContext("2d")!;
  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

/** Escolher, trocar ou tirar a logo que sai no cabeçalho do relatório em PDF. */
export function LogoPicker({ value, onChange }: { value?: string; onChange: (logo: string | undefined) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await logoFromFile(file));
    } catch (e) {
      console.error(e);
      toast("Não deu para abrir essa imagem. Tente uma foto ou um PNG.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Logo no relatório</p>
      <div className="flex items-center gap-3">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-white">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element -- imagem local em data URL
            <img src={value} alt="Sua logo" className="size-full object-contain" />
          ) : (
            <ImagePlus aria-hidden className="size-6 text-muted" />
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => input.current?.click()} disabled={busy}>
            {value ? "Trocar logo" : "Escolher imagem"}
          </Button>
          {value ? (
            <Button type="button" variant="secondary" aria-label="Tirar a logo" title="Tirar a logo" onClick={() => onChange(undefined)}>
              <Trash2 className="size-4" />
            </Button>
          ) : null}
        </div>
      </div>
      <p className="text-xs text-muted">Sai no alto do PDF da visita. Sem logo, vai a marca do AgroNexus.</p>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
    </div>
  );
}
