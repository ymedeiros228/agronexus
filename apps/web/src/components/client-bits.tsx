import { MessageCircle, Phone } from "lucide-react";
import type { Client } from "@/lib/db";
import { initials, telLink, whatsappLink } from "@/lib/clients";
import { Field, inputClass } from "./ui";

export function ClientAvatar({ name, size = "size-12 text-base" }: { name: string; size?: string }) {
  return (
    <span aria-hidden className={`grid ${size} shrink-0 place-items-center rounded-full bg-brand-soft font-semibold text-brand-strong`}>
      {initials(name)}
    </span>
  );
}

/** Ligar e WhatsApp, só quando o telefone tem número suficiente. `compact` = só o ícone. */
export function ContactButtons({ name, phone, compact = false }: { name: string; phone: string; compact?: boolean }) {
  const tel = telLink(phone);
  const wa = whatsappLink(phone);
  if (!tel && !wa) return null;
  const cls = compact
    ? "grid size-11 shrink-0 place-items-center rounded-full border border-border bg-surface text-brand transition hover:bg-brand-soft active:scale-95"
    : "inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-brand transition hover:bg-brand-soft active:scale-[0.98]";
  return (
    <>
      {wa ? (
        <a href={wa} target="_blank" rel="noreferrer" className={cls} aria-label={compact ? `WhatsApp de ${name}` : undefined}>
          <MessageCircle aria-hidden className="size-5" />
          {compact ? null : "WhatsApp"}
        </a>
      ) : null}
      {tel ? (
        <a href={tel} className={cls} aria-label={compact ? `Ligar para ${name}` : undefined}>
          <Phone aria-hidden className="size-5" />
          {compact ? null : "Ligar"}
        </a>
      ) : null}
    </>
  );
}

/** Campos do cliente, iguais no cadastro e na edição. Lidos com FormData. */
export function ClientFields({ client, autoFocus = false }: { client?: Client; autoFocus?: boolean }) {
  return (
    <>
      <Field label="Nome do produtor ou empresa">
        <input name="name" required autoFocus={autoFocus} defaultValue={client?.name} className={inputClass} placeholder="Ex.: João Ribeiro" />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Telefone (WhatsApp)">
          <input name="phone" type="tel" inputMode="tel" defaultValue={client?.phone} className={inputClass} placeholder="(99) 99999-9999" />
        </Field>
        <Field label="Município">
          <input name="municipality" defaultValue={client?.municipality} className={inputClass} placeholder="Ex.: Balsas" />
        </Field>
      </div>
      <Field label="Observações" hint="Acesso à sede, melhor horário, quem recebe a visita.">
        <textarea name="notes" rows={2} defaultValue={client?.notes} className={inputClass} />
      </Field>
    </>
  );
}

export function clientInput(form: HTMLFormElement) {
  const f = new FormData(form);
  const get = (k: string) => String(f.get(k) ?? "");
  return { name: get("name"), phone: get("phone"), municipality: get("municipality"), notes: get("notes") };
}

/** Cliente da fazenda: escolhe da carteira ou digita um nome novo (o cliente é criado ao salvar). */
export function ClientField({ clients, defaultValue }: { clients: Client[]; defaultValue?: string }) {
  return (
    <Field label="Cliente (produtor)" hint="Escolha da lista ou digite um nome novo. Em branco = fazenda sem cliente.">
      <input name="client" list="client-options" autoComplete="off" defaultValue={defaultValue} className={inputClass} />
      <datalist id="client-options">
        {clients.map((c) => (
          <option key={c.id} value={c.name} />
        ))}
      </datalist>
    </Field>
  );
}
