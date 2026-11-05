/**
 * One bet booth round: two corners, a betting window, then a locked pool settled by the bout's winner (parimutuel). Points have no cash value:
 * they are never bought, cashed out or exchanged. Balances change only at settlement, so a round that never settles (a reload, a failed
 * bout) costs nobody anything.
 */
export type BetSide = "red" | "blue";
export type BettorIdentity = { readonly kind: "twitch-user-id" | "twitch-login" | "local-demo"; readonly value: string };

export const BET_RULES = Object.freeze({
  /** A viewer's first balance. */
  startingBalance: 1000,
  /** Settlement never leaves a balance below this. */
  bailout: 100,
});

export interface Bet { readonly key: string; readonly displayName: string; readonly side: BetSide; readonly amount: number }
export interface Payout extends Bet {
  /** The balance change: the profit for a winning bet, minus the stake for a losing one, 0 when the round was one-sided. */
  readonly delta: number;
}
export interface BetRound {
  readonly redId: string;
  readonly blueId: string;
  readonly status: "open" | "locked" | "settled" | "void";
  /** In order of arrival; a replaced bet keeps its place. */
  readonly bets: readonly Bet[];
  readonly winner: BetSide | null;
  readonly payouts: readonly Payout[];
}
export interface BetPools { readonly red: number; readonly blue: number; readonly redCount: number; readonly blueCount: number }

export type BetAmount = { readonly kind: "fixed"; readonly value: number } | { readonly kind: "all" } | { readonly kind: "percent"; readonly value: number };
export type BetRejection = "closed" | "invalid-amount" | "insufficient";
export type PlaceResult = { readonly round: BetRound; readonly accepted: true; readonly bet: Bet; readonly replaced: boolean }
  | { readonly round: BetRound; readonly accepted: false; readonly reason: BetRejection };

/** The ledger's key for a viewer. A Twitch user id outlives a renamed login. */
export function bettorKey(identity: BettorIdentity): string { return `${identity.kind}:${identity.value.trim().toLowerCase()}`; }

export function createBetRound(redId: string, blueId: string): BetRound {
  if (!redId || !blueId || redId === blueId) throw new Error("A bet round needs two different fighters.");
  return { redId, blueId, status: "open", bets: [], winner: null, payouts: [] };
}

/** `!bet <side> <amount>`: the whole message is the command. Side is resolved against the round's corners by `betSideFor`. */
export function parseBetCommand(text: string): { readonly target: string; readonly amount: BetAmount } | null {
  const match = /^!bet\s+([a-zA-Z0-9_-]{1,64})\s+(\S{1,16})\s*$/i.exec(text.trim());
  if (!match) return null;
  const amount = parseBetAmount(match[2]!);
  return amount ? { target: match[1]!.toLowerCase(), amount } : null;
}

/** `500`, `10k`, `2m`, `25%`, `all` (or `allin`, `max`). */
export function parseBetAmount(text: string): BetAmount | null {
  const value = text.toLowerCase();
  if (value === "all" || value === "allin" || value === "max") return { kind: "all" };
  const percent = /^(\d{1,3})%$/.exec(value);
  if (percent) { const n = Number(percent[1]); return n >= 1 && n <= 100 ? { kind: "percent", value: n } : null; }
  const fixed = /^(\d{1,12})([km])?$/.exec(value);
  if (!fixed) return null;
  const n = Number(fixed[1]) * (fixed[2] === "k" ? 1_000 : fixed[2] === "m" ? 1_000_000 : 1);
  return Number.isSafeInteger(n) && n >= 1 ? { kind: "fixed", value: n } : null;
}

/** `!balance` / `!bal`, alone in the message. */
export function parseBalanceCommand(text: string): boolean { return /^!bal(?:ance)?\s*$/i.test(text.trim()); }

const commandKey = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]/g, "");

/** red / r / left, blue / b / right, or either corner's roster command. */
export function betSideFor(target: string, commands: { readonly red: string; readonly blue: string }): BetSide | null {
  const key = commandKey(target);
  if (key === "red" || key === "r" || key === "left") return "red";
  if (key === "blue" || key === "b" || key === "right") return "blue";
  if (key && key === commandKey(commands.red)) return "red";
  if (key && key === commandKey(commands.blue)) return "blue";
  return null;
}

/** The stake a parsed amount names against a balance; 0 when it names nothing. */
export function betStake(amount: BetAmount, balance: number): number {
  if (amount.kind === "fixed") return amount.value;
  if (amount.kind === "all") return Math.max(0, Math.floor(balance));
  return Math.max(1, Math.floor(balance * amount.value / 100));
}

/** One bet per viewer per round; a new bet while the round is open replaces the old one. The balance is the viewer's settled balance. */
export function placeBet(round: BetRound, bettor: { readonly key: string; readonly displayName: string; readonly balance: number },
  side: BetSide, stake: number): PlaceResult {
  if (round.status !== "open") return { round, accepted: false, reason: "closed" };
  if (!Number.isSafeInteger(stake) || stake < 1) return { round, accepted: false, reason: "invalid-amount" };
  if (stake > bettor.balance) return { round, accepted: false, reason: "insufficient" };
  const bet: Bet = { key: bettor.key, displayName: bettor.displayName, side, amount: stake };
  const index = round.bets.findIndex(existing => existing.key === bettor.key);
  const bets = index < 0 ? [...round.bets, bet] : round.bets.map((existing, i) => i === index ? bet : existing);
  return { round: { ...round, bets }, accepted: true, bet, replaced: index >= 0 };
}

export function lockBetRound(round: BetRound): BetRound { return round.status === "open" ? { ...round, status: "locked" } : round; }

export function voidBetRound(round: BetRound): BetRound {
  return round.status === "open" || round.status === "locked" ? { ...round, status: "void", payouts: [] } : round;
}

export function betPools(round: BetRound): BetPools {
  let red = 0, blue = 0, redCount = 0, blueCount = 0;
  for (const bet of round.bets) if (bet.side === "red") { red += bet.amount; redCount++; } else { blue += bet.amount; blueCount++; }
  return { red, blue, redCount, blueCount };
}

/** `1 : 3.7` (red first, the smaller pool as 1); an empty side shows a dash. */
export function betOddsLabel(pools: Pick<BetPools, "red" | "blue">): string {
  if (pools.red <= 0 || pools.blue <= 0) return "—";
  const ratio = (big: number, small: number): string => (Math.round(big / small * 10) / 10).toFixed(1).replace(/\.0$/, "");
  return pools.red <= pools.blue ? `1 : ${ratio(pools.blue, pools.red)}` : `${ratio(pools.red, pools.blue)} : 1`;
}

/**
 * Parimutuel settlement of a locked round. A winning bet earns `floor(stake × losing pool / winning pool)`; a losing bet loses its stake.
 * A one-sided round (no bets on the winner, or none against him) moves no points.
 */
export function settleBetRound(round: BetRound, winner: BetSide): BetRound {
  if (round.status !== "locked") return round;
  const pools = betPools(round);
  const winning = winner === "red" ? pools.red : pools.blue, losing = winner === "red" ? pools.blue : pools.red;
  const oneSided = winning === 0 || losing === 0;
  const payouts = round.bets.map(bet => ({ ...bet, delta: oneSided ? 0 : bet.side === winner ? Math.floor(bet.amount * losing / winning) : -bet.amount }));
  return { ...round, status: "settled", winner, payouts };
}
