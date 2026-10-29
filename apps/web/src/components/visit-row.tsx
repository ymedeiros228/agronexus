import Link from "next/link";
import { visitBadge, visitKindInfo } from "@/lib/catalog";
import { formatDate, plotLabel, todayISO } from "@/lib/format";
import type { Visit } from "@/lib/db";
import { Card, Chip } from "./ui";

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Data em bloco, como folha de calendário: "03 / out". */
function DateBadge({ iso, warn = false }: { iso: string; warn?: boolean }) {
  const [, m, d] = iso.split("-");
  return (
    <span
      className={`grid w-12 shrink-0 place-items-center self-start rounded-xl py-1.5 ${warn ? "bg-warn/10 text-warn" : "bg-brand-soft text-brand-strong"}`}
      aria-hidden
    >
      <span className="text-lg font-semibold leading-none tabular-nums">{d}</span>
      <span className="mt-0.5 text-[11px] font-medium uppercase leading-none">{MONTHS[Number(m) - 1]}</span>
    </span>
  );
}

export function VisitRow({
  visit,
  farmName,
  plotName,
  showFollowUp = false,
}: {
  visit: Visit;
  /** Sem `farmName` (tela da própria fazenda), mostra só o talhão. */
  farmName?: string;
  plotName: string;
  showFollowUp?: boolean;
}) {
  const overdue = !!visit.followUpDate && !visit.followUpDone && visit.followUpDate < todayISO();
  /** Na lista de retornos, o bloco mostra a data do retorno. */
  const followUp = showFollowUp && visit.followUpDate ? visit.followUpDate : null;
  return (
    <Link href={`/visita?id=${visit.id}`} className="group block active:scale-[0.99]">
      <Card className="flex gap-3 transition group-hover:border-brand/40 group-hover:shadow-md">
        <DateBadge iso={followUp ?? visit.date} warn={!!followUp && overdue} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-semibold">{plotLabel(plotName)}</p>
              <p className="mt-0.5 truncate text-sm text-muted">
                {farmName ?? formatDate(visit.date)}
                {visit.kind && visit.kind !== "monitoramento" && visit.stage ? ` · ${visitKindInfo(visit.kind).label}` : ""}
              </p>
            </div>
            <Chip>{visitBadge(visit)}</Chip>
          </div>
          {followUp ? (
            <p className="mt-2">
              <Chip tone={overdue ? "warn" : "muted"}>
                {overdue ? "Atrasado · " : ""}visita de {formatDate(visit.date)}
              </Chip>
            </p>
          ) : visit.recommendation ? (
            <p className="mt-2 line-clamp-2 text-sm text-muted">{visit.recommendation}</p>
          ) : null}
        </div>
      </Card>
    </Link>
  );
}
