import { SCENE_KEYS, type SceneKey } from "../app/GameFlow";
import { CAMERA_ZOOM, VIEW_HEIGHT, VIEW_WIDTH } from "../sim/tuning";
import { MOBILE_DEVICE } from "./DeviceProfile";

const MAX_RENDER_SCALE_OVERRIDE = (globalThis as { __MAX_RENDER_SCALE?: number }).__MAX_RENDER_SCALE;
const MAX_RENDER_SCALE = Number(MAX_RENDER_SCALE_OVERRIDE ?? 2);
/**
 * 모바일 기기(`DeviceProfile.MOBILE_DEVICE` — 터치가 주 입력인 폰·태블릿)의 상한(2026-10-23 모바일 무투장). 배율 3 폰은 상한 2 아래에서도 1.4배가 되어
 * 기기 원해상도(844×390 CSS → 2.6 MP)를 그렸다. 1 이면 1280×720 프레임 그대로(EXPAND 로 약 1.3 MP)라 프래그먼트 처리가 반으로 준다.
 * 손바닥 크기 화면이라 남는 1.4배 업스케일은 거의 보이지 않는다.
 */
const TOUCH_MAX_RENDER_SCALE = 1;
const MAX_CSS_HUD_SCALE = 1.5;

/** Phaser 캔버스가 들어가는 DOM 컨테이너. EXPAND가 CSS 표시 크기로 쓰는 그 부모다. */
export const GAME_PARENT_ID = "game";

function positiveOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * 논리 좌표계와 별개로 캔버스 백버퍼에 적용할 배율을 정한다.
 *
 * **dpr만 봐서는 안 된다.** EXPAND는 canvas 크기를 `game.config`에서 뽑고 CSS 표시 크기만
 * 부모에 맞춘다(`ScaleManager.js:1088-1133`). 그래서 남는 브라우저 업스케일은 base에 붙잡히는
 * 축 — 비율이 작은 쪽 — 하나로 정해진다. dpr만 곱하면 이 항이 통째로 빠져 여전히 흐리다.
 * 1077px 높이 창·dpr 1.25에서 필요한 값은 1.25가 아니라 1.87이었다.
 *
 * 1 미만으로 낮추면 기존 720p 기준보다도 흐려지므로 하한은 1, GPU 비용(프래그먼트 처리량이
 * 배율의 제곱)을 제한하려고 상한은 2로 둔다. 잘못된 환경 값이 들어와도 유한한 값만 쓴다.
 */
export function renderScaleFor(
  cssWidth: number | undefined,
  cssHeight: number | undefined,
  devicePixelRatio: number | undefined,
  maxScale = MAX_RENDER_SCALE,
): number {
  const expandBaseRatio = Math.min(
    positiveOr(cssWidth, VIEW_WIDTH) / VIEW_WIDTH,
    positiveOr(cssHeight, VIEW_HEIGHT) / VIEW_HEIGHT,
  );
  return Math.min(
    maxScale,
    Math.max(1, positiveOr(devicePixelRatio, 1) * expandBaseRatio),
  );
}

/** 이 화면의 배율 상한: 모바일은 `TOUCH_MAX_RENDER_SCALE`, 그 밖은 2. `__MAX_RENDER_SCALE` 을 직접 준 실행은 그 값 그대로다. */
export function maxRenderScaleFor(mobile: boolean): number {
  return mobile && MAX_RENDER_SCALE_OVERRIDE === undefined ? Math.min(MAX_RENDER_SCALE, TOUCH_MAX_RENDER_SCALE) : MAX_RENDER_SCALE;
}

/** Scale CSS screen-space HUD with the 1280×720 game frame, without shrinking it on small/mobile views. */
export function cssHudScaleFor(cssWidth: number, cssHeight: number): number {
  const widthScale = positiveOr(cssWidth, VIEW_WIDTH) / VIEW_WIDTH;
  const heightScale = positiveOr(cssHeight, VIEW_HEIGHT) / VIEW_HEIGHT;
  return Math.min(MAX_CSS_HUD_SCALE, Math.max(1, Math.min(widthScale, heightScale)));
}

/**
 * 부팅 시점 한 번만 잰다. 창을 키우면 그만큼 다시 업스케일되지만, 이를 따라가려면
 * `game.config` 갱신·전 씬 카메라 zoom 재적용·기존 Text 재래스터라이즈가 전부 필요하다.
 */
const bootParentRect = globalThis.document
  ?.getElementById(GAME_PARENT_ID)
  ?.getBoundingClientRect();

export const RENDER_SCALE = renderScaleFor(
  bootParentRect?.width ?? globalThis.innerWidth,
  bootParentRect?.height ?? globalThis.innerHeight,
  globalThis.devicePixelRatio,
  maxRenderScaleFor(MOBILE_DEVICE),
);

/** 게임플레이가 정한 논리 zoom을 실제 백버퍼 카메라 zoom으로 바꾼다. */
export function renderZoom(logicalZoom = 1, renderScale = RENDER_SCALE): number {
  return logicalZoom * renderScale;
}

/**
 * 씬별 정상 상태 카메라 논리 zoom. 여기 없는 씬은 전부 1이다.
 *
 * 안전 프레임 씬은 `renderZoom()`만 쓰고, 마을은 전용 0.90배 화각을 쓴다. 저택은
 * `CAMERA_ZOOM`만큼 더 당겨져 있다(`HeistScene.setZoom(renderZoom(CAMERA_ZOOM))`).
 */
const LOGICAL_CAMERA_ZOOM: Partial<Record<SceneKey, number>> = {
  [SCENE_KEYS.heist]: CAMERA_ZOOM,
};

/**
 * 그 씬의 Phaser Text가 확대되어 보이지 않을 최소 래스터 해상도.
 *
 * Phaser Text는 fontSize 그대로 래스터라이즈된 뒤 카메라 zoom 배로 확대되므로 선명 조건은
 * `resolution >= camera.zoom` 이다. RENDER_SCALE만 쓰면 논리 zoom이 1이 아닌 씬에서 그
 * 배율만큼 모자란다 — 저택은 1.61배 부족했다.
 *
 * `punchZoom`(최대 1.3배)은 하한에 넣지 않는다. 140~520ms 짜리 연출 한 순간을 위해 저택
 * 텍스트 텍스처를 상시 1.7배 키우는 것은 남는 장사가 아니다.
 */
export function sceneTextResolution(
  sceneKey: string,
  styleResolution = 0,
  renderScale = RENDER_SCALE,
): number {
  const logicalZoom = LOGICAL_CAMERA_ZOOM[sceneKey as SceneKey] ?? 1;
  return Math.max(renderZoom(logicalZoom, renderScale), styleResolution);
}

/** 실제 백버퍼 카메라 zoom에서 게임플레이 논리 zoom만 되찾는다. */
export function logicalCameraZoom(renderedZoom: number, renderScale = RENDER_SCALE): number {
  return renderedZoom / renderScale;
}

/** 화면상의 논리 1px을 현재 월드 좌표 단위로 환산한다. */
export function worldUnitsPerLogicalPixel(renderedZoom: number, renderScale = RENDER_SCALE): number {
  return 1 / Math.max(0.01, logicalCameraZoom(renderedZoom, renderScale));
}

/** 백버퍼 픽셀 길이를 카메라가 보는 논리 월드 길이로 환산한다. */
export function logicalViewportLength(viewportPixels: number, renderedZoom: number): number {
  return viewportPixels / renderedZoom;
}

/** 백버퍼 픽셀 길이를 RENDER_SCALE 적용 전의 화면 논리 픽셀 길이로 되돌린다. */
export function logicalScreenLength(
  viewportPixels: number,
  renderScale = RENDER_SCALE,
): number {
  return viewportPixels / renderScale;
}

/**
 * `scrollFactor=0` 오브젝트가 RENDER_SCALE=1일 때와 같은 화면 좌표에 머물도록 옮길 양이다.
 *
 * Phaser 카메라는 zoom을 백버퍼 중심 기준으로 적용한다. 백버퍼만 R배 커졌는데 1280×720
 * 좌표를 그대로 넣으면 고정 HUD도 새 중심을 기준으로 확대되어 화면 안쪽으로 밀린다.
 */
export function fixedCameraRenderOffset(
  viewportPixels: number,
  renderScale = RENDER_SCALE,
): number {
  return (viewportPixels - logicalScreenLength(viewportPixels, renderScale)) / 2;
}

/** 부분 스크롤 레이어도 RENDER_SCALE=1일 때의 시차 위치를 유지하도록 옮길 양이다. */
export function cameraRenderOffsetForScrollFactor(
  viewportPixels: number,
  scrollFactor: number,
  renderScale = RENDER_SCALE,
): number {
  return fixedCameraRenderOffset(viewportPixels, renderScale) * (1 - scrollFactor);
}

/** Phaser camera.scroll에 넣을 값으로 원하는 worldView 좌상단 좌표를 변환한다. */
export function cameraScrollForWorldViewStart(
  worldViewStart: number,
  viewportPixels: number,
  renderedZoom: number,
): number {
  return worldViewStart - viewportPixels / 2 + viewportPixels / (2 * renderedZoom);
}

/** Phaser camera.scroll에서 현재 zoom이 만드는 worldView 좌상단을 즉시 계산한다. */
export function worldViewStartForCameraScroll(
  cameraScroll: number,
  viewportPixels: number,
  renderedZoom: number,
): number {
  return cameraScroll + viewportPixels / 2 - viewportPixels / (2 * renderedZoom);
}

/** 백버퍼 확대 전과 같은 논리 캔버스 중심에서 월드 카메라를 시작한다. */
export function initialRenderScaledCameraScroll(
  viewportPixels: number,
  renderScale = RENDER_SCALE,
): number {
  return viewportPixels / (2 * renderScale) - viewportPixels / 2;
}
