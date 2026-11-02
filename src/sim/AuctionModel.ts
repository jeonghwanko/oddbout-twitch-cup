import type { Rect, Vec2 } from "./GeometryTypes";

/**
 * 경매는 무대 배경이고, 플레이어의 본게임은 무대 뒤 잠입이다.
 * 로트 박자는 홀 전체의 시선을 만들고(`AuctionAttentionRules`), 변장 신분은 걸어도 되는
 * 구역을 정한다(`AuctionZoneRules`). 목표는 마지막 로트가 무대에 오르기 전에 무대 뒤
 * 진열장의 진품을 가품으로 바꿔치는 것이다.
 */
export const AUCTION_PHASES = ["preview", "bidding", "hammer", "closed"] as const;
export type AuctionPhase = (typeof AUCTION_PHASES)[number];
export type AuctionTimedPhase = Exclude<AuctionPhase, "closed">;
export const AUCTION_BIDDER_IDS = ["duchess", "curator", "collector"] as const;
export type AuctionBidderId = (typeof AUCTION_BIDDER_IDS)[number];
export type AuctionLotId = "moon-watch" | "sealed-codex" | "astral-reliquary";

export const AUCTION_REACTION_CUES = [
  "bid",
  "refused",
  "hammer",
  "lure",
  "swap",
  "reveal",
  "exposed",
  "alarm",
] as const;
export type AuctionReactionCue = (typeof AUCTION_REACTION_CUES)[number];

export interface AuctionTimingDefinition {
  readonly feedbackMs: number;
  readonly firstNpcBidMs: number;
  readonly npcBidIntervalMs: number;
}

/** 경매 콘텐츠가 사용하는 기본 박자. 레이아웃이 명시적으로 채택해야 런타임에 적용된다. */
export const DEFAULT_AUCTION_TIMING: AuctionTimingDefinition = Object.freeze({
  feedbackMs: 2_400,
  firstNpcBidMs: 650,
  npcBidIntervalMs: 1_100,
});

export interface AuctionBidderDefinition {
  readonly id: AuctionBidderId;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly stationAt: Vec2;
  readonly floor: number;
  readonly startingBudget: number;
  readonly ceilings: Readonly<Record<AuctionLotId, number>>;
  /** 이 신분으로 변장했을 때 한 판에 일으킬 수 있는 유령 호가 수. 신분의 특기다. */
  readonly lureLimit: number;
}

export interface AuctionLotDefinition {
  readonly id: AuctionLotId;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly openingBid: number;
  /** 무대 뒤 진열장에서 반출되는 표적 로트. 이 로트의 공개가 바꿔치기 마감이다. */
  readonly target: boolean;
}

export type AuctionZoneId = "hall" | "catwalk" | "wing" | "backstage" | "understage";

/**
 * 변장 신분이 침착하게 걸을 수 있는 구역. 발 위치가 rect 안에 있을 때 그 구역이다.
 * 허용 목록에 없는 신분에게는 일반 잠입 구역이다.
 */
export interface AuctionZoneDefinition {
  readonly id: AuctionZoneId;
  readonly rect: Rect;
  readonly allowedCovers: readonly AuctionBidderId[];
  /** 이 구역의 보행선. 카메라 구도·문턱선이 층을 가를 때 쓴다(레이아웃이 소유한다). */
  readonly floorY: number;
}

export interface AuctionDefinition {
  /** 입장 직후 무대 뒤 동선을 한 번 훑는 동안 멈추는 시간. E로 건너뛴다. */
  readonly introMs: number;
  readonly phaseDurationMs: Readonly<Record<AuctionTimedPhase, number>>;
  readonly timing: AuctionTimingDefinition;
  /** 고정 구도 경매장 원화가 차지하는 x 범위. 그 밖은 일반 저택 렌더가 그린다. */
  readonly hallWidthPx: number;
  /** 경매인과 로트가 서는 무대 중심. 시선과 공개 연출의 기준점이다. */
  readonly stageAt: Vec2;
  readonly bidReachPx: number;
  /** 유령 호가 한 번이 올리는 호가. */
  readonly forgedBidStep: number;
  /** 유령 호가가 호가 경쟁을 일으켜 무대 뒤 시선을 붙잡는 시간. 경쟁이 붙은 로트의 입찰도 최소 이만큼 이어진다. */
  readonly lureHoldMs: number;
  /** 창이 열리기 이만큼 전부터 무대 뒤 직원이 자리로 간다. 창이 열리면 이미 무대를 보고 있다. */
  readonly stageWatchLeadMs: number;
  /** 창이 닫힌 뒤 직원이 진열장을 확인하러 서둘러 가 있는 시간. */
  readonly stageCheckMs: number;
  /** 무대 뒤 진열장의 진품. 바꿔치기 대상이다. */
  readonly targetAnchorId: string;
  /** 반출 이후 무대 인도대에 놓인 진품. 들면 즉시 경보가 울린다. */
  readonly stageAnchorId: string;
  readonly zones: readonly AuctionZoneDefinition[];
  readonly bidders: readonly AuctionBidderDefinition[];
  readonly lots: readonly AuctionLotDefinition[];
}

export type AuctionFeedback =
  | "none"
  | "lure"
  | "lure-refused-repeat"
  | "lure-refused-budget"
  | "lure-refused-limit"
  | "lot-sold"
  | "swapped"
  | "reveal-decoy"
  | "reveal-relic"
  | "exposed"
  | "alarm";

export interface AuctionState {
  readonly introRemainingMs: number;
  readonly phase: AuctionPhase;
  readonly phaseRemainingMs: number;
  readonly lotIndex: number;
  readonly coverBidderId: AuctionBidderId;
  readonly currentPrice: number;
  readonly highBidderId: AuctionBidderId | null;
  readonly budgets: Readonly<Record<AuctionBidderId, number>>;
  readonly lotWinners: readonly (AuctionBidderId | null)[];
  readonly npcBidRemainingMs: number;
  readonly lureCount: number;
  /** 유령 호가로 연장된 무대 주목 시간. */
  readonly attentionHoldMs: number;
  /** 표적 로트가 무대 뒤에서 반출되었는가. 이후 진열장은 비고 인도대가 표적이 된다. */
  readonly revealed: boolean;
  readonly targetSwapped: boolean;

  readonly exposed: boolean;
  /** 무대 인도대에서 진품을 공개적으로 훔쳤다. */
  readonly alarm: boolean;
  readonly feedback: AuctionFeedback;
  readonly feedbackRemainingMs: number;
}

export interface ActiveAuctionStation {
  readonly bidder: AuctionBidderDefinition;
}

export function currentAuctionLot(state: AuctionState, definition: AuctionDefinition): AuctionLotDefinition {
  return definition.lots[Math.min(state.lotIndex, definition.lots.length - 1)] ?? definition.lots[0]!;
}

export function targetLotIndex(definition: AuctionDefinition): number {
  const index = definition.lots.findIndex((lot) => lot.target);
  return index < 0 ? definition.lots.length - 1 : index;
}

export function bidderById(definition: AuctionDefinition, bidderId: AuctionBidderId): AuctionBidderDefinition {
  return definition.bidders.find((bidder) => bidder.id === bidderId) ?? definition.bidders[0]!;
}

export function bidderLimit(
  state: AuctionState,
  definition: AuctionDefinition,
  bidderId: AuctionBidderId,
): number {
  const bidder = bidderById(definition, bidderId);
  return Math.min(state.budgets[bidderId], bidder.ceilings[currentAuctionLot(state, definition).id]);
}

export function auctionStationId(bidderId: AuctionBidderId): string {
  return `auction-station-${bidderId}`;
}
