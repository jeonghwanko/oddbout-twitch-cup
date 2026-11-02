import Phaser from "phaser";
import { installUiFeedback } from "./UiFeedback";

/**
 * 게임 설정 `plugins.scene` 에 넣는 씬 플러그인. 씬이 만들어질 때 공용 UI 반응 장부를 붙인다.
 *
 * `UiFeedback.ts` 와 나눈 까닭: 씬·뷰는 `uiFeedback()` 만 쓰고, 이 클래스는 `main.ts` 만 쓴다.
 * 클래스 선언은 모듈을 읽는 순간 `Phaser.Plugins.ScenePlugin` 을 요구하므로, 한 파일에 두면
 * Phaser 를 부분 모의하는 씬 테스트가 import 만으로 깨진다.
 */
export class UiFeedbackPlugin extends Phaser.Plugins.ScenePlugin {
  override boot(): void {
    if (this.scene !== null) installUiFeedback(this.scene);
  }
}

export const UI_FEEDBACK_PLUGIN: Phaser.Types.Core.PluginObjectItem = Object.freeze({
  key: "UiFeedbackPlugin",
  plugin: UiFeedbackPlugin,
  mapping: "uiFeedbackDirector",
});
