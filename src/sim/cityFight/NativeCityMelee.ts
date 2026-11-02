import { EMPTY_DUEL_CONTACT, receiveDuelContact, stepDuelContactState,
  type DuelContactState, type DuelStrikeIdentity } from "../duel/DuelContact";
import type { CityPoint } from "../../world/NativeCityDefinition";
import { stepDuelKnock, type DuelKnock } from "../duel/DuelKnockback";
import { resolveNativeCityPlayerMove, type NativeCityFootprint } from "../NativeCityActorCollision";
import { NATIVE_CITY_COMBAT, type NativeCityArtReachTuning, type NativeCityCancelTuning, type NativeCityChainLaunchTuning, type NativeCityMeleeTier,
  type NativeCityPlayerActionKind } from "./NativeCityCombatTuning";

/**
 * 도시 근접 판정(순수). 주인공·KUMA 가 같은 규칙을 쓴다.
 *
 * - 사거리: 두 발 원이 맞닿는 거리(반지름 합) + `reachExtraStrides`(json, 보이는 주먹과 그 이펙트까지). 몸이 닿은 채로도, 그만큼 떨어져서도 맞는다.
 * - 부채꼴: 때리는 쪽이 보는 평면 방향에서 좌우 `coneHalfAngleDeg`(70°) 안. 등 뒤는 맞지 않는다.
 * - 한 타격 프레임에 한 번: 같은 휘두름(`attackId`)의 같은 접촉(`hitIndex`)은 두 번 들어가지 않는다.
 * - 맞은 뒤 무적: 피격자마다 따로(`invulnerableMs`). 주인공은 쿠마 공격마다(`kuma.strikes`: 콤보 0.2초 — 1·2타가
 *   이어진다, 내려찍기 0.82초 — 일어나 움직일 틈), KUMA 는 C 연타가 이어지게 짧다(연타 접촉 간격보다 짧게).
 * 수치는 모두 `native-city-combat.json` 이 소유한다.
 */

export interface NativeCityMeleeBody {
  readonly id: string;
  readonly point: CityPoint;
  readonly radius: number;
}

export interface NativeCityMeleeStrike extends DuelStrikeIdentity {
  readonly origin: CityPoint;
  /** 때리는 쪽이 보는 평면 방향(길이 무관, 0 이 아님). */
  readonly direction: CityPoint;
  readonly radius: number;
  readonly damage: number;
  readonly tier: NativeCityMeleeTier;
}

export type NativeCityMeleeVictim = DuelContactState;

export const NATIVE_CITY_MELEE_VICTIM: NativeCityMeleeVictim = EMPTY_DUEL_CONTACT;

export interface NativeCityMeleeOptions {
  /** 지금 투영의 한 보(평면 단위). */
  readonly stepUnits: number;
  /** 맞은 뒤 이 피격자의 무적(ms). */
  readonly invulnerableMs: number;
  readonly coneHalfAngleDeg?: number;
  readonly reachExtraStrides?: number;
}

/** 평면 사거리: 접촉 거리 + `melee.reachExtraStrides`(보이는 주먹+이펙트). */
export function nativeCityMeleeReach(attackerRadius: number, targetRadius: number, stepUnits: number,
  extraStrides = NATIVE_CITY_COMBAT.melee.reachExtraStrides): number {
  return Math.max(0, attackerRadius) + Math.max(0, targetRadius) + Math.max(0, extraStrides) * Math.max(0, stepUnits);
}

/** 대상 발이 때리는 쪽 부채꼴 안인가. 발이 겹친 자리(거리 0)는 안이다. */
export function nativeCityMeleeInCone(origin: CityPoint, direction: CityPoint, target: CityPoint, halfAngleDeg: number): boolean {
  const dx = target[0] - origin[0], dy = target[1] - origin[1];
  const distance = Math.hypot(dx, dy), length = Math.hypot(direction[0], direction[1]);
  if (distance < 1e-6) return true;
  if (length < 1e-9) return false;
  const cos = (dx * direction[0] + dy * direction[1]) / (distance * length);
  return cos >= Math.cos(halfAngleDeg * Math.PI / 180) - 1e-9;
}

/**
 * The reach beyond body contact of a contact whose drawn tip lies `tipStrides` strides ahead of the attacker's root (`melee.reachFromArt`:
 * the old side fist's 0.94 gave the tuned 0.9; a 3-body tie is clamped to a melee range).
 */
export function nativeCityArtReachExtraStrides(tipStrides: number, spec: NativeCityArtReachTuning = NATIVE_CITY_COMBAT.melee.reachFromArt,
  move?: string): number {
  const authored = move === undefined ? undefined : spec.moveExtraStrides?.[move];
  if (authored !== undefined) return authored;
  if (!Number.isFinite(tipStrides)) return NATIVE_CITY_COMBAT.melee.reachExtraStrides;
  const max = (move !== undefined ? spec.moveMaxExtraStrides?.[move] : undefined) ?? spec.maxExtraStrides;
  return Math.max(spec.minExtraStrides, Math.min(max, tipStrides + spec.tipOffsetStrides));
}

/** 사거리와 부채꼴 둘 다 맞는가(무적·중복은 보지 않는다). */
export function nativeCityMeleeConnects(strike: NativeCityMeleeStrike, target: NativeCityMeleeBody, options: Pick<NativeCityMeleeOptions,
  "stepUnits" | "coneHalfAngleDeg" | "reachExtraStrides">): boolean {
  const reach = nativeCityMeleeReach(strike.radius, target.radius, options.stepUnits, options.reachExtraStrides);
  const distance = Math.hypot(target.point[0] - strike.origin[0], target.point[1] - strike.origin[1]);
  return distance <= reach + 1e-9 && nativeCityMeleeInCone(strike.origin, strike.direction, target.point,
    options.coneHalfAngleDeg ?? NATIVE_CITY_COMBAT.melee.coneHalfAngleDeg);
}

/** 무적 시간을 흘린다. */
export const stepNativeCityMeleeVictim = stepDuelContactState;

export interface NativeCityMeleeResult {
  readonly hit: boolean;
  /** The swing's first contact on this victim (`receiveDuelContact`): its later contacts continue the victim's reaction. */
  readonly first: boolean;
  readonly victim: NativeCityMeleeVictim;
  /** 맞았으면 밀려나는 평면 단위 방향(때린 쪽 → 맞은 쪽, 겹쳤으면 때린 쪽이 보는 방향). */
  readonly push: CityPoint;
}

/** 타격 프레임 한 번의 판정. 같은 접촉의 두 번째 판정·무적 중·사거리 밖·등 뒤는 들어가지 않는다. */
export function resolveNativeCityMelee(strike: NativeCityMeleeStrike, target: NativeCityMeleeBody, victim: NativeCityMeleeVictim,
  options: NativeCityMeleeOptions): NativeCityMeleeResult {
  const miss = { hit: false, first: false, victim, push: [0, 0] as CityPoint };
  const contact = receiveDuelContact(victim, strike, { targetHittable: strike.damage > 0,
    sameFloor: true, inFront: true, inReach: nativeCityMeleeConnects(strike, target, options) }, options.invulnerableMs);
  if (!contact.connects) return miss;
  const dx = target.point[0] - strike.origin[0], dy = target.point[1] - strike.origin[1], distance = Math.hypot(dx, dy);
  const facing = Math.hypot(strike.direction[0], strike.direction[1]);
  const push: CityPoint = distance > 1e-6 ? [dx / distance, dy / distance]
    : facing > 1e-9 ? [strike.direction[0] / facing, strike.direction[1] / facing] : [0, 0];
  return { hit: true, first: contact.first, victim: contact.state, push };
}

/**
 * A summoned object's contact on a body it already swept over (2026-10-20, `CityFightSummons` — its geometry is the field's): one contact per
 * object (`receiveDuelContact`), the victim's protection after a blow lets it through untouched (`protected`: judged again next step), else it
 * connects and leaves `invulnerableMs`.
 */
export function resolveNativeCityProjectile(strike: DuelStrikeIdentity, victim: NativeCityMeleeVictim, invulnerableMs: number)
  : { readonly hit: boolean; readonly first: boolean; readonly protected: boolean; readonly victim: NativeCityMeleeVictim } {
  const contact = receiveDuelContact(victim, strike, { targetHittable: true, inFront: true, sameFloor: true, inReach: true }, invulnerableMs);
  return { hit: contact.connects, first: contact.first, protected: contact.dodged, victim: contact.state };
}

/** 넉백 거리(평면 단위). */
export function nativeCityKnockbackUnits(tier: NativeCityMeleeTier, stepUnits: number): number {
  const { lightStrides, heavyStrides } = NATIVE_CITY_COMBAT.knockback;
  return (tier === "heavy" ? heavyStrides : lightStrides) * Math.max(0, stepUnits);
}

/** 넉백 따라잡기 곡선(`render/effects/KnockbackCurve` 와 같은 꼴, 평면 단위). */
export function nativeCityKnockbackCurve(stepUnits: number, launch = false): { readonly tauMs: number; readonly stopPxPerMs: number } {
  const { tauMs, stopStridesPerSec } = launch ? NATIVE_CITY_COMBAT.knockback.launch : NATIVE_CITY_COMBAT.knockback;
  return { tauMs, stopPxPerMs: stopStridesPerSec * Math.max(0, stepUnits) / 1000 };
}


export interface NativeCityKnock extends DuelKnock {
  /** A KO's rope rebound (2026-10-24, `nativeCityKumaFighterKoRebound`): a body or the line's end only stops it — it splats no second time. */
  readonly rebound?: true;
}

/**
 * One step of a push over `dtMs` of fight clock: `travel` (plan units along its direction — the curve's remaining length before minus after,
 * so the total is the same at any frame rate), `leftUnits` (what remained before the step) and the push after it (null once nothing
 * remains). A held clock (`dtMs` ≤ 0) moves nothing and keeps the push. What stops the body (a body step, a wall, the stage line) is the
 * caller's.
 */
export function stepNativeCityKnock<K extends NativeCityKnock>(knock: K, dtMs: number, stepUnits: number)
  : { readonly travel: number; readonly leftUnits: number; readonly knock: K | null } {
  return stepDuelKnock(knock, dtMs, nativeCityKnockbackCurve(stepUnits, knock.launch === true));
}

/**
 * One step of a pushed fighter's body (2026-10-17: KUMA-type fighters and Otto — Otto used to stop dead at the first wall): the push's
 * travel this step (`stepNativeCityKnock`), a body step along it that slides along a wall or round a body (`nativeCityBodyStep` — the
 * blocked axis is dropped, the other carries on), held on the stage `line`. `moved`: how far the body really went along the push;
 * `leftUnits`: what remained before the step (a launch that ends early against a wall reads these — `knock-wall`). A held clock moves
 * nothing and keeps the push.
 */
export function stepNativeCityKnockedBody<K extends NativeCityKnock>(point: CityPoint, knock: K, dtMs: number, stepUnits: number,
  radius: number, blockers: readonly NativeCityFootprint[], walkable?: (from: CityPoint, to: CityPoint) => boolean,
  line?: (point: CityPoint) => CityPoint)
  : { readonly point: CityPoint; readonly knock: K | null; readonly travel: number; readonly moved: number; readonly leftUnits: number } {
  const pushed = stepNativeCityKnock(knock, dtMs, stepUnits);
  if (!(pushed.travel > 0)) return { point, knock: pushed.knock, travel: 0, moved: 0, leftUnits: pushed.leftUnits };
  const goal: CityPoint = [point[0] + knock.direction[0] * pushed.travel, point[1] + knock.direction[1] * pushed.travel];
  const stepped = nativeCityBodyStep(point, goal, radius, blockers, walkable);
  const to = line ? line(stepped) : stepped;
  const moved = (to[0] - point[0]) * knock.direction[0] + (to[1] - point[1]) * knock.direction[1];
  return { point: to, knock: pushed.knock, travel: pushed.travel, moved, leftUnits: pushed.leftUnits };
}

/**
 * The knockback (strides) a landed chain contact gives KUMA (`player.actions.combo.launch`): its drawn reach beyond contact
 * (`reachExtraStrides`, the art's tip at runtime scale) × `reachShare`, clamped to [`minStrides`, `maxStrides`] — the tie whip ~2.75
 * (about the tie's length), the tie flick ~1, the back-hand flick 0.3. `curve`: it flies on the launch curve. Null: no launch (also a
 * contact with no drawn reach — the diagonals' fists).
 */
export function nativeCityChainLaunch(hitIndex: number, reachExtraStrides: number | undefined,
  t: NativeCityChainLaunchTuning | undefined = NATIVE_CITY_COMBAT.player.actions.combo.launch): { readonly strides: number; readonly curve: boolean } | null {
  // Only a contact whose reach is drawn (the side duel moves' rubber arm and tie) launches; the diagonals' fists keep the tier push.
  if (!t || reachExtraStrides === undefined || !(hitIndex >= 0) || hitIndex >= t.minStrides.length) return null;
  const reach = reachExtraStrides;
  const min = t.minStrides[hitIndex] ?? 0, max = Math.max(min, t.maxStrides[hitIndex] ?? min);
  const strides = Math.max(min, Math.min(max, reach * (t.reachShare[hitIndex] ?? 0)));
  return strides > 0 ? { strides, curve: t.curve[hitIndex] === true } : null;
}


export function nativeCityPlayerCancelTuning(kind: NativeCityPlayerActionKind): NativeCityCancelTuning {
  const cancel = NATIVE_CITY_COMBAT.tempo.player.cancel;
  return kind === "combo" ? cancel.chain : kind === "dashAttack" ? cancel.dash : cancel.heavy;
}

/** Rule-owned per-contact values; art supplies the count/timing, never damage or opponent-specific choreography. */
export function nativeCityPlayerContactTuning(kind: NativeCityPlayerActionKind, contactCount: number, chainSegment?: number) {
  const base = NATIVE_CITY_COMBAT.player.actions[kind];
  const burst = chainSegment === undefined ? undefined : base.bursts?.[chainSegment];
  if (contactCount > 1 && burst) return burst;
  return { ...base, poise: NATIVE_CITY_COMBAT.poise.drain[kind] };
}

/**
 * 밀려나거나 내디디거나 쫓아가는 몸 한 걸음: 벽(`walkable`)이면 축 하나로 미끄러지고, 그 뒤 다른 몸 원에는 접선으로만
 * 미끄러진다(`resolveNativeCityPlayerMove` slide). 어느 쪽도 뚫지 않는다.
 */
export function nativeCityBodyStep(from: CityPoint, to: CityPoint, radius: number, blockers: readonly NativeCityFootprint[],
  walkable?: (from: CityPoint, to: CityPoint) => boolean): CityPoint {
  let target = to;
  if (walkable && !walkable(from, to)) {
    const xOnly: CityPoint = [to[0], from[1]], yOnly: CityPoint = [from[0], to[1]];
    target = walkable(from, xOnly) ? xOnly : walkable(from, yOnly) ? yOnly : from;
  }
  if (target === from) return from;
  return resolveNativeCityPlayerMove({ from, to: target, radius, blockers, mode: "slide", ...(walkable ? { walkable } : {}) }).point;
}
