"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Button, Card, PageTitle, SectionTitle } from "@/components/ui";
import { countLocalRecords, exportBackup, importBackup } from "@/lib/backup";
import { todayISO } from "@/lib/format";

type StorageInfo = { persisted: boolean; usedMB: number | null };

export default function DataPage() {
  const counts = useLiveQuery(() => countLocalRecords());
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const persisted = (await navigator.storage?.persisted?.()) ?? false;
      const estimate = await navigator.storage?.estimate?.();
      if (active) {
        setStorage({ persisted, usedMB: estimate?.usage != null ? estimate.usage / 1024 / 1024 : null });
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function protect() {
    const ok = (await navigator.storage?.persist?.()) ?? false;
    setStorage((s) => ({ usedMB: s?.usedMB ?? null, persisted: ok }));
    setMessage(
      ok
        ? { tone: "ok", text: "Pronto: o navegador não vai apagar seus dados sozinho." }
        : { tone: "error", text: "O navegador não permitiu. Instale o app na tela inicial e tente de novo." },
    );
  }

  async function download() {
    setBusy(true);
    try {
      const blob = await exportBackup();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `agronexus-backup-${todayISO()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setMessage({ tone: "ok", text: "Backup gerado. Guarde o arquivo em um lugar seguro (Drive, e-mail ou WhatsApp para você)." });
    } catch {
      setMessage({ tone: "error", text: "Não foi possível gerar o backup." });
    } finally {
      setBusy(false);
    }
  }

  async function restore(e: ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const written = await importBackup(file);
      setMessage({
        tone: "ok",
        text: written
          ? `Backup restaurado: ${written} registros novos ou mais recentes.`
          : "Nada a restaurar: este aparelho já tem tudo o que está no arquivo.",
      });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Não foi possível restaurar." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageTitle title="Dados" subtitle="Seus registros ficam só neste aparelho. Faça backup com frequência." />

      {counts ? (
        <Card className="grid grid-cols-3 gap-3 text-center">
          {[
            ["Fazendas", counts.farms],
            ["Talhões", counts.plots],
            ["Visitas", counts.visits],
            ["Fotos", counts.photos],
            ["Chuvas", counts.rainfall],
          ].map(([label, n]) => (
            <div key={label}>
              <p className="text-2xl font-semibold">{n}</p>
              <p className="text-xs text-muted">{label}</p>
            </div>
          ))}
        </Card>
      ) : null}

      <section className="space-y-3">
        <SectionTitle>Backup</SectionTitle>
        <Card className="space-y-3">
          <p className="text-sm text-muted">
            Gera um arquivo com tudo: fazendas, visitas e fotos. Restaurar nunca apaga nada, só acrescenta o que falta.
          </p>
          <Button onClick={download} disabled={busy} className="w-full">
            Baixar backup
          </Button>
          <label className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-xl border border-border bg-surface px-4 text-sm font-semibold active:scale-[0.98]">
            Restaurar de um arquivo
            <input type="file" accept="application/json,.json" className="sr-only" onChange={restore} disabled={busy} />
          </label>
        </Card>
      </section>

      <section className="space-y-3">
        <SectionTitle>Armazenamento</SectionTitle>
        <Card className="space-y-3">
          <p className="text-sm">
            {storage?.persisted
              ? "Protegido: o navegador não apaga seus dados sozinho."
              : "Sem proteção: se o aparelho ficar sem espaço, o navegador pode apagar os dados."}
          </p>
          {storage?.usedMB != null ? (
            <p className="text-sm text-muted">Em uso: {storage.usedMB.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB</p>
          ) : null}
          {!storage?.persisted ? (
            <Button variant="secondary" onClick={protect} className="w-full">
              Proteger meus dados
            </Button>
          ) : null}
        </Card>
      </section>

      {message ? (
        <p
          role="status"
          className={`rounded-xl px-3 py-2 text-sm ${
            message.tone === "ok" ? "bg-brand-soft text-brand-strong" : "bg-danger/10 text-danger"
          }`}
        >
          {message.text}
        </p>
      ) : null}
    </>
  );
}
