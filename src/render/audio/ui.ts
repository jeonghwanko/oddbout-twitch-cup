import { SCENE_KEYS } from "../../app/GameFlow";
import { ARENA_UI_SFX, UI_SFX, type AudioAssetDefinition } from "../../assets/RuntimeMediaCatalog";
import type { Voice } from "./voices";

export type UiSoundKind = keyof typeof UI_SFX;
/** 화면이 쓰는 UI 소리 묶음. 무투장 화면만 `arena`다(`uiSoundSetOf`). */
export type UiSoundSet = "default" | "arena";
interface UiSound {
  readonly asset: AudioAssetDefinition;
  readonly gain: number;
  readonly fallback: readonly Voice[];
}

/**
 * 공용 버튼과 타이틀·일시정지·스토리북 메뉴가 공유하는 목재·금속 클릭.
 * 호버는 작게, 확정은 조금 또렷하게 둔다. 커서 순번으로 음높이를 바꾸지 않는다.
 * 첫 입력의 파일 디코딩 전에는 짧은 필터 노이즈만 쓴다. 크리스털 음계를 다시 섞지 않는다.
 * 재생은 SfxPlayer → AudioEngine의 기존 효과음 버스·음소거를 따른다.
 */
export const UI_SOUNDS: Readonly<Record<UiSoundKind, UiSound>> = Object.freeze({
  hover: {
    asset: UI_SFX.hover, gain: 0.16,
    fallback: [{ kind: "noise", durMs: 22, gain: 0.12, cutoffHz: 1800, cutoffToHz: 650, fadeInMs: 1 }],
  },
  press: {
    asset: UI_SFX.press, gain: 0.38,
    fallback: [{ kind: "noise", durMs: 38, gain: 0.18, cutoffHz: 2800, cutoffToHz: 850, fadeInMs: 1 }],
  },
  reject: {
    asset: UI_SFX.reject, gain: 0.32,
    fallback: [
      { kind: "noise", durMs: 45, gain: 0.18, cutoffHz: 1000, cutoffToHz: 350, fadeInMs: 2 },
      { kind: "noise", durMs: 45, gain: 0.12, cutoffHz: 850, cutoffToHz: 300, fadeInMs: 2, delayMs: 85 },
    ],
  },
  confirm: {
    asset: UI_SFX.confirm, gain: 0.46,
    fallback: [{ kind: "noise", durMs: 48, gain: 0.2, cutoffHz: 3200, cutoffToHz: 1000, fadeInMs: 1 }],
  },
});

/**
 * 무투장 화면의 호버·누름(2026-10-24, 사용자: 나무 클릭이 무투장에 어색하다). Kenney 인터페이스 팩의 음높이 없는 짧은 틱(32 ms)과
 * 딸깍(15 ms)이다. 메뉴를 빠르게 훑어도 소리가 음계처럼 이어지지 않는다. 배율은 나무 클릭과 같은 체감 크기로 맞췄다
 * (10 ms 창 RMS 상위 셋 기준: 틱 +5.7 dB → 0.16 × 0.52, 딸깍 −3.3 dB → 0.38 × 1.46). 대체음은 공용과 같다.
 * 거절·확정은 이 묶음에 없어 공용 소리를 쓴다.
 */
export const ARENA_UI_SOUNDS: Readonly<Partial<Record<UiSoundKind, UiSound>>> = Object.freeze({
  hover: { asset: ARENA_UI_SFX.hover, gain: 0.085, fallback: UI_SOUNDS.hover.fallback },
  press: { asset: ARENA_UI_SFX.press, gain: 0.55, fallback: UI_SOUNDS.press.fallback },
});

const ARENA_UI_SCENES: ReadonlySet<string> = new Set([SCENE_KEYS.arenaSelect, SCENE_KEYS.tournament, SCENE_KEYS.arena, SCENE_KEYS.arenaDuel,
  SCENE_KEYS.arenaArchive]);

/** 씬 키의 UI 소리 묶음. 무투장 고르기·대진표·경기 화면은 `arena`, 그 밖은 `default`. */
export function uiSoundSetOf(sceneKey: string): UiSoundSet {
  return ARENA_UI_SCENES.has(sceneKey) ? "arena" : "default";
}

/** 묶음의 한 소리. 묶음에 없는 소리는 공용 소리다. */
export function uiSound(kind: UiSoundKind, set: UiSoundSet = "default"): UiSound {
  return (set === "arena" ? ARENA_UI_SOUNDS[kind] : undefined) ?? UI_SOUNDS[kind];
}
