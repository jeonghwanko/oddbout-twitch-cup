/** Shared hit-reaction clock; no actor art, body dimensions, renderer or wall clock. */
export type DuelHitReactionStage = "contact" | "brace" | "flight" | "land" | "recover";

export interface DuelHitReactionTiming {
  readonly contactMs: number;
  readonly braceMs: number;
  readonly landMs: number;
  readonly recoverMs: number;
}

export interface DuelHitReactionKnock {
  readonly elapsedMs: number;
  readonly holdMs?: number;
  readonly flightMs?: number;
}

export interface DuelHitReaction {
  readonly stage: DuelHitReactionStage;
  /** Time within this stage. The flight stage copies the rule-owned knock clock. */
  readonly elapsedMs: number;
  readonly flightMs: number;
  readonly launching: boolean;
}

export interface DuelHitReactionFrame {
  readonly stage: DuelHitReactionStage;
  readonly progress: number;
  readonly airborne: boolean;
}

export function startDuelHitReaction(launching = false): DuelHitReaction {
  return Object.freeze({ stage: "contact", elapsedMs: 0, flightMs: 0, launching });
}

export function duelHitReactionPrepareMs(timing: DuelHitReactionTiming): number {
  return Math.max(0, timing.contactMs) + Math.max(0, timing.braceMs);
}

/** Call after stepping the body's knock. `landed` is that same step's one-shot landing event. */
export function stepDuelHitReaction(state: DuelHitReaction | null | undefined, timing: DuelHitReactionTiming,
  fightDtMs: number, knock: DuelHitReactionKnock | null | undefined, landed = false): DuelHitReaction | null {
  if (!state) return null;
  // The explicit event wins even if a wall ended a flight early.
  if (landed && state.launching) return Object.freeze({ ...state, stage: "land", elapsedMs: 0 });
  if (!(fightDtMs > 0)) return state;
  if (state.stage === "land" || state.stage === "recover") {
    const elapsed = state.elapsedMs + fightDtMs;
    if (state.stage === "land") {
      if (elapsed < timing.landMs) return Object.freeze({ ...state, elapsedMs: elapsed });
      const recovery = elapsed - Math.max(0, timing.landMs);
      return recovery >= timing.recoverMs ? null : Object.freeze({ ...state, stage: "recover", elapsedMs: recovery });
    }
    return elapsed >= timing.recoverMs ? null : Object.freeze({ ...state, elapsedMs: elapsed });
  }
  if (state.launching) {
    // Never run a second flight timer. Hold/flight are the body's exact clocks, including shared hit stop.
    if (!knock || !(knock.flightMs !== undefined && knock.flightMs > 0)) return null;
    const held = Math.max(0, knock.holdMs ?? 0);
    if (held > 0) {
      const prepared = Math.max(0, duelHitReactionPrepareMs(timing) - held);
      return Object.freeze({ ...state, stage: prepared < timing.contactMs ? "contact" : "brace",
        elapsedMs: prepared < timing.contactMs ? prepared : prepared - Math.max(0, timing.contactMs), flightMs: knock.flightMs });
    }
    return Object.freeze({ ...state, stage: "flight", elapsedMs: Math.max(0, knock.elapsedMs), flightMs: knock.flightMs });
  }
  // A scoring jab is only a short contact/brace. It has no invented launch or landing sequence.
  const elapsed = (state.stage === "brace" ? Math.max(0, timing.contactMs) : 0) + state.elapsedMs + fightDtMs;
  if (elapsed >= duelHitReactionPrepareMs(timing)) return null;
  return Object.freeze({ ...state, stage: elapsed < timing.contactMs ? "contact" : "brace",
    elapsedMs: elapsed < timing.contactMs ? elapsed : elapsed - Math.max(0, timing.contactMs) });
}

/** Actor-neutral pose selection metadata; authored sheets choose their cells from this. */
export function duelHitReactionFrame(state: DuelHitReaction, timing: DuelHitReactionTiming): DuelHitReactionFrame {
  const duration = state.stage === "contact" ? timing.contactMs : state.stage === "brace" ? timing.braceMs
    : state.stage === "flight" ? state.flightMs : state.stage === "land" ? timing.landMs : timing.recoverMs;
  return { stage: state.stage, progress: Math.max(0, Math.min(1, duration > 0 ? state.elapsedMs / duration : 1)),
    airborne: state.stage === "flight" && state.elapsedMs > 0 && state.elapsedMs < state.flightMs };
}
