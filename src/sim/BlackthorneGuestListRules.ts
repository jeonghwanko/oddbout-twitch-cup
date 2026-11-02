import { blackthorneStory } from "./BlackthorneStoryRules";
import type { MetaState } from "./MetaProgressRules";

/**
 * 「동방 주식회사 전무이사」 — 블랙손 문전박대와 가짜 귀빈 만들기.
 *
 * 시계공을 만난 뒤 처음 저택 문을 두드리면 집사가 세 가지(명단·복장·인장)를 들어 돌려보낸다. 그 세 가지가 곧
 * 순서 자유 체크리스트다: 시계공의 인장, 로잘린의 정장, 신사의 소문. 셋을 갖추면 집사가 "전무이사님"으로 맞는다.
 *
 * 이 파일이 문전박대 여부·세 준비·입장 허가를 소유한다. 연출 시간표는 `app/BlackthorneDoorStory`·
 * `app/GuestListStory`, 마을 재생은 `VillageGuestListController` 가 맡는다. 저택 안 회수는 다음 단계다.
 */

export const GUEST_LIST_TASK_IDS = ["seal", "suit", "rumor"] as const;
export type GuestListTaskId = (typeof GUEST_LIST_TASK_IDS)[number];

export interface BlackthorneGuestListState {
  /** 집사에게 한 번 돌려보내졌는가. 체크리스트와 자판기의 두 물건이 여기서 열린다. */
  readonly turnedAway: boolean;
  readonly seal: boolean;
  readonly suit: boolean;
  readonly rumor: boolean;
  /** 집사가 "전무이사님" 하고 한 번 맞아들였는가. 그 뒤로는 문이 그냥 열린다. */
  readonly admitted: boolean;
}

export const EMPTY_GUEST_LIST: BlackthorneGuestListState = Object.freeze({ turnedAway: false, seal: false, suit: false, rumor: false, admitted: false });
const LEGACY_DONE: BlackthorneGuestListState = Object.freeze({ turnedAway: true, seal: true, suit: true, rumor: true, admitted: true });

type GuestListEvidence = Pick<MetaState, "blackthorneGuestList" | "blackthorneCompleted" | "manorMemory">;

/**
 * 저장의 진행. 이미 블랙손을 성공했거나 한 번이라도 안에 들어가 본 저장(`manorMemory.visits`)은 이 이야기를
 * 거치지 않았어도 모두 갖춘 것으로 본다 — 새 단계를 소급해 이미 들어갔던 문을 막지 않는다.
 * 새 흐름에서는 재입장 뒤에야 첫 방문이 생기므로 이 판정과 어긋나지 않는다.
 */
export function guestListOf(meta: GuestListEvidence): BlackthorneGuestListState {
  if (meta.blackthorneCompleted === true || (meta.manorMemory?.visits ?? 0) > 0) return LEGACY_DONE;
  return meta.blackthorneGuestList ?? EMPTY_GUEST_LIST;
}

export function guestListTaskDone(state: BlackthorneGuestListState, id: GuestListTaskId): boolean {
  return state[id];
}

export function guestListDoneCount(state: BlackthorneGuestListState): number {
  return GUEST_LIST_TASK_IDS.filter((id) => state[id]).length;
}

/** 세 가지를 다 갖췄는가. */
export function guestListReady(meta: GuestListEvidence): boolean {
  const state = guestListOf(meta);
  return state.turnedAway && guestListDoneCount(state) === GUEST_LIST_TASK_IDS.length;
}

export type BlackthorneDoorReception =
  /** 첫 문전박대: 명함 백지 → 세 사유 → 계단 아래로. */
  | "turn-away"
  /** 이미 돌려보내졌고 아직 다 못 갖췄다: 집사가 짧게 남은 것을 일러 준다. */
  | "still-missing"
  /** 다 갖췄다: "전무이사님!" 하고 문이 열린다. 한 번 들어간 뒤로는 그냥 들어간다. */
  | "admit"
  | "open";

/**
 * 현관에서 무슨 일이 일어나는가. 시계공을 아직 만나지 않았으면 문 앞에 서기 전에 시계공이 먼저 붙잡으므로
 * 여기서는 "open" 이 아니라 호출부의 시계공 게이트가 먼저 이긴다.
 */
export function blackthorneDoorReception(meta: GuestListEvidence & Pick<MetaState, "blackthorneStory">): BlackthorneDoorReception {
  if (meta.blackthorneCompleted === true) return "open";
  if (!blackthorneStory(meta as MetaState).introductionSeen) return "open";
  const state = guestListOf(meta);
  if (!state.turnedAway) return "turn-away";
  if (!guestListReady(meta)) return "still-missing";
  return state.admitted ? "open" : "admit";
}

function withState(meta: MetaState, next: BlackthorneGuestListState): MetaState {
  return { ...meta, blackthorneGuestList: next };
}

export function turnAwayAtDoor(meta: MetaState): MetaState {
  const state = guestListOf(meta);
  if (state.turnedAway || meta.blackthorneCompleted === true) return meta;
  return withState(meta, { ...state, turnedAway: true });
}

/** 준비 하나를 갖춘다. 돌려보내지기 전에는 무엇이 필요한지 모르므로 갖출 수 없다. */
export function completeGuestListTask(meta: MetaState, id: GuestListTaskId): MetaState {
  const state = guestListOf(meta);
  if (!state.turnedAway || state[id] || meta.blackthorneCompleted === true) return meta;
  return withState(meta, { ...state, [id]: true });
}

/** 집사가 맞아들였다. 세 가지를 갖춘 뒤에만 기록한다. */
export function admitAtDoor(meta: MetaState): MetaState {
  const state = guestListOf(meta);
  if (state.admitted || !guestListReady(meta)) return meta;
  return withState(meta, { ...state, admitted: true });
}

/**
 * 세 준비가 손에 쥐여 주는 소품. 저장 필드를 늘리지 않는다 — 소유는 준비 플래그(`seal`·`suit`·`rumor`)에서 읽는다.
 * - 인장(시계공) → 톱니 인장이 찍힌 명함
 * - 정장(로잘린) → 넥타이를 목에 맨 "동방 귀족 예복"
 * - 소문(광장의 신사) → 외알 안경과 금줄. "영혼을 담는 거울" 소문과 엮인 신사의 말장난 소품이다.
 */
export const GUEST_LIST_PROP_IDS = ["sealed-card", "eastern-robe", "monocle"] as const;
export type GuestListPropId = (typeof GUEST_LIST_PROP_IDS)[number];

export const GUEST_LIST_PROP_OF: Readonly<Record<GuestListTaskId, GuestListPropId>> = Object.freeze({
  seal: "sealed-card",
  suit: "eastern-robe",
  rumor: "monocle",
});

/** 지금 가진 소품(체크리스트 순서). 기존 완료 저장(`guestListOf` 의 소급 완료)은 셋 다 가진다. */
export function guestListProps(meta: GuestListEvidence): readonly GuestListPropId[] {
  const state = guestListOf(meta);
  return GUEST_LIST_TASK_IDS.filter((id) => state[id]).map((id) => GUEST_LIST_PROP_OF[id]);
}

/**
 * 마을에서 "동방 귀빈" 변장을 할 자격. 남성 경로만(변장 원화가 남성 전용), 집사가 한 번 맞아들인 뒤,
 * 블랙손을 아직 끝내지 않은 동안이다. 원화가 없으면(`look.guise === null`) 자격이 있어도 그리지 않는다.
 */
export function blackthorneGuestGuise(meta: GuestListEvidence & Pick<MetaState, "character">): boolean {
  return meta.character === "male" && guestListOf(meta).admitted && meta.blackthorneCompleted !== true;
}

/**
 * 이번 마을 방문에서 순간 변장을 할 수 있는가(재입장 `admit` 의 변장, 그 뒤의 `don`). 남성 + 블랙손 미완료 +
 * 한 번 돌려보내진 뒤다. 마을은 이때만 변장 원화(약 5 MiB)를 받는다 — 방문 중에 마지막 준비를 끝내도 이미 받아 둔다.
 */
export function blackthorneGuestGuiseAhead(meta: GuestListEvidence & Pick<MetaState, "character">): boolean {
  return meta.character === "male" && meta.blackthorneCompleted !== true && guestListOf(meta).turnedAway;
}

/** 남은 준비. 체크리스트 순서(인장 → 복장 → 소문)다. */
export function remainingGuestListTasks(meta: GuestListEvidence): readonly GuestListTaskId[] {
  const state = guestListOf(meta);
  return GUEST_LIST_TASK_IDS.filter((id) => !state[id]);
}

/** 저장 경계. 돌려보내지기 전의 준비 기록은 버린다. */
export function sanitizeBlackthorneGuestList(value: unknown): BlackthorneGuestListState {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return EMPTY_GUEST_LIST;
  const record = value as Record<string, unknown>;
  const turnedAway = record["turnedAway"] === true;
  const seal = turnedAway && record["seal"] === true;
  const suit = turnedAway && record["suit"] === true;
  const rumor = turnedAway && record["rumor"] === true;
  return { turnedAway, seal, suit, rumor, admitted: seal && suit && rumor && record["admitted"] === true };
}
