import { describe, expect, it } from "vitest";
import { createTwitchTournament, applyTwitchMatchResult, joinTwitchTournament, startTwitchTournament } from "../src/app/TwitchTournament";
import {
  createTwitchBoutRecovery, twitchBoutBootTimedOut, twitchBoutReady, twitchBoutFinished, twitchBoutFailed,
  TWITCH_BOUT_BOOT_TIMEOUT_MS, TWITCH_BOUT_MAX_BOOT_RETRIES,
} from "../src/app/TwitchBoutRecovery";
import { createTwitchArenaBoutUrl, validateTwitchArenaBoutMessage, type TwitchArenaBoutRequest } from "../src/app/TwitchArenaBout";

describe("Twitch bout boot recovery", () => {
  it("retries a boot timeout once, then fails instead of retrying forever", () => {
    expect(TWITCH_BOUT_BOOT_TIMEOUT_MS).toBeGreaterThan(0);
    expect(TWITCH_BOUT_MAX_BOOT_RETRIES).toBe(1);
    const first = twitchBoutBootTimedOut(createTwitchBoutRecovery());
    expect(first).toEqual({
      state: { phase: "booting", bootRetries: 1 }, action: "retry",
    });
    const second = twitchBoutBootTimedOut(first.state);
    expect(second).toEqual({
      state: { phase: "failed", bootRetries: 1 }, action: "fail",
    });
    expect(twitchBoutBootTimedOut(second.state)).toEqual({ state: second.state, action: "ignore" });
  });

  it("stops boot retry after ready and keeps fight watchdog failures separate", () => {
    const fighting = twitchBoutReady(createTwitchBoutRecovery());
    expect(fighting).toEqual({ phase: "fighting", bootRetries: 0 });
    expect(twitchBoutBootTimedOut(fighting)).toEqual({ state: fighting, action: "ignore" });
    expect(twitchBoutFailed(fighting)).toEqual({ phase: "failed", bootRetries: 0 });
    expect(twitchBoutFinished(fighting)).toEqual({ phase: "complete", bootRetries: 0 });
  });

  it("ignores duplicate and late lifecycle callbacks after ready, failure, or completion", () => {
    const fighting = twitchBoutReady(createTwitchBoutRecovery());
    expect(twitchBoutReady(fighting)).toBe(fighting);
    const completed = twitchBoutFinished(fighting);
    expect(twitchBoutFinished(completed)).toBe(completed);
    expect(twitchBoutFailed(completed)).toBe(completed);
    expect(twitchBoutReady(completed)).toBe(completed);
    const failed = twitchBoutFailed(createTwitchBoutRecovery());
    expect(twitchBoutReady(failed)).toBe(failed);
    expect(twitchBoutFinished(failed)).toBe(failed);
  });

  it("does not let a duplicate or late match result advance the bracket twice", () => {
    let state = createTwitchTournament(["a", "b", "c", "d"]);
    for (const [index, fighterId] of ["a", "b", "c", "d"].entries()) {
      const result = joinTwitchTournament(state, {
        identity: { kind: "twitch-user-id", value: `viewer-${index}` },
        login: `viewer-${index}`, displayName: `Viewer ${index}`, fighterId,
      });
      expect(result.accepted).toBe(true);
      state = result.state;
    }
    state = startTwitchTournament(state).state;
    state = applyTwitchMatchResult(state, "semi-1", "a").state;
    const afterSemiOne = state;
    expect(applyTwitchMatchResult(state, "semi-1", "a")).toMatchObject({ applied: false, reason: "duplicate-result" });
    expect(state).toBe(afterSemiOne);
    state = applyTwitchMatchResult(state, "semi-2", "c").state;
    const finalState = applyTwitchMatchResult(state, "final", "a").state;
    expect(finalState).toMatchObject({ status: "complete", championFighterId: "a" });
    expect(applyTwitchMatchResult(finalState, "final", "c")).toMatchObject({ applied: false, reason: "not-running" });
  });

  it("preserves pair and seed across retry but rejects an earlier attempt from the same iframe without advancing", () => {
    const previousAttempt: TwitchArenaBoutRequest = { boutId: "cup-semi-1-attempt-1", a: "kuma", b: "yume", seed: 0x1234abcd };
    const retryRequest: TwitchArenaBoutRequest = { ...previousAttempt, boutId: "cup-semi-1-attempt-2" };
    const retryUrl = () => createTwitchArenaBoutUrl("https://example.com/twitch.html", retryRequest);
    const retryParsed = new URL(retryUrl()).searchParams;
    expect(retryParsed.get("fighter")).toBe(previousAttempt.a);
    expect(retryParsed.get("opponent")).toBe(previousAttempt.b);
    expect(retryParsed.get("bout")).toBe(String(previousAttempt.seed));
    expect(retryParsed.get("twitchBout")).toBe(retryRequest.boutId);
    const origin = "https://example.com";
    const sharedFrame = {} as MessageEventSource;
    const lateResult = {
      ...previousAttempt, type: "oddbout:twitch:bout-result", winnerId: previousAttempt.a,
      result: { winner: 0, how: "ko", ms: 1000, hp: [0, 0.5], contacts: [1, 1], digest: "1234abcd" },
    };
    expect(validateTwitchArenaBoutMessage({ origin, source: sharedFrame, data: lateResult }, origin, sharedFrame, retryRequest)).toBeNull();
    expect(validateTwitchArenaBoutMessage({ origin, source: sharedFrame, data: { ...previousAttempt, type: "oddbout:twitch:bout-ready" } }, origin, sharedFrame, retryRequest)).toBeNull();
    expect(validateTwitchArenaBoutMessage({ origin, source: sharedFrame, data: { ...previousAttempt, type: "oddbout:twitch:bout-error", message: "late failure" } }, origin, sharedFrame, retryRequest)).toBeNull();
    const retryResult = { ...lateResult, boutId: retryRequest.boutId };
    expect(validateTwitchArenaBoutMessage({ origin, source: sharedFrame, data: retryResult }, origin, sharedFrame, retryRequest)).toEqual(retryResult);

    let tournament = createTwitchTournament(["kuma", "yume", "beotim", "bravow"]);
    for (const [index, fighterId] of ["kuma", "yume", "beotim", "bravow"].entries()) {
      tournament = joinTwitchTournament(tournament, {
        identity: { kind: "twitch-user-id", value: `viewer-${index}` }, login: `viewer-${index}`,
        displayName: `Viewer ${index}`, fighterId,
      }).state;
    }
    tournament = startTwitchTournament(tournament).state;
    const accepted = validateTwitchArenaBoutMessage({ origin, source: sharedFrame, data: lateResult }, origin, sharedFrame, retryRequest);
    if (accepted?.type === "oddbout:twitch:bout-result") {
      tournament = applyTwitchMatchResult(tournament, "semi-1", accepted.winnerId).state;
    }
    expect(tournament).toMatchObject({ status: "running", activeMatchId: "semi-1", championFighterId: null });
    expect(tournament.matches[0]).toMatchObject({ status: "active", winnerFighterId: null });
  });
});
