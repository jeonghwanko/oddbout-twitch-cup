import type { MetaState } from "./MetaProgressRules";
import type { MansionLayout } from "./MansionLayout";
import type { SimState } from "./simulation";
import type { SimEvent, Vec2 } from "./types";
import type { BlackthorneSpatialGeometry } from "./BlackthorneSpatialGeometry";

/**
 * 그리브스 첫 편 '안식처'의 순수 규칙(`docs/Plan/2026-10-15-otto-grieves-story-play/grieves-plan.md` §4·§5·§7).
 *
 * 영속 사실(`GrievesStoryMemory` = `MetaState.grievesStory`): G1 도입·G3 회상의 시청(미시청·스킵·완주)과
 * G4 사용인의 직접 퇴장. 앱이 런 도중 최신 메타에 병합해 저장한다(`ProgressStore.commitGrievesStory`).
 * sim 은 저장소를 읽지 않는다. 없는 사실은 미경험이다 — 옛 완료 저장에 자동 부여하지 않는다.
 *
 * 런 사실(`GrievesServantState` = `ExteriorHeistState.servant`): 금고지기 회랑 뒷벽의 퇴장문과 사용인.
 * 문은 실제 열쇠를 쥔 뒤에만 생기는 장치의 실제 전이(`CaperDeviceTriggered`)로 열리고, 다시 잠기지 않는다.
 * 퇴장은 사용인이 안전 지점에 닿을 때 한 번 끝난다(`KeeperServantLeft`). 문은 배경이다 — 플레이어 충돌·통로가 없고
 * 본선(열쇠 → 복귀 통로 → 크랭크 → 정비 사다리 → 안전 걸쇠 → 태엽새 → 옥상)을 대신하지 않는다.
 * 이 런이 시작할 때의 기억은 레이아웃(`manor.initialGrievesStory`)에 실려, 리플레이·복원이 브라우저 메타 없이 같은 결과를 낸다.
 */

export type GrievesViewing = "unseen" | "skipped" | "viewed";

export interface GrievesStoryMemory {
  /** G1 도입(회랑 진입). 로딩만으로는 바뀌지 않는다 — 마지막 컷 확인이 `viewed`, 명시적 스킵이 `skipped`. */
  readonly intro: GrievesViewing;
  /** G3 회상(실제 열쇠 취득·잡기 연출 뒤). 자산 실패로 닫으면 `skipped` 다(보지 않은 것을 봤다고 쓰지 않는다). */
  readonly memory: GrievesViewing;
  /** 사용인이 열린 문으로 안전 지점까지 직접 나갔다. 뒤의 실패·재시도·스킵이 취소하지 않는다. */
  readonly servantFreed: boolean;
}

/** 앱이 확정하는 사실 하나. 시청은 내려가지 않는다(viewed > skipped > unseen). */
export type GrievesStoryFact =
  | { readonly kind: "intro" | "memory"; readonly viewing: Exclude<GrievesViewing, "unseen"> }
  | { readonly kind: "servant-freed" };

export const GRIEVES_STORY_UNSEEN: GrievesStoryMemory = Object.freeze({ intro: "unseen", memory: "unseen", servantFreed: false });

const VIEWING_RANK: Readonly<Record<GrievesViewing, number>> = { unseen: 0, skipped: 1, viewed: 2 };

const viewingOf = (value: unknown): GrievesViewing => value === "viewed" || value === "skipped" ? value : "unseen";
const higher = (a: GrievesViewing, b: GrievesViewing): GrievesViewing => VIEWING_RANK[b] > VIEWING_RANK[a] ? b : a;
const sameMemory = (a: GrievesStoryMemory, b: GrievesStoryMemory) =>
  a.intro === b.intro && a.memory === b.memory && a.servantFreed === b.servantFreed;

export function sanitizeGrievesStory(value: unknown): GrievesStoryMemory {
  const record = value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
  return { intro: viewingOf(record["intro"]), memory: viewingOf(record["memory"]), servantFreed: record["servantFreed"] === true };
}

export function grievesStory(meta: Pick<MetaState, "grievesStory">): GrievesStoryMemory {
  return sanitizeGrievesStory(meta.grievesStory);
}

/** 두 기억의 합. 시청은 높은 쪽, 퇴장은 어느 한쪽이라도 참이면 참이다. 순서와 무관하다. */
export function mergeGrievesStory(a: GrievesStoryMemory, b: GrievesStoryMemory): GrievesStoryMemory {
  return { intro: higher(a.intro, b.intro), memory: higher(a.memory, b.memory), servantFreed: a.servantFreed || b.servantFreed };
}

function applyFact(memory: GrievesStoryMemory, fact: GrievesStoryFact): GrievesStoryMemory {
  if (fact.kind === "servant-freed") return memory.servantFreed ? memory : { ...memory, servantFreed: true };
  const viewing = higher(memory[fact.kind], fact.viewing);
  return viewing === memory[fact.kind] ? memory : { ...memory, [fact.kind]: viewing };
}

/** 사실들을 진행에 덧붙인다. 아무것도 바뀌지 않으면 같은 객체다(저장하지 않는다). */
export function rememberGrievesStory(meta: MetaState, ...facts: readonly GrievesStoryFact[]): MetaState {
  const before = grievesStory(meta);
  const after = facts.reduce(applyFact, before);
  return sameMemory(before, after) ? meta : { ...meta, grievesStory: after };
}

/**
 * 화면이 들고 온 진행(`carried`)의 그리브스 기억을 최신 진행(`latest`)에 합친다. 앞선 저장이 실패해 같은 탭에만 남은 사실을
 * 다음 저장이 잃지 않게 한다. `carried` 에 기억이 없으면 아무것도 지어내지 않는다.
 */
export function carryGrievesStory(latest: MetaState, carried: Pick<MetaState, "grievesStory">): MetaState {
  if (carried.grievesStory === undefined) return latest;
  const before = grievesStory(latest);
  const after = mergeGrievesStory(before, grievesStory(carried));
  return sameMemory(before, after) ? latest : { ...latest, grievesStory: after };
}

// ── 퇴장문과 사용인(런 상태) ──

export const GRIEVES_SERVANT = Object.freeze({
  /** 문이 열린 뒤 사용인이 안쪽 손잡이를 밀고 나서기까지(sim ms). 이 동안 사용인은 문간에 선다. */
  openingMs: 700,
  /** 문간에서 안전 지점까지 걷는 속도(px/s). */
  walkSpeed: 72,
});

/**
 * 문이 열리기 전에는 상태가 없다(`undefined` = 잠긴 문 뒤에서 기다린다). 열린 뒤에만 실린다.
 * - `doorOpen`: 늘 참이다. 문은 다시 잠기지 않는다.
 * - `walkMs`: 문이 열린 스텝 다음부터 흐른 sim 시간. 일시정지·회상 중에는 sim 이 멈추므로 같이 멈춘다.
 * - `freed`: 안전 지점에 닿았다. 그 뒤로는 걷지도 사건을 내지도 않는다.
 */
export interface GrievesServantState {
  readonly doorOpen: boolean;
  readonly walkMs: number;
  readonly freed: boolean;
}

export type GrievesServantDoor = BlackthorneSpatialGeometry["heist"]["servantDoor"];

/** 이전 런들에서 이미 떠난 사용인: 문은 열려 있고 사람은 없다. */
const FREED_BEFORE_RUN: GrievesServantState = Object.freeze({ doorOpen: true, walkMs: 0, freed: true });

/**
 * 이 판의 퇴장문. 문이 생기기 전(2026-10-15)에 저장된 블랙손 리플레이 레이아웃에는 없다 — 그때는 문도 사용인도 없어 옛 재생이 그대로 돈다.
 */
export function grievesServantDoor(layout: Pick<MansionLayout, "manor">): GrievesServantDoor | null {
  const heist = layout.manor?.heist === true ? layout.manor.spatialGeometry?.heist : undefined;
  return (heist as Partial<BlackthorneSpatialGeometry["heist"]> | undefined)?.servantDoor ?? null;
}

/** 이 런이 시작할 때 이미 떠났는가. 런을 짠 진행(`RunLoadout`)이 레이아웃에 실은 값만 읽는다. */
export function grievesServantFreedAtRunStart(layout: Pick<MansionLayout, "manor">): boolean {
  return layout.manor?.initialGrievesStory?.servantFreed === true;
}

/** 문이 열렸는가(이 런에서 열었거나 이전 런에서 떠났다). 장치·안내·문 원화가 같은 값을 읽는다. */
export function grievesServantDoorOpen(layout: Pick<MansionLayout, "manor">, servant: GrievesServantState | undefined): boolean {
  return servant?.doorOpen === true || grievesServantFreedAtRunStart(layout);
}

/** 문이 열린 뒤 안전 지점에 닿기까지의 sim 시간(ms). */
export function grievesServantExitMs(door: GrievesServantDoor): number {
  return GRIEVES_SERVANT.openingMs + (door.x - door.safeX) * 1000 / GRIEVES_SERVANT.walkSpeed;
}

/**
 * 화면에 설 사용인. 떠났거나(이 런·이전 런) 문이 없는 판이면 null 이다.
 * `waiting` 은 잠긴 문 뒤, `opening` 은 문간에서 손잡이를 미는 박자, `walking` 은 안전 지점으로 가는 중이다(서쪽, facing -1).
 */
export function grievesServantPose(layout: Pick<MansionLayout, "manor">, servant: GrievesServantState | undefined): {
  readonly phase: "waiting" | "opening" | "walking";
  readonly at: Vec2;
} | null {
  const door = grievesServantDoor(layout);
  if (door === null || servant?.freed === true || grievesServantFreedAtRunStart(layout)) return null;
  if (servant?.doorOpen !== true) return { phase: "waiting", at: { x: door.x, y: door.y } };
  const walkedPx = Math.max(0, servant.walkMs - GRIEVES_SERVANT.openingMs) * GRIEVES_SERVANT.walkSpeed / 1000;
  return { phase: servant.walkMs < GRIEVES_SERVANT.openingMs ? "opening" : "walking",
    at: { x: Math.max(door.safeX, door.x - walkedPx), y: door.y } };
}

/**
 * 한 스텝의 문·사용인. `keyTaken` 은 이번 스텝 끝의 실제 열쇠 취득이다. 문 장치는 열쇠를 쥔 뒤에만 레이아웃에 생기므로
 * (`exteriorHeistLayout`) 그 장치의 실제 전이만 문을 연다. 열린 스텝에 `KeeperServantDoorOpened`, 안전 지점에 닿은 스텝에
 * `KeeperServantLeft` 를 한 번씩 낸다.
 */
export function advanceGrievesServant(previous: GrievesServantState | undefined, layout: MansionLayout,
  keyTaken: boolean, events: readonly SimEvent[], dtMs: number,
): { readonly state: GrievesServantState | undefined; readonly events: readonly SimEvent[] } {
  if (previous?.freed === true) return { state: previous, events: [] };
  const door = grievesServantDoor(layout);
  if (door === null) return { state: previous, events: [] };
  if (grievesServantFreedAtRunStart(layout)) return { state: FREED_BEFORE_RUN, events: [] };
  const before = previous?.doorOpen === true ? previous : undefined;
  if (before === undefined) {
    const opened = keyTaken && events.some(e => e.kind === "CaperDeviceTriggered" && e.deviceId === door.id);
    return opened
      ? { state: { doorOpen: true, walkMs: 0, freed: false }, events: [{ kind: "KeeperServantDoorOpened", at: { x: door.x, y: door.y } }] }
      : { state: undefined, events: [] };
  }
  const walkMs = before.walkMs + Math.max(0, dtMs);
  const freed = walkMs >= grievesServantExitMs(door);
  return { state: { doorOpen: true, walkMs, freed },
    events: freed ? [{ kind: "KeeperServantLeft", at: { x: door.safeX, y: door.y } }] : [] };
}

/**
 * 체크포인트·이어하기 복원 경계. 이 런을 짠 진행이 이미 퇴장을 확정했다면(`manor.initialGrievesStory`) 스냅샷이 그 전이어도
 * 사용인을 다시 가두거나 걷게 하지 않는다 — 사건도 다시 내지 않는다. 브라우저 저장소는 읽지 않는다(리플레이가 같은 결과를 낸다).
 */
export function restoreGrievesServant(state: SimState, layout: MansionLayout): SimState {
  const exterior = state.manor?.exterior;
  if (exterior === undefined || exterior.servant?.freed === true || grievesServantDoor(layout) === null
    || !grievesServantFreedAtRunStart(layout)) return state;
  return { ...state, manor: { ...state.manor!, exterior: { ...exterior, servant: FREED_BEFORE_RUN } } };
}
