import type { MetaState } from "../sim/MetaProgressRules";

/**
 * 저장 슬롯의 순수 모델 — 슬롯 번호, 슬롯별 저장소 키 파생, 이어하기 대상, 슬롯 메뉴의 커서·두 번
 * 누름 확인, 슬롯을 여는 방식(같은 페이지 / 새로고침)의 판정.
 *
 * 브라우저 저장소는 `platform/activeSaveSlot.ts`·`platform/saveSlotStorage.ts` 가 만지고, 화면 문구는
 * `SaveSlotPresentation.ts` 가 소유한다. 여기는 Phaser·DOM·저장소를 모른다.
 */

export const SAVE_SLOT_IDS = Object.freeze([1, 2, 3] as const);
export type SaveSlotId = (typeof SAVE_SLOT_IDS)[number];

/** 슬롯 도입 이전의 모든 저장은 이 슬롯이다. 키가 원래 주소 그대로라 옮길 데이터가 없다. */
export const DEFAULT_SAVE_SLOT: SaveSlotId = 1;

export function parseSaveSlotId(value: unknown): SaveSlotId | null {
  const parsed = typeof value === "string" && /^[0-9]$/.test(value) ? Number(value) : value;
  return parsed === 1 || parsed === 2 || parsed === 3 ? parsed : null;
}

/**
 * 슬롯별 저장소 주소.
 *
 * 슬롯 1은 **원래 키 그대로**다. 그래서 기존 플레이어의 진행은 한 바이트도 옮기지 않고 슬롯 1이
 * 되고(이관 = 슬롯 포인터 하나 쓰기), 이관이 두 번 돌아도 복사·덮어쓰기가 일어날 자리가 없다.
 * 슬롯 2·3은 접미사를 붙인다 — 접두사가 그대로라 `storageKeys.ts` 의 접두사 규칙이 유지된다.
 */
export function slotScopedKey(baseKey: string, slot: SaveSlotId): string {
  return slot === DEFAULT_SAVE_SLOT ? baseKey : `${baseKey}@slot${slot}`;
}

/** 타이틀이 슬롯 하나에 대해 아는 전부. `meta === null` 이 빈 슬롯이다. */
export interface SaveSlotRecord {
  readonly slot: SaveSlotId;
  readonly meta: MetaState | null;
  /** 마지막으로 진행을 저장한 시각(epoch ms). 슬롯 도입 이전 저장은 모른다(`null`). */
  readonly savedAt: number | null;
}

export function saveSlotUsed(record: SaveSlotRecord | undefined): boolean {
  return record !== undefined && record.meta !== null;
}

/**
 * "이어하기" 가 열 슬롯. 지금 슬롯이 쓰였으면 그것(= 마지막으로 연 슬롯), 아니면 가장 최근에
 * 저장한 다른 슬롯. 시각을 모르는 저장은 가장 오래된 것으로 친다. 쓰인 슬롯이 없으면 `null` —
 * 타이틀은 이어하기를 숨긴다.
 */
export function continueSaveSlot(records: readonly SaveSlotRecord[], active: SaveSlotId): SaveSlotId | null {
  if (saveSlotUsed(records.find((record) => record.slot === active))) return active;
  const used = records.filter(saveSlotUsed);
  if (used.length === 0) return null;
  const newest = [...used].sort((a, b) => (b.savedAt ?? -Infinity) - (a.savedAt ?? -Infinity) || a.slot - b.slot)[0];
  return newest?.slot ?? null;
}

/** 새 게임을 받을 슬롯: 지금 슬롯이 비었으면 그것, 아니면 번호가 가장 앞선 빈 슬롯. */
export function firstEmptySaveSlot(records: readonly SaveSlotRecord[], active: SaveSlotId): SaveSlotId | null {
  if (!saveSlotUsed(records.find((record) => record.slot === active))) return active;
  return SAVE_SLOT_IDS.find((slot) => !saveSlotUsed(records.find((record) => record.slot === slot))) ?? null;
}

/**
 * 새 게임이 슬롯을 비울 때 개인 외형까지 지우는가. 외형은 플레이어가 만든 주인공 그림(생성 비용이 든다)이지 진행이 아니다 —
 * 주인공을 확정한 진행이 있던 슬롯을 덮어쓸 때만 지운다. 주인공을 아직 고르지 않은 슬롯(사진을 만들고 캐릭터 선택에서 물러난
 * 첫 접속 등)은 남은 진행 기록(잠입 일시 저장·마을 재개·시설 재개 등)만 지우고 그림은 둔다.
 */
export function newGameClearsPlayerLook(record: SaveSlotRecord | undefined): boolean {
  return record?.meta?.characterSelected === true;
}

/**
 * 슬롯을 여는 방식.
 *
 * 진행은 여러 곳에 메모리로 남는다 — 저장 실패 시의 세션 사본, 시설 문·인사 1회성 래치, Phaser
 * 텍스처 매니저의 개인 외형. 슬롯을 바꾸거나 새 게임으로 덮을 때 이것들을 하나하나 비우는 대신
 * **페이지를 다시 읽는다.** 새로 추가되는 캐시도 자동으로 따라 비워지는 유일한 방법이다.
 *
 * 같은 페이지에서 그대로 시작하는 경우는 둘뿐이다: 이 페이지가 이미 돌고 있는 슬롯을 이어할 때
 * (슬롯 도입 전과 같은 경로), 그리고 이 페이지에서 한 번도 진행을 가진 적 없는 지금 슬롯에 새 게임을
 * 시작할 때(최초 접속 경로 — 주인공 선택에서 뒤로 나왔다 다시 시작해도 같다). 이 페이지에서 슬롯을
 * 지웠다면(삭제·덮어쓰기) 지운 진행의 메모리 흔적이 남았을 수 있으니 새로고침한다.
 */
export type SaveSlotLaunchPlan = "in-page" | "reload";

export interface SaveSlotLaunchInput {
  readonly slot: SaveSlotId;
  readonly active: SaveSlotId;
  /** 새 게임(빈 슬롯 시작·덮어쓰기)인가. */
  readonly fresh: boolean;
  /** 새 게임이면, 지우기 전의 슬롯에 진행이 있었는가. */
  readonly slotUsed: boolean;
  /** 이 페이지에서 슬롯 진행을 지운 적이 있는가(삭제·덮어쓰기). */
  readonly clearedThisPage: boolean;
}

export function planSaveSlotLaunch(input: SaveSlotLaunchInput): SaveSlotLaunchPlan {
  if (input.slot !== input.active) return "reload";
  if (!input.fresh) return "in-page";
  return !input.slotUsed && !input.clearedThisPage ? "in-page" : "reload";
}

// --- 타이틀 메뉴 -----------------------------------------------------------------------------

export type TitleMenuRowId = "continue" | "new-game" | "slots" | "settings";

/**
 * 타이틀의 세로 메뉴. 첫 행은 이어할 저장이 있으면 "이어하기", 없으면 "게임 시작"(지금 슬롯에
 * 새 게임). 이어하기는 캐릭터 선택 없이 마지막 화면으로 간다(`ResumePoint.continueRoute`).
 */
export function titleMenuRows(continueSlot: SaveSlotId | null): readonly TitleMenuRowId[] {
  return Object.freeze([continueSlot === null ? "new-game" : "continue", "slots", "settings"] as const);
}

// --- 슬롯 선택 패널 ----------------------------------------------------------------------------

export type SaveSlotAction = "continue" | "new" | "delete";

export interface SaveSlotArmed {
  readonly slot: SaveSlotId;
  readonly action: SaveSlotAction;
}

export interface SaveSlotMenuState {
  /** `SAVE_SLOT_IDS` 안의 카드 순번. */
  readonly slotIndex: number;
  /** 그 카드의 `saveSlotActions` 안의 순번. */
  readonly actionIndex: number;
  /** 두 번째 누름을 기다리는 행동. 커서가 움직이면 풀린다. */
  readonly armed: SaveSlotArmed | null;
}

export interface SaveSlotCommand {
  readonly slot: SaveSlotId;
  readonly action: SaveSlotAction;
  /** 새 게임이면 지우기 전 슬롯에 진행이 있었는가(덮어쓰기). */
  readonly overwrite: boolean;
}

export function saveSlotActions(used: boolean): readonly SaveSlotAction[] {
  return used ? ["continue", "new", "delete"] : ["new"];
}

/** 진행이 사라지는 행동만 두 번 누른다: 쓰인 슬롯 덮어쓰기, 삭제. */
export function saveSlotActionNeedsConfirm(action: SaveSlotAction, used: boolean): boolean {
  return action === "delete" || (action === "new" && used);
}

export function initialSaveSlotMenuState(focus: SaveSlotId): SaveSlotMenuState {
  const slotIndex = Math.max(0, SAVE_SLOT_IDS.indexOf(focus));
  return Object.freeze({ slotIndex, actionIndex: 0, armed: null });
}

function recordAt(records: readonly SaveSlotRecord[], slotIndex: number): { slot: SaveSlotId; used: boolean } {
  const slot = SAVE_SLOT_IDS[slotIndex] ?? DEFAULT_SAVE_SLOT;
  return { slot, used: saveSlotUsed(records.find((record) => record.slot === slot)) };
}

/** 좌우는 카드, 위아래는 카드 안의 행동. 끝에서 멈춘다 — 카드 셋이 가로로 놓여 있다. */
export function moveSaveSlotMenu(
  state: SaveSlotMenuState,
  records: readonly SaveSlotRecord[],
  delta: { readonly dx: -1 | 0 | 1; readonly dy: -1 | 0 | 1 },
): SaveSlotMenuState {
  const slotIndex = Math.min(SAVE_SLOT_IDS.length - 1, Math.max(0, state.slotIndex + delta.dx));
  const actions = saveSlotActions(recordAt(records, slotIndex).used);
  const baseAction = slotIndex === state.slotIndex ? state.actionIndex : 0;
  const actionIndex = Math.min(actions.length - 1, Math.max(0, baseAction + delta.dy));
  if (slotIndex === state.slotIndex && actionIndex === state.actionIndex) return state;
  return Object.freeze({ slotIndex, actionIndex, armed: null });
}

/** 포인터가 특정 카드·행동을 가리켰다. */
export function pointSaveSlotMenu(state: SaveSlotMenuState, slotIndex: number, actionIndex: number): SaveSlotMenuState {
  if (slotIndex === state.slotIndex && actionIndex === state.actionIndex) return state;
  return Object.freeze({ slotIndex, actionIndex, armed: null });
}

/** 확인이 필요한 행동은 첫 누름에 걸어 두기만 하고, 같은 행동을 다시 누르면 명령을 돌려준다. */
export function activateSaveSlotMenu(
  state: SaveSlotMenuState,
  records: readonly SaveSlotRecord[],
): { readonly state: SaveSlotMenuState; readonly command: SaveSlotCommand | null } {
  const { slot, used } = recordAt(records, state.slotIndex);
  const action = saveSlotActions(used)[state.actionIndex];
  if (action === undefined) return { state, command: null };
  const armed = state.armed !== null && state.armed.slot === slot && state.armed.action === action;
  if (saveSlotActionNeedsConfirm(action, used) && !armed) {
    return { state: Object.freeze({ ...state, armed: Object.freeze({ slot, action }) }), command: null };
  }
  return {
    state: Object.freeze({ ...state, armed: null }),
    command: Object.freeze({ slot, action, overwrite: action === "new" && used }),
  };
}

/** 슬롯 내용이 바뀐 뒤(삭제) 커서가 사라진 행동을 가리키지 않게 맞춘다. */
export function clampSaveSlotMenu(state: SaveSlotMenuState, records: readonly SaveSlotRecord[]): SaveSlotMenuState {
  const actions = saveSlotActions(recordAt(records, state.slotIndex).used);
  const actionIndex = Math.min(actions.length - 1, state.actionIndex);
  return Object.freeze({ slotIndex: state.slotIndex, actionIndex, armed: null });
}
