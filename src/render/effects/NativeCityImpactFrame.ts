import { NATIVE_CITY_COMBAT, type NativeCityImpactFrameTuning } from "../../sim/cityFight/NativeCityCombatTuning";
import { COMBAT_IMPACT_FRAME, type CombatImpactFrameTone } from "./CombatImpactFrame";

/*
 * 도시 대결의 임팩트 프레임 박자(순수 — 뷰는 `view/NativeCityImpactFrameView`).
 */

/** `short`: the plate two frames, then the band (the poise break, the knockdown); `full`: the KO's longer plate, then the band. */
export type NativeCityImpactFrameKind = "short" | "full";

/** The village plate is ink (bright plaza behind it) with neon-yellow silhouettes (`CombatImpactFrameTone`). */
export const NATIVE_CITY_IMPACT_FRAME_TONE: CombatImpactFrameTone = "ink";

/**
 * The age to feed `combatImpactFramePrims` `ageMs` into a frame of `kind` (`feel.impactFrame`), or null once it is over. Both hold the
 * first plate — `paperEndMs` for the full one (the KO), `shortPaperMs` for the short one — then map `bandMs` onto the band. No second
 * inversion (2026-10-15: one light/dark swap only; the ink plate is already the plaza's opposite).
 */
export function nativeCityImpactFrameAge(kind: NativeCityImpactFrameKind, ageMs: number,
  t: NativeCityImpactFrameTuning = NATIVE_CITY_COMBAT.feel.impactFrame): number | null {
  const age = Math.max(0, ageMs), c = COMBAT_IMPACT_FRAME, plateMs = kind === "full" ? c.paperEndMs : t.shortPaperMs;
  if (age < plateMs) return Math.min(age, c.paperEndMs - 1);
  if (age < plateMs + t.bandMs) return c.inkEndMs + (age - plateMs) / Math.max(1, t.bandMs) * (c.bandEndMs - c.inkEndMs - 1);
  return null;
}

/**
 * The frame may play now (`feel.impactFrame` photosensitivity): never under reduced motion, a short one at most every
 * `shortCooldownMs` (none while `shortPaperMs` is 0), a full one every `fullCooldownMs` (screen ms since the last of that kind).
 */
export function nativeCityImpactFrameAllowed(kind: NativeCityImpactFrameKind, sinceMs: number, reducedMotion: boolean,
  t: NativeCityImpactFrameTuning = NATIVE_CITY_COMBAT.feel.impactFrame): boolean {
  if (reducedMotion || kind === "short" && !(t.shortPaperMs > 0)) return false;
  return sinceMs >= (kind === "full" ? t.fullCooldownMs : t.shortCooldownMs);
}
