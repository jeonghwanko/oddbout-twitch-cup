import type { NativeCityKumaGrade } from "../../sim/cityFight/NativeCityCombatTuning";
import { PALETTE } from "../art/palette";
import { ROPE_FX_RAMPS } from "./RopeTraversalFx";

/**
 * The triangle's colours (2026-10-14, `native-city-combat.json` triangle / feel.aura note — "hidden logic must be shown"): what KUMA's windup
 * tells (aura flames, rim glow, ground glow, the fist glint, the inhale) are tinted by, from the coming move's class. All palette-owned:
 * WHITE the pearl / ivory family, GOLD the ember ramp the aura always had, RED the alarm over burgundy. `outer` / `inner`: the flame's two
 * ends [weak, strong] (mixed by the aura's intensity); `glint`: the fist glint's star and light.
 */
export interface NativeCityKumaGradeColors {
  readonly outer: readonly [number, number];
  readonly inner: readonly [number, number];
  readonly glint: number;
}

const WARM = ROPE_FX_RAMPS.warm;

export const NATIVE_CITY_KUMA_GRADE_COLORS: Readonly<Record<NativeCityKumaGrade, NativeCityKumaGradeColors>> = Object.freeze({
  white: Object.freeze({ outer: [PALETTE.nativeCityExchangeIvory, PALETTE.pearl] as const, inner: [PALETTE.pearl, PALETTE.white] as const, glint: PALETTE.pearl }),
  gold: Object.freeze({ outer: [WARM[3]!, WARM[4]!] as const, inner: [WARM[2]!, WARM[1]!] as const, glint: PALETTE.hotGold }),
  red: Object.freeze({ outer: [PALETTE.burgundyInk, PALETTE.alarm] as const, inner: [PALETTE.alarm, PALETTE.nativeCityExchangeIvory] as const, glint: PALETTE.alarm }),
});

/** A grade's colours; no grade (a tell with no move behind it — the wake-up's charge): the gold the aura always had. */
export function nativeCityKumaGradeColors(grade: NativeCityKumaGrade | null | undefined): NativeCityKumaGradeColors {
  return NATIVE_CITY_KUMA_GRADE_COLORS[grade ?? "gold"];
}
