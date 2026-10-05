/* Service worker do AgroNexus: faz o app abrir e funcionar sem internet.
 * - /_next/static (arquivos com hash no nome): cache primeiro.
 * - Páginas e demais GET do mesmo site: rede primeiro, cache como reserva.
 * - Na instalação, baixa as páginas principais e seus arquivos para uso offline.
 * Os dados do usuário ficam no IndexedDB, não aqui.
 */
const CACHE = "agronexus-v11";
const PAGES = [
  "/",
  "/fazendas",
  "/fazenda",
  "/talhao",
  "/visitas",
  "/visita",
  "/visitas/nova",
  "/visitas/editar",
  "/operacoes",
  "/operacoes/nova",
  "/operacao",
  "/insumos",
  "/insumo",
  "/insumos/novo",
  "/insumos/editar",
  "/insumos/movimento",
  "/safras",
  "/safra",
  "/financeiro",
  "/financeiro/venda",
  "/financeiro/despesa",
  "/mapa",
  "/dados",
];
const EXTRAS = ["/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const assets = new Set(EXTRAS);
      for (const page of PAGES) {
        try {
          const res = await fetch(page, { cache: "reload" });
          if (!res.ok) continue;
          await cache.put(page, res.clone());
          const html = await res.text();
          for (const m of html.matchAll(/\/_next\/static\/[^"'\\\s)]+/g)) assets.add(m[0]);
        } catch {
          /* sem rede na instalação: as páginas entram no cache conforme forem abertas */
        }
      }
      await Promise.all(
        [...assets].map(async (url) => {
          try {
            await cache.add(url);
          } catch {
            /* ignora arquivo que não carregou */
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
    return;
  }

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(async () => {
        // /visita?id=A e /visita?id=B são a mesma página estática; por isso ignora a query.
        const hit = (await caches.match(req)) || (await caches.match(req, { ignoreSearch: true }));
        if (hit) return hit;
        if (req.mode === "navigate") {
          const home = await caches.match("/");
          if (home) return home;
        }
        return Response.error();
      }),
  );
});
