import { BroadcastCup, type BroadcastBout, type BroadcastBoutInput, type BroadcastCupHolds, type BroadcastCupInput, type BroadcastCupResult, type BroadcastCupStatus } from "./app/BroadcastCup";
import { createTwitchArenaBoutUrl, twitchBoutBootTimeoutMs, validateTwitchArenaBoutMessage, validateTwitchArenaHostReady, TWITCH_ARENA_BOUT_TIMEOUT_MS, type TwitchArenaBoutRequest } from "./app/TwitchArenaBout";
import { CITY_FIGHTER_IDS } from "./sim/cityFight/CityFighterIds";

export interface OddboutBroadcastApi {
  readonly protocolVersion: 1;
  runCup(input: BroadcastCupInput): Promise<BroadcastCupResult>;
  getStatus(): BroadcastCupStatus;
  cancel(): void;
}
declare global { interface Window { oddboutBroadcast: OddboutBroadcastApi } }

/** The Twitch cup's 3.5 s between matches (twitch.ts); the champion card gets a little longer before the runner closes the browser. */
export const BROADCAST_HOLDS: BroadcastCupHolds = Object.freeze({ betweenBoutsMs: 3500, afterFinalMs: 6000 });

/** Same-origin iframe boundary. No credential, ledger or Twitch login code. */
export function mountBroadcast(root: HTMLElement, holds: BroadcastCupHolds = BROADCAST_HOLDS): () => void {
  root.innerHTML = `<header><div class="brand">ODDBOUT <span>EXHIBITION SERIES</span></div><div class="live-label">AGENT DIRECTED · FOUR FIGHTERS</div></header>
    <section class="headline"><div><p class="eyebrow">THE ARENA IS READY</p><h1 id="broadcast-round">Awaiting the next cup</h1></div><p id="broadcast-status" role="status">Four fighters. Three battles. One champion.</p></section>
    <section id="broadcast-arena" aria-label="Live battle"><div class="waiting"><span>ODDBOUT</span><p>The next exhibition starts here</p></div></section>
    <section class="bracket" aria-label="Tournament bracket"><div><h2>SEMIFINAL 01</h2><p id="broadcast-semi1"></p></div><div><h2>SEMIFINAL 02</h2><p id="broadcast-semi2"></p></div><div class="final"><h2>THE FINAL</h2><p id="broadcast-final">Winners advance</p></div><div class="champion"><h2>CHAMPION</h2><p id="broadcast-champion">To be decided</p></div></section>`;
  const element = (id: string): HTMLElement => root.querySelector<HTMLElement>(`#broadcast-${id}`)!;
  const arena = element("arena");
  const label = (id: string): string => CITY_FIGHTER_IDS.includes(id) ? id.toUpperCase() : "CREATOR FIGHTER";
  let frame: HTMLIFrameElement | null = null;
  let hostReady = false;
  let hostDocument: Document | null = null;
  let disposed = false;
  let disposeBout: (() => void) | null = null;

  function render(state: BroadcastCupStatus): void {
    root.dataset.phase = state.status;
    const ids = state.fighterIds.length ? state.fighterIds : CITY_FIGHTER_IDS.slice(0, 4);
    element("semi1").textContent = `${label(ids[0]!)}  /  ${label(ids[1]!)}${state.bouts[0] ? `  →  ${label(state.bouts[0].winnerId)}` : ""}`;
    element("semi2").textContent = `${label(ids[2]!)}  /  ${label(ids[3]!)}${state.bouts[1] ? `  →  ${label(state.bouts[1].winnerId)}` : ""}`;
    element("final").textContent = state.bouts.length >= 2 ? `${label(state.bouts[0]!.winnerId)}  /  ${label(state.bouts[1]!.winnerId)}` : "Winners advance";
    element("champion").textContent = state.winnerId ? label(state.winnerId) : "To be decided";
    element("round").textContent = state.status === "completed" ? "Champion crowned" : state.status === "running" ? ["Semifinal 01", "Semifinal 02", "The final"][state.round]! : state.status === "idle" ? "Awaiting the next cup" : "Exhibition paused";
    element("status").textContent = state.status === "completed" ? `${label(state.winnerId!)} takes the cup` : state.status === "failed" ? "The battle could not be confirmed. Awaiting runner recovery." : state.status === "cancelled" ? "Exhibition cancelled" : state.status === "running" ? "Preparing the next battle…" : "Four fighters. Three battles. One champion.";
  }

  function runBout(input: BroadcastBoutInput, signal: AbortSignal): Promise<BroadcastBout> {
    if (disposed || signal.aborted) return Promise.reject(new Error("broadcast_cancelled"));
    const request: TwitchArenaBoutRequest = { boutId: crypto.randomUUID(), a: input.leftId, b: input.rightId, seed: input.seed };
    let fresh = false;
    if (!frame) {
      frame = document.createElement("iframe"); frame.allow = "autoplay; fullscreen";
      frame.title = "ODDBOUT exhibition battle"; arena.replaceChildren(frame); hostReady = false; hostDocument = null; fresh = true;
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
          element("status").textContent = `${label(input.leftId)}  VS  ${label(input.rightId)}`; return;
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

  const cup = new BroadcastCup(runBout, render, holds);
  const api: OddboutBroadcastApi = Object.freeze({ protocolVersion: 1 as const,
    runCup: (input: BroadcastCupInput) => disposed ? Promise.reject(new Error("broadcast_page_disposed")) : cup.runCup(input),
    getStatus: () => cup.getStatus(), cancel: () => { cup.cancel(); disposeBout?.(); frame?.remove(); frame = null; hostReady = false; },
  });
  window.oddboutBroadcast = api;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true; api.cancel(); window.removeEventListener("pagehide", dispose); window.removeEventListener("beforeunload", dispose);
  };
  window.addEventListener("pagehide", dispose); window.addEventListener("beforeunload", dispose);
  render(cup.getStatus());
  return dispose;
}

const root = document.getElementById("broadcast-cup");
if (root) mountBroadcast(root);
