import { cameraEase, type CameraEase } from "./CameraAccents";

/** 카메라가 보는 곳. 중심은 월드 좌표, 배율은 렌더 배율(`renderZoom` 을 거친 값)이다. */
export interface CameraPose {
  readonly centerX: number;
  readonly centerY: number;
  readonly zoom: number;
}

/**
 * 연출이 카메라를 빌려 가는 한 컷(대화 밀어넣기, 시설 입장, 저택 문).
 *
 * 목표는 함수다 — 편지 밀기처럼 샷이 걸린 동안 목표가 움직여도 매 프레임 다시 읽는다.
 * Phaser `pan`+`zoomTo` 는 시작할 때의 목표로 고정되어, 매 프레임 절대값을 쓰는 코드와
 * 섞이면 한 프레임도 살아남지 못했다.
 */
export interface CameraShotSpec {
  readonly id: string;
  readonly target: () => CameraPose;
  readonly durationMs: number;
  readonly ease?: string;
}

/** 두 자세 사이의 보간. Phaser `pan`/`zoomTo` 처럼 중심과 배율을 같은 진행도로 옮긴다. */
export function blendCameraPose(from: CameraPose, to: CameraPose, progress: number): CameraPose {
  const t = Math.max(0, Math.min(1, progress));
  return {
    centerX: from.centerX + (to.centerX - from.centerX) * t,
    centerY: from.centerY + (to.centerY - from.centerY) * t,
    zoom: from.zoom + (to.zoom - from.zoom) * t,
  };
}

/** 진행 중인 전환(샷 진입 또는 기본 구도로의 복귀). */
export interface CameraBlend {
  readonly from: CameraPose;
  readonly durationMs: number;
  readonly ease: CameraEase;
  elapsedMs: number;
}

export function startCameraBlend(from: CameraPose, durationMs: number, ease = "Sine.easeInOut"): CameraBlend {
  return { from, durationMs: Math.max(0, durationMs), ease: cameraEase(ease), elapsedMs: 0 };
}

/** 전환을 한 프레임 진행하고 현재 자세를 돌려준다. 끝났으면 `done` 이 참이다. */
export function advanceCameraBlend(blend: CameraBlend, to: CameraPose, deltaMs: number): { pose: CameraPose; done: boolean } {
  blend.elapsedMs += Math.max(0, deltaMs);
  if (blend.durationMs <= 0 || blend.elapsedMs >= blend.durationMs) return { pose: to, done: true };
  return { pose: blendCameraPose(blend.from, to, blend.ease(blend.elapsedMs / blend.durationMs)), done: false };
}
