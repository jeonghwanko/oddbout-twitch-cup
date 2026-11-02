import { GAME_FLOW, type ArenaSceneData, type GameRoute } from "../../../app/GameFlow";

/** How the arena's one bout ended, as the record keeps it and where the player goes next (`arenaExitRoute`). */
export interface ArenaBoutResult {
  readonly won: boolean;
  readonly how: "ko" | "forfeit";
  /**
   * The KO cut-in's button taken (a KO, won or lost — `ArenaScene.koEnding`, 2026-10-23; before it the defeat card's): `retry` is its first
   * ("대진표로" in the tournament, "다시 하기" in a practice bout), `leave` its second ("마을로" / "캐릭터 고르기로"); null for a forfeit or a
   * win handed over without the cut-in.
   */
  readonly choice: "retry" | "leave" | null;
}

/** The opponent of this bout (the bracket's next fighter, or the practice bout's draw). */
export function arenaOpponentId(data: ArenaSceneData): string {
  return data.mode === "tournament" ? data.entry.opponentId : data.opponentId;
}

/**
 * Where the arena goes after its bout (2026-10-19). `result` null: it left unfought (a stale entry, an opponent who never came up, the
 * pause menu's way out).
 * - Tournament from the board: back to the board; the bracket opens again unless the defeat card chose "마을로".
 * - Tournament from the select screen (fighter.html's weekly tournament): back to the select screen's tournament side; the bracket opens
 *   again unless the defeat card chose "캐릭터 고르기로" or the bout was left unfought.
 * - Practice bout: "다시 하기" on the defeat card fights the same pair again (a rematch: no challenge talk, the short intro); anything else
 *   goes back to the character select, with the result to show there and the cursor on the character just played.
 */
export function arenaExitRoute(result: ArenaBoutResult | null, data: ArenaSceneData, prizeGold = 0): GameRoute {
  const control = data.autoPlay !== undefined ? { autoPlay: data.autoPlay } : {};
  if (data.mode === "tournament" && data.from === "select") {
    return GAME_FLOW.arenaSelectEntered({ ...(data.entry.player !== undefined ? { focus: data.entry.player } : {}),
      tournament: { bracket: result !== null && result.choice !== "leave", prizeGold } });
  }
  if (data.mode === "tournament") return GAME_FLOW.arenaLeft({ bracket: result?.choice !== "leave", prizeGold });
  if (result?.choice === "retry") return GAME_FLOW.arenaExhibition(data.player, data.opponentId, { rematch: true, ...control });
  return GAME_FLOW.arenaSelectEntered({ focus: data.player,
    ...(result ? { last: { player: data.player, opponentId: data.opponentId, won: result.won, how: result.how } } : {}) });
}

/**
 * Where the challenge talk's "그만두자" goes (2026-10-19): nothing fought or recorded. A tournament bout goes back to its bracket, open again
 * where it was entered (the board, or the select screen's tournament side — unlike a bout left unfought from the pause menu, which leaves
 * the tournament); a practice bout goes back to the character select.
 */
export function arenaDeclineRoute(data: ArenaSceneData): GameRoute {
  if (data.mode === "tournament" && data.from === "select") {
    return GAME_FLOW.arenaSelectEntered({ ...(data.entry.player !== undefined ? { focus: data.entry.player } : {}),
      tournament: { bracket: true, prizeGold: 0 } });
  }
  return arenaExitRoute(null, data);
}

/** What the fight looks like this frame (the arena reads it from its fight pieces). */
export interface ArenaBoutFrame {
  /** The opponent is still hostile (the fight is on). */
  readonly hostile: boolean;
  /** A webtoon overlay holds the fight (intro, victory page, defeat card). */
  readonly overlayHolds: boolean;

  readonly knockedDown: boolean;
  /** A swing, a stagger or the bow still holds his feet. */
  readonly locksMovement: boolean;
  /** The opponent is knocked out (his HP at 0 — from the KO until he gets up). */
  readonly foeDown: boolean;
}


export class ArenaBoutController {
  private result: ArenaBoutResult | null = null;
  private handed = false;

  constructor(private readonly opponentId: string) {}


  won(fighterId: string): void {
    if (fighterId === this.opponentId && !this.result) this.result = { won: true, how: "ko", choice: null };
  }

  /** The defeat card's choice (`retryLeaves`: its first option is `retry`, its second `leave`). */
  lost(choice: "retry" | "leave"): void {
    if (!this.result) this.result = { won: false, how: "ko", choice };
  }

  /** The pause menu's forfeit: a lost match. */
  forfeited(): void {
    if (!this.result) this.result = { won: false, how: "forfeit", choice: null };
  }

  /** The result is known (the fight may still be finishing). */
  get decided(): boolean { return this.result !== null; }


  step(frame: ArenaBoutFrame): ArenaBoutResult | null {
    // His HP at 0 is the KO (it comes back full only as he gets up from it, `recovered`): the win, bow or not.
    if (!this.result && frame.foeDown) this.result = { won: true, how: "ko", choice: null };
    if (this.handed || !this.result) return null;
    const free = !frame.overlayHolds && !frame.knockedDown && !frame.locksMovement;
    if (!free || (frame.hostile && this.result.how !== "forfeit")) return null;
    this.handed = true;
    return this.result;
  }
}

/** The bout's opening this frame: keep waiting, the bout can start, or give up (the opponent never came up). */
export type ArenaOpeningStep = "wait" | "start" | "abort";


export function arenaOpeningStep(input: { readonly foeReady: boolean; readonly sheetsReady: boolean; readonly waitedMs: number;
  readonly maxWaitMs: number }): ArenaOpeningStep {
  if (input.foeReady && input.sheetsReady) return "start";
  if (input.waitedMs < input.maxWaitMs) return "wait";
  return input.foeReady ? "start" : "abort";
}
