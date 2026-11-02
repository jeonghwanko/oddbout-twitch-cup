import { rememberManor, sanitizeManorMemory } from "../sim/ManorMemoryRules";
import type { ManorExplorationState } from "../sim/ManorExplorationRules";
import type { MetaState } from "../sim/MetaProgressRules";
import { META_STORAGE_KEY, parseMeta, serializeMeta } from "../sim/MetaCodec";
import {clearPendingHomecoming} from './homecomingStorage';
import { clearVillageJourney } from './villageJourneyStorage';
import { clearCompanionJournal } from './companionStorage';
import { activeSlotKey } from "./activeSaveSlot";
import { STORAGE_KEYS } from "./storageKeys";
import { createNativeCityPlaytestMeta, nativeCityPlaytestEnabled } from "../app/NativeCityPlaytest";

/**
 * 메타 진행의 localStorage 접근을 소유하는 파일. 브라우저 API는 platform 계층만 만진다.
 *
 * sim 은 저장소를 모른다. 여기서 문자열을 읽어 MetaCodec 에 넘기고,
 * 돌려받은 순수 데이터만 sim 쪽으로 전달한다.
 * 사파리 프라이빗 모드처럼 저장이 막힌 환경에서도 게임은 계속 돌아야 한다.
 *
 * 주소는 지금 저장 슬롯의 것이다(`activeSlotKey`) — 슬롯 1은 원래 키 그대로다.
 */

let sessionMeta: MetaState | null = null;
let cityPlaytestMeta: MetaState | null = null;
/**
 * 마지막으로 해석한 저장 원문과 결과. 마을 씬은 HUD·퀘스트·조우가 한 프레임에 여러 번 진행을 읽는다 —
 * 원문(같은 슬롯 키의 같은 문자열)이 그대로면 JSON 해석·정리를 다시 하지 않고 같은 (읽기 전용) 객체를 준다.
 * 다른 탭이나 저장이 원문을 바꾸면 문자열이 달라져 다시 해석한다.
 */
let parsedCache: { readonly key: string; readonly raw: string | null; readonly meta: MetaState } | null = null;

/** `fallback` 을 주면 원문이 없거나 깨졌을 때 그것을 돌려준다(캐시하지 않는다). */
export function loadMeta(fallback?: MetaState): MetaState {
  if (nativeCityPlaytestEnabled()) return cityPlaytestMeta ??= createNativeCityPlaytestMeta();
  if (sessionMeta !== null) return sessionMeta;
  try {
    const key = activeSlotKey(META_STORAGE_KEY);
    const raw = globalThis.localStorage?.getItem(key) ?? null;
    if (fallback !== undefined) return parseMeta(raw, fallback);
    if (parsedCache !== null && parsedCache.key === key && parsedCache.raw === raw) return parsedCache.meta;
    const meta = parseMeta(raw);
    parsedCache = { key, raw, meta };
    return meta;
  } catch {
    return fallback ?? parseMeta(null);
  }
}

export function saveMeta(meta: MetaState): boolean {
  if (nativeCityPlaytestEnabled()) { cityPlaytestMeta = meta; return true; }
  try {
    const storage = globalThis.localStorage;
    if (storage === undefined) {
      sessionMeta = meta;
      return false;
    }
    storage.setItem(activeSlotKey(META_STORAGE_KEY), serializeMeta(meta));
    sessionMeta = null;
    stampSaveSlot(storage);
    return true;
  } catch {
    // 디스크 저장이 막혀도 같은 탭의 다음 씬은 최신 진행을 계속 읽는다.
    sessionMeta = meta;
    return false;
  }
}

export function clearMeta(): void {
  // city-v1 시험 하네스는 메모리 meta 만 비운다 — 저장소는 슬롯 포인터조차 읽지 않는다(마을 곁 기록은 v6 부터 meta 안에 있다).
  // test/native-city-session.test.ts 가 이 격리를 지킨다.
  if (nativeCityPlaytestEnabled()) { cityPlaytestMeta = null; return; }
  sessionMeta = null;
  clearPendingHomecoming();
  clearVillageJourney();
  clearCompanionJournal();
  try {
    globalThis.localStorage?.removeItem(activeSlotKey(META_STORAGE_KEY));
    globalThis.localStorage?.removeItem(activeSlotKey(STORAGE_KEYS.saveSlotSummary));
  } catch {
    // 무시.
  }
}

/** 타이틀 슬롯 카드의 "마지막 플레이". meta 에서 파생할 수 없는 유일한 요약이다. */
function stampSaveSlot(storage: Storage): void {
  try {
    storage.setItem(activeSlotKey(STORAGE_KEYS.saveSlotSummary), JSON.stringify({ version: 1, savedAt: Date.now() }));
  } catch {
    // 시각을 못 적어도 진행 저장은 이미 끝났다.
  }
}

/** Discovery saves patch only manor knowledge into the latest meta, never an old scene-wide snapshot. */
export function saveManorDiscovery(base: MetaState, discovery: ManorExplorationState, entered = false): { readonly meta: MetaState; readonly stored: boolean } {
  const latest = loadMeta(base);
  const currentMemory = sanitizeManorMemory(base.manorMemory);
  const storedMemory = sanitizeManorMemory(latest.manorMemory);
  const merged = rememberManor({ ...storedMemory, visits: Math.max(storedMemory.visits, currentMemory.visits) }, currentMemory);
  const meta = { ...latest, manorMemory: rememberManor(merged, discovery, entered) };
  return { meta, stored: saveMeta(meta) };
}
