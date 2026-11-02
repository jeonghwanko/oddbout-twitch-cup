import { DEFAULT_SAVE_SLOT, parseSaveSlotId, slotScopedKey } from "../app/SaveSlots";
import type { SaveSlotId } from "../app/SaveSlots";
import { STORAGE_KEYS, developmentStorageKey } from "./storageKeys";

/**
 * 지금 플레이하는 저장 슬롯의 포인터. 슬롯별 저장 파일(meta·마을 퀘스트/이야기·외형)은 키를
 * 직접 쓰지 않고 `activeSlotKey` 로 받는다.
 *
 * 캐시하지 않는다 — 매 읽기가 포인터를 다시 본다. 슬롯은 새로고침과 함께만 바뀌므로
 * (`app/SaveSlots.planSaveSlotLaunch`) 페이지 안에서 값이 흔들리지 않고, 테스트가 저장소를 갈아
 * 끼워도 낡은 슬롯을 붙들고 있지 않는다.
 */
export function activeSaveSlot(storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage): SaveSlotId {
  try {
    return parseSaveSlotId(storage?.getItem(STORAGE_KEYS.activeSaveSlot) ?? null) ?? DEFAULT_SAVE_SLOT;
  } catch {
    return DEFAULT_SAVE_SLOT;
  }
}

/** 지금 슬롯의 주소. 슬롯 1은 원래 키 그대로다. */
export function activeSlotKey(baseKey: string): string {
  return developmentStorageKey(slotScopedKey(baseKey, activeSaveSlot()));
}

export function setActiveSaveSlot(slot: SaveSlotId): boolean {
  try {
    const storage = globalThis.localStorage;
    if (storage === undefined) return false;
    storage.setItem(STORAGE_KEYS.activeSaveSlot, String(slot));
    return true;
  } catch {
    return false;
  }
}

/**
 * 슬롯 도입 이전 저장의 이관.
 *
 * 슬롯 1의 키가 원래 키 그대로이므로 옮길 진행이 없다. 여기서 하는 일은 포인터가 없거나 망가졌을
 * 때 슬롯 1을 적어 두는 것뿐이다 — 진행 키는 읽지도 쓰지도 않는다. 그래서 몇 번을 돌려도 같은
 * 결과이고(멱등), 중간에 끊겨도 잃을 것이 없다.
 */
export function migrateLegacySaveSlots(
  storage: Pick<Storage, "getItem" | "setItem"> | undefined = globalThis.localStorage,
): SaveSlotId {
  try {
    if (storage === undefined) return DEFAULT_SAVE_SLOT;
    const current = parseSaveSlotId(storage.getItem(STORAGE_KEYS.activeSaveSlot));
    if (current !== null) return current;
    storage.setItem(STORAGE_KEYS.activeSaveSlot, String(DEFAULT_SAVE_SLOT));
    return DEFAULT_SAVE_SLOT;
  } catch {
    return DEFAULT_SAVE_SLOT;
  }
}
