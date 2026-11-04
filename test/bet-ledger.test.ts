// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { applyBetSettlement, betBalance, betLeaders, decodeBetLedger, EMPTY_BET_LEDGER, fighterRecord } from "../src/app/BetLedger";
import { createBetRound, lockBetRound, placeBet, settleBetRound, voidBetRound } from "../src/app/BetRound";
import { betLedgerStore, exportBetLedger, importBetLedger } from "../src/platform/betLedgerStorage";
import { STORAGE_KEYS } from "../src/platform/storageKeys";

const bettor = (name: string, balance = 1000) => ({ key: `twitch-user-id:${name}`, displayName: name, balance });
function settled(stakes: [string, "red" | "blue", number, number?][], winner: "red" | "blue") {
  let round = createBetRound("kuma", "yume");
  for (const [name, side, stake, balance] of stakes) round = placeBet(round, bettor(name, balance), side, stake).round;
  return settleBetRound(lockBetRound(round), winner);
}

afterEach(() => localStorage.clear());

describe("bet ledger rules", () => {
  it("starts newcomers at 1,000 and applies a settlement once per round", () => {
    expect(betBalance(EMPTY_BET_LEDGER, "twitch-user-id:a")).toBe(1000);
    const ledger = applyBetSettlement(EMPTY_BET_LEDGER, settled([["a", "red", 400], ["b", "blue", 200]], "red"), 5);
    expect(ledger.accounts).toEqual({ "twitch-user-id:a": { displayName: "a", balance: 1200, updatedAt: 5 }, "twitch-user-id:b": { displayName: "b", balance: 800, updatedAt: 5 } });
    expect(fighterRecord(ledger, "kuma")).toEqual({ wins: 1, losses: 0 });
    expect(fighterRecord(ledger, "yume")).toEqual({ wins: 0, losses: 1 });
    expect(ledger.matches).toBe(1);
  });

  it("raises a balance that falls below the bailout", () => {
    const ledger = applyBetSettlement(EMPTY_BET_LEDGER, settled([["a", "red", 1000], ["b", "blue", 50]], "blue"), 1);
    expect(betBalance(ledger, "twitch-user-id:a")).toBe(100);
    expect(betBalance(ledger, "twitch-user-id:b")).toBe(2000);
  });

  it("ignores rounds that did not settle", () => {
    const open = placeBet(createBetRound("kuma", "yume"), bettor("a"), "red", 100).round;
    expect(applyBetSettlement(EMPTY_BET_LEDGER, open, 1)).toBe(EMPTY_BET_LEDGER);
    expect(applyBetSettlement(EMPTY_BET_LEDGER, voidBetRound(open), 1)).toBe(EMPTY_BET_LEDGER);
  });

  it("ranks the richest viewers first", () => {
    const ledger = applyBetSettlement(EMPTY_BET_LEDGER, settled([["a", "red", 100], ["b", "blue", 300], ["c", "blue", 300]], "red"), 1);
    expect(betLeaders(ledger, 2).map(row => [row.displayName, row.balance])).toEqual([["a", 1600], ["b", 700]]);
  });

  it("decodes only complete ledgers", () => {
    expect(decodeBetLedger({ accounts: {}, fighters: {}, matches: 0 })).toEqual(EMPTY_BET_LEDGER);
    for (const broken of [null, [], { accounts: {}, fighters: {} }, { accounts: [], fighters: {}, matches: 0 },
      { accounts: { a: { displayName: "a", balance: -1, updatedAt: 0 } }, fighters: {}, matches: 0 },
      { accounts: { a: { displayName: "a", balance: 1.5, updatedAt: 0 } }, fighters: {}, matches: 0 },
      { accounts: {}, fighters: { kuma: { wins: "1", losses: 0 } }, matches: 0 }]) expect(decodeBetLedger(broken)).toBeNull();
  });
});

describe("bet ledger storage", () => {
  it("saves and reloads the live ledger under its own key, apart from the demo", () => {
    const ledger = applyBetSettlement(EMPTY_BET_LEDGER, settled([["a", "red", 400], ["b", "blue", 200]], "red"), 5);
    expect(betLedgerStore("live").save(ledger)).toBe(true);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.betLedger)!)).toMatchObject({ version: 1, matches: 1 });
    expect(betLedgerStore("live").load()).toEqual(ledger);
    expect(betLedgerStore("demo").load()).toEqual(EMPTY_BET_LEDGER);
    expect(localStorage.getItem(STORAGE_KEYS.betLedgerDemo)).toBeNull();
  });

  it("reads broken text as an empty ledger and never overwrites a newer page's save", () => {
    localStorage.setItem(STORAGE_KEYS.betLedger, "{not json");
    expect(betLedgerStore("live").load()).toEqual(EMPTY_BET_LEDGER);
    localStorage.setItem(STORAGE_KEYS.betLedger, JSON.stringify({ version: 2, accounts: {}, fighters: {}, matches: 9 }));
    const store = betLedgerStore("live");
    expect(store.sessionOnly()).toBe(true);
    expect(store.save(EMPTY_BET_LEDGER)).toBe(false);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.betLedger)!).version).toBe(2);
  });

  it("exports a backup that imports back, and rejects anything else", () => {
    const ledger = applyBetSettlement(EMPTY_BET_LEDGER, settled([["a", "red", 400], ["b", "blue", 200]], "red"), 5);
    const text = exportBetLedger(ledger);
    expect(JSON.parse(text)).toMatchObject({ format: "oddbout-bet-ledger", version: 1 });
    expect(importBetLedger(text)).toEqual(ledger);
    expect(importBetLedger("{")).toBeNull();
    expect(importBetLedger(JSON.stringify({ version: 1, accounts: {}, fighters: {}, matches: 0 }))).toBeNull();
    expect(importBetLedger(JSON.stringify({ ...JSON.parse(text), version: 2 }))).toBeNull();
  });
});
