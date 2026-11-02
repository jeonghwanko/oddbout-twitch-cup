import type { NativeCityImpactCue } from "./NativeCityCombatFx";
import { SMASH_FLIPBOOKS, smashDurationMs, type SmashLayer } from "../../assets/NativeCitySmashFxCatalog";

/**
 * Presentation timing. Contact and landing themselves are supplied by the fight. The iron-ball swing's own raster cels (the gather blob
 * and the swing crescent, with their afterimage) are retired (2026-10-17 쿠마전 액션 개편): his drawn keyposes carry the swing.
 */
export const BALL_SMASH_FX = Object.freeze({ dustMs: smashDurationMs("dust"), skidMs: smashDurationMs("skid"),
  contactLightMs: SMASH_FLIPBOOKS.contact.durationsMs.slice(0, 3).reduce((a, b) => a + b, 0), wakeMs: 310 });
export type NativeCitySmashLayer = SmashLayer;
/** The same cel contact applies to a clean blunt hit, independent of attacker or receiver. */
export function nativeCityComicContact(cue: NativeCityImpactCue): boolean {
  return (cue.weaponKind === "blunt" || cue.technique === "ballSmash") && !cue.guarded && !cue.armored && !cue.dustOnly && !cue.netted
    && !cue.squeezed && !cue.reducedMotion;
}
export interface NativeCitySmashDraw {
  readonly kind: NativeCitySmashLayer;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly ageMs: number;
  readonly flipX?: boolean;
  readonly angle?: number;
  readonly alpha?: number;
  /** Drawn on the ground layer behind the bodies (the ground dust's), not over them (2026-10-23 arena audit — the ground burst). */
  readonly behind?: boolean;
}
