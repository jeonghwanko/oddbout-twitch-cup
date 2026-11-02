import { nativeCityMeleeInCone } from "./NativeCityMelee";
import { NATIVE_CITY_COMBAT } from "./NativeCityCombatTuning";
import type { VillageFacing } from "../VillageFacing";
import type { CityPoint } from "../../world/NativeCityDefinition";
import { NATIVE_CITY_DEFAULT_OPPONENT_ID, type NativeCityFactionMap } from "./NativeCityFactions";
import { kumaScreenFacing } from "./NativeCityKumaGeometry";
import { drawnFacing, emit, NATIVE_CITY_FACING_SCREEN, nativeCityPlanFromScreen, nativeCityUnit, opponentOf, playerRadius, type FightEnemy,
  type FightFrame, type NativeCityKumaFightOps, type NativeCityPlayerArtAction, type NativeCityOttoFoe } from "./NativeCityFightFrame";
import { kumaFightEnemy } from "./CityFightFighterFoe";
import { ottoFightEnemy } from "./CityFightOttoFoe";



/** Every enemy the fight walks — the opponent fighter first, then Otto while his attempt is on here (his state as the call has it). */
export function fightEnemiesOf<K>(kuma: K, ops: NativeCityKumaFightOps<K>, factions: NativeCityFactionMap,
  otto: NativeCityOttoFoe | null | undefined, opponentId: string = NATIVE_CITY_DEFAULT_OPPONENT_ID): readonly FightEnemy[] {
  const first = kumaFightEnemy(kuma, ops, factions, opponentId);
  return otto ? [first, ottoFightEnemy(otto.state, otto.radius)] : [first];
}

export function fightEnemies<K>(f: FightFrame<K>): readonly FightEnemy[] {
  return fightEnemiesOf(f.kuma, f.ctx.kumaOps, f.factions, f.otto && f.ctx.otto ? { state: f.otto, radius: f.ctx.otto.radius } : null,
    opponentOf(f));
}

/** In a fight right now: an enemy stands engaged in this view (guard, dodge and the queue work against any of them). */
export function fightOn<K>(f: FightFrame<K>): boolean {
  return fightEnemies(f).some(enemy => enemy.engaged);
}

/** The nearest engaged enemy (the guard turns toward it, the spin ends facing it); null outside a fight. */
export function nearestFightEnemy<K>(f: FightFrame<K>): FightEnemy | null {
  const point = f.ctx.point;
  let nearest: FightEnemy | null = null, best = Number.POSITIVE_INFINITY;
  for (const enemy of fightEnemies(f)) {
    const distance = enemy.engaged ? Math.hypot(enemy.point[0] - point[0], enemy.point[1] - point[1]) : Number.POSITIVE_INFINITY;
    if (distance < best) { nearest = enemy; best = distance; }
  }
  return nearest;
}

/**
 * The plan direction and drawn heading of a move aimed from `facing`/`heading`, pulled onto an enemy roughly in front. The heading is
 * the one `action` is drawn at (`drawnFacing`).
 */
export function aimMove<K>(f: FightFrame<K>, facing: VillageFacing, heading: CityPoint, action: NativeCityPlayerArtAction)
  : { readonly direction: CityPoint; readonly swing: VillageFacing } {
  const { projection, stepUnits, point } = f.ctx;
  if (facing.endsWith("left")) f.s.lean = "left"; else if (facing.endsWith("right")) f.s.lean = "right";
  let direction = nativeCityUnit(heading) ?? nativeCityPlanFromScreen(projection, NATIVE_CITY_FACING_SCREEN[facing]) ?? [1, 0];
  // Soft aim: a nearby enemy roughly in front pulls the swing onto him.
  for (const enemy of fightEnemies(f)) {
    if (!enemy.vulnerable) continue;
    const toward: CityPoint = [enemy.point[0] - point[0], enemy.point[1] - point[1]];
    const reach = NATIVE_CITY_COMBAT.player.aimAssistStrides * stepUnits + enemy.radius + playerRadius(f);
    if (Math.hypot(...toward) <= reach && nativeCityMeleeInCone(point, direction, enemy.point, NATIVE_CITY_COMBAT.player.aimAssistHalfAngleDeg)) {
      direction = nativeCityUnit(toward) ?? direction;
    }
  }
  return { direction, swing: drawnFacing(f, direction, action) };
}

/**
 * The spin ended: `recovered` (its time ran out — the fight made him invulnerable for `stun.recoverMs`) — he faces the nearest enemy
 * with full control; else the KO took over.
 */
export function endSpin<K>(f: FightFrame<K>, recovered: boolean): void {
  if (recovered) {
    const point = f.ctx.point, enemy = nearestFightEnemy(f)?.point;
    const toward = enemy ? nativeCityUnit([enemy[0] - point[0], enemy[1] - point[1]]) : null;
    if (toward) {
      f.s.lockedHeading = toward;
      f.s.lockedFacing = kumaScreenFacing(f.ctx.projection, toward) ?? f.s.lockedFacing;
      f.s.released = true;
    }
  }
  emit(f, { kind: "stunEnded", recovered });
}
