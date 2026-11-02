import { EMPTY_ARENA_PICKS, sanitizeArenaPicks, type ArenaPickRecord } from "../app/ArenaPicks";
import { parseJsonOr, sessionBackedStore, type StoredRecord } from "./sessionBackedStore";
import { STORAGE_KEYS } from "./storageKeys";

/**
 * The winner picks on shared bouts (2026-10-24, `app/ArenaPicks`): `{ version: 1, picks }` in this browser. A per-viewer convenience like the
 * guest's record: a session copy stands in while the disk refuses, and a lost or unreadable save starts the picks over.
 */
export const ARENA_PICKS_RECORD: StoredRecord<ArenaPickRecord> = {
  key: STORAGE_KEYS.arenaPicks, version: 1, migrations: {}, parse: parseArenaPicks, serialize: record => JSON.stringify(record),
};
const store = sessionBackedStore(ARENA_PICKS_RECORD);

export function loadArenaPicks(): ArenaPickRecord {
  return store.load();
}

export function saveArenaPicks(record: ArenaPickRecord): void {
  store.save(record);
}

/** The saved record, or empty for anything else (no save, another version, a broken value). */
export function parseArenaPicks(raw: string | null): ArenaPickRecord {
  return parseJsonOr(raw, EMPTY_ARENA_PICKS, value => sanitizeArenaPicks(value) ?? EMPTY_ARENA_PICKS);
}
