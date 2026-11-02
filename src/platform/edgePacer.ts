/**
 * Paced Edge Function calls for a page that asks once per card (2026-11-02). The Supabase gateway turns a burst away with 429
 * `RATE_LIMIT_EXCEEDED` ("re-try the request in 1 seconds") — its CORS preflight too, which the browser reports as a network error
 * (`TypeError`), not as a status. Eight fighters' front cards and records sent at once lost most of them. A pacer keeps a few calls in
 * flight and retries the ones turned away; the API's own per-owner minute (`rate-limit`) gets the later, longer waits.
 */
export const EDGE_CONCURRENCY = 4;
export const EDGE_RETRY_MS: readonly number[] = [1_000, 3_000, 15_000, 40_000];

/**
 * `fetch` for an Edge call: a request that never got an answer is `edge-unreachable` and a 429 is `rate-limit`, so a pacer retries those
 * and nothing else (a bug's `TypeError`, such as an invalid URL in an answer, stays one and is not retried). An abort stays an abort.
 */
export async function edgeFetch(url: string, init: RequestInit): Promise<Response> {
  let response: Response;
  try { response = await fetch(url, init); } catch (error) { throw error instanceof TypeError ? new Error("edge-unreachable") : error; }
  if (response.status === 429) { void response.body?.cancel().catch(() => undefined); throw new Error("rate-limit"); }
  return response;
}

/** Turned away rather than answered: `rate-limit`, `edge-unreachable` (from `edgeFetch`) or a request that timed out. */
export const transientEdgeFailure = (error: unknown): boolean => (error instanceof DOMException && error.name === "TimeoutError")
  || (error instanceof Error && ["rate-limit", "edge-unreachable"].includes(error.message));

/** `alive` false: the page that asked has moved on, so a call still waiting is dropped (`stale`) instead of sent. */
export type EdgePacer = <T>(call: () => Promise<T>, alive?: () => boolean) => Promise<T>;
/** At most `limit` calls in flight, the rest in order; a transient failure frees its place, waits its turn's delay and goes again. */
export function edgePacer(limit = EDGE_CONCURRENCY, delays: readonly number[] = EDGE_RETRY_MS): EdgePacer {
  let running = 0;
  const waiting: (() => void)[] = [];
  const acquire = async (): Promise<void> => { if (running < limit) { running++; return; } await new Promise<void>(resolve => { waiting.push(resolve); }); };
  const release = (): void => { const next = waiting.shift(); if (next) next(); else running--; };
  return async <T>(call: () => Promise<T>, alive?: () => boolean): Promise<T> => {
    for (let retry = 0; ; retry++) {
      await acquire();
      try {
        if (alive && !alive()) throw new Error("stale");
        return await call();
      } catch (error) {
        const wait = delays[retry];
        if (!transientEdgeFailure(error) || wait === undefined) throw error;
      } finally { release(); }
      await new Promise<void>(resolve => { setTimeout(resolve, delays[retry]); });
    }
  };
}
