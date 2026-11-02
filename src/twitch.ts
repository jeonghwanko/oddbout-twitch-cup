import { CITY_FIGHTER_IDS } from "./sim/cityFight/CityFighterIds";
import { allowTwitchFighters, createTwitchTournament, joinTwitchTournament, startTwitchTournament, applyTwitchMatchResult, parseJoinCommand, setTwitchSoloRehearsal, type TwitchEntrant } from "./app/TwitchTournament";
import { twitchCupFighterFor, twitchCupRoster, type TwitchCupFighter } from "./app/TwitchCupRoster";
import { createTwitchArenaBoutUrl, twitchBoutBootTimeoutMs, validateTwitchArenaBoutMessage, validateTwitchArenaHostReady, TWITCH_ARENA_BOUT_TIMEOUT_MS, type TwitchArenaBoutRequest } from "./app/TwitchArenaBout";
import { createTwitchBoutRecovery, twitchBoutBootTimedOut, twitchBoutFailed, twitchBoutFinished, twitchBoutReady } from "./app/TwitchBoutRecovery";
import { TwitchChatClient, type TwitchChatMessage } from "./platform/twitchChat";
import { connectTwitch, validateTwitchSession, type TwitchSession } from "./platform/twitchAuth";
import { fetchCommunityFighters, fighterApiBase } from "./platform/registeredFighters";
import { PALETTE } from "./render/art/palette";
import { arenaConceptArt } from "./assets/ArenaArtCatalog";
import "./twitch.css";

const root = document.querySelector<HTMLElement>("#twitch-cup")!;
for (const [key, value] of Object.entries({ ink: PALETTE.oddboutInk, acid: PALETTE.oddboutAcid, magenta: PALETTE.oddboutPink, white: PALETTE.white })) {
  root.style.setProperty(`--${key}`, `#${value.toString(16).padStart(6, "0")}`);
}
const artUrl = (id: string): string => new URL(arenaConceptArt(id, null)?.path ?? "", new URL(import.meta.env.BASE_URL, location.href)).href;
const emptyArena = `<div class="arena-empty"><div class="stage-grid"></div><span class="stage-label">THE ARENA</span><span class="stage-vs" aria-hidden="true">VS</span><img class="stage-fighter fighter-left" src="${artUrl("kuma")}" alt="Kuma" /><img class="stage-fighter fighter-right" src="${artUrl("yume")}" alt="Yume" /><div class="stage-footer"><span>Kuma <b>×</b> Yume</span></div></div>`;
root.innerHTML = `
  <header><a href="./twitch.html" class="wordmark">ODDBOUT<span>TWITCH CUP</span></a><div class="header-actions"><span id="connection" role="status">Offline</span><button id="connect">Connect Twitch <span aria-hidden="true">↗</span></button><button id="theater" class="quiet" aria-pressed="false">Stream view</button></div></header>
  <details class="settings" id="settings"><summary>Connection settings</summary><div class="settings-body"><div><label for="client-id">Twitch Client ID</label><input id="client-id" autocomplete="off" placeholder="Public Client ID" /></div><button id="disconnect" class="quiet" disabled>Disconnect</button><p><a href="https://dev.twitch.tv/console/apps" target="_blank" rel="noopener noreferrer">Register an app</a> · Chat Bot / Confidential<br>Redirect URL: <code id="redirect-uri"></code><br>Read-only chat access. Refreshing resets the cup.</p></div></details>
  <p id="local-host-help" hidden>To connect chat, <a id="local-host-link">open on localhost ↗</a></p>
  <section class="cup-heading"><div><p class="eyebrow" id="mode">TWITCH COMMUNITY TOURNAMENT</p><h1>YOUR CHAT.<br><em>YOUR CHAMPION.</em></h1><p class="tagline">From your chat. Into the ring.</p></div><div class="format"><strong>04<span>→</span>01</strong><span>Four fighters. One champion.</span></div></section>
  <div class="tournament-layout"><div class="stage-column"><section class="arena-shell"><div class="arena-caption"><strong id="round">OPEN LOBBY</strong><span id="pairing">Registration open</span><span id="rehearsal-watermark" hidden>SOLO TEST · ONE ACCOUNT</span></div><div id="arena">${emptyArena}</div><div id="champion" hidden aria-live="polite"></div></section><section id="bracket" class="bracket" aria-label="Bracket"></section></div>
  <aside class="lobby" aria-label="Tournament controls"><div class="lobby-heading"><h2>THE LINEUP</h2><strong id="count">0 / 4</strong></div><p id="instruction"></p><div id="lineup"></div><section class="actions"><button id="start" disabled>Waiting for players</button><button id="retry" hidden>Retry match</button><button id="reset" class="quiet">New cup</button></section><p id="notice" role="status" aria-live="polite"></p>
  <details class="test-tools" id="test-tools"><summary>Try it solo</summary><p id="solo-help">Connect Twitch, enable solo rehearsal, then join with four different fighters in your own chat.</p><button id="solo" class="quiet" disabled aria-pressed="false" aria-describedby="solo-help">Enable solo rehearsal</button><button id="demo" class="quiet">Try without Twitch</button><form id="demo-form" hidden><label for="demo-name">Viewer name</label><input id="demo-name" value="viewer1" maxlength="25" required /><label for="demo-fighter">Fighter</label><select id="demo-fighter"></select><button type="submit">Add player</button></form><button id="demo-fill" hidden>Fill all 4 slots</button></details></aside></div>
  <section class="lower"><details class="roster" id="roster"><summary>Choose a fighter <span>Copy a command. Paste it in chat.</span></summary><div id="fighters" class="fighters"></div></details><details class="event-log"><summary>Activity</summary><ol id="activity" aria-live="polite"></ol></details></section><footer><span>ODDBOUT / TWITCH CUP</span><span>Keep this tab visible during your stream.</span></footer>`;

function el<T extends HTMLElement = HTMLElement>(id: string): T { return document.getElementById(id) as T; }
const labels: Record<string, string> = { "semi-1": "Semifinal 1", "semi-2": "Semifinal 2", final: "Final" };
const rejections: Record<string, string> = { closed: "Registration is closed", full: "All four slots are filled", "duplicate-user": "You have already joined", "fighter-taken": "That fighter is taken", "unknown-fighter": "Choose a fighter from the roster", "invalid-identity": "Could not verify your viewer identity", "solo-broadcaster-only": "Only the connected broadcaster can join a solo rehearsal" };
let state = createTwitchTournament(CITY_FIGHTER_IDS);
let demo = false;
let chat: TwitchChatClient | null = null;
let session: TwitchSession | null = null;
let connected = false;
let connecting = false;
let generation = 0;
let tournamentId = crypto.randomUUID();
let frame: HTMLIFrameElement | null = null;
let hostReady = false;
let request: TwitchArenaBoutRequest | null = null;
let watchdog: ReturnType<typeof setTimeout> | undefined;
let bootWatchdog: ReturnType<typeof setTimeout> | undefined;
let navigation: ReturnType<typeof setTimeout> | undefined;
let recovery = createTwitchBoutRecovery();
let nextMatch: ReturnType<typeof setTimeout> | undefined;
let authValidation: ReturnType<typeof setTimeout> | undefined;
let failed = false;
const seeds = new Map<string, number>();

const needsLocalhost = location.hostname === "127.0.0.1" || location.hostname === "[::1]";
const connectionUrl = new URL(location.href);
if (needsLocalhost) connectionUrl.hostname = "localhost";
el("redirect-uri").textContent = new URL("twitch-auth.html", connectionUrl).href;
el("local-host-help").hidden = !needsLocalhost;
el<HTMLAnchorElement>("local-host-link").href = connectionUrl.href;
el<HTMLInputElement>("client-id").value = import.meta.env.VITE_TWITCH_CLIENT_ID ?? "";
// Shipped fighters at once; approved registered ones join after the registry answers (`loadRegisteredFighters`).
let roster: readonly TwitchCupFighter[] = twitchCupRoster(CITY_FIGHTER_IDS, []);
/** A registered fighter's approved front card (its public address); a shipped fighter's comes from `artUrl`. */
const registeredCards = new Map<string, string>();
const rosterIds = (): string[] => roster.map(fighter => fighter.id);
const fighterOf = (id: string): TwitchCupFighter | undefined => roster.find(fighter => fighter.id === id);
const label = (id: string): string => fighterOf(id)?.label ?? id;
/** His card, or his initial on a blank tile when he has none (a registered fighter without an approved profile set). */
function picture(id: string): HTMLElement {
  const card = fighterOf(id)?.kind === "registered" ? registeredCards.get(id) : artUrl(id);
  if (!card) { const blank = document.createElement("span"); blank.className = "fighter-blank"; blank.textContent = (Array.from(label(id))[0] ?? "").toUpperCase(); blank.setAttribute("aria-hidden", "true"); return blank; }
  const image = document.createElement("img"); image.src = card; image.alt = ""; image.loading = "lazy"; return image;
}
function renderRoster(): void {
  const chips: HTMLElement[] = [], options: HTMLOptionElement[] = [];
  for (const fighter of roster) {
    const line = `!join ${fighter.command}`;
    const chip = document.createElement("button"); chip.className = "fighter-chip quiet"; chip.type = "button"; chip.title = fighter.label;
    const command = document.createElement("code"); command.textContent = line; chip.append(picture(fighter.id), command);
    chip.setAttribute("aria-label", `Copy ${line} (${fighter.label})`);
    chip.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(line);
        command.textContent = "Copied ✓"; setTimeout(() => { command.textContent = line; }, 1800);
      } catch { command.textContent = line; notice(`Type ${line} in chat.`); }
    });
    chips.push(chip);
    const option = document.createElement("option"); option.value = fighter.command; option.textContent = fighter.command; options.push(option);
  }
  const select = el<HTMLSelectElement>("demo-fighter"), chosen = select.value;
  el("fighters").replaceChildren(...chips); select.replaceChildren(...options);
  if (roster.some(fighter => fighter.command === chosen)) select.value = chosen;
}
renderRoster();
function notice(text: string): void { el("notice").textContent = text; }
function activity(text: string): void {
  const row = document.createElement("li"); row.textContent = text; el("activity").prepend(row);
  while (el("activity").children.length > 12) el("activity").lastElementChild?.remove();
}
function entrant(id: string): TwitchEntrant | undefined { return state.entrants.find(e => e.fighterId === id); }
function name(id: string): string { const entry = entrant(id); return entry ? `${label(entry.fighterId)} · ${entry.rehearsalSlot ? `Slot ${entry.rehearsalSlot}` : entry.displayName}` : "Winner TBD"; }
function render(): void {
  const solo = state.registrationPolicy.kind === "solo-rehearsal";
  el("count").textContent = `${state.entrants.length} / 4`;
  root.dataset.phase = state.status;
  root.dataset.connected = String(connected);
  el("mode").textContent = demo ? "LOCAL DEMO · SIMULATED VIEWERS" : session ? `TWITCH / ${session.login}` : "TWITCH COMMUNITY TOURNAMENT";
  el("rehearsal-watermark").hidden = !solo;
  el<HTMLButtonElement>("solo").disabled = !session || !connected || connecting || demo || state.status !== "registration" || state.entrants.length > 0;
  el("solo").textContent = solo ? "Disable solo rehearsal" : "Enable solo rehearsal";
  el("solo").setAttribute("aria-pressed", String(solo));
  const ready = state.status === "registration" && state.entrants.length === 4 && (demo || connected);
  el<HTMLButtonElement>("start").disabled = !ready;
  el("start").textContent = state.status === "complete" ? "Cup complete" : state.status === "running" ? "Match in progress" : ready ? "Start cup →" : "Waiting for players";
  el("start").hidden = state.status === "complete" || failed;
  el("reset").hidden = state.entrants.length === 0 || (state.status === "running" && !failed);
  el("connect").hidden = Boolean(session);
  el<HTMLButtonElement>("connect").disabled = needsLocalhost || connecting || Boolean(session) || state.status !== "registration" || state.entrants.length > 0;
  el<HTMLButtonElement>("disconnect").disabled = !session || state.status === "running";
  el<HTMLButtonElement>("reset").disabled = state.status === "running" && !failed;
  el<HTMLButtonElement>("demo").disabled = connecting || Boolean(session) || state.entrants.length > 0 || state.status !== "registration";
  el("demo-form").hidden = !demo || state.status !== "registration";
  el("demo-fill").hidden = !demo || state.status !== "registration" || state.entrants.length > 0;
  el("retry").hidden = !failed;
  el("instruction").textContent = state.status === "complete" ? "Ready for the next champion?" : state.status === "running" ? "Winners advance automatically." : demo ? "Try a cup with simulated viewers." : solo ? "Send !join name for four fighters in your chat." : connected ? "Join in chat: !join name" : "Connect Twitch to open your lobby.";
  if (!frame && state.status === "registration" && !el("arena").firstElementChild) el("arena").innerHTML = emptyArena;
  const lineup = el("lineup"); lineup.replaceChildren();
  for (let i = 0; i < 4; i++) {
    const entry = state.entrants[i], row = document.createElement("div"); row.className = `lineup-row${entry ? " filled" : ""}`;
    const number = document.createElement("span"); number.className = "slot-number"; number.textContent = `0${i + 1}`;
    row.append(number);
    const text = document.createElement("div");
    const title = document.createElement("strong"), detail = document.createElement("span");
    if (entry) {
      row.append(picture(entry.fighterId));
      title.textContent = label(entry.fighterId); detail.textContent = entry.rehearsalSlot ? `Test slot ${entry.rehearsalSlot}` : entry.displayName;
    } else { title.textContent = "OPEN SLOT"; detail.textContent = ""; }
    text.append(title, detail); row.append(text); lineup.append(row);
  }
  const bracket = el("bracket"); bracket.replaceChildren();
  for (let i = 0; i < 3; i++) {
    const match = state.matches[i];
    const card = document.createElement("article"); card.className = `match ${match?.status === "active" ? "active" : ""}`;
    const heading = document.createElement("h2"); heading.textContent = labels[match?.id ?? ["semi-1", "semi-2", "final"][i]!]!; card.append(heading);
    const ids = match?.fighterIds.length ? match.fighterIds : i < 2 ? state.entrants.slice(i * 2, i * 2 + 2).map(e => e.fighterId) : [];
    for (let j = 0; j < 2; j++) {
      const row = document.createElement("p"); const id = ids[j]; row.textContent = id ? name(id) : i === 2 ? `Semi ${j + 1} winner` : "—";
      if (id && match?.winnerFighterId === id) { row.className = "won"; row.textContent = `WIN · ${row.textContent}`; }
      card.append(row);
    }
    bracket.append(card);
  }
  el("champion").hidden = !state.championFighterId;
  if (state.championFighterId) {
    el("champion").textContent = `CHAMPION · ${name(state.championFighterId)}`;
    el("round").textContent = "CHAMPION CROWNED";
  }
}
function join(message: Pick<TwitchChatMessage, "identity" | "login" | "displayName" | "text"> | { identity: {kind:"local-demo";value:string}; login:string; displayName:string; text:string }): void {
  const command = parseJoinCommand(message.text); if (!command) return;
  // An unknown command names no fighter: the tournament answers `unknown-fighter`.
  const fighterId = twitchCupFighterFor(roster, command.command) ?? "";
  const outcome = joinTwitchTournament(state, { identity: message.identity, login: message.login, displayName: message.displayName, fighterId });
  state = outcome.state;
  activity(outcome.accepted ? `${name(fighterId)} joined!` : `${message.displayName}: ${rejections[outcome.reason ?? ""] ?? "Could not join"}`);
  render();
}
function clearBout(removeFrame = true): void {
  clearTimeout(watchdog); clearTimeout(bootWatchdog); clearTimeout(navigation); clearTimeout(nextMatch);
  if (removeFrame) { frame?.remove(); frame = null; hostReady = false; }
  request = null;
}
function resetCup(): void {
  clearBout(); state = createTwitchTournament(rosterIds()); seeds.clear(); tournamentId = crypto.randomUUID(); failed = false;
  recovery = createTwitchBoutRecovery();
  el("activity").replaceChildren(); el("arena").replaceChildren(); el("champion").textContent = "";
  el("round").textContent = "OPEN LOBBY"; el("pairing").textContent = "Registration open";
  notice(""); render();
}
function failBout(text: string): void {
  failed = true; recovery = twitchBoutFailed(recovery);
  clearTimeout(watchdog); clearTimeout(bootWatchdog); clearTimeout(navigation);
  notice(text); render();
}
function runMatch(automaticRetry = false): void {
  const match = state.matches.find(m => m.id === state.activeMatchId); if (!match || match.fighterIds.length !== 2) return;
  clearBout(false); failed = false;
  if (!automaticRetry) recovery = createTwitchBoutRecovery();
  const seed = seeds.get(match.id) ?? crypto.getRandomValues(new Uint32Array(1))[0]!; seeds.set(match.id, seed);
  // Every scene attempt gets a token, including retries within the same iframe document.
  request = { boutId: `${tournamentId}-${match.id}-${crypto.randomUUID()}`, a: match.fighterIds[0]!, b: match.fighterIds[1]!, seed };
  let newHost = false;
  if (!frame) {
    frame = document.createElement("iframe"); frame.allow = "autoplay; fullscreen";
    el("arena").replaceChildren(frame);
    hostReady = false; newHost = true;
  }
  frame.title = `${labels[match.id]} · ODDBOUT Live battle`;
  const mountedFrame = frame, mountedRequest = request;
  const current = (): boolean => frame === mountedFrame && request === mountedRequest && !failed;
  const boutUrl = createTwitchArenaBoutUrl(new URL("fighter.html", location.href).href, request, "en");
  // Navigate once only. Later bouts replace the Phaser scene through validated parent commands.
  // The boot deadline also covers the initial host or an unresponsive scene command.
  el("round").textContent = labels[match.id]!; el("pairing").textContent = `${name(request.a)} VS ${name(request.b)}`;
  navigation = setTimeout(() => {
    if (!current()) return;
    if (newHost || !hostReady) mountedFrame.src = boutUrl;
    else if (hostReady) mountedFrame.contentWindow?.postMessage({ ...mountedRequest, type: "oddbout:twitch:start-bout" }, location.origin);
  }, 0);
  notice("Preparing the match…");
  bootWatchdog = setTimeout(() => {
    if (!current()) return;
    const outcome = twitchBoutBootTimedOut(recovery); recovery = outcome.state;
    if (outcome.action === "retry") {
      activity(`${labels[match.id]} loading delayed · retrying once with the same fighters and seed`);
      runMatch(true);
    } else if (outcome.action === "fail") {
      failBout("The automatic retry failed. Retry this match to keep the same fighters and seed.");
    }
  }, twitchBoutBootTimeoutMs(mountedRequest));
  render();
}
window.addEventListener("message", event => {
  if (!request || !frame || failed) return;
  if (validateTwitchArenaHostReady(event, location.origin, frame.contentWindow)) {
    if (!hostReady) {
      hostReady = true;
      frame.contentWindow?.postMessage({ ...request, type: "oddbout:twitch:start-bout" }, location.origin);
    }
    return;
  }
  const message = validateTwitchArenaBoutMessage(event, location.origin, frame.contentWindow, request); if (!message) return;
  if (message.type === "oddbout:twitch:bout-ready") {
    if (recovery.phase !== "booting") return;
    recovery = twitchBoutReady(recovery); clearTimeout(bootWatchdog);
    const readyFrame = frame, readyRequest = request;
    watchdog = setTimeout(() => {
      if (frame === readyFrame && request === readyRequest && !failed) failBout("The match timed out. Retry this match to keep the same fighters and seed.");
    }, TWITCH_ARENA_BOUT_TIMEOUT_MS);
    notice(""); return;
  }
  if (message.type === "oddbout:twitch:bout-error") { failBout("Could not load the match. Select Retry match."); return; }
  const matchId = state.activeMatchId; if (!matchId) return;
  const outcome = applyTwitchMatchResult(state, matchId, message.winnerId); if (!outcome.applied) return;
  clearTimeout(watchdog); clearTimeout(bootWatchdog); clearTimeout(navigation);
  recovery = twitchBoutFinished(recovery); request = null; state = outcome.state;
  activity(`${labels[matchId]} winner: ${name(message.winnerId)}`);
  notice(state.status === "complete" ? `Champion: ${name(message.winnerId)}!` : `${name(message.winnerId)} wins! Next match coming up.`);
  render();
  if (state.status === "running") nextMatch = setTimeout(() => runMatch(), 3500);
});

function disconnect(preserveSession = false): void {
  generation++; clearTimeout(authValidation); chat?.disconnect(); chat = null;
  if (!preserveSession) session = null;
  connected = false; connecting = false;
  el("connection").textContent = "Offline"; render();
}
function attachChat(authorized: TwitchSession, stamp: number): void {
  session = authorized;
  chat = new TwitchChatClient({ login: authorized.login, accessToken: authorized.accessToken, channel: authorized.login }, {
    onStatus: status => { if (stamp !== generation) return; connected = status === "connected"; el("connection").textContent = `${authorized.login} · ${status}`; render(); },
    onMessage: message => { if (stamp === generation && !demo) join(message); },
    onError: () => { if (stamp === generation) notice("Chat connection failed. Disconnect and try again."); },
  });
  scheduleValidation(authorized, stamp); chat.connect();
}
function scheduleValidation(current: TwitchSession, stamp: number): void {
  const revalidate = async (): Promise<void> => {
    try {
      const refreshed = await validateTwitchSession(current.accessToken, current.clientId);
      if (stamp !== generation) return; session = refreshed; scheduleValidation(refreshed, stamp);
    } catch { if (stamp === generation) { disconnect(); notice("Your Twitch session expired. Start a new cup and reconnect."); } }
  };
  authValidation = setTimeout(() => { void revalidate(); }, Math.min(3_600_000, Math.max(1000, current.expiresIn * 1000)));
}
async function handleConnect(): Promise<void> {
  if (connecting || state.entrants.length) return;
  const stamp = ++generation; connecting = true; demo = false;
  state = setTwitchSoloRehearsal(state, null).state; render();
  try {
    const authorized = await connectTwitch(el<HTMLInputElement>("client-id").value.trim());
    if (stamp !== generation) return;
    attachChat(authorized, stamp);
  } catch (error) { if (stamp === generation) notice(error instanceof Error ? error.message : "Connection failed."); }
  finally { if (stamp === generation) { connecting = false; render(); } }
}
el("connect").addEventListener("click", () => { void handleConnect(); });
el("disconnect").addEventListener("click", () => { disconnect(); resetCup(); });
el("start").addEventListener("click", () => {
  if (!demo && !connected) return;
  const outcome = startTwitchTournament(state); if (!outcome.started) return;
  state = outcome.state; runMatch();
});
// A manual retry starts a fresh bout document: the failed host, and any registered package it read (one changed mid-cup no longer loads
// there), come in anew. The automatic retry keeps the document and its downloads.
el("retry").addEventListener("click", () => { if (failed) { clearBout(); runMatch(); } });
el("solo").addEventListener("click", () => {
  if (!session || !connected || connecting || demo) return;
  const outcome = setTwitchSoloRehearsal(state, state.registrationPolicy.kind === "solo-rehearsal" ? null : session.userId);
  if (!outcome.changed) return;
  state = outcome.state;
  notice(state.registrationPolicy.kind === "solo-rehearsal"
    ? "Copy join commands from Choose a fighter."
    : "");
  render();
});
el("reset").addEventListener("click", () => {
  if (state.status === "running" && !failed) return;
  resetCup();
});
el("demo").addEventListener("click", () => {
  if (connecting || session || state.status !== "registration" || state.entrants.length) return;
  state = setTwitchSoloRehearsal(state, null).state; demo = true;
  notice(""); render();
});
el("demo-form").addEventListener("submit", event => {
  event.preventDefault(); if (!demo) return;
  const login = el<HTMLInputElement>("demo-name").value.trim().toLowerCase();
  join({ identity: { kind: "local-demo", value: login }, login, displayName: login, text: `!join ${el<HTMLSelectElement>("demo-fighter").value}` });
});
el("demo-fill").addEventListener("click", () => {
  if (!demo || state.entrants.length) return;
  CITY_FIGHTER_IDS.slice(0, 4).forEach((id, i) => join({ identity: { kind: "local-demo", value: `viewer${i + 1}` }, login: `viewer${i + 1}`, displayName: `viewer${i + 1}`, text: `!join ${id}` }));
});
el("theater").addEventListener("click", () => { const active = root.classList.toggle("theater"); el("theater").textContent = active ? "Host view" : "Stream view"; el("theater").setAttribute("aria-pressed", String(active)); });
window.addEventListener("beforeunload", event => { if (state.status === "running") { event.preventDefault(); event.returnValue = ""; } });
window.addEventListener("pagehide", event => {
  clearBout();
  // BFCache retains this document's memory. Keep its account for revalidation on return,
  // while invalidating callbacks and retiring the host and socket that cannot resume safely.
  disconnect(event.persisted);
});
window.addEventListener("pageshow", event => {
  if (!event.persisted) return;
  if (state.status === "running") failBout("The page was restored. Retry this match to keep the same fighters and seed.");
  const current = session;
  if (!current) return;
  const stamp = ++generation; connecting = true; render();
  void validateTwitchSession(current.accessToken, current.clientId).then(refreshed => {
    if (stamp === generation) attachChat(refreshed, stamp);
  }).catch(() => {
    if (stamp === generation) { disconnect(); notice("Your Twitch session expired. Start a new cup and reconnect."); }
  }).finally(() => {
    if (stamp === generation) { connecting = false; render(); }
  });
});
/**
 * Creators' fighters approved to meet others (2026-11-02 — a fighter made with an agent fights in the cup): read once, after the shipped ones. A cup already
 * under way keeps its four; registration open takes them at once. No registry: the shipped fighters only, with one activity line.
 */
async function loadRegisteredFighters(): Promise<void> {
  const base = fighterApiBase();
  try {
    if (!base) throw new Error("no-registry");
    const entries = await fetchCommunityFighters(base);
    for (const entry of entries) if (entry.duelApproved === true && entry.profileSet) registeredCards.set(entry.id, entry.profileSet.card.url);
    roster = twitchCupRoster(CITY_FIGHTER_IDS, entries);
  } catch { activity("Creator fighters are unavailable · shipped fighters only"); return; }
  state = allowTwitchFighters(state, rosterIds());
  renderRoster(); render();
}
render();
void loadRegisteredFighters();
