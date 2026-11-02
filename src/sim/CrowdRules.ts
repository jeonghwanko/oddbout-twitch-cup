import type { CrowdSpawn } from "./MansionLayout";
import { floorOfY, floorSurfaceY } from "./MansionLayout";
import type { PlayerSimState } from "./MovementRules";
import { nextInt } from "./rng";
import type { Facing, Rect, RngState, SimEvent } from "./types";
import type { Tuning } from "./tuning";

/** 경비가 아닌 저택 군중. 탐지·의심·포박 상태를 의도적으로 갖지 않는다. */
export type CrowdActivity = "idle" | "walking" | "chatting" | "staggering" | "panicking";

export interface CrowdState {
  readonly id: string;
  readonly kind: CrowdSpawn["kind"];
  readonly floor: number;
  readonly x: number;
  readonly y: number;
  readonly facing: Facing;
  readonly targetX: number;
  /** 렌더가 위치 변화에서 추측하지 않는 현재 사회·이동 행동. */
  readonly activity: CrowdActivity;
  /** 현재 활동에 들어온 뒤 흐른 시간. 상태가 바뀌면 0부터 다시 시작한다. */
  readonly activityMs: number;
  readonly decisionMs: number;
  /** 같은 접촉이 고정 스텝마다 소음을 반복하지 않게 하는 래치. */
  readonly bumpLatched: boolean;
  /** 충돌 직후 멈춰 반응하는 잔여 시간. */
  readonly reactionMs: number;
}

const DRUNK_MOTION_BUCKETS = 20;

export interface CrowdStepResult {
  readonly crowds: readonly CrowdState[];
  readonly rng: RngState;
  readonly events: readonly SimEvent[];
}

export function createCrowd(spawn: CrowdSpawn, tuning: Tuning): CrowdState {
  const [from, to] = spawn.range;
  return {
    id: spawn.id,
    kind: spawn.kind,
    floor: spawn.floor,
    x: from,
    y: floorSurfaceY(spawn.floor, tuning.world.floorHeightPx, tuning.world.slabThicknessPx),
    facing: to >= from ? 1 : -1,
    targetX: to,
    activity: spawn.kind === "guest" ? "walking" : "staggering",
    activityMs: 0,
    decisionMs: 0,
    bumpLatched: false,
    reactionMs: 0,
  };
}

export function step(
  crowds: readonly CrowdState[],
  spawns: readonly CrowdSpawn[],
  player: PlayerSimState,
  tuning: Tuning,
  initialRng: RngState,
  dtMs: number,
  panicAt?: { readonly x: number; readonly floor: number },
): CrowdStepResult {
  const events: SimEvent[] = [];
  let rng = initialRng;
  const next = crowds.map((crowd) => {
    const spawn = spawns.find((entry) => entry.id === crowd.id);
    if (spawn === undefined) return crowd;
    const from = Math.min(...spawn.range);
    const to = Math.max(...spawn.range);
    let x = crowd.x;
    let targetX = crowd.targetX;
    let activity = crowd.activity;
    let decisionMs = Math.max(0, crowd.decisionMs - dtMs);
    let reactionMs = Math.max(0, crowd.reactionMs - dtMs);

    const panicking = panicAt !== undefined;
    if (panicking) {
      const awayFrom = panicAt.x;
      targetX = Math.abs(crowd.x - from) > Math.abs(crowd.x - to) ? from : to;
      if (crowd.floor === panicAt.floor) targetX = crowd.x < awayFrom ? from : to;
      activity = "panicking";
      decisionMs = 0;
    } else if (reactionMs <= 0 && crowd.kind === "guest") {
      const [homeX, socialX] = spawn.range;
      if (activity === "idle" || activity === "chatting") {
        if (decisionMs <= 0) {
          targetX = activity === "chatting" ? homeX : socialX;
          activity = "walking";
        }
      } else if (Math.abs(targetX - crowd.x) <= 1) {
        x = targetX;
        const atSocialSpot = Math.abs(targetX - socialX) <= 1;
        activity = atSocialSpot ? "chatting" : "idle";
        decisionMs = atSocialSpot ? tuning.crowd.guestChatMs : tuning.crowd.guestIdleMs;
      }
    } else if (reactionMs <= 0 && crowd.kind === "drunk"
      && (decisionMs <= 0 || Math.abs(targetX - crowd.x) <= 1)) {
      // 기존 취객의 목적지·재결정 난수 두 번과 소비 시점을 그대로 보존한다. 정상 보행 여부는
      // 첫 추첨 상태에서 파생해 표현 추가가 이후 경비의 넘어짐 난수를 바꾸지 않는다.
      const target = nextInt(rng, Math.round(from), Math.round(to) + 1);
      const decision = nextInt(target.state, tuning.crowd.drunkDecisionMinMs, tuning.crowd.drunkDecisionMaxMs + 1);
      rng = decision.state;
      targetX = target.value;
      decisionMs = decision.value;
      activity = Math.abs(targetX - crowd.x) <= 1
        ? "idle"
        : drunkMotion(target.state, tuning.crowd.drunkSteadyWalkChance);
    }

    const speed = panicking
      ? tuning.crowd.guestWalkSpeed * 2.2
      : crowd.kind === "guest" ? tuning.crowd.guestWalkSpeed : tuning.crowd.drunkWalkSpeed;
    const delta = targetX - x;
    const moving = reactionMs <= 0
      && (activity === "walking" || activity === "staggering" || activity === "panicking")
      && Math.abs(delta) > 1;
    const distance = moving ? Math.min(Math.abs(delta), speed * dtMs / 1000) : 0;
    const facing: Facing = moving ? (delta > 0 ? 1 : -1) : crowd.facing;
    x += facing * distance;

    const touching = canTouchPlayer(player, crowd.floor, x, crowd.y, tuning);
    const separated = Math.abs(player.x - x) >= tuning.crowd.bumpResetPx
      || floorOfY(player.y, tuning.world.floorHeightPx) !== crowd.floor;
    let bumpLatched = separated ? false : crowd.bumpLatched;
    if (touching && !bumpLatched) {
      bumpLatched = true;
      reactionMs = tuning.crowd.reactionMs;
      const at = { x, y: crowd.y };
      events.push({ kind: "CrowdBumped", crowdId: crowd.id, crowdKind: crowd.kind, at });
      events.push({
        kind: "NoiseEmitted",
        at,
        floor: crowd.floor,
        radius: crowd.kind === "guest" ? tuning.crowd.guestNoiseRadius : tuning.crowd.drunkNoiseRadius,
        source: "crowd",
      });
    }

    const activityMs = activity === crowd.activity
      ? reactionMs > 0 ? crowd.activityMs : crowd.activityMs + dtMs
      : 0;
    return { ...crowd, x, facing, targetX, activity, activityMs, decisionMs, reactionMs, bumpLatched };
  });
  return { crowds: next, rng, events };
}

/** 손님과 겹쳐 비집고 지나가는 동안에만 수평 이동을 늦춘다. */
export function playerSpeedMultiplier(
  crowds: readonly CrowdState[],
  player: PlayerSimState,
  tuning: Tuning,
): number {
  if (!player.onGround || player.hideSpotId !== null || player.ventLinkId !== null) return 1;
  return crowds.some((crowd) =>
    crowd.kind === "guest"
    && floorOfY(player.y, tuning.world.floorHeightPx) === crowd.floor
    && Math.abs(player.x - crowd.x) <= tuning.crowd.bumpReachPx
  ) ? tuning.crowd.guestPlayerSpeedMul : 1;
}

/** 시야 판정에 넘길 군중의 몸. 경비의 정적 가구 차폐와 같은 선분 판정을 쓴다. */
export function sightBlockers(crowds: readonly CrowdState[], tuning: Tuning): readonly Rect[] {
  return crowds.map((crowd) => {
    return {
      x: crowd.x - tuning.crowd.bodyWidth / 2,
      y: crowd.y - tuning.crowd.bodyHeight,
      w: tuning.crowd.bodyWidth,
      h: tuning.crowd.bodyHeight,
    };
  });
}

function drunkMotion(rng: RngState, steadyWalkChance: number): "walking" | "staggering" {
  const steadyBuckets = Math.round(Math.max(0, Math.min(1, steadyWalkChance)) * DRUNK_MOTION_BUCKETS);
  return rng.seed % DRUNK_MOTION_BUCKETS < steadyBuckets ? "walking" : "staggering";
}

function canTouchPlayer(
  player: PlayerSimState,
  floor: number,
  x: number,
  y: number,
  tuning: Tuning,
): boolean {
  if (!player.onGround || player.hideSpotId !== null || player.ventLinkId !== null) return false;
  if (floorOfY(player.y, tuning.world.floorHeightPx) !== floor) return false;
  return Math.abs(player.x - x) <= tuning.crowd.bumpReachPx && Math.abs(player.y - y) <= tuning.movement.bodyHeightStand;
}
