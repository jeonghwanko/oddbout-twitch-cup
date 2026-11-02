import Phaser from "phaser";
import type { SceneScope } from "../lifecycle/SceneScope";
import { GamepadReader, anyGamepadHeld } from "./gamepad";
import type { GamepadSample } from "./gamepad";

export type InputDevice = "keyboard" | "gamepad";

/** 패드 엣지 동기화와 마지막 사용 장치 판단을 화면마다 같은 방식으로 처리한다. */
export class InputContextController {
  private readonly gamepad: GamepadReader;
  private activeDeviceValue: InputDevice = "keyboard";
  private readonly resumeListeners: (() => void)[] = [];

  constructor(scene: Phaser.Scene, scope: SceneScope, gamepad = new GamepadReader()) {
    this.gamepad = gamepad;
    this.gamepad.sync();
    scope.on(scene.events, Phaser.Scenes.Events.RESUME, () => {
      this.gamepad.sync();
      for (const listener of this.resumeListeners) listener();
    });
    scope.on(scene.events, Phaser.Scenes.Events.WAKE, () => this.gamepad.sync());
  }

  /**
   * 오버레이(일시정지·설정·기록)가 닫혀 씬이 재개될 때 부른다.
   *
   * 멈춘 씬의 키보드 플러그인은 `keyup` 을 받지 않는다. 메뉴가 떠 있는 사이 손을 뗀
   * 이동 키는 재개 뒤에도 눌린 채로 남으므로, 키 상태를 쥔 씬이 여기서 비운다.
   * 씬이 직접 RESUME 을 구독하지 않게 수명주기를 이 컨트롤러가 소유한다.
   */
  onResume(listener: () => void): void {
    this.resumeListeners.push(listener);
  }

  sampleGamepad(): GamepadSample {
    const sample = this.gamepad.sample();
    if (anyGamepadHeld(sample)) this.activeDeviceValue = "gamepad";
    return sample;
  }

  /** DOM 가시성 경계에서도 백그라운드에서 누른 버튼을 복귀 입력으로 만들지 않는다. */
  syncGamepad(): void {
    this.gamepad.sync();
  }

  observeKeyboard(active: boolean, gamepadHeld = false): void {
    if (active && !gamepadHeld) this.activeDeviceValue = "keyboard";
  }

  /** Pointer/touch returns to the existing non-pad binding family. */
  observePointer(): void {
    this.activeDeviceValue = "keyboard";
  }

  get activeDevice(): InputDevice {
    return this.activeDeviceValue;
  }
}
