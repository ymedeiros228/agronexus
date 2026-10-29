/** Entrega um arquivo para a pessoa baixar (backup, planilha, contorno). Só no navegador. */
export function saveFile(data: Blob | string, name: string, type = "application/octet-stream") {
  const blob = typeof data === "string" ? new Blob([data], { type }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Nome de arquivo sem acento nem espaço: "Talhão 3 - Baixada" → "talhao-3-baixada". */
export function fileSlug(name: string, fallback = "arquivo"): string {
  const slug = name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\w]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return slug || fallback;
}
