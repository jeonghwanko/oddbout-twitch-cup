import { BetBooth, BET_BOOTH_TIMINGS, type BetBoothTimings, type BetBoothView, type BetChatOutcome } from "./app/BetBooth";
import { betLeaders, EMPTY_BET_LEDGER, fighterRecord } from "./app/BetLedger";
import { betOddsLabel, betPools, type BetRound, type BetSide, type BettorIdentity } from "./app/BetRound";
import { twitchCupRoster, type TwitchCupFighter } from "./app/TwitchCupRoster";
import { createArenaFrameRunner } from "./arenaFrameRunner";
import { betLedgerStore, exportBetLedger, importBetLedger } from "./platform/betLedgerStorage";
import { fetchCommunityFighters, fighterApiBase } from "./platform/registeredFighters";
import { connectTwitch, validateTwitchSession, type TwitchSession } from "./platform/twitchAuth";
import { TwitchChatClient } from "./platform/twitchChat";
import { CITY_FIGHTER_IDS } from "./sim/cityFight/CityFighterIds";
import "./bet.css";

export interface BetBoothPageOptions {
  readonly timings?: Partial<BetBoothTimings>;
  /** How long one ticker line stays (ms). */
  readonly tickerMs?: number;
}

const SIDES: readonly BetSide[] = ["red", "blue"];
const LIST_ROWS = 30;
const LEADER_ROWS = 10;
const BALANCE_COOLDOWN_MS = 30_000;
const REJECTION_COOLDOWN_MS = 15_000;
const TICKER_QUEUE = 5;
const DEMO_BOTS = 6;
const WINDOW_CHOICES = [20, 30, 40, 60, 90];

const trimmed = (value: number): string => (Math.floor(value * 10) / 10).toFixed(1).replace(/\.0$/, "");
/** 950 · 12.3K · 1.8M */
export function compactPoints(value: number): string {
  return value >= 1_000_000 ? `${trimmed(value / 1_000_000)}M` : value >= 10_000 ? `${trimmed(value / 1_000)}K` : value.toLocaleString("en-US");
}
const fullPoints = (value: number): string => value.toLocaleString("en-US");
const count = (value: number, one: string, many: string): string => `${fullPoints(value)} ${value === 1 ? one : many}`;
const clock = (ms: number): string => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

/**
 * The bet booth stream page: endless 1:1 bouts, free-point bets from Twitch chat (`!bet`, `!balance`, read-only `chat:read`), parimutuel
 * payouts into a ledger kept in this browser. Every viewer-supplied string is written with textContent.
 */
export function mountBetBooth(root: HTMLElement, options: BetBoothPageOptions = {}): () => void {
  const base = import.meta.env.BASE_URL;
  const faces = ["kuma", "yume", "bravow", "beotim"].map(id => `<img src="${base}art/ui/oddbout-faces-v1/${id}.webp" width="104" height="104" alt="" />`).join("");
  const corner = (side: BetSide): string => `<aside class="bettors" data-side="${side}" aria-label="${side === "red" ? "Red" : "Blue"} corner bets"><div class="corner-head"><span class="corner-count" id="bet-${side}-count">0</span><span class="corner-tag">${side.toUpperCase()}</span><strong id="bet-${side}-name">—</strong></div><ol id="bet-${side}-list"></ol><p class="more" id="bet-${side}-more" hidden></p></aside>`;
  const card = (side: BetSide): string => `<div class="card" data-side="${side}"><span class="pic" id="bet-${side}-pic"></span><span class="card-tag">${side.toUpperCase()}</span><strong id="bet-${side}-title"></strong><span class="record" id="bet-${side}-record"></span><code>!bet ${side} 500</code></div>`;
  const waiting = `<div class="waiting"><p class="waiting-label">PLACE YOUR BETS</p><h2>Two fighters.<br><em>Your call.</em></h2><div class="studio-faces" aria-hidden="true">${faces}</div><p>Free points · no cash value</p></div>`;
  root.innerHTML = `
    <header><div class="brand"><img class="studio-logo" src="${base}art/ui/oddbout-logo.webp" width="376" height="76" alt="ODDBOUT Fight Club" /><span>Bet Booth</span></div><div class="header-actions"><span id="bet-connection" role="status">Offline</span><button id="bet-connect">Connect Twitch <span aria-hidden="true">↗</span></button><button id="bet-theater" class="quiet" aria-pressed="false">Stream view</button></div></header>
    <section class="host" aria-label="Host controls">
      <div class="host-row"><button id="bet-start">Start betting</button><label class="inline" for="bet-window">Betting window <select id="bet-window">${WINDOW_CHOICES.map(s => `<option value="${s}">${s} s</option>`).join("")}</select></label><button id="bet-demo" class="quiet">Try without Twitch</button><span id="bet-local-help" hidden>To connect chat, <a id="bet-local-link">open on localhost ↗</a></span></div>
      <form id="bet-demo-form" class="demo-form" hidden><label for="bet-demo-name">Viewer</label><input id="bet-demo-name" value="viewer1" maxlength="25" required /><label for="bet-demo-text">Chat message</label><input id="bet-demo-text" value="!bet red 100" maxlength="80" required /><button type="submit">Send</button></form>
      <p id="bet-notice" role="status" aria-live="polite"></p>
      <div class="host-more"><details><summary>Connection settings</summary><div class="host-body"><label for="bet-client-id">Twitch Client ID</label><input id="bet-client-id" autocomplete="off" placeholder="Public Client ID" /><button id="bet-disconnect" class="quiet" disabled>Disconnect</button><p>Redirect URL: <code id="bet-redirect"></code><br>Read-only chat access (chat:read). Nothing is posted to chat.</p></div></details>
      <details><summary>Points ledger</summary><div class="host-body"><p id="bet-ledger-info"></p><div class="ledger-actions"><button id="bet-export" class="quiet">Export backup</button><label class="file-button" for="bet-import">Import backup</label><input id="bet-import" type="file" accept="application/json,.json" /><button id="bet-reset" class="quiet">Reset ledger</button></div><p>Points are free and have no cash value: they cannot be bought, cashed out or exchanged. Balances live in this browser only, so export a backup regularly.</p></div></details></div>
    </section>
    <section class="booth">${corner("red")}<div class="center"><div class="status-bar"><strong id="bet-signal">STANDING BY</strong><span id="bet-status"></span><span id="bet-clock" aria-hidden="true"></span></div><div class="stage"><div id="bet-arena">${waiting}</div><div id="bet-matchup" hidden>${card("red")}<span class="vs" aria-hidden="true">VS</span>${card("blue")}</div></div><div class="pools-bar"><span data-side="red"><b id="bet-red-label">RED</b><span id="bet-red-total">0</span></span><strong id="bet-odds">—</strong><span data-side="blue"><span id="bet-blue-total">0</span><b id="bet-blue-label">BLUE</b></span></div><p id="bet-ticker" aria-live="polite"></p></div>${corner("blue")}</section>
    <section class="leaders" aria-label="Top balances"><h2>TOP BALANCES</h2><ol id="bet-leaders"></ol><p class="leaders-meta"><span id="bet-match-count">0 matches</span><span>Free points · no cash value</span></p></section>
    <footer><span>!bet red 500 · !bet blue 25% · !bet red all · !balance</span><span>Keep this tab visible during your stream.</span></footer>`;

  const el = <T extends HTMLElement = HTMLElement>(id: string): T => root.querySelector<T>(`#bet-${id}`)!;
  const tickerMs = options.tickerMs ?? 2600;
  let roster: readonly TwitchCupFighter[] = twitchCupRoster(CITY_FIGHTER_IDS, []);
  const registeredCards = new Map<string, string>();
  const fighterOf = (id: string): TwitchCupFighter | undefined => roster.find(fighter => fighter.id === id);
  const label = (id: string): string => { const fighter = fighterOf(id); return fighter ? fighter.kind === "fighter" ? fighter.label.toUpperCase() : fighter.label : "CREATOR FIGHTER"; };
  function picture(id: string): HTMLElement {
    const card = fighterOf(id)?.kind === "registered" ? registeredCards.get(id) : CITY_FIGHTER_IDS.includes(id) ? `${base}art/ui/oddbout-faces-v1/${id}.webp` : undefined;
    if (!card) { const blank = document.createElement("span"); blank.className = "fighter-blank"; blank.textContent = (Array.from(label(id))[0] ?? "").toUpperCase(); blank.setAttribute("aria-hidden", "true"); return blank; }
    const image = document.createElement("img"); image.src = card; image.alt = ""; return image;
  }

  const needsLocalhost = location.hostname === "127.0.0.1" || location.hostname === "[::1]";
  let chat: TwitchChatClient | null = null;
  let session: TwitchSession | null = null;
  let connected = false, connecting = false, generation = 0;
  let authValidation: ReturnType<typeof setTimeout> | undefined;
  let demo = false;
  let disposed = false;
  let boutLive = false;
  let lastView: BetBoothView | null = null;
  let botRound: BetRound | null = null;
  const botTimers = new Set<ReturnType<typeof setTimeout>>();
  const arena = el("arena");
  const runner = createArenaFrameRunner(arena, { title: "ODDBOUT Bet Booth battle", onBoutReady: () => { boutLive = true; if (lastView) render(lastView); } });
  const makeBooth = (): BetBooth => new BetBooth({
    runBout: runner.runBout, roster: () => roster.map(fighter => fighter.id), commandOf: id => fighterOf(id)?.command ?? id,
    store: betLedgerStore(demo ? "demo" : "live"), changed: view => { if (!disposed) render(view); }, timings: { ...options.timings, openMs: Number(el<HTMLSelectElement>("window").value) * 1000 },
  });
  el<HTMLSelectElement>("window").value = String(Math.round((options.timings?.openMs ?? BET_BOOTH_TIMINGS.openMs) / 1000));
  if (!el<HTMLSelectElement>("window").value) { const option = document.createElement("option"); const seconds = Math.round((options.timings?.openMs ?? BET_BOOTH_TIMINGS.openMs) / 1000); option.value = String(seconds); option.textContent = `${seconds} s`; el("window").append(option); el<HTMLSelectElement>("window").value = option.value; }
  let booth = makeBooth();

  // --- ticker -------------------------------------------------------------------------------------------------------------------------
  const queue: string[] = [];
  const cooldowns = new Map<string, number>();
  let tickerTimer: ReturnType<typeof setTimeout> | undefined;
  function showNext(): void {
    tickerTimer = undefined;
    const next = queue.shift();
    el("ticker").textContent = next ?? "";
    if (next !== undefined) tickerTimer = setTimeout(showNext, tickerMs);
  }
  function say(text: string, cooldownKey?: string, cooldownMs = 0): void {
    if (cooldownKey) {
      const last = cooldowns.get(cooldownKey);
      if (last !== undefined && Date.now() - last < cooldownMs) return;
      cooldowns.set(cooldownKey, Date.now());
      if (cooldowns.size > 2000) cooldowns.delete(cooldowns.keys().next().value as string);
    }
    queue.push(text); while (queue.length > TICKER_QUEUE) queue.shift();
    if (tickerTimer === undefined) showNext();
  }
  function notice(text: string): void { el("notice").textContent = text; }

  function chatLine(identity: BettorIdentity, displayName: string, text: string): BetChatOutcome | null {
    const outcome = booth.chat(identity, displayName, text);
    if (!outcome) return null;
    const who = outcome.displayName.toLowerCase();
    if (outcome.kind === "balance") say(`${outcome.displayName} · ${fullPoints(outcome.balance)} points`, `balance:${outcome.key}`, BALANCE_COOLDOWN_MS);
    else if (outcome.kind === "rejected") {
      const reason = outcome.reason === "closed" ? "bets are closed" : outcome.reason === "unknown-side" ? "bet red or blue"
        : outcome.reason === "insufficient" ? `only ${fullPoints(outcome.balance)} points` : "bet at least 1 point";
      say(`${outcome.displayName} · ${reason}`, `reject:${who}`, REJECTION_COOLDOWN_MS);
    }
    return outcome;
  }

  // --- demo bots ------------------------------------------------------------------------------------------------------------------------
  function clearBots(): void { for (const timer of botTimers) clearTimeout(timer); botTimers.clear(); }
  function scheduleBots(view: BetBoothView): void {
    if (!demo || view.phase !== "open" || !view.round || view.round === botRound || view.round.bets.length > 0 || !view.closesAt) return;
    botRound = view.round;
    const spread = Math.max(0, view.closesAt - Date.now()) * 0.7;
    const amounts = ["50", "100", "250", "500", "10%", "25%", "all"];
    for (let i = 1; i <= DEMO_BOTS; i++) {
      const timer = setTimeout(() => {
        botTimers.delete(timer);
        const side = Math.random() < 0.5 ? "red" : "blue", amount = amounts[Math.floor(Math.random() * amounts.length)]!;
        chatLine({ kind: "local-demo", value: `demo_bot${i}` }, `demo_bot${i}`, `!bet ${side} ${amount}`);
      }, Math.floor(Math.random() * spread));
      botTimers.add(timer);
    }
  }

  // --- render ---------------------------------------------------------------------------------------------------------------------------
  function renderList(side: BetSide, round: BetRound | null, settled: boolean): void {
    const bets = (round?.bets ?? []).filter(bet => bet.side === side).sort((a, b) => b.amount - a.amount || a.displayName.localeCompare(b.displayName));
    const deltas = new Map(settled ? round!.payouts.map(payout => [payout.key, payout.delta]) : []);
    const rows = bets.slice(0, LIST_ROWS).map(bet => {
      const row = document.createElement("li"), amount = document.createElement("span"), name = document.createElement("span");
      amount.className = "amount"; name.className = "name"; name.textContent = bet.displayName;
      const delta = deltas.get(bet.key);
      if (delta === undefined) amount.textContent = compactPoints(bet.amount);
      else { amount.textContent = delta > 0 ? `+${compactPoints(delta)}` : delta < 0 ? `−${compactPoints(-delta)}` : "±0"; row.className = delta > 0 ? "won" : delta < 0 ? "lost" : ""; }
      row.append(amount, name); return row;
    });
    el(`${side}-list`).replaceChildren(...rows);
    el(`${side}-count`).textContent = String(bets.length);
    el(`${side}-more`).hidden = bets.length <= LIST_ROWS;
    el(`${side}-more`).textContent = `+${bets.length - LIST_ROWS} more`;
  }
  function render(view: BetBoothView): void {
    if (view.phase !== "fighting") boutLive = false;
    if (view.phase !== "open") clearBots();
    lastView = view;
    const round = view.round, settled = round?.status === "settled";
    root.dataset.phase = view.phase; root.dataset.winner = settled ? round!.winner ?? "" : "";
    root.dataset.connected = String(connected); root.dataset.demo = String(demo);
    for (const side of SIDES) {
      const id = round ? side === "red" ? round.redId : round.blueId : null;
      el(`${side}-name`).textContent = id ? label(id) : "—";
      el(`${side}-label`).textContent = id ? label(id) : side.toUpperCase();
      el(`${side}-title`).textContent = id ? label(id) : "";
      const record = id ? fighterRecord(view.ledger, id) : null;
      el(`${side}-record`).textContent = record ? `${record.wins}W · ${record.losses}L` : "";
      const pic = el(`${side}-pic`);
      if (id && pic.dataset.fighter !== id) { pic.replaceChildren(picture(id)); pic.dataset.fighter = id; }
      renderList(side, round, settled);
    }
    const pools = round ? betPools(round) : { red: 0, blue: 0, redCount: 0, blueCount: 0 };
    el("red-total").textContent = fullPoints(pools.red); el("blue-total").textContent = fullPoints(pools.blue);
    el("odds").textContent = betOddsLabel(pools);
    el("matchup").hidden = view.phase !== "open";
    if (!arena.firstElementChild) arena.innerHTML = waiting;

    const pair = round ? `${label(round.redId)} vs ${label(round.blueId)}` : "";
    const winnerId = settled ? round!.winner === "red" ? round!.redId : round!.blueId : null;
    const oneSided = settled && round!.payouts.every(payout => payout.delta === 0);
    const [signal, status]: [string, string] = view.phase === "open" ? ["BETS OPEN", `${pair} · !bet red 500 or !bet blue all`]
      : view.phase === "fighting" ? ["BETS LOCKED", boutLive ? `${pair} · fight!` : `${pair} · loading the bout…`]
      : view.phase === "result" ? [`${label(winnerId!)} WINS`, oneSided ? "One-sided round · no points moved." : `Payouts to Team ${round!.winner === "red" ? "Red" : "Blue"}.`]
      : view.phase === "void" ? ["MATCH VOID", "The bout could not be confirmed · no points moved."]
      : view.phase === "paused" ? ["PAUSED", view.fault === "failures" ? "Paused after repeated failed bouts. Check the battle host, then resume."
        : view.fault === "roster" ? "Paused: the booth needs at least two fighters." : view.fault === "error" ? "Paused after an unexpected error. Resume to continue." : "Betting is paused."]
      : ["STANDING BY", demo || connected ? "Start betting to open the first round." : "Connect Twitch or try the local demo."];
    el("signal").textContent = signal;
    el("status").textContent = view.stopping ? `${status} Pausing after this match.` : status;
    tickClock();

    const leaders = betLeaders(view.ledger, LEADER_ROWS).map((leader, index) => {
      const row = document.createElement("li"), rank = document.createElement("span"), name = document.createElement("span"), balance = document.createElement("b");
      rank.textContent = String(index + 1); name.textContent = leader.displayName; balance.textContent = compactPoints(leader.balance);
      row.append(rank, name, balance); return row;
    });
    el("leaders").replaceChildren(...leaders);
    el("match-count").textContent = count(view.ledger.matches, "match", "matches");
    const accounts = Object.keys(view.ledger.accounts).length;
    el("ledger-info").textContent = `${demo ? "Demo ledger" : "Live ledger"} · ${count(accounts, "viewer", "viewers")} · ${count(view.ledger.matches, "match", "matches")}${view.saved ? "" : " · could not save to this browser's storage"}`;

    const running = booth.running;
    const startButton = el<HTMLButtonElement>("start");
    startButton.textContent = running ? view.stopping ? "Pausing after this match…" : "Pause betting" : view.phase === "paused" ? "Resume betting" : "Start betting";
    startButton.disabled = running ? view.stopping : !(demo || connected);
    el<HTMLButtonElement>("demo").textContent = demo ? "Leave demo" : "Try without Twitch";
    el<HTMLButtonElement>("demo").disabled = running || connecting || Boolean(session);
    el("demo-form").hidden = !demo;
    el<HTMLButtonElement>("connect").hidden = Boolean(session);
    el<HTMLButtonElement>("connect").disabled = needsLocalhost || connecting || demo;
    el<HTMLButtonElement>("disconnect").disabled = !session;
    for (const id of ["export", "reset"]) el<HTMLButtonElement>(id).disabled = running;
    el<HTMLInputElement>("import").disabled = running;
    scheduleBots(view);
  }
  function tickClock(): void {
    const view = lastView;
    el("clock").textContent = view?.phase === "open" && view.closesAt ? clock(view.closesAt - Date.now()) : "";
  }
  const clockTimer = setInterval(tickClock, 250);

  // --- Twitch chat ----------------------------------------------------------------------------------------------------------------------
  const connectionUrl = new URL(location.href);
  if (needsLocalhost) connectionUrl.hostname = "localhost";
  el("redirect").textContent = new URL("twitch-auth.html", connectionUrl).href;
  el("local-help").hidden = !needsLocalhost;
  el<HTMLAnchorElement>("local-link").href = connectionUrl.href;
  el<HTMLInputElement>("client-id").value = import.meta.env.VITE_TWITCH_CLIENT_ID ?? "";
  const refresh = (): void => { if (!disposed) render(booth.view()); };

  function disconnect(preserveSession = false): void {
    generation++; clearTimeout(authValidation); chat?.disconnect(); chat = null;
    if (!preserveSession) session = null;
    connected = false; connecting = false;
    el("connection").textContent = "Offline"; refresh();
  }
  function attachChat(authorized: TwitchSession, stamp: number): void {
    session = authorized;
    chat = new TwitchChatClient({ login: authorized.login, accessToken: authorized.accessToken, channel: authorized.login }, {
      onStatus: status => { if (stamp !== generation) return; connected = status === "connected"; el("connection").textContent = `${authorized.login} · ${status}`; refresh(); },
      onMessage: message => { if (stamp === generation && !demo) chatLine(message.identity, message.displayName, message.text); },
      onError: () => { if (stamp === generation) notice("Chat connection failed. Disconnect and try again."); },
    });
    scheduleValidation(authorized, stamp); chat.connect();
  }
  function scheduleValidation(current: TwitchSession, stamp: number): void {
    const revalidate = async (): Promise<void> => {
      try {
        const refreshed = await validateTwitchSession(current.accessToken, current.clientId);
        if (stamp !== generation) return; session = refreshed; scheduleValidation(refreshed, stamp);
      } catch { if (stamp === generation) { disconnect(); notice("Your Twitch session expired. Reconnect to keep taking bets."); } }
    };
    authValidation = setTimeout(() => { void revalidate(); }, Math.min(3_600_000, Math.max(1000, current.expiresIn * 1000)));
  }
  async function handleConnect(): Promise<void> {
    if (connecting || demo || session) return;
    const stamp = ++generation; connecting = true; refresh();
    try {
      const authorized = await connectTwitch(el<HTMLInputElement>("client-id").value.trim());
      if (stamp !== generation) return;
      attachChat(authorized, stamp);
    } catch (error) { if (stamp === generation) notice(error instanceof Error ? error.message : "Connection failed."); }
    finally { if (stamp === generation) { connecting = false; refresh(); } }
  }

  // --- controls -------------------------------------------------------------------------------------------------------------------------
  const on = (id: string, type: string, listener: (event: Event) => void): void => el(id).addEventListener(type, listener);
  on("connect", "click", () => { void handleConnect(); });
  on("disconnect", "click", () => { disconnect(); notice(""); });
  on("start", "click", () => {
    if (booth.running) { booth.pause(); return; }
    if (!demo && !connected) return;
    notice(""); booth.start();
  });
  on("window", "change", () => { booth.setOpenMs(Number(el<HTMLSelectElement>("window").value) * 1000); });
  on("demo", "click", () => {
    if (booth.running || connecting || session) return;
    demo = !demo; booth.dispose(); runner.reset(); booth = makeBooth(); botRound = null; notice(demo ? "Demo bots bet in every round. Send your own lines below." : ""); refresh();
  });
  on("demo-form", "submit", event => {
    event.preventDefault(); if (!demo) return;
    const name = el<HTMLInputElement>("demo-name").value.trim().slice(0, 25);
    if (!name) return;
    const outcome = chatLine({ kind: "local-demo", value: name.toLowerCase() }, name, el<HTMLInputElement>("demo-text").value);
    if (outcome?.kind === "bet") notice(`${outcome.displayName} bet ${fullPoints(outcome.amount)} on ${outcome.side}${outcome.replaced ? " (replaced)" : ""}.`);
    else if (!outcome) notice("That line is not a !bet or !balance command.");
  });
  on("theater", "click", () => {
    const active = root.classList.toggle("theater");
    el("theater").textContent = active ? "Host view" : "Stream view"; el("theater").setAttribute("aria-pressed", String(active));
  });
  on("export", "click", () => {
    const blob = new Blob([exportBetLedger(booth.view().ledger)], { type: "application/json" });
    const url = URL.createObjectURL(blob), link = document.createElement("a");
    link.href = url; link.download = `oddbout-bet-ledger-${demo ? "demo-" : ""}${new Date().toISOString().slice(0, 10)}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  on("import", "change", () => {
    const input = el<HTMLInputElement>("import"), file = input.files?.[0];
    input.value = "";
    if (!file || booth.running) return;
    void file.text().then(text => {
      const ledger = importBetLedger(text);
      if (!ledger) { notice("That file is not an ODDBOUT bet ledger backup."); return; }
      notice(booth.replaceLedger(ledger) ? `Imported ${fullPoints(Object.keys(ledger.accounts).length)} viewers.` : "Pause betting before importing.");
    }, () => notice("Could not read that file."));
  });
  let resetArmed: ReturnType<typeof setTimeout> | undefined;
  on("reset", "click", () => {
    if (booth.running) return;
    if (resetArmed === undefined) {
      el("reset").textContent = "Select again to erase all balances";
      resetArmed = setTimeout(() => { resetArmed = undefined; el("reset").textContent = "Reset ledger"; }, 5000);
      return;
    }
    clearTimeout(resetArmed); resetArmed = undefined; el("reset").textContent = "Reset ledger";
    if (booth.replaceLedger(EMPTY_BET_LEDGER)) notice("The ledger was reset.");
  });

  const beforeUnload = (event: BeforeUnloadEvent): void => { if (booth.running) { event.preventDefault(); event.returnValue = ""; } };
  const pageHide = (event: PageTransitionEvent): void => {
    // A hidden or restored document cannot resume a bout: the open round or the bout in progress is voided (no points move).
    booth.stop(); runner.reset(); clearBots();
    disconnect(event.persisted);
  };
  const pageShow = (event: PageTransitionEvent): void => {
    if (!event.persisted || !session) return;
    const current = session, stamp = ++generation; connecting = true; refresh();
    void validateTwitchSession(current.accessToken, current.clientId).then(refreshed => {
      if (stamp === generation) attachChat(refreshed, stamp);
    }).catch(() => {
      if (stamp === generation) { disconnect(); notice("Your Twitch session expired. Reconnect to keep taking bets."); }
    }).finally(() => { if (stamp === generation) { connecting = false; refresh(); } });
  };
  window.addEventListener("beforeunload", beforeUnload);
  window.addEventListener("pagehide", pageHide);
  window.addEventListener("pageshow", pageShow);

  /** Approved creator fighters join the draw once the registry answers; without one, the shipped fighters only. */
  async function loadRegisteredFighters(): Promise<void> {
    const registry = fighterApiBase();
    try {
      if (!registry) return;
      const entries = await fetchCommunityFighters(registry);
      if (disposed) return;
      for (const entry of entries) if (entry.duelApproved === true && entry.profileSet) registeredCards.set(entry.id, entry.profileSet.card.url);
      roster = twitchCupRoster(CITY_FIGHTER_IDS, entries);
      refresh();
    } catch { if (!disposed) say("Creator fighters are unavailable · shipped fighters only"); }
  }

  refresh();
  void loadRegisteredFighters();
  return () => {
    if (disposed) return;
    disposed = true;
    booth.dispose(); runner.dispose(); clearBots(); clearInterval(clockTimer); clearTimeout(tickerTimer); clearTimeout(resetArmed);
    generation++; clearTimeout(authValidation); chat?.disconnect(); chat = null; session = null;
    window.removeEventListener("beforeunload", beforeUnload); window.removeEventListener("pagehide", pageHide); window.removeEventListener("pageshow", pageShow);
  };
}

const root = document.getElementById("bet-booth");
if (root) mountBetBooth(root);
