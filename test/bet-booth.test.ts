import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BetBooth, type BetBoothView } from "../src/app/BetBooth";
import { EMPTY_BET_LEDGER, type BetLedger } from "../src/app/BetLedger";
import type { BroadcastBout, BroadcastBoutInput } from "../src/app/BroadcastCup";

type Pending = { input: BroadcastBoutInput; signal: AbortSignal; resolve: (bout: BroadcastBout) => void; reject: (error: Error) => void };
const viewer = (id: string) => ({ kind: "twitch-user-id" as const, value: id });
const timings = { openMs: 20_000, resultHoldMs: 5_000, voidHoldMs: 2_000, maxConsecutiveFailures: 3 };
const flush = async (): Promise<void> => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const win = (input: BroadcastBoutInput, corner: 0 | 1): BroadcastBout => ({ ...input, winner: corner, winnerId: corner === 0 ? input.leftId : input.rightId,
  how: "ko", ms: 1000, hp: [0.5, 0], contacts: [3, 1], digest: "1234abcd" });

let bouts: Pending[], saves: BetLedger[], views: BetBoothView[], seeds: number[];
function booth(stored: BetLedger = EMPTY_BET_LEDGER, roster = ["kuma", "yume"]): BetBooth {
  return new BetBooth({
    runBout: (input, signal) => new Promise((resolve, reject) => { bouts.push({ input, signal, resolve, reject }); }),
    roster: () => roster, commandOf: id => id,
    store: { load: () => stored, save: ledger => { saves.push(ledger); return true; } },
    changed: view => views.push(view), timings, random: () => 0, seed: () => { seeds.push(seeds.length + 7); return seeds.at(-1)!; },
  });
}

beforeEach(() => { vi.useFakeTimers(); bouts = []; saves = []; views = []; seeds = []; });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe("bet booth loop", () => {
  it("opens a round, takes bets, locks, draws the seed only after the lock, then settles into the ledger", async () => {
    const subject = booth(); subject.start(); await flush();
    expect(subject.view()).toMatchObject({ phase: "open", round: { redId: "kuma", blueId: "yume", status: "open" } });
    expect(subject.view().closesAt).toBe(Date.now() + 20_000);
    expect(subject.chat(viewer("1"), "Alice", "!bet red 400")).toEqual({ kind: "bet", displayName: "Alice", side: "red", amount: 400, replaced: false });
    expect(subject.chat(viewer("2"), "Bob", "!bet yume 25%")).toMatchObject({ kind: "bet", side: "blue", amount: 250 });
    expect(subject.chat(viewer("3"), "Cy", "!bet green 10")).toMatchObject({ kind: "rejected", reason: "unknown-side" });
    expect(subject.chat(viewer("3"), "Cy", "!bet red 1001")).toMatchObject({ kind: "rejected", reason: "insufficient", balance: 1000 });
    expect(subject.chat(viewer("3"), "Cy", "hello")).toBeNull();
    expect(seeds).toHaveLength(0); expect(bouts).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(20_000);
    expect(subject.view()).toMatchObject({ phase: "fighting", round: { status: "locked" } });
    expect(bouts.map(b => b.input)).toEqual([{ leftId: "kuma", rightId: "yume", seed: 7 }]);
    expect(subject.chat(viewer("3"), "Cy", "!bet blue 10")).toMatchObject({ kind: "rejected", reason: "closed" });

    bouts[0]!.resolve(win(bouts[0]!.input, 0)); await flush();
    expect(subject.view()).toMatchObject({ phase: "result", round: { status: "settled", winner: "red" }, bout: { winnerId: "kuma" } });
    expect(saves).toHaveLength(1);
    expect(saves[0]!.accounts).toMatchObject({ "twitch-user-id:1": { balance: 1250 }, "twitch-user-id:2": { balance: 750 } });
    expect(subject.chat(viewer("1"), "Alice", "!balance")).toEqual({ kind: "balance", key: "twitch-user-id:1", displayName: "Alice", balance: 1250 });

    await vi.advanceTimersByTimeAsync(5_000);
    expect(subject.view()).toMatchObject({ phase: "open", bout: null });
    subject.dispose(); await flush();
  });

  it("voids a failed or mismatched bout without touching balances, and pauses after repeated failures", async () => {
    const subject = booth(); subject.start(); await flush();
    subject.chat(viewer("1"), "Alice", "!bet red all");
    await vi.advanceTimersByTimeAsync(20_000);
    bouts[0]!.reject(new Error("broadcast_bout_unconfirmed")); await flush();
    expect(subject.view()).toMatchObject({ phase: "void", round: { status: "void" } });
    await vi.advanceTimersByTimeAsync(2_000 + 20_000);
    bouts[1]!.resolve({ ...win(bouts[1]!.input, 0), seed: 999 }); await flush(); // not this round's seed
    expect(subject.view().phase).toBe("void");
    await vi.advanceTimersByTimeAsync(2_000 + 20_000);
    bouts[2]!.reject(new Error("timeout")); await flush();
    expect(subject.view()).toMatchObject({ phase: "paused", fault: "failures" });
    expect(subject.running).toBe(false);
    expect(saves).toHaveLength(0);
    expect(subject.start()).toBe(true); await flush();
    expect(subject.view()).toMatchObject({ phase: "open", fault: null });
    subject.dispose(); await flush();
  });

  it("pauses at once while open, and after the bout settles while fighting", async () => {
    const subject = booth(); subject.start(); await flush();
    subject.chat(viewer("1"), "Alice", "!bet red 100");
    subject.pause(); await flush();
    expect(subject.view()).toMatchObject({ phase: "paused", round: { status: "void" } });
    expect(bouts).toHaveLength(0);

    subject.start(); await flush(); await vi.advanceTimersByTimeAsync(20_000);
    subject.pause(); await flush();
    expect(subject.view()).toMatchObject({ phase: "fighting", stopping: true });
    expect(bouts[0]!.signal.aborted).toBe(false);
    bouts[0]!.resolve(win(bouts[0]!.input, 1)); await flush();
    expect(subject.view()).toMatchObject({ phase: "result", round: { winner: "blue" } });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(subject.view()).toMatchObject({ phase: "paused", stopping: false });
    expect(bouts).toHaveLength(1);
  });

  it("aborts the bout on dispose and stops notifying", async () => {
    const subject = booth(); subject.start(); await flush(); await vi.advanceTimersByTimeAsync(20_000);
    const seen = views.length; subject.dispose(); await flush();
    expect(bouts[0]!.signal.aborted).toBe(true);
    expect(views).toHaveLength(seen);
    expect(subject.start()).toBe(false);
    expect(subject.chat(viewer("1"), "Alice", "!balance")).toBeNull();
  });

  it("pauses when the roster has fewer than two fighters, and clamps the betting window", async () => {
    const subject = booth(EMPTY_BET_LEDGER, ["kuma"]); subject.start(); await flush();
    expect(subject.view()).toMatchObject({ phase: "paused", fault: "roster" });
    subject.setOpenMs(1000); expect(subject.view().openMs).toBe(15_000);
    subject.setOpenMs(10_000_000); expect(subject.view().openMs).toBe(300_000);
  });

  it("replaces the ledger only while stopped", async () => {
    const imported: BetLedger = { accounts: { "twitch-user-id:1": { displayName: "Alice", balance: 5000, updatedAt: 1 } }, fighters: {}, matches: 4 };
    const subject = booth(); subject.start(); await flush();
    expect(subject.replaceLedger(imported)).toBe(false);
    subject.pause(); await flush();
    expect(subject.replaceLedger(imported)).toBe(true);
    expect(saves.at(-1)).toBe(imported);
    expect(subject.chat(viewer("1"), "Alice", "!bal")).toMatchObject({ balance: 5000 });
  });
});
