import { NATIVE_CITY_COMBAT, type NativeCityImpactTier } from "./NativeCityCombatTuning";
import type { CityPoint } from "../../world/NativeCityDefinition";
import { kumaScreenFacing } from "./NativeCityKumaGeometry";
import { emit, nativeCityUnit, opponentOf, type FightFrame, type NativeCityHitAccent } from "./NativeCityFightFrame";
import { kumaFightEnemy } from "./CityFightFighterFoe";
import { landHit } from "./NativeCityFightContacts";
import { cityFightFollowUpBlow, cityFightFollowUpById, stepCityFightFollowUp, type CityFightFollowUp } from "./CityFightAwakening";



/** A hold beat freezing this long (fight ms) or longer lands as a heavy blow (its burst, its accent). */
const HOLD_HEAVY_STOP_MS = 120;

/** One frame of the follow-up on the fight clock: the beat due now (one a frame — its freeze holds the rest of it). */
export function stepNativeCityFollowUp<K>(f: FightFrame<K>, fightDt: number): void {
  const s = f.s, run = s.followUp;
  if (!run) return;
  const follow = cityFightFollowUpById(run.id);
  if (!follow || s.fight.ko !== null || s.finale !== null) { s.followUp = null; return; }
  const stepped = stepCityFightFollowUp(run, fightDt, f.ctx.kumaOps.lying?.(f.kuma) === true);
  s.followUp = stepped.run;
  if (stepped.beat === null) return;
  if (strikeFollowUpBeat(f, follow, stepped.beat, run.damage) === "ko") s.followUp = null;
}

/**
 * One beat on the opponent (`cityFightFollowUpBlow`). A body no longer there, or one the beat cannot reach (in his get-up, a launch's
 * landing past), lets the beat pass.
 */
function strikeFollowUpBeat<K>(f: FightFrame<K>, follow: CityFightFollowUp, index: number, superDamage: number): "hit" | "ko" | "none" {
  const { s, ctx } = f, owner = opponentOf(f), ops = ctx.kumaOps;
  const foe = kumaFightEnemy(f.kuma, ops, f.factions, owner);
  if (!foe.engaged) return "none";
  const beat = follow.beats[index]!, launch = beat.kind === "launch", spike = beat.kind === "spike", down = beat.kind === "down";
  const push: CityPoint = nativeCityUnit([foe.point[0] - ctx.point[0], foe.point[1] - ctx.point[1]]) ?? [1, 0];
  const received = ops.receiveHit(f.kuma, cityFightFollowUpBlow(follow, index, superDamage,
    { from: ctx.point, push, axis: kumaScreenFacing(ctx.projection, push) ?? "left" }));
  f.kuma = received.kuma;
  const taken = received.hit;
  if (!taken.hit || taken.blocked) return "none";
  // A rush's blow is light unless it holds the frame (`HOLD_HEAVY_STOP_MS` — the rush's last, the hardest).
  const heavyHold = beat.kind === "hold" && beat.hitStopMs >= HOLD_HEAVY_STOP_MS;
  const loud = launch || spike || down || heavyHold;
  const impact: NativeCityImpactTier = taken.defeated ? "ko" : launch || down ? "slam" : spike || heavyHold ? "heavy" : "light";
  emit(f, { kind: "kumaImpact", tier: impact, armored: false, uppercut: launch });
  if (taken.defeated) {
    s.finales += 1;
    s.finale = { id: s.finales, fightMs: 0, landed: false, card: false, bowed: false, side: Math.sign(push[0]) || 1, screenMs: 0 };
  }
  // Up there with him: the burst and number over his lifted body.
  const lift = foe.air?.heightBodies ?? 0, fxHeight = NATIVE_CITY_COMBAT.feel.fx.contactHeight + lift;
  const accent: NativeCityHitAccent | null = taken.defeated ? "ko" : loud ? "ender" : null;
  const freeze = landHit(f, impact, false, owner, taken.damage, foe.point, push, impact, received.knockbackUnits, false, loud, accent,
    launch ? "rising" : spike || down ? "downward" : "lateral", fxHeight, beat.hitStopMs, false, spike, undefined, index);
  emit(f, { kind: "kumaLanded", taken, victim: foe.point, origin: ctx.point, push, impact, stopTier: impact, ender: loud,
    wasGuarding: false, freeze, meleeTier: "heavy", chainBeat: null });
  return taken.defeated ? "ko" : "hit";
}
