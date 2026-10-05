import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..", "..");
const appDir = join(root, "src", "app");

/** Rotas do app: cada page.tsx em src/app vira uma página estática. */
function appRoutes(dir: string = appDir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return appRoutes(path);
    if (entry.name !== "page.tsx") return [];
    const route = relative(appDir, dir).split(sep).join("/");
    return [`/${route}`];
  });
}

/** Lista PAGES do service worker, que ele baixa na instalação para uso offline. */
function swPages(): string[] {
  const source = readFileSync(join(root, "public", "sw.js"), "utf8");
  const block = /const PAGES = \[([^\]]*)\]/.exec(source);
  if (!block) throw new Error("PAGES não encontrado em public/sw.js");
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

describe("service worker", () => {
  it("baixa para uso offline todas as páginas do app", () => {
    expect([...swPages()].sort()).toEqual(appRoutes().sort());
  });
});
