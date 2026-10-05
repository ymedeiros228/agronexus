"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  Bug,
  CalendarRange,
  ClipboardList,
  HardDrive,
  LayoutDashboard,
  Map as MapIcon,
  MapPinned,
  Menu,
  Package,
  PackagePlus,
  Plus,
  Sprout,
  Tractor,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { DemoBanner } from "./demo-bits";
import { OnlineBadge } from "./online-badge";
import { Toaster } from "./toaster";

type NavItem = { href: string; label: string; short: string; icon: LucideIcon; match: (p: string) => boolean };

const PANEL: NavItem = { href: "/", label: "Painel", short: "Painel", icon: LayoutDashboard, match: (p) => p === "/" };
const FARMS: NavItem = {
  href: "/fazendas",
  label: "Fazendas e talhões",
  short: "Fazendas",
  icon: MapPinned,
  match: (p) => p.startsWith("/fazenda") || p.startsWith("/talhao"),
};
const OPERATIONS: NavItem = {
  href: "/operacoes",
  label: "Operações",
  short: "Operações",
  icon: Tractor,
  match: (p) => p.startsWith("/operac"),
};
const MAP: NavItem = { href: "/mapa", label: "Mapa", short: "Mapa", icon: MapIcon, match: (p) => p.startsWith("/mapa") };
const SEASONS: NavItem = {
  href: "/safras",
  label: "Safras e relatórios",
  short: "Safras",
  icon: CalendarRange,
  match: (p) => p.startsWith("/safra"),
};
const FINANCE: NavItem = {
  href: "/financeiro",
  label: "Financeiro",
  short: "Financeiro",
  icon: Wallet,
  match: (p) => p.startsWith("/financeiro"),
};
const SUPPLIES: NavItem = {
  href: "/insumos",
  label: "Insumos e estoque",
  short: "Insumos",
  icon: Package,
  match: (p) => p.startsWith("/insumo"),
};
const MONITORING: NavItem = {
  href: "/visitas",
  label: "Monitoramento",
  short: "Monitorar",
  icon: Bug,
  match: (p) => p.startsWith("/visita"),
};
const DATA: NavItem = { href: "/dados", label: "Dados e backup", short: "Dados", icon: HardDrive, match: (p) => p.startsWith("/dados") };

const NAV = [PANEL, FARMS, MAP, SEASONS, OPERATIONS, SUPPLIES, FINANCE, MONITORING, DATA];
/** No celular, o que não cabe na barra inferior fica em "Mais". */
const MORE = [FARMS, MAP, SEASONS, SUPPLIES, FINANCE, DATA];

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
  {
    href: "/insumos/movimento?tipo=entrada",
    label: "Entrada de insumo",
    short: "Entrada de insumo",
    text: "Compra ou recebimento no estoque",
    icon: PackagePlus,
  },
];

/** Telas de painel e listas usam a largura toda no computador; formulários ficam estreitos. */
const WIDE = ["/", "/operacoes", "/visitas", "/fazendas", "/insumos", "/safras", "/safra", "/financeiro", "/mapa"];

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

function SheetLink({
  href,
  icon: Icon,
  label,
  text,
  active = false,
  onClick,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  text?: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-2xl border p-4 active:bg-brand-soft ${
        active ? "border-brand bg-brand-soft" : "border-border"
      }`}
    >
      <span className="grid size-11 place-items-center rounded-xl bg-brand-soft text-brand">
        <Icon className="size-5" />
      </span>
      <span>
        <span className="block font-medium">{label}</span>
        {text ? <span className="block text-sm text-muted">{text}</span> : null}
      </span>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [sheet, setSheet] = useState<"novo" | "mais" | null>(null);
  const wide = WIDE.includes(pathname);
  const mobileNav = [PANEL, OPERATIONS, null, MONITORING];
  const moreActive = MORE.some((m) => m.match(pathname));

  return (
    <div className="min-h-dvh md:pl-64 print:pl-0">
      {/* Computador: barra lateral */}
      <aside className="no-print fixed inset-y-0 left-0 z-20 hidden w-64 flex-col overflow-y-auto bg-sidebar px-4 py-5 text-sidebar-fg md:flex">
        <div className="px-2">
          <Logo dark />
        </div>
        <div className="mt-6 grid grid-cols-1 gap-2">
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
        <div className="mt-4 space-y-2 px-2 text-xs text-sidebar-muted">
          <OnlineBadge />
          <p>Seus dados ficam neste aparelho. Faça backup em “Dados e backup”.</p>
        </div>
      </aside>

      {/* Celular: cabeçalho */}
      <header className="no-print sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur md:hidden">
        <Logo />
        <OnlineBadge />
      </header>

      <main
        className={`mx-auto w-full space-y-6 px-4 pb-28 pt-5 md:px-8 md:pb-12 md:pt-8 ${
          wide ? "max-w-xl md:max-w-6xl" : "max-w-xl md:max-w-2xl"
        }`}
      >
        <DemoBanner />
        {children}
      </main>

      <Toaster />

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
                    onClick={() => setSheet("novo")}
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
          <li>
            <button
              type="button"
              onClick={() => setSheet("mais")}
              aria-haspopup="dialog"
              className={`flex min-h-12 w-full flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-medium ${
                moreActive ? "text-brand" : "text-muted"
              }`}
            >
              <Menu className="size-[22px]" strokeWidth={moreActive ? 2.4 : 2} />
              Mais
            </button>
          </li>
        </ul>
      </nav>

      {sheet ? (
        <div
          className="no-print fixed inset-0 z-30 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label={sheet === "novo" ? "Registrar" : "Mais"}
        >
          <button type="button" aria-label="Fechar" className="absolute inset-0 bg-black/40" onClick={() => setSheet(null)} />
          <div className="absolute inset-x-0 bottom-0 space-y-3 rounded-t-3xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl">
            <div className="flex items-center justify-between">
              <p className="font-semibold">{sheet === "novo" ? "O que você quer registrar?" : "Mais"}</p>
              <button type="button" onClick={() => setSheet(null)} aria-label="Fechar" className="grid size-10 place-items-center rounded-full text-muted">
                <X className="size-5" />
              </button>
            </div>
            {sheet === "novo" ? (
              NEW_ACTIONS.map((a) => (
                <SheetLink key={a.href} href={a.href} icon={a.icon} label={a.label} text={a.text} onClick={() => setSheet(null)} />
              ))
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {MORE.map((m) => {
                  const Icon = m.icon;
                  const active = m.match(pathname);
                  return (
                    <Link
                      key={m.href}
                      href={m.href}
                      onClick={() => setSheet(null)}
                      aria-current={active ? "page" : undefined}
                      className={`flex min-h-20 flex-col items-start justify-between gap-2 rounded-2xl border p-3 active:bg-brand-soft ${
                        active ? "border-brand bg-brand-soft" : "border-border"
                      }`}
                    >
                      <span className="grid size-9 place-items-center rounded-xl bg-brand-soft text-brand">
                        <Icon className="size-5" />
                      </span>
                      <span className="text-sm font-medium leading-tight">{m.label}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
