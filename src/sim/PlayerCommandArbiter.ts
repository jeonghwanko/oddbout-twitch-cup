import type { InputFrame } from "./types";
import { EMPTY_INPUT } from "./types";
import { INPUT_MASKS, maskInput } from "./InputMask";
import type { PlayerActivity } from "./PlayerActionRules";
import { blocksCombat, blocksInteraction, blocksMischief } from "./PlayerActionRules";

export type PlayerCommand =
  | "movement"
  | "interact"
  | "hide"
  | "combat"
  | "throw"
  | "snuff"
  | "whistle"
  | "drop"
  | "thief-eye";

export type CommandRejectionReason = "activity-blocked" | "higher-priority-command";

export interface PlayerCommandDecision {
  readonly command: PlayerCommand;
  readonly accepted: boolean;
  readonly reason: CommandRejectionReason | null;
}

export interface PlayerCommandResolution {
  readonly input: InputFrame;
  readonly owner: PlayerCommand | "struggle" | null;
  readonly decisions: readonly PlayerCommandDecision[];
}

function requestedCommands(input: InputFrame): PlayerCommand[] {
  const requested: PlayerCommand[] = [];
  if (input.moveX !== 0 || input.moveY !== 0 || input.run || input.crouch || input.jump || input.jumpHeld) requested.push("movement");
  if (input.interact || input.interactPressed) requested.push("interact");
  if (input.hide) requested.push("hide");
  if (input.attack || input.heavy) requested.push("combat");
  if (input.throw || input.throwPressed) requested.push("throw");
  if (input.snuffHold || input.snuffPressed) requested.push("snuff");
  if (input.whistle) requested.push("whistle");
  if (input.drop) requested.push("drop");
  if (input.thiefEye || input.thiefEyePressed) requested.push("thief-eye");
  return requested;
}

function withoutInteraction(input: InputFrame): InputFrame {
  return maskInput(input, INPUT_MASKS.interactionTaken);
}

function withoutCombat(input: InputFrame): InputFrame {
  return maskInput(input, INPUT_MASKS.combatTaken);
}

function withoutMischief(input: InputFrame): InputFrame {
  return maskInput(input, INPUT_MASKS.mischiefTaken);
}

/**
 * 한 고정 스텝의 입력을 행동 모듈에 나누기 전에 단 한 번 중재한다.
 * 이동·휘파람·괴도의 눈·버리기는 직교 명령이고, 양손을 쓰는 상호작용 > 전투 > 장난만 경쟁한다.
 */
export function arbitratePlayerCommands(
  input: InputFrame,
  activity: PlayerActivity,
  allowParkourInteract = false,
): PlayerCommandResolution {
  const requested = requestedCommands(input);
  if (activity === "outcome") {
    return {
      input: EMPTY_INPUT,
      owner: null,
      decisions: requested.map((command) => ({ command, accepted: false, reason: "activity-blocked" as const })),
    };
  }

  if (activity === "restrained") {
    const struggleInput = maskInput(input, INPUT_MASKS.struggle);
    return {
      input: struggleInput,
      owner: input.moveX === 0 ? null : "struggle",
      decisions: requested.map((command) => ({
        command,
        accepted: command === "movement" && input.moveX !== 0,
        reason: command === "movement" && input.moveX !== 0 ? null : "activity-blocked",
      })),
    };
  }

  let resolved = input;
  const blocked = new Map<PlayerCommand, CommandRejectionReason>();
  // 도하 중·사다리 위에서도 1순위 대상이 고리면 E 는 줄 쏘기다(배수관 꼭대기에서 곧장 첫 고리로).
  const traversalInteract = allowParkourInteract && (activity === "parkour" || activity === "climbing");
  if (blocksInteraction(activity) && !traversalInteract && requested.includes("interact")) {
    resolved = withoutInteraction(resolved);
    blocked.set("interact", "activity-blocked");
  }
  if (blocksCombat(activity) && requested.includes("combat")) {
    resolved = withoutCombat(resolved);
    blocked.set("combat", "activity-blocked");
  }
  if (blocksMischief(activity) && (requested.includes("throw") || requested.includes("snuff"))) {
    resolved = withoutMischief(resolved);
    if (requested.includes("throw")) blocked.set("throw", "activity-blocked");
    if (requested.includes("snuff")) blocked.set("snuff", "activity-blocked");
  }

  const interactionRequested = resolved.interact || resolved.interactPressed;
  const combatRequested = resolved.attack || resolved.heavy;
  const snuffRequested = resolved.snuffHold || resolved.snuffPressed;
  const throwRequested = resolved.throw || resolved.throwPressed;
  let owner: PlayerCommand | null = null;
  if (interactionRequested) {
    owner = "interact";
    if (combatRequested) blocked.set("combat", "higher-priority-command");
    if (throwRequested) blocked.set("throw", "higher-priority-command");
    if (snuffRequested) blocked.set("snuff", "higher-priority-command");
    resolved = withoutMischief(withoutCombat(resolved));
  } else if (combatRequested) {
    owner = "combat";
    if (throwRequested) blocked.set("throw", "higher-priority-command");
    if (snuffRequested) blocked.set("snuff", "higher-priority-command");
    resolved = withoutMischief(resolved);
  } else if (snuffRequested) {
    owner = "snuff";
    // R 장치/소등이 Q 투척보다 우선한다. 장치가 입력을 소유하지 않으면 기존 MischiefRules가 소등으로 잇는다.
    if (throwRequested) blocked.set("throw", "higher-priority-command");
    resolved = maskInput(resolved, INPUT_MASKS.throwYieldsToSnuff);
  } else if (throwRequested) {
    owner = "throw";
  } else if (resolved.whistle) {
    owner = "whistle";
  }

  return {
    input: resolved,
    owner,
    decisions: requested.map((command) => ({
      command,
      accepted: !blocked.has(command),
      reason: blocked.get(command) ?? null,
    })),
  };
}
