/**
 * 샹들리에 줄타기의 손맛 — 던짐·물림·잡음·놓음 네 박자의 순수 레시피.
 *
 * 문법은 Pixel Composer 쇼케이스 "Icicle"(MakhamDev, 2026-09)에서 가져왔다.
 * 작은 예고 → 엇박으로 솟는 가시 → 흰 한 프레임 → 짧은 멈춤 → 네모 조각으로 부서져
 * 단계 팔레트를 밟으며 식는다. 색만 얼음이 아니라 촛불과 샹들리에 크리스털이고,
 * 흰 한 프레임은 괴도의 것 — 열쇠구멍이 번쩍 뜬 뒤 자물쇠처럼 좌우로 갈라진다.
 *
 * 단단한 조각은 5단 팔레트를 계단식으로 밟아 회화 배경 위에서도 번지지 않고 끊기며
 * 2px 격자에 붙는다. 빛만은 부드러운 가산광(`FxLight`)이다 — 딱딱한 다각형 빛은
 * 베이지 판자로 읽힌다(2026-09-24 이펙트 리뷰).
 *
 * 게임(Phaser)·효과 실험실(`fx-lab.html`)·시트 CLI(`tools/fx/rope-fx-sheet.mjs`)가 같은
 * 레시피를 읽어, 실험실에서 본 프레임과 게임 프레임이 같은 도형이 되게 한다. CLI 가 node 로
 * 직접 읽으므로 import 는 자기 import 가 없는 모듈(`art/palette`·`art/easing`)만, `.ts`
 * 확장자를 붙여 가져온다. 모든 요소는 태어난 시각과 시드만으로 정해지므로 임의 시각을
 * 되감아 그릴 수 있다.
 */

import { easeOutBack, easeOutCubic } from "../art/easing.ts";
import { PALETTE } from "../art/palette.ts";
import { FX_GRID_PX, fxGridPoly, fxSnap, type FxPoint, type FxPrim, type FxPolyPrim } from "./FxPrim.ts";
import { fxRng } from "./FxRandom.ts";

export const ROPE_FX_INK = PALETTE.paperInk;
/** 예고장 종이와 밀랍. */
export const ROPE_FX_CARD = Object.freeze({ paper: PALETTE.paper, edge: 0xc9b58c, wax: 0xa8323a });

/** 밝음 → 식음 5단. 0 번은 흰 한 프레임에만 쓴다. */
export const ROPE_FX_RAMPS = Object.freeze({
  warm: Object.freeze<number[]>([PALETTE.fxWarmCream, PALETTE.hotGold, PALETTE.fxWarmGold, PALETTE.fxWarmAmber, PALETTE.fxWarmSienna]),
  /** 크리스털 반짝임. 따뜻한 조각 사이에 드물게 섞어야 금빛이 더 금빛으로 읽힌다. */
  cool: Object.freeze([PALETTE.white, 0xe6f7ff, 0xa9dcf0, 0x6ea7c8, 0x3d6484]),
});
export type RopeFxRamp = keyof typeof ROPE_FX_RAMPS;

export interface RopeFxTuning {
  readonly gravityPx: number;
  readonly throwFx: {
    readonly starPx: number;
    readonly crescentPx: number;
    readonly trailEveryMs: number;
    readonly trailLifeMs: number;
    readonly shedEveryMs: number;
  };
  readonly latch: {
    readonly keyholePx: number;
    readonly starPx: number;
    readonly starMs: number;
    readonly lightPx: number;
    readonly spikes: number;
    readonly spikeLengthPx: readonly [number, number];
    readonly heroSpikePx: number;
    readonly spikeStaggerMs: number;
    readonly spikeGrowMs: number;
    readonly spikeHoldMs: number;
    readonly ringPx: number;
    readonly ringMs: number;
    readonly chips: number;
    readonly chipSpeed: readonly [number, number];
    /** 당기는 동안 샹들리에에서 털려 떨어지는 크리스털. */
    readonly rainEveryMs: number;
    readonly rainForMs: number;
  };
  readonly grip: { readonly starPx: number; readonly ringPx: number; readonly chips: number };
  readonly reel: { readonly sparkEveryMs: number; readonly streakEveryMs: number };
  readonly swing: {
    readonly streakEveryMs: number;
    readonly streakMinSpeedPx: number;
    readonly emberEveryMs: number;
    readonly ghostEveryMs: number;
    readonly ghostLifeMs: number;
    readonly ghostMinSpeedPx: number;
    /** 이 위상부터 사슬을 타고 차가운 반짝임이 오른다 — "곧이다" 예고. */
    readonly readyProgress: number;
    readonly readyEveryMs: number;
    /** 이 위상 이상에서 놓으면 "완벽한 도약". 판정은 바꾸지 않고 연출만 한 단 올린다. */
    readonly perfectProgress: number;
    /**
     * 완벽 구간의 끝. 떨어질 도약을 "완벽" 이라 부르면 안 되므로 sim 이 실제로 창에 닿는
     * 위상까지만 연다. 2026-09-24 `plannedRelease` 로 꼭짓점(1)까지 착지가 보장돼 1 이다.
     */
    readonly perfectEndProgress: number;
    readonly pulseEveryMs: number;
  };
  readonly release: {
    readonly starPx: number;
    readonly ringPx: number;
    readonly chips: number;
    readonly perfectSpikes: number;
    readonly perfectChips: number;
    readonly perfectTrailEveryMs: number;
  };
  readonly twang: { readonly amplitudePx: number; readonly periodMs: number; readonly decayMs: number };
}

export const ROPE_FX_TUNING: RopeFxTuning = {
  gravityPx: 560,
  throwFx: { starPx: 10, crescentPx: 16, trailEveryMs: 16, trailLifeMs: 120, shedEveryMs: 48 },
  latch: {
    keyholePx: 30, starPx: 18, starMs: 150, lightPx: 34,
    spikes: 7, spikeLengthPx: [12, 24], heroSpikePx: 38,
    spikeStaggerMs: 12, spikeGrowMs: 70, spikeHoldMs: 150,
    ringPx: 36, ringMs: 200,
    chips: 8, chipSpeed: [110, 240],
    rainEveryMs: 60, rainForMs: 240,
  },
  grip: { starPx: 11, ringPx: 18, chips: 6 },
  reel: { sparkEveryMs: 30, streakEveryMs: 40 },
  swing: {
    streakEveryMs: 50, streakMinSpeedPx: 160, emberEveryMs: 90,
    ghostEveryMs: 70, ghostLifeMs: 120, ghostMinSpeedPx: 230,
    readyProgress: 0.66, readyEveryMs: 45,
    perfectProgress: 0.82, perfectEndProgress: 1, pulseEveryMs: 90,
  },
  release: { starPx: 12, ringPx: 24, chips: 8, perfectSpikes: 6, perfectChips: 12, perfectTrailEveryMs: 30 },
  twang: { amplitudePx: 9, periodMs: 70, decayMs: 180 },
};

// ── 요소 ─────────────────────────────────────────────────────────────

interface FxBase {
  readonly bornMs: number;
  readonly lifeMs: number;
}

/** 네모(또는 마름모) 조각. 닫힌 식의 탄도라 어느 시각이든 바로 그린다. */
export interface FxChip extends FxBase {
  readonly kind: "chip";
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly gravity: number;
  readonly drag: number;
  readonly cells: number;
  readonly ramp: RopeFxRamp;
  /** 팔레트 몇 번째 칸에서 식기 시작하는가. 0 이면 흰색부터. */
  readonly rampFrom: number;
  readonly twinkle: boolean;
  readonly diamond: boolean;
}

/** 네 갈래 반짝임. 첫 프레임에 이미 가장 크다 — 임팩트는 자라지 않는다. */
export interface FxStar extends FxBase {
  readonly kind: "star";
  readonly x: number;
  readonly y: number;
  readonly sizePx: number;
  readonly angle: number;
  readonly ramp: RopeFxRamp;
}

/** 퍼지는 다각형 고리. 4 변이면 보석 단면(마름모)이다. */
export interface FxRing extends FxBase {
  readonly kind: "ring";
  readonly x: number;
  readonly y: number;
  readonly fromPx: number;
  readonly toPx: number;
  readonly sides: number;
  readonly angle: number;
  readonly thicknessPx: number;
  /** 세로 눌림. 1 이면 정다각형, 착지 먼지는 납작하게. */
  readonly squash: number;
  readonly ramp: RopeFxRamp;
}

/** Icicle 의 가시. 두 면(밝은 면·그늘 면)으로 나뉜 크리스털 프리즘. */
export interface FxSpike extends FxBase {
  readonly kind: "spike";
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly offsetPx: number;
  readonly lengthPx: number;
  readonly widthPx: number;
  readonly growMs: number;
  readonly shine: boolean;
  readonly ramp: RopeFxRamp;
}

/** 던지는 손끝의 초승달. 진행 방향으로 볼록하다. */
export interface FxCrescent extends FxBase {
  readonly kind: "crescent";
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly radiusPx: number;
  readonly thicknessPx: number;
}

/** 속도선 한 가닥. `hot` 이면 흰색에서 시작하는 번짐선. */
export interface FxStreak extends FxBase {
  readonly kind: "streak";
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly lengthPx: number;
  readonly speed: number;
  readonly widthPx?: number;
  readonly hot?: boolean;
}

/** 부드러운 가산 빛. 조각과 달리 계단 없이 꺼진다. */
export interface FxGlow extends FxBase {
  readonly kind: "glow";
  readonly x: number;
  readonly y: number;
  readonly radiusPx: number;
  readonly alpha: number;
  readonly color: number;
}

/** 물림의 흰 한 프레임. 열쇠구멍이 번쩍 뜨고, 자물쇠가 풀리듯 좌우로 갈라져 식는다. */
export interface FxKeyhole extends FxBase {
  readonly kind: "keyhole";
  readonly x: number;
  readonly y: number;
  readonly sizePx: number;
}

/** 완벽한 놓음에 떨어뜨리는 예고장. 뒤집히며(폭이 접혔다 펴지며) 떨어진다. */
export interface FxCard extends FxBase {
  readonly kind: "card";
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly angle: number;
  readonly spin: number;
  readonly flipHz: number;
}

export type FxElement = FxChip | FxStar | FxRing | FxSpike | FxCrescent | FxStreak | FxGlow | FxKeyhole | FxCard;

// ── 난수·이징 ───────────────────────────────────────────────────────

const between = (rng: () => number, lo: number, hi: number): number => lo + (hi - lo) * rng();
const rampColor = (ramp: RopeFxRamp, step: number): number =>
  ROPE_FX_RAMPS[ramp][Math.max(0, Math.min(4, Math.floor(step)))]!;

// ── 그리기 ──────────────────────────────────────────────────────────

/**
 * 살아 있는 요소를 `nowMs` 시각의 도형으로 푼다. 태어나기 전·죽은 뒤는 그리지 않는다.
 *
 * 순서가 곧 판독이다: 빛 → 고리 → 가시 윤곽 → 가시 몸 → 초승달·속도선 → 별 → 열쇠구멍
 * → 예고장 → 조각. 가시 윤곽을 먼저 다 깔아야 이웃 가시의 잉크가 별 한가운데에 구멍을 내지 않는다.
 */
export function drawRopeFx(elements: readonly FxElement[], nowMs: number, out: FxPrim[] = []): FxPrim[] {
  const pass = (kinds: readonly FxElement["kind"][], fn: (element: FxElement, age: number, u: number) => void): void => {
    for (const element of elements) {
      if (!kinds.includes(element.kind)) continue;
      const age = nowMs - element.bornMs;
      if (age < 0 || age >= element.lifeMs) continue;
      fn(element, age, age / element.lifeMs);
    }
  };
  pass(["glow"], (e, _a, u) => drawGlow(e as FxGlow, u, out));
  pass(["ring"], (e, _a, u) => drawRing(e as FxRing, u, out));
  pass(["spike"], (e, a) => drawSpike(e as FxSpike, a, "outline", out));
  pass(["spike"], (e, a, u) => drawSpike(e as FxSpike, a, "body", out, u));
  pass(["crescent"], (e, _a, u) => drawCrescent(e as FxCrescent, u, out));
  pass(["streak"], (e, a, u) => drawStreak(e as FxStreak, a, u, out));
  pass(["star"], (e, _a, u) => drawStar(e as FxStar, u, out));
  pass(["keyhole"], (e, _a, u) => drawKeyhole(e as FxKeyhole, u, out));
  pass(["card"], (e, a, u) => drawCard(e as FxCard, a, u, out));
  pass(["chip"], (e, a, u) => drawChip(e as FxChip, a, u, out));
  return out;
}

/** 수명이 다한 요소를 걸러낸다. 태어나기 전인 것은 남긴다. */
export function pruneRopeFx(elements: readonly FxElement[], nowMs: number): FxElement[] {
  return elements.filter((element) => nowMs < element.bornMs + element.lifeMs);
}

/** 이 요소 묶음이 전부 꺼지는 시각. 시트 CLI 가 몇 프레임을 뽑을지 여기서 정한다. */
export function ropeFxEndMs(elements: readonly FxElement[]): number {
  return elements.reduce((end, element) => Math.max(end, element.bornMs + element.lifeMs), 0);
}

function square(cx: number, cy: number, size: number, color: number): FxPolyPrim {
  const x = fxSnap(cx - size / 2);
  const y = fxSnap(cy - size / 2);
  return { kind: "poly", points: [x, y, x + size, y, x + size, y + size, x, y + size], color, alpha: 1, additive: false };
}

const rotated = (x: number, y: number, angle: number, local: readonly number[]): number[] => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const points: number[] = [];
  for (let i = 0; i < local.length; i += 2) points.push(x + local[i]! * c - local[i + 1]! * s, y + local[i]! * s + local[i + 1]! * c);
  return points;
};

/** 선형 항력 + 중력의 닫힌 해. 프레임 누적이 없어 되감아도 같은 자리다. */
export function ropeFxChipAt(chip: FxChip, ageMs: number): FxPoint {
  const a = ageMs / 1000;
  const k = chip.drag;
  const f = k > 0 ? (1 - Math.exp(-k * a)) / k : a;
  const fall = k > 0 ? chip.gravity * (a - f) / k : 0.5 * chip.gravity * a * a;
  return { x: chip.x + chip.vx * f, y: chip.y + chip.vy * f + fall };
}

function drawChip(chip: FxChip, age: number, u: number, out: FxPrim[]): void {
  const at = ropeFxChipAt(chip, age);
  const step = chip.rampFrom + u * (5 - chip.rampFrom);
  if (step >= 5) return;
  const g = FX_GRID_PX;
  const cells = u > 0.65 ? Math.max(1, chip.cells - 1) : chip.cells;
  const size = cells * g;
  // 반짝이는 조각은 세 박자에 한 번 + 모양으로 번쩍인다. Icicle 잔해의 깜빡임.
  if (chip.twinkle && step < 3 && Math.floor(age / 60) % 3 === 0) {
    const color = rampColor(chip.ramp, 0);
    out.push(square(at.x, at.y, g, color));
    out.push(square(at.x - g, at.y, g, color), square(at.x + g, at.y, g, color));
    out.push(square(at.x, at.y - g, g, color), square(at.x, at.y + g, g, color));
    return;
  }
  const color = rampColor(chip.ramp, step);
  if (chip.diamond && size >= 2 * g) {
    const h = size * 0.75;
    out.push(fxGridPoly([at.x, at.y - h, at.x + h, at.y, at.x, at.y + h, at.x - h, at.y], color));
    return;
  }
  out.push(square(at.x, at.y, size, color));
}

function starPoints(x: number, y: number, arm: number, waist: number, angle: number): number[] {
  return rotated(x, y, angle, [0, -arm, waist, -waist, arm, 0, waist, waist, 0, arm, -waist, waist, -arm, 0, -waist, -waist]);
}

function drawStar(star: FxStar, u: number, out: FxPrim[]): void {
  // 첫 프레임에 이미 110% — 임팩트는 자라지 않고 "터진다". 이후 꼬리를 끌며 줄어든다.
  const hold = 0.15;
  const arm = u < hold ? star.sizePx * 1.1 : star.sizePx * (1 - (u - hold) / (1 - hold)) ** 1.4;
  if (arm < FX_GRID_PX) return;
  const waist = Math.max(FX_GRID_PX * 0.75, arm * 0.17);
  const g = FX_GRID_PX;
  const step = u < 0.35 ? 0 : u < 0.6 ? 1 : 2;
  // 잉크 윤곽은 흰 동안만. 식은 별에 윤곽이 남으면 구멍 뚫린 문양으로 읽힌다.
  if (step === 0 && arm >= 4 * g) out.push(fxGridPoly(starPoints(star.x, star.y, arm + g, waist + g, star.angle), ROPE_FX_INK));
  out.push(fxGridPoly(starPoints(star.x, star.y, arm, waist, star.angle), rampColor(star.ramp, step)));
}

function drawRing(ring: FxRing, u: number, out: FxPrim[]): void {
  const radius = ring.fromPx + (ring.toPx - ring.fromPx) * easeOutCubic(u);
  const g = FX_GRID_PX;
  const thick = Math.max(g, Math.round(ring.thicknessPx * (1 - u) / g) * g);
  const inner = Math.max(0, radius - thick);
  // 한 칸 빨리 식힌다 — 오래 머문 가는 금선은 조준 HUD 로 읽힌다(2026-09-24 이펙트 리뷰).
  const color = rampColor(ring.ramp, u * 5);
  const vertex = (r: number, i: number): [number, number] => {
    const a = ring.angle + (i / ring.sides) * Math.PI * 2 - Math.PI / 2;
    return [ring.x + Math.cos(a) * r, ring.y + Math.sin(a) * r * ring.squash];
  };
  for (let i = 0; i < ring.sides; i += 1) {
    const [ox0, oy0] = vertex(radius, i);
    const [ox1, oy1] = vertex(radius, i + 1);
    const [ix0, iy0] = vertex(inner, i);
    const [ix1, iy1] = vertex(inner, i + 1);
    out.push(fxGridPoly([ox0, oy0, ox1, oy1, ix1, iy1, ix0, iy0], color));
  }
}

function drawSpike(spike: FxSpike, age: number, pass: "outline" | "body", out: FxPrim[], u = 0): void {
  const grow = Math.min(1, age / spike.growMs);
  const length = spike.lengthPx * easeOutBack(grow);
  if (length < FX_GRID_PX) return;
  const dx = Math.cos(spike.angle);
  const dy = Math.sin(spike.angle);
  const px = -dy;
  const py = dx;
  const half = spike.widthPx / 2;
  const bx = spike.x + dx * spike.offsetPx;
  const by = spike.y + dy * spike.offsetPx;
  const tx = bx + dx * length;
  const ty = by + dy * length;
  const g = FX_GRID_PX;
  if (pass === "outline") {
    out.push(fxGridPoly([
      bx - dx * g + px * (half + g), by - dy * g + py * (half + g),
      tx + dx * g * 1.5, ty + dy * g * 1.5,
      bx - dx * g - px * (half + g), by - dy * g - py * (half + g),
    ], ROPE_FX_INK));
    return;
  }
  // 갓 솟은 가시는 온통 흰색. 버티는 동안은 밝은 두 단만 쓰고, 부서지기 직전에만 식는다 —
  // 버티는 가시가 갈색이면 금 간 자국으로 읽힌다(2026-09-24 애니메이터 리뷰).
  const hot = age < 45;
  const cooling = u > 0.8;
  const lit = hot ? 0 : cooling ? 2 : 1;
  const shade = hot ? 0 : cooling ? 3 : 2;
  out.push(fxGridPoly([bx + px * half, by + py * half, tx, ty, bx, by], rampColor(spike.ramp, lit)));
  out.push(fxGridPoly([bx, by, tx, ty, bx - px * half, by - py * half], rampColor(spike.ramp, shade)));
  if (!spike.shine || hot) return;
  // Shine 노드: 흰 띠가 뿌리에서 끝으로 한 번 훑고 지나간다.
  const start = spike.growMs * 0.6;
  const s = (age - start) / 110;
  if (s < 0 || s > 1) return;
  const along = s * length;
  const band = 3;
  const widthAt = (d: number): number => half * Math.max(0, 1 - d / length);
  const a0 = Math.max(0, along - band);
  const a1 = Math.min(length, along + band);
  out.push(fxGridPoly([
    bx + dx * a0 + px * widthAt(a0), by + dy * a0 + py * widthAt(a0),
    bx + dx * a1 + px * widthAt(a1), by + dy * a1 + py * widthAt(a1),
    bx + dx * a1 - px * widthAt(a1), by + dy * a1 - py * widthAt(a1),
    bx + dx * a0 - px * widthAt(a0), by + dy * a0 - py * widthAt(a0),
  ], rampColor(spike.ramp, 0)));
}

function drawCrescent(crescent: FxCrescent, u: number, out: FxPrim[]): void {
  const radius = crescent.radiusPx * (0.55 + 0.45 * easeOutCubic(u));
  const thick = crescent.thicknessPx * (1 - u);
  if (thick < 1) return;
  const span = (65 * Math.PI) / 180;
  const dx = Math.cos(crescent.angle);
  const dy = Math.sin(crescent.angle);
  // 안쪽 호의 중심을 뒤로 물리면 가운데가 두껍고 끝이 가는 초승달이 된다.
  const ix = crescent.x - dx * thick;
  const iy = crescent.y - dy * thick;
  const points: number[] = [];
  const steps = 7;
  for (let i = 0; i <= steps; i += 1) {
    const a = crescent.angle - span + (2 * span * i) / steps;
    points.push(crescent.x + Math.cos(a) * radius, crescent.y + Math.sin(a) * radius);
  }
  for (let i = steps; i >= 0; i -= 1) {
    const a = crescent.angle - span + (2 * span * i) / steps;
    points.push(ix + Math.cos(a) * radius, iy + Math.sin(a) * radius);
  }
  out.push(fxGridPoly(points, rampColor("warm", u * 4)));
}

function drawStreak(streak: FxStreak, age: number, u: number, out: FxPrim[]): void {
  const dx = Math.cos(streak.angle);
  const dy = Math.sin(streak.angle);
  const travel = (streak.speed * age) / 1000;
  const cx = streak.x + dx * travel;
  const cy = streak.y + dy * travel;
  const half = (streak.lengthPx * (1 - u * 0.5)) / 2;
  const w = (streak.widthPx ?? FX_GRID_PX) / 2;
  const step = streak.hot === true ? (u < 0.5 ? 0 : 1) : (u < 0.5 ? 1 : 2);
  out.push(fxGridPoly([
    cx - dx * half - dy * w, cy - dy * half + dx * w,
    cx + dx * half - dy * w, cy + dy * half + dx * w,
    cx + dx * half + dy * w, cy + dy * half - dx * w,
    cx - dx * half + dy * w, cy - dy * half - dx * w,
  ], rampColor("warm", step)));
}

function drawGlow(glow: FxGlow, u: number, out: FxPrim[]): void {
  out.push({
    kind: "light", x: glow.x, y: glow.y,
    radius: glow.radiusPx * (1 + 0.2 * u),
    color: glow.color,
    alpha: glow.alpha * (1 - u) ** 1.5,
  });
}

/**
 * 열쇠구멍을 품은 보석 판(마름모) 반쪽. 열쇠구멍은 판 위에 잉크로 음각한다 — 흰 구멍에
 * 윤곽을 두르면 1배 화면(약 13px)에서 별 팔과 섞여 십자로 읽혔다(2026-09-24 이펙트 리뷰).
 */
const KEYHOLE_PLATE_HALF: readonly number[] = [0, -0.68, -0.5, 0, 0, 0.68];

/**
 * 열쇠구멍 반쪽(왼쪽). 오른쪽은 x 를 뒤집는다. 크기 1 기준, 원점은 열쇠구멍 중심.
 * 둥근 머리(반지름 0.3) 아래로 목(폭 0.26)에서 사다리꼴 몸(바닥 폭 0.5)이 내려온다.
 */
const KEYHOLE_HALF: readonly number[] = (() => {
  const r = 0.3;
  const cy = -0.18;
  const neck = 0.13;
  const from = Math.acos(-neck / r);
  const to = Math.PI * 1.5;
  const points = [0, 0.5, -0.25, 0.5, -neck, cy + r * Math.sin(from)];
  const steps = 8;
  for (let i = 0; i <= steps; i += 1) {
    const a = from + ((to - from) * i) / steps;
    points.push(r * Math.cos(a), cy + r * Math.sin(a));
  }
  points.push(0, cy - r);
  return points;
})();

/**
 * 열쇠구멍 전체 윤곽(좌우 반쪽을 이은 닫힌 다각형). 물림의 음각과 전투 예고장 임팩트
 * 프레임(`CombatImpactFrame`)이 같은 모양을 쓴다 — 괴도의 열쇠구멍은 한 벌이다.
 */
export function ropeKeyholeOutline(x: number, y: number, sizePx: number): number[] {
  const points: number[] = [];
  for (let i = 0; i < KEYHOLE_HALF.length; i += 2) points.push(x + KEYHOLE_HALF[i]! * sizePx, y + KEYHOLE_HALF[i + 1]! * sizePx);
  // 오른쪽 반쪽은 x 를 뒤집어 거꾸로 잇는다. 양끝(x = 0)은 이미 들어 있으므로 뺀다.
  for (let i = KEYHOLE_HALF.length - 4; i >= 2; i -= 2) points.push(x - KEYHOLE_HALF[i]! * sizePx, y + KEYHOLE_HALF[i + 1]! * sizePx);
  return points;
}

function keyholeHalf(k: FxKeyhole, shape: readonly number[], side: -1 | 1, scale: number, shiftPx: number, tilt: number): number[] {
  const local: number[] = [];
  for (let i = 0; i < shape.length; i += 2) {
    // 표는 왼쪽 반쪽(x ≤ 0)이다. 오른쪽은 x 만 뒤집는다.
    local.push(shape[i]! * -side * k.sizePx * scale, shape[i + 1]! * k.sizePx * scale);
  }
  return rotated(k.x + side * shiftPx, k.y, side * tilt, local);
}

function drawKeyhole(k: FxKeyhole, u: number, out: FxPrim[]): void {
  const hot = 0.28;
  const s = u < hot ? 0 : (u - hot) / (1 - hot);
  // 자물쇠가 풀린다: 판이 반쪽씩 벌어지며 살짝 젖혀지고, 팔레트를 밟아 식는다.
  const shift = easeOutCubic(s) * k.sizePx * 0.45;
  const tilt = easeOutCubic(s) * 0.35;
  const plate = u < hot ? rampColor("warm", 0) : rampColor("warm", 1 + s * 3);
  const ink = 1 + (2 * FX_GRID_PX) / k.sizePx;
  for (const side of [-1, 1] as const) {
    if (u < hot) out.push(fxGridPoly(keyholeHalf(k, KEYHOLE_PLATE_HALF, side, ink, 0, 0), ROPE_FX_INK));
    out.push(fxGridPoly(keyholeHalf(k, KEYHOLE_PLATE_HALF, side, 1, shift, tilt), plate));
    // 구멍은 늘 잉크 — 판이 식어도 열쇠구멍 모양은 끝까지 읽힌다.
    out.push(fxGridPoly(keyholeHalf(k, KEYHOLE_HALF, side, 0.62, shift, tilt), ROPE_FX_INK));
  }
}

function drawCard(card: FxCard, age: number, u: number, out: FxPrim[]): void {
  const a = age / 1000;
  const x = card.x + card.vx * a;
  const y = card.y + card.vy * a + 0.5 * 420 * a * a;
  const angle = card.angle + card.spin * a;
  // 뒤집히는 카드: 폭이 |cos| 로 접혔다 펴진다. 양면 모두 밀랍 찍힌 앞면이다 — 뒷면이 먼저
  // 보이면 무지 종잇조각으로 읽힌다(2026-09-24 이펙트 리뷰). 거의 옆면일 때만 가장자리 색.
  const flip = Math.abs(Math.cos(2 * Math.PI * card.flipHz * a));
  const w = 7 * Math.max(0.15, flip);
  const h = 10;
  const g = FX_GRID_PX;
  if (u > 0.85 && Math.floor(age / 34) % 2 === 1) return; // 사라지기 직전 두 번 깜빡인다.
  out.push(fxGridPoly(rotated(x, y, angle, [-w - g / 2, -h - g / 2, w + g / 2, -h - g / 2, w + g / 2, h + g / 2, -w - g / 2, h + g / 2]), ROPE_FX_INK));
  const edgeOn = flip < 0.3;
  out.push(fxGridPoly(rotated(x, y, angle, [-w, -h, w, -h, w, h, -w, h]), edgeOn ? ROPE_FX_CARD.edge : ROPE_FX_CARD.paper));
  if (!edgeOn) {
    const r = 3.5 * flip;
    out.push(fxGridPoly(rotated(x, y + 1, angle, [0, -3.5, r, 0, 0, 3.5, -r, 0]), ROPE_FX_CARD.wax));
  }
}

// ── 박자별 폭발 ─────────────────────────────────────────────────────

function chips(
  rng: () => number,
  count: number,
  at: FxPoint,
  bornMs: number,
  options: {
    readonly angle: number;
    readonly spread: number;
    readonly speed: readonly [number, number];
    readonly life: readonly [number, number];
    readonly gravity: number;
    readonly drag?: number;
    readonly coolChance?: number;
    readonly twinkleChance?: number;
    readonly diamondChance?: number;
    readonly cells?: readonly [number, number];
    readonly rampFrom?: number;
    readonly scatterPx?: number;
  },
): FxChip[] {
  const out: FxChip[] = [];
  for (let i = 0; i < count; i += 1) {
    const a = options.angle + (rng() - 0.5) * options.spread;
    const v = between(rng, options.speed[0], options.speed[1]);
    const scatter = options.scatterPx ?? 0;
    const [c0, c1] = options.cells ?? [1, 2];
    out.push({
      kind: "chip",
      bornMs,
      lifeMs: between(rng, options.life[0], options.life[1]),
      x: at.x + (rng() - 0.5) * scatter,
      y: at.y + (rng() - 0.5) * scatter,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      gravity: options.gravity,
      drag: options.drag ?? 2,
      cells: Math.round(between(rng, c0, c1)),
      ramp: rng() < (options.coolChance ?? 0) ? "cool" : "warm",
      rampFrom: options.rampFrom ?? 0,
      twinkle: rng() < (options.twinkleChance ?? 0),
      diamond: rng() < (options.diamondChance ?? 0),
    });
  }
  return out;
}

/**
 * 던지는 순간. sim 은 E 즉시 갈고리를 출발시키므로 예비동작을 앞에 둘 수 없다 —
 * 대신 첫 두 프레임에 손에서 진행 방향으로 흰 번짐선을 그어 "휙" 을 만든다.
 */
export function spawnThrowFx(hand: FxPoint, angle: number, nowMs: number, seed: number, t: RopeFxTuning = ROPE_FX_TUNING): FxElement[] {
  const rng = fxRng(seed);
  const out: FxElement[] = [
    { kind: "glow", bornMs: nowMs, lifeMs: 140, x: hand.x, y: hand.y, radiusPx: 22, alpha: 0.5, color: ROPE_FX_RAMPS.warm[1]! },
    {
      kind: "streak", bornMs: nowMs, lifeMs: 34, hot: true, widthPx: 4,
      x: hand.x + Math.cos(angle) * 20, y: hand.y + Math.sin(angle) * 20, angle, lengthPx: 44, speed: 0,
    },
    { kind: "star", bornMs: nowMs, lifeMs: 130, x: hand.x, y: hand.y, sizePx: t.throwFx.starPx, angle: Math.PI / 4, ramp: "warm" },
    {
      kind: "crescent", bornMs: nowMs, lifeMs: 150,
      x: hand.x + Math.cos(angle) * 6, y: hand.y + Math.sin(angle) * 6,
      angle, radiusPx: t.throwFx.crescentPx, thicknessPx: 6,
    },
  ];
  for (let i = 0; i < 3; i += 1) {
    const side = (i - 1) * between(rng, 5, 11);
    out.push({
      kind: "streak", bornMs: nowMs + i * 14, lifeMs: 110,
      x: hand.x - Math.sin(angle) * side, y: hand.y + Math.cos(angle) * side,
      angle, lengthPx: between(rng, 12, 20), speed: 260,
    });
  }
  return out;
}

/** 갈고리가 날아가는 한 틱의 꼬리. 매 틱 하나, `shedEveryMs` 마다 떨어지는 반짝이 하나. */
export function spawnHookTrailFx(tip: FxPoint, angle: number, tickMs: number, shed: boolean, seed: number, t: RopeFxTuning = ROPE_FX_TUNING): FxElement[] {
  const rng = fxRng(seed);
  const back = angle + Math.PI;
  const out: FxElement[] = [{
    kind: "chip", bornMs: tickMs, lifeMs: t.throwFx.trailLifeMs,
    x: tip.x, y: tip.y,
    vx: Math.cos(back) * 30 + (rng() - 0.5) * 20, vy: Math.sin(back) * 30 + (rng() - 0.5) * 20,
    gravity: 0, drag: 4, cells: 2, ramp: "warm", rampFrom: 0, twinkle: false, diamond: false,
  }];
  if (shed) {
    out.push(...chips(rng, 1, tip, tickMs, {
      angle: back, spread: 1.2, speed: [20, 60], life: [200, 250], gravity: 220,
      twinkleChance: 0.5, cells: [1, 1], rampFrom: 1,
    }));
  }
  return out;
}

/**
 * 갈고리가 무는 순간 — 자동으로 오는 절정이라 완벽한 놓음보다 한 단 작다.
 *
 * 0ms 흰 열쇠구멍 + 나침반 별 + 빛 → 엇박(12ms 간격)으로 솟는 크리스털 가시, 가장 긴
 * 가시는 던진 방향을 이어받고 흰 띠가 한 번 훑는다 → 열쇠구멍이 자물쇠처럼 갈라진다 →
 * 마름모 고리(보석 단면)가 퍼진다 → 가시가 하나씩 조각으로 부서진다. 털린 크리스털 비는
 * 감독이 당기는 동안 움직이는 샹들리에에서 떨어뜨린다(허공에 남지 않게).
 */
export function spawnLatchFx(at: FxPoint, throwAngle: number, nowMs: number, seed: number, t: RopeFxTuning = ROPE_FX_TUNING): FxElement[] {
  const rng = fxRng(seed);
  const c = t.latch;
  const out: FxElement[] = [
    { kind: "glow", bornMs: nowMs, lifeMs: 240, x: at.x, y: at.y, radiusPx: c.lightPx, alpha: 0.75, color: ROPE_FX_RAMPS.warm[1]! },
    // 열쇠구멍이 첫 33ms 를 혼자 차지한다. 별 팔·주 가시가 같은 프레임에 겹치면 십자로 읽힌다.
    { kind: "keyhole", bornMs: nowMs, lifeMs: 220, x: at.x, y: at.y, sizePx: c.keyholePx },
    { kind: "star", bornMs: nowMs + KEYHOLE_SOLO_MS, lifeMs: c.starMs, x: at.x, y: at.y, sizePx: c.starPx, angle: 0, ramp: "warm" },
    { kind: "ring", bornMs: nowMs + KEYHOLE_SOLO_MS, lifeMs: c.ringMs, x: at.x, y: at.y, fromPx: 8, toPx: c.ringPx, sides: 4, angle: 0, thicknessPx: 5, squash: 1, ramp: "warm" },
    { kind: "ring", bornMs: nowMs + 70, lifeMs: c.ringMs * 0.8, x: at.x, y: at.y, fromPx: 8, toPx: c.ringPx * 0.7, sides: 8, angle: Math.PI / 8, thicknessPx: 4, squash: 1, ramp: "warm" },
  ];
  // 엇박 순서: 가시마다 지연을 섞어 한 번에 터지지 않고 "우두둑" 솟게 한다.
  const order = Array.from({ length: c.spikes }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  for (let i = 0; i < c.spikes; i += 1) {
    const hero = i === 0;
    const angle = hero ? throwAngle : throwAngle + (i / c.spikes) * Math.PI * 2 + (rng() - 0.5) * 0.35;
    const lengthPx = hero ? c.heroSpikePx : between(rng, c.spikeLengthPx[0], c.spikeLengthPx[1]);
    const delay = KEYHOLE_SOLO_MS + (hero ? 0 : order[i]! * c.spikeStaggerMs);
    const lifeMs = c.spikeGrowMs + c.spikeHoldMs + (hero ? 40 : 0);
    const bornMs = nowMs + delay;
    const widthPx = hero ? 8 : between(rng, 4, 6);
    out.push({ kind: "spike", bornMs, lifeMs, x: at.x, y: at.y, angle, offsetPx: 5, lengthPx, widthPx, growMs: c.spikeGrowMs, shine: hero, ramp: "warm" });
    // 가시가 죽는 그 틱에 몸을 따라 조각이 흩어진다. 잔해가 오래 남으면 화면이 더러워진다.
    const shards = hero ? 3 : 1;
    for (let k = 0; k < shards; k += 1) {
      const along = 5 + lengthPx * ((k + 0.5) / shards);
      const from = { x: at.x + Math.cos(angle) * along, y: at.y + Math.sin(angle) * along };
      out.push(...chips(rng, 1, from, bornMs + lifeMs, {
        angle, spread: 1.4, speed: [40, 120], life: [260, 440], gravity: t.gravityPx * 0.7,
        coolChance: 0.2, twinkleChance: 0.15, diamondChance: 0.5, cells: [1, 2], rampFrom: 1,
      }));
    }
  }
  // 흰 한 프레임이 지난 뒤 사방으로 튀는 조각. 아래 반구에 더 많이 — 무게는 떨어진다.
  const radial = Math.ceil(c.chips * 0.4);
  const flying = { speed: c.chipSpeed, life: [360, 600] as const, gravity: t.gravityPx, drag: 2.2, coolChance: 0.2, twinkleChance: 0.15, diamondChance: 0.3 };
  out.push(...chips(rng, radial, at, nowMs + 30, { ...flying, angle: 0, spread: Math.PI * 2 }));
  out.push(...chips(rng, c.chips - radial, at, nowMs + 30, { ...flying, angle: Math.PI / 2, spread: Math.PI * 1.1 }));
  return out;
}

/** 물림의 열쇠구멍이 혼자 보이는 시간(두 프레임). */
const KEYHOLE_SOLO_MS = 33;

/** 당기는 동안 흔들리는 샹들리에에서 털려 떨어지는 크리스털 한 알. */
export function spawnCrystalRainFx(body: FxPoint, tickMs: number, seed: number): FxElement[] {
  const rng = fxRng(seed);
  return chips(rng, 1, body, tickMs, {
    angle: Math.PI / 2, spread: 0.8, speed: [20, 60], life: [450, 650], gravity: 300,
    drag: 1.2, coolChance: 0.5, twinkleChance: 0.3, diamondChance: 0.6, cells: [1, 2], scatterPx: 60, rampFrom: 1,
  });
}

/** 손잡이를 잡는 순간: 작은 별 + 팔각 고리 + 떨어지는 조각. 무게는 샹들리에 눌림이 맡는다. */
export function spawnGripFx(at: FxPoint, nowMs: number, seed: number, t: RopeFxTuning = ROPE_FX_TUNING): FxElement[] {
  const rng = fxRng(seed);
  return [
    { kind: "glow", bornMs: nowMs, lifeMs: 150, x: at.x, y: at.y, radiusPx: 22, alpha: 0.5, color: ROPE_FX_RAMPS.warm[2]! },
    { kind: "star", bornMs: nowMs, lifeMs: 120, x: at.x, y: at.y, sizePx: t.grip.starPx, angle: Math.PI / 4, ramp: "warm" },
    { kind: "ring", bornMs: nowMs, lifeMs: 190, x: at.x, y: at.y, fromPx: 3, toPx: t.grip.ringPx, sides: 8, angle: Math.PI / 8, thicknessPx: 4, squash: 1, ramp: "warm" },
    ...chips(rng, t.grip.chips, at, nowMs + 20, {
      angle: Math.PI / 2, spread: Math.PI * 1.4, speed: [70, 150], life: [280, 420], gravity: t.gravityPx,
      coolChance: 0.2, twinkleChance: 0.15, diamondChance: 0.3, cells: [1, 1],
    }),
  ];
}

/**
 * "곧이다" — 완벽 구간 전에 사슬을 타고 기점 쪽으로 오르는 차가운 반짝임 한 알.
 * 신호가 손 위에만 뜨면 놓는 폭발·잔상에 먹힌다(2026-09-24 리뷰 P0).
 */
export function spawnSweetSpotReadyFx(handle: FxPoint, anchor: FxPoint, tickMs: number, seed: number): FxElement[] {
  const rng = fxRng(seed);
  const angle = Math.atan2(anchor.y - handle.y, anchor.x - handle.x);
  const speed = between(rng, 200, 260);
  return [{
    kind: "chip", bornMs: tickMs, lifeMs: 260, x: handle.x + (rng() - 0.5) * 6, y: handle.y + (rng() - 0.5) * 6,
    vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, gravity: 0, drag: 0,
    cells: 1, ramp: "cool", rampFrom: 0, twinkle: rng() < 0.5, diamond: false,
  }];
}

/** 완벽 구간에 들어서는 순간의 "지금!" — 차가운 별과 마름모 고리. */
export function spawnSweetSpotFx(at: FxPoint, nowMs: number): FxElement[] {
  return [
    { kind: "glow", bornMs: nowMs, lifeMs: 180, x: at.x, y: at.y, radiusPx: 26, alpha: 0.55, color: ROPE_FX_RAMPS.cool[1]! },
    { kind: "star", bornMs: nowMs, lifeMs: 190, x: at.x, y: at.y, sizePx: 16, angle: 0, ramp: "cool" },
    { kind: "ring", bornMs: nowMs, lifeMs: 200, x: at.x, y: at.y, fromPx: 4, toPx: 28, sides: 4, angle: 0, thicknessPx: 3, squash: 1, ramp: "cool" },
  ];
}

/** 완벽 구간이 열려 있는 동안 손잡이에서 뛰는 맥박. */
export function spawnSweetSpotPulseFx(at: FxPoint, tickMs: number): FxElement[] {
  return [{ kind: "ring", bornMs: tickMs, lifeMs: 140, x: at.x, y: at.y, fromPx: 6, toPx: 16, sides: 4, angle: 0, thicknessPx: 2, squash: 1, ramp: "cool" }];
}

/**
 * 놓는 순간. 보통은 별·초승달·조각으로 짧게. 완벽한 위상이면 Icicle 을 통째로 한 번 더 —
 * 비행 반대쪽으로 가시가 부채꼴로 솟고, 고리가 두 겹, 예고장 한 장이 뒤집히며 떨어진다.
 * 차이는 크기보다 색(차가운 크리스털)과 대상(배우를 따라가는 꼬리)으로 낸다.
 */
export function spawnReleaseFx(
  at: FxPoint, flightAngle: number, nowMs: number, seed: number,
  perfect: boolean, t: RopeFxTuning = ROPE_FX_TUNING, actor: FxPoint = at,
): FxElement[] {
  const rng = fxRng(seed);
  const r = t.release;
  const back = flightAngle + Math.PI;
  const out: FxElement[] = [
    { kind: "glow", bornMs: nowMs, lifeMs: perfect ? 220 : 140, x: at.x, y: at.y, radiusPx: perfect ? 34 : 20, alpha: perfect ? 0.7 : 0.45, color: perfect ? ROPE_FX_RAMPS.cool[1]! : ROPE_FX_RAMPS.warm[2]! },
    { kind: "star", bornMs: nowMs, lifeMs: perfect ? 170 : 110, x: at.x, y: at.y, sizePx: perfect ? r.starPx * 1.3 : r.starPx, angle: 0, ramp: perfect ? "cool" : "warm" },
    { kind: "crescent", bornMs: nowMs, lifeMs: 160, x: at.x + Math.cos(flightAngle) * 8, y: at.y + Math.sin(flightAngle) * 8, angle: flightAngle, radiusPx: perfect ? 20 : 16, thicknessPx: perfect ? 8 : 6 },
    // 손잡이에 오래 남는 고리는 이미 날아간 배우 뒤로 눈을 끈다 — 짧게.
    { kind: "ring", bornMs: nowMs, lifeMs: 150, x: at.x, y: at.y, fromPx: 4, toPx: perfect ? r.ringPx * 1.5 : r.ringPx, sides: 4, angle: 0, thicknessPx: perfect ? 5 : 4, squash: 1, ramp: "warm" },
  ];
  for (let i = 0; i < (perfect ? 5 : 3); i += 1) {
    const side = (i - (perfect ? 2 : 1)) * between(rng, 5, 10);
    out.push({
      kind: "streak", bornMs: nowMs + i * 12, lifeMs: 120,
      x: at.x - Math.sin(flightAngle) * side, y: at.y + Math.cos(flightAngle) * side,
      angle: flightAngle, lengthPx: between(rng, 14, 26), speed: 300,
    });
  }
  out.push(...chips(rng, perfect ? r.perfectChips : r.chips, at, nowMs + 20, {
    angle: back, spread: Math.PI * 0.9, speed: [90, 210], life: [320, 520], gravity: t.gravityPx,
    drag: 2.2, coolChance: perfect ? 0.25 : 0.1, twinkleChance: perfect ? 0.25 : 0.1, diamondChance: 0.35,
  }));
  if (!perfect) return out;
  // 차가운 고리는 손잡이가 아니라 배우에게서 — 보상은 날아가는 몸을 따라간다.
  out.push({ kind: "ring", bornMs: nowMs + 30, lifeMs: 140, x: actor.x, y: actor.y, fromPx: 6, toPx: r.ringPx * 1.3, sides: 8, angle: Math.PI / 8, thicknessPx: 4, squash: 1, ramp: "cool" });
  for (let i = 0; i < r.perfectSpikes; i += 1) {
    const spread = ((i / (r.perfectSpikes - 1)) - 0.5) * Math.PI * 0.9;
    const angle = back + spread + (rng() - 0.5) * 0.2;
    const lengthPx = between(rng, 14, 28) * (1 - Math.abs(spread) * 0.35);
    const bornMs = nowMs + Math.abs(i - (r.perfectSpikes - 1) / 2) * 14;
    out.push({ kind: "spike", bornMs, lifeMs: 200, x: at.x, y: at.y, angle, offsetPx: 4, lengthPx, widthPx: 5, growMs: 60, shine: i === Math.floor(r.perfectSpikes / 2), ramp: "warm" });
    out.push(...chips(rng, 1, { x: at.x + Math.cos(angle) * lengthPx, y: at.y + Math.sin(angle) * lengthPx }, bornMs + 200, {
      angle, spread: 1.2, speed: [30, 90], life: [260, 420], gravity: t.gravityPx * 0.7,
      coolChance: 0.4, twinkleChance: 0.2, diamondChance: 0.5, rampFrom: 1,
    }));
  }
  // 괴도의 서명: 예고장 한 장이 비행 반대쪽 아래로 뒤집히며 떨어진다.
  out.push({
    kind: "card", bornMs: nowMs + 40, lifeMs: 640, x: at.x, y: at.y,
    vx: Math.cos(back) * 70, vy: -60, angle: -0.3, spin: 5 * (Math.cos(back) < 0 ? -1 : 1), flipHz: 1.3,
  });
  return out;
}

/** 완벽하게 놓은 배우를 따라가는 차가운 꼬리 한 틱. 보상이 비행 내내, 착지까지 이어진다. */
export function spawnPerfectTrailFx(actor: FxPoint, travelAngle: number, tickMs: number, seed: number): FxElement[] {
  const rng = fxRng(seed);
  return chips(rng, 1, actor, tickMs, {
    angle: travelAngle + Math.PI, spread: 0.9, speed: [20, 60], life: [220, 320], gravity: 120,
    drag: 2, coolChance: 1, twinkleChance: 0.35, diamondChance: 0.4, cells: [1, 2], scatterPx: 14,
  });
}

/** 창틀에 매달리는 순간: 납작한 고리 + 옆으로 흩어지는 먼지. 완벽했으면 차가운 조각이 더해진다. */
export function spawnCatchFx(at: FxPoint, facing: -1 | 1, nowMs: number, seed: number, perfect = false): FxElement[] {
  const rng = fxRng(seed);
  const out: FxElement[] = [
    { kind: "ring", bornMs: nowMs, lifeMs: perfect ? 260 : 220, x: at.x, y: at.y, fromPx: 4, toPx: perfect ? 34 : 24, sides: 8, angle: Math.PI / 8, thicknessPx: 4, squash: 0.35, ramp: perfect ? "cool" : "warm" },
    { kind: "star", bornMs: nowMs, lifeMs: 110, x: at.x, y: at.y - 6, sizePx: perfect ? 12 : 8, angle: Math.PI / 4, ramp: perfect ? "cool" : "warm" },
    ...chips(rng, 4, at, nowMs, { angle: Math.PI + 0.25 * facing, spread: 0.5, speed: [60, 120], life: [260, 380], gravity: 200, rampFrom: 2, cells: [1, 2] }),
    ...chips(rng, 4, at, nowMs, { angle: -0.25 * facing, spread: 0.5, speed: [60, 120], life: [260, 380], gravity: 200, rampFrom: 2, cells: [1, 2] }),
  ];
  if (perfect) {
    out.push(...chips(rng, 8, { x: at.x, y: at.y - 10 }, nowMs + 10, {
      angle: -Math.PI / 2, spread: Math.PI * 1.2, speed: [80, 170], life: [320, 480], gravity: 420,
      coolChance: 1, twinkleChance: 0.3, diamondChance: 0.5,
    }));
  }
  return out;
}

// ── 연속 방출 ───────────────────────────────────────────────────────

/** 당기는 동안 손과 밧줄 사이 마찰 불꽃. 진행 반대쪽 위로 튄다. */
export function spawnReelSparkFx(hand: FxPoint, travelAngle: number, tickMs: number, seed: number, t: RopeFxTuning = ROPE_FX_TUNING): FxElement[] {
  const rng = fxRng(seed);
  return chips(rng, 2, hand, tickMs, {
    angle: travelAngle + Math.PI - 0.5, spread: 1.1, speed: [80, 170], life: [180, 280],
    gravity: t.gravityPx * 1.1, drag: 1, twinkleChance: 0.1, cells: [1, 1],
  });
}

/** 몸 옆을 스치는 바람 한 가닥. 진행 방향으로 뻗되 뒤로 흘러간다. */
export function spawnWindStreakFx(center: FxPoint, travelAngle: number, speedPx: number, tickMs: number, seed: number): FxElement[] {
  const rng = fxRng(seed);
  const side = (rng() < 0.5 ? -1 : 1) * between(rng, 8, 24);
  const ahead = between(rng, -10, 10);
  return [{
    kind: "streak", bornMs: tickMs, lifeMs: 100,
    x: center.x + Math.cos(travelAngle) * ahead - Math.sin(travelAngle) * side,
    y: center.y + Math.sin(travelAngle) * ahead + Math.cos(travelAngle) * side,
    angle: travelAngle, lengthPx: Math.max(10, Math.min(30, speedPx * 0.06)), speed: -Math.min(260, speedPx * 0.6),
  }];
}

/** 흔들리는 샹들리에에서 떨어지는 촛불 불티. 흔들림 반대쪽으로 끌리며 떠오른다. */
export function spawnEmberFx(candle: FxPoint, bodyVx: number, tickMs: number, seed: number): FxElement[] {
  const rng = fxRng(seed);
  return [{
    kind: "chip", bornMs: tickMs, lifeMs: between(rng, 420, 620),
    x: candle.x + (rng() - 0.5) * 70, y: candle.y + (rng() - 0.5) * 8,
    vx: -bodyVx * 0.25 + (rng() - 0.5) * 20, vy: -between(rng, 20, 50),
    gravity: -30, drag: 1.2, cells: 1, ramp: "warm", rampFrom: 1.5,
    twinkle: rng() < 0.2, diamond: false,
  }];
}

/**
 * `everyMs` 박자로 이번 프레임에 몇 번 방출해야 하는지. 프레임이 길어도 박자는 빠지지
 * 않고, 반환된 시각에 맞춰 위치를 보간하면 빠른 이동에서도 꼬리가 끊기지 않는다.
 */
export function ropeFxTicks(lastMs: number, nowMs: number, everyMs: number): { readonly ticks: number[]; readonly lastMs: number } {
  if (!(everyMs > 0) || nowMs <= lastMs) return { ticks: [], lastMs };
  if (!Number.isFinite(lastMs) || nowMs - lastMs > everyMs * 8) return { ticks: [nowMs], lastMs: nowMs };
  const ticks: number[] = [];
  let at = lastMs + everyMs;
  while (at <= nowMs) {
    ticks.push(at);
    at += everyMs;
  }
  return { ticks, lastMs: ticks.length > 0 ? ticks[ticks.length - 1]! : lastMs };
}

// ── 밧줄·샹들리에의 몸짓 ────────────────────────────────────────────

/**
 * 물린 뒤 팽팽해진 밧줄의 떨림(px). `u` 는 손 0 → 갈고리 1. 양끝은 0 이다.
 * 튕긴 줄의 2 배음(S 자) 위에 한 번 부푸는 기본음을 얹어 "팅" 하고 선다.
 * 나이는 sim 시간으로 센다 — 히트스톱 동안 부푼 채 멈췄다가 풀리며 떤다.
 */
export function ropeTwangPx(ageMs: number, u: number, t: RopeFxTuning = ROPE_FX_TUNING): number {
  const { amplitudePx, periodMs, decayMs } = t.twang;
  if (ageMs < 0 || ageMs > decayMs * 5) return 0;
  const a = amplitudePx * Math.exp(-ageMs / decayMs);
  return a * (0.8 * Math.sin((2 * Math.PI * ageMs) / periodMs) * Math.sin(2 * Math.PI * u)
    + 0.6 * Math.cos((2 * Math.PI * ageMs) / (periodMs * 1.3)) * Math.sin(Math.PI * u));
}

/** 물리는 순간 샹들리에가 받는 충격(진자 위상 오프셋). 사인으로 시작해 첫 순간이 가장 빠르다. */
export function chandelierJoltProgress(ageMs: number): number {
  if (ageMs < 0 || ageMs > 600) return 0;
  return 0.07 * Math.exp(-ageMs / 110) * Math.sin((2 * Math.PI * ageMs) / 200);
}

/**
 * 손잡이를 잡는 순간 몸무게를 받아 샹들리에가 눌렸다 돌아온다. 원점(손잡이)은 제자리.
 * sim 시간으로 세서 히트스톱 동안 눌린 채 버티다 튀어 오른다.
 */
export function chandelierGripSquash(ageMs: number): { readonly x: number; readonly y: number } {
  if (ageMs < 0 || ageMs > 450) return { x: 1, y: 1 };
  const d = 0.13 * Math.exp(-ageMs / 90) * Math.cos((2 * Math.PI * ageMs) / 230);
  return { x: 1 + d * 0.5, y: 1 - d };
}
