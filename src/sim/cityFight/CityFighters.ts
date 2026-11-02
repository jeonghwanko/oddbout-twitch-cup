import FIGHTERS_JSON from "../../world/native-city-fighters.json";
import { CITY_FIGHTER_IDS } from "./CityFighterIds";
import { nativeCityFighterMeasure, type NativeCityFighterMeasure } from "../../world/NativeCityFighterMeasure";
import { NATIVE_CITY_STEP_BODY_RATIO } from "../../world/NativeCityTalkSpot";
import { NATIVE_CITY_FOOTPRINT_STRIDES, type NativeCityFootprintKind } from "../NativeCityActorCollision";
import { NATIVE_CITY_KUMA_POST, type KumaPatrolPlan } from "./NativeCityKumaPatrol";
import type { CityFighterSummonTuning, KumaTuning } from "./NativeCityKumaCombatState";
import { NATIVE_CITY_COMBAT, type NativeCityJsonShape, type NativeCityKumaActionKind } from "./NativeCityCombatTuning";
import type { CityFighterSkillTuning, CityFighterSuperSkillTuning } from "./NativeCityKumaSkill";
import type { CityFighterAirChaseTuning } from "./NativeCityKumaAirChase";


export interface CityFighterRules {
  /** KUMA (`kuma`) or a skin's id (`yume`). */
  readonly id: string;
  /** His id in the fight (session, factions, enemy events), dialogue and sprites: `kuma`, `yume` (= `id`). */
  readonly actorId: string;
  /** The skin he is drawn with (`NativeCityKumaSkin`); null for KUMA's own art. */
  readonly skinId: string | null;
  /** His post: patrol points, alert radius and his drawn body scale (measured for a skinned fighter). */
  readonly plan: KumaPatrolPlan;
  /** His fight: KUMA's, with his own numbers and reach over it. */
  readonly tuning: KumaTuning;
  readonly footprint: NativeCityFootprintKind;
  /** Challenging him locks the fight to a side-scroll stage. */
  readonly sideScroll: boolean;
  /**
   * A tournament guest (2026-10-18, `roster: "guest"`): he does not live in the village. His art loads when the bracket board opens and he
   * fights the player only in the tournament arena (`ArenaScene`); his post is unused.
   */
  readonly guest: boolean;
}

/** One skinned fighter's authored numbers (`native-city-fighters.json`; its note carries the measurements and the HP math). */
interface CityFighterSpec {
  readonly pack: string;
  readonly post: KumaPatrolPlan["points"];
  /**
   * The post's body scale the measure bake falls back to when his skin names none (`measureNativeCityFighterPack`,
   * `tools/art/measure-city-fighters.mjs`). Bake input only: the runtime reads the baked `bodyScale` (`native-city-fighter-measure.json`).
   */
  readonly bodyScale: number;
  readonly footprint: NativeCityFootprintKind;
  readonly sideScroll: boolean;
  /** `guest`: a tournament guest (`CityFighterRules.guest`); absent: he lives in the plaza. */
  readonly roster?: "plaza" | "guest";
  readonly hp: number;
  readonly damageScale: number;
  readonly cooldownMs: readonly [number, number];
  readonly attackMix: NonNullable<KumaTuning["attackMix"]>;
  /** What his anti-kite lunge and wake-up reversal throw (KUMA: the plain `fast`). */
  readonly specialAction: NativeCityKumaActionKind;
  /** The swing his full meter buys (`KumaTuning.superAction`, 2026-10-20); absent: `super.kumaAction`. */
  readonly superAction?: NativeCityKumaActionKind;
  /** His swings' reach off his clips: clamped to [`minExtraStrides`, `maxExtraStrides`] beyond contact, each swing started at `share`. */
  readonly reach: { readonly share: number; readonly minExtraStrides: number; readonly maxExtraStrides: number };

  readonly slamShockwave?: NonNullable<KumaTuning["slamShockwave"]>;
  /**
   * The summoned objects he casts, one slot each (2026-10-20, `KumaTuning.summons`; docs/kaito-web/city-fight-summons.md). `damageScale`
   * absent: his own. Absent: he never summons.
   */
  readonly summons?: readonly CityFighterSummonRow[];

  readonly actions?: Readonly<Partial<Record<NativeCityKumaActionKind, { readonly damage: readonly number[] }>>>;
  /** His clips are authored at fight speed (`KumaFighterOverrides.drawnClips`). */
  readonly drawnClips?: boolean;

  readonly grab?: {
    readonly every: number;

    readonly superOnly?: boolean;
    readonly superThrowStrides?: number;

    readonly move?: string;
  };
  /** His own skill (2026-10-22, the ODDBOUT event fighters — `KumaTuning.skill`, `NativeCityKumaSkill`). Absent: none. */
  readonly skill?: CityFighterSkillTuning & { readonly note?: string };
  /** His second move (2026-10-25, `KumaTuning.skill2`): another kind than `skill`, drawn by his pack's `skill2` clip. */
  readonly skill2?: CityFighterSkillTuning & { readonly note?: string };

  readonly highActions?: readonly NativeCityKumaActionKind[];
  /** His air chase after his launching skill (2026-10-22 — `KumaTuning.airChase`, `NativeCityKumaAirChase`). Absent: none. */
  readonly airChase?: CityFighterAirChaseTuning & { readonly note?: string };
  /** His super as his skill's super form (2026-10-22 4차 — `KumaTuning.superSkill`, `NativeCityKumaSkill`). Absent: his `superAction`. */
  readonly superSkill?: CityFighterSuperSkillTuning & { readonly note?: string };
  /** His vault over the other in a bout (2026-10-23 2차 — `KumaFighterOverrides.vault`, his pack's `vault` clip's length). Absent: none. */
  readonly vault?: { readonly ms: number };
  /** His knockdown's and KO's slide (2026-10-22 5차 — `KumaTuning.downSlide`). Absent: none. */
  readonly downSlide?: { readonly strides: number; readonly koStrides: number; readonly ms: number; readonly note?: string };
}

/** A summon slot as a fighter's row gives it (`damageScale` absent: his own). */
type CityFighterSummonRow = Omit<CityFighterSummonTuning, "damageScale"> & { readonly damageScale?: number };

const SPECS = (FIGHTERS_JSON.fighters satisfies NativeCityJsonShape<Readonly<Record<string, CityFighterSpec>>>) as unknown as
  Readonly<Record<string, CityFighterSpec>>;

/**
 * A skinned fighter's fight over KUMA's: his HP, his damage × `damageScale`, his attack mix and stand, his lunge / reversal special,
 * his shockwave slam. Guard, counter, armour, poise and every feel number stay KUMA's.
 */
function fighterTuning(spec: CityFighterSpec): KumaTuning {
  const kuma = NATIVE_CITY_COMBAT.kuma, scale = Math.max(0, spec.damageScale);
  const actions = Object.fromEntries(Object.entries(kuma.actions).map(([kind, action]) =>
    [kind, { ...action, damage: (spec.actions?.[kind as NativeCityKumaActionKind]?.damage ?? action.damage).map(damage => damage * scale) }])) as unknown as KumaTuning["actions"];
  // KUMA's three shifts (`kuma.phases`) are his own: a skinned fighter keeps one shift, his fight as before. The duel's rhythm
  // (`kuma.rhythm`) is every fighter's since 2026-10-20 (user: 무투장 머리 위 V 키캡에 게이지가 안 나온다 — the badge taught V's counter
  // and the gold just vault on fighters that had neither): the counter ring, the chance, the armour's bounce, the late beat, the ground
  // blow. A fighter-against-fighter bout still fights without it (`createCityFightFighterBout`).
  // His two skills are two kinds (2026-10-25, `KumaTuning.skill2`): a special names its skill by kind.
  if (spec.skill2 && spec.skill?.kind === spec.skill2.kind) throw new Error(`fighter row: skill2 is the same kind as skill (${spec.skill2.kind})`);
  return Object.freeze({ ...kuma, phases: undefined, hp: spec.hp, actions, attackMix: spec.attackMix, cooldownMs: spec.cooldownMs,
    ...(spec.slamShockwave ? { slamShockwave: { reachExtraStrides: spec.slamShockwave.reachExtraStrides } } : {}),
    antiKite: { ...kuma.antiKite, action: spec.specialAction }, ...(spec.superAction ? { superAction: spec.superAction } : {}),
    knockdown: { ...kuma.knockdown, wakeup: { ...kuma.knockdown.wakeup, reversalAction: spec.specialAction } },
    ...(spec.drawnClips ? { drawnClips: true as const } : {}),
    ...(spec.grab ? { fighterGrab: true as const, grab: { ...kuma.grab, every: spec.grab.superOnly ? 0 : spec.grab.every,
      ...(spec.grab.superOnly ? { turtleMs: GRAB_NEVER_MS, turtleBlocks: 0 } : {}), ...(spec.grab.move ? { move: spec.grab.move } : {}) },
      ...(spec.grab.superThrowStrides !== undefined ? { superGrabThrowStrides: spec.grab.superThrowStrides } : {}) } : {}),
    ...(spec.skill ? { skill: Object.freeze(Object.fromEntries(Object.entries(spec.skill).filter(([key]) => key !== "note"))) as CityFighterSkillTuning } : {}),
    ...(spec.skill2 ? { skill2: Object.freeze(Object.fromEntries(Object.entries(spec.skill2).filter(([key]) => key !== "note"))) as CityFighterSkillTuning } : {}),
    ...(spec.highActions?.length ? { highActions: Object.freeze([...spec.highActions]) } : {}),
    // His air chase is his row's, never KUMA's (2026-10-23, KUMA's own `kuma.airChase`): a fighter without the row has no `airCombo` art.
    airChase: spec.airChase ? Object.freeze(Object.fromEntries(Object.entries(spec.airChase).filter(([key]) => key !== "note"))) as CityFighterAirChaseTuning : undefined,
    ...(spec.superSkill ? { superSkill: Object.freeze(Object.fromEntries(Object.entries(spec.superSkill).filter(([key]) => key !== "note"))) } : {}),
    ...(spec.downSlide ? { downSlide: Object.freeze({ strides: spec.downSlide.strides, koStrides: spec.downSlide.koStrides, ms: spec.downSlide.ms }) } : {}),
    ...(spec.vault ? { vault: Object.freeze({ ms: spec.vault.ms }) } : {}) });
}

/** A guard held this long never reads as the turtle (`kuma.grab.turtleMs`): a super-only grab is never the turtle punish. */
const GRAB_NEVER_MS = 1e9;

/**
 * His tuning with his swings' reach from his clips' measured front (`measure.front`, body heights): × `bodyScale` ÷
 * `NATIVE_CITY_STEP_BODY_RATIO` is his reach in strides from his feet; minus `contactStrides` (the two footprints) it is the reach beyond
 * contact, clamped. He starts each swing at `share` of its reach (never closer than he stops), and the dash's flee radius keeps its
 * rule's definition (his longest reach + 0.1). `fast` is the cut combo (same clip); the dash keeps KUMA's numbers. A shockwave slam reaches
 * at least as far as its ring.
 */
export function cityFighterReachTuning(tuning: KumaTuning, measure: Pick<NativeCityFighterMeasure, "front" | "bodyScale">,
  spec: CityFighterSpec["reach"], contactStrides: number): KumaTuning {
  const strikes = tuning.strikes;
  const extra = (front: number | null): number | null => front === null ? null
    : Math.max(spec.minExtraStrides, Math.min(spec.maxExtraStrides, front * measure.bodyScale / NATIVE_CITY_STEP_BODY_RATIO - contactStrides));
  const slam = Math.max(extra(measure.front.slam) ?? strikes.slam.reachExtraStrides, tuning.slamShockwave?.reachExtraStrides ?? 0);
  const combo = extra(measure.front.combo) ?? strikes.combo.reachExtraStrides;
  const share = Math.max(0, Math.min(1, spec.share));
  const start = (reach: number) => Math.max(reach * share, tuning.stopStrides + 0.05);
  return Object.freeze({ ...tuning, reachExtraStrides: { ...tuning.reachExtraStrides, slam, combo, fast: combo },
    attackStartStridesBy: { ...tuning.attackStartStridesBy, slam: start(slam), combo: start(combo), fast: start(combo) },
    dash: { ...tuning.dash, fleeRadiusStrides: Math.max(tuning.dash.fleeRadiusStrides, Math.max(slam, combo) + 0.1) } });
}

function skinnedFighter(id: string, spec: CityFighterSpec): CityFighterRules {
  const measure = nativeCityFighterMeasure(id);
  const contact = NATIVE_CITY_FOOTPRINT_STRIDES[spec.footprint] + NATIVE_CITY_FOOTPRINT_STRIDES.player;
  const reach = cityFighterReachTuning(fighterTuning(spec), measure, spec.reach, contact);
  return Object.freeze({ id, actorId: id, skinId: id, footprint: spec.footprint,
    sideScroll: spec.sideScroll, guest: spec.roster === "guest", plan: Object.freeze({ ...NATIVE_CITY_KUMA_POST, bodyScale: measure.bodyScale, points: spec.post }),
    tuning: spec.summons?.length ? kumaTuningWithSummons(reach, spec.summons.map(summon => ({ ...summon, damageScale: summon.damageScale ?? spec.damageScale })))
      : reach });
}

/**
 * His tuning with summon casts (`KumaTuning.summons`): the slots, and where his chase starts the first (`attackStartStridesBy.summon` —
 * the chase starts each slot's cast at its own distance).
 */
function kumaTuningWithSummons(tuning: KumaTuning, summons: readonly CityFighterSummonTuning[]): KumaTuning {
  const first = summons[0]!;
  return Object.freeze({ ...tuning, summons: Object.freeze(summons.map(summon => Object.freeze({ ...summon }))),
    attackStartStridesBy: { ...tuning.attackStartStridesBy, summon: Math.max(first.minGapStrides, first.startStrides) } });
}


export function cityFighterWithSummon(rules: CityFighterRules, summon: CityFighterSummonRow): CityFighterRules {
  return Object.freeze({ ...rules, tuning: kumaTuningWithSummons(rules.tuning, [{ ...summon,
    damageScale: summon.damageScale ?? cityFighterDamageScale(rules.actorId) }]) });
}


export const CITY_FIGHTERS: readonly CityFighterRules[] = Object.freeze([
  Object.freeze({ id: "kuma", actorId: "kuma", skinId: null, plan: NATIVE_CITY_KUMA_POST, tuning: NATIVE_CITY_COMBAT.kuma,
    footprint: "kuma" as const, sideScroll: true, guest: false }),
  ...CITY_FIGHTER_IDS.slice(1).map(id => skinnedFighter(id, SPECS[id]!)),
]);

/** A fighter's rules by his actor id (`kuma`, `yume`); an unknown id is a wiring error. */

export function cityFighterDamageScale(actorId: string): number {
  return SPECS[actorId]?.damageScale ?? 1;
}

export function cityFighterRules(actorId: string): CityFighterRules {
  const rules = CITY_FIGHTERS.find(fighter => fighter.actorId === actorId);
  if (!rules) throw new Error(`city fight: no fighter "${actorId}"`);
  return rules;
}
