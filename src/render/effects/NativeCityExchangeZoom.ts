import type { NativeCityCameraFrame } from "../../app/NativeCityPresentation";
import { NATIVE_CITY_EXCHANGE_FX } from "./NativeCityExchangeFx";
import { clamp01 } from "../../sim/geom";
import { easeOutCubic } from "../art/easing";
import { smoothstep as smoothstepEdges } from "./CombatFxShapes";

/**
 * 마을 1:1 대결 공방의 싸움 줌(쿠마 공방 명세에서 시작, 명세 ② 예비동작 ×1.07, ⑤ 마무리 ×1.10–1.12). 수치는 FX 레시피 `camera.zoom` 하나다.
 *
 * - 곱하는 층이다: 씬의 월드 카메라 배율(맞춤·궤도 줌·발견 줌) 위에 `level` 을 곱한다. 그 값들을 덮어쓰지 않는다.
 * - 진행자(`NativeCityCombatController`)가 매 프레임 요구(`demand`)를 내고 `stepNativeCityExchangeZoom` 으로 한 걸음 간다.
 *   요구가 없어지면 그때의 배율에서 1 로 풀린다 — 풀림은 공유 멈춤(히트스톱)이 끝난 뒤 화면 시간으로 흐른다
 *   (멈춘 그림은 친 순간의 배율로 읽힌다).
 * - 줌이 1 보다 크면 두 싸움꾼의 가운데를 축으로 당기고 두 몸이 화면 안에 남게 한다(`nativeCityExchangeZoomFrame`).
 * - 모션 감소: 늘 1.
 */
const Z = NATIVE_CITY_EXCHANGE_FX.camera.zoom;

/** What the exchange asks of the camera this frame: the multiplier now and how long it takes to let go of it. */
export interface NativeCityExchangeZoomDemand { readonly zoom: number; readonly releaseMs: number }

export interface NativeCityExchangeZoomState {
  /** The fight-zoom multiplier this frame (1 = none). */
  readonly level: number;
  /** While a demand holds the zoom: its release length (it eases back over this when the demand lets go). */
  readonly holdReleaseMs: number | null;
  /** Easing back to 1 from `from` over `ms` (`ageMs` in, screen time outside the freeze). */
  readonly release: { readonly from: number; readonly ms: number; readonly ageMs: number } | null;
}

export const NATIVE_CITY_EXCHANGE_ZOOM_REST: NativeCityExchangeZoomState = Object.freeze({ level: 1, holdReleaseMs: null, release: null });

/** 0..1 로 자르고 비유한값은 0 으로 본다(공용 `clamp01` 은 NaN 을 통과시킨다). */ const unit = (t: number) => clamp01(Number.isFinite(t) ? t : 0);
const smoothstep = (t: number) => smoothstepEdges(0, 1, unit(t));
const easeOut = (t: number) => easeOutCubic(unit(t));

/** The slam windup: 1 → `windup` over his windup and apex hold (`modeMs` of `contactMs`), settling (no speed left) on the contact. */
export function kumaWindupZoom(modeMs: number, contactMs: number): NativeCityExchangeZoomDemand {
  return { zoom: 1 + (Z.windup - 1) * smoothstep(modeMs / Math.max(1, contactMs)), releaseMs: Z.windupReleaseMs };
}

/**
 * The finisher: a punch-in to `finisher[0]` over `finisherInMs` of screen time from the KO blow (it lands on the blow's freeze),
 * creeping on to `finisher[1]` as the slow-mo launch runs (`launch` 0 at the blow, 1 at the landing).
 */
export function kumaFinisherZoom(screenMs: number, launch: number): NativeCityExchangeZoomDemand {
  const low = Z.finisher[0] ?? 1, high = Z.finisher[1] ?? low;
  const target = low + (high - low) * smoothstep(launch);
  return { zoom: 1 + (target - 1) * easeOut(screenMs / Math.max(1, Z.finisherInMs)), releaseMs: Z.finisherReleaseMs };
}

/** Easing back: `from` → 1 over `releaseMs` (ease-out). */
export function kumaZoomRelease(from: number, ageMs: number, releaseMs: number): number {
  return 1 + (from - 1) * (1 - easeOut(ageMs / Math.max(1, releaseMs)));
}

/**
 * One frame of the fight zoom. `demand`: what the exchange wants now (null = nothing). `freeMs`: this frame's screen ms outside
 * the shared freeze — a release waits out the hit stop. A demand under a release still running keeps the higher of the two.
 */
export function stepNativeCityExchangeZoom(state: NativeCityExchangeZoomState, demand: NativeCityExchangeZoomDemand | null, freeMs: number,
  reducedMotion: boolean): NativeCityExchangeZoomState {
  if (reducedMotion) return NATIVE_CITY_EXCHANGE_ZOOM_REST;
  let release = state.release, releasing = 1;
  if (release) {
    const ageMs = release.ageMs + Math.max(0, Number.isFinite(freeMs) ? freeMs : 0);
    if (ageMs >= release.ms) release = null;
    else { release = { ...release, ageMs }; releasing = kumaZoomRelease(release.from, ageMs, release.ms); }
  }
  if (demand) {
    const zoom = Math.max(1, demand.zoom);
    return zoom >= releasing ? { level: zoom, holdReleaseMs: demand.releaseMs, release: null }
      : { level: releasing, holdReleaseMs: demand.releaseMs, release };
  }
  // The demand let go this frame: ease back from where it held.
  if (state.holdReleaseMs !== null && state.level > 1) {
    return { level: state.level, holdReleaseMs: null, release: { from: state.level, ms: state.holdReleaseMs, ageMs: 0 } };
  }
  return release ? { level: releasing, holdReleaseMs: null, release } : NATIVE_CITY_EXCHANGE_ZOOM_REST;
}

/**
 * The fight zoom on the scene's camera frame: zoom by `factor` about the fighters' midpoint (the middle of `bodies` — their feet
 * and heads, world px — stays put on screen), then shift just enough that every body point stays `marginPx` (screen) inside the
 * viewport, and never past the scene's own view (the zoomed view stays inside it: no new plate edge). `factor` ≤ 1 returns `frame`.
 */
export function nativeCityExchangeZoomFrame(frame: NativeCityCameraFrame, factor: number, bodies: readonly (readonly [number, number])[],
  width: number, height: number, marginPx: number = Z.frameMarginPx): NativeCityCameraFrame {
  if (!(factor > 1) || bodies.length === 0) return frame;
  const zoom = frame.zoom * factor;
  const axis = (center: number, size: number, i: 0 | 1): number => {
    const values = bodies.map(point => point[i]), lo = Math.min(...values), hi = Math.max(...values), mid = (lo + hi) / 2;
    let c = mid + (center - mid) / factor;
    // Keep both bodies inside (centre between them when they cannot both fit).
    const half = size / (2 * zoom), margin = marginPx / zoom, a = hi - half + margin, b = lo + half - margin;
    c = a <= b ? Math.max(a, Math.min(b, c)) : mid;
    // Inside the scene's view.
    const outer = size / (2 * frame.zoom);
    return Math.max(center - outer + half, Math.min(center + outer - half, c));
  };
  return { zoom, centerX: axis(frame.centerX, width, 0), centerY: axis(frame.centerY, height, 1) };
}
