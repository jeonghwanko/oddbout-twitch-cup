import type { InputFrame, SimEvent, Vec2 } from "./types";
import { runAuctionFlowFrame } from "./AuctionFlowManager";
import { createAuctionCue } from "./AuctionEvents";
import { bidderById, targetLotIndex } from "./AuctionModel";
import type {
  ActiveAuctionStation,
  AuctionBidderDefinition,
  AuctionBidderId,
  AuctionDefinition,
  AuctionState,
} from "./AuctionModel";
import { auctionZoneAt } from "./AuctionZoneRules";
export * from "./AuctionModel";

export interface AuctionStepResult {
  readonly state: AuctionState;
  readonly events: readonly SimEvent[];
  readonly ownsInteraction: boolean;
}

export interface AuctionObservation {
  readonly state: AuctionState;
  /** 이번 스텝에 저택 전체 경보를 새로 올려야 하는가. */
  readonly alarmTriggered: boolean;
  readonly events: readonly SimEvent[];
}

export function createAuctionState(
  definition: AuctionDefinition,
  seed: number,
  coverBidderId?: AuctionBidderId,
): AuctionState {
  const cover = coverBidderId
    ?? definition.bidders[Math.abs(seed) % definition.bidders.length]?.id
    ?? "collector";
  return {
    introRemainingMs: definition.introMs,
    phase: "preview",
    phaseRemainingMs: definition.phaseDurationMs.preview,
    lotIndex: 0,
    coverBidderId: cover,
    currentPrice: Math.max(0, (definition.lots[0]?.openingBid ?? 1) - 1),
    highBidderId: null,
    budgets: budgetsOf(definition),
    lotWinners: definition.lots.map(() => null),
    npcBidRemainingMs: definition.timing.firstNpcBidMs,
    lureCount: 0,
    attentionHoldMs: 0,
    // 표적이 첫 로트면 경매가 열리는 순간 이미 무대에 있다.
    revealed: targetLotIndex(definition) === 0,
    targetSwapped: false,
    exposed: false,
    alarm: false,
    feedback: "none",
    feedbackRemainingMs: 0,
  };
}

/** 이번 프레임에 절도를 막아야 하는 경매 전리품. 판정·월드 표식이 같은 목록을 쓴다. */
export function auctionLockedAnchorIds(state: AuctionState, definition: AuctionDefinition): readonly string[] {
  const locked: string[] = [];
  // 반출된 뒤의 진열장은 비어 있다.
  if (state.revealed) locked.push(definition.targetAnchorId);
  // 반출 전의 인도대는 비어 있고, 바꿔치기 뒤에 무대에 오른 것은 가품이다.
  if (!state.revealed || state.targetSwapped) locked.push(definition.stageAnchorId);
  return locked;
}

export function auctionAnchorAvailable(state: AuctionState, definition: AuctionDefinition, anchorId: string): boolean {
  return !auctionLockedAnchorIds(state, definition).includes(anchorId);
}

export function activeAuctionStation(
  state: AuctionState,
  definition: AuctionDefinition,
  playerAt: Vec2,
  playerFloor: number,
  preferredTargetId: string | null = null,
): ActiveAuctionStation | null {
  // 반출 뒤에는 바꿔칠 것이 없어 호가 경쟁이 쓸모없다. 인도대 앞(감정사 패 자리)의 E는 절도가 가져간다.
  // 바꿔치기를 끝냈으면 가릴 것이 없다. 호가 지점이 E와 유인 횟수를 빼앗지 않게 닫는다.
  if (state.introRemainingMs > 0 || state.exposed || state.alarm || state.revealed || state.targetSwapped
    || state.phase !== "bidding") return null;
  // 유령 호가는 객석에서만 쓸 수 있다. 무대 뒤에서 패를 들 수는 없다.
  if (auctionZoneAt(definition, playerAt)?.id !== "hall") return null;
  const candidates = definition.bidders.filter((bidder) => bidder.floor === playerFloor && bidder.id !== state.coverBidderId);
  const preferred = preferredTargetId === null
    ? undefined
    : candidates.find((bidder) => `auction-station-${bidder.id}` === preferredTargetId);
  if (preferred !== undefined && distance(playerAt, preferred.stationAt) <= definition.bidReachPx) {
    return { bidder: preferred };
  }

  let best: AuctionBidderDefinition | null = null;
  let bestDistance = definition.bidReachPx;
  for (const bidder of candidates) {
    const candidateDistance = distance(playerAt, bidder.stationAt);
    if (candidateDistance > bestDistance) continue;
    best = bidder;
    bestDistance = candidateDistance;
  }
  return best === null ? null : { bidder: best };
}

export function stepAuction(
  state: AuctionState,
  input: InputFrame,
  playerAt: Vec2,
  playerFloor: number,
  definition: AuctionDefinition,
  dtMs: number,
  preferredTargetId: string | null = null,
): AuctionStepResult {
  // 입력은 이 프레임을 그리며 안내한 상태에 적용한다. 시계를 먼저 넘기면 입찰 마감
  // 프레임의 유령 호가가 망치 뒤로 밀려 보이는 안내와 실제 판정이 갈라진다.
  const station = input.interactPressed && state.introRemainingMs <= 0
    ? activeAuctionStation(state, definition, playerAt, playerFloor, preferredTargetId)
    : null;
  return runAuctionFlowFrame(state, input, station, definition, dtMs);
}

/**
 * 실제 LootCollected 프레임에서 바꿔치기와 공개 절도를 확정한다.
 * 진열장의 진품을 들면 그 자리에 가품이 남는다(조용한 성공). 인도대의 진품을 들면 홀 전체가
 * 본다(경보).
 */
export function observeAuctionLoot(
  state: AuctionState,
  events: readonly SimEvent[],
  definition: AuctionDefinition,
): AuctionObservation {
  const collected = events.find((event) => (
    event.kind === "LootCollected"
      && (event.anchorId === definition.targetAnchorId || event.anchorId === definition.stageAnchorId)
  ));
  if (collected === undefined || collected.kind !== "LootCollected") {
    return { state, alarmTriggered: false, events: [] };
  }
  if (collected.anchorId === definition.targetAnchorId) {
    const next: AuctionState = {
      ...state,
      targetSwapped: true,
      feedback: "swapped",
      feedbackRemainingMs: definition.timing.feedbackMs,
    };
    return { state: next, alarmTriggered: false, events: [createAuctionCue("swap", collected.at, next)] };
  }
  const next: AuctionState = {
    ...state,
    alarm: true,
    exposed: true,
    attentionHoldMs: 0,
    feedback: "alarm",
    feedbackRemainingMs: definition.timing.feedbackMs,
  };
  return {
    state: next,
    alarmTriggered: !state.alarm,
    events: [createAuctionCue("alarm", collected.at, next)],
  };
}


export function observeAuctionExposure(
  state: AuctionState,
  justSpotted: boolean,
  at: Vec2,
  definition: AuctionDefinition,
): AuctionObservation {
  if (!justSpotted || state.exposed) return { state, alarmTriggered: false, events: [] };
  const next: AuctionState = {
    ...state,
    exposed: true,
    attentionHoldMs: 0,
    feedback: "exposed",
    feedbackRemainingMs: definition.timing.feedbackMs,
  };
  return { state: next, alarmTriggered: false, events: [createAuctionCue("exposed", at, next)] };
}

function budgetsOf(definition: AuctionDefinition): Readonly<Record<AuctionBidderId, number>> {
  const get = (id: AuctionBidderId): number => bidderById(definition, id).startingBudget;
  return Object.freeze({ duchess: get("duchess"), curator: get("curator"), collector: get("collector") });
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
