"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { OnlineBadge } from "./online-badge";

const items = [
  { href: "/", label: "Painel", match: (p: string) => p === "/" },
  { href: "/visitas/nova", label: "Visita", match: (p: string) => p.startsWith("/visitas/nova"), primary: true },
  { href: "/fazendas", label: "Fazendas", match: (p: string) => p.startsWith("/fazenda") },
  { href: "/dados", label: "Dados", match: (p: string) => p.startsWith("/dados") },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col">
      <header className="no-print sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span aria-hidden className="grid size-7 place-items-center rounded-lg bg-brand text-sm text-white">
            A
          </span>
          AgroNexus
        </Link>
        <OnlineBadge />
      </header>

      <main className="flex-1 space-y-6 px-4 pb-28 pt-5">{children}</main>

      <nav
        aria-label="Navegação principal"
        className="no-print fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface/95 backdrop-blur"
      >
        <ul className="mx-auto flex max-w-xl items-center justify-around px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
          {items.map((item) => {
            const active = item.match(pathname);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={
                    item.primary
                      ? "flex min-h-11 items-center whitespace-nowrap rounded-full bg-brand px-5 text-sm font-semibold text-white shadow-sm active:scale-[0.97]"
                      : `flex min-h-11 items-center rounded-full px-4 text-sm font-medium ${
                          active ? "bg-brand-soft text-brand-strong" : "text-muted"
                        }`
                  }
                >
                  {item.primary ? "+ " : ""}
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
