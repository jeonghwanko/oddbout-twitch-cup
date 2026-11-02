import type { CityPoint } from "../../world/NativeCityDefinition";
import type { CityFightStageLine } from "./CityFightStageLine";
import type { NativeCityKumaFighterState } from "./NativeCityKumaFighter";
import { kumaCombatEngaged } from "./NativeCityKumaCombatState";
import type { VillageFacing } from "../VillageFacing";
import { NATIVE_CITY_COMBAT } from "./NativeCityCombatTuning";



export interface NativeCityBackpedalPlan {
  readonly line: CityFightStageLine;
  /** Along the line (plan units from its origin): where each one starts and where he stops. */
  readonly player: { readonly from: number; readonly to: number };
  readonly foe: { readonly from: number; readonly to: number };
  /** The spacing it aims for, and the one it reaches (less only when both are walled in). Plan units, centre to centre. */
  readonly gapUnits: number;
  readonly reachedUnits: number;
}

export interface NativeCityBackpedalPose {
  readonly player: CityPoint;
  readonly foe: CityPoint;
  /** Plan units each has backed off so far. */
  readonly playerTravel: number;
  readonly foeTravel: number;
}


export const NATIVE_CITY_PLAYER_OPENING_REACH_STRIDES = NATIVE_CITY_COMBAT.melee.reachFromArt.maxExtraStrides;


export function nativeCityBackpedalGapStrides(contactStrides: number, foeReachStrides: number, marginStrides: number,
  playerReachStrides = NATIVE_CITY_PLAYER_OPENING_REACH_STRIDES): number {
  return Math.max(0, contactStrides) + Math.max(0, foeReachStrides, playerReachStrides) + Math.max(0, marginStrides);
}

/** The point `t` plan units along the line from its origin. */
export function nativeCityBackpedalPoint(line: CityFightStageLine, t: number): CityPoint {
  return [line.origin[0] + line.direction[0] * t, line.origin[1] + line.direction[1] * t];
}

/** How far along the line `point` lies (its projection onto it). */
export function nativeCityBackpedalAlong(line: CityFightStageLine, point: CityPoint): number {
  return (point[0] - line.origin[0]) * line.direction[0] + (point[1] - line.origin[1]) * line.direction[1];
}

/**
 * Who stands where at the end. `gapUnits`: the opening spacing (centre to centre). `blocked(who, point)`: a body (or anything else)
 * stops `who` there — probed every `probeUnits` along his way back; the line's own ends always stop him.
 */
export function nativeCityBackpedalPlan(line: CityFightStageLine, player: CityPoint, foe: CityPoint, gapUnits: number,
  options: { readonly blocked?: (who: "player" | "foe", point: CityPoint) => boolean; readonly probeUnits?: number } = {}): NativeCityBackpedalPlan {
  const clampT = (t: number) => Math.max(line.min, Math.min(line.max, t));
  const tL = clampT(nativeCityBackpedalAlong(line, player)), tF = clampT(nativeCityBackpedalAlong(line, foe));
  const side = tF >= tL ? 1 : -1, gap = Math.max(0, gapUnits), need = Math.max(0, gap - Math.abs(tF - tL));
  const probe = Math.max(1e-3, options.probeUnits ?? need / 16);
  const room = (who: "player" | "foe", from: number, sign: number): number => {
    const end = sign < 0 ? line.min : line.max;
    const open = Math.max(0, Math.min(need, (end - from) * sign));
    const blocked = options.blocked;
    if (!blocked) return open;
    let t = 0;
    while (t < open - 1e-9) {
      const next = Math.min(open, t + probe);
      if (blocked(who, nativeCityBackpedalPoint(line, from + sign * next))) return t;
      t = next;
    }
    return open;
  };
  const roomL = room("player", tL, -side), roomF = room("foe", tF, side);
  let backL = Math.min(roomL, need / 2);
  const backF = Math.min(roomF, need - backL);
  backL = Math.min(roomL, need - backF);
  const playerTo = tL - side * backL, foeTo = tF + side * backF;
  return Object.freeze({ line, player: Object.freeze({ from: tL, to: playerTo }), foe: Object.freeze({ from: tF, to: foeTo }), gapUnits: gap,
    reachedUnits: Math.abs(foeTo - playerTo) });
}

/** Accelerate then decelerate (smootherstep: no velocity or acceleration jump at either end), `k` clamped to 0..1. */
export function nativeCityBackpedalEase(k: number): number {
  const u = Number.isFinite(k) ? Math.max(0, Math.min(1, k)) : 0;
  return u * u * u * (u * (u * 6 - 15) + 10);
}

/** Where both stand at progress `k` (0..1, linear — the ease is applied here). */
export function nativeCityBackpedalAt(plan: NativeCityBackpedalPlan, k: number): NativeCityBackpedalPose {
  const e = nativeCityBackpedalEase(k);
  const tL = plan.player.from + (plan.player.to - plan.player.from) * e, tF = plan.foe.from + (plan.foe.to - plan.foe.from) * e;
  return { player: nativeCityBackpedalPoint(plan.line, tL), foe: nativeCityBackpedalPoint(plan.line, tF),
    playerTravel: Math.abs(tL - plan.player.from), foeTravel: Math.abs(tF - plan.foe.from) };
}

/**
 * The reversed walk: the cycle phase (0..1) after `travelledPx` of ground backwards from `startPhase`, one cycle per `stridePx`
 * (same units). A stride that is not positive holds `startPhase`.
 */
export function nativeCityBackpedalPhase(startPhase: number, travelledPx: number, stridePx: number): number {
  const start = Number.isFinite(startPhase) ? startPhase : 0;
  if (!(stridePx > 0) || !Number.isFinite(travelledPx)) return ((start % 1) + 1) % 1;
  const phase = (start - Math.max(0, travelledPx) / stridePx) % 1;
  return phase < 0 ? phase + 1 : phase;
}


export function nativeCityKumaFighterBackpedal(state: NativeCityKumaFighterState, point: CityPoint, facing: VillageFacing): NativeCityKumaFighterState {
  const at: CityPoint = [point[0], point[1]];
  const engaged = kumaCombatEngaged(state.combat);
  return Object.freeze({ ...state, knockback: null, here: true,
    combat: { ...state.combat, point: at, facing, movedPx: 0 },
    patrol: engaged ? state.patrol : { ...state.patrol, point: at, facing, movedPx: 0 } });
}
