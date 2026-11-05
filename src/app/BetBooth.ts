import { applyBetSettlement, betBalance, type BetLedger } from "./BetLedger";
import { matchupKey, pickBetMatchup } from "./BetMatchmaker";
import { betSideFor, betStake, bettorKey, createBetRound, lockBetRound, parseBalanceCommand, parseBetCommand, placeBet, settleBetRound, voidBetRound,
  type BetRejection, type BetRound, type BetSide, type BettorIdentity } from "./BetRound";
import type { BroadcastBout, RunBroadcastBout } from "./BroadcastCup";

export type BetBoothPhase = "idle" | "open" | "fighting" | "result" | "void" | "paused";
export interface BetBoothTimings {
  /** How long a round takes bets. */
  readonly openMs: number;
  /** The winner and payouts stay on screen this long before the next round opens. */
  readonly resultHoldMs: number;
  /** A void round's notice stays this long. */
  readonly voidHoldMs: number;
  /** The loop pauses after this many bouts in a row fail to confirm a winner. */
  readonly maxConsecutiveFailures: number;
}
export const BET_BOOTH_TIMINGS: BetBoothTimings = Object.freeze({ openMs: 40_000, resultHoldMs: 8_000, voidHoldMs: 4_000, maxConsecutiveFailures: 3 });
export const BET_OPEN_MS_RANGE = Object.freeze({ min: 15_000, max: 300_000 });

export interface BetBoothView {
  readonly phase: BetBoothPhase;
  /** The round on screen: taking bets, fighting, or the last one settled or voided. */
  readonly round: BetRound | null;
  /** When an open round stops taking bets (epoch ms). */
  readonly closesAt: number | null;
  /** The settled round's bout. */
  readonly bout: BroadcastBout | null;
  readonly ledger: BetLedger;
  /** Pause was asked for during a bout: the loop stops after it settles. */
  readonly stopping: boolean;
  /** Why the loop paused by itself: bouts kept failing, too few fighters, or an unexpected error. */
  readonly fault: "failures" | "roster" | "error" | null;
  /** The ledger's last save reached the browser's storage (false: this tab only). */
  readonly saved: boolean;
  readonly openMs: number;
}

export type BetChatOutcome =
  | { readonly kind: "bet"; readonly displayName: string; readonly side: BetSide; readonly amount: number; readonly replaced: boolean }
  | { readonly kind: "rejected"; readonly displayName: string; readonly reason: BetRejection | "unknown-side"; readonly balance: number }
  | { readonly kind: "balance"; readonly key: string; readonly displayName: string; readonly balance: number };

export interface BetBoothDeps {
  readonly runBout: RunBroadcastBout;
  /** The fighters a round may draw (shipped and approved registered ones). */
  readonly roster: () => readonly string[];
  /** A fighter's chat command, so `!bet kuma 100` names his corner. */
  readonly commandOf: (id: string) => string;
  readonly store: { load(): BetLedger; save(ledger: BetLedger): boolean };
  readonly changed?: (view: BetBoothView) => void;
  readonly timings?: Partial<BetBoothTimings>;
  readonly random?: () => number;
  /** A fresh uint32 bout seed; drawn only after the round locks, so no one can know the result while bets are open. */
  readonly seed?: () => number;
  readonly now?: () => number;
}

const RECENT_MATCHUPS = 4;
const cryptoUint32 = (): number => crypto.getRandomValues(new Uint32Array(1))[0]!;

/** Resolves after `ms`, or as soon as `signal` aborts. */
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal.aborted || ms <= 0) { resolve(); return; }
    const done = (): void => { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });
}

/**
 * The bet booth's endless loop of 1:1 rounds: draw a matchup, take bets, lock, run the bout, settle into the ledger, repeat. The broadcaster's
 * page is the only authority; the ledger changes only when a bout's validated winner settles a round.
 */
export class BetBooth {
  private ledger: BetLedger;
  private phase: BetBoothPhase = "idle";
  private round: BetRound | null = null;
  private closesAt: number | null = null;
  private bout: BroadcastBout | null = null;
  private active: AbortController | null = null;
  private stopRequested = false;
  private fault: BetBoothView["fault"] = null;
  private failures = 0;
  private saved = true;
  private disposed = false;
  private recent: string[] = [];
  private readonly timings: BetBoothTimings;
  private openMs: number;
  private readonly random: () => number;
  private readonly seed: () => number;
  private readonly now: () => number;

  constructor(private readonly deps: BetBoothDeps) {
    this.ledger = deps.store.load();
    this.timings = { ...BET_BOOTH_TIMINGS, ...deps.timings };
    this.openMs = this.timings.openMs;
    this.random = deps.random ?? (() => cryptoUint32() / 2 ** 32);
    this.seed = deps.seed ?? cryptoUint32;
    this.now = deps.now ?? Date.now;
  }

  view(): BetBoothView {
    return { phase: this.phase, round: this.round, closesAt: this.closesAt, bout: this.bout, ledger: this.ledger,
      stopping: this.stopRequested && this.active !== null, fault: this.fault, saved: this.saved, openMs: this.openMs };
  }

  get running(): boolean { return this.active !== null; }

  /** Starts (or resumes) the loop; false when it is already running or the booth is disposed. */
  start(): boolean {
    if (this.active || this.disposed) return false;
    const controller = new AbortController();
    this.active = controller; this.stopRequested = false; this.fault = null; this.failures = 0;
    void this.loop(controller);
    return true;
  }

  /** An open round is voided at once; a bout in progress finishes and settles first. */
  pause(): void {
    if (!this.active) return;
    this.stopRequested = true;
    if (this.phase !== "fighting") this.active.abort();
    this.notify();
  }

  /** Stops now (the page is leaving): an open round or a bout in progress is voided. */
  stop(): void {
    if (!this.active) return;
    this.stopRequested = true; this.active.abort();
  }

  /** The betting window for rounds that open from now on. */
  setOpenMs(ms: number): void {
    this.openMs = Math.min(BET_OPEN_MS_RANGE.max, Math.max(BET_OPEN_MS_RANGE.min, Math.round(ms)));
    this.notify();
  }

  /** Replaces the ledger (an imported backup or a reset) while the loop is stopped. */
  replaceLedger(ledger: BetLedger): boolean {
    if (this.active || this.disposed) return false;
    this.ledger = ledger; this.saved = this.deps.store.save(ledger); this.notify();
    return true;
  }

  /** A chat line: `!bet` while a round is open, or `!balance`. Anything else is not for the booth (null). */
  chat(identity: BettorIdentity, displayName: string, text: string): BetChatOutcome | null {
    if (this.disposed || !identity.value.trim()) return null;
    const key = bettorKey(identity), name = displayName.trim().slice(0, 64) || identity.value.trim().slice(0, 64);
    const balance = betBalance(this.ledger, key);
    if (parseBalanceCommand(text)) return { kind: "balance", key, displayName: name, balance };
    const command = parseBetCommand(text);
    if (!command) return null;
    const round = this.round;
    if (!round || this.phase !== "open" || round.status !== "open") return { kind: "rejected", displayName: name, reason: "closed", balance };
    const side = betSideFor(command.target, { red: this.deps.commandOf(round.redId), blue: this.deps.commandOf(round.blueId) });
    if (!side) return { kind: "rejected", displayName: name, reason: "unknown-side", balance };
    const placed = placeBet(round, { key, displayName: name, balance }, side, betStake(command.amount, balance));
    if (!placed.accepted) return { kind: "rejected", displayName: name, reason: placed.reason, balance };
    this.round = placed.round; this.notify();
    return { kind: "bet", displayName: name, side, amount: placed.bet.amount, replaced: placed.replaced };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.active?.abort();
  }

  private notify(): void { if (!this.disposed) this.deps.changed?.(this.view()); }

  private async loop(controller: AbortController): Promise<void> {
    const signal = controller.signal;
    const stopping = (): boolean => signal.aborted || this.stopRequested || this.disposed;
    try {
      while (!stopping()) {
        const ids = this.deps.roster();
        if (new Set(ids).size < 2) { this.fault = "roster"; break; }
        const [redId, blueId] = pickBetMatchup(ids, this.recent, this.random);
        this.recent = [matchupKey(redId, blueId), ...this.recent].slice(0, RECENT_MATCHUPS);
        this.round = createBetRound(redId, blueId); this.bout = null;
        this.phase = "open"; this.closesAt = this.now() + this.openMs; this.notify();
        await wait(this.openMs, signal);
        if (stopping()) { this.round = voidBetRound(this.round); break; }

        this.round = lockBetRound(this.round); this.phase = "fighting"; this.closesAt = null;
        const seed = this.seed() >>> 0;
        this.notify();
        let bout: BroadcastBout | null = null;
        try {
          const result = await this.deps.runBout({ leftId: redId, rightId: blueId, seed }, signal);
          if (result.leftId === redId && result.rightId === blueId && result.seed === seed && (result.winnerId === redId || result.winnerId === blueId)) bout = result;
        } catch { bout = null; }
        if (signal.aborted || this.disposed) { this.round = voidBetRound(this.round); break; }

        if (!bout) {
          this.round = voidBetRound(this.round); this.phase = "void"; this.failures++;
          if (this.failures >= this.timings.maxConsecutiveFailures) { this.fault = "failures"; break; }
          this.notify();
          await wait(this.timings.voidHoldMs, signal);
          continue;
        }
        this.failures = 0;
        this.round = settleBetRound(this.round, bout.winnerId === redId ? "red" : "blue");
        this.ledger = applyBetSettlement(this.ledger, this.round, this.now());
        this.saved = this.deps.store.save(this.ledger);
        this.bout = bout; this.phase = "result"; this.notify();
        await wait(this.timings.resultHoldMs, signal);
      }
    } catch {
      if (this.round) this.round = voidBetRound(this.round);
      this.fault = "error";
    } finally {
      if (this.active === controller) this.active = null;
      this.closesAt = null;
      this.phase = "paused";
      this.notify();
    }
  }
}
