import { createRng, shuffled } from "../rng";
import { sanitizeArenaBoutSummary, type ArenaBoutSummary } from "./ArenaBoutLog";
import {
  advanceCityTournament, cityTournamentChampion, cityTournamentEntrantId, cityTournamentRegisteredId, cityTournamentMatchAt, cityTournamentMatches, cityTournamentMatchSeed,
  cityTournamentNextMatch, cityTournamentOutcome, cityTournamentPlayerMatch, recordCityTournamentMatch, sanitizeCityTournamentBracket,
  settleCityTournament, type CityTournamentBracket, type CityTournamentEntrant, type CityTournamentHow, type CityTournamentMatch, type CityTournamentOutcome, type CityTournamentResolver,
} from "./CityTournamentRules";

/**
 * 무투장 16강 컵의 규칙(2026-10-24, docs/Plan/2026-10-24-oddbout-cup-and-free-play — 사용자: "컵 대진을 매번 유저가 결정해서 진행하는거야.
 * 이것 자체가 플레이"). 유저가 후보에서 16명을 골라 칸에 놓고 대표 선수를 정한다(`ArenaCupDraft`). 시작하면 대진이 잠긴다. 모든 경기는
 * AI 대 AI 다: 대표의 경기는 화면에서 보고, 다른 경기는 화면 없이 정한다(같은 엔진·같은 시드라 같은 결과). 같은 라운드의 다른 경기는
 * 대표의 경기 뒤에 정하고, 대표가 지면 결승까지 모두 정한다. 대진의 몸·진행은 주간 대진과 같다(`CityTournamentRules`).
 *
 * 순수 규칙이다 — 후보·출전자 세기·시드·저장은 app(`ArenaCupProgress`)이 준다.
 */
export const ARENA_CUP_SIZE = 16;
/** 라운드 수(16강·8강·4강·결승). 네 라운드를 이기면 우승이다. */
export const ARENA_CUP_ROUNDS = 4;

/** 짜는 중인 대진. */
export interface ArenaCupDraft {
  /** 16칸. 두 칸씩 16강 한 경기다(0·1, 2·3, …). 0~7 이 왼쪽 절반, 8~15 가 오른쪽 절반이다. 빈 칸은 null. */
  readonly slots: readonly (string | null)[];
  /** 대표 선수: 칸 안의 선수, 또는 null. */
  readonly representative: string | null;
}

/** 대진을 시작할 수 없는 첫 이유. */
export type ArenaCupDraftIssue =
  | { readonly kind: "unknown"; readonly ids: readonly string[] }
  | { readonly kind: "empty"; readonly count: number }
  | { readonly kind: "representative" };

/** 시작한 컵: 잠긴 대진과 대표, 결과. */
export interface ArenaCupState extends CityTournamentBracket {
  /** payload 스키마 버전. */
  readonly version: 1;
  readonly size: 16;
  readonly representative: string;
  /**
   * 지금 경기 규칙의 판(`city-tournament.json` rulesVersion). 판이 바뀌어도 컵은 이어 간다(2026-10-26): 남은 경기는 새 판으로 돌고,
   * 이미 정한 경기는 그 판으로 남는다(`earlier`, `carryArenaCupRules`).
   */
  readonly rulesVersion: number;
  /**
   * 앞 판으로 정한 경기의 판(열쇠 "라운드:칸", `arenaCupBoutId`). 그 판의 시드는 지금 규칙으로 다시 돌리면 다른 경기가 된다 — 기록실이
   * 그 경기를 "옛 규칙"으로 알린다. 없으면 모든 경기가 `rulesVersion` 이다.
   */
  readonly earlier?: Readonly<Record<string, number>>;
  /** 대표의 기록(`ArenaCupRecords`)에 셌는가 — 끝난 컵을 한 번만 센다. */
  readonly counted: boolean;
  /** 셀 때 적은 대표의 이번 컵 전 기록(6단계 — 끝난 카드의 "최고 기록"·"첫 우승"). 세기 전에는 없다. */
  readonly before?: ArenaCupFighterRecord;
  /**
   * 정해진 경기의 기록(기록실 A단계): 열쇠 "라운드:칸"(`arenaCupBoutId`). null = 원화가 없어 세기로 정한 경기. 화면 없는 경기는 정할 때,
   * 대표의 경기는 첫 씬이 같은 시드로 다시 돌려 채운다(`arenaCupUnlogged`).
   */
  readonly bouts?: Readonly<Record<string, ArenaBoutSummary | null>>;
  /** 결승 결과를 봤다(결승 관전, 끝 카드 닫기 — 기록실이 우승자를 말해도 된다). */
  readonly finalSeen?: true;
  /**
   * 이 컵의 우승 연출을 봤다(2026-10-27, docs/Plan/2026-10-27-oddbout-cup-champion-and-gold): 대표의 우승 의식(C1 — 우승 4단계)을 4단계까지,
   * 또는 대표가 떨어진 컵에서 관전 끝의 다른 선수 우승 축소판(C4)을. 한 번만 나온다. 없으면 아직 안 봤다(이 표시 전의 옛 저장도).
   */
  readonly celebrated?: true;
  /** 기록실에 남겼다(한 번만). */
  readonly archived?: true;
  /**
   * 관전(2026-10-25 — 사용자: "한 번 지면 그냥 끝나는 것도 이상해. 이번 토너먼트는 누가 우승하는지 볼 수 있어야지"): 대표가 탈락한 뒤
   * "계속 보기"로 남은 경기를 하나씩 열었다 — 연 경기의 열쇠(`arenaCupBoutId`). 있으면 관전 중이다(빈 배열 = 막 시작).
   */
  readonly revealed?: readonly string[];
  /**
   * 컵 표(2026-10-26 — 공개 랭킹): 서버가 이 컵의 시드를 뽑아 준 표(소문자 UUID v4, `ARENA_CUP_TICKET`). 있으면 서버가 이 컵의 15경기를 센다
   * ("랭킹 반영"). 표는 그 시드와만 짝이다. 없으면 랭킹에 들어가지 않는 컵이다(오프라인·개발, 표 이전의 옛 저장).
   */
  readonly ticket?: string;
  /**
   * 내 선수 출전(2026-10-27 — docs/Plan/2026-10-27-oddbout-agent-world 1단계): 대진의 서버 등록 선수(UUID)마다 컵을 시작할 때의 패키지 해시
   * (`manifestSha256`, 소문자 hex 64). 그 선수의 경기는 이 해시의 패키지로만 싸운다 — 주인이 도중에 선수를 고치면 남은 경기는 돌지 않는다
   * (`ArenaCupStepper`). 등록 선수가 없는 컵에는 없다.
   */
  readonly registered?: Readonly<Record<string, string>>;
}

/** 등록 선수 패키지 해시의 모양(sha256, 소문자 hex). */
export const ARENA_CUP_MANIFEST_SHA = /^[0-9a-f]{64}$/;

/** 컵 표의 모양: 소문자 UUID v4(서버가 준 그대로). */
export const ARENA_CUP_TICKET = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** 대표 선수 하나의 컵 기록. */
export interface ArenaCupFighterRecord {
  /** 끝냈거나 포기한 도전 수. */
  readonly tries: number;
  readonly titles: number;
  /** 가장 많이 이긴 라운드 수(0 = 16강 탈락 … 3 = 준우승, 4 = 우승). */
  readonly best: number;
}

export interface ArenaCupRecords {
  /** 대표 선수 id 별 기록. */
  readonly fighters: Readonly<Record<string, ArenaCupFighterRecord>>;
}

/** 이 브라우저의 컵 저장: 짜던 대진, 진행 중이거나 막 끝난 컵, 기록, 기록실이 아직 받지 못한 끝난 컵. */
export interface ArenaCupSave {
  readonly draft: ArenaCupDraft;
  readonly cup: ArenaCupState | null;
  readonly records: ArenaCupRecords;
  /**
   * 끝났는데 기록실에 아직 남기지 못한 컵(2026-10-26 — 디스크가 거절했거나 기록실이 더 새 판의 것). 새 컵이 그 자리를 덮어도 여기 남아
   * 다음에 다시 넣는다. 오래된 것부터, 최대 `ARENA_CUP_UNARCHIVED`.
   */
  readonly unarchived: readonly ArenaCupState[];
}

/**
 * 컵 저장의 판. 2판(2026-10-26): `unarchived`. 1판은 판을 올리지 않고 컵에 `earlier` 를 더했다 — 옛 페이지는 그 필드를 지운 채 다시
 * 적는다. 2판부터는 옛 페이지가 이 저장을 더 새 판으로 보고 덮지 않는다(`platform/sessionBackedStore`). 3판(2026-10-27): 대진에 등록 선수
 * (UUID)와 그 패키지 해시(`ArenaCupState.registered`) — 2판 페이지는 UUID 출전자를 손상으로 보고 컵을 버렸을 것이다.
 */
export const ARENA_CUP_SAVE_VERSION = 3;

/** 기록실을 기다리는 끝난 컵의 최대 수. */
export const ARENA_CUP_UNARCHIVED = 3;

/** 경기가 정해진 방식: KO·판정승, 또는 원화가 없어 세기로 정한 판정(`CityTournamentHow` 의 "rated"). 컵에는 부전승·기권이 없다. */
export type ArenaCupHow = Exclude<CityTournamentHow, "bye" | "forfeit">;

/** 대표 경기 하나의 열쇠: 화면 경기로 들어갈 때 싣고, 결과를 적을 때 지금 컵의 같은 경기인지 확인한다. */
export interface ArenaCupBoutKey {
  readonly seed: number;
  readonly round: number;
  readonly slot: number;
  readonly a: string;
  readonly b: string;
}

export const EMPTY_ARENA_CUP_DRAFT: ArenaCupDraft = Object.freeze({
  slots: Object.freeze(Array.from({ length: ARENA_CUP_SIZE }, () => null)), representative: null });

export const EMPTY_ARENA_CUP_RECORDS: ArenaCupRecords = Object.freeze({ fighters: Object.freeze({}) });

export const EMPTY_ARENA_CUP_SAVE: ArenaCupSave = Object.freeze({ draft: EMPTY_ARENA_CUP_DRAFT, cup: null, records: EMPTY_ARENA_CUP_RECORDS,
  unarchived: Object.freeze([]) });

const NO_RECORD: ArenaCupFighterRecord = Object.freeze({ tries: 0, titles: 0, best: 0 });

const validSlot = (slot: number) => Number.isInteger(slot) && slot >= 0 && slot < ARENA_CUP_SIZE;

/** 칸과 대표로 짠 대진. 칸에 없는 대표는 null 이 된다. */
function draftOf(slots: readonly (string | null)[], representative: string | null): ArenaCupDraft {
  return Object.freeze({ slots: Object.freeze(slots.slice()),
    representative: representative !== null && slots.includes(representative) ? representative : null });
}

/**
 * 칸 `slot` 에 `id` 를 놓는다. `id` 가 다른 칸에 있으면 두 칸이 자리를 바꾼다. 없으면 그 칸에 있던 선수가 빠진다(대표였으면 대표도 빈다).
 */
export function placeInArenaCupDraft(draft: ArenaCupDraft, slot: number, id: string): ArenaCupDraft {
  if (!validSlot(slot)) return draft;
  const from = draft.slots.indexOf(id);
  if (from === slot) return draft;
  const slots = draft.slots.slice();
  if (from >= 0) slots[from] = slots[slot] ?? null;
  slots[slot] = id;
  return draftOf(slots, draft.representative);
}

/** 두 칸의 자리를 바꾼다. */
export function swapArenaCupSlots(draft: ArenaCupDraft, a: number, b: number): ArenaCupDraft {
  if (!validSlot(a) || !validSlot(b) || a === b) return draft;
  const slots = draft.slots.slice();
  [slots[a], slots[b]] = [slots[b] ?? null, slots[a] ?? null];
  return draftOf(slots, draft.representative);
}

/** 칸 `slot` 을 비운다(대표였으면 대표도 빈다). */
export function clearArenaCupSlot(draft: ArenaCupDraft, slot: number): ArenaCupDraft {
  if (!validSlot(slot) || draft.slots[slot] === null) return draft;
  const slots = draft.slots.slice();
  slots[slot] = null;
  return draftOf(slots, draft.representative);
}

/** 칸 안의 `id` 를 대표로 정한다(칸에 없으면 그대로). */
export function setArenaCupRepresentative(draft: ArenaCupDraft, id: string): ArenaCupDraft {
  return draft.slots.includes(id) ? draftOf(draft.slots, id) : draft;
}

/** 빈 칸을 대진에 없는 후보로 무작위로 채운다(칸 순서대로, `seed` 로 섞는다). 놓인 선수는 그대로다. */
export function fillArenaCupDraft(draft: ArenaCupDraft, candidates: readonly string[], seed: number): ArenaCupDraft {
  const pool = shuffled(createRng(seed), candidates.filter(id => !draft.slots.includes(id))).value;
  let next = 0;
  return draftOf(draft.slots.map(id => id ?? pool[next++] ?? null), draft.representative);
}

/**
 * 한 번에 짜기(2026-10-24 사용자: "후보에서 버튼으로 대진을 짜게 해줘 (한번에)"): 대표는 그 칸에 두고, 나머지 칸을 대표가 아닌 후보 전체에서
 * 무작위로 뽑아 다시 채운다(놓여 있던 선수도 바뀐다). 대표가 없으면 16칸 모두 뽑는다.
 */
export function drawArenaCupDraft(draft: ArenaCupDraft, candidates: readonly string[], seed: number): ArenaCupDraft {
  const rep = draft.representative;
  const pool = shuffled(createRng(seed), candidates.filter(id => id !== rep)).value;
  let next = 0;
  return draftOf(draft.slots.map(id => id !== null && id === rep ? id : pool[next++] ?? null), rep);
}

/** 16명은 그대로 두고 자리만 섞는다(빈 칸도 함께 섞인다). */
export function shuffleArenaCupDraft(draft: ArenaCupDraft, seed: number): ArenaCupDraft {
  return draftOf(shuffled(createRng(seed), draft.slots).value, draft.representative);
}

/** 새 대표로(6단계 우승 카드): 칸은 그대로 두고 대표만 비운다. */
export function dropArenaCupRepresentative(draft: ArenaCupDraft): ArenaCupDraft {
  return draft.representative === null ? draft : draftOf(draft.slots, null);
}

/** 대표만 그 칸에 남기고 비운다. */
export function clearArenaCupDraft(draft: ArenaCupDraft): ArenaCupDraft {
  return draftOf(draft.slots.map(id => id !== null && id === draft.representative ? id : null), draft.representative);
}

/**
 * `id` 를 대표로 둔다(홈의 선수 프로필에서 들어올 때). 대진에 있으면 대표만 바꾸고, 없으면 첫 빈 칸에, 빈 칸이 없으면 `seed` 로 고른
 * 대표가 아닌 칸에 넣는다.
 */
export function putArenaCupRepresentative(draft: ArenaCupDraft, id: string, seed: number): ArenaCupDraft {
  if (draft.slots.includes(id)) return setArenaCupRepresentative(draft, id);
  const empty = draft.slots.indexOf(null);
  const others = draft.slots.flatMap((occupant, slot) => occupant !== draft.representative ? [slot] : []);
  const slot = empty >= 0 ? empty : shuffled(createRng(seed), others).value[0];
  return slot === undefined ? draft : setArenaCupRepresentative(placeInArenaCupDraft(draft, slot, id), id);
}

/**
 * 대표 바꾸기(2026-10-25 — 사용자: "대진표에서 선수를 변경할 수는 없어?"): `id` 가 대진에 있으면 대표만 바꾸고, 없으면 첫 빈 칸에, 빈 칸이
 * 없으면 지금 대표의 칸에 넣는다(옛 대표가 빠지고 새 선수가 그 자리를 잇는다). 대표도 빈 칸도 없으면 `fallback` 칸에 넣는다.
 */
export function replaceArenaCupRepresentative(draft: ArenaCupDraft, id: string, fallback: number): ArenaCupDraft {
  if (draft.slots.includes(id)) return setArenaCupRepresentative(draft, id);
  const empty = draft.slots.indexOf(null), rep = draft.representative === null ? -1 : draft.slots.indexOf(draft.representative);
  return setArenaCupRepresentative(placeInArenaCupDraft(draft, empty >= 0 ? empty : rep >= 0 ? rep : fallback, id), id);
}

/** 대진에서 후보가 아닌 선수(명단에서 빠진 선수)를 뺀다. */
export function pruneArenaCupDraft(draft: ArenaCupDraft, candidates: readonly string[]): ArenaCupDraft {
  if (draft.slots.every(id => id === null || candidates.includes(id))) return draft;
  return draftOf(draft.slots.map(id => id !== null && candidates.includes(id) ? id : null), draft.representative);
}

/**
 * 처음 여는 대진(짠 대진이 없을 때): 후보 `representative` 를 첫 칸의 대표로 두고 나머지 칸을 무작위로 채운다. 그래서 바로 시작할 수 있다.
 * `representative` 가 후보도 `representatives` 도 아니면 첫 칸에 놓인 선수가 대표다. `representatives`: 대표로만 설 수 있는 선수
 * (내 선수 출전 — 등록 선수는 첫 칸의 대표로만 들어오고 나머지 15칸은 늘 `candidates` 에서 뽑는다).
 */
export function startingArenaCupDraft(candidates: readonly string[], representative: string | null, seed: number,
  representatives: readonly string[] = []): ArenaCupDraft {
  const known = representative !== null && (candidates.includes(representative) || representatives.includes(representative)) ? representative : null;
  const base = known === null ? EMPTY_ARENA_CUP_DRAFT : setArenaCupRepresentative(placeInArenaCupDraft(EMPTY_ARENA_CUP_DRAFT, 0, known), known);
  const filled = fillArenaCupDraft(base, candidates, seed);
  return filled.representative === null && filled.slots[0] ? setArenaCupRepresentative(filled, filled.slots[0]) : filled;
}

/** 대진을 시작할 수 없는 첫 이유(후보 밖의 선수 → 빈 칸 → 대표 없음), 시작할 수 있으면 null. */
export function arenaCupDraftIssue(draft: ArenaCupDraft, candidates: readonly string[]): ArenaCupDraftIssue | null {
  const unknown = draft.slots.filter((id): id is string => id !== null && !candidates.includes(id));
  if (unknown.length > 0) return { kind: "unknown", ids: unknown };
  const empty = draft.slots.filter(id => id === null).length + Math.max(0, ARENA_CUP_SIZE - draft.slots.length);
  if (empty > 0) return { kind: "empty", count: empty };
  if (draft.representative === null || !draft.slots.includes(draft.representative)) return { kind: "representative" };
  return null;
}

/**
 * 짠 대진으로 컵을 시작한다(시작할 수 없으면 null). 출전자는 칸 순서이고, 첫 라운드는 칸 두 개씩 짝이다. `entrantOf` 는 선수의 경기 몸
 * (세기 — 화면 경기와 같은 값, `CityTournamentBouts.cityTournamentEntrant`). 대표의 16강은 바로 싸울 수 있고, 다른 경기는 아직 없다.
 * `ticket`: 서버가 `seed` 와 함께 준 컵 표(모양이 틀리면 넣지 않는다 — 랭킹 없는 컵). `manifests`: 대진의 등록 선수마다 지금 패키지 해시 —
 * 하나라도 모르면 시작하지 않는다(그 선수의 경기를 어떤 패키지로 싸울지 정할 수 없다).
 */
export function createArenaCup(draft: ArenaCupDraft, candidates: readonly string[], entrantOf: (id: string) => CityTournamentEntrant,
  seed: number, rulesVersion: number, ticket?: string, manifests: (id: string) => string | null = () => null): ArenaCupState | null {
  if (arenaCupDraftIssue(draft, candidates) !== null) return null;
  const ids = draft.slots as readonly string[];
  const registered: Record<string, string> = {};
  for (const id of ids.filter(cityTournamentRegisteredId)) {
    const sha = manifests(id);
    if (sha === null || !ARENA_CUP_MANIFEST_SHA.test(sha)) return null;
    registered[id] = sha;
  }
  const entrants = Object.freeze(ids.map(id => Object.freeze({ ...entrantOf(id), id })));
  const cup: ArenaCupState = Object.freeze({ version: 1, size: 16, seed: seed >>> 0, rulesVersion, representative: draft.representative!,
    entrants, matches: cityTournamentMatches(ids, ARENA_CUP_SIZE), counted: false,
    ...(ticket !== undefined && ARENA_CUP_TICKET.test(ticket) ? { ticket } : {}),
    ...(Object.keys(registered).length > 0 ? { registered: Object.freeze(registered) } : {}) });
  return settleCityTournament(cup);
}

/** 컵의 등록 선수(UUID) — 내 선수 출전의 대표. 없으면 빈 배열. */
export function arenaCupRegisteredIds(cup: Pick<ArenaCupState, "entrants">): readonly string[] {
  return cup.entrants.map(entrant => entrant.id).filter(cityTournamentRegisteredId);
}

/**
 * 칸 `slot` 의 선수가 라운드 `round`(0 = 16강 … 3 = 결승)에서 만날 수 있는 칸들: 그 라운드에서 맞붙는 옆 가지(16강 1칸, 8강 2칸, 4강 4칸,
 * 결승 8칸). 대진 짜기 화면이 대표의 길을 보일 때 쓴다.
 */
export function arenaCupRivalSlots(slot: number, round: number): readonly number[] {
  if (!validSlot(slot) || !Number.isInteger(round) || round < 0 || round >= ARENA_CUP_ROUNDS) return [];
  const size = 1 << round, base = ((slot >> round) ^ 1) << round;
  return Array.from({ length: size }, (_, i) => base + i);
}

/** 라운드 `round`·칸 `slot` 의 경기(대진 밖이면 undefined). */
export function arenaCupMatchAt(cup: ArenaCupState, round: number, slot: number): CityTournamentMatch | undefined {
  return cityTournamentMatchAt(cup, round, slot);
}

/** 경기 `match` 의 열쇠(두 선수가 정해졌을 때), 아니면 null. 화면 경기는 이 열쇠의 코너·시드(`arenaCupBoutSeed`)로 싸운다. */
export function arenaCupMatchKey(cup: ArenaCupState, match: CityTournamentMatch): ArenaCupBoutKey | null {
  return match.a !== null && match.b !== null
    ? Object.freeze({ seed: cup.seed, round: match.round, slot: match.slot, a: match.a, b: match.b }) : null;
}

/**
 * 컵 경기 한 판의 엔진 시드: 컵 시드·라운드·칸에서만 나온다(32비트 전부 — 공유 링크도 그대로 싣는다). 화면 경기·화면 없는 결과·기록실
 * 다시 보기가 모두 이 값으로 싸워서 같은 결과가 난다.
 */
export function arenaCupBoutSeed(key: Pick<ArenaCupBoutKey, "seed" | "round" | "slot">): number {
  return cityTournamentMatchSeed(key.seed, key.round, key.slot);
}

/** 결승의 열쇠(두 선수가 정해졌을 때 — 결승 관전이 같은 시드·같은 코너로 다시 싸운다), 아니면 null. */
export function arenaCupFinalKey(cup: ArenaCupState): ArenaCupBoutKey | null {
  const final = arenaCupMatchAt(cup, ARENA_CUP_ROUNDS - 1, 0);
  return final ? arenaCupMatchKey(cup, final) : null;
}

/** 경기의 기록 열쇠("라운드:칸" — `ArenaCupState.bouts`). */
export function arenaCupBoutId(round: number, slot: number): string {
  return `${round}:${slot}`;
}

/**
 * 경기 하나의 기록을 컵에 단다. 그 라운드·칸의 두 선수가 `a`·`b` 일 때만(다른 컵·다른 경기의 기록은 버린다). 아직 정해지기 전에 달아도
 * 된다(화면 없는 경기는 기록을 단 뒤 결과를 적는다 — 결과가 컵을 끝내는 순간 기록이 이미 있다).
 */
export function noteArenaCupBout(cup: ArenaCupState, round: number, slot: number, a: string, b: string, summary: ArenaBoutSummary | null): ArenaCupState {
  const match = arenaCupMatchAt(cup, round, slot);
  if (!match || match.a !== a || match.b !== b) return cup;
  return Object.freeze({ ...cup, bouts: Object.freeze({ ...cup.bouts, [arenaCupBoutId(round, slot)]: summary }) });
}

/**
 * 규칙 판이 바뀐 컵을 이어 간다(2026-10-26 — 전에는 판이 바뀌면 진행 중인 컵을 끝냈고, 끝났지만 기록을 다 채우지 못한 컵은 기록실에 남지도
 * 않았다). 이미 정한 경기는 그 판으로 남긴다(`earlier`). 정했는데 기록이 없는 경기(화면으로 본 대표의 경기)는 기록 없음(null)으로 닫는다 —
 * 같은 시드를 새 규칙으로 다시 돌리면 정해진 결과와 다른 경기가 된다. 남은 경기는 `rulesVersion` 으로 돈다. 판이 같으면 그대로다.
 */
export function carryArenaCupRules(cup: ArenaCupState, rulesVersion: number): ArenaCupState {
  if (cup.rulesVersion === rulesVersion) return cup;
  const earlier: Record<string, number> = { ...cup.earlier }, bouts: Record<string, ArenaBoutSummary | null> = { ...cup.bouts };
  for (const match of cup.matches) {
    if (match.how === null || match.a === null || match.b === null) continue;
    const id = arenaCupBoutId(match.round, match.slot);
    if (!(id in earlier)) earlier[id] = cup.rulesVersion;
    if (!(id in bouts)) bouts[id] = null;
  }
  for (const id of Object.keys(earlier)) if (earlier[id] === rulesVersion) delete earlier[id];
  const { earlier: _earlier, bouts: _bouts, ...rest } = cup;
  return Object.freeze({ ...rest, rulesVersion, ...(Object.keys(earlier).length > 0 ? { earlier: Object.freeze(earlier) } : {}),
    ...(Object.keys(bouts).length > 0 ? { bouts: Object.freeze(bouts) } : {}) });
}

/**
 * 그 경기를 앞 판으로 정했으면 그 판(`earlier`), 아니면 null. 그 경기는 지금 규칙으로 화면에서 다시 돌리면 다른 경기가 된다 — 관전은 결과만 열고
 * 다시 보기는 막는다(화면의 승자가 대진표의 승자와 어긋나지 않게).
 */
export function arenaCupEarlierRules(cup: ArenaCupState, round: number, slot: number): number | null {
  return cup.earlier?.[arenaCupBoutId(round, slot)] ?? null;
}

/** 정해졌는데 기록이 없는 첫 경기(라운드·칸 순), 없으면 null — 첫 씬이 같은 시드로 다시 돌려 채운다. */
export function arenaCupUnlogged(cup: ArenaCupState): CityTournamentMatch | null {
  return cup.matches.find(match => match.how !== null && match.a !== null && match.b !== null
    && !(arenaCupBoutId(match.round, match.slot) in (cup.bouts ?? {}))) ?? null;
}

/**
 * 관전 차례: 대표가 탈락한 라운드부터 결승까지, 대표가 서지 않은 경기 중 아직 열지 않은 것(라운드·칸 순). 대표가 탈락하지 않았거나 결과를
 * 다 봤으면(`finalSeen`) 비어 있다. 아직 정해지지 않은 경기도 차례에 있다(화면 없는 계산이 정하면 열 수 있다). 대진표는 이 경기들의 결과를
 * 열 때까지 말하지 않는다.
 */
export function arenaCupSpectateQueue(cup: ArenaCupState): readonly CityTournamentMatch[] {
  const out = arenaCupKnockout(cup);
  if (!out || cup.finalSeen) return [];
  const shown = new Set(cup.revealed ?? []);
  return cup.matches.filter(match => match.round >= out.round && match.a !== cup.representative && match.b !== cup.representative
    && !shown.has(arenaCupBoutId(match.round, match.slot))).sort((x, y) => x.round - y.round || x.slot - y.slot);
}

/** 관전에서 경기들을 열었다(처음 부르면 관전이 시작된다 — `ids` 가 비어도). */
export function revealArenaCupBouts(cup: ArenaCupState, ids: readonly string[]): ArenaCupState {
  const was = cup.revealed ?? [];
  const added = ids.filter(id => !was.includes(id));
  if (cup.revealed !== undefined && added.length === 0) return cup;
  return Object.freeze({ ...cup, revealed: Object.freeze([...was, ...added]) });
}

/** 컵이 다 끝났다: 대표가 우승했거나 탈락했고, 15경기가 모두 정해졌다(기록실에 남길 때). */
export function arenaCupFinished(cup: ArenaCupState): boolean {
  return arenaCupOutcome(cup) !== "playing" && cup.matches.every(match => match.how !== null);
}

/** 아직 정해진 경기가 하나도 없다 — 시작만 한 컵이라 대진을 고치면 짠 대진으로 돌아가도 잃는 것이 없다. */
export function arenaCupUntouched(cup: ArenaCupState): boolean {
  return cup.matches.every(match => match.how === null);
}

/** 대표가 지금 싸울 경기(없으면 null — 다른 경기를 기다리는 중이거나 탈락·우승). */
export function arenaCupMatch(cup: ArenaCupState): CityTournamentMatch | null {
  return cityTournamentPlayerMatch(cup, cup.representative);
}

/** 대표의 지금 경기의 열쇠(없으면 null). */
export function arenaCupBoutKey(cup: ArenaCupState): ArenaCupBoutKey | null {
  const match = arenaCupMatch(cup);
  return match ? arenaCupMatchKey(cup, match) : null;
}

/** 다음에 화면 없이 정할 경기(없으면 null). 대표의 경기보다 낮은 라운드만, 대표가 지면 결승까지. */
export function arenaCupNextMatch(cup: ArenaCupState): CityTournamentMatch | null {
  return cityTournamentNextMatch(cup, cup.representative);
}

/** 화면 없이 정할 경기를 모두 정한다(`arenaCupNextMatch` 가 없을 때까지). */
export function advanceArenaCup(cup: ArenaCupState, resolve: CityTournamentResolver): ArenaCupState {
  return advanceCityTournament(cup, resolve, cup.representative);
}

/** 대표의 처지: 아직 싸우는 중, 탈락, 우승. */
export function arenaCupOutcome(cup: ArenaCupState): CityTournamentOutcome {
  return cityTournamentOutcome(cup, cup.representative);
}

/** 대표를 떨어뜨린 경기: 그 라운드(0 = 16강 … 3 = 결승)와 이긴 선수. 아직 지지 않았으면 null. */
export function arenaCupKnockout(cup: ArenaCupState): { readonly round: number; readonly by: string } | null {
  const lost = cup.matches.find(match => match.how !== null && match.winner !== null && match.winner !== cup.representative
    && (match.a === cup.representative || match.b === cup.representative));
  return lost ? { round: lost.round, by: lost.winner! } : null;
}

/** 우승자(결승이 정해졌으면), 아니면 null. */
export function arenaCupChampion(cup: ArenaCupState): string | null {
  return cityTournamentChampion(cup);
}

/** 우승까지의 길의 한 칸(C1): 라운드(0 = 16강 … 3 = 결승), 칸, 상대, 결판, 걸린 시간(ms — 기록이 없거나 원화 없이 정한 경기는 null), 이겼나. */
export interface ArenaCupRoadStep {
  readonly round: number;
  readonly slot: number;
  readonly opponent: string;
  readonly how: ArenaCupHow;
  readonly ms: number | null;
  readonly won: boolean;
}

/** `id` 가 선 정해진 경기들(라운드 순): 상대·결판·시간·승패. 우승 의식 2단계의 "KO 0:31" 과 결과창의 길이 같은 것을 읽는다. */
export function arenaCupRoad(cup: ArenaCupState, id: string = cup.representative): readonly ArenaCupRoadStep[] {
  return cup.matches.filter(match => match.how !== null && match.how !== "bye" && match.how !== "forfeit" && match.winner !== null
    && (match.a === id || match.b === id) && match.a !== null && match.b !== null)
    .sort((x, y) => x.round - y.round)
    .map(match => Object.freeze({ round: match.round, slot: match.slot, opponent: (match.a === id ? match.b : match.a)!, how: match.how as ArenaCupHow,
      ms: cup.bouts?.[arenaCupBoutId(match.round, match.slot)]?.ms ?? null, won: match.winner === id }));
}

/** 대표가 우승한 컵의 길(16강 → 결승 네 칸, 모두 이긴 경기), 우승이 아니면 null. */
export function arenaCupChampionRoad(cup: ArenaCupState): readonly ArenaCupRoadStep[] | null {
  if (arenaCupChampion(cup) !== cup.representative) return null;
  const road = arenaCupRoad(cup);
  return road.length === ARENA_CUP_ROUNDS && road.every(step => step.won) ? road : null;
}

/** 우승 의식이 아직 남았다: 대표가 우승했고 4단계까지 본 적이 없다(`celebrated`). */
export function arenaCupCeremonyDue(cup: ArenaCupState): boolean {
  return cup.celebrated !== true && arenaCupChampionRoad(cup) !== null;
}

/**
 * 다른 선수의 우승 축소판(C4)이 아직 남았다: 대표가 결승 전에 떨어졌고(결승에서 진 준우승은 제 결승을 봤다), 우승자가 정해졌고, 남은 경기를
 * 다 봤다(관전 끝 — 우승자 카드가 서는 때), 본 적이 없다(`celebrated`).
 */
export function arenaCupSpectatedCheerDue(cup: ArenaCupState): boolean {
  const out = arenaCupKnockout(cup);
  return cup.celebrated !== true && out !== null && out.round < ARENA_CUP_ROUNDS - 1 && arenaCupChampion(cup) !== null
    && arenaCupSpectateQueue(cup).length === 0;
}

/** 대표가 이긴 라운드 수(0~4). */
export function arenaCupRoundsWon(cup: ArenaCupState): number {
  return cup.matches.filter(match => match.how !== null && match.how !== "bye" && match.winner === cup.representative).length;
}

/**
 * 대표 경기의 금화(2026-10-27, docs/Plan/2026-10-27-oddbout-cup-champion-and-gold G1 — 사용자 표): 라운드(0 = 16강 … 3 = 결승)마다 두 배, 진
 * 경기는 그 라운드 승리의 절반. 한 컵의 합계는 16강 탈락 10 · 8강 탈락 40 · 4강 탈락 100 · 준우승 220 · 우승 300 이다.
 */
export const ARENA_CUP_GOLD = Object.freeze({ win: Object.freeze([20, 40, 80, 160]), loss: Object.freeze([10, 20, 40, 80]) });

/** 대표가 라운드 `round` 의 경기를 이겼거나(`won`) 졌을 때 받는 금화. 없는 라운드는 0. */
export function arenaCupBoutGold(round: number, won: boolean): number {
  return (won ? ARENA_CUP_GOLD.win : ARENA_CUP_GOLD.loss)[round] ?? 0;
}

/** 이 컵에서 대표가 지금까지 받은 금화: 그가 선 정해진 경기마다 `arenaCupBoutGold`. */
export function arenaCupGoldEarned(cup: ArenaCupState): number {
  return cup.matches.reduce((sum, match) => match.how === null || match.how === "bye" || (match.a !== cup.representative && match.b !== cup.representative)
    ? sum : sum + arenaCupBoutGold(match.round, match.winner === cup.representative), 0);
}

/** 두 열쇠가 같은 경기다(null 은 어떤 열쇠와도 다르다). */
export function sameArenaCupBout(a: ArenaCupBoutKey | null, b: ArenaCupBoutKey | null): boolean {
  return a !== null && b !== null && a.seed === b.seed && a.round === b.round && a.slot === b.slot && a.a === b.a && a.b === b.b;
}

/**
 * 대표 경기의 결과를 적는다. `key` 가 지금 대표의 경기와 같아야 한다(다르면 그대로 — 다른 탭이 새 컵을 시작했다). `winner` 는 그 경기의
 * 두 선수 중 하나다.
 */
export function recordArenaCupBout(cup: ArenaCupState, key: ArenaCupBoutKey, winner: string, how: ArenaCupHow): ArenaCupState {
  if (!sameArenaCupBout(arenaCupBoutKey(cup), key)) return cup;
  return recordCityTournamentMatch(cup, key.round, key.slot, winner, how);
}

/** 대표 `id` 의 기록(없으면 0). */
export function arenaCupRecord(records: ArenaCupRecords, id: string): ArenaCupFighterRecord {
  return records.fighters[id] ?? NO_RECORD;
}

/** 우승 도감: 한 번이라도 우승한 대표들. */
export function arenaCupDex(records: ArenaCupRecords): readonly string[] {
  return Object.keys(records.fighters).filter(id => (records.fighters[id]?.titles ?? 0) > 0);
}

function withRecord(records: ArenaCupRecords, id: string, record: ArenaCupFighterRecord): ArenaCupRecords {
  return Object.freeze({ fighters: Object.freeze({ ...records.fighters, [id]: Object.freeze(record) }) });
}

/** 끝난 컵(탈락·우승)을 대표의 기록에 한 번 센다: 도전 1, 우승이면 우승 1, 최고 라운드. 아직 싸우는 중이거나 이미 셌으면 그대로. */
export function countArenaCup(records: ArenaCupRecords, cup: ArenaCupState): { readonly records: ArenaCupRecords; readonly cup: ArenaCupState } {
  const outcome = arenaCupOutcome(cup);
  if (cup.counted || outcome === "playing") return { records, cup };
  const was = arenaCupRecord(records, cup.representative);
  return { records: withRecord(records, cup.representative, { tries: was.tries + 1, titles: was.titles + (outcome === "champion" ? 1 : 0),
    best: Math.max(was.best, arenaCupRoundsWon(cup)) }), cup: Object.freeze({ ...cup, counted: true, before: was }) };
}

/** 포기한 컵: 대표의 도전만 센다(이미 셌으면 그대로). */
export function abandonArenaCup(records: ArenaCupRecords, cup: ArenaCupState): ArenaCupRecords {
  if (cup.counted) return records;
  const was = arenaCupRecord(records, cup.representative);
  return withRecord(records, cup.representative, { ...was, tries: was.tries + 1 });
}

/**
 * 상성 측정표(2026-10-24 2단계, `world/arena-matchups.json` — `tools/ai-fighter/matchup-table.mjs` 가 만든다): 후보의 모든 짝을 양 코너 ×
 * 여러 시드로 화면 없이 싸운 승수. 대진 짜기 화면은 대표와 다른 선수의 승률을 세 단계로만 보인다(숫자는 보이지 않는다 — 정답 대진이
 * 바로 보이면 짜기가 계산 문제가 된다).
 */
export interface ArenaCupMatchupTable {
  /** 잰 규칙 판. 지금 판과 다르면 힌트를 숨긴다. */
  readonly rulesVersion: number;
  /** 짝 하나를 싸운 판 수(양 코너 × 시드). */
  readonly boutsPerPair: number;
  readonly ids: readonly string[];
  /** `wins[i][j]`: `ids[i]` 가 `ids[j]` 를 이긴 판 수. `wins[i][j] + wins[j][i] = boutsPerPair`. */
  readonly wins: readonly (readonly number[])[];
}

/** 상성 힌트: 유리 · 비슷 · 불리. */
export type ArenaCupMatchup = "favored" | "even" | "unfavored";

/** 힌트의 경계: 승률이 `favored` 이상이면 유리, `unfavored` 이하면 불리, 그 사이는 비슷. */
export interface ArenaCupMatchupBands {
  readonly favored: number;
  readonly unfavored: number;
}

/** 측정표 경기 시드의 뿌리("matc"). 짝 (i, j) 의 k 번째 시드는 `arenaCupMatchupSeed`. */
export const ARENA_CUP_MATCHUP_SEED_ROOT = 0x6d617463;

/** 측정표에서 후보 `i`·`j`(후보 순서) 짝의 `k` 번째 경기 시드. 양 코너가 같은 시드로 싸운다. */
export function arenaCupMatchupSeed(i: number, j: number, k: number): number {
  return cityTournamentMatchSeed((ARENA_CUP_MATCHUP_SEED_ROOT + k) >>> 0, i, j);
}

/** 표가 앞뒤가 맞는가(정사각, 짝마다 승수 합 = 판 수, 대각선 0). */
export function arenaCupMatchupTableValid(table: ArenaCupMatchupTable): boolean {
  const n = table.ids.length;
  if (n === 0 || new Set(table.ids).size !== n || table.wins.length !== n || !(table.boutsPerPair > 0)) return false;
  return table.wins.every((row, i) => row.length === n && row.every((w, j) => Number.isInteger(w) && w >= 0
    && (i === j ? w === 0 : w + (table.wins[j]?.[i] ?? NaN) === table.boutsPerPair)));
}

/** `a` 가 `b` 를 이긴 비율(표에 없는 짝·같은 선수면 null). */
export function arenaCupMatchupRate(table: ArenaCupMatchupTable, a: string, b: string): number | null {
  const i = table.ids.indexOf(a), j = table.ids.indexOf(b);
  if (i < 0 || j < 0 || i === j) return null;
  return (table.wins[i]?.[j] ?? 0) / table.boutsPerPair;
}

/** 승률의 힌트. */
export function arenaCupMatchupOf(rate: number, bands: ArenaCupMatchupBands): ArenaCupMatchup {
  return rate >= bands.favored ? "favored" : rate <= bands.unfavored ? "unfavored" : "even";
}

const isId = cityTournamentEntrantId;
const isCount = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;

/** 저장된 대진. 칸 수가 틀리면 undefined, 잘못된 칸·두 번째 같은 선수는 빈 칸, 칸 밖의 대표는 null. */
export function sanitizeArenaCupDraft(value: unknown): ArenaCupDraft | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const slots = (value as Record<string, unknown>)["slots"], representative = (value as Record<string, unknown>)["representative"];
  if (!Array.isArray(slots) || slots.length !== ARENA_CUP_SIZE) return undefined;
  const seen = new Set<string>();
  const clean = slots.map(id => {
    if (!isId(id) || seen.has(id)) return null;
    seen.add(id);
    return id;
  });
  return draftOf(clean, isId(representative) ? representative : null);
}

/** 저장된 컵. 손상·모르는 버전·앞뒤가 맞지 않으면 undefined(컵 없음). */
export function sanitizeArenaCup(value: unknown): ArenaCupState | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const { version, rulesVersion, representative, counted } = record;
  if (version !== 1 || typeof counted !== "boolean") return undefined;
  if (typeof rulesVersion !== "number" || !Number.isInteger(rulesVersion) || rulesVersion < 1) return undefined;
  const bracket = sanitizeCityTournamentBracket(record, [ARENA_CUP_SIZE]);
  if (!bracket || bracket.entrants.length !== ARENA_CUP_SIZE || !bracket.entrants.some(entrant => entrant.id === representative)) return undefined;
  if (bracket.matches.some(match => match.how === "bye")) return undefined;
  const before = fighterRecordOf(record["before"]), ticket = record["ticket"];
  // Every registered entrant's package hash, or no cup: his bouts would fight on whatever package he has now.
  const rawRegistered = record["registered"], registered: Record<string, string> = {};
  for (const id of bracket.entrants.map(entrant => entrant.id).filter(cityTournamentRegisteredId)) {
    const sha = typeof rawRegistered === "object" && rawRegistered !== null && !Array.isArray(rawRegistered)
      ? (rawRegistered as Record<string, unknown>)[id] : undefined;
    if (typeof sha !== "string" || !ARENA_CUP_MANIFEST_SHA.test(sha)) return undefined;
    registered[id] = sha;
  }
  const rawBouts = record["bouts"], bouts: Record<string, ArenaBoutSummary | null> = {};
  if (typeof rawBouts === "object" && rawBouts !== null && !Array.isArray(rawBouts)) {
    for (const match of bracket.matches) {
      const id = arenaCupBoutId(match.round, match.slot);
      if (!(id in rawBouts)) continue;
      const raw = (rawBouts as Record<string, unknown>)[id], summary = raw === null ? null : sanitizeArenaBoutSummary(raw);
      if (summary !== undefined) bouts[id] = summary;
    }
  }
  const rawEarlier = record["earlier"], earlier: Record<string, number> = {};
  if (typeof rawEarlier === "object" && rawEarlier !== null && !Array.isArray(rawEarlier)) {
    for (const match of bracket.matches) {
      const id = arenaCupBoutId(match.round, match.slot), rules = (rawEarlier as Record<string, unknown>)[id];
      if (typeof rules === "number" && Number.isInteger(rules) && rules >= 1 && rules !== rulesVersion) earlier[id] = rules;
    }
  }
  const cup: ArenaCupState = Object.freeze({ version: 1, size: 16, seed: bracket.seed, rulesVersion, representative: representative as string,
    entrants: bracket.entrants, matches: bracket.matches, counted, ...(counted && before ? { before } : {}),
    ...(Object.keys(earlier).length > 0 ? { earlier: Object.freeze(earlier) } : {}),
    ...(Object.keys(bouts).length > 0 ? { bouts: Object.freeze(bouts) } : {}), ...(record["finalSeen"] === true ? { finalSeen: true } as const : {}),
    ...(record["celebrated"] === true ? { celebrated: true } as const : {}),
    ...(record["archived"] === true ? { archived: true } as const : {}),
    ...(Array.isArray(record["revealed"]) ? { revealed: Object.freeze((record["revealed"] as unknown[]).filter((id): id is string =>
      typeof id === "string" && bracket.matches.some(match => arenaCupBoutId(match.round, match.slot) === id))) } : {}),
    // A ticket only in its own shape: an old save (none) or a broken one is an unranked cup, never a lost one.
    ...(typeof ticket === "string" && ARENA_CUP_TICKET.test(ticket) ? { ticket } : {}),
    ...(Object.keys(registered).length > 0 ? { registered: Object.freeze(registered) } : {}) });
  return settleCityTournament(cup);
}

/** 저장된 기록. 잘못된 항목은 버린다. */
export function sanitizeArenaCupRecords(value: unknown): ArenaCupRecords {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return EMPTY_ARENA_CUP_RECORDS;
  const fighters = (value as Record<string, unknown>)["fighters"];
  if (typeof fighters !== "object" || fighters === null || Array.isArray(fighters)) return EMPTY_ARENA_CUP_RECORDS;
  const clean: Record<string, ArenaCupFighterRecord> = {};
  for (const [id, raw] of Object.entries(fighters)) {
    const record = isId(id) ? fighterRecordOf(raw) : undefined;
    if (record) clean[id] = record;
  }
  return Object.freeze({ fighters: Object.freeze(clean) });
}

/** 대표 한 명의 기록 값(손상이면 undefined). */
function fighterRecordOf(raw: unknown): ArenaCupFighterRecord | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const { tries, titles, best } = raw as Record<string, unknown>;
  if (!isCount(tries) || !isCount(titles) || !isCount(best) || titles > tries || best > ARENA_CUP_ROUNDS) return undefined;
  return Object.freeze({ tries, titles, best });
}

/**
 * 저장(`{ version: ARENA_CUP_SAVE_VERSION, draft, cup, records, unarchived }`)을 읽는다. 모르는 버전·손상은 빈 저장, 부분 손상은 그 부분만
 * 비운다(옛 판은 저장소가 먼저 이관한다).
 */
export function sanitizeArenaCupSave(value: unknown): ArenaCupSave {
  if (typeof value !== "object" || value === null || Array.isArray(value) || (value as { version?: unknown }).version !== ARENA_CUP_SAVE_VERSION) return EMPTY_ARENA_CUP_SAVE;
  const record = value as Record<string, unknown>, waiting = record["unarchived"];
  return Object.freeze({ draft: sanitizeArenaCupDraft(record["draft"]) ?? EMPTY_ARENA_CUP_DRAFT, cup: sanitizeArenaCup(record["cup"]) ?? null,
    records: sanitizeArenaCupRecords(record["records"]),
    unarchived: Object.freeze((Array.isArray(waiting) ? waiting : []).flatMap(cup => {
      const read = sanitizeArenaCup(cup);
      return read && arenaCupFinished(read) ? [read] : [];
    }).slice(-ARENA_CUP_UNARCHIVED)) });
}

/** 저장할 값(`sanitizeArenaCupSave` 가 읽는 모양). */
export function arenaCupSavePayload(save: ArenaCupSave): unknown {
  return { version: ARENA_CUP_SAVE_VERSION, draft: save.draft, cup: save.cup, records: save.records, unarchived: save.unarchived };
}
