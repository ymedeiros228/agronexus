"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  Bug,
  ClipboardList,
  HardDrive,
  LayoutDashboard,
  MapPinned,
  Plus,
  Sprout,
  Tractor,
  X,
  type LucideIcon,
} from "lucide-react";
import { OnlineBadge } from "./online-badge";

type NavItem = { href: string; label: string; short: string; icon: LucideIcon; match: (p: string) => boolean };

const NAV: NavItem[] = [
  { href: "/", label: "Painel", short: "Painel", icon: LayoutDashboard, match: (p) => p === "/" },
  {
    href: "/fazendas",
    label: "Fazendas e talhões",
    short: "Fazendas",
    icon: MapPinned,
    match: (p) => p.startsWith("/fazenda") || p.startsWith("/talhao"),
  },
  { href: "/operacoes", label: "Operações", short: "Operações", icon: Tractor, match: (p) => p.startsWith("/operac") },
  { href: "/visitas", label: "Monitoramento", short: "Monitorar", icon: Bug, match: (p) => p.startsWith("/visita") },
  { href: "/dados", label: "Dados e backup", short: "Dados", icon: HardDrive, match: (p) => p.startsWith("/dados") },
];

const NEW_ACTIONS = [
  {
    href: "/visitas/nova",
    label: "Visita de monitoramento",
    short: "Nova visita",
    text: "Pragas, doenças, fotos e recomendação",
    icon: ClipboardList,
  },
  {
    href: "/operacoes/nova",
    label: "Operação",
    short: "Nova operação",
    text: "Plantio, aplicação, adubação, colheita",
    icon: Tractor,
  },
];

/** Telas de painel e listas usam a largura toda no computador; formulários ficam estreitos. */
const WIDE = ["/", "/operacoes", "/visitas", "/fazendas"];

function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
      <span
        aria-hidden
        className={`grid size-8 place-items-center rounded-lg ${dark ? "bg-accent/15 text-accent" : "bg-brand text-white"}`}
      >
        <Sprout className="size-5" strokeWidth={2.2} />
      </span>
      <span className={dark ? "text-lg text-white" : ""}>AgroNexus</span>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [sheet, setSheet] = useState(false);
  const wide = WIDE.includes(pathname);
  const mobileNav = [NAV[0], NAV[1], null, NAV[2], NAV[3]];

  return (
    <div className="min-h-dvh md:pl-64 print:pl-0">
      {/* Computador: barra lateral */}
      <aside className="no-print fixed inset-y-0 left-0 z-20 hidden w-64 flex-col bg-sidebar px-4 py-5 text-sidebar-fg md:flex">
        <div className="px-2">
          <Logo dark />
        </div>
        <div className="mt-6 grid gap-2">
          {NEW_ACTIONS.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2.5 text-sm font-medium text-white ring-1 ring-white/10 transition hover:bg-white/10"
            >
              <Plus className="size-4 text-accent" /> {a.short}
            </Link>
          ))}
        </div>
        <nav aria-label="Navegação principal" className="mt-6 flex-1">
          <ul className="space-y-1">
            {NAV.map((item) => {
              const active = item.match(pathname);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                      active ? "bg-brand text-white shadow-sm" : "text-sidebar-fg hover:bg-white/5"
                    }`}
                  >
                    <Icon className="size-[18px]" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="space-y-2 px-2 text-xs text-sidebar-muted">
          <OnlineBadge />
          <p>Seus dados ficam neste aparelho. Faça backup em “Dados e backup”.</p>
        </div>
      </aside>

      {/* Celular: cabeçalho */}
      <header className="no-print sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur md:hidden">
        <Logo />
        <div className="flex items-center gap-2">
          <OnlineBadge />
          <Link
            href="/dados"
            aria-label="Dados e backup"
            className={`grid size-10 place-items-center rounded-full ${
              pathname.startsWith("/dados") ? "bg-brand-soft text-brand-strong" : "text-muted"
            }`}
          >
            <HardDrive className="size-5" />
          </Link>
        </div>
      </header>

      <main
        className={`mx-auto w-full space-y-6 px-4 pb-28 pt-5 md:px-8 md:pb-12 md:pt-8 ${
          wide ? "max-w-xl md:max-w-6xl" : "max-w-xl md:max-w-2xl"
        }`}
      >
        {children}
      </main>

      {/* Celular: navegação inferior */}
      <nav
        aria-label="Navegação principal"
        className="no-print fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface/95 backdrop-blur md:hidden"
      >
        <ul className="mx-auto grid max-w-xl grid-cols-5 items-end px-1 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-1.5">
          {mobileNav.map((item) => {
            if (!item) {
              return (
                <li key="novo" className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => setSheet(true)}
                    aria-label="Registrar"
                    aria-haspopup="dialog"
                    className="-mt-6 grid size-14 place-items-center rounded-full bg-brand text-white shadow-lg ring-4 ring-background active:scale-95"
                  >
                    <Plus className="size-7" />
                  </button>
                </li>
              );
            }
            const active = item.match(pathname);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-medium ${
                    active ? "text-brand" : "text-muted"
                  }`}
                >
                  <Icon className="size-[22px]" strokeWidth={active ? 2.4 : 2} />
                  {item.short}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {sheet ? (
        <div className="no-print fixed inset-0 z-30 md:hidden" role="dialog" aria-modal="true" aria-label="Registrar">
          <button type="button" aria-label="Fechar" className="absolute inset-0 bg-black/40" onClick={() => setSheet(false)} />
          <div className="absolute inset-x-0 bottom-0 space-y-3 rounded-t-3xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl">
            <div className="flex items-center justify-between">
              <p className="font-semibold">O que você quer registrar?</p>
              <button type="button" onClick={() => setSheet(false)} aria-label="Fechar" className="grid size-10 place-items-center rounded-full text-muted">
                <X className="size-5" />
              </button>
            </div>
            {NEW_ACTIONS.map((a) => {
              const Icon = a.icon;
              return (
                <Link
                  key={a.href}
                  href={a.href}
                  onClick={() => setSheet(false)}
                  className="flex items-center gap-3 rounded-2xl border border-border p-4 active:bg-brand-soft"
                >
                  <span className="grid size-11 place-items-center rounded-xl bg-brand-soft text-brand">
                    <Icon className="size-5" />
                  </span>
                  <span>
                    <span className="block font-medium">{a.label}</span>
                    <span className="block text-sm text-muted">{a.text}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
