/**
 * 웹툰 페이지 깨짐: 균열 곡선과 큰 조각 6–9개 (순수).
 *
 * 조각은 충격점 P 둘레의 극좌표 (θ, s) 로 나눈다. s 는 P 에서 사각형 테두리까지 거리의 비율(0..1)이다.
 * 사각형은 P 에 대해 별 모양(볼록)이라 (θ, s) → (x, y) 가 1:1 이고, (θ, s) 에서 겹치지 않게 나눈 칸은
 * 화면에서도 겹치지 않고 빈틈없이 사각형을 덮는다.
 *
 * - 방사 균열: θ = θᵢ + wᵢ(s). wᵢ 는 매듭을 Catmull-Rom 접선의 3차 곡선으로 이은 흔들림이라 변이 활처럼 휜다(평평한
 *   삼각형·보석 모양이 아니다). 곡선은 매듭 값의 범위를 넘지 않아 이웃 균열의 흔들림 폭 합이 각도 간격보다 작고, 서로 건너지 않는다.
 * - 가로 균열: s = g(θ). 연속한 부채꼴 몇 칸만 가로지르고 양끝은 방사 균열에서 멈춘다(T자 이음).
 *   기본은 거미줄 모양이다 — 방사 균열 명목 각도의 닻 점을 잇는 현(극좌표 직선)에 휨과 잔떨림을 더한다.
 *   만든 뒤 균열 선분끼리 건너는 곳이 있는지 검사하고, 있으면 시드를 바꿔 다시 만든다(실측 98% 이상 첫 시도 통과).
 *   끝내 실패하면 가로 균열 없이 방사 균열만 조각 수만큼 긋는 별 모양으로 물러선다 — 교차가 없음이 보장된다.
 *
 * 이웃 조각은 경계 꼭짓점 배열을 그대로 나눠 쓴다. 그래서 다각형으로 그려도 틈·겹침이 없다.
 * 시간은 모두 단계 시작부터 잰 ms 다. 난수는 `fxRng` 시드 하나로만 뽑는다.
 *
 * 명세: docs/Plan/2026-10-08-kuma-webtoon-shock-fx/README.md §4.1(파쇄).
 */
import { clamp, clamp01, lerp } from "../../../sim/geom.ts";
import type { FxPoint } from "../FxPrim.ts";
import { fxRng } from "../FxRandom.ts";

/** 깨지는 면의 크기. 조각 좌표의 원점은 면의 왼쪽 위다. */
export interface ShatterRect {
  readonly w: number;
  readonly h: number;
}

export interface ShatterChunk {
  readonly id: number;
  /** 닫힌 외곽선. 첫 점을 끝에 반복하지 않는다. */
  readonly points: readonly FxPoint[];
  readonly centroid: FxPoint;
  readonly area: number;
  /** 충격점 → 무게중심 단위 벡터. 조각이 날아가는 방향이다. */
  readonly dir: FxPoint;
  /** 출발 지연(ms, `maxDelayMs` 이하). 충격점에 가까운 조각이 먼저 뜬다. */
  readonly delayMs: number;
  /** 조각별 세기 배율. */
  readonly kick: number;
  /** 회전 방향(부호)과 배율. */
  readonly spin: number;
}

export interface ShatterCrack {
  readonly kind: "radial" | "transverse";
  /** 자라는 순서의 점. 방사 균열은 충격점에서 바깥으로 간다. */
  readonly points: readonly FxPoint[];
}

export interface PanelShatter {
  readonly rect: ShatterRect;
  readonly impact: FxPoint;
  readonly cracks: readonly ShatterCrack[];
  readonly chunks: readonly ShatterChunk[];
}

/** 조각 비행 매개변수. 속도·중력은 px/ms 단위다. */
export interface ChunkFlightParams {
  /** 파쇄 전체 창(ms). 늦게 뜬 조각도 이 시각에 사라진다. */
  readonly flyMs: number;
  readonly gravityPxPerMs2: number;
  readonly spinRadPerMs: number;
  readonly outwardPxPerMs: number;
  /** 처음에 위로 튀는 속도. 중력이 곧 꺾는다. */
  readonly popUpPxPerMs: number;
  /** 비행 진행률이 이 값을 넘으면 투명해지기 시작한다. */
  readonly fadeFrom: number;
}

export interface ChunkPose {
  /** 무게중심 이동(px). 회전의 축도 무게중심이다. */
  readonly dx: number;
  readonly dy: number;
  readonly angleRad: number;
  readonly alpha: number;
}

export const PANEL_SHATTER = Object.freeze({
  minChunks: 6,
  maxChunks: 9,
  /** 충격점이 머무는 범위(면 크기 비율). 가장자리로 가면 부채꼴이 찌그러진다. */
  impactRange: Object.freeze([0.35, 0.65] as const),
  /** 방사 균열 각도 흔들림: 간격 비율 지터, 휨 폭 상한(rad)과 간격 비율 상한. */
  angleJitterGapFrac: 0.18,
  radialWobbleRad: 0.16,
  radialWobbleGapFrac: 0.18,
  radialKnots: 5,
  /** 방사 균열 매듭 한 칸에 찍는 점 수. 곡선이 매끄럽게 보일 만큼만 찍는다. */
  radialSamplesPerKnot: 5,
  /** 가로 균열 닻 점 반지름 비율(안쪽·바깥쪽)과 모양 계수 (R̄/R(θ))^exp. 넓이가 고르게 갈리는 자리다. */
  ringRadius: Object.freeze([0.55, 0.8] as const),
  ringShapeExp: 0.1,
  /** 닻 점 반지름 흔들림(비율)과 칸마다 현의 휨 폭(s 단위, 부호는 시드). */
  ringAnchorNoise: 0.07,
  ringBulge: Object.freeze([0.05, 0.09] as const),
  ringWobble: 0.03,
  ringKnots: 12,
  ringStepRad: 0.12,
  ringClamp: Object.freeze([0.12, 0.92] as const),
  /** 거미줄 모양을 다시 만들어 보는 횟수. 넘기면 별 모양(방사 균열만)으로 물러선다. */
  chordAttempts: 6,
  /** 조각 출발 지연 상한(ms). */
  maxDelayMs: 90,
});

export const PANEL_SHATTER_FLIGHT: ChunkFlightParams = Object.freeze({
  flyMs: 600,
  gravityPxPerMs2: 0.0032,
  spinRadPerMs: 0.0026,
  outwardPxPerMs: 0.75,
  popUpPxPerMs: 0.45,
  fadeFrom: 0.55,
});

const TAU = Math.PI * 2;

/** P 에서 θ 방향으로 사각형 테두리까지 거리. */
function boundaryDistance(rect: ShatterRect, p: FxPoint, theta: number): number {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  let best = Number.POSITIVE_INFINITY;
  if (c > 1e-12) best = Math.min(best, (rect.w - p.x) / c);
  if (c < -1e-12) best = Math.min(best, -p.x / c);
  if (s > 1e-12) best = Math.min(best, (rect.h - p.y) / s);
  if (s < -1e-12) best = Math.min(best, -p.y / s);
  return best;
}

/**
 * 등간격 매듭을 지나는 곡선(Catmull-Rom 접선의 3차 Hermite). 매듭 사이가 직선이 아니라 부드럽게 휜다. 접선은 넘침이
 * 없게 조인다(극값 매듭에서 0, 이웃 기울기의 3배 이하) — 곡선이 매듭 값의 범위를 넘지 않아 흔들림 폭 상한(이웃 균열이
 * 건너지 않는 조건)을 지키고, 넘침을 잘라 생기는 꺾임도 없다. `periodic` 이면 끝과 처음이 이어진다.
 */
function knotValue(knots: readonly number[], u: number, periodic: boolean): number {
  const count = knots.length;
  if (count === 0) return 0;
  const n = periodic ? count : count - 1;
  if (n <= 0) return knots[0] ?? 0;
  const x = periodic ? (((u % 1) + 1) % 1) * n : clamp01(u) * n;
  const i = Math.min(Math.floor(x), n - 1);
  const f = x - i;
  const at = (j: number): number => knots[periodic ? ((j % count) + count) % count : clamp(j, 0, count - 1)] ?? 0;
  const tangent = (j: number): number => {
    const before = at(j) - at(j - 1);
    const after = at(j + 1) - at(j);
    if (before * after <= 0) return 0;
    const limit = 3 * Math.min(Math.abs(before), Math.abs(after));
    return Math.sign(after) * Math.min(Math.abs(before + after) / 2, limit);
  };
  const p1 = at(i), p2 = at(i + 1), m1 = tangent(i), m2 = tangent(i + 1);
  const f2 = f * f, f3 = f2 * f;
  return (2 * f3 - 3 * f2 + 1) * p1 + (f3 - 2 * f2 + f) * m1 + (-2 * f3 + 3 * f2) * p2 + (f3 - f2) * m2;
}

/**
 * 균열 수 계획: 방사 K 개 + 가로 균열 한두 개가 가로지르는 칸 수. 조각 수 = K + Σ칸.
 * 칸 수를 두 균열에 나눠 주면 서로 떨어진 큰 칸 두 곳을 각각 자를 수 있다.
 * `starOnly` 면 가로 균열 없이 방사 균열만 조각 수만큼 긋는다.
 */
function crackPlan(count: number, starOnly: boolean): { radial: number; ringSpans: number[] } {
  if (starOnly) return { radial: count, ringSpans: [] };
  const radial = count <= 8 ? 5 : 6;
  const crossings = count - radial;
  return { radial, ringSpans: [Math.ceil(crossings / 2), Math.floor(crossings / 2)] };
}

interface CrackVertex {
  readonly s: number;
  readonly p: FxPoint;
}

interface Ring {
  /** 방사 균열 명목 각도 θᵢ 의 닻 점 s. */
  readonly anchors: readonly number[];
  /** 칸 i 의 현 휨(s 단위). */
  readonly bulges: readonly number[];
  readonly knots: readonly number[];
  readonly firstSector: number;
  readonly span: number;
}

/** 다각형 넓이(부호 없음)와 무게중심. */
function polygonAreaCentroid(points: readonly FxPoint[]): { area: number; centroid: FxPoint } {
  let twice = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const cross = a.x * b.y - b.x * a.y;
    twice += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  if (Math.abs(twice) < 1e-9) {
    const n = Math.max(1, points.length);
    return { area: 0, centroid: { x: points.reduce((s, q) => s + q.x, 0) / n, y: points.reduce((s, q) => s + q.y, 0) / n } };
  }
  return { area: Math.abs(twice) / 2, centroid: { x: cx / (3 * twice), y: cy / (3 * twice) } };
}

/** 앞 점과 같은 점(같은 객체 또는 같은 좌표)을 빼고 잇는다. 닫는 중복도 뺀다. */
function joinLoop(parts: readonly (readonly FxPoint[])[]): FxPoint[] {
  const out: FxPoint[] = [];
  const same = (a: FxPoint, b: FxPoint) => a === b || (Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9);
  for (const part of parts) {
    for (const point of part) if (out.length === 0 || !same(out[out.length - 1]!, point)) out.push(point);
  }
  while (out.length > 1 && same(out[0]!, out[out.length - 1]!)) out.pop();
  return out;
}

/** 균열 선분끼리 건너는 곳이 있는가. 끝점을 나눠 쓰는 선분은 이음이라 뺀다. */
function cracksTangle(polylines: readonly (readonly FxPoint[])[]): boolean {
  const segments: [FxPoint, FxPoint][] = [];
  for (const line of polylines) for (let i = 0; i + 1 < line.length; i++) segments.push([line[i]!, line[i + 1]!]);
  const same = (a: FxPoint, b: FxPoint) => a === b || (Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9);
  const orient = (a: FxPoint, b: FxPoint, c: FxPoint) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  for (let i = 0; i < segments.length; i++) {
    const [a, b] = segments[i]!;
    for (let j = i + 1; j < segments.length; j++) {
      const [c, d] = segments[j]!;
      if (same(a, c) || same(a, d) || same(b, c) || same(b, d)) continue;
      if (orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0) return true;
    }
  }
  return false;
}

/**
 * 시드·면 크기·조각 수(6–9)로 균열과 조각을 만든다. 같은 입력은 같은 결과다.
 * `impact` 를 주면 그 자리(면 좌표)에서 깨진다. 주지 않으면 가운데 근처의 시드 자리다.
 */
export function panelShatter(seed: number, rect: ShatterRect, count: number, impact?: FxPoint): PanelShatter {
  for (let attempt = 0; attempt < PANEL_SHATTER.chordAttempts; attempt++) {
    const attemptSeed = attempt === 0 ? seed : (seed ^ Math.imul(attempt, 0x9e3779b1)) >>> 0;
    const built = buildShatter(attemptSeed, rect, count, impact, false);
    if (built.valid) return built.shatter;
  }
  return buildShatter(seed, rect, count, impact, true).shatter;
}

function buildShatter(
  seed: number,
  rect: ShatterRect,
  count: number,
  impact: FxPoint | undefined,
  starOnly: boolean,
): { shatter: PanelShatter; valid: boolean } {
  const rng = fxRng(seed);
  const cfg = PANEL_SHATTER;
  const chunkCount = clamp(Math.round(count), cfg.minChunks, cfg.maxChunks);
  const [lo, hi] = cfg.impactRange;
  const seededImpact = { x: rect.w * (0.5 + (rng() - 0.5) * 0.12), y: rect.h * (0.47 + (rng() - 0.5) * 0.1) };
  const raw = impact ?? seededImpact;
  const P: FxPoint = { x: clamp(raw.x, rect.w * lo, rect.w * hi), y: clamp(raw.y, rect.h * lo, rect.h * hi) };
  const at = (theta: number, s: number): FxPoint => {
    if (s <= 0) return P;
    const r = boundaryDistance(rect, P, theta) * s;
    return { x: P.x + Math.cos(theta) * r, y: P.y + Math.sin(theta) * r };
  };

  // ── 방사 균열 각도와 꺾인 흔들림 ──
  const plan = crackPlan(chunkCount, starOnly);
  const K = plan.radial;
  const gap = TAU / K;
  const start = rng() * TAU;
  const thetas = Array.from({ length: K }, (_, i) => start + gap * (i + (rng() * 2 - 1) * cfg.angleJitterGapFrac));
  const wobbleAmp = Math.min(cfg.radialWobbleRad, cfg.radialWobbleGapFrac * gap);
  // 매듭과 그 사이를 고르게 찍는다. 곡선 흔들림이라 이웃 점을 이은 변이 활처럼 휜다.
  const radialSteps = cfg.radialKnots * cfg.radialSamplesPerKnot;
  const radialSampleS = Array.from({ length: radialSteps + 1 }, (_, k) => k / radialSteps);
  // 마지막 매듭은 앞 매듭과 같게 둔다 — 테두리(특히 면 모서리) 근처에서 각도가 흔들리면 반지름이 꺾여 균열이 접힌다.
  const radialWobbles = thetas.map(() => {
    const knots = Array.from({ length: cfg.radialKnots }, (_, k) => (k === 0 ? 0 : (rng() * 2 - 1) * wobbleAmp));
    return [...knots, knots[knots.length - 1]!];
  });
  const radialTheta = (a: number, s: number) => thetas[a]! + knotValue(radialWobbles[a]!, s, false);

  // ── 가로 균열 ──
  let rMin = Number.POSITIVE_INFINITY;
  let rMax = 0;
  for (let i = 0; i < 72; i++) {
    const r = boundaryDistance(rect, P, (i / 72) * TAU);
    rMin = Math.min(rMin, r);
    rMax = Math.max(rMax, r);
  }
  const rRef = Math.sqrt(rMin * rMax);
  const shapeAt = (theta: number) => (rRef / boundaryDistance(rect, P, theta)) ** cfg.ringShapeExp;
  // 가로 균열은 큰 부채꼴을 골라 지난다. 한 조각만 면의 절반을 차지하는 일을 줄인다.
  const sectorSize = thetas.map((t0, i) => {
    const t1 = i === K - 1 ? thetas[0]! + TAU : thetas[i + 1]!;
    let sum = 0;
    for (let k = 0; k < 16; k++) sum += boundaryDistance(rect, P, lerp(t0, t1, (k + 0.5) / 16)) ** 2;
    return (sum / 16) * (t1 - t0) * 0.5;
  });
  const rings: Ring[] = plan.ringSpans.filter(span => span > 0).map((rawSpan, j) => {
    const span = Math.min(rawSpan, K);
    const noise = Array.from({ length: K }, () => 1 + 0.25 * rng());
    let firstSector = 0;
    let best = -1;
    for (let first = 0; first < K; first++) {
      let score = 0;
      for (let k = 0; k < span; k++) score += sectorSize[(first + k) % K]! * noise[(first + k) % K]!;
      if (score > best) {
        best = score;
        firstSector = first;
      }
    }
    for (let k = 0; k < span; k++) sectorSize[(firstSector + k) % K]! *= 0.55;
    const radius = cfg.ringRadius[j] ?? cfg.ringRadius[1];
    return {
      anchors: thetas.map(t => radius * shapeAt(t) * (1 + (rng() * 2 - 1) * cfg.ringAnchorNoise)),
      bulges: thetas.map(() => (rng() < 0.5 ? -1 : 1) * lerp(cfg.ringBulge[0], cfg.ringBulge[1], rng())),
      knots: Array.from({ length: cfg.ringKnots }, () => (rng() * 2 - 1) * cfg.ringWobble),
      firstSector,
      span,
    };
  });
  /** θ 가 속한 칸 i 와 펼친 θ, 칸 양끝 명목 각도. */
  const sectorOf = (theta: number) => {
    const t = (((theta - thetas[0]!) % TAU) + TAU) % TAU;
    let i = K - 1;
    while (i > 0 && thetas[i]! - thetas[0]! > t) i--;
    return { i, theta: thetas[0]! + t, t0: thetas[i]!, t1: i === K - 1 ? thetas[0]! + TAU : thetas[i + 1]! };
  };
  /** 가로 균열의 s. 거미줄: 닻 점 두 개를 잇는 극좌표 직선 1/ρ = (sin(θ₁−θ)/ρ₀ + sin(θ−θ₀)/ρ₁)/sin(θ₁−θ₀) + 휨. */
  const ringS = (ring: Ring, theta: number): number => {
    const jag = knotValue(ring.knots, theta / TAU, true);
    const { i, theta: th, t0, t1 } = sectorOf(theta);
    const rho0 = ring.anchors[i]! * boundaryDistance(rect, P, t0);
    const rho1 = ring.anchors[(i + 1) % K]! * boundaryDistance(rect, P, t1);
    const inv = (Math.sin(t1 - th) / rho0 + Math.sin(th - t0) / rho1) / Math.sin(t1 - t0);
    const bend = ring.bulges[i]! * Math.sin((Math.PI * (th - t0)) / (t1 - t0));
    return clamp(1 / inv / boundaryDistance(rect, P, th) + bend + jag * 0.5, cfg.ringClamp[0], cfg.ringClamp[1]);
  };
  const crosses = (ring: Ring, sector: number) => ((sector - ring.firstSector + K) % K) < ring.span;
  /** 가로 균열 j 가 방사 균열 a 와 만나는 s. h(s) = s − g(θₐ(s)) 의 근을 이분법으로 찾는다. */
  const meetS = (ring: Ring, a: number): number => {
    let low = 0;
    let high = 1;
    for (let i = 0; i < 40; i++) {
      const mid = (low + high) / 2;
      if (mid - ringS(ring, radialTheta(a, mid)) < 0) low = mid;
      else high = mid;
    }
    return (low + high) / 2;
  };
  // 만남점: meets[j][a]. 가로 균열이 지나는 칸의 양쪽 방사 균열에만 있다.
  const meets = rings.map(ring => Array.from({ length: K }, (_, a) =>
    crosses(ring, a) || crosses(ring, (a - 1 + K) % K) ? meetS(ring, a) : null));

  // ── 방사 균열 꼭짓점(매듭 + 만남점). 이웃 조각이 이 배열을 그대로 나눠 쓴다 ──
  const radialVerts: CrackVertex[][] = thetas.map((_, a) => {
    const sValues = new Set<number>(radialSampleS);
    for (const row of meets) if (row[a] !== null && row[a] !== undefined) sValues.add(row[a]);
    return [...sValues].sort((x, y) => x - y).map(s => ({ s, p: at(radialTheta(a, s), s) }));
  });
  const sideBetween = (a: number, sLo: number, sHi: number): FxPoint[] =>
    radialVerts[a]!.filter(v => v.s >= sLo && v.s <= sHi).map(v => v.p);
  const vertexAt = (a: number, s: number): CrackVertex => radialVerts[a]!.find(v => v.s === s)!;

  // 칸 i 의 각도 범위(펼친 값). 마지막 칸의 오른쪽은 첫 균열 + 2π.
  const unwrapTheta = (i: number, side: "a" | "b", s: number) => {
    const a = side === "a" ? i : (i + 1) % K;
    return radialTheta(a, s) + (side === "b" && i === K - 1 ? TAU : 0);
  };
  const ringPolyline = (j: number, i: number): FxPoint[] => {
    const ring = rings[j]!;
    const a = i;
    const b = (i + 1) % K;
    const sa = meets[j]![a]!;
    const sb = meets[j]![b]!;
    const t0 = unwrapTheta(i, "a", sa);
    const t1 = unwrapTheta(i, "b", sb);
    const n = Math.max(3, Math.ceil(Math.abs(t1 - t0) / cfg.ringStepRad));
    const mids = Array.from({ length: n - 1 }, (_, k) => {
      const theta = lerp(t0, t1, (k + 1) / n);
      return at(theta, ringS(ring, theta));
    });
    return [vertexAt(a, sa).p, ...mids, vertexAt(b, sb).p];
  };
  const boundaryEdge = (i: number): FxPoint[] => {
    const t0 = unwrapTheta(i, "a", 1);
    const t1 = unwrapTheta(i, "b", 1);
    const corners = [{ x: 0, y: 0 }, { x: rect.w, y: 0 }, { x: rect.w, y: rect.h }, { x: 0, y: rect.h }]
      .map(c => {
        let t = Math.atan2(c.y - P.y, c.x - P.x);
        while (t <= t0) t += TAU;
        return { c, t };
      })
      .filter(e => e.t < t1)
      .sort((x, y) => x.t - y.t)
      .map(e => e.c);
    return [vertexAt(i, 1).p, ...corners, vertexAt((i + 1) % K, 1).p];
  };

  // ── 조각 조립: 칸마다 아래(P)→가로 균열→테두리 순으로 자른다 ──
  const outlines: FxPoint[][] = [];
  for (let i = 0; i < K; i++) {
    const a = i;
    const b = (i + 1) % K;
    // 이 칸을 지나는 가로 균열(안쪽부터). 조각은 그 수 + 1 개다. null = 바닥(P) 또는 테두리.
    const levels = rings.map((ring, j) => (crosses(ring, i) ? j : -1)).filter(j => j >= 0);
    for (let l = 0; l <= levels.length; l++) {
      const below = l === 0 ? null : levels[l - 1]!;
      const above = l === levels.length ? null : levels[l]!;
      const sALo = below === null ? 0 : meets[below]![a]!;
      const sBLo = below === null ? 0 : meets[below]![b]!;
      const sAHi = above === null ? 1 : meets[above]![a]!;
      const sBHi = above === null ? 1 : meets[above]![b]!;
      outlines.push(joinLoop([
        sideBetween(a, sALo, sAHi),
        above === null ? boundaryEdge(i) : ringPolyline(above, i),
        sideBetween(b, sBLo, sBHi).reverse(),
        below === null ? [] : ringPolyline(below, i).reverse(),
      ]));
    }
  }

  // ── 검사: 균열끼리 건너지 않고 조각 넓이 합이 면과 같다 ──
  const ringPieces = rings.flatMap((ring, j) =>
    Array.from({ length: ring.span }, (_, k) => ringPolyline(j, (ring.firstSector + k) % K)));
  const areaSum = outlines.reduce((sum, points) => sum + polygonAreaCentroid(points).area, 0);
  const valid = Math.abs(areaSum - rect.w * rect.h) <= 1e-6 * rect.w * rect.h
    && !cracksTangle([...radialVerts.map(verts => verts.map(v => v.p)), ...ringPieces]);

  // ── 균열 그리기용 선 ──
  const cracks: ShatterCrack[] = [
    ...radialVerts.map(verts => ({ kind: "radial" as const, points: verts.map(v => v.p) })),
    ...rings.map((ring, j) => ({
      kind: "transverse" as const,
      points: joinLoop(Array.from({ length: ring.span }, (_, k) => ringPolyline(j, (ring.firstSector + k) % K))),
    })),
  ];

  // ── 조각별 비행 성질 ──
  const chunks: ShatterChunk[] = outlines.map((points, id) => {
    const { area, centroid } = polygonAreaCentroid(points);
    const vx = centroid.x - P.x;
    const vy = centroid.y - P.y;
    const len = Math.hypot(vx, vy);
    const dir = len > 1e-6 ? { x: vx / len, y: vy / len } : { x: 0, y: -1 };
    return {
      id,
      points,
      centroid,
      area,
      dir,
      delayMs: cfg.maxDelayMs * (0.65 * clamp01(len / rMax) + 0.35 * rng()),
      kick: 0.85 + 0.35 * rng(),
      spin: (rng() < 0.5 ? -1 : 1) * (0.6 + 0.7 * rng()),
    };
  });

  return { shatter: { rect, impact: P, cracks, chunks }, valid };
}

/**
 * 조각의 `ms` 시각 자세. 무게중심 기준 이동·회전과 투명도를 돌려준다.
 *
 * `flyMs` 는 파쇄 전체 창이다. 조각은 `delayMs` 뒤에 떠서 남은 `flyMs − delayMs` 동안 날고,
 * 모두 `flyMs` 에 투명(alpha 0)해진다 — 다음 박자(대사 한 줄)는 빈 잉크 위에 홀로 선다.
 * 출발 전에는 제자리다. 같은 조각·같은 시각은 같은 자세다.
 */
export function chunkPoseAt(
  chunk: ShatterChunk,
  ms: number,
  params: ChunkFlightParams = PANEL_SHATTER_FLIGHT,
): ChunkPose {
  const flightMs = Math.max(1, params.flyMs - chunk.delayMs);
  const t = clamp(ms - chunk.delayMs, 0, flightMs);
  if (t <= 0) return { dx: 0, dy: 0, angleRad: 0, alpha: ms >= params.flyMs ? 0 : 1 };
  const k = t / flightMs;
  const v = params.outwardPxPerMs * chunk.kick;
  const fade = 1 - clamp01((k - params.fadeFrom) / Math.max(1e-6, 1 - params.fadeFrom));
  return {
    dx: chunk.dir.x * v * t,
    dy: chunk.dir.y * v * t - params.popUpPxPerMs * chunk.kick * t + 0.5 * params.gravityPxPerMs2 * t * t,
    angleRad: chunk.spin * params.spinRadPerMs * t,
    alpha: ms >= params.flyMs ? 0 : fade,
  };
}
