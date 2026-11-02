import type { Facing, InputFrame, Rect, Vec2 } from "./types";
import type { GrappleAnchor, MansionLayout } from "./MansionLayout";
import { solidRects } from "./MansionLayout";
import { clamp, rectOverlaps, segmentIntersectsRect } from "./geom";
import type { MoveContext, MoveResult, PlayerSimState } from "./MovementRules";
import { throwableRoute } from "./ParkourRules";
import type { Tuning } from "./tuning";

/*
 * 고리 사슬. E 한 번이 "쏘고 → 보장된 호로 날아가 → 잡는다" 이다.
 *
 * 매달리면 진자가 스스로 흔들림을 유지하고(펌프 입력 불필요), ←/→ 는 흔들림을 키우고 몸을
 * 기울이며 보는 쪽을 정한다. 방향 + E(또는 E 만 = 보는 쪽)는 그쪽 다음 고리로 옮겨 잡는다 —
 * 놓고 → 250~320ms 의 정해진 호를 날아 → 잡는다. 호는 누르는 순간에 전 구간을 검사하므로
 * 흔들림의 어느 위상에서 눌러도 결과가 같다. Space 는 놓기(보는 쪽으로 흔들려 나갈 때 가속),
 * ↓ 는 그냥 떨어지기다.
 *
 * 매달림 길이(고리→발)는 쉬는 자세 몸 길이에 짧은 사슬을 더한 값으로 고정한다. 고리는 움직이지
 * 않고 진자의 중심이다.
 */

/** 줄을 쏘아 고리로 날아가는 중. 끝나면 `GrappleState` 의 각도·각속도로 매달린다. */
export interface GrappleFlight {
  /** 출발한 발 좌표. */
  readonly from: Vec2;
  /** 2차 베지어 조절점. 도착점은 고리·길이·각도에서 다시 계산한다. */
  readonly control: Vec2;
  readonly elapsedMs: number;
  readonly durationMs: number;
  /** 옮겨 잡기면 놓은 고리. 처음 쏘기면 없다. */
  readonly fromAnchorId?: string;
}

/** Optional and JSON-safe, so old saves without chain traversal remain valid. */
export interface GrappleState {
  readonly anchorId: string;
  readonly ropeLengthPx: number;
  /** Radians from the downward vertical. 비행 중에는 잡는 순간의 각도다. */
  readonly angleRad: number;
  /** 비행 중에는 잡는 순간 넘겨받을 각속도다. */
  readonly angularVelocity: number;
  readonly flight?: GrappleFlight;
  /** 잡은 뒤 흐른 시간. 잡는 자세(무릎 당김)를 고르는 렌더 신호다. 비행 중에는 없다. */
  readonly heldMs?: number;
  /** `GrappleAnchor.autoDismountFrom` 으로 옮겨 잡았을 때 스스로 뛰어내리기까지 남은 시간. */
  readonly autoDismountMs?: number;
}

export interface GrappleFlightPlan {
  readonly ropeLengthPx: number;
  readonly angleRad: number;
  readonly angularVelocity: number;
  readonly control: Vec2;
  readonly to: Vec2;
  readonly durationMs: number;
}

export interface GrappleTarget {
  readonly anchor: GrappleAnchor;
  readonly plan: GrappleFlightPlan;
}

function valid(anchor: GrappleAnchor): boolean {
  return anchor.id.length > 0 && Number.isFinite(anchor.at.x) && Number.isFinite(anchor.at.y)
    && (anchor.reachPx === undefined || Number.isFinite(anchor.reachPx) && anchor.reachPx > 0);
}

function bodyAt(feet: Vec2, tuning: Tuning): Rect {
  const { bodyWidth, bodyHeightStand } = tuning.movement;
  return { x: feet.x - bodyWidth / 2, y: feet.y - bodyHeightStand, w: bodyWidth, h: bodyHeightStand };
}

/** 두 발 위치의 몸을 감싼 사각형이 벽을 건드리는가. 한 틱·한 호 구간의 보수적 판정이다. */
function sweepClear(from: Vec2, to: Vec2, solids: readonly Rect[], tuning: Tuning): boolean {
  const a = bodyAt(from, tuning);
  const b = bodyAt(to, tuning);
  const sweep: Rect = {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.max(a.x + a.w, b.x + b.w) - Math.min(a.x, b.x),
    h: Math.max(a.y + a.h, b.y + b.h) - Math.min(a.y, b.y),
  };
  return !solids.some((solid) => rectOverlaps(sweep, solid));
}

export function grappleHand(player: Vec2, tuning: Tuning): Vec2 {
  return { x: player.x, y: player.y - tuning.movement.bodyHeightStand * 0.7 };
}

export function grappleFeetAt(anchor: Vec2, ropeLengthPx: number, angleRad: number): Vec2 {
  return { x: anchor.x + Math.sin(angleRad) * ropeLengthPx, y: anchor.y + Math.cos(angleRad) * ropeLengthPx };
}

/** 줄이 당기는 호: 출발은 빠르고 잡는 쪽에서 조금 늦춘다(u'(0)=1.6, u'(1)=0.4). */
const FLIGHT_EASE = 0.6;
function flightEase(t: number): number {
  return t + FLIGHT_EASE * t * (1 - t);
}
function flightEaseSlope(t: number): number {
  return 1 + FLIGHT_EASE * (1 - 2 * t);
}

function bezier(from: Vec2, control: Vec2, to: Vec2, u: number): Vec2 {
  const a = (1 - u) * (1 - u);
  const b = 2 * (1 - u) * u;
  const c = u * u;
  return { x: a * from.x + b * control.x + c * to.x, y: a * from.y + b * control.y + c * to.y };
}

function bezierSlope(from: Vec2, control: Vec2, to: Vec2, u: number): Vec2 {
  return {
    x: 2 * (1 - u) * (control.x - from.x) + 2 * u * (to.x - control.x),
    y: 2 * (1 - u) * (control.y - from.y) + 2 * u * (to.y - control.y),
  };
}

const FLIGHT_SAMPLES = 8;

/**
 * 한 고리로 가는 보장된 호. 잡는 자리(진행 반대쪽으로 조금 기운 곳)·매달림 길이·호의 높이를
 * 몇 가지 후보로 시험해, 몸이 벽을 건드리지 않는 첫 조합을 고른다. 모두 막히면 null 이고
 * 그 고리는 후보에서 빠진다(쏘고 나서 벽에 막히는 일이 없다).
 */
export function planGrappleFlight(
  layout: MansionLayout,
  tuning: Tuning,
  from: Vec2,
  anchor: GrappleAnchor,
  direction: Facing,
): GrappleFlightPlan | null {
  const g = tuning.grapple;
  // 호가 지날 수 있는 범위(출발·고리 아래 매달림·들어 올린 호)에 걸친 벽만 본다. 매 틱 프롬프트가 부르는 판정이다.
  const reachX = g.hangRopeLengthPx + tuning.movement.bodyWidth;
  const bounds: Rect = {
    x: Math.min(from.x, anchor.at.x - reachX) - tuning.movement.bodyWidth,
    y: Math.min(from.y, anchor.at.y) - tuning.movement.bodyHeightStand - g.flightLiftPx,
    w: Math.abs(from.x - anchor.at.x) + reachX * 2 + tuning.movement.bodyWidth * 2,
    h: Math.abs(from.y - anchor.at.y) + g.hangRopeLengthPx + tuning.movement.bodyHeightStand * 2 + g.flightLiftPx * 2,
  };
  const solids = solidRects(layout).filter((solid) => rectOverlaps(solid, bounds));
  let ropeLengthPx: number | null = null;
  for (let length = g.hangRopeLengthPx; length >= g.minRopeLengthPx; length -= 4) {
    if (sweepClear(grappleFeetAt(anchor.at, length, 0), grappleFeetAt(anchor.at, length, 0), solids, tuning)) {
      ropeLengthPx = length;
      break;
    }
  }
  if (ropeLengthPx === null) return null;
  for (const angleRad of [-direction * g.catchAngleRad, 0, direction * g.catchAngleRad * 0.5]) {
    const to = grappleFeetAt(anchor.at, ropeLengthPx, angleRad);
    if (!sweepClear(to, to, solids, tuning)) continue;
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const lift = Math.min(g.flightLiftPx, distance * 0.2);
    const controls = [lift, 0, -lift].map((rise) => ({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - rise }));
    // 사다리 구멍처럼 좁은 틈에서는 먼저 곧게 솟았다가 건너가는 호만 턱에 걸리지 않는다.
    controls.push({ x: from.x, y: Math.min(from.y, to.y) - lift });
    for (const control of controls) {
      let previous = from;
      let clear = true;
      for (let i = 1; i <= FLIGHT_SAMPLES && clear; i += 1) {
        const point = bezier(from, control, to, i / FLIGHT_SAMPLES);
        clear = sweepClear(previous, point, solids, tuning);
        previous = point;
      }
      if (!clear) continue;
      const durationMs = clamp(distance / g.flightSpeedPxPerSec * 1000, g.flightMinMs, g.flightMaxMs);
      // 도착 속도의 접선 성분을 흔들림으로 넘긴다. 빨리 날아오면 크게, 느리면 최소 흔들림으로 잡는다.
      const slope = bezierSlope(from, control, to, 1);
      const scale = flightEaseSlope(1) / (durationMs / 1000);
      const arrival = { x: slope.x * scale, y: slope.y * scale };
      const tangential = arrival.x * Math.cos(angleRad) - arrival.y * Math.sin(angleRad);
      const speed = clamp(Math.max(0, tangential * direction), g.catchMinSpeedPxPerSec, g.catchMaxSpeedPxPerSec);
      return { ropeLengthPx, angleRad, angularVelocity: direction * speed / ropeLengthPx, control, to, durationMs };
    }
  }
  return null;
}

// 사다리는 막지 않는다. 배수관 꼭대기에 매달린 채로도 E 가 첫 고리로 간다(사다리 위 E 는 다른 뜻이 없다).
function traversalBlocked(player: PlayerSimState): boolean {
  return player.staggerMs > 0 || player.hideSpotId !== null || player.ventLinkId !== null
    || player.parkour !== undefined && player.parkour.phase !== "swing" && player.parkour.phase !== "release";
}

/**
 * E 가 지금 잡을 고리와 그 호. 프롬프트·고리 표식·실제 행동이 모두 이 한 판정을 쓴다.
 *
 * - 매달려 있으면: `direction`(없으면 보는 쪽)에 있는 가장 가까운 다음 고리(고리 대 고리 거리).
 * - 공중·사다리·샹들리에 흔들기 중: 손에서 닿는 고리 가운데 보는 쪽·위쪽을 우선한다.
 * - 지면: 머리 위 고리만. 보는 쪽은 순서만 정하고 등 뒤 고리도 잡는다 — 뒤돌아 서 있다고 E 가
 *   헛돌면 조금씩 걸어 방향을 맞춰야 했다. 다른 E 행동과의 순서는 상호작용 중재기가 정한다.
 * - 비행 중에는 새 대상이 없다(다음 E 는 버퍼로 남는다).
 */
export function grappleTarget(
  layout: MansionLayout,
  player: PlayerSimState,
  tuning: Tuning,
  direction: -1 | 0 | 1 = 0,
): GrappleTarget | null {
  if (traversalBlocked(player)) return null;
  const state = player.grapple;
  if (state?.flight !== undefined) return null;
  const facing: Facing = direction !== 0 ? direction : player.facing;
  const anchors = (layout.grappleAnchors ?? []).filter(valid);
  const solids = solidRects(layout);
  const hand = grappleHand(player, tuning);
  const candidates: { anchor: GrappleAnchor; score: number }[] = [];
  if (state !== undefined) {
    const current = anchors.find((anchor) => anchor.id === state.anchorId);
    if (current === undefined) return null;
    for (const anchor of anchors) {
      if (anchor.id === current.id) continue;
      const dx = anchor.at.x - current.at.x;
      const dy = anchor.at.y - current.at.y;
      if (dx * facing < tuning.grapple.transferMinAheadPx) continue;
      if (Math.hypot(dx, dy) > tuning.grapple.transferReachPx) continue;
      if (solids.some((solid) => segmentIntersectsRect(hand, anchor.at, solid))) continue;
      candidates.push({ anchor, score: Math.abs(dx) + Math.abs(dy) * 1.5 });
    }
  } else {
    for (const anchor of anchors) {
      const dx = anchor.at.x - player.x;
      if (player.onGround && anchor.at.y > player.y - tuning.movement.bodyHeightStand - tuning.grapple.groundMinRisePx) continue;
      const distance = Math.hypot(anchor.at.x - hand.x, anchor.at.y - hand.y);
      if (distance > (anchor.reachPx ?? tuning.grapple.reachPx)) continue;
      if (solids.some((solid) => segmentIntersectsRect(hand, anchor.at, solid))) continue;
      // 보는 쪽·위쪽 고리가 같은 거리의 뒤쪽·아래쪽 고리보다 먼저다.
      const behind = Math.max(0, -dx * facing);
      const below = Math.max(0, anchor.at.y - hand.y);
      candidates.push({ anchor, score: distance + behind * 1.2 + below });
    }
  }
  candidates.sort((a, b) => a.score - b.score || (a.anchor.id < b.anchor.id ? -1 : a.anchor.id > b.anchor.id ? 1 : 0));
  for (const { anchor } of candidates) {
    const travel = state !== undefined ? facing
      : Math.abs(anchor.at.x - player.x) < 8 ? facing : anchor.at.x > player.x ? 1 : -1;
    const plan = planGrappleFlight(layout, tuning, { x: player.x, y: player.y }, anchor, travel);
    if (plan !== null) return { anchor, plan };
  }
  return null;
}

/** Prompt and action use this same reach, occlusion and player-state predicate. */
export function availableAnchor(
  layout: MansionLayout,
  player: PlayerSimState,
  tuning: Tuning,
  direction: -1 | 0 | 1 = 0,
): GrappleAnchor | null {
  return grappleTarget(layout, player, tuning, direction)?.anchor ?? null;
}

/**
 * E(또는 버퍼에 남은 E)로 줄을 쏜다. 매달린 상태면 옮겨 잡기다. 성공한 누름은 늘 스태미나를 쓴다.
 * 결과는 비행 시작이고, `GrappleAttached` 는 줄이 날아가는 이 순간에 한 번 난다. 몸이 고리에 걸리는
 * 비행 끝은 `GrappleCaught`, 입력으로 놓는 순간은 `GrappleReleased` 다(`stepGrapple`).
 */
export function attachGrapple(
  player: PlayerSimState,
  input: InputFrame,
  ctx: MoveContext,
): MoveResult | null {
  // 발코니의 E 는 줄 던지기다. 중재기가 그 E 를 던지기에 줬거나, 중재기 없이 발코니에 서 있으면 고리는 손대지 않는다.
  const balcony = () => typeof ctx.parkourInteractRouteId === "string"
    || ctx.grappleInteractAnchorId === undefined && player.onGround
      && throwableRoute(ctx.layout, player, ctx.tuning.parkour.departureReachPx) !== null;
  const pressed = input.interactPressed && ctx.grappleInteractAnchorId !== null
    && (player.grapple !== undefined || !balcony());
  const buffered = !input.interactPressed && player.grappleBufferMs > 0 && !player.onGround;
  if (!pressed && !buffered) return null;
  if ((ctx.staminaValue ?? Infinity) < ctx.tuning.grapple.attachCost) return null;
  const hanging = player.grapple !== undefined;
  const target = grappleTarget(ctx.layout, player, ctx.tuning, hanging ? input.moveX : 0);
  if (target === null) return null;
  const { anchor, plan } = target;
  const direction: Facing = plan.angularVelocity > 0 ? 1 : plan.angularVelocity < 0 ? -1 : player.facing;
  const flight: GrappleFlight = {
    from: { x: player.x, y: player.y }, control: plan.control, elapsedMs: 0, durationMs: plan.durationMs,
    ...(player.grapple === undefined ? {} : { fromAnchorId: player.grapple.anchorId }),
  };
  const slope = bezierSlope(flight.from, flight.control, plan.to, 0);
  const scale = flightEaseSlope(0) / (plan.durationMs / 1000);
  return {
    player: {
      ...player, grappleBufferMs: 0, vx: slope.x * scale, vy: slope.y * scale, onGround: false, parkour: undefined, climbLinkId: null, facing: direction,
      grapple: { anchorId: anchor.id, ropeLengthPx: plan.ropeLengthPx, angleRad: plan.angleRad,
        angularVelocity: plan.angularVelocity, flight },
      grappleAirborne: true, pose: "hang", motion: "still", jumpBufferMs: 0,
      fallStartY: Math.min(player.fallStartY, player.y),
    },
    events: [{ kind: "GrappleAttached", anchorId: anchor.id, at: anchor.at }],
  };
}

function stateIsFinite(state: GrappleState): boolean {
  const flight = state.flight;
  return Number.isFinite(state.ropeLengthPx) && Number.isFinite(state.angleRad) && Number.isFinite(state.angularVelocity)
    && (state.heldMs === undefined || Number.isFinite(state.heldMs))
    && (state.autoDismountMs === undefined || Number.isFinite(state.autoDismountMs))
    && (flight === undefined || Number.isFinite(flight.from.x) && Number.isFinite(flight.from.y)
      && Number.isFinite(flight.control.x) && Number.isFinite(flight.control.y)
      && Number.isFinite(flight.elapsedMs) && Number.isFinite(flight.durationMs) && flight.durationMs > 0);
}

type Advance = (falling: PlayerSimState, input?: InputFrame) => MoveResult;

function letGo(player: PlayerSimState, vx: number, vy: number, advancePhysics: Advance, input: InputFrame): MoveResult {
  return advancePhysics({ ...player, vx, vy, grapple: undefined, pose: "stand", motion: "still", onGround: false,
    jumpBufferMs: 0, jumpCutUsed: true, facing: Math.abs(vx) > 1 ? (vx > 0 ? 1 : -1) : player.facing,
    fallStartY: Math.min(player.fallStartY, player.y) }, input);
}

/** 비행 → 매달림 → 놓기. 고리는 움직이지 않는 진자의 중심이고, 몸은 벽을 뚫지 않는다. */
export function stepGrapple(
  player: PlayerSimState,
  input: InputFrame,
  ctx: MoveContext,
  dtMs: number,
  advancePhysics: Advance,
): MoveResult {
  const state = player.grapple;
  const anchor = ctx.layout.grappleAnchors?.find((item) => item.id === state?.anchorId && valid(item));
  const g = ctx.tuning.grapple;
  if (state === undefined || anchor === undefined || !stateIsFinite(state)
    || state.ropeLengthPx < g.minRopeLengthPx - 0.001
    || state.ropeLengthPx > Math.max(g.hangRopeLengthPx, g.reachPx) + 0.001
    || ctx.exhausted || player.staggerMs > 0) {
    return advancePhysics({ ...player, grapple: undefined, pose: "stand" }, input);
  }
  const solids = solidRects(ctx.layout);
  const dt = dtMs / 1000;

  if (state.flight !== undefined) {
    const flight = state.flight;
    const to = grappleFeetAt(anchor.at, state.ropeLengthPx, state.angleRad);
    const elapsedMs = Math.min(flight.durationMs, flight.elapsedMs + dtMs);
    const t = elapsedMs / flight.durationMs;
    const at = bezier(flight.from, flight.control, to, flightEase(t));
    const slope = bezierSlope(flight.from, flight.control, to, flightEase(t));
    const scale = flightEaseSlope(t) / (flight.durationMs / 1000);
    const vx = slope.x * scale;
    const vy = slope.y * scale;
    // 호는 누를 때 검사했다. 그 사이 세계가 바뀌어(바깥 무대 전환 등) 막히면 그 자리에서 놓는다.
    if (!sweepClear(player, at, solids, ctx.tuning)) return letGo(player, vx, vy, advancePhysics, input);
    if (elapsedMs < flight.durationMs) {
      return { player: { ...player, ...at, vx, vy, onGround: false, pose: "hang", motion: "still",
        grapple: { ...state, flight: { ...flight, elapsedMs } } }, events: [] };
    }
    const { flight: _done, ...held } = state;
    const dismount = g.autoDismountMs !== undefined && flight.fromAnchorId !== undefined
      && anchor.autoDismountFrom?.includes(flight.fromAnchorId) === true;
    return { player: { ...player, ...to, onGround: false, pose: "hang", motion: "still",
      vx: Math.cos(state.angleRad) * state.angularVelocity * state.ropeLengthPx,
      vy: -Math.sin(state.angleRad) * state.angularVelocity * state.ropeLengthPx,
      grapple: { ...held, heldMs: 0, ...(dismount ? { autoDismountMs: g.autoDismountMs } : {}) } },
    events: [{ kind: "GrappleCaught", anchorId: anchor.id, at: anchor.at,
      transfer: flight.fromAnchorId !== undefined, facing: player.facing }] };
  }

  const theta = state.angleRad;
  const omega = state.angularVelocity;
  const length = state.ropeLengthPx;
  const tangentVx = Math.cos(theta) * omega * length;
  const tangentVy = -Math.sin(theta) * omega * length;
  // 놓는 틱의 박자. 렌더가 차고 나감·그냥 놓음·떨어짐을 다르게 연출한다.
  const released = (release: "boost" | "hop" | "drop", result: MoveResult): MoveResult => ({
    ...result,
    events: [{ kind: "GrappleReleased", anchorId: anchor.id, at: { x: player.x, y: player.y }, release,
      facing: player.facing }, ...result.events],
  });
  // ↓ 또는 ↓+Space 는 그냥 놓는다. 흔들리던 속도는 조금만 남긴다.
  if (input.crouchPressed || input.jump && (input.crouch || input.moveY > 0)) {
    return released("drop", letGo(player, tangentVx * 0.6, Math.max(0, tangentVy), advancePhysics, input));
  }
  if (input.jump) {
    const facing = player.facing;
    // 보는 쪽으로 흔들려 나가는 반쪽에서 놓으면 차고 나가는 도약이다. 뒤로 흔들릴 때는 작은 뜀만 더한다.
    if (omega * facing > 0) {
      const forward = Math.max(Math.abs(tangentVx * g.releaseBoostSpeedMul), g.releaseBoostMinForwardPxPerSec);
      const vy = Math.max(-ctx.tuning.movement.jumpVelocity * 1.1,
        tangentVy * g.releaseBoostSpeedMul - g.releaseBoostLiftPxPerSec);
      return released("boost", letGo(player, facing * forward, vy, advancePhysics, input));
    }
    return released("hop", letGo(player, tangentVx, tangentVy - g.releaseHopLiftPxPerSec, advancePhysics, input));
  }
  // 창을 지나 방으로 들어온 고리: 잡는 박자를 보여 준 뒤 보는 쪽으로 차고 뛰어내린다.
  if (state.autoDismountMs !== undefined && state.autoDismountMs <= dtMs) {
    return released("boost", letGo(player, player.facing * g.releaseBoostMinForwardPxPerSec,
      -g.releaseBoostLiftPxPerSec, advancePhysics, input));
  }

  // 스스로 흔들리는 진자. 현재 에너지로 잰 진폭을 목표 진폭으로 끌어가는 접선 가속만 더한다.
  const gravity = ctx.tuning.movement.gravity;
  const energy = omega * omega * length / (2 * gravity) + 1 - Math.cos(theta);
  const amplitude = Math.acos(clamp(1 - energy, -1, 1));
  const targetAmplitude = input.moveX !== 0 ? g.swingHeldAmplitudeRad : g.swingAmplitudeRad;
  const drive = clamp((targetAmplitude - amplitude) * g.swingDriveGainPxPerSec2PerRad,
    -g.swingDriveMaxPxPerSec2, g.swingDriveMaxPxPerSec2);
  // 끝점(각속도≈0)에서는 곧 움직일 쪽(중심 방향)으로, 완전히 멈췄으면 보는 쪽으로 민다.
  const along = Math.abs(omega) > 0.05 ? Math.sign(omega)
    : Math.abs(theta) > 0.01 ? -Math.sign(theta) : player.facing;
  const angularAcceleration = -(gravity / length) * Math.sin(theta)
    + (drive * along + input.moveX * g.steerAccelPxPerSec2) / length;
  const maxOmega = g.maxTangentialSpeedPxPerSec / length;
  let angularVelocity = clamp(omega + angularAcceleration * dt, -maxOmega, maxOmega);
  let angleRad = theta + angularVelocity * dt;
  let target = grappleFeetAt(anchor.at, length, angleRad);
  if (!sweepClear(player, target, solids, ctx.tuning)) {
    // 벽을 만나면 놓지 않고 튕겨 돌아온다. 매달림을 잃는 일은 플레이어의 입력으로만 생긴다.
    angularVelocity = -omega * g.wallBounce;
    angleRad = theta;
    target = { x: player.x, y: player.y };
  }
  const vx = Math.cos(angleRad) * angularVelocity * length;
  const vy = -Math.sin(angleRad) * angularVelocity * length;
  return { player: { ...player, ...target, vx, vy, onGround: false, pose: "hang", motion: "still",
    facing: input.moveX !== 0 ? input.moveX : player.facing,
    grapple: { ...state, angleRad, angularVelocity, heldMs: (state.heldMs ?? 0) + dtMs,
      ...(state.autoDismountMs === undefined ? {} : { autoDismountMs: state.autoDismountMs - dtMs }) } }, events: [] };
}
