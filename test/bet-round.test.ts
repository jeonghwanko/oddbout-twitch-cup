import { describe, expect, it } from "vitest";
import { betOddsLabel, betPools, betSideFor, betStake, bettorKey, createBetRound, lockBetRound, parseBalanceCommand, parseBetCommand, placeBet, settleBetRound, voidBetRound } from "../src/app/BetRound";
import { matchupKey, pickBetMatchup } from "../src/app/BetMatchmaker";

const viewer = (name: string, balance = 1000) => ({ key: `twitch-user-id:${name}`, displayName: name, balance });

describe("bet commands", () => {
  it("reads a whole-message !bet with a side and an amount", () => {
    expect(parseBetCommand("!bet red 500")).toEqual({ target: "red", amount: { kind: "fixed", value: 500 } });
    expect(parseBetCommand("  !BET Blue 10K ")).toEqual({ target: "blue", amount: { kind: "fixed", value: 10_000 } });
    expect(parseBetCommand("!bet kuma 2m")).toEqual({ target: "kuma", amount: { kind: "fixed", value: 2_000_000 } });
    expect(parseBetCommand("!bet r 25%")).toEqual({ target: "r", amount: { kind: "percent", value: 25 } });
    for (const all of ["all", "ALLIN", "max"]) expect(parseBetCommand(`!bet b ${all}`)).toEqual({ target: "b", amount: { kind: "all" } });
  });

  it("rejects anything that is not exactly one bet", () => {
    for (const text of ["!bet red", "!bet 500", "bet red 500", "!bet red 500 please", "hi !bet red 500", "!bet red 0", "!bet red -5",
      "!bet red 1.5", "!bet red 0%", "!bet red 101%", "!bet red 1234567890123", "!bet red abc", "!betred 500"]) expect(parseBetCommand(text)).toBeNull();
  });

  it("reads !balance and !bal alone", () => {
    expect(parseBalanceCommand("!balance")).toBe(true); expect(parseBalanceCommand(" !BAL ")).toBe(true);
    expect(parseBalanceCommand("!balance please")).toBe(false); expect(parseBalanceCommand("!bals")).toBe(false);
  });

  it("resolves a side by colour, shorthand or the corner's command", () => {
    const commands = { red: "kuma", blue: "novabeat" };
    expect(["red", "R", "left"].map(t => betSideFor(t, commands))).toEqual(["red", "red", "red"]);
    expect(["blue", "b", "RIGHT", "nova-beat"].map(t => betSideFor(t, commands))).toEqual(["blue", "blue", "blue", "blue"]);
    expect(betSideFor("kuma", commands)).toBe("red");
    expect(betSideFor("yume", commands)).toBeNull();
  });

  it("turns all and percentages into a stake against the balance", () => {
    expect(betStake({ kind: "all" }, 1234)).toBe(1234);
    expect(betStake({ kind: "percent", value: 10 }, 1234)).toBe(123);
    expect(betStake({ kind: "percent", value: 1 }, 50)).toBe(1);
    expect(betStake({ kind: "fixed", value: 70 }, 50)).toBe(70);
  });

  it("keys a viewer by identity, case-insensitively", () => {
    expect(bettorKey({ kind: "twitch-user-id", value: " 42 " })).toBe("twitch-user-id:42");
    expect(bettorKey({ kind: "local-demo", value: "Bot1" })).toBe("local-demo:bot1");
  });
});

describe("bet rounds", () => {
  it("takes one bet per viewer while open, replacing an earlier one in place", () => {
    let round = createBetRound("kuma", "yume");
    const first = placeBet(round, viewer("a"), "red", 300); expect(first.accepted).toBe(true); round = first.round;
    round = placeBet(round, viewer("b"), "blue", 200).round;
    const again = placeBet(round, viewer("a"), "blue", 400);
    expect(again).toMatchObject({ accepted: true, replaced: true });
    expect(again.round.bets.map(bet => [bet.displayName, bet.side, bet.amount])).toEqual([["a", "blue", 400], ["b", "blue", 200]]);
    expect(betPools(again.round)).toEqual({ red: 0, blue: 600, redCount: 0, blueCount: 2 });
  });

  it("rejects bets above the balance, empty stakes and bets after the lock", () => {
    const round = createBetRound("kuma", "yume");
    expect(placeBet(round, viewer("a", 100), "red", 101)).toMatchObject({ accepted: false, reason: "insufficient" });
    expect(placeBet(round, viewer("a"), "red", 0)).toMatchObject({ accepted: false, reason: "invalid-amount" });
    const locked = lockBetRound(placeBet(round, viewer("a"), "red", 100).round);
    expect(placeBet(locked, viewer("b"), "blue", 100)).toMatchObject({ accepted: false, reason: "closed" });
    expect(locked.bets).toHaveLength(1);
    expect(() => createBetRound("kuma", "kuma")).toThrow();
  });

  it("settles parimutuel: winners take their share of the losing pool, losers lose their stake", () => {
    let round = createBetRound("kuma", "yume");
    round = placeBet(round, viewer("a"), "red", 100).round;
    round = placeBet(round, viewer("b"), "red", 300).round;
    round = placeBet(round, viewer("c"), "blue", 1000).round;
    expect(settleBetRound(round, "red")).toBe(round); // still open: nothing to settle
    const settled = settleBetRound(lockBetRound(round), "red");
    expect(settled.status).toBe("settled"); expect(settled.winner).toBe("red");
    expect(settled.payouts.map(p => [p.displayName, p.delta])).toEqual([["a", 250], ["b", 750], ["c", -1000]]);
    expect(settleBetRound(settled, "blue")).toBe(settled); // a settled round settles once
  });

  it("rounds a winner's share down", () => {
    let round = createBetRound("kuma", "yume");
    round = placeBet(round, viewer("a"), "red", 3).round;
    round = placeBet(round, viewer("b"), "blue", 10).round;
    expect(settleBetRound(lockBetRound(round), "blue").payouts.map(p => p.delta)).toEqual([-3, 3]);
  });

  it("moves no points in a one-sided round", () => {
    const round = lockBetRound(placeBet(placeBet(createBetRound("kuma", "yume"), viewer("a"), "red", 500).round, viewer("b"), "red", 50).round);
    expect(settleBetRound(round, "red").payouts.map(p => p.delta)).toEqual([0, 0]);
    expect(settleBetRound(round, "blue").payouts.map(p => p.delta)).toEqual([0, 0]);
  });

  it("voids an open or locked round without payouts", () => {
    const open = placeBet(createBetRound("kuma", "yume"), viewer("a"), "red", 500).round;
    expect(voidBetRound(open)).toMatchObject({ status: "void", payouts: [] });
    expect(voidBetRound(lockBetRound(open)).status).toBe("void");
    const settled = settleBetRound(lockBetRound(open), "red");
    expect(voidBetRound(settled)).toBe(settled);
  });

  it("shows odds red first with the smaller pool as one", () => {
    expect(betOddsLabel({ red: 1_828_909, blue: 6_812_748 })).toBe("1 : 3.7");
    expect(betOddsLabel({ red: 500, blue: 200 })).toBe("2.5 : 1");
    expect(betOddsLabel({ red: 400, blue: 400 })).toBe("1 : 1");
    expect(betOddsLabel({ red: 0, blue: 400 })).toBe("—");
  });
});

describe("bet matchmaking", () => {
  const sequence = (...values: number[]) => { let i = 0; return () => values[i++ % values.length]!; };

  it("picks two different fighters and avoids recent pairings while another remains", () => {
    const ids = ["kuma", "yume", "bravow"];
    for (let n = 0; n < 50; n++) {
      const [red, blue] = pickBetMatchup(ids, [matchupKey("kuma", "yume"), matchupKey("bravow", "kuma")], Math.random);
      expect(red).not.toBe(blue);
      expect(matchupKey(red, blue)).toBe(matchupKey("bravow", "yume"));
    }
  });

  it("falls back to any pairing when every one is recent, and needs two fighters", () => {
    const [red, blue] = pickBetMatchup(["kuma", "yume"], [matchupKey("kuma", "yume")], sequence(0.9, 0.1));
    expect(new Set([red, blue])).toEqual(new Set(["kuma", "yume"]));
    expect(() => pickBetMatchup(["kuma", "kuma"], [], Math.random)).toThrow();
  });

  it("uses the random source for the pairing and the corners", () => {
    expect(pickBetMatchup(["kuma", "yume", "bravow"], [], sequence(0, 0))).toEqual(["kuma", "yume"]);
    expect(pickBetMatchup(["kuma", "yume", "bravow"], [], sequence(0.99, 0.99))).toEqual(["bravow", "yume"]);
  });
});
