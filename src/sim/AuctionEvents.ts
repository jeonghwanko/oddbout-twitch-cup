import type { AuctionBidderId, AuctionReactionCue, AuctionState } from "./AuctionModel";
import type { SimEvent, Vec2 } from "./types";

export type AuctionCueEvent = Extract<SimEvent, { readonly kind: "AuctionCue" }>;

export interface AuctionCueContext {
  readonly bidderId?: AuctionBidderId;
  readonly forged?: boolean;
  readonly priceDelta?: number;
}

/** 모든 경매 규칙이 공유하는 append-only 런타임 반응 이벤트 생성점. */
export function createAuctionCue(
  cue: AuctionReactionCue,
  at: Vec2,
  state: AuctionState,
  context: AuctionCueContext = {},
): AuctionCueEvent {
  return {
    kind: "AuctionCue",
    cue,
    at,
    price: state.currentPrice,
    ...context,
  };
}
