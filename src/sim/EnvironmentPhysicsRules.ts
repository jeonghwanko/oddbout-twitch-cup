import { shovePropTarget, walkPushCartTarget } from "./PhysicsTargetRules";
import Matter from "matter-js";
import type { MansionLayout } from "./MansionLayout";
import type { InputFrame, Rect, SimEvent } from "./types";
import type { Tuning } from "./tuning";
import { PROP_PHYSICS_TUNING as P, SIM_STEP_MS } from "./tuning";
import { physicsLayoutFor, propRect, type EnvironmentPhysicsState, type PhysicsPropState } from "./PhysicsProps";
import { displaceHorizontally } from "./CombatDisplacementRules";
import { canBeCombatTarget, haltGuardMovement, immobilize } from "./GuardStatusRules";
import type { GuardState } from "./GuardPlanner";
import { standingOnSurface, type PlayerSimState } from "./MovementRules";
import { rectOverlaps } from "./geom";
import { staticSolidRects } from "./LayoutGeometryMemo";

// Supply visual defaults to avoid Matter's internal random palette selection.
const INVISIBLE = { fillStyle: "transparent", strokeStyle: "transparent", lineWidth: 0 } as const;

/** 정적 지형 월드 캐시. 엔진과 정적 지형 바디만 틱 사이에 재사용하고, 소품 바디·충돌 쌍·
 * 시간값은 매 틱 새로 만든다. 그래서 캐시는 레이아웃 지형(내용 키)에서만 파생되고 SimState 는
 * 전혀 담지 않는다 — 되감기·리플레이·체크포인트 복원·여러 SimState 가 같은 항목을 번갈아 써도
 * 결과가 같다. 정적 바디가 update 뒤에 남기는 값(force·totalContacts·velocity)은 Matter 가
 * 매 update 끝에 0 으로 되돌리므로(clearForces·postSolvePosition·updateVelocities) 적중과
 * 미적중이 비트 단위로 같다. test/environment-physics-cache.test.ts 가 옛 매-틱 재생성과 대조한다. */
interface StaticWorld { readonly engine: Matter.Engine; readonly statics: readonly Matter.Body[] }
const STATIC_WORLDS = new Map<string, StaticWorld>();
// 저택·판본·테스트 변형 몇 개가 번갈아 쓰여도 충분하다. 넘치면 가장 오래 안 쓴 것부터 버린다.
const STATIC_WORLD_LIMIT = 8;

/** 테스트용: 캐시를 비워 다음 틱이 미적중(엔진·지형 새로 만들기) 경로를 타게 한다. */
export function resetEnvironmentPhysicsCache(): void { STATIC_WORLDS.clear(); }

function staticWorldKey(rects: readonly Rect[]): string {
  // String(n)은 double 을 왕복 가능한 최단 표기로 쓴다. -0 만 따로 구분한다.
  const n = (v: number) => Object.is(v, -0) ? "-0" : String(v);
  return rects.map(r => `${n(r.x)},${n(r.y)},${n(r.w)},${n(r.h)}`).join(";");
}

function staticWorldFor(key: string, rects: readonly Rect[]): StaticWorld {
  const cached = STATIC_WORLDS.get(key);
  if (cached) { STATIC_WORLDS.delete(key); STATIC_WORLDS.set(key, cached); return cached; }
  const world: StaticWorld = {
    engine: Matter.Engine.create({ gravity: { x: 0, y: 1, scale: P.gravity }, enableSleeping: false }),
    statics: rects.map((r, i) => Matter.Bodies.rectangle(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h,
      { id: i + 1, isStatic: true, friction: 0.08, render: INVISIBLE })),
  };
  STATIC_WORLDS.set(key, world);
  if (STATIC_WORLDS.size > STATIC_WORLD_LIMIT) STATIC_WORLDS.delete(STATIC_WORLDS.keys().next().value!);
  return world;
}

/** 엔진을 갓 만든 것과 같은 상태로 되돌린다: 충돌 쌍(웜 스타트 포함)·탐지기 정렬 순서·시간값·월드 목록. */
function resetEngine(engine: Matter.Engine): void {
  Matter.Engine.clear(engine);
  const timing = engine.timing as Matter.IEngineTimingOptions & { lastElapsed: number; lastUpdatesPerFrame: number };
  timing.timestamp = 0; timing.lastDelta = 0; timing.lastElapsed = 0; timing.lastUpdatesPerFrame = 0;
  Matter.Composite.clear(engine.world, false);
}

/** Reconstruct the moving part of a small world per tick. All persistent solver inputs are plain state;
 * no SimState-derived cache, wall-clock timing or global body IDs influence replay.
 * Only the engine shell and static terrain bodies are reused (see STATIC_WORLDS).
 * Rotation is locked so physical silhouettes and the game's AABB controller agree. */
export function stepEnvironment(state: EnvironmentPhysicsState | undefined, layout: MansionLayout, tuning: Tuning, dtMs: number) {
  const events: SimEvent[] = [];
  if (!state || dtMs <= 0) return { state, events };
  // 지형 배열마다 한 번만 훑는다(블랙손 장치 투영도 배열 정체성을 유지한다: LayoutGeometryMemo).
  const { rects, key } = staticSolidRects(layout.geometry, staticWorldKey);
  const { engine, statics } = staticWorldFor(key, rects);
  resetEngine(engine);
  try {
    return simulate(engine, statics, state, layout, tuning, dtMs, events);
  } catch (error) {
    // update 도중 끊기면 정적 바디에 중간값이 남을 수 있다. 그 항목은 버리고 다음 틱에 새로 만든다.
    STATIC_WORLDS.delete(key);
    throw error;
  } finally {
    // 소품 바디·충돌 쌍을 붙잡고 있지 않게 비워 둔다. 다음 틱은 어차피 resetEngine 부터 한다.
    resetEngine(engine);
  }
}

function simulate(engine: Matter.Engine, statics: readonly Matter.Body[], state: EnvironmentPhysicsState,
  layout: MansionLayout, tuning: Tuning, dtMs: number, events: SimEvent[]) {
  const bodies = state.bodies.map((b, i) => {
    const def = layout.physicsProps!.find(p => p.id === b.id)!;
    const body = Matter.Bodies.rectangle(b.x, b.y, def.rect.w, def.rect.h, {
      id: statics.length + i + 1, isStatic: false,
      inertia: Infinity, friction: 0.006,
      frictionStatic: 0, frictionAir: P.airFriction, restitution: P.restitution,
      render: INVISIBLE,
    });
    Matter.Body.setVelocity(body, { x: b.vx, y: b.vy });
    return body;
  });
  // 월드 목록 순서(정적 → 소품)가 탐지기 정렬의 동률 순서를 정하므로 새 엔진과 똑같이 넣는다.
  Matter.Composite.add(engine.world, [...statics, ...bodies]);
  // Bound substeps prevents tunnelling through thin slabs at larger caller dt.
  const count = Math.max(1, Math.ceil(dtMs / SIM_STEP_MS));
  for (let i = 0; i < count; i++) Matter.Engine.update(engine, dtMs / count);
  const next = state.bodies.map((b, i): PhysicsPropState => {
    const body = bodies[i]!;
    const speed = Math.hypot(b.vx, b.vy);
    const collision = engine.pairs.list.some((pair: Matter.Pair) => pair.isActive
      && (pair.bodyA.id === body.id || pair.bodyB.id === body.id));
    const impact = b.impactMs <= 0
      && speed >= P.impactSpeed && collision
      && Math.hypot(body.velocity.x - b.vx, body.velocity.y - b.vy) > P.impactSpeed;
    if (impact) {
      events.push({ kind: "PhysicsPropImpact", propId: b.id, at: body.position, strength: speed });
      events.push({ kind: "NoiseEmitted", at: { ...body.position }, floor: Math.floor(body.position.y / tuning.world.floorHeightPx), radius: P.noiseRadius, source: "prop", lure: true });
    }
    return { ...b, x: body.position.x, y: body.position.y, vx: body.velocity.x, vy: body.velocity.y,
      impactMs: impact ? P.impactMs : Math.max(0, b.impactMs - dtMs) };
  });
  return { state: { ...state, bodies: next }, events };
}

/** Commit only accepted combat/throw events, never raw keys: cooldowns and hand ownership hold. */
export function applyPropActions(state: EnvironmentPhysicsState | undefined, layout: MansionLayout,
  events: readonly SimEvent[], tuning: Tuning, controlled = false): EnvironmentPhysicsState | undefined {
  if (!state) return state;
  let bodies = [...state.bodies];
  for (const event of events) {
    if (event.kind === "WeaponModTriggered" && event.mod === "wire-cart-hook" && event.propId !== undefined) {
      bodies = bodies.map(b => b.id === event.propId
        ? { ...b, vx: Math.sign(event.at.x - b.x) * P.controlledShoveVelocity, hitGuardIds: [] } : b);
    }
    if (event.kind === "PlayerShoved") {
      const candidate = shovePropTarget(event.at, event.facing, physicsLayoutFor(layout, { bodies }), tuning);
      if (candidate) bodies = bodies.map(b => b.id === candidate.id
        ? { ...b, vx: event.facing * (controlled ? P.controlledShoveVelocity : P.shoveVelocity), hitGuardIds: [] } : b);
    }
  }
  return { ...state, bodies };
}

/** Walking into a cart supplies a gentle contact velocity, never a combat shove. */
export function applyCartWalk(state: EnvironmentPhysicsState | undefined, player: PlayerSimState,
  input: InputFrame | null, layout: MansionLayout, tuning: Tuning): EnvironmentPhysicsState | undefined {
  if (!state) return state;
  const cart = input !== null && input.moveX !== 0 && !input.jump && !input.jumpHeld
    ? walkPushCartTarget(player, physicsLayoutFor(layout, state), tuning, P.cartContactGapPx) : null;
  const driving = cart && input && (cart.x - player.x) * input.moveX > 0 ? cart : null;
  const { walkingCartId, ...rest } = state;
  const bodies = state.bodies.map(body => {
    if (body.id === driving?.id) return { ...body, vx: input!.moveX * P.cartWalkVelocity };
    if (body.id === walkingCartId && Math.abs(body.vx) <= P.cartWalkVelocity) return { ...body, vx: 0 };
    return body;
  });
  return driving ? { ...rest, bodies, walkingCartId: driving.id } : { ...rest, bodies };
}

/** Kinematic actors stay authoritative; props transfer comic impulses without ragdoll/capture damage. */
export function resolvePropActors(state: EnvironmentPhysicsState | undefined, previous: EnvironmentPhysicsState | undefined,
  player: PlayerSimState, guards: readonly GuardState[], layout: MansionLayout, tuning: Tuning) {
  const events: SimEvent[] = [];
  if (!state) return { state, player, guards, events };
  let nextPlayer = player;
  let nextGuards = [...guards];
  const solidLayout = physicsLayoutFor(layout, state);
  const bodies = state.bodies.map(b => {
    const def = layout.physicsProps!.find(p => p.id === b.id)!;
    const rect = propRect(def, b);
    const old = previous?.bodies.find(p => p.id === b.id) ?? b;
    const oldRect = propRect(def, old);
    const swept = { x: Math.min(rect.x, oldRect.x), y: Math.min(rect.y, oldRect.y),
      w: rect.w + Math.abs(b.x - old.x), h: rect.h + Math.abs(b.y - old.y) };
    const speed = Math.hypot(old.vx, old.vy);
    const hitGuardIds = [...b.hitGuardIds];
    nextGuards = nextGuards.map(guard => {
      if (!canBeCombatTarget(guard) || guard.climbLinkId !== null) return guard;
      const body = { x: guard.x - tuning.movement.bodyWidth / 2, y: guard.y - tuning.movement.bodyHeightStand,
        w: tuning.movement.bodyWidth, h: tuning.movement.bodyHeightStand };
      if (!rectOverlaps(swept, body)) return guard;
      const edge = safeActorSide(rect, guard.x, guard.y, tuning, solidLayout);
      const side = edge < b.x ? -1 : 1;
      if (speed >= P.impactSpeed && !hitGuardIds.includes(guard.id)) {
        hitGuardIds.push(guard.id);
        const pushed = displaceHorizontally({ fromX: edge, deltaX: side * P.guardPushPx, feetY: guard.y,
          halfWidth: tuning.movement.bodyWidth / 2, bodyHeight: tuning.movement.bodyHeightStand, stayGrounded: true }, solidLayout);
        events.push({ kind: "GuardShoved", guardId: guard.id, from: { x: guard.x, y: guard.y }, at: { x: pushed.x, y: guard.y } });
        events.push({ kind: "PhysicsPropImpact", propId: b.id, at: { x: guard.x, y: guard.y - 20 }, strength: speed });
        events.push({ kind: "NoiseEmitted", at: { x: guard.x, y: guard.y }, floor: guard.floor, radius: P.noiseRadius, source: "prop", lure: true });
        return immobilize({ ...guard, x: pushed.x, staggerMs: Math.max(guard.staggerMs, P.guardStaggerMs) });
      }
      return rectOverlaps(rect, body) ? haltGuardMovement({ ...guard, x: edge }) : guard;
    });
    if (nextPlayer.ventLinkId === null && nextPlayer.hideSpotId === null) {
      const half = tuning.movement.bodyWidth / 2;
      // Carry a rider along the moving top. Jumping intentionally releases it.
      if (standingOnSurface(nextPlayer, oldRect, tuning)) {
        nextPlayer = { ...nextPlayer, x: nextPlayer.x + b.x - old.x, y: rect.y };
      } else if (rectOverlaps(rect, { x: nextPlayer.x - half, y: nextPlayer.y - tuning.movement.bodyHeightStand,
        w: half * 2, h: tuning.movement.bodyHeightStand })) {
        nextPlayer = { ...nextPlayer, x: safeActorSide(rect, nextPlayer.x, nextPlayer.y, tuning, solidLayout), vx: 0 };
      }
    }
    return { ...b, hitGuardIds };
  });
  return { state: { ...state, bodies }, player: nextPlayer, guards: nextGuards, events };
}

/** A wall-pin resolves toward the available side, never outside the mansion. */
function safeActorSide(prop: Rect, fromX: number, feetY: number, tuning: Tuning, layout: MansionLayout): number {
  const half = tuning.movement.bodyWidth / 2;
  const candidates = [prop.x - half - 0.1, prop.x + prop.w + half + 0.1]
    .sort((a, b) => Math.abs(a - fromX) - Math.abs(b - fromX));
  return candidates.find(x => x >= half && x <= layout.widthPx - half
    && !layout.geometry.some(g => g.kind === "solid" && rectOverlaps(g.rect,
      { x: x - half, y: feetY - tuning.movement.bodyHeightStand, w: half * 2, h: tuning.movement.bodyHeightStand })))
    ?? Math.max(half, Math.min(layout.widthPx - half, fromX));
}
