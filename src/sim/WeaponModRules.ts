

import type { Currency } from "./MetaProgressRules";
import type { ToolId } from "./ToolRules";
import { TOOL_IDS, TOOL_START_CHARGES } from "./ToolRules";

/** 개조 II의 두 갈래. `combat`은 근접 빈틈을, `stealth`는 잠입 동선을 연다. */
export const WEAPON_MOD_BRANCHES = ["combat", "stealth"] as const;
export type WeaponModBranch = (typeof WEAPON_MOD_BRANCHES)[number];

interface WeaponModDefinition {
  readonly id: string;
  readonly tool: ToolId;
  readonly tier: 1 | 2;
  /** 개조 II만 갈래를 가진다. */
  readonly branch?: WeaponModBranch;
}

// 표 순서가 곧 정규 순서다. 저장·스냅샷은 이 순서로 정렬해 같은 소유가 같은 JSON이 된다.
// 이름·설명은 화면 문자열이라 `app/i18n` 의 `meta.weaponMod.<id>.*` 가 소유한다.
const weaponModDefinitions = [
  { id: "dagger-lamp-shot", tool: "dagger", tier: 1 },
  { id: "dagger-counter-throw", tool: "dagger", tier: 2, branch: "combat" },
  { id: "dagger-ringing-blade", tool: "dagger", tier: 2, branch: "stealth" },
  { id: "smoke-escape", tool: "smoke", tier: 1 },
  { id: "smoke-tear-gas", tool: "smoke", tier: 2, branch: "combat" },
  { id: "smoke-veil-step", tool: "smoke", tier: 2, branch: "stealth" },
  { id: "mouse-recover", tool: "mouse", tier: 1 },
  { id: "mouse-firecracker", tool: "mouse", tier: 2, branch: "combat" },
  { id: "mouse-runaway", tool: "mouse", tier: 2, branch: "stealth" },
  { id: "wire-pull", tool: "wire", tier: 1 },
  { id: "wire-kick", tool: "wire", tier: 2, branch: "combat" },
  { id: "wire-cart-hook", tool: "wire", tier: 2, branch: "stealth" },
  { id: "mask-ambush", tool: "mask", tier: 1 },
  { id: "mask-crowd", tool: "mask", tier: 2, branch: "combat" },
  { id: "mask-chase", tool: "mask", tier: 2, branch: "stealth" },
  { id: "snare-throw", tool: "snare", tier: 1 },
  { id: "snare-chain", tool: "snare", tier: 2, branch: "combat" },
  { id: "snare-alarm", tool: "snare", tier: 2, branch: "stealth" },
] as const satisfies readonly WeaponModDefinition[];

export type WeaponModId = (typeof weaponModDefinitions)[number]["id"];
export type WeaponModNode = Omit<WeaponModDefinition, "id"> & { readonly id: WeaponModId };

export const WEAPON_MODS: readonly WeaponModNode[] = Object.freeze(
  weaponModDefinitions.map((node) => Object.freeze({ ...node })),
);

export const WEAPON_MOD_IDS: readonly WeaponModId[] = Object.freeze(WEAPON_MODS.map((node) => node.id));

const WEAPON_MOD_TABLE: Readonly<Record<WeaponModId, WeaponModNode>> = Object.freeze(
  Object.fromEntries(WEAPON_MODS.map((node) => [node.id, node])) as Record<WeaponModId, WeaponModNode>,
);

/**
 * 가격 초안. 개조 I은 골드, 개조 II는 명성이다 — 탐욕 플레이와 정교한 플레이가 각각
 * 다른 층을 연다는 `MetaProgressRules`의 화폐 원칙을 그대로 따른다. 사람 플레이 표본 전까지 초안이다.
 */
export const WEAPON_MOD_PRICES: Readonly<Record<1 | 2, { readonly currency: Currency; readonly cost: number }>> = Object.freeze({
  1: Object.freeze({ currency: "gold", cost: 160 }),
  2: Object.freeze({ currency: "fame", cost: 100 }),
});

/*
 * 개조 수치. 개체 성격 수치라 `tuning.ts`가 아니라 이 표가 소유한다. 기존 도구 상수에서
 * 파생하되, MischiefRules 가 이 파일을 읽으므로 순환 평가를 피하려고 값으로 적고 근거를 단다.
 */
/** 올가미 투척 사거리. 단도(투척 속도 기반)보다 짧아 근접전 연결 도구로 읽힌다. */
export const SNARE_THROW_RANGE_PX = 180;
/** 연쇄 올가미가 옆 경비를 함께 넘어뜨리는 거리. 사람 경비 몸 접촉 26px의 두 배를 조금 넘긴다. */
export const SNARE_CHAIN_REACH_PX = 56;
/** 울림 날의 유인 소음. 태엽 유인구 `MOUSE_NOISE_RADIUS_PX`(360)의 절반. */
export const RINGING_BLADE_NOISE_RADIUS_PX = 180;
/** 경보 올가미가 남기는 괴도의 눈 핑의 수명(표현 전용). */
export const SNARE_ALARM_PING_MS = 8_000;
/** 눈물 연막: 구름 안에서 공격 준비가 끊긴 경비의 짧은 경직. 곤봉 선딜(약 1.4초)의 절반. */
export const TEAR_GAS_STAGGER_MS = 700;
/** 장막 걸음: 내 연막 안의 질주 발소리 배율. 걷기 발소리 수준으로 낮춘다. */
export const VEIL_STEP_NOISE_MUL = 0.4;
/** 유인구 최대 보유 수. `createMischief`의 시작 수와 쇼타임 충전 상한과 같다(`ToolRules.TOOL_START_CHARGES`). */
export const MOUSE_MAX_AMMO = TOOL_START_CHARGES;
/** 딱총 유인구: 조사하러 선 경비가 이 거리 안이면 터진다. 착탄점 앞 정지 거리를 덮는다. */
export const FIRECRACKER_TRIGGER_PX = 80;
/** 딱총 유인구 경직. 올가미 넘어짐(1.6초)보다 짧다. */
export const FIRECRACKER_STAGGER_MS = 1_200;
/** 딱총 소음. 유인구 착탄음(360)보다 작아 멀리 있는 경비까지 끌지 않는다. */
export const FIRECRACKER_NOISE_RADIUS_PX = 200;
/** 도망 태엽: 착지 뒤 바닥을 구르는 속도와 다시 우는 간격. */
export const RUNAWAY_SPEED_PX_PER_SEC = 90;
export const RUNAWAY_CHIRP_MS = 1_500;
/** 당기기: 끌려온 경비가 서는 거리(사람 몸 접촉 26px 바로 밖)와 휘청이는 시간. */
export const WIRE_PULL_GAP_PX = 30;
export const WIRE_PULL_STAGGER_MS = 900;

/**
 * 이 런에서 실제로 쓸 수 있는 개조: 실린 개조 중 장착한 두 무기의 것만. 플레이 로그가 "보유" 가 아니라 "들고 간" 개조로
 * 런을 나누게 한다(등불 사격 비교가 단도를 안 든 런까지 "보유" 로 세던 문제).
 */
export function equippedWeaponMods(mods: readonly WeaponModId[] | undefined, loadout: readonly ToolId[]): WeaponModId[] {
  return (mods ?? []).filter((id) => loadout.includes(weaponModOf(id).tool));
}

/**
 * 한 번의 발동이 아니라 박자로 되풀이되는 개조 사건: 장막 걸음·군중 속 가면(발소리 박자), 도망 태엽(울음 박자).
 * 발동 수를 세는 텔레메트리와 문구·소리를 아끼는 표현이 같은 목록을 읽는다.
 */
export const REPEATING_WEAPON_MODS: ReadonlySet<WeaponModId> = new Set<WeaponModId>(["smoke-veil-step", "mask-crowd", "mouse-runaway"]);

/**
 * 경비에게 무기 빈틈(`GuardState.toolOpeningMs`)을 새로 여는 개조. 닫힘 보상(한 빈틈에 한 번)과 닫는 화음의 음이
 * 이 목록으로 빈틈을 다시 센다 — 가면 기습·추격 가면·반격 단도도 경비 id 를 싣지만 빈틈을 열지 않는다. 판정이 빈틈을
 * 여는 자리(`MischiefRules`·`simulation.applyWireGuard`)와 짝이며 `weapon-mods.test.ts` 가 대조한다.
 */
export const OPENING_WEAPON_MODS: ReadonlySet<WeaponModId> = new Set<WeaponModId>([
  "snare-throw", "snare-chain", "wire-pull", "wire-kick", "mouse-firecracker", "smoke-tear-gas",
]);

/** 무기별 소유 개조와 런에 가져갈 갈래. */
export interface WeaponModState {
  readonly owned: readonly WeaponModId[];
  readonly branches: Readonly<Partial<Record<ToolId, WeaponModBranch>>>;
}

export const EMPTY_WEAPON_MODS: WeaponModState = Object.freeze({
  owned: Object.freeze([]),
  branches: Object.freeze({}),
});

export function isWeaponModId(value: unknown): value is WeaponModId {
  return typeof value === "string" && Object.hasOwn(WEAPON_MOD_TABLE, value);
}

export function isWeaponModBranch(value: unknown): value is WeaponModBranch {
  return typeof value === "string" && (WEAPON_MOD_BRANCHES as readonly string[]).includes(value);
}

/** 검증된 개조 ID의 total lookup. */
export function weaponModOf(id: WeaponModId): WeaponModNode {
  return WEAPON_MOD_TABLE[id];
}

/** 무기 하나의 개조 I. 표 무결성 테스트가 무기마다 정확히 하나임을 보장한다. */
export function tierOneModOf(tool: ToolId): WeaponModNode {
  return WEAPON_MODS.find((node) => node.tool === tool && node.tier === 1)!;
}

/** 무기 하나의 개조 II 갈래. */
export function branchModOf(tool: ToolId, branch: WeaponModBranch): WeaponModNode {
  return WEAPON_MODS.find((node) => node.tool === tool && node.tier === 2 && node.branch === branch)!;
}

/** 개조 II는 같은 무기의 개조 I을 산 뒤에만 열린다. */
export function weaponModRequirement(id: WeaponModId): WeaponModId | null {
  const node = weaponModOf(id);
  return node.tier === 1 ? null : tierOneModOf(node.tool).id;
}

export function weaponModPrice(id: WeaponModId): { readonly currency: Currency; readonly cost: number } {
  return WEAPON_MOD_PRICES[weaponModOf(id).tier];
}

export function ownsWeaponMod(state: WeaponModState, id: WeaponModId): boolean {
  return state.owned.includes(id);
}

export type WeaponModPurchaseBlock = "owned" | "locked" | "funds";

/** 구매할 수 없는 이유. 살 수 있으면 null. 브리핑 표시와 실제 구매가 같은 판정을 쓴다. */
export function weaponModPurchaseBlock(
  wallet: { readonly gold: number; readonly fame: number; readonly weaponMods: WeaponModState },
  id: WeaponModId,
): WeaponModPurchaseBlock | null {
  if (ownsWeaponMod(wallet.weaponMods, id)) return "owned";
  const requirement = weaponModRequirement(id);
  if (requirement !== null && !ownsWeaponMod(wallet.weaponMods, requirement)) return "locked";
  const price = weaponModPrice(id);
  return (price.currency === "gold" ? wallet.gold : wallet.fame) >= price.cost ? null : "funds";
}

/**
 * 개조 하나를 산다. 살 수 없으면 원본을 그대로 돌려준다.
 * 그 무기의 첫 갈래라면 곧바로 활성 갈래로 지정해 산 것이 다음 런에 바로 쓰이게 한다.
 */
export function purchaseWeaponMod<T extends { readonly gold: number; readonly fame: number; readonly weaponMods: WeaponModState }>(
  wallet: T,
  id: WeaponModId,
): T {
  if (weaponModPurchaseBlock(wallet, id) !== null) return wallet;
  const node = weaponModOf(id);
  const price = weaponModPrice(id);
  const owned = normalizeOwned([...wallet.weaponMods.owned, id]);
  const branches = node.branch !== undefined && wallet.weaponMods.branches[node.tool] === undefined
    ? { ...wallet.weaponMods.branches, [node.tool]: node.branch }
    : wallet.weaponMods.branches;
  return {
    ...wallet,
    gold: price.currency === "gold" ? wallet.gold - price.cost : wallet.gold,
    fame: price.currency === "fame" ? wallet.fame - price.cost : wallet.fame,
    weaponMods: { owned, branches },
  };
}

/**
 * 되팔 때 돌려받는 몫. 사고 되파는 왕복은 항상 손해라 구매 순서를 고민 없이 시험해 볼 수는 없고,
 * 잘못 산 개조를 영영 떠안지도 않는다. 사람 플레이 표본 전까지 초안이다.
 */
export const WEAPON_MOD_REFUND_RATE = 0.5;

/** 환불할 수 없는 이유. 되팔 수 있으면 null. 마을 장비창 표시와 실제 환불이 같은 판정을 쓴다. */
export type WeaponModRefundBlock = "not-owned" | "has-upgrade";

export function weaponModRefundBlock(state: WeaponModState, id: WeaponModId): WeaponModRefundBlock | null {
  if (!ownsWeaponMod(state, id)) return "not-owned";
  const node = weaponModOf(id);
  // 개조 I을 먼저 되팔면 산 II가 선행 없이 남는다 — II를 먼저 되팔게 한다.
  if (node.tier === 1 && WEAPON_MODS.some((other) => other.tool === node.tool && other.tier === 2 && ownsWeaponMod(state, other.id))) {
    return "has-upgrade";
  }
  return null;
}

/** 되팔 때 돌려받는 금액. 화폐는 산 값과 같다. */
export function weaponModRefund(id: WeaponModId): { readonly currency: Currency; readonly amount: number } {
  const price = weaponModPrice(id);
  return { currency: price.currency, amount: Math.floor(price.cost * WEAPON_MOD_REFUND_RATE) };
}

/**
 * 개조 하나를 되판다. 되팔 수 없으면 원본을 그대로 돌려준다.
 * 활성 갈래였다면 같은 무기에 남은 다른 갈래로 넘기고, 없으면 갈래 지정을 지운다.
 */
export function refundWeaponMod<T extends { readonly gold: number; readonly fame: number; readonly weaponMods: WeaponModState }>(
  wallet: T,
  id: WeaponModId,
): T {
  if (weaponModRefundBlock(wallet.weaponMods, id) !== null) return wallet;
  const node = weaponModOf(id);
  const refund = weaponModRefund(id);
  const owned = normalizeOwned(wallet.weaponMods.owned.filter((ownedId) => ownedId !== id));
  const branches: Partial<Record<ToolId, WeaponModBranch>> = { ...wallet.weaponMods.branches };
  if (node.branch !== undefined && branches[node.tool] === node.branch) {
    const other = WEAPON_MOD_BRANCHES.find((branch) => branch !== node.branch && owned.includes(branchModOf(node.tool, branch).id));
    if (other === undefined) delete branches[node.tool];
    else branches[node.tool] = other;
  }
  return {
    ...wallet,
    gold: refund.currency === "gold" ? wallet.gold + refund.amount : wallet.gold,
    fame: refund.currency === "fame" ? wallet.fame + refund.amount : wallet.fame,
    weaponMods: { owned, branches },
  };
}

/** 소유한 갈래로만 무료 전환한다. 없는 갈래를 고르면 원본을 돌려준다. */
export function selectWeaponModBranch(state: WeaponModState, tool: ToolId, branch: WeaponModBranch): WeaponModState {
  if (state.branches[tool] === branch) return state;
  if (!ownsWeaponMod(state, branchModOf(tool, branch).id)) return state;
  return { ...state, branches: { ...state.branches, [tool]: branch } };
}

/**
 * 런에 가져가는 개조 목록. 무기마다 개조 I + 활성 갈래 하나이며 정규 순서로 정렬한다.
 * 장착하지 않은 무기의 개조도 포함한다 — 판정은 어차피 그 무기를 쓸 때만 분기하고, 런이 들고 간 개조만
 * 세는 일(플레이 로그·장비창 요약)은 `equippedWeaponMods`·장착 도구로 거른다.
 */
export function activeWeaponMods(state: WeaponModState): readonly WeaponModId[] {
  const active: WeaponModId[] = [];
  for (const tool of TOOL_IDS) {
    const tierOne = tierOneModOf(tool).id;
    if (!ownsWeaponMod(state, tierOne)) continue;
    active.push(tierOne);
    const branch = state.branches[tool];
    if (branch === undefined) continue;
    const branchMod = branchModOf(tool, branch).id;
    if (ownsWeaponMod(state, branchMod)) active.push(branchMod);
  }
  return normalizeOwned(active);
}

/** 런 스냅샷에 개조가 켜져 있는가. 판정 분기는 이 함수 하나만 읽는다. */
export function hasWeaponMod(layout: { readonly toolMods?: readonly WeaponModId[] }, id: WeaponModId): boolean {
  return layout.toolMods?.includes(id) === true;
}

/** 저장 JSON을 정규 소유 상태로 복구한다. 선행 개조가 없는 II와 소유하지 않은 갈래는 버린다. */
export function sanitizeWeaponMods(value: unknown): WeaponModState {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return EMPTY_WEAPON_MODS;
  const record = value as Record<string, unknown>;
  const requested = new Set(Array.isArray(record["owned"]) ? record["owned"].filter(isWeaponModId) : []);
  const owned: WeaponModId[] = [];
  for (const node of WEAPON_MODS) {
    if (!requested.has(node.id)) continue;
    const requirement = weaponModRequirement(node.id);
    if (requirement !== null && !requested.has(requirement)) continue;
    owned.push(node.id);
  }
  const rawBranches = record["branches"];
  const branches: Partial<Record<ToolId, WeaponModBranch>> = {};
  if (typeof rawBranches === "object" && rawBranches !== null && !Array.isArray(rawBranches)) {
    for (const tool of TOOL_IDS) {
      const branch = (rawBranches as Record<string, unknown>)[tool];
      if (isWeaponModBranch(branch) && owned.includes(branchModOf(tool, branch).id)) branches[tool] = branch;
    }
  }
  return { owned, branches };
}

/**
 * 런 스냅샷(`MansionLayout.toolMods`)이 한 무기에 두 갈래를 싣거나 선행 없이 II를 싣지
 * 않았는지. 리플레이 JSON은 타입 검사를 우회하므로 검증기가 이 판정을 쓴다.
 */
export function weaponModSnapshotProblem(value: unknown): string | null {
  if (!Array.isArray(value) || !value.every(isWeaponModId)) return "toolMods must be a list of known weapon mod ids";
  const ids = value as readonly WeaponModId[];
  if (new Set(ids).size !== ids.length) return "toolMods lists the same mod twice";
  for (const id of ids) {
    const node = weaponModOf(id);
    const requirement = weaponModRequirement(id);
    if (requirement !== null && !ids.includes(requirement)) return `toolMods has ${id} without its tier I mod`;
    if (node.tier === 2 && ids.some((other) => other !== id && weaponModOf(other).tool === node.tool && weaponModOf(other).tier === 2)) {
      return `toolMods carries both tier II branches for ${node.tool}`;
    }
  }
  return null;
}

function normalizeOwned(ids: readonly WeaponModId[]): readonly WeaponModId[] {
  const set = new Set(ids);
  return WEAPON_MOD_IDS.filter((id) => set.has(id));
}
