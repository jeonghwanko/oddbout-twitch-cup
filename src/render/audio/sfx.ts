import Phaser from "phaser";
import { AUDIO_ASSETS } from "../../assets/RuntimeMediaCatalog";
import { GamepadReader, anyGamepadPressed } from "../input/gamepad";
import { AudioEngine } from "./AudioEngine";
import { SfxPlayer } from "./SfxPlayer";

/**
 * 효과음 싱글턴.
 *
 * 씬을 넘나들며 살아 있어야 한다 — 브리핑에서 깨운 AudioContext 를 잠입 씬이
 * 그대로 써야 첫 발소리가 무음이 되지 않는다. 씬마다 새로 만들면 잠입에 들어갈
 * 때 다시 잠긴 채로 시작한다.
 */
export const sfx = new SfxPlayer(new AudioEngine(AUDIO_ASSETS));

/**
 * 첫 입력에서 오디오를 깨운다. 브라우저는 사용자 제스처 전에는 소리를 내주지 않는다.
 * 여러 씬에서 불러도 안전하다.
 *
 * 키보드·포인터·패드 세 입력을 모두 여기서 받는다. 씬이 입력 처리 곳곳에서
 * `sfx.unlock()` 을 따로 부를 필요가 없게 하려는 것이다 — Phaser 캔버스 밖의 DOM
 * 버튼(도입 영상·컷신 컨트롤)처럼 이 리스너가 보지 못하는 제스처만 직접 부른다.
 *
 * 패드는 Phaser 게임패드 플러그인이 켜진 설정이면 그 `down` 이벤트를 듣는다. 본 게임
 * 부팅(`main.ts`)은 플러그인을 켜지 않고 씬마다 `GamepadReader` 로 브라우저 Gamepad API 를
 * 직접 읽으므로, 플러그인이 없으면 같은 판정(`anyGamepadPressed`)으로 매 프레임 확인한다.
 * UPDATE 이벤트는 씬의 `update()` 보다 먼저 오므로 같은 프레임의 패드 확인음보다 앞선다.
 */
export function attachAudioUnlock(scene: Phaser.Scene): void {
  const unlock = (): void => sfx.unlock();
  scene.input.keyboard?.on("keydown", unlock);
  scene.input.on("pointerdown", unlock);
  // 터치는 손을 뗄 때(touchend)만 사용자 동작이다(HTML 사용자 활성화 규칙 — touchstart 에서 부른 resume 은 거절된다). 그래서 폰의 첫
  // 탭은 pointerdown 에서 AudioContext 만 만들고, 이 pointerup 이 실제로 깨운다(2026-10-23 모바일 무투장). Phaser 는 DOM 이벤트
  // 안에서 바로 입력을 처리하므로 이 콜백은 touchend 안에서 돈다.
  scene.input.on("pointerup", unlock);

  const gamepadPlugin = scene.input.gamepad;
  if (gamepadPlugin) {
    // 플러그인 리스너는 입력 플러그인의 shutdown 이 함께 걷는다.
    gamepadPlugin.on("down", unlock);
    return;
  }

  const reader = new GamepadReader();
  const poll = (): void => {
    if (anyGamepadPressed(reader.sample())) sfx.unlock();
  };
  // 사용자 `scene.events` 구독은 Phaser 가 대신 걷지 않는다(런타임 수명주기 계약 2).
  const detach = (): void => {
    scene.events.off(Phaser.Scenes.Events.UPDATE, poll);
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, detach);
    scene.events.off(Phaser.Scenes.Events.DESTROY, detach);
  };
  scene.events.on(Phaser.Scenes.Events.UPDATE, poll);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, detach);
  scene.events.once(Phaser.Scenes.Events.DESTROY, detach);
}
