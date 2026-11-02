import { twitchArenaCorner } from "./TwitchArenaBout";
import type { CityFightBoutResult } from "../sim/cityFight/bout/CityFightFighterBout";

export interface BroadcastCupInput {
  readonly jobId: string;
  readonly leaseToken: string | number;
  readonly seed: number;
  readonly fighterIds: readonly string[];
}
export interface BroadcastBout extends CityFightBoutResult {
  readonly leftId: string;
  readonly rightId: string;
  readonly winnerId: string;
  readonly seed: number;
}
export interface BroadcastCupResult {
  readonly protocolVersion: 1;
  readonly jobId: string;
  readonly leaseToken: string | number;
  readonly seed: number;
  readonly winnerId: string;
  readonly bouts: readonly BroadcastBout[];
}
export interface BroadcastCupStatus {
  readonly status: "idle" | "running" | "completed" | "failed" | "cancelled";
  /** 0/1: semifinals; 2: final; 3: finished. */
  readonly round: number;
  readonly fighterIds: readonly string[];
  readonly bouts: readonly BroadcastBout[];
  readonly winnerId?: string;
}
export interface BroadcastBoutInput { readonly leftId: string; readonly rightId: string; readonly seed: number }
export type RunBroadcastBout = (input: BroadcastBoutInput, signal: AbortSignal) => Promise<BroadcastBout>;

export class BroadcastCupError extends Error {
  constructor(readonly code: string) { super(code); this.name = "BroadcastCupError"; }
}

/** Protocol 1 fixes the three seeds, including uint32 wraparound. */
export function broadcastBoutSeed(seed: number, index: number): number { return (seed + index) >>> 0; }

function checkedInput(input: BroadcastCupInput): BroadcastCupInput {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || Object.keys(input).some(key => !["jobId", "leaseToken", "seed", "fighterIds"].includes(key))
    || !(typeof input.jobId === "string" && input.jobId.length > 0 && input.jobId.length <= 256 && !/[\u0000-\u001f\u007f]/u.test(input.jobId))
    || !(typeof input.leaseToken === "number" ? Number.isSafeInteger(input.leaseToken) && input.leaseToken > 0 : typeof input.leaseToken === "string" && input.leaseToken.length > 0 && input.leaseToken.length <= 256 && !/[\u0000-\u001f\u007f]/u.test(input.leaseToken))
    || !Number.isInteger(input.seed) || input.seed < 0 || input.seed > 0xffffffff
    || !Array.isArray(input.fighterIds) || input.fighterIds.length !== 4 || new Set(input.fighterIds).size !== 4
    || !input.fighterIds.every(id => typeof id === "string" && twitchArenaCorner(id) !== null)) throw new BroadcastCupError("broadcast_invalid_input");
  return { jobId: input.jobId, leaseToken: input.leaseToken, seed: input.seed, fighterIds: [...input.fighterIds] };
}

function checkedBout(bout: BroadcastBout, request: BroadcastBoutInput): BroadcastBout {
  const pair = (value: unknown): value is readonly [number, number] => Array.isArray(value) && value.length === 2 && value.every(n => typeof n === "number" && Number.isFinite(n) && n >= 0);
  if (!bout || bout.leftId !== request.leftId || bout.rightId !== request.rightId || bout.seed !== request.seed
    || (bout.winner !== 0 && bout.winner !== 1) || bout.winnerId !== (bout.winner === 0 ? request.leftId : request.rightId)
    || (bout.how !== "ko" && bout.how !== "decision") || !Number.isFinite(bout.ms) || bout.ms < 0
    || !pair(bout.hp) || bout.hp.some(hp => hp > 1) || !pair(bout.contacts) || !bout.contacts.every(Number.isInteger)
    || typeof bout.digest !== "string" || !/^[0-9a-f]{8}$/i.test(bout.digest)) throw new BroadcastCupError("broadcast_invalid_bout");
  return { ...request, winnerId: bout.winnerId, winner: bout.winner, how: bout.how, ms: bout.ms, hp: [...bout.hp], contacts: [...bout.contacts], digest: bout.digest };
}

/** Agent exhibitions have no viewer registration or Twitch identity. The caller
 * supplies four fighters; the existing host still verifies registered packages.
 * Job history lasts for this document only and is never a server ledger. */
export class BroadcastCup {
  private state: BroadcastCupStatus = { status: "idle", round: 0, fighterIds: [], bouts: [] };
  private readonly jobs = new Map<string, { fingerprint: string; result: Promise<BroadcastCupResult> }>();
  private active: AbortController | null = null;
  constructor(private readonly runBout: RunBroadcastBout, private readonly changed: (status: BroadcastCupStatus) => void = () => {}) {}

  getStatus(): BroadcastCupStatus { return structuredClone(this.state); }

  runCup(value: BroadcastCupInput): Promise<BroadcastCupResult> {
    let input: BroadcastCupInput;
    try { input = checkedInput(value); } catch (error) { return Promise.reject(error); }
    const fingerprint = JSON.stringify(input);
    const existing = this.jobs.get(input.jobId);
    if (existing) return existing.fingerprint === fingerprint ? existing.result.then(result => structuredClone(result)) : Promise.reject(new BroadcastCupError("broadcast_job_conflict"));
    if (this.active) return Promise.reject(new BroadcastCupError("broadcast_busy"));
    const controller = new AbortController(); this.active = controller;
    this.state = { status: "running", round: 0, fighterIds: input.fighterIds, bouts: [] }; this.notify();
    const result = Promise.resolve().then(() => this.execute(input, controller));
    this.jobs.set(input.jobId, { fingerprint, result });
    return result.then(value => structuredClone(value));
  }

  cancel(): void { this.active?.abort(); }

  private notify(): void { this.changed(this.getStatus()); }

  private async execute(input: BroadcastCupInput, controller: AbortController): Promise<BroadcastCupResult> {
    const bouts: BroadcastBout[] = [];
    try {
      for (let index = 0; index < 3; index++) {
        if (controller.signal.aborted) throw new BroadcastCupError("broadcast_cancelled");
        const leftId = index < 2 ? input.fighterIds[index * 2]! : bouts[0]!.winnerId;
        const rightId = index < 2 ? input.fighterIds[index * 2 + 1]! : bouts[1]!.winnerId;
        const request = { leftId, rightId, seed: broadcastBoutSeed(input.seed, index) };
        // Cancellation must settle even if an external execution boundary stalls.
        let abort: (() => void) | undefined;
        const cancelled = new Promise<never>((_, reject) => {
          abort = () => reject(new BroadcastCupError("broadcast_cancelled"));
          controller.signal.addEventListener("abort", abort, { once: true });
        });
        let bout: BroadcastBout;
        try { bout = await Promise.race([this.runBout({ ...request }, controller.signal), cancelled]); }
        finally { if (abort) controller.signal.removeEventListener("abort", abort); }
        if (controller.signal.aborted) throw new BroadcastCupError("broadcast_cancelled");
        bouts.push(checkedBout(bout, request));
        this.state = { status: index === 2 ? "completed" : "running", round: index + 1, fighterIds: input.fighterIds, bouts: [...bouts], ...(index === 2 ? { winnerId: bout.winnerId } : {}) };
        this.notify();
      }
      return { protocolVersion: 1, jobId: input.jobId, leaseToken: input.leaseToken, seed: input.seed, winnerId: bouts[2]!.winnerId, bouts };
    } catch {
      this.state = { ...this.state, status: controller.signal.aborted ? "cancelled" : "failed" }; this.notify();
      throw new BroadcastCupError(controller.signal.aborted ? "broadcast_cancelled" : "broadcast_execution_failed");
    } finally { if (this.active === controller) this.active = null; }
  }
}
