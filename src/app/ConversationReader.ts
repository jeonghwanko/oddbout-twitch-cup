/** Reader pacing shared by interactive dialogue and performed story beats. */
export interface ReaderBeat { readonly minMs: number; readonly durationMs?: number; readonly autoAdvance?: boolean; }
export interface ReaderState { readonly index: number; readonly elapsedMs: number; readonly complete: boolean; }
export const beginReader = (): ReaderState => ({ index: 0, elapsedMs: 0, complete: false });
export function readerReady(state: ReaderState, beats: readonly ReaderBeat[]): boolean {
  const beat = beats[state.index];
  return !state.complete && beat !== undefined && !beat.autoAdvance && state.elapsedMs >= beat.minMs;
}
export function stepReader(state: ReaderState, beats: readonly ReaderBeat[], dtMs: number, advance: boolean, focused = true): ReaderState {
  if (state.complete || !focused) return state;
  const beat = beats[state.index];
  if (!beat) return { ...state, complete: true };
  const elapsedMs = state.elapsedMs + Math.max(0, Math.min(Number.isFinite(dtMs) ? dtMs : 0, 100));
  const autoMs = beat.autoAdvance ? beat.minMs : beat.durationMs;
  // An early press is discarded, never carried across a line or a world handoff.
  if ((advance && readerReady(state, beats)) || (autoMs !== undefined && elapsedMs >= autoMs)) {
    return state.index + 1 < beats.length ? { index: state.index + 1, elapsedMs: 0, complete: false }
      : { ...state, elapsedMs, complete: true };
  }
  return { ...state, elapsedMs };
}
