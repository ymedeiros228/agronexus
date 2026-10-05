import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export const inputClass =
  "w-full rounded-xl border border-border bg-surface px-3.5 py-3 text-foreground placeholder:text-muted/70 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20";

/** Mostra o aviso do navegador num campo do formulário; some quando o usuário edita o campo. */
export function rejectField(form: HTMLFormElement, name: string, message: string) {
  const input = form.elements.namedItem(name);
  if (!(input instanceof HTMLInputElement)) return;
  input.setCustomValidity(message);
  input.reportValidity();
  input.addEventListener("input", () => input.setCustomValidity(""), { once: true });
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-strong shadow-sm",
  secondary: "bg-surface text-foreground border border-border hover:bg-brand-soft",
  ghost: "text-brand hover:bg-brand-soft",
  danger: "text-danger hover:bg-danger/10",
};

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function LinkButton({
  href,
  variant = "primary",
  className = "",
  children,
}: {
  href: string;
  variant?: Variant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </Link>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  // Duas classes do mesmo tipo no mesmo elemento: vence a que vem depois no CSS, não no className.
  // Por isso o padrão só entra quando quem usa não passou o seu.
  const padding = /(^|\s)p-[\d.[]/.test(className) ? "" : "p-4";
  const bg = /(^|\s)bg-/.test(className) ? "" : "bg-surface";
  const borderColor = /(^|\s)border-(?!dashed|dotted|solid|double|none|[xytrbl]\b|[xytrbl]-|\d)[a-z]/.test(className)
    ? ""
    : "border-border";
  return (
    <div className={`rounded-2xl border ${borderColor} ${bg} shadow-[0_1px_2px_rgba(16,24,20,0.04)] ${padding} ${className}`}>
      {children}
    </div>
  );
}

export function PageTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-40 flex-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">{children}</h2>;
}

export function Empty({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <Card className="border-dashed text-center">
      <p className="font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-xs text-sm text-muted">{text}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </Card>
  );
}

export function Chip({ children, tone = "brand" }: { children: ReactNode; tone?: "brand" | "warn" | "muted" }) {
  const tones = {
    brand: "bg-brand-soft text-brand-strong",
    warn: "bg-warn/10 text-warn",
    muted: "bg-border/60 text-muted",
  };
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

/**
 * Esqueleto da tela enquanto o banco local responde. Só aparece depois de 150 ms,
 * para não piscar quando a leitura é rápida.
 */
export function PageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Carregando" className="skeleton-in space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-48 animate-pulse rounded-lg bg-border/70" />
        <div className="h-4 w-64 max-w-full animate-pulse rounded-lg bg-border/50" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex gap-3 rounded-2xl border border-border bg-surface p-4">
            <div className="size-12 shrink-0 animate-pulse rounded-xl bg-border/60" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-4 w-2/3 animate-pulse rounded bg-border/70" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-border/50" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
