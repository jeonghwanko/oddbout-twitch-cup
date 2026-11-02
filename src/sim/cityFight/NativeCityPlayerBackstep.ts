import { NATIVE_CITY_COMBAT } from "./NativeCityCombatTuning";
import type { VillageFacing } from "../VillageFacing";
import type { CityPoint } from "../../world/NativeCityDefinition";



/** The backstep's beats (fight ms), from the `backstep` clip (`nativeCityPlayerBackstepTimeline`) or the placeholder. */
export interface NativeCityPlayerBackstepTimeline {
  readonly totalMs: number;
  /** He pushes off: the travel starts. */
  readonly takeoffMs: number;
  /** His feet are down again: the travel is complete. */
  readonly landMs: number;
  /** The beats come from his drawn clip (else the placeholder's). */
  readonly art: boolean;
}

export interface NativeCityPlayerBackstep {
  /** Fight ms into the backstep. */
  readonly ms: number;
  readonly timeline: NativeCityPlayerBackstepTimeline;
  /** The heading it is drawn at: toward the opponent (he never turns his back). */
  readonly facing: VillageFacing;
  /** Plan unit direction he travels: away from the opponent. */
  readonly direction: CityPoint;
  /** Plan units of the whole step back. */
  readonly travelUnits: number;
  /** Plan units travelled so far. */
  readonly travelledUnits: number;
}

/** The placeholder beats (`player.backstep`) where no `backstep` clip is drawn. */
export function nativeCityPlaceholderBackstepTimeline(): NativeCityPlayerBackstepTimeline {
  const spec = NATIVE_CITY_COMBAT.player.backstep;
  return { totalMs: spec.placeholderTotalMs, takeoffMs: spec.placeholderTakeoffMs, landMs: spec.placeholderLandMs, art: false };
}

export function startNativeCityPlayerBackstep(timeline: NativeCityPlayerBackstepTimeline, facing: VillageFacing, direction: CityPoint,
  travelUnits: number): NativeCityPlayerBackstep {
  return Object.freeze({ ms: 0, timeline, facing, direction, travelUnits: Math.max(0, travelUnits), travelledUnits: 0 });
}

/**
 * Share (0..1) of the step back done in the air; the rest is the landing skid, sized so it starts at the speed the flight lands with
 * (`airEndSpeedShare` of the flight's average) and eases to a stop as the lock lets go (`lockAfterLandMs`) — continuous, never a second
 * push (game-animator 2026-10-12 round 2: a fixed skid share re-accelerated him right after the landing).
 */
export function nativeCityPlayerBackstepAirShare(timeline: NativeCityPlayerBackstepTimeline): number {
  const spec = NATIVE_CITY_COMBAT.player.backstep, end = Math.max(0, Math.min(1, spec.airEndSpeedShare));
  const k = end * Math.max(0, spec.lockAfterLandMs) / (2 * Math.max(1e-6, timeline.landMs - timeline.takeoffMs));
  return 1 / (1 + k);
}


export function nativeCityPlayerBackstepShare(timeline: NativeCityPlayerBackstepTimeline, ms: number): number {
  const spec = NATIVE_CITY_COMBAT.player.backstep, at = Number.isFinite(ms) ? ms : 0;
  const air = nativeCityPlayerBackstepAirShare(timeline), skid = 1 - air, settle = timeline.landMs + spec.lockAfterLandMs;
  const easeOut = (u: number) => 1 - (1 - u) * (1 - u), end = Math.max(0, Math.min(1, spec.airEndSpeedShare));
  if (at <= timeline.takeoffMs) return 0;
  // The flight lands still moving (`airEndSpeedShare` of its average speed): the skid carries on from it instead of pushing again.
  if (at < timeline.landMs) {
    const u = (at - timeline.takeoffMs) / Math.max(1e-6, timeline.landMs - timeline.takeoffMs);
    return air * (end * u + (1 - end) * easeOut(u));
  }
  if (at >= settle || skid === 0) return 1;
  return air + skid * easeOut((at - timeline.landMs) / Math.max(1e-6, settle - timeline.landMs));
}

/**
 * The hop's height over the drawn cells (body heights, ≥ 0) `ms` in: an arc from the push-off to the landing peaking `hopPeakShare` into
 * the flight at `hopApexBodies` (a quick rise, a longer fall); 0 outside the flight. Drawing only — the rules never read it.
 */
export function nativeCityPlayerBackstepLift(timeline: NativeCityPlayerBackstepTimeline, ms: number): number {
  const spec = NATIVE_CITY_COMBAT.player.backstep, at = Number.isFinite(ms) ? ms : 0;
  if (at <= timeline.takeoffMs || at >= timeline.landMs) return 0;
  const u = (at - timeline.takeoffMs) / Math.max(1e-6, timeline.landMs - timeline.takeoffMs);
  const peak = Math.max(0.05, Math.min(0.95, spec.hopPeakShare)), v = u < peak ? (u - peak) / peak : (u - peak) / (1 - peak);
  return Math.max(0, spec.hopApexBodies * (1 - v * v));
}

/** His feet and presses wait (until the landing + `lockAfterLandMs`); the rest of the clip is a tail a walk or a press cuts. */
export function nativeCityPlayerBackstepLocks(backstep: NativeCityPlayerBackstep | null): boolean {
  return backstep !== null && backstep.ms < backstep.timeline.landMs + NATIVE_CITY_COMBAT.player.backstep.lockAfterLandMs;
}

/** He has landed (the travel is complete). */
export function nativeCityPlayerBackstepLanded(backstep: NativeCityPlayerBackstep | null): boolean {
  return backstep !== null && backstep.ms + 1e-9 >= backstep.timeline.landMs;
}

/**
 * `dtMs` (fight ms) of the backstep: this frame's travel (plan units along `direction`), whether it landed this frame and whether it
 * ended (`state` null).
 */
export function stepNativeCityPlayerBackstep(backstep: NativeCityPlayerBackstep, dtMs: number)
  : { readonly state: NativeCityPlayerBackstep | null; readonly travelUnits: number; readonly landed: boolean } {
  const dt = Number.isFinite(dtMs) ? Math.max(0, dtMs) : 0, ms = backstep.ms + dt;
  const target = backstep.travelUnits * nativeCityPlayerBackstepShare(backstep.timeline, ms);
  const travelUnits = target - backstep.travelledUnits;
  const landed = backstep.ms + 1e-9 < backstep.timeline.landMs && ms + 1e-9 >= backstep.timeline.landMs;
  const state = ms >= backstep.timeline.totalMs ? null : Object.freeze({ ...backstep, ms, travelledUnits: target });
  return { state, travelUnits, landed };
}
