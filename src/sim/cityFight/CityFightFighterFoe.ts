import { nativeCityPlayerContactTuning } from "./NativeCityMelee";
import { NATIVE_CITY_COMBAT, type NativeCityImpactTier } from "./NativeCityCombatTuning";
import type { CityPoint } from "../../world/NativeCityDefinition";
import { canActorsHarm, nativeCityFaction, NATIVE_CITY_KUMA_ID, NATIVE_CITY_PLAYER_ID, type NativeCityFactionMap } from "./NativeCityFactions";
import { kumaScreenDelta } from "./NativeCityKumaGeometry";
import { recoilNativeCityFight, startNativeCityFightHit } from "./NativeCityFight";
import { releaseNativeCityPlayerSwingEnder } from "./NativeCityPlayerSwing";
import type { KumaCombatHit } from "./NativeCityKumaCombatState";
import { nativeCityPlayerChargeScale, type NativeCityPlayerSwingTimeline } from "./NativeCityPlayerSwing";
import { cityFightFollowUpHold } from "./CityFightAwakening";
import { emit, interruptPlayer, type FightEnemy, type FightFrame, type NativeCityHitAccent, type NativeCityKumaFightOps } from "./NativeCityFightFrame";
import { chainLaunchFor, endsString, type CityFightFoeRules, type EnemyTake, type PlayerStrike } from "./CityFightFoe";



/** KUMA as an enemy, read now from his state (his own rules ride on the shared beat — `FIGHTER_FOE_RULES`). */
export function kumaFightEnemy<K>(kuma: K, ops: NativeCityKumaFightOps<K>, factions: NativeCityFactionMap,
  id: string = NATIVE_CITY_KUMA_ID): FightEnemy {
  const present = ops.present(kuma), air = present ? ops.air?.(kuma) ?? null : null;
  // X vaults a fighter whatever he has coming (2026-10-18 손맛 2단계 — the 2026-10-16 gate that made X the hop against a white or red move
  // is gone: the vault's i-frames pass white and gold now, and the red grab catches it in the air).
  return { id, engaged: nativeCityFaction(factions, id) === "enemy" && present,
    vulnerable: present && ops.vulnerable(kuma) && canActorsHarm(factions, NATIVE_CITY_PLAYER_ID, id),
    point: ops.point(kuma), radius: ops.radius(kuma), invulnerableMs: ops.tuning.invulnerableMs, defeatCard: true,
    rules: FIGHTER_FOE_RULES, vaultable: true, blow: null, growsPush: true,
    // On the ground with V's ground blow still his to take (`kuma.rhythm.down`): V runs in to it.
    ...(ops.grounded?.(kuma) ? { grounded: true } : {}),
    ...(air ? { air } : {}) };
}


export const FIGHTER_FOE_RULES: CityFightFoeRules = Object.freeze({ receive: kumaReceive });


function kumaReceive<K>(f: FightFrame<K>, strike: PlayerStrike): EnemyTake {
  const ops = f.ctx.kumaOps, { kind, hitIndex, timeline } = strike, victim = ops.point(f.kuma);
  const local = hitIndex - timeline.firstHit, segment = timeline.chainSegment ?? hitIndex;
  const drain = nativeCityPlayerContactTuning(kind, timeline.hitsMs.length, timeline.chainSegment).poise;
  // His guard (between attacks) takes V and chain hits 1-2 from the front; the hook pierces it (`kuma.guard.pierce`).
  const tuning = ops.tuning;
  // His super (`super`, 2026-10-20) goes through the guard (and the armour, `throughArmor` below).
  const pierce = strike.super === true || (tuning.guard.pierce[kind][segment] ?? false), wasGuarding = ops.guarding(f.kuma);
  const airMove = timeline.jump?.air?.move, airSpec = airMove ? NATIVE_CITY_COMBAT.player.air?.[airMove] : undefined;
  // The string (`kuma.hurt`): the hook and V end it; a jab / straight flinch holds until the next chain contact can land.
  const ender = !airMove && endsString(strike), nextContact = timeline.hitsMs[hitIndex - timeline.firstHit + 1];
  const flinchMs = ender ? 0 : nextContact !== undefined
    ? nextContact - strike.contactMs + tuning.hurt.chainMarginMs : chainFlinchMs(f, timeline, strike.contactMs);
  // The chain beat (jab 1, straight 2): each draws its own flinch on him.
  const beatIndex = kind === "combo" ? segment : hitIndex;
  const beat: 1 | 2 | null = !ender && (beatIndex === 0 || beatIndex === 1) ? (beatIndex + 1) as 1 | 2 : null;
  const chainBeat = beat === null ? {} : { chainBeat: beat };
  // The tie's launch (`player.actions.combo.launch`): the back-hand flick's push, the tie flick's stride, the whip's ~2.75 — off its drawn reach.
  const launchSpec = NATIVE_CITY_COMBAT.player.actions[kind].launch;
  // V's charge (2026-10-18, `player.actions.attack.charge.full.poiseScale`): its poise drain grows with the charge as its damage does.
  const chargeSpec = NATIVE_CITY_COMBAT.player.actions[kind].charge;
  const poiseScale = strike.charge !== undefined && chargeSpec ? nativeCityPlayerChargeScale(strike.charge, chargeSpec.full.poiseScale) : 1;
  // His awakening's follow-up (`CityFightAwakening`, 2026-10-23): on the side-scroll stage, against a body that can be thrown up, his super's
  // contact takes its share and only holds him where he stands — no launch, no string's end — for the scripted blows (`NativeCityFollowUp`).
  const followUp = strike.super === true && f.ctx.stage && ops.tuning.rhythm?.launch?.air ? f.ctx.awakening?.followUp ?? null : null;
  const hold = followUp ? cityFightFollowUpHold(followUp) : null;
  const chainLaunch = airMove || hold ? null : chainLaunchFor(strike);
  const launch = chainLaunch && launchSpec ? { ...chainLaunch, guardShare: launchSpec.guardShare } : null;
  const received = ops.receiveHit(f.kuma, { damage: strike.damage * (hold?.share ?? 1), from: strike.origin, push: strike.push, tier: strike.tier,
    poise: airSpec ? airSpec.poise : (drain[timeline.chainSegment !== undefined && timeline.hitsMs.length > 1 ? local : hitIndex] ?? drain.at(-1) ?? 0)
      * poiseScale, pierce,
    // His super goes through the armour too (2026-10-21: into an armoured swing it bounced off for 0 — the meter spent for nothing).
    ...(strike.super === true ? { throughArmor: true } : {}),
    axis: strike.swingFacing,
    // V knocks him down when it lands clean on a chain flinch of the string or as a counter (`kuma.knockdown`; his rule decides).
    string: hold ? hold.string
    : airMove ? { flinchMs: 0, ender: false, knockdown: false, stringCount: 1, air: airMove === "v" ? "spike" : "hit",
      // The spike on a body already on the ground is V's ground blow; so is the stomp — V's at its full weight, C's a plain one.
      ...(airMove === "v" ? { ground: true, groundCharge: 1 } : airMove === "stomp" ? { ground: true, groundCharge: kind === "attack" ? 1 : 0 } : {}) }
    : { flinchMs, ender, knockdown: ender && NATIVE_CITY_COMBAT.player.actions[kind].knockdown === true, ...chainBeat,
      // V reaches the body on the ground (`kuma.rhythm.down`); a launching ender can be followed (`kuma.rhythm.launch`).
      ...(kind === "attack" ? { ground: true, groundCharge: strike.charge ?? 0 } : {}), ...(launch?.curve ? { launches: true } : {}),
      // On the side-scroll stage his jump can follow it up (`player.air`): the counter launch throws him into the air.
      ...(launch?.curve && f.ctx.stage && NATIVE_CITY_COMBAT.player.air ? { airLaunch: true } : {}),
      // How long this swing had run and how long he stood free before it: inside his jab window only an answer to his tell — a swing begun
      // after it from a free stance — cuts it (`kuma.rhythm.jabCut`).
      // (C or V: the gold flash says "hit now" — V answered there cuts too, without its knockdown. 2026-10-18 review: a V into the gold that
      // bounced read as a miss.)
      ...(kind === "combo" || kind === "attack" ? { answerMs: strike.contactMs } : {}),
      ...((kind === "combo" || kind === "attack") && f.s.swing.current?.freeBeforeMs !== undefined ? { freeBeforeMs: f.s.swing.current.freeBeforeMs } : {}),
      ...(strike.first ? {} : { continues: true }),
      stringCount: kind === "combo" && timeline.chainSegment !== undefined && timeline.hitsMs.length > 1
        ? (local === timeline.hitsMs.length - 1 ? 1 : 0) : 1 }, ...(launch ? { launch } : {}), hpKnock: true });
  f.kuma = received.kuma;
  const taken = received.hit;
  if (!taken.hit) return { kind: "none" };
  if (taken.blocked) return { kind: "guard" };
  // The jumping heel drop lands as the slam tier (the vertical shake, the debris) and crushes him flat — so does V's ground blow on the body
  // on the ground (`kuma.rhythm.down`: the heel drop's beat on a lying body).
  // The spike (`player.air.v`) lands as the slam tier too — he is driven down, not crushed in the air.
  const heelDrop = kind === "attack" && timeline.jump !== undefined || taken.ground === true;
  const crush = heelDrop && taken.air !== "spike";
  // A FULL V charge lands a tier up (2026-10-18 game-animator: its reward must differ in kind, not only in size): the dash's.
  const fullCharge = kind === "attack" && strike.charge !== undefined && strike.charge >= 1 - 1e-9;
  const plain: NativeCityImpactTier = heelDrop ? "slam" : fullCharge ? "dash" : strike.tier;
  const impact: NativeCityImpactTier = taken.defeated ? "ko" : taken.broke ? "break" : taken.counter ? "counter" : plain;
  // A counter chained from the flinch an earlier counter caused keeps the counter colour and poise, but freezes for its own tier.
  const stopTier = impact === "counter" && taken.chained && NATIVE_CITY_COMBAT.exchange.counter.chainHitStop === "base" ? plain : impact;
  // The attacker supplies contact motion. Every roster opponent uses its own hit art and body dimensions for that response.
  const grounded = strike.motion === "lateral";
  const uppercut = strike.motion === "rising" && !taken.armored;
  emit(f, { kind: "kumaImpact", tier: impact, armored: taken.armored, uppercut,
    ...(grounded && !taken.defeated ? { grounded: true } : {}), ...(crush && !taken.armored ? { crush: true } : {}) });
  // "타타-쾅": the chain's jab and straight freeze short; the opening counter, the poise break and the tie whip's launch (the ender that flies) throw
  // the speed lines behind him.
  const launched = ender && launch !== null && launch.curve && !taken.armored && received.knockbackUnits >= launch.strides * f.ctx.stepUnits - 1e-6;
  const speedLines = impact === "counter" && !taken.chained || impact === "break" || launched;
  // Thrown up into the air combo (`kuma.rhythm.launch.air`): the launch's own longer freeze.
  const launchStop = taken.air === "launch" ? ops.tuning.rhythm?.launch?.air?.launchHitStopMs : undefined;
  return { kind: "hit", impact, armored: taken.armored, stopTier, damage: taken.damage, skidUnits: received.knockbackUnits,
    chainLight: !ender && stopTier === "light" ? hitIndex : false, speedLines, accent: kumaHitAccent(taken, impact, ender),
    ...(launchStop !== undefined ? { hitStopMs: launchStop } : {}), ...(followUp && !taken.defeated ? { followUp: { id: followUp.id, damage: strike.damage } } : {}),
    after: freeze => kumaLanded(f, taken, victim, strike, impact, stopTier, ender, wasGuarding, freeze, beat) };
}

/**
 * What his blow is in the exchange's story (`NativeCityHitAccent`): the KO, the break, the knockdown, the opening counter, a plain string's
 * ender — never off his armour, and a counter string's ender is not one (its opening counter was the exchange's accent).
 */
function kumaHitAccent(taken: KumaCombatHit, impact: NativeCityImpactTier, ender: boolean): NativeCityHitAccent | null {
  if (taken.armored) return null;
  if (taken.defeated) return "ko";
  if (taken.broke) return "break";
  if (taken.knockdown || taken.ground) return "knockdown";
  if (impact === "counter") return taken.chained ? null : "counter";
  return ender ? "ender" : null;
}


function kumaLanded<K>(f: FightFrame<K>, taken: KumaCombatHit, victim: CityPoint, strike: PlayerStrike, impact: NativeCityImpactTier,
  stopTier: NativeCityImpactTier, ender: boolean, wasGuarding: boolean, freeze: number, chainBeat: 1 | 2 | null): void {
  const s = f.s, push = strike.push;
  if (taken.defeated) {
    const side = Math.sign(kumaScreenDelta(f.ctx.projection, [victim[0] - strike.origin[0], victim[1] - strike.origin[1]])[0]) || 1;
    s.finales += 1;
    s.finale = { id: s.finales, fightMs: 0, landed: false, card: false, bowed: false, side, screenMs: 0 };
  }
  // string's body he may follow (`kuma.rhythm.launch`): then C cuts the follow-through and the chase closes in (no ender gate).
  if (!taken.armored && taken.ender && !taken.defeated) {
    if (taken.follow) s.swing = releaseNativeCityPlayerSwingEnder(s.swing);
    else s.enderGateMs = Math.max(s.enderGateMs, NATIVE_CITY_COMBAT.tempo.player.enderRecoveryMs);
    s.chain.next = 0;
  }
  // the price of pressing into his turn.
  const bounceMs = taken.armored ? f.ctx.kumaOps.tuning.rhythm?.armor.bounceStunMs ?? 0 : 0;
  if (bounceMs > 0) {
    interruptPlayer(s, ["swing", "queue", "chain"]);
    s.fight = startNativeCityFightHit(s.fight, { startMs: 0, stunMs: bounceMs, totalMs: bounceMs });
    // He bounces back off the armour (`armor.recoilStrides`, 2026-10-19): the blow puts distance between them, not nothing.
    const recoil = (f.ctx.kumaOps.tuning.rhythm?.armor.recoilStrides ?? 0) * f.ctx.stepUnits, length = Math.hypot(push[0], push[1]);
    if (recoil > 0 && length > 1e-9) s.fight = recoilNativeCityFight(s.fight, [-push[0] / length, -push[1] / length], recoil);
    // A blow into his armour spends this swing's counter (2026-10-19 읽기 보상: the white ring now runs over most of his windup — a masher
    // whose bounce ends inside it must not fall into the counter; the reader waits for the ring with Z up).
    if (f.ctx.kumaOps.spendCounter) f.kuma = f.ctx.kumaOps.spendCounter(f.kuma);
  }
  emit(f, { kind: "kumaLanded", taken, victim, origin: strike.origin, push, impact, stopTier, ender, wasGuarding, freeze, meleeTier: strike.tier,
    chainBeat });
  // V knocked him down (`kuma.knockdown`): not his turn — no ender gate, the chain starts over.
  if (taken.knockdown) { s.chain.next = 0; emit(f, { kind: "exchange", beat: "knockdown" }); }
}


function chainFlinchMs<K>(f: FightFrame<K>, timeline: NativeCityPlayerSwingTimeline, contactMs: number): number {
  const next = (timeline.chainSegment ?? timeline.firstHit) + 1;
  if (timeline.ender || next >= NATIVE_CITY_COMBAT.player.actions.combo.damage.length) return 0;
  const tail = Math.max(0, timeline.totalMs - contactMs);
  return tail + NATIVE_CITY_COMBAT.tempo.player.chainResetMs + f.ctx.art.longestWindupMs(next)
    + f.ctx.kumaOps.tuning.hurt.chainMarginMs;
}
