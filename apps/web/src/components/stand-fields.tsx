"use client";

import { useRef } from "react";
import { MapPin, Plus, X } from "lucide-react";
import type { StandCount, VisitKind } from "@/lib/db";
import { getPosition } from "@/lib/format";
import { formatNumberBR, parseNumberBR } from "@/lib/operations";
import { standUnit, summarizeStand } from "@/lib/stand";
import { Button, Card, Field, SectionTitle, inputClass } from "./ui";

/** Ponto em edição: os números ficam como texto até salvar ("1,5" vira 1.5 no fim). */
export type StandPointDraft = { key: string; plants: string; meters: string; lat: number | null; lng: number | null };

/** Campo sem a largura total do padrão: na linha do ponto, quem manda é o flex. */
const cellClass = inputClass.replace("w-full ", "");

export type StandDraft = {
  /** `null` = ainda não mexeu: mostra o que a safra já sabe. */
  spacing: string | null;
  target: string | null;
  points: StandPointDraft[];
};

export function standDraftFrom(stand: StandCount | null | undefined): StandDraft {
  return {
    spacing: stand?.spacingM != null ? formatNumberBR(stand.spacingM, 2) : null,
    target: stand?.targetPerHa != null ? formatNumberBR(stand.targetPerHa, 0) : null,
    points:
      stand?.points.map((p) => ({
        key: crypto.randomUUID(),
        plants: String(p.plants),
        meters: formatNumberBR(p.meters, 2),
        lat: p.lat,
        lng: p.lng,
      })) ?? [],
  };
}

/** Rascunho → contagem gravável, com o espaçamento e a população da safra quando não foram mexidos. */
export function standFromDraft(
  draft: StandDraft,
  season: { rowSpacingM?: number | null; targetPopulation?: number | null } | undefined,
): StandCount {
  return {
    spacingM: draft.spacing === null ? (season?.rowSpacingM ?? null) : parseNumberBR(draft.spacing),
    targetPerHa: draft.target === null ? (season?.targetPopulation ?? null) : parseNumberBR(draft.target),
    points: draft.points.map((p) => ({
      plants: parseNumberBR(p.plants) ?? Number.NaN,
      meters: parseNumberBR(p.meters) ?? Number.NaN,
      lat: p.lat,
      lng: p.lng,
    })),
  };
}

export function StandFields({
  kind,
  draft,
  onChange,
  season,
}: {
  kind: VisitKind;
  draft: StandDraft;
  onChange: (next: StandDraft | ((old: StandDraft) => StandDraft)) => void;
  season: { rowSpacingM?: number | null; targetPopulation?: number | null } | undefined;
}) {
  const list = useRef<HTMLOListElement>(null);
  const unit = standUnit(kind);
  const summary = summarizeStand(standFromDraft(draft, season));
  const spacingValue = draft.spacing ?? (season?.rowSpacingM != null ? formatNumberBR(season.rowSpacingM, 2) : "");
  const targetValue = draft.target ?? (season?.targetPopulation != null ? formatNumberBR(season.targetPopulation, 0) : "");

  function addPoint() {
    const key = crypto.randomUUID();
    onChange((d) => {
      const last = d.points[d.points.length - 1];
      return { ...d, points: [...d.points, { key, plants: "", meters: last?.meters || "1", lat: null, lng: null }] };
    });
    // Foco no número do ponto novo, para contar e digitar sem tirar o olho da linha.
    requestAnimationFrame(() => list.current?.querySelector<HTMLInputElement>(`[data-key="${key}"]`)?.focus());
    // GPS é opcional e não trava a contagem.
    void getPosition().then((pos) => {
      if (pos) onChange((d) => ({ ...d, points: d.points.map((p) => (p.key === key ? { ...p, lat: pos.lat, lng: pos.lng } : p)) }));
    });
  }

  const setPoint = (key: string, patch: Partial<StandPointDraft>) =>
    onChange((d) => ({ ...d, points: d.points.map((p) => (p.key === key ? { ...p, ...patch } : p)) }));

  return (
    <section className="space-y-3">
      <SectionTitle>{kind === "plantio" ? "Contagem de sementes" : "Contagem de estande"}</SectionTitle>
      <Card className="space-y-4">
        <p className="text-sm text-muted">
          Conte as {unit} em um trecho da linha, em vários pontos do talhão. O app faz a conta por metro e por hectare.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Espaçamento (m)" hint="Entre linhas">
            <input
              inputMode="decimal"
              value={spacingValue}
              onChange={(e) => onChange((d) => ({ ...d, spacing: e.target.value }))}
              className={inputClass}
              placeholder="0,5"
            />
          </Field>
          <Field label="População planejada" hint={`${unit}/ha`}>
            <input
              inputMode="numeric"
              value={targetValue}
              onChange={(e) => onChange((d) => ({ ...d, target: e.target.value }))}
              className={inputClass}
              placeholder="260.000"
            />
          </Field>
        </div>

        {draft.points.length ? (
          <ol ref={list} className="space-y-2">
            {draft.points.map((p, i) => (
              <li key={p.key} className="flex items-center gap-2">
                <span className="w-7 shrink-0 text-right text-sm font-semibold tabular-nums text-muted">{i + 1}</span>
                <input
                  data-key={p.key}
                  aria-label={`${unit} no ponto ${i + 1}`}
                  inputMode="numeric"
                  enterKeyHint="next"
                  value={p.plants}
                  onChange={(e) => setPoint(p.key, { plants: e.target.value })}
                  onKeyDown={(e) => {
                    // Enter no último ponto abre o próximo, em vez de salvar a visita.
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (i === draft.points.length - 1) addPoint();
                    }
                  }}
                  className={`${cellClass} w-0 min-w-0 flex-1 text-lg font-semibold tabular-nums`}
                  placeholder="0"
                />
                <span className="shrink-0 text-sm text-muted">em</span>
                <input
                  aria-label={`Metros contados no ponto ${i + 1}`}
                  inputMode="decimal"
                  value={p.meters}
                  onChange={(e) => setPoint(p.key, { meters: e.target.value })}
                  className={`${cellClass} w-14 shrink-0 px-2 text-center tabular-nums`}
                />
                <span className="shrink-0 text-sm text-muted">m</span>
                <MapPin
                  aria-label={p.lat !== null ? "Local registrado" : "Sem localização"}
                  className={`size-4 shrink-0 ${p.lat !== null ? "text-brand" : "text-border"}`}
                />
                <button
                  type="button"
                  onClick={() => onChange((d) => ({ ...d, points: d.points.filter((x) => x.key !== p.key) }))}
                  className="-mr-1 grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-danger/10 hover:text-danger"
                  aria-label={`Remover ponto ${i + 1}`}
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ol>
        ) : null}

        <Button type="button" variant="secondary" onClick={addPoint} className="w-full">
          <Plus aria-hidden className="size-4" /> {draft.points.length ? "Próximo ponto" : "Começar a contar"}
        </Button>

        {summary ? (
          <div role="status" className="rounded-xl bg-brand-soft px-3 py-3">
            <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span>
                <b className="text-xl font-semibold tabular-nums">{formatNumberBR(summary.perMeter, 1)}</b>{" "}
                <span className="text-sm text-muted">{unit}/m</span>
              </span>
              {summary.perHa != null ? (
                <span>
                  <b className="text-xl font-semibold tabular-nums">{formatNumberBR(summary.perHa, 0)}</b>{" "}
                  <span className="text-sm text-muted">{unit}/ha</span>
                </span>
              ) : null}
              {summary.pctOfTarget != null ? (
                <span className="text-sm font-medium text-brand-strong">{formatNumberBR(summary.pctOfTarget, 0)}% do planejado</span>
              ) : null}
            </p>
            <p className="mt-1 text-xs text-muted">
              {summary.points} {summary.points === 1 ? "ponto" : "pontos"}
              {summary.points > 1
                ? ` · mín. ${formatNumberBR(summary.minPerMeter, 1)} e máx. ${formatNumberBR(summary.maxPerMeter, 1)} ${unit}/m`
                : ""}
              {summary.cvPct != null ? ` · variação ${formatNumberBR(summary.cvPct, 0)}%` : ""}
            </p>
            {summary.perHa == null ? <p className="mt-1 text-xs text-muted">Informe o espaçamento para ver {unit} por hectare.</p> : null}
          </div>
        ) : null}
      </Card>
    </section>
  );
}
