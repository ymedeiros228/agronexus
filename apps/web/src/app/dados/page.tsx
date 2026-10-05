"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Button, Card, PageTitle, SectionTitle } from "@/components/ui";
import { LAST_BACKUP_KEY, countLocalRecords, exportBackup, importBackup, markBackupDone } from "@/lib/backup";
import { exportFinanceCsv, exportOperationsCsv, exportStockCsv, exportVisitsCsv } from "@/lib/csv";
import { getMeta } from "@/lib/db";
import { demoLoaded, loadDemo, removeDemo } from "@/lib/demo";
import { todayISO } from "@/lib/format";

type StorageInfo = { persisted: boolean; usedMB: number | null };

function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export default function DataPage() {
  const counts = useLiveQuery(() => countLocalRecords());
  const lastBackupAt = useLiveQuery(async () => (await getMeta<number>(LAST_BACKUP_KEY)) ?? null);
  const demo = useLiveQuery(demoLoaded);
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

  async function run(task: () => Promise<string>) {
    setBusy(true);
    try {
      setMessage({ tone: "ok", text: await task() });
    } catch {
      setMessage({ tone: "error", text: "Não foi possível concluir." });
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    setBusy(true);
    try {
      // Marca o início: o que mudar enquanto o arquivo é gerado conta como "fora do backup".
      const startedAt = Date.now();
      saveFile(await exportBackup(), `agronexus-backup-${todayISO()}.json`);
      await markBackupDone(startedAt);
      setMessage({ tone: "ok", text: "Backup gerado. Guarde o arquivo em um lugar seguro (Drive, e-mail ou WhatsApp para você)." });
    } catch {
      setMessage({ tone: "error", text: "Não foi possível gerar o backup." });
    } finally {
      setBusy(false);
    }
  }

  async function downloadCsv(kind: "visitas" | "operacoes" | "estoque" | "financeiro") {
    setBusy(true);
    try {
      const make = {
        visitas: exportVisitsCsv,
        operacoes: exportOperationsCsv,
        estoque: exportStockCsv,
        financeiro: exportFinanceCsv,
      }[kind];
      saveFile(await make(), `agronexus-${kind}-${todayISO()}.csv`);
      setMessage({ tone: "ok", text: "Planilha gerada. Abre no Excel ou no Google Planilhas." });
    } catch {
      setMessage({ tone: "error", text: "Não foi possível gerar a planilha." });
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
        <Card className="grid grid-cols-4 gap-x-2 gap-y-3 text-center">
          {[
            ["Fazendas", counts.farms],
            ["Talhões", counts.plots],
            ["Visitas", counts.visits],
            ["Fotos", counts.photos],
            ["Operações", counts.operations],
            ["Chuvas", counts.rainfall],
            ["Insumos", counts.supplies],
            ["Lançamentos", counts.stockMoves],
            ["Vendas", counts.sales],
            ["Despesas", counts.expenses],
          ].map(([label, n]) => (
            <div key={label} className="min-w-0">
              <p className="text-2xl font-semibold">{n}</p>
              <p className="truncate text-xs text-muted">{label}</p>
            </div>
          ))}
        </Card>
      ) : null}

      <section className="space-y-3">
        <SectionTitle>Backup</SectionTitle>
        <Card className="space-y-3">
          <p className="text-sm text-muted">
            Gera um arquivo com tudo: fazendas, visitas, fotos, operações, estoque, vendas e despesas. Restaurar nunca
            apaga nada, só acrescenta o que falta.
          </p>
          {lastBackupAt !== undefined ? (
            <p className="text-sm">
              {lastBackupAt
                ? `Último backup: ${new Date(lastBackupAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`
                : "Nenhum backup feito neste aparelho ainda."}
            </p>
          ) : null}
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
        <SectionTitle>Planilhas (Excel)</SectionTitle>
        <Card className="space-y-3">
          <p className="text-sm text-muted">
            Para analisar no Excel ou mandar para o contador, o consultor ou a empresa. Não incluem fotos.
          </p>
          <Button variant="secondary" onClick={() => downloadCsv("operacoes")} disabled={busy || !counts?.operations} className="w-full">
            Operações (com insumos e custos)
          </Button>
          <Button variant="secondary" onClick={() => downloadCsv("estoque")} disabled={busy || !counts?.supplies} className="w-full">
            Estoque de insumos
          </Button>
          <Button
            variant="secondary"
            onClick={() => downloadCsv("financeiro")}
            disabled={busy || !(counts?.sales || counts?.expenses)}
            className="w-full"
          >
            Vendas e despesas
          </Button>
          <Button variant="secondary" onClick={() => downloadCsv("visitas")} disabled={busy || !counts?.visits} className="w-full">
            Visitas (uma linha por achado)
          </Button>
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

      <section className="space-y-3">
        <SectionTitle>Demonstração</SectionTitle>
        <Card className="space-y-3">
          <p className="text-sm text-muted">
            Duas fazendas de exemplo com talhões, visitas, operações, estoque e vendas, para mostrar o app funcionando.
            Apagar o exemplo não mexe no que é seu.
          </p>
          {demo ? (
            <Button
              variant="danger"
              disabled={busy}
              className="w-full"
              onClick={() =>
                confirm("Apagar a fazenda de exemplo?") &&
                run(async () => {
                  await removeDemo();
                  return "Exemplo apagado.";
                })
              }
            >
              Apagar fazenda de exemplo
            </Button>
          ) : (
            <Button
              variant="secondary"
              disabled={busy}
              className="w-full"
              onClick={() =>
                run(async () => {
                  await loadDemo();
                  return "Fazenda de exemplo carregada. Veja no Painel.";
                })
              }
            >
              Carregar fazenda de exemplo
            </Button>
          )}
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
