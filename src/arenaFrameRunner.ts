import type { BroadcastBout, BroadcastBoutInput } from "./app/BroadcastCup";
import { createTwitchArenaBoutUrl, twitchBoutBootTimeoutMs, validateTwitchArenaBoutMessage, validateTwitchArenaHostReady, TWITCH_ARENA_BOUT_TIMEOUT_MS, type TwitchArenaBoutRequest } from "./app/TwitchArenaBout";

export interface ArenaFrameRunner {
  /** One bout in the same-origin battle host; resolves only with a validated result, rejects on error, timeout, abort or a replaced document. */
  runBout(input: BroadcastBoutInput, signal: AbortSignal): Promise<BroadcastBout>;
  /** Fails the bout in flight and removes the battle frame; the next bout starts a fresh host. */
  reset(): void;
  /** Every later bout rejects. */
  dispose(): void;
}
export interface ArenaFrameRunnerOptions {
  readonly title: string;
  /** The host loaded both fighters and the battle is starting (not a result). */
  readonly onBoutReady?: (input: BroadcastBoutInput) => void;
}

/**
 * The broadcast pages' battle host inside `container`: one iframe hosts consecutive bouts. Only messages from its own origin and window, with
 * the bout's token, pairing and seed, move a bout on; readiness is never a win. No credential, ledger or Twitch login code.
 */
export function createArenaFrameRunner(container: HTMLElement, options: ArenaFrameRunnerOptions): ArenaFrameRunner {
  let frame: HTMLIFrameElement | null = null;
  let hostReady = false;
  let hostDocument: Document | null = null;
  let disposed = false;
  let disposeBout: (() => void) | null = null;

  function runBout(input: BroadcastBoutInput, signal: AbortSignal): Promise<BroadcastBout> {
    if (disposed || signal.aborted) return Promise.reject(new Error("broadcast_cancelled"));
    const request: TwitchArenaBoutRequest = { boutId: crypto.randomUUID(), a: input.leftId, b: input.rightId, seed: input.seed };
    let fresh = false;
    if (!frame) {
      frame = document.createElement("iframe"); frame.allow = "autoplay; fullscreen";
      frame.title = options.title; container.replaceChildren(frame); hostReady = false; hostDocument = null; fresh = true;
    }
    const mounted = frame;
    return new Promise((resolve, reject) => {
      let settled = false; let boutReady = false; let started = false;
      let watchdog: ReturnType<typeof setTimeout>;
      const cleanup = (): void => {
        clearTimeout(watchdog);
        window.removeEventListener("message", receive); mounted.removeEventListener("load", loaded); signal.removeEventListener("abort", abort);
        if (disposeBout === abort) disposeBout = null;
      };
      const fail = (): void => { if (!settled) { settled = true; cleanup(); mounted.remove(); if (frame === mounted) { frame = null; hostReady = false; } reject(new Error("broadcast_bout_unconfirmed")); } };
      const abort = (): void => fail();
      const loaded = (): void => {
        // A new document resets the host's consumed-token gate. Never replay an
        // in-flight logical bout after iframe reload/navigation.
        if (hostDocument && hostDocument !== mounted.contentDocument) fail();
      };
      const start = (): void => {
        if (!hostDocument || hostDocument !== mounted.contentDocument) { fail(); return; }
        started = true; mounted.contentWindow?.postMessage({ ...request, type: "oddbout:twitch:start-bout" }, location.origin);
      };
      const receive = (event: MessageEvent): void => {
        if (settled || disposed || signal.aborted || frame !== mounted) return;
        if (validateTwitchArenaHostReady(event, location.origin, mounted.contentWindow)) {
          const currentDocument = mounted.contentDocument;
          if (!currentDocument || (hostDocument && hostDocument !== currentDocument)) { fail(); return; }
          hostDocument = currentDocument; hostReady = true; start(); return;
        }
        const message = validateTwitchArenaBoutMessage(event, location.origin, mounted.contentWindow, request);
        if (!message) return;
        if (message.type === "oddbout:twitch:bout-error") { fail(); return; }
        if (!started) return;
        if (message.type === "oddbout:twitch:bout-ready") {
          if (boutReady) return;
          boutReady = true; clearTimeout(watchdog); watchdog = setTimeout(fail, TWITCH_ARENA_BOUT_TIMEOUT_MS);
          options.onBoutReady?.(input); return;
        }
        if (!boutReady) return;
        settled = true; cleanup();
        resolve({ ...input, ...message.result, winnerId: message.winnerId });
      };
      disposeBout = abort;
      window.addEventListener("message", receive); signal.addEventListener("abort", abort, { once: true });
      mounted.addEventListener("load", loaded);
      watchdog = setTimeout(fail, twitchBoutBootTimeoutMs(request));
      if (fresh || !hostReady) mounted.src = createTwitchArenaBoutUrl(location.href, request, "en"); else start();
    });
  }

  const reset = (): void => { disposeBout?.(); frame?.remove(); frame = null; hostReady = false; };
  return { runBout, reset, dispose: () => { disposed = true; reset(); } };
}
