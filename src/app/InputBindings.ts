import { ACTION_LABELS, CITY_COMBAT_HELP_ACTIONS, cityCombatActionLabel, type CityCombatHelpAction } from "./ActionLabels";
import type { Locale } from "./Locale";
import type { RebindableAction } from "./PlayerSettings";

export type KeyBinding = readonly string[];

/** 마을이 키보드로 읽는 잠입 행동(이동·달리기·C/V 대결). 마을 상호작용(확인 키)은 이들에게 키를 양보한다. */
type NativeCityWorldAction = "left" | "right" | "up" | "down" | "run" | "attack" | "heavy";
const NATIVE_CITY_WORLD_ACTIONS: readonly NativeCityWorldAction[] = Object.freeze(["left", "right", "up", "down", "run", "attack", "heavy"]);

/**
 * 마을(도시)의 상호작용·대사 넘김 키 = 확인(`shared.confirm`, F·Enter). 2026-10-12 사용자 결정 — 마을에서 E 는 쓰지 않는다
 * (잠입 상호작용 `heist.interact` 재지정도 마을에는 닿지 않는다). 이동·달리기·평타·강타를 F 로 재지정했으면 F 는 그 행동에
 * 양보하고 Enter 만 남는다(Enter 는 예약키라 아무 행동도 가져갈 수 없다).
 */
export function nativeCityInteractionBinding(
  bindings: Readonly<Record<NativeCityWorldAction, KeyBinding> & Partial<Record<HeistAction, KeyBinding>>>,
): KeyBinding {
  const occupied = new Set(NATIVE_CITY_WORLD_ACTIONS.flatMap(action => bindings[action]));
  return Object.freeze(INPUT_BINDINGS.shared.confirm.filter(code => !occupied.has(code)));
}

const keys = (...codes: string[]): KeyBinding => Object.freeze(codes);

const DOM_KEY_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  "1": "ONE",
  "2": "TWO",
  ArrowLeft: "LEFT",
  ArrowRight: "RIGHT",
  ArrowUp: "UP",
  ArrowDown: "DOWN",
  Escape: "ESC",
  Enter: "ENTER",
  Tab: "TAB",
  Shift: "SHIFT",
  " ": "SPACE",
});
const T_CONTEXT_KEY = keys("T");

/** 패드 Menu 짧게 = 일시정지 메뉴, 길게 = 퀘스트 기록. 잠입과 마을이 같은 시간을 쓴다. */
export const QUEST_JOURNAL_GAMEPAD_HOLD_MS = 500;

/** Phaser와 DOM 키 이벤트가 함께 소비하는 키 바인딩 SSOT. */
export const INPUT_BINDINGS = Object.freeze({
  shared: Object.freeze({
    /**
     * 확인 = F · Enter (2026-10-12 사용자 결정: "퀘스트 진행 단축키를 F와 ENTER로 통일"). 게임 어디서나 확인·대사 넘김·컷신·웹툰
     * 넘김·메뉴 결정이고, 마을에서는 상호작용(`nativeCityInteractionBinding`)이기도 하다. Space·E 는 확인이 아니다.
     * F 는 잠입의 숨기(`heist.hide`)와 같은 키라, 잠입에서는 대사·컷신이 떠 있을 때만 확인으로 읽힌다(`heistConfirmClaimsKey`).
     */
    confirm: keys("F", "ENTER"),
    back: keys("ESC"),
    mute: keys("M"),
    debug: keys("F3"),
    tutorial: T_CONTEXT_KEY,
    questJournal: T_CONTEXT_KEY,
    // 잠입·튜토리얼·마을의 일시정지 메뉴. 설정은 그 메뉴 안에서 연다(타이틀은 S/START).
    pause: keys("ESC"),
  }),
  village: Object.freeze({
    left: keys("LEFT"),
    right: keys("RIGHT"),
    up: keys("UP"),
    down: keys("DOWN"),
    // 상호작용 키는 따로 없다 — 마을 상호작용은 확인(F·Enter)이다(`nativeCityInteractionBinding`).
    // T는 퀘스트 기록이다 — 마을에서는 나만의 스토리북, 잠입에서는 사건 수첩.
    questJournal: T_CONTEXT_KEY,
    /** 장비창(도구 두 개·무기 개조 사고 되팔기). 입장과 무관하게 마을에서 언제든 연다. */
    equipment: keys("I"),
    // 옛 마을의 카메라 거리(원경→중간→가까이) 키. 지금 마을은 읽지 않는다 — 키 예약표만 이 값을 본다.
    cameraZoom: keys("Z"),
    questPanel: keys("H"),
    questGuide: keys("A"),
    freeTalk: keys("TAB"),
  }),
  characterSelect: Object.freeze({
    details: T_CONTEXT_KEY,
  }),
  outfitShop: Object.freeze({ explore: keys('TAB'), commissions: keys('C') }),
  heist: Object.freeze({
    left: keys("LEFT"),
    right: keys("RIGHT"),
    up: keys("UP"),
    down: keys("DOWN"),
    run: keys("SHIFT"),
    jump: keys("SPACE"),
    interact: keys("E"),
    hide: keys("F"),
    whistle: keys("X"),
    throw: keys("Q"),
    toolSlot1: keys("ONE"),
    toolSlot2: keys("TWO"),
    snuff: keys("R"),
    drop: keys("G"),
    thiefEye: keys("TAB"),
    attack: keys("C"),
    heavy: keys("V"),
  }),
  briefing: Object.freeze({
    left: keys("LEFT"),
    right: keys("RIGHT"),
    up: keys("UP"),
    down: keys("DOWN"),
    cycle: keys("TAB"),
    registerArtifact: keys("U"),
    /** 무기 탭에서 커서의 도구를 2번 칸에 넣는다(확인은 1번 칸). 마을 장비창의 칸 버튼과 같은 규칙(`equipToolInSlot`). 패드는 X. */
    equipSlot2: keys("TWO"),
  }),
  /**
   * 무투장: F8 은 마을 게시판에서 들어간 대회 경기의 직접·AI 조종 전환(고르기 화면의 경기는 늘 AI — 2026-10-22 사용자 결정), F9 는 등록 선수
   * 대결, O 는 고르기 화면의 상대 고르기(2026-10-22 ODDBOUT 화면, 패드는 Y).
   */
  // The arena's first scene (2026-10-24, the cup bracket): Y makes the slot's fighter the representative, Delete / Backspace empties the slot.
  arena: Object.freeze({ autoPlay: keys("F8"), registeredDuel: keys("F9"), represent: keys("Y"), removeSlot: keys("DELETE", "BACKSPACE"),
    pickA: keys("ONE"), pickB: keys("TWO"), archive: keys("H") }),
  nativeCity: Object.freeze({cameraLeft:keys("Q"),cameraRight:keys("R"),zoomIn:keys("+","="),zoomOut:keys("-"),zoomReset:keys("0")}),
  /**
   * 도시 맨주먹 대결의 방어(2026-10-09 전통 공방). Z 유지 = 막기(2026-10-18 패리 없앰), X = 넘기(쿠마형 상대를 물구나무로 넘는다, 멀면
   * 달려가서 — 오토전은 제자리 회피). 평타·콤보는
   * 저택 전투 바인딩(C `attack`·V `heavy`)을 같이 쓴다. 재지정할 수 있다(`PlayerSettings.REBINDABLE_ACTIONS`) — 잠입의 X 휘파람과는
   * 같은 순간에 살아 있지 않아 겹쳐도 된다(`bindingContextsOverlap`). 패드는 자기 칸 없이 잠입 행동의 버튼을 빌린다(`CITY_COMBAT_PAD_SOURCE`).
   * S = 기술 방출(2026-10-10 오토 기술 소매치기: 훔친 직진을 되던진다 — Z/X 바로 위, 마을 전투에서 비어 있던 키). 패드 칸은 아직 없다.
   */
  cityCombat: Object.freeze({
    guard: keys("Z"),
    dodge: keys("X"),
    release: keys("S"),
  }),
  settlement: Object.freeze({
    exportReplay: keys("B"),
    exportPlayLogs: keys("L"),
    legend: keys("P"),
  }),
  /** 쪽이 여럿인 메뉴(퀘스트 기록의 상세)의 쪽 넘김. 패드는 LT·RT(`MenuInputRouter` 의 화면 동작). */
  menu: Object.freeze({
    pageUp: keys("PAGEUP"),
    pageDown: keys("PAGEDOWN"),
  }),
});

/** A conflicting movement binding wins; L is globally reserved for menus/export. */
export function villageQuestBinding(bindings: Pick<typeof INPUT_BINDINGS.heist, "left" | "right" | "up" | "down" | "interact">): KeyBinding {
  return Object.values(bindings).some(binding => binding.some(code => INPUT_BINDINGS.village.questJournal.includes(code)))
    ? INPUT_BINDINGS.settlement.exportPlayLogs : INPUT_BINDINGS.village.questJournal;
}

/** 이동·상호작용 재지정을 우선하고 패널 접기는 비어 있는 키로 옮긴다. */
export function villageQuestPanelBinding(bindings: Pick<typeof INPUT_BINDINGS.heist, "left" | "right" | "up" | "down" | "interact">): KeyBinding {
  const used = new Set(Object.values(bindings).flat());
  return keys(...[...INPUT_BINDINGS.village.questPanel, "J", "K", "P", "O", "U"].filter(code => !used.has(code)).slice(0, 1));
}

/** 자동 이동보다 사용자가 재지정한 이동·상호작용을 우선한다. */
export function villageQuestGuideBinding(bindings: Pick<typeof INPUT_BINDINGS.heist, "left" | "right" | "up" | "down" | "interact">): KeyBinding {
  const used = new Set(Object.values(bindings).flat());
  // F 는 마을 확인 키(상호작용)라 후보에서 뺀다(2026-10-12). R 은 카메라 회전(`nativeCity.cameraRight`)이 먼저 가져가 뺀다.
  return keys(...[...INPUT_BINDINGS.village.questGuide, "G", "B", "X"].filter(code => !used.has(code)).slice(0, 1));
}

/**
 * 이동·상호작용 재지정을 우선하고 장비창은 비어 있는 키로 옮긴다. 다른 마을 고정·폴백 키(N·Y·Z·H·A·L·T·G·B·X·R·J·K·P·O·U)·확인 F,
 * 도시 대결 키(C 평타·V 콤보·S 방출)와 카메라 회전 Q·R 은 피한다 — 씬이 카메라 키를 먼저 읽어 장비 키가 먹히지 않았다.
 */
export function villageEquipmentBinding(bindings: Pick<typeof INPUT_BINDINGS.heist, "left" | "right" | "up" | "down" | "interact">): KeyBinding {
  const used = new Set(Object.values(bindings).flat());
  return keys(...[...INPUT_BINDINGS.village.equipment, "W", "D", "E"].filter(code => !used.has(code)).slice(0, 1));
}

/**
 * 실제 런타임에 표시하는 조작 안내. 바인딩을 바꿀 때 함께 바뀌는 유일한 원본이다.
 * 저택·마을 도움말은 고정 문자열이 아니라 아래 `heistCombatHelp` 류의 파생 함수다 —
 * 손으로 베낀 사본을 여기 두면 파생과 어긋난 채로 조용히 늙는다.
 */
export const INPUT_HELP = Object.freeze({
  // 타이틀은 눌러야 할 곳(시작 버튼)이 눈앞에 있다. 마우스와 패드까지 셋을 늘어놓으면
  // 셋 다 흐려지므로 키보드 한 벌만 남긴다 — 버튼 클릭과 패드 A는 그대로 동작한다.
  title: confirmKeyProse(),
  tutorialExit: "Esc 튜토리얼 나가기   M 음소거",
  settlement: Object.freeze({
    returnToVillage: `${confirmKeyProse()} / 패드 A  마을로`,
    exportReplay: "B / 패드 X  재현 파일",
    exportPlayLogs: "L / 패드 Y  플레이테스트 로그",
    legend: "P / 패드 R1  전설의 한 컷",
  }),
});

export type HeistAction = keyof typeof INPUT_BINDINGS.heist;
export type CityCombatAction = keyof typeof INPUT_BINDINGS.cityCombat;
/** 패드 버튼을 빌리는 도시 대결 행동(가드·회피). 기술 방출은 패드 범위 밖이다(2026-10-10). */
export type CityCombatPadAction = Exclude<CityCombatAction, "release">;
/** Every action a key can be bound to (heist + the city fight's guard/dodge). */
export type BindableAction = HeistAction | CityCombatAction;

export function isCityCombatAction(action: string): action is CityCombatAction {
  return Object.hasOwn(INPUT_BINDINGS.cityCombat, action);
}

/**
 * The heist actions the city reads from the keyboard too (movement, C/V swings): a guard/dodge key must not collide with them.
 * 잠입 상호작용(`interact`, E)은 2026-10-12 부터 마을에서 읽지 않는다 — 마을 상호작용은 확인(F·Enter)이고, 그 키는
 * `CITY_COMBAT_RESERVED_CODES` 가 막는다. 그래서 가드·회피는 잠입의 E 와 겹쳐도 된다.
 */
export const CITY_COMBAT_SHARED_ACTIONS = Object.freeze([
  "left", "right", "up", "down", "run", "attack", "heavy",
] as const satisfies readonly HeistAction[]);

/**
 * Keys the city keeps for itself (camera turn/zoom, the village panels, confirm): guard and dodge cannot take them.
 * Menu and diagnostic keys are reserved everywhere already (`RESERVED_BINDING_CODES`).
 * 확인(`shared.confirm`, F·Enter)도 막는다 — 마을 상호작용·대사 넘김 키이고, 도시 씬은 대결 키를 확인보다 먼저 읽으므로
 * 가드를 F 에 두면 대화를 넘기거나 문을 여는 대신 가드가 올라간다. F 는 잠입 숨기로는 계속 지정할 수 있다.
 */
export const CITY_COMBAT_RESERVED_CODES: readonly string[] = Object.freeze([...new Set([
  ...Object.values(INPUT_BINDINGS.nativeCity).flat(),
  ...INPUT_BINDINGS.shared.confirm,
  ...INPUT_BINDINGS.village.questJournal, ...INPUT_BINDINGS.village.equipment,
  ...INPUT_BINDINGS.village.questPanel, ...INPUT_BINDINGS.village.questGuide,
])]);

/**
 * Two actions are live at the same moment, so they may not share a key: two heist actions, the two city-fight actions, or a
 * city-fight action and a heist action the city reads (`CITY_COMBAT_SHARED_ACTIONS`). X can be the heist whistle and the city dodge.
 */
export function bindingContextsOverlap(a: BindableAction, b: BindableAction): boolean {
  const cityA = isCityCombatAction(a), cityB = isCityCombatAction(b);
  if (cityA === cityB) return true;
  const heist = (cityA ? b : a) as HeistAction;
  return (CITY_COMBAT_SHARED_ACTIONS as readonly HeistAction[]).includes(heist);
}

/** The default keys of any bindable action. */
export function defaultBinding(action: BindableAction): KeyBinding {
  return isCityCombatAction(action) ? INPUT_BINDINGS.cityCombat[action] : INPUT_BINDINGS.heist[action];
}

/**
 * 패드 버튼으로 재지정할 수 있는 행동.
 *
 * 이동은 스틱과 D-pad 가 소유하므로 버튼 표에 넣지 않고, 도구 슬롯은 자기 버튼이 아니라
 * `thiefEye + whistle/throw` 조합에서 파생하므로 여기 없다 — 조합을 따로 저장하면
 * 괴도의 눈을 옮겼을 때 도구 선택만 옛 버튼에 남는다.
 */
export const PAD_REBINDABLE_ACTIONS = Object.freeze([
  "run",
  "jump",
  "interact",
  "hide",
  "whistle",
  "throw",
  "snuff",
  "drop",
  "thiefEye",
  "attack",
  "heavy",
] as const satisfies readonly HeistAction[]);

/**
 * 재지정 가능한 패드 버튼. Menu(`start`)와 D-pad 는 목록에 없다 — 메뉴 열기와 이동은
 * 재지정 대상이 아니라서, 키보드의 `RESERVED_BINDING_CODES` 처럼 "목록에 없음" 자체가 예약이다.
 * 행동 수와 버튼 수가 같은 일대일 표라서 재지정은 거절이 아니라 맞바꾸기로 끝난다.
 */
export const PAD_BUTTONS = Object.freeze([
  "south",
  "east",
  "west",
  "north",
  "leftShoulder",
  "rightShoulder",
  "leftTrigger",
  "rightTrigger",
  "select",
  "leftStick",
  "rightStick",
] as const);

export type PadRebindableAction = (typeof PAD_REBINDABLE_ACTIONS)[number];
export type PadButton = (typeof PAD_BUTTONS)[number];
export type PadButtonMap = Readonly<Record<PadRebindableAction, PadButton>>;
/** Navigation yields to the village's active actions, including user remaps (and the fight's super on the current-tool button, `throw`). */
export function villageGuidePadBinding(map: PadButtonMap): PadButton | null {
  const used = new Set(['interact', 'run', 'attack', 'heavy', 'guard', 'dodge', 'release', 'throw'].map(action => map[action as PadRebindableAction]));
  return (['select', 'north', 'rightShoulder', 'leftShoulder'] as const).find(button => !used.has(button)) ?? null;
}
export type PadButtonState = Readonly<Record<PadButton, boolean>>;

/** Xbox 표기 한 벌. 패드 글리프의 유일한 원본이다. */
export const PAD_BUTTON_LABELS: Readonly<Record<PadButton, string>> = Object.freeze({
  south: "A",
  east: "B",
  west: "X",
  north: "Y",
  leftShoulder: "LB",
  rightShoulder: "RB",
  leftTrigger: "LT",
  rightTrigger: "RT",
  select: "View",
  leftStick: "L3",
  rightStick: "R3",
});

/** 손으로 배선돼 있던 기본 패드 배치. 저장이 없으면 지금까지와 완전히 같은 조작이다. */
export const DEFAULT_PAD_BUTTONS: PadButtonMap = Object.freeze({
  run: "rightTrigger",
  jump: "south",
  interact: "west",
  hide: "east",
  whistle: "leftShoulder",
  throw: "rightShoulder",
  snuff: "north",
  drop: "select",
  thiefEye: "leftTrigger",
  attack: "rightStick",
  heavy: "leftStick",
});

export function padButtonLabel(button: PadButton): string {
  return PAD_BUTTON_LABELS[button];
}

export function isPadButton(value: unknown): value is PadButton {
  return typeof value === "string" && (PAD_BUTTONS as readonly string[]).includes(value);
}

export function isPadButtonMap(value: unknown): value is PadButtonMap {
  if (typeof value !== "object" || value === null) return false;
  const map = value as Record<string, unknown>;
  return PAD_REBINDABLE_ACTIONS.every((action) => isPadButton(map[action]));
}

/**
 * 행동 하나에 버튼 하나를 준다. 버튼을 이미 쓰는 행동이 있으면 **맞바꾼다** —
 * 표가 일대일이라 키보드처럼 중복을 거절하면 어떤 선택도 거절되고, 남는 버튼이 없어
 * "먼저 다른 행동을 비워라" 는 안내도 성립하지 않는다.
 */
export function swapPadButton(
  map: PadButtonMap,
  action: PadRebindableAction,
  button: PadButton,
): PadButtonMap {
  const current = map[action];
  if (current === button) return map;
  const displaced = PAD_REBINDABLE_ACTIONS.find((other) => map[other] === button);
  const next: Record<PadRebindableAction, PadButton> = { ...map };
  next[action] = button;
  if (displaced !== undefined) next[displaced] = current;
  return Object.freeze(next);
}

/** 씬이 `pressed.south` 같은 원시 버튼 이름을 다시 적지 않게 하는 유일한 해석기. */
export function padActionActive(
  state: PadButtonState,
  action: PadRebindableAction,
  padButtons: PadButtonMap = DEFAULT_PAD_BUTTONS,
): boolean {
  return state[padButtons[action]];
}

/**
 * 도시 대결 방어의 패드 버튼. 도구 슬롯처럼 자기 칸 없이 잠입 행동의 버튼을 빌린다 — 패드 표는 행동 수와 버튼 수가 같은
 * 일대일 표라 칸을 늘릴 수 없다. 가드 = 휘파람 버튼(기본 LB, 눌러 막는 어깨 버튼), 회피 = 은신 버튼(기본 B). 도시에서는 휘파람·
 * 은신을 쓰지 않는다. 그 행동을 재지정하면 함께 따라간다.
 */
export const CITY_COMBAT_PAD_SOURCE: Readonly<Record<CityCombatPadAction, PadRebindableAction>> = Object.freeze({
  guard: "whistle",
  dodge: "hide",
});

/**
 * 도시 대결의 치기 패드 버튼(2026-10-15 쿠마전 3단계): C 연타 = 점프 버튼(기본 A), V 강타 = 소등 버튼(기본 Y). 잠입의 평타·강타는 스틱
 * 누르기(R3·L3)라 이동 스틱을 쥔 엄지와 겹친다 — 대결은 가드·회피처럼 비어 있는 잠입 버튼을 빌린다(상호작용 X 는 마을의 확인이라 뺀다).
 * 그 행동을 재지정하면 함께 따라간다.
 */
export const CITY_FIGHT_STRIKE_PAD_SOURCE = Object.freeze({ attack: "jump", heavy: "snuff" } as const satisfies
  Readonly<Record<"attack" | "heavy", PadRebindableAction>>);

/**
 * The city fight's super on the pad (2026-10-20, `super`): the current-tool button (default RB) — the village has no tool to throw. Its key is
 * the release key (S, `INPUT_BINDINGS.cityCombat.release`). It follows that action when rebound.
 */
export const CITY_FIGHT_SUPER_PAD_SOURCE: PadRebindableAction = "throw";

/** A city fight action on the pad (the strikes and the exchange). */
export type CityFightPadAction = CityCombatPadAction | keyof typeof CITY_FIGHT_STRIKE_PAD_SOURCE;

/** The heist action whose pad button a city fight action borrows (`CITY_FIGHT_STRIKE_PAD_SOURCE`, `CITY_COMBAT_PAD_SOURCE`). */
export function cityFightPadSource(action: CityFightPadAction): PadRebindableAction {
  return action === "attack" || action === "heavy" ? CITY_FIGHT_STRIKE_PAD_SOURCE[action] : CITY_COMBAT_PAD_SOURCE[action];
}

export function cityCombatPadActive(
  state: PadButtonState,
  action: CityCombatPadAction,
  padButtons: PadButtonMap = DEFAULT_PAD_BUTTONS,
): boolean {
  return padActionActive(state, CITY_COMBAT_PAD_SOURCE[action], padButtons);
}

const DIRECTION_KEYCAPS: Readonly<Partial<Record<HeistAction, string>>> = Object.freeze({
  left: "←",
  right: "→",
  up: "↑",
  down: "↓",
});

/** 문맥 프롬프트가 바인딩 문자열을 다시 하드코딩하지 않게 한다. */
export function bindingLabel(action: HeistAction, bindings?: Readonly<Record<HeistAction, KeyBinding>>): string;
export function bindingLabel<Action extends string>(action: Action, bindings: Readonly<Record<Action, KeyBinding>>): string;
export function bindingLabel(action: string, bindings: Readonly<Record<string, KeyBinding>> = INPUT_BINDINGS.heist): string {
  return (bindings[action] ?? []).map(displayKeyCode).join("/");
}

/** 방향 조작은 큰 화살표 하나로, 나머지는 대표 키 하나로 표시한다. */
export function coachKeycapLabel(
  action: HeistAction,
  bindings: Readonly<Record<HeistAction, KeyBinding>> = INPUT_BINDINGS.heist,
): string {
  // "대표 키" 정책은 keycapLabel 하나가 소유한다. 여기서 다시 적으면 둘이 갈라진다.
  return DIRECTION_KEYCAPS[action] ?? keycapLabel(action === "snuff" ? "interact" : action, bindings);
}

/** sim이 가진 행동 ID 묶음을 현재 키 설정의 키캡 묶음으로 바꾼다. */
export function tutorialKeyGroups(
  actionGroups: readonly (readonly HeistAction[])[],
  bindings: Readonly<Record<HeistAction, KeyBinding>> = INPUT_BINDINGS.heist,
): readonly string[] {
  return actionGroups.map((actions) => actions
    .map((action) => coachKeycapLabel(action, bindings))
    .join("+"));
}

/** 가까운 오브젝트 키캡도 튜토리얼과 같은 방향 화살표 계약을 쓴다. */
export function contextActionKeyGroups(
  bindings: Readonly<Record<HeistAction, KeyBinding>> = INPUT_BINDINGS.heist,
  cap: (action: HeistAction) => string = action => coachKeycapLabel(action, bindings),
) {
  return Object.freeze({
    bodyDrag: Object.freeze([`${cap("interact")}+${cap("left")}/${cap("right")}`]),
    hide: Object.freeze([cap("hide")]),
    vent: Object.freeze([cap("interact")]),
    climb: Object.freeze([cap("up"), cap("down")]),
    snuff: Object.freeze([cap("snuff")]),
    interact: Object.freeze([cap("interact")]),
    thiefEye: Object.freeze([cap("thiefEye")]),
    sprintLeft: Object.freeze([`${cap("run")}+${cap("left")}`]),
    sprintRight: Object.freeze([`${cap("run")}+${cap("right")}`]),
  });
}

/** 화면 중앙의 적 전술 키캡도 이동 방향을 물리 키 이름이 아닌 화살표로 통일한다. */
export function enemyTacticKeycapControls(
  bindings: Readonly<Record<HeistAction, KeyBinding>> = INPUT_BINDINGS.heist,
) {
  return Object.freeze({
    direction: `${coachKeycapLabel("left", bindings)}/${coachKeycapLabel("right", bindings)}`,
    run: keycapLabel("run", bindings),
    down: coachKeycapLabel("down", bindings),
    attack: keycapLabel("attack", bindings),
  });
}

export function chordLabel(
  actions: readonly HeistAction[],
  bindings: Readonly<Record<HeistAction, KeyBinding>> = INPUT_BINDINGS.heist,
): string {
  return actions.map((action) => bindingLabel(action, bindings)).join(" + ");
}

export function heistCombatHelp(
  bindings: Readonly<Record<HeistAction, KeyBinding>> = INPUT_BINDINGS.heist,
): string {
  const entry = (action: Extract<RebindableAction, HeistAction>): string =>
    `${bindingLabel(action, bindings)} ${ACTION_LABELS[action]}`;
  return `발각 대응  ·  ${entry("attack")}   ${entry("heavy")}   ${entry("throw")}   ${INPUT_BINDINGS.shared.pause.join("/")} 메뉴`;
}

/**
 * 도시 대결(쿠마) 중 한 줄 도움말: C 콤보 · V 강타/카운터 · Z 막기 · X 넘기 — 키는 바인딩 SSOT, 이름은 `cityCombatActionLabel`
 * (ActionLabels) 에서 파생한다(재지정이 그대로 보인다). 오토전은 `actions` 로 S 기술 방출을 덧붙인다(`OTTO_FIGHT_HELP_ACTIONS`).
 * 패드면 버튼 글리프(`padLabel`)를 쓴다. (2026-10-09 템포: C 는 누를 때마다 잽 → 스트레이트 → 훅, V 는 강타 한 방 — 저택과 같은 뜻.)
 */
export function nativeCityCombatHelp(
  locale: Locale,
  bindings: Readonly<Record<HeistAction, KeyBinding>> = INPUT_BINDINGS.heist,
  city: Readonly<Record<CityCombatAction, KeyBinding>> = INPUT_BINDINGS.cityCombat,
  padLabel?: (action: HeistAction | CityCombatAction) => string,
  actions: readonly CityCombatHelpAction[] = CITY_COMBAT_HELP_ACTIONS,
): string {
  const key = (action: HeistAction | CityCombatAction) => padLabel ? padLabel(action)
    : isCityCombatAction(action) ? bindingLabel(action, city) : bindingLabel(action, bindings);
  return actions.map((action) => `${key(action)} ${cityCombatActionLabel(action, locale)}`).join("  ·  ");
}

/** 평상시에는 월드 문맥 키캡을 방해하지 않는 최소 도움말만 남긴다. */
export function heistQuietHelp(): string {
  return `${INPUT_BINDINGS.shared.pause.join("/")} 메뉴   ${INPUT_BINDINGS.shared.mute.join("/")} 음소거`;
}

/** 키캡 하나에 들어갈 대표 키. 문맥 코치는 첫 바인딩만 보여 준다. */
export function keycapLabel(
  action: HeistAction,
  bindings: Readonly<Record<HeistAction, KeyBinding>> = INPUT_BINDINGS.heist,
): string {
  const code = bindings[action][0];
  return code === undefined ? "?" : displayKeyCode(code);
}

/**
 * 대사를 넘기는 "계속"·확인의 키캡("F / ENTER" · 패드 A).
 *
 * 잠입에서 대화 판은 월드 상호작용과 다른 손을 쓴다 — 월드는 E(`interact`), 대사 넘김은
 * 확인(F/Enter · 패드 A)이다. 마을에서는 상호작용도 확인이라 `nativeCityInteractionBinding` 결과를 넘긴다
 * (F 를 이동에 양보했으면 "ENTER" 만). 이 문자열은 여기 한 곳이 소유한다:
 * 씬마다 `shared.confirm` 을 손으로 join 하면 패드 글리프만 조용히 갈라진다.
 */
export function confirmKeycapLabel(device: "keyboard" | "gamepad" = "keyboard", binding: KeyBinding = INPUT_BINDINGS.shared.confirm): string {
  return device === "gamepad"
    ? PAD_BUTTON_LABELS.south
    : binding.map(displayKeyCode).join(" / ");
}

/** 뒤로 — 컷신에서는 곧바로 건너뛰기 — 의 키캡("ESC" · 패드 B). 컷신의 SKIP 표기가 쓴다(`CutsceneSkipGate`). */
export function backKeycapLabel(device: "keyboard" | "gamepad" = "keyboard"): string {
  return device === "gamepad"
    ? PAD_BUTTON_LABELS.east
    : INPUT_BINDINGS.shared.back.map(displayKeyCode).join(" / ");
}

/** 바인딩 한 벌의 키캡 표기(예: TWO → "2", LEFT → "←"). 화면이 키 이름을 손으로 바꿔 적지 않게 한다. */
export function bindingKeycaps(binding: KeyBinding): readonly string[] {
  return binding.map(displayKeyCode);
}

/** 확인 키의 키 칩들(F · ENTER) — 키 안내 줄(`keyHintRow`)이 "Enter" 를 손으로 적으면 F 가 빠진다(`confirm-key-hints.test.ts`). */
export function confirmKeycaps(): readonly string[] {
  return bindingKeycaps(INPUT_BINDINGS.shared.confirm);
}

/** 문장 안의 확인 키 표기("F / Enter"). 키캡이 아니라 안내 문구에 끼워 넣을 때 쓴다(i18n `{confirm}` 자리). */
export function confirmKeyProse(binding: KeyBinding = INPUT_BINDINGS.shared.confirm): string {
  return binding.map(code => code === "ENTER" ? "Enter" : displayKeyCode(code)).join(" / ");
}

/**
 * 잠입에서 이 키 누름을 확인(대사 넘김)이 가져가는가. 확인의 F 는 잠입 숨기(`heist.hide`)와 같은 키다(2026-10-12):
 * **대사·컷신이 떠 있으면 확인이 이기고**, 아니면 월드 행동(숨기)이다 — 한 누름이 둘 다 되지 않는다.
 * 같은 누름이 월드로 새지 않게 하는 쪽은 `heistActionsYieldingToConfirm` + 씬의 입력 비우기다.
 */
export function heistConfirmClaimsKey(key: string, dialogueOpen: boolean): boolean {
  return dialogueOpen && matchesBinding(key, INPUT_BINDINGS.shared.confirm);
}

/**
 * 대사·컷신이 떠 있는 동안 월드에 닿지 않는 잠입 행동: 확인 키(F·Enter)를 쓰는 행동(기본 F 숨기). 숨기를 G 로 옮기면
 * 숨기는 대사 중에도 살아 있고, 대신 F 로 옮긴 행동이 양보한다. 대사가 없으면 빈 목록이다.
 */
export function heistActionsYieldingToConfirm(
  bindings: Readonly<Record<HeistAction, KeyBinding>>,
  dialogueOpen: boolean,
): readonly HeistAction[] {
  if (!dialogueOpen) return [];
  return (Object.keys(bindings) as HeistAction[])
    .filter((action) => bindings[action].some((code) => INPUT_BINDINGS.shared.confirm.includes(code)));
}

function displayKeyCode(code: string): string {
  if (code === "ONE") return "1";
  if (code === "TWO") return "2";
  if (code === "LEFT") return "←";
  if (code === "RIGHT") return "→";
  if (code === "UP") return "↑";
  if (code === "DOWN") return "↓";
  return code;
}

/** DOM KeyboardEvent.key와 저장 바인딩이 공유하는 유일한 키 코드 정규화. */
export function normalizeKeyCode(key: string): string {
  return DOM_KEY_ALIASES[key] ?? key.toUpperCase();
}

export function matchesBinding(eventKey: string, binding: KeyBinding): boolean {
  return binding.includes(normalizeKeyCode(eventKey));
}
