import { nativeCityFootprintRadius } from "../NativeCityActorCollision";
import { nativeCityParryArmed, type NativeCityDefenseAnswers } from "./NativeCityExchange";
import type { CityFightStageLine } from "./CityFightStageLine";
import type { CityFightSummonField } from "./CityFightSummons";
import { NATIVE_CITY_COMBAT, type NativeCityImpactTier, type NativeCityKumaActionKind, type NativeCityKumaChanceKind, type NativeCityKumaGrade, type NativeCityMeleeTier,
  type NativeCityPlayerAirMove, type NativeCityPlayerActionKind } from "./NativeCityCombatTuning";
import type { VillageFacing } from "../VillageFacing";
import { villagePathFacing } from "../VillagePathFacing";
import { NATIVE_CITY_MOVEMENT, cityScreenToPlan, type CityPoint, type NativeCityDefinition } from "../../world/NativeCityDefinition";
import { nativeCityFaction, NATIVE_CITY_DEFAULT_OPPONENT_ID, withNativeCityFaction,
  type NativeCityFactionMap } from "./NativeCityFactions";
import { cutNativeCityFightHit, nativeCityFightHitLocks, type NativeCityBlow, type NativeCityBlowKind, type NativeCityFightEvent, type NativeCityFightHitTiming,
  type NativeCityFightKo, type NativeCityFightKoTiming, type NativeCityFightSlowMoBeat, type NativeCityFightState } from "./NativeCityFight";
import { kumaScreenDelta, nativeCityFrontBiasedDiagonal } from "./NativeCityKumaGeometry";
import type { KumaCombatHit, KumaTuning } from "./NativeCityKumaCombatState";
import type { KumaCounterGauge } from "./NativeCityKumaCounter";
import { cancelNativeCityPlayerSwing, nativeCityPlayerSwingCancellable, nativeCityPlayerSwingCharging, type NativeCityLungeCurve, type NativeCityPlayerSwingState,
  type NativeCityPlayerSwingTimeline, type NativeCityContactMotion } from "./NativeCityPlayerSwing";
import { nativeCityPlayerVaultLocks, type NativeCityPlayerVault, type NativeCityPlayerVaultTimeline } from "./NativeCityPlayerVault";
import { nativeCityPlayerBackstepLocks, type NativeCityPlayerBackstep, type NativeCityPlayerBackstepTimeline } from "./NativeCityPlayerBackstep";
import type { OttoState, NativeCityOttoImpact } from "./NativeCityOttoEncounter";
import type { CityFightFoeRules } from "./CityFightFoe";
import type { CityFightAwakening, CityFightFollowUpRun } from "./CityFightAwakening";
import { endNativeCityVault, interruptNativeCityDefense, nativeCityDefenseBlockStunned, nativeCityDefenseBowing, nativeCityDefenseDodging,
  nativeCityDefenseLocksMovement, nativeCityDefenseParrying, nativeCityDefensePressAgeMs, type NativeCityPlayerDefenseState } from "./NativeCityPlayerDefense";




export interface NativeCityQueuedPress {
  readonly kind: NativeCityPlayerActionKind | "dodge" | "guard" | "backstep";
  readonly facing: VillageFacing;
  readonly heading: CityPoint;
  readonly atMs: number;

  readonly timed?: boolean;
  /** A V let go while it waited: its swing fires as soon as the crouch is reached (`player.actions.attack.charge`). */
  readonly released?: boolean;
}


export interface NativeCityFightFinale {
  /** Each finale its own id (the webtoon overlays cue once per finale). */
  readonly id: number;
  readonly fightMs: number;
  readonly landed: boolean;
  readonly card: boolean;
  readonly bowed: boolean;

  readonly side: number;
  /** Screen ms since the KO blow (the fight zoom's punch-in runs through the blow's freeze; the victory page waits on it). */
  readonly screenMs: number;
}


export interface NativeCityFightSimState {
  /** The shared fight clock, his and each enemy's melee state, knockback, hit lock, spin and knock-out (`NativeCityFight`). */
  readonly fight: NativeCityFightState;
  readonly swing: NativeCityPlayerSwingState;
  readonly defense: NativeCityPlayerDefenseState;
  /** One press during a swing or a lock (the latest wins), stamped on the fight clock. */
  readonly queued: NativeCityQueuedPress | null;
  /** A C press closing the stage gap before its swing; bounded on the shared fight clock. */
  readonly pursuit: { readonly enemyId: string; readonly direction: CityPoint; readonly facing: VillageFacing;
    readonly ms: number; readonly travelled: number;
    /** The swing it ends in: C's (absent), or V's ground blow on a foe on the ground (`kuma.rhythm.down`). */
    readonly kind?: NativeCityPlayerActionKind;
    /** X's run-in (`dodge.vault.chargeMaxGapStrides`, 2026-10-18): it ends in the vault, not a swing. */
    readonly vault?: true;
    /** A V run-in whose key is already up (`player.actions.attack.charge`): it kicks on arrival as soon as it crouches. */
    readonly released?: true;
    /** His super's run-in (`super`): the V it ends in is his super. */
    readonly super?: true } | null;

  readonly chain: { readonly next: number; readonly idleMs: number; readonly missed: boolean };

  readonly enderGateMs: number;
  /** The guard is up this frame (and the heading it holds is `lockedHeading`). */
  readonly guardUp: boolean;

  readonly stance: { readonly facing: VillageFacing; readonly heading: CityPoint };
  /** While locked (or guarding), the facing and standing heading the scene keeps. */
  readonly lockedFacing: VillageFacing | null;
  readonly lockedHeading: CityPoint | null;
  /** The screen side his four-diagonal art leans to (the heading resolver's tie-break). */
  readonly lean: "left" | "right";
  /** The spin ended this frame: the scene turns him to the facing it left (toward the enemy) once more. */
  readonly released: boolean;
  readonly finale: NativeCityFightFinale | null;
  /** Finales so far (the next one's id). */
  readonly finales: number;
  /** His super's follow-up in flight (his awakening's scripted blows — `CityFightAwakening`, `NativeCityFollowUp`), or null. */
  readonly followUp: CityFightFollowUpRun | null;

  readonly foeFollowUp: CityFightFollowUpRun | null;

  readonly vault: NativeCityPlayerVault | null;

  readonly backstep: NativeCityPlayerBackstep | null;
  /** Fight ms until the next backstep is accepted (`player.backstep.cooldownMs` after one ends). */
  readonly backstepCooldownMs: number;
  /** His meter (`CityFightMeter`, 2026-10-20): his landed, guarded and taken blows build it; full, S spends it on his super. */
  readonly meter: number;
}


export interface NativeCityEnemyBlow {
  readonly contact?: "hook" | "stone";
  readonly contactHeight?: number;
  readonly freezeMs?: number;
  readonly launch?: boolean;
  readonly knockdown?: boolean;
  readonly landing?: NativeCityKoLanding;
  /** A landed, nonlethal hook pulls toward its owner by at most this many strides. Guard/dodge never pull. */
  readonly pullStrides?: number;
  readonly invulnerableMs: number;
  readonly stunMs: number;
  readonly knockbackStrides: number;
  /** 쓰러뜨리지 않는 한 방의 타격 등급(멈춤·흔들림·소리). */
  readonly tier: NativeCityImpactTier;
  /** 회피·가드·패리가 이 한 방을 쿠마의 어느 공격처럼 읽는가(`resolveNativeCityDefense`). */
  readonly defendAs: NativeCityKumaActionKind;
  /**
   * 이 한 방이 받는 방어(회피·패리·뜀틀) — 쿠마형 파이터의 상성 삼각형(2026-10-14)과 무관한 그 적의 몫. 없으면 `defendAs` 의 삼각형 몫을 따른다.
   */
  readonly answers?: NativeCityDefenseAnswers;
}


export interface NativeCityOttoFoe {
  readonly state: OttoState;
  readonly radius: number;
}


export interface NativeCityKumaReceive {
  readonly damage: number;

  readonly from: CityPoint;
  readonly push: CityPoint;
  readonly tier: NativeCityMeleeTier;
  readonly poise: number;
  readonly pierce: boolean;

  readonly throughArmor?: boolean;
  /** An object's contact (a summon, 2026-10-22): a counter's stance does not take it (`KumaCombatHitOptions.ranged`). */
  readonly ranged?: boolean;

  readonly axis: VillageFacing;
  readonly string: { readonly flinchMs: number; readonly ender: boolean; readonly knockdown: boolean; readonly chainBeat?: 1 | 2;
    readonly stringCount?: number; readonly continues?: boolean;
    /** V's ground blow on a body on the ground (`kuma.rhythm.down`); the contact launches him (`kuma.rhythm.launch`). */
    readonly ground?: boolean; readonly launches?: boolean;
    /** An awakening's blow on the body lying in a knockdown (`KumaCombatHitOptions.lying`). */
    readonly lying?: boolean;
    /** An air hit's own lift (`KumaCombatHitOptions.airLift` — an awakening's follow-up). */
    readonly airLift?: number;

    readonly answerMs?: number; readonly freeBeforeMs?: number;
    /** V's charge on the ground blow (`KumaCombatHitOptions.groundCharge`). */
    readonly groundCharge?: number;

    readonly air?: "hit" | "spike";

    readonly airLaunch?: boolean;
    /** With `airLaunch`: thrown up whatever the string (`KumaCombatHitOptions.forceLaunch` — a fighter's launching skill in the bout). */
    readonly forceLaunch?: boolean };
  /**
   * The tie's launch (`player.actions.combo.launch`): at least this many strides of knockback when it lands clean (his guard takes
   * `guardShare` of it, his armour all of it); `curve`: on the launch curve (`knockback.launch`, its wall splat). Absent: the tier push.
   */
  readonly launch?: { readonly strides: number; readonly curve: boolean; readonly guardShare: number };

  readonly hpKnock?: boolean;
  /** × the push he slides (2026-10-22 4차, a bout's ice under his feet — `CityFightBoutTraces`). Absent: 1. */
  readonly pushScale?: number;
  /** It builds no meter of his (an awakening's follow-up blow — `NativeCityKumaBlow.meterless`). */
  readonly meterless?: boolean;
}


export interface NativeCityKumaStrikeLanding {
  readonly attackId: number;
  readonly hitIndex: number;
  readonly push: CityPoint;
  /** Screen px his rebound pushes back against the blow (the view's; the rule ignores it). */
  readonly pushbackPx: number;
  readonly freezeMs: number;
  /** The follow-through tier of his fist inside the freeze (the view's); null: none. */
  readonly followTier: NativeCityImpactTier | null;

  readonly blocked?: boolean;
}

/**
 * KUMA as the fight sees him: reads and rule operations over his state `K`. Each operation returns the next `K` (the fight sim's fighter state
 * — `nativeCityKumaFightOps`, in the game as in the rule tests: the fight session's state, `CityFightSession`).
 */
export interface NativeCityKumaFightOps<K> {

  readonly tuning: KumaTuning;
  /** He stands drawn in this view (his art is in). */
  present(kuma: K): boolean;
  /** He can take a blow now (fighting, not down or walking home). */
  vulnerable(kuma: K): boolean;
  point(kuma: K): CityPoint;
  radius(kuma: K): number;
  /** His guard stance between attacks. */
  guarding(kuma: K): boolean;
  /** The triangle class of the move he has coming (`nativeCityKumaFighterGrade`), else null; absent: none known. */
  threatGrade?(kuma: K): NativeCityKumaGrade | null;
  /** His swing's reach beyond body contact (strides) as the fight judges it (`nativeCityKumaFighterReachExtraStrides`). */
  reachExtraStrides(kuma: K, action: NativeCityKumaActionKind): number;

  slamKnocksDown?(kuma: K): boolean;
  /** Fight ms from the KO blow to his body meeting the ground; undefined: `exchangeFx.ko.launchMs`. */
  koImpactMs(kuma: K): number | undefined;
  receiveHit(kuma: K, blow: NativeCityKumaReceive): { readonly kuma: K; readonly hit: KumaCombatHit; readonly knockbackUnits: number };
  strikeLanded(kuma: K, landing: NativeCityKumaStrikeLanding): K;
  receiveParry(kuma: K, from: CityPoint, push: CityPoint, groggy: boolean): { readonly kuma: K; readonly parried: boolean; readonly broke: boolean };
  /** His dash connected: he restarts the attack it cut; `impactMs`: fight ms to its first contact (null: he just stands). */
  dashConnected(kuma: K): { readonly kuma: K; readonly impactMs: number | null };

  pressOn(kuma: K): K;

  grabCaught?(kuma: K): K;
  /** A fresh fight (the defeat card's "다시"): `point` / `facing` stand him somewhere new. */
  rematch(kuma: K, point?: CityPoint, facing?: VillageFacing): K;
  /** He lies on the ground with V's ground blow still his to take (`kuma.rhythm.down`). Absent: never. */
  grounded?(kuma: K): boolean;
  /** He lies in a knockdown (`kumaCombatLying` — an awakening's `down` beat waits for it). */
  lying?(kuma: K): boolean;
  /** Thrown up for the air combo (`FightEnemy.air`), else null. Absent: never. */
  air?(kuma: K): FightEnemy["air"] | null;
  /** A just dodge or a parry opens a chance on him (`kuma.rhythm.chance`). Absent: no chances (the fighter has no rhythm). */
  openChance?(kuma: K, kind: NativeCityKumaChanceKind): K;
  /** V's counter gauge on his armoured swing (`kuma.rhythm.counter`, 2026-10-18), else null. Absent: he has no counter. */
  counterGauge?(kuma: K): KumaCounterGauge | null;
  /** A V pressed into his swing before its counter gauge filled spends that swing's counter (`counterSpentId`). Absent: no counter. */
  spendCounter?(kuma: K): K;
}


export type NativeCityPlayerArtAction = "attack" | "combo" | "hit" | "ko" | "block" | "dodge" | "parry" | "vault" | "dashAttack" | "backstep";


/** Which drawn reaction a hit lock plays: the plain `hit`, or the broken guard's own (`guardBreak`, 2026-10-17). */
export type NativeCityHitReaction = "hit" | "guardBreak";

export interface NativeCityPlayerArt {
  /** The heading `action` is drawn at for exact heading `exact` (the pack's resolver; without its art: `exact`). */
  facing(exact: VillageFacing, action: NativeCityPlayerArtAction,
    options: { readonly lean: "left" | "right"; readonly diagonal?: VillageFacing }): VillageFacing;
  /** A swing's beats at the heading it is drawn at (`segment`: the C chain's, null for V). */
  swing(facing: VillageFacing, kind: NativeCityPlayerActionKind, segment: number | null): NativeCityPlayerSwingTimeline;
  /**
   * An air move's beats from its own drawn clip at that heading (`player.air`: `c` the air tie whip, `v` the hammer spike, `stomp` the
   * heel stamped on the bounce); null / absent: none drawn there — the air move throws the C chain's segment / V's drawn swing / the jab instead.
   */
  air?(facing: VillageFacing, move: NativeCityPlayerAirMove): NativeCityPlayerSwingTimeline | null;
  /** His hit reaction's lengths at that heading (`stunMs`: the blow's own lock; `reaction`: which drawn reaction, default `hit`). */
  hit(facing: VillageFacing, stunMs?: number, reaction?: NativeCityHitReaction): NativeCityFightHitTiming;
  /**
   * His knock-out's beats at that heading. `landing` (the grab's throw, 2026-10-14): he FLIES `flightMs` and lands into the fall from its
   * ground-impact step (the upright lead and the falling cells skipped), lying `lieMs`.
   */
  ko(facing: VillageFacing, landing?: NativeCityKoLanding): NativeCityFightKoTiming;
  /** The longest windup (start → contact, fight ms) of chain segment `segment` over all eight headings. */
  longestWindupMs(segment: number): number;

  vault?(facing: VillageFacing): NativeCityPlayerVaultTimeline | null;

  backstep?(facing: VillageFacing): NativeCityPlayerBackstepTimeline | null;
}


export interface NativeCityKoLanding {
  readonly flightMs: number;
  readonly lieMs: number;
  /** Rising rubble uses the recoil pose and its heavier ground contact. */
  readonly contact?: "stone";
  readonly slide?: NativeCityBlow["landingSlide"];
}

/** The exchange beats whose freeze the recipes own (`nativeCityExchangeHitStopMs`). */
/** The exchange freezes (`hitStopsMs`); `crush` — a block that breaks his guard (2026-10-17: it used to stop as short as any clash). */
export type NativeCityExchangeFreeze = "finisher" | "jabGuard" | "clash" | "crush" | "parry" | "koLand";

/** The presentation's feel numbers the rules run on (`NATIVE_CITY_FIGHT_FEEL` in render): freezes, slow-mo, the step-in curve. */
export interface NativeCityFightFeel {
  /** A connecting hit's freeze by tier (`nativeCityHitStopMs`: the tier ladder, armour, the chain's light rungs). */
  hitStopMs(tier: NativeCityImpactTier, armored?: boolean, chainLight?: boolean | number): number;
  /** An exchange beat's freeze (ms, before `hitStopScale`). */
  exchangeHitStopMs(beat: NativeCityExchangeFreeze): number;
  /** The finisher slow-mo's rate (`nativeCityExchangeFinisherRate`: floored under reduced motion). */
  finisherRate(reducedMotion: boolean, scale: number): number;
  /** The running slow-mo's speed at its age (`combatSlowMoScaleAt`). */
  slowMoScale(beat: NativeCityFightSlowMoBeat, ageMs: number): number;
  /** The swing's step-in easing (`easeOutCubic`). */
  readonly lungeCurve: NativeCityLungeCurve;
}


export interface NativeCityFightSimContext<K> {

  readonly point: CityPoint;
  /** The current (orbit-rotated) projection. */
  readonly projection: NativeCityDefinition["projection"];
  /** One stride in plan units now (`nativeCityStepUnits`). */
  readonly stepUnits: number;
  /** The visit's faction table (a KO or KUMA's recovery turns him neutral — `calm` events). */
  readonly factions: NativeCityFactionMap;
  readonly reducedMotion: boolean;
  readonly kuma: K;
  readonly kumaOps: NativeCityKumaFightOps<K>;
  /**
   * The opponent's actor id (KUMA's `kuma`, YUME's `yume`): his faction in `factions` and his enemy id in
   * the events. Every village fighter fights in this one slot by his own id (2026-10-11). Absent: `kuma`.
   */
  readonly opponentId?: string;
  /** Otto while an attempt against him is on here (`NativeCityOttoFoe`); absent or null: none. KUMA comes first, always. */
  readonly otto?: NativeCityOttoFoe | null;
  readonly art: NativeCityPlayerArt;
  readonly feel: NativeCityFightFeel;
  /** The side-scroll stage's line while it is on (the vault must land on it); absent / null: no stage. */
  readonly stage?: CityFightStageLine | null;

  readonly awakening?: CityFightAwakening | null;
  /**
   * The summoned objects out on the stage (2026-10-20, `CityFightSession.summons`): one coming at him soon turns X into the hop on the spot
   * (no run-in at their caster). Absent: none.
   */
  readonly summons?: CityFightSummonField;

  readonly hp: number;

  readonly maxHp?: number;
  /**
   * The fight's playback speed while an enemy is engaged (`tempo.playbackRate`, 2026-10-19 — the scene passes it; `stepDuelClock`
   * baseRate). Absent: 1 — the rule tests step fight ms as screen ms.
   */
  readonly playbackRate?: number;
}

/** The exchange beat names (`snapshot().exchange.last`). */

export type NativeCityHitAccent = "ko" | "break" | "knockdown" | "counter" | "ender";

export type NativeCityExchangeBeat = "enemyGuard" | "knockdown" | "koLand" | "dodge" | "dashDodge" | "parry" | "parryGroggy" | "guardBreak"
  | "parryWhiff" | "clash" | "dashBlock" | "block"
  /** The red grab caught him (`grab`) / threw him (`throw`), 2026-10-14. */
  | "grab" | "throw";


export type NativeCityFightSimEvent =
  /**
   * The fight clock stepped (`stepNativeCityFightSim`): this frame's screen and fight ms, the free (unfrozen) screen ms, whether he was
   * spinning before the step; his KO after it (or the one that ended — `stood`), `landed` when its drawn body met the ground; the locked
   * facing / heading right then (the KO dust lands behind him).
   */
  | { readonly kind: "stepped"; readonly dtMs: number; readonly fightDt: number; readonly free: number; readonly spinning: boolean;
    readonly ko: NativeCityFightKo | null; readonly landed: boolean; readonly stood: NativeCityFightKo | null;
    readonly lockedFacing: VillageFacing | null; readonly lockedHeading: CityPoint | null }

  | { readonly kind: "playerDamaged"; readonly amount: number; readonly hp: number }
  /** The spin ended (`recovered`: it ran out and he turned to the nearest enemy; else a KO took it over). */
  | { readonly kind: "stunEnded"; readonly recovered: boolean }
  /** His swing's clock after this frame's step (before a hit-lag hold) — its whooshes peak before its contacts. */
  | { readonly kind: "swingClock"; readonly swing: NativeCityPlayerActionKind; readonly timeline: NativeCityPlayerSwingTimeline;
    readonly elapsedMs: number }
  /** A swing started (his rebound stops; its whooshes count from zero). */
  | { readonly kind: "swingStart" }

  | { readonly kind: "chainMiss" }
  /** A contact of his missed while an enemy stood close: "휙!" by his fist. */
  | { readonly kind: "playerWhiff"; readonly direction: CityPoint }
  /** The dodge started ("죄송합니다!", the ghost of its first beat). */
  | { readonly kind: "dodgeStart" }
  /** The close-range vault started ("죄송합니다!" and the bow): over KUMA along `direction`, drawn at `facing`. */
  | { readonly kind: "vaultStart"; readonly direction: CityPoint; readonly facing: VillageFacing }
  /** The vault landed behind him (facing back): the landing's dust. */
  | { readonly kind: "vaultLanded"; readonly direction: CityPoint }
  /** The ←← backstep pushed off: away from the opponent along `direction`, drawn at `facing` (toward him). */
  | { readonly kind: "backstepStart"; readonly direction: CityPoint; readonly facing: VillageFacing }
  /** The backstep's feet are down again: the landing's dust. */
  | { readonly kind: "backstepLanded"; readonly direction: CityPoint }
  /** An enemy's guard took his contact (both froze `freeze`): `victim` / `radius` its feet and body. */
  | { readonly kind: "enemyGuard"; readonly enemy: string; readonly victim: CityPoint; readonly radius: number; readonly push: CityPoint;
    readonly freeze: number; readonly fxHeight?: number }
  /** KUMA's body takes his blow's feel (`markImpact` — the final tier, armour, the hook's uppercut stretch). */
  | { readonly kind: "kumaImpact"; readonly tier: NativeCityImpactTier; readonly armored: boolean; readonly uppercut: boolean;
    /** Horizontal flick / whip: the drawn body absorbs it with planted feet. */
    readonly grounded?: boolean;
    /** The heel drop crushed him flat (`feel.impact.squash.crush`). */
    readonly crush?: boolean }
  /**
   * His jumping heel drop met the ground (its contact moment, landed or not): `heel` where the heel struck (plan), `direction` the swing's;
   * `hit`: it landed on an enemy's body (not his guard or armour).
   */
  | { readonly kind: "heelDrop"; readonly heel: CityPoint; readonly direction: CityPoint; readonly hit: boolean }
  /**
   * KUMA's launch ran into the end of the stage line (a wall, the edge of the ground, a body) with `strides` still to go: he splats on it
   * at `point` (plan), flying along `direction` — both clocks hold `freeze`.
   */
  | { readonly kind: "kumaWall"; readonly point: CityPoint; readonly direction: CityPoint; readonly strides: number; readonly freeze: number }
  /**
   * The air combo (`kuma.rhythm.launch.air`): his spiked body bounced off the ground (`bounce` — both clocks hold `freeze`) or he landed out of
   * the air into the knockdown (`land`), at `point` (plan).
   */
  | { readonly kind: "kumaAir"; readonly beat: "bounce" | "land"; readonly point: CityPoint; readonly freeze: number }
  /**
   * His contact landed on an enemy: the shared beat at freeze `stop` (`skidUnits`: its push), his rebound, the impact sound. `stopTier`:
   * the tier it freezes — and lands its camera, burst and rebound — as (a counter chained off an earlier counter's flinch is its own
   * swing's tier; the counter colour stays `tier`'s); `accent`: what the blow is in the exchange (the presenter's accent budget);
   * `damage`: the HP it took off the enemy (the floating damage number — every enemy reports it the same way).
   */
  | { readonly kind: "playerHit"; readonly enemy: string; readonly damage: number; readonly tier: NativeCityImpactTier; readonly armored: boolean; readonly victim: CityPoint;
    readonly push: CityPoint; readonly stop: number; readonly skidUnits: number; readonly speedLines: boolean; readonly stopTier: NativeCityImpactTier;
    readonly accent: NativeCityHitAccent | null; readonly motion?: NativeCityContactMotion; readonly fxHeight?: number;
    /** The contact's own burst inset (`NativeCitySwingContact.fxInset`, presentation only; absent = `feel.fx.contactInset`). */
    readonly fxInset?: number;

    readonly super?: true;
    /** His air V (the spike, `player.air.v`) landed: its own bigger burst and thump (`player.air.v.fx`, 2026-10-21). */
    readonly spike?: true;
    /** A beat of his super's follow-up (its index in his awakening's beats — `CityFightAwakening`, 2026-10-23). */
    readonly followUp?: number }
  /** KUMA's own beats on top of the shared hit (the finisher burst, the hook through his guard, his tells, the knockdown). */
  | { readonly kind: "kumaLanded"; readonly taken: KumaCombatHit; readonly victim: CityPoint; readonly origin: CityPoint; readonly push: CityPoint;
    readonly impact: NativeCityImpactTier; readonly stopTier: NativeCityImpactTier; readonly ender: boolean; readonly wasGuarding: boolean;
    readonly freeze: number;

    readonly meleeTier: NativeCityMeleeTier; readonly chainBeat: 1 | 2 | null }
  /** The finale steps (`id`): a new one cues the webtoon's finisher page. */
  | { readonly kind: "finaleTick"; readonly id: number }
  /** KUMA's KO body met the ground (the koLand freeze is set): dust, shake, thud. */
  | { readonly kind: "finaleLanded"; readonly side: number }
  /** After the landing check: whether he has landed and the finale's screen ms (the victory page waits `afterLandMs` from the landing). */
  | { readonly kind: "finaleSettled"; readonly id: number; readonly landed: boolean; readonly screenMs: number }
  /** The calling card flies (`impactMs`: his landing, fight ms from the blow). */
  | { readonly kind: "callingCard"; readonly side: number; readonly impactMs: number }

  | { readonly kind: "bow" }
  /** KUMA's slam met the ground (`hit`: it reached him and was not dodged). */
  | { readonly kind: "slamGround"; readonly direction: CityPoint; readonly hit: boolean }
  /** KUMA's swing missed him (not the slam, not through his invulnerability): "휙!" when it passed close, once per swing. */
  | { readonly kind: "kumaWhiff"; readonly action: NativeCityKumaActionKind; readonly attackId: number }
  /** A blow passed over his dodge (a miss). */
  | { readonly kind: "dodged"; readonly direction: CityPoint }
  /**
   * The opponent's chance opened (`kuma.rhythm.chance`): a grade's best answer read it (2026-10-19 읽기 보상 — `dodge`: a just evade of a gold
   * swing, `parry`: the ring's counter). A block or a plain dodge that opens none was only a safe answer.
   */
  | { readonly kind: "chanceOpened"; readonly chance: NativeCityKumaChanceKind }
  /** He parried (`broke`: KUMA dropped into the groggy break); `forward`: his facing's screen side (the ring on his palm). */
  | { readonly kind: "parried"; readonly push: CityPoint; readonly broke: boolean; readonly freeze: number; readonly forward: -1 | 1;
    /** His swing was cut by it (his view drops the reaction, rebound and impact in flight). */
    readonly cut: boolean;
    /** V's counter cut it (`kuma.rhythm.counter`, 2026-10-18), not a guard press: the heel goes in next. */
    readonly counter?: true }
  /** His guard met the blow (`heavy`: a clash; `broke`: it emptied the gauge). */
  | { readonly kind: "blocked"; readonly heavy: boolean; readonly broke: boolean; readonly push: CityPoint; readonly freeze: number }
  /** His guard broke: the long stagger at `facing` (`stunMs`) — the drawn hit reaction. */
  | { readonly kind: "guardBroken"; readonly facing: VillageFacing; readonly stunMs: number }
  /**
   * An enemy's grab caught him (`kuma.grab`, 2026-10-14 — "덥석!"): held, facing back along `push` (the grab's axis, enemy → him), both froze
   * `freeze`.
   */
  | { readonly kind: "grabbed"; readonly enemy: string; readonly push: CityPoint; readonly freeze: number }
  /** The hold's throw never came: he was dropped where he stood. */
  | { readonly kind: "grabDropped" }
  /**
   * His throw (the launch curve) ran into the end of the stage line with `strides` still to go: he splats on it at `point` (plan), flying
   * along `direction` — both clocks hold `freeze`, and he lands there.
   */
  | { readonly kind: "playerWall"; readonly point: CityPoint; readonly direction: CityPoint; readonly strides: number; readonly freeze: number }

  | { readonly kind: "superFlash"; readonly by: string; readonly point: CityPoint }

  | { readonly kind: "summonReflected"; readonly point: CityPoint; readonly direction: CityPoint }
  /** A parry re-press whiffed (`broke`: it emptied the gauge); `forward`: his facing's screen side. */
  | { readonly kind: "guardWhiff"; readonly broke: boolean; readonly forward: -1 | 1 }
  /** An enemy's blow landed on him (its contact frame): the shared beat on his body. */

  | { readonly kind: "foeFollowUpBeat"; readonly beat: number; readonly damage: number }
  | { readonly kind: "struckBy"; readonly enemy: string; readonly tier: NativeCityImpactTier; readonly freezeMs: number; readonly skidUnits: number;
    readonly push: CityPoint; readonly contactHeight: number; readonly speedLines: boolean; readonly contact?: "hook" | "stone" }

  | { readonly kind: "kumaRecoil"; readonly attackId: number; readonly hitIndex: number; readonly push: CityPoint; readonly pushbackPx: number;
    readonly freezeMs: number; readonly followTier: NativeCityImpactTier | null; readonly blocked: boolean }

  | { readonly kind: "kumaStrikeLanded"; readonly tier: NativeCityImpactTier; readonly freeze: number; readonly push: CityPoint; readonly dash: boolean;
    /** His super's contact (`super`): its big drawn strike. `damage`: the HP it took when it opened his follow-up (`NativeCityFoeFollowUp`). */
    readonly super?: true; readonly damage?: number }
  /**
   * The blow's outcome: knocked out, spinning (`stunTotalMs`, `knockUnits` — the launch) or the hit reaction, at `facing` (`stunMs` its
   * lock); `reaction`: the procedural recoil's tier; `direction`: the enemy's strike direction (the dash's impact dots).
   */
  | { readonly kind: "blowOutcome"; readonly outcome: NativeCityBlowKind; readonly facing: VillageFacing; readonly stunMs?: number;
    readonly reaction: NativeCityMeleeTier; readonly push: CityPoint; readonly direction: CityPoint; readonly stunTotalMs: number;
    readonly knockUnits: number | null;

    readonly landing?: NativeCityKoLanding;
    /** A later contact of the attack whose hit lock he is in went on with it (one flinch per move): the drawing does not start over. */
    readonly continued?: boolean }
  /** The fight's sounds (`NativeCityFightEvent` "sound": a blow on him, his body falling). */
  | Extract<NativeCityFightEvent, { kind: "sound" }>
  /** The exchange beat that just happened. */
  | { readonly kind: "exchange"; readonly beat: NativeCityExchangeBeat }
  /** KUMA turned neutral (the KO, his recovery, the defeat card's "돌아가기"). */
  | { readonly kind: "calm"; readonly id: string }
  /** A host enemy knocked him out (Otto: that attempt is over — his encounter's). */
  | { readonly kind: "playerDown"; readonly by: string }
  /** His contact reached Otto (`ottoTakeHit`): it went in (`hit`) or Otto's guard took it; `defeated`: Otto's HP hit 0 (his win is the encounter's). */
  | { readonly kind: "ottoTook"; readonly outcome: "hit" | "guard"; readonly defeated: boolean; readonly impact?: NativeCityOttoImpact }
  /** HP, factions or the exchange changed: the HUD refreshes. */
  | { readonly kind: "changed" };

export interface NativeCityFightSimResult<K> {
  readonly state: NativeCityFightSimState;
  readonly kuma: K;
  /** Otto's next rule state (the call's `ctx.otto`), or null when none came in. */
  readonly otto: OttoState | null;
  readonly events: readonly NativeCityFightSimEvent[];
}

/** Screen vector of a heading, for turning a standing facing into a plan direction. */
export const NATIVE_CITY_FACING_SCREEN: Readonly<Record<VillageFacing, CityPoint>> = Object.freeze({
  right: [1, 0], "down-right": [1, 1], down: [0, 1], "down-left": [-1, 1],
  left: [-1, 0], "up-left": [-1, -1], up: [0, -1], "up-right": [1, -1],
});


export const SPIN_ORDER: readonly VillageFacing[] = ["down", "down-right", "right", "up-right", "up", "up-left", "left", "down-left"];

/**
 * How many facings the spin has turned `ageMs` into a `totalMs` spin: its rate falls linearly from `spinStartFps` to `spinEndFps`
 * (facings per second), so it whirls first and slows to the end.
 */
export function nativeCitySpinSteps(ageMs: number, totalMs: number, spec = NATIVE_CITY_COMBAT.player.stun): number {
  const total = Math.max(1, totalMs), u = Math.max(0, Math.min(1, ageMs / total));
  return Math.floor(total / 1000 * (spec.spinStartFps * u + (spec.spinEndFps - spec.spinStartFps) * u * u / 2) + 1e-9);
}

/** Plan direction whose projection points along `screen` (inverse of the linear projection). */
export function nativeCityPlanFromScreen(projection: NativeCityDefinition["projection"], screen: CityPoint): CityPoint | null {
  const plan = cityScreenToPlan(projection, screen, 1e-9);
  if (plan === null) return null;
  const [px, py] = plan, length = Math.hypot(px, py);
  return length < 1e-9 ? null : [px / length, py / length];
}

export const nativeCityUnit = (v: CityPoint): CityPoint | null => {
  const length = Math.hypot(v[0], v[1]);
  return length < 1e-9 ? null : [v[0] / length, v[1] / length];
};


export function nativeCityFightFrameMs(dtMs: number, paused: boolean): number {
  return paused || !Number.isFinite(dtMs) ? 0 : Math.max(0, Math.min(NATIVE_CITY_MOVEMENT.maxDtMs, dtMs));
}

// ── the working frame: a mutable draft of the state while one call runs (the call returns it frozen) ──────────────────────────

/** The state while a call runs. */
export interface FightDraft {
  fight: NativeCityFightState;
  swing: NativeCityPlayerSwingState;
  defense: NativeCityPlayerDefenseState;
  queued: NativeCityQueuedPress | null;
  pursuit: NativeCityFightSimState["pursuit"];
  chain: { next: number; idleMs: number; missed: boolean };
  enderGateMs: number;
  guardUp: boolean;
  stance: { readonly facing: VillageFacing; readonly heading: CityPoint };
  lockedFacing: VillageFacing | null;
  lockedHeading: CityPoint | null;
  lean: "left" | "right";
  meter: number;
  released: boolean;
  finale: { -readonly [Key in keyof NativeCityFightFinale]: NativeCityFightFinale[Key] } | null;
  finales: number;
  followUp: CityFightFollowUpRun | null;
  foeFollowUp: CityFightFollowUpRun | null;
  vault: NativeCityPlayerVault | null;
  backstep: NativeCityPlayerBackstep | null;
  backstepCooldownMs: number;
}

/** One call's working frame: the draft, KUMA's state and the factions as they change, the call's inputs and its events so far. */
export interface FightFrame<K> {
  readonly s: FightDraft;

  hp: number;
  kuma: K;
  /** Otto's rule state as this call changes it (null: no attempt here). */
  otto: OttoState | null;
  factions: NativeCityFactionMap;
  readonly ctx: NativeCityFightSimContext<K>;
  readonly events: NativeCityFightSimEvent[];
}

export function openFightFrame<K>(state: NativeCityFightSimState, ctx: NativeCityFightSimContext<K>): FightFrame<K> {
  return { s: { ...state, chain: { ...state.chain }, finale: state.finale ? { ...state.finale } : null,
    followUp: state.followUp }, kuma: ctx.kuma,
    otto: ctx.otto?.state ?? null, factions: ctx.factions, ctx, events: [], hp: ctx.hp };
}

export function freezeFightDraft(s: FightDraft): NativeCityFightSimState {
  return Object.freeze({ fight: s.fight, swing: s.swing, defense: s.defense, queued: s.queued ? Object.freeze({ ...s.queued }) : null,
    pursuit: s.pursuit ? Object.freeze({ ...s.pursuit }) : null,
    chain: Object.freeze({ ...s.chain }), enderGateMs: s.enderGateMs, guardUp: s.guardUp, stance: Object.freeze({ ...s.stance }),
    lockedFacing: s.lockedFacing, lockedHeading: s.lockedHeading, lean: s.lean, released: s.released,
    finale: s.finale ? Object.freeze({ ...s.finale }) : null, finales: s.finales, followUp: s.followUp, foeFollowUp: s.foeFollowUp,
    vault: s.vault, backstep: s.backstep,
    backstepCooldownMs: s.backstepCooldownMs, meter: s.meter });
}

export function closeFightFrame<K>(f: FightFrame<K>): NativeCityFightSimResult<K> {
  return { state: freezeFightDraft(f.s), kuma: f.kuma, otto: f.otto, events: f.events };
}

export const emit = <K>(f: FightFrame<K>, event: NativeCityFightSimEvent): void => { f.events.push(event); };

// ── shared rules ──────────────────────────────────────────────────────────────────────────────────────────────────────────


export interface FightEnemy {
  readonly id: string;
  /** 적으로 이 화면에 서 있다(가드가 이쪽으로 돌고, 내딛기가 몸 앞에서 멈춘다). */
  readonly engaged: boolean;
  /** 지금 칠 수 있다(서 있고 쓰러져 있지 않다 — 조준 보정도 이것만 끌어당긴다). */
  readonly vulnerable: boolean;
  readonly point: CityPoint;
  readonly radius: number;
  readonly invulnerableMs: number;
  /** 이 적에게 쓰러지면 패배 카드가 뜬다(그 "다시"는 이 적과의 재대결). 아니면 그 시도가 끝난다(`playerDown`). */
  readonly defeatCard: boolean;

  readonly rules: CityFightFoeRules;

  readonly vaultable: boolean;

  readonly blow: NativeCityEnemyBlow | null;
  /** He lies on the ground and V's ground blow can still reach him (`kuma.rhythm.down`): V runs in like C's chase. Absent: no. */
  readonly grounded?: boolean;

  readonly air?: { readonly heightBodies: number; readonly hitsLeft: boolean; heightAfter(ms: number): number;
    /** He bounced off the ground after the spike: the ground blows take him there (no jump). */
    readonly bounced?: boolean };

  readonly growsPush?: boolean;
}

export const playerRadius = <K>(f: FightFrame<K>): number => nativeCityFootprintRadius("player", f.ctx.stepUnits);
export const swinging = (s: Pick<FightDraft, "swing">): boolean => s.swing.current !== null;
export const hitLocked = (s: Pick<FightDraft, "fight">): boolean => nativeCityFightHitLocks(s.fight.hit);


export function walkCancellable(s: Pick<FightDraft, "swing" | "enderGateMs">): boolean {
  // A V charge plants his feet: X, Z and the backstep cut it, a walk does not (`player.actions.attack.charge`).
  return nativeCityPlayerSwingCancellable(s.swing, "other") && s.enderGateMs <= 0 && !nativeCityPlayerSwingCharging(s.swing);
}

/**
 * Swinging (until its cancel point — a walk then cuts the rest), staggered by a blow, knocked down, dodging, block-stunned, parrying,
 * bowing or spinning: walking and clicking wait.
 */
export function fightLocksMovement(s: Pick<FightDraft, "swing" | "enderGateMs" | "fight" | "defense" | "vault" | "backstep">): boolean {
  return swinging(s) && !walkCancellable(s) || hitLocked(s) || playerIncapacitated(s) || nativeCityDefenseLocksMovement(s.defense)
    || nativeCityPlayerVaultLocks(s.vault) || nativeCityPlayerBackstepLocks(s.backstep);
}


export function playerIncapacitated(s: Pick<FightDraft, "fight" | "defense">): boolean {
  return s.fight.ko !== null || s.fight.grab !== null || s.fight.stun !== null || nativeCityDefenseBowing(s.defense);
}

/**
 * A press (C / V / X / ←← or one waiting in the queue) is dropped now: incapacitated, past his finisher (the KO plays to his bow), while
 * his awakening's follow-up does the rest (`followUp` — 2026-10-23 user: the downed opponent is struck by the card, not by his foot), or
 * while the opponent's awakening's follow-up has him (`foeFollowUp` — its beats hold him between them).
 */
export function playerPressDropped(s: Pick<FightDraft, "fight" | "defense" | "finale" | "followUp" | "foeFollowUp">): boolean {
  return s.finale !== null || s.followUp !== null || s.foeFollowUp !== null || playerIncapacitated(s);
}

/**
 * The guard may be up now (2026-10-17: the guard's rise `stepGuard` and the defense against a blow `defendAgainst` read this one rule —
 * the defense used to skip the grab, the spin, the vault and the backstep): not swinging, not in a hit lock, not incapacitated, not
 * dodging, and no vault or backstep holding his feet. The block stun and the parry pose do not keep it down.
 */
export function playerFreeToGuard(s: Pick<FightDraft, "swing" | "fight" | "defense" | "vault" | "backstep">): boolean {
  return !swinging(s) && !hitLocked(s) && !playerIncapacitated(s) && !nativeCityDefenseDodging(s.defense) && !nativeCityPlayerVaultLocks(s.vault)
    && !nativeCityPlayerBackstepLocks(s.backstep);
}


export type PlayerInterruptPart = "swing" | "queue" | "chain" | "moves" | "defense" | "guard" | "hitTail";


export function interruptPlayer(s: FightDraft, parts: readonly PlayerInterruptPart[]): void {
  if (parts.includes("moves")) { endVault(s); endBackstep(s); }
  if (parts.includes("defense")) s.defense = interruptNativeCityDefense(s.defense);
  if (parts.includes("guard")) s.guardUp = false;
  if (parts.includes("swing")) s.swing = cancelNativeCityPlayerSwing(s.swing);
  if (parts.includes("queue")) s.queued = null;
  if (parts.includes("chain")) { s.chain.next = 0; s.chain.missed = false; }
  if (parts.includes("hitTail")) s.fight = cutNativeCityFightHit(s.fight);
}

/**
 * Locked by something that ends on its own — a press waits for it: the hit lock, a block stun, the parry pose, the dodge, the vault, the
 * backstep.
 */
export function inputLocked(s: FightDraft): boolean {
  return hitLocked(s) || nativeCityDefenseBlockStunned(s.defense) || nativeCityDefenseParrying(s.defense) || nativeCityDefenseDodging(s.defense)
    || nativeCityPlayerVaultLocks(s.vault) || nativeCityPlayerBackstepLocks(s.backstep);
}

/** The backstep ends (ran out, cut by a walk / press, or a blow): it clears and its cooldown counts from now. */
export function endBackstep(s: FightDraft): void {
  if (!s.backstep) return;
  s.backstep = null;
  s.backstepCooldownMs = NATIVE_CITY_COMBAT.player.backstep.cooldownMs;
}

/** The vault ends (ran out, cut by a walk / press, or a blow): it clears and the X cooldown counts from now. */
export function endVault(s: FightDraft): void {
  if (!s.vault) return;
  s.vault = null;
  s.defense = endNativeCityVault(s.defense);
}

/** Z is held or a fresh press's parry window is open. */
export function guardWanted(s: FightDraft): boolean {
  return s.defense.held || nativeCityParryArmed(nativeCityDefensePressAgeMs(s.defense));
}

/** A press that waits (the latest wins), stamped on the fight clock. */
export function queuePress<K>(f: FightFrame<K>, kind: NativeCityQueuedPress["kind"], facing: VillageFacing, heading: CityPoint): void {
  f.s.queued = { kind, facing, heading, atMs: f.s.fight.clock.ms };
}

/** The four-diagonal heading of a straight up / down screen direction, on his lean's side. */
const verticalDiagonal = (down: boolean, lean: "left" | "right"): VillageFacing =>
  down ? (lean === "left" ? "down-left" : "down-right") : (lean === "left" ? "up-left" : "up-right");

/** The front-biased screen diagonal of a plan direction (the four-diagonal art's heading); it sets his lean. */
export function diagonalOf<K>(f: FightFrame<K>, direction: CityPoint): VillageFacing {
  const [sx, sy] = kumaScreenDelta(f.ctx.projection, direction);
  const swing = Math.abs(sx) < Math.abs(sy) * 0.05 ? verticalDiagonal(sy >= 0, f.s.lean) : nativeCityFrontBiasedDiagonal(sx, sy);
  if (swing.endsWith("left")) f.s.lean = "left"; else f.s.lean = "right";
  return swing;
}

/** The heading `action` is drawn at for the exact heading `exact` (`diagonal`: the four-diagonal fallback) — the art's resolver. */
export function facingFor<K>(f: FightFrame<K>, exact: VillageFacing, action: NativeCityPlayerArtAction, diagonal?: VillageFacing): VillageFacing {
  return f.ctx.art.facing(exact, action, { lean: f.s.lean, ...(diagonal ? { diagonal } : {}) });
}

/**
 * The heading `action` is drawn at along plan `direction` (the pack's resolver, the same one KUMA uses): the exact 8-way heading when
 * drawn there, else the clip's fallback, else the front-biased diagonal. Without the art the exact heading.
 */
export function drawnFacing<K>(f: FightFrame<K>, direction: CityPoint, action: NativeCityPlayerArtAction): VillageFacing {
  const [sx, sy] = kumaScreenDelta(f.ctx.projection, direction);
  const diagonal = diagonalOf(f, direction);
  if (Math.hypot(sx, sy) < 1e-9) return diagonal;
  return facingFor(f, villagePathFacing(sx, sy), action, diagonal);
}

/** The opponent's actor id this call (`NativeCityFightSimContext.opponentId`, KUMA's when absent). */
export function opponentOf<K>(f: FightFrame<K>): string { return f.ctx.opponentId ?? NATIVE_CITY_DEFAULT_OPPONENT_ID; }

/** The opponent stands down (neutral, back to his post) when he is an enemy: the factions change and the presenter applies it (`calm`). */
export function calmKuma<K>(f: FightFrame<K>): void {
  const id = opponentOf(f);
  if (nativeCityFaction(f.factions, id) !== "enemy") return;
  f.factions = withNativeCityFaction(f.factions, id, "neutral");
  emit(f, { kind: "calm", id });
}
