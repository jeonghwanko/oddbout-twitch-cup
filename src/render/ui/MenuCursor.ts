import type { KeyBinding } from "../../app/InputBindings";
import { INPUT_BINDINGS, matchesBinding } from "../../app/InputBindings";
import type { GamepadControl, GamepadSample } from "../input/gamepad";

/**
 * 메뉴 한 화면이 소비하는 입력의 전부.
 *
 * 패드와 키보드가 같은 메뉴를 각자 읽으면 한쪽에만 있는 규칙(위/아래로 탭을 넘긴다,
 * 좌/우는 값을 바꾼다)이 생기고, 그 차이는 둘 중 하나를 고칠 때만 드러난다.
 */
export interface MenuNav {
  readonly up: boolean;
  readonly down: boolean;
  readonly left: boolean;
  readonly right: boolean;
  readonly confirm: boolean;
  readonly back: boolean;
}

export interface MenuKeyBindings {
  readonly up: KeyBinding;
  readonly down: KeyBinding;
  readonly left: KeyBinding;
  readonly right: KeyBinding;
  readonly confirm: KeyBinding;
  readonly back: KeyBinding;
}

/** 메뉴 화면이 공유하는 기본 키. 방향은 브리핑 표, 확인·취소는 공용 표가 소유한다. */
export const MENU_KEY_BINDINGS: MenuKeyBindings = Object.freeze({
  up: INPUT_BINDINGS.briefing.up,
  down: INPUT_BINDINGS.briefing.down,
  left: INPUT_BINDINGS.briefing.left,
  right: INPUT_BINDINGS.briefing.right,
  confirm: INPUT_BINDINGS.shared.confirm,
  back: INPUT_BINDINGS.shared.back,
});

export const NO_MENU_NAV: MenuNav = Object.freeze({
  up: false,
  down: false,
  left: false,
  right: false,
  confirm: false,
  back: false,
});

export function menuNavFromGamepad(sample: GamepadSample): MenuNav {
  const pressed = sample.pressed;
  return Object.freeze({
    up: pressed.up,
    down: pressed.down,
    left: pressed.left,
    right: pressed.right,
    confirm: pressed.south,
    back: pressed.east,
  });
}

export function menuNavFromKey(key: string, bindings: MenuKeyBindings = MENU_KEY_BINDINGS): MenuNav {
  return Object.freeze({
    up: matchesBinding(key, bindings.up),
    down: matchesBinding(key, bindings.down),
    left: matchesBinding(key, bindings.left),
    right: matchesBinding(key, bindings.right),
    confirm: matchesBinding(key, bindings.confirm),
    back: matchesBinding(key, bindings.back),
  });
}

/**
 * 메뉴 한 화면이 여섯 입력 말고 따로 받는 동작 하나(정산의 전설 보기, 기록의 쪽 넘김 등). 키는 키 표에서 오고, 패드는 고정 버튼이다.
 * 여섯 입력과 같은 표를 지나야 키 재지정·패드 양보가 화면마다 갈라지지 않는다.
 */
export interface MenuActionBinding {
  readonly key?: KeyBinding;
  readonly pad?: readonly GamepadControl[];
}

export type MenuActionBindings<A extends string> = Readonly<Record<A, MenuActionBinding>>;

/** 키 하나 또는 패드 한 프레임이 메뉴에 준 입력. 아무것도 아니면 만들지 않는다(`null`). */
export interface MenuInput<A extends string = never> {
  readonly nav: MenuNav;
  /** 그 화면의 동작 중 눌린 것들(표의 순서). 확인·뒤로와 같은 키여도 둘 다 온다 — 무엇이 먼저인지는 화면이 정한다. */
  readonly actions: readonly A[];
  readonly device: "keyboard" | "gamepad";
}

const NO_ACTIONS: readonly never[] = Object.freeze([]);

function anyNav(nav: MenuNav): boolean {
  return menuNavMoved(nav) || nav.confirm || nav.back;
}

export function menuInputFromKey<A extends string = never>(
  key: string,
  actions: MenuActionBindings<A> = {} as MenuActionBindings<A>,
  bindings: MenuKeyBindings = MENU_KEY_BINDINGS,
): MenuInput<A> | null {
  const nav = menuNavFromKey(key, bindings);
  const hit = (Object.keys(actions) as A[]).filter((action) => {
    const binding = actions[action].key;
    return binding !== undefined && matchesBinding(key, binding);
  });
  if (!anyNav(nav) && hit.length === 0) return null;
  return Object.freeze({ nav, actions: hit.length === 0 ? NO_ACTIONS : Object.freeze(hit), device: "keyboard" as const });
}

/**
 * 패드 한 프레임. `claimed` 는 그 화면이 게임 동작으로 쓰는 패드 버튼이다(재지정 포함) — 그 버튼은 확인·뒤로로 읽지 않는다.
 * 경매 로비에서 상호작용을 B 로 바꿔 두면 B 가 로비를 나가지 않던 규칙을 화면마다 다시 적지 않게 여기서 한 번 뺀다.
 */
export function menuInputFromGamepad<A extends string = never>(
  sample: GamepadSample,
  actions: MenuActionBindings<A> = {} as MenuActionBindings<A>,
  claimed: readonly GamepadControl[] = [],
): MenuInput<A> | null {
  const read = menuNavFromGamepad(sample);
  const nav = claimed.length === 0 ? read : Object.freeze({
    ...read,
    confirm: read.confirm && !claimed.includes("south"),
    back: read.back && !claimed.includes("east"),
  });
  const hit = (Object.keys(actions) as A[]).filter((action) =>
    actions[action].pad?.some((control) => sample.pressed[control] && !claimed.includes(control)) === true);
  if (!anyNav(nav) && hit.length === 0) return null;
  return Object.freeze({ nav, actions: hit.length === 0 ? NO_ACTIONS : Object.freeze(hit), device: "gamepad" as const });
}

export function menuNavMoved(nav: MenuNav): boolean {
  return nav.up || nav.down || nav.left || nav.right;
}

export interface MoveCursorOptions {
  /** 끝에서 반대편으로 넘어가는가. 기본 켜짐. */
  readonly wrap?: boolean;
  /** 어느 축을 읽는가. 기본 세로(위/아래). */
  readonly axis?: "vertical" | "horizontal";
}

/**
 * 커서 한 칸 이동. `(index + count - 1) % count` 를 씬마다 다시 적으면 목록이 비었을 때
 * `NaN` 이 되는 자리가 조용히 늘어난다.
 */
export function moveCursor(
  index: number,
  count: number,
  nav: MenuNav,
  options: MoveCursorOptions = {},
): number {
  if (count <= 0) return index;
  const horizontal = options.axis === "horizontal";
  const forward = horizontal ? nav.right : nav.down;
  const backward = horizontal ? nav.left : nav.up;
  const step = forward ? 1 : backward ? -1 : 0;
  if (step === 0) return index;
  if (options.wrap === false) return Math.min(count - 1, Math.max(0, index + step));
  return ((index + step) % count + count) % count;
}
