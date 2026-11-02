export const PROFILE_BACKGROUNDS = ["ink", "paper", "teal", "burgundy"] as const;
export const PROFILE_BORDERS = ["paper", "gold", "teal"] as const;
export interface PlayerProfileSettings {
  readonly background: (typeof PROFILE_BACKGROUNDS)[number];
  readonly border: (typeof PROFILE_BORDERS)[number];
  /** Registered portrait identity only. This does not change gameplay character or equipment. */
  readonly portraitId: string;
}
export const DEFAULT_PLAYER_PROFILE: PlayerProfileSettings = Object.freeze({ background: "ink", border: "paper", portraitId: "current" });
export function sanitizePlayerProfile(value: unknown): PlayerProfileSettings {
  if (!value || typeof value !== "object") return DEFAULT_PLAYER_PROFILE;
  const input = value as Record<string, unknown>;
  return Object.freeze({
    background: PROFILE_BACKGROUNDS.includes(input["background"] as PlayerProfileSettings["background"]) ? input["background"] as PlayerProfileSettings["background"] : DEFAULT_PLAYER_PROFILE.background,
    border: PROFILE_BORDERS.includes(input["border"] as PlayerProfileSettings["border"]) ? input["border"] as PlayerProfileSettings["border"] : DEFAULT_PLAYER_PROFILE.border,
    portraitId: typeof input["portraitId"] === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(input["portraitId"]) ? input["portraitId"] : "current",
  });
}
