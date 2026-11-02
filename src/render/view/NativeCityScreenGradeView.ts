import Phaser from "phaser";
import { GAME_PARENT_ID } from "../RenderScale";
import { nativeCityScreenGradeFilter } from "../effects/NativeCityScreenGrade";

/**
 * 마을 대결의 화면 전체 색(`NativeCityScreenGrade`)을 게임 부모 요소의 CSS filter 로 건다 — 브라우저 합성기가 아래 three.js 마을과 위
 * Phaser 캔버스에 같이 적용한다. 마을 DOM HUD 는 `document.body` 에 붙어 이 부모 밖이라 그대로다. 값이 바뀐 프레임에만 style 을 쓰고,
 * 아무것도 안 할 때는 filter 를 비워 부모가 합성 층을 따로 만들지 않게 한다. 씬이 멈추거나 잠들거나 끝나면 지운다.
 */
export class NativeCityScreenGradeView {
  private readonly element: HTMLElement | null;
  private applied = "";
  private readonly clear = () => this.apply("");

  constructor(private readonly scene: Phaser.Scene) {
    this.element = globalThis.document?.getElementById(GAME_PARENT_ID) ?? null;
    for (const event of [Phaser.Scenes.Events.PAUSE, Phaser.Scenes.Events.SLEEP, Phaser.Scenes.Events.SHUTDOWN]) scene.events.on(event, this.clear);
  }

  /** One frame with the fight slow-mo's desaturation now (`nativeCitySlowMoDesaturate`). The parry's frame is the backdrop pass's. */
  frame(_dtMs: number, desaturate: number): void {
    this.apply(nativeCityScreenGradeFilter({ desaturate }));
  }

  private apply(filter: string): void {
    if (!this.element || filter === this.applied) return;
    this.applied = filter;
    this.element.style.filter = filter;
  }

  destroy(): void {
    this.clear();
    for (const event of [Phaser.Scenes.Events.PAUSE, Phaser.Scenes.Events.SLEEP, Phaser.Scenes.Events.SHUTDOWN]) this.scene.events.off(event, this.clear);
  }
}
