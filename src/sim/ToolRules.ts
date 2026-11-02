export const TOOL_IDS = ["dagger", "smoke", "mouse", "wire", "mask", "snare"] as const;
export type ToolId = (typeof TOOL_IDS)[number];
export type ToolLoadout = readonly [ToolId, ToolId];

// 튜토리얼이 먼저 가르치는 핵심 잠입 동사를 일반 런의 기본 장착에서도 이어 간다.
// 연막은 브리핑에서 고르는 선택 도구이며 유인구의 자리를 대신하지 않는다.
export const DEFAULT_TOOL_LOADOUT: ToolLoadout = Object.freeze(["dagger", "mouse"]);

/**
 * 단도 밖 다섯 도구(연막·유인구·와이어·가면·올가미)가 런을 시작할 때와 쇼타임 보충 때 갖는 수. 단도는 런 계수
 * `tuning.mischief.throwAmmo` 가 따로 정한다. 유인구 회수의 상한(`WeaponModRules.MOUSE_MAX_AMMO`)도 이 값이다.
 */
export const TOOL_START_CHARGES = 2;

export const TOOL_DEFS = Object.freeze({
  dagger: { name: "투척 단도", short: "단도", description: "전방 자동 조준 · 표적 없으면 수동 투척 / 5초 경직" },
  smoke: { name: "연막 부채", short: "연막", description: "실제 시야선을 5초간 차단" },
  // `mouse`는 기존 저장·리플레이와 호환하기 위한 안정 ID다. 화면 의미는 투척 유인구다.
  mouse: { name: "태엽 유인구", short: "유인구", description: "던진 바닥에서 한 번 크게 울리는 원거리 유인" },
  wire: { name: "실크 와이어", short: "와이어", description: "경비를 뛰어넘는 무소음 수평 침투" },
  mask: { name: "무도회 가면", short: "가면", description: "8초 손님 위장 · 걷기만 / 과격 행동은 즉시 들통" },
  snare: { name: "비단 올가미", short: "올가미", description: "바닥 설치 · 첫 경비를 1.6초 넘어뜨리는 경로 함정" },
} as const satisfies Readonly<Record<ToolId, { readonly name: string; readonly short: string; readonly description: string }>>);

export function isToolId(value: unknown): value is ToolId {
  return typeof value === "string" && (TOOL_IDS as readonly string[]).includes(value);
}

export function normalizeToolLoadout(value: unknown): ToolLoadout {
  // 리플레이 JSON은 타입 검사를 우회해 들어올 수 있다. 배열이 아니어도 기본 장착으로
  // 복구해 정산의 전설 재생이나 저장 로더가 `.filter`에서 중단되지 않게 한다.
  const candidates: readonly unknown[] = Array.isArray(value) ? value : [];
  const unique = [...new Set(candidates.filter(isToolId))];
  for (const id of DEFAULT_TOOL_LOADOUT) if (!unique.includes(id)) unique.push(id);
  return [unique[0] ?? "dagger", unique[1] ?? "mouse"];
}

/**
 * 도구 하나를 고른 칸(0 = 1번, 1 = 2번)에 넣는다. 다른 칸에 같은 도구가 있으면 두 칸이 자리를 바꾼다. 마을 장비창과 원정 브리핑이
 * 같은 규칙으로 하나의 장착(`MetaState.toolLoadout`)을 고친다(2026-10-16 통일 — 전에는 브리핑만 "고른 도구는 1번, 쓰던 1번은 2번"이었다).
 * 바뀐 것이 없으면 원본을 돌려준다.
 */
export function equipToolInSlot(loadout: ToolLoadout, tool: ToolId, slot: 0 | 1): ToolLoadout {
  if (loadout[slot] === tool) return loadout;
  const other = slot === 0 ? 1 : 0;
  const next: [ToolId, ToolId] = [loadout[0], loadout[1]];
  if (next[other] === tool) next[other] = loadout[slot];
  next[slot] = tool;
  return next;
}

/**
 * 씬 전환이 장착값을 명시하면 그것을 쓰고, 생략하면 레이아웃이 소유한 장착값을 보존한다.
 * 튜토리얼은 `mouse + dagger`를 레이아웃에 고정하므로 undefined를 곧바로 기본 장착으로
 * 정규화하면 유인 장에서 단도가 나가는 회귀가 생긴다.
 */
export function resolveToolLoadout(override: unknown, layoutLoadout: unknown): ToolLoadout {
  return normalizeToolLoadout(override === undefined ? layoutLoadout : override);
}
