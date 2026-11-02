import type { VillageFacing } from "../../VillageFacing";
import type { KumaTuning } from "../NativeCityKumaCombatState";
import type { NativeCityKumaFighterState } from "../NativeCityKumaFighter";
import { kumaGrabBeats } from "../NativeCityKumaGrab";


export interface CityFightBoutHold {
  /** The grabber's corner. */
  readonly by: 0 | 1;
  /** The grab's attack id (its squeezes and throw carry it). */
  readonly attackId: number;
  /** Fight ms since the catch. */
  readonly ms: number;
}

/** The HP a squeeze leaves at least (the KO waits for the throw). */
export const CITY_FIGHT_BOUT_HELD_HP_FLOOR = 0.01;

/**
 * The catch on him: his swing, dash, leap, guard and super are cut; he flinches facing the grabber (`facing`), on the first beat of a string so
 * the throw's knockdown takes (`kumaCombatHit` knocks a body flinched by an earlier blow of the string down).
 */
export function cityFightBoutSeized(state: NativeCityKumaFighterState, facing: VillageFacing): NativeCityKumaFighterState {
  return Object.freeze({ ...state, knockback: null, combat: { ...state.combat, superAttack: undefined, superArmed: undefined, mode: "hurt" as const, modeMs: 0, action: null, facing, movedPx: 0,
    hitsFired: 0, counterChain: false, dash: null, restart: false, reversal: false, wakeGuard: false, pressOn: false, guardBlocks: 0,
    guardHoldMs: 0, stringHits: 1, retaliate: false, hurtMs: 0, grab: null, leap: null, special: null, air: null, chance: null,
    followOpen: false, controlGuard: false } });
}

/** A squeeze's damage on him: never below `CITY_FIGHT_BOUT_HELD_HP_FLOOR` (the HP it took is the second value). */
export function cityFightBoutSqueezed(state: NativeCityKumaFighterState, damage: number): readonly [NativeCityKumaFighterState, number] {
  const hp = state.combat.hp, next = Math.max(Math.min(hp, CITY_FIGHT_BOUT_HELD_HP_FLOOR), hp - Math.max(0, damage));
  return [Object.freeze({ ...state, combat: { ...state.combat, hp: next } }), hp - next];
}

/**
 * The hold is over without a throw: the grabber is no longer in that grab's hold (struck by a summoned object, his own rules cut it), or it
 * ran past the hold and its failsafe (`kuma.grab.holdFailsafeMs`). Then he is let go into his flinch.
 */
export function cityFightBoutHoldEnds(hold: CityFightBoutHold, grabber: NativeCityKumaFighterState, tuning: KumaTuning): boolean {
  const c = grabber.combat;
  const holding = c.mode === "attack" && c.action === "grab" && c.attackId === hold.attackId && (c.grab ?? null) !== null;
  return !holding || hold.ms > kumaGrabBeats(tuning.grab.move).holdMs + Math.max(0, tuning.grab.holdFailsafeMs);
}
