import Phaser from "phaser";
import type { RuntimeOptions } from "../../app/RuntimeOptions";
import {
  AUDIO_LEVELS,
  DEFAULT_PLAYER_SETTINGS,
  PLAYER_SETTINGS_VERSION,
  isAssistOptions,
  isVillageZoom,
  resolvedPadButtons,
} from "../../app/PlayerSettings";
import type { PlayerSettings } from "../../app/PlayerSettings";
import { isPadButtonMap } from "../../app/InputBindings";
import { loadPlayerSettings, savePlayerSettings } from "../../platform/playerSettingsStorage";
import { setActivePadButtons } from "../input/gamepad";
import { sfx } from "../audio/sfx";
import { setDomTextScale } from "../dom/domTextScale";

const SETTINGS_REGISTRY_KEY = "player-settings";
const textMetrics = new WeakMap<Phaser.GameObjects.Text, { base: number; applied: number; scale: number; size: string | number }>();

export function installAccessibilityRuntime(game: Phaser.Game): () => void {
  applyPlayerSettings(game, loadPlayerSettings());
  // 씬 update 전에 글자 크기를 확정해야 텍스트 높이를 읽어 프레임을 배치하는 HUD가
  // 한 프레임 전 높이로 겹치지 않는다.
  const apply = (): void => applyTextScale(game);
  game.events.on(Phaser.Core.Events.PRE_STEP, apply);
  return () => game.events.off(Phaser.Core.Events.PRE_STEP, apply);
}

export function applyPlayerSettings(game: Phaser.Game, settings: PlayerSettings): void {
  game.registry.set(SETTINGS_REGISTRY_KEY, settings);
  sfx.setMix(settings.effectsVolume, settings.musicVolume, settings.voiceVolume);
  sfx.setMuted(settings.muted);
  // 소리 믹스와 같은 팬아웃이다. 패드 배치도 여기서 한 번 심어야 판정과 키캡이 갈라지지 않는다.
  setActivePadButtons(resolvedPadButtons(settings));
  applyTextScale(game);
  // DOM 창(초대·개인 유물·사진 괴도)은 같은 배율을 문서 루트 변수 하나로 읽는다.
  setDomTextScale(settings.textScale);
}

/**
 * 설정 몇 칸을 바꿔 저장하고 곧장 적용한다. 저장된 최신 설정 위에 바꾼다 — 그사이 다른 화면이 바꾼 칸을 덮지 않는다(대결 HUD 의
 * 멈춤 토글·마을 줌). 저장했으면 참(사생활 모드 등에서 저장이 실패해도 이번 실행에는 적용한다).
 */
export function changePlayerSettings(game: Phaser.Game, change: (latest: PlayerSettings) => PlayerSettings): boolean {
  const next = change(loadPlayerSettings()), stored = savePlayerSettings(next);
  applyPlayerSettings(game, next);
  return stored;
}

export function playerSettingsFor(scene: Phaser.Scene): PlayerSettings {
  return checkedPlayerSettings(scene.registry.get(SETTINGS_REGISTRY_KEY));
}

export function effectiveReducedMotion(
  options: Pick<RuntimeOptions, "motionOverride" | "reducedMotion">,
  settings: PlayerSettings,
): boolean {
  if (options.motionOverride !== null) return options.motionOverride === "reduce";
  if (settings.motion === "reduce") return true;
  if (settings.motion === "full") return false;
  return options.reducedMotion;
}

function applyTextScale(game: Phaser.Game): void {
  const settings = settingsFromGame(game);
  for (const scene of game.scene.getScenes(false)) {
    visitTextObjects(scene.children.list, (text) => scaleText(text, settings.textScale));
  }
}

/**
 * 글자 하나에 지금 배율을 바로 입힌다. 화면에 올리기 전에 높이를 재서 쪽을 나누는 화면(스토리북)이 쓴다 —
 * 다음 일괄 적용은 같은 기록을 보고 다시 키우지 않는다.
 */
export function applyPlayerTextScale(scene: Phaser.Scene, text: Phaser.GameObjects.Text): Phaser.GameObjects.Text {
  scaleText(text, playerSettingsFor(scene).textScale);
  return text;
}

function visitTextObjects(
  objects: readonly Phaser.GameObjects.GameObject[],
  visit: (text: Phaser.GameObjects.Text) => void,
): void {
  for (const object of objects) {
    if (object instanceof Phaser.GameObjects.Text) visit(object);
    if (object instanceof Phaser.GameObjects.Container) visitTextObjects(object.list, visit);
  }
}

function scaleText(text: Phaser.GameObjects.Text, scale: number): void {
  const previous = textMetrics.get(text);
  // 지난번에 입힌 크기 그대로이고 배율도 같으면 할 일이 없다(매 PRE_STEP 의 대부분 — 글자 크기 문자열 해석도 건너뛴다).
  if (previous !== undefined && previous.scale === scale && previous.size === text.style.fontSize) return;
  const current = fontPixels(text.style.fontSize);
  const base = previous === undefined || Math.abs(current - previous.applied) > 0.01
    ? current
    : previous.base;
  const applied = Math.max(8, Math.round(base * scale));
  if (current !== applied) text.setFontSize(applied);
  textMetrics.set(text, { base, applied, scale, size: text.style.fontSize });
}

function fontPixels(value: string | number): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 16;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 16;
}

/** 마지막으로 검사한 설정 객체. 글자 배율·키 안내가 매 프레임 읽는다 — 같은 객체면 필드 검사를 다시 하지 않는다. */
let checkedSettings: { readonly value: unknown; readonly settings: PlayerSettings } | null = null;
function settingsFromGame(game: Phaser.Game): PlayerSettings {
  return checkedPlayerSettings(game.registry.get(SETTINGS_REGISTRY_KEY));
}
function checkedPlayerSettings(value: unknown): PlayerSettings {
  if (checkedSettings !== null && checkedSettings.value === value) return checkedSettings.settings;
  const settings = isPlayerSettings(value) ? value : DEFAULT_PLAYER_SETTINGS;
  checkedSettings = { value, settings };
  return settings;
}

function isPlayerSettings(value: unknown): value is PlayerSettings {
  if (typeof value !== "object" || value === null) return false;
  const settings = value as Partial<PlayerSettings>;
  const isLevel = (value: unknown): boolean => AUDIO_LEVELS.some((level) => level === value);
  return settings.version === PLAYER_SETTINGS_VERSION &&
    (settings.motion === "system" || settings.motion === "reduce" || settings.motion === "full") &&
    (settings.colorAssist === "off" || settings.colorAssist === "patterns") &&
    (settings.textScale === 1 || settings.textScale === 1.25 || settings.textScale === 1.5) &&
    typeof settings.muted === "boolean" &&
    isLevel(settings.effectsVolume) &&
    isLevel(settings.voiceVolume) &&
    isLevel(settings.musicVolume) &&
    (settings.subtitleMode === "story-combat" || settings.subtitleMode === "story" || settings.subtitleMode === "off") &&
    (settings.subtitleBackground === "dark" || settings.subtitleBackground === "light" || settings.subtitleBackground === "none") &&
    typeof settings.subtitleSpeakerNames === "boolean" &&
    typeof settings.subtitleDirections === "boolean" &&
    isVillageZoom(settings.villageZoom) &&
    typeof settings.keys === "object" && settings.keys !== null &&
    isPadButtonMap(settings.padButtons) &&
    isAssistOptions(settings.assist);
}
