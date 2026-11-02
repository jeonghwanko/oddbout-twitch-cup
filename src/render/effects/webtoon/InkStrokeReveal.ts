/**
 * 웹툰 펜선 등장의 순수 곡선 (타이틀 활자 메뉴가 쓴다).
 *
 * - 붓 끝 가장자리: 펜으로 긋는 마스크의 오른쪽 가장자리가 붓털처럼 일렁인다(`brushEdge`).
 * - 펜선 → 채색: 남색 외곽선이 먼저 그어지고 크림색 채움이 뒤따른다(`inkWriteStateAt`).
 * - 쾅: 크게·기울어 나타나 눌렸다가 서는 자세(`slamPoseAt`).
 * - 박자 격자: 타이틀 곡의 8분음표 시각(`beatGridMs`).
 * - 잉크 방울: 반지름이 부드럽게 일렁이는 둥근 덩어리(`inkBlobPoints`). 평평한 다각형·삼각형은 쓰지 않는다.
 *
 * 모든 함수는 시각(ms)과 시드만으로 정해진다 — 같은 입력은 언제나 같은 그림이다(`Math.random` 금지).
 * 수치 원본은 `view/TitleMotionProfile.ts` 의 `TITLE_UI_INK` 이고, 여기서는 받은 값을 곡선으로만 푼다.
 */
import { clamp01, lerp } from "../../../sim/geom.ts";
import { easeOutBack, easeOutCubic } from "../../art/easing.ts";
import { fxRng } from "../FxRandom.ts";
import { smoothstep01 } from "../../art/easing";

/** 시드·칸 번호로 정한 0..1 값. 같은 칸은 언제나 같은 값이다. */
function cellNoise(cell: number, seed: number): number {
  return fxRng((Math.imul(seed | 0, 0x2c1b3c6d) ^ Math.imul(cell | 0, 0x27d4eb2d)) >>> 0)();
}

/**
 * 붓 끝 가장자리의 가로 오프셋(px). `along` 은 가장자리를 따라간 거리(세로 마스크면 y)다.
 * 느린 두 물결에 잔털(값 잡음, 칸 사이는 부드럽게 잇는다)을 더해 |값| ≤ amplitudePx 를 지킨다.
 */
export function brushEdge(along: number, seed: number, amplitudePx = 5): number {
  const phase = ((seed * 0.618034) % 1) * Math.PI * 2;
  const wave = 0.55 * Math.sin(along * 0.11 + phase) + 0.3 * Math.sin(along * 0.37 + phase * 1.7);
  const cellPx = 3.5;
  const cell = Math.floor(along / cellPx);
  const t = along / cellPx - cell;
  const smooth = smoothstep01(t);
  const grain = lerp(cellNoise(cell, seed), cellNoise(cell + 1, seed), smooth) * 2 - 1;
  return amplitudePx * (wave + 0.15 * grain);
}

export interface InkWriteTiming {
  /** 외곽선이 끝까지 그어지는 시간. */
  readonly outlineMs: number;
  /** 채움이 외곽선을 쫓기 시작하는 지연. */
  readonly fillLagMs: number;
  /** 채움이 끝까지 칠해지는 시간. */
  readonly fillMs: number;
}

/** 펜선(외곽선)과 채색(채움)의 진행 0..1. 채움은 외곽선을 앞지르지 않고, 둘 다 되돌아가지 않는다. */
export function inkWriteStateAt(ms: number, timing: InkWriteTiming): { readonly outline: number; readonly fill: number } {
  const progress = (from: number, span: number): number => (span > 0 ? easeOutCubic(clamp01((ms - from) / span)) : ms >= from ? 1 : 0);
  const outline = progress(0, timing.outlineMs);
  return { outline, fill: Math.min(outline, progress(timing.fillLagMs, timing.fillMs)) };
}

/** 펜선·채색이 모두 끝나는 시각. */
export function inkWriteTotalMs(timing: InkWriteTiming): number {
  return Math.max(timing.outlineMs, timing.fillLagMs + timing.fillMs);
}

export interface SlamTiming {
  /** 큰 배율에서 착지(눌림)까지. 이 끝이 "쾅"의 순간이다. */
  readonly dropMs: number;
  /** 눌림에서 1 로 서는 시간(easeOutBack). */
  readonly settleMs: number;
  readonly fromScale: number;
  readonly fromAngleDeg: number;
  /** 착지 순간 반대로 살짝 젖히는 각. 서는 동안 0 으로 돌아온다. */
  readonly recoilDeg: number;
  readonly squashScale: number;
}

export interface SlamPose {
  readonly scale: number;
  readonly angleDeg: number;
  readonly alpha: number;
}

/**
 * 쾅 자세. 시작 전에는 보이지 않고, 떨어지는 동안 가속하며(ease-in) 커다란 배율·기울기에서 눌림까지 온 뒤,
 * easeOutBack 으로 1 에 선다. 끝나면 정확히 배율 1·각도 0·불투명이다.
 */
export function slamPoseAt(ms: number, timing: SlamTiming): SlamPose {
  const { dropMs, settleMs, fromScale, fromAngleDeg, recoilDeg, squashScale } = timing;
  if (!(ms > 0)) return { scale: fromScale, angleDeg: fromAngleDeg, alpha: 0 };
  if (ms < dropMs) {
    const p = ms / dropMs;
    const e = p * p;
    // 떨어지는 앞 40% 안에 완전히 보인다 — 큰 글자가 허공에서 번쩍 생겨 내리꽂힌다.
    return { scale: lerp(fromScale, squashScale, e), angleDeg: lerp(fromAngleDeg, recoilDeg, e), alpha: clamp01(p / 0.4) };
  }
  const q = settleMs > 0 ? (ms - dropMs) / settleMs : 1;
  if (q >= 1) return { scale: 1, angleDeg: 0, alpha: 1 };
  return { scale: lerp(squashScale, 1, easeOutBack(q)), angleDeg: recoilDeg * (1 - easeOutCubic(q)), alpha: 1 };
}

export interface PenStrokeTiming {
  /** 밑줄이 왼쪽에서 오른쪽으로 그어지는 시간. */
  readonly strokeMs: number;
  /** 다 그은 뒤 마름모가 금빛으로 튀어나오는 시간. */
  readonly popMs: number;
}

/** 밑줄 펜선 진행 0..1 과 마름모 팝 배율(0 → 살짝 넘침 → 1). 끝나면 둘 다 정확히 1. */
export function penStrokeStateAt(ms: number, timing: PenStrokeTiming): { readonly stroke: number; readonly pop: number } {
  const stroke = timing.strokeMs > 0 ? easeOutCubic(clamp01(ms / timing.strokeMs)) : ms >= 0 ? 1 : 0;
  const q = timing.popMs > 0 ? (ms - timing.strokeMs) / timing.popMs : ms >= timing.strokeMs ? 1 : 0;
  const pop = q <= 0 ? 0 : q >= 1 ? 1 : easeOutBack(q);
  return { stroke, pop };
}

/** 타자처럼 찍힐 글자 수. 공백은 다음 글자와 함께 찍혀 시간을 쓰지 않는다. */
export function typeGlyphCount(text: string): number {
  return [...text].filter((glyph) => glyph.trim() !== "").length;
}

/** `ms` 시점까지 찍힌 글자 수(첫 글자는 0ms 에 찍힌다). 시작 전 0. */
export function typedGlyphsAt(ms: number, charMs: number, count: number): number {
  if (ms < 0 || count <= 0) return 0;
  if (!(charMs > 0)) return count;
  return Math.min(count, Math.floor(ms / charMs) + 1);
}

/**
 * 8분음표(subdivision = 2) 같은 박자 격자에서 `startMs` 이후 첫 칸부터 `count` 칸의 시각.
 * 격자의 0 은 타이틀 곡이 시작하는 순간(타이틀 등장 시작)이다.
 */
export function beatGridMs(bpm: number, startMs: number, count: number, subdivision = 2): number[] {
  if (!(bpm > 0) || !(subdivision > 0) || count <= 0) return [];
  const step = 60_000 / bpm / subdivision;
  const first = Math.ceil(startMs / step - 1e-9);
  return Array.from({ length: count }, (_unused, index) => (first + index) * step);
}

/**
 * 반지름이 부드럽게 일렁이는 잉크 방울 윤곽(평평한 [x0, y0, x1, y1, …]). 낮은 차수 사인 세 겹이라
 * 모서리가 생기지 않는다. `stretchX` 로 가로로 늘인 웅덩이를 만들며, 늘인 만큼 꼭짓점을 늘려 끝이
 * 뾰족해지지 않는다(이웃 변 사이 꺾임 60° 미만).
 */
export function inkBlobPoints(cx: number, cy: number, radius: number, seed: number, steps = 28, stretchX = 1): number[] {
  const rng = fxRng(seed);
  const a = rng() * Math.PI * 2, b = rng() * Math.PI * 2, c = rng() * Math.PI * 2;
  const count = Math.ceil(steps * Math.max(1, stretchX));
  const points: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const theta = (index / count) * Math.PI * 2;
    const r = radius * (1 + 0.12 * Math.sin(3 * theta + a) + 0.05 * Math.sin(5 * theta + b) + 0.02 * Math.sin(7 * theta + c));
    points.push(cx + Math.cos(theta) * r * stretchX, cy + Math.sin(theta) * r);
  }
  return points;
}
