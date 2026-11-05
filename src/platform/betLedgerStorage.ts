import { decodeBetLedger, EMPTY_BET_LEDGER, type BetLedger } from "../app/BetLedger";
import { parseJsonOr, sessionBackedStore, type SessionBackedStore, type StoredRecord } from "./sessionBackedStore";
import { STORAGE_KEYS } from "./storageKeys";

const VERSION = 1;
const EXPORT_FORMAT = "oddbout-bet-ledger";

const record = (key: string): StoredRecord<BetLedger> => ({
  key, version: VERSION, migrations: {},
  parse: raw => parseJsonOr(raw, EMPTY_BET_LEDGER, value => decodeBetLedger(value) ?? EMPTY_BET_LEDGER),
  serialize: ledger => JSON.stringify({ version: VERSION, accounts: ledger.accounts, fighters: ledger.fighters, matches: ledger.matches }),
});

/** The broadcaster's real viewers' points, or the local demo's own (never mixed). */
export function betLedgerStore(mode: "live" | "demo"): SessionBackedStore<BetLedger> {
  return sessionBackedStore(record(mode === "live" ? STORAGE_KEYS.betLedger : STORAGE_KEYS.betLedgerDemo));
}

/** A backup file's text. */
export function exportBetLedger(ledger: BetLedger): string {
  return JSON.stringify({ format: EXPORT_FORMAT, version: VERSION, exportedAt: new Date().toISOString(),
    accounts: ledger.accounts, fighters: ledger.fighters, matches: ledger.matches }, null, 2);
}

/** A backup file read back; null for anything that is not a complete version-1 ledger export. */
export function importBetLedger(text: string): BetLedger | null {
  let value: unknown;
  try { value = JSON.parse(text); } catch { return null; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  return data.format === EXPORT_FORMAT && data.version === VERSION ? decodeBetLedger(data) : null;
}
