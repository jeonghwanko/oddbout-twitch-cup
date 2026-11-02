import {
  CITY_COMBAT_RESERVED_CODES,
  DEFAULT_PAD_BUTTONS,
  INPUT_BINDINGS,
  PAD_REBINDABLE_ACTIONS,
  bindingContextsOverlap,
  defaultBinding,
  isCityCombatAction,
  isPadButton,
  normalizeKeyCode,
  swapPadButton,
} from "./InputBindings";
import { NO_ASSISTS, isGameSpeed, type AssistOptions } from "../sim/AssistRules";
import { DEFAULT_PLAYER_PROFILE, sanitizePlayerProfile, type PlayerProfileSettings } from "./PlayerProfile";
import type {
  BindableAction,
  CityCombatAction,
  HeistAction,
  KeyBinding,
  PadButtonMap,
  PadRebindableAction,
} from "./InputBindings";

/**
 * payload 버전. **저장 키(`kaito_web.playerSettings.v1`)는 절대 바꾸지 않는다** —
 * 스키마가 바뀌면 키가 아니라 봉투 안의 이 숫자만 올린다(`storageKeys.ts` 계약).
 *
 * 2: 마스터 음소거(`muted`)와 목소리 버스 음량(`voiceVolume`)이 들어왔다. 두 필드가
 *    없는 v1 저장은 버리지 않고 기본값을 채워 읽는다 — 버전이 낮다는 이유로 이미
 *    배포된 설정을 지우면 그건 이관이 아니라 삭제다.
 * 3: 패드 버튼 배치(`padButtons`)가 들어왔다. 없는 저장은 기본 배치로 채운다. 번호를
 *    올리는 이유는 이관이 아니라 판별이다 — 같은 2 를 달고 필드 수가 다른 두 payload 가
 *    돌아다니면 registry 검증(`AccessibilityRuntime.isPlayerSettings`)이 배치 없는 객체를
 *    통과시켜 버튼 조회가 `undefined` 가 된다.
 * 4: 플레이어 어시스트(`assist`)가 들어왔다. 3 과 같은 이유로 판별용이다. 없는 저장은 전부 끔으로
 *    채운다 — 도움은 플레이어가 고르는 것이지 이관이 대신 켜 주는 것이 아니다.
 */
export const PLAYER_SETTINGS_VERSION = 4 as const;
export const TEXT_SCALES = [1, 1.25, 1.5] as const;
export const MOTION_PREFERENCES = ["system", "reduce", "full"] as const;
export const COLOR_ASSIST_MODES = ["off", "patterns"] as const;
export const AUDIO_LEVELS = [0, 0.25, 0.5, 0.75, 1] as const;
export const SUBTITLE_MODES = ["story-combat", "story", "off"] as const;
export const SUBTITLE_BACKGROUNDS = ["dark", "light", "none"] as const;
export const REBINDABLE_ACTIONS = Object.freeze([
  "left",
  "right",
  "up",
  "down",
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
  // 도시 대결의 방어(2026-10-09): 가드·패리(Z)와 회피(X). 잠입 행동과 같은 순간에 살아 있지 않은 키는 겹쳐도 된다.
  "guard",
  "dodge",
  // 오토전 기술 방출(S, 2026-10-10 기술 소매치기): 가드·회피와 같은 도시 대결 행동이라 그 둘과는 키를 나누지 않는다.
  "release",
] as const satisfies readonly BindableAction[]);

export type TextScale = (typeof TEXT_SCALES)[number];
export type MotionPreference = (typeof MOTION_PREFERENCES)[number];
export type ColorAssistMode = (typeof COLOR_ASSIST_MODES)[number];
export type AudioLevel = (typeof AUDIO_LEVELS)[number];
export type SubtitleMode = (typeof SUBTITLE_MODES)[number];
export type SubtitleBackground = (typeof SUBTITLE_BACKGROUNDS)[number];
export type RebindableAction = (typeof REBINDABLE_ACTIONS)[number];
export type KeyOverrides = Readonly<Partial<Record<RebindableAction, string>>>;

export interface PlayerSettings {
  /** Optional in old saves; parser supplies the shared profile defaults. */
  readonly profile?: PlayerProfileSettings;
  readonly version: typeof PLAYER_SETTINGS_VERSION;
  readonly motion: MotionPreference;
  readonly colorAssist: ColorAssistMode;
  readonly textScale: TextScale;
  readonly interactionHints: boolean;
  /**
   * 마을 NPC 이름표를 인지 반경과 상관없이 항상 띄운다(접근성, 기본 끔). 끄면 이름표는 의뢰·초점·
   * 근처 NPC 에만 선다(`VillageNameplateRules`). 없는 저장은 끔으로 읽으므로 버전을 올리지 않는다.
   */
  readonly alwaysShowNames: boolean;
  /**
   * 쿠마전 상성 레슨(`app/CityFightLesson`)이 처음 만난 공격에서 싸움을 멈추는가(2026-10-17 사용자: 대결 HUD 토글, 기본은 멈추지 않음 —
   * 카드만 크게 뜨고 싸움은 흐른다). 없는 저장은 끔으로 읽으므로 버전을 올리지 않는다(`alwaysShowNames`와 같은 규칙).
   */
  readonly fightLessonPause: boolean;
  /**
   * 마을 대결의 조작키 판(오른쪽 위, 2026-10-18 사용자: "조작키를 우상단이나 우하단에 띄워놔야겠네 (접기 기능 넣어두고)")을 접어 두었는가.
   * 없는 저장은 펼침으로 읽으므로 버전을 올리지 않는다(`fightLessonPause`와 같은 규칙).
   */
  readonly fightKeysCollapsed: boolean;
  /**
   * 플레이어가 고른 마을 줌(궤도 카메라 배율, `NativeCityOrbit.zoomGoal`). null = 기본 배율을 따른다 — 기본값이 바뀌면 줌을 만진 적
   * 없는 플레이어도 따라간다. 씬에 들어올 때마다 이 값으로 시작한다(2026-10-18: 전에는 매번 기본으로 돌아갔다). 범위는 궤도가
   * 자기 표로 다시 자른다(`NATIVE_CITY_ZOOM_STYLE`). 옛 `villageCameraLevel`(옛 마을의 거리 세 단계, 아무도 안 읽음)을 대신한다.
   * 없는 저장은 null 로 읽으므로 버전을 올리지 않는다(`alwaysShowNames`와 같은 규칙).
   */
  readonly villageZoom: number | null;
  /** 마스터 음소거. `AudioEngine.silenced = muted || backgrounded` 의 사용자 쪽 절반이다. */
  readonly muted: boolean;
  readonly effectsVolume: AudioLevel;
  /** 합성 목소리 버스(`render/audio/voices.ts`)만 줄이는 음량. 효과음과 별도 게인 노드다. */
  readonly voiceVolume: AudioLevel;
  readonly musicVolume: AudioLevel;
  readonly subtitleMode: SubtitleMode;
  readonly subtitleBackground: SubtitleBackground;
  readonly subtitleSpeakerNames: boolean;
  readonly subtitleDirections: boolean;
  readonly keys: KeyOverrides;
  /**
   * 패드 버튼 배치. 키보드(`keys`)와 달리 덮어쓴 항목만 담지 않고 항상 완전한 표다 —
   * 재지정이 맞바꾸기라서 한 번의 변경이 두 행동을 옮기고, 부분 저장은 그 짝을 잃는다.
   */
  readonly padButtons: PadButtonMap;
  /**
   * 플레이어 어시스트(`sim/AssistRules`). 전부 기본 끔. 게임 속도는 잠입 중에도 바로 적용되고,
   * 나머지 셋은 런을 짤 때 튜닝에 들어가 다음 잠입(또는 다시 시작)부터 적용된다.
   * 설정은 전역이다 — 저장 슬롯마다 따로 두지 않는다.
   */
  readonly assist: AssistOptions;
}

export const DEFAULT_PLAYER_SETTINGS: PlayerSettings = Object.freeze({
  version: PLAYER_SETTINGS_VERSION,
  motion: "system",
  colorAssist: "off",
  textScale: 1,
  interactionHints: false,
  alwaysShowNames: false,
  fightLessonPause: false,
  fightKeysCollapsed: false,
  villageZoom: null,
  profile: DEFAULT_PLAYER_PROFILE,
  muted: false,
  effectsVolume: 1,
  voiceVolume: 1,
  musicVolume: 0.75,
  subtitleMode: "story-combat",
  subtitleBackground: "dark",
  subtitleSpeakerNames: true,
  subtitleDirections: true,
  keys: Object.freeze({}),
  padButtons: DEFAULT_PAD_BUTTONS,
  assist: NO_ASSISTS,
});

/**
 * 메뉴·진단·내보내기 키는 실제 공용/정산 바인딩에서 파생한다. 확인 키 가운데 잠입 기본 행동이 쓰는 키(F = 숨기)는
 * 예약하지 않는다 — 잠입에서는 대사가 없을 때 월드 행동이고(`heistConfirmClaimsKey`), 숨기를 옮긴 뒤 다른 잠입 행동에
 * 줄 수도 있다. Enter 는 예약이다. 마을에서는 이동·달리기·C/V 가 F 를 가져가면 마을 확인이 Enter 로 물러난다
 * (`nativeCityInteractionBinding`), 가드·회피·방출은 F 를 가질 수 없다(`CITY_COMBAT_RESERVED_CODES`).
 */
const HEIST_DEFAULT_CODES: ReadonlySet<string> = new Set(Object.values(INPUT_BINDINGS.heist).flat());
export const RESERVED_BINDING_CODES: readonly string[] = Object.freeze([
  ...new Set([
    ...Object.values(INPUT_BINDINGS.shared).flat(),
    ...Object.values(INPUT_BINDINGS.settlement).flat(),
  ].filter((code) => !HEIST_DEFAULT_CODES.has(code))),
]);

const RESERVED_CODES = new Set(RESERVED_BINDING_CODES);

export function parsePlayerSettings(raw: string | null): PlayerSettings {
  if (raw === null || raw === "") return DEFAULT_PLAYER_SETTINGS;
  try {
    return sanitizePlayerSettings(JSON.parse(raw) as unknown);
  } catch {
    return DEFAULT_PLAYER_SETTINGS;
  }
}

export function serializePlayerSettings(settings: PlayerSettings): string {
  return JSON.stringify(settings);
}

/**
 * 저장 payload 를 현재 스키마로 읽는다. 세 갈래를 모두 처리한다 —
 * (1) 아는 버전과 version 이 없던 배포분은 **결측 필드만 기본값으로 채워** 이관하고,
 * (2) 우리보다 높은(모르는) 버전은 빈 상태로 두며,
 * (3) 손상된 값은 필드 단위로 기본값으로 되돌린다.
 */
export function sanitizePlayerSettings(input: unknown): PlayerSettings {
  if (typeof input !== "object" || input === null) return DEFAULT_PLAYER_SETTINGS;
  const value = input as Record<string, unknown>;
  const version = value["version"];
  // 미래 버전은 필드 의미를 보장할 수 없으니 읽지 않는다. 낮은 버전은 이관 대상이다.
  if (typeof version === "number" && version > PLAYER_SETTINGS_VERSION) return DEFAULT_PLAYER_SETTINGS;
  const keys = sanitizeKeys(migrateLegacyShoveKey(value["keys"]));
  return Object.freeze({
    ...DEFAULT_PLAYER_SETTINGS,
    motion: isOneOf(value["motion"], MOTION_PREFERENCES) ? value["motion"] : DEFAULT_PLAYER_SETTINGS.motion,
    colorAssist: isOneOf(value["colorAssist"], COLOR_ASSIST_MODES) ? value["colorAssist"] : DEFAULT_PLAYER_SETTINGS.colorAssist,
    textScale: isOneOf(value["textScale"], TEXT_SCALES) ? value["textScale"] : DEFAULT_PLAYER_SETTINGS.textScale,
    muted: typeof value["muted"] === "boolean" ? value["muted"] : DEFAULT_PLAYER_SETTINGS.muted,
    effectsVolume: isOneOf(value["effectsVolume"], AUDIO_LEVELS) ? value["effectsVolume"] : DEFAULT_PLAYER_SETTINGS.effectsVolume,
    voiceVolume: isOneOf(value["voiceVolume"], AUDIO_LEVELS) ? value["voiceVolume"] : DEFAULT_PLAYER_SETTINGS.voiceVolume,
    musicVolume: isOneOf(value["musicVolume"], AUDIO_LEVELS) ? value["musicVolume"] : DEFAULT_PLAYER_SETTINGS.musicVolume,
    subtitleMode: isOneOf(value["subtitleMode"], SUBTITLE_MODES) ? value["subtitleMode"] : DEFAULT_PLAYER_SETTINGS.subtitleMode,
    subtitleBackground: isOneOf(value["subtitleBackground"], SUBTITLE_BACKGROUNDS) ? value["subtitleBackground"] : DEFAULT_PLAYER_SETTINGS.subtitleBackground,
    subtitleSpeakerNames: typeof value["subtitleSpeakerNames"] === "boolean" ? value["subtitleSpeakerNames"] : DEFAULT_PLAYER_SETTINGS.subtitleSpeakerNames,
    subtitleDirections: typeof value["subtitleDirections"] === "boolean" ? value["subtitleDirections"] : DEFAULT_PLAYER_SETTINGS.subtitleDirections,
    interactionHints: typeof value["interactionHints"] === "boolean" ? value["interactionHints"] : false,
    alwaysShowNames: typeof value["alwaysShowNames"] === "boolean" ? value["alwaysShowNames"] : false,
    fightLessonPause: typeof value["fightLessonPause"] === "boolean" ? value["fightLessonPause"] : false,
    fightKeysCollapsed: typeof value["fightKeysCollapsed"] === "boolean" ? value["fightKeysCollapsed"] : false,
    villageZoom: isVillageZoom(value["villageZoom"]) ? value["villageZoom"] : null,
    profile: sanitizePlayerProfile(value["profile"]),
    keys: Object.freeze(keys),
    padButtons: sanitizePadButtons(migrateLegacyShoveKey(value["padButtons"])),
    assist: sanitizeAssist(value["assist"]),
  });
}

/**
 * 저장된 마을 줌으로 읽을 수 있는 값: null(기본) 또는 상식 범위의 유한한 수. 정확한 범위는 궤도 카메라가 정한다 — 이 파일은 부팅
 * 경로라 마을 카메라 표를 끌어오지 않는다.
 */
export function isVillageZoom(value: unknown): value is number | null {
  return value === null || typeof value === "number" && Number.isFinite(value) && value >= 0.25 && value <= 4;
}

/** 필드 단위로 읽는다. 손상된 항목 하나가 나머지 어시스트까지 꺼 버리지 않게 한다. */
export function sanitizeAssist(input: unknown): AssistOptions {
  if (typeof input !== "object" || input === null) return NO_ASSISTS;
  const value = input as Record<string, unknown>;
  const assist: AssistOptions = {
    gameSpeed: isGameSpeed(value["gameSpeed"]) ? value["gameSpeed"] : NO_ASSISTS.gameSpeed,
    lenientDetection: value["lenientDetection"] === true,
    reducedDamage: value["reducedDamage"] === true,
    relaxedTimer: value["relaxedTimer"] === true,
  };
  return isNoAssist(assist) ? NO_ASSISTS : Object.freeze(assist);
}

export function isAssistOptions(value: unknown): value is AssistOptions {
  if (typeof value !== "object" || value === null) return false;
  const assist = value as Partial<AssistOptions>;
  return isGameSpeed(assist.gameSpeed)
    && typeof assist.lenientDetection === "boolean"
    && typeof assist.reducedDamage === "boolean"
    && typeof assist.relaxedTimer === "boolean";
}

function isNoAssist(assist: AssistOptions): boolean {
  return assist.gameSpeed === 1 && !assist.lenientDetection && !assist.reducedDamage && !assist.relaxedTimer;
}

/**
 * V의 행동 ID가 `shove` → `heavy` 로 바뀌기 전에 저장된 재지정을 옮겨 싣는다.
 * `heavy` 항목이 이미 있으면(새 저장) 손대지 않는다 — 옛 값이 새 재지정을 덮으면 안 된다.
 */
function migrateLegacyShoveKey(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return value;
  const map = value as Record<string, unknown>;
  if (!("shove" in map) || "heavy" in map) return value;
  const { shove, ...rest } = map;
  return { ...rest, heavy: shove };
}

export interface BindingUpdate {
  readonly settings: PlayerSettings;
  readonly error: "reserved" | "duplicate" | "unsupported" | null;
}

export function rebindAction(
  settings: PlayerSettings,
  action: RebindableAction,
  rawCode: string,
): BindingUpdate {
  const code = normalizeBindingCode(rawCode);
  if (code === null) return { settings, error: "unsupported" };
  if (isReservedFor(action, code)) return { settings, error: "reserved" };
  if (bindingTaken(settings.keys, action, code)) return { settings, error: "duplicate" };
  return {
    settings: Object.freeze({
      ...settings,
      keys: Object.freeze({ ...settings.keys, [action]: code }),
    }),
    error: null,
  };
}

export function resetActionBinding(
  settings: PlayerSettings,
  action: RebindableAction,
): BindingUpdate {
  const keys = { ...settings.keys };
  delete keys[action];
  const candidate = Object.freeze({ ...settings, keys: Object.freeze(keys) });
  const bindings = resolvedActionBindings(candidate);
  for (const other of REBINDABLE_ACTIONS) {
    if (other === action || !bindingContextsOverlap(action, other)) continue;
    if (defaultBinding(action).some((code) => bindings[other].includes(code))) {
      return { settings, error: "duplicate" };
    }
  }
  return { settings: candidate, error: null };
}

export interface PadBindingUpdate {
  readonly settings: PlayerSettings;
  /** 패드 표는 일대일이라 중복이 없다. 남는 실패는 "패드 버튼이 아님" 하나뿐이다. */
  readonly error: "unsupported" | null;
}

export function rebindPadButton(
  settings: PlayerSettings,
  action: PadRebindableAction,
  rawButton: string,
): PadBindingUpdate {
  if (!isPadButton(rawButton)) return { settings, error: "unsupported" };
  return {
    settings: Object.freeze({
      ...settings,
      padButtons: swapPadButton(settings.padButtons, action, rawButton),
    }),
    error: null,
  };
}

/** 기본 버튼을 되찾아 온다. 그 버튼을 쓰던 행동은 이 행동이 쓰던 버튼을 받는다. */
export function resetPadButton(
  settings: PlayerSettings,
  action: PadRebindableAction,
): PadBindingUpdate {
  return rebindPadButton(settings, action, DEFAULT_PAD_BUTTONS[action]);
}

export function resolvedPadButtons(settings: PlayerSettings): PadButtonMap {
  return settings.padButtons;
}

export function resolvedHeistBindings(
  settings: PlayerSettings,
): Readonly<Record<HeistAction, KeyBinding>> {
  return Object.freeze(Object.fromEntries(
    Object.entries(INPUT_BINDINGS.heist).map(([action, defaults]) => {
      const override = settings.keys[action as RebindableAction];
      return [action, override === undefined ? defaults : Object.freeze([override])];
    }),
  ) as Record<HeistAction, KeyBinding>);
}

/** The city fight's guard / dodge / release keys with the player's overrides. */
export function resolvedCityCombatBindings(
  settings: PlayerSettings,
): Readonly<Record<CityCombatAction, KeyBinding>> {
  return Object.freeze(Object.fromEntries(
    Object.entries(INPUT_BINDINGS.cityCombat).map(([action, defaults]) => {
      const override = settings.keys[action as RebindableAction];
      return [action, override === undefined ? defaults : Object.freeze([override])];
    }),
  ) as Record<CityCombatAction, KeyBinding>);
}

/** Every bindable action's keys (heist + city fight), for the settings rows and the duplicate check. */
export function resolvedActionBindings(
  settings: PlayerSettings,
): Readonly<Record<BindableAction, KeyBinding>> {
  return Object.freeze({ ...resolvedHeistBindings(settings), ...resolvedCityCombatBindings(settings) });
}

export function normalizeBindingCode(raw: string): string | null {
  const code = normalizeKeyCode(raw);
  if (/^[A-Z]$/.test(code)) return code;
  if (/^(?:LEFT|RIGHT|UP|DOWN|SHIFT|SPACE|TAB|ESC|ENTER)$/.test(code)) return code;
  return null;
}

/** 이 행동이 가질 수 없는 키인가. 메뉴·진단 예약키는 모두에게, 도시가 쓰는 키(`CITY_COMBAT_RESERVED_CODES`)는 가드·회피에게 막힌다. */
function isReservedFor(action: RebindableAction, code: string): boolean {
  return RESERVED_CODES.has(code) || (isCityCombatAction(action) && CITY_COMBAT_RESERVED_CODES.includes(code));
}

/** 덮어쓴 키가 있으면 그것, 없으면 기본 키. `resolvedActionBindings` 와 같은 해석을 설정 객체 없이 한다. */
function keysOf(keys: KeyOverrides, action: RebindableAction): KeyBinding {
  const override = keys[action];
  return override === undefined ? defaultBinding(action) : [override];
}

/** 같은 순간에 살아 있는 다른 행동이 이미 이 키를 쓰는가(도시 회피는 잠입 휘파람의 X 와 겹쳐도 된다). */
function bindingTaken(keys: KeyOverrides, action: RebindableAction, code: string): boolean {
  return REBINDABLE_ACTIONS.some((other) => other !== action
    && bindingContextsOverlap(action, other)
    && keysOf(keys, other).includes(code));
}

/**
 * 밀려난 기본 키가 갈 곳을 찾지 못했을 때의 마지막 후보. 순서가 곧 결정 규칙이다.
 * 재지정 가능한 행동과 예약키를 다 빼도 글자가 남으므로 실제로는 항상 하나를 고른다.
 */
const FALLBACK_BINDING_CODES: readonly string[] = Object.freeze([
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  "LEFT", "RIGHT", "UP", "DOWN", "SHIFT", "SPACE", "TAB",
]);

/**
 * 저장된 키 재지정을 **한 벌로** 읽는다.
 *
 * 예전에는 기본값에서 시작해 저장 항목을 `rebindAction` 으로 하나씩 다시 걸었다. 그러면 아직 차례가 오지 않은 행동의
 * 기본 키와 부딪힌 저장 키가 조용히 버려졌다 — 가드(Z)·회피(X)를 맞바꾼 저장은 빈 설정으로, 가드가 생기기 전에 왼쪽 이동을
 * Z 로 옮긴 저장은 그 재지정을 잃었다. 이제 순서는 이렇다.
 *
 * 1. 저장 항목을 하나씩 검사해 **그 자체로 틀린 것만** 버린다: 지원하지 않는 키, 예약키, 그리고 같은 순간에 살아 있는
 *    두 행동이 같은 키를 고른 경우의 뒤쪽(`REBINDABLE_ACTIONS` 순서).
 * 2. 남은 저장 항목을 기본 위에 한꺼번에 얹는다. 플레이어가 고른 키가 이긴다.
 * 3. 재지정하지 않은 행동의 기본 키가 플레이어가 고른 키와 부딪히면 그 행동을 옮긴다 — 먼저 그 키를 가져간 행동이
 *    비운 기본 키로(패드의 맞바꾸기와 같은 뜻), 그것도 안 되면 `FALLBACK_BINDING_CODES` 의 첫 빈 키로. 옮긴 키는
 *    재지정으로 저장되므로 다시 읽어도 같은 결과다.
 *
 * 설정 화면(`rebindAction`·`resetActionBinding`)으로 만들 수 있는 배치는 1·3 단계에 걸리지 않으므로 그대로 왕복한다.
 * 저장 모양(덮어쓴 키만 담는 표)은 바뀌지 않으므로 버전을 올리지 않는다.
 */
function sanitizeKeys(input: unknown): Partial<Record<RebindableAction, string>> {
  if (typeof input !== "object" || input === null) return {};
  const saved = input as Record<string, unknown>;
  const chosen: Partial<Record<RebindableAction, string>> = {};
  for (const action of REBINDABLE_ACTIONS) {
    const raw = saved[action];
    if (typeof raw !== "string") continue;
    const code = normalizeBindingCode(raw);
    if (code === null || isReservedFor(action, code)) continue;
    const clash = REBINDABLE_ACTIONS.some((other) => other !== action
      && chosen[other] === code && bindingContextsOverlap(action, other));
    if (!clash) chosen[action] = code;
  }
  const keys: Partial<Record<RebindableAction, string>> = { ...chosen };
  for (const action of REBINDABLE_ACTIONS) {
    if (chosen[action] !== undefined) continue;
    const takers = REBINDABLE_ACTIONS.filter((other) => other !== action
      && bindingContextsOverlap(action, other)
      && defaultBinding(action).some((code) => chosen[other] === code));
    if (takers.length === 0) continue;
    const candidates = [...takers.flatMap((other) => defaultBinding(other)), ...FALLBACK_BINDING_CODES];
    const moved = candidates.find((code) => !isReservedFor(action, code) && !bindingTaken(keys, action, code));
    if (moved !== undefined) keys[action] = moved;
  }
  return keys;
}

/**
 * 저장된 배치를 기본 배치 위에 맞바꾸기로 다시 적용한다. 손상된 항목은 건너뛰므로
 * 결과는 언제나 완전한 일대일 표다 — 반쯤 읽힌 배치가 버튼 없는 행동을 만들지 않는다.
 */
function sanitizePadButtons(input: unknown): PadButtonMap {
  if (typeof input !== "object" || input === null) return DEFAULT_PAD_BUTTONS;
  const value = input as Record<string, unknown>;
  let map = DEFAULT_PAD_BUTTONS;
  for (const action of PAD_REBINDABLE_ACTIONS) {
    const raw: unknown = value[action];
    if (!isPadButton(raw)) continue;
    map = swapPadButton(map, action, raw);
  }
  return map;
}

function isOneOf<const Value extends string | number>(
  value: unknown,
  options: readonly Value[],
): value is Value {
  return options.some((option) => option === value);
}
