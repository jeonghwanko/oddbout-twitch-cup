import type { FighterDuelStyle, FighterSkillKind } from "../../../../contracts/ai-fighter/validate.mjs";
import type { CityFighterSummonTuning, KumaBoutAiOverride, KumaTuning } from "../NativeCityKumaCombatState";
import type { CityFighterSkillTuning } from "../NativeCityKumaSkill";
import type { CityFightExchangeKind } from "./CityFightExchangeKinds";

/**
 * A registered fighter's fighting style → the server's own numbers (2026-10-27, 전투 스타일 v2 — docs/Plan/2026-10-27-oddbout-agent-world
 * 2단계). The creator picks closed choices and grades (`combat.style`, the contract's `combatStyle`); these tables turn them into KUMA's tuning
 * fields the village fighters' rows set (`CityFighters.fighterTuning`), a temperament over the bout's AI (`CityFightBoutCorner.ai`) and set-piece
 * weights. Grade 3 is the standard kit itself, and no style at all returns the tuning object untouched — a v1 fighter fights exactly as before.
 * Tables only, so the browser replay and both Edge verifiers compute the same bits.
 */

/** A skill clip's rule numbers, taken from the roster fighter who fights it (his row in `native-city-fighters.json`). */
const SKILLS: Readonly<Record<FighterSkillKind, CityFighterSkillTuning>> = Object.freeze({
  // 둘둘's "한 뼘 더": the stretched fist's tip alone lands (closer than `innerStrides`, it whiffs past).
  stretch: { kind: "stretch", action: "slam", everyAttacks: 2, inRangeEveryAttacks: 1, weight: 0.6, startStrides: 1.5, minGapStrides: 0.7,
    reachStrides: 1.6, innerStrides: 0.3 },
  pincer: { kind: "pincer", action: "slam", everyAttacks: 2, weight: 0.6, startStrides: 1, minGapStrides: 0, reachStrides: 1.2, launches: true },
  // 퀵캣's "무지개 항로": a fixed run through the other's body to its end, one touch.
  flight: { kind: "flight", action: "dash", everyAttacks: 2, inRangeEveryAttacks: 1, weight: 0.6, startStrides: 3, minGapStrides: 1.2,
    topSpeedStrides: 11, maxTravelStrides: 5.5, launches: true },
  // 브라보우's "시선 페인트": the run may stop at its branch point.
  feint: { kind: "feint", action: "dash", everyAttacks: 2, inRangeEveryAttacks: 1, weight: 0.6, startStrides: 3, minGapStrides: 1.2,
    topSpeedStrides: 9, maxTravelStrides: 4.5, branchShare: 0.5, aiShare: 0.4, launches: true },
  slide: { kind: "slide", action: "dash", everyAttacks: 2, inRangeEveryAttacks: 1, weight: 0.6, startStrides: 3.2, minGapStrides: 1.4,
    topSpeedStrides: 10, maxTravelStrides: 5, endSpeedShare: 0.35, launches: true, leaves: "ice", passThrough: true },
  // 버팀's "늦었지만 반격": a frontal blow met in the stance's window is stopped and struck back at once; an empty window is his opening.
  counter: { kind: "counter", action: "slam", everyAttacks: 3, weight: 0.5, startStrides: 1, minGapStrides: 0, reachStrides: 0.7, launches: true },
  // 시큰둥's "여기까지": the stance guards, and a shove follows the block (the AI's after its beat).
  brace: { kind: "brace", action: "slam", everyAttacks: 3, weight: 0.5, startStrides: 1, minGapStrides: 0, reachStrides: 0.85, followMs: 450,
    aiFollowMs: 120, launches: true },
} as unknown as Readonly<Record<FighterSkillKind, CityFighterSkillTuning>>);

/** A summon slot (one per fighter), at the roster summoners' quieter cadence; cast from his slam clip (a registered pack draws no `summon`). */
const SUMMONS: Readonly<Record<NonNullable<FighterDuelStyle["summon"]>, CityFighterSummonTuning>> = Object.freeze({
  crane: { kind: "crane", weight: 0.5, everyAttacks: 2, minGapStrides: 0.4, startStrides: 4, damageScale: 1 },
  bolt: { kind: "bolt", weight: 0.5, everyAttacks: 2, minGapStrides: 0.3, startStrides: 4.2, damageScale: 1 },
  sportsCar: { kind: "sportsCar", weight: 0.5, everyAttacks: 2, minGapStrides: 0.4, startStrides: 4, damageScale: 1 },
  roadster: { kind: "roadster", weight: 0.5, everyAttacks: 2, minGapStrides: 0.4, startStrides: 4.5, damageScale: 1 },
});

/** His shockwave slam's reach beyond contact (strides — the roster's 0.8..1). */
const SHOCKWAVE_REACH = 0.9;
/** Engagement distance: his swings start at KUMA's distance × this (grade 1 closes in, 5 swings from further). */
const DISTANCE = [0.88, 0.94, 1, 1.06, 1.12] as const;
/** Temperament grades: share multipliers over the bout's (guard, retreat, measure) and his stand's shift (patience, ms). */
const SHARE = [0.4, 0.7, 1, 1.3, 1.6] as const;
const PATIENCE_MS = [-90, -45, 0, 70, 140] as const;
/** Set-piece weights: grade 0 never, 1 half, 2 the default, 3 twice. */
const EXCHANGE = [0, 0.5, 1, 2] as const;

const at = <T>(table: readonly T[], grade: number, base: number): T => {
  const value = table[grade - base];
  if (value === undefined) throw new Error(`registered style grade out of range: ${grade}`);
  return value;
};

/** `base` (KUMA's raw tuning) under his style: the same object when he has none. */
export function registeredDuelStyleTuning(base: KumaTuning, style: FighterDuelStyle | null | undefined): KumaTuning {
  if (!style) return base;
  // His quick cut counts half (the roster's cut is 10..25 % of the swings; a third at most here — a cut-heavy rotation lost most bouts).
  const mix = style.mix, fast = mix ? mix.fast / 2 : 0;
  const total = mix ? mix.slam + mix.combo + fast : 0;
  const scale = style.distance === undefined ? 1 : at(DISTANCE, style.distance, 1);
  const floor = base.stopStrides + 0.05;
  // KUMA's swings start at one distance (`attackStartStrides`); his own start his three swings at it × the grade's scale.
  const start = scale === 1 ? base.attackStartStridesBy : { ...base.attackStartStridesBy,
    ...Object.fromEntries((["slam", "combo", "fast"] as const).map(action =>
      [action, Math.max(floor, (base.attackStartStridesBy?.[action] ?? base.attackStartStrides) * scale)])) };
  const summon = style.summon ? SUMMONS[style.summon] : null;
  return Object.freeze({ ...base,
    ...(mix && total > 0 ? { attackMix: { slam: mix.slam / total, combo: mix.combo / total, fast: fast / total } } : {}),
    ...(style.special ? { antiKite: { ...base.antiKite, action: style.special },
      knockdown: { ...base.knockdown, wakeup: { ...base.knockdown.wakeup, reversalAction: style.special } } } : {}),
    ...(style.super ? { superAction: style.super } : {}),
    ...(scale !== 1 ? { attackStartStridesBy: start } : {}),
    ...(style.shockwave ? { slamShockwave: { reachExtraStrides: SHOCKWAVE_REACH } } : {}),
    ...(style.skill ? { skill: SKILLS[style.skill] } : {}),
    ...(summon ? { summons: Object.freeze([summon]),
      attackStartStridesBy: { ...start, summon: Math.max(summon.minGapStrides, summon.startStrides) } } : {}) });
}

/** His temperament over the bout's AI (`kumaBoutAiWith`), or undefined — the bout's own, every grade 3 included. */
export function registeredDuelStyleAi(style: FighterDuelStyle | null | undefined, bout: {
  readonly measureShare: number; readonly retreatShare: number; readonly guardShare: number; readonly standMs: readonly [number, number] }): KumaBoutAiOverride | undefined {
  const temper = style?.temper;
  if (!temper) return undefined;
  const share = (grade: number | undefined, base: number) => grade === undefined ? undefined : Math.min(1, base * at(SHARE, grade, 1));
  const shift = temper.patience === undefined ? 0 : at(PATIENCE_MS, temper.patience, 1);
  const override: KumaBoutAiOverride = {
    ...(temper.guard !== undefined && temper.guard !== 3 ? { guardShare: Math.min(share(temper.guard, bout.guardShare)!, 0.8) } : {}),
    ...(temper.retreat !== undefined && temper.retreat !== 3 ? { retreatShare: share(temper.retreat, bout.retreatShare)! } : {}),
    ...(temper.measure !== undefined && temper.measure !== 3 ? { measureShare: share(temper.measure, bout.measureShare)! } : {}),
    ...(shift !== 0 ? { standMs: [Math.max(0, bout.standMs[0] + shift), Math.max(0, bout.standMs[1] + shift)] as const } : {}),
  };
  return Object.keys(override).length > 0 ? Object.freeze(override) : undefined;
}

/** His set-piece weights, or undefined (the defaults). */
export function registeredDuelStyleExchanges(style: FighterDuelStyle | null | undefined): Readonly<Partial<Record<CityFightExchangeKind, number>>> | undefined {
  const grades = style?.exchanges;
  if (!grades) return undefined;
  const weights = Object.fromEntries(Object.entries(grades).filter(([, grade]) => grade !== 2).map(([kind, grade]) => [kind, at(EXCHANGE, grade, 0)]));
  return Object.keys(weights).length > 0 ? Object.freeze(weights) : undefined;
}
