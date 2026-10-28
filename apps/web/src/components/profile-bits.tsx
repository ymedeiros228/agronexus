"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { PROFILE_KEY, type Mode, type Profile } from "@/lib/profile";

/** Perfil deste aparelho. `undefined` enquanto lê o banco; `null` se ainda não existe. */
export function useProfile(): Profile | null | undefined {
  return useLiveQuery(async () => ((await db.meta.get(PROFILE_KEY))?.value as Profile | undefined) ?? null);
}

/**
 * Modo de uso: o que a pessoa escolheu ou, sem escolha, "gestao" (o app como era antes do modo campo).
 * `undefined` enquanto lê o banco.
 */
export function useMode(): Mode | undefined {
  const profile = useProfile();
  if (profile === undefined) return undefined;
  return profile?.mode ?? "gestao";
}
