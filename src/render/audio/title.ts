import type { TitlePrologueSound } from "../effects/webtoon/TitleWebtoonPrologueTimeline";
import type { Voice } from "./voices";

/**
 * 타이틀 장면 연출의 합성 효과음. 반복 메뉴 조작음은 ui.ts의 목재·금속 녹음을 쓴다.
 *
 * 게임 시작 스팅어는 ~1.3s로 푸시인과 같은 박자다. 종소리 배음비(1 : 2.76 : 5.4)로 크리스털 질감을 만든다.
 * 음정 재료는 E 장조 펜타토닉으로 통일해 여러 소리가 겹쳐도 부딪히지 않는다.
 */

const E5 = 659.26, GS5 = 830.61, B5 = 987.77, E6 = 1_318.51, GS6 = 1_661.22, B6 = 1_975.53, CS7 = 2_217.46, E7 = 2_637.02;
/** 등장 안내문 타자음의 작은 변주. 메뉴 커서는 이 음정을 쓰지 않는다. */
const TYPE_TICK_DETUNE = Object.freeze([0, 0.022, -0.017, 0.012]);
export const TITLE_CURSOR_COOLDOWN_MS = 45;

/** 타이틀 장면 연출용 크리스털 한 음. */
export function crystalTink(freq: number, gain: number, delayMs = 0, durMs = 110): Voice[] {
  return [
    { kind: "tone", wave: "sine", freq, durMs, gain, delayMs, fadeInMs: 2 },
    { kind: "tone", wave: "sine", freq: freq * 2.76, durMs: durMs * 0.55, gain: gain * 0.35, delayMs, fadeInMs: 2 },
    { kind: "tone", wave: "sine", freq: freq * 5.4, durMs: durMs * 0.3, gain: gain * 0.12, delayMs, fadeInMs: 1 },
  ];
}

/**
 * 게임 시작 스팅어. 손을 향해 빨려 드는 동안 공기가 말려 오르고(0~560ms),
 * 섬광 정점에서 금빛 화음이 피어나며 낮은 울림이 받친다.
 */
export function titleStartVoices(): readonly Voice[] {
  const cascade = [E6, GS6, B6, CS7, E7].flatMap((freq, index) => crystalTink(freq, 0.12, 60 + index * 45, 260));
  return [
    { kind: "noise", durMs: 560, gain: 0.2, cutoffHz: 500, cutoffToHz: 5_200, fadeInMs: 380, fadeOutMs: 90 },
    ...cascade,
    { kind: "tone", wave: "sine", freq: 82.41, freqTo: 55, durMs: 700, gain: 0.42, delayMs: 90, fadeInMs: 6 },
    { kind: "tone", wave: "sine", freq: E5, durMs: 1_100, gain: 0.11, delayMs: 110, fadeInMs: 20 },
    { kind: "tone", wave: "sine", freq: B5, durMs: 1_100, gain: 0.09, delayMs: 110, fadeInMs: 20 },
    { kind: "tone", wave: "sine", freq: GS6, durMs: 1_000, gain: 0.06, delayMs: 110, fadeInMs: 20 },
  ];
}

/**
 * 점화: 촛불이 차례로 붙는 부드러운 숨(필터 노이즈)과 크리스털 반짝임, 그 아래 따뜻한 패드.
 * 촛불 점화 스태거와 같은 순서로 울린다. 동시 재생 상한(24)을 넘지 않도록 14음 안에서 끝낸다.
 */
export function titleIgnitionVoices(): readonly Voice[] {
  const breaths: Voice[] = [0, 110, 230, 360].map((delayMs, index) => ({
    kind: "noise", durMs: 180, gain: 0.07 - index * 0.008, cutoffHz: 700, cutoffToHz: 2_300, delayMs, fadeInMs: 40,
  }));
  const sparkle = [E6, B6, GS6, E7].map((freq, index) => ({
    kind: "tone" as const, wave: "sine" as const, freq, durMs: 240, gain: 0.05, delayMs: 180 + index * 130, fadeInMs: 2,
  }));
  return [
    ...breaths,
    ...sparkle,
    { kind: "tone", wave: "triangle", freq: E5 / 2, durMs: 1_500, gain: 0.07, fadeInMs: 500, fadeOutMs: 700 },
    { kind: "tone", wave: "sine", freq: B5 / 2, durMs: 1_500, gain: 0.05, fadeInMs: 500, fadeOutMs: 700 },
  ];
}

/** 로고가 제자리에 박히는 순간: 낮은 쿵과 금속 링. */
export function titleLogoStampVoices(): readonly Voice[] {
  return [
    { kind: "tone", wave: "sine", freq: 110, freqTo: 68, durMs: 200, gain: 0.3, fadeInMs: 3 },
    { kind: "noise", durMs: 70, gain: 0.08, cutoffHz: 1_800, cutoffToHz: 600, fadeInMs: 2 },
    { kind: "tone", wave: "sine", freq: GS5 * 2, durMs: 520, gain: 0.06, fadeInMs: 3 },
    { kind: "tone", wave: "sine", freq: GS5 * 2 * 2.76, durMs: 260, gain: 0.025, fadeInMs: 2 },
  ];
}

// ── 활자 메뉴의 웹툰식 등장: 쾅·쾅·쾅, 펜 긁힘, 타자 틱, 확정 쾅 ─────────────────────

const E4 = 329.63, GS4 = 415.3, B4 = 493.88;
/** 세 행이 박히는 음높이: E 장조의 도·미·솔. 한 마디 안의 상행으로 들려 메뉴가 쌓이는 느낌을 준다. */
const ROW_SLAM_ROOTS = Object.freeze([E4, GS4, B4]);

/** 메뉴 행이 박히는 "쾅": 낮은 몸통 쿵 + 종이 찍힘 + 행마다 오르는 음정(크리스털 배음). */
export function titleRowSlamVoices(index: number): readonly Voice[] {
  const root = ROW_SLAM_ROOTS[Math.max(0, Math.min(ROW_SLAM_ROOTS.length - 1, Math.floor(index)))]!;
  return [
    { kind: "tone", wave: "sine", freq: 120, freqTo: 62, durMs: 150, gain: 0.3, fadeInMs: 2 },
    { kind: "noise", durMs: 55, gain: 0.13, cutoffHz: 3_200, cutoffToHz: 800, fadeInMs: 1 },
    { kind: "tone", wave: "triangle", freq: root, durMs: 140, gain: 0.13, fadeInMs: 2 },
    ...crystalTink(root * 2, 0.07, 0, 120),
  ];
}

/** 밑줄을 펜으로 긋는 부드러운 긁힘. 높은 대역의 숨소리 두 번이라 음악 위에서 거슬리지 않는다. */
export function titlePenStrokeVoices(): readonly Voice[] {
  return [
    { kind: "noise", durMs: 200, gain: 0.045, cutoffHz: 5_200, cutoffToHz: 2_600, fadeInMs: 25, fadeOutMs: 60 },
    { kind: "noise", durMs: 60, gain: 0.03, cutoffHz: 7_000, cutoffToHz: 4_000, delayMs: 150, fadeInMs: 4 },
  ];
}

/** 조작 안내가 글자마다 찍히는 아주 작은 틱. 결정적 변주로 기계음 반복을 피한다. */
export function titleTypeTickVoices(step = 0): readonly Voice[] {
  const detune = TYPE_TICK_DETUNE[((step % TYPE_TICK_DETUNE.length) + TYPE_TICK_DETUNE.length) % TYPE_TICK_DETUNE.length]!;
  return [
    { kind: "noise", durMs: 16, gain: 0.05, cutoffHz: 6_000, cutoffToHz: 2_500, fadeInMs: 1 },
    { kind: "tone", wave: "sine", freq: E7 * (1 + detune), durMs: 22, gain: 0.025, fadeInMs: 1 },
  ];
}

/**
 * 확정의 "쾅!": 행 쾅보다 낮고 무겁다. 게임 시작 스팅어(20음)와 한 프레임에 겹쳐도 엔진 상한(24)을
 * 넘지 않도록 세 음만 쓴다.
 */
export function titleConfirmSlamVoices(): readonly Voice[] {
  return [
    { kind: "tone", wave: "sine", freq: 98, freqTo: 46, durMs: 260, gain: 0.4, fadeInMs: 2 },
    { kind: "noise", durMs: 90, gain: 0.16, cutoffHz: 3_600, cutoffToHz: 500, fadeInMs: 1 },
    { kind: "tone", wave: "triangle", freq: E4, freqTo: 300, durMs: 180, gain: 0.12, fadeInMs: 2 },
  ];
}

// ── 첫 타이틀 웹툰 프롤로그: 베기·쾅·휙·뽁·파쇄·반짝·쿵 ─────────────────────────────

/**
 * 프롤로그 컷 하나의 효과음(박자는 `TitleWebtoonPrologueTimeline.titlePrologueSoundCues`). `pitch` 는 쾅의 음높이와
 * 칸이 붙는 뽁의 오름이다(1 = 기본). 한 박자에 베기와 쾅이 겹치고 점화(14음)가 아직 울려도 엔진 상한(24) 안에 들도록
 * 소리마다 5음 이하로 짓는다. 쾅의 몸통은 메뉴 행 쾅(`titleRowSlamVoices`)과 같은 E 장조 뿌리에서 나온다.
 */
export function titlePrologueVoices(kind: TitlePrologueSound, pitch = 1): readonly Voice[] {
  const p = Number.isFinite(pitch) && pitch > 0 ? pitch : 1;
  switch (kind) {
    case "slash":
      // 먹 붓이 종이를 가르는 높은 쉭 + 끝이 내리꽂히는 금속 스침.
      return [
        { kind: "noise", durMs: 90, gain: 0.2, cutoffHz: 9_000, cutoffToHz: 3_200, fadeInMs: 2 },
        { kind: "tone", wave: "triangle", freq: 1_800, freqTo: 600, durMs: 50, gain: 0.07, fadeInMs: 1 },
      ];
    case "slam":
      // 낮은 몸통 쿵 + 종이 찍힘 + 음높이를 실은 짧은 울림.
      return [
        { kind: "tone", wave: "sine", freq: 92 * p, freqTo: 46 * p, durMs: 220, gain: 0.38, fadeInMs: 2 },
        { kind: "noise", durMs: 60, gain: 0.14, cutoffHz: 2_400, cutoffToHz: 700, fadeInMs: 1 },
        { kind: "tone", wave: "triangle", freq: E4 * p, durMs: 110, gain: 0.08, fadeInMs: 2 },
      ];
    case "whoosh":
      // 띠·칸이 미끄러져 들어오는 바람: 대역이 위로 열린다.
      return [{ kind: "noise", durMs: 320, gain: 0.13, cutoffHz: 400, cutoffToHz: 2_400, fadeInMs: 140, fadeOutMs: 90 }];
    case "pop":
      // 페이지에 칸이 붙는 뽁. 붙는 순서대로 오른다.
      return [
        { kind: "tone", wave: "triangle", freq: 620 * p, durMs: 70, gain: 0.12, fadeInMs: 2 },
        { kind: "tone", wave: "sine", freq: 1_240 * p, durMs: 45, gain: 0.04, fadeInMs: 1 },
      ];
    case "shatter":
      // 종이 칸이 깨지는 넓은 파열 + 낮은 찢김 + 유리 같은 파편 하나.
      return [
        { kind: "noise", durMs: 480, gain: 0.2, cutoffHz: 7_000, cutoffToHz: 1_800, fadeInMs: 2 },
        { kind: "noise", durMs: 240, gain: 0.14, cutoffHz: 1_400, cutoffToHz: 400, fadeInMs: 2 },
        ...crystalTink(E7, 0.05, 30, 140),
      ];
    case "glint":
      // 달·금빛·대사 끝의 반짝: 위로 미끄러지는 사인 + 크리스털 끝음.
      return [
        { kind: "tone", wave: "sine", freq: 2_400, freqTo: 3_200, durMs: 140, gain: 0.09, fadeInMs: 2 },
        { kind: "tone", wave: "sine", freq: 3_600, durMs: 100, gain: 0.04, fadeInMs: 2 },
      ];
    case "thump":
      // 타이틀 칸이 뜨고 마지막 낱말이 박히는 깊은 쿵.
      return [
        { kind: "tone", wave: "sine", freq: 64, freqTo: 34, durMs: 350, gain: 0.45, fadeInMs: 3 },
        { kind: "noise", durMs: 120, gain: 0.18, cutoffHz: 320, cutoffToHz: 120, fadeInMs: 2 },
      ];
  }
}
