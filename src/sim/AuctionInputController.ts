import type { InputFrame } from "./types";
import type { ActiveAuctionStation, AuctionState } from "./AuctionModel";

/**
 * 렌더 입력을 경매 도메인의 작은 명령으로 번역한다. 규칙 변경은 handler와 machine이
 * 소유하고 controller는 "이 프레임에 무엇을 시도했는가"만 결정한다.
 */
export type AuctionCommand =
  | Readonly<{ readonly type: "tick" }>
  | Readonly<{ readonly type: "skip-intro" }>
  | Readonly<{ readonly type: "lure"; readonly station: ActiveAuctionStation }>;

export function resolveAuctionCommand(
  state: AuctionState,
  input: InputFrame,
  station: ActiveAuctionStation | null,
): AuctionCommand {
  if (state.introRemainingMs > 0) {
    return input.interactPressed ? { type: "skip-intro" } : { type: "tick" };
  }
  if (!input.interactPressed || station === null) return { type: "tick" };
  return { type: "lure", station };
}
