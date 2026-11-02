import type { CityPoint } from "../../world/NativeCityDefinition";
import type { DuelStrikeIdentity } from "../duel/DuelContact";
import type { CityFightStageLine } from "./CityFightStageLine";
import { cityFightSummonSpec, type CityFightSummonKind } from "./CityFightSummonTuning";
import type { NativeCityKumaGrade } from "./NativeCityCombatTuning";

/**
 * 마을 대결의 소환물(2026-10-20, docs/kaito-web/city-fight-summons.md): 시전자가 내놓은 뒤 무대 선 위를 따로 움직이는 물체(종이학·자동차)의 순수 규칙.
 *
 * - 소환물은 시전자의 몸에 붙지 않는다. 싸움 세션(`CityFightSession.summons`)이나 화면 없는 경기(`CityFightFighterBout`)가 필드 하나를 들고,
 *   시전자가 맞아 날아가도 학은 날고 차는 무대 끝까지 간다. 그림(`NativeCitySummonView`)은 이 필드를 읽어 고정 풀로 그린다.
 * - 시계는 싸움 시계다: 멈춤·히트스톱·슬로모가 소환물도 붙든다(호출자가 그 프레임의 싸움 dt 를 준다).
 * - 판정은 무대 선 위 1차원 쓸기다: 지난 위치에서 지금 위치까지 몸 길이만큼 쓴 구간이 대상의 발 원과 겹치면 닿는다 — 긴 프레임에도 건너뛰지 않는다
 *   (`ottoRisingRockContact`와 같은 방식). 주인은 제 소환물에 맞지 않는다. 대상마다 한 번: 결과가 정해지면 그 대상은 다시 판정하지 않는다.
 *   무적·쓰러짐 때문에 아무 일도 없었으면(`protected`·`none`) 다음 프레임에 다시 본다.
 * - 끝: 무대 끝을 지남(`edge`), 수명(`lifeMs`), 맞히거나 막힘(`consumeOn` — `consumed`), 주인이 싸움을 떠남(`ownerOut`), 재대결(`reset`),
 *   한 자리 치기(`strike`)가 회복까지 마침(`spent`). 끝난 소환물은 한 걸음 동안 `end` 를 달고 남아(그림이 마지막 모습을 한 번 본다) 다음
 *   걸음에 빠진다.
 * - 한 자리 치기(`strike`, 2026-10-20 — 드릴·로드스터의 아래 분사): 한 자리로 가서(그 자리에서 나오거나 `travelMs` 동안 날아가 — 날아가기
 *   시작할 때 대상의 발 자리로 고정) 모으기(`chargeMs`) 뒤 `activeMs` 동안 그 자리 둘레 `halfLengthStrides` 안의 몸을 한 번씩 친다.
 */

export type CityFightSummonEnd = "edge" | "lifetime" | "consumed" | "ownerOut" | "reset" | "spent";

export interface CityFightSummon {
  /** Serial in its field (never reused): the attack id of its contact (`cityFightSummonStrike`). */
  readonly id: number;
  /** The fighter who cast it (never hit by it). */
  readonly ownerId: string;
  readonly kind: CityFightSummonKind;
  /** The owner's attack id of the cast that released it. */
  readonly castId: number;
  /** Fight ms since it was released (its tell first — `spawn.tellMs`). */
  readonly ageMs: number;
  /** Its centre along the stage line (plan units along `line.direction` from `line.origin`). */
  readonly along: number;
  /** Which way along `line.direction` it travels. */
  readonly heading: -1 | 1;

  readonly damage: number;
  /** Targets whose contact is settled (hit, guarded, passed): never judged again. */
  readonly touched: readonly string[];
  /** A `strike`'s spot along the line (locked at the release, or as its travel starts) and where its travel set off from; absent otherwise. */
  readonly targetAlong?: number;
  readonly fromAlong?: number;
  /** Why it ended this step; null while it is out. */
  readonly end: CityFightSummonEnd | null;

  readonly reflected?: true;
}

export interface CityFightSummonField {
  /** The next summon's id − 1 (increasing for the field's life — a rematch never reuses an id). */
  readonly serial: number;
  readonly live: readonly CityFightSummon[];
}

export const EMPTY_CITY_FIGHT_SUMMONS: CityFightSummonField = Object.freeze({ serial: 0, live: Object.freeze([]) });

/** A body the field can touch this step: its id, its feet along the stage line and its radius (plan units). */
export interface CityFightSummonTarget {
  readonly id: string;
  readonly along: number;
  readonly radius: number;
}

/** One object met one target this step: the caller judges it (guard, dodge, hit) and settles it (`settleCityFightSummonTouch`). */
export interface CityFightSummonTouch {
  readonly summon: CityFightSummon;
  readonly targetId: string;
}

/** What came of a touch: the receiver's answer. `protected` / `none`: nothing happened (invulnerable, knocked out, untouchable) — judged again. */
export type CityFightSummonOutcome = "hit" | "ko" | "block" | "dodge" | "protected" | "none" | "reflect";

/** A cast's release: who, what, and where the two stand on the stage line. */
export interface CityFightSummonCast {
  readonly ownerId: string;
  readonly kind: CityFightSummonKind;
  readonly castId: number;

  readonly damage: number;
  readonly line: CityFightStageLine;
  readonly stepUnits: number;
  readonly ownerAlong: number;
  readonly ownerRadius: number;
  /** The target's feet along the line (its heading points there). */
  readonly targetAlong: number;
}

/** A point's coordinate along the stage line (plan units along `direction` from `origin`). */
export function cityFightSummonAlong(line: Pick<CityFightStageLine, "origin" | "direction">, point: CityPoint): number {
  return (point[0] - line.origin[0]) * line.direction[0] + (point[1] - line.origin[1]) * line.direction[1];
}

/** The summon's centre on the plan (the stage line at `along`). */
export function cityFightSummonPoint(line: Pick<CityFightStageLine, "origin" | "direction">, summon: Pick<CityFightSummon, "along">): CityPoint {
  return [line.origin[0] + line.direction[0] * summon.along, line.origin[1] + line.direction[1] * summon.along];
}

/** Still showing its tell (the sports car's headlights, the roadster rising on its thrusters, the drill's crack): it neither moves nor touches. */
export function cityFightSummonTelling(summon: Pick<CityFightSummon, "kind" | "ageMs">): boolean {
  return summon.ageMs < cityFightSummonSpec(summon.kind).spawn.tellMs;
}

/** Where a `strike` is in its run (its tell, travel, charge, active window, recovery); null for the other motions. */
export type CityFightSummonStrikePhase = "tell" | "travel" | "charge" | "active" | "recover" | "spent";

/** The phase ends of a `strike` (fight ms of its age); null for the other motions. */
export function cityFightSummonStrikeTimes(kind: CityFightSummonKind)
  : { readonly tell: number; readonly travel: number; readonly charge: number; readonly active: number; readonly recover: number } | null {
  const spec = cityFightSummonSpec(kind), strike = spec.strike;
  if (spec.motion !== "strike" || !strike) return null;
  const tell = Math.max(0, spec.spawn.tellMs), travel = tell + Math.max(0, strike.travelMs), charge = travel + Math.max(0, strike.chargeMs);
  const active = charge + Math.max(0, strike.activeMs);
  return { tell, travel, charge, active, recover: active + Math.max(0, strike.recoverMs) };
}

/** A `strike`'s phase at `ageMs` (its age); null for the other motions. */
export function cityFightSummonStrikePhase(summon: Pick<CityFightSummon, "kind" | "ageMs">): CityFightSummonStrikePhase | null {
  const t = cityFightSummonStrikeTimes(summon.kind);
  if (!t) return null;
  const age = summon.ageMs;
  return age < t.tell ? "tell" : age < t.travel ? "travel" : age < t.charge ? "charge" : age < t.active ? "active" : age < t.recover ? "recover" : "spent";
}

/** A `strike`'s travel progress (0 at its spot's lock, 1 over it — eased in and out); 1 when it has no travel or is not a strike. */
export function cityFightSummonTravel(summon: Pick<CityFightSummon, "kind" | "ageMs">): number {
  const t = cityFightSummonStrikeTimes(summon.kind);
  if (!t || t.travel <= t.tell) return 1;
  const k = Math.min(1, Math.max(0, (summon.ageMs - t.tell) / (t.travel - t.tell)));
  return k * k * (3 - 2 * k);
}

/** Its contact's identity (`DuelContact`): one attacker per owner's summons, one execution per summon, one contact. */
export function cityFightSummonStrike(summon: Pick<CityFightSummon, "id" | "ownerId">): DuelStrikeIdentity {
  return { attackerId: cityFightSummonAttacker(summon.ownerId), attackId: summon.id, hitIndex: 0 };
}

/** The attacker id an owner's summons hit as (apart from his own swings: their attack ids count separately). */
export function cityFightSummonAttacker(ownerId: string): string {
  return `${ownerId}/summon`;
}

/** How many of `kind` the owner has out (not ended). */
export function cityFightSummonLiveCount(field: CityFightSummonField, ownerId: string, kind: CityFightSummonKind): number {
  let count = 0;
  for (const summon of field.live) if (summon.end === null && summon.ownerId === ownerId && summon.kind === kind) count++;
  return count;
}

/** How many of each of `kinds` the owner has out (`KumaCombatInput.summons.live`). */
export function cityFightSummonLiveByKind(field: CityFightSummonField, ownerId: string, kinds: readonly CityFightSummonKind[])
  : Readonly<Partial<Record<CityFightSummonKind, number>>> {
  const live: Partial<Record<CityFightSummonKind, number>> = {};
  for (const kind of kinds) live[kind] = cityFightSummonLiveCount(field, ownerId, kind);
  return live;
}

/**
 * The cast released (`summon` event): the object appears on the line heading toward the target — `ahead` (the crane) `gapStrides` past the
 * caster's body toward the target, `behind` (the cars) `gapStrides` behind his back, in the camera's frame for its tell (held inside the
 * stage's ends). Nothing past the kind's `maxLive` for that owner.
 */
export function spawnCityFightSummon(field: CityFightSummonField, cast: CityFightSummonCast): CityFightSummonField {
  const spec = cityFightSummonSpec(cast.kind);
  if (cityFightSummonLiveCount(field, cast.ownerId, cast.kind) >= Math.max(0, Math.floor(spec.maxLive))) return field;
  const heading: -1 | 1 = cast.targetAlong < cast.ownerAlong ? -1 : 1, half = summonHalf(cast.kind, cast.stepUnits);
  const side = spec.spawn.from === "behind" ? -heading : heading;
  // A negative gap starts it overlapping the caster's back (in the camera's frame; he is never hit by his own).
  const off = cast.ownerAlong + side * (Math.max(0, cast.ownerRadius) + spec.spawn.gapStrides * cast.stepUnits + half);
  const along = spec.spawn.from === "behind" ? Math.max(cast.line.min + half, Math.min(cast.line.max - half, off)) : off;
  const id = field.serial + 1;
  // A strike at the target's feet appears there; one that travels sets off from its spawn (its spot re-locked as the travel starts).
  const strike = spec.motion === "strike" ? { targetAlong: clampAlong(cast.line, cast.targetAlong, half),
    fromAlong: spec.spawn.from === "target" ? clampAlong(cast.line, cast.targetAlong, half) : along } : null;
  const summon: CityFightSummon = Object.freeze({ id, ownerId: cast.ownerId, kind: cast.kind, castId: cast.castId, ageMs: 0,
    along: strike ? strike.fromAlong : along, heading, damage: Math.max(0, cast.damage), touched: Object.freeze([]), end: null, ...(strike ?? {}) });
  return Object.freeze({ serial: id, live: Object.freeze([...field.live, summon]) });
}

export interface CityFightSummonStepInput {
  /** Fight ms this step (0: held — nothing moves, ends or touches). */
  readonly dtMs: number;
  readonly line: CityFightStageLine;
  readonly stepUnits: number;
  /** The owner still fights (engaged, standing or knocked down — not knocked out, gone home or calmed). */
  readonly ownerFighting: (ownerId: string) => boolean;
  readonly targets: readonly CityFightSummonTarget[];
}

/**
 * One step of the field on the fight clock: last step's ended objects leave; the rest age, move along the line past their tell and end at the
 * stage's far end (the crane's nose, a car's tail), at `lifeMs`, or with their owner. The bodies each swept over this step are the touches.
 */
export function stepCityFightSummonField(field: CityFightSummonField, input: CityFightSummonStepInput)
  : { readonly field: CityFightSummonField; readonly touches: readonly CityFightSummonTouch[] } {
  const dt = Number.isFinite(input.dtMs) ? Math.max(0, input.dtMs) : 0;
  if (field.live.length === 0 || dt <= 0) return { field, touches: [] };
  const live: CityFightSummon[] = [], touches: CityFightSummonTouch[] = [];
  for (const summon of field.live) {
    if (summon.end !== null) continue;
    if (!input.ownerFighting(summon.ownerId)) { live.push(Object.freeze({ ...summon, end: "ownerOut" })); continue; }
    const spec = cityFightSummonSpec(summon.kind), half = summonHalf(summon.kind, input.stepUnits);
    if (spec.motion === "strike") { live.push(stepStrike(summon, dt, half, input, touches)); continue; }
    const ageMs = summon.ageMs + dt, tellMs = Math.max(0, spec.spawn.tellMs);
    const travelMs = Math.max(0, ageMs - Math.max(summon.ageMs, tellMs));
    const along = summon.along + summon.heading * Math.max(0, spec.speedStridesPerSec) * input.stepUnits * travelMs / 1000;
    let end: CityFightSummonEnd | null = null;
    if (ageMs >= tellMs) {
      const lo = Math.min(summon.along, along) - half, hi = Math.max(summon.along, along) + half;
      for (const target of input.targets) {
        if (target.id === summon.ownerId || summon.touched.includes(target.id)) continue;
        if (hi >= target.along - target.radius - 1e-9 && lo <= target.along + target.radius + 1e-9) touches.push({ summon: { ...summon, ageMs, along }, targetId: target.id });
      }
      // The crane folds at the stage end (its nose); a car drives / flies off it (its tail).
      const edge = spec.motion === "fly" ? along + summon.heading * half : along - summon.heading * half;
      if (summon.heading > 0 ? edge > input.line.max : edge < input.line.min) end = "edge";
    }
    if (end === null && ageMs >= spec.lifeMs) end = "lifetime";
    live.push(Object.freeze({ ...summon, ageMs, along, end }));
  }
  return { field: Object.freeze({ serial: field.serial, live: Object.freeze(live) }), touches };
}

/**
 * One step of a `strike`: its spot locked as its travel starts (the nearest body other than its owner — the target, unless it has none), its
 * centre over the travel eased from where it set off to the spot, the bodies within the zone touched while the step overlaps its active
 * window, and spent once its recovery is over.
 */
function stepStrike(summon: CityFightSummon, dt: number, half: number, input: CityFightSummonStepInput, touches: CityFightSummonTouch[])
  : CityFightSummon {
  const t = cityFightSummonStrikeTimes(summon.kind)!, before = summon.ageMs, ageMs = before + dt;
  let targetAlong = summon.targetAlong ?? summon.along;
  const fromAlong = summon.fromAlong ?? summon.along;
  if (t.travel > t.tell && before < t.tell && ageMs >= t.tell) {
    let best: number | null = null;
    for (const target of input.targets) {
      if (target.id === summon.ownerId) continue;
      if (best === null || Math.abs(target.along - fromAlong) < Math.abs(best - fromAlong)) best = target.along;
    }
    if (best !== null) targetAlong = clampAlong(input.line, best, half);
  }
  const k = cityFightSummonTravel({ kind: summon.kind, ageMs });
  const along = ageMs < t.tell ? fromAlong : fromAlong + (targetAlong - fromAlong) * k;
  const next: CityFightSummon = { ...summon, ageMs, along, targetAlong, fromAlong };
  if (ageMs > t.charge && before < t.active) {
    for (const target of input.targets) {
      if (target.id === summon.ownerId || summon.touched.includes(target.id)) continue;
      if (Math.abs(target.along - targetAlong) <= half + target.radius + 1e-9) touches.push({ summon: next, targetId: target.id });
    }
  }
  const end: CityFightSummonEnd | null = ageMs >= t.recover ? "spent" : ageMs >= cityFightSummonSpec(summon.kind).lifeMs ? "lifetime" : null;
  return Object.freeze({ ...next, end });
}

/** `along` held inside the stage's ends by a body `half` each way. */
function clampAlong(line: Pick<CityFightStageLine, "min" | "max">, along: number, half: number): number {
  return line.max - line.min > 2 * half ? Math.max(line.min + half, Math.min(line.max - half, along)) : (line.min + line.max) / 2;
}

/**
 * A touch's outcome on its target: a settled one (hit, KO, guard, pass) is remembered — that target is never judged again — and an outcome in
 * the kind's `consumeOn` ends the object. Nothing happened (`protected`, `none`): unchanged, judged again next step.
 */
export function settleCityFightSummonTouch(field: CityFightSummonField, summonId: number, targetId: string, outcome: CityFightSummonOutcome)
  : CityFightSummonField {
  if (outcome === "protected" || outcome === "none" || outcome === "reflect") return field;
  let changed = false;
  const live = field.live.map(summon => {
    if (summon.id !== summonId || summon.touched.includes(targetId)) return summon;
    changed = true;
    const consumed = outcome !== "dodge" && cityFightSummonSpec(summon.kind).consumeOn.includes(outcome);
    return Object.freeze({ ...summon, touched: Object.freeze([...summon.touched, targetId]), end: consumed && summon.end === null ? "consumed" : summon.end });
  });
  return changed ? Object.freeze({ serial: field.serial, live: Object.freeze(live) }) : field;
}

/**
 * `byId` knocked `summonId` back (2026-10-20, `CityFightSummonSpec.reflect`): it turns round and is his — its caster can be touched by it now
 * (never `byId`), nothing it touched before is settled any more. Unknown or ended: unchanged.
 */
export function reflectCityFightSummon(field: CityFightSummonField, summonId: number, byId: string): CityFightSummonField {
  let changed = false;
  const live = field.live.map(summon => {
    if (summon.id !== summonId || summon.end !== null) return summon;
    changed = true;
    return Object.freeze({ ...summon, ownerId: byId, heading: (summon.heading > 0 ? -1 : 1), touched: Object.freeze([byId]), reflected: true as const });
  });
  return changed ? Object.freeze({ serial: field.serial, live: Object.freeze(live) }) : field;
}

/** End every object out of `ownerId` (null: of everyone) now — a rematch, the fight's end. Already ended ones keep their reason. */
export function endCityFightSummons(field: CityFightSummonField, ownerId: string | null, reason: CityFightSummonEnd): CityFightSummonField {
  if (!field.live.some(summon => summon.end === null && (ownerId === null || summon.ownerId === ownerId))) return field;
  return Object.freeze({ serial: field.serial, live: Object.freeze(field.live.map(summon =>
    summon.end === null && (ownerId === null || summon.ownerId === ownerId) ? Object.freeze({ ...summon, end: reason }) : summon)) });
}

/** One object coming at a target: its id and kind, its grade (the tint of the answer) and fight ms until it reaches the target's body. */
export interface CityFightSummonThreat {
  readonly id: number;
  readonly kind: CityFightSummonKind;
  readonly grade: NativeCityKumaGrade;
  readonly untilMs: number;
}

/**
 * The objects still coming at `target` (not its own, not settled on it, heading its way), soonest first: what an auto pilot answers and a tell
 * counts down to. An object already overlapping it is due now (0).
 */
export function cityFightSummonThreats(field: CityFightSummonField, stepUnits: number, target: CityFightSummonTarget): readonly CityFightSummonThreat[] {
  const threats: CityFightSummonThreat[] = [];
  for (const summon of field.live) {
    if (summon.end !== null || summon.ownerId === target.id || summon.touched.includes(target.id)) continue;
    const spec = cityFightSummonSpec(summon.kind), half = summonHalf(summon.kind, stepUnits);
    // A strike threatens a body inside its zone (its spot; before a travelling one locks, the zone where it will set off for — the body's
    // own feet): due as its active window opens.
    const times = cityFightSummonStrikeTimes(summon.kind);
    if (times) {
      if (summon.ageMs >= times.active) continue;
      const locked = summon.ageMs >= times.tell || times.travel <= times.tell;
      if (locked && Math.abs(target.along - (summon.targetAlong ?? summon.along)) > half + target.radius) continue;
      threats.push({ id: summon.id, kind: summon.kind, grade: spec.grade, untilMs: Math.max(0, times.charge - summon.ageMs) });
      continue;
    }
    const gap = (target.along - summon.along) * summon.heading - half - target.radius;
    if (gap < -(2 * half + 2 * target.radius)) continue;
    const speed = Math.max(1e-9, spec.speedStridesPerSec * stepUnits / 1000);
    const tell = Math.max(0, spec.spawn.tellMs - summon.ageMs);
    threats.push({ id: summon.id, kind: summon.kind, grade: spec.grade, untilMs: tell + Math.max(0, gap) / speed });
  }
  return threats.sort((a, b) => a.untilMs - b.untilMs || a.id - b.id);
}

function summonHalf(kind: CityFightSummonKind, stepUnits: number): number {
  return Math.max(0, cityFightSummonSpec(kind).halfLengthStrides) * Math.max(0, stepUnits);
}
