import type { Tuning } from "./tuning";

/**
 * 전리품 정의와 절도 규칙.
 *
 * 획득은 홀드다. 움직일 수 없고 게이지가 찬다. 모든 획득이 순찰 주기에 거는 베팅이 되고,
 * 이것이 이 게임의 가장 잦은 미시 판단이다.
 */

export type Rarity = "common" | "fine" | "rare" | "masterpiece";

interface LootDefinition {
  readonly id: string;
  readonly name: string;
  readonly gold: number;
  readonly weight: number;
  readonly grabMs: number;
  /** 필요 기술치. 최고 전리품을 품격 뒤에 게이트해 깔끔한 플레이가 최고 수익이 되게 한다. */
  readonly skillRequired: number;
  /** 획득 시 소모하는 기술치. */
  readonly skillCost: number;
  readonly rarity: Rarity;
  /**
   * 들고 있는 동안 계속 소음을 내는 물건. 오르골이 그렇다.
   * 소음·중량·적재 게이트만으로 런의 감정적 클라이맥스가 생성된다.
   */
  readonly carryNoiseRadius: number;
}

const LOOT_DEFINITIONS = [
  { id: "banquet-invitation", name: "연회 초대장", gold: 0, weight: 0, grabMs: 650, skillRequired: 0, skillCost: 0, rarity: "common", carryNoiseRadius: 0 },
  { id: "rosaline-brooch", name: "로잘린의 은방울 브로치", gold: 0, weight: 2, grabMs: 1800, skillRequired: 0, skillCost: 0, rarity: "rare", carryNoiseRadius: 75 },
  { id: "clockwork-bird", name: "시계공의 태엽새", gold: 180, weight: 16, grabMs: 1800, skillRequired: 0, skillCost: 0, rarity: "masterpiece", carryNoiseRadius: 90 },
  { id: "candlestick", name: "은촛대", gold: 30, weight: 6, grabMs: 400, skillRequired: 0, skillCost: 0, rarity: "common", carryNoiseRadius: 0 },
  { id: "silverware", name: "은식기", gold: 45, weight: 12, grabMs: 700, skillRequired: 0, skillCost: 0, rarity: "common", carryNoiseRadius: 0 },
  { id: "pocketwatch", name: "회중시계", gold: 60, weight: 2, grabMs: 500, skillRequired: 0, skillCost: 5, rarity: "fine", carryNoiseRadius: 0 },
  { id: "rarebook", name: "희귀 서적", gold: 90, weight: 10, grabMs: 900, skillRequired: 0, skillCost: 5, rarity: "fine", carryNoiseRadius: 0 },
  { id: "painting", name: "명화", gold: 140, weight: 28, grabMs: 1600, skillRequired: 20, skillCost: 10, rarity: "rare", carryNoiseRadius: 0 },
  { id: "jewelbox", name: "보석함", gold: 200, weight: 18, grabMs: 2000, skillRequired: 30, skillCost: 15, rarity: "rare", carryNoiseRadius: 0 },
  { id: "musicbox", name: "오르골", gold: 300, weight: 40, grabMs: 2200, skillRequired: 40, skillCost: 20, rarity: "masterpiece", carryNoiseRadius: 130 },
  { id: "vault", name: "금고 채권", gold: 350, weight: 35, grabMs: 3500, skillRequired: 55, skillCost: 40, rarity: "masterpiece", carryNoiseRadius: 0 },
  // 등록 사진이 있을 때만 저택에 배치되는 한 판의 목표 유물. 이름과 원화는 브라우저 등록값이 덮는다.
  { id: "personal-artifact", name: "나의 유물", gold: 500, weight: 20, grabMs: 2500, skillRequired: 30, skillCost: 15, rarity: "masterpiece", carryNoiseRadius: 0 },
  // 슬랩스틱 페이오프. 값은 0이고 집으면 즉시 소란이 난다.
  { id: "decoy", name: "미끼 상자", gold: 0, weight: 2, grabMs: 500, skillRequired: 0, skillCost: 0, rarity: "common", carryNoiseRadius: 260 },
] as const satisfies readonly LootDefinition[];

/** 레이아웃·적재·정산·아트가 공유하는 전리품 콘텐츠 ID. */
export type LootId = (typeof LOOT_DEFINITIONS)[number]["id"];
export type LootDef = Omit<LootDefinition, "id"> & { readonly id: LootId };

export const LOOT_TABLE: Readonly<Record<LootId, LootDef>> = Object.freeze(
  Object.fromEntries(
    LOOT_DEFINITIONS.map((definition) => [definition.id, Object.freeze({ ...definition })]),
  ) as Record<LootId, LootDef>,
);

export function lootDef(id: LootId): LootDef {
  const found = LOOT_TABLE[id];
  if (found === undefined) throw new Error(`알 수 없는 전리품: ${id}`);
  return found;
}

/** 자물쇠 따기 강화가 절도 시간을 줄인다. */
export function stealDurationMs(def: LootDef, tuning: Tuning): number {
  const reduction = Math.min(0.6, tuning.loot.lockpickLevel * tuning.loot.lockpickPerLevel);
  return Math.max(tuning.loot.minGrabMs, def.grabMs * (1 - reduction) * tuning.loot.grabDurationMul);
}

/** 기술치가 부족하면 손끝이 떨려서 손대지 못한다. 앵커별 예외는 유효한 값만 받는다. */
export function canSteal(def: LootDef, skill: number, skillRequiredOverride?: number): boolean {
  const required = skillRequiredOverride === undefined || !Number.isFinite(skillRequiredOverride)
    ? def.skillRequired
    : Math.max(0, skillRequiredOverride);
  return skill >= required;
}

/** 기술치가 곧 가치 배수다. 조용히 굴수록 같은 물건이 비싸진다. */
function valueMultiplier(skill: number, tuning: Tuning): number {
  return tuning.loot.valueBase + tuning.loot.valuePerSkill * skill;
}

export function goldOf(def: LootDef, skill: number, tuning: Tuning): number {
  return Math.round(def.gold * valueMultiplier(skill, tuning));
}
