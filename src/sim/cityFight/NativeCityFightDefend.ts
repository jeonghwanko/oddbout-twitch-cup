import { damagedHp } from "../PlayerHealthRules";
import { DEFAULT_TUNING } from "../tuning";
import { nativeCityBlockKind, nativeCityGuardCrushes, nativeCityKumaBestAnswer, nativeCityParryGroggy, nativeCityVaultPasses, resolveNativeCityDefense,
  type NativeCityDefense, type NativeCityDefenseAnswers } from "./NativeCityExchange";
import { nativeCityKnockbackCurve, nativeCityMeleeInCone, resolveNativeCityMelee, resolveNativeCityProjectile, type NativeCityMeleeVictim } from "./NativeCityMelee";
import { NATIVE_CITY_COMBAT, type NativeCityImpactTier, type NativeCityKumaActionKind, type NativeCityKumaChanceKind, type NativeCityMeleeTier }
  from "./NativeCityCombatTuning";
import type { VillageFacing } from "../VillageFacing";
import type { CityPoint } from "../../world/NativeCityDefinition";
import { canActorsHarm, NATIVE_CITY_PLAYER_ID } from "./NativeCityFactions";
import { blockNativeCityFight, freezeNativeCityFight, grabNativeCityFight, holdNativeCitySpin, nativeCityBlowKind, nativeCityFightEnemyVictim,
  nativeCityFightUntouchable, readBeatNativeCityFight, releaseNativeCityFightGrab, startNativeCityFightHit, takeNativeCityBlow } from "./NativeCityFight";
import { nativeCityPlayerSwingCharging } from "./NativeCityPlayerSwing";
import { kumaScreenDelta, kumaScreenFacing, NATIVE_CITY_OPPOSITE_FACING, nativeCityFacingPlan, nativeCityFrontBiasedDiagonal } from "./NativeCityKumaGeometry";
import { blockNativeCityGuard, nativeCityDefenseBlockStunned, nativeCityDefenseDodging, nativeCityDefensePressAgeMs, parryNativeCityGuard,
  settleNativeCityGuardWhiff } from "./NativeCityPlayerDefense";
import { nativeCityPlayerVaultInvulnerable } from "./NativeCityPlayerVault";
import { calmKuma, emit, facingFor, interruptPlayer, playerFreeToGuard, nativeCityUnit, opponentOf, playerRadius, SPIN_ORDER, type FightEnemy,
  type FightFrame, type NativeCityEnemyBlow, type NativeCityKoLanding } from "./NativeCityFightFrame";
import type { KumaCombatEvent, KumaTuning } from "./NativeCityKumaCombatState";
import { kumaGrabBeats, kumaGrabThrowFlightMs } from "./NativeCityKumaGrab";
import { endSpin, fightEnemies } from "./CityFightFoes";
import { kumaFightEnemy } from "./CityFightFighterFoe";
import { knockbackStopMs } from "../KnockbackCurve";
import { duelHpKnockScale } from "../duel/DuelKnockback";
import { cityFightMeterGain } from "./CityFightMeter";
import { cityFightAwakening, cityFightFollowUpHold, startCityFightFollowUp, type CityFightFollowUp } from "./CityFightAwakening";
import type { CityFightStageLine } from "./CityFightStageLine";
import { cityFightSummonAlong, cityFightSummonPoint, cityFightSummonStrike, type CityFightSummon, type CityFightSummonOutcome } from "./CityFightSummons";
import { landHit } from "./NativeCityFightContacts";
import { cityFightSummonSpec, type CityFightSummonKind } from "./CityFightSummonTuning";




export function defendAgainst<K>(f: FightFrame<K>, action: NativeCityKumaActionKind, from: CityPoint, answers?: NativeCityDefenseAnswers)
  : NativeCityDefense {
  const { s, ctx } = f, point = ctx.point, heading = s.lockedHeading, defense = s.defense;
  if (nativeCityPlayerVaultInvulnerable(s.vault) && nativeCityVaultPasses(action, answers)) return "dodge";
  const free = playerFreeToGuard(s);
  const fromFront = s.guardUp && heading !== null && nativeCityMeleeInCone(point, heading, from, NATIVE_CITY_COMBAT.guard.coneHalfAngleDeg);
  return resolveNativeCityDefense({ action, free: free && s.guardUp || nativeCityDefenseDodging(defense),
    guardHeld: defense.held || nativeCityDefenseBlockStunned(defense), pressAgeMs: nativeCityDefensePressAgeMs(defense), dodgeMs: defense.dodgeMs,
    guardBroken: defense.gauge.broken, fromFront, ...(answers ? { answers } : {}) });
}


export function nativeCityDefendedVictim(defense: "block" | "parry" | "dodge", struck: NativeCityMeleeVictim, before: NativeCityMeleeVictim,
  parriable: boolean): NativeCityMeleeVictim {
  return defense === "block" || defense === "parry" && !parriable ? struck : before;
}


export function kumaStrikesPlayer<K>(f: FightFrame<K>, action: NativeCityKumaActionKind, attackId: number, hitIndex: number, direction: CityPoint,
  damage: number, tier: NativeCityMeleeTier, facing?: VillageFacing, superMove = false, pass = false): void {
  const { s, ctx } = f, ops = ctx.kumaOps, tuning = ops.tuning, point = ctx.point, spec = tuning.strikes[action], projection = ctx.projection;
  const opponent = opponentOf(f);
  if (superMove && s.foeFollowUp !== null) return;
  const harm = s.fight.ko === null && ops.present(f.kuma) && canActorsHarm(f.factions, opponent, NATIVE_CITY_PLAYER_ID);
  const kumaPoint = ops.point(f.kuma);
  const result = harm ? resolveNativeCityMelee({ attackerId: opponent, attackId, hitIndex, origin: kumaPoint, direction,
    radius: ops.radius(f.kuma), damage, tier }, { id: NATIVE_CITY_PLAYER_ID, point, radius: playerRadius(f) }, s.fight.victim,
  { stepUnits: ctx.stepUnits, invulnerableMs: spec.invulnerableMs,
    reachExtraStrides: ops.reachExtraStrides(f.kuma, action) }) : null;
  // The red grab: no defense takes it — in reach it catches (`kuma.grab`).
  let defense: NativeCityDefense = result?.hit && action !== "grab" ? defendAgainst(f, action, kumaPoint) : "hit";
  // A gold contact on the guard crushes it AND lands its damage (2026-10-16 audit — the concept's "금 = 피해라": with the crush free of
  // damage and the press-on swing now answerable, Z held through everything won); one that would knock him out is taken as that blow.
  if (defense === "block" && nativeCityGuardCrushes(action) && damagedHp(f.hp, damage, DEFAULT_TUNING) <= 0) defense = "hit";
  if (action === "slam") emit(f, { kind: "slamGround", direction, hit: Boolean(result?.hit) && defense !== "dodge" });
  // A whiff: the whoosh already played before contact, and nothing freezes ("휙!" when it passed right by him — never through his
  // invulnerability, never the slam).
  if (!result?.hit) {
    if (harm && action !== "slam" && !nativeCityFightUntouchable(s.fight)) emit(f, { kind: "kumaWhiff", action, attackId });
    return;
  }
  const axis = facing ?? kumaScreenFacing(projection, direction) ?? kumaScreenFacing(projection, result.push) ?? "left";
  const push = nativeCityFacingPlan(projection, axis) ?? result.push;
  if (action === "grab") { grabbed(f, attackId, hitIndex, axis, push, result.victim); return; }
  if (defense === "dodge") {
    dodged(f, direction);
    if (action === "dash") emit(f, { kind: "exchange", beat: "dashDodge" });
    // A JUST dodge (`kuma.rhythm.chance.justMs`) of a swing whose best answer is the evade (gold — `triangle.best`, 2026-10-19 읽기
    // 보상): the chance opens on him. A white swing vaulted only passes (its best answer is the ring's counter).
    if (justEvaded(f) && nativeCityKumaBestAnswer(action) === "evade") openChance(f, "dodge");
    return;
  }
  if (defense === "parry") { parry(f, action, hitIndex, push); return; }
  if (defense === "block") {
    // 역경직 for him too: his swing holds its contact frame through the freeze; the slam and the dash bounce off the guard. A clean
    // block opens his recovery to a punish counter (`exchange.counter`); a block that broke the guard counts as a hit (no window). A gold
    // contact (the triangle) crushes the guard: the gauge empties — the guard break — and its damage lands (2026-10-16).
    if (nativeCityGuardCrushes(action)) {
      const hp = f.hp = damagedHp(f.hp, damage, DEFAULT_TUNING);
      emit(f, { kind: "playerDamaged", amount: damage, hp });
    }
    block(f, action, push, nativeCityDefendedVictim("block", result.victim, s.fight.victim, true), nativeCityGuardCrushes(action),
      tuning.dash.contact, (freeze, heavy, broke) => {
      const landing = { attackId, hitIndex, push, pushbackPx: action === "dash" ? tuning.dash.contact.recoilPx
        : heavy ? NATIVE_CITY_COMBAT.feel.hitLag.attackerPushbackPx.slam : 0,
        freezeMs: freeze, followTier: null, blocked: !broke };
      f.kuma = ops.strikeLanded(f.kuma, landing);
      emit(f, { kind: "kumaRecoil", ...landing });
    });
    return;
  }
  const fx = NATIVE_CITY_COMBAT.feel.fx, contact = kumaContactImpact(action, hitIndex, tuning);
  const follow = superMove ? foeFollowUpOpening(f, hitIndex, tuning.actions[action].damage.length, pass) : null;
  if (follow) { holdForFoeFollowUp(f, follow, damage, result.victim, axis, push, direction, { attackId, hitIndex }); return; }
  takeBlow(f, kumaFightEnemy(f.kuma, ops, f.factions, opponent), { damage, victim: result.victim, axis, push, direction,
    impact: contact.impact, ...(contact.freezeMs !== undefined ? { freezeMs: contact.freezeMs } : {}), reaction: tier,
    ...(contact.impact === "dash" ? { catchMs: tuning.dash.contact.catchMs } : {}),
    // The shockwave slam (`KumaTuning.slamShockwave`) knocks him down: the drawn fall, the lie, the get-up.
    ...(action === "slam" && ops.slamKnocksDown?.(f.kuma) ? { knockdown: true } : {}),
    knockbackStrides: kumaStrikeKnockbackStrides(action, hitIndex, tuning), stunMs: spec.stunMs, first: result.first,
    ender: hitIndex >= tuning.actions[action].damage.length - 1,
    contactHeight: action === "slam" ? fx.slamContactHeight : fx.contactHeight,
    speedLines: action === "dash",
    landed: (impact, freeze) => {
      emit(f, { kind: "kumaStrikeLanded", tier: impact, freeze, push, dash: action === "dash", ...(superMove ? { super: true as const } : {}) });
      const landing = { attackId, hitIndex, push, pushbackPx: action === "dash" ? tuning.dash.contact.recoilPx
        : NATIVE_CITY_COMBAT.feel.hitLag.attackerPushbackPx[impact], freezeMs: freeze,
        followTier: impact };
      f.kuma = ops.strikeLanded(f.kuma, landing);
      emit(f, { kind: "kumaRecoil", ...landing, blocked: false });
    },
    // KUMA restarts the attack the dash cut: the spin holds until its first contact.
    ...(action === "dash" ? { spin: () => {
      const restart = ops.dashConnected(f.kuma);
      f.kuma = restart.kuma;
      return restart.impactMs;
    } } : {}) });
}


function foeFollowUpOpening<K>(f: FightFrame<K>, hitIndex: number, hits: number, pass: boolean): CityFightFollowUp | null {
  const follow = f.ctx.stage ? cityFightAwakening(opponentOf(f))?.followUp ?? null : null;
  if (!follow || f.s.foeFollowUp !== null || pass) return null;
  return follow.opensOnFirst || hitIndex >= hits - 1 ? follow : null;
}

/**
 * The super's contact (or its grab's throw) that opens the follow-up: its share of `damage` lands where he stands — no push, his hit lock held
 * through the first beat (`holdMs`) — the super's "쾅!" over him and his clock back to the contact, then the beats run (unless it knocked
 * him out).
 */
function holdForFoeFollowUp<K>(f: FightFrame<K>, follow: CityFightFollowUp, damage: number, victim: NativeCityMeleeVictim, axis: VillageFacing,
  push: CityPoint, direction: CityPoint, landing?: { readonly attackId: number; readonly hitIndex: number }): void {
  const ops = f.ctx.kumaOps, hold = cityFightFollowUpHold(follow), share = damage * hold.share, fx = NATIVE_CITY_COMBAT.feel.fx;
  const hp = takeBlow(f, kumaFightEnemy(f.kuma, ops, f.factions, opponentOf(f)), { damage: share, victim, axis, push, direction,
    impact: "heavy", reaction: "heavy", knockbackStrides: 0, stunMs: hold.string.flinchMs, contactHeight: fx.contactHeight,
    landed: (impact, freeze) => {
      emit(f, { kind: "kumaStrikeLanded", tier: impact, freeze, push, dash: false, super: true, damage: share });
      if (!landing) return;
      const back = { ...landing, push, pushbackPx: 0, freezeMs: freeze, followTier: impact };
      f.kuma = ops.strikeLanded(f.kuma, back);
      emit(f, { kind: "kumaRecoil", ...back, blocked: false });
    } });
  if (hp > 0) f.s.foeFollowUp = startCityFightFollowUp(follow, damage);
}


export function kumaStrikeKnockbackStrides(action: NativeCityKumaActionKind, hitIndex: number, tuning: KumaTuning): number {
  const spec = tuning.strikes[action], last = tuning.actions[action].damage.length - 1;
  return hitIndex >= last && spec.lastKnockbackStrides !== undefined ? spec.lastKnockbackStrides : spec.knockbackStrides;
}

/**
 * The impact tier a fighter's contact lands with and, for a light one with its own step, its freeze (ms), by his `tuning`: the slam and the
 * dash their own (the dash's `dash.contact.hitStopMs`); a swipe light — unless `actions.<action>.impacts` names its contact (2026-10-10 KOF
 * pass: KUMA's combo's two-palm thrust is heavy), with `lightHitStopMs[contact]` stepping the light freezes up the string (67 / 67 / 83, then
 * the heavy 133).
 */
export function kumaContactImpact(action: NativeCityKumaActionKind, hitIndex: number, tuning: KumaTuning): { readonly impact: NativeCityImpactTier;
  readonly freezeMs?: number } {
  if (action === "dash") return { impact: action, freezeMs: tuning.dash.contact.hitStopMs * NATIVE_CITY_COMBAT.hitStopScale };
  if (action === "slam") return { impact: action };
  const spec = tuning.actions[action], impact = spec.impacts?.[hitIndex] ?? "light";
  const ladder = impact === "light" ? spec.lightHitStopMs?.[hitIndex] : undefined;
  return ladder !== undefined ? { impact, freezeMs: ladder * NATIVE_CITY_COMBAT.hitStopScale } : { impact };
}


export function enemyStrikesPlayer<K>(f: FightFrame<K>, enemyId: string, direction: CityPoint, from: CityPoint, damage: number)
  : "dodge" | "block" | "hit" | "ko" | "none" {
  const { s } = f;
  // A host enemy (`FightEnemy.blow` — his hit contract) standing and fighting here: a defeat in this frame ends his blows.
  const by = fightEnemies(f).find(enemy => enemy.id === enemyId && enemy.blow !== null);
  if (!by?.blow || !by.engaged || nativeCityFightUntouchable(s.fight)) return "none";
  // Its hit contract (`blow` — Otto's json `playerHit`): the protection after it, the lock, the push — the fight applies it (`takeBlow`).
  return contractBlowOnPlayer(f, by, by.blow, direction, from, damage, { ...s.fight.victim, invulnerableMs: by.blow.invulnerableMs });
}


export function summonStrikesPlayer<K>(f: FightFrame<K>, summon: CityFightSummon, line: CityFightStageLine): CityFightSummonOutcome {
  const { s, ctx } = f, owner = opponentOf(f);
  if (summon.ownerId !== owner || s.fight.ko !== null || s.finale !== null || nativeCityFightUntouchable(s.fight)) return "none";
  // His C or V swung into it knocks it back (`reflect`, 2026-10-20): it turns round as his.
  if (playerSwingReflects(f, summon, line)) {
    emit(f, { kind: "summonReflected", point: cityFightSummonPoint(line, summon), direction: [-line.direction[0] * summon.heading, -line.direction[1] * summon.heading] });
    return "reflect";
  }
  const by = kumaFightEnemy(f.kuma, ctx.kumaOps, f.factions, owner);
  if (!by.engaged || !canActorsHarm(f.factions, owner, NATIVE_CITY_PLAYER_ID)) return "none";
  const blow = cityFightSummonBlow(summon.kind), contact = resolveNativeCityProjectile(cityFightSummonStrike(summon), s.fight.victim, blow.invulnerableMs);
  if (!contact.hit) return contact.protected ? "protected" : "none";
  const direction: CityPoint = [line.direction[0] * summon.heading, line.direction[1] * summon.heading];
  // It comes from its side of him: the guard cone is asked about that side, not its centre (a long frame may have carried it past his feet).
  const back = playerRadius(f) + 1e-3, along = cityFightSummonAlong(line, ctx.point);
  const from: CityPoint = [line.origin[0] + line.direction[0] * (along - summon.heading * back),
    line.origin[1] + line.direction[1] * (along - summon.heading * back)];
  // A summon's contract keeps its own push (`growsPush` off — 2026-10-20 review: the bolt's grew with his lost HP).
  return contractBlowOnPlayer(f, { ...by, growsPush: false }, blow, direction, from, summon.damage, contact.victim);
}

/**
 * His swing meets the object (`CityFightSummonSpec.reflect`): a C or V running from `leadMs` before its first contact to `tailMs` after its
 * last, swung toward where the object comes from — a V once let go (2026-10-20 review: held at the crouch its clock stood inside the window,
 * so a held V batted back everything for as long as he held it). An object already ending this step (its edge, its life) is not met.
 */
function playerSwingReflects<K>(f: FightFrame<K>, summon: CityFightSummon, line: CityFightStageLine): boolean {
  const reflect = cityFightSummonSpec(summon.kind).reflect, swing = f.s.swing.current;
  if (!reflect || summon.end !== null || !swing || (swing.kind !== "combo" && swing.kind !== "attack")) return false;
  if (nativeCityPlayerSwingCharging(f.s.swing)) return false;
  const hits = swing.timeline.hitsMs, first = hits[0] ?? 0, last = hits.at(-1) ?? first;
  if (swing.elapsedMs < first - reflect.leadMs || swing.elapsedMs > last + reflect.tailMs) return false;
  // It comes along `heading`: his swing must face back up it.
  return swing.direction[0] * -line.direction[0] * summon.heading + swing.direction[1] * -line.direction[1] * summon.heading > 0;
}


export function reflectedSummonStrikesFoe<K>(f: FightFrame<K>, summon: CityFightSummon, line: CityFightStageLine): CityFightSummonOutcome {
  const { s, ctx } = f, owner = opponentOf(f), ops = ctx.kumaOps, reflect = cityFightSummonSpec(summon.kind).reflect;
  if (!reflect || summon.ownerId !== NATIVE_CITY_PLAYER_ID || s.fight.ko !== null || s.finale !== null) return "none";
  const foe = kumaFightEnemy(f.kuma, ops, f.factions, owner);
  if (!foe.engaged || !foe.vulnerable) return "none";
  const contact = resolveNativeCityProjectile(cityFightSummonStrike(summon), nativeCityFightEnemyVictim(s.fight, owner),
    cityFightSummonBlow(summon.kind).invulnerableMs);
  if (!contact.hit) return contact.protected ? "protected" : "none";
  const push: CityPoint = [line.direction[0] * summon.heading, line.direction[1] * summon.heading], from = cityFightSummonPoint(line, summon);
  const received = ops.receiveHit(f.kuma, { damage: reflect.damage, from, push, tier: "heavy", poise: reflect.poise, pierce: false,
    axis: kumaScreenFacing(ctx.projection, push) ?? "left", string: { flinchMs: 0, ender: true, knockdown: false } });
  f.kuma = received.kuma;
  const taken = received.hit;
  if (!taken.hit) return "none";
  s.fight = Object.freeze({ ...s.fight, enemyVictims: Object.freeze({ ...s.fight.enemyVictims, [owner]: contact.victim }) });
  if (taken.blocked) return "block";
  const tier: NativeCityImpactTier = taken.defeated ? "ko" : "heavy";
  emit(f, { kind: "kumaImpact", tier, armored: taken.armored, uppercut: false });
  if (taken.defeated) {
    const side = Math.sign(kumaScreenDelta(ctx.projection, push)[0]) || 1;
    s.finales += 1;
    s.finale = { id: s.finales, fightMs: 0, landed: false, card: false, bowed: false, side, screenMs: 0 };
  }
  const freeze = landHit(f, tier, taken.armored, owner, taken.damage, foe.point, push, tier, received.knockbackUnits, false, true,
    taken.defeated ? "ko" : "ender", "lateral");
  // His own beats on top (the hit lean; the KO's finisher burst and impact plate — 2026-10-20 review: a reflected KO had neither).
  emit(f, { kind: "kumaLanded", taken, victim: foe.point, origin: from, push, impact: tier, stopTier: tier, ender: true, wasGuarding: false,
    freeze, meleeTier: "heavy", chainBeat: null });
  if (taken.damage > 0) s.meter = cityFightMeterGain(s.meter, "hit");
  return taken.defeated ? "ko" : "hit";
}


export function cityFightSummonBlow(kind: CityFightSummonKind): NativeCityEnemyBlow {
  const hit = cityFightSummonSpec(kind).playerHit;
  const landing: NativeCityKoLanding | null = hit.knockdown
    ? { flightMs: knockbackStopMs(hit.knockbackStrides, nativeCityKnockbackCurve(1, hit.launch === true)), lieMs: Math.max(0, hit.lieMs ?? 0),
      ...(hit.contact === "stone" ? { contact: "stone" as const } : {}) } : null;
  return { contact: hit.contact, tier: hit.tier, invulnerableMs: hit.invulnerableMs, stunMs: hit.stunMs, knockbackStrides: hit.knockbackStrides,
    defendAs: hit.defendAs, answers: hit.answers, ...(hit.launch ? { launch: true } : {}), ...(hit.knockdown ? { knockdown: true } : {}),
    ...(landing ? { landing } : {}) };
}


function contractBlowOnPlayer<K>(f: FightFrame<K>, by: FightEnemy, blow: NativeCityEnemyBlow, direction: CityPoint, from: CityPoint, damage: number,
  victim: NativeCityMeleeVictim): "dodge" | "block" | "hit" | "ko" {
  const { s, ctx } = f, projection = ctx.projection;
  const defense = defendAgainst(f, blow.defendAs, from, blow.answers);
  const axis = kumaScreenFacing(projection, direction) ?? "left";
  const push = nativeCityFacingPlan(projection, axis) ?? direction;
  if (defense === "dodge") { dodged(f, direction); return "dodge"; }
  // Such an enemy has no parry stagger: a parry is a block (`nativeCityDefendedVictim`).
  if (defense === "parry" || defense === "block") {
    // Its blow has no dash contact of its own (a fighter's dash's): the exchange's guard freeze, no catch.
    block(f, blow.defendAs, push, nativeCityDefendedVictim(defense, victim, s.fight.victim, false), false, null);
    return "block";
  }
  const toward = nativeCityUnit([from[0] - ctx.point[0], from[1] - ctx.point[1]]);
  const pull = blow.pullStrides !== undefined && f.hp > damage && toward !== null;
  const gap = Math.max(0, Math.hypot(from[0] - ctx.point[0], from[1] - ctx.point[1]) - by.radius - playerRadius(f));
  const pullStrides = ctx.stepUnits > 0 ? Math.min(blow.pullStrides ?? 0, gap / ctx.stepUnits) : 0;
  // The shared knock movement still clips against bodies, walls and stage ends. A successful defense never reaches this branch.
  const hp = takeBlow(f, by, { damage, victim, axis, push: pull ? toward : push, direction, impact: blow.tier,
    reaction: blow.tier === "light" ? "light" : "heavy", knockbackStrides: pull ? pullStrides : blow.knockbackStrides, stunMs: blow.stunMs,
    contactHeight: blow.contactHeight ?? NATIVE_CITY_COMBAT.feel.fx.contactHeight,
    ...(blow.contact ? { contact: blow.contact } : {}), ...(blow.freezeMs !== undefined ? { freezeMs: blow.freezeMs } : {}),
    ...(blow.launch ? { launch: true, speedLines: true } : {}),
    ...(blow.knockdown ? { knockdown: true } : {}), ...(blow.landing ? { landing: blow.landing } : {}) });
  return hp <= 0 ? "ko" : "hit";
}

/**
 * His contact passed through i-frames that began at most `kuma.rhythm.chance.justMs` ago (2026-10-18 "저스트 회피"): the dodge's own
 * (`dodge.invulnerableMs[0]` into it) or the vault's (`dodge.vault.invulnerableFromMs`). Without the rhythm: never.
 */
function justEvaded<K>(f: FightFrame<K>): boolean {
  const justMs = f.ctx.kumaOps.tuning.rhythm?.chance.justMs ?? 0, s = f.s;
  if (!(justMs > 0)) return false;
  if (s.vault && nativeCityPlayerVaultInvulnerable(s.vault)) return s.vault.ms - NATIVE_CITY_COMBAT.dodge.vault.invulnerableFromMs <= justMs;
  const dodge = s.defense.dodgeMs;
  return dodge !== null && dodge - NATIVE_CITY_COMBAT.dodge.invulnerableMs[0] <= justMs;
}

/**
 * The chance (`kuma.rhythm.chance`, 2026-10-18 "기회"): a grade's best answer (2026-10-19 `triangle.best` — the ring's counter on white, a just
 * dodge on gold; both open the same size) leaves him open — his rule state takes it (`openChance`) and the fight slows for the read
 * (`chance.slowMo`; none under reduced motion). His view shows the opening rim and one "빈틈!" letter (2026-10-19 신호 정리: was the "기회" status).
 */
type ChanceSlowMo = { readonly scale: number; readonly holdMs: number; readonly releaseMs: number; readonly desaturate: number;
  readonly whipRate?: number };

function openChance<K>(f: FightFrame<K>, kind: NativeCityKumaChanceKind, slowMo: ChanceSlowMo | undefined = undefined): void {
  const ops = f.ctx.kumaOps, spec = ops.tuning.rhythm?.chance;
  if (!spec || !ops.openChance) return;
  const before = f.kuma;
  f.kuma = ops.openChance(f.kuma, kind);
  if (f.kuma === before) return;
  emit(f, { kind: "chanceOpened", chance: kind });
  if (f.ctx.reducedMotion) return;
  const beat: ChanceSlowMo = slowMo ?? spec.slowMo;
  const { scale, holdMs, releaseMs, desaturate, whipRate } = beat;
  f.s.fight = readBeatNativeCityFight(f.s.fight, { scale, holdMs, releaseMs, vignette: 0, desaturate, cooldownMs: 0,
    ...(whipRate !== undefined ? { whipRate } : {}) }, f.ctx.feel.slowMoScale);
}


/**
 * V pressed without the counter (2026-10-19 merge): into his armoured swing whose gauge is still filling, it spends that swing's counter —
 * the ring goes out (`counterSpentId`). Mashed V must not fall into the window by chance (the V masher won again once the counter joined
 * the charged V); the counter reader presses only on a full ring.
 */
export function spendKumaCounterEarly<K>(f: FightFrame<K>): void {
  const ops = f.ctx.kumaOps;
  if (!ops.tuning.rhythm?.counter || !ops.counterGauge || !ops.spendCounter) return;
  const enemy = kumaFightEnemy(f.kuma, ops, f.factions, opponentOf(f));
  const gauge = enemy.engaged ? ops.counterGauge(f.kuma) : null;
  if (gauge && !gauge.open) { f.kuma = ops.spendCounter(f.kuma); emit(f, { kind: "changed" }); }
}

export function counterKuma<K>(f: FightFrame<K>): boolean {
  const { s, ctx } = f, ops = ctx.kumaOps, spec = ops.tuning.rhythm?.counter;
  if (!spec || !ops.counterGauge) return false;
  const enemy = kumaFightEnemy(f.kuma, ops, f.factions, opponentOf(f));
  const gauge = enemy.engaged && enemy.vulnerable ? ops.counterGauge(f.kuma) : null;
  if (!gauge?.open) return false;
  const point = ctx.point, at = ops.point(f.kuma), delta: CityPoint = [at[0] - point[0], at[1] - point[1]];
  const gap = Math.hypot(delta[0], delta[1]) - ops.radius(f.kuma) - playerRadius(f);
  if (gap > (ops.reachExtraStrides(f.kuma, gauge.action) + Math.max(0, spec.reachSlackStrides)) * ctx.stepUnits + 1e-6) return false;
  const toward = nativeCityUnit(delta) ?? s.lockedHeading ?? [1, 0];
  const taken = ops.receiveParry(f.kuma, point, toward, false);
  if (!taken.parried) return false;
  f.kuma = taken.kuma;
  // The counter's own beat (`counter.accent`): a short catch, the deep slow, the whip into the heel. A counter that breaks him into the
  // groggy keeps the parry's freeze (no chance, no slow-mo — the break's own beat).
  const accent = taken.broke ? undefined : spec.accent;
  if (!taken.broke) openChance(f, "parry", accent?.slowMo);
  interruptPlayer(s, ["queue", "chain"]);
  const freeze = (accent ? accent.freezeMs : ctx.feel.exchangeHitStopMs("parry")) * NATIVE_CITY_COMBAT.hitStopScale;
  s.fight = freezeNativeCityFight(s.fight, freeze);
  const push: CityPoint = [-toward[0], -toward[1]];
  emit(f, { kind: "parried", push, broke: taken.broke, freeze, forward: (s.lockedFacing ?? "down-right").endsWith("left") ? -1 : 1, cut: true,
    counter: true });
  emit(f, { kind: "exchange", beat: taken.broke ? "parryGroggy" : "parry" });
  emit(f, { kind: "changed" });
  return true;
}

/** A swipe passed over his bow-duck: it counts as a miss (no freeze). */
function dodged<K>(f: FightFrame<K>, direction: CityPoint): void {
  emit(f, { kind: "dodged", direction });
  emit(f, { kind: "exchange", beat: "dodge" });
}

/** He parried a swipe (spec beat 4): no damage, KUMA recoils or goes groggy, both freeze. */
function parry<K>(f: FightFrame<K>, action: NativeCityKumaActionKind, hitIndex: number, push: CityPoint): void {
  const { s, ctx } = f, point = ctx.point, toward: CityPoint = [-push[0], -push[1]];
  const taken = ctx.kumaOps.receiveParry(f.kuma, point, toward, nativeCityParryGroggy(action, hitIndex));
  f.kuma = taken.kuma;
  // A parry that only recoils him opens the chance (`kuma.rhythm.chance.parry` — the larger one); the groggy one is the break already.
  if (taken.parried && !taken.broke) openChance(f, "parry");
  s.defense = parryNativeCityGuard(s.defense);
  interruptPlayer(s, ["queue", "chain"]);
  const freeze = ctx.feel.exchangeHitStopMs("parry") * NATIVE_CITY_COMBAT.hitStopScale;
  s.fight = freezeNativeCityFight(s.fight, freeze);
  emit(f, { kind: "parried", push, broke: taken.broke, freeze, forward: (s.lockedFacing ?? "down-right").endsWith("left") ? -1 : 1,
    cut: taken.parried });
  emit(f, { kind: "exchange", beat: taken.broke ? "parryGroggy" : "parry" });
  emit(f, { kind: "changed" });
}

/**
 * His guard met the blow: no damage, both freeze (jabGuard / clash), he slides back (the slam's far) and is block-stunned; the block that
 * empties his guard gauge breaks it (a stagger, still no damage). `dash`: the attacker's dash contact (his own tuning's `dash.contact` —
 * a dash on the guard freezes `guardStopMs` and catches `catchMs` first); null: none. `hitLag`: the attacker's own hold on the contact frame
 * (`heavy`: a clash; `broke`: this block emptied the gauge).
 */
function block<K>(f: FightFrame<K>, action: NativeCityKumaActionKind, push: CityPoint, victim: NativeCityMeleeVictim, crush: boolean,
  dash: KumaTuning["dash"]["contact"] | null, hitLag?: (freeze: number, heavy: boolean, broke: boolean) => void): void {
  const { s, ctx } = f, kind = nativeCityBlockKind(action);
  const blocked = blockNativeCityGuard(s.defense, kind, crush), broke = blocked.broke;
  s.defense = blocked.state;
  const heavy = kind !== "light", dashOn = action === "dash" ? dash : null;
  const freeze = (dashOn ? dashOn.guardStopMs
    : ctx.feel.exchangeHitStopMs(broke ? "crush" : heavy ? "clash" : "jabGuard")) * NATIVE_CITY_COMBAT.hitStopScale;
  // His melee state after the blow, the shared freeze and the guard's slide back along the axis (`blockNativeCityFight`).
  s.fight = blockNativeCityFight(s.fight, { victim, push, kind, stepUnits: ctx.stepUnits, freezeMs: freeze,
    ...(dashOn ? { catchMs: dashOn.catchMs } : {}) });
  hitLag?.(freeze, heavy, broke);
  interruptPlayer(s, ["queue", "chain", "swing"]);
  emit(f, { kind: "blocked", heavy, broke, push, freeze });
  if (broke) breakGuard(f);
  emit(f, { kind: "exchange", beat: broke ? "guardBreak" : kind === "slam" ? "clash" : kind === "dash" ? "dashBlock" : "block" });
  emit(f, { kind: "changed" });
}

/**
 * His guard gauge ran out (a block, or a whiffed re-press): the hit reaction as a long stagger (`guard.breakStunMs`, no damage), no guard
 * until the gauge is back to `guard.reopenAt` — and KUMA presses on (his stand is skipped).
 */
function breakGuard<K>(f: FightFrame<K>): void {
  const { s, ctx } = f;
  interruptPlayer(s, ["guard", "swing", "queue", "chain"]);
  const facing = s.lockedFacing ?? "down-right", stunMs = NATIVE_CITY_COMBAT.guard.breakStunMs;
  // Its own drawn reaction (2026-10-17: jarred, blown open, the stagger, the catch — the plain hit ended 360 ms before the lock did).
  s.fight = startNativeCityFightHit(s.fight, ctx.art.hit(facing, stunMs, "guardBreak"));
  emit(f, { kind: "guardBroken", facing, stunMs });
  f.kuma = ctx.kumaOps.pressOn(f.kuma);
}

/**
 * After the enemies' contacts were judged this frame: a parry RE-PRESS that no block or parry consumed within `parry.windowMs` whiffed
 * (`parry.whiffCost`): the parry pose as a whiff — the guard break when it emptied the gauge.
 */
export function settleGuardWhiff<K>(f: FightFrame<K>): void {
  const s = f.s, settled = settleNativeCityGuardWhiff(s.defense), whiff = settled.whiff;
  s.defense = settled.state;
  if (!whiff) return;
  emit(f, { kind: "guardWhiff", broke: whiff.broke, forward: (s.lockedFacing ?? "down-right").endsWith("left") ? -1 : 1 });
  if (whiff.broke) breakGuard(f);
  emit(f, { kind: "exchange", beat: whiff.broke ? "guardBreak" : "parryWhiff" });
  emit(f, { kind: "changed" });
}


export interface UndefendedBlow {
  readonly contact?: "hook" | "stone";
  readonly damage: number;
  readonly victim: NativeCityMeleeVictim;
  readonly axis: VillageFacing;
  readonly push: CityPoint;
  /** The enemy's strike direction (the dash's impact dots). */
  readonly direction: CityPoint;
  readonly impact: NativeCityImpactTier;
  /** This blow's own freeze (ms); default the impact tier's (`hitStopMs`). */
  readonly freezeMs?: number;
  /** The attacker's catch before the push (fight ms — a fighter's dash's `dash.contact.catchMs`); absent: none. */
  readonly catchMs?: number;
  readonly reaction: NativeCityMeleeTier;
  readonly knockbackStrides: number;
  /** The attack's last contact (its string's ender) — its push grows with his lost HP like a heavy one (`FightEnemy.growsPush`). */
  readonly ender?: boolean;
  readonly stunMs?: number;
  /** The attack's first contact on him (`NativeCityMeleeResult.first`); false: a later one goes on with its hit lock. Absent: a first. */
  readonly first?: boolean;
  readonly contactHeight: number;
  readonly speedLines?: boolean;
  /** The blow knocks him down with HP left (KUMA-rule fighters' shockwave slam): the KO's fall and get-up, the fight goes on. */
  readonly knockdown?: boolean;
  /** The push flies on the launch curve (the grab's throw). */
  readonly launch?: boolean;
  /** A thrown knock-out: he flies, then lands into the fall from its ground-impact step (the grab's throw). */
  readonly landing?: NativeCityKoLanding;
  readonly landed?: (impact: NativeCityImpactTier, freeze: number) => void;
  /** The blow sets him spinning; returns when the enemy's next contact lands (fight ms). */
  readonly spin?: () => number | null;
}


export function takeBlow<K>(f: FightFrame<K>, by: FightEnemy, blow: UndefendedBlow): number {
  const { s, ctx } = f, projection = ctx.projection, push = blow.push, stepUnits = ctx.stepUnits;
  // The vault and the backstep (no i-frames: the blow lands and ends it), every defensive pose and the guard.
  interruptPlayer(s, ["moves", "defense", "guard"]);
  const hp = f.hp = damagedHp(f.hp, blow.damage, DEFAULT_TUNING);
  emit(f, { kind: "playerDamaged", amount: blow.damage, hp });
  // A blow he takes builds his meter (`super.gainTaken`, 2026-10-20).
  if (blow.damage > 0) s.meter = cityFightMeterGain(s.meter, "taken");
  // Face the blow: he turns back along the strike axis toward the enemy and staggers back along it. His four-diagonal fallback is the
  // front-biased diagonal of that heading.
  const victim = NATIVE_CITY_OPPOSITE_FACING[blow.axis];
  const [vx, vy] = kumaScreenDelta(projection, [-push[0], -push[1]]), diagonal = nativeCityFrontBiasedDiagonal(vx, vy);
  s.lean = diagonal.endsWith("left") ? "left" : "right";
  // The drawn KO / hit reaction the outcome needs, at the heading it is drawn at (its timing is the fight's to keep).
  const kind = nativeCityBlowKind(s.fight, hp, blow.spin !== undefined, blow.knockdown === true);
  const drawn = kind === "spin" ? victim : facingFor(f, victim, kind, diagonal);
  // A fighter's string ender or heavy blow pushes him further as his HP runs out (`knockback.hpScale`, 2026-10-20 — the rule the fighter's
  // own push follows, `nativeCityKumaFighterHit`: 2026-10-20 review — this side went by the impact tier, so a light ender never grew and a
  // heavy mid-string contact did); the string's other contacts keep theirs, and a host enemy's its contract's (`FightEnemy.growsPush`).
  const knockbackStrides = by.growsPush === true && kind === "hit" && (blow.ender === true || blow.reaction === "heavy") && !blow.launch
    && ctx.maxHp !== undefined && ctx.maxHp > 0
    ? blow.knockbackStrides * duelHpKnockScale(hp / ctx.maxHp, NATIVE_CITY_COMBAT.knockback.hpScale) : blow.knockbackStrides;
  const taken = takeNativeCityBlow(s.fight, { hpAfter: hp, by: { id: by.id, defeatCard: by.defeatCard }, impact: blow.impact,
    freezeMs: blow.freezeMs ?? ctx.feel.hitStopMs(blow.impact), ...(blow.catchMs !== undefined ? { catchMs: blow.catchMs } : {}),
    knockbackStrides, victim: blow.victim, push, stepUnits, stunMs: blow.stunMs,
    spin: blow.spin ? { from: Math.max(0, SPIN_ORDER.indexOf(victim)) } : null, ...(blow.knockdown ? { knockdown: true } : {}),
    ...(blow.launch ? { launch: true } : {}),
    ...(blow.landing?.slide ? { landingSlide: blow.landing.slide } : {}),
    hit: kind === "hit" ? ctx.art.hit(drawn, blow.stunMs) : undefined, ...(blow.first === false && s.fight.hit ? { continues: true } : {}),
    ko: kind === "ko" ? ctx.art.ko(drawn, blow.landing) : undefined });
  s.fight = taken.state;
  for (const event of taken.events) {
    if (event.kind === "sound") emit(f, event);
    // The KO takes over a spin.
    else if (event.kind === "stunEnded") endSpin(f, event.recovered);
    else if (event.kind === "impact") {
      // The contact frame: his body's feel on the freeze the fight struck, the enemy's own beats on it, his face back along the axis.
      emit(f, { kind: "struckBy", enemy: by.id, tier: event.tier, freezeMs: event.freezeMs, skidUnits: event.skidUnits, push,
        contactHeight: blow.contactHeight, speedLines: blow.speedLines ?? false, ...(blow.contact ? { contact: blow.contact } : {}) });
      blow.landed?.(event.tier, event.freezeMs);
      interruptPlayer(s, ["queue", "chain", "swing"]);
      s.lockedFacing = victim;
      s.lockedHeading = [-push[0], -push[1]];
    }
  }
  const outcome = { outcome: taken.outcome.kind, reaction: blow.reaction, push, direction: blow.direction,
    ...(taken.outcome.continued ? { continued: true } : {}) } as const;
  if (taken.outcome.kind === "ko") {
    s.lockedFacing = drawn;
    emit(f, { kind: "blowOutcome", ...outcome, facing: drawn, stunTotalMs: 0, knockUnits: null, ...(blow.landing ? { landing: blow.landing } : {}) });
    // A knockdown with HP left is not the end: nobody is calmed and no attempt is over — he stands and the fight goes on.
    // His fall at a fighter's hand raises the defeat card (the fighter calms); at a host enemy's it ends that attempt (`playerDown`).
    if (hp <= 0) { if (by.defeatCard) calmKuma(f); else emit(f, { kind: "playerDown", by: by.id }); }
  } else if (taken.outcome.kind === "spin") {
    // The spin lasts until the enemy's next contact + afterImpactMs (at least stun.ms) — the enemy tells it after its hit-lag (`landed`).
    s.fight = holdNativeCitySpin(s.fight, blow.spin!());
    emit(f, { kind: "blowOutcome", ...outcome, facing: drawn, stunTotalMs: s.fight.stun?.totalMs ?? 0, knockUnits: s.fight.knock?.units ?? null });
  } else {
    s.lockedFacing = drawn;
    emit(f, { kind: "blowOutcome", ...outcome, facing: drawn, ...(blow.stunMs !== undefined ? { stunMs: blow.stunMs } : {}), stunTotalMs: 0,
      knockUnits: null });
  }
  emit(f, { kind: "changed" });
  return hp;
}


function grabbed<K>(f: FightFrame<K>, attackId: number, hitIndex: number, axis: VillageFacing, push: CityPoint, victim: NativeCityMeleeVictim): void {
  const { s, ctx } = f, ops = ctx.kumaOps, spec = ops.tuning.grab;
  interruptPlayer(s, ["moves", "defense", "guard", "swing", "queue", "chain"]);
  s.lockedFacing = NATIVE_CITY_OPPOSITE_FACING[axis];
  s.lockedHeading = [-push[0], -push[1]];
  const freeze = Math.max(0, spec.catchHitStopMs) * NATIVE_CITY_COMBAT.hitStopScale;
  s.fight = freezeNativeCityFight(grabNativeCityFight(s.fight, { by: opponentOf(f), victim,
    maxMs: kumaGrabBeats(spec.move).holdMs + Math.max(0, spec.holdFailsafeMs) }), freeze);
  const landing = { attackId, hitIndex, push, pushbackPx: 0, freezeMs: freeze, followTier: null };
  const landed = ops.strikeLanded(f.kuma, landing);
  f.kuma = ops.grabCaught?.(landed) ?? landed;
  emit(f, { kind: "grabbed", enemy: opponentOf(f), push, freeze });
  emit(f, { kind: "exchange", beat: "grab" });
  emit(f, { kind: "changed" });
}

/**
 * A beat of the grab's hold (the opponent's `grab` event): a SQUEEZE takes its small damage (the light struck feel, a
 * `kuma.grab.squeezeHitStopMs` freeze — he stays held; HP 0 waits for the throw), the THROW lets go of him and lands its big blow
 * (`takeBlow`: the heavy freeze, `kuma.grab.throwStrides` along the grab's axis on the launch curve, then the knock-down — or, at HP 0, the
 * KO — that lands into the fall from its ground-impact step and lies `kuma.grab.lieMs`). Nothing once he is no longer held.
 */
export function kumaGrabBeat<K>(f: FightFrame<K>, event: Extract<KumaCombatEvent, { kind: "grab" }>): void {
  const { s, ctx } = f, ops = ctx.kumaOps, spec = ops.tuning.grab, projection = ctx.projection;
  if (!s.fight.grab) return;
  const axis = event.facing ?? kumaScreenFacing(projection, event.direction) ?? "left";
  const push = nativeCityFacingPlan(projection, axis) ?? event.direction, fx = NATIVE_CITY_COMBAT.feel.fx;
  const opponent = opponentOf(f);
  if (event.beat === "squeeze") {
    const hp = f.hp = damagedHp(f.hp, event.damage, DEFAULT_TUNING);
    emit(f, { kind: "playerDamaged", amount: event.damage, hp });
    const freeze = Math.max(0, spec.squeezeHitStopMs) * NATIVE_CITY_COMBAT.hitStopScale;
    s.fight = freezeNativeCityFight(s.fight, freeze);
    emit(f, { kind: "struckBy", enemy: opponent, tier: "light", freezeMs: freeze, skidUnits: 0, push, contactHeight: fx.contactHeight, speedLines: false });
    emit(f, { kind: "sound", cue: "struck", tier: "light" });
    emit(f, { kind: "changed" });
    return;
  }
  s.fight = releaseNativeCityFightGrab(s.fight);
  emit(f, { kind: "exchange", beat: "throw" });
  const follow = event.super === true ? foeFollowUpOpening(f, 0, 1, false) : null;
  if (follow) { holdForFoeFollowUp(f, follow, event.damage, s.fight.victim, axis, push, event.direction); return; }
  takeBlow(f, kumaFightEnemy(f.kuma, ops, f.factions, opponent), { damage: event.damage, victim: s.fight.victim, axis, push, direction: event.direction,
    impact: "heavy", reaction: "heavy", knockbackStrides: spec.throwStrides, knockdown: true, launch: true,
    landing: { flightMs: kumaGrabThrowFlightMs(ops.tuning), lieMs: spec.lieMs }, contactHeight: fx.contactHeight,
    landed: (impact, freeze) => emit(f, { kind: "kumaStrikeLanded", tier: impact, freeze, push, dash: false }) });
}
