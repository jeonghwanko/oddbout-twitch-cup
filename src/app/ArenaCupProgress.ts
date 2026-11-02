import { loadArenaCupSave, saveArenaCupSave } from "../platform/arenaCupStorage";
import { loadArenaCupArchive, saveArenaCupArchive } from "../platform/arenaCupArchiveStorage";
import { recordBout } from "../platform/boutRecordStorage";
import type { ArenaBoutSummary } from "../sim/tournament/ArenaBoutLog";
import { archiveArenaCup, arenaCupArchiveEntry, arenaCupArchiveId, pinArenaCupArchive, seeArenaCupArchiveFinal, type ArenaCupArchive,
  type ArenaCupArchiveEntry } from "../sim/tournament/ArenaCupArchive";
import {
  ARENA_CUP_UNARCHIVED, abandonArenaCup, arenaCupCeremonyDue, arenaCupSpectatedCheerDue, arenaCupBoutKey, arenaCupDex, arenaCupDraftIssue, carryArenaCupRules, arenaCupFinished, arenaCupKnockout, arenaCupSpectateQueue, revealArenaCupBouts, arenaCupUnlogged, arenaCupUntouched, noteArenaCupBout, arenaCupMatch, arenaCupNextMatch, arenaCupOutcome, countArenaCup, createArenaCup,
  pruneArenaCupDraft, putArenaCupRepresentative, recordArenaCupBout, startingArenaCupDraft,
  type ArenaCupBoutKey, type ArenaCupDraft, type ArenaCupHow, type ArenaCupRecords, type ArenaCupSave, type ArenaCupState,
} from "../sim/tournament/ArenaCupRules";
import { recordCityTournamentMatch, type CityTournamentResolver } from "../sim/tournament/CityTournamentRules";
import { ARENA_PLAYABLE, arenaPlayable, arenaPlayables } from "./ArenaRoster";
import { CITY_TOURNAMENT, cityTournamentEntrant } from "./CityTournamentProgress";

/**
 * 무투장 16강 컵의 진행(2026-10-24, docs/Plan/2026-10-24-oddbout-cup-and-free-play 1단계). 규칙은 `sim/tournament/ArenaCupRules`, 저장은
 * `platform/arenaCupStorage` 가 소유한다. 여기서는 후보를 정하고, 컵 시드를 굴리고, 대진·결과·기록을 저장에 건다. 화면 없는 경기의 결과는
 * 부르는 쪽이 준다(`cityTournamentBoutResolver` — 선수들의 원화 팩이 들어와 있어야 한다).
 *
 * 출전자의 경기 몸은 화면 경기와 같은 `cityTournamentEntrant` 다. 그래서 같은 경기 시드의 화면 경기와 화면 없는 결과가 같다.
 */


export const ARENA_CUP_CANDIDATES: readonly string[] = Object.freeze(ARENA_PLAYABLE.map(playable => playable.id));

/**
 * 대진에 설 수 있는 선수(2026-10-27 내 선수 출전 — docs/Plan/2026-10-27-oddbout-agent-world 1단계): 공식 명단과 이 브라우저의 내 선수
 * (제작자 페이지가 넘긴 등록 선수 UUID, `platform/arenaMyFighterStorage`). 내 선수는 고르기 화면에서 첫 칸의 대표로만 들어온다.
 */
export function arenaCupEntrants(): readonly string[] {
  return ARENA_CUP_CANDIDATES;
}

/**
 * 고르기 화면의 얼굴(2026-10-27, 2단계 공용 무대): 공식 명단, AI 대결이 승인된 내 선수(`mine` 순서), 그리고 커뮤니티 선수 — 남이 만든 승인된
 * 등록 선수, 서버 순서(최신 먼저)로 `community` 명까지. 커뮤니티 선수를 고르면 그도 이 브라우저의 컵 선수가 된다(`rememberArenaMyFighter`).
 */
export function arenaCupPickIds(mine: readonly string[], community: number): readonly string[] {
  const admitted = (id: string) => { const playable = arenaPlayable(id); return playable?.kind === "registered" && playable.duelApproved === true; };
  const own = mine.filter(admitted);
  const others = arenaPlayables().map(playable => playable.id).filter(id => admitted(id) && !own.includes(id)).slice(0, community);
  return [...ARENA_CUP_CANDIDATES, ...own, ...others];
}

/** 우승 도감: 공식 명단 가운데 우승한 선수(내 선수의 우승은 그 선수의 기록에만 남는다 — 도감의 칸은 명단의 수다). */
export function arenaCupRosterDex(records: ArenaCupRecords): readonly string[] {
  return arenaCupDex(records).filter(id => ARENA_CUP_CANDIDATES.includes(id));
}

/** 등록 선수의 지금 패키지 해시(무투장 명단에 들어온 것), 아니면 null — 컵이 그 해시로 그의 경기를 고정한다(`createArenaCup`). */
function registeredManifest(id: string): string | null {
  const playable = arenaPlayable(id);
  return playable?.kind === "registered" ? playable.manifestSha256 : null;
}

/** 지금의 컵 저장. */
export type ArenaCupProgress = ArenaCupSave;

/**
 * 진행 중인 컵을 이 페이지가 새 규칙 판으로 넘겼다(2026-10-26): 첫 화면이 한 번 알린다(`takeArenaCupRulesNotice`). 저장의 값이 아니라 이
 * 페이지의 신호다 — 컵은 처음 읽을 때 넘어가고 그 자리에서 적히므로, 저장에서 "바뀌었다"를 다시 읽을 수 없다(누가 먼저 읽든 — 무투장 첫 씬은
 * 부팅 때 필드 초기화에서 읽는다).
 */
let rulesNotice = false;

/** 기록실을 기다리는 끝난 컵(`ArenaCupSave.unarchived`)을 이 페이지에서 다시 넣어 봤다(한 번 — 거절하는 기록실에 프레임마다 쓰지 않게). */
let unarchivedTried = false;

/** 넘긴 컵이 있었으면 true 를 한 번 돌려주고 지운다. */
export function takeArenaCupRulesNotice(): boolean {
  const notice = rulesNotice;
  rulesNotice = false;
  return notice;
}

/** 컵 시드(32비트). 브라우저 난수다 — sim 은 받기만 한다. */
export function newArenaCupSeed(random: () => number = Math.random): number {
  return Math.floor(random() * 0x1_0000_0000) >>> 0;
}

/**
 * 저장된 컵. 명단에서 빠진 선수는 대진에서 뺀다. 지난 규칙 판의 컵은 이어 간다(2026-10-26, `carryArenaCupRules` — 남은 경기만 새 판).
 * 이어 간 컵은 그 자리에서 적고, 남은 경기가 있으면 첫 화면이 알린다(`takeArenaCupRulesNotice`). 기록실을 기다리는 끝난 컵은 페이지마다 한 번
 * 다시 넣어 본다.
 */
export function currentArenaCup(rulesVersion: number = CITY_TOURNAMENT.rulesVersion): ArenaCupProgress {
  const save = archiveWaiting(loadArenaCupSave());
  const cup = save.cup && carryArenaCupRules(save.cup, rulesVersion);
  // Carried once: the next read is on the new rules. A cup with bouts left tells — the representative's too after his loss (he watches the rest).
  const progress = Object.freeze({ draft: pruneArenaCupDraft(save.draft, arenaCupEntrants()), cup, records: save.records, unarchived: save.unarchived });
  if (cup === save.cup) return progress;
  saveArenaCupSave(Object.freeze({ draft: save.draft, cup, records: save.records, unarchived: save.unarchived }));
  if (cup && !arenaCupFinished(cup)) rulesNotice = true;
  // An ended cup whose last record the carry closed has nothing left to fill: into the archive now (no step would bring it there).
  return archiveWhenDone(progress);
}

/** 기록실을 기다리는 끝난 컵을 기록실에 넣는다(페이지에서 한 번). 들어갔으면 저장에서 지운다. */
function archiveWaiting(save: ArenaCupSave): ArenaCupSave {
  if (unarchivedTried || save.unarchived.length === 0) return save;
  unarchivedTried = true;
  const archive = save.unarchived.reduce((into, cup) => archiveArenaCup(into, arenaCupArchiveEntry(cup, Date.now())), loadArenaCupArchive());
  if (!saveArenaCupArchive(archive)) return save;
  const next = Object.freeze({ ...save, unarchived: Object.freeze([]) });
  saveArenaCupSave(next);
  return next;
}

function commit(next: ArenaCupSave): ArenaCupProgress {
  const save: ArenaCupSave = Object.freeze({ draft: next.draft, cup: next.cup, records: next.records, unarchived: next.unarchived });
  saveArenaCupSave(save);
  return save;
}

/** 컵이 진행 중이다(대진이 잠겨 있다). */
export function arenaCupInPlay(cup: ArenaCupState | null): cup is ArenaCupState {
  return cup !== null && arenaCupOutcome(cup) === "playing";
}

/**
 * 진행 중인 컵의 대진이 잠겼다: 경기가 하나라도 정해졌다. 시작만 하고 경기가 없는 컵은 고칠 수 있다(2026-10-24 사용자: "대진을 변경할 수
 * 있게 해줘") — 고치면 컵이 짠 대진으로 돌아간다(`editArenaCupDraft`).
 */
export function arenaCupLocked(cup: ArenaCupState | null): cup is ArenaCupState {
  return arenaCupInPlay(cup) && !arenaCupUntouched(cup);
}

/**
 * 대진을 고친다. 잠긴 컵(`arenaCupLocked`)이면 그대로다. 경기가 없는 컵은 고친 대진과 함께 짠 대진으로 돌아간다(도전으로 세지 않는다 —
 * 다시 `16강 시작`). 끝난 컵(대진표에 결과를 보이던 컵)도 고치면 지운다 — 기록은 이미 셌다.
 */
export function editArenaCupDraft(edit: (draft: ArenaCupDraft) => ArenaCupDraft): ArenaCupProgress {
  const now = currentArenaCup();
  if (arenaCupLocked(now.cup)) return now;
  const draft = edit(now.draft);
  if (draft === now.draft) return now;
  // An ended cup leaves the save here: into the archive first, with what it has (its records may still be filling in).
  return commit({ ...now, draft, cup: null, unarchived: archiveEnded(now) });
}

/**
 * 첫 씬이 여는 대진. 짠 대진이 비었으면 `representative` 를 대표로 두고 나머지를 무작위로 채운 대진을 놓는다(바로 시작할 수 있다).
 * `focus`(홈의 선수 프로필에서 들어옴)가 있으면 그를 대표로 둔다(`putArenaCupRepresentative`). 컵이 진행 중이면 그대로다.
 */
export function openArenaCupDraft(representative: string | null, focus: string | null = null, seed: number = newArenaCupSeed()): ArenaCupProgress {
  const now = currentArenaCup();
  if (arenaCupInPlay(now.cup)) return now;
  const known = (id: string | null) => id !== null && ARENA_CUP_CANDIDATES.includes(id) ? id : null;
  let draft = now.draft.slots.every(id => id === null)
    ? startingArenaCupDraft(ARENA_CUP_CANDIDATES, known(focus) ?? known(representative), seed) : now.draft;
  const wanted = known(focus);
  if (wanted !== null) draft = putArenaCupRepresentative(draft, wanted, seed);
  return draft === now.draft ? now : commit({ ...now, draft });
}

/**
 * 짠 대진으로 컵을 시작한다. 진행 중인 컵이 있거나 대진을 시작할 수 없으면 null. 끝난 컵은 새 컵으로 바뀐다 — 아직 기록실에 남지 않았으면
 * (대표 경기의 기록을 채우기 전) 있는 기록만으로 남긴다. `ticket`: 서버가 `seed` 와 함께 준 컵 표(2026-10-26 — 그 시드와만 짝이다). 화면은
 * 이것을 직접 부르지 않는다 — 표를 먼저 묻는 `ArenaCupStart.beginArenaCup` 을 거친다.
 */
export function startArenaCup(seed: number = newArenaCupSeed(), ticket?: string): ArenaCupState | null {
  const now = currentArenaCup();
  if (arenaCupInPlay(now.cup)) return null;
  const cup = createArenaCup(now.draft, arenaCupEntrants(), id => cityTournamentEntrant(id), seed, CITY_TOURNAMENT.rulesVersion, ticket,
    registeredManifest);
  if (!cup) return null;
  commit({ ...now, cup, unarchived: archiveEnded(now) });
  return cup;
}

/** 대표가 지금 싸울 경기의 열쇠(없으면 null) — 화면 경기로 들어갈 때 싣는다. 경기 시드는 `arenaCupBoutSeed(key)` 다. */
export function currentArenaCupBout(): ArenaCupBoutKey | null {
  const cup = currentArenaCup().cup;
  return cup ? arenaCupBoutKey(cup) : null;
}

/**
 * 대표 경기의 결과를 적는다(화면 경기가 끝났을 때). 지금 컵의 같은 경기가 아니면 아무것도 적지 않는다. 컵이 끝났으면 대표의 기록에
 * 센다. 같은 라운드의 다른 경기는 적지 않는다 — `stepArenaCup`(프레임마다 하나)이 정한다. 적었으면 그 경기의 금화를 계정에 청한다
 * (`arenaCupBoutGold`, 경기마다 한 번 — 2026-10-27 G1, 이 계정에 묶인 표의 컵만 — 계정 금화). `gold` 는 지금 받은 금화(0: 적지 않았거나 이미 받은
 * 경기, 금화가 없는 컵)다.
 */
export function recordArenaCupResult(key: ArenaCupBoutKey, winner: string, how: ArenaCupHow)
  : { readonly recorded: boolean; readonly progress: ArenaCupProgress; readonly gold: number } {
  const now = currentArenaCup();
  if (!now.cup) return { recorded: false, progress: now, gold: 0 };
  const cup = recordArenaCupBout(now.cup, key, winner, how);
  if (cup === now.cup) return { recorded: false, progress: now, gold: 0 };
  const counted = countArenaCup(now.records, cup);
  const progress = archiveWhenDone(commit({ ...now, cup: counted.cup, records: counted.records }));
  // One entry point for watched and skipped bouts; replays and duplicate callbacks are rejected above.
  recordArenaCupGuestBout(cup.representative, key, winner, how === "ko" ? "ko" : "decision");
  return { recorded: true, progress, gold: 0 };
}

/**
 * 대표 경기를 게스트 전적(`BoutRecord`)에 "컵"으로 적는다(6단계 — 화면 경기가 끝났을 때, 결과만 보기). 컵에 적힌 경기만 부른다(같은 경기를
 * 두 번 적지 않게 — `recordArenaCupResult` 의 `recorded`).
 */
function recordArenaCupGuestBout(representative: string, key: ArenaCupBoutKey, winner: string, how: "ko" | "decision"): void {
  recordBout({ at: Date.now(), mode: "cup", player: representative, opponent: key.a === representative ? key.b : key.a, won: winner === representative, how });
}

/** 대표 경기를 화면 없이 정해 적는다(일시정지의 "결과로 건너뛰기" — 같은 시드·같은 엔진이라 화면 경기와 같은 결과다). */
export function skipArenaCupBout(resolve: CityTournamentResolver)
  : { readonly recorded: boolean; readonly progress: ArenaCupProgress; readonly gold: number } {
  const now = currentArenaCup(), cup = now.cup, match = cup ? arenaCupMatch(cup) : null, key = cup ? arenaCupBoutKey(cup) : null;
  if (!cup || !match || !key) return { recorded: false, progress: now, gold: 0 };
  const result = resolve(cup, match);
  if (result.how === "bye" || result.how === "forfeit") return { recorded: false, progress: now, gold: 0 };
  return recordArenaCupResult(key, result.winner, result.how);
}

/** 화면 없이 정할 경기 하나를 정한다(화면이 프레임마다 하나씩 부른다). 정했으면 true, 정할 경기가 없으면 false. */
export function stepArenaCup(resolve: CityTournamentResolver): boolean {
  const now = currentArenaCup(), cup = now.cup, match = cup ? arenaCupNextMatch(cup) : null;
  if (!cup || !match) return false;
  const result = resolve(cup, match);
  const next = recordCityTournamentMatch(cup, match.round, match.slot, result.winner, result.how);
  if (next === cup) return false;
  archiveWhenDone(commit({ ...now, cup: next }));
  return true;
}

/**
 * 경기 하나의 기록(`ArenaBoutLog`)을 지금 컵에 단다 — 컵 시드와 그 라운드·칸의 두 선수가 맞을 때만. 컵이 다 끝났고 모든 경기의 기록이
 * 찼으면 기록실에 남긴다(한 번).
 */
export function noteCurrentArenaCupBout(seed: number, round: number, slot: number, a: string, b: string, summary: ArenaBoutSummary | null): ArenaCupProgress {
  const now = currentArenaCup();
  if (!now.cup || now.cup.seed !== seed) return now;
  const cup = noteArenaCupBout(now.cup, round, slot, a, b, summary);
  return cup === now.cup ? now : archiveWhenDone(commit({ ...now, cup }));
}

/**
 * 끝난 컵이 아직 기록실에 없으면 있는 기록만으로 남긴다(다음 컵이 그 자리를 덮기 전에). 기록실이 받지 않으면 기다리는 컵(`unarchived`)에
 * 둔다 — 그 컵이 저장에서 사라지지 않게(2026-10-26 리뷰: 새 컵이 덮어 잃었다). 돌려주는 값은 다음 저장의 `unarchived` 다.
 */
function archiveEnded(now: ArenaCupProgress): readonly ArenaCupState[] {
  const cup = now.cup;
  if (!cup || cup.archived || !arenaCupFinished(cup)) return now.unarchived;
  if (saveArenaCupArchive(archiveArenaCup(loadArenaCupArchive(), arenaCupArchiveEntry(cup, Date.now())))) return now.unarchived;
  return Object.freeze([...now.unarchived.filter(waiting => waiting.seed !== cup.seed), cup].slice(-ARENA_CUP_UNARCHIVED));
}

/** 컵이 다 끝났고 기록이 다 찼으면 기록실에 남기고 남겼다고 적는다. */
function archiveWhenDone(now: ArenaCupProgress): ArenaCupProgress {
  const cup = now.cup;
  if (!cup || cup.archived || !arenaCupFinished(cup) || arenaCupUnlogged(cup) !== null) return now;
  // Only an archive that landed marks the cup archived: a refused one (a full disk, a newer release's archive) is tried again next time.
  if (!saveArenaCupArchive(archiveArenaCup(loadArenaCupArchive(), arenaCupArchiveEntry(cup, Date.now())))) return now;
  return commit({ ...now, cup: Object.freeze({ ...cup, archived: true }) });
}

/**
 * 관전(2026-10-25): 지금 컵의 경기들을 열었다(`ids` 가 비면 관전을 시작만 한다). 관전 차례가 다 비면 결과를 다 본 것이다
 * (`seeCurrentArenaCupFinal`).
 */
export function revealCurrentArenaCupBouts(ids: readonly string[]): ArenaCupProgress {
  const now = currentArenaCup();
  if (!now.cup) return now;
  const cup = revealArenaCupBouts(now.cup, ids);
  const next = cup === now.cup ? now : commit({ ...now, cup });
  return arenaCupSpectateQueue(cup).length === 0 && arenaCupKnockout(cup) !== null ? seeCurrentArenaCupFinal() : next;
}

/** 지금 컵의 결승 결과를 봤다(결승 관전, 끝 카드 닫기): 컵과 기록실에 적는다. */
export function seeCurrentArenaCupFinal(): ArenaCupProgress {
  const now = currentArenaCup();
  if (!now.cup || now.cup.finalSeen) return now;
  const archive = loadArenaCupArchive(), id = arenaCupArchiveId(now.cup.seed), seen = seeArenaCupArchiveFinal(archive, id);
  if (seen !== archive) saveArenaCupArchive(seen);
  return commit({ ...now, cup: Object.freeze({ ...now.cup, finalSeen: true }) });
}

/**
 * 우승 연출을 봤다(docs/Plan/2026-10-27-oddbout-cup-champion-and-gold — C1 대표의 우승 4단계, C4 관전 끝의 다른 선수 우승 축소판): 결과창이
 * 서는 순간 적는다. 그 전에 새로 고치면 처음부터 다시 나온다. 연출이 남지 않은 컵·이미 본 컵은 그대로다.
 */
export function celebrateCurrentArenaCup(): ArenaCupProgress {
  const now = currentArenaCup();
  if (!now.cup || !(arenaCupCeremonyDue(now.cup) || arenaCupSpectatedCheerDue(now.cup))) return now;
  return commit({ ...now, cup: Object.freeze({ ...now.cup, celebrated: true }) });
}

/** 기록실. */
export function currentArenaCupArchive(): ArenaCupArchive {
  return loadArenaCupArchive();
}

/** 기록실의 컵 하나를 핀(꽂기·빼기). */
export function pinArenaCupArchiveEntry(id: string, pinned: boolean): ArenaCupArchive {
  const archive = loadArenaCupArchive(), next = pinArenaCupArchive(archive, id, pinned);
  if (next !== archive) saveArenaCupArchive(next);
  return next;
}

/** 기록실 컵의 결승 결과를 봤다(기록실에서 결승을 다시 봤다). */
export function seeArenaCupArchiveEntryFinal(id: string): ArenaCupArchive {
  const archive = loadArenaCupArchive(), next = seeArenaCupArchiveFinal(archive, id);
  if (next !== archive) saveArenaCupArchive(next);
  return next;
}

/**
 * 기록실 컵의 대진(16칸·대표)을 짜는 대진으로 불러온다(지금 짜던 대진은 덮인다). 시작은 하지 않는다 — "같은 대진으로 다시"는 고르기 화면이
 * 들어가자마자 늘 하던 시작(컵 표 먼저, `beginArenaCup`)을 부른다(`ArenaSelectSceneData.startCup`, 2026-10-26). 잠긴 컵이 진행 중이면
 * null(그 컵을 끝내거나 포기해야 한다).
 */
export function loadArenaCupFromArchive(entry: ArenaCupArchiveEntry): ArenaCupProgress | null {
  const now = currentArenaCup();
  if (arenaCupLocked(now.cup)) return null;
  const draft = Object.freeze({ slots: Object.freeze([...entry.slots]), representative: entry.representative });
  if (arenaCupDraftIssue(draft, arenaCupEntrants()) !== null) return null;
  commit({ ...now, draft, cup: null, unarchived: archiveEnded(now) });
  return currentArenaCup();
}

/**
 * 진행 중인 컵을 포기한다: 대표의 도전 하나를 세고 컵을 지운다. 대진은 남아 다시 고칠 수 있다. 경기가 하나도 정해지지 않은 컵은 도전으로
 * 세지 않는다(고친 것과 같다 — `editArenaCupDraft`).
 */
export function abandonCurrentArenaCup(): ArenaCupProgress {
  const now = currentArenaCup();
  if (!arenaCupInPlay(now.cup)) return now;
  return commit({ ...now, cup: null, records: arenaCupUntouched(now.cup) ? now.records : abandonArenaCup(now.records, now.cup) });
}
