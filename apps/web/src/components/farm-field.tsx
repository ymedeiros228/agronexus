import type { Farm } from "@/lib/db";
import { Field, inputClass } from "./ui";

export const byFarmName = (a: Farm, b: Farm) => a.name.localeCompare(b.name, "pt-BR", { numeric: true });

/** Escolha da fazenda de uma venda ou despesa. Com uma fazenda só, não aparece. */
export function FarmField({
  farms,
  value,
  onChange,
  what,
}: {
  farms: Farm[];
  value: string;
  onChange: (farmId: string) => void;
  /** "o grão", "a despesa"… */
  what: string;
}) {
  if (farms.length < 2) return null;
  return (
    <Field
      label="Fazenda"
      hint={`De qual fazenda é ${what}. "Toda a conta" entra no total geral, mas não no relatório de uma fazenda só.`}
    >
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        <option value="">Toda a conta</option>
        {farms.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
    </Field>
  );
}
