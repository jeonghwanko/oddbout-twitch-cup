import { NATIVE_CITY_COMBAT, type NativeCityImpactTier, type NativeCityMeleeTier, type NativeCityPlayerActionKind } from "./NativeCityCombatTuning";
import { cityFightMeterGain } from "./CityFightMeter";
import type { VillageFacing } from "../VillageFacing";
import type { CityPoint } from "../../world/NativeCityDefinition";
import { NATIVE_CITY_PLAYER_ID } from "./NativeCityFactions";
import { endSlowNativeCityFight, freezeNativeCityFight, nativeCityFightEnemyVictim, readBeatNativeCityFight, slowNativeCityFight, strikeNativeCityEnemy }
  from "./NativeCityFight";
import { nativeCityFacingPlan } from "./NativeCityKumaGeometry";
import { holdNativeCityPlayerSwing, type NativeCityContactMotion, type NativeCityPlayerSwingTimeline } from "./NativeCityPlayerSwing";
import { emit, playerRadius, type FightEnemy, type FightFrame, type NativeCityHitAccent } from "./NativeCityFightFrame";
import { fightEnemies } from "./CityFightFoes";
import { endsString, type PlayerStrike } from "./CityFightFoe";
import { cityFightFollowUpById, startCityFightFollowUp } from "./CityFightAwakening";




export function strikeFightEnemy<K>(f: FightFrame<K>, enemy: FightEnemy, attackId: number, hitIndex: number, direction: CityPoint, damage: number,
  tier: NativeCityMeleeTier, kind: NativeCityPlayerActionKind, contactMs: number, swingFacing: VillageFacing,
  timeline: NativeCityPlayerSwingTimeline, reachExtraStrides?: number, charge?: number, superMove = false): boolean {
  if (!enemy.vulnerable) return false;
  const { s, ctx } = f, point = ctx.point, victim = enemy.point, radius = enemy.radius;
  // Judged against that enemy's melee state (one contact once, its invulnerability) — a landed one records it (`NativeCityFight`).
  const struck = strikeNativeCityEnemy(s.fight, { attackerId: NATIVE_CITY_PLAYER_ID, attackId, hitIndex, origin: point, direction,
    radius: playerRadius(f), damage, tier }, { id: enemy.id, point: victim, radius }, { stepUnits: ctx.stepUnits, invulnerableMs: enemy.invulnerableMs,
    ...(reachExtraStrides !== undefined ? { reachExtraStrides } : {}) });
  const result = struck.result;
  if (!result.hit) return false;
  // Same axis: the push runs along the heading the swing is drawn at (not the line between the feet).
  const push = nativeCityFacingPlan(ctx.projection, swingFacing) ?? result.push;
  const contact = timeline.contacts?.[hitIndex - timeline.firstHit];
  const motion = contact?.motion
    ?? (timeline.jump ? "downward" : kind === "combo" && hitIndex === 2 ? "rising" : "lateral");
  const strike: PlayerStrike = { attackId, kind, hitIndex, damage, tier, contactMs, swingFacing, timeline, motion, first: result.first, origin: point, push,
    ...(reachExtraStrides !== undefined ? { reach: reachExtraStrides } : {}), ...(charge !== undefined ? { charge } : {}),
    ...(superMove ? { super: true } : {}) };
  // The enemy's own rules judge it (`CityFightFoeRules` — a fighter's, Otto's): his guard, his hit, his own beats on top.
  const taken = enemy.rules.receive(f, strike);
  if (taken.kind === "none") return false;
  // The contact is the enemy's only once his rules took it (a "none" leaves no contact memory nor invulnerability on him).
  s.fight = struck.state;
  const burst = timeline.chainSegment === undefined || timeline.hitsMs.length < 2 ? undefined
    : NATIVE_CITY_COMBAT.player.actions[kind].bursts?.[timeline.chainSegment];
  const burstStop = burst?.hitStopMs[hitIndex - timeline.firstHit];
  if (taken.kind === "guard") {
    // Both hold the jabGuard freeze on the contact frame; a guard spark where the fist met the guard, and "막!".
    const freeze = (burstStop ?? ctx.feel.exchangeHitStopMs("jabGuard")) * NATIVE_CITY_COMBAT.hitStopScale;
    s.fight = freezeNativeCityFight(s.fight, freeze, true);
    s.swing = holdNativeCityPlayerSwing(s.swing, contactMs, freeze);
    // A blow of his that was guarded still builds his meter a little (`super.gainBlocked`).
    s.meter = cityFightMeterGain(s.meter, "blocked");
    emit(f, { kind: "enemyGuard", enemy: enemy.id, victim, radius, push, freeze,
      ...(contact?.fxHeight !== undefined ? { fxHeight: contact.fxHeight } : {}) });
    emit(f, { kind: "exchange", beat: "enemyGuard" });
    emit(f, { kind: "changed" });
    return true;
  }
  // The clean ender's own beat replaces the ordinary heavy freeze. Counter / break / KO retain their stronger tier.
  // A FULL V charge freezes its own longer beat (`player.actions.attack.charge.full.hitStopMs`, 2026-10-18).
  const action = NATIVE_CITY_COMBAT.player.actions[kind], fullCharge = charge !== undefined && charge >= 1 - 1e-9 && action.charge;
  // (A full charge lands at the dash tier — `CityFightFighterFoe` — and keeps its own freeze.)
  const clean = taken.impact === "heavy" && taken.stopTier === "heavy" || fullCharge && taken.impact === "dash" && taken.stopTier === "dash";
  const enderStop = !taken.armored && clean && endsString(strike)
    ? fullCharge ? action.charge.full.hitStopMs : action.enderHitStopMs : undefined;
  // A body thrown up (the air combo, `FightEnemy.air`): the contact is up there with him — its burst and number over his lifted body.
  const lift = enemy.air?.heightBodies ?? 0;
  const fxHeight = lift > 0 ? (contact?.fxHeight ?? NATIVE_CITY_COMBAT.feel.fx.contactHeight) + lift : contact?.fxHeight;
  // An air move's own light freeze (`player.air.c.hitStopMs`): the juggle keeps flowing, the spike stays the biggest stop.
  const airMove = timeline.jump?.air?.move, airStop = airMove ? NATIVE_CITY_COMBAT.player.air?.[airMove].hitStopMs : undefined;
  // (An air hit is a chained counter: it freezes on its light tier.)
  const lightStop = airStop !== undefined && taken.stopTier === 'light' && !taken.armored ? airStop
    : taken.impact === 'light' && !taken.armored ? burstStop : undefined;
  const freeze = landHit(f, taken.impact, taken.armored, enemy.id, taken.damage, victim, push, taken.stopTier, taken.skidUnits, taken.chainLight, taken.speedLines,
    taken.accent, motion, fxHeight, taken.hitStopMs ?? enderStop ?? lightStop, strike.super === true, airMove === "v", contact?.fxInset);
  // A clean FULL charge flies off in slow motion after its freeze (`charge.full.slowMo`, 2026-10-19) — none under reduced motion.
  const slow = fullCharge && enderStop !== undefined ? action.charge.full.slowMo : undefined;
  if (slow && !f.ctx.reducedMotion) s.fight = readBeatNativeCityFight(s.fight, { ...slow, vignette: 0, cooldownMs: 0 }, f.ctx.feel.slowMoScale);
  // 역경직: his swing goes back to the contact's own moment and holds there through the freeze (then the drawn hold is shortened).
  s.swing = holdNativeCityPlayerSwing(s.swing, contactMs, freeze);
  // A blow of his that landed builds his meter (`super.gainHit`, 2026-10-20) — not one his own super spent.
  if (taken.damage > 0 && !superMove) s.meter = cityFightMeterGain(s.meter, "hit");
  taken.after?.(freeze);
  // His super held him for his awakening's follow-up (`CityFightAwakening`): its blows follow on the fight clock (`NativeCityFollowUp`).
  const follow = taken.followUp ? cityFightFollowUpById(taken.followUp.id) : null;
  if (follow && taken.followUp && taken.impact !== "ko") s.followUp = startCityFightFollowUp(follow, taken.followUp.damage);
  emit(f, { kind: "changed" });
  return true;
}


export function landHit<K>(f: FightFrame<K>, tier: NativeCityImpactTier, armored: boolean, enemy: string, damage: number, victim: CityPoint, push: CityPoint,
  stopTier: NativeCityImpactTier, skidUnits: number, chainLight: boolean | number, speedLines: boolean, accent: NativeCityHitAccent | null,
  motion: NativeCityContactMotion, fxHeight?: number, hitStopMs?: number, superMove = false, spike = false, fxInset?: number, followUp?: number): number {
  const { s, ctx } = f, reduced = ctx.reducedMotion;
  // motion) — the spec's beat 5 numbers, not the KO tier's ladder step.
  const finisher = tier === "ko";
  const stop = hitStopMs !== undefined ? hitStopMs * NATIVE_CITY_COMBAT.hitStopScale
    : finisher ? ctx.feel.exchangeHitStopMs("finisher") * NATIVE_CITY_COMBAT.hitStopScale : ctx.feel.hitStopMs(stopTier, armored, chainLight);
  // The counter's heel ends the counter's slow-mo (`kuma.rhythm.counter.accent`): the whip runs into the contact, its freeze is the 팡.
  if (tier === "counter") s.fight = endSlowNativeCityFight(s.fight);
  // His own blow: the hand eases back after the freeze (`tempo.releaseRamp`).
  s.fight = freezeNativeCityFight(s.fight, stop, true);
  if (finisher) {
    const { scale, holdMs, releaseMs, desaturate } = NATIVE_CITY_COMBAT.tempo.finisherSlowMo;
    s.fight = slowNativeCityFight(s.fight, { scale: ctx.feel.finisherRate(reduced, scale), holdMs, releaseMs, vignette: 0, desaturate, cooldownMs: 0 });
  } else if (!reduced && tier === "break") {
    // The poise break's slow-mo (none under reduced motion).
    const { scale, holdMs, releaseMs, desaturate } = NATIVE_CITY_COMBAT.feel.slowMo;
    s.fight = readBeatNativeCityFight(s.fight, { scale, holdMs, releaseMs, vignette: 0, desaturate, cooldownMs: 0 }, ctx.feel.slowMoScale);
  }
  emit(f, { kind: "playerHit", enemy, damage, tier, armored, victim, push, stop, skidUnits, speedLines, stopTier, accent, motion,
    ...(fxHeight !== undefined ? { fxHeight } : {}), ...(fxInset !== undefined ? { fxInset } : {}), ...(superMove ? { super: true as const } : {}),
    ...(spike ? { spike: true as const } : {}), ...(followUp !== undefined ? { followUp } : {}) });
  return stop;
}


export function whiffNearEnemy<K>(f: FightFrame<K>, direction: CityPoint): void {
  const point = f.ctx.point, step = f.ctx.stepUnits, radius = playerRadius(f);
  const close = fightEnemies(f).some(enemy => enemy.engaged && enemy.vulnerable
    && nativeCityFightEnemyVictim(f.s.fight, enemy.id).invulnerableMs <= 0
    && Math.hypot(enemy.point[0] - point[0], enemy.point[1] - point[1]) - enemy.radius - radius <= 2 * step);
  if (close) emit(f, { kind: "playerWhiff", direction });
}
