import type {
  AuctionBidderDefinition,
  AuctionDefinition,
  AuctionState,
  AuctionTimedPhase,
} from "./AuctionModel";
import { bidderLimit, targetLotIndex } from "./AuctionModel";
import { createAuctionCue } from "./AuctionEvents";
import type { SimEvent } from "./types";

export type AuctionMachineNode =
  | "intro"
  | "preview"
  | "bidding"
  | "hammer"
  | "closed";

export interface AuctionMachineStepResult {
  readonly state: AuctionState;
  readonly events: readonly SimEvent[];
}

/** 저장 계약을 늘리지 않고 권위 상태에서 현재 머신 노드를 단 하나로 도출한다. */
export function auctionMachineNode(state: AuctionState): AuctionMachineNode {
  if (state.introRemainingMs > 0) return "intro";
  return state.phase;
}


export function advanceAuctionStateMachine(
  state: AuctionState,
  definition: AuctionDefinition,
  dtMs: number,
): AuctionMachineStepResult {
  if (state.introRemainingMs > 0) {
    return {
      state: { ...state, introRemainingMs: Math.max(0, state.introRemainingMs - dtMs) },
      events: [],
    };
  }

  // 호가 경쟁이 붙은 로트는 경쟁이 식을 때까지 망치가 내려오지 않는다. 연장은 시간을 소유하는
  // 이 머신이 한다(handler는 경쟁을 붙이기만 한다).
  const contested = state.phase === "bidding" && state.attentionHoldMs > state.phaseRemainingMs
    ? state.attentionHoldMs
    : state.phaseRemainingMs;
  let next: AuctionState = {
    ...state,
    phaseRemainingMs: contested,
    feedbackRemainingMs: Math.max(0, state.feedbackRemainingMs - dtMs),
    feedback: state.feedbackRemainingMs <= dtMs ? "none" : state.feedback,
    attentionHoldMs: Math.max(0, state.attentionHoldMs - dtMs),
  };
  if (next.phase === "closed" || dtMs <= 0) return { state: next, events: [] };

  const events: SimEvent[] = [];
  let remaining = dtMs;
  while (remaining > 0 && next.phase !== "closed") {
    if (next.phase === "bidding" && next.npcBidRemainingMs <= Math.min(remaining, next.phaseRemainingMs)) {
      const slice = next.npcBidRemainingMs;
      remaining -= slice;
      next = {
        ...next,
        phaseRemainingMs: Math.max(0, next.phaseRemainingMs - slice),
        npcBidRemainingMs: definition.timing.npcBidIntervalMs,
      };
      const candidate = nextNpcBidder(next, definition);
      if (candidate !== null) {
        next = { ...next, currentPrice: next.currentPrice + 1, highBidderId: candidate.id };
        events.push(createAuctionCue("bid", candidate.stationAt, next, {
          bidderId: candidate.id,
          forged: false,
          priceDelta: 1,
        }));
      }
      if (next.phaseRemainingMs > 0) continue;
    }

    const slice = Math.min(remaining, next.phaseRemainingMs);
    remaining -= slice;
    next = {
      ...next,
      phaseRemainingMs: next.phaseRemainingMs - slice,
      npcBidRemainingMs: next.phase === "bidding"
        ? Math.max(0, next.npcBidRemainingMs - slice)
        : next.npcBidRemainingMs,
    };
    if (next.phaseRemainingMs > 0) continue;
    const advanced = PHASE_EXPIRY_HANDLERS[next.phase as AuctionTimedPhase](next, definition);
    next = advanced.state;
    events.push(...advanced.events);
  }
  return { state: next, events };
}

type PhaseExpiryHandler = (state: AuctionState, definition: AuctionDefinition) => AuctionMachineStepResult;

/** phase별 exit action을 한 표에 모아 조건문에 흩어진 전환을 SSOT로 만든다. */
const PHASE_EXPIRY_HANDLERS: Readonly<Record<AuctionTimedPhase, PhaseExpiryHandler>> = Object.freeze({
  preview: enterBidding,
  bidding: enterHammer,
  hammer: settleHammer,
});

function enterBidding(state: AuctionState, definition: AuctionDefinition): AuctionMachineStepResult {
  return {
    state: {
      ...state,
      phase: "bidding",
      phaseRemainingMs: definition.phaseDurationMs.bidding,
      npcBidRemainingMs: definition.timing.firstNpcBidMs,
    },
    events: [],
  };
}

function enterHammer(state: AuctionState, definition: AuctionDefinition): AuctionMachineStepResult {
  return {
    state: { ...state, phase: "hammer", phaseRemainingMs: definition.phaseDurationMs.hammer, attentionHoldMs: 0 },
    events: [createAuctionCue("hammer", definition.stageAt, state, {
      bidderId: state.highBidderId ?? undefined,
      forged: false,
    })],
  };
}

function settleHammer(state: AuctionState, definition: AuctionDefinition): AuctionMachineStepResult {
  const settled = settleCurrentLot(state);
  if (settled.lotIndex + 1 >= definition.lots.length) {
    return {
      state: { ...settled, phase: "closed", phaseRemainingMs: 0, feedback: "lot-sold", feedbackRemainingMs: definition.timing.feedbackMs },
      events: [],
    };
  }
  const lotIndex = settled.lotIndex + 1;
  const lot = definition.lots[lotIndex]!;
  const revealing = lotIndex === targetLotIndex(definition) && !settled.revealed;
  const preview: AuctionState = {
    ...settled,
    phase: "preview",
    phaseRemainingMs: definition.phaseDurationMs.preview,
    lotIndex,
    currentPrice: Math.max(0, lot.openingBid - 1),
    highBidderId: null,
    npcBidRemainingMs: definition.timing.firstNpcBidMs,
    revealed: settled.revealed || revealing,
    feedback: revealing ? (settled.targetSwapped ? "reveal-decoy" : "reveal-relic") : "lot-sold",
    feedbackRemainingMs: definition.timing.feedbackMs,
  };
  return {
    state: preview,
    // 반출은 무대 뒤 진열장이 비는 순간이다. 바꿔치기를 끝냈다면 가품이 무대에 오른다.
    events: revealing
      ? [createAuctionCue("reveal", definition.stageAt, preview, { forged: settled.targetSwapped })]
      : [],
  };
}

function settleCurrentLot(state: AuctionState): AuctionState {
  if (state.highBidderId === null) return state;
  const winner = state.highBidderId;
  const lotWinners = state.lotWinners.map((bidderId, index) => index === state.lotIndex ? winner : bidderId);
  return {
    ...state,
    budgets: { ...state.budgets, [winner]: Math.max(0, state.budgets[winner] - state.currentPrice) },
    lotWinners,
  };
}

function nextNpcBidder(state: AuctionState, definition: AuctionDefinition): AuctionBidderDefinition | null {
  const required = state.currentPrice + 1;
  // 변장한 신분의 주인은 직원 통로 옷장 안에 있다. 그 자리는 호가를 부르지 않는다.
  const eligible = definition.bidders.filter((bidder) => (
    bidder.id !== state.coverBidderId
      && bidder.id !== state.highBidderId
      && bidderLimit(state, definition, bidder.id) >= required
  ));
  if (eligible.length === 0) return null;
  return [...eligible].sort((a, b) => {
    const limitDelta = bidderLimit(state, definition, b.id) - bidderLimit(state, definition, a.id);
    return limitDelta || definition.bidders.indexOf(a) - definition.bidders.indexOf(b);
  })[0] ?? null;
}
