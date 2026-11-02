/**
 * A saved value's definition: its key, the payload `version` this page writes, how an older payload becomes the current one, and its text
 * codec. ODDBOUT's saves are what a player keeps — the cup records and champion collection, the archive, the picks, the costumes, the guest
 * record — so raising a `version` must carry every earlier save, never empty it (2026-10-26). `migrations[n]` turns a version-n payload into
 * a version n+1 one; `test/stored-record-migrations.test.ts` reads a saved sample of every version through them.
 */
export interface StoredRecord<T> {
  readonly key: string;
  readonly version: number;
  readonly migrations: Readonly<Record<number, (payload: Readonly<Record<string, unknown>>) => Record<string, unknown>>>;
  /** A missing (null), unreadable or foreign text → the empty value. */
  readonly parse: (raw: string | null) => T;
  readonly serialize: (value: T) => string;
}

/**
 * One saved value under one localStorage key, with a session copy that stands in while the disk refuses (2026-10-25: the arena's cup, cup
 * archive, winner picks, costumes and guest record each wrote this by hand). Loading reads the session copy first, else the disk through
 * the record's migrations and `parse`; a disk that throws reads as no save. Saving writes `serialize`'s text and drops the session copy, or
 * keeps the value as the session copy when there is no storage, it refused, or it holds a newer page's save.
 */
export interface SessionBackedStore<T> {
  load(): T;
  /** Saves; false when the disk refused (the session copy keeps it for this tab). */
  save(value: T): boolean;
  /** The value lives in this tab only (the disk refused it, or holds a newer page's save this page must not overwrite). */
  sessionOnly(): boolean;
}

/**
 * The saved text as this page's version: an older payload stepped through the record's migrations; a newer page's payload (a later release
 * open in another tab, or a rollback) is `newer` — read as no save and never overwritten, so the newer page keeps it. A step that throws on
 * a broken old save reads the same way: nothing is lost that a fixed release could still read (2026-10-26). Text without a version or that
 * is not JSON passes as it is (the record's parse empties it).
 */
export function upgradeStoredRecord(raw: string | null, record: Pick<StoredRecord<unknown>, "version" | "migrations">)
  : { readonly raw: string | null; readonly newer: boolean } {
  if (raw === null) return { raw, newer: false };
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return { raw, newer: false }; }
  const version = typeof payload === "object" && payload !== null ? (payload as { version?: unknown }).version : undefined;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1 || version === record.version) return { raw, newer: false };
  if (version > record.version) return { raw: null, newer: true };
  let stepped = payload as Record<string, unknown>;
  for (let from = version; from < record.version; from++) {
    const step = record.migrations[from];
    if (!step) return { raw, newer: false };
    try { stepped = step(stepped); } catch { return { raw: null, newer: true }; }
  }
  return { raw: JSON.stringify(stepped), newer: false };
}

export function sessionBackedStore<T>(record: StoredRecord<T>): SessionBackedStore<T> {
  let session: T | null = null;
  const disk = (): string | null => { try { return globalThis.localStorage?.getItem(record.key) ?? null; } catch { return null; } };
  return {
    load() {
      return session ?? record.parse(upgradeStoredRecord(disk(), record).raw);
    },
    save(value) {
      try {
        const storage = globalThis.localStorage;
        // No storage, or a newer page's save on the disk (checked at every save, not only at load): the value lives in this tab.
        if (storage === undefined || upgradeStoredRecord(disk(), record).newer) { session = value; return false; }
        storage.setItem(record.key, record.serialize(value));
        session = null;
        return true;
      } catch {
        session = value;
        return false;
      }
    },
    // A newer page's save on the disk keeps this tab's value off it from the first read, before any save tries (2026-10-26 review).
    sessionOnly: () => session !== null || upgradeStoredRecord(disk(), record).newer,
  };
}

/** `raw` through JSON into `decode`; `empty` for no text or text that is not JSON (a broken save). */
export function parseJsonOr<T>(raw: string | null, empty: T, decode: (value: unknown) => T): T {
  if (raw === null) return empty;
  try {
    return decode(JSON.parse(raw));
  } catch {
    return empty;
  }
}
