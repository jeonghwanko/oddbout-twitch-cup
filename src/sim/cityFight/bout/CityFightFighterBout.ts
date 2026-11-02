import { createRng, nextInt } from "../../rng";
import { nativeCityFootprintRadius, type NativeCityFootprint, type NativeCityFootprintKind } from "../../NativeCityActorCollision";
import { cityFightStageSnap, type CityFightStageLine } from "../CityFightStageLine";
import type { KumaPatrolPlan } from "../NativeCityKumaPatrol";
import type { KumaBoutAiOverride, KumaBoutAiTuning, KumaCombatInput, KumaControl, KumaTuning } from "../NativeCityKumaCombatState";
import { createNativeCityKumaFighter, nativeCityKumaFightOps, nativeCityKumaFighterClash, nativeCityKumaFighterFollow, nativeCityKumaFighterKoRebound,
  nativeCityKumaFighterWallBounce, nativeCityKumaFighterFighting, nativeCityKumaFighterPoint, stepNativeCityKumaFighter,
  type NativeCityKumaArtBridge, type NativeCityKumaFighterEvent, type NativeCityKumaFighterState } from "../NativeCityKumaFighter";
import { NATIVE_CITY_MELEE_VICTIM, nativeCityMeleeConnects, resolveNativeCityMelee, resolveNativeCityProjectile, stepNativeCityMeleeVictim,
  type NativeCityMeleeVictim } from "../NativeCityMelee";
import { cityFightSummonAlong, cityFightSummonLiveByKind, cityFightSummonPoint, cityFightSummonStrike, cityFightSummonThreats,
  EMPTY_CITY_FIGHT_SUMMONS, settleCityFightSummonTouch, spawnCityFightSummon, stepCityFightSummonField, type CityFightSummon,
  type CityFightSummonField, type CityFightSummonOutcome } from "../CityFightSummons";
import { cityFightSummonSpec, type CityFightSummonKind } from "../CityFightSummonTuning";
import { NATIVE_CITY_COMBAT, type NativeCityKumaAirTuning, type NativeCityMeleeTier } from "../NativeCityCombatTuning";
import { kumaScreenFacing } from "../NativeCityKumaGeometry";
import { kumaCombatRecovering, kumaSuperSwing } from "../NativeCityKumaSwing";
import { cityFightBoutHoldEnds, cityFightBoutSeized, cityFightBoutSqueezed, type CityFightBoutHold } from "./CityFightBoutGrab";
import { addCityFightBoutTrace, cityFightBoutTraceUnder, stepCityFightBoutTraces, type CityFightBoutTrace, type CityFightBoutTraceTuning } from "./CityFightBoutTraces";
import { CITY_FIGHT_EXCHANGES, cityFightCrossStart, cityFightExchangeFist, cityFightExchangeFree, cityFightExchangeReleased, cityFightExchangeTaken, stepCityFightCross, withPose,
  type CityFightExchangeBlow, type CityFightExchangeKind, type CityFightExchangeRun, type CityFightExchangeSide,
  type CityFightExchangeStage } from "./CityFightBoutExchange";
import { cityFightPinballOwns, cityFightPinballStart, stepCityFightPinball } from "./CityFightBoutPinball";
import { cityFightRushOwns, cityFightRushStart, stepCityFightRush } from "./CityFightBoutRush";
import { kumaCombatLow, kumaSkillFleeing, kumaSkillKind, kumaSkillSpec } from "../NativeCityKumaSkill";
import { kumaAirChasing, kumaAirSpec } from "../NativeCityKumaAirChase";
import { kumaCombatLying } from "../NativeCityKumaHit";
import { cityFightAwakening, cityFightFollowUpBlow, cityFightFollowUpById, cityFightFollowUpHold, startCityFightFollowUp, stepCityFightFollowUp,
  type CityFightFollowUp, type CityFightFollowUpRun } from "../CityFightAwakening";
import type { CityPoint, NativeCityDefinition } from "../../../world/NativeCityDefinition";
import { nativeCityStepUnits } from "../../../world/NativeCityTalkSpot";


export interface CityFightBoutCorner {
  readonly id: string;
  readonly tuning: KumaTuning;
  readonly footprint: NativeCityFootprintKind;
  /** His art's beats (the render builds it from his pack, `nativeCityKumaArtBridge`); no swing timing → he never swings. */
  readonly art: NativeCityKumaArtBridge;

  readonly power?: number;
  /** His own temperament over the bout's AI (a registered fighter's style — `kumaBoutAiWith`). Absent: the bout's, as it was. */
  readonly ai?: KumaBoutAiOverride;
  /** His own set-piece weights (a registered fighter's style). Absent: his id's in `city-fight-exchanges.json`, else the defaults. */
  readonly exchangeWeights?: Readonly<Partial<Record<CityFightExchangeKind, number>>>;
}

/**
 * The bout's AI with corner `own` temperament over it (a new object — the bout's own is shared by both corners). Shares in [0, 1], guard and
 * backstep together at most 1, a stand [min ≤ max]; anything else is a wiring error (a style table's).
 */
export function kumaBoutAiWith(base: KumaBoutAiTuning, own: KumaBoutAiOverride): KumaBoutAiTuning {
  const share = (value: number | undefined, fallback: number, name: string) => {
    const x = value ?? fallback;
    if (!(x >= 0 && x <= 1)) throw new Error(`bout ai override: ${name} ${x}`);
    return x;
  };
  const react = { ...base.react, guardShare: share(own.guardShare, base.react.guardShare, "guardShare"),
    backstepShare: share(own.backstepShare, base.react.backstepShare, "backstepShare"), yieldShare: share(own.yieldShare, base.react.yieldShare, "yieldShare") };
  if (react.guardShare + react.backstepShare > 1) throw new Error("bout ai override: react shares add past 1");
  const standMs = own.standMs ?? base.standMs;
  if (!(standMs[0] >= 0 && standMs[0] <= standMs[1])) throw new Error("bout ai override: standMs");
  return { ...base, react, standMs,
    measure: { ...base.measure, share: share(own.measureShare, base.measure.share, "measureShare") },
    retreat: { ...base.retreat, share: share(own.retreatShare, base.retreat.share, "retreatShare") } };
}

export interface CityFightBoutArena {
  readonly projection: NativeCityDefinition["projection"];
  /** One stride in this projection (`nativeCityStepUnits` at the actor height). */
  readonly stepUnits: number;
  /** The stage both are held on; its ends are walls. */
  readonly line: CityFightStageLine;
}

export interface CityFightBoutRules {
  readonly dtMs: number;
  readonly limitMs: number;
  /** Gap between the two at the bell (strides, along the line). */
  readonly startStrides: number;

  readonly referenceHp: number;
  readonly damageScale: number;

  readonly poise: Readonly<Record<NativeCityMeleeTier, number>>;
  /** Longest seeded start delay of one corner (ms). */
  readonly startDelayMs: number;
  /**
   * The air a body thrown up flies on (2026-10-22, the air combo — `KumaTuning.boutAir`, `NativeCityKumaAirChase`): only a launching skill
   * throws a body up. Absent: nobody is launched (a registered duel).
   */
  readonly air?: NativeCityKumaAirTuning;
  /**
   * What a skill leaves on the arena (2026-10-22 4차, `CityFightBoutTraces` — the penguin's ice, the gopher's holes): only a skill whose row
   * says it leaves one (`skill.leaves`). Absent: no traces (a registered duel).
   */
  readonly traces?: CityFightBoutTraceTuning;
  /**
   * Two swings meeting (2026-10-22 5차 맞부딪힘 — 사용자: "맞부딪힘을 모든 공격에 적용"): a melee contact reaches the other while his own swing
   * reaches back — its contact on this same step, or its next one due within `windowMs` — and neither lands: both are cut into a recoil of
   * `recoilMs` plus a seeded `jitterMs` of his own, each meter gaining a guarded blow's share (the two recover apart — even recoils met again on the next swing, over and over),
   * shoved `pushStrides` apart (`CityFightBoutClash`). A super's swing, a grab, an air chase and a summon never clash: they go
   * through as ever. Absent: none.
   */
  readonly clash?: CityFightBoutClashTuning;
  /**
   * The wall bounce (2026-10-22 5차 — 추천 3번 "벽에 닿으면 튕겨 나와 한 대 더"): a body flung in a flinch that splats on the line's end springs
   * off it `strides` back toward the middle and up `liftBodies` (`nativeCityKumaFighterWallBounce`) — a launched body the other may chase
   * (`NativeCityKumaAirChase`) or strike low. Absent: the splat ends the flight (a registered duel before rules 20).
   */
  readonly wallBounce?: { readonly strides: number; readonly liftBodies: number };
  /**
   * The KO's rope rebound (2026-10-24 — 관전 감사: a third of the KOs came at the rope and the body lay down where it hit it): the KO flight
   * that splats on the line's end springs back `strides` toward the middle over what is left of the drawn fall, its lift up `liftBodies`
   * more (`nativeCityKumaFighterKoRebound`; not with under `minMs` of the fall left), as far as the way to the other body is clear less
   * `marginStrides`; under `minStrides` of way he only pops up `popBodies` where he hit the rope (the other right there). After the result:
   * the results are the same.
   * Absent: the splat ends the flight.
   */
  readonly koRebound?: { readonly strides: number; readonly liftBodies: number; readonly minMs: number; readonly minStrides: number;
    readonly marginStrides: number; readonly popBodies: number };
  /**
   * A string's push before its last contact (2026-10-22 5차, the competitive engine's stage 7 — "사람이 조종하는 연타는 첫 접촉의 밀림 때문에 선
   * 상대에게 뒤 접촉을 놓친다"): × this, and no HP-grown push, and the striker steps after the body as far as it went
   * (`nativeCityKumaFighterFollow`) — the string stays in reach and carries both across the ring; its last contact (and a launch) pushes as
   * ever. On a standing body a four-contact string landed one contact in four. Absent: every contact pushes whole, nobody follows.
   */
  readonly stringPushScale?: number;
  /**
   * The AI's rhythm (2026-10-23 arena audit — `KumaFighterOverrides.boutAi`): a measure before a swing, room after a string or a knockdown,
   * a read of the other's windup, the stand's step back after every swing, the super held while the other's plays. Absent: the chase as before.
   */
  readonly ai?: KumaBoutAiTuning;
  /**
   * A long string's later blows weigh less (2026-10-23 arena audit — a won race left the other a 2–3 s sandbag, one string took a third of
   * his HP): the `fromHit`-th and later blows on one body, each within `gapMs` of the last and none landed back, deal `scale` of their damage.
   */
  readonly proration?: { readonly fromHit: number; readonly scale: number; readonly gapMs: number };
  /**
   * The exchanges (2026-10-25 교전 패턴 — `CityFightBoutExchange`, `world/city-fight-exchanges.json`): the set pieces of both bodies this bout
   * may run (`kinds` — 교차 돌파 `cross`). Absent: none.
   */
  readonly exchanges?: { readonly kinds: readonly CityFightExchangeKind[] };
}

/** The clash's numbers (`city-tournament.json` bout.clash). */
export interface CityFightBoutClashTuning {
  readonly windowMs: number;
  readonly recoilMs: number;
  readonly jitterMs: number;
  readonly pushStrides: number;
}

/** A body sprang off the rope this step (`CityFightBoutRules.wallBounce`). Presentation only. */
export interface CityFightBoutBounce {
  readonly corner: 0 | 1;
  readonly point: CityPoint;
}

/** Two swings met this step (`CityFightBoutRules.clash`): where (between them) and the heavier of the two. Presentation only. */
export interface CityFightBoutClash {
  readonly point: CityPoint;
  readonly tier: NativeCityMeleeTier;
}

export interface CityFightBoutResult {
  /** The winner's corner (0: `a`, 1: `b`). */
  readonly winner: 0 | 1;
  readonly how: "ko" | "decision";
  /** Fight ms when it ended. */
  readonly ms: number;
  /** HP shares at the end (0..1). */
  readonly hp: readonly [number, number];
  /** Contacts that landed (blocked ones included). */
  readonly contacts: readonly [number, number];
  /** A short fingerprint of the bout's course (determinism checks). */
  readonly digest: string;
}

/**
 * The fixed arena (rule 2: "고정 경기장 사양"): a straight stage through `origin` along the camera's screen-horizontal (as the plaza's side-scroll
 * fights turn it), `halfStrides` each way, strides measured at `actorHeightPx`. No ground test: its ends are its only walls.
 */
export function cityFightBoutArena(projection: NativeCityDefinition["projection"], actorHeightPx: number, origin: CityPoint,
  halfStrides: number): CityFightBoutArena {
  const stepUnits = nativeCityStepUnits(projection, actorHeightPx);
  const along: CityPoint = [projection.y[1], -projection.x[1]], length = Math.hypot(along[0], along[1]) || 1;
  const half = halfStrides * stepUnits;
  return { projection, stepUnits, line: { origin: [origin[0], origin[1]], direction: [along[0] / length, along[1] / length], min: -half, max: half } };
}

/**
 * A corner's mark on the arena (2026-10-18 — the tournament arena scene stands its two fighters the same way): `apartUnits` between the two
 * marks, centred on the line's origin; `side` −1 the line's back end, 1 its front end. Snapped onto the line.
 */
export function cityFightBoutMark(arena: Pick<CityFightBoutArena, "line">, apartUnits: number, side: -1 | 1): CityPoint {
  const { line } = arena, half = apartUnits / 2, [ox, oy] = line.origin, [dx, dy] = line.direction;
  return cityFightStageSnap(line, [ox + dx * half * side, oy + dy * half * side]);
}

interface Corner {
  readonly spec: CityFightBoutCorner;
  readonly ops: ReturnType<typeof nativeCityKumaFightOps>;
  readonly plan: KumaPatrolPlan;
  readonly radius: number;
  state: NativeCityKumaFighterState;
  /** His contact memory as a target (invulnerability, one contact per swing). */
  victim: NativeCityMeleeVictim;
  delayMs: number;
  contacts: number;
  /** Held by the other corner's grab (`fighterGrab`): his step is frozen until the throw or the hold's end. */
  held: CityFightBoutHold | null;
  /** Where his slide last left ice (`CityFightBoutTraces`), else null (not sliding). */
  iceAt: CityPoint | null;
  /** His awakening's follow-up (`CityFightAwakening` — only with the bout's air); null: his super is its swing alone. */
  readonly awakening: CityFightFollowUp | null;
  /** His follow-up in flight on the other corner, else null: he stands until it is over. */
  followUp: CityFightFollowUpRun | null;
  /** Fight ms his super stays held after the other's super and its follow-up (`KumaBoutAiTuning.superLockTailMs`). */
  superLockMs: number;
  /** The string on him (`proration`): its blows so far and the last one's fight ms. */
  readonly taken: { n: number; atMs: number };
}

/** A person's command that does nothing: a corner whose awakening's follow-up is in flight stands (`KumaControl`). */
const STAND: KumaControl = Object.freeze({ walk: 0, guard: false, press: null });

/** The art bridge without the grab: the rotation never picks it (`kumaGrabDue` needs its timing). */
function withoutGrab(art: NativeCityKumaArtBridge): NativeCityKumaArtBridge {
  return { ...art, timing: (action, facing, windupScale, special) => action === "grab" ? null : art.timing(action, facing, windupScale, special) };
}

function fnv(hash: number, value: number): number {
  let h = hash ^ (value & 0xffff);
  h = Math.imul(h, 16777619) >>> 0;
  h ^= value >>> 16;
  return Math.imul(h, 16777619) >>> 0;
}

/**
 * A contact that landed on a corner in the last step (2026-10-20 — what a visible bout sounds and shakes for; the rules never read it): the
 * struck corner, its tier, guarded or not, and where (the striker's feet, or the summoned object's centre).
 */
export interface CityFightBoutHit {
  readonly target: 0 | 1;
  readonly tier: NativeCityMeleeTier;
  readonly blocked: boolean;
  readonly from: CityPoint;
  /** The summoned object that landed it (its kind); absent: a swing. */
  readonly summon?: CityFightSummonKind;
  /** A beat of the striker's awakening's follow-up (its index — `CityFightAwakening`, 2026-10-23). Presentation only. */
  readonly followUp?: number;
  /** The striker's super landed it (2026-10-21, the staged super): its big drawn strike. Presentation only. */
  readonly super?: true;
  /** The air combo (2026-10-22): it threw the struck up (`launch`), kept him up (`juggle`) or drove him down (`spike`). Presentation only. */
  readonly air?: "launch" | "juggle" | "spike";
  /** A beat of the striker's grab (2026-10-22, `fighterGrab`): the catch, a squeeze or the throw. Presentation only. */
  readonly grab?: "catch" | "squeeze" | "throw";
  /**
   * The stage's traces (2026-10-22 4차, `CityFightBoutTraces`): he slid on the other's ice (`slip` — pushed `ice.pushScale` × further) or
   * stepped into the other's hole (`trip` — no blow: his stumble, `from` is the hole). Presentation only.
   */
  readonly slip?: true;
  readonly trip?: true;
  /**
   * What the struck's own rules did with it (2026-10-22 — the screen used to guess from his view after the step): the HP it took and whether
   * his armour ate it. Presentation only: the hit counter counts a blow that took HP, the armour's blow clangs.
   */
  readonly damage: number;
  readonly armored?: true;
  /** An exchange set piece's blow (2026-10-25, `CityFightBoutExchange`): its kind, its pass and whether it was the last. Presentation only. */
  readonly exchange?: { readonly kind: CityFightExchangeKind; readonly pass: number; readonly final: boolean };
}

/** A corner spent his full meter on his super this step (`super`, 2026-10-20) — what a visible bout flashes. Presentation only. */
export interface CityFightBoutSuper {
  readonly corner: 0 | 1;
}

/**
 * A corner's flight splatted on the end of the arena's line this step (2026-10-20: a launch or the KO blow's flight, `knock-wall`) — what a
 * visible bout slams. Presentation only: it never enters the digest.
 */
export interface CityFightBoutWall {
  readonly corner: 0 | 1;
  readonly point: CityPoint;
  readonly direction: CityPoint;
  /** The flight that was left (strides). */
  readonly strides: number;
}

/** A body thrown up met the ground this step (2026-10-22, the air combo): the spike's bounce or the landing. Presentation only. */
export interface CityFightBoutAir {
  readonly corner: 0 | 1;
  readonly beat: "bounce" | "land";
  readonly point: CityPoint;
}

/** A person's command for each corner this tick (`KumaControl`); null: the AI. */
export type CityFightBoutControls = readonly [KumaControl | null, KumaControl | null];

export interface CityFightBoutSession {
  readonly snapshot: { readonly ms: number; readonly states: readonly [NativeCityKumaFighterState, NativeCityKumaFighterState];
    readonly contacts: readonly [number, number]; readonly result: CityFightBoutResult | null;
    /** The summoned objects out on the arena's line (`CityFightSummons`; empty without a summoner) — what a visible bout draws. */
    readonly summons: CityFightSummonField;
    /** The contacts that landed in the last step (`CityFightBoutHit`). */
    readonly hits: readonly CityFightBoutHit[];
    /** The flights that splatted on the line's end in the last step or settle tick (`CityFightBoutWall`). */
    readonly walls: readonly CityFightBoutWall[];
    /** The supers spent in the last step (`CityFightBoutSuper`). */
    readonly supers: readonly CityFightBoutSuper[];
    /** The bodies thrown up that met the ground in the last step (`CityFightBoutAir`). */
    readonly airs: readonly CityFightBoutAir[];
    /** Each corner held by the other's grab (`CityFightBoutHold`, `fighterGrab`), else null — what a visible bout draws at the hold. */
    readonly held: readonly [CityFightBoutHold | null, CityFightBoutHold | null];
    /** The traces lying on the arena (`CityFightBoutTraces`; empty without a skill that leaves one) — what a visible bout draws. */
    readonly traces: readonly CityFightBoutTrace[];
    /** The swings that met in the last step (`CityFightBoutClash`). */
    readonly clashes: readonly CityFightBoutClash[];
    /** Each corner's awakening follow-up in flight on the other (`CityFightAwakening`), else null — what a visible bout stages round. */
    readonly followUps: readonly [CityFightFollowUpRun | null, CityFightFollowUpRun | null];
    /** The bodies that sprang off the rope in the last step (`CityFightBoutBounce`). */
    readonly bounces: readonly CityFightBoutBounce[];
    /** The exchange set piece in flight (`CityFightBoutExchange`), else null — what a visible bout frames round. */
    readonly exchange: CityFightExchangeRun | null };
  /**
   * One fixed simulation tick. Calling after the result cannot replay a contact or change the result. `controls` (2026-10-22, the competitive
   * engine): a person's command for a corner this tick (`KumaControl`); null / absent: that corner's AI. The same corners, arena, rules, seed
   * and controls replay the same bout.
   */
  step(controls?: CityFightBoutControls): CityFightBoutResult | null;
  /**
   * One tick of the bodies after the result (2026-10-20, a visible bout only): the knocked-out corner plays out his fall and lies, the other
   * walks back to his mark. No contact, no summon; the result does not change. Before the result: nothing.
   */
  settle(): void;
}

/** Shared incremental engine: the visible registered duel and headless weekly matches consume the same steps. */

export function cityFightBoutTuning(tuning: KumaTuning, air?: NativeCityKumaAirTuning, ai?: KumaBoutAiTuning): KumaTuning {
  return { ...tuning, rhythm: undefined, armorOnSuperOnly: true, heavyOnOpening: true, ...(air ? { boutAir: air } : {}), ...(ai ? boutAiTuning(tuning, ai) : {}) };
}

/** The bout AI's stand (`KumaBoutAiTuning.standMs`, `standBack`) over his own: a longer stand, a longer step back, after every swing. */
function boutAiTuning(tuning: KumaTuning, ai: KumaBoutAiTuning): Partial<KumaTuning> {
  const [min, max] = tuning.cooldownMs ?? NATIVE_CITY_COMBAT.tempo.kuma.cooldownMs, base = tuning.spacing ?? NATIVE_CITY_COMBAT.kuma.spacing;
  const rates = tuning.attack.windupRates?.length ? tuning.attack.windupRates : [1];
  return { boutAi: ai, cooldownMs: [min + ai.standMs[0], max + ai.standMs[1]] as const,
    // His windups faster (`windupSpeed`, 2026-10-23 2차 — a 0.5 s held windup read as two statues): the answer's floor divides by it too.
    attack: { ...tuning.attack, windupRates: rates.map(rate => rate * ai.windupSpeed) },
    ...(base ? { spacing: { ...base, backStrides: ai.standBack.backStrides, withinMs: ai.standBack.withinMs, maxGapStrides: ai.standBack.maxGapStrides } } : {}) };
}

/** A hole catches a body whose footprint reaches this share of its radius past the hole's edge (`CityFightBoutTraces`, the trip). */
const TRIP_FOOT_SHARE = 0.6;

/** How long a launching contact keeps the body from being struck again (fight ms): shorter than the air chase's first contact. */
const AIR_LAUNCH_INVULNERABLE_MS = 100;

/**
 * The matrix's read of a high shot (2026-10-25, 이토 — `KumaCombatInput.highShotComing`): the other's aim seen this far into his windup (fight
 * ms — a reaction, not a premonition), or a high object of his due within `HIGH_SHOT_DUE_MS`.
 */
const HIGH_SHOT_READ_FROM_MS = 60;
const HIGH_SHOT_READ_TO_MS = 360;
const HIGH_SHOT_DUE_MS = 420;

/** `fighter` thrown up into the air (`KumaCombatInput.opponentAir`): his height, whether the spike drove him down, his air hits; else null. */
function cityFightBoutAir(fighter: NativeCityKumaFighterState): KumaCombatInput["opponentAir"] {
  const air = fighter.combat.air;
  return air && fighter.combat.hp > 0 ? { heightBodies: air.heightBodies, spiked: air.spiked, hits: air.hits } : null;
}

/**
 * `fighter` cannot strike first now (`KumaCombatInput.opponentOpen`): reeling, staggered, down, parried, in his swing's recovery or the
 * stand after it, or pulling out of a swing.
 */
function cityFightBoutOpen(fighter: NativeCityKumaFighterState): boolean {
  const mode = fighter.combat.mode;
  return mode === "hurt" || mode === "break" || mode === "down" || mode === "parried" || mode === "cooldown" || mode === "abort"
    || kumaCombatRecovering(fighter.combat);
}

export function createCityFightFighterBout(a: CityFightBoutCorner, b: CityFightBoutCorner, arena: CityFightBoutArena,
  rules: CityFightBoutRules, seed: number): CityFightBoutSession {
  if (a.id === b.id || !Number.isFinite(rules.dtMs) || rules.dtMs <= 0 || !Number.isFinite(rules.limitMs) || rules.limitMs <= 0)
    throw new Error("invalid-fighter-bout");
  const { projection, stepUnits, line } = arena, snap = (point: CityPoint) => cityFightStageSnap(line, point);
  let rng = createRng(seed >>> 0);
  const corner = (given: CityFightBoutCorner, side: -1 | 1): Corner => {
    // Rule 7: a seeded place in his attack rotation, so the same pair does not replay one bout every week.
    const offset = nextInt(rng, 0, 8); rng = offset.state;
    // His own seeded pick of windup rates (2026-10-22 5차, `windupSalt`): two corners read the same rate off the same swing count, so even
    // swings landed on one step, over and over — a trade, and with the clash an endless bounce.
    const salt = nextInt(rng, 0, 0x10000); rng = salt.state;
    // (The meter and the super — `super`, 2026-10-20 — and the HP-grown push are the bout's too since engine v2.)
    // His own temperament (a registered fighter's style) over the bout's AI; without one the bout's own object, as before.
    const ai = rules.ai && given.ai ? kumaBoutAiWith(rules.ai, given.ai) : rules.ai;
    const spec: CityFightBoutCorner = { ...given, tuning: { ...cityFightBoutTuning(given.tuning, rules.air, ai), windupSalt: salt.value } };
    const at = cityFightBoutMark(arena, rules.startStrides * stepUnits, side);
    const plan: KumaPatrolPlan = { viewId: "V1", bodyScale: 1, alertStrides: 1e6, releaseStrides: 1e6, points: [{ at, pauseMs: 1e9 }] };
    // A fighter whose row opens the grab (`fighterGrab`) keeps its timing; for everyone else the bout is as it was.
    const art = spec.tuning.fighterGrab === true ? spec.art : withoutGrab(spec.art);
    let state = createNativeCityKumaFighter(plan, spec.tuning.hp);
    // The seeded late starter still faces the opponent while frozen; side-only packs have no town-facing gait.
    const facing = kumaScreenFacing(projection, [-side * line.direction[0], -side * line.direction[1]]) ?? (side < 0 ? "right" : "left");
    state = { ...state, patrol: { ...state.patrol, facing }, combat: { ...state.combat, facing, attacks: offset.value } };
    return { spec: { ...spec, art }, ops: nativeCityKumaFightOps(art, spec.tuning), plan, radius: nativeCityFootprintRadius(spec.footprint, stepUnits),
      state, victim: NATIVE_CITY_MELEE_VICTIM, delayMs: 0, contacts: 0, held: null, iceAt: null,
      awakening: rules.air ? cityFightAwakening(given.id)?.followUp ?? null : null, followUp: null, superLockMs: 0, taken: { n: 0, atMs: -1e9 } };
  };
  const corners: [Corner, Corner] = [corner(a, -1), corner(b, 1)];
  const delay = nextInt(rng, 0, Math.max(1, Math.floor(rules.startDelayMs) + 1)); rng = delay.state;
  const late = nextInt(rng, 0, 2); rng = late.state;
  corners[late.value]!.delayMs = delay.value;

  let ms = 0, settleMs = 0, digest = 2166136261, summons: CityFightSummonField = EMPTY_CITY_FIGHT_SUMMONS;
  let traces: readonly CityFightBoutTrace[] = [], traceId = 0;
  let hits: CityFightBoutHit[] = [], walls: CityFightBoutWall[] = [], supers: CityFightBoutSuper[] = [], airs: CityFightBoutAir[] = [];
  let clashes: CityFightBoutClash[] = [], bounces: CityFightBoutBounce[] = [];
  /** The exchange set piece in flight (`rules.exchanges`), how many this bout has run and when the last ended (fight ms). */
  let exchange: CityFightExchangeRun | null = null, exchangeSeq = 0, exchangeEndMs = -1e9;
  /** This step's clean heavy blow that may start a pinball (`CityFightBoutPinball`): its striker, his move and the way it threw the other. */
  let pinballBlow: { readonly striker: Corner; readonly action: "combo" | "slam"; readonly hitIndex: number; readonly push: CityPoint } | null = null;
  /** The last pair of swings begun together a rush was picked for (their ids — one pick a pair), else −1. */
  let rushPair = -1;
  /** A person steers a corner this step (`step`'s controls): no set piece starts — it would take his body from his hands (2026-10-26). */
  let steered = false;
  /** This step's string follows (`stringPushScale`), applied once both corners' blows are in. */
  let follows: { readonly corner: Corner; readonly toward: CityPoint; readonly units: number }[] = [];
  const point = (c: Corner) => nativeCityKumaFighterPoint(c.state);
  /** Plan units behind `at` (away from `other`) to the end of the line (the vault's corner — `KumaCombatInput.backRoomUnits`). */
  const backRoom = (at: CityPoint, other: CityPoint) => {
    const along = (p: CityPoint) => (p[0] - line.origin[0]) * line.direction[0] + (p[1] - line.origin[1]) * line.direction[1];
    const me = along(at), them = along(other);
    return me >= them ? line.max - me : me - line.min;
  };
  const hpShare = (c: Corner) => Math.max(0, c.state.combat.hp) / Math.max(1e-9, c.spec.tuning.hp);
  const cornerOf = (c: Corner): 0 | 1 => corners[0] === c ? 0 : 1;

  const boutDamage = (damage: number, attacker: Corner, target: Corner) =>
    damage * (attacker.spec.power ?? 1) * target.spec.tuning.hp / Math.max(1e-9, rules.referenceHp) * rules.damageScale;
  /**
   * A high shot is coming at `self` (`KumaCombatInput.highShotComing`, his matrix's read — 2026-10-25): `other`'s high swing (`highActions`) or
   * his cast of a high object, seen early in its windup (`seen`: as he stood when the step began), or a high object of his due soon.
   */
  const highShotAt = (self: Corner, other: Corner, seen: NativeCityKumaFighterState): boolean => {
    const c = seen.combat, t = other.spec.tuning;
    if (c.mode === "attack" && c.hitsFired === 0 && c.modeMs >= HIGH_SHOT_READ_FROM_MS && c.modeMs <= HIGH_SHOT_READ_TO_MS && c.action) {
      if (t.highActions?.includes(c.action) === true) return true;
      const slot = c.action === "summon" ? t.summons?.[c.summonSlot ?? 0] : undefined;
      if (slot && cityFightSummonSpec(slot.kind).high === true) return true;
    }
    const at = { id: self.spec.id, along: cityFightSummonAlong(line, point(self)), radius: self.radius };
    return cityFightSummonThreats(summons, stepUnits, at).some(threat => threat.untilMs <= HIGH_SHOT_DUE_MS
      && cityFightSummonSpec(threat.kind).high === true);
  };
  /**
   * `self`'s rules step; `epilogue`: after the result (`hostile` false: he walks back to his mark — never casts, never swings). `seen`: the
   * other as he stood when the step began (2026-10-22 5차: both corners read each other's start of the step — the second used to read the
   * first's new place, crossing his swing's start distance a step early and winning every even trade).
   */
  const step = (self: Corner, other: Corner, epilogue: { readonly hostile: boolean } | null = null, control: KumaControl | null = null,
    seen: NativeCityKumaFighterState = other.state): readonly NativeCityKumaFighterEvent[] => {
    const otherAt = nativeCityKumaFighterPoint(seen);
    // Held by the other's grab: frozen in his flinch until he is let go (`CityFightBoutGrab`).
    const frozen = epilogue === null && (self.delayMs > 0 || self.held !== null);
    if (epilogue === null && self.delayMs > 0) self.delayMs = Math.max(0, self.delayMs - rules.dtMs);
    const blockers: NativeCityFootprint[] = [{ id: other.spec.id, point: otherAt, radius: other.radius }];
    // A summoner may cast on the arena's line (`KumaTuning.summons`): how many of his are out.
    const slots = epilogue ? [] : self.spec.tuning.summons ?? [];
    // The AI's reads (`rules.ai`, 2026-10-23): the other's swing, his body down, and his super holding this one's.
    // A man running away in his strategic retreat (이토, `kumaSkillFleeing`) is no swing to wait out: he is chased into the trip.
    const seenCombat = seen.combat, swinging = (seenCombat.mode === "attack" || seenCombat.mode === "dash") && !kumaSkillFleeing(seenCombat);
    if (rules.ai && epilogue === null) {
      self.superLockMs = other.followUp !== null || swinging && kumaSuperSwing(seenCombat) ? rules.ai.superLockTailMs
        : Math.max(0, self.superLockMs - rules.dtMs);
    }
    // Every key every step, the ones that do not apply `undefined` (2026-10-30): one input shape (as `createKumaCombat`).
    const ai = rules.ai !== undefined;
    const result = stepNativeCityKumaFighter(self.state, { plan: self.plan, tuning: self.spec.tuning, dtMs: rules.dtMs, frozen,
      hostile: epilogue?.hostile ?? true, player: otherAt, playerRadius: other.radius, playerSteered: false,
      opponentOpen: cityFightBoutOpen(seen), opponentAir: cityFightBoutAir(seen),
      opponentSwing: !ai ? undefined
        : swinging ? { attackId: seenCombat.attackId, ms: seenCombat.modeMs, contacted: seenCombat.hitsFired > 0 } : null,
      opponentDown: ai ? seenCombat.mode === "down" || seenCombat.mode === "getup" : undefined, superLocked: ai ? self.superLockMs > 0 : undefined,
      backRoomUnits: ai ? backRoom(point(self), otherAt) : undefined, beyondRoomUnits: ai ? backRoom(otherAt, point(self)) : undefined,
      highShotComing: ai && kumaSkillSpec(self.spec.tuning, "matrix") ? highShotAt(self, other, seen) : undefined,
      blockers, line: snap, projection, stepUnits, footprintRadius: self.radius, art: self.spec.art,
      // His follow-up in flight: he stands (no swing of the AI's, no press of a person's) until it is over.
      control: !epilogue && self.followUp !== null ? STAND : control && !epilogue ? control : undefined,
      summons: slots.length > 0 ? { live: cityFightSummonLiveByKind(summons, self.spec.id, slots.map(slot => slot.kind)) } : undefined });
    self.state = result.state;
    self.victim = stepNativeCityMeleeVictim(self.victim, rules.dtMs);
    for (const event of result.events) {
      if (event.kind === "knock-wall") {
        walls.push({ corner: corners[0] === self ? 0 : 1, point: event.point, direction: event.direction, strides: event.strides });
        // The wall bounce (2026-10-22 5차, `CityFightBoutRules.wallBounce`): a flinch's flight springs off the rope back up into the air.
        if (rules.wallBounce && epilogue === null) {
          const before = self.state;
          self.state = nativeCityKumaFighterWallBounce(self.state, event, rules.wallBounce, kumaAirSpec(self.spec.tuning));
          if (self.state !== before) bounces.push({ corner: corners[0] === self ? 0 : 1, point: event.point });
        }
        // The KO's rope rebound (`koRebound`): the fallen corner's flight springs back off the rope after the result — as far as the way to the
        // other body is clear, none under `minStrides` (a body right there sent him straight up over the winner's head).
        if (rules.koRebound && epilogue !== null) {
          const before = self.state, at = point(self), there = point(other);
          const clear = ((there[0] - at[0]) * -event.direction[0] + (there[1] - at[1]) * -event.direction[1] - self.radius - other.radius) / stepUnits;
          // The fallen body lies longer than its footprint: `marginStrides` kept short of the other's feet (it landed across them).
          const strides = Math.min(rules.koRebound.strides, clear - rules.koRebound.marginStrides);
          // Its fall lands when the KO flight did (`stepNativeCityKumaFighter` — the drawn fall's impact, else the finale's launch).
          // Too short a way (the other right there): the rope's give pops him up where he hit it instead (`popBodies`).
          const spring = strides >= rules.koRebound.minStrides ? { ...rules.koRebound, strides }
            : { ...rules.koRebound, strides: 0, liftBodies: rules.koRebound.popBodies };
          self.state = nativeCityKumaFighterKoRebound(self.state, event, spring,
            self.ops.koImpactMs(self.state) ?? NATIVE_CITY_COMBAT.exchangeFx.ko.launchMs, self.spec.tuning.downSlide);
          if (self.state !== before) bounces.push({ corner: corners[0] === self ? 0 : 1, point: event.point });
        }
      }
      else if (event.kind === "super") supers.push({ corner: corners[0] === self ? 0 : 1 });
      else if (event.kind === "air") airs.push({ corner: corners[0] === self ? 0 : 1, beat: event.beat, point: event.point });
    }
    return result.events;
  };
  /** `attacker`'s contact on `target`: the melee judgement, then the target's own rules take it, the swing's clock back to the contact. */
  const strike = (attacker: Corner, target: Corner, event: Extract<NativeCityKumaFighterEvent, { kind: "strike" }>, airborne = false) => {
    // A held body strikes nothing, nor is struck (the grabber's alone). A body up in the air when the step began (`airborne`, the air combo)
    // strikes nothing either. (2026-10-22 5차: read off the step's start — a launch answered first used to cut the other corner's contact.)
    if (attacker.held !== null || target.held !== null || airborne) return;
    // Not a super: it goes through every guard and stance (2026-10-23 rules 31), the lean too.
    if (event.super !== true && attacker.spec.tuning.highActions?.includes(event.action) === true && kumaCombatLow(target.state.combat)) return;
    const spec = attacker.spec.tuning.strikes[event.action];
    const result = resolveNativeCityMelee({ attackerId: attacker.spec.id, attackId: event.attackId, hitIndex: event.hitIndex,
      origin: point(attacker), direction: event.direction, radius: attacker.radius, damage: event.damage, tier: event.tier },
    { id: target.spec.id, point: point(target), radius: target.radius }, target.victim,
    // A launch leaves him open to the air chase at once (the slam's long invulnerability would turn its juggle away); so does a run of the
    // super slide before its last (the next run's contact, `superSkill.passes`).
    { stepUnits, invulnerableMs: event.air === "launch" || event.pass === true ? Math.min(spec.invulnerableMs, AIR_LAUNCH_INVULNERABLE_MS) : spec.invulnerableMs,
      reachExtraStrides: attacker.ops.reachExtraStrides(attacker.state, event.action) });
    target.victim = result.victim;
    if (!result.hit || !target.ops.vulnerable(target.state)) return;
    // The super's later contacts while its follow-up runs pass: the follow-up has him (`CityFightFollowUp.opensOnFirst`).
    if (event.super === true && attacker.followUp !== null) return;
    if (event.action === "grab") { caught(attacker, target, event, result.push); return; }
    // The string's proration (`rules.proration`): his count runs on, the striker's (a blow landed back) ends.
    let prorated = 1;
    if (rules.proration) {
      const run = target.taken;
      run.n = ms - run.atMs > rules.proration.gapMs ? 1 : run.n + 1;
      run.atMs = ms;
      attacker.taken.n = 0;
      if (run.n >= rules.proration.fromHit) prorated = rules.proration.scale;
    }
    // The bout's super weighs more (`ai.superDamageScale`, 2026-10-23 audit: a super and its follow-up took 11 % of his HP — less than a
    // launch string's 21 %); its follow-up splits that damage, so the whole awakening grows with it.
    const damage = boutDamage(event.damage, attacker, target) * prorated * (event.super === true && rules.ai ? rules.ai.superDamageScale : 1);
    const axis = event.facing ?? kumaScreenFacing(projection, event.direction) ?? "left";
    // The air combo (`NativeCityKumaAirChase`): a launching skill throws him up (pushed only the air's `pushStrides`), the chase's contacts
    // reach him up there and the last drives him down.
    const air = target.spec.tuning.boutAir, launching = event.air === "launch" && air !== undefined;
    const airString = launching ? { airLaunch: true, forceLaunch: true } : event.air === "hit" || event.air === "spike" ? { air: event.air } : {};
    // On the other's ice (`CityFightBoutTraces`) a ground blow slides him further.
    const slip = rules.traces && !target.state.combat.air ? cityFightBoutTraceUnder(traces, point(target), "ice", cornerOf(target)) : null;
    // A string's contact before its last keeps the body in reach (`stringPushScale`): a small push, no HP growth.
    const mid = rules.stringPushScale !== undefined && !launching && event.air === undefined && event.hitIndex < attacker.state.combat.attackHits - 1;
    const pushScale = (slip && rules.traces ? rules.traces.ice.pushScale : 1) * (mid ? rules.stringPushScale : 1);
    // His awakening's follow-up (`CityFightAwakening`): his super's last contact on a body the air can throw up takes its share and only holds
    // him where he stands (no launch, no flight) — the scripted blows follow (`followUpsStep`).
    // Not a run of a super slide before its last (`event.pass` — the next run's contact follows); its first contact for one that opens there.
    // Not on a body running his own follow-up (the two supers landed on one step — 2026-10-23 audit: two awakenings played over each other).
    const follow = event.super === true && attacker.awakening !== null && air !== undefined && attacker.followUp === null && target.followUp === null
      && event.pass !== true
      && (attacker.awakening.opensOnFirst || event.hitIndex >= attacker.state.combat.attackHits - 1) ? attacker.awakening : null;
    const hold = follow ? cityFightFollowUpHold(follow) : null;
    const taken = target.ops.receiveHit(target.state, { damage: damage * (hold?.share ?? 1), from: point(attacker), push: result.push, tier: event.tier,
      // A super goes through a guard (2026-10-23, 사용자: "막힌 필살기는 막을 수 없게 함" — the village's rule too).
      poise: rules.poise[event.tier], pierce: event.super === true, axis,
      string: hold ? hold.string : { flinchMs: 0, ender: event.tier === "heavy" || launching, knockdown: false, ...airString },
      ...(hold ? {} : launching ? { launch: { strides: air.pushStrides, curve: true, guardShare: 0 } } : mid ? {} : { hpKnock: true }),
      ...(pushScale !== 1 ? { pushScale } : {}) });
    target.state = taken.kuma;
    if (!taken.hit.hit) return;
    // The comeback's meter (`ai.meterTakenBonus`): a blow taken fills it a little more than the village's `super.gainTaken`.
    if (rules.ai && !taken.hit.blocked && taken.hit.damage > 0 && target.spec.tuning.superOff !== true && target.state.combat.hp > 0) {
      const combat = target.state.combat;
      target.state = { ...target.state, combat: { ...combat, meter: Math.min(NATIVE_CITY_COMBAT.super.max, (combat.meter ?? 0) + rules.ai.meterTakenBonus) } };
    }
    if (follow && !taken.hit.blocked && !taken.hit.defeated) attacker.followUp = startCityFightFollowUp(follow, damage);
    attacker.contacts += 1;
    hits.push({ target: corners[0] === target ? 0 : 1, tier: event.tier, blocked: taken.hit.blocked, from: point(attacker),
      damage: taken.hit.damage, ...(taken.hit.armored ? { armored: true as const } : {}), ...(event.super === true ? { super: true as const } : {}),
      ...(taken.hit.air ? { air: taken.hit.air } : {}), ...(slip && !taken.hit.blocked ? { slip: true as const } : {}) });
    attacker.state = attacker.ops.strikeLanded(attacker.state, { attackId: event.attackId, hitIndex: event.hitIndex, push: result.push,
      pushbackPx: 0, freezeMs: 0, followTier: null, blocked: taken.hit.blocked });
    // He steps after the body his string's contact pushed (`stringPushScale`): the gap holds, the next contact reaches. Applied after both
    // corners' blows (`follows`), and not to a striker struck on the same step — his push stands (2026-10-23: answered in corner order, a
    // trade left corner 0's follow overwritten by the other's push and corner 1's push by his own follow).
    if (mid && !taken.hit.blocked) follows.push({ corner: attacker, toward: result.push, units: taken.knockbackUnits });
    // A clean heavy blow of his rotation (not a super, a skill's, an air hit or one his armour ate) may start a pinball (`exchangeTrigger`).
    if (event.tier === "heavy" && !taken.hit.blocked && !taken.hit.defeated && !taken.hit.armored && event.super !== true && event.air === undefined
      && !follow && (event.action === "combo" || event.action === "slam" || event.action === "fast")) {
      pinballBlow = { striker: attacker, action: event.action === "slam" ? "slam" : "combo", hitIndex: event.hitIndex, push: result.push };
    }
  };

  const caught = (attacker: Corner, target: Corner, event: Extract<NativeCityKumaFighterEvent, { kind: "strike" }>, push: CityPoint) => {
    // A body down is not caught; a grabber whose swing the other's blow cut on this same step catches nothing (the blow was answered first).
    const swing = attacker.state.combat;
    if (target.state.combat.mode === "down" || swing.mode !== "attack" || swing.action !== "grab" || swing.attackId !== event.attackId) return;
    const toward = kumaScreenFacing(projection, [point(attacker)[0] - point(target)[0], point(attacker)[1] - point(target)[1]]);
    target.state = cityFightBoutSeized(target.state, toward ?? target.state.combat.facing);
    target.held = { by: cornerOf(attacker), attackId: event.attackId, ms: 0 };
    attacker.contacts += 1;
    hits.push({ target: cornerOf(target), tier: event.tier, blocked: false, from: point(attacker), damage: 0, grab: "catch",
      ...(event.super === true ? { super: true as const } : {}) });
    const landed = attacker.ops.strikeLanded(attacker.state, { attackId: event.attackId, hitIndex: event.hitIndex, push, pushbackPx: 0,
      freezeMs: 0, followTier: null, blocked: false });
    attacker.state = attacker.ops.grabCaught?.(landed) ?? landed;
  };
  /**
   * A beat of `self`'s hold on `other` (his `grab` event): a squeeze takes its small damage (HP 0 waits for the throw); the throw lets go of
   * him into a knockdown launch along the grab's axis (`kuma.grab.throwStrides` on the launch curve) taken by his own rules — or the KO.
   */
  const grabBeat = (self: Corner, other: Corner, event: Extract<NativeCityKumaFighterEvent, { kind: "grab" }>) => {
    const hold = other.held;
    if (!hold || hold.by !== cornerOf(self) || hold.attackId !== event.attackId) return;
    const damage = boutDamage(event.damage, self, other);
    if (event.beat === "squeeze") {
      const [squeezed, taken] = cityFightBoutSqueezed(other.state, damage);
      other.state = squeezed;
      hits.push({ target: cornerOf(other), tier: "light", blocked: false, from: point(self), damage: taken, grab: "squeeze" });
      return;
    }
    other.held = null;
    const axis = event.facing ?? kumaScreenFacing(projection, event.direction) ?? "left";
    const length = Math.hypot(event.direction[0], event.direction[1]) || 1;
    const push: CityPoint = [event.direction[0] / length, event.direction[1] / length];
    // His super grab's throw flies further (2026-10-22 4차, `superGrabThrowStrides` — into the rope).
    const strides = event.super === true ? self.spec.tuning.superGrabThrowStrides ?? self.spec.tuning.grab.throwStrides : self.spec.tuning.grab.throwStrides;
    // stands instead of flying him off; the scripted blows follow (`followUpsStep`), as a strike super's contact. Not on a body running his own
    const follow = event.super === true && self.awakening !== null && other.spec.tuning.boutAir !== undefined && self.followUp === null
      && other.followUp === null ? self.awakening : null;
    const keep = follow ? cityFightFollowUpHold(follow) : null;
    const taken = other.ops.receiveHit(other.state, { damage: damage * (keep?.share ?? 1), from: point(self), push, tier: "heavy", poise: 0, pierce: true,
      throughArmor: true, axis, string: keep ? keep.string : { flinchMs: 0, ender: true, knockdown: true },
      ...(keep ? {} : { launch: { strides, curve: true, guardShare: 0 }, hpKnock: true }) });
    other.state = taken.kuma;
    if (!taken.hit.hit) return;
    if (follow && !taken.hit.defeated) self.followUp = startCityFightFollowUp(follow, damage);
    self.contacts += 1;
    hits.push({ target: cornerOf(other), tier: "heavy", blocked: false, from: point(self), damage: taken.hit.damage, grab: "throw",
      ...(event.super === true ? { super: true as const } : {}) });
  };
  /** A trace of `self`'s at `at` (`CityFightBoutTraces`). */
  const leave = (self: Corner, kind: CityFightBoutTrace["kind"], at: CityPoint, radiusStrides: number, life: number) => {
    traces = addCityFightBoutTrace(traces, { id: traceId++, kind, owner: cornerOf(self), point: snap(at), radiusUnits: radiusStrides * stepUnits,
      leftMs: life, ms: life });
  };
  /**
   * His burrow's exit (`skill.leaves: "hole"`): a hole torn open under the other's feet where he burst out at him — the body he throws up
   * lands beyond it and walks back over it to reach him.
   */
  const leaveHole = (self: Corner, other: Corner) => {
    const spec = rules.traces, c = self.state.combat;
    if (!spec || kumaSkillSpec(self.spec.tuning, "burrow")?.leaves !== "hole" || c.mode !== "attack" || kumaSkillKind(c.special) !== "burrow") return;
    leave(self, "hole", point(other), spec.hole.radiusStrides, spec.hole.ms);
  };
  /** His slide's ice (`skill.leaves: "ice"`): a patch every `ice.everyStrides` of its run. */
  const leaveIce = (self: Corner) => {
    const spec = rules.traces, c = self.state.combat;
    const sliding = spec !== undefined && kumaSkillSpec(self.spec.tuning, "slide")?.leaves === "ice" && c.mode === "dash" && c.dash?.phase === "travel"
      && kumaSkillKind(c.dash.special) === "slide";
    if (!sliding) { self.iceAt = null; return; }
    const at = point(self), last = self.iceAt;
    if (last && Math.hypot(at[0] - last[0], at[1] - last[1]) < spec.ice.everyStrides * stepUnits) return;
    leave(self, "ice", at, spec.ice.radiusStrides, spec.ice.ms);
    self.iceAt = at;
  };
  /**
   * The other's hole under a corner moving on his feet (his chase's walk or run, his step back, a dash's run or skid): he trips once — a stumble
   * and a small sting — and the hole is filled. Not in the air, held, down or untouchable (`vulnerable`).
   */
  const tripStep = () => {
    const spec = rules.traces;
    if (!spec || traces.length === 0) return;
    for (const c of corners) {
      const combat = c.state.combat;
      const moving = combat.movedPx > 0 && !combat.air
        && (combat.mode === "chase" || combat.mode === "cooldown" || combat.mode === "dash" && (combat.dash?.phase === "travel" || combat.dash?.phase === "slide"));
      if (!moving || c.held || !c.ops.vulnerable(c.state)) continue;
      // His front foot reaches it: half his footprint past its edge (he stops at body contact with the gopher standing on it).
      const hole = cityFightBoutTraceUnder(traces, point(c), "hole", cornerOf(c), c.radius * TRIP_FOOT_SHARE);
      if (!hole) continue;
      traces = Object.freeze(traces.filter(trace => trace.id !== hole.id));
      const at = point(c), away = Math.hypot(at[0] - hole.point[0], at[1] - hole.point[1]);
      const push: CityPoint = away > 1e-9 ? [(at[0] - hole.point[0]) / away, (at[1] - hole.point[1]) / away] : [line.direction[0], line.direction[1]];
      // A small sting (`hole.tripDamage`, raw HP): the rules take no blow of nothing.
      const taken = c.ops.receiveHit(c.state, { damage: spec.hole.tripDamage, from: hole.point, push, tier: "light", poise: 0, pierce: true,
        throughArmor: true, axis: combat.facing, string: { flinchMs: spec.hole.tripMs, ender: false, knockdown: false } });
      c.state = taken.kuma;
      if (taken.hit.hit) hits.push({ target: cornerOf(c), tier: "light", blocked: false, from: hole.point, damage: taken.hit.damage, trip: true });
    }
  };
  /**
   * The awakenings' follow-ups this step (`CityFightAwakening`): each runs on the bout's clock and its beat due now strikes the other corner
   * through his own rules (`cityFightFollowUpBlow` — the village fight's blows). A held body, or one the beat cannot reach, lets it pass.
   */
  const followUpsStep = () => {
    for (const c of corners) {
      const run = c.followUp;
      if (!run) continue;
      const other = corners[1 - cornerOf(c)]!, follow = cityFightFollowUpById(run.id);
      if (!follow || other.state.combat.hp <= 0 || c.state.combat.hp <= 0) { c.followUp = null; continue; }
      const stepped = stepCityFightFollowUp(run, rules.dtMs, kumaCombatLying(other.state.combat));
      c.followUp = stepped.run;
      if (stepped.beat === null || c.held !== null || other.held !== null) continue;
      const from = point(c), at = point(other), dx = at[0] - from[0], dy = at[1] - from[1], length = Math.hypot(dx, dy);
      const push: CityPoint = length > 1e-9 ? [dx / length, dy / length] : [line.direction[0] * (cornerOf(c) === 0 ? 1 : -1), line.direction[1] * (cornerOf(c) === 0 ? 1 : -1)];
      const taken = other.ops.receiveHit(other.state, cityFightFollowUpBlow(follow, stepped.beat, run.damage,
        { from, push, axis: kumaScreenFacing(projection, push) ?? "left" }));
      other.state = taken.kuma;
      if (!taken.hit.hit) continue;
      c.contacts += 1;
      hits.push({ target: cornerOf(other), tier: "heavy", blocked: false, from, damage: taken.hit.damage, followUp: stepped.beat,
        ...(taken.hit.air ? { air: taken.hit.air } : {}) });
      if (taken.hit.defeated) c.followUp = null;
    }
  };
  /** The set piece's stage and the two corners' salts (its seeded picks — `cityFightExchangeShare`). */
  const exchangeStage: CityFightExchangeStage = { line, projection, stepUnits, dtMs: rules.dtMs, snap };
  const exchangeSalts = [corners[0].spec.tuning.windupSalt ?? 0, corners[1].spec.tuning.windupSalt ?? 0] as const;
  const exchangeSide = (c: Corner): CityFightExchangeSide => ({ state: c.state, hp: c.spec.tuning.hp, id: c.spec.id,
    runStridePx: c.spec.art.runStridePx(), fistStrides: cityFightExchangeFist(c.spec.id, c.spec.tuning, c.spec.footprint),
    ...(c.spec.exchangeWeights ? { weights: c.spec.exchangeWeights } : {}) });
  /** Both corners let go of the set piece (its end, or a failsafe): each in the set piece stands. */
  const endExchange = () => {
    for (const c of corners) c.state = cityFightExchangeReleased(c.state, point(corners[1 - cornerOf(c)]!), projection);
    exchange = null;
    exchangeEndMs = ms;
  };
  /**
   * An exchange's blow (`CityFightExchangeBlow`): a pass's chip on the loser (never his last HP — `cityFightBoutSqueezed`), the last pass's
   * knockdown through his own rules — through his guard and armour, flown the way the winner ran, a share of his whole HP (not his power's: a
   * set piece weighs the same for everyone).
   */
  const exchangeBlow = (run: CityFightExchangeRun, blow: CityFightExchangeBlow) => {
    const spec = CITY_FIGHT_EXCHANGES[run.kind], winner = corners[blow.winner], loser = corners[1 - blow.winner]!;
    // Thrown the way the blow says (the cross: the way the winner ran — met head on, he goes back the way he came; the pinball: into the rope).
    const from = point(winner), dir = blow.dir, push: CityPoint = [line.direction[0] * dir, line.direction[1] * dir];
    const tag = { kind: run.kind, pass: blow.pass, final: blow.final };
    if (!blow.final) {
      const [chipped, taken] = cityFightBoutSqueezed(loser.state, spec.chipShare * loser.spec.tuning.hp);
      loser.state = chipped;
      winner.contacts += 1;
      hits.push({ target: cornerOf(loser), tier: "light", blocked: false, from, damage: taken, exchange: tag });
      return;
    }
    // Taken as a throw's is (his run cut into a flinch of the string — `cityFightBoutSeized`): the knockdown lands (a body in his own move
    // only flinches).
    const seized = cityFightBoutSeized(loser.state, loser.state.combat.facing);
    const taken = loser.ops.receiveHit({ ...seized, combat: { ...seized.combat, exchange: null } }, {
      damage: spec.finalShare * loser.spec.tuning.hp, from, push, tier: "heavy", poise: 0, pierce: true, throughArmor: true,
      axis: kumaScreenFacing(projection, push) ?? "left",
      string: { flinchMs: 0, ender: true, knockdown: true }, launch: { strides: spec.finalKnockStrides, curve: true, guardShare: 0 }, hpKnock: true });
    loser.state = taken.kuma.combat.exchange ? { ...taken.kuma, combat: { ...taken.kuma.combat, exchange: null } } : taken.kuma;
    if (!taken.hit.hit) return;
    winner.contacts += 1;
    hits.push({ target: cornerOf(loser), tier: "heavy", blocked: false, from, damage: taken.hit.damage, exchange: tag });
  };
  /**
   * The set piece's step (`stepCityFightCross`): it moves both bodies it owns and lands its blow due now; a corner it lets go stands (the
   * loser of its last pass is his own rules' already). A body something else took out of it, either KO or its failsafe ends it.
   */
  const exchangeOwns = (run: CityFightExchangeRun | null, corner: 0 | 1) =>
    run === null ? false : run.kind === "cross" ? run.corners[corner].phase !== "out"
      : run.kind === "pinball" ? cityFightPinballOwns(run, corner) : cityFightRushOwns(run, corner);
  const exchangeStep = () => {
    const run = exchange;
    if (!run) return;
    const lost = corners.some((c, i) => exchangeOwns(run, i as 0 | 1) && !c.state.combat.exchange);
    if (lost || run.ms >= CITY_FIGHT_EXCHANGES.common.maxMs || corners.some(c => c.state.combat.hp <= 0)) { endExchange(); return; }
    const sides = [exchangeSide(corners[0]), exchangeSide(corners[1])] as const;
    const stepped = run.kind === "cross" ? { ...stepCityFightCross(run, exchangeStage, sides, exchangeSalts), rope: false }
      : run.kind === "pinball" ? stepCityFightPinball(run, exchangeStage, sides) : { ...stepCityFightRush(run, exchangeStage, sides), rope: false };
    corners[0].state = stepped.states[0];
    corners[1].state = stepped.states[1];
    // The pinball's rope throws him back (what a visible bout springs — `CityFightBoutBounce`).
    if (stepped.rope && run.kind === "pinball") bounces.push({ corner: (1 - run.striker) as 0 | 1, point: point(corners[1 - run.striker]!) });
    if (stepped.blow) exchangeBlow(run, stepped.blow);
    exchange = stepped.run;
    corners.forEach((c, i) => {
      if (!exchangeOwns(exchange, i as 0 | 1) && c.state.combat.exchange) c.state = cityFightExchangeReleased(c.state, point(corners[1 - i]!), projection);
    });
    if (!exchange) exchangeEndMs = ms;
  };
  /**
   * A set piece may start now: none in flight, `startAfterMs` in, `cooldownMs` after the last, under `maxPerBout`, nothing summoned out, no
   * corner a person steers.
   */
  const exchangeOpen = () => {
    const common = CITY_FIGHT_EXCHANGES.common;
    return exchange === null && !steered && ms >= common.startAfterMs && ms - exchangeEndMs >= common.cooldownMs && exchangeSeq < common.maxPerBout
      && summons.live.length === 0 && corners.every(c => c.held === null && c.followUp === null && c.delayMs <= 0 && c.state.combat.hp > 0);
  };
  /**
   * This step's clean heavy blow may start a pinball (`CityFightBoutPinball`): its striker not struck back on the step, the struck one reeling
   * on the ground, the rope behind him in reach — and its seeded pick. Both bodies are the set piece's from here (his flight is its own).
   */
  const exchangeTrigger = () => {
    const blow = pinballBlow;
    pinballBlow = null;
    if (!blow || rules.exchanges?.kinds.includes("pinball") !== true || !exchangeOpen()) return;
    const s = cornerOf(blow.striker), target = corners[1 - s]!;
    if (hits.some(hit => hit.target === s) || target.state.combat.mode !== "hurt" || target.state.combat.air) return;
    const dir: 1 | -1 = blow.push[0] * line.direction[0] + blow.push[1] * line.direction[1] >= 0 ? 1 : -1;
    const run = cityFightPinballStart(exchangeStage, [exchangeSide(corners[0]), exchangeSide(corners[1])], s, dir, exchangeSalts, exchangeSeq,
      blow.striker.contacts);
    if (!run) return;
    exchange = run;
    exchangeSeq += 1;
    blow.striker.state = withPose(cityFightExchangeTaken(blow.striker.state, "pinball", "ready", dir, projection, line),
      { slashMs: 0, slashAction: blow.action, slashPass: blow.hitIndex });
    target.state = withPose(cityFightExchangeTaken(target.state, "pinball", "out", (-dir) as 1 | -1, projection, line), { struckMs: 0 });
  };
  /**
   * A set piece starts (`rules.exchanges`): `startAfterMs` into the bout, `cooldownMs` after the last, at most `maxPerBout`, at a window's
   * start (`everyMs`) with both corners free (no hold, no follow-up, nothing summoned out) and the kind's own conditions and seeded pick.
   */
  const exchangeStart = () => {
    const spec = rules.exchanges, common = CITY_FIGHT_EXCHANGES.common;
    if (!spec || !exchangeOpen() || ms % common.everyMs >= rules.dtMs || !spec.kinds.includes("cross")) return;
    if (corners.some(c => !cityFightExchangeFree(c.state.combat))) return;
    const run = cityFightCrossStart(exchangeStage, [exchangeSide(corners[0]), exchangeSide(corners[1])], exchangeSalts, exchangeSeq,
      Math.floor(ms / common.everyMs));
    if (!run) return;
    exchange = run;
    exchangeSeq += 1;
    corners[0].state = cityFightExchangeTaken(corners[0].state, "cross", "set", run.corners[0].dir, projection, line);
    corners[1].state = cityFightExchangeTaken(corners[1].state, "cross", "set", run.corners[1].dir, projection, line);
  };
  /** A rush takes both bodies (`CityFightBoutRush`): each faces the other, string against string. */
  const takeRush = (rush: NonNullable<ReturnType<typeof cityFightRushStart>>) => {
    exchange = rush;
    exchangeSeq += 1;
    for (const c of corners) {
      const face = (cornerOf(c) === rush.winner ? rush.dir : -rush.dir) as 1 | -1;
      c.state = cityFightExchangeTaken(c.state, "rush", "flurry", face, projection, line);
    }
  };
  /**
   * Two swings of their rotation begun together (`rush.togetherMs` apart, `maxGapStrides` apart, neither out yet — the race the arena audit
   * counted) may break into a rush instead: one pick a pair of swings. Its two swings meet where they stand (a clash's spark).
   */
  const rushTogether = () => {
    const spec = CITY_FIGHT_EXCHANGES.rush;
    if (rules.exchanges?.kinds.includes("rush") !== true || !exchangeOpen()) return;
    const [ca, cb] = [corners[0].state.combat, corners[1].state.combat];
    const swing = (c: typeof ca) => c.mode === "attack" && c.hitsFired === 0 && !c.air && !c.special
      && (c.action === "combo" || c.action === "slam" || c.action === "fast");
    if (!swing(ca) || !swing(cb) || Math.abs(ca.modeMs - cb.modeMs) > spec.togetherMs) return;
    const pa = point(corners[0]), pb = point(corners[1]);
    if (Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) > spec.maxGapStrides * stepUnits) return;
    const pair = ca.attackId * 4099 + cb.attackId;
    if (pair === rushPair) return;
    rushPair = pair;
    const rush = cityFightRushStart(exchangeStage, [exchangeSide(corners[0]), exchangeSide(corners[1])], exchangeSalts, exchangeSeq, pair);
    if (!rush) return;
    clashes.push({ point: [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2], tier: ca.action === "slam" || cb.action === "slam" ? "heavy" : "light" });
    takeRush(rush);
  };
  /** The holds this step: a grabber no longer in that grab's hold (or one past its failsafe) lets go of his corner into its flinch. */
  const holdsStep = () => {
    for (const c of corners) {
      if (!c.held) continue;
      const hold: CityFightBoutHold = { ...c.held, ms: c.held.ms + rules.dtMs }, grabber = corners[hold.by];
      c.held = cityFightBoutHoldEnds(hold, grabber.state, grabber.spec.tuning) ? null : hold;
    }
  };
  /**
   * `self`'s events of this step, in two passes over both corners (2026-10-22 5차 — the corners' order no longer decides a step): `blows`
   * (every strike but a grab's catch), then the rest (the catches, the hold's beats, the casts). A blow lands before any catch of this step,
   * so a grab whose grabber was struck on this step catches nothing — whichever corner it was. `airborne`: up in the air when the step began.
   */
  const answer = (self: Corner, other: Corner, events: readonly NativeCityKumaFighterEvent[], pass: "blows" | "rest", airborne: boolean) => {
    for (const event of events) {
      const blow = event.kind === "strike" && event.action !== "grab";
      if (blow !== (pass === "blows")) continue;
      // A skill that leaves a hole (`skill.leaves: "hole"`, the burrow): its exit stays open where he came up.
      if (event.kind === "strike" && event.hitIndex === 0) leaveHole(self, other);
      if (event.kind === "strike") strike(self, other, event, airborne);
      else if (event.kind === "grab") grabBeat(self, other, event);
      else if (event.kind === "summon") {
        summons = spawnCityFightSummon(summons, { ownerId: self.spec.id, kind: event.summon, castId: event.attackId, damage: event.damage, line,
          stepUnits, ownerAlong: cityFightSummonAlong(line, point(self)), ownerRadius: self.radius, targetAlong: cityFightSummonAlong(line, point(other)) });
      }
    }
  };
  /** A summoned object swept over `target`: its one contact (his protection lets it through for now), then his own rules take it. */
  const summonStrike = (summon: CityFightSummon, owner: Corner, target: Corner): CityFightSummonOutcome => {
    // A held body is the grabber's alone until the throw.
    if (!target.ops.vulnerable(target.state) || target.held !== null) return "none";
    const spec = cityFightSummonSpec(summon.kind);
    // A high object passes over a body low now (`CityFightSummonSpec.high`, 2026-10-25 — 이토's lean back): his dodge, it flies on.
    if (spec.high === true && kumaCombatLow(target.state.combat)) return "dodge";
    const contact = resolveNativeCityProjectile(cityFightSummonStrike(summon), target.victim, spec.playerHit.invulnerableMs);
    if (!contact.hit) return contact.protected ? "protected" : "none";
    target.victim = contact.victim;
    const push: CityPoint = [line.direction[0] * summon.heading, line.direction[1] * summon.heading], tier = spec.bout.tier;
    const damage = boutDamage(summon.damage, owner, target);
    const launch = spec.bout.launchStrides !== undefined ? { launch: { strides: spec.bout.launchStrides, curve: true, guardShare: 0 } } : {};
    const taken = target.ops.receiveHit(target.state, { damage, from: cityFightSummonPoint(line, summon), push, tier, poise: rules.poise[tier],
      // One no guard holds (`answers.guard` false — the flying roadster) goes through his guard too.
      pierce: spec.playerHit.answers.guard === false, ranged: true, axis: kumaScreenFacing(projection, push) ?? "left",
      string: { flinchMs: 0, ender: tier === "heavy", knockdown: false }, ...launch, hpKnock: true });
    target.state = taken.kuma;
    if (!taken.hit.hit) return "none";
    owner.contacts += 1;
    hits.push({ target: corners[0] === target ? 0 : 1, tier, blocked: taken.hit.blocked, from: cityFightSummonPoint(line, summon), summon: summon.kind,
      damage: taken.hit.damage, ...(taken.hit.armored ? { armored: true as const } : {}) });
    return taken.hit.blocked ? "block" : taken.hit.defeated ? "ko" : "hit";
  };
  /** The field's step on the bout's clock: the objects that swept over a corner are taken by him and settled. */
  const summonsStep = () => {
    if (summons.live.length === 0) return;
    const byId = (id: string) => corners.find(c => c.spec.id === id) ?? null;
    const stepped = stepCityFightSummonField(summons, { dtMs: rules.dtMs, line, stepUnits,
      ownerFighting: id => { const c = byId(id); return c !== null && nativeCityKumaFighterFighting(c.state); },
      targets: corners.map(c => ({ id: c.spec.id, along: cityFightSummonAlong(line, point(c)), radius: c.radius })) });
    summons = stepped.field;
    for (const touch of stepped.touches) {
      const owner = byId(touch.summon.ownerId), target = byId(touch.targetId);
      const outcome = owner && target ? summonStrike(touch.summon, owner, target) : "none";
      summons = settleCityFightSummonTouch(summons, touch.summon.id, touch.targetId, outcome);
    }
  };
  /** A melee contact that can meet a swing: a strike, not a grab's, a super's or an air chase's beat. */
  const clashable = (event: NativeCityKumaFighterEvent): event is Extract<NativeCityKumaFighterEvent, { kind: "strike" }> =>
    event.kind === "strike" && event.action !== "grab" && event.super !== true && (event.air === undefined || event.air === "launch");
  /** `attacker`'s swing `action` facing `direction` reaches `target` where both stand now (the melee judgement's geometry alone). */
  const reaches = (attacker: Corner, target: Corner, action: Parameters<Corner["ops"]["reachExtraStrides"]>[1], direction: CityPoint, attackId: number,
    hitIndex: number) => !attacker.held && !target.held && target.ops.vulnerable(target.state) && nativeCityMeleeConnects({ attackerId: attacker.spec.id,
    attackId, hitIndex, origin: point(attacker), direction, radius: attacker.radius, damage: 1, tier: "light" },
  { id: target.spec.id, point: point(target), radius: target.radius }, { stepUnits, reachExtraStrides: attacker.ops.reachExtraStrides(attacker.state, action) });
  /** `self`'s swing has its next contact due within `windowMs` and it reaches `other` (not a grab, a super, an air chase). */
  const swingDue = (self: Corner, other: Corner, windowMs: number) => {
    const c = self.state.combat;
    if (c.mode !== "attack" || !c.action || c.action === "grab" || c.superAttack === c.attackId || kumaAirChasing(c.special) || c.air) return false;
    const due = self.spec.art.timing(c.action, c.facing, c.windupScale, c.special)?.hitsMs[c.hitsFired];
    return due !== undefined && due >= c.modeMs && due - c.modeMs <= windowMs && reaches(self, other, c.action, c.direction, c.attackId, c.hitsFired);
  };
  /**
   * The clash (`CityFightBoutRules.clash`): a contact of either corner's that reaches the other while the other's swing reaches back (its
   * contact on this step, or due within the window). Both swings are cut — every melee strike of theirs this step is dropped — and both
   * recoil apart. Returns the events left to answer.
   */
  const clashStep = (a: Corner, b: Corner, eventsA: readonly NativeCityKumaFighterEvent[], eventsB: readonly NativeCityKumaFighterEvent[]) => {
    const spec = rules.clash;
    if (!spec) return [eventsA, eventsB] as const;
    const meeting = (self: Corner, other: Corner, mine: readonly NativeCityKumaFighterEvent[], theirs: readonly NativeCityKumaFighterEvent[]) =>
      mine.filter(clashable).find(event => reaches(self, other, event.action, event.direction, event.attackId, event.hitIndex)
        && (swingDue(other, self, spec.windowMs)
          || theirs.some(back => clashable(back) && reaches(other, self, back.action, back.direction, back.attackId, back.hitIndex))));
    const met = meeting(a, b, eventsA, eventsB) ?? meeting(b, a, eventsB, eventsA);
    if (!met) return [eventsA, eventsB] as const;
    const pa = point(a), pb = point(b), dx = pb[0] - pa[0], dy = pb[1] - pa[1], length = Math.hypot(dx, dy);
    const toward: CityPoint = length > 1e-9 ? [dx / length, dy / length] : [line.direction[0], line.direction[1]];
    const jitter = (): number => { const roll = nextInt(rng, 0, Math.max(1, Math.floor(spec.jitterMs) + 1)); rng = roll.state; return roll.value; };
    const recoilA = spec.recoilMs + jitter(), recoilB = spec.recoilMs + jitter();
    const heavy = [...eventsA, ...eventsB].some(event => clashable(event) && event.tier === "heavy");
    clashes.push({ point: [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2], tier: heavy ? "heavy" : met.tier });
    // A rush may break out of it (`CityFightBoutRush`): both bodies the set piece's, string against string — no recoil.
    const rush = rules.exchanges?.kinds.includes("rush") === true && exchangeOpen() && !a.state.combat.air && !b.state.combat.air
      ? cityFightRushStart(exchangeStage, [exchangeSide(corners[0]), exchangeSide(corners[1])], exchangeSalts, exchangeSeq, Math.floor(ms / rules.dtMs))
      : null;
    if (rush) {
      takeRush(rush);
      return [eventsA.filter(event => !clashable(event)), eventsB.filter(event => !clashable(event))] as const;
    }
    a.state = nativeCityKumaFighterClash(a.state, pb, [-toward[0], -toward[1]], recoilA, spec.pushStrides, a.spec.tuning.superOff !== true, a.spec.art.artFacing);
    b.state = nativeCityKumaFighterClash(b.state, pa, toward, recoilB, spec.pushStrides, b.spec.tuning.superOff !== true, b.spec.art.artFacing);
    return [eventsA.filter(event => !clashable(event)), eventsB.filter(event => !clashable(event))] as const;
  };

  let result: CityFightBoutResult | null = null;
  return {
    get snapshot() { return { ms, states: [corners[0].state, corners[1].state] as const,
      contacts: [corners[0].contacts, corners[1].contacts] as const, result, summons, hits, walls, supers, airs,
      held: [corners[0].held, corners[1].held] as const, traces, clashes, bounces,
      followUps: [corners[0].followUp, corners[1].followUp] as const, exchange }; },
    step(controls) {
      if (result) return result;
      hits = []; walls = []; supers = []; airs = []; clashes = []; bounces = [];
      steered = controls?.some(control => control != null) === true;
      const [first, second] = corners;
      // Both read the other as he stood when the step began; the HP shares before its blows settle a double KO.
      const seen = [first.state, second.state] as const, before = [hpShare(first), hpShare(second)] as const;
      // A set piece owns its bodies this step (`rules.exchanges`): it moves them; their own rules wait (their contact memory runs on).
      exchangeStep();
      const owned = (c: Corner) => {
        if (!c.state.combat.exchange) return false;
        c.victim = stepNativeCityMeleeVictim(c.victim, rules.dtMs);
        return true;
      };
      const stepped = [owned(first) ? [] : step(first, second, null, controls?.[0] ?? null, seen[1]),
        owned(second) ? [] : step(second, first, null, controls?.[1] ?? null, seen[0])] as const;
      const [eventsA, eventsB] = clashStep(first, second, stepped[0], stepped[1]);
      const airborne = [first.state.combat.air != null, second.state.combat.air != null] as const;
      follows = [];
      answer(first, second, eventsA, "blows", airborne[0]);
      answer(second, first, eventsB, "blows", airborne[1]);
      const struck = new Set(hits.map(hit => hit.target));
      for (const follow of follows) {
        if (!struck.has(cornerOf(follow.corner))) follow.corner.state = nativeCityKumaFighterFollow(follow.corner.state, follow.toward, follow.units);
      }
      answer(first, second, eventsA, "rest", airborne[0]);
      answer(second, first, eventsB, "rest", airborne[1]);
      exchangeTrigger();
      followUpsStep();
      holdsStep();
      summonsStep();
      exchangeStart();
      rushTogether();
      // The stage's traces (2026-10-22 4차): the slides leave their ice, a hole trips the one who walks in, the old ones melt and fill.
      if (rules.traces) { leaveIce(first); leaveIce(second); tripStep(); traces = stepCityFightBoutTraces(traces, rules.dtMs); }
      ms += rules.dtMs;
      if (ms % 500 < rules.dtMs) {
        // (The meter too since engine v2 — `super`.)
        for (const c of corners) digest = fnv(fnv(fnv(digest, Math.round(c.state.combat.hp * 100)), Math.round(point(c)[0] * 10)), Math.round(c.state.combat.meter ?? 0));
      }
      const out = corners.map(c => c.state.combat.hp <= 0);
      if (out[0] || out[1]) {
        // Both out on one step (2026-10-22 5차 — it used to go to the first corner): the larger HP share before this step's blows, level
        // shares to the seed.
        const both = out[0] && out[1];
        const tie = both && Math.abs(before[0] - before[1]) <= 1e-9 ? nextInt(rng, 0, 2).value as 0 | 1 : null;
        const winner: 0 | 1 = !both ? (out[0] ? 1 : 0) : tie ?? (before[0] > before[1] ? 0 : 1);
        return result = finish(winner, "ko");
      }
      if (ms < rules.limitMs) return null;
      const [shareA, shareB] = [hpShare(corners[0]), hpShare(corners[1])];
      // 판정(rule 4): the larger HP share; level shares go to the seed.
      const tie = nextInt(rng, 0, 2);
      return result = finish(shareA > shareB + 1e-9 ? 0 : shareB > shareA + 1e-9 ? 1 : tie.value as 0 | 1, "decision");
    },
    settle() { if (result) epilogue(result); },
  };

  /** `settle`'s tick: the knocked-out corner's fall and lie (held before his get-up), the other back to his mark. */
  function epilogue(done: CityFightBoutResult): void {
    hits = []; walls = []; supers = []; airs = []; clashes = []; bounces = [];
    traces = stepCityFightBoutTraces(traces, rules.dtMs);
    settleMs += rules.dtMs;
    corners.forEach((c, i) => {
      const fallen = done.how === "ko" && i !== done.winner;
      if (fallen && (c.state.combat.mode !== "down" || c.state.combat.modeMs + rules.dtMs >= c.spec.tuning.down.ms)) return;
      // The KO's winner finishes his swing and stands a beat (`ai.winnerHoldMs`, 2026-10-23 2차 — he turned his back on the fallen at once);
      // his strikes here go nowhere (the epilogue takes no contact).
      if (!fallen && done.how === "ko" && rules.ai && settleMs <= rules.ai.winnerHoldMs) { step(c, corners[1 - i]!, null, STAND); return; }
      step(c, corners[1 - i]!, { hostile: fallen });
    });
  }

  function finish(winner: 0 | 1, how: "ko" | "decision"): CityFightBoutResult {
    digest = fnv(fnv(digest, ms), winner);
    // The bell lets go of a hold (a decision while held) and ends a follow-up: both play out their epilogue.
    for (const c of corners) { c.held = null; c.followUp = null; }
    // And a set piece in flight: both stand into their epilogue (the KO's loser is his own rules' already).
    if (exchange) endExchange();
    return Object.freeze({ winner, how, ms, hp: [hpShare(corners[0]), hpShare(corners[1])] as const,
      contacts: [corners[0].contacts, corners[1].contacts] as const, digest: digest.toString(16).padStart(8, "0") });
  }
}

export function runCityFightFighterBout(a: CityFightBoutCorner, b: CityFightBoutCorner, arena: CityFightBoutArena,
  rules: CityFightBoutRules, seed: number): CityFightBoutResult {
  const bout = createCityFightFighterBout(a, b, arena, rules, seed);
  let result = bout.step();
  while (!result) result = bout.step();
  return result;
}
