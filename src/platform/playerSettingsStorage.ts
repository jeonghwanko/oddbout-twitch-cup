import {
  DEFAULT_PLAYER_SETTINGS,
  parsePlayerSettings,
  serializePlayerSettings,
} from "../app/PlayerSettings";
import type { PlayerSettings } from "../app/PlayerSettings";
import { STORAGE_KEYS, playtestScopedKey } from "./storageKeys";

export const PLAYER_SETTINGS_STORAGE_KEY = STORAGE_KEYS.playerSettings;
/** Where the settings live now: the global key, or the tester's own in the KUMA playtest (each tester starts on the defaults, 2026-10-20). */
const settingsKey = (): string => playtestScopedKey(PLAYER_SETTINGS_STORAGE_KEY);

/**
 * 디스크 저장이 막힌 세션의 최신 설정. `metaStorage.sessionMeta` 와 같은 정책이다 —
 * 저장 실패를 알린 뒤 "이번 세션에만 적용됩니다" 라고 말했으면 실제로 세션 내내
 * 적용돼야 한다. 이 캐시가 없으면 설정 화면을 다시 열 때 디스크의 옛 값이 올라오고,
 * 다음 commit 이 그 옛 값을 기준으로 삼아 앞선 변경을 조용히 되돌린다.
 */
let sessionSettings: PlayerSettings | null = null;

export function loadPlayerSettings(): PlayerSettings {
  if (sessionSettings !== null) return sessionSettings;
  try {
    return parsePlayerSettings(globalThis.localStorage?.getItem(settingsKey()) ?? null);
  } catch {
    return DEFAULT_PLAYER_SETTINGS;
  }
}

export function savePlayerSettings(settings: PlayerSettings): boolean {
  try {
    const storage = globalThis.localStorage;
    if (storage === undefined) {
      sessionSettings = settings;
      return false;
    }
    storage.setItem(settingsKey(), serializePlayerSettings(settings));
    sessionSettings = null;
    return true;
  } catch {
    sessionSettings = settings;
    return false;
  }
}

export function clearPlayerSettings(): void {
  sessionSettings = null;
  try {
    globalThis.localStorage?.removeItem(settingsKey());
  } catch {
    // 저장이 막혀도 현재 세션 설정은 계속 적용한다.
  }
}
