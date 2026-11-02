import type { ArenaCupBoutKey } from "../sim/tournament/ArenaCupRules";
import type { CityTournamentEntry } from "./CityTournamentProgress";
import type { ServerDuelMatch } from "./RankedDuel";
import type { CityFightBoutResult } from "../sim/cityFight/bout/CityFightFighterBout";
/**
 * The arena's AI duel (`ArenaDuelScene`): two registered fighters (the server's ranked match, `serverMatch`) or (2026-10-20) two village
 * fighters by actor id (a local exhibition, nothing recorded).
 */
export interface ArenaDuelData {
  readonly a: string;
  readonly b: string;
  readonly matchId: string;
  readonly seed: number;
  readonly serverMatch?: ServerDuelMatch;
  /** Embedded local broadcast: authoritative engine callbacks, no results relay, records or rewards. */
  readonly broadcast?: {
    readonly onReady: () => void;
    readonly onResult: (result: CityFightBoutResult) => void;
    readonly onError: (message: string) => void;
  };

  readonly player?: { readonly autoPlay: boolean };
  /** The played bout is the player's weekly-tournament match (`arenaTournamentRoute`): its result goes to the bracket. Absent: practice. */
  readonly tournament?: { readonly entry: CityTournamentEntry; readonly from: "board" | "select" };

  readonly cup?: { readonly key: ArenaCupBoutKey; readonly representative: string;
    /**
     * A decided bout watched again (관전 — after the representative went out, 2026-10-25; the final first, 6단계): the same seed and corners,
     * nothing recorded; back on the bracket it is revealed.
     */
    readonly watch?: true };

  readonly replay?: { readonly cupId: string; readonly round: number; readonly slot: number; readonly digest: string | null; readonly startMs: number };
  /** The bout replays a shared link (`ArenaBoutShare`): the rules version it was fought under and its result digest (null: the link did not say). */
  readonly shared?: { readonly rules: number | null; readonly digest?: string | null };
}

/**
 * A person's hands may take corner `a` (`ArenaDuelControl`, the F8 switch, his key chips): only in the story's weekly bout entered from the
 * village board. Every bout entered from the arena's select screen — practice, fighter.html's weekly tournament — is the AI's on both
 * corners (2026-10-22 사용자 결정 — 무투장은 항상 AI 자동 대결, 직접 조종 없음); the engine and the record are the same either way.
 */
export function arenaDuelPersonPlays(data: Pick<ArenaDuelData, "player" | "tournament">): boolean {
  return data.player !== undefined && data.tournament?.from === "board";
}
