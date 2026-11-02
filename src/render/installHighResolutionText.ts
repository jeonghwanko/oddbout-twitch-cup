import Phaser from "phaser";
import { sceneTextResolution } from "./RenderScale";

interface TextFactoryContext {
  readonly scene: Phaser.Scene;
  readonly displayList: Phaser.GameObjects.DisplayList;
}

let installed = false;

/** 모든 Phaser Text가 그 씬 카메라의 render zoom 이상으로 래스터라이즈되게 한다. */
export function installHighResolutionTextFactory(): void {
  if (installed) return;
  installed = true;

  // GameObjectFactory.register는 기존 키를 덮어쓰지 않으므로 기본 팩토리를 먼저 제거한다.
  Phaser.GameObjects.GameObjectFactory.remove("text");
  Phaser.GameObjects.GameObjectFactory.register("text", function (
    this: TextFactoryContext,
    x: number,
    y: number,
    text: string | string[],
    style?: Phaser.Types.GameObjects.Text.TextStyle,
  ) {
    const resolution = sceneTextResolution(this.scene.sys.settings.key, style?.resolution);
    return this.displayList.add(new Phaser.GameObjects.Text(
      this.scene,
      x,
      y,
      text,
      { ...style, resolution },
    ));
  });
}
