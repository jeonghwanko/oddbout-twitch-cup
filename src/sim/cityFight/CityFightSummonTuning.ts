import tuning from "../../world/native-city-summons.json";
import type { NativeCityImpactTier, NativeCityJsonShape, NativeCityKumaActionKind, NativeCityKumaGrade, NativeCityMeleeTier }
  from "./NativeCityCombatTuning";
import type { NativeCityDefenseAnswers } from "./NativeCityExchange";

/**
 * 마을 대결 소환물 수치의 형태와 그 SSOT(2026-10-20, `src/world/native-city-summons.json` → `CITY_FIGHT_SUMMONS`): 종이학·자동차처럼 시전자가
 * 내놓은 뒤 무대 선 위를 따로 움직이는 물체. 규칙(`CityFightSummons`)과 그림(`NativeCitySummonView`)이 같은 표를 읽는다.
 */

/** The summoned objects the fight knows (`native-city-summons.json` kinds). */
export type CityFightSummonKind = "crane" | "sportsCar" | "roadster" | "bolt" | "drill" | "bullet";

/**
 * How it moves (and where it leaves the stage): `fly` — glides toward the target and folds at the stage end (its nose); `drive` — drives the
 * whole stage and off the far end (its tail); `strike` (2026-10-20) — it goes to one spot (`spawn.from` `target`: it appears there; else it
 * travels there over `strike.travelMs`, the spot locked as the travel starts) and strikes it once after its charge (`strike` phases): the
 * drill bursting up under the opponent, the roadster's downward blast from the air.
 */
export type CityFightSummonMotion = "fly" | "drive" | "strike";

/**
 * A `strike`'s phases after its tell (fight ms): the travel to the spot (0: it was there from the start), the charge over it (the jets
 * spooling), the active window (a body inside the zone — `halfLengthStrides` round the spot — is struck once) and the recovery (it lands in
 * the vapour, the drill sinks); then it is spent.
 */
export interface CityFightSummonStrike {
  readonly travelMs: number;
  readonly chargeMs: number;
  readonly activeMs: number;
  readonly recoverMs: number;
}

/** An outcome on one target that ends the object (`consumeOn`): it met a body, a guard, or the blow that knocked out. */
export type CityFightSummonConsume = "hit" | "block" | "ko";


export interface CityFightSummonPlayerHit {

  readonly defendAs: NativeCityKumaActionKind;
  /** The defenses that let it pass or take it (its own, not the triangle's; `guard` false: no guard holds it). */
  readonly answers: NativeCityDefenseAnswers;
  readonly tier: NativeCityImpactTier;

  readonly contact: "hook" | "stone";
  readonly invulnerableMs: number;
  readonly stunMs: number;
  readonly knockbackStrides: number;

  readonly launch?: boolean;
  readonly knockdown?: boolean;
  readonly lieMs?: number;
}

export interface CityFightSummonSpec {
  readonly motion: CityFightSummonMotion;
  /**
   * Where it appears: `ahead` — `gapStrides` past the caster's body toward the target; `behind` — `gapStrides` behind his back (inside the
   * stage's ends); `target` — at the target's feet as the cast releases (a `strike`'s spot). Its tell (`tellMs`) shows there before it moves.
   */
  readonly spawn: { readonly from: "ahead" | "behind" | "target"; readonly gapStrides: number; readonly tellMs: number };
  /** A `strike`'s phases (its motion); absent for the others. */
  readonly strike?: CityFightSummonStrike;
  readonly speedStridesPerSec: number;
  /** Its body along the line (strides each way from its centre): what touches a target (a `strike`: the zone round its spot). */
  readonly halfLengthStrides: number;
  /** Drawn height of its centre above the ground (body heights of the fight's actor height); the rules ignore it. */
  readonly liftShare: number;

  readonly high?: boolean;
  readonly lifeMs: number;
  /** How many of this kind one caster may have out at once. */
  readonly maxLive: number;

  readonly damage: number;
  readonly consumeOn: readonly CityFightSummonConsume[];
  /** The tint its tell and rim read in (the triangle's colours — white: Z, gold: X). */
  readonly grade: NativeCityKumaGrade;
  readonly playerHit: CityFightSummonPlayerHit;
  /** On another fighter (the headless bout): its tier, and the launch it gives (strides on the launch curve). */
  readonly bout: { readonly tier: NativeCityMeleeTier; readonly launchStrides?: number };

  readonly reflect?: { readonly damage: number; readonly poise: number; readonly leadMs: number; readonly tailMs: number };
}

export interface CityFightSummonTuning {
  readonly kinds: Readonly<Record<CityFightSummonKind, CityFightSummonSpec>>;
}

/** The summons' numbers (`src/world/native-city-summons.json`), shape-checked against the interface. */
export const CITY_FIGHT_SUMMONS: CityFightSummonTuning = Object.freeze(
  (tuning satisfies NativeCityJsonShape<CityFightSummonTuning>) as unknown as CityFightSummonTuning);

export const CITY_FIGHT_SUMMON_KINDS: readonly CityFightSummonKind[] = Object.freeze(Object.keys(CITY_FIGHT_SUMMONS.kinds) as CityFightSummonKind[]);

export function cityFightSummonSpec(kind: CityFightSummonKind): CityFightSummonSpec {
  return CITY_FIGHT_SUMMONS.kinds[kind];
}

export function isCityFightSummonKind(value: unknown): value is CityFightSummonKind {
  return typeof value === "string" && Object.hasOwn(CITY_FIGHT_SUMMONS.kinds, value);
}
