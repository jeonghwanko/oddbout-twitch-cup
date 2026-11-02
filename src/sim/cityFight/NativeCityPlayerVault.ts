import { NATIVE_CITY_COMBAT } from "./NativeCityCombatTuning";
import type { VillageFacing } from "../VillageFacing";
import type { CityPoint } from "../../world/NativeCityDefinition";



/** The vault's beats (fight ms), from the `vault` clip (`nativeCityPlayerVaultTimeline`). */
export interface NativeCityPlayerVaultTimeline {
  readonly totalMs: number;
  /** Each step's start (fight ms) and the root travel drawn at it (art px along the facing, runtime body). */
  readonly steps: readonly { readonly atMs: number; readonly travelPx: number }[];
  /** Art travel at which his hands are on the opponent's head (the handstand step). */
  readonly overPx: number;
  /**
   * Fight ms the handstand itself starts (the clip's `keys.handstand`): the apex beat. Absent: the first step at `overPx` (the palms planting
   * and the handstand were one step until 2026-10-21 — now the plant and the kick-up are drawn at the crown before it).
   */
  readonly apexMs?: number;
  /** Art travel of the landing. */
  readonly landPx: number;
  /** Fight ms the landing step starts. */
  readonly landMs: number;
}

export interface NativeCityPlayerVault {
  /** Fight ms into the vault. */
  readonly ms: number;
  readonly timeline: NativeCityPlayerVaultTimeline;
  /** The heading the vault is drawn at (the clip's; the landing step already faces back). */
  readonly facing: VillageFacing;
  /** Plan unit direction he travels (toward the opponent, then past him). */
  readonly direction: CityPoint;
  /** Plan units from the start to the opponent's centre, and to the landing behind him. */
  readonly overUnits: number;
  readonly landUnits: number;
  /** Plan units travelled so far. */
  readonly travelledUnits: number;
}

export function startNativeCityPlayerVault(timeline: NativeCityPlayerVaultTimeline, facing: VillageFacing, direction: CityPoint,
  overUnits: number, landUnits: number): NativeCityPlayerVault {
  return Object.freeze({ ms: 0, timeline, facing, direction, overUnits: Math.max(0, overUnits), landUnits: Math.max(overUnits, landUnits),
    travelledUnits: 0 });
}

/** Fight ms of the handstand (`apexMs`; else the first step whose palms are on the crown) - the apex slow motion's beat. */
export function nativeCityPlayerVaultApexMs(timeline: NativeCityPlayerVaultTimeline): number {
  return timeline.apexMs ?? timeline.steps.find(step => step.travelPx >= timeline.overPx)?.atMs ?? 0;
}

/**
 * Fight ms his palms leave the crown: the first step after the handstand drawn farther along (the walkover's tip and arch keep the
 * handstand's travel — palms planted, 2026-10-18).
 */
export function nativeCityPlayerVaultReleaseMs(timeline: NativeCityPlayerVaultTimeline): number {
  const steps = timeline.steps, overIndex = steps.findIndex(step => step.travelPx >= timeline.overPx);
  const over = steps[overIndex]?.atMs ?? 0;
  return steps.slice(overIndex + 1).find(step => step.travelPx > timeline.overPx)?.atMs ?? steps[overIndex + 1]?.atMs ?? over;
}

/** Keep the planted bow, accelerate into the handstand, hold the support (through the walkover), then accelerate toward the landing. */
export function nativeCityPlayerVaultArtTravelPx(timeline: NativeCityPlayerVaultTimeline, ms: number): number {
  const steps = timeline.steps, spring = steps.find(step => step.travelPx > 0)?.atMs ?? 0;
  const overIndex = steps.findIndex(step => step.travelPx >= timeline.overPx);
  const over = steps[overIndex]?.atMs ?? spring;
  const release = nativeCityPlayerVaultReleaseMs(timeline);
  const at = Math.max(0, Number.isFinite(ms) ? ms : 0);
  if (at <= spring) return 0;
  if (at < over) return timeline.overPx * ((at - spring) / Math.max(1, over - spring)) ** 2;
  if (at < release) return timeline.overPx;
  if (at >= timeline.landMs) return timeline.landPx;
  const u = (at - release) / Math.max(1, timeline.landMs - release);
  return timeline.overPx + (timeline.landPx - timeline.overPx) * u * u;
}

/** Plan units the art travel maps to: start → his centre (`overPx`), his centre → the landing behind him (`landPx`). */
export function nativeCityPlayerVaultUnits(vault: Pick<NativeCityPlayerVault, "timeline" | "overUnits" | "landUnits">, travelPx: number): number {
  const { overPx, landPx } = vault.timeline;
  if (travelPx <= overPx) return overPx > 1e-9 ? vault.overUnits * Math.max(0, travelPx) / overPx : vault.overUnits;
  const rest = Math.max(1e-9, landPx - overPx);
  return vault.overUnits + (vault.landUnits - vault.overUnits) * Math.min(1, (travelPx - overPx) / rest);
}

/** Inside the i-frames: every blow passes (`dodge.vault`). */
export function nativeCityPlayerVaultInvulnerable(vault: NativeCityPlayerVault | null): boolean {
  if (!vault) return false;
  const spec = NATIVE_CITY_COMBAT.dodge.vault;
  return vault.ms >= spec.invulnerableFromMs && vault.ms <= vault.timeline.landMs + spec.invulnerableAfterLandMs;
}

/** Fight ms left of the vault's i-frames (0 outside them): the blink's window (`nativeCityFightSimUntouchable`). */
export function nativeCityPlayerVaultInvulnerableLeftMs(vault: NativeCityPlayerVault | null): number {
  return vault && nativeCityPlayerVaultInvulnerable(vault)
    ? vault.timeline.landMs + NATIVE_CITY_COMBAT.dodge.vault.invulnerableAfterLandMs - vault.ms : 0;
}

/** His feet and presses wait (until the landing + `lockAfterLandMs`); the rest of the clip is a tail a walk or a press cuts. */
export function nativeCityPlayerVaultLocks(vault: NativeCityPlayerVault | null): boolean {
  return vault !== null && vault.ms < vault.timeline.landMs + NATIVE_CITY_COMBAT.dodge.vault.lockAfterLandMs;
}

/**
 * `dtMs` (fight ms) of the vault: this frame's travel (plan units along `direction`), whether it landed this frame and whether it ended
 * (`state` null).
 */
export function stepNativeCityPlayerVault(vault: NativeCityPlayerVault, dtMs: number)
  : { readonly state: NativeCityPlayerVault | null; readonly travelUnits: number; readonly landed: boolean } {
  const dt = Number.isFinite(dtMs) ? Math.max(0, dtMs) : 0, ms = vault.ms + dt;
  const target = nativeCityPlayerVaultUnits(vault, nativeCityPlayerVaultArtTravelPx(vault.timeline, ms));
  const travelUnits = target - vault.travelledUnits;
  const landed = vault.ms + 1e-9 < vault.timeline.landMs && ms + 1e-9 >= vault.timeline.landMs;
  const state = ms >= vault.timeline.totalMs ? null : Object.freeze({ ...vault, ms, travelledUnits: target });
  return { state, travelUnits, landed };
}
