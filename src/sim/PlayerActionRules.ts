import type { BodyDragState } from "./BodyDragRules";
import type { CaperState } from "./CaperRules";
import { activityOf as caperActivityOf } from "./CaperRules";
import type { MischiefState } from "./MischiefRules";
import { handActionOf } from "./MischiefRules";
import type { PlayerSimState } from "./MovementRules";
import { traversalStateOf } from "./MovementRules";
import type { PickpocketState } from "./PickpocketRules";
import type { PlayerCombatState } from "./PlayerCombatRules";
import { activityOf as combatActivityOf } from "./PlayerCombatRules";
import type { RunState } from "./RunRules";
import { controlStateOf } from "./RunRules";
import type { SubdueState } from "./SubdueRules";

/**
 * 플레이어 몸을 현재 소유한 행동.
 *
 * 저장 상태를 하나 더 만들지 않고 기존 sim 상태에서 매 스텝 파생한다. locomotion FSM과
 * 애니메이션 FSM은 그대로 두고, 서로 배타적인 입력을 누가 점유하는지만 이 규칙이 소유한다.
 */
export type PlayerActivity =
  | "free"
  | "outcome"
  | "restrained"
  | "staggered"
  | "hidden"
  | "venting"
  | "climbing"
  | "parkour"
  | "body-drag"
  | "subduing"
  | "pickpocketing"
  | "stealing"
  | "snuffing"
  | "hazard"
  | "combat"
  | "throwing";

export interface PlayerActionSnapshot {
  readonly player: Pick<PlayerSimState, "staggerMs" | "hideSpotId" | "ventLinkId" | "climbLinkId" | "parkour" | "grapple">;
  readonly run: Pick<RunState, "outcome" | "struggle" | "grabbingAnchorId">;
  readonly caper: Pick<CaperState, "triggeringRootId" | "activeChainId">;
  readonly bodyDrag: Pick<BodyDragState, "targetId">;
  readonly subdue: Pick<SubdueState, "targetId">;
  readonly pickpocket: Pick<PickpocketState, "targetId">;
  readonly mischief: Pick<MischiefState, "snuffingLampId" | "triggeringHazardId" | "throwHeld">;
  readonly playerCombat: Pick<PlayerCombatState, "action" | "actionMs">;
}

export interface PlayerActivityOverride {
  /** 이번 스텝에 막 시작한 몸 끌기처럼 아직 저장 상태에 반영되지 않은 점유. */
  readonly dragging?: boolean;
  /** 이번 경비 스텝에 막 성립한 포박자. */
  readonly capturedBy?: string | null;
}

export function activityOf(
  state: PlayerActionSnapshot,
  override: PlayerActivityOverride = {},
): PlayerActivity {
  const runControl = controlStateOf(state.run);
  if (runControl === "complete") return "outcome";
  if (runControl === "restrained" || override.capturedBy !== null && override.capturedBy !== undefined) {
    return "restrained";
  }
  const traversal = traversalStateOf(state.player);
  if (traversal !== "free") return traversal;
  if (state.player.parkour !== undefined || state.player.grapple !== undefined) return "parkour";
  if ((override.dragging ?? state.bodyDrag.targetId !== null) === true) return "body-drag";
  if (state.subdue.targetId !== null) return "subduing";
  if (state.pickpocket.targetId !== null) return "pickpocketing";
  if (runControl === "stealing") return "stealing";
  if (caperActivityOf(state.caper) === "arming") return "hazard";
  const handAction = handActionOf(state.mischief);
  if (handAction === "snuffing") return "snuffing";
  if (handAction === "hazard") return "hazard";
  if (combatActivityOf(state.playerCombat) !== "idle") return "combat";
  if (handAction === "throwing") return "throwing";
  return "free";
}

/** 모듈별로는 유효하지만 함께 존재하면 입력을 이중 소비하는 교차 상태를 진단한다. */
export function invariantViolations(state: PlayerActionSnapshot): string[] {
  const violations: string[] = [];
  const runControl = controlStateOf(state.run);
  const handAction = handActionOf(state.mischief);
  const caperArming = caperActivityOf(state.caper) === "arming";
  const combatActive = combatActivityOf(state.playerCombat) !== "idle";
  const interactionOwners = [
    state.bodyDrag.targetId !== null,
    state.subdue.targetId !== null,
    state.pickpocket.targetId !== null,
    runControl === "stealing",
  ].filter(Boolean).length;

  if (interactionOwners > 1) violations.push("multiple interaction actions are active");
  if (caperArming && handAction !== "idle") violations.push("caper and mischief hand actions overlap");
  if (combatActive && (handAction !== "idle" || caperArming || interactionOwners > 0)) {
    violations.push("combat overlaps another committed action");
  }
  if (runControl === "restrained" && (
    handAction !== "idle"
    || caperArming
    || combatActive
    || interactionOwners > 0
  )) {
    violations.push("restrained player retains another committed action");
  }
  return violations;
}

export function isRestrained(activity: PlayerActivity): boolean {
  return activity === "restrained";
}

/** 전투 입력과 동시에 진행할 수 없는 점유. 이동 자체의 자세 조건은 PlayerCombatRules가 소유한다. */
export function blocksCombat(activity: PlayerActivity): boolean {
  return activity === "outcome"
    || activity === "parkour"
    || activity === "restrained"
    || activity === "body-drag"
    || activity === "subduing"
    || activity === "pickpocketing"
    || activity === "stealing"
    || activity === "snuffing"
    || activity === "hazard"
    || activity === "throwing";
}

/** 투척·소등 같은 장난 동사를 시작하거나 유지할 수 없는 점유. */
export function blocksMischief(activity: PlayerActivity): boolean {
  return activity === "outcome"
    || activity === "parkour"
    || activity === "restrained"
    || activity === "staggered"
    || activity === "hidden"
    || activity === "venting"
    || activity === "climbing"
    || activity === "body-drag"
    || activity === "subduing"
    || activity === "pickpocketing"
    || activity === "stealing"
    || activity === "combat";
}

/** E 동사를 시작하거나 유지할 수 없는 점유. 은신 해제·환기구 진입은 MovementRules가 먼저 소비한다. */
export function blocksInteraction(activity: PlayerActivity): boolean {
  return activity === "outcome"
    || activity === "parkour"
    || activity === "restrained"
    || activity === "staggered"
    || activity === "venting"
    || activity === "climbing"
    || activity === "body-drag"
    || activity === "combat"
    || activity === "throwing"
    || activity === "snuffing"
    || activity === "hazard";
}

/** 새 E 입력이 실제 행동에 소비됐다고 피드백 계층이 간주할 점유. */
export function handlesInteraction(activity: PlayerActivity): boolean {
  return activity === "outcome"
    || activity === "body-drag"
    || activity === "subduing"
    || activity === "pickpocketing"
    || activity === "stealing";
}
