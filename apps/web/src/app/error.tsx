"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { Button, Card, LinkButton } from "@/components/ui";

/** Erro inesperado numa tela: os dados continuam no aparelho, então tranquiliza e oferece saída. */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Card className="mx-auto max-w-md space-y-4 p-6 text-center">
      <span aria-hidden className="mx-auto grid size-14 place-items-center rounded-2xl bg-warn/10 text-warn">
        <TriangleAlert className="size-7" />
      </span>
      <div>
        <h1 className="text-xl font-semibold">Algo deu errado nesta tela</h1>
        <p className="mt-1 text-sm text-muted">Seus registros continuam salvos no aparelho. Tente de novo ou volte ao painel.</p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button onClick={() => retry()}>Tentar de novo</Button>
        <LinkButton href="/" variant="secondary">
          Voltar ao painel
        </LinkButton>
      </div>
      {error.message ? (
        <details className="text-left text-xs text-muted">
          <summary className="cursor-pointer">Detalhes para o suporte</summary>
          <p className="mt-2 break-words font-mono">{error.message}</p>
        </details>
      ) : null}
    </Card>
  );
}
