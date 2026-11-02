import type { AuctionCommand } from "./AuctionInputController";
import type { AuctionState, AuctionDefinition } from "./AuctionModel";
import { bidderById } from "./AuctionModel";
import { createAuctionCue } from "./AuctionEvents";
import type { SimEvent } from "./types";

export interface AuctionCommandResult {
  readonly state: AuctionState;
  readonly events: readonly SimEvent[];
  readonly ownsInteraction: boolean;
  /** 소개 건너뛰기는 그 프레임에 경매 시계까지 흘리지 않는 기존 입력 계약을 보존한다. */
  readonly advanceClock: boolean;
}

/** 경매 명령 하나를 원자적으로 처리하고, 시간 기반 전환은 state machine에 넘긴다. */
export function handleAuctionCommand(
  state: AuctionState,
  command: AuctionCommand,
  definition: AuctionDefinition,
): AuctionCommandResult {
  if (command.type === "tick") {
    return { state, events: [], ownsInteraction: false, advanceClock: true };
  }
  if (command.type === "skip-intro") {
    return {
      state: { ...state, introRemainingMs: 0 },
      events: [],
      ownsInteraction: true,
      advanceClock: false,
    };
  }

  // 유령 호가: 입찰자의 패를 몰래 들어 호가 경쟁을 붙인다. 홀이 들썩이는 동안
  // 무대 뒤 직원도 무대를 보러 가고, 경쟁이 붙은 로트는 그만큼 망치가 늦게 내려온다.
  // 필수 조건이 아니라 이동 창과 반출 마감을 늘리는 선택 도구다. 경쟁이 식어 가면(절반 이하)
  // 다시 불을 붙일 수 있다 — 횟수는 변장한 신분이 정한다.
  const bidder = command.station.bidder;
  const nextPrice = state.currentPrice + definition.forgedBidStep;
  const refusal = state.attentionHoldMs > definition.lureHoldMs / 2
    ? "lure-refused-repeat" as const
    : state.lureCount >= bidderById(definition, state.coverBidderId).lureLimit
      ? "lure-refused-limit" as const
      : state.budgets[bidder.id] < nextPrice
        ? "lure-refused-budget" as const
        : null;
  if (refusal !== null) {
    const acted: AuctionState = {
      ...state,
      feedback: refusal,
      feedbackRemainingMs: definition.timing.feedbackMs,
    };
    return {
      state: acted,
      events: [createAuctionCue("refused", bidder.stationAt, acted, { bidderId: bidder.id, forged: true })],
      ownsInteraction: true,
      advanceClock: true,
    };
  }

  const acted: AuctionState = {
    ...state,
    currentPrice: nextPrice,
    highBidderId: bidder.id,
    npcBidRemainingMs: definition.timing.npcBidIntervalMs,
    lureCount: state.lureCount + 1,
    attentionHoldMs: definition.lureHoldMs,
    feedback: "lure",
    feedbackRemainingMs: definition.timing.feedbackMs,
  };
  return {
    state: acted,
    ownsInteraction: true,
    advanceClock: true,
    events: [
      createAuctionCue("bid", bidder.stationAt, acted, {
        bidderId: bidder.id,
        forged: true,
        priceDelta: definition.forgedBidStep,
      }),
      createAuctionCue("lure", bidder.stationAt, acted, { bidderId: bidder.id, forged: true }),
    ],
  };
}
