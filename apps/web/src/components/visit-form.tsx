"use client";

import Link from "next/link";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { BlobImg } from "@/components/blob-img";
import { Button, Card, Empty, Field, LinkButton, PageTitle, SectionTitle, inputClass } from "@/components/ui";
import { DIAGNOSIS_OPTIONS, FINDING_PRESETS, KIND_LABEL, STAGES } from "@/lib/catalog";
import { alive, db, type FindingKind } from "@/lib/db";
import { compressImage, getPosition, todayISO } from "@/lib/format";
import { daysSince, latestSeason } from "@/lib/season";
import { createVisit, updateVisit, type FindingInput, type PhotoInput, type VisitInput } from "@/lib/visits";

type FindingDraft = FindingInput & { key: string };
type PhotoDraft = PhotoInput & { key: string };

type Props = {
  /** Presente na edição. */
  visitId?: string;
  initial?: VisitInput;
  seasonId?: string | null;
  defaultFarmId?: string;
  defaultPlotId?: string;
};

/** Formulário de visita, usado para criar e para editar. */
export function VisitForm({ visitId, initial, seasonId, defaultFarmId, defaultPlotId }: Props) {
  const router = useRouter();
  const editing = Boolean(visitId);

  const data = useLiveQuery(async () => ({
    farms: alive(await db.farms.orderBy("name").toArray()),
    plots: alive(await db.plots.toArray()),
  }));

  const [farmChoice, setFarmChoice] = useState(initial?.farmId ?? defaultFarmId ?? "");
  const [plotChoice, setPlotChoice] = useState(initial?.plotId ?? defaultPlotId ?? "");
  const [date, setDate] = useState(initial?.date ?? todayISO());
  const [stage, setStage] = useState(initial?.stage ?? "");
  const [findings, setFindings] = useState<FindingDraft[]>(
    () => initial?.findings.map((f) => ({ ...f, key: f.id ?? crypto.randomUUID() })) ?? [],
  );
  const [photos, setPhotos] = useState<PhotoDraft[]>(
    () => initial?.photos.map((p) => ({ ...p, key: p.id ?? crypto.randomUUID() })) ?? [],
  );
  const [observations, setObservations] = useState(initial?.observations ?? "");
  const [recommendation, setRecommendation] = useState(initial?.recommendation ?? "");
  const [followUp, setFollowUp] = useState(initial?.followUpDate ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Se só existe uma opção, ela já vem escolhida.
  const farms = data?.farms ?? [];
  const farmId = farmChoice || (farms.length === 1 ? farms[0].id : "");
  const farmPlots = (data?.plots ?? []).filter((p) => p.farmId === farmId);
  const plotId = farmPlots.some((p) => p.id === plotChoice)
    ? plotChoice
    : farmPlots.length === 1
      ? farmPlots[0].id
      : "";

  const seasons = useLiveQuery(
    async () => (plotId ? alive(await db.seasons.where("plotId").equals(plotId).toArray()) : []),
    [plotId],
  );
  // Na edição, mantém a safra da visita enquanto o talhão não mudar.
  const season =
    (editing && plotId === initial?.plotId ? seasons?.find((s) => s.id === seasonId) : undefined) ??
    latestSeason(seasons ?? []);

  function addFinding() {
    setFindings((f) => [...f, { key: crypto.randomUUID(), kind: "praga", name: "", amount: "", note: "" }]);
  }

  function updateFinding(key: string, patch: Partial<FindingDraft>) {
    setFindings((list) =>
      list.map((f) => {
        if (f.key !== key) return f;
        const next = { ...f, ...patch };
        const preset = FINDING_PRESETS.find((p) => p.name.toLowerCase() === next.name.trim().toLowerCase());
        if (patch.name !== undefined && preset) next.kind = preset.kind;
        return next;
      }),
    );
  }

  async function onPhotos(e: ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const files = Array.from(input.files ?? []);
    input.value = "";
    for (const file of files) {
      try {
        const blob = await compressImage(file);
        const key = crypto.randomUUID();
        setPhotos((p) => [...p, { key, blob, label: "", lat: null, lng: null, takenAt: Date.now() }]);
        // GPS é opcional e não trava o registro
        getPosition().then((pos) => {
          if (pos) setPhotos((p) => p.map((x) => (x.key === key ? { ...x, lat: pos.lat, lng: pos.lng } : x)));
        });
      } catch {
        setError("Não consegui ler uma das fotos. Tente de novo.");
      }
    }
  }

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!farmId || !plotId) {
      setError("Escolha a fazenda e o talhão.");
      return;
    }
    if (!stage) {
      setError("Informe o estágio da cultura.");
      return;
    }
    setError("");
    setSaving(true);

    const input: VisitInput = {
      farmId,
      plotId,
      date,
      stage,
      observations,
      recommendation,
      followUpDate: followUp || null,
      findings: findings.map((f) => ({ id: f.id, kind: f.kind, name: f.name, amount: f.amount, note: f.note })),
      photos: photos.map((p) => ({ id: p.id, blob: p.blob, label: p.label, takenAt: p.takenAt, lat: p.lat, lng: p.lng })),
    };

    let id: string;
    try {
      if (visitId) {
        await updateVisit(visitId, input);
        id = visitId;
      } else {
        id = await createVisit(input);
      }
    } catch {
      setSaving(false);
      setError("Não foi possível salvar. Verifique o espaço do aparelho e tente de novo.");
      return;
    }
    router.push(`/visita?id=${id}`);
  }

  if (!data) return null;

  if (farms.length === 0) {
    return (
      <>
        <PageTitle title="Nova visita" />
        <Empty
          title="Cadastre uma fazenda primeiro"
          text="A visita precisa de uma fazenda e um talhão."
          action={<LinkButton href="/fazendas">Cadastrar fazenda</LinkButton>}
        />
      </>
    );
  }

  const visitTime = new Date(`${date || todayISO()}T12:00:00`).getTime();

  return (
    <form onSubmit={save} className="space-y-6">
      {editing ? (
        <div>
          <Link href={`/visita?id=${visitId}`} className="text-sm text-brand">
            ← Voltar sem salvar
          </Link>
        </div>
      ) : null}
      <PageTitle
        title={editing ? "Editar visita" : "Nova visita"}
        subtitle="Tudo é salvo neste aparelho, mesmo sem internet."
      />

      <Card className="space-y-4">
        <Field label="Fazenda">
          <select
            className={inputClass}
            value={farmId}
            onChange={(e) => {
              setFarmChoice(e.target.value);
              setPlotChoice("");
            }}
          >
            <option value="">Selecione</option>
            {farms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Talhão">
          <select
            className={inputClass}
            value={plotId}
            onChange={(e) => setPlotChoice(e.target.value)}
            disabled={!farmId}
          >
            <option value="">{farmId ? "Selecione" : "Escolha a fazenda antes"}</option>
            {farmPlots.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.areaHa ? ` · ${p.areaHa} ha` : ""}
              </option>
            ))}
          </select>
        </Field>
        {farmId && farmPlots.length === 0 ? (
          <p className="text-sm text-muted">
            Esta fazenda ainda não tem talhões.{" "}
            <Link className="text-brand underline" href={`/fazenda?id=${farmId}`}>
              Cadastrar talhão
            </Link>
          </p>
        ) : null}
        {season ? (
          <p className="rounded-xl bg-brand-soft px-3 py-2 text-sm text-brand-strong">
            {season.cultivar || "Cultivar não informada"} · safra {season.label}
            {season.plantingDate ? ` · ${daysSince(season.plantingDate, visitTime)} dias após o plantio` : ""}
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Data">
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Estágio">
            <select className={inputClass} value={stage} onChange={(e) => setStage(e.target.value)}>
              <option value="">Selecione</option>
              {STAGES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Card>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <SectionTitle>Pragas e doenças</SectionTitle>
          <Button type="button" variant="ghost" onClick={addFinding}>
            + Achado
          </Button>
        </div>
        <datalist id="finding-names">
          {FINDING_PRESETS.map((p) => (
            <option key={p.name} value={p.name} />
          ))}
        </datalist>
        {findings.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">Nada anotado. Toque em “+ Achado” para registrar o que encontrou.</p>
          </Card>
        ) : (
          findings.map((f) => (
            <Card key={f.key} className="space-y-3">
              <div className="grid grid-cols-[8.5rem_1fr] gap-3">
                <select
                  aria-label="Tipo"
                  className={inputClass}
                  value={f.kind}
                  onChange={(e) => updateFinding(f.key, { kind: e.target.value as FindingKind })}
                >
                  {(Object.keys(KIND_LABEL) as FindingKind[]).map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
                <input
                  aria-label="Nome"
                  list="finding-names"
                  className={inputClass}
                  placeholder="Nome (ex.: Percevejo-marrom)"
                  value={f.name}
                  onChange={(e) => updateFinding(f.key, { name: e.target.value })}
                />
              </div>
              <input
                aria-label="Quantidade ou medida"
                className={inputClass}
                placeholder="Quantidade ou medida (ex.: 2 por pano de batida)"
                value={f.amount}
                onChange={(e) => updateFinding(f.key, { amount: e.target.value })}
              />
              <input
                aria-label="Observação"
                className={inputClass}
                placeholder="Observação (opcional)"
                value={f.note}
                onChange={(e) => updateFinding(f.key, { note: e.target.value })}
              />
              <Button
                type="button"
                variant="danger"
                className="min-h-9 w-full"
                onClick={() => setFindings((l) => l.filter((x) => x.key !== f.key))}
              >
                Remover achado
              </Button>
            </Card>
          ))
        )}
      </section>

      <section className="space-y-3">
        <SectionTitle>Fotos</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <label className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl bg-brand px-4 text-sm font-semibold text-white active:scale-[0.98]">
            Tirar foto
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={onPhotos} />
          </label>
          <label className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-border bg-surface px-4 text-sm font-semibold active:scale-[0.98]">
            Da galeria
            <input type="file" accept="image/*" multiple className="sr-only" onChange={onPhotos} />
          </label>
        </div>
        {photos.map((p) => (
          <Card key={p.key} className="flex gap-3">
            <BlobImg blob={p.blob} alt="Foto da visita" className="size-24 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <select
                aria-label="Diagnóstico confirmado"
                className={inputClass}
                value={p.label}
                onChange={(e) =>
                  setPhotos((l) => l.map((x) => (x.key === p.key ? { ...x, label: e.target.value } : x)))
                }
              >
                <option value="">Sem diagnóstico ainda</option>
                {DIAGNOSIS_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
                {p.label && !DIAGNOSIS_OPTIONS.includes(p.label) ? <option value={p.label}>{p.label}</option> : null}
              </select>
              <div className="flex items-center justify-between text-xs text-muted">
                <span>{p.lat !== null ? "Local registrado" : "Sem localização"}</span>
                <button
                  type="button"
                  onClick={() => setPhotos((l) => l.filter((x) => x.key !== p.key))}
                  className="text-danger"
                >
                  Remover
                </button>
              </div>
            </div>
          </Card>
        ))}
        {photos.length > 0 ? (
          <p className="text-xs text-muted">
            O diagnóstico que você confirma em cada foto ajuda a melhorar o app no futuro.
          </p>
        ) : null}
      </section>

      <Card className="space-y-4">
        <Field label="Observações">
          <textarea
            rows={3}
            className={inputClass}
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
            placeholder="O que você viu no talhão"
          />
        </Field>
        <Field label="Recomendação">
          <textarea
            rows={3}
            className={inputClass}
            value={recommendation}
            onChange={(e) => setRecommendation(e.target.value)}
            placeholder="O que precisa ser feito no talhão"
          />
        </Field>
        <Field label="Retorno combinado" hint="Opcional. Aparece como pendência no início.">
          <input type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} className={inputClass} />
        </Field>
      </Card>

      {error ? (
        <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={saving} className="w-full min-h-14 text-base">
        {saving ? "Salvando…" : editing ? "Salvar alterações" : "Salvar visita"}
      </Button>
    </form>
  );
}
