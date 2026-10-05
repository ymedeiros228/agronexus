import { MapPinOff } from "lucide-react";
import { Card, LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <Card className="mx-auto max-w-md space-y-4 p-6 text-center">
      <span aria-hidden className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand">
        <MapPinOff className="size-7" />
      </span>
      <div>
        <h1 className="text-xl font-semibold">Página não encontrada</h1>
        <p className="mt-1 text-sm text-muted">O endereço pode estar errado ou a página mudou de lugar.</p>
      </div>
      <LinkButton href="/" className="w-full">
        Voltar ao painel
      </LinkButton>
    </Card>
  );
}
