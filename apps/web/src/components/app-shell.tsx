"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  Bug,
  CalendarCheck,
  CalendarRange,
  ClipboardList,
  Cloud,
  Contact,
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
  UserRound,
  UserRoundPlus,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import type { Mode } from "@/lib/profile";
import { CloudSync, useCloudStatus } from "./cloud-sync";
import { DemoBanner } from "./demo-bits";
import { OnlineBadge } from "./online-badge";
import { useMode } from "./profile-bits";
import { Toaster } from "./toaster";

type NavItem = { href: string; label: string; short: string; icon: LucideIcon; match: (p: string) => boolean };

const PANEL: NavItem = {
  href: "/",
  label: "Painel",
  short: "Painel",
  icon: LayoutDashboard,
  match: (p) => p === "/" || p === "/painel",
};
/** Modo campo: a tela inicial é a agenda do dia; o painel da safra fica em "Mais". */
const TODAY: NavItem = {
  href: "/",
  label: "Hoje",
  short: "Hoje",
  icon: CalendarCheck,
  match: (p) => p === "/" || p.startsWith("/agenda"),
};
const FIELD_PANEL: NavItem = { ...PANEL, href: "/painel", label: "Painel da safra", match: (p) => p === "/painel" };
const AGENDA: NavItem = { href: "/agenda", label: "Agenda de visitas", short: "Agenda", icon: CalendarCheck, match: (p) => p.startsWith("/agenda") };
const CLIENTS: NavItem = {
  href: "/clientes",
  label: "Clientes",
  short: "Clientes",
  icon: Contact,
  match: (p) => p.startsWith("/cliente"),
};
const PROFILE: NavItem = { href: "/perfil", label: "Meu perfil", short: "Perfil", icon: UserRound, match: (p) => p.startsWith("/perfil") };
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
const CLOUD: NavItem = { href: "/entrar", label: "Conta na nuvem", short: "Nuvem", icon: Cloud, match: (p) => p.startsWith("/entrar") };
const DATA: NavItem = { href: "/dados", label: "Dados e backup", short: "Dados", icon: HardDrive, match: (p) => p.startsWith("/dados") };
const VISITS: NavItem = { ...MONITORING, label: "Visitas", short: "Visitas", icon: ClipboardList };

type Action = { href: string; label: string; short: string; text: string; icon: LucideIcon };

const NEW_VISIT: Action = {
  href: "/visitas/nova",
  label: "Visita de monitoramento",
  short: "Nova visita",
  text: "Pragas, doenças, fotos e recomendação",
  icon: ClipboardList,
};
const NEW_OPERATION: Action = {
  href: "/operacoes/nova",
  label: "Operação",
  short: "Nova operação",
  text: "Plantio, aplicação, adubação, colheita",
  icon: Tractor,
};
const NEW_SUPPLY: Action = {
  href: "/insumos/movimento?tipo=entrada",
  label: "Entrada de insumo",
  short: "Entrada de insumo",
  text: "Compra ou recebimento no estoque",
  icon: PackagePlus,
};
const NEW_CLIENT: Action = {
  href: "/clientes?novo=1",
  label: "Cliente",
  short: "Novo cliente",
  text: "Produtor que você passa a atender",
  icon: UserRoundPlus,
};

/**
 * Menu de cada modo (ADR 0008). `bar` é a barra inferior do celular (null = botão +);
 * `more` é o que não coube nela. Nos dois modos dá para chegar em todas as telas.
 */
const MENUS: Record<Mode, { nav: NavItem[]; bar: (NavItem | null)[]; more: NavItem[]; actions: Action[] }> = {
  campo: {
    nav: [TODAY, CLIENTS, VISITS, FARMS, MAP, FIELD_PANEL, SEASONS, OPERATIONS, SUPPLIES, FINANCE, PROFILE, CLOUD, DATA],
    bar: [TODAY, CLIENTS, null, VISITS],
    more: [FARMS, MAP, FIELD_PANEL, SEASONS, OPERATIONS, SUPPLIES, FINANCE, PROFILE, CLOUD, DATA],
    actions: [NEW_VISIT, NEW_CLIENT, NEW_OPERATION],
  },
  gestao: {
    nav: [PANEL, FARMS, MAP, SEASONS, OPERATIONS, SUPPLIES, FINANCE, MONITORING, AGENDA, CLIENTS, PROFILE, CLOUD, DATA],
    bar: [PANEL, OPERATIONS, null, MONITORING],
    more: [FARMS, MAP, SEASONS, SUPPLIES, FINANCE, AGENDA, CLIENTS, PROFILE, CLOUD, DATA],
    actions: [NEW_VISIT, NEW_OPERATION, NEW_SUPPLY],
  },
};

/** Telas de painel e listas usam a largura toda no computador; formulários ficam estreitos. */
const WIDE = [
  "/",
  "/painel",
  "/agenda",
  "/clientes",
  "/cliente",
  "/operacoes",
  "/visitas",
  "/fazendas",
  "/insumos",
  "/safras",
  "/safra",
  "/financeiro",
  "/mapa",
];

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
  const mode = useMode();
  const { linked } = useCloudStatus();
  const wide = WIDE.includes(pathname);
  // Enquanto o modo não foi lido, o menu fica vazio (evita piscar o menu do outro modo).
  const menu = mode ? MENUS[mode] : { nav: [], bar: [undefined, undefined, null, undefined], more: [], actions: [] };
  const moreActive = menu.more.some((m) => m.match(pathname));

  return (
    <div className="min-h-dvh md:pl-64 print:pl-0">
      {/* Computador: barra lateral */}
      <aside className="no-print fixed inset-y-0 left-0 z-20 hidden w-64 flex-col overflow-y-auto bg-sidebar px-4 py-5 text-sidebar-fg [scrollbar-color:rgba(255,255,255,0.18)_transparent] [scrollbar-width:thin] md:flex">
        <div className="px-2">
          <Logo dark />
        </div>
        <div className="mt-6 grid grid-cols-1 gap-2">
          {menu.actions.map((a) => (
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
            {menu.nav.map((item) => {
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
          <p>
            {linked
              ? "Tudo fica salvo neste aparelho e sobe para a sua conta quando há sinal."
              : "Seus dados ficam neste aparelho. Faça backup em “Dados e backup”."}
          </p>
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
      <CloudSync />

      {/* Celular: navegação inferior */}
      <nav
        aria-label="Navegação principal"
        className="no-print fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface/95 backdrop-blur md:hidden"
      >
        <ul className="mx-auto grid max-w-xl grid-cols-5 items-end px-1 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-1.5">
          {menu.bar.map((item, i) => {
            if (item === undefined) return <li key={i} aria-hidden className="min-h-12" />;
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
          <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] space-y-3 overflow-y-auto rounded-t-3xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl">
            <div className="flex items-center justify-between">
              <p className="font-semibold">{sheet === "novo" ? "O que você quer registrar?" : "Mais"}</p>
              <button type="button" onClick={() => setSheet(null)} aria-label="Fechar" className="grid size-10 place-items-center rounded-full text-muted">
                <X className="size-5" />
              </button>
            </div>
            {sheet === "novo" ? (
              menu.actions.map((a) => (
                <SheetLink key={a.href} href={a.href} icon={a.icon} label={a.label} text={a.text} onClick={() => setSheet(null)} />
              ))
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {menu.more.map((m) => {
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
