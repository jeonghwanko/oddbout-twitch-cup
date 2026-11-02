import { describe, expect, it } from "vitest";
import { allowTwitchFighters, applyTwitchMatchResult, createTwitchTournament, joinTwitchTournament, parseJoinCommand, setTwitchSoloRehearsal, startTwitchTournament, type TwitchTournamentState } from "../src/app/TwitchTournament";
import { twitchCupFighterFor, twitchCupRoster } from "../src/app/TwitchCupRoster";

const fighterIds = ["alpha", "bravo", "charlie", "delta"];
function add(state: TwitchTournamentState, i: number, identity = `user-${i}`): TwitchTournamentState {
  const result = joinTwitchTournament(state, {
    identity: { kind: "twitch-user-id", value: identity }, login: `login${i}`, displayName: `Viewer ${i}`, fighterId: fighterIds[i]!,
  });
  expect(result.accepted).toBe(true);
  return result.state;
}

describe("Twitch four-viewer tournament", () => {
  it("parses only one explicit !join command, lowercased", () => {
    expect(parseJoinCommand("!join alpha")).toEqual({ command: "alpha" });
    expect(parseJoinCommand("  !JOIN Fighter_1-2  ")).toEqual({ command: "fighter_1-2" });
    for (const text of ["join alpha", "!join", "!join alpha extra", "!join alpha!", "hello !join alpha"]) expect(parseJoinCommand(text)).toBeNull();
  });

  it("requires exactly four unique users and fighters before explicit start", () => {
    let state = createTwitchTournament(fighterIds);
    expect(startTwitchTournament(state)).toMatchObject({ started: false, reason: "requires-four" });
    state = add(state, 0);
    expect(joinTwitchTournament(state, { identity: { kind: "twitch-user-id", value: "user-0" }, login: "other", displayName: "Other", fighterId: "bravo" })).toMatchObject({ accepted: false, reason: "duplicate-user" });
    expect(joinTwitchTournament(state, { identity: { kind: "twitch-user-id", value: "user-1" }, login: "other", displayName: "Other", fighterId: "missing" })).toMatchObject({ accepted: false, reason: "unknown-fighter" });
    state = add(state, 1);
    expect(joinTwitchTournament(state, { identity: { kind: "twitch-user-id", value: "user-2" }, login: "other", displayName: "Other", fighterId: "alpha" })).toMatchObject({ accepted: false, reason: "fighter-taken" });
    state = add(state, 2);
    state = add(state, 3);
    expect(joinTwitchTournament(state, { identity: { kind: "twitch-user-id", value: "fifth" }, login: "five", displayName: "Five", fighterId: "alpha" })).toMatchObject({ accepted: false, reason: "full" });
    const started = startTwitchTournament(state);
    expect(started).toMatchObject({ started: true, state: { activeMatchId: "semi-1", status: "running" } });
    expect(started.state.matches.map(match => [match.id, match.fighterIds, match.status])).toEqual([
      ["semi-1", ["alpha", "bravo"], "active"], ["semi-2", ["charlie", "delta"], "waiting"], ["final", [], "waiting"],
    ]);
    expect(joinTwitchTournament(started.state, { identity: { kind: "twitch-user-id", value: "late" }, login: "late", displayName: "Late", fighterId: "alpha" })).toMatchObject({ accepted: false, reason: "closed" });
  });

  it("advances only the current match callback; rejects stale, duplicate, and nonparticipant wins", () => {
    let state = createTwitchTournament(fighterIds);
    for (let i = 0; i < 4; i++) state = add(state, i);
    state = startTwitchTournament(state).state;
    expect(applyTwitchMatchResult(state, "semi-2", "charlie")).toMatchObject({ applied: false, reason: "stale-match" });
    expect(applyTwitchMatchResult(state, "semi-1", "charlie")).toMatchObject({ applied: false, reason: "invalid-winner" });
    state = applyTwitchMatchResult(state, "semi-1", "bravo").state;
    expect(state.matches[0]!.winnerFighterId).toBe("bravo");
    expect(state.activeMatchId).toBe("semi-2");
    expect(applyTwitchMatchResult(state, "semi-1", "bravo")).toMatchObject({ applied: false, reason: "duplicate-result" });
    state = applyTwitchMatchResult(state, "semi-2", "charlie").state;
    expect(state.matches[2]).toMatchObject({ fighterIds: ["bravo", "charlie"], status: "active" });
    state = applyTwitchMatchResult(state, "final", "bravo").state;
    expect(state).toMatchObject({ status: "complete", activeMatchId: null, championFighterId: "bravo" });
    expect(applyTwitchMatchResult(state, "final", "bravo")).toMatchObject({ applied: false, reason: "not-running" });
  });

  it("uses stable login fallback identity without inventing Twitch IDs", () => {
    let state = createTwitchTournament(fighterIds);
    const first = joinTwitchTournament(state, { identity: { kind: "twitch-login", value: "ViewerLogin" }, login: "ViewerLogin", displayName: "Viewer", fighterId: "alpha" });
    expect(first.accepted).toBe(true);
    state = first.state;
    expect(joinTwitchTournament(state, { identity: { kind: "twitch-login", value: "viewerlogin" }, login: "viewerlogin", displayName: "Viewer", fighterId: "bravo" })).toMatchObject({ accepted: false, reason: "duplicate-user" });
    expect(joinTwitchTournament(state, { identity: { kind: "twitch-user-id", value: "actual-123" }, login: "VIEWERLOGIN", displayName: "Viewer", fighterId: "bravo" })).toMatchObject({ accepted: false, reason: "duplicate-user" });
    expect(state.entrants[0]!.identity).toEqual({ kind: "twitch-login", value: "ViewerLogin" });
  });

  it("deduplicates a fallback login against an earlier authenticated identity", () => {
    let state = createTwitchTournament(fighterIds);
    const identified = joinTwitchTournament(state, { identity: { kind: "twitch-user-id", value: "id-1" }, login: "sameviewer", displayName: "Same Viewer", fighterId: "alpha" });
    expect(identified.accepted).toBe(true);
    state = identified.state;
    expect(joinTwitchTournament(state, { identity: { kind: "twitch-login", value: "sameviewer" }, login: "sameviewer", displayName: "Same Viewer", fighterId: "bravo" })).toMatchObject({ accepted: false, reason: "duplicate-user" });
  });

  it("keeps live registration as the default and restores it on a fresh tournament", () => {
    const state = createTwitchTournament(fighterIds);
    expect(state.registrationPolicy).toEqual({ kind: "live" });
    const rehearsal = setTwitchSoloRehearsal(state, "broadcaster-123");
    expect(rehearsal).toMatchObject({ changed: true, state: { registrationPolicy: { kind: "solo-rehearsal", broadcasterUserId: "broadcaster-123" } } });
    expect(setTwitchSoloRehearsal(rehearsal.state, null)).toMatchObject({ changed: true, state: { registrationPolicy: { kind: "live" } } });
    expect(createTwitchTournament(fighterIds).registrationPolicy).toEqual({ kind: "live" });
  });

  it("allows only the authenticated broadcaster to rehearse four distinct fighters", () => {
    const broadcasterId = "broadcaster-123";
    const enabled = setTwitchSoloRehearsal(createTwitchTournament(fighterIds), broadcasterId);
    expect(enabled.changed).toBe(true);
    let state = enabled.state;
    for (let i = 0; i < 4; i++) {
      const result = joinTwitchTournament(state, {
        identity: { kind: "twitch-user-id", value: broadcasterId },
        login: "channel_owner", displayName: "Channel Owner", fighterId: fighterIds[i]!,
      });
      expect(result.accepted).toBe(true);
      if (result.accepted) state = result.state;
    }
    expect(state.entrants).toEqual(fighterIds.map((fighterId, index) => ({
      identity: { kind: "twitch-user-id", value: broadcasterId }, login: "channel_owner",
      displayName: "Channel Owner", fighterId, rehearsalSlot: index + 1,
    })));

    const started = startTwitchTournament(state);
    expect(started.started).toBe(true);
    if (!started.started) return;
    state = applyTwitchMatchResult(started.state, "semi-1", "bravo").state;
    state = applyTwitchMatchResult(state, "semi-2", "charlie").state;
    expect(state.matches[2]).toMatchObject({ fighterIds: ["bravo", "charlie"], status: "active" });
    state = applyTwitchMatchResult(state, "final", "charlie").state;
    expect(state).toMatchObject({ status: "complete", championFighterId: "charlie", activeMatchId: null });
  });

  it("rejects non-broadcasters in rehearsal even when their login matches, and rejects fallback identities", () => {
    let state = setTwitchSoloRehearsal(createTwitchTournament(fighterIds), "broadcaster-123").state;
    for (const entrant of [
      { identity: { kind: "twitch-user-id" as const, value: "outsider-456" }, login: "channel_owner", displayName: "Spoofed Login", fighterId: "alpha" },
      { identity: { kind: "twitch-login" as const, value: "channel_owner" }, login: "channel_owner", displayName: "Login Fallback", fighterId: "bravo" },
      { identity: { kind: "local-demo" as const, value: "broadcaster-123" }, login: "channel_owner", displayName: "Local Demo", fighterId: "charlie" },
    ]) {
      expect(joinTwitchTournament(state, entrant)).toMatchObject({ accepted: false, reason: "solo-broadcaster-only" });
    }
    expect(state.entrants).toHaveLength(0);
  });

  it("still rejects unknown or repeated fighters from the broadcaster", () => {
    let state = setTwitchSoloRehearsal(createTwitchTournament(fighterIds), "broadcaster-123").state;
    const base = { identity: { kind: "twitch-user-id" as const, value: "broadcaster-123" }, login: "owner", displayName: "Owner" };
    expect(joinTwitchTournament(state, { ...base, fighterId: "missing" })).toMatchObject({ accepted: false, reason: "unknown-fighter" });
    const first = joinTwitchTournament(state, { ...base, fighterId: "alpha" });
    expect(first.accepted).toBe(true);
    if (first.accepted) state = first.state;
    expect(joinTwitchTournament(state, { ...base, fighterId: "alpha" })).toMatchObject({ accepted: false, reason: "fighter-taken" });
  });

  it("locks rehearsal policy after registration has entrants or the bracket has started", () => {
    let populated = setTwitchSoloRehearsal(createTwitchTournament(fighterIds), "broadcaster-123").state;
    const joined = joinTwitchTournament(populated, {
      identity: { kind: "twitch-user-id", value: "broadcaster-123" }, login: "owner", displayName: "Owner", fighterId: "alpha",
    });
    expect(joined.accepted).toBe(true);
    if (joined.accepted) populated = joined.state;
    expect(setTwitchSoloRehearsal(populated, null)).toMatchObject({ changed: false, reason: "mode-locked" });

    let full = setTwitchSoloRehearsal(createTwitchTournament(fighterIds), "broadcaster-123").state;
    for (let i = 0; i < 4; i++) {
      const result = joinTwitchTournament(full, {
        identity: { kind: "twitch-user-id", value: "broadcaster-123" }, login: "owner", displayName: "Owner", fighterId: fighterIds[i]!,
      });
      if (result.accepted) full = result.state;
    }
    const running = startTwitchTournament(full).state;
    expect(setTwitchSoloRehearsal(running, null)).toMatchObject({ changed: false, reason: "mode-locked" });
    const completed = applyTwitchMatchResult(
      applyTwitchMatchResult(applyTwitchMatchResult(running, "semi-1", "alpha").state, "semi-2", "charlie").state,
      "final", "alpha",
    ).state;
    expect(setTwitchSoloRehearsal(completed, null)).toMatchObject({ changed: false, reason: "mode-locked" });
  });
  it("admits a registered fighter by his command in live and solo rehearsal, under the same rejections", () => {
    const fixtureOne = "abc00194-0000-4000-8000-000000000001";
    // The registry answers after the page opened: registration takes him at once.
    let state = createTwitchTournament(fighterIds);
    const roster = twitchCupRoster(fighterIds, [{ id: fixtureOne, name: "Fixture One", names: { en: "Fixture One" }, duelApproved: true }]);
    const viewer = (i: number, command: string) => ({ identity: { kind: "twitch-user-id" as const, value: `user-${i}` }, login: `login${i}`,
      displayName: `Viewer ${i}`, fighterId: twitchCupFighterFor(roster, parseJoinCommand(`!join ${command}`)!.command) ?? "" });
    expect(joinTwitchTournament(state, viewer(0, "fixtureone"))).toMatchObject({ accepted: false, reason: "unknown-fighter" });
    state = allowTwitchFighters(state, roster.map(fighter => fighter.id));
    const joined = joinTwitchTournament(state, viewer(0, "fixtureone"));
    expect(joined).toMatchObject({ accepted: true, state: { entrants: [{ fighterId: fixtureOne }] } });
    state = joined.state;
    expect(joinTwitchTournament(state, viewer(1, "fixtureone"))).toMatchObject({ accepted: false, reason: "fighter-taken" });
    expect(joinTwitchTournament(state, { ...viewer(0, "alpha") })).toMatchObject({ accepted: false, reason: "duplicate-user" });
    expect(joinTwitchTournament(state, viewer(1, fixtureOne))).toMatchObject({ accepted: false, reason: "unknown-fighter" });
    for (let i = 1; i < 4; i++) state = joinTwitchTournament(state, viewer(i, fighterIds[i - 1]!)).state;
    expect(joinTwitchTournament(state, viewer(5, "delta"))).toMatchObject({ accepted: false, reason: "full" });
    const started = startTwitchTournament(state).state;
    expect(started.matches[0]!.fighterIds).toEqual([fixtureOne, "alpha"]);
    expect(allowTwitchFighters(started, ["late"])).toBe(started);

    let solo = setTwitchSoloRehearsal(allowTwitchFighters(createTwitchTournament(fighterIds), [fixtureOne]), "broadcaster-123").state;
    const owner = { identity: { kind: "twitch-user-id" as const, value: "broadcaster-123" }, login: "owner", displayName: "Owner" };
    expect(joinTwitchTournament(solo, { ...viewer(9, "fixtureone"), identity: { kind: "twitch-user-id", value: "outsider" } }))
      .toMatchObject({ accepted: false, reason: "solo-broadcaster-only" });
    const rehearsed = joinTwitchTournament(solo, { ...owner, fighterId: fixtureOne });
    expect(rehearsed).toMatchObject({ accepted: true, state: { entrants: [{ fighterId: fixtureOne, rehearsalSlot: 1 }] } });
    solo = rehearsed.state;
    expect(joinTwitchTournament(solo, { ...owner, fighterId: fixtureOne })).toMatchObject({ accepted: false, reason: "fighter-taken" });
  });
});
