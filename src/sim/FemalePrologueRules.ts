import type { MetaState } from "./MetaProgressRules";


export const FEMALE_PROLOGUE_PHASES = ["arrived", "commission", "lead-found", "recovered", "completed"] as const;
export type FemaleProloguePhase = typeof FEMALE_PROLOGUE_PHASES[number];
export interface FemalePrologueState { readonly phase: FemaleProloguePhase }
export const FEMALE_PROLOGUE_INVITATION = "female-prologue-invitation";
export const FEMALE_PROLOGUE_TARGET = "female-prologue-brooch";
export const FEMALE_PROLOGUE_REWARD = 120;

export function sanitizeFemalePrologue(value: unknown): FemalePrologueState | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const phase = (value as Record<string, unknown>).phase;
  return typeof phase === "string" && (FEMALE_PROLOGUE_PHASES as readonly string[]).includes(phase)
    ? { phase: phase as FemaleProloguePhase } : undefined;
}
export function femalePrologueActive(meta: MetaState): boolean {
  return meta.character === "female" && meta.femaleLook !== "personal"
    && meta.femalePrologue !== undefined && meta.femalePrologue.phase !== "completed";
}
export function femalePrologueCivilian(meta: MetaState): boolean { return femalePrologueActive(meta); }

/** Dialogue completion commits one frontier. Skipping text must never skip an interaction or payment. */
export function advanceFemalePrologue(meta: MetaState, event: "accept" | "learn-route" | "return-brooch"): MetaState {
  if (!femalePrologueActive(meta)) return meta;
  const phase = meta.femalePrologue!.phase;
  if (event === "accept" && phase === "arrived") return { ...meta, femalePrologue: { phase: "commission" } };
  if (event === "learn-route" && phase === "commission") return { ...meta, femalePrologue: { phase: "lead-found" } };
  if (event !== "return-brooch" || phase !== "recovered") return meta;
  return { ...meta, femalePrologue: { phase: "completed" }, gold: meta.gold + FEMALE_PROLOGUE_REWARD,
    onboarding: { ...meta.onboarding, openingCompleted: true, villageIntroCompleted: true, checkpointId: null } };
}

/** A successful exit plus both actual loot anchors is required. Failure/replayed settlement grants nothing. */
export function femalePrologueRecovered(outcome: string, collectedAnchorIds: readonly string[]): boolean {
  return outcome === "escaped" && collectedAnchorIds.includes(FEMALE_PROLOGUE_INVITATION)
    && collectedAnchorIds.includes(FEMALE_PROLOGUE_TARGET);
}
export function recoverFemalePrologue(meta: MetaState, outcome: string, collectedAnchorIds: readonly string[]): MetaState {
  if (!femalePrologueActive(meta) || meta.femalePrologue?.phase !== "lead-found"
    || !femalePrologueRecovered(outcome, collectedAnchorIds)) return meta;
  return { ...meta, femalePrologue: { phase: "recovered" } };
}
