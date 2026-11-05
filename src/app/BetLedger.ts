import { BET_RULES, type BetRound } from "./BetRound";

/**
 * The bet booth's points, kept on the broadcaster's own browser: each viewer's settled balance, each fighter's record and the match count.
 * It is never a wallet: points are not bought, cashed out or exchanged.
 */
export interface BetAccount { readonly displayName: string; readonly balance: number; readonly updatedAt: number }
export interface FighterRecord { readonly wins: number; readonly losses: number }
export interface BetLedger {
  readonly accounts: Readonly<Record<string, BetAccount>>;
  readonly fighters: Readonly<Record<string, FighterRecord>>;
  /** Settled matches; a void round does not count. */
  readonly matches: number;
}

export const EMPTY_BET_LEDGER: BetLedger = Object.freeze({ accounts: Object.freeze({}), fighters: Object.freeze({}), matches: 0 });

/** A viewer's settled balance; a newcomer's is the starting balance. */
export function betBalance(ledger: BetLedger, key: string): number { return ledger.accounts[key]?.balance ?? BET_RULES.startingBalance; }

export function fighterRecord(ledger: BetLedger, id: string): FighterRecord { return ledger.fighters[id] ?? { wins: 0, losses: 0 }; }

/** A settled round's payouts and the fighters' records, applied once. Balances below the bailout are raised to it. */
export function applyBetSettlement(ledger: BetLedger, round: BetRound, now: number): BetLedger {
  if (round.status !== "settled" || !round.winner) return ledger;
  const accounts: Record<string, BetAccount> = { ...ledger.accounts };
  for (const payout of round.payouts) {
    const balance = Math.max(BET_RULES.bailout, betBalance(ledger, payout.key) + payout.delta);
    accounts[payout.key] = { displayName: payout.displayName, balance, updatedAt: now };
  }
  const winnerId = round.winner === "red" ? round.redId : round.blueId, loserId = round.winner === "red" ? round.blueId : round.redId;
  const won = fighterRecord(ledger, winnerId), lost = fighterRecord(ledger, loserId);
  return {
    accounts,
    fighters: { ...ledger.fighters, [winnerId]: { ...won, wins: won.wins + 1 }, [loserId]: { ...lost, losses: lost.losses + 1 } },
    matches: ledger.matches + 1,
  };
}

/** The richest viewers, highest first (ties by name). */
export function betLeaders(ledger: BetLedger, count: number): readonly { readonly key: string; readonly displayName: string; readonly balance: number }[] {
  return Object.entries(ledger.accounts)
    .map(([key, account]) => ({ key, displayName: account.displayName, balance: account.balance }))
    .sort((a, b) => b.balance - a.balance || a.displayName.localeCompare(b.displayName))
    .slice(0, Math.max(0, count));
}

const finiteCount = (value: unknown): number | null => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;

/** A stored or imported ledger; anything malformed reads as null so a broken file never replaces the balances. */
export function decodeBetLedger(value: unknown): BetLedger | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const matches = finiteCount(data.matches);
  if (matches === null || !data.accounts || typeof data.accounts !== "object" || Array.isArray(data.accounts)
    || !data.fighters || typeof data.fighters !== "object" || Array.isArray(data.fighters)) return null;
  const accounts: Record<string, BetAccount> = {};
  for (const [key, raw] of Object.entries(data.accounts as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object" || key.length > 160) return null;
    const account = raw as Record<string, unknown>;
    const balance = finiteCount(account.balance), updatedAt = finiteCount(account.updatedAt);
    if (balance === null || updatedAt === null || typeof account.displayName !== "string" || account.displayName.length > 64) return null;
    accounts[key] = { displayName: account.displayName, balance, updatedAt };
  }
  const fighters: Record<string, FighterRecord> = {};
  for (const [id, raw] of Object.entries(data.fighters as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object" || id.length > 100) return null;
    const record = raw as Record<string, unknown>;
    const wins = finiteCount(record.wins), losses = finiteCount(record.losses);
    if (wins === null || losses === null) return null;
    fighters[id] = { wins, losses };
  }
  return { accounts, fighters, matches };
}
