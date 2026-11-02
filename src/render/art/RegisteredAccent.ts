import { clamp01 } from "../../sim/geom";
import type { CityFightAwakeningSky } from "../view/CityFightAwakeningMotifView";

/**
 * 등록 선수의 강조색(2026-10-28 — 에이전트가 만든 선수의 각성기, `RegisteredAwakeningMotifs`): 그의 초상 얼굴 칸에서 고른 화소로 가장 많이 칠해진
 * 선명한 색상(색상환 12칸 중 채도×명도 무게가 가장 큰 칸)을 뽑아 밝힌다. 각성기의 하늘과 빛이 이 색이라 선수마다 다른 색으로 터진다.
 * 회색·흑백만 있는 초상은 null(호출 쪽이 `AWAKENING_COLORS.registered.accent`).
 */
export const REGISTERED_ACCENT = Object.freeze({
  /** A pixel counts when its alpha, saturation and value are at least these. */
  minAlpha: 0.5, minSaturation: 0.28, minValue: 0.25,
  /** Hue bins round the wheel. */
  bins: 12,
  /** The heaviest bin must hold this share of all the weight seen, else none is vivid enough. */
  minShare: 0.12,
  /** The accent: its saturation at least `saturation`, its value `value`. */
  saturation: 0.62, value: 1,
});

/** One sampled pixel (0..255 channels). */
export interface RegisteredAccentSample { readonly r: number; readonly g: number; readonly b: number; readonly a: number }

/** HSV of 0..255 RGB: hue 0..1, saturation 0..1, value 0..1. */
function hsv(r: number, g: number, b: number): readonly [number, number, number] {
  const R = r / 255, G = g / 255, B = b / 255, max = Math.max(R, G, B), min = Math.min(R, G, B), d = max - min;
  let h = 0;
  if (d > 1e-6) h = max === R ? ((G - B) / d + 6) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h / 6, max > 0 ? d / max : 0, max];
}

/** 0xRRGGBB of HSV (0..1 each). */
export function hsvColor(h: number, s: number, v: number): number {
  const f = (n: number) => {
    const k = (n + h * 6) % 6;
    return Math.round(255 * clamp01(v - v * s * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return f(5) << 16 | f(3) << 8 | f(1);
}

/** The accent of `samples` (0xRRGGBB), or null when none is vivid enough. */
export function registeredAccent(samples: readonly RegisteredAccentSample[]): number | null {
  const A = REGISTERED_ACCENT, weight = new Array<number>(A.bins).fill(0), x = new Array<number>(A.bins).fill(0),
    y = new Array<number>(A.bins).fill(0), sat = new Array<number>(A.bins).fill(0);
  let total = 0;
  for (const p of samples) {
    if (!(p.a / 255 >= A.minAlpha)) continue;
    const [h, s, v] = hsv(p.r, p.g, p.b);
    if (s < A.minSaturation || v < A.minValue) continue;
    const w = s * v, bin = Math.min(A.bins - 1, Math.floor(h * A.bins));
    weight[bin]! += w; total += w;
    // The bin's mean hue on the circle (a red bin straddles 0).
    x[bin]! += Math.cos(h * 2 * Math.PI) * w; y[bin]! += Math.sin(h * 2 * Math.PI) * w; sat[bin]! += s * w;
  }
  if (!(total > 0)) return null;
  let best = 0;
  for (let i = 1; i < A.bins; i++) if (weight[i]! > weight[best]!) best = i;
  if (weight[best]! / total < A.minShare) return null;
  const hue = ((Math.atan2(y[best]!, x[best]!) / (2 * Math.PI)) + 1) % 1;
  return hsvColor(hue, Math.max(A.saturation, sat[best]! / weight[best]!), A.value);
}

/** `color` (0xRRGGBB) with its value × `value` and its saturation × `saturation`. */
function shade(color: number, value: number, saturation = 1): number {
  const [h, s, v] = hsv(color >> 16 & 0xff, color >> 8 & 0xff, color & 0xff);
  return hsvColor(h, clamp01(s * saturation), clamp01(v * value));
}

/** The awakening's night in his colour: a deep dark of it, a brighter high, a cloud between, a pale star. */
export function registeredAccentSky(accent: number): CityFightAwakeningSky {
  return Object.freeze({ deep: shade(accent, 0.09), high: shade(accent, 0.42), cloud: shade(accent, 0.22), star: shade(accent, 1, 0.35) });
}

/** A pale, hot core of `accent` (its light's centre). */
export function registeredAccentHot(accent: number): number { return shade(accent, 1, 0.3); }
