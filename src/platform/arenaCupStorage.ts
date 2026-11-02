import { ARENA_CUP_SAVE_VERSION, arenaCupSavePayload, EMPTY_ARENA_CUP_SAVE, sanitizeArenaCupSave, type ArenaCupSave } from "../sim/tournament/ArenaCupRules";
import { parseJsonOr, sessionBackedStore, type StoredRecord } from "./sessionBackedStore";
import { STORAGE_KEYS } from "./storageKeys";

/**
 * The arena cup in this browser (2026-10-24, `sim/tournament/ArenaCupRules` — the bracket being built, the cup under way, each
 * representative's record). Like the guest's bout record: a session copy stands in while the disk refuses, so a cup goes on in this tab; a
 * lost or unreadable save starts empty.
 */
export const ARENA_CUP_RECORD: StoredRecord<ArenaCupSave> = {
  key: STORAGE_KEYS.arenaCup, version: ARENA_CUP_SAVE_VERSION,
  // 2: nothing waits for the archive yet (2026-10-26). 3: no registered fighter in a 2 save's cup yet (2026-10-27).
  migrations: { 1: payload => ({ ...payload, version: 2, unarchived: [] }), 2: payload => ({ ...payload, version: 3 }) },
  parse: parseArenaCupSave,
  serialize: save => JSON.stringify(arenaCupSavePayload(save)),
};
const store = sessionBackedStore(ARENA_CUP_RECORD);

export function loadArenaCupSave(): ArenaCupSave {
  return store.load();
}

/** Saves; false when the disk refused (the session copy keeps it for this tab). */
export function saveArenaCupSave(save: ArenaCupSave): boolean {
  return store.save(save);
}

/** The saved text, or the empty save for anything else (no save, another version, a broken value). */
export function parseArenaCupSave(raw: string | null): ArenaCupSave {
  return parseJsonOr(raw, EMPTY_ARENA_CUP_SAVE, sanitizeArenaCupSave);
}
