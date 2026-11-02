import { nativeCityMeleeInCone } from "./NativeCityMelee";
import { NATIVE_CITY_COMBAT, type NativeCityCombatTuning, type NativeCityKumaChanceKind, type NativeCityKumaWakeup, type NativeCityPoiseTuning } from "./NativeCityCombatTuning";
import type { CityPoint, NativeCityDefinition } from "../../world/NativeCityDefinition";
import type { KumaCombatHit, KumaCombatHitOptions, KumaCombatParryOptions, KumaCombatState, KumaTuning } from "./NativeCityKumaCombatState";
import { kumaActionFacing, nativeCityVictimFacing } from "./NativeCityKumaGeometry";
import { kumaCombatAirborne, kumaCombatRecovering, kumaSuperSwing } from "./NativeCityKumaSwing";
import { kumaShift } from "./NativeCityKumaShift";
import { kumaAirJuggle, kumaAirLaunch, kumaAirLow, kumaAirSpike } from "./NativeCityKumaAir";
import { kumaSkillBare, kumaSkillBraced, kumaSkillCounter, kumaSkillCounterCued, kumaSkillGuarding } from "./NativeCityKumaSkill";
import { kumaAirSpec, kumaSkillLaunches } from "./NativeCityKumaAirChase";

/** KUMA형 파이터가 받는 쪽(2026-10-13, `NativeCityKumaPatrol`에서 나눔): 맞을 수 있는가, 가드·갑옷·반격 창, 한 방과 패리의 결과, 자세 회복. */

/** 이 상태에서 맞을 수 있는가(쓰러져 있거나 순찰·귀가 중이면 아니다, 엉덩방아로 날고 있어도 아니다). */
export function kumaCombatVulnerable(state: KumaCombatState): boolean {
  // Over the other in his vault (the bout AI's, 2026-10-23 2차): nothing reaches him.
  if (kumaCombatAirborne(state) || state.vault) return false;
  return state.mode === "chase" || state.mode === "attack" || state.mode === "abort" || state.mode === "cooldown" || state.mode === "hurt"
    || state.mode === "parried" || state.mode === "break" || state.mode === "dash" || kumaCombatGrounded(state);
}

/**
 * Down from V's knockdown with the ground blow still his to take (`kuma.rhythm.down`, 2026-10-18 "다운 - 강공"): only V lands there
 * (`KumaCombatHitOptions.ground`), once; C passes over the body. Never the KO, a shift change's fall or the get-up.
 */
export function kumaCombatGrounded(state: KumaCombatState): boolean {
  return state.mode === "down" && state.knockdown && state.groundOpen === true && state.hp > 0;
}

/**
 * He lies in a knockdown (2026-10-23, an awakening's `down` beat — `KumaCombatHitOptions.lying`): down from a knockdown or an air landing,
 * not the KO, a shift's fall or in the air.
 */
export function kumaCombatLying(state: KumaCombatState): boolean {
  return state.mode === "down" && state.knockdown && state.hp > 0 && state.shiftRise !== true && !state.air;
}

/**
 * The jab's window in a swing he started from his stand or chase (`kuma.rhythm.jabCut`, 2026-10-18 "쨉으로 끊기"): from `pressFromMs` to
 * `pressToMs` into his windup his rim flashes gold, not iron — a C pressed then, from a free stance, cuts the swing as a counter
 * (`kumaJabCuts`). Without the rhythm: never.
 */
export function kumaCombatJabCutOpen(state: KumaCombatState, t: KumaTuning): boolean {
  return kumaJabCutSwing(state, t) && kumaJabPressIn(state.modeMs, t);
}

/** A swing whose jab window applies (`kuma.rhythm.jabCut`): one from his stand or chase, before its first contact. */
function kumaJabCutSwing(state: KumaCombatState, t: KumaTuning): boolean {
  return t.rhythm !== undefined && state.mode === "attack" && state.jabCut === true && !state.restart && !state.lunge && !state.reversal
    && state.hitsFired === 0;
}

/** `ms` into his windup falls in the jab's press window (`kuma.rhythm.jabCut`), with a frame's slack either side. */
function kumaJabPressIn(ms: number, t: KumaTuning): boolean {
  const spec = t.rhythm?.jabCut;
  return spec !== undefined && spec.pressToMs > spec.pressFromMs && ms >= spec.pressFromMs - JAB_SLACK_MS && ms <= spec.pressToMs + JAB_SLACK_MS;
}

/** A just dodge or a parry opened a chance on him (`kuma.rhythm.chance`, 2026-10-18 "기회"): which, or null. */
export function kumaCombatChance(state: KumaCombatState): NativeCityKumaChanceKind | null {
  return state.chance?.kind ?? null;
}

/** He took a just dodge or a parry (`kuma.rhythm.chance`): the chance of that kind opens on him (none without the rhythm). */
export function kumaCombatOpenChance(state: KumaCombatState, kind: NativeCityKumaChanceKind, t: KumaTuning): KumaCombatState {
  const spec = t.rhythm?.chance[kind];
  if (!spec || !(spec.ms > 0) || state.mode === "down" || state.mode === "getup" || state.mode === "break") return state;
  return { ...state, chance: { kind, leftMs: spec.ms }, guardHoldMs: 0, pressOn: false };
}

/**
 * The stand after attack `attackId` raises the guard (`guard.every`, 2026-10-09): only every `every`-th — the guard is an occasional
 * stance, most stands are a real punish window. Deterministic by id (no randomness: the fight replays the same).
 */
export function kumaGuardStand(attackId: number, t: KumaTuning): boolean {
  const every = Math.floor(t.guard.every ?? 1);
  return every > 0 && Math.max(0, Math.floor(attackId)) % every === 0;
}

/**
 * 공격 사이 가드 자세: 가드를 올리는 선 시간(`kumaGuardStand`)의 `guard.raiseMs` 부터. A guard wake-up (`knockdown.wakeup`) has it up
 * from the first frame for `guardMs`.
 */
export function kumaCombatGuarding(state: KumaCombatState, t: KumaTuning): boolean {
  // His brace's window (`KumaTuning.skill` brace, 2026-10-22): the guard's rules take a blow in front.
  if (kumaSkillGuarding(state)) return true;
  // A person holding his guard (`KumaControl.guard`): up in his neutral, from the first frame.
  if (state.controlGuard === true && state.mode === "chase" && !state.chance) return true;
  // The bout AI's read (`boutAi.react`, 2026-10-23): up through the other's swing it read, standing in his neutral or his stand.
  if (state.aiGuard != null && (state.mode === "chase" || state.mode === "cooldown" || state.mode === "idle") && !state.chance) return true;
  // In a chance (`kuma.rhythm.chance`) his guard stays down.
  if (state.mode !== "cooldown" || state.chance) return false;
  if (state.wakeGuard) return state.modeMs < t.knockdown.wakeup.guardMs || (state.guardHoldMs ?? 0) > 0;
  return state.modeMs >= t.guard.raiseMs && kumaGuardStand(state.attackId, t);
}

/** How he rises from his `knockdowns`-th knockdown (`knockdown.wakeup.pattern`, alternating); null with an empty pattern. */
export function kumaWakeupKind(knockdowns: number, t: KumaTuning): NativeCityKumaWakeup | null {
  const pattern = t.knockdown.wakeup.pattern;
  return pattern.length === 0 ? null : pattern[(Math.max(1, Math.floor(knockdowns)) - 1) % pattern.length] ?? null;
}

/**
 * His counter window is open and it is a TELL (`feel.tells.opening`): a whiffed swing's recovery or stand, a parry recoil, the
 * dash's open stand — not the flinch a counter caused (that is the chain's own flinch, `counterChain`).
 */
export function kumaCombatOpening(state: KumaCombatState, tuning: NativeCityCombatTuning = NATIVE_CITY_COMBAT, t?: KumaTuning): boolean {
  // A counter string's launch that can be followed (`kuma.rhythm.launch`) is told as an opening too: the magenta rim on the flying body.
  if (state.mode === "hurt") return state.followOpen === true;
  // The grab's windup and the summon cast are told by their own red (no armour rim, the red glint and warning) — not the opening's magenta
  // rim and "빈틈!".
  return !kumaCombatCutWindup(state) && kumaCombatCounterOpen(state, tuning, t);
}


export function kumaGuardFaces(state: KumaCombatState, from: CityPoint, t: KumaTuning): boolean {
  return nativeCityMeleeInCone(state.point, state.direction, from, t.guard.coneHalfAngleDeg);
}

/**
 * 갑옷: 공격의 예비·휘두름(마지막 접촉 전). 맞아도 움찔하지 않고 균형이 바닥 아래로 내려가지 않는다. 붉은 잡기(`kuma.grab`)는 예외다 —
 * 그 예비에 들어간 한 방은 반격으로 잡기를 끊는다(`kumaCombatCounterOpen`).
 */
export function kumaCombatArmored(state: KumaCombatState, t: KumaTuning): boolean {
  // The first moments of a swing a jab can cut (`kumaCombatJabCutOpen`) show no iron: his rim flashes the opening's magenta there.
  return !kumaCombatJabCutOpen(state, t) && kumaCombatArmourOn(state, t);
}

/** His armour as the rule wears it, the jab's window included (a blow there that is not an answer to his tell still meets it). */
function kumaCombatArmourOn(state: KumaCombatState, t: KumaTuning): boolean {
  // A chance (`kuma.rhythm.chance`) leaves him bare; so does any swing but his super where the armour is the super's alone. His stance and
  // recoil skills are bare too (`kumaSkillBare`: their window is the defence, the hop has none).
  // The bout's super keeps its armour until its first contact went out (2026-10-23 arena audit: a stance super was cut by a plain slam right
  // after its cut-in) — a stance or recoil skill's super too.
  if (t.boutAi && state.mode === "attack" && kumaSuperSwing(state) && state.hitsFired === 0) return true;
  if (state.chance || kumaSkillBare(state)) return false;
  // (A launching skill — `NativeCityKumaAirChase` — wears it as his super does: the launch is not traded away on the step it lands.)
  const launching = kumaSkillLaunches(state, t) || state.mode === "dash" && kumaSkillLaunches({ special: state.dash?.special ?? null }, t);
  if (t.armorOnSuperOnly === true && !kumaSuperSwing(state) && !launching) return false;
  if (state.mode === "dash") return t.armorDuringAttack && (state.dash?.phase === "windup" || state.dash?.phase === "travel");
  // The red grab and the summon cast are bare: a blow into them cuts them (`kumaCombatCutWindup`) — a super grab wears the super's armour.
  return t.armorDuringAttack && state.mode === "attack" && (state.action !== "grab" || kumaSuperSwing(state)) && state.action !== "summon"
    && !kumaCombatRecovering(state);
}


function kumaJabCuts(state: KumaCombatState, options: KumaCombatHitOptions, t: KumaTuning): boolean {
  const ran = options.answerMs, free = options.freeBeforeMs;
  if (!kumaJabCutSwing(state, t) || ran === undefined || free === undefined) return false;
  const pressedAt = state.modeMs - ran;
  return kumaJabPressIn(pressedAt, t) && free >= pressedAt - JAB_SLACK_MS;
}


const JAB_SLACK_MS = 17;


export function kumaCombatGrabWindup(state: KumaCombatState): boolean {
  return state.mode === "attack" && state.action === "grab" && state.hitsFired === 0;
}

/**
 * A windup a blow cuts (2026-10-20): the red grab's before its catch (`kumaCombatGrabWindup`) and the summon cast's before its release
 * (`KumaTuning.summon`) — both unarmoured, a blow in either is a counter.
 */
export function kumaCombatCutWindup(state: KumaCombatState): boolean {
  return state.mode === "attack" && (state.action === "grab" && !kumaSuperSwing(state) || state.action === "summon") && state.hitsFired === 0;
}

/** 지금 들어간 한 방이 반격인가: 헛친 공격의 회복(+ 선 채 `cooldownMs`), 또는 반격이 낸 움찔 안. */
export function kumaCombatCounterOpen(state: KumaCombatState, tuning: NativeCityCombatTuning = NATIVE_CITY_COMBAT, t?: KumaTuning): boolean {
  if (state.mode === "hurt") return state.counterChain;
  // Recoiling from a parry: the punish is a counter. Standing open after a whiffed dash, too. In a chance (`kuma.rhythm.chance`) always.
  if (state.mode === "parried" || state.chance) return true;
  // The jab's cut (`kuma.rhythm.jabCut`): a blow in his swing's first moments cuts it.
  if (t && kumaCombatJabCutOpen(state, t)) return true;
  if (state.mode === "dash") return state.dash?.phase === "recover";
  // The red grab's windup and the summon cast's: a blow in either is a counter that cuts it (`kuma.grab`, `KumaTuning.summon`).
  if (kumaCombatCutWindup(state)) return true;
  const { afterWhiffOnly, cooldownMs } = tuning.exchange.counter;
  if (state.attackHits <= 0) return false;
  const last = state.attackHits - 1, whiffed = state.lastLandedHit < last;
  // Without afterWhiffOnly his recovery after a BLOCKED last contact opens too (the punish of a guarded slam) — never after one that
  const blocked = !afterWhiffOnly && !whiffed && state.lastHurtHit < last;
  if (state.mode === "attack") return kumaCombatRecovering(state) && (whiffed || blocked);
  return state.mode === "cooldown" && state.modeMs < cooldownMs && whiffed;
}


export function kumaStrikeLanded(state: KumaCombatState, attackId: number, hitIndex: number, blocked = false): KumaCombatState {
  if (state.attackId !== attackId || hitIndex <= state.lastLandedHit) return state;
  // A blow that hurt him (not a block — `blocked`) is remembered apart: it never opens the counter window (`kumaCombatCounterOpen`). The
  // blocked ones are counted too: enough of them and his next attack is the grab (`kuma.grab.turtleBlocks`).
  return { ...state, lastLandedHit: hitIndex, lastHurtHit: blocked ? state.lastHurtHit : hitIndex, kiteCount: 0,
    ...(blocked ? { blockedHits: (state.blockedHits ?? 0) + 1 } : {}) };
}

/** 안 맞은 채 `regenDelayMs` 가 지나면 균형이 `regenPerSec` 로 차오른다. */
export function regenKumaPoise(state: KumaCombatState, dtMs: number, p: NativeCityPoiseTuning = NATIVE_CITY_COMBAT.poise): KumaCombatState {
  const next = kumaPoiseAfter(state, dtMs, p);
  return next.poise === state.poise && next.poiseIdleMs === state.poiseIdleMs ? state : { ...state, poise: next.poise, poiseIdleMs: next.poiseIdleMs };
}

/** His poise and its idle clock after `dtMs` more of `regenKumaPoise` (the fight step builds his state with them, `stepKumaCombat`). */
export function kumaPoiseAfter(state: Pick<KumaCombatState, "poise" | "poiseIdleMs">, dtMs: number,
  p: NativeCityPoiseTuning = NATIVE_CITY_COMBAT.poise): { readonly poise: number; readonly poiseIdleMs: number } {
  const idle = state.poiseIdleMs + Math.max(0, dtMs);
  if (state.poise >= p.max) return { poise: state.poise, poiseIdleMs: idle };
  const over = Math.max(0, idle - Math.max(p.regenDelayMs, state.poiseIdleMs));
  return { poise: Math.min(p.max, state.poise + p.regenPerSec * over / 1000), poiseIdleMs: idle };
}

/**
 * `from`(때린 쪽 발)에서 온 피해. 쓰러지면 down, 균형이 0 이 되면 break, 공격 중 갑옷이면 그대로, 아니면 hurt.
 * 그 쪽(대각)을 본다. 균형·반격·갑옷 규칙은 위 머리말.
 */
export function kumaCombatHit(state: KumaCombatState, damage: number, from: CityPoint, projection: NativeCityDefinition["projection"],
  options: KumaCombatHitOptions, t: KumaTuning): KumaCombatHit {
  const none = { state, hit: false, defeated: false, staggered: false, damage: 0, armored: false, counter: false, broke: false, onBroken: false,
    chained: false, blocked: false, ender: false, knockdown: false };
  // An awakening's blow on him lying (`lying`): reaches him there whether or not the ground blow is open; anything else of his it passes.
  if (options.lying === true) return kumaCombatLying(state) && damage > 0 ? kumaGroundBlow(state, damage, t, 0) : none;
  if (!kumaCombatVulnerable(state) || !(damage > 0)) return none;
  const p = NATIVE_CITY_COMBAT.poise, rhythm = t.rhythm;
  if (state.air && kumaAirSpec(t)) return kumaAirBlow(state, damage, options, t, none);
  // The ground blow (`kuma.rhythm.down`): only V reaches the body on the ground, once — no flinch, no push, he lies on.
  if (state.mode === "down") return options.ground === true ? kumaGroundBlow(state, damage, t, options.groundCharge ?? 1) : none;
  const onBroken = state.mode === "break";
  // His counter's window (`KumaTuning.skill` counter): a blow of a body in front is met — no damage — and his counter runs at once.
  if (kumaSkillCounterCued(state, from, options, t)) return { ...none, hit: true, blocked: true, state: kumaSkillCounter(state) };
  const guarded = !options.pierce && kumaCombatGuarding(state, t) && kumaGuardFaces(state, from, t);
  if (guarded) {
    const g = t.guard, drain = Math.max(0, options.poise ?? 0) * g.poiseScale * (state.controlGuard === true ? g.held?.drainScale ?? 1 : 1);
    // A person's held guard (`KumaControl.guard`, 2026-10-22, `guard.held`) has no floor: blocking blow after blow empties his poise and
    // the guard breaks — the blow is still taken, but he stands broken (`break`, the blows on him ×`poise.break.damageScale`). The AI's
    // guard is an occasional stance and keeps its floor.
    if (state.controlGuard === true && drain > 0 && state.poise - drain <= 1e-9) {
      return { ...none, hit: true, blocked: true, broke: true, staggered: true, state: { ...state, poise: 0, poiseIdleMs: 0, mode: "break", modeMs: 0,
        action: null, movedPx: 0, controlGuard: false, counterChain: false, dash: null, restart: false, guardBlocks: 0, guardHoldMs: 0 } };
    }
    // (The held guard's drain takes no floor either: the break above catches it at zero.)
    const poise = state.controlGuard === true ? state.poise - drain : Math.max(Math.min(state.poise, g.poiseFloor), state.poise - drain);
    // The guard counter: `counterAfterBlocks` blocked in a row and he cuts the stand and attacks at once (`pressOn`).
    const guardBlocks = state.guardBlocks + (options.stringCount ?? 1), counters = g.counterAfterBlocks > 0 && guardBlocks >= g.counterAfterBlocks;
    // His brace's block opens its shove (`kumaSkillBraced`).
    return { ...none, hit: true, blocked: true, state: kumaSkillBraced({ ...state, poise, poiseIdleMs: 0, guardBlocks,
      guardHoldMs: g.holdAfterBlockMs, pressOn: state.pressOn || counters }) };
  }
  // The jab's cut (`kuma.rhythm.jabCut`): an answer in his swing's first moments is a counter that cuts it; anything else there meets his armour.
  const cut = !onBroken && kumaJabCuts(state, options, t);
  const armored = !onBroken && !cut && options.throughArmor !== true && kumaCombatArmourOn(state, t);
  const counter = !onBroken && !armored && (cut || kumaCombatCounterOpen(state, NATIVE_CITY_COMBAT));
  const armorDamage = rhythm?.armor.damageScale ?? p.armorDamageScale, armorPoise = rhythm?.armor.poiseScale ?? p.armorScale;
  // A chance (`kuma.rhythm.chance`): his body takes its kind's damage scale (the parry's is the larger).
  const chanceScale = state.chance && rhythm ? rhythm.chance[state.chance.kind].damageScale : 1;
  const applied = damage * (onBroken ? p.break.damageScale : armored ? armorDamage : 1) * (armored ? 1 : chanceScale);
  const hp = Math.max(0, state.hp - applied);
  const drain = Math.max(0, options.poise ?? 0) * (armored ? armorPoise : 1) * (counter ? p.counterScale : 1);
  const poise = armored ? Math.max(Math.min(state.poise, p.armorFloor), state.poise - drain) : state.poise - drain;
  const breaks = !onBroken && !armored && poise <= 1e-9 && drain > 0;
  // V's knockdown (`kuma.knockdown`): clean, not breaking him, on a chain flinch an EARLIER swing of the string made (not an ender's —
  // 2026-10-18: `stringHits`, so a move cannot set up its own knockdown) or as a counter — not the jab's cut of his windup
  // (`kuma.rhythm.jabCut`: V there only flinches him).
  const knocks = options.knockdown === true && hp > 0 && !onBroken && !armored && !breaks && !cut
    && (counter || state.mode === "hurt" && !state.retaliate && state.stringHits > 0);
  // A shift change (`kuma.phases`): whatever the blow, crossing a shift's line knocks him down (the KO stays the KO).
  const shiftNow = kumaShift(hp, t), shifted = hp > 0 && shiftNow > kumaShift(state.hp, t);
  const clip = hp <= 0 || knocks || shifted ? "fall" : "hit";
  const facing = options.axis ? nativeCityVictimFacing(options.axis, clip, options.artFacing)
    : kumaActionFacing(projection, [from[0] - state.point[0], from[1] - state.point[1]], clip, options.artFacing) ?? state.facing;
  const base = { hit: true, damage: state.hp - hp, armored, counter, onBroken, chained: counter && state.mode === "hurt", blocked: false,
    ender: false, knockdown: false };
  const clean = { stringHits: 0, retaliate: false, hurtMs: 0, reversal: false, wakeGuard: false, pressOn: false, guardBlocks: 0, guardHoldMs: 0,
    chance: null, followOpen: false };
  if (hp <= 0) {
    return { ...base, state: { ...state, hp, mode: "down", modeMs: 0, action: null, facing, movedPx: 0, counterChain: false, dash: null,
      restart: false, knockdown: false, groundOpen: false, ...clean }, defeated: true, staggered: true, broke: false };
  }
  if (shifted) {
    // Down for the shift change: his poise full again, he rises into the guard wake-up (`shiftRise`) — a breath, then the new shift.
    // Through his armour too: it is told as a knockdown, never as the armour eating it ("갑옷").
    return { ...base, armored: false, knockdown: true, shift: shiftNow, state: { ...state, hp, poise: p.max, poiseIdleMs: 0, mode: "down", modeMs: 0, action: null,
      facing, movedPx: 0, counterChain: false, dash: null, restart: false, knockdown: true, knockdowns: state.knockdowns, slamAfterDown: true,
      shiftRise: true, grab: null, groundOpen: false, ...clean }, defeated: false, staggered: true, broke: false };
  }
  // A broken body only takes the damage: the stagger runs its course (no restart, no poise).
  if (onBroken) return { ...base, state: { ...state, hp }, defeated: false, staggered: false, broke: false };
  if (armored) return { ...base, state: { ...state, hp, poise, poiseIdleMs: 0 }, defeated: false, staggered: false, broke: false };
  // A fighter's launching skill (2026-10-22, `NativeCityKumaAirChase`): the clean blow throws him up whatever the string — the bout's air.
  const airSpec = kumaAirSpec(t);
  if (options.airLaunch === true && options.forceLaunch === true && airSpec) {
    return { ...base, defeated: false, staggered: true, broke: false, ender: true, follow: true, air: "launch", state: { ...state, hp,
      poise: Math.max(0, poise), poiseIdleMs: 0, mode: "hurt", modeMs: 0, action: null, facing, movedPx: 0, counterChain: counter, dash: null,
      restart: false, reversal: false, wakeGuard: false, pressOn: false, guardBlocks: 0, guardHoldMs: 0, hurtMs: rhythm?.launch.followMs ?? 1000,
      stringHits: 0, retaliate: true, followOpen: true, chance: null, air: kumaAirLaunch(airSpec) } };
  }
  if (breaks) {
    return { ...base, state: { ...state, hp, poise: 0, poiseIdleMs: 0, mode: "break", modeMs: 0, action: null, facing, movedPx: 0,
      counterChain: false, dash: null, restart: false, ...clean }, defeated: false, staggered: true, broke: true };
  }
  if (knocks) {
    // The body on the ground takes one V (`kuma.rhythm.down`): `groundOpen` until it lands or he gets up.
    return { ...base, knockdown: true, state: { ...state, hp, poise: Math.max(0, poise), poiseIdleMs: 0, mode: "down", modeMs: 0, action: null,
      facing, movedPx: 0, counterChain: false, dash: null, restart: false, knockdown: true, knockdowns: state.knockdowns + 1, slamAfterDown: true,
      groundOpen: rhythm !== undefined, ...clean },
    defeated: false, staggered: true, broke: false };
  }
  const h = t.hurt, flinch = { ...base, defeated: false, staggered: true, broke: false };
  const common = { hp, poise: Math.max(0, poise), poiseIdleMs: 0, mode: "hurt" as const, modeMs: 0, action: null, facing, movedPx: 0,
    counterChain: counter, dash: null, restart: false, reversal: false, wakeGuard: false, pressOn: false, guardBlocks: 0, guardHoldMs: 0,
    followOpen: false };
  // re-snap — and spends one follow-up.
  const following = state.mode === "hurt" && state.retaliate && state.followOpen === true;
  const was: KumaCombatState = following ? { ...state, retaliate: false, stringHits: 0, followOpen: false, followUps: (state.followUps ?? 0) + 1 } : state;
  // A blow on a body already taking a string's ender re-snaps the recoil but never extends it: his turn comes on time.
  if (was.mode === "hurt" && was.retaliate) {
    const left = Math.max(0, (was.hurtMs > 0 ? was.hurtMs : h.enderMs) - was.modeMs);
    return { ...flinch, ender: true, state: { ...was, ...common, hurtMs: Math.max(1, left), stringHits: 0, retaliate: true } };
  }
  // The string: flinches in a row without leaving the flinch. The hook / V, or the stringCap-th one, ends it (no endless chain).
  const string = (was.mode === "hurt" ? was.stringHits : 0) + (options.stringCount ?? 1);
  const ends = options.ender === true || h.stringCap > 0 && string >= h.stringCap;
  if (ends) {
    // the ender is his turn. Either way the chance it ran in is spent with it.
    const follow = rhythm !== undefined && options.launches === true && counter && (was.followUps ?? 0) < rhythm.launch.maxFollowUps;
    if (follow) {
      const air = rhythm.launch.air && options.airLaunch === true ? kumaAirLaunch(rhythm.launch.air) : null;
      return { ...flinch, ender: true, follow: true, ...(air ? { air: "launch" as const } : {}), state: { ...was, ...common,
        hurtMs: rhythm.launch.followMs, stringHits: 0, retaliate: true, followOpen: true, ...(air ? { air } : {}) } };
    }
    return { ...flinch, ender: true, state: { ...was, ...common, hurtMs: h.enderMs, stringHits: 0, retaliate: true, chance: null } };
  }
  // A later contact of the same swing on the flinch it started (one flinch per move): the clock runs on, the end moves to this contact's.
  if (options.continues === true && was.mode === "hurt") {
    const hurtMs = (options.flinchMs ?? 0) > 0 ? was.modeMs + options.flinchMs! : was.hurtMs;
    return { ...flinch, continued: true, state: { ...was, ...common, modeMs: was.modeMs, facing: was.facing, counterChain: was.counterChain,
      hurtMs, stringHits: string, retaliate: false } };
  }
  return { ...flinch, state: { ...was, ...common, hurtMs: Math.max(0, options.flinchMs ?? 0), stringHits: string, retaliate: false } };
}


function kumaAirBlow(state: KumaCombatState, damage: number, options: KumaCombatHitOptions, t: KumaTuning, none: KumaCombatHit): KumaCombatHit {
  const air = state.air!, spec = kumaAirSpec(t)!, spike = options.air === "spike";
  if (options.air === undefined && options.throughArmor !== true && !air.bounced && !kumaAirLow(air, spec)) return none;
  // The juggle's hits (`maxHits`): past them the blows pass him — not the spike, his super, or a blow on the bounce (the finisher's).
  if (!spike && options.throughArmor !== true && !air.bounced && air.hits >= spec.maxHits) return none;
  const p = NATIVE_CITY_COMBAT.poise;
  const chanceScale = state.chance && t.rhythm ? t.rhythm.chance[state.chance.kind].damageScale : 1;
  const hp = Math.max(0, state.hp - damage * chanceScale);
  const poise = Math.max(0, state.poise - Math.max(0, options.poise ?? 0) * p.counterScale);
  const flight = spike ? kumaAirSpike(air, spec) : kumaAirJuggle(air, spec, options.airLift);
  const base = { hit: true, damage: state.hp - hp, armored: false, counter: true, onBroken: false, chained: true, blocked: false,
    ender: false, knockdown: false, broke: false, staggered: true, air: spike ? "spike" as const : "juggle" as const };
  if (hp <= 0) {
    return { ...base, defeated: true, state: { ...state, hp, poise, poiseIdleMs: 0, mode: "down", modeMs: 0, action: null, air: flight,
      dash: null, restart: false, knockdown: false, groundOpen: false, stringHits: 0, retaliate: false, hurtMs: 0, chance: null, followOpen: false } };
  }
  const shiftNow = kumaShift(hp, t), shifted = shiftNow > kumaShift(state.hp, t);
  return { ...base, defeated: false, ...(shifted ? { shift: shiftNow } : {}),
    state: { ...state, hp, poise, poiseIdleMs: 0, air: flight, modeMs: 0, counterChain: true, ...(shifted ? { shiftRise: true } : {}) } };
}

/**
 * V on the body on the ground (`kuma.rhythm.down`, 2026-10-18 "다운 - 강공"): × `groundDamageScale`, once; he lies on (his fall's clock runs on —
 * no flinch, no push). A ground blow that empties his HP is the KO from where he lies; one that crosses a shift's line rises into the shift's
 * guard wake-up.
 */
function kumaGroundBlow(state: KumaCombatState, damage: number, t: KumaTuning, charge: number): KumaCombatHit {
  // The heavy blow's scale grows with V's charge: a tap is a plain V on the body (2026-10-19 merge).
  const scale = 1 + (Math.max(0, t.rhythm?.down.groundDamageScale ?? 1) - 1) * Math.max(0, Math.min(1, charge));
  const hp = Math.max(0, state.hp - damage * scale);
  const shiftNow = kumaShift(hp, t), shifted = hp > 0 && shiftNow > kumaShift(state.hp, t);
  const base = { hit: true, damage: state.hp - hp, armored: false, counter: false, onBroken: false, chained: false, blocked: false, ender: false,
    knockdown: false, staggered: false, broke: false, ground: true };
  if (hp <= 0) {
    // The KO from where he lies: the fall's clock keeps its place (he is already down), the KO's lie runs from there.
    return { ...base, defeated: true, state: { ...state, hp, knockdown: false, groundOpen: false, chance: null, followOpen: false } };
  }
  return { ...base, defeated: false, ...(shifted ? { shift: shiftNow } : {}),
    state: { ...state, hp, poiseIdleMs: 0, groundOpen: false, ...(shifted ? { shiftRise: true, poise: NATIVE_CITY_COMBAT.poise.max } : {}) } };
}


export function kumaCombatParry(state: KumaCombatState, from: CityPoint, projection: NativeCityDefinition["projection"],
  options: KumaCombatParryOptions): { readonly state: KumaCombatState; readonly parried: boolean; readonly broke: boolean } {
  if (!kumaCombatVulnerable(state) || state.mode === "break") return { state, parried: false, broke: false };
  const facing = kumaActionFacing(projection, [from[0] - state.point[0], from[1] - state.point[1]], "hit", options.artFacing) ?? state.facing;
  const poise = options.groggy ? 0 : Math.max(0, state.poise - Math.max(0, options.poise));
  const cut = { ...state, action: null, facing, movedPx: 0, modeMs: 0, poiseIdleMs: 0, counterChain: false, kiteCount: 0, lunge: false,
    dash: null, restart: false, stringHits: 0, retaliate: false, hurtMs: 0, reversal: false, wakeGuard: false, pressOn: false, guardBlocks: 0, guardHoldMs: 0 };
  if (poise <= 1e-9) return { state: { ...cut, mode: "break", poise: 0 }, parried: true, broke: true };
  return { state: { ...cut, mode: "parried", poise }, parried: true, broke: false };
}
