"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { ClipboardList, Wheat, type LucideIcon } from "lucide-react";
import { LogoPicker } from "@/components/logo-picker";
import { useProfile } from "@/components/profile-bits";
import { toast } from "@/components/toaster";
import { Button, Card, Field, inputClass, PageSkeleton, PageTitle, SectionTitle } from "@/components/ui";
import {
  asksSupervisor,
  authorFromProfile,
  cleanProfile,
  emptyProfile,
  needsSupervisor,
  profileProblems,
  registryLabel,
  ROLES,
  saveProfile,
  signatureLines,
  type Mode,
  type Profile,
} from "@/lib/profile";

const MODES: { mode: Mode; icon: LucideIcon; title: string; text: string }[] = [
  { mode: "campo", icon: ClipboardList, title: "Vou a campo", text: "Abre na agenda do dia" },
  { mode: "gestao", icon: Wheat, title: "Cuido da fazenda", text: "Abre no painel da safra" },
];

export default function ProfilePage() {
  return (
    <Suspense fallback={null}>
      <ProfileLoader />
    </Suspense>
  );
}

function ProfileLoader() {
  const profile = useProfile();
  if (profile === undefined) return <PageSkeleton rows={3} />;
  return <ProfileForm initial={profile ?? emptyProfile()} />;
}

function ProfileForm({ initial }: { initial: Profile }) {
  const router = useRouter();
  // Vindo da primeira tela: depois de salvar, segue para a agenda.
  const firstRun = useSearchParams().get("inicio") === "1";
  const [p, setP] = useState(initial);
  const [problems, setProblems] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof Profile>(key: K, value: Profile[K]) => setP((old) => ({ ...old, [key]: value }));
  const registry = registryLabel(p.role);
  const supervisor = asksSupervisor(p.role);
  const role = ROLES.find((r) => r.value === p.role);
  const signature = signatureLines(authorFromProfile(cleanProfile(p)));

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const found = profileProblems(p);
    setProblems(found);
    if (found.length) {
      // Leva o dedo direto ao campo que falta (nome ou responsável).
      e.currentTarget.querySelector<HTMLElement>(":invalid")?.focus();
      return;
    }
    setSaving(true);
    await saveProfile(p);
    toast("Perfil salvo.");
    if (firstRun) router.push("/");
    else setSaving(false);
  }

  return (
    <>
      <PageTitle
        title={firstRun ? "Quem assina as visitas" : "Meu perfil"}
        subtitle="Seu nome, função e registro saem no fim de cada relatório de visita. Fica salvo neste aparelho."
      />

      <form onSubmit={submit} className="space-y-6" noValidate>
        <section className="space-y-2" aria-labelledby="modo">
          <SectionTitle>
            <span id="modo">Como você usa</span>
          </SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            {MODES.map((m) => (
              <button
                key={m.mode}
                type="button"
                onClick={() => set("mode", m.mode)}
                aria-pressed={p.mode === m.mode}
                className={`flex min-h-20 items-start gap-2.5 rounded-2xl border p-3 text-left transition ${
                  p.mode === m.mode ? "border-brand bg-brand-soft ring-2 ring-brand/20" : "border-border bg-surface"
                }`}
              >
                <m.icon aria-hidden className={`mt-0.5 size-5 shrink-0 ${p.mode === m.mode ? "text-brand" : "text-muted"}`} />
                <span>
                  <span className="block font-semibold">{m.title}</span>
                  <span className="block text-xs text-muted">{m.text}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <Card className="space-y-4">
          <Field label="Seu nome">
            <input
              name="name"
              required
              autoFocus={firstRun}
              autoComplete="name"
              value={p.name}
              onChange={(e) => set("name", e.target.value)}
              className={inputClass}
              placeholder="Como sai no relatório"
            />
          </Field>

          <div className="space-y-2">
            <p className="text-sm font-medium">Função</p>
            <div className="grid grid-cols-2 gap-2">
              {ROLES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => set("role", r.value)}
                  aria-pressed={p.role === r.value}
                  className={`min-h-12 rounded-xl border px-3 py-2 text-left text-sm font-medium leading-snug transition ${
                    p.role === r.value ? "border-brand bg-brand-soft text-brand-strong ring-2 ring-brand/20" : "border-border bg-surface"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            {role?.text ? <p className="text-xs text-muted">{role.text}</p> : null}
          </div>

          {registry ? (
            <Field label={registry}>
              <input
                name="registry"
                value={p.registry}
                onChange={(e) => set("registry", e.target.value)}
                className={inputClass}
                placeholder={p.role === "engenheiro" ? "Ex.: CREA-MA 123456/D" : undefined}
              />
            </Field>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Empresa" hint="Revenda, cooperativa, consultoria ou fazenda.">
              <input
                name="company"
                autoComplete="organization"
                value={p.company}
                onChange={(e) => set("company", e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Telefone">
              <input
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={p.phone}
                onChange={(e) => set("phone", e.target.value)}
                className={inputClass}
                placeholder="(99) 99999-9999"
              />
            </Field>
          </div>

          <LogoPicker value={p.logo} onChange={(logo) => set("logo", logo)} />
        </Card>

        {supervisor ? (
          <section className="space-y-2" aria-labelledby="responsavel">
            <SectionTitle>
              <span id="responsavel">Responsável técnico</span>
            </SectionTitle>
            <Card className="space-y-4">
              <p className="text-sm text-muted">
                {needsSupervisor(p.role)
                  ? "Obrigatório: o relatório sai sob supervisão do engenheiro(a) agrônomo(a) que responde por você."
                  : "Se você trabalha sob a responsabilidade de um engenheiro(a) agrônomo(a), ele(a) aparece no relatório."}
              </p>
              <Field label="Nome do engenheiro(a) agrônomo(a)">
                <input
                  name="supervisorName"
                  required={needsSupervisor(p.role)}
                  value={p.supervisorName}
                  onChange={(e) => set("supervisorName", e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="CREA do responsável">
                <input
                  name="supervisorRegistry"
                  value={p.supervisorRegistry}
                  onChange={(e) => set("supervisorRegistry", e.target.value)}
                  className={inputClass}
                  placeholder="Ex.: CREA-MA 123456/D"
                />
              </Field>
            </Card>
          </section>
        ) : null}

        <section className="space-y-2" aria-labelledby="previa">
          <SectionTitle>
            <span id="previa">Como sai no relatório</span>
          </SectionTitle>
          <Card className="bg-brand-soft/40">
            {signature.length ? (
              <div className="text-sm">
                <p className="text-muted">…recomendação e retorno combinado</p>
                <p className="my-1.5 text-muted" aria-hidden>
                  —
                </p>
                {signature.map((line, i) => (
                  <p key={line} className={i === 0 ? "font-semibold" : "text-muted"}>
                    {line}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">Preencha o seu nome para ver a assinatura.</p>
            )}
          </Card>
        </section>

        {problems.length ? (
          <div role="alert" className="rounded-2xl border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
            {problems.map((m) => (
              <p key={m}>{m}</p>
            ))}
          </div>
        ) : null}

        <Button type="submit" disabled={saving} className="w-full">
          {!firstRun ? "Salvar perfil" : p.mode === "campo" ? "Salvar e ver a agenda" : "Salvar e ver o painel"}
        </Button>
      </form>
    </>
  );
}
