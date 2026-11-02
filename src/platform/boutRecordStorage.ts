import { appendBoutRecord, parseBoutRecordBook, serializeBoutRecordBook, type BoutRecordBook, type BoutRecordEntry } from "../app/BoutRecord";
import { sessionBackedStore, type StoredRecord } from "./sessionBackedStore";
import { STORAGE_KEYS } from "./storageKeys";

/**
 * The guest's bout record in this browser (`app/BoutRecord`, 2026-10-19). Like the player settings: a session copy stands in while the
 * disk refuses, so the screen keeps showing what was just fought; a failed save never blocks a bout.
 */
export const GUEST_BOUT_RECORD: StoredRecord<BoutRecordBook> = {
  key: STORAGE_KEYS.boutRecord, version: 1, migrations: {}, parse: parseBoutRecordBook, serialize: serializeBoutRecordBook,
};
const store = sessionBackedStore(GUEST_BOUT_RECORD);

export function loadBoutRecord(): BoutRecordBook {
  return store.load();
}

/** Adds one bout and saves; returns the new book (kept for the session when the disk refuses). */
export function recordBout(entry: BoutRecordEntry): BoutRecordBook {
  const book = appendBoutRecord(loadBoutRecord(), entry);
  store.save(book);
  return book;
}
