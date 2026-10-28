"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { PanelView } from "@/components/panel-view";
import { useProfile } from "@/components/profile-bits";
import { TodayView } from "@/components/today-view";
import { PageSkeleton } from "@/components/ui";
import { Welcome } from "@/components/welcome";
import { db } from "@/lib/db";

/** Tela inicial de cada modo (ADR 0008): agenda do dia para quem vai a campo, painel para quem cuida da fazenda. */
export default function Home() {
  const profile = useProfile();
  const hasFarms = useLiveQuery(async () => (await db.farms.filter((f) => !f.deletedAt).count()) > 0);

  if (profile === undefined || hasFarms === undefined) return <PageSkeleton />;
  if (!profile && !hasFarms) return <Welcome choose />;
  if (profile?.mode === "campo") return <TodayView />;
  return <PanelView />;
}
