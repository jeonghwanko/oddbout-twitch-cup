/** Boot failure recovery never changes a pairing, seed, winner, or tournament state. */
export const TWITCH_BOUT_BOOT_TIMEOUT_MS = 25_000;
/** More loading time per registered corner: his whole package (about 7 MB, 2026-11-02) comes in on top of the host (`twitchBoutBootTimeoutMs`). */
export const TWITCH_REGISTERED_CORNER_BOOT_MS = 20_000;
export const TWITCH_BOUT_MAX_BOOT_RETRIES = 1;

export type TwitchBoutRecoveryState = {
  phase: "booting" | "fighting" | "failed" | "complete";
  bootRetries: number;
};

export function createTwitchBoutRecovery(): TwitchBoutRecoveryState {
  return { phase: "booting", bootRetries: 0 };
}

export function twitchBoutReady(state: TwitchBoutRecoveryState): TwitchBoutRecoveryState {
  return state.phase === "booting" ? { ...state, phase: "fighting" } : state;
}

export function twitchBoutBootTimedOut(state: TwitchBoutRecoveryState): {
  state: TwitchBoutRecoveryState; action: "retry" | "fail" | "ignore";
} {
  if (state.phase !== "booting") return { state, action: "ignore" };
  return state.bootRetries < TWITCH_BOUT_MAX_BOOT_RETRIES
    ? { state: { ...state, bootRetries: state.bootRetries + 1 }, action: "retry" }
    : { state: { ...state, phase: "failed" }, action: "fail" };
}

export function twitchBoutFinished(state: TwitchBoutRecoveryState): TwitchBoutRecoveryState {
  return state.phase === "booting" || state.phase === "fighting" ? { ...state, phase: "complete" } : state;
}

export function twitchBoutFailed(state: TwitchBoutRecoveryState): TwitchBoutRecoveryState {
  return state.phase === "booting" || state.phase === "fighting" ? { ...state, phase: "failed" } : state;
}
