import { describe, expect, it, vi } from "vitest";
import { BroadcastCup, broadcastBoutSeed, type BroadcastBout, type BroadcastBoutInput, type BroadcastCupInput } from "../src/app/BroadcastCup";

const input: BroadcastCupInput = { jobId: "job-1", leaseToken: "lease-1", seed: 123, fighterIds: ["kuma", "yume", "bravow", "beotim"] };
const outcome = (request: BroadcastBoutInput, winner: 0 | 1 = 0): BroadcastBout => ({ ...request, winner, winnerId: winner === 0 ? request.leftId : request.rightId, digest: "1234abcd", how: "ko", ms: 1000, hp: [0.7, 0], contacts: [4, 1] });

describe("agent exhibition bracket", () => {
  it("runs two ordered semifinals then their winners in a final with fixed seeds and exact evidence", async () => {
    const calls: BroadcastBoutInput[] = [];
    const cup = new BroadcastCup(async request => { calls.push(request); return outcome(request, calls.length === 1 ? 1 : 0); });
    const result = await cup.runCup(input);
    expect(calls).toEqual([{ leftId: "kuma", rightId: "yume", seed: 123 }, { leftId: "bravow", rightId: "beotim", seed: 124 }, { leftId: "yume", rightId: "bravow", seed: 125 }]);
    expect(result).toEqual({ protocolVersion: 1, jobId: "job-1", leaseToken: "lease-1", seed: 123, winnerId: "yume", bouts: calls.map((request, i) => outcome(request, i === 0 ? 1 : 0)) });
    expect(cup.getStatus()).toMatchObject({ status: "completed", round: 3, winnerId: "yume" });
    expect(broadcastBoutSeed(0xffffffff, 1)).toBe(0);
    expect(broadcastBoutSeed(0xffffffff, 2)).toBe(1);
    const fenced = await cup.runCup({ ...input, jobId: "numeric-fence", leaseToken: 1 });
    expect(fenced.leaseToken).toBe(1);
  });

  it("deduplicates in-flight and completed jobs, rejects changed input or lease and concurrent different jobs", async () => {
    let finish!: (bout: BroadcastBout) => void;
    const run = vi.fn((request: BroadcastBoutInput) => run.mock.calls.length === 1 ? new Promise<BroadcastBout>(resolve => { finish = resolve; }) : Promise.resolve(outcome(request)));
    const cup = new BroadcastCup(run);
    const first = cup.runCup(input); const duplicate = cup.runCup({ ...input });
    await Promise.resolve();
    await expect(cup.runCup({ ...input, seed: 124 })).rejects.toThrow("broadcast_job_conflict");
    await expect(cup.runCup({ ...input, leaseToken: "new-lease" })).rejects.toThrow("broadcast_job_conflict");
    await expect(cup.runCup({ ...input, jobId: "job-2" })).rejects.toThrow("broadcast_busy");
    finish(outcome({ leftId: "kuma", rightId: "yume", seed: 123 }));
    const result = await first; expect(await duplicate).toEqual(result);
    (result.bouts as BroadcastBout[]).pop();
    expect((await cup.runCup(input)).bouts).toHaveLength(3);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it.each([
    { fighterIds: ["kuma", "kuma", "bravow", "beotim"] }, { fighterIds: ["kuma", "yume", "bravow"] },
    { fighterIds: ["kuma", "yume", "bravow", "unknown"] }, { seed: -1 }, { seed: 1.5 }, { seed: 0x100000000 }, { jobId: "" }, { leaseToken: "" }, { leaseToken: 0 }, { leaseToken: 1.5 },
  ])("rejects malformed/excess/duplicate fighters before running a bout: %o", async change => {
    const run = vi.fn(); const cup = new BroadcastCup(run);
    await expect(cup.runCup({ ...input, ...change })).rejects.toThrow("broadcast_invalid_input"); expect(run).not.toHaveBeenCalled();
  });

  it("does not advance or retry uncertain failures, invalid winners, pairing, seeds or fingerprints", async () => {
    for (const change of [{ winnerId: "beotim" }, { seed: 999 }, { leftId: "bravow" }, { digest: "invalid" }, { hp: [2, 0] }]) {
      const run = vi.fn(async request => ({ ...outcome(request), ...change } as BroadcastBout));
      const cup = new BroadcastCup(run);
      await expect(cup.runCup(input)).rejects.toThrow("broadcast_execution_failed");
      await expect(cup.runCup(input)).rejects.toThrow("broadcast_execution_failed");
      expect(run).toHaveBeenCalledTimes(1); expect(cup.getStatus()).toMatchObject({ status: "failed", bouts: [] });
    }
  });

  it("cancel settles a stalled boundary, stale completion cannot affect a later cup", async () => {
    let late!: (bout: BroadcastBout) => void;
    const run = vi.fn((request: BroadcastBoutInput) => run.mock.calls.length === 1 ? new Promise<BroadcastBout>(resolve => { late = resolve; }) : Promise.resolve(outcome(request)));
    const cup = new BroadcastCup(run); const first = cup.runCup(input); await Promise.resolve();
    cup.cancel(); await expect(first).rejects.toThrow("broadcast_cancelled");
    expect(cup.getStatus().status).toBe("cancelled");
    const second = await cup.runCup({ ...input, jobId: "job-2" });
    late(outcome({ leftId: "kuma", rightId: "yume", seed: 123 })); await Promise.resolve();
    expect(cup.getStatus()).toMatchObject({ status: "completed", bouts: second.bouts });
    await expect(cup.runCup(input)).rejects.toThrow("broadcast_cancelled");
  });

  it("retains the original pairing/seed when an external bout adapter mutates its request", async () => {
    const cup = new BroadcastCup(async request => {
      Object.assign(request, { leftId: "beotim", seed: 999 });
      return outcome(request);
    });
    await expect(cup.runCup(input)).rejects.toThrow("broadcast_execution_failed");
    expect(cup.getStatus().bouts).toHaveLength(0);
  });
});
