import Link from "next/link";
import { formatDate, todayISO } from "@/lib/format";
import type { Visit } from "@/lib/db";
import { Card, Chip } from "./ui";

export function VisitRow({
  visit,
  farmName,
  plotName,
  showFollowUp = false,
}: {
  visit: Visit;
  farmName: string;
  plotName: string;
  showFollowUp?: boolean;
}) {
  const overdue = !!visit.followUpDate && !visit.followUpDone && visit.followUpDate < todayISO();
  return (
    <Link href={`/visita?id=${visit.id}`} className="block active:scale-[0.99]">
      <Card className="transition hover:border-brand/40">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">
              {farmName} <span className="text-muted">· {plotName}</span>
            </p>
            <p className="mt-0.5 text-sm text-muted">{formatDate(visit.date)}</p>
          </div>
          <Chip>{visit.stage}</Chip>
        </div>
        {showFollowUp && visit.followUpDate ? (
          <p className="mt-3">
            <Chip tone={overdue ? "warn" : "muted"}>
              {overdue ? "Retorno atrasado: " : "Retorno: "}
              {formatDate(visit.followUpDate)}
            </Chip>
          </p>
        ) : visit.recommendation ? (
          <p className="mt-3 line-clamp-2 text-sm text-muted">{visit.recommendation}</p>
        ) : null}
      </Card>
    </Link>
  );
}
