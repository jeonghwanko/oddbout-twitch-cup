import type Phaser from "phaser";
import { VIEW_HEIGHT, VIEW_WIDTH } from "../sim/tuning";
import type { SceneScope } from "./lifecycle/SceneScope";
import {
  cameraScrollForWorldViewStart,
  logicalViewportLength,
  renderZoom,
} from "./RenderScale";

export interface SafeFrameOffset {
  readonly x: number;
  readonly y: number;
}

export interface CoverBackgroundLayout {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

// Phaser가 fractional EXPAND 크기의 worldView 끝을 올림해도 1px 이음새가 남지 않게 한다.
const COVER_OVERSCAN_PX = 2;

/**
 * EXPAND가 추가한 화각의 한쪽 치우침을 없애고 1280×720 UI 안전 프레임을 중앙에 둔다.
 *
 * 월드 카메라는 이 값을 쓰지 않는다. 잠입 배경과 레벨은 넓어진 화각 전체를 실제로
 * 보여 주고, 고정 HUD·메뉴만 기존 정보 밀도와 클릭 좌표를 보존한 채 가운데 놓는다.
 */
export function centeredSafeFrameOffset(width: number, height: number): SafeFrameOffset {
  return {
    x: Math.max(0, width - VIEW_WIDTH) / 2,
    y: Math.max(0, height - VIEW_HEIGHT) / 2,
  };
}

export function coverBackgroundLayout(
  viewWidth: number,
  viewHeight: number,
  frameWidth: number,
  frameHeight: number,
  overscanPx = COVER_OVERSCAN_PX,
): CoverBackgroundLayout {
  const offset = centeredSafeFrameOffset(viewWidth, viewHeight);
  const scale = Math.max(
    (viewWidth + overscanPx) / frameWidth,
    (viewHeight + overscanPx) / frameHeight,
  );
  return {
    x: viewWidth / 2 - offset.x,
    y: viewHeight / 2 - offset.y,
    width: frameWidth * scale,
    height: frameHeight * scale,
  };
}

/** 장면이 자기 UI 카메라를 고정 배율로만 쓸 때. 월드 카메라는 따로 CameraRig·프레이밍이 맡는다. */
export function mainCameraAtRenderZoom(scene: Phaser.Scene): Phaser.Cameras.Scene2D.Camera {
  return scene.cameras.main.setZoom(renderZoom());
}

/** 배율을 바꿔도 논리 좌표 (0,0)이 화면 왼쪽 위에 오게 스크롤을 맞춘다(CSS 크기에 맞춘 메뉴용). */
export function mainCameraAtOriginZoom(scene: Phaser.Scene, zoom: number): Phaser.Cameras.Scene2D.Camera {
  const { width, height } = scene.scale.gameSize;
  return scene.cameras.main.setZoom(zoom)
    .setScroll(cameraScrollForWorldViewStart(0, width, zoom), cameraScrollForWorldViewStart(0, height, zoom));
}

export function installCenteredSafeFrame(scene: Phaser.Scene, scope: SceneScope): void {
  scene.cameras.main.setZoom(renderZoom());

  const apply = (gameSize: Phaser.Structs.Size): void => {
    const zoom = scene.cameras.main.zoom;
    const offset = centeredSafeFrameOffset(
      logicalViewportLength(gameSize.width, zoom),
      logicalViewportLength(gameSize.height, zoom),
    );
    scene.cameras.main.setScroll(
      cameraScrollForWorldViewStart(-offset.x, gameSize.width, zoom),
      cameraScrollForWorldViewStart(-offset.y, gameSize.height, zoom),
    );
  };

  apply(scene.scale.gameSize);
  scope.on(scene.scale, "resize", apply);
}

/** EXPAND가 만든 전체 논리 화각을 배경으로 덮고 남는 축만 잘라 낸다. */
export function installCoverBackground(
  scene: Phaser.Scene,
  scope: SceneScope,
  image: Phaser.GameObjects.Image,
  overscanPx = COVER_OVERSCAN_PX,
): void {
  const frameWidth = image.frame.width;
  const frameHeight = image.frame.height;

  const apply = (gameSize: Phaser.Structs.Size): void => {
    const zoom = scene.cameras.main.zoom;
    const layout = coverBackgroundLayout(
      logicalViewportLength(gameSize.width, zoom),
      logicalViewportLength(gameSize.height, zoom),
      frameWidth,
      frameHeight,
      overscanPx,
    );
    image
      .setOrigin(0.5)
      .setPosition(layout.x, layout.y)
      .setDisplaySize(layout.width, layout.height);
  };

  apply(scene.scale.gameSize);
  const dispose = (): void => {
    scene.scale.off("resize", apply);
  };
  scene.scale.on("resize", apply);
  image.once("destroy", dispose);
  scope.add(() => {
    image.off("destroy", dispose);
    dispose();
  });
}
