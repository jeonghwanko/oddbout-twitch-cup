import type { ArenaPublicCup, ArenaPublicCupBout } from "../platform/arenaRankings";
import type { ArenaBoutSummary } from "../sim/tournament/ArenaBoutLog";
import type { ArenaCupArchive, ArenaCupArchiveEntry } from "../sim/tournament/ArenaCupArchive";
import { ARENA_CUP_ROUNDS } from "../sim/tournament/ArenaCupRules";

/**
 * 주간 공용 컵(2026-10-27, docs/Plan/2026-10-27-oddbout-agent-world 2단계 공용 무대): 서버가 주마다 스스로 내고 직접 돌린 컵을 기록실의 한
 * 줄로 보인다. 대진표와 경기 다시 보기는 내 컵과 같고, 대표가 없다(`representative` ""). 결과는 서버의 것이다 — 이 브라우저는 같은 시드로
 * 경기를 다시 돌려 기록(하이라이트)을 달고, 지문이 서버와 같은 경기만 다시 볼 수 있다. 저장하지 않는다(이 세션의 메모리 — 기록실 저장 판을
 * 올리지 않는다).
 */

/** A public cup's archive id (`w2026-W44`): never a local cup's (eight hex digits — `arenaCupArchiveId`). */
export function publicArenaCupId(week: string): string { return `w${week}`; }

/**
 * The public cup as an archive entry: the server's bracket and winners; a bout's record only where this browser's bout of the same seed is the
 * server's (same digest — a package changed since, or other rules, keeps the result without a replay). `logged` is this browser's bout.
 */
export function publicArenaCupEntry(cup: ArenaPublicCup, rulesVersion: number, logged: (bout: ArenaPublicCupBout) => ArenaBoutSummary | null)
  : ArenaCupArchiveEntry {
  const bouts = cup.bouts.map(bout => {
    const summary = cup.rules === rulesVersion ? logged(bout) : null, same = summary !== null && summary.digest === bout.digest;
    return Object.freeze({ round: bout.round, slot: bout.slot, a: bout.a, b: bout.b, winner: bout.winner === 0 ? bout.a : bout.b,
      how: bout.how ?? (same ? summary.how : "decision"), summary: same ? summary : null, ...(cup.rules !== rulesVersion ? { rules: cup.rules } : {}) });
  });
  const final = cup.bouts.find(bout => bout.round === ARENA_CUP_ROUNDS - 1);
  return Object.freeze({ id: publicArenaCupId(cup.week), endedAt: Math.max(0, Date.parse(cup.createdAt) || 0), rulesVersion: cup.rules, seed: cup.seed,
    slots: Object.freeze([...cup.bracket]), representative: "", champion: final ? (final.winner === 0 ? final.a : final.b) : null, out: null,
    pinned: false, finalSeen: false, bouts: Object.freeze(bouts), week: cup.week });
}

let publicCups: readonly ArenaCupArchiveEntry[] = Object.freeze([]);

/** The public cups this session has, newest week first. */
export function publicArenaCups(): readonly ArenaCupArchiveEntry[] { return publicCups; }

/** Keeps `entry` (a week's cup again replaces its old one, keeping whether its final was seen). */
export function rememberPublicArenaCup(entry: ArenaCupArchiveEntry): void {
  const was = publicCups.find(cup => cup.id === entry.id);
  const kept = was?.finalSeen ? Object.freeze({ ...entry, finalSeen: true }) : entry;
  publicCups = Object.freeze([kept, ...publicCups.filter(cup => cup.id !== entry.id)].sort((x, y) => (y.week ?? "").localeCompare(x.week ?? "")));
}

/** Its final was watched (a replay of it, as the archive's own `seeArenaCupArchiveEntryFinal`). */
export function seePublicArenaCupFinal(id: string): void {
  if (publicCups.some(cup => cup.id === id && !cup.finalSeen)) {
    publicCups = Object.freeze(publicCups.map(cup => cup.id === id ? Object.freeze({ ...cup, finalSeen: true }) : cup));
  }
}

/** The archive with this session's public cups on top. */
export function withPublicArenaCups(archive: ArenaCupArchive): ArenaCupArchive {
  return publicCups.length === 0 ? archive : Object.freeze({ cups: Object.freeze([...publicCups, ...archive.cups]) });
}
