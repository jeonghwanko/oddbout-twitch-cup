import { ARENA_CUP_ARCHIVE_VERSION, arenaCupArchivePayload, EMPTY_ARENA_CUP_ARCHIVE, sanitizeArenaCupArchive, type ArenaCupArchive } from "../sim/tournament/ArenaCupArchive";
import { parseJsonOr, sessionBackedStore, type StoredRecord } from "./sessionBackedStore";
import { STORAGE_KEYS } from "./storageKeys";

/**
 * The cup archive in this browser (2026-10-24, `sim/tournament/ArenaCupArchive` — the ended cups and their bouts' records). Like the cup save:
 * a session copy stands in while the disk refuses (the archive then lasts this tab — `archiveSessionOnly` tells the screen); a lost or
 * unreadable archive starts empty.
 */
export const ARENA_CUP_ARCHIVE_RECORD: StoredRecord<ArenaCupArchive> = {
  key: STORAGE_KEYS.arenaCupArchive, version: ARENA_CUP_ARCHIVE_VERSION,
  // 2: the same shape, now marked (2026-10-26 — version 1 had taken the bouts' `rules` without a mark).
  migrations: { 1: payload => ({ ...payload, version: 2 }) },
  parse: parseArenaCupArchive,
  serialize: archive => JSON.stringify(arenaCupArchivePayload(archive)),
};
const store = sessionBackedStore(ARENA_CUP_ARCHIVE_RECORD);

export function loadArenaCupArchive(): ArenaCupArchive {
  return store.load();
}

/** Saves; false when the disk refused (the session copy keeps it for this tab). */
export function saveArenaCupArchive(archive: ArenaCupArchive): boolean {
  return store.save(archive);
}

/** The archive lives in this tab only (the disk refused it). */
export function archiveSessionOnly(): boolean {
  return store.sessionOnly();
}

/** The saved text, or the empty archive for anything else. */
export function parseArenaCupArchive(raw: string | null): ArenaCupArchive {
  return parseJsonOr(raw, EMPTY_ARENA_CUP_ARCHIVE, sanitizeArenaCupArchive);
}
