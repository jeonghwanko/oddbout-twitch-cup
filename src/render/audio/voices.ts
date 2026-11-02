export type Wave = "sine" | "square" | "sawtooth" | "triangle";
export interface ToneVoice {
  readonly kind: "tone";
  readonly wave: Wave;
  readonly freq: number;
  readonly freqTo?: number;
  readonly durMs: number;
  readonly gain: number;
  readonly delayMs?: number;
  /** 지속 환경음만 사용한다. 생겼다 사라지는 반복 펌핑 대신 앞뒤를 겹쳐 잇는다. */
  readonly fadeInMs?: number;
  readonly fadeOutMs?: number;
}
export interface NoiseVoice {
  readonly kind: "noise";
  readonly durMs: number;
  readonly gain: number;
  readonly cutoffHz: number;
  readonly cutoffToHz?: number;
  readonly delayMs?: number;
  readonly fadeInMs?: number;
  readonly fadeOutMs?: number;
}
export type Voice = ToneVoice | NoiseVoice;
export type ClockmakerLetterCue = "rustle" | "sealCrack" | "unfold" | "quill" | "stamp";
export function clockmakerLetterVoices(cue: ClockmakerLetterCue): readonly Voice[] {
  switch (cue) {
    case "rustle":
      return [
        { kind: "noise", durMs: 220, gain: 0.18, cutoffHz: 3_400, cutoffToHz: 1_200 },
        { kind: "noise", durMs: 90, gain: 0.1, cutoffHz: 5_200, cutoffToHz: 2_600, delayMs: 140 },
      ];
    case "sealCrack":
      return [
        { kind: "noise", durMs: 45, gain: 0.3, cutoffHz: 6_000, cutoffToHz: 2_400 },
        { kind: "tone", wave: "triangle", freq: 120, freqTo: 70, durMs: 160, gain: 0.12, delayMs: 20 },
        { kind: "noise", durMs: 130, gain: 0.12, cutoffHz: 1_800, cutoffToHz: 500, delayMs: 40 },
      ];
    case "unfold":
      return [
        { kind: "noise", durMs: 300, gain: 0.2, cutoffHz: 2_600, cutoffToHz: 900 },
        { kind: "noise", durMs: 120, gain: 0.12, cutoffHz: 4_200, cutoffToHz: 1_800, delayMs: 180 },
      ];
    // 대사 블립과 배타적이다 — 둘이 겹치면 글자마다 두 소리가 난다.
    case "quill":
      return [{ kind: "noise", durMs: 26, gain: 0.07, cutoffHz: 5_600, cutoffToHz: 3_200 }];
    case "stamp":
      return [
        { kind: "tone", wave: "sine", freq: 90, freqTo: 55, durMs: 180, gain: 0.18 },
        { kind: "noise", durMs: 70, gain: 0.22, cutoffHz: 900, cutoffToHz: 300 },
        { kind: "tone", wave: "triangle", freq: 240, durMs: 60, gain: 0.06, delayMs: 30 },
      ];
  }
}
