import { handleAuctionCommand } from "./AuctionCommandHandler";
import { resolveAuctionCommand } from "./AuctionInputController";
import { advanceAuctionStateMachine } from "./AuctionStateMachine";
import type { ActiveAuctionStation, AuctionDefinition, AuctionState } from "./AuctionModel";
import type { InputFrame, SimEvent } from "./types";

export interface AuctionFlowFrameResult {
  readonly state: AuctionState;
  readonly events: readonly SimEvent[];
  readonly ownsInteraction: boolean;
}

/** controller → handler → state machine의 한 프레임 순서를 소유하는 경매 흐름 관리자. */
export function runAuctionFlowFrame(
  state: AuctionState,
  input: InputFrame,
  station: ActiveAuctionStation | null,
  definition: AuctionDefinition,
  dtMs: number,
): AuctionFlowFrameResult {
  const command = resolveAuctionCommand(state, input, station);
  const handled = handleAuctionCommand(state, command, definition);
  if (!handled.advanceClock) {
    return { state: handled.state, events: handled.events, ownsInteraction: handled.ownsInteraction };
  }
  const machine = advanceAuctionStateMachine(handled.state, definition, dtMs);
  return {
    state: machine.state,
    events: [...handled.events, ...machine.events],
    ownsInteraction: handled.ownsInteraction,
  };
}
