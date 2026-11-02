import type { AuctionDefinition, AuctionState } from "./AuctionModel";
import { targetLotIndex } from "./AuctionModel";

/**
 * 경매 박자가 만드는 홀 전체의 시선.
 *
 * 로트가 공개되거나 망치가 내려오는 동안, 그리고 유령 호가가 호가 경쟁을 붙잡는 동안 무대 뒤
 * 직원들은 무대 쪽 자리로 가서 무대를 본다(`GuardSpawn.stageWatch`). 이때가 이동 창이다.
 * 입찰이 이어지는 동안에는 평소 순찰로 돌아온다. 판정(경비 계획)과 화면(진행 레일·창 표시)이
 * 이 함수 하나를 소비한다. 난수를 쓰지 않는다.
 */
export interface AuctionAttention {
  /** 무대 뒤 직원이 무대를 보고 있는가. 이동 창이다. */
  readonly watching: boolean;
  /**
   * 직원이 무대 쪽 자리에 있어야 하는가. 창이 열리기 `stageWatchLeadMs` 전부터 참이라, 창이 열리는
   * 순간 직원은 이미 자리에서 무대를 보고 있다. 경비 계획이 이 값을 소비한다.
   */
  readonly staffToStage: boolean;
  /**
   * 창이 닫힌 직후 직원이 진열장을 확인하러 서둘러 돌아가는가(`stageCheckMs` 동안). 창이 닫히자마자
   * 직원 등을 따라 진열장으로 가면 그 눈앞에 선다.
   */
  readonly staffCheck: boolean;
  /** 현재 시선 상태가 바뀔 때까지 남은 시간. 끝난 경매는 0이다. */
  readonly remainingMs: number;
  /** 현재 시선 상태의 전체 길이. 화면의 진행 막대가 `remainingMs / spanMs`를 그린다. */
  readonly spanMs: number;
  /** 시선을 끄는 원인. 화면 문구와 효과음을 고른다. */
  readonly cause: "intro" | "reveal" | "hammer" | "lure" | "bidding" | "closed" | "alarm";
}

export function auctionAttention(state: AuctionState, definition: AuctionDefinition): AuctionAttention {
  // 공개 절도의 경보만 무대의 시선을 깬다. 한 번 들켜도 경매는 계속되고, 직원은 여전히 무대를 본다.
  const durations = definition.phaseDurationMs;
  if (state.alarm) return { watching: false, staffToStage: false, staffCheck: false, remainingMs: 0, spanMs: 0, cause: "alarm" };
  if (state.introRemainingMs > 0) {
    return { watching: false, staffToStage: false, staffCheck: false, remainingMs: state.introRemainingMs, spanMs: definition.introMs, cause: "intro" };
  }
  if (state.phase === "closed") return { watching: false, staffToStage: false, staffCheck: false, remainingMs: 0, spanMs: 0, cause: "closed" };
  if (state.phase === "preview") {
    return { watching: true, staffToStage: true, staffCheck: false, remainingMs: state.phaseRemainingMs, spanMs: durations.preview, cause: "reveal" };
  }
  if (state.phase === "hammer") {
    // 망치 다음 로트의 공개가 곧바로 이어지면 두 박자가 한 번의 긴 창이다. 다음 로트가 표적이면
    // 그 공개가 반출이므로 창을 늘려 보이지 않는다 — 바꿔칠 시간은 망치까지다.
    const nextIndex = state.lotIndex + 1;
    const extends_ = nextIndex < definition.lots.length && !(nextIndex === targetLotIndex(definition) && !state.revealed);
    return {
      watching: true,
      staffToStage: true,
      staffCheck: false,
      remainingMs: state.phaseRemainingMs + (extends_ ? durations.preview : 0),
      spanMs: durations.hammer + (extends_ ? durations.preview : 0),
      cause: "hammer",
    };
  }
  if (state.attentionHoldMs > 0) {
    return {
      watching: true,
      staffToStage: true,
      staffCheck: false,
      // 입찰은 경쟁이 식을 때까지 이어지므로(상태 머신) 경쟁 시간이 곧 창이다.
      remainingMs: state.attentionHoldMs,
      spanMs: definition.lureHoldMs,
      cause: "lure",
    };
  }
  // 호가 경쟁이 늘어뜨린 입찰은 원래 길이보다 길 수 있다(경쟁 중 들켜 경쟁이 끝난 경우). 그 연장분은 입찰
  // 시작이 아니므로 진열장 확인 박자를 다시 열지 않는다 — 확인은 로트의 원래 입찰 첫머리에만 있다.
  const extended = state.phaseRemainingMs > definition.phaseDurationMs.bidding;
  const biddingElapsedMs = definition.phaseDurationMs.bidding - state.phaseRemainingMs;
  const staffToStage = state.phaseRemainingMs <= definition.stageWatchLeadMs;
  return {
    watching: false,
    staffToStage,
    staffCheck: !staffToStage && !extended && biddingElapsedMs < definition.stageCheckMs,
    remainingMs: state.phaseRemainingMs,
    spanMs: durations.bidding,
    cause: "bidding",
  };
}

/** 표적 로트의 공개(반출)까지 남은 시간. 이미 반출되었으면 0이다. */
export function auctionRevealRemainingMs(state: AuctionState, definition: AuctionDefinition): number {
  if (state.revealed) return 0;
  const targetIndex = targetLotIndex(definition);
  const perLot = definition.phaseDurationMs.preview + definition.phaseDurationMs.bidding + definition.phaseDurationMs.hammer;
  const currentLotRemaining = state.phase === "preview"
    ? state.phaseRemainingMs + definition.phaseDurationMs.bidding + definition.phaseDurationMs.hammer
    : state.phase === "bidding"
      ? Math.max(state.phaseRemainingMs, state.attentionHoldMs) + definition.phaseDurationMs.hammer
      : state.phase === "hammer"
        ? state.phaseRemainingMs
        : 0;
  const lotsBetween = Math.max(0, targetIndex - state.lotIndex - 1);
  return state.introRemainingMs + currentLotRemaining + lotsBetween * perLot;
}
