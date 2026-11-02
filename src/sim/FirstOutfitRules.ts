import { femalePrologueActive } from "./FemalePrologueRules";
import type { MetaState } from "./MetaProgressRules";
import { FIRST_OUTFIT_DEFINITION, type FirstOutfitEventId, type FirstOutfitPhase } from "./FirstOutfitDefinition";
export type { FirstOutfitPhase } from "./FirstOutfitDefinition";

function firstOutfitGoldAmount(id: FirstOutfitEventId): number {
  const ref = FIRST_OUTFIT_DEFINITION.transitions[id].gold;
  return ref === null ? 0 : FIRST_OUTFIT_DEFINITION.gold[ref];
}
export const MODERN_CLOTHES_SALE_GOLD = firstOutfitGoldAmount("sell-clothes");
export const PLAYER_OUTFIT_PRICE_GOLD = firstOutfitGoldAmount("receive-outfit");
export const FIRST_OUTFIT_COMMISSION_REWARD_GOLD = firstOutfitGoldAmount("return-music-box");
/**
 * 첫 옷 가게 동행(상인과 나란히 걷는 연출)의 걸음 배율 — 운동학 추종 `walkSpeed`(220)의 0.5배, 110px/s.
 * 주인공의 평소 이동 속도는 여기가 아니라 `VillageMovementFeel` 이 소유한다(예전 이름
 * `FIRST_OUTFIT_VILLAGE_TRAVEL_SCALE` 는 씬이 매 프레임 덮어써 평소 이동에는 이미 죽은 값이었다).
 */
export const FIRST_OUTFIT_ESCORT_TRAVEL_SCALE = 0.5;

export const FIRST_OUTFIT_PHASES = FIRST_OUTFIT_DEFINITION.order;

export interface FirstOutfitState {
  readonly phase: FirstOutfitPhase;
}
export type FirstOutfitPlayerAppearance = "standard" | "modern" | "player" | "handsome";

export const NEW_FIRST_OUTFIT_STATE: FirstOutfitState = Object.freeze({ phase: "arrived" });
export const LEGACY_FIRST_OUTFIT_STATE: FirstOutfitState = Object.freeze({ phase: "commission-completed" });

export function isFirstOutfitPhase(value: unknown): value is FirstOutfitPhase {
  return typeof value === "string" && (FIRST_OUTFIT_PHASES as readonly string[]).includes(value);
}

export function needsFirstOutfitVisit(meta: MetaState): boolean {
  return meta.character === "male"
    && !meta.onboarding.openingCompleted
    && !meta.onboarding.trainingCompleted
    && meta.firstOutfit.phase !== "commission-completed";
}

/**
 * 첫 마을 도착에서 로잘린이 가게 문 앞에서 기다리는가 — 회사원(남성) 첫 이야기의 첫 장면이다. 여성·사진 괴도는 오프닝 잠입으로
 * 시작하고 첫 의상 전이가 아무 일도 하지 않으므로(`applyFirstOutfitEvent`) 만나지 않는다. 만남을 마쳤는지는 슬롯 기록
 * (`MetaState.village.rosalineEscortDone`)이 따로 본다.
 */
export function rosalineDoorstepDue(meta: MetaState): boolean {
  return needsFirstOutfitVisit(meta) && meta.firstOutfit.phase === "arrived";
}

/** 거래 중간 저장과 훈련 성공 귀환 보고까지 같은 상인을 월드에 유지한다. */
export function needsFirstOutfitMerchant(meta: MetaState): boolean {
  return meta.character === "male" && meta.firstOutfit.phase !== "commission-completed";
}

/** 훈련을 마치고 상인에게 오르골을 돌려줄 차례인가. 이때는 마을을 거치지 않고 가게에서 대화를 잇는다. */
export function firstOutfitReturnDue(meta: MetaState): boolean {
  return meta.character === "male"
    && meta.firstOutfit.phase === "commission-accepted"
    && meta.onboarding.trainingCompleted;
}

/**
 * 연습 회랑이 로잘린의 오르골 의뢰로 열렸는가(의뢰 수락 ~ 오르골 인계 전). 회랑의 첫·끝 대사가 벨의 예고장 이야기 대신
 * 이 의뢰를 말한다(`tutorialPrologue`·`tutorialEpilogue`).
 */
export function firstOutfitCommissionActive(meta: MetaState): boolean {
  return meta.character === "male" && meta.firstOutfit.phase === "commission-accepted";
}

export function hasPlayerOutfit(meta: MetaState): boolean {
  return FIRST_OUTFIT_PHASES.indexOf(meta.firstOutfit.phase) >= FIRST_OUTFIT_PHASES.indexOf("player-equipped");
}

/** 판매 대금으로 첫 복장을 사기 전에는 다른 유료 시설에서 돈을 쓸 수 없다. */
export function firstOutfitTradeLocked(meta: MetaState): boolean {
  return meta.character === "male" && meta.firstOutfit.phase === "clothes-sold";
}

export function usesFirstOutfitPlayerArt(meta: MetaState): boolean {
  return meta.character === "male";
}

export function firstOutfitPlayerAppearance(meta: MetaState): FirstOutfitPlayerAppearance {
  if (!usesFirstOutfitPlayerArt(meta)) return "standard";
  if (meta.firstOutfit.phase === "commission-completed") return "handsome";
  return hasPlayerOutfit(meta) ? "player" : "modern";
}

/** 경매장 위장 침투는 괴도로 하는 일이다. 현대 옷차림으로는 문을 열지 않는다. */
export function auctionHouseUnlocked(meta: MetaState): boolean {
  return !femalePrologueActive(meta) && firstOutfitPlayerAppearance(meta) !== "modern";
}

export function seeFirstOutfitOffer(meta: MetaState): MetaState {
  return applyFirstOutfitEvent(meta, "see-offer");
}

/** 현대 옷 판매 대금은 이 상태 전이에서만 지급되어 재접속·연타로 복제되지 않는다. */
export function sellModernClothes(meta: MetaState): MetaState {
  return applyFirstOutfitEvent(meta, "sell-clothes");
}

/** 구매와 장착을 한 번의 저장 전이로 확정한다. */
export function buyFirstPlayerOutfit(meta: MetaState): MetaState {
  return applyFirstOutfitEvent(meta, "receive-outfit");
}

export function acceptFirstOutfitCommission(meta: MetaState): MetaState {
  return applyFirstOutfitEvent(meta, "accept-commission");
}

/** 실제 기초 훈련 완료 증거가 있을 때만 귀환 보상을 한 번 지급한다. */
export function completeFirstOutfitCommission(meta: MetaState): MetaState {
  return applyFirstOutfitEvent(meta, "return-music-box");
}

/** 받은 물약은 별도 입력으로 한 번만 마시며 최종 외형을 확정한다. */
export function drinkFirstOutfitPotion(meta: MetaState): MetaState {
  return applyFirstOutfitEvent(meta, "use-potion");
}

/** The phase and payment are committed together. Replayed or out-of-order events are no-ops. */
export function applyFirstOutfitEvent(meta: MetaState, id: FirstOutfitEventId): MetaState {
  const transition = FIRST_OUTFIT_DEFINITION.transitions[id];
  if (transition === undefined || meta.character !== "male" || meta.firstOutfit.phase !== transition.from) return meta;
  const amount = firstOutfitGoldAmount(id);
  if (transition.requires === "male-with-training" && !meta.onboarding.trainingCompleted) return meta;
  if (transition.requires === "male-with-gold" && meta.gold < amount) return meta;
  return { ...meta, gold: meta.gold + amount * transition.direction, firstOutfit: { ...meta.firstOutfit, phase: transition.to } };
}
