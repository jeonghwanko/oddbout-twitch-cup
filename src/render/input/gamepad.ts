import type { InputFrame } from "../../sim/types";
import { EMPTY_INPUT } from "../../sim/types";
import {
  DEFAULT_PAD_BUTTONS,
  PAD_BUTTONS,
  padActionActive,
  padButtonLabel,
} from "../../app/InputBindings";
import type {
  HeistAction,
  PadButton,
  PadButtonMap,
  PadRebindableAction,
} from "../../app/InputBindings";

/** 브라우저 표준 게임패드 매핑. Xbox 표기를 기준으로 하고 위치 의미를 함께 쓴다. */
export const GAMEPAD_HELP = Object.freeze({
  title: "A 시작   Menu 설정",
  village: "스틱/D-pad 이동   X 입장   Menu 메뉴",
  heistQuiet: "Menu 길게 퀘스트   Menu 짧게 메뉴",
  heistCombat: "발각 대응  ·  R3 평타   L3 강공격   RB 도구 사용   LT+LB/RB 도구 선택   Menu 길게 퀘스트   짧게 메뉴",
  settlement: "A 마을로   X 재현 파일   Y 플레이 로그   RB 전설",
  settings: "D-pad 선택/변경   A 확인   B 돌아가기",
});

export const GAMEPAD_CONTROLS = [
  "left",
  "right",
  "up",
  "down",
  "south",
  "east",
  "west",
  "north",
  "leftShoulder",
  "rightShoulder",
  "leftTrigger",
  "rightTrigger",
  "select",
  "start",
  "leftStick",
  "rightStick",
] as const;

export type GamepadControl = (typeof GAMEPAD_CONTROLS)[number];
export type GamepadControlState = Readonly<Record<GamepadControl, boolean>>;

export interface BrowserGamepadLike {
  readonly connected?: boolean;
  readonly axes: readonly number[];
  readonly buttons: readonly { readonly pressed: boolean; readonly value: number }[];
}

export interface GamepadSample {
  readonly held: GamepadControlState;
  readonly pressed: GamepadControlState;
  readonly connected: boolean;
  /**
   * 왼쪽 스틱 원시 값(-1..1)과 D-pad 만의 방향. 아날로그 크기를 쓰는 마을 이동(`VillageMovementInput`)만
   * 읽는다 — 잠입은 위 `held` 의 디지털 방향(축별 0.5 데드존)을 그대로 쓴다. 없으면 `held` 로 대신한다.
   */
  readonly leftStick?: { readonly x: number; readonly y: number };
  readonly dpad?: { readonly x: -1 | 0 | 1; readonly y: -1 | 0 | 1 };
}

export function anyGamepadPressed(sample: GamepadSample): boolean {
  return GAMEPAD_CONTROLS.some((control) => sample.pressed[control]);
}

export function anyGamepadHeld(sample: GamepadSample): boolean {
  return GAMEPAD_CONTROLS.some((control) => sample.held[control]);
}

type PadDirection = "left" | "right" | "up" | "down";

const DIRECTION_KEYCAPS: Readonly<Record<PadDirection, string>> = Object.freeze({
  left: "D←",
  right: "D→",
  up: "D↑",
  down: "D↓",
});

/**
 * 지금 실제로 적용 중인 패드 배치.
 *
 * 설정 저장은 `applyPlayerSettings` 한 곳에서 런타임으로 퍼진다(`sfx.setMix` 와 같은 경로).
 * 패드 배치도 거기서 한 번 심어 두면 판정(`heistInputFromGamepad`)과 화면(`gamepadKeycapLabel`)이
 * 같은 표를 읽는다 — 한쪽만 인자로 받게 하면 재지정 후 HUD 글리프만 옛 버튼에 남는다.
 * 순수 계산이 필요한 곳은 두 함수 모두 배치를 인자로 넘길 수 있다.
 */
let activePadButtonMap: PadButtonMap = DEFAULT_PAD_BUTTONS;

export function setActivePadButtons(padButtons: PadButtonMap): void {
  activePadButtonMap = padButtons;
}

export function activePadButtons(): PadButtonMap {
  return activePadButtonMap;
}

export function gamepadKeycapLabel(
  action: HeistAction,
  padButtons: PadButtonMap = activePadButtonMap,
): string {
  // 소등은 상호작용과 같은 버튼을 안내한다(문맥 코치 계약). 재지정하면 함께 따라간다.
  const resolved = action === "snuff" ? "interact" : action;
  if (isPadDirection(resolved)) return DIRECTION_KEYCAPS[resolved];
  if (resolved === "toolSlot1") {
    return `${padButtonLabel(padButtons.thiefEye)}+${padButtonLabel(padButtons.whistle)}`;
  }
  if (resolved === "toolSlot2") {
    return `${padButtonLabel(padButtons.thiefEye)}+${padButtonLabel(padButtons.throw)}`;
  }
  return padButtonLabel(padButtons[resolved]);
}

export function padActionHeld(
  sample: GamepadSample,
  action: PadRebindableAction,
  padButtons: PadButtonMap = activePadButtonMap,
): boolean {
  return padActionActive(sample.held, action, padButtons);
}

export function padActionPressed(
  sample: GamepadSample,
  action: PadRebindableAction,
  padButtons: PadButtonMap = activePadButtonMap,
): boolean {
  return padActionActive(sample.pressed, action, padButtons);
}

/** 설정 화면의 "버튼을 누르세요" 캡처가 읽는 유일한 후보 목록. */
export function pressedPadButton(sample: GamepadSample): PadButton | null {
  return PAD_BUTTONS.find((button) => sample.pressed[button]) ?? null;
}

function isPadDirection(action: HeistAction): action is PadDirection {
  return action === "left" || action === "right" || action === "up" || action === "down";
}

export type GamepadProvider = () => BrowserGamepadLike | null;

const BUTTON_INDEX: Readonly<Record<Exclude<GamepadControl, "left" | "right" | "up" | "down">, number>> = Object.freeze({
  south: 0,
  east: 1,
  west: 2,
  north: 3,
  leftShoulder: 4,
  rightShoulder: 5,
  leftTrigger: 6,
  rightTrigger: 7,
  select: 8,
  start: 9,
  leftStick: 10,
  rightStick: 11,
});

export const EMPTY_GAMEPAD_STATE: GamepadControlState = Object.freeze(
  Object.fromEntries(GAMEPAD_CONTROLS.map((control) => [control, false])) as Record<GamepadControl, boolean>,
);

/** 아날로그 노이즈는 버리고 D-pad와 왼쪽 스틱을 하나의 디지털 이동 의도로 합친다. */
export function gamepadControlState(
  gamepad: BrowserGamepadLike | null,
  deadzone = 0.5,
): GamepadControlState {
  if (gamepad === null || gamepad.connected === false) return EMPTY_GAMEPAD_STATE;
  const threshold = Number.isFinite(deadzone) ? Math.max(0.1, Math.min(0.95, deadzone)) : 0.5;
  const axisX = finiteAxis(gamepad.axes[0]);
  const axisY = finiteAxis(gamepad.axes[1]);
  const state = { ...EMPTY_GAMEPAD_STATE } as Record<GamepadControl, boolean>;
  state.left = buttonHeld(gamepad, 14) || axisX <= -threshold;
  state.right = buttonHeld(gamepad, 15) || axisX >= threshold;
  state.up = buttonHeld(gamepad, 12) || axisY <= -threshold;
  state.down = buttonHeld(gamepad, 13) || axisY >= threshold;
  for (const [control, index] of Object.entries(BUTTON_INDEX) as [keyof typeof BUTTON_INDEX, number][]) {
    state[control] = buttonHeld(gamepad, index);
  }
  return Object.freeze(state);
}

export function gamepadPressed(
  held: GamepadControlState,
  previous: GamepadControlState,
): GamepadControlState {
  return Object.freeze(
    Object.fromEntries(GAMEPAD_CONTROLS.map((control) => [control, held[control] && !previous[control]])) as Record<GamepadControl, boolean>,
  );
}

export function heistInputFromGamepad(
  sample: GamepadSample,
  padButtons: PadButtonMap = activePadButtonMap,
): InputFrame {
  const { held, pressed } = sample;
  const moveX = direction(held.left, held.right);
  const moveY = direction(held.up, held.down);
  // 도구 선택은 자기 버튼이 아니라 "괴도의 눈 + 휘파람/투척" 조합이다. 재지정한 배치에서도
  // 조합이 함께 따라가야 LT 를 옮긴 플레이어가 도구만 옛 버튼으로 고르지 않는다.
  const thiefEyeHeld = held[padButtons.thiefEye];
  const toolSlot1 = thiefEyeHeld && pressed[padButtons.whistle];
  const toolSlot2 = thiefEyeHeld && pressed[padButtons.throw];
  return {
    ...EMPTY_INPUT,
    moveX,
    moveY,
    run: held[padButtons.run],
    crouch: held.down,
    crouchPressed: pressed.down,
    jump: pressed[padButtons.jump],
    jumpHeld: held[padButtons.jump],
    interact: held[padButtons.interact],
    interactPressed: pressed[padButtons.interact],
    hide: pressed[padButtons.hide],
    whistle: pressed[padButtons.whistle] && !thiefEyeHeld,
    throw: held[padButtons.throw] && !thiefEyeHeld,
    throwPressed: pressed[padButtons.throw] && !thiefEyeHeld,
    toolSlot1,
    toolSlot2,
    snuffHold: held[padButtons.snuff],
    snuffPressed: pressed[padButtons.snuff],
    drop: pressed[padButtons.drop],
    thiefEye: thiefEyeHeld,
    thiefEyePressed: pressed[padButtons.thiefEye],
    attack: pressed[padButtons.attack],
    heavy: pressed[padButtons.heavy],
  };
}

export class GamepadReader {
  private previous: GamepadControlState;

  constructor(private readonly provider: GamepadProvider = browserGamepad) {
    this.previous = gamepadControlState(provider());
  }

  sample(): GamepadSample {
    const gamepad = this.provider();
    const held = gamepadControlState(gamepad);
    const pressed = gamepadPressed(held, this.previous);
    this.previous = held;
    const live = gamepad !== null && gamepad.connected !== false;
    return Object.freeze({
      held, pressed, connected: live,
      leftStick: Object.freeze(live ? { x: finiteAxis(gamepad.axes[0]), y: finiteAxis(gamepad.axes[1]) } : { x: 0, y: 0 }),
      dpad: Object.freeze(live
        ? { x: direction(buttonHeld(gamepad, 14), buttonHeld(gamepad, 15)), y: direction(buttonHeld(gamepad, 12), buttonHeld(gamepad, 13)) }
        : { x: 0 as const, y: 0 as const }),
    });
  }

  /** 일시정지된 씬으로 돌아올 때 메뉴를 닫은 버튼이 게임 행동으로 새지 않게 한다. */
  sync(): void {
    this.previous = gamepadControlState(this.provider());
  }
}

function browserGamepad(): BrowserGamepadLike | null {
  if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") return null;
  try {
    return Array.from(navigator.getGamepads()).find((gamepad) => gamepad?.connected === true) ?? null;
  } catch {
    return null;
  }
}

function buttonHeld(gamepad: BrowserGamepadLike, index: number): boolean {
  const button = gamepad.buttons[index];
  return button !== undefined && (button.pressed || button.value >= 0.5);
}

function finiteAxis(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) ? value : 0;
}

function direction(negative: boolean, positive: boolean): -1 | 0 | 1 {
  return ((positive ? 1 : 0) - (negative ? 1 : 0)) as -1 | 0 | 1;
}
