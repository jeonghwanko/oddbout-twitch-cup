import type { InputFrame } from "./types";
import { EMPTY_INPUT } from "./types";

/**
 * 입력 마스킹의 단일 소유자.
 *
 * 행동 모듈마다 "이 상황에서는 이 입력을 보지 않는다" 를 정하는 규칙이 전부 여기 있다.
 * 규칙은 **허용 목록**이다 — 마스크가 통과시킨다고 적은 필드만 살아남고, 나머지는 전부
 * 중립값(`EMPTY_INPUT`)으로 꺼진다. 옛 방식(`{ ...input, throw: false }`)은 끌 것을 하나씩
 * 적는 블랙리스트여서, `InputFrame` 에 필드가 늘면 15곳 중 빠뜨린 자리로 새 동사가 조용히 샜다.
 *
 * 새 입력 필드를 만들면:
 * 1. `INPUT_FIELD_GROUP` 에 그룹을 적어야 컴파일된다(빠뜨리면 `Record` 가 막는다).
 * 2. 기존 그룹에 넣었다면 그 그룹을 허용하는 마스크에서 함께 통과한다 — 그룹이 곧 의미 선언이다.
 * 3. 새 그룹이면 어느 마스크에도 없으므로 **막힌 채로 시작한다.** 통과시킬 마스크에만 적는다.
 *
 * 입력을 끄는 것이 아니라 **켜는**(동사를 주입하는) 자리 — 회수 취소 창의 예약 동사 발동 —
 * 는 마스킹이 아니므로 여기서 다루지 않는다.
 */

export type InputField = keyof InputFrame;

export type InputGroup =
  | "move"
  | "interact"
  | "hide"
  | "whistle"
  | "throw"
  | "toolSlot"
  | "snuff"
  | "drop"
  | "thiefEye"
  | "combat";

/** 모든 입력 필드의 소속 그룹. 새 필드는 여기에 적지 않으면 컴파일되지 않는다. */
const INPUT_FIELD_GROUP: Readonly<Record<InputField, InputGroup>> = Object.freeze({
  moveX: "move",
  moveY: "move",
  run: "move",
  crouch: "move",
  crouchPressed: "move",
  jump: "move",
  jumpHeld: "move",
  interact: "interact",
  interactPressed: "interact",
  hide: "hide",
  whistle: "whistle",
  throw: "throw",
  throwPressed: "throw",
  toolSlot1: "toolSlot",
  toolSlot2: "toolSlot",
  snuffHold: "snuff",
  snuffPressed: "snuff",
  drop: "drop",
  thiefEye: "thiefEye",
  thiefEyePressed: "thiefEye",
  attack: "combat",
  heavy: "combat",
});

export const INPUT_FIELDS: readonly InputField[] = Object.freeze(Object.keys(INPUT_FIELD_GROUP) as InputField[]);

export function inputGroupOf(field: InputField): InputGroup {
  return INPUT_FIELD_GROUP[field];
}

export interface InputMask {
  /** 진단·테스트용 이름. */
  readonly name: string;
  /** 통과시키는 필드. 여기 없는 필드는 전부 중립값이 된다. */
  readonly allowed: readonly InputField[];
}

/**
 * 허용 목록으로 마스크를 만든다. 그룹 단위로 적고, 그룹의 일부만 통과시킬 때만 필드를 따로 적는다.
 */
function inputMask(
  name: string,
  groups: readonly InputGroup[],
  fields: readonly InputField[] = [],
): InputMask {
  const allowed = INPUT_FIELDS.filter((field) => groups.includes(INPUT_FIELD_GROUP[field]) || fields.includes(field));
  return Object.freeze({ name, allowed: Object.freeze(allowed) });
}

const NEUTRAL: Readonly<Record<string, unknown>> = EMPTY_INPUT as unknown as Readonly<Record<string, unknown>>;

/**
 * 허용한 필드만 남긴 입력을 돌려준다. 막힌 필드는 `EMPTY_INPUT` 의 중립값이 된다.
 */
export function maskInput(input: InputFrame, mask: InputMask): InputFrame {
  const out: Record<string, unknown> = { ...NEUTRAL };
  const source = input as unknown as Readonly<Record<string, unknown>>;
  for (const field of mask.allowed) {
    if (Object.prototype.hasOwnProperty.call(source, field)) out[field] = source[field];
  }
  return out as unknown as InputFrame;
}

/**
 * 마스크 목록. 이름은 "무엇이 막히는 상황인가" 이고, 인자는 "그래도 통과하는 것" 이다.
 *
 * 그룹 이름 뒤 주석은 막히는 것을 적는다 — 읽는 사람의 편의일 뿐 규칙은 허용 목록이다.
 */
export const INPUT_MASKS = Object.freeze({
  // --- 명령 중재(`PlayerCommandArbiter`) ---

  /** 포박 중: ←/→ 발버둥만 남는다. */
  struggle: inputMask("struggle", [], ["moveX"]),
  /** 점유가 상호작용을 막거나, 다른 행동이 E 를 이미 가져갔다. 막힘: E. */
  interactionTaken: inputMask("interactionTaken",
    ["move", "hide", "whistle", "throw", "toolSlot", "snuff", "drop", "thiefEye", "combat"]),
  /** 점유가 전투를 막거나, 더 높은 명령이 두 손을 가져갔다. 막힘: 공격. */
  combatTaken: inputMask("combatTaken",
    ["move", "interact", "hide", "whistle", "throw", "toolSlot", "snuff", "drop", "thiefEye"]),
  /** 점유가 장난을 막거나, 더 높은 명령이 두 손을 가져갔다. 막힘: 투척·소등. */
  mischiefTaken: inputMask("mischiefTaken",
    ["move", "interact", "hide", "whistle", "toolSlot", "drop", "thiefEye", "combat"]),
  /** R(장치·소등)이 Q 투척보다 우선한다. 막힘: 투척. */
  throwYieldsToSnuff: inputMask("throwYieldsToSnuff",
    ["move", "interact", "hide", "whistle", "toolSlot", "snuff", "drop", "thiefEye", "combat"]),

  // --- 스텝 프롤로그 ---

  /** 1순위 대상이 소등·장치·환경이라 E 를 R 로 돌린다. 막힘: E·원래 R(돌린 값으로 다시 채운다). */
  interactionRoutedToSnuff: inputMask("interactionRoutedToSnuff",
    ["move", "hide", "whistle", "throw", "toolSlot", "drop", "thiefEye", "combat"]),

  // --- 이동 규칙에 넘기는 입력 ---

  /** 몸 끌기 중: 좌우로 끌기만 한다. 막힘: 위아래·달리기·웅크리기·점프·숨기. */
  bodyDragMovement: inputMask("bodyDragMovement",
    ["interact", "whistle", "throw", "toolSlot", "snuff", "drop", "thiefEye", "combat"], ["moveX"]),
  /** 공격 점유 중: 발이 묶인다. 막힘: 좌우·위아래·달리기·점프. 웅크리기는 회피 예약 문법이라 통과. */
  combatCommittedMovement: inputMask("combatCommittedMovement",
    ["interact", "hide", "whistle", "throw", "toolSlot", "snuff", "drop", "thiefEye", "combat"],
    ["crouch", "crouchPressed"]),
  /** 완벽 반격 창의 이동 잠금. 막힘: 좌우·달리기. */
  counterMovementLocked: inputMask("counterMovementLocked",
    ["interact", "hide", "whistle", "throw", "toolSlot", "snuff", "drop", "thiefEye", "combat"],
    ["moveY", "crouch", "crouchPressed", "jump", "jumpHeld"]),

  // --- 장난·연쇄극에 넘기는 입력 ---

  /** 포박 중의 장난 입력. 막힘: 휘파람·투척·소등·괴도의 눈. */
  struggleMischief: inputMask("struggleMischief",
    ["move", "interact", "hide", "toolSlot", "drop", "combat"]),
  /** 연쇄극이 막혔거나 두 손이 이미 장난 중이다. 막힘: 소등(R). */
  caperBlocked: inputMask("caperBlocked",
    ["move", "interact", "hide", "whistle", "throw", "toolSlot", "drop", "thiefEye", "combat"]),
});
