import { cityTournamentBoutResolver, type CityTournamentArt } from "../../../app/CityTournamentBouts";
import { CITY_TOURNAMENT, recordPlayerBout, type CityTournamentEntry } from "../../../app/CityTournamentProgress";
import { recordBout } from "../../../platform/boutRecordStorage";
import { loadCityTournamentArt } from "../../art/CityFighterPacks";

/** The player's weekly-tournament bout as the arena saw it: his corner, the opponent's, and how it ended. */
export interface ArenaTournamentBout {
  readonly player: string;
  readonly opponent: string;
  readonly won: boolean;
  readonly how: "ko" | "decision" | "forfeit";
}

/**
 * The player's weekly-tournament result saved (2026-10-25: the arena and the duel screen each wrote this): into the bracket — only if it still
 * waits on this very entry (`recordPlayerBout` with the whole entry as the key), the round's other matches fought headless on the fighters'
 * packs at `actorHeightPx` (packs that never came judge them on ratings) — and into the guest's record, as the week's bout, or as a practice
 * bout when the bracket no longer waited on it. Resolves to the prize it paid; a failure to store it never holds the arena (0).
 */
export async function recordArenaTournamentBout(bout: ArenaTournamentBout, entry: CityTournamentEntry, actorHeightPx: number,
  logTag: string): Promise<number> {
  const art = await loadCityTournamentArt(actorHeightPx).catch((): CityTournamentArt => () => null);
  try {
    const outcome = recordPlayerBout(bout.won, bout.how, CITY_TOURNAMENT, cityTournamentBoutResolver(art), entry);
    const recorded = { at: Date.now(), ...bout };
    recordBout(outcome.recorded ? { ...recorded, mode: "tournament", weekId: entry.weekId } : { ...recorded, mode: "exhibition" });
    return outcome.gold;
  } catch (error) {
    console.error(`[${logTag}] the bout's result was not recorded`, error);
    return 0;
  }
}
