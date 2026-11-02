import type { InputFrame, Rect, Vec2 } from "./types";
import { EMPTY_INPUT as NO_INPUT } from "./types";
import type { MansionLayout, ParkourRoute } from "./MansionLayout";
import { solidRects } from "./MansionLayout";
import { rectOverlaps } from "./geom";
import type { MoveContext, MoveResult, PlayerSimState } from "./MovementRules";

/**
 * 갈고리 밧줄 도하의 단계.
 *
 * `throw` 는 E 한 번으로 시작해 배우가 제자리에서 갈고리를 던지는 동안이고,
 * `reel` 은 걸린 줄을 타고 손잡이까지 끌려가는 동안이다. `swing` 은 방향키가
 * 아니라 샹들리에 자신이 도는 진자라 입력 없이도 진행한다.
 *
 * 옛 저장본의 `"approach"` 처럼 여기 없는 값은 stepParkour 가 중력으로 흘린다.
 */
export type ParkourPhase = "throw" | "reel" | "swing" | "release" | "mantle" | "return";

const PARKOUR_PHASES: readonly string[] = ["throw", "reel", "swing", "release", "mantle", "return"];

/** 붙잡힌 채로 진행하는 단계. 기력이 바닥나면 이 단계들만 손을 놓는다. */
function attachedPhase(phase: ParkourPhase): boolean {
  return phase === "throw" || phase === "reel" || phase === "swing" || phase === "return";
}

/** JSON-safe traversal state. Its absence is the legacy snapshot's free movement. */
export interface ParkourState {
  readonly routeId: string;
  readonly phase: ParkourPhase;
  readonly progressMs: number;
  readonly releaseBufferMs: number;
}

type Advance = (player: PlayerSimState, input?: InputFrame) => MoveResult;

/** 샹들리에가 걸린 루트만 줄 던지기·진자를 탄다. `throwable: false` 는 건축만 남은 무대다. */
export function hasChandelier(route: ParkourRoute): boolean {
  return route.throwable !== false;
}

function validRoute(route: ParkourRoute): boolean {
  if (!hasChandelier(route)) return false;
  const points = [route.from, route.to, route.anchor, grabFeet(route)];
  return points.every((point) => point != null && Number.isFinite(point.x) && Number.isFinite(point.y))
    && route.from.x !== route.to.x
    && Math.hypot(grabFeet(route).x - route.anchor.x, grabFeet(route).y - route.anchor.y) > 0;
}

/**
 * 줄을 던질 수 있는 상태인가. 입력은 보지 않는다 — 같은 술어를 화면 안내
 * (`interactionAffordances`)와 실제 진입이 함께 쓰기 위해서다.
 */
export function throwableRoute(
  layout: MansionLayout,
  player: PlayerSimState,
  reachPx: number,
): ParkourRoute | null {
  if (!player.onGround || player.parkour !== undefined || player.staggerMs > 0) return null;
  if (player.climbLinkId !== null || player.ventLinkId !== null || player.hideSpotId !== null) return null;
  return (layout.parkourRoutes ?? []).find((route) =>
    validRoute(route)
    && Math.abs(player.x - route.from.x) <= reachPx
    && Math.abs(player.y - route.from.y) <= 2,
  ) ?? null;
}

/**
 * E 한 번으로 시작하는 도하 진입.
 *
 * `allowedRouteId` 는 상호작용 중재가 이번 프레임의 E 를 이 루트에 준 결과다.
 * `null` 이면 다른 행동이 E 를 가져갔다는 뜻이고, `undefined` 는 중재기가 없는
 * 호출자(단위 테스트·스튜디오 미리보기)라 위치 조건만으로 판정한다.
 */
export function routeForThrow(
  layout: MansionLayout,
  player: PlayerSimState,
  input: InputFrame,
  reachPx: number,
  allowedRouteId?: string | null,
): ParkourRoute | null {
  if (!input.interactPressed || allowedRouteId === null) return null;
  const route = throwableRoute(layout, player, reachPx);
  if (route === null) return null;
  return allowedRouteId === undefined || route.id === allowedRouteId ? route : null;
}

/** Feet position; render can use the same pivot/phase instead of deriving a separate arc. */
export function grabFeet(route: ParkourRoute): Vec2 {
  const dir = Math.sign(route.to.x - route.from.x);
  return route.grab ?? { x: route.from.x + dir * 28, y: route.from.y - 16 };
}

/**
 * 진자 자신의 위상. 0 이 잡은 쪽, 1 이 창문 쪽이고 주기는 `2 * swingTravelMs` 다.
 * 화면이 같은 곡선을 써야 그림의 샹들리에와 판정의 발이 어긋나지 않는다.
 */
export function swingProgress(progressMs: number, swingTravelMs: number): number {
  if (!(swingTravelMs > 0)) return 0;
  return 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, progressMs) / swingTravelMs);
}

/**
 * 진자가 아무도 건드리지 않을 때 쉬는 위상. 매달린 물체의 정지 자리는 수직 아래다.
 * `swingFeet(route, 0.5)` 가 정확히 anchor 바로 아래를 돌려준다.
 */
export const PENDULUM_REST_PROGRESS = 0.5;

/**
 * 줄을 당기는 동안의 0..1 진척. 배우의 이동과 샹들리에가 끌려오는 정도를 **같은
 * 값**으로 묶어, 둘이 손잡이에서 정확히 동시에 만나게 한다. 양끝에서 부드럽다.
 */
export function reelProgress(progressMs: number, reelMs: number): number {
  if (!(reelMs > 0)) return 1;
  const t = Math.max(0, Math.min(1, progressMs / reelMs));
  return 0.5 - 0.5 * Math.cos(Math.PI * t);
}

export function swingFeet(route: ParkourRoute, progress: number): Vec2 {
  const grab = grabFeet(route);
  const dx = grab.x - route.anchor.x;
  const dy = grab.y - route.anchor.y;
  const length = Math.hypot(dx, dy);
  const startAngle = Math.atan2(dx, dy);
  const angle = startAngle * (1 - 2 * Math.max(0, Math.min(1, progress)));
  return { x: route.anchor.x + Math.sin(angle) * length, y: route.anchor.y + Math.cos(angle) * length };
}

export function routeForPlayer(layout: MansionLayout, player: PlayerSimState): ParkourRoute | null {
  return (layout.parkourRoutes ?? []).find((route) => route.id === player.parkour?.routeId && validRoute(route)) ?? null;
}

function bodyAt(feet: Vec2, ctx: MoveContext): Rect {
  const { bodyWidth, bodyHeightStand } = ctx.tuning.movement;
  return { x: feet.x - bodyWidth / 2, y: feet.y - bodyHeightStand, w: bodyWidth, h: bodyHeightStand };
}

/** Conservative union of endpoint bodies: any wall crossed during a step blocks the route. */
export function clearSweptBody(from: Vec2, to: Vec2, ctx: MoveContext): boolean {
  const a = bodyAt(from, ctx);
  const b = bodyAt(to, ctx);
  const sweep: Rect = {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.max(a.x + a.w, b.x + b.w) - Math.min(a.x, b.x),
    h: Math.max(a.y + a.h, b.y + b.h) - Math.min(a.y, b.y),
  };
  return !solidRects(ctx.layout).some((solid) => rectOverlaps(sweep, solid));
}

function supported(at: Vec2, ctx: MoveContext): boolean {
  const half = ctx.tuning.movement.bodyWidth / 2;
  return ctx.layout.geometry.some((geometry) =>
    (geometry.kind === "solid" || geometry.kind === "platform")
    && Math.abs(geometry.rect.y - at.y) < 1
    && at.x + half > geometry.rect.x && at.x - half < geometry.rect.x + geometry.rect.w,
  );
}

function releaseToGravity(player: PlayerSimState, ctx: MoveContext, advancePhysics: Advance, input?: InputFrame): MoveResult {
  return advancePhysics({
    ...player,
    parkour: undefined,
    pose: "stand",
    motion: "still",
    onGround: false,
    vx: input?.moveX ? input.moveX * ctx.tuning.movement.walkSpeed : player.vx,
    vy: Math.max(0, player.vy),
    fallStartY: player.y,
    jumpBufferMs: 0,
    coyoteMs: 0,
  }, input);
}

function blockedFlight(player: PlayerSimState, advancePhysics: Advance): MoveResult {
  return advancePhysics({
    ...player, parkour: undefined, pose: "stand", vx: 0, vy: Math.max(0, player.vy),
    fallStartY: player.y, jumpBufferMs: 0, coyoteMs: 0,
  });
}

function advanceFlight(player: PlayerSimState, ctx: MoveContext, dtMs: number, advancePhysics: Advance): MoveResult {
  const dt = dtMs / 1000;
  const nextVy = Math.min(ctx.tuning.movement.maxFallSpeed, player.vy + ctx.tuning.movement.gravity * dt);
  const predicted = { x: player.x + player.vx * dt, y: player.y + nextVy * dt };
  if (!clearSweptBody(player, predicted, ctx)) return blockedFlight(player, advancePhysics);
  return advancePhysics(player);
}

function moveToward(player: PlayerSimState, target: Vec2, speed: number, dtMs: number, ctx: MoveContext): PlayerSimState | null {
  const dx = target.x - player.x;
  const dy = target.y - player.y;
  const distance = Math.hypot(dx, dy);
  const fraction = distance === 0 ? 1 : Math.min(1, speed * dtMs / 1000 / distance);
  const at = { x: player.x + dx * fraction, y: player.y + dy * fraction };
  if (!clearSweptBody(player, at, ctx)) return null;
  return { ...player, ...at, vx: 0, vy: 0, onGround: false, pose: "hang", motion: "still" };
}

/**
 * 기본 비행 뒤 다른 후보 비행: (비행 시간 배율, 목표 높이 오프셋 px). 기본값이 창에 닿으면
 * 이 표는 쓰이지 않는다.
 */
const RELEASE_FLIGHT_CANDIDATES: readonly (readonly [number, number])[] = [
  [0.85, 0], [0.75, 0], [0.85, -8], [0.7, -8], [1.15, 0], [0.65, -14], [0.6, 0], [1.3, -8],
];

/**
 * 놓는 순간의 비행을 정한다.
 *
 * 기본은 `releaseFlightMs` 동안 창 목표로 가는 포물선이다. 그런데 진자 끝(위상 ≳0.94)은
 * 창틀 벽에 바짝 붙고 창턱보다 낮아서, 같은 600ms 포물선이 창턱을 친다 — 허용 창
 * (`releaseWindowEnd` 1) 안에서 누른 Space 가 추락이 되던 결함(2026-09-24 실측, 블랙손 x 1272).
 * 그래서 기본 포물선이 실제로 창에 닿는지 **같은 release 단계 규칙으로** 끝까지 돌려 보고,
 * 막히면 몇 개의 후보 비행 시간·목표 높이를 같은 방식으로 시험해 처음 닿는 것을 쓴다.
 * 기본이 닿는 위상(지금까지 통과하던 모든 도약)은 비행이 한 비트도 바뀌지 않는다.
 * 어떤 후보도 닿지 않으면(창이 막힌 레이아웃) 기본을 그대로 쓴다 — 막힌 창은 계속 막힌다.
 */
function plannedRelease(
  swinging: PlayerSimState,
  at: Vec2,
  route: ParkourRoute,
  state: ParkourState,
  ctx: MoveContext,
  dtMs: number,
  advanceFree: Advance,
  advancePhysics: Advance,
): PlayerSimState {
  const config = ctx.tuning.parkour;
  const gravity = ctx.tuning.movement.gravity;
  const launch = (flightMs: number, targetOffsetY: number): PlayerSimState => {
    const flight = flightMs / 1000;
    const targetY = route.to.y - config.windowReachPx / 2 + targetOffsetY;
    return {
      ...swinging,
      vx: (route.to.x - at.x) / flight,
      vy: (targetY - at.y - 0.5 * gravity * flight * flight) / flight,
      pose: "stand", jumpCutUsed: true, fallStartY: at.y,
      parkour: { ...state, phase: "release", progressMs: 0, releaseBufferMs: 0 },
    };
  };
  const reaches = (released: PlayerSimState): boolean => {
    let player = advanceFlight(released, ctx, dtMs, advancePhysics).player;
    const limit = Math.ceil(config.releaseTimeoutMs / Math.max(1, dtMs)) + 1;
    for (let i = 0; i < limit; i += 1) {
      if (player.parkour?.phase === "mantle") return true;
      if (player.parkour?.phase !== "release") return false;
      player = stepParkour(player, NO_INPUT, ctx, dtMs, advanceFree, advancePhysics).player;
    }
    return false;
  };
  const fallback = launch(config.releaseFlightMs, 0);
  if (reaches(fallback)) return fallback;
  for (const [scale, offset] of RELEASE_FLIGHT_CANDIDATES) {
    const candidate = launch(config.releaseFlightMs * scale, offset);
    if (reaches(candidate)) return candidate;
  }
  return fallback;
}

export function stepParkour(
  player: PlayerSimState,
  input: InputFrame,
  ctx: MoveContext,
  dtMs: number,
  advanceFree: Advance,
  advancePhysics: Advance,
): MoveResult {
  const state = player.parkour;
  if (state === undefined) return advanceFree(player, input);
  const route = routeForPlayer(ctx.layout, player);
  if (route === null || player.staggerMs > 0 || player.climbLinkId !== null
    || player.ventLinkId !== null || player.hideSpotId !== null
    || !PARKOUR_PHASES.includes(state.phase)
    || ctx.exhausted && attachedPhase(state.phase)) {
    return releaseToGravity(player, ctx, advancePhysics, input);
  }
  const dir = Math.sign(route.to.x - route.from.x);
  if (dir === 0) return releaseToGravity(player, ctx, advancePhysics, input);
  const config = ctx.tuning.parkour;
  const facing: -1 | 1 = dir > 0 ? 1 : -1;

  // 던지는 동안 배우는 발코니에 그대로 선다. 갈고리와 밧줄은 화면이 그리고,
  // 판정은 걸릴 자리(손잡이)까지의 통로가 실제로 비어 있는지만 본다.
  if (state.phase === "throw") {
    const progressMs = state.progressMs + dtMs;
    // E 를 누른 자리는 `from` 에서 최대 departureReachPx 만큼 비켜 있다. 던지는 동안
    // 남은 시간에 비례해 발을 `from` 으로 모아, reel 이 시작하는 순간 끊김이 없게 한다.
    const remainingMs = Math.max(dtMs, config.throwMs - state.progressMs);
    const settle = Math.min(1, dtMs / remainingMs);
    const planted: PlayerSimState = {
      ...player, x: player.x + (route.from.x - player.x) * settle,
      vx: 0, vy: 0, motion: "still", pose: "stand", facing,
      coyoteMs: 0, jumpBufferMs: 0,
    };
    if (progressMs < config.throwMs) {
      return { player: { ...planted, parkour: { ...state, progressMs, releaseBufferMs: 0 } }, events: [] };
    }
    const grab = grabFeet(route);
    if (!clearSweptBody(player, grab, ctx)) return releaseToGravity(player, ctx, advancePhysics, input);
    return {
      player: { ...planted, pose: "hang", onGround: false,
        parkour: { ...state, phase: "reel", progressMs: 0, releaseBufferMs: 0 } },
      events: [],
    };
  }

  if (input.moveY > 0 && input.jump) return releaseToGravity(player, ctx, advancePhysics, input);

  // 줄을 당기는 구간. 배우는 발코니에서 손잡이로, 샹들리에는 수직에서 잡는 쪽으로
  // 같은 곡선을 따라 끌려온다 — 화면은 이 위상을 다시 읽어 그린다.
  if (state.phase === "reel") {
    const grab = grabFeet(route);
    const progressMs = state.progressMs + dtMs;
    const t = reelProgress(progressMs, config.reelMs);
    const at: Vec2 = {
      x: route.from.x + (grab.x - route.from.x) * t,
      y: route.from.y + (grab.y - route.from.y) * t,
    };
    if (!clearSweptBody(player, at, ctx)) return releaseToGravity(player, ctx, advancePhysics, input);
    const arrived = progressMs >= config.reelMs;
    return {
      player: {
        ...player, ...(arrived ? grab : at), vx: 0, vy: 0, onGround: false,
        pose: "hang", motion: "still", facing, coyoteMs: 0, jumpBufferMs: 0,
        parkour: arrived
          ? { ...state, phase: "swing", progressMs: 0, releaseBufferMs: 0 }
          : { ...state, progressMs, releaseBufferMs: 0 },
      },
      events: [],
    };
  }

  if (state.phase === "swing") {
    // 샹들리에가 스스로 돈다. 방향키는 읽지 않고 시간만 위상을 움직인다.
    const progressMs = state.progressMs + dtMs;
    const progress = swingProgress(progressMs, config.swingTravelMs);
    const at = swingFeet(route, progress);
    if (!clearSweptBody(player, at, ctx)) return releaseToGravity(player, ctx, advancePhysics, input);
    const buffer = input.jump
      ? config.releaseBufferMs
      : Math.max(0, state.releaseBufferMs - dtMs);
    const swinging: PlayerSimState = {
      ...player, ...at, vx: 0, vy: 0, onGround: false,
      pose: "hang", motion: "still", facing,
      parkour: { ...state, progressMs, releaseBufferMs: buffer },
    };
    // 아직 앞으로 나아가지도 않은 위상에서 누른 Space 는 "그만두겠다" 이다.
    if (input.jump && progress < config.returnWindowEnd) {
      return { player: { ...swinging, parkour: { ...state, phase: "return", progressMs: 0, releaseBufferMs: 0 } }, events: [] };
    }
    if (buffer > 0 && progress >= config.releaseWindowStart
      && progress <= config.releaseWindowEnd) {
      const released = plannedRelease(swinging, at, route, state, ctx, dtMs, advanceFree, advancePhysics);
      const moved = advanceFlight(released, ctx, dtMs, advancePhysics);
      return { player: moved.player, events: [{ kind: "PlayerJumped", at }, ...moved.events] };
    }
    return { player: swinging, events: [] };
  }

  if (state.phase === "release") {
    const moved = advanceFlight(player, ctx, dtMs, advancePhysics);
    const at = moved.player;
    // Collision handling already detached the player. Do not resurrect the old
    // flight (or auto-catch a nearby window) after physics cancelled it.
    if (at.parkour === undefined) return moved;
    const progressMs = state.progressMs + dtMs;
    if (!at.onGround && Math.abs(at.x - route.to.x) <= config.windowReachPx
      && Math.abs(at.y - route.to.y) <= config.windowReachPx
      && supported(route.to, ctx) && clearSweptBody(at, route.to, ctx)) {
      return {
        player: { ...at, vx: 0, vy: 0, pose: "hang", parkour: { ...state, phase: "mantle", progressMs: 0 } },
        events: moved.events,
      };
    }
    return {
      player: { ...at, parkour: at.onGround || progressMs >= config.releaseTimeoutMs
        ? undefined : { ...state, progressMs } },
      events: moved.events,
    };
  }

  const returning = state.phase === "return";
  const target = returning ? route.returnTo ?? route.from : route.to;
  const moved = moveToward(player, target,
    returning ? config.returnSpeedPxPerSec : config.mantleSpeedPxPerSec, dtMs, ctx);
  if (moved === null) return releaseToGravity(player, ctx, advancePhysics, input);
  const atTarget = Math.hypot(moved.x - target.x, moved.y - target.y) < 0.001;
  if (atTarget) {
    return advancePhysics({ ...moved, parkour: undefined, pose: "stand", vy: 0,
      fallStartY: moved.y, onGround: false });
  }
  return { player: { ...moved, parkour: { ...state, progressMs: state.progressMs + dtMs } }, events: [] };
}
