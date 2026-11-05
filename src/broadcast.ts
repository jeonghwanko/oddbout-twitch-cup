import { BroadcastCup, type BroadcastCupHolds, type BroadcastCupInput, type BroadcastCupResult, type BroadcastCupStatus } from "./app/BroadcastCup";
import { createArenaFrameRunner } from "./arenaFrameRunner";
import { CITY_FIGHTER_IDS } from "./sim/cityFight/CityFighterIds";
import "./broadcast.css";

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
  root.innerHTML = `<header><div class="brand"><img class="studio-logo" src="${import.meta.env.BASE_URL}art/ui/oddbout-logo.webp" width="376" height="76" alt="ODDBOUT Fight Club" /><span>Exhibition Series</span></div><div class="live-label" id="broadcast-signal">STANDING BY</div></header>
    <section class="headline"><div><p class="eyebrow">THE ARENA IS READY</p><h1 id="broadcast-round">Awaiting the next cup</h1></div><p id="broadcast-status" role="status">Four fighters. Three battles. One champion.</p></section>
    <section id="broadcast-arena" aria-label="Live battle"><div class="waiting"><p class="waiting-label">FOUR FIGHTERS. ONE SPOTLIGHT.</p><h2>The next round<br><em>is yours.</em></h2><div class="studio-faces" aria-hidden="true">${["kuma", "yume", "bravow", "beotim"].map(id => `<img src="${import.meta.env.BASE_URL}art/ui/oddbout-faces-v1/${id}.webp" width="104" height="104" alt="" />`).join("")}</div><p>The next exhibition starts here</p></div></section>
    <section class="bracket" aria-label="Tournament bracket"><div><h2>SEMIFINAL 01</h2><p id="broadcast-semi1"></p></div><div><h2>SEMIFINAL 02</h2><p id="broadcast-semi2"></p></div><div class="final"><h2>THE FINAL</h2><p id="broadcast-final">Winners advance</p></div><div class="champion"><h2>CHAMPION</h2><p id="broadcast-champion">To be decided</p></div></section>
    <footer><span>Good fights. Good company.</span><span>4 fighters <b>·</b> 3 bouts <b>·</b> 1 champion</span></footer>`;
  const element = (id: string): HTMLElement => root.querySelector<HTMLElement>(`#broadcast-${id}`)!;
  const arena = element("arena");
  const label = (id: string): string => CITY_FIGHTER_IDS.includes(id) ? id.toUpperCase() : "CREATOR FIGHTER";
  let disposed = false;
  const runner = createArenaFrameRunner(arena, { title: "ODDBOUT exhibition battle",
    onBoutReady: input => { element("status").textContent = `${label(input.leftId)}  VS  ${label(input.rightId)}`; } });

  function render(state: BroadcastCupStatus): void {
    root.dataset.phase = state.status;
    root.dataset.round = String(state.round);
    element("signal").textContent = state.status === "running" ? "CUP IN PROGRESS" : state.status === "completed" ? "CUP COMPLETE" : state.status === "idle" ? "STANDING BY" : "EXHIBITION PAUSED";
    const ids = state.fighterIds.length ? state.fighterIds : CITY_FIGHTER_IDS.slice(0, 4);
    element("semi1").textContent = `${label(ids[0]!)}  /  ${label(ids[1]!)}${state.bouts[0] ? `  →  ${label(state.bouts[0].winnerId)}` : ""}`;
    element("semi2").textContent = `${label(ids[2]!)}  /  ${label(ids[3]!)}${state.bouts[1] ? `  →  ${label(state.bouts[1].winnerId)}` : ""}`;
    element("final").textContent = state.bouts.length >= 2 ? `${label(state.bouts[0]!.winnerId)}  /  ${label(state.bouts[1]!.winnerId)}` : "Winners advance";
    element("champion").textContent = state.winnerId ? label(state.winnerId) : "To be decided";
    element("round").textContent = state.status === "completed" ? "Champion crowned" : state.status === "running" ? ["Semifinal 01", "Semifinal 02", "The final"][state.round]! : state.status === "idle" ? "Awaiting the next cup" : "Exhibition paused";
    element("status").textContent = state.status === "completed" ? `${label(state.winnerId!)} takes the cup` : state.status === "failed" ? "The battle could not be confirmed. Awaiting runner recovery." : state.status === "cancelled" ? "Exhibition cancelled" : state.status === "running" ? "Preparing the next battle…" : "Four fighters. Three battles. One champion.";
  }

  const cup = new BroadcastCup(runner.runBout, render, holds);
  const api: OddboutBroadcastApi = Object.freeze({ protocolVersion: 1 as const,
    runCup: (input: BroadcastCupInput) => disposed ? Promise.reject(new Error("broadcast_page_disposed")) : cup.runCup(input),
    getStatus: () => cup.getStatus(), cancel: () => { cup.cancel(); runner.reset(); },
  });
  window.oddboutBroadcast = api;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true; api.cancel(); runner.dispose(); window.removeEventListener("pagehide", dispose); window.removeEventListener("beforeunload", dispose);
  };
  window.addEventListener("pagehide", dispose); window.addEventListener("beforeunload", dispose);
  render(cup.getStatus());
  return dispose;
}

const root = document.getElementById("broadcast-cup");
if (root) mountBroadcast(root);
