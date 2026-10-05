import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "AgroNexus",
    short_name: "AgroNexus",
    description: "Caderno de monitoramento de soja que funciona sem internet.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "pt-BR",
    background_color: "#f6f7f4",
    theme_color: "#1c6b41",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Pressionar o ícone do app instalado abre direto o registro mais comum no campo.
    shortcuts: [
      { name: "Nova visita", short_name: "Visita", url: "/visitas/nova", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Nova operação", short_name: "Operação", url: "/operacoes/nova", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
    categories: ["productivity", "business"],
  };
}
