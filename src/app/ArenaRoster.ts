import { CITY_FIGHTER_IDS } from "../sim/cityFight/CityFighterIds";
import type { FighterNames } from "../platform/fighterNames";



export type ArenaPlayerId = string;

export type ArenaPlayable =
  | { readonly id: string; readonly kind: "fighter"; readonly fighterId: string }
  | RegisteredArenaPlayable;

/** Server-approved side-view player skin. It never adds an AI rules entry to CITY_FIGHTERS. */
export interface RegisteredArenaPlayable {
  readonly id: string;
  readonly kind: "registered";
  readonly name: string;
  /** His name per page language (`profile.names`); `name` where his language has none. */
  readonly names?: FighterNames;
  readonly manifestSha256: string;
  readonly duelApproved?: boolean;
}

let registered: readonly RegisteredArenaPlayable[] = [];
export function setRegisteredArenaRoster(entries: readonly RegisteredArenaPlayable[]): void {
  const unique = new Map(entries.filter(entry => !ARENA_PLAYABLE.some(local => local.id === entry.id)).map(entry => [entry.id, Object.freeze({ ...entry })]));
  registered = Object.freeze([...unique.values()]);
}
/** Adds (or replaces by id) `entries`, keeping the rest — a cup's own fighters land before the roster (`loadRegisteredCupFighters`). */
export function addRegisteredArenaFighters(entries: readonly RegisteredArenaPlayable[]): void {
  setRegisteredArenaRoster([...registered.filter(entry => !entries.some(added => added.id === entry.id)), ...entries]);
}
export function arenaPlayables(): readonly ArenaPlayable[] { return [...ARENA_PLAYABLE, ...registered]; }

/** A separate symmetric AI duel admits only reviewed registered fighters, with no self match. */
export function arenaDuelOpponents(player: string): readonly RegisteredArenaPlayable[] {
  const picked = arenaPlayable(player);
  return picked?.kind === "registered" && picked.duelApproved === true ? registered.filter(f => f.id !== player && f.duelApproved === true) : [];
}

export const ARENA_PLAYABLE: readonly ArenaPlayable[] = Object.freeze([
  ...CITY_FIGHTER_IDS.map(id => Object.freeze({ id, kind: "fighter", fighterId: id } as const)),
]);

/** The playable `id`, or null for an unknown one. */
export function arenaPlayable(id: string): ArenaPlayable | null {
  return arenaPlayables().find(playable => playable.id === id) ?? null;
}

/** The fighters `player` can meet: every village fighter but himself. */
export function arenaExhibitionOpponents(player: string): readonly string[] {
  return CITY_FIGHTER_IDS.filter(id => id !== player);
}

/** One of `arenaExhibitionOpponents(player)` for `roll` in [0, 1) (the caller rolls — the scene's random draw, a test's fixed value). */
export function arenaExhibitionOpponent(player: string, roll: number): string {
  const pool = arenaExhibitionOpponents(player);
  return pool[Math.min(pool.length - 1, Math.max(0, Math.floor(roll * pool.length)))]!;
}
