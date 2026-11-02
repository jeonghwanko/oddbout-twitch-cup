
import { clamp01, lerp } from "../../../sim/geom.ts";
import { fxRng } from "../FxRandom.ts";
import type { TitlePrologueSound } from "./TitleWebtoonPrologueTimeline.ts";

export type TitleOpeningShotId =
  | "blue" | "thrust" | "card" | "plaza" | "kuma" | "player" | "yume" | "otto" | "paper" | "red" | "dusk" | "inhale";

export interface TitleOpeningShot {
  readonly id: TitleOpeningShotId;
  /** 곡 4분음표. */
  readonly from: number;
  readonly to: number;
}

const shot = (id: TitleOpeningShotId, from: number, to: number): TitleOpeningShot => Object.freeze({ id, from, to });

export const TITLE_ANIME_OPENING = Object.freeze({
  /** 오프닝 길이(곡 4분음표). 프롤로그의 점화·대사·등장 박을 이만큼 뒤로 민다. */
  songBeats: 12,
  /** 그림이 움직이는 계단(24fps). 오프닝의 모든 몸짓이 이 간격으로 끊긴다. */
  stepMs: 1000 / 24,
  /** 천이 들어와 화면을 덮고(0.25) 빠진다. 덮는 순간이 가장 빠르다 — 천 바탕은 그 앞뒤 3% 동안만 깐다. */
  clothIn: Object.freeze({ from: 0, to: 0.5 }),
  /** 마지막 천: 진홍 안감 면. 화면을 덮은 순간(11.5) 숨 고르기 검정으로 바뀌고, 12 에 타이틀이 하드컷으로 켜진다. */
  clothOut: Object.freeze({ from: 11.25, to: 11.75 }),
  clothCoverHalfWidth: 0.03,
  shots: Object.freeze([
    shot("blue", 0.25, 2),
    shot("thrust", 2, 2.5),
    shot("card", 2.5, 3),
    shot("plaza", 3, 4),
    shot("kuma", 4, 4.75),
    shot("player", 4.75, 5.5),
    shot("yume", 5.5, 6.25),
    shot("otto", 6.25, 7),
    shot("paper", 7, 8),
    shot("red", 8, 9.5),
    shot("dusk", 9.5, 11.5),
    shot("inhale", 11.5, 12),
  ]),
  /** 타이틀 점화 박. 프롤로그는 이 박에 다 밝힌 타이틀로 하드컷한다(`onIgnite` + `showLit`). */
  lit: 12,
  /** 점화 하드컷 뒤에 남는 따뜻한 섬광(오프닝 뷰가 그린다)과 타이틀 원화의 펀치·흔들림(프롤로그가 건다). */
  litFlash: Object.freeze({ ms: 160, alpha: 0.85, radius: 600 }),
  litPunch: Object.freeze({ ms: 320, from: 1.08, shakeMs: 160, shakePx: 6 }),
  /** 두 프레임 데이터모시: 노랑 → 보라 컷 위. 흰 종이 앞에는 순백 한 프레임. */
  glitches: Object.freeze([5.5] as const),
  glitchMs: 84,
  glitchStepMs: 42,
  whiteFrameAt: 7,
  /** 노랑 카드 끝의 어두운 스미어(망토 한 자락). */
  smear: Object.freeze({ from: 5.3, to: 5.5 }),
  /** 청색 클로즈업: 원화 좌표 카메라(가운데·배율·기울기). 거꾸로 매달린 얼굴이 바로 서도록 160° 돌린다. 1 박에 눈 번뜩 + 스냅 푸시. */
  blue: Object.freeze({
    from: Object.freeze({ x: 1186, y: 610, zoom: 1.78, deg: 158 }),
    to: Object.freeze({ x: 1176, y: 604, zoom: 1.9, deg: 162 }),
    eyesAt: 1, eyeFlareMs: 90, eyeFlare: 1.5, streakMs: 120, snapPush: 0.08, snapMs: 120,
  }),
  /** 손이 카메라로: 얼굴 카메라에서 끊기지 않고 손바닥으로 빨려 든다. 2.25 박에 장갑 끝 불티. */
  thrust: Object.freeze({ toZoom: 3.1, focusLines: 48, sparkAt: 2.25, sparkMs: 200, needles: 8 }),
  /** 예고장 클로즈업: 크게 박혀 서서히 다가오고, 2.75 박에 봉랍이 번뜩인다. */
  card: Object.freeze({ glintAt: 2.75, glintMs: 220 }),
  /** 컷인이 박히는 시간: 첫 계단은 먹 실루엣, 이어 1.18 → 0.96 → 1 반동, 자리를 잡으면 천천히 미끄러진다. */
  slam: Object.freeze({ inkMs: 42, ms: 140, from: 1.18, under: 0.96, driftPx: 40, driftDeg: 1.5, shakeMs: 120, shakePx: 7 }),
  /** 인쇄가 어긋난 색 잔상: 박힐 때 30px, 자리를 잡으면 8px. */
  ghost: Object.freeze({ slamPx: 30, restPx: 8 }),
  /** 박히는 동안 화면 바깥쪽 45% 에 집중선. */
  focus: Object.freeze({ ms: 160, count: 48, inner: 0.55 }),
  /** 보라 카드에 쏟아지는 무기·예고장·금화. */
  rain: Object.freeze({
    count: 26, seed: 1717, angleDeg: 152, speedPxPerMs: Object.freeze([1.1, 2.2] as const),
    /** 앞의 몇 개는 카메라 바로 앞을 지나는 큰 소품이다(더 크고 빠르다). */
    near: 5, nearScale: 2.6, nearSpeed: 1.5,
  }),
  /** 유메의 베기: 칼날 선을 따라 그어지고, 머리가 화면 가운데를 지날 때 두 계단 멈춘다(히트스톱 — 비와 띠도 멈춘다). */
  slashArc: Object.freeze({ from: 5.75, growMs: 120, tailLagMs: 160, droplets: 16, seed: 23, hitstopMs: 84, lunge: Object.freeze({ px: 36, deg: -4 }) }),
  /** 흰 종이의 붉은 선(−3°, 예고장의 궤적)과 그 선에서 부채꼴로 열리는 진홍 범람. */
  redLine: Object.freeze({ from: 7.5, to: 7.65, y: 470, deg: -3, px: 3, glowPx: 8, floodFrom: 7.75 }),

  red: Object.freeze({ truckPx: 220, eyesAt: 8.75 }),

  dusk: Object.freeze({ push: 0.08, truckPx: 60 }),
});

/** 오프닝이 화면에 남는 마지막 박(점화 섬광의 꼬리까지). */
export function titleOpeningExit(quarterMs: number): number {
  return TITLE_ANIME_OPENING.lit + (TITLE_ANIME_OPENING.litFlash.ms + TITLE_ANIME_OPENING.stepMs) / quarterMs;
}

/** 곡 4분음표 하나의 ms. */
export function titleOpeningQuarterMs(bpm: number): number {
  return 60_000 / (bpm > 0 && Number.isFinite(bpm) ? bpm : 102);
}

/** 24fps 계단으로 끊은 시각. */
export function titleOpeningStep(ms: number): number {
  const step = TITLE_ANIME_OPENING.stepMs;
  return Math.floor(ms / step) * step;
}

/** 박 `q` 에 화면을 채운 샷. 첫 천이 덮기 전과 점화 뒤에는 null — 아래 타이틀이 보인다. */
export function titleOpeningShotAt(q: number): { readonly shot: TitleOpeningShot; readonly progress: number } | null {
  for (const entry of TITLE_ANIME_OPENING.shots) {
    if (q >= entry.from && q < entry.to) return { shot: entry, progress: (q - entry.from) / (entry.to - entry.from) };
  }
  return null;
}

/** 이 시각에 데이터모시가 덮였는가(아니면 null). 글리치는 컷 박 바로 뒤 두 계단이다. */
export function titleOpeningGlitchAt(qMs: number, quarterMs: number): { readonly index: number; readonly step: number } | null {
  const O = TITLE_ANIME_OPENING;
  for (const [index, at] of O.glitches.entries()) {
    const since = qMs - at * quarterMs;
    if (since >= 0 && since < O.glitchMs) return { index, step: Math.floor(since / O.glitchStepMs) };
  }
  return null;
}

/**
 * 컷인이 박히는 자세. `since` 는 컷 시작 뒤 ms. 첫 계단은 먹 실루엣(`ink`), 이어 배율 반동, 그 뒤 미끄러짐(0..1).
 */
export function titleOpeningSlamAt(since: number): { readonly ink: boolean; readonly scale: number; readonly settle: number; readonly spread: number } {
  const S = TITLE_ANIME_OPENING.slam;
  const ink = since < S.inkMs;
  const t = clamp01((since - S.inkMs) / S.ms);
  // 1.18 → 0.96(60%) → 1.0: 반동 하나.
  const scale = t < 0.6 ? lerp(S.from, S.under, 1 - (1 - t / 0.6) ** 3) : lerp(S.under, 1, 1 - (1 - (t - 0.6) / 0.4) ** 2);
  return { ink, scale: ink ? S.from : scale, settle: clamp01((since - S.inkMs - S.ms) / 600), spread: 1 - t };
}

// ── 천 ────────────────────────────────────────────────────────────────────

export interface TitleOpeningRibbon {
  /** 설계 화면 3차 베지어 조절점 네 개. */
  readonly ctrl: readonly (readonly [number, number])[];
  readonly width: number;
  readonly tone: "cloth" | "deep" | "lining";
  /** 천이 출렁이는 정도(폭 비율)와 위상. */
  readonly wave: number;
  readonly phase: number;
  /** 주름 띠: 척추에서 떨어진 거리(반폭 비율, ±)와 굵기(반폭 비율). */
  readonly folds: readonly (readonly [number, number])[];
  /** 들어오기를 늦추는 진행률(겹겹이 들어온다). */
  readonly lag: number;
}

const ribbon = (ctrl: TitleOpeningRibbon["ctrl"], width: number, tone: TitleOpeningRibbon["tone"], wave: number, phase: number,
  lag: number, folds: TitleOpeningRibbon["folds"] = [[0.42, 0.06], [-0.22, 0.04]]): TitleOpeningRibbon =>
  Object.freeze({ ctrl, width, tone, wave, phase, lag, folds });

/** 화면을 다 덮는 자리(진행률 0.5)의 망토 다섯 자락. 아래-왼쪽에서 위-오른쪽으로 휩쓴다. */
export const TITLE_OPENING_CLOTH: readonly TitleOpeningRibbon[] = Object.freeze([
  ribbon([[-500, 980], [250, 700], [800, 300], [1700, -260]], 760, "cloth", 1, 0, 0),
  ribbon([[-700, 520], [60, 260], [520, -40], [1300, -520]], 640, "deep", 1, 1.3, 0.04),
  ribbon([[-200, 1400], [520, 1120], [1100, 760], [1900, 260]], 680, "deep", 1, 2.1, 0.02),
  // 붉은 안감 한 줄: 남색 자락 사이로 비친다.
  ribbon([[-450, 1160], [260, 900], [860, 470], [1480, 120]], 120, "lining", 1.4, 0.4, 0.05, []),
  ribbon([[-400, 1100], [300, 860], [900, 420], [1500, 60]], 360, "cloth", 1.6, 0.7, 0.06, [[0.3, 0.07], [-0.2, 0.05]]),
]);

/** 스미어 한 자락(노랑 카드 끝): 왼쪽에서 오른쪽으로 화면을 가로지른다. */
export const TITLE_OPENING_SMEAR: TitleOpeningRibbon = ribbon(
  [[-200, 760], [300, 500], [800, 300], [1500, 120]], 520, "cloth", 1.2, 0.5, 0, [[0.35, 0.06]]);

/**
 * 천 한 자락의 평행 이동(설계 화면 px). `p` 는 천 구간 진행률 0..1, 0.5 에 기준 자리(화면을 다 덮음).
 * 속도가 덮는 순간에 가장 빠르다(들어올 때 가속, 나갈 때 감속) — 덮은 채 멈추지 않는다. `mirror` 는 마지막 천(오른쪽에서 들어옴)이다.
 */
export function titleOpeningClothOffset(rb: TitleOpeningRibbon, p: number, mirror: boolean): { readonly dx: number; readonly dy: number } {
  const q = clamp01((p - rb.lag) / (1 - rb.lag));
  const m = q < 0.5 ? 0.5 * (q / 0.5) ** 1.6 : 1 - 0.5 * ((1 - q) / 0.5) ** 1.6;
  const dx = lerp(-1300, 1300, m);
  return { dx: mirror ? -dx : dx, dy: lerp(900, -900, m) };
}

/** 천 구간 진행률. 구간 밖이면 null. */
export function titleOpeningClothProgress(q: number): { readonly p: number; readonly mirror: boolean } | null {
  const O = TITLE_ANIME_OPENING;
  for (const [span, mirror] of [[O.clothIn, false], [O.clothOut, true]] as const) {
    if (q >= span.from && q < span.to) return { p: (q - span.from) / (span.to - span.from), mirror };
  }
  return null;
}

// ── 쏟아지는 소품 ─────────────────────────────────────────────────────────

export type TitleOpeningRainKind = "dagger" | "card" | "coin";

export interface TitleOpeningRainItem {
  readonly kind: TitleOpeningRainKind;
  /** 출발점(설계 화면 px). 오른쪽 위에 몰려 있고 일부는 이미 화면 안에서 날고 있다. */
  readonly x0: number;
  readonly y0: number;
  readonly speed: number;
  readonly size: number;
  readonly spin: number;
  readonly phase: number;
}

/** 보라 카드의 소품 비. 시드가 같으면 늘 같은 비다. */
export function titleOpeningRain(): readonly TitleOpeningRainItem[] {
  const R = TITLE_ANIME_OPENING.rain;
  const rng = fxRng(R.seed);
  const kinds: readonly TitleOpeningRainKind[] = ["dagger", "dagger", "card", "coin", "coin"];
  return Object.freeze(Array.from({ length: R.count }, (_, index) => {
    const kind = kinds[Math.floor(rng() * kinds.length)] ?? "coin";
    const near = index < R.near;
    return Object.freeze({
      kind,
      x0: lerp(300, 2000, rng()),
      y0: near ? lerp(-300, 380, rng()) : lerp(-700, 520, rng()),
      speed: lerp(R.speedPxPerMs[0], R.speedPxPerMs[1], rng()) * (near ? R.nearSpeed : 1),
      size: (kind === "dagger" ? lerp(70, 130, rng()) : kind === "card" ? lerp(46, 70, rng()) : lerp(22, 38, rng()))
        * (near ? R.nearScale : 1),
      spin: lerp(-0.012, 0.012, rng()),
      phase: rng() * Math.PI * 2,
    });
  }));
}

// ── 그레이디언트 맵 ───────────────────────────────────────────────────────

/** 단색조: 휘도(0..255)마다 RGB 세 바이트. 다섯 색을 휘도 0, 0.30, 0.58, 0.82, 1 에 두고 감마 1.6 으로 어둠을 깊게 누른다. */
export function titleOpeningMonoLut(stops: readonly number[]): Uint8Array {
  const at = [0, 0.3, 0.58, 0.82, 1];
  const lut = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i += 1) {
    const l = Math.pow(i / 255, 1.6);
    let seg = 0;
    while (seg < at.length - 2 && l > (at[seg + 1] ?? 1)) seg += 1;
    const a = at[seg] ?? 0, b = at[seg + 1] ?? 1;
    const t = clamp01((l - a) / Math.max(1e-6, b - a));
    const c0 = stops[seg] ?? 0, c1 = stops[seg + 1] ?? c0;
    for (let ch = 0; ch < 3; ch += 1) {
      const shift = 16 - ch * 8;
      lut[i * 3 + ch] = Math.round(lerp((c0 >> shift) & 0xff, (c1 >> shift) & 0xff, t));
    }
  }
  return lut;
}

// ── 효과음 ────────────────────────────────────────────────────────────────

export interface TitleOpeningSoundCue {
  /** 곡 4분음표. */
  readonly q: number;
  readonly kind: TitlePrologueSound;
  readonly pitch: number;
}

const cue = (q: number, kind: TitlePrologueSound, pitch = 1): TitleOpeningSoundCue => Object.freeze({ q, kind, pitch });

/** 컷마다 한 번(효과음은 곡의 강세 위에만 얹는다). 점화 소리는 타이틀이 낸다. */
export const TITLE_OPENING_SOUND_CUES: readonly TitleOpeningSoundCue[] = Object.freeze([
  cue(0, "whoosh", 0.9), cue(1, "glint"), cue(2, "whoosh", 1.2), cue(2.5, "slam", 0.85), cue(3, "whoosh", 0.8),
  cue(4, "slam", 0.9), cue(4.75, "slam", 1.05), cue(5.3, "whoosh", 1.3), cue(5.5, "pop", 1.2), cue(5.75, "slash"),
  cue(6.25, "whoosh"), cue(7, "pop", 1.4), cue(7.5, "slash", 0.85), cue(7.75, "thump"), cue(8, "slam", 0.8),
  cue(8.75, "glint", 0.9), cue(9.5, "whoosh", 0.7), cue(11.25, "whoosh", 0.9),
]);
