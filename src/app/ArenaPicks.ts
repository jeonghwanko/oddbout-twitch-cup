/**
 * 승자 찍기(2026-10-24, MUGEN 위의 Salty Bet — 조종이 없는 AI 대 AI 경기에 "내 선택이 맞을까"를 건다): 공유 링크로 연 경기는 READY 전에
 * 이길 선수를 하나 찍고, 끝나면 맞혔는지와 연속 적중 수를 본다. 이 브라우저에만 남는 기록이고 골드·승률과 상관없다.
 * Pure: the caller stamps the time and the platform stores the text (`platform/arenaPickStorage`).
 */

/** One shared bout's pick: the corner he backed, and whether it won once the bout ended (null: not seen to its end yet). */
export interface ArenaPickEntry {
  readonly key: string;
  readonly pick: 0 | 1;
  readonly hit: boolean | null;
  /** When he picked (ms since the epoch — the caller's clock). */
  readonly at: number;
}

export interface ArenaPickRecord {
  readonly version: 1;
  /**
   * Oldest first, at most `ARENA_PICK_KEEP`: a settled pick where it was settled (`settleArenaPick` moves it to the end), one not seen to
   * its end yet where it was picked.
   */
  readonly picks: readonly ArenaPickEntry[];
}

export const ARENA_PICK_KEEP = 200;

export const EMPTY_ARENA_PICKS: ArenaPickRecord = Object.freeze({ version: 1, picks: Object.freeze([]) });

/** One shared bout: its two corners, seed and the rules version its link names (null: the link did not say). Opening the link again gives the same key. */
export function arenaPickKey(a: string, b: string, seed: number, rules: number | null): string {
  return `${a}|${b}|${seed}|${rules ?? "-"}`;
}

export function arenaPickOf(record: ArenaPickRecord, key: string): ArenaPickEntry | null {
  return record.picks.find(entry => entry.key === key) ?? null;
}

/** His pick for `key` — the first only: a bout already picked keeps its pick. The oldest go past `ARENA_PICK_KEEP`. */
export function pickArenaBout(record: ArenaPickRecord, key: string, pick: 0 | 1, at: number): ArenaPickRecord {
  if (arenaPickOf(record, key)) return record;
  return { version: 1, picks: [...record.picks, { key, pick, hit: null, at }].slice(-ARENA_PICK_KEEP) };
}

/**
 * The bout `key` ended with `winner`: his pick is settled, once, and goes to the end — the run is counted in the order bouts were settled
 * (a link seen to its end later lands after the bouts settled meanwhile). A settled pick, or a bout he never picked, leaves the record as it is.
 */
export function settleArenaPick(record: ArenaPickRecord, key: string, winner: 0 | 1): ArenaPickRecord {
  const entry = arenaPickOf(record, key);
  if (!entry || entry.hit !== null) return record;
  return { version: 1, picks: [...record.picks.filter(other => other !== entry), { ...entry, hit: entry.pick === winner }] };
}

/**
 * His picks that hit in a row, counted back from the end. A miss ends the run, and so does a pick not seen to its end (a tab closed on a bout
 * going the wrong way does not save the run; leaving through the bout's own exit settles it — `ArenaDuelScene.settleLeftPick`).
 */
export function arenaPickStreak(record: ArenaPickRecord): number {
  let streak = 0;
  for (let i = record.picks.length - 1; i >= 0 && record.picks[i]!.hit === true; i--) streak++;
  return streak;
}

/**
 * The record in `value`, or null when it is not one (another version, no list). A broken entry, or a second one for a key, is dropped and the
 * rest kept; entries past the cap are dropped from the front.
 */
export function sanitizeArenaPicks(value: unknown): ArenaPickRecord | null {
  if (typeof value !== "object" || value === null || (value as { version?: unknown }).version !== 1) return null;
  const picks = (value as { picks?: unknown }).picks;
  if (!Array.isArray(picks)) return null;
  const entries: ArenaPickEntry[] = [], keys = new Set<string>();
  for (const raw of picks) {
    if (typeof raw !== "object" || raw === null) continue;
    const { key, pick, hit, at } = raw as Record<string, unknown>;
    if (typeof key !== "string" || key === "" || (pick !== 0 && pick !== 1) || (hit !== null && typeof hit !== "boolean")
      || typeof at !== "number" || !Number.isFinite(at)) continue;
    if (keys.has(key)) continue;
    keys.add(key);
    entries.push({ key, pick, hit, at });
  }
  return { version: 1, picks: entries.slice(-ARENA_PICK_KEEP) };
}
