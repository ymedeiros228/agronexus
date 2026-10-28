"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent, type ReactNode } from "react";
import { CloudCheck, CloudOff, LogOut, RefreshCw } from "lucide-react";
import { requestSync, useCloudStatus } from "@/components/cloud-sync";
import { toast } from "@/components/toaster";
import { Button, Card, Field, inputClass, LinkButton, PageSkeleton, PageTitle } from "@/components/ui";
import { countPending, friendlyError } from "@/lib/sync/engine";
import { cloudConfigured, sendPasswordReset, signIn, signOut, signUp, updatePassword } from "@/lib/sync/cloud";

const SUBTITLE = "O que você registra sem sinal sobe sozinho quando o sinal volta e aparece no computador e em outro celular.";

export default function CloudPage() {
  return (
    <Suspense fallback={null}>
      <Cloud />
    </Suspense>
  );
}

function Cloud() {
  const newPassword = useSearchParams().get("nova-senha") === "1";
  const { session, linked } = useCloudStatus();

  if (!cloudConfigured) return <NotConfigured />;
  if (session === undefined) return <PageSkeleton rows={2} />;
  if (session && newPassword) return <NewPassword />;
  if (session && linked) return <Account />;
  if (session) {
    return (
      <>
        <PageTitle title="Conta na nuvem" />
        <Card>
          <p role="status" className="text-sm text-muted">
            Ligando este aparelho à sua conta…
          </p>
        </Card>
      </>
    );
  }
  return <SignIn />;
}

function NotConfigured() {
  return (
    <>
      <PageTitle title="Conta na nuvem" subtitle={SUBTITLE} />
      <Card className="flex items-start gap-3">
        <CloudOff aria-hidden className="mt-0.5 size-5 shrink-0 text-muted" />
        <div className="space-y-3 text-sm">
          <p>
            <span className="font-medium">Ainda não ligada nesta versão do app.</span>{" "}
            <span className="text-muted">Enquanto isso, tudo fica salvo neste aparelho, mesmo sem internet.</span>
          </p>
          <LinkButton href="/dados" variant="secondary">
            Fazer backup
          </LinkButton>
        </div>
      </Card>
    </>
  );
}

function Problem({ text }: { text: string }) {
  if (!text) return null;
  return (
    <p role="alert" className="rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
      {text}
    </p>
  );
}

type Tab = "entrar" | "criar" | "esqueci";

function SignIn() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("entrar");
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<{ email: string; why: "confirmar" | "senha" } | null>(null);

  function choose(next: Tab) {
    setTab(next);
    setProblem("");
    setSentTo(null);
  }

  async function run(e: FormEvent<HTMLFormElement>, action: (f: FormData) => Promise<void>) {
    e.preventDefault();
    setProblem("");
    setBusy(true);
    try {
      await action(new FormData(e.currentTarget));
    } catch (err) {
      setProblem(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function done() {
    const n = await countPending();
    toast(n ? `Conta ligada. ${n === 1 ? "1 registro deste aparelho vai" : `${n} registros deste aparelho vão`} subir para ela.` : "Conta ligada.");
    router.push("/");
  }

  const get = (f: FormData, k: string) => String(f.get(k) ?? "");

  return (
    <>
      <PageTitle title="Conta na nuvem" subtitle={SUBTITLE} />

      {tab !== "esqueci" ? (
        <div role="tablist" aria-label="Entrar ou criar conta" className="grid grid-cols-2 gap-1 rounded-xl bg-border/50 p-1">
          {(
            [
              ["entrar", "Entrar"],
              ["criar", "Criar conta"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => choose(value)}
              className={`min-h-10 rounded-lg text-sm font-medium transition ${tab === value ? "bg-surface text-foreground shadow-sm" : "text-muted"}`}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {sentTo ? (
        <Card className="bg-brand-soft/40 text-sm">
          {sentTo.why === "confirmar" ? (
            <p>
              <span className="font-medium">Falta confirmar o e-mail.</span> Abra o link que mandamos para {sentTo.email}; ele traz você de
              volta já com a conta ligada.
            </p>
          ) : (
            <p>
              <span className="font-medium">Link enviado.</span> Se houver conta com {sentTo.email}, chega um e-mail com o link para
              criar uma senha nova.
            </p>
          )}
        </Card>
      ) : (
        <Card>
          {tab === "entrar" ? (
            <form
              onSubmit={(e) =>
                run(e, async (f) => {
                  await signIn(get(f, "email"), get(f, "password"));
                  await done();
                })
              }
              className="space-y-4"
            >
              <EmailField />
              <Field label="Senha">
                <input name="password" type="password" required autoComplete="current-password" className={inputClass} />
              </Field>
              <Problem text={problem} />
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? "Entrando…" : "Entrar"}
              </Button>
              <button type="button" onClick={() => choose("esqueci")} className="block w-full py-1 text-center text-sm font-medium text-brand">
                Esqueci a senha
              </button>
            </form>
          ) : tab === "criar" ? (
            <form
              onSubmit={(e) =>
                run(e, async (f) => {
                  const email = get(f, "email");
                  const result = await signUp(get(f, "name"), email, get(f, "password"));
                  if (result === "confirmar-email") setSentTo({ email, why: "confirmar" });
                  else await done();
                })
              }
              className="space-y-4"
            >
              <Field label="Seu nome">
                <input name="name" required autoComplete="name" className={inputClass} />
              </Field>
              <EmailField />
              <Field label="Senha" hint="Pelo menos 8 caracteres.">
                <input name="password" type="password" required minLength={8} autoComplete="new-password" className={inputClass} />
              </Field>
              <Problem text={problem} />
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? "Criando…" : "Criar conta"}
              </Button>
            </form>
          ) : (
            <form
              onSubmit={(e) =>
                run(e, async (f) => {
                  const email = get(f, "email");
                  await sendPasswordReset(email);
                  setSentTo({ email, why: "senha" });
                })
              }
              className="space-y-4"
            >
              <p className="text-sm text-muted">Mandamos um link para o seu e-mail para criar uma senha nova.</p>
              <EmailField />
              <Problem text={problem} />
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? "Enviando…" : "Enviar link"}
              </Button>
              <button type="button" onClick={() => choose("entrar")} className="block w-full py-1 text-center text-sm font-medium text-brand">
                Voltar para entrar
              </button>
            </form>
          )}
        </Card>
      )}

      <p className="text-sm text-muted">Sem conta, o app continua funcionando só neste aparelho, como sempre.</p>
    </>
  );
}

function EmailField() {
  return (
    <Field label="E-mail">
      <input name="email" type="email" required autoComplete="email" inputMode="email" className={inputClass} />
    </Field>
  );
}

function NewPassword() {
  const router = useRouter();
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setProblem("");
    try {
      await updatePassword(String(new FormData(e.currentTarget).get("password") ?? ""));
      toast("Senha nova salva.");
      router.replace("/entrar");
    } catch (err) {
      setProblem(friendlyError(err));
      setBusy(false);
    }
  }

  return (
    <>
      <PageTitle title="Senha nova" />
      <Card>
        <form onSubmit={save} className="space-y-4">
          <Field label="Senha nova" hint="Pelo menos 8 caracteres.">
            <input name="password" type="password" required minLength={8} autoComplete="new-password" autoFocus className={inputClass} />
          </Field>
          <Problem text={problem} />
          <Button type="submit" disabled={busy} className="w-full">
            Salvar senha
          </Button>
        </form>
      </Card>
    </>
  );
}

function Account() {
  const router = useRouter();
  const { account, pending, state } = useCloudStatus();
  const [busy, setBusy] = useState(false);

  async function leave() {
    if (!window.confirm("Sair da conta? Os dados saem deste aparelho, mas continuam na sua conta e voltam quando você entrar de novo.")) return;
    setBusy(true);
    try {
      await signOut();
      toast("Você saiu da conta. Este aparelho ficou limpo.");
      router.push("/");
    } catch (err) {
      toast(friendlyError(err));
      setBusy(false);
    }
  }

  let status: ReactNode;
  if (state.running) status = "Enviando…";
  else if (state.error) status = <span className="text-danger">Não enviou: {state.error}</span>;
  else if (pending) status = `${pending === 1 ? "1 registro" : `${pending} registros`} para enviar.`;
  else if (state.lastOk) status = `Tudo enviado. Última conferência às ${new Date(state.lastOk).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`;
  else status = "Tudo enviado.";

  return (
    <>
      <PageTitle title="Conta na nuvem" subtitle={SUBTITLE} />
      <Card className="space-y-4">
        <div className="flex items-start gap-3">
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
            <CloudCheck className="size-6" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold">{account?.email}</p>
            <p role="status" className="text-sm text-muted">
              {status}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="secondary" onClick={requestSync} disabled={state.running} className="sm:flex-1">
            <RefreshCw aria-hidden className="size-4" /> Enviar agora
          </Button>
          <Button variant="danger" onClick={leave} disabled={busy} className="sm:flex-1">
            <LogOut aria-hidden className="size-4" /> Sair da conta
          </Button>
        </div>
      </Card>
      <p className="text-sm text-muted">
        O envio é automático: ao abrir o app, quando o sinal volta, a cada minuto e logo depois de cada registro. Ao sair, este aparelho
        fica limpo; tudo continua na sua conta.
      </p>
    </>
  );
}
