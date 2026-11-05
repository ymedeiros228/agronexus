"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Bug, ClipboardList, MapPinned, Sprout, Tractor, WifiOff, Wheat, type LucideIcon } from "lucide-react";
import { LoadDemoButton } from "./demo-bits";
import { Card, SectionTitle } from "./ui";
import { todayLong } from "@/lib/format";
import { chooseMode, type Mode } from "@/lib/profile";

const WELCOME_STEPS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: MapPinned, title: "Fazendas e talhões", text: "Cadastre a área, a cultivar e o plantio. Desenhe o contorno pelo GPS ou importe do CAR." },
  { icon: Bug, title: "Monitoramento", text: "Anote pragas, doenças e daninhas com foto, estágio e retorno combinado." },
  { icon: Tractor, title: "Operações e custos", text: "Plantio, aplicações e colheita com insumos do estoque. Custo por hectare e por saca." },
];

const CHOICES: { mode: Mode; icon: LucideIcon; title: string; who: string; gets: string }[] = [
  {
    mode: "campo",
    icon: ClipboardList,
    title: "Vou a campo",
    who: "Agrônomo, técnico, consultor, comercial, estagiário ou monitor",
    gets: "Agenda do dia, carteira de clientes e relatório da visita com o seu nome e registro.",
  },
  {
    mode: "gestao",
    icon: Wheat,
    title: "Cuido da fazenda",
    who: "Produtor, gestor ou gerente",
    gets: "Painel da safra, operações, estoque, custo por hectare e margem.",
  },
];

function Hero({ children }: { children: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0f2b1c] via-[#14532f] to-[#1c6b41] p-6 text-white shadow-lg shadow-[#1c6b41]/20 sm:p-8">
      <Sprout aria-hidden className="pointer-events-none absolute -bottom-12 -right-10 size-56 text-white/[0.07]" strokeWidth={1.4} />
      <p className="relative text-sm text-white/70">{todayLong()}</p>
      <h1 className="relative mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Boas-vindas ao AgroNexus</h1>
      {children}
    </section>
  );
}

/**
 * Primeira tela. Sem perfil, pergunta como a pessoa vai usar o app (ADR 0008);
 * no modo gestão sem fazenda, mostra os primeiros passos do produtor.
 */
export function Welcome({ choose = false }: { choose?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Mode | null>(null);

  async function pick(mode: Mode) {
    setBusy(mode);
    await chooseMode(mode);
    // Quem vai a campo preenche o perfil logo: o nome e o registro saem no relatório.
    if (mode === "campo") router.push("/perfil?inicio=1");
    else setBusy(null);
  }

  if (choose) {
    return (
      <>
        <Hero>
          <p className="relative mt-3 max-w-md text-white/80">
            Monitoramento da lavoura de soja, do talhão ao relatório, funcionando sem sinal.
          </p>
        </Hero>

        <section className="space-y-3" aria-labelledby="como-usa">
          <h2 id="como-usa" className="text-lg font-semibold tracking-tight">
            Como você vai usar?
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {CHOICES.map((c) => (
              <button
                key={c.mode}
                type="button"
                disabled={busy !== null}
                onClick={() => pick(c.mode)}
                className="group flex min-h-32 items-start gap-4 rounded-2xl border border-border bg-surface p-4 text-left shadow-[0_1px_2px_rgba(16,24,20,0.04)] transition hover:border-brand/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand active:scale-[0.99] disabled:opacity-60"
              >
                <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                  <c.icon className="size-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-lg font-semibold">{c.title}</span>
                    <ArrowRight aria-hidden className="size-5 text-muted transition group-hover:translate-x-0.5 group-hover:text-brand" />
                  </span>
                  <span className="mt-0.5 block text-sm font-medium text-brand-strong">{c.who}</span>
                  <span className="mt-1.5 block text-sm text-muted">{c.gets}</span>
                </span>
              </button>
            ))}
          </div>
          <p className="text-sm text-muted">Dá para trocar depois em “Meu perfil”.</p>
        </section>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
          Quer só conhecer? <LoadDemoButton className="text-brand" />
        </div>
      </>
    );
  }

  return (
    <>
      <Hero>
        <p className="relative mt-3 max-w-md text-white/80">
          O caderno da lavoura de soja: monitoramento, operações, estoque e resultado da safra, num só lugar.
        </p>
        <div className="relative mt-6 flex flex-wrap gap-3">
          <Link
            href="/fazendas"
            className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-white px-5 font-semibold text-[#14532f] shadow-sm transition active:scale-[0.98]"
          >
            Cadastrar a primeira fazenda <ArrowRight className="size-4" />
          </Link>
          <LoadDemoButton className="text-white" />
        </div>
      </Hero>

      <section className="space-y-3">
        <SectionTitle>Como funciona</SectionTitle>
        <ol className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {WELCOME_STEPS.map((s, i) => (
            <li key={s.title}>
              <Card className="flex h-full gap-3">
                <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                  <s.icon className="size-5" />
                </span>
                <span>
                  <span className="block font-medium">
                    <span className="text-muted">{i + 1}.</span> {s.title}
                  </span>
                  <span className="mt-0.5 block text-sm text-muted">{s.text}</span>
                </span>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <OfflineNote />
    </>
  );
}

export function OfflineNote() {
  return (
    <Card className="flex items-start gap-3 bg-brand-soft/50">
      <WifiOff aria-hidden className="mt-0.5 size-5 shrink-0 text-brand" />
      <p className="text-sm">
        <span className="font-medium">Funciona sem sinal no meio da lavoura.</span>{" "}
        <span className="text-muted">Tudo fica salvo no aparelho. Faça backup em “Dados e backup”.</span>
      </p>
    </Card>
  );
}
