"use client";

import Link from "next/link";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Field, inputClass } from "@/components/ui";
import { alive, db } from "@/lib/db";

/** Escolha de fazenda e talhão. Se só existe uma opção, ela já vem escolhida. */
export function usePlotPicker(initialFarmId = "", initialPlotId = "") {
  const data = useLiveQuery(async () => ({
    farms: alive(await db.farms.orderBy("name").toArray()),
    plots: alive(await db.plots.toArray()),
  }));
  const [farmChoice, setFarmChoice] = useState(initialFarmId);
  const [plotChoice, setPlotChoice] = useState(initialPlotId);

  const farms = data?.farms ?? [];
  const farmId = farmChoice || (farms.length === 1 ? farms[0].id : "");
  const farmPlots = (data?.plots ?? []).filter((p) => p.farmId === farmId);
  const plotId = farmPlots.some((p) => p.id === plotChoice)
    ? plotChoice
    : farmPlots.length === 1
      ? farmPlots[0].id
      : "";

  return {
    loaded: data !== undefined,
    farms,
    farmPlots,
    farmId,
    plotId,
    plot: farmPlots.find((p) => p.id === plotId),
    chooseFarm(id: string) {
      setFarmChoice(id);
      setPlotChoice("");
    },
    choosePlot: setPlotChoice,
  };
}

export type PlotPicker = ReturnType<typeof usePlotPicker>;

export function PlotPickerFields({ picker }: { picker: PlotPicker }) {
  const { farms, farmPlots, farmId, plotId } = picker;
  return (
    <>
      <Field label="Fazenda">
        <select className={inputClass} value={farmId} onChange={(e) => picker.chooseFarm(e.target.value)}>
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
          onChange={(e) => picker.choosePlot(e.target.value)}
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
    </>
  );
}
