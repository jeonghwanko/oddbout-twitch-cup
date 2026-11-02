import { sanitizeArenaBoutSummary, type ArenaBoutSummary } from "./ArenaBoutLog";
import { ARENA_CUP_ROUNDS, ARENA_CUP_SIZE, arenaCupBoutId, arenaCupChampion, arenaCupKnockout, type ArenaCupHow, type ArenaCupState } from "./ArenaCupRules";

/**
 * 컵 기록실(2026-10-24, docs/Plan/2026-10-24-oddbout-cup-drama-and-archive A단계): 끝난 컵마다 대진(16칸·대표·컵 시드·규칙 판)과 15경기의
 * 결과·기록(`ArenaBoutSummary`)을 남긴다. 경기는 두 코너와 경기 시드로 처음부터 다시 돌아서 영상 없이 다시 볼 수 있다. 컵 하나 약 5 KB.
 * 최근 `keep` 컵과 핀한 컵(많아야 `pins`)을 남긴다. 새것이 앞이다.
 *
 * 순수 규칙이다 — 저장은 platform(`arenaCupArchiveStorage`), 쓰는 때는 app(`ArenaCupProgress`)이 정한다.
 */
export const ARENA_CUP_ARCHIVE = Object.freeze({ keep: 50, pins: 20 });

export interface ArenaCupArchiveBout {
  readonly round: number;
  readonly slot: number;
  readonly a: string;
  readonly b: string;
  readonly winner: string;
  readonly how: ArenaCupHow;
  /**
   * 그 경기의 기록. null: 원화가 없어 세기로 정한 경기(다시 볼 수 없다), 기록을 채우기 전에 다음 컵이 시작됐다, 또는 기록을 채우기 전에
   * 규칙 판이 바뀌었다.
   */
  readonly summary: ArenaBoutSummary | null;
  /** 컵의 판(`ArenaCupArchiveEntry.rulesVersion`)보다 앞 판으로 정한 경기의 판(2026-10-26, 판이 바뀌어도 이어 간 컵). 없으면 컵의 판이다. */
  readonly rules?: number;
}

export interface ArenaCupArchiveEntry {
  /** 컵 시드(16진 8자리) — 같은 컵은 한 번만 남는다. */
  readonly id: string;
  /** 끝난 때(ms since epoch — 부르는 쪽의 시계). */
  readonly endedAt: number;
  readonly rulesVersion: number;
  readonly seed: number;
  /** 16칸(칸 순서). */
  readonly slots: readonly string[];
  readonly representative: string;
  /** 우승자(결승이 정해졌으면). */
  readonly champion: string | null;
  /** 대표를 떨어뜨린 경기(우승이면 null). */
  readonly out: { readonly round: number; readonly by: string } | null;
  readonly pinned: boolean;
  /** 결승 결과를 봤다(대표가 결승에 섰거나, 결승을 보거나, 끝 카드를 닫았다) — 보기 전이면 기록실도 우승자를 말하지 않는다. */
  readonly finalSeen: boolean;
  /** 정해진 경기(라운드·칸 순). */
  readonly bouts: readonly ArenaCupArchiveBout[];
  /**
   * 주간 공용 컵의 주(2026-10-27, `app/ArenaPublicCup` — 예: 2026-W44). 서버가 낸 컵이라 대표가 없다(`representative` ""). 이 세션의 메모리에만
   * 있고 기록실 저장에는 들어가지 않는다.
   */
  readonly week?: string;
}

export interface ArenaCupArchive {
  readonly cups: readonly ArenaCupArchiveEntry[];
}

export const EMPTY_ARENA_CUP_ARCHIVE: ArenaCupArchive = Object.freeze({ cups: Object.freeze([]) });

/** 컵 시드의 기록실 id. */
export function arenaCupArchiveId(seed: number): string {
  return (seed >>> 0).toString(16).padStart(8, "0");
}

/** 끝난 컵 하나의 기록. */
export function arenaCupArchiveEntry(cup: ArenaCupState, endedAt: number): ArenaCupArchiveEntry {
  const out = arenaCupKnockout(cup), champion = arenaCupChampion(cup);
  const bouts = cup.matches.filter(match => match.how !== null && match.a !== null && match.b !== null && match.winner !== null)
    .map(match => { const id = arenaCupBoutId(match.round, match.slot), rules = cup.earlier?.[id];
      return Object.freeze({ round: match.round, slot: match.slot, a: match.a!, b: match.b!, winner: match.winner!, how: match.how as ArenaCupHow,
        summary: cup.bouts?.[id] ?? null, ...(rules !== undefined ? { rules } : {}) }); });
  // He stood in the final (won it, or lost it): he has seen it.
  const inFinal = out === null || out.round === ARENA_CUP_ROUNDS - 1;
  return Object.freeze({ id: arenaCupArchiveId(cup.seed), endedAt, rulesVersion: cup.rulesVersion, seed: cup.seed,
    slots: Object.freeze(cup.entrants.map(entrant => entrant.id)), representative: cup.representative, champion, out: out ? Object.freeze({ ...out }) : null,
    pinned: false, finalSeen: inFinal || cup.finalSeen === true, bouts: Object.freeze(bouts) });
}

/** 핀하지 않은 컵을 최근 `keep` 개만 남긴다. */
function trimmed(cups: readonly ArenaCupArchiveEntry[]): readonly ArenaCupArchiveEntry[] {
  let loose = 0;
  return Object.freeze(cups.filter(cup => cup.pinned || (loose += 1) <= ARENA_CUP_ARCHIVE.keep));
}

/** 컵을 맨 앞에 남긴다(같은 id 가 있으면 그 핀을 이어받아 바꾼다). */
export function archiveArenaCup(archive: ArenaCupArchive, entry: ArenaCupArchiveEntry): ArenaCupArchive {
  const was = archive.cups.find(cup => cup.id === entry.id);
  const next = was ? { ...entry, pinned: was.pinned, finalSeen: entry.finalSeen || was.finalSeen } : entry;
  return Object.freeze({ cups: trimmed([Object.freeze(next), ...archive.cups.filter(cup => cup.id !== entry.id)]) });
}

/** 핀(꽂기·빼기). 이미 `pins` 개를 꽂았으면 그대로다. */
export function pinArenaCupArchive(archive: ArenaCupArchive, id: string, pinned: boolean): ArenaCupArchive {
  const cup = archive.cups.find(entry => entry.id === id);
  if (!cup || cup.pinned === pinned) return archive;
  if (pinned && archive.cups.filter(entry => entry.pinned).length >= ARENA_CUP_ARCHIVE.pins) return archive;
  return Object.freeze({ cups: trimmed(archive.cups.map(entry => entry.id === id ? Object.freeze({ ...entry, pinned }) : entry)) });
}

/** 그 컵의 결승 결과를 봤다. */
export function seeArenaCupArchiveFinal(archive: ArenaCupArchive, id: string): ArenaCupArchive {
  const cup = archive.cups.find(entry => entry.id === id);
  if (!cup || cup.finalSeen) return archive;
  return Object.freeze({ cups: Object.freeze(archive.cups.map(entry => entry.id === id ? Object.freeze({ ...entry, finalSeen: true }) : entry)) });
}

/**
 * 명경기: 기록이 있는 경기를 점수 순으로(같으면 새것 먼저) `count` 개. 결승 결과를 보기 전인 컵의 결승은 빼다(결과를 말하지 않는다).
 */
export function arenaCupArchiveBest(archive: ArenaCupArchive, count: number)
  : readonly { readonly cup: ArenaCupArchiveEntry; readonly bout: ArenaCupArchiveBout }[] {
  return archive.cups.flatMap(cup => cup.bouts.filter(bout => bout.summary !== null && bout.summary.score > 0
    && (cup.finalSeen || bout.round < ARENA_CUP_ROUNDS - 1)).map(bout => ({ cup, bout })))
    .sort((x, y) => y.bout.summary!.score - x.bout.summary!.score || y.cup.endedAt - x.cup.endedAt).slice(0, Math.max(0, count));
}

const isId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 64;
const isCount = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;
const HOWS: readonly string[] = ["ko", "decision", "rated"];

function sanitizeBout(value: unknown): ArenaCupArchiveBout | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const r = value as Record<string, unknown>;
  if (!isCount(r["round"]) || r["round"] >= ARENA_CUP_ROUNDS || !isCount(r["slot"]) || !isId(r["a"]) || !isId(r["b"])
    || (r["winner"] !== r["a"] && r["winner"] !== r["b"]) || !HOWS.includes(r["how"] as string)) return undefined;
  const rules = r["rules"];
  return Object.freeze({ round: r["round"], slot: r["slot"], a: r["a"], b: r["b"], winner: r["winner"],
    how: r["how"] as ArenaCupHow, summary: sanitizeArenaBoutSummary(r["summary"]) ?? null,
    ...(typeof rules === "number" && Number.isInteger(rules) && rules >= 1 ? { rules } : {}) });
}

function sanitizeEntry(value: unknown): ArenaCupArchiveEntry | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const r = value as Record<string, unknown>;
  const slots = r["slots"], out = r["out"] as Record<string, unknown> | null | undefined;
  if (!isId(r["id"]) || !isCount(r["endedAt"]) || !isCount(r["rulesVersion"]) || !isCount(r["seed"]) || !Array.isArray(slots)
    || slots.length !== ARENA_CUP_SIZE || !slots.every(isId) || !isId(r["representative"]) || !slots.includes(r["representative"])
    || (r["champion"] !== null && !isId(r["champion"])) || typeof r["pinned"] !== "boolean" || typeof r["finalSeen"] !== "boolean"
    || !Array.isArray(r["bouts"])) return undefined;
  const lost = out && typeof out === "object" && isCount(out["round"]) && isId(out["by"]) ? Object.freeze({ round: out["round"], by: out["by"] }) : null;
  return Object.freeze({ id: r["id"], endedAt: r["endedAt"], rulesVersion: r["rulesVersion"], seed: r["seed"], slots: Object.freeze([...slots]),
    representative: r["representative"], champion: (r["champion"]), out: lost, pinned: r["pinned"], finalSeen: r["finalSeen"],
    bouts: Object.freeze((r["bouts"] as unknown[]).flatMap(bout => sanitizeBout(bout) ?? [])) });
}

/**
 * 기록실 저장의 판. 2판(2026-10-26): 모양은 1판과 같다. 1판이 판을 올리지 않고 경기에 `rules` 를 더했다 — 옛 페이지는 그 필드를 지운 채 다시
 * 적는다. 2판부터는 옛 페이지가 더 새 판으로 보고 덮지 않는다(`platform/sessionBackedStore`).
 */
export const ARENA_CUP_ARCHIVE_VERSION = 2;

/**
 * 기록실 경기 카드의 결과 자리(2026-10-26 리뷰): 기록이 있으면 결과와 시간(`logged`). 없으면 세기 판정(`rated` — 원화가 없어, 어느 판이든),
 * 옛 규칙 n판(`oldRules` — 규칙 판이 바뀌며 기록을 닫았다), 또는 끝난 방식만(`closed` — 닫힌 뒤 판이 되돌아와 `rules` 가 지워졌다).
 */
export type ArenaArchiveBoutResult =
  | { readonly kind: "logged" } | { readonly kind: "rated" } | { readonly kind: "oldRules"; readonly rules: number } | { readonly kind: "closed" };

export function arenaArchiveBoutResult(bout: ArenaCupArchiveBout): ArenaArchiveBoutResult {
  if (bout.summary !== null) return { kind: "logged" };
  if (bout.how === "rated") return { kind: "rated" };
  return bout.rules !== undefined ? { kind: "oldRules", rules: bout.rules } : { kind: "closed" };
}

/** 저장된 기록실(손상된 컵은 그 컵만 버린다; 판이 다르면 빈 기록실 — 옛 판은 저장소가 먼저 이관한다). */
export function sanitizeArenaCupArchive(value: unknown): ArenaCupArchive {
  if (typeof value !== "object" || value === null || (value as { version?: unknown }).version !== ARENA_CUP_ARCHIVE_VERSION) return EMPTY_ARENA_CUP_ARCHIVE;
  const cups = (value as { cups?: unknown }).cups;
  if (!Array.isArray(cups)) return EMPTY_ARENA_CUP_ARCHIVE;
  const seen = new Set<string>();
  return Object.freeze({ cups: trimmed(cups.flatMap(cup => {
    const entry = sanitizeEntry(cup);
    if (!entry || seen.has(entry.id)) return [];
    seen.add(entry.id);
    return [entry];
  })) });
}

export function arenaCupArchivePayload(archive: ArenaCupArchive): unknown {
  return { version: ARENA_CUP_ARCHIVE_VERSION, cups: archive.cups };
}
