import { kumaCombatEngaged, type KumaCombatState, type KumaTuning } from "./NativeCityKumaCombatState";
import { kumaCombatArmored, kumaCombatGrabWindup, kumaCombatGuarding, kumaCombatOpening, kumaCombatVulnerable } from "./NativeCityKumaHit";
import { ottoFighting, ottoOpen, ottoOpeningHitsLeft, type OttoState } from "./NativeCityOttoEncounter";
import { nativeCityGuardCrushes, nativeCityKumaBestAnswer, nativeCityKumaGrade, nativeCityVaultPasses } from "./NativeCityExchange";
import { nativeCityFightSimUntouchable, type NativeCityFightSimState } from "./NativeCityFightSim";
import { cityFightSummonSpec, type CityFightSummonKind } from "./CityFightSummonTuning";

/**
 * 1:1 싸움 게이지의 상태 아이콘(2026-10-18, 사용자: "상대방 게이지에 상태값 알려주는 아이콘도 추가하자. 슈퍼아머인지.. 등등"): 피해를 바꾸는
 * 숨은 규칙이 지금 켜져 있는지를 규칙 그대로 읽는다(아이콘이 규칙에 없는 약속을 하지 않게 — 판정 함수 그 자체를 부른다). 렌더는 이 목록을
 * 읽어 그리기만 한다. 순서가 곧 그리는 순서다(가장 급한 것 먼저).
 */

/** The opponent's status icons (KUMA and the fighters, Otto). */
export type CityFightFoeStatus = "grab" | "armor" | "guard" | "opening" | "broken" | "down" | "invulnerable";

export type CityFightPlayerStatus = "grabbed" | "dizzy" | "guardBroken" | "invulnerable" | "guard";


export const CITY_FIGHT_FOE_STATUSES: readonly CityFightFoeStatus[] = Object.freeze(["armor", "guard", "opening", "broken", "down", "grab", "invulnerable"]);
export const CITY_FIGHT_PLAYER_STATUSES: readonly CityFightPlayerStatus[] = Object.freeze(["guard", "guardBroken", "invulnerable", "dizzy", "grabbed"]);

/**
 * Which way each of his statuses cuts for him (2026-10-22, the arena duel's effect board — 사용자: "전체 효과 리스트를 (긍정, 부정)"): armour,
 * guard, invulnerability and the red grab's windup are his edge; an opening, a broken poise and lying down are his weakness.
 */
export const CITY_FIGHT_FOE_STATUS_SIDE: Readonly<Record<CityFightFoeStatus, "positive" | "negative">> = Object.freeze({
  armor: "positive", guard: "positive", invulnerable: "positive", grab: "positive", opening: "negative", broken: "negative", down: "negative",
});

/**
 * The duel's rhythm fields (`kuma.rhythm`): a chance a just dodge or parry opened, and the ground blow still open on his knocked-down body.
 * Read as optional — a fighter without the rhythm has neither.
 */
type KumaRhythmRead = KumaCombatState & { readonly chance?: unknown; readonly groundOpen?: boolean };

/** A KUMA-type fighter's lit statuses now (none outside the fight or once knocked out). */
export function kumaFightStatuses(state: KumaCombatState, t: KumaTuning): CityFightFoeStatus[] {
  if (!kumaCombatEngaged(state) || state.hp <= 0) return [];
  const rhythm: KumaRhythmRead = state;
  const lit: CityFightFoeStatus[] = [];
  if (kumaCombatGrabWindup(state)) lit.push("grab");
  if (kumaCombatArmored(state, t)) lit.push("armor");
  if (kumaCombatGuarding(state, t)) lit.push("guard");
  if (kumaCombatOpening(state) || rhythm.chance) lit.push("opening");
  if (state.mode === "break") lit.push("broken");
  // Down from V's knockdown with the ground blow still his to take (`kuma.rhythm.down`): only V lands there.
  if (state.mode === "down" && state.knockdown && rhythm.groundOpen === true) lit.push("down");
  else if (!kumaCombatVulnerable(state) && state.mode !== "return") lit.push("invulnerable");
  return lit;
}

/** Otto's lit statuses: his guard takes every blow outside his opening (`ottoTakeHit`); the opening lasts while it has hits left. */
export function ottoFightStatuses(state: OttoState): CityFightFoeStatus[] {
  if (!ottoFighting(state)) return [];
  return ottoOpen(state) && ottoOpeningHitsLeft(state) > 0 ? ["opening"] : ["guard"];
}


export function playerFightStatuses(state: NativeCityFightSimState, threat: Parameters<typeof nativeCityFightSimUntouchable>[1] = null)
  : CityFightPlayerStatus[] {
  const fight = state.fight;
  if (fight.ko !== null) return [];
  const lit: CityFightPlayerStatus[] = [];
  if (fight.grab !== null) lit.push("grabbed");
  if (fight.stun !== null) lit.push("dizzy");
  if (state.defense.gauge.broken) lit.push("guardBroken");
  const safe = nativeCityFightSimUntouchable(state, threat);
  if (safe.afterBlowMs > 0 || safe.dodgeMs > 0 || safe.vaultMs > 0) lit.push("invulnerable");
  if (state.guardUp && !state.defense.gauge.broken) lit.push("guard");
  return lit;
}

/**
 * One line of the opponent's card (2026-10-18, 사용자: "적군 HP 왼편에 썸네일 아이콘을 넣고, 썸네일 아이콘을 누르면 해당 적의 스킬과 효과를
 * 설명하는 팝업창도"): a move he really throws (`grade`: the colour of its windup) or a rule of his. 2026-10-19 (사용자: "기술 정보는 무슨
 * 이야긴지 하나도 모르겠어" → '신호 → 대응 키' 한 줄): `answers` — the keys that take it, read off the rules that judge it: `guard` Z
 * (blocks unless its grade crushes the guard), `dodge` X (the vault passes its grade), `counter` V once his ring fills (`kuma.rhythm.counter`
 * on an armoured white swing — its first contact, `triangle.best`), `cut` C / V into the red grab's unarmoured windup. Empty: a rule, not a blow.
 */
export type CityFightAnswer = "guard" | "dodge" | "counter" | "cut";

export type CityFightFoeSkillId = "fast" | "combo" | "slam" | "dash" | "grab" | "buttSlam" | "bowl" | "shockwave" | "shifts"
  | "ottoSweep" | "ottoDrive" | "ottoReverse" | "ottoOpening" | CityFightSummonKind;
export interface CityFightFoeSkill {
  readonly id: CityFightFoeSkillId;
  readonly grade: "white" | "gold" | "red" | null;
  readonly answers: readonly CityFightAnswer[];
}

/**
 * A KUMA-type fighter's card from his tuning: his rotation (`attackMix` for a fighter, KUMA's own rotation, dash and grab otherwise), his
 * slam's shockwave, KUMA's drawn specials and his shifts (`kuma.phases`).
 */
export function kumaFightSkills(t: KumaTuning): CityFightFoeSkill[] {
  type Action = "fast" | "combo" | "slam" | "dash" | "grab";
  // `counter`: the ring only fills on an armoured white swing with a fixed contact on the ground — not the dash (or the bowl drawn for it)
  // and not the butt slam's leap (`kumaCombatCounterGauge`).
  const skill = (id: CityFightFoeSkillId, action: Action, counter: boolean): CityFightFoeSkill => {
    if (action === "grab") return { id, grade: nativeCityKumaGrade(action), answers: ["cut"] };
    const answers: CityFightAnswer[] = [];
    if (!nativeCityGuardCrushes(action)) answers.push("guard");
    if (nativeCityVaultPasses(action)) answers.push("dodge");
    // The ring is white's alone since 2026-10-19 (`triangle.best` — a gold swing's V bounces off the armour).
    if (counter && nativeCityKumaBestAnswer(action) === "counter" && t.armorDuringAttack && t.rhythm?.counter) answers.push("counter");
    return { id, grade: nativeCityKumaGrade(action), answers };
  };
  const fighter = t.attackMix !== undefined;
  const moves: Action[] = fighter
    ? (["fast", "combo", "slam"] as const).filter(id => (t.attackMix?.[id] ?? 0) > 0) : ["fast", "combo", "slam", "dash", "grab"];
  const skills: CityFightFoeSkill[] = moves.map(id => skill(id, id, id !== "dash"));
  if (t.slamShockwave) skills.push(skill("shockwave", "slam", true));
  if (!fighter) skills.push(skill("buttSlam", "slam", false), skill("bowl", "dash", false));
  // His summons (`KumaTuning.summons`, 2026-10-20): each object's own answers (Z takes it on the guard, X lets it pass), and C cuts the cast.
  for (const summon of t.summons ?? []) {
    const spec = cityFightSummonSpec(summon.kind), answers: CityFightAnswer[] = spec.playerHit.answers.guard === false ? [] : ["guard"];
    if (spec.playerHit.answers.dodge || spec.playerHit.answers.vault) answers.push("dodge");
    if (!skills.some(skill => skill.id === summon.kind)) skills.push({ id: summon.kind, grade: spec.grade, answers: [...answers, "cut"] });
  }
  // His shifts are a rule of his HP bar (its gold lines), not a blow: the card draws them under the bar's heading.
  if ((t.phases?.steps?.length ?? 0) > 1) skills.push({ id: "shifts", grade: null, answers: [] });
  return skills;
}

/** Otto's card: his three patterns (each is his own blow — the guard answers them) and the opening his rules keep. */
export function ottoFightSkills(): CityFightFoeSkill[] {
  const blow = (id: CityFightFoeSkillId): CityFightFoeSkill => ({ id, grade: null, answers: ["guard"] });
  return [blow("ottoSweep"), blow("ottoDrive"), blow("ottoReverse"), { id: "ottoOpening", grade: null, answers: [] }];
}
