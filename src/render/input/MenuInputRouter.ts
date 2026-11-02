import Phaser from "phaser";
import type { SceneScope } from "../lifecycle/SceneScope";
import type { DomModalHost } from "../dom/domModalHost";
import { topDomModal } from "../dom/domModalGamepad";
import { EMPTY_GAMEPAD_STATE } from "./gamepad";
import type { GamepadControl, GamepadSample } from "./gamepad";
import type { InputContextController } from "./InputContextController";
import { menuInputFromGamepad, menuInputFromKey } from "../ui/MenuCursor";
import type { MenuActionBindings, MenuInput } from "../ui/MenuCursor";

export interface MenuInputRouterOptions<A extends string> {
  /** 여섯 입력 말고 이 화면이 받는 동작. 키는 키 표(`INPUT_BINDINGS`)에서 가져온다. */
  readonly actions?: MenuActionBindings<A>;
  /** 브라우저 기본 동작(스크롤·포커스 이동)에서 잡아 둘 Phaser 키 이름. */
  readonly capture?: readonly string[];
  /** 참이면 이 키·이 프레임을 버린다(나가는 중, 화면을 쥔 연출 등). 패드는 그래도 읽어 눌림이 다음 프레임으로 새지 않는다. */
  readonly blocked?: () => boolean;
  /** 이 화면이 게임 동작으로 쓰는 패드 버튼(재지정 반영). 그 버튼은 확인·뒤로·동작으로 읽지 않는다. */
  readonly claimedPad?: () => readonly GamepadControl[];
  /** 이 씬이 연 DOM 창의 문지기. 창이 열려 있으면 그 프레임의 패드는 창이 받는다. */
  readonly domModal?: DomModalHost;
  /** 키를 누르고 있을 때의 자동 반복도 입력으로 받는가. 기본은 받지 않는다. */
  readonly keyRepeat?: boolean;
  readonly onInput: (input: MenuInput<A>) => void;
}

const EMPTY_SAMPLE: GamepadSample = Object.freeze({
  held: EMPTY_GAMEPAD_STATE,
  pressed: EMPTY_GAMEPAD_STATE,
  connected: false,
  leftStick: Object.freeze({ x: 0, y: 0 }),
  dpad: Object.freeze({ x: 0 as const, y: 0 as const }),
});

function domModalOpen(): boolean {
  return typeof globalThis.document !== "undefined" && topDomModal() !== null;
}

/**
 * 메뉴 화면의 입력 받는 곳 하나(2026-10-18). 씬은 `onInput` 만 건다 — 키보드 리스너, 프레임마다의 패드 읽기,
 * 키·패드 → `MenuInput` 변환, 재지정된 패드 버튼 양보, 위에 뜬 DOM 창 양보를 여기서 한 번 한다.
 *
 * 화면마다 `keydown-ESC`·`pressed.east` 를 따로 들으면 키 표가 바뀌어도 그 화면만 따라오지 않고, 위에 뜬 창 아래로
 * 입력이 새는 구멍(정산의 전설 한 컷 뒤 내보내기, 2026-10-17)이 화면마다 따로 생긴다.
 *
 * 패드는 씬의 `update()` 앞(`UPDATE` 이벤트)에서 프레임마다 한 번 읽는다. `GamepadReader.sample()` 은 읽을 때 눌림을 소비하므로
 * 씬이 이동 등으로 패드를 더 읽어야 하면 다시 읽지 말고 `pad` 를 쓴다.
 */
export class MenuInputRouter<A extends string = never> {
  private frameSample: GamepadSample = EMPTY_SAMPLE;

  constructor(
    scene: Phaser.Scene,
    scope: SceneScope,
    private readonly context: InputContextController,
    private readonly options: MenuInputRouterOptions<A>,
  ) {
    const keyboard = scene.input.keyboard;
    if (keyboard) {
      const capture = options.capture ?? [];
      if (capture.length > 0) {
        keyboard.addCapture([...capture]);
        scope.add(() => keyboard.removeCapture([...capture]));
      }
      scope.on(keyboard, "keydown", (event: KeyboardEvent) => this.key(event));
    }
    scope.on(scene.events, Phaser.Scenes.Events.UPDATE, () => this.frame());
  }

  /** 이 프레임의 패드 샘플. 씬이 메뉴 밖의 패드 입력(걷기 등)을 읽을 때 쓴다. */
  get pad(): GamepadSample {
    return this.frameSample;
  }

  private key(event: KeyboardEvent): void {
    if (event.repeat && this.options.keyRepeat !== true) return;
    if (domModalOpen() || this.options.domModal?.open === true) return;
    if (this.options.blocked?.() === true) return;
    const input = menuInputFromKey(event.key, this.options.actions);
    this.context.observeKeyboard(true);
    if (input === null) return;
    event.preventDefault();
    this.options.onInput(input);
  }

  private frame(): void {
    this.frameSample = this.context.sampleGamepad();
    if (this.options.domModal?.pad(this.frameSample.pressed) === true) return;
    if (domModalOpen()) return;
    if (this.options.blocked?.() === true) return;
    const input = menuInputFromGamepad(this.frameSample, this.options.actions, this.options.claimedPad?.() ?? []);
    if (input !== null) this.options.onInput(input);
  }
}
