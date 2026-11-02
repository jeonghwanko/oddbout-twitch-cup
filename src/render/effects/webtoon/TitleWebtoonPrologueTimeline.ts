/**
 * 첫 타이틀 웹툰 프롤로그 v2 의 박자표·카메라 길·페이지 배치 (순수, 단일 원본).
 *
 * 원본은 사용자가 승인한 애니메틱(콘티 v2, 2026-10-09)이다. 애니메틱 한 박은 타이틀 곡(24마디 루프, 약 102 BPM)의
 * 점8분이다(`TITLE_PROLOGUE_SONG_BEATS_PER_BEAT`). 박 위치는 `TITLE_PROLOGUE_BEATS`(애니메틱 박 단위),
 * 박 사이의 짧은 몸짓(베기 80ms, 꽂힘 170ms …)은 `TITLE_WEBTOON_PROLOGUE`(ms·px)가 가진다. 시각 0 은 프롤로그 시작이자 타이틀 곡의 첫 박(파일 시작)이다.
 *
 * 들어오는 길은 둘이다.
 * - A(영상을 끝까지 봄): 영상 마지막 프레임(P1)에서 곧바로 시작한다.
 * - B(건너뜀·이미 봄): 지난 이야기 2박(S1–S3 세로 3기둥 + "지난 이야기" 칸 글)을 앞에 붙이고 가로 베기로 P1 에 넘어간다.
 *   B 의 시각은 A 시각 + `recapMs`(2박)다. 아래 함수의 `aMs` 는 언제나 A 기준 시각이다(B 의 지난 이야기 동안 음수).
 *
 * SysML v1.6 기반 설명용 요약 — `stm` TitleWebtoonPrologue. 괄호는 A 기준 박, 화살표는 시간 경과로 넘어감.
 *
 * ```
 * [recap −2 (B만)] → [hold 0] → [slash 1] → [columns 2] → [merge 3] → [strips 4] → [tall 5]
 *   → [punchIn 7] → [zoomOut 7.75] → [title 9.75] → [shatter 10.5] → [pan 10.75]
 *   → [opening 12] / 애니 오프닝(곡 3마디, `TitleAnimeOpeningTimeline`) → [ignite 12+O] / 타이틀 점화(하드컷)
 *   → [words 13+O] → [entrance 15+O] / 로고·활자 등장 → [exit 16+O] → [done]
 * ```
 *
 * O = `TITLE_PROLOGUE_BEATS.opening`(애니메틱 박). 오프닝 원화가 없으면 O = 0 이고 예전 박자표 그대로다(`titlePrologueSchedule`).
 * 아래 `words`·`entrance`·`wordsOut` 은 오프닝을 빼고 센 박이다 — 박자표가 O 를 더한다.
 *
 * 좌표: 몽타주는 1280×720 설계 화면 좌표, 페이지는 애니메틱의 세계 좌표(P5 칸이 설계 화면과 같은 자리)다.
 * 마지막 칸(타이틀)은 높이가 보이는 화각의 비율을 따른다 — 카메라 길 끝에서 그 칸이 화면과 1:1 로 겹친다.
 */
import { clamp, clamp01, lerp } from "../../../sim/geom.ts";
import { easeInCubic, easeInOutCubic, easeOutBackWith, easeOutCubic } from "../../art/easing.ts";
import { fxRng } from "../FxRandom.ts";
import type { ChunkFlightParams } from "./PanelShatter.ts";
import { TITLE_OPENING_SOUND_CUES } from "./TitleAnimeOpeningTimeline.ts";

export type TitlePrologueEntry = "A" | "B";

/** 진입 A 기준 박 위치(애니메틱 박). 한 박 = `titlePrologueBeatMs(곡 BPM)`. */
export const TITLE_PROLOGUE_BEATS = Object.freeze({
  slash: 1,
  columns: 2,
  merge: 3,
  strips: 4,
  /** 3띠가 다 박힌 뒤 I3 가 약 180ms, I1 이 약 380ms 읽히도록 한 박 + 4분의 1박 뒤에 세로 칸이 치솟는다. */
  tall: 5.25,
  glint: 6.5,
  punchIn: 7,
  zoomOut: 7.75,
  /** 줌아웃이 끝나는 박. 마지막 칸(타이틀)이 금빛으로 뜨고 나머지 칸이 가라앉는다. */
  zoomOutEnd: 9.75,
  shatter: 10.5,
  pan: 10.75,
  /** 타이틀 칸이 화면을 꽉 채운다 — 애니 오프닝이 시작된다(오프닝이 없으면 곧바로 점화). */
  ignite: 12,
  /** 애니 오프닝 길이: 곡 4분음표 12개(3마디) = 애니메틱 박 12 ÷ 0.75(`TITLE_PROLOGUE_SONG_BEATS_PER_BEAT`). */
  opening: 16,
  /** 대사 세 낱말이 반 박마다(곡의 점16분) 박힌다. */
  words: Object.freeze([13, 13.5, 14] as const),
  /** 로고·활자 등장 시작. 곡의 8분음표 사이(16분 하나 뒤)라 메뉴 격자는 `titleUiInkPlan` 의 `songAtStartMs` 로 곡에 맞춘다. */
  entrance: 15,
  wordsOut: 16,
  /** 3기둥·3띠가 차례로 꽂히는 4분의 1박 간격(곡의 16분음표 3/4). */
  stagger: 0.25,
  /** 진입 B 가 앞에 붙이는 지난 이야기 길이. */
  recap: 2,
  recapColumns: Object.freeze([0, 0.5, 1] as const),
  recapSlash: 1.75,
});

/**
 * 박 사이 몸짓의 ms·px 와 화면 수치. 애니메틱 값에서 출발해 2026-10-09 리뷰로 다듬었다 — 베기·띠를 짧게 해 P2·I1–I3 가
 * 읽히는 시간을 늘리고, 화면 전체 섬광은 `PROLOGUE_FLASH_MAX_ALPHA` 이하로 낮췄다(광과민).
 */
export const TITLE_WEBTOON_PROLOGUE = Object.freeze({
  /** 몽타주 설계 화면. 보이는 화각이 이 비율 이상으로 넓으면 덮고(cover), 아니면 담는다(contain). */
  frame: Object.freeze({ w: 1280, h: 720, coverMinAspect: 1.55 }),
  /** 가로 베기(안경 높이)와 위아래로 갈라지는 P1. */
  slash: Object.freeze({
    cutYFrac: 0.43, growMs: 80, splitMs: 140, fadeMs: 120, width: 12, overhangPx: 20, tiltPx: 6, splitGapPx: 30, barPx: 6,
  }),
  /** P2 웹툰 얼굴: 초점과 갈라지는 동안의 푸시인. */
  closeup: Object.freeze({ focusX: 0.58, focusY: 0.36, push: 0.3 }),
  /** P3 세로 3기둥: 위·아래·위에서 꽂히고 다음 박에 합쳐진다. */
  columns: Object.freeze({
    slamMs: 170, gutterPx: 12, focus: Object.freeze([0.17, 0.52, 0.86] as const),
    mergedFocus: Object.freeze([1 / 6, 0.5, 5 / 6] as const), creamDelayMs: 150, creamMs: 120,
    slashGrowMs: 90, slashFadeMs: 120, slashWidth: 10, framePx: 6,
  }),
  merge: Object.freeze({ closeMs: 120, punchFrom: 1.07, punchMs: 300, flashAlpha: 0.22, flashMs: 140 }),
  /** I1–I3 가로 3띠: 왼쪽·오른쪽·왼쪽에서 꽂힌다. */
  strips: Object.freeze({ slamMs: 120, creamDelayMs: 140, creamMs: 120, insetPx: 6, framePx: 6 }),
  /** P4 세로 칸: 아래에서 치솟고 칸 안에서 구두 → 얼굴·달로 훑는다. 양옆에 세로 속도선. */
  tall: Object.freeze({
    w: 520, h: 680, riseMs: 220, fromBelowPx: 40, topPx: 20, panDelayMs: 120, panLeadMs: 160, framePx: 8,
    speedLines: 22, speedSeed: 9, speedTravelPx: 2600, speedWrapPx: 300, speedLinePx: 2, speedAlpha: 0.35,
    starRadius: 70, starMs: 260, starX: 0.56, starY: 0.12,
  }),
  /** P5 풀화면 펀치 인. */
  punchIn: Object.freeze({ fromScale: 1.15, ms: 240, flashAlpha: 0.22, flashMs: 90 }),
  /** 줌아웃으로 붙는 웹툰 한 장. */
  page: Object.freeze({
    popMs: 190, popFrom: 0.86, titlePopMs: 220, titlePopFrom: 0.9, popOvershoot: 2.2,
    dimAlpha: 0.22, dimMs: 200,
    /** 점화 전 타이틀 칸의 어둠. 실제 타이틀의 점화가 이 어둠에서 출발해 이음매가 없다. */
    titleDim: 0.42,
    framePx: 10, cellFramePx: 8, cellGapPx: 20,
    titleFramePx: 18, glowPx: 10, glowGapPx: 22, glowAlpha: 0.85, glowPulseMs: 120,
    flashAlpha: 0.2, flashMs: 100,
    /** 타이틀 칸 테두리는 이동이 시작되고 이만큼 뒤부터 걷혀 칸이 화면을 채우는 순간 0 이 된다. */
    borderFadeDelayMs: 150,
  }),
  /** 줌아웃 동안 카메라가 아래(타이틀 칸 쪽)로 흘러가는 목표. */
  camera: Object.freeze({ drift: Object.freeze({ x: 660, y: 700 }) }),
  /** 타이틀 칸만 남기고 나머지 칸이 금 가고 부서진다(`PanelShatter`). 칸마다 6조각 × 8칸 = 동시 48조각. */
  shatter: Object.freeze({
    laterMs: 40, crackMs: 110, crackPx: 9, chunks: 6, seed: 101, seedStep: 7,
    shadowX: 14, shadowY: 16, outlinePx: 9, paperDelayMs: 120, paperFadeMs: 420,
  }),
  /** 대사 세 낱말: 크게 떨어져 눌렸다가 서고, 낱말마다 화면이 ±1.5° 기운다. */
  words: Object.freeze({
    dropMs: 60, settleMs: 200, fromScale: 2.3, squash: 0.92, fadeInMs: 40, slantDeg: -3,
    exitMs: 320, exitRisePx: 26, exitGrow: 0.06,
    kickDeg: 1.5, kickMs: 220,
    glintDelayMs: 420, glintMs: 180, glintFromPx: -40, glintWidthPx: 26, glintAlpha: 0.8,
    splatMs: 300, splatAlpha: 0.5, splatCount: 6, splatSeed: 31,
    shadowPx: 8, strokeRatio: 0.09, strokeMinPx: 6, gradientTop: 0.8,
    /** 글자 배율을 키워도 가장 긴 낱말의 오른쪽 끝과 보이는 화각 오른쪽 사이에 남길 여백. */
    fitMarginPx: 48,
    /** 안전 프레임(1280×720) 좌표: 낱말의 왼쪽 기준선과 글자 크기. 흰 고딕 세 줄(2026-10-17 심플 — 장식 식자를 걷었다). */
    layout: Object.freeze([
      Object.freeze({ x: 96, y: 250, size: 38 }),
      Object.freeze({ x: 96, y: 302, size: 38 }),
      Object.freeze({ x: 96, y: 384, size: 66 }),
    ]),
    /** 낱말이 서는 몸짓: 짧은 페이드와 함께 아래에서 조금 떠오른다. */
    simple: Object.freeze({ inMs: 180, risePx: 10 }),
  }),
  /** 점화와 함께 왼쪽 활자 그늘(타이틀 copy veil)이 차오르는 시간. */
  veilFadeMs: 500,
  /** 진입 B 의 지난 이야기. */
  recap: Object.freeze({ slamMs: 170, captionDelayMs: 120, slashGrowMs: 110, captionFontPx: 20 }),
});

/**
 * 파쇄 조각 비행(페이지 좌표 px/ms). 애니메틱의 속도 1.6–3.2 · 위로 0.8 · 중력 0.012 · 회전 ±0.004 를
 * `PanelShatter.chunkPoseAt` 매개변수로 옮겼다. `flyMs` 는 마지막 조각이 점화 박 전에 사라지는 길이다
 * (`shardsEnd ≤ ignite` — 점화 프레임 위에 조각이 날지 않는다).
 */
export const TITLE_PROLOGUE_FLIGHT: ChunkFlightParams = Object.freeze({
  flyMs: 440,
  gravityPxPerMs2: 0.012,
  spinRadPerMs: 0.006,
  outwardPxPerMs: 2.4,
  popUpPxPerMs: 0.8,
  fadeFrom: 0.5,
});

/** 화면 전체 섬광 불투명도 상한(광과민). 어떤 섬광도 화면을 흰빛에 가깝게 덮지 않는다. */
export const PROLOGUE_FLASH_MAX_ALPHA = 0.22;

/** 다시 보는 사람의 지름길이 시작하는 박(줌아웃). `TitleWebtoonPrologueView` 의 `startAtBeat` 로 넘긴다. */
export const TITLE_PROLOGUE_RETURNING_START_BEAT = TITLE_PROLOGUE_BEATS.zoomOut;

// ── 페이지 배치 ──────────────────────────────────────────────────────────────

export interface TitlePrologueRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export type TitleProloguePanelId = "recap" | "p1" | "p2" | "strips" | "p3" | "p4" | "i4" | "p5";

export interface TitleProloguePagePanel extends TitlePrologueRect {
  readonly id: TitleProloguePanelId;
  /** 줌아웃 중 칸이 붙는 박(P5 는 처음부터 있다). */
  readonly popBeat: number;
}

const panel = (id: TitleProloguePanelId, x: number, y: number, w: number, h: number, popBeat: number): TitleProloguePagePanel =>
  Object.freeze({ id, x, y, w, h, popBeat });

/** 애니메틱의 웹툰 한 장. P5 칸이 (0, 0, 1280, 720) — 설계 화면과 같은 자리다. 마지막 칸(타이틀)은 따로 둔다. */
export const TITLE_PROLOGUE_PAGE = Object.freeze({
  gutter: 40,
  panels: Object.freeze([
    panel("recap", -1320, -1520, 1280, 720, 9.5),
    panel("p1", 0, -1520, 1280, 720, 8.75),
    panel("p2", 1320, -1520, 1280, 720, 9.25),
    panel("strips", -1320, -760, 1280, 720, 9),
    panel("p3", 0, -760, 1280, 720, 8),
    panel("p4", 1320, -760, 1280, 1480, 8.5),
    panel("i4", -1320, 0, 1280, 720, 8.25),
    panel("p5", 0, 0, 1280, 720, 0),
  ]),
  /** 맨 아래 큰 칸 = 타이틀. 높이는 화각 비율로 정한다(`titlePrologueLayout`). */
  title: Object.freeze({ x: -1320, y: 760, w: 3920 }),
});

export interface TitlePrologueLayout {
  readonly page: TitlePrologueRect;
  readonly panels: readonly TitleProloguePagePanel[];
  readonly title: TitlePrologueRect;
}

/** 화각 비율(가로/세로)에 맞춘 페이지. 타이틀 칸의 비율이 화각과 같아 카메라 길 끝에서 화면과 1:1 로 겹친다. */
export function titlePrologueLayout(viewAspect: number): TitlePrologueLayout {
  const P = TITLE_PROLOGUE_PAGE;
  const aspect = Number.isFinite(viewAspect) && viewAspect > 0 ? viewAspect : 16 / 9;
  const title = Object.freeze({ x: P.title.x, y: P.title.y, w: P.title.w, h: P.title.w / aspect });
  const all: readonly TitlePrologueRect[] = [...P.panels, title];
  const left = Math.min(...all.map((r) => r.x)) - P.gutter;
  const top = Math.min(...all.map((r) => r.y)) - P.gutter;
  const right = Math.max(...all.map((r) => r.x + r.w)) + P.gutter;
  const bottom = Math.max(...all.map((r) => r.y + r.h)) + P.gutter;
  return { page: Object.freeze({ x: left, y: top, w: right - left, h: bottom - top }), panels: P.panels, title };
}

// ── 박자표 ──────────────────────────────────────────────────────────────────

/** 진입 A 기준 ms 박자표. */
export interface TitlePrologueSchedule {
  readonly beatMs: number;
  readonly slash: number;
  readonly columns: number;
  readonly merge: number;
  readonly strips: number;
  readonly tall: number;
  readonly glint: number;
  readonly punchIn: number;
  readonly zoomOut: number;
  readonly zoomOutEnd: number;
  readonly shatter: number;
  readonly pan: number;
  /** 타이틀 칸이 화면을 꽉 채운 시각 = 애니 오프닝 시작. */
  readonly ignite: number;
  /** 애니 오프닝 길이(ms). 오프닝이 없으면 0. */
  readonly openingMs: number;
  /** 타이틀 점화 시각 = `ignite + openingMs`. */
  readonly lit: number;
  readonly words: readonly number[];
  readonly entrance: number;
  readonly wordsOut: number;
  /** 3기둥·3띠 간격(16분음표). */
  readonly stagger: number;
  /** 진입 B 의 지난 이야기 길이 = B 시각에서 A 시각을 얻으려고 빼는 값. */
  readonly recapMs: number;
  /** B 시각(프롤로그 시작 기준)의 지난 이야기 3기둥·가로 베기. */
  readonly recapColumns: readonly number[];
  readonly recapSlash: number;
  /** 파쇄 조각이 모두 사라지는 시각. */
  readonly shardsEnd: number;
  /** 대사가 다 걷혀 프롤로그가 끝나는 시각. */
  readonly end: number;
}

/**
 * 애니메틱 한 박이 타이틀 곡의 몇 박인가: 점8분(16분음표 셋). 애니메틱은 150.2 BPM 곡에 맞춰 짰는데 지금 곡은 102 BPM 이다
 * (2026-10-17 교체). 곡의 4분음표에 붙이면 프롤로그가 47% 늘어진다. 점8분은 136 BPM 꼴로 10% 만 는다. 온 박의 컷은 곡의 16분 격자
 * 위에 떨어지고(곡 파일 시작 = 프롤로그 0 = 곡의 첫 박), 4분의 1박·반 박 자리는 격자 사이에 온다(16분음표 0.75·1.5개). 16분 격자로
 * 반올림하면 파쇄(10.5)와 패닝(10.75)이 한 칸에 겹치고 3기둥 간격이 47% 늘어 그대로 둔다.
 */
export const TITLE_PROLOGUE_SONG_BEATS_PER_BEAT = 0.75;
/** 곡을 모를 때(등록부 길이가 0) 쓰는 곡 템포. */
const FALLBACK_SONG_BPM = 102;

/** 애니메틱 한 박의 ms. `bpm` 은 타이틀 곡 템포(`titleBgmBpm`)다. */
export function titlePrologueBeatMs(bpm: number): number {
  const songBpm = bpm > 0 && Number.isFinite(bpm) ? bpm : FALLBACK_SONG_BPM;
  return (60_000 / songBpm) * TITLE_PROLOGUE_SONG_BEATS_PER_BEAT;
}

/** `opening` 이 false 면(오프닝 원화가 없다) 오프닝 없이 예전 박자표다. */
export function titlePrologueSchedule(bpm: number, opening = true): TitlePrologueSchedule {
  const beatMs = titlePrologueBeatMs(bpm);
  const B = TITLE_PROLOGUE_BEATS;
  const T = (beat: number): number => beat * beatMs;
  const openingMs = opening ? T(B.opening) : 0;
  const shatter = T(B.shatter);
  return Object.freeze({
    beatMs,
    slash: T(B.slash),
    columns: T(B.columns),
    merge: T(B.merge),
    strips: T(B.strips),
    tall: T(B.tall),
    glint: T(B.glint),
    punchIn: T(B.punchIn),
    zoomOut: T(B.zoomOut),
    zoomOutEnd: T(B.zoomOutEnd),
    shatter,
    pan: T(B.pan),
    ignite: T(B.ignite),
    openingMs,
    lit: T(B.ignite) + openingMs,
    words: Object.freeze(B.words.map((beat) => T(beat) + openingMs)),
    entrance: T(B.entrance) + openingMs,
    wordsOut: T(B.wordsOut) + openingMs,
    stagger: T(B.stagger),
    recapMs: T(B.recap),
    recapColumns: Object.freeze(B.recapColumns.map(T)),
    recapSlash: T(B.recapSlash),
    shardsEnd: shatter + TITLE_WEBTOON_PROLOGUE.shatter.laterMs + TITLE_WEBTOON_PROLOGUE.shatter.crackMs
      + TITLE_PROLOGUE_FLIGHT.flyMs,
    end: T(B.wordsOut) + openingMs + TITLE_WEBTOON_PROLOGUE.words.exitMs,
  });
}

/** 진입 시각(프롤로그 시작 기준)에서 A 기준 시각을 얻으려고 빼는 값. */
export function titlePrologueOffsetMs(schedule: TitlePrologueSchedule, entry: TitlePrologueEntry): number {
  return entry === "B" ? schedule.recapMs : 0;
}

/** 프롤로그 전체 길이(프롤로그 시작 기준). 이 시각부터 `done`. */
export function titlePrologueTotalMs(schedule: TitlePrologueSchedule, entry: TitlePrologueEntry): number {
  return titlePrologueOffsetMs(schedule, entry) + schedule.end;
}

export type TitlePrologueTimelinePhase =
  | "recap" | "hold" | "slash" | "columns" | "merge" | "strips" | "tall" | "punchIn" | "zoomOut" | "title"
  | "shatter" | "pan" | "opening" | "ignite" | "words" | "entrance" | "exit" | "done";

/** 프롤로그 시각 `ms`(진입 시작 기준)의 단계와 A 기준 시각. */
export function titlePrologueAt(
  schedule: TitlePrologueSchedule,
  entry: TitlePrologueEntry,
  ms: number,
): { readonly phase: TitlePrologueTimelinePhase; readonly aMs: number } {
  const t = Math.max(0, ms);
  const aMs = t - titlePrologueOffsetMs(schedule, entry);
  const s = schedule;
  const marks: readonly (readonly [TitlePrologueTimelinePhase, number])[] = [
    ["slash", s.slash], ["columns", s.columns], ["merge", s.merge], ["strips", s.strips], ["tall", s.tall],
    ["punchIn", s.punchIn], ["zoomOut", s.zoomOut], ["title", s.zoomOutEnd], ["shatter", s.shatter], ["pan", s.pan],
    ...(s.openingMs > 0 ? [["opening", s.ignite] as const] : []),
    ["ignite", s.lit], ["words", s.words[0] ?? s.lit], ["entrance", s.entrance], ["exit", s.wordsOut], ["done", s.end],
  ];
  if (aMs < 0) return { phase: "recap", aMs };
  let phase: TitlePrologueTimelinePhase = "hold";
  for (const [name, at] of marks) if (aMs >= at) phase = name;
  return { phase, aMs };
}

/** 구간 진행률 0..1. */
export function spanProgress(t: number, start: number, durationMs: number): number {
  return durationMs > 0 ? clamp01((t - start) / durationMs) : t >= start ? 1 : 0;
}

// ── 화면 맞춤 ────────────────────────────────────────────────────────────────

/**
 * 설계 화면(1280×720) → 보이는 화각의 배율. 넓은 가로(`coverMinAspect` 이상)는 덮고, 세로·4:3 은 담는다(망점 바탕 둘레).
 * EXPAND 화각은 언제나 1280×720 을 담으므로 담기 배율은 1 이다.
 */
export function prologueFrameScale(viewW: number, viewH: number): number {
  const F = TITLE_WEBTOON_PROLOGUE.frame;
  if (!(viewW > 0) || !(viewH > 0)) return 1;
  const cover = Math.max(viewW / F.w, viewH / F.h);
  const contain = Math.min(viewW / F.w, viewH / F.h);
  return viewW / viewH >= F.coverMinAspect ? cover : contain;
}

export interface CoverCrop extends TitlePrologueRect {
  /** 원본 텍스처 px 의 잘라 쓸 부분. 나머지(`x, y, w, h`)는 잘리기 전 그림 전체의 표시 사각형이다. */
  readonly crop: TitlePrologueRect;
}

/**
 * 그림이 `rect` 를 덮도록 놓는다. `focusX/Y` 는 그림에서 칸 가운데에 올 점(0..1), `zoom` 은 덮기 위 추가 확대.
 * 그림이 칸 밖으로 비지 않게 자리를 조인다(애니메틱 `cover`).
 */
export function coverCrop(
  texW: number, texH: number, rect: TitlePrologueRect, focusX = 0.5, focusY = 0.5, zoom = 1,
): CoverCrop {
  const s = Math.max(rect.w / texW, rect.h / texH) * Math.max(1, zoom);
  const w = texW * s;
  const h = texH * s;
  const x = clamp(rect.x + rect.w / 2 - focusX * w, rect.x + rect.w - w, rect.x);
  const y = clamp(rect.y + rect.h / 2 - focusY * h, rect.y + rect.h - h, rect.y);
  return { x, y, w, h, crop: { x: (rect.x - x) / s, y: (rect.y - y) / s, w: rect.w / s, h: rect.h / s } };
}

// ── 카메라 길 ────────────────────────────────────────────────────────────────

/** 페이지 → 월드: world = 화면 가운데 + scale·(page − (cx, cy)). */
export interface TitlePrologueCamera {
  readonly scale: number;
  readonly cx: number;
  readonly cy: number;
}

/**
 * 펀치 인(1.15 → 1) → 줌아웃(로그 보간, 아래로 흘러감) → 정지 → 타이틀 칸으로 이동. `frameScale` 은 설계 화면 배율,
 * `viewW` 는 보이는 화각 폭이다. 이동이 끝나면 배율이 `viewW / 타이틀 칸 폭`, 가운데가 타이틀 칸 가운데라
 * 타이틀 칸이 화면과 정확히 겹친다.
 */
export function titlePrologueCameraAt(
  schedule: TitlePrologueSchedule, aMs: number, layout: TitlePrologueLayout, frameScale: number, viewW: number,
): TitlePrologueCamera {
  const K = TITLE_WEBTOON_PROLOGUE;
  const F = K.frame;
  const drift = K.camera.drift;
  const title = layout.title;
  const endScale = viewW / title.w;
  const center = { x: F.w / 2, y: F.h / 2 };
  if (aMs < schedule.zoomOut) {
    const k = easeOutCubic(spanProgress(aMs, schedule.punchIn, K.punchIn.ms));
    return { scale: frameScale * lerp(K.punchIn.fromScale, 1, k), cx: center.x, cy: center.y };
  }
  if (aMs < schedule.pan) {
    const k = easeInOutCubic(spanProgress(aMs, schedule.zoomOut, schedule.zoomOutEnd - schedule.zoomOut));
    return {
      scale: Math.exp(lerp(Math.log(frameScale), Math.log(endScale), k)),
      cx: lerp(center.x, drift.x, k),
      cy: lerp(center.y, drift.y, k),
    };
  }
  const k = easeInOutCubic(spanProgress(aMs, schedule.pan, schedule.ignite - schedule.pan));
  return { scale: endScale, cx: lerp(drift.x, title.x + title.w / 2, k), cy: lerp(drift.y, title.y + title.h / 2, k) };
}

// ── 페이지 칸 ────────────────────────────────────────────────────────────────

/**
 * 칸이 붙는 팝: 0.86(타이틀 0.9) → 1 로 튀어 서고 첫 1/3 안에 다 보인다. 타이틀 칸은 배율로만 튀고 붙는 순간부터
 * 불투명하다 — 반투명한 원화 너머로 크림 종이가 비쳐 화면이 바래지 않는다.
 */
export function panelPopAt(aMs: number, popAtMs: number, title = false): { readonly scale: number; readonly alpha: number } {
  const P = TITLE_WEBTOON_PROLOGUE.page;
  const k = spanProgress(aMs, popAtMs, title ? P.titlePopMs : P.popMs);
  const alpha = title ? (aMs >= popAtMs ? 1 : 0) : clamp01(k * 3);
  return { scale: lerp(title ? P.titlePopFrom : P.popFrom, 1, easeOutBackWith(k, P.popOvershoot)), alpha };
}

/** 타이틀 칸이 뜬 뒤 나머지 칸을 덮는 어둠. */
export function panelDimAt(schedule: TitlePrologueSchedule, aMs: number): number {
  const P = TITLE_WEBTOON_PROLOGUE.page;
  return aMs > schedule.zoomOutEnd ? P.dimAlpha * spanProgress(aMs, schedule.zoomOutEnd, P.dimMs) : 0;
}

/** 종이 페이지 불투명도: 줌아웃부터 보이고 파쇄 뒤 걷힌다. */
export function paperAlphaAt(schedule: TitlePrologueSchedule, aMs: number): number {
  const Z = TITLE_WEBTOON_PROLOGUE.shatter;
  if (aMs < schedule.zoomOut) return 0;
  if (aMs < schedule.shatter) return 1;
  return 1 - easeOutCubic(spanProgress(aMs, schedule.shatter + Z.paperDelayMs, Z.paperFadeMs));
}

/** 타이틀 칸의 먹 테두리·금빛 테 불투명도(이동이 끝나는 순간 0). 금빛 테는 `glowPulse` 를 곱한다. */
export function titleBorderAt(schedule: TitlePrologueSchedule, aMs: number): { readonly border: number; readonly glow: number } {
  const P = TITLE_WEBTOON_PROLOGUE.page;
  const start = schedule.pan + P.borderFadeDelayMs;
  const border = 1 - spanProgress(aMs, start, schedule.ignite - start);
  const pulse = 0.55 + 0.45 * Math.sin((aMs - schedule.zoomOutEnd) / P.glowPulseMs);
  return { border, glow: border * P.glowAlpha * pulse };
}

/** 칸마다 파쇄가 시작되는 시각. P5 가 먼저, 나머지는 40ms 뒤. */
export function shatterStartMs(schedule: TitlePrologueSchedule, id: TitleProloguePanelId): number {
  return schedule.shatter + (id === "p5" ? 0 : TITLE_WEBTOON_PROLOGUE.shatter.laterMs);
}

/** 컷 전환의 금빛 섬광(합치기·펀치 인·타이틀 칸). 동시에 둘 이상이면 센 쪽. `PROLOGUE_FLASH_MAX_ALPHA` 를 넘지 않는다. */
export function prologueFlashAt(schedule: TitlePrologueSchedule, aMs: number): number {
  const K = TITLE_WEBTOON_PROLOGUE;
  const fade = (start: number, ms: number, alpha: number): number =>
    aMs >= start && aMs < start + ms ? alpha * (1 - (aMs - start) / ms) : 0;
  return Math.min(PROLOGUE_FLASH_MAX_ALPHA, Math.max(
    fade(schedule.merge + K.merge.closeMs, K.merge.flashMs, K.merge.flashAlpha),
    fade(schedule.punchIn, K.punchIn.flashMs, K.punchIn.flashAlpha),
    fade(schedule.zoomOutEnd, K.page.flashMs, K.page.flashAlpha),
  ));
}

/**
 * 몽타주 뒤 크림 종이의 불투명도(3기둥·합치기·3띠 동안). 기둥·띠가 덮지 않은 틈으로 비치는 밝은 면이라
 * 광과민 검사(밝기 오름 횟수)가 섬광과 함께 센다. 진입 B 의 지난 이야기 바탕은 따로다.
 */
export function prologueCreamAt(schedule: TitlePrologueSchedule, aMs: number): number {
  const K = TITLE_WEBTOON_PROLOGUE;
  if (aMs >= schedule.columns && aMs < schedule.merge) {
    return spanProgress(aMs, schedule.columns + K.columns.creamDelayMs, K.columns.creamMs);
  }
  if (aMs >= schedule.merge && aMs < schedule.merge + K.merge.closeMs) return 1;
  if (aMs >= schedule.strips && aMs < schedule.tall) {
    return spanProgress(aMs, schedule.strips + K.strips.creamDelayMs, K.strips.creamMs);
  }
  return 0;
}

// ── P4 속도선 ────────────────────────────────────────────────────────────────

export interface TallSpeedLine {
  readonly x: number;
  readonly length: number;
  readonly base: number;
  readonly speed: number;
}

/** P4 칸 양옆의 세로 속도선. 애니메틱과 같은 시드·같은 뽑기 순서라 같은 자리에 선다. */
export function tallSpeedLines(): readonly TallSpeedLine[] {
  const F = TITLE_WEBTOON_PROLOGUE.frame;
  const T = TITLE_WEBTOON_PROLOGUE.tall;
  const rng = fxRng(T.speedSeed);
  const px = (F.w - T.w) / 2;
  return Object.freeze(Array.from({ length: T.speedLines }, () => {
    const left = rng() < 0.5;
    const x = left ? rng() * (px - 40) + 20 : px + T.w + 20 + rng() * (px - 40);
    const length = 80 + rng() * 160;
    const base = rng() * F.h;
    const speed = 0.6 + rng();
    return Object.freeze({ x, length, base, speed });
  }));
}

/** 속도선 윗끝 y(설계 화면). `progress` 0..1 동안 위로 흘러 화면 밖으로 감긴다. */
export function tallSpeedLineY(line: TallSpeedLine, progress: number): number {
  const F = TITLE_WEBTOON_PROLOGUE.frame;
  const T = TITLE_WEBTOON_PROLOGUE.tall;
  const span = F.h + T.speedWrapPx;
  const raw = line.base - progress * T.speedTravelPx * line.speed;
  return (((raw % span) + span) % span) - T.speedWrapPx / 2;
}

// ── 대사 ────────────────────────────────────────────────────────────────────

/** 낱말 "쾅": 2.3 배에서 60ms 에 0.92 로 떨어져 눌렸다가 200ms 에 1 로 선다. 40ms 안에 다 보인다. */
export function wordSlamPoseAt(sinceMs: number): { readonly scale: number; readonly alpha: number } {
  const W = TITLE_WEBTOON_PROLOGUE.words;
  if (!(sinceMs >= 0)) return { scale: W.fromScale, alpha: 0 };
  const scale = sinceMs < W.dropMs
    ? lerp(W.fromScale, W.squash, easeInCubic(sinceMs / W.dropMs))
    : lerp(W.squash, 1, easeOutBackWith(clamp01((sinceMs - W.dropMs) / W.settleMs), TITLE_WEBTOON_PROLOGUE.page.popOvershoot));
  return { scale, alpha: clamp01(sinceMs / W.fadeInMs) };
}

/** 낱말이 서는 진행률 0..1(박 뒤 `simple.inMs` 동안, easeOutCubic). */
export function wordRevealAt(sinceMs: number): number {
  return sinceMs >= 0 ? easeOutCubic(clamp01(sinceMs / TITLE_WEBTOON_PROLOGUE.words.simple.inMs)) : 0;
}

/**
 * 대사 낱말의 글자 배율. 설정의 글자 배율(`textScale`)을 따르되, 가장 긴 낱말의 오른쪽 끝이 `rightLimit`(설계 화면
 * 좌표)를 넘지 않게 조이고 설계 크기보다 작게는 줄이지 않는다. `widths` 는 낱말마다 설계 크기(배율 1)의 글자 폭이다.
 */
export function titlePrologueWordScale(textScale: number, widths: readonly number[], rightLimit: number): number {
  const want = Number.isFinite(textScale) && textScale > 0 ? textScale : 1;
  const layout = TITLE_WEBTOON_PROLOGUE.words.layout;
  let fit = Number.POSITIVE_INFINITY;
  widths.forEach((width, index) => {
    if (width > 0) fit = Math.min(fit, (rightLimit - (layout[index]?.x ?? 0)) / width);
  });
  return Math.max(Math.min(1, want), Math.min(want, fit));
}

/** 배율 `scale` 의 낱말 배치: 글자를 키우고 세로 간격도 설계 화면 가운데 둘레로 같이 벌린다. 왼쪽 기준선은 그대로다. */
export function titlePrologueWordLayout(scale: number): readonly { readonly x: number; readonly y: number; readonly size: number }[] {
  const mid = TITLE_WEBTOON_PROLOGUE.frame.h / 2;
  return TITLE_WEBTOON_PROLOGUE.words.layout.map((word) =>
    Object.freeze({ x: word.x, y: mid + (word.y - mid) * scale, size: word.size * scale }));
}

/** 대사가 걷히는 진행률 0..1(위로 26px 뜨며 6% 커지고 옅어진다). */
export function wordsExitAt(schedule: TitlePrologueSchedule, aMs: number): number {
  return spanProgress(aMs, schedule.wordsOut, TITLE_WEBTOON_PROLOGUE.words.exitMs);
}

/** 낱말이 박힐 때마다 화면이 기우는 각(도). 낱말마다 −, +, − 로 번갈아 220ms 동안 0 으로 돌아온다. */
export function screenKickDeg(schedule: TitlePrologueSchedule, aMs: number): number {
  const W = TITLE_WEBTOON_PROLOGUE.words;
  let kick = 0;
  schedule.words.forEach((at, index) => {
    const since = aMs - at;
    if (since >= 0 && since < W.kickMs) kick += (index % 2 === 1 ? 1 : -1) * W.kickDeg * (1 - since / W.kickMs);
  });
  return kick;
}

/** 화면 크기 `w×h` 를 `angleRad` 만큼 돌려도 모서리가 비지 않게 하는 배율. */
export function kickCoverScale(angleRad: number, w: number, h: number): number {
  if (!(w > 0) || !(h > 0)) return 1;
  const c = Math.abs(Math.cos(angleRad));
  const s = Math.abs(Math.sin(angleRad));
  return c + s * Math.max(w / h, h / w);
}

// ── 효과음 ───────────────────────────────────────────────────────────────────

/** 프롤로그 효과음 종류. 음색은 `audio/title.ts` 의 `titlePrologueVoices` 가 소유한다. */
export type TitlePrologueSound = "slash" | "slam" | "whoosh" | "pop" | "shatter" | "glint" | "thump";

export interface TitlePrologueSoundCue {
  /** 프롤로그 시작 기준 ms. */
  readonly atMs: number;
  readonly kind: TitlePrologueSound;
  /** 쾅의 음높이·칸 뽁의 오름(1 = 기본). */
  readonly pitch: number;
}

/** 칸이 붙는 뽁은 붙는 순서대로 0.12 씩 오른다. */
const POP_PITCH_STEP = 0.12;

/** 진입별 효과음 박자. 시각 순으로 정렬돼 있다. 로고 착지·메뉴 쾅은 타이틀 등장이 따로 울린다. */
export function titlePrologueSoundCues(schedule: TitlePrologueSchedule, entry: TitlePrologueEntry): readonly TitlePrologueSoundCue[] {
  const s = schedule;
  const K = TITLE_WEBTOON_PROLOGUE;
  const offset = titlePrologueOffsetMs(s, entry);
  const cue = (atMs: number, kind: TitlePrologueSound, pitch = 1): TitlePrologueSoundCue => ({ atMs: atMs + offset, kind, pitch });
  const pops = [...TITLE_PROLOGUE_PAGE.panels].filter((p) => p.popBeat > 0).sort((a, b) => a.popBeat - b.popBeat)
    .map((p, index) => cue(p.popBeat * s.beatMs, "pop", 1 + index * POP_PITCH_STEP));
  const list: TitlePrologueSoundCue[] = [
    cue(s.slash, "slash"),
    cue(s.columns, "slash"), cue(s.columns, "slam", 0.9), cue(s.columns + s.stagger, "slam", 1), cue(s.columns + 2 * s.stagger, "slam", 1.1),
    cue(s.merge + K.merge.closeMs, "glint"),
    cue(s.strips, "slash"), cue(s.strips, "whoosh"), cue(s.strips + s.stagger, "whoosh"), cue(s.strips + 2 * s.stagger, "whoosh"),
    cue(s.tall, "whoosh"), cue(s.glint, "glint"), cue(s.punchIn, "slam", 0.8),
    ...pops,
    cue(s.zoomOutEnd, "thump"), cue(s.shatter + K.shatter.crackMs, "shatter"), cue(s.pan, "whoosh"),
    ...(s.openingMs > 0 ? TITLE_OPENING_SOUND_CUES.map((c) => cue(s.ignite + c.q * openingQuarterMs(s), c.kind, c.pitch)) : []),
    cue(s.words[0] ?? 0, "slam", 1), cue(s.words[1] ?? 0, "slam", 1.12), cue(s.words[2] ?? 0, "thump"),
    cue((s.words[2] ?? 0) + K.words.glintDelayMs, "glint"),
  ];
  if (entry === "B") {
    s.recapColumns.forEach((atMs, index) => list.push({ atMs, kind: "slam", pitch: 0.8 + index * 0.1 }));
    list.push({ atMs: s.recapSlash, kind: "slash", pitch: 1 });
  }
  return Object.freeze(list.sort((a, b) => a.atMs - b.atMs));
}

/** 오프닝 박자표의 곡 4분음표 ms(오프닝 길이 ÷ 곡 박 수). */
export function openingQuarterMs(schedule: TitlePrologueSchedule): number {
  return schedule.beatMs / TITLE_PROLOGUE_SONG_BEATS_PER_BEAT;
}

// ── 시작 박 ─────────────────────────────────────────────────────────────────

/**
 * `startAtBeat`(A 기준 박, 다시 보는 사람은 `TITLE_PROLOGUE_RETURNING_START_BEAT`)를 진입 시각(ms)으로 바꾼다.
 * 진입 B 는 지난 이야기 첫 박(−2)부터, 점화 박까지로 조인다. 곡의 박이 곧 컷의 박이므로 이 값이 그대로 박을 맞춘
 * 곡 파일의 재생 위치다.
 */
export function titlePrologueStartMs(schedule: TitlePrologueSchedule, entry: TitlePrologueEntry, startAtBeat?: number): number {
  if (startAtBeat === undefined || !Number.isFinite(startAtBeat)) return 0;
  const B = TITLE_PROLOGUE_BEATS;
  const beat = clamp(startAtBeat, entry === "B" ? -B.recap : 0, B.ignite);
  return titlePrologueOffsetMs(schedule, entry) + beat * schedule.beatMs;
}

/** 시작 시각 `startMs` 에서 처음 울릴 효과음의 순번. 그 앞의 효과음은 울리지 않는다. */
export function firstSoundCueIndex(cues: readonly TitlePrologueSoundCue[], startMs: number): number {
  const index = cues.findIndex((cue) => cue.atMs >= startMs);
  return index < 0 ? cues.length : index;
}

// ── 시계 ────────────────────────────────────────────────────────────────────

/** 프롤로그 시계(`TitlePrologueClock`) 수치. */
export const TITLE_PROLOGUE_CLOCK = Object.freeze({
  /** 음악 시계와 프레임 시계가 이만큼 벌어지면 음악으로 곧바로 맞춘다. 그 안이면 프레임마다 `pull` 만큼 당긴다. */
  snapMs: 120,
  pull: 0.15,
  /**
   * 프롤로그를 만들 때 곡 위치가 시작 시각보다 `freshLeadMs` 이하로 앞서거나 `freshLatencyMs`(출력 지연) 이하로
   * 뒤지면 함께 시작한 곡이다 — 곡의 박이 곧 컷의 박이다. 밖이면 박을 맞추지 않고 그 순간의 차이를 지켜 이어 간다.
   */
  freshLeadMs: 250,
  freshLatencyMs: 1000,
  /** 음악 시계가 이만큼 뒤로 가면 곡이 처음부터 다시 시작된 것이다 — 프롤로그는 멈추지 않고 이어 간다. */
  restartMs: 500,
  /**
   * 감시: 프레임이 흐르는데 음악 시계가 `stallMs` 동안 멈춰 있거나(숨은 탭 뒤 멈춘 AudioContext), 음악이 `snapMs`
   * 넘게 뒤처진 채 `lagMs` 가 지나면 프레임 시계로 다시 묶는다. 곡이 다시 흐르면 그 자리에서 다시 곡을 따른다.
   */
  stallMs: 250,
  lagMs: 300,
  /** 감시 시간에 세는 한 프레임의 상한. 숨은 탭에서 돌아온 긴 프레임 하나만으로는 감시가 터지지 않는다. */
  watchFrameCapMs: 100,
});

/**
 * 프롤로그 시계(순수). 프레임 시계로 예측하고 음악 시계 쪽으로 당긴다. 곡이 프롤로그와 함께 시작했으면 곡의 박이 곧
 * 컷의 박이다(출력 지연만큼 첫 화면이 조금 길어진다). 곡이 늦게 들어왔으면 그 순간의 차이를 지켜 이어 간다.
 * 음악 시계가 멈추거나 계속 뒤처지면 감시가 프레임 시계로 다시 묶는다. 시계는 되돌아가지 않는다.
 */
export class TitlePrologueClock {
  private msValue: number;
  /** 음악 시계를 프롤로그 시계로 옮기는 차이. 곡이 프롤로그와 함께 시작했으면 0. */
  private offset: number | null = null;
  private lastMusic: number | null = null;
  private stallWallMs = 0;
  private lagWallMs = 0;
  private sourceValue: "music" | "frame" = "frame";
  private reanchorCount = 0;

  /** `startMs` 는 시작 시각(`titlePrologueStartMs`), `music` 은 그 순간의 곡 재생 위치(없으면 null). */
  constructor(startMs: number, music: number | null) {
    this.msValue = Number.isFinite(startMs) ? startMs : 0;
    if (music === null || !Number.isFinite(music)) return;
    const C = TITLE_PROLOGUE_CLOCK;
    const fresh = music <= this.msValue + C.freshLeadMs && music >= this.msValue - C.freshLatencyMs;
    this.offset = fresh ? 0 : this.msValue - music;
    this.lastMusic = music;
  }

  get ms(): number { return this.msValue; }
  get source(): "music" | "frame" { return this.sourceValue; }
  /** 감시가 프레임 시계로 다시 묶은 프레임 수(진단용). */
  get reanchors(): number { return this.reanchorCount; }

  /** 벽시계 `wallMs` 가 흐른 프레임. `music` 은 곡 재생 위치(없으면 null — 프레임 시계로 흐른다). */
  step(wallMs: number, music: number | null): number {
    if (!(wallMs > 0)) return this.msValue;
    const C = TITLE_PROLOGUE_CLOCK;
    const predicted = this.msValue + wallMs;
    if (music === null || !Number.isFinite(music)) {
      this.sourceValue = "frame";
      this.stallWallMs = 0;
      this.lagWallMs = 0;
      this.msValue = predicted;
      return this.msValue;
    }
    this.offset ??= this.msValue - music;
    if (this.lastMusic !== null && music < this.lastMusic - C.restartMs) this.offset = this.msValue - music;
    const watched = Math.min(wallMs, C.watchFrameCapMs);
    this.stallWallMs = this.lastMusic !== null && music <= this.lastMusic ? this.stallWallMs + watched : 0;
    this.lastMusic = music;
    let target = music + this.offset;
    this.lagWallMs = target < predicted - C.snapMs ? this.lagWallMs + watched : 0;
    this.sourceValue = "music";
    if (this.stallWallMs > C.stallMs || this.lagWallMs > C.lagMs) {
      // 곡이 멈췄거나 계속 뒤처진다: 프레임 시계로 이어 가도록 차이를 다시 묶는다. 곡이 흐르면 이 차이로 다시 따른다.
      this.offset = predicted - music;
      this.lagWallMs = 0;
      this.reanchorCount++;
      this.sourceValue = "frame";
      target = predicted;
    }
    const error = target - predicted;
    const next = Math.abs(error) > C.snapMs ? target : predicted + error * C.pull;
    this.msValue = Math.max(this.msValue, next);
    return this.msValue;
  }
}

/** 등장 시계 따라가기(`TitleEntranceClockFollower`) 수치. */
export const TITLE_ENTRANCE_FOLLOW = Object.freeze({
  /** 한 프레임에 넘기는 등장 시간의 상한. 넘친 시간은 빚으로 남아 다음 프레임들에 나눠 넘긴다. */
  maxStepMs: 100,
  /** 빚이 이보다 크면 따라잡는 중(catchUp)이다 — 씬은 그 사이 지나간 쾅의 소리·먹 튐을 생략한다. */
  staleMs: 250,
});

/** 한 프레임에 넘길 등장 시간. `catchUp` 이면 오래 밀린 시간을 따라잡는 중이다. */
export interface TitleEntranceAdvance {
  readonly ms: number;
  readonly catchUp: boolean;
}

/**
 * 등장 시계 따라가기(순수). 프롤로그 시계로 읽은 "등장 박 뒤 경과 시간"을 받아, 등장 연출(로고·잔상·활자)에 넘길 이번
 * 프레임의 시간을 낸다. 넘기는 시간은 음수가 아니고(시계가 멈추거나 뒤로 가면 0), 한 프레임에 `maxStepMs` 를 넘지
 * 않는다. 넘친 시간은 버리지 않고 다음 프레임에 이어 넘긴다 — 넘긴 시간의 합은 시계가 흐른 시간을 따라가 박에 다시 붙는다.
 */
export class TitleEntranceClockFollower {
  private lastMs: number;
  private owedMs = 0;

  /** `startMs` 는 등장을 만들 때 이미 넘긴 경과 시간(프롤로그의 `leadMs`). */
  constructor(startMs: number) {
    this.lastMs = Number.isFinite(startMs) ? startMs : 0;
  }

  /** 아직 넘기지 못한 시간(진단·시험용). */
  get owed(): number { return this.owedMs; }

  /** `readingMs` 는 이번 프레임에 읽은 등장 경과 시간. 읽지 못했으면(null) 밀린 빚만 넘긴다. */
  advance(readingMs: number | null): TitleEntranceAdvance {
    const F = TITLE_ENTRANCE_FOLLOW;
    if (readingMs !== null && Number.isFinite(readingMs) && readingMs > this.lastMs) {
      this.owedMs += readingMs - this.lastMs;
      this.lastMs = readingMs;
    }
    const catchUp = this.owedMs > F.staleMs;
    const ms = Math.min(this.owedMs, F.maxStepMs);
    this.owedMs -= ms;
    return { ms, catchUp };
  }
}

// ── 화각 변화 ────────────────────────────────────────────────────────────────

/** 프롤로그를 끝내는 화각 변화의 문턱. */
export const TITLE_PROLOGUE_RESIZE = Object.freeze({
  /** 이 px 이하의 차이는 같은 크기다. */
  samePx: 2,
  /** 폭이 같고 높이만 이 비율 미만으로 바뀌면(주소창·도구 막대) 이어 간다. */
  heightOnlyFrac: 0.12,
  /** 두 변 모두 이 비율 미만으로 바뀌면 이어 간다. */
  bothFrac: 0.04,
});

/**
 * 캔버스 크기 변화가 프롤로그를 끝낼 만큼 큰가. 가로·세로 방향이 뒤집히거나 크게 바뀌면 끝낸다 — 칸 배치가 화각
 * 비율에 묶여 있다. 작은 변화는 처음 배치를 그대로 두고 이어 간다(타이틀 칸의 마지막 맞춤이 몇 % 어긋날 뿐이다).
 */
export function prologueResizeEnds(
  from: { readonly w: number; readonly h: number }, to: { readonly w: number; readonly h: number },
): boolean {
  if (!(from.w > 0 && from.h > 0 && to.w > 0 && to.h > 0)) return true;
  if ((from.w >= from.h) !== (to.w >= to.h)) return true;
  const R = TITLE_PROLOGUE_RESIZE;
  const dw = Math.abs(to.w - from.w), dh = Math.abs(to.h - from.h);
  if (dw <= R.samePx && dh <= R.samePx) return false;
  if (dw <= R.samePx) return dh / from.h >= R.heightOnlyFrac;
  return dw / from.w >= R.bothFrac || dh / from.h >= R.bothFrac;
}
