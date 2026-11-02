/**
 * A creator fighter's bout lines (contract `profile.lines`, 2026-10-27 — 전투 스타일 v2): his challenge before a bout, his win and his loss line
 * after it, each 1–40 characters. Display text only: the arena shows them in his bubble.
 */
export interface FighterLines { readonly challenge?: string; readonly win?: string; readonly lose?: string }

export const FIGHTER_LINE_KEYS = Object.freeze(["challenge", "win", "lose"] as const);

/** `profile.lines` from a server or manifest value; anything malformed is dropped (he then says nothing of his own). */
export function parseFighterLines(value: unknown): FighterLines | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const lines: { challenge?: string; win?: string; lose?: string } = {};
  for (const key of FIGHTER_LINE_KEYS) {
    const line = (value as Record<string, unknown>)[key];
    if (typeof line === "string" && line.trim() && line.length <= 40) lines[key] = line;
  }
  return Object.keys(lines).length > 0 ? lines : undefined;
}
