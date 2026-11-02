import Phaser from "phaser";
import type { SceneScope } from "./lifecycle/SceneScope";
import {
  fixedCameraRenderOffset,
  logicalScreenLength,
  RENDER_SCALE,
} from "./RenderScale";

type FixedCameraObject = Phaser.GameObjects.GameObject
  & Phaser.GameObjects.Components.Transform
  & Phaser.GameObjects.Components.ScrollFactor;

interface FixedCameraSpaceOptions {
  readonly camera?: Phaser.Cameras.Scene2D.Camera;
  readonly renderScale?: () => number;
  readonly onAdd?: (object: FixedCameraObject) => void;
}

/**
 * 같은 씬의 월드 카메라 위에 놓인 화면 고정·부분 시차 오브젝트를 기존 좌표계에 고정한다.
 *
 * 카메라의 게임플레이 zoom은 보존하고, RENDER_SCALE 때문에 백버퍼 중심만 이동한 양을
 * 보정한다. 화면 크기가 바뀌면 등록된 오브젝트를 차이만큼 옮겨 진행 중인 연출 좌표도
 * 가능한 한 보존한다.
 */
export class FixedCameraSpace {
  private readonly objects = new Map<
    FixedCameraObject,
    { readonly scrollFactorX: number; readonly scrollFactorY: number }
  >();
  private offsetX = 0;
  private offsetY = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    scope: SceneScope,
    private readonly options: FixedCameraSpaceOptions = {},
  ) {
    this.sync();
    scope.on(scene.scale, Phaser.Scale.Events.RESIZE, this.sync, this);
    scope.on(scene.events, Phaser.Scenes.Events.POST_UPDATE, this.sync, this);
    scope.add(() => this.objects.clear());
  }

  get width(): number {
    return logicalScreenLength(this.camera.width, this.renderScale);
  }

  get height(): number {
    return logicalScreenLength(this.camera.height, this.renderScale);
  }

  private get camera(): Phaser.Cameras.Scene2D.Camera { return this.options.camera ?? this.scene.cameras.main; }
  private get renderScale(): number { return this.options.renderScale?.() ?? RENDER_SCALE; }

  x(logicalX: number): number {
    this.sync();
    return logicalX + this.offsetX;
  }

  y(logicalY: number): number {
    this.sync();
    return logicalY + this.offsetY;
  }

  add<T extends FixedCameraObject>(
    object: T,
    scrollFactorX = 0,
    scrollFactorY = scrollFactorX,
  ): T {
    this.sync();
    object
      .setScrollFactor(scrollFactorX, scrollFactorY)
      .setPosition(
        object.x + this.offsetX * (1 - scrollFactorX),
        object.y + this.offsetY * (1 - scrollFactorY),
      );
    this.objects.set(object, { scrollFactorX, scrollFactorY });
    this.options.onAdd?.(object);
    object.once(Phaser.GameObjects.Events.DESTROY, () => this.objects.delete(object));
    return object;
  }

  /**
   * 등록된 부분 시차 오브젝트의 논리 월드 좌표를 바꾼다.
   *
   * 매 프레임 `setPosition()`을 직접 호출하면 add()가 넣은 HiDPI 중심 보정이 사라진다.
   * 움직이는 화면 고정·부분 시차 오브젝트는 이 메서드로 위치를 갱신한다.
   */
  setLogicalPosition<T extends FixedCameraObject>(
    object: T,
    logicalX: number,
    logicalY: number,
  ): T {
    this.sync();
    const factors = this.objects.get(object);
    if (factors === undefined) return object.setPosition(logicalX, logicalY);
    return object.setPosition(
      logicalX + this.offsetX * (1 - factors.scrollFactorX),
      logicalY + this.offsetY * (1 - factors.scrollFactorY),
    );
  }

  /** 등록된 오브젝트의 시차 강도를 바꾸면서 현재 논리 위치를 보존한다. */
  setScrollFactor<T extends FixedCameraObject>(
    object: T,
    scrollFactorX: number,
    scrollFactorY = scrollFactorX,
  ): T {
    this.sync();
    const previous = this.objects.get(object);
    if (previous === undefined) return this.add(object, scrollFactorX, scrollFactorY);
    object
      .setPosition(
        object.x + this.offsetX * (previous.scrollFactorX - scrollFactorX),
        object.y + this.offsetY * (previous.scrollFactorY - scrollFactorY),
      )
      .setScrollFactor(scrollFactorX, scrollFactorY);
    this.objects.set(object, { scrollFactorX, scrollFactorY });
    return object;
  }

  private readonly sync = (): void => {
    const camera = this.camera;
    const nextX = fixedCameraRenderOffset(camera.width, this.renderScale);
    const nextY = fixedCameraRenderOffset(camera.height, this.renderScale);
    const deltaX = nextX - this.offsetX;
    const deltaY = nextY - this.offsetY;
    if (deltaX === 0 && deltaY === 0) return;
    for (const [object, factors] of this.objects) {
      object.setPosition(
        object.x + deltaX * (1 - factors.scrollFactorX),
        object.y + deltaY * (1 - factors.scrollFactorY),
      );
    }
    this.offsetX = nextX;
    this.offsetY = nextY;
  };
}
