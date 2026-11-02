import { readRuntimeOptions } from "../app/RuntimeOptions";

/**
 * 이 기기를 모바일로 다루는가(2026-10-23, 모바일 무투장 — docs/kaito-web/arena-mobile.md). 부팅 때 한 번 정한다.
 * `?mobile=1|0` 이 있으면 그 값, 없으면 터치가 주 입력인 화면(`(pointer: coarse)` — 폰·태블릿)이다.
 * 이 값을 읽는 곳: 백버퍼 배율 상한(`RenderScale.maxRenderScaleFor`), 모바일 원화(`PhaserAssetLoader` — `ArenaMobileArt`).
 */
export function mobileDeviceFor(override: boolean | null | undefined, coarsePointer: boolean): boolean {
  return override ?? coarsePointer;
}

export const MOBILE_DEVICE = mobileDeviceFor(readRuntimeOptions().mobile,
  globalThis.matchMedia?.("(pointer: coarse)").matches === true);
