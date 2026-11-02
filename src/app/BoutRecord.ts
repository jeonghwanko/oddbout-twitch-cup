/**
 * The bout record (2026-10-19, user: "공통모듈로 기록하자, guest로"): one book of 1:1 bouts the player fought in the arena — the weekly
 * tournament's matches and the direct link's practice bouts alike — kept in this browser as the guest's record (no account; the weekly
 * bracket and its prizes stay in the save, `CityTournamentProgress`). Pure: the caller stamps the time and the platform stores the text
 * (`platform/boutRecordStorage`).
 */
/** "cup": the 16강 cup representative's bout (2026-10-24, docs/Plan/2026-10-24-oddbout-cup-and-free-play 6단계 — watched or skipped). */
export type BoutRecordMode = "tournament" | "exhibition" | "duel" | "cup";

export interface BoutRecordEntry {
  /** When it ended (ms since the epoch — the caller's clock). */
  readonly at: number;
  readonly mode: BoutRecordMode;

  readonly player: string;
  readonly opponent: string;
  readonly won: boolean;
  readonly how: "ko" | "forfeit" | "decision";
  /** A symmetric AI duel is one match, credited to both fighters atomically. */
  readonly duel?: { readonly id: string; readonly seed: number; readonly hashes: readonly [string, string]; readonly digest: string };
  /** The tournament's week (`mode: "tournament"`). */
  readonly weekId?: string;
}

/** Wins and losses. */
export interface BoutRecordTally {
  readonly won: number;
  readonly lost: number;
}

export interface BoutRecordBook {
  readonly version: 1;
  /** The latest bouts, newest last, at most `BOUT_RECORD_KEEP`. */
  readonly recent: readonly BoutRecordEntry[];
  /** Every bout ever, by the character the player fought as (the recent list forgets; these do not). */
  readonly byPlayer: Readonly<Record<string, BoutRecordTally>>;
  readonly byFighter?: Readonly<Record<string, BoutRecordTally>>;
  readonly duelIds?: readonly string[];
}

export const BOUT_RECORD_KEEP = 50;

export const EMPTY_BOUT_RECORD: BoutRecordBook = Object.freeze({ version: 1, recent: Object.freeze([]), byPlayer: Object.freeze({}) });

/** The book with `entry` added (its tally counted, the recent list trimmed to `keep`). */
export function appendBoutRecord(book: BoutRecordBook, entry: BoutRecordEntry, keep = BOUT_RECORD_KEEP): BoutRecordBook {
  if (entry.mode === "duel") {
    if (!isEntry(entry)) throw new Error("invalid-duel-record");
    if (book.duelIds?.includes(entry.duel!.id)) return book;
    const byFighter = { ...book.byFighter };
    for (const [id, won] of [[entry.player, entry.won], [entry.opponent, !entry.won]] as const) {
      const tally = byFighter[id] ?? { won: 0, lost: 0 };
      byFighter[id] = Object.freeze({ won: tally.won + Number(won), lost: tally.lost + Number(!won) });
    }
    return Object.freeze({ ...book, recent: Object.freeze([...book.recent, Object.freeze({ ...entry })].slice(-Math.max(1, keep))),
      byFighter: Object.freeze(byFighter), duelIds: Object.freeze([...(book.duelIds ?? []), entry.duel!.id]) });
  }
  const tally = book.byPlayer[entry.player] ?? { won: 0, lost: 0 };
  const next = Object.freeze({ won: tally.won + (entry.won ? 1 : 0), lost: tally.lost + (entry.won ? 0 : 1) });
  return Object.freeze({
    ...book, version: 1,
    recent: Object.freeze([...book.recent, Object.freeze({ ...entry })].slice(-Math.max(1, keep))),
    byPlayer: Object.freeze({ ...book.byPlayer, [entry.player]: next }),
  });
}

/** The player's tally as `player` (none: every character together). */
export function boutRecordTally(book: BoutRecordBook, player?: string): BoutRecordTally {
  if (player !== undefined) {
    const played = book.byPlayer[player], dueled = book.byFighter?.[player];
    return { won: (played?.won ?? 0) + (dueled?.won ?? 0), lost: (played?.lost ?? 0) + (dueled?.lost ?? 0) };
  }
  return Object.values(book.byPlayer).reduce((sum, tally) => ({ won: sum.won + tally.won, lost: sum.lost + tally.lost }), { won: 0, lost: 0 });
}

/**
 * `a`'s wins and losses against `b` among the recent bouts (`BOUT_RECORD_KEEP` — the book forgets older ones): either fighter in either corner,
 * any mode (2026-10-24, the cup bracket's "이 짝 3승 1패").
 */
export function boutRecordHeadToHead(book: BoutRecordBook, a: string, b: string): BoutRecordTally {
  let won = 0, lost = 0;
  for (const entry of book.recent) {
    if (entry.player === a && entry.opponent === b) { if (entry.won) won += 1; else lost += 1; }
    else if (entry.player === b && entry.opponent === a) { if (entry.won) lost += 1; else won += 1; }
  }
  return { won, lost };
}

/** The latest bout (of `mode`, else any), or null. */
export function lastBoutRecord(book: BoutRecordBook, mode?: BoutRecordMode): BoutRecordEntry | null {
  for (let i = book.recent.length - 1; i >= 0; i--) if (mode === undefined || book.recent[i]!.mode === mode) return book.recent[i]!;
  return null;
}

/** The stored text as a book; anything unreadable is an empty book (a broken record never blocks a bout). */
export function parseBoutRecordBook(raw: string | null): BoutRecordBook {
  if (!raw) return EMPTY_BOUT_RECORD;
  try {
    const data = JSON.parse(raw) as Partial<BoutRecordBook> | null;
    if (!data || data.version !== 1 || !Array.isArray(data.recent) || typeof data.byPlayer !== "object" || data.byPlayer === null) return EMPTY_BOUT_RECORD;
    const recent = data.recent.filter(isEntry).slice(-BOUT_RECORD_KEEP).map(entry => Object.freeze({ ...entry }));
    const byPlayer: Record<string, BoutRecordTally> = {};
    for (const [player, tally] of Object.entries(data.byPlayer)) {
      if (isCount(tally?.won) && isCount(tally?.lost)) byPlayer[player] = Object.freeze({ won: tally.won, lost: tally.lost });
    }
    const byFighter: Record<string, BoutRecordTally> = {};
    if (data.byFighter && typeof data.byFighter === "object") for (const [id, tally] of Object.entries(data.byFighter)) {
      if (isCount(tally?.won) && isCount(tally?.lost)) byFighter[id] = Object.freeze({ won: tally.won, lost: tally.lost });
    }
    return Object.freeze({ version: 1, recent: Object.freeze(recent), byPlayer: Object.freeze(byPlayer),
      ...(data.byFighter ? { byFighter: Object.freeze(byFighter) } : {}),
      ...(Array.isArray(data.duelIds) ? { duelIds: Object.freeze(data.duelIds.filter(id => typeof id === "string")) } : {}) });
  } catch {
    return EMPTY_BOUT_RECORD;
  }
}

export function serializeBoutRecordBook(book: BoutRecordBook): string {
  return JSON.stringify(book);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isEntry(value: unknown): value is BoutRecordEntry {
  const entry = value as Partial<BoutRecordEntry> | null;
  return entry !== null && typeof entry === "object" && typeof entry.at === "number" && Number.isFinite(entry.at)
    && (entry.mode === "tournament" || entry.mode === "exhibition" || entry.mode === "duel" || entry.mode === "cup") && typeof entry.player === "string" && typeof entry.opponent === "string"
    && typeof entry.won === "boolean" && (entry.how === "ko" || entry.how === "forfeit" || entry.how === "decision")
    && (entry.mode !== "duel" || (entry.player !== entry.opponent && entry.duel != null && typeof entry.duel.id === "string"
      && entry.duel.id.length > 0 && isCount(entry.duel.seed) && entry.duel.seed <= 0xffffffff && Array.isArray(entry.duel.hashes) && entry.duel.hashes.length === 2
      && entry.duel.hashes.every(hash => typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash))
      && typeof entry.duel.digest === "string" && /^[a-f0-9]{8}$/.test(entry.duel.digest) && entry.how !== "forfeit"))
    && (entry.weekId === undefined || typeof entry.weekId === "string");
}
