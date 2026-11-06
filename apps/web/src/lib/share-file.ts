import { saveFile } from "./save-file";

/**
 * Manda um arquivo pelo menu "Compartilhar" do celular (WhatsApp, e-mail, Drive...).
 * Onde o navegador não compartilha arquivo (a maioria dos computadores), baixa o arquivo.
 * Precisa ser chamado direto no toque do botão: o iPhone recusa o menu depois de uma espera longa.
 */
export async function shareFile(blob: Blob, name: string, title: string): Promise<"shared" | "saved" | "cancelled"> {
  const file = new File([blob], name, { type: blob.type || "application/pdf" });
  if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return "shared";
    } catch (e) {
      // Fechou o menu sem escolher: não é erro.
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
      // Recusado (ex.: o toque "venceu"): baixa o arquivo.
    }
  }
  saveFile(blob, name, file.type);
  return "saved";
}
