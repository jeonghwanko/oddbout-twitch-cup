import { NATIVE_CITY_COMBAT, type NativeCityKumaActionKind, type NativeCityKumaGrade,
  type NativeCityTellsTuning } from "../../sim/cityFight/NativeCityCombatTuning";
import type { NativeCityFightSimEvent } from "../../sim/cityFight/NativeCityFightFrame";
import { clamp01 } from "../../sim/geom";
import { PALETTE } from "../art/palette";
import { easeOutBack, easeOutCubic, smoothstep01 } from "../art/easing";
import { mixColor } from "../art/ColorMix";
import { nativeCityKumaGradeColors } from "./NativeCityKumaGrade";
import { ellipsePoints, sparklePoints } from "./CombatFxShapes";
import type { FxPrim } from "./FxPrim";

/**
 * 쿠마가 다음에 낼 기술의 등급 표식(2026-10-14 재미 검증, json `feel.tells.gradeMark`): 이름표 위에 등급 색으로, HUD 잉크 외곽선을 둘러 세운다.
 * 2026-10-19(사용자 D3, docs/Plan/2026-10-19-kuma-read-reward)부터 모양은 **키캡**이고 그 위 글자가 그 색의 최선의 답 키다(흰 V·금 X·빨강 C,
 * 지금 바인딩 그대로 — `NATIVE_CITY_KUMA_GRADE_KEYCAP`). 앞서는 방패·꺾쇠·칼 아이콘이었다: 흰의 방패가 "막아라"와 상태 아이콘의 "쿠마 가드 중"을
 * 겸해 뜻이 둘이었고, 이제 흰의 최선의 답은 막기가 아니다. 색은 셋이 다르고, 모양 대신 키 글자가 색약에도 말한다. 레슨 카드
 * (`NativeCityFightLessonView`)가 같은 키캡을 쓴다. 상자 좌표는 HUD SVG 와 같은 32×36 이다.
 */

/** The keycap's box (the HUD SVG's viewBox). */
export const NATIVE_CITY_KUMA_GRADE_ICON_BOX = Object.freeze({ width: 32, height: 36 });
const ICON_BOX = NATIVE_CITY_KUMA_GRADE_ICON_BOX;

/** The outline's eight steps round the icon (unit length). */
const OUTLINE_STEPS: readonly (readonly [number, number])[] = Object.freeze(Array.from({ length: 8 }, (_, i) =>
  Object.freeze([Math.cos(i * Math.PI / 4), Math.sin(i * Math.PI / 4)] as const)));

/** One frame of the mark: its grade, where its centre stands (world px), its age (screen ms) and the body scale it is drawn at. */
export interface NativeCityKumaGradeMark {
  readonly grade: NativeCityKumaGrade;
  readonly at: readonly [number, number];
  readonly ageMs: number;
  /** × `sizePx` (1 = the recipe's size). */
  readonly scale: number;
  readonly reducedMotion: boolean;
  /**
   * The keycap's face instead of the grade's colour — the string's link window draws its V keycap in the "attack now" magenta
   * (`PALETTE.fightAttackNow`, 2026-10-19 신호 정리: the white grade's pearl keycap read as a white swing coming). Absent: the grade's.
   */
  readonly color?: number;
  /**
   * The badge is ending (2026-10-20, `gradeMark.resolve`): `ageMs` then counts screen ms from the answer and the badge is drawn on the
   * resolve curve (`nativeCityKumaGradeMarkResolve`) instead of the pop-in. Absent: the live badge.
   */
  readonly outcome?: NativeCityKumaGradeMarkOutcome;
}


export type NativeCityKumaGradeMarkOutcome = "best" | "safe";

type ResolveTuning = NativeCityTellsTuning["gradeMark"]["resolve"];

/** The mark's colour (the icon's fill): the grade's strong inner flame colour — pearl, gold, alarm red. */
export function nativeCityKumaGradeMarkColor(grade: NativeCityKumaGrade): number {
  return nativeCityKumaGradeColors(grade).inner[0];
}

/** Its pop: the size multiplier (from `startScale` down to 1 over `popMs`) and opacity at `ageMs`; still and whole under reduced motion. */
export function nativeCityKumaGradeMarkPop(ageMs: number, reducedMotion: boolean,
  t: NativeCityTellsTuning["gradeMark"] = NATIVE_CITY_COMBAT.feel.tells.gradeMark): { readonly size: number; readonly alpha: number } {
  if (reducedMotion || !(t.popMs > 0)) return { size: 1, alpha: 1 };
  const u = clamp01(Math.max(0, ageMs) / t.popMs);
  return { size: t.startScale + (1 - t.startScale) * easeOutBack(u), alpha: clamp01(u * 2) };
}

/** A rounded rectangle in the icon box (x0, y0)-(x1, y1), corner radius `r`, as one convex polygon (six steps a corner). */
function roundedBox(x0: number, y0: number, x1: number, y1: number, r: number): number[] {
  const out: number[] = [], corners: readonly (readonly [number, number, number])[] = [[x1 - r, y0 + r, -0.25], [x1 - r, y1 - r, 0],
    [x0 + r, y1 - r, 0.25], [x0 + r, y0 + r, 0.5]];
  for (const [cx, cy, start] of corners) for (let i = 0; i <= 6; i += 1) {
    const a = (start + i / 24) * Math.PI * 2;
    out.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return out;
}

/**
 * The over-head badge since 2026-10-19 (사용자 D3, docs/Plan/2026-10-19-kuma-read-reward): a KEYCAP in the grade's colour — its best answer's
 * key (white V, gold X, red C as bound now) is lettered on its face by the view (`nativeCityKumaGradeKeycapLetter`). The cap's face and its
 * darker side (the key's depth) in the box.
 */
export const NATIVE_CITY_KUMA_GRADE_KEYCAP = Object.freeze({
  face: Object.freeze(roundedBox(2, 3, 30, 29, 6)),
  side: Object.freeze(roundedBox(2, 7, 30, 33, 6)),
  /** The letter's centre and height in the box. */
  letter: Object.freeze({ x: 16, y: 16.5, height: 19 }),
});

/**
 * One frame of the badge's answer (2026-10-20, json `gradeMark.resolve`) on the screen clock — `ageMs` from the answer's own frame; null once
 * it is gone. `size` × the badge, `alpha`, `bright` (0..1 of the way to its light tint), `glow` (0..1 of `glowAlpha`), `press` (0..1 of
 * `pressTravel` — the face down on its side, a key held down) and `bits` (the pearls' life 0..1, null when none fly). BEST: pressed in at
 * once (`pressScale`, `pressMs`), popped (to `popScale` over `popMs`, brightening, the glow up, the face back up, the pearls flying from
 * the pop), dissolved (on to `fadeScale`, gone over `fadeMs`). SAFE: `safeFadeMs` of fading, nothing else. Reduced motion (best): no
 * press, scale or pearls — bright at once for `reducedFlashMs`, then fading over `reducedFadeMs`.
 */
export function nativeCityKumaGradeMarkResolve(outcome: NativeCityKumaGradeMarkOutcome, ageMs: number, reducedMotion: boolean,
  t: ResolveTuning = NATIVE_CITY_COMBAT.feel.tells.gradeMark.resolve): { readonly size: number; readonly alpha: number; readonly bright: number;
  readonly glow: number; readonly press: number; readonly bits: number | null } | null {
  const age = Math.max(0, Number.isFinite(ageMs) ? ageMs : 0);
  if (outcome === "safe") {
    const fade = Math.max(0, t.safeFadeMs);
    return age >= fade ? null : { size: 1, alpha: 1 - age / fade, bright: 0, glow: 0, press: 0, bits: null };
  }
  if (reducedMotion) {
    const flash = Math.max(0, t.reducedFlashMs), fade = Math.max(1, t.reducedFadeMs);
    if (age >= flash + fade) return null;
    const v = age < flash ? 0 : (age - flash) / fade;
    return { size: 1, alpha: 1 - v, bright: 1, glow: 1 - v, press: 0, bits: null };
  }
  const press = Math.max(0, t.pressMs), pop = Math.max(1, t.popMs), fade = Math.max(1, t.fadeMs);
  if (age >= press + pop + fade) return null;
  // The key goes down on the answer's own frame (a key does not ease into its press) and stays down `pressMs`.
  if (age < press) return { size: t.pressScale, alpha: 1, bright: 0, glow: 0, press: 1, bits: null };
  const bits = (age - press) / (pop + fade);
  if (age < press + pop) {
    const e = easeOutCubic((age - press) / pop);
    return { size: t.pressScale + (t.popScale - t.pressScale) * e, alpha: 1, bright: e, glow: e, press: 1 - e, bits };
  }
  const v = (age - press - pop) / fade;
  return { size: t.popScale + (t.fadeScale - t.popScale) * easeOutCubic(v), alpha: 1 - smoothstep01(v), bright: 1, glow: 1 - v, press: 0, bits };
}

/**
 * A grade's light tint (the best answer's brightening, `resolve.brighten` of the way): the pearl and the red toward ivory, the gold toward its
 * hot gold (gold stays the gold grade's). Never pure white — that is the finisher's core — and never the "attack now" magenta: the string's
 * link keycap brightens to the WHITE grade's tint (its key's grade), out of its magenta (magenta is "act now", success is not).
 */
export function nativeCityKumaGradeMarkLight(grade: NativeCityKumaGrade, t: ResolveTuning = NATIVE_CITY_COMBAT.feel.tells.gradeMark.resolve): number {
  return mixColor(nativeCityKumaGradeMarkColor(grade), grade === "gold" ? PALETTE.hotGold : PALETTE.nativeCityExchangeIvory, clamp01(t.brighten));
}

/** This frame's drawing values: the pop-in for a live badge, the resolve curve for an ending one (null: not drawn). */
function markFrame(mark: NativeCityKumaGradeMark, t: NativeCityTellsTuning["gradeMark"]) {
  if (mark.outcome) return nativeCityKumaGradeMarkResolve(mark.outcome, mark.ageMs, mark.reducedMotion, t.resolve);
  const pop = nativeCityKumaGradeMarkPop(mark.ageMs, mark.reducedMotion, t);
  return { size: pop.size, alpha: pop.alpha, bright: 0, glow: 0, press: 0, bits: null };
}

/** The key's travel in the box: its face down onto its side (the side's lip under the face). */
const KEY_TRAVEL = 4;

/**
 * The badge's prims (burst layer, over the fighters): the keycap's ink outline (eight copies `outlinePx` round it), its side, its face. An
 * ending badge (`outcome`, 2026-10-20) has its glow behind (the grade's glint colour) and, from the pop, its pearls round it.
 */
export function nativeCityKumaGradeMarkPrims(mark: NativeCityKumaGradeMark,
  t: NativeCityTellsTuning["gradeMark"] = NATIVE_CITY_COMBAT.feel.tells.gradeMark): FxPrim[] {
  const frame = markFrame(mark, t);
  if (!frame) return [];
  const h = t.sizePx * mark.scale * frame.size, alpha = frame.alpha;
  if (!(h > 0) || alpha <= 0.004) return [];
  const [x, y] = mark.at, outline = t.outlinePx * mark.scale * frame.size;
  const base = mark.color ?? nativeCityKumaGradeMarkColor(mark.grade);
  const color = frame.bright > 0 ? mixColor(base, nativeCityKumaGradeMarkLight(mark.grade, t.resolve), clamp01(frame.bright)) : base;
  const k = h / ICON_BOX.height, ox = x - ICON_BOX.width / 2 * k, oy = y - ICON_BOX.height / 2 * k, drop = frame.press * t.resolve.pressTravel * KEY_TRAVEL;
  const place = (shape: readonly number[], dy = 0) => shape.map((v, i) => i % 2 === 0 ? ox + v * k : oy + (v + dy) * k);
  const face = place(NATIVE_CITY_KUMA_GRADE_KEYCAP.face, drop), side = place(NATIVE_CITY_KUMA_GRADE_KEYCAP.side);
  const out: FxPrim[] = [];
  const glow = frame.glow * t.resolve.glowAlpha * alpha;
  if (glow > 0.004) out.push({ kind: "light", x, y, radius: t.resolve.glowPx * mark.scale * frame.size, color: nativeCityKumaGradeColors(mark.grade).glint, alpha: glow });
  for (const [dx, dy] of OUTLINE_STEPS) for (const points of [side, face]) {
    out.push({ kind: "poly", points: points.map((v, i) => v + (i % 2 === 0 ? dx : dy) * outline), color: PALETTE.navyInk, alpha, additive: false });
  }
  out.push({ kind: "poly", points: side, color: mixColor(color, PALETTE.navyInk, 0.45), alpha, additive: false });
  out.push({ kind: "poly", points: face, color, alpha, additive: false });
  if (frame.bits !== null) out.push(...gradeMarkBits(x, y, t.sizePx * mark.scale, frame.bits, t));
  return out;
}

/**
 * The best answer's pearls (2026-10-20): `resolve.bits` small bits thrown from the keycap's rim across its upper half, rising and spreading
 * `bitTravelPx` as they shrink and fade over their `life` (0..1) — round pearls and soft four-point sparkles in turn (curved shapes, no
 * gems — `CombatFxShapes`), pearl and ivory, each over a navy ink rim like the badge. Fixed directions: the same answer looks the same.
 */
function gradeMarkBits(x: number, y: number, sizePx: number, life: number, t: NativeCityTellsTuning["gradeMark"]): FxPrim[] {
  const r = t.resolve, n = Math.max(0, Math.floor(r.bits)), u = clamp01(life), out: FxPrim[] = [];
  const fade = (1 - u) * (1 - u), grow = 1 - 0.55 * u, k = sizePx / Math.max(1e-6, t.sizePx), travel = r.bitTravelPx * k * easeOutCubic(u);
  if (n === 0 || fade <= 0.004) return out;
  const ink = Math.max(0.75, t.outlinePx * 0.5 * k);
  for (let i = 0; i < n; i += 1) {
    // Across the upper half (-170°..-10°), every other one a little shorter: they rise and spread like a spray of light.
    const a = -Math.PI / 2 + (n > 1 ? i / (n - 1) - 0.5 : 0) * Math.PI * 0.89, reach = i % 2 === 0 ? 1 : 0.72;
    const from = sizePx * 0.42 + travel * reach;
    const bx = x + Math.cos(a) * from, by = y + Math.sin(a) * from - 0.25 * travel;
    const size = r.bitPx * k * grow;
    if (i % 2 === 0) {
      out.push({ kind: "poly", points: ellipsePoints(bx, by, size + ink, size + ink, 10), color: PALETTE.navyInk, alpha: fade, additive: false });
      out.push({ kind: "poly", points: ellipsePoints(bx, by, size, size, 10), color: PALETTE.pearl, alpha: fade, additive: false });
    } else {
      const arm = size * 2;
      out.push({ kind: "poly", points: sparklePoints(bx, by, arm + ink * 1.6, arm + ink * 1.6, 0.3), color: PALETTE.navyInk, alpha: fade, additive: false });
      out.push({ kind: "poly", points: sparklePoints(bx, by, arm, arm, 0.3), color: PALETTE.nativeCityExchangeIvory, alpha: fade, additive: false });
    }
  }
  return out;
}

/**
 * Where the keycap's letter stands this frame (world px): its centre, its height and opacity (the badge's pop, or its answer — riding the
 * press and the pop, fading with the cap) — null when the badge is not drawn.
 */
export function nativeCityKumaGradeKeycapLetter(mark: NativeCityKumaGradeMark,
  t: NativeCityTellsTuning["gradeMark"] = NATIVE_CITY_COMBAT.feel.tells.gradeMark): { readonly x: number; readonly y: number;
  readonly heightPx: number; readonly alpha: number } | null {
  const frame = markFrame(mark, t);
  if (!frame) return null;
  const h = t.sizePx * mark.scale * frame.size;
  if (!(h > 0) || frame.alpha <= 0.004) return null;
  const k = h / ICON_BOX.height, letter = NATIVE_CITY_KUMA_GRADE_KEYCAP.letter, drop = frame.press * t.resolve.pressTravel * KEY_TRAVEL;
  return { x: mark.at[0] + (letter.x - ICON_BOX.width / 2) * k, y: mark.at[1] + (letter.y + drop - ICON_BOX.height / 2) * k, heightPx: letter.height * k,
    alpha: frame.alpha };
}

/** What the badge showed last frame, for reading the fight's events against it (`nativeCityKumaGradeMarkAnswer`). */
export interface NativeCityKumaGradeMarkShown {
  readonly grade: NativeCityKumaGrade;
  /** The move behind it (his attack clock's action; null for none — the dash, a wake-up tell). */
  readonly action: NativeCityKumaActionKind | null;
  /** The string's link keycap (`linkWindow`, V) rather than a grade badge. */
  readonly link: boolean;

  readonly linkV: boolean;

  readonly foeId: string;
}


export function nativeCityKumaGradeMarkAnswer(event: NativeCityFightSimEvent, shown: NativeCityKumaGradeMarkShown,
  best: Readonly<Record<NativeCityKumaGrade, string>> = NATIVE_CITY_COMBAT.triangle.best): "best" | "taken" | null {
  switch (event.kind) {
    case "struckBy": case "grabbed": return event.enemy === shown.foeId ? "taken" : null;
    case "guardBroken": return "taken";
    default: break;
  }
  if (shown.link) {
    if (event.kind !== "kumaLanded" || event.taken.armored || event.taken.blocked) return null;
    return event.taken.knockdown || shown.linkV && (event.taken.broke || event.taken.defeated) ? "best" : null;
  }
  switch (best[shown.grade]) {
    case "counter": return event.kind === "parried" && event.counter === true ? "best" : null;
    case "evade": return event.kind === "chanceOpened" && event.chance === "dodge" ? "best" : null;
    case "cut": return event.kind === "kumaLanded" && shown.action === "grab" && event.taken.staggered && !event.taken.armored ? "best" : null;
    default: return null;
  }
}

/** One frame of V's counter gauge round the badge (`feel.tells.counterGauge`, `kuma.rhythm.counter`): its centre (world px) and state. */
export interface NativeCityKumaCounterGauge {
  readonly at: readonly [number, number];
  /** 0..1 over his windup; 1 in the window. */
  readonly fill: number;
  /** The window: V now is the counter. */
  readonly open: boolean;
  /** The string's link (2026-10-19): an open ring that shows `fill` — the window left, draining — instead of the whole ring. */
  readonly draining?: boolean;
  /** Screen ms (the window's glow breathes on it). */
  readonly timeMs: number;
  readonly scale: number;
  readonly reducedMotion: boolean;
}

/** The ring's steps round a full turn (each one a convex quad). */
const RING_STEPS = 36;

/** One band of the ring from `from` to `to` (turns, 0 = the top, clockwise) between radii `inner` and `outer`, as convex quads. */
function ringBand(out: FxPrim[], x: number, y: number, inner: number, outer: number, from: number, to: number, color: number, alpha: number): void {
  if (!(to > from) || !(outer > inner) || alpha <= 0.004) return;
  const steps = Math.max(1, Math.ceil((to - from) * RING_STEPS));
  const at = (turn: number, r: number) => [x + Math.sin(turn * Math.PI * 2) * r, y - Math.cos(turn * Math.PI * 2) * r] as const;
  for (let i = 0; i < steps; i += 1) {
    const a = from + (to - from) * i / steps, b = from + (to - from) * (i + 1) / steps;
    out.push({ kind: "poly", points: [...at(a, outer), ...at(b, outer), ...at(b, inner), ...at(a, inner)], color, alpha, additive: false });
  }
}

/**
 * V's counter gauge (2026-10-18 손맛 2단계, json `feel.tells.counterGauge`): a ring round the grade badge, drawn like the village HUD — a thin
 * navy ink track, the arc filling clockwise from the top (navy 1 px outline round it) — and, full (the window), the whole ring with a soft
 * light breathing behind it (still under reduced motion). Its colour is "attack now" (`PALETTE.fightAttackNow`, 2026-10-19 D4 — it was white
 * filling, gold full: the white arc sank into the pearl badge and the gold meant four things).
 */
export function nativeCityKumaCounterGaugePrims(gauge: NativeCityKumaCounterGauge,
  t: NativeCityTellsTuning["counterGauge"] = NATIVE_CITY_COMBAT.feel.tells.counterGauge): FxPrim[] {
  const k = Math.max(0, gauge.scale), r = t.radiusPx * k, band = t.bandPx * k, line = Math.max(0.5, t.outlinePx * k);
  if (!(r > 0) || !(band > 0)) return [];
  const [x, y] = gauge.at, fill = gauge.open && gauge.draining !== true ? 1 : clamp01(gauge.fill), out: FxPrim[] = [];
  const inner = r - band / 2, outer = r + band / 2;
  if (gauge.open) {
    const breath = gauge.reducedMotion || !(t.pulseMs > 0) ? 1 : 0.75 + 0.25 * Math.cos(gauge.timeMs / t.pulseMs * Math.PI * 2);
    out.push({ kind: "light", x, y, radius: t.glowPx * k, color: PALETTE.fightAttackNow, alpha: 0.55 * breath });
  }
  // The track (the part still to fill): a thin ink line on the ring's centre.
  ringBand(out, x, y, r - line / 2, r + line / 2, fill, 1, PALETTE.navyInk, 0.7);
  // The filled arc: its ink outline, then the "attack now" band (full in the window).
  ringBand(out, x, y, inner - line, outer + line, 0, fill, PALETTE.navyInk, 1);
  ringBand(out, x, y, inner, outer, 0, fill, PALETTE.fightAttackNow, 1);
  return out;
}
