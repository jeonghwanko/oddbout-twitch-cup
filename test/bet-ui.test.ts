// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { parseTwitchArenaBoutRequest, type TwitchArenaBoutRequest } from "../src/app/TwitchArenaBout";
import type { TwitchChatCallbacks, TwitchChatClientOptions } from "../src/platform/twitchChat";
import type { TwitchSession } from "../src/platform/twitchAuth";
import { STORAGE_KEYS } from "../src/platform/storageKeys";

type ChatHarness = { options: TwitchChatClientOptions; callbacks: TwitchChatCallbacks };
const mocks = vi.hoisted(() => ({ chats: [] as ChatHarness[], authorize: vi.fn(), validate: vi.fn(), registry: vi.fn() }));
vi.mock("../src/platform/twitchAuth", () => ({ connectTwitch: mocks.authorize, validateTwitchSession: mocks.validate }));
vi.mock("../src/platform/registeredFighters", () => ({ fighterApiBase: () => "https://registry.example", fetchCommunityFighters: mocks.registry }));
vi.mock("../src/platform/twitchChat", () => ({
  TwitchChatClient: class {
    constructor(readonly options: TwitchChatClientOptions, readonly callbacks: TwitchChatCallbacks) { mocks.chats.push(this); }
    connect(): void { this.callbacks.onStatus?.("connected"); }
    disconnect(): void { this.callbacks.onStatus?.("stopped"); }
  },
}));

const session: TwitchSession = { login: "streamer", userId: "42", accessToken: "testtoken", clientId: "testclientid123", expiresIn: 3600 };
const timings = { openMs: 20_000, resultHoldMs: 5_000, voidHoldMs: 2_000 };
const el = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(`bet-${id}`) as T;
const click = (id: string): void => el<HTMLButtonElement>(id).click();
const flush = async (): Promise<void> => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const rows = (side: "red" | "blue"): string[] => Array.from(el(`${side}-list`).querySelectorAll("li")).map(li => `${li.className}|${li.querySelector(".amount")!.textContent}|${li.querySelector(".name")!.textContent}`);
let dispose: () => void;
let draws: number;
let listeners: MockInstance<typeof window.addEventListener>;

function say(login: string, text: string, userId = login): void {
  mocks.chats.at(-1)!.callbacks.onMessage?.({ channel: "streamer", login, displayName: login, userId, identity: { kind: "twitch-user-id", value: userId }, messageId: `${login}-${text}-${Math.random()}`, text });
}
function send(frame: HTMLIFrameElement, data: unknown): void {
  window.dispatchEvent(new MessageEvent("message", { origin: location.origin, source: frame.contentWindow, data }));
}
function boot(): { frame: HTMLIFrameElement; request: TwitchArenaBoutRequest; post: ReturnType<typeof vi.spyOn> } {
  const frame = document.querySelector<HTMLIFrameElement>("#bet-arena iframe")!;
  const request = parseTwitchArenaBoutRequest(new URL(frame.src).search)!;
  const post = vi.spyOn(frame.contentWindow!, "postMessage").mockImplementation(() => {});
  send(frame, { type: "oddbout:twitch:host-ready", protocol: 1 });
  send(frame, { ...request, type: "oddbout:twitch:bout-ready" });
  return { frame, request, post };
}
const win = (request: TwitchArenaBoutRequest, corner: 0 | 1) => ({ ...request, type: "oddbout:twitch:bout-result", winnerId: corner === 0 ? request.a : request.b,
  result: { winner: corner, how: "ko", ms: 1000, hp: [0.5, 0], contacts: [3, 1], digest: "1234abcd" } });
async function connectAndOpen(): Promise<void> { click("connect"); await flush(); click("start"); await flush(); }

beforeEach(async () => {
  vi.resetModules(); vi.useFakeTimers(); localStorage.clear();
  mocks.chats.length = 0;
  mocks.authorize.mockReset().mockResolvedValue(session);
  mocks.validate.mockReset().mockResolvedValue(session);
  mocks.registry.mockReset().mockResolvedValue([]);
  document.body.innerHTML = '<main id="test-bet"></main>';
  draws = 0;
  vi.spyOn(crypto, "getRandomValues").mockImplementation(array => { (array as Uint32Array)[0] = ++draws; return array; });
  listeners = vi.spyOn(window, "addEventListener");
  const { mountBetBooth } = await import("../src/bet");
  dispose = mountBetBooth(document.getElementById("test-bet")!, { timings });
  await flush();
});

afterEach(() => {
  dispose();
  for (const [type, listener, options] of listeners.mock.calls) window.removeEventListener(type, listener, options);
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear();
  document.body.replaceChildren();
});

describe("bet booth page", () => {
  it("needs Twitch or the demo before it starts, and reads only chat:read chat", async () => {
    expect(el<HTMLButtonElement>("start").disabled).toBe(true);
    expect(el("signal").textContent).toBe("STANDING BY");
    click("connect"); await flush();
    expect(mocks.chats[0]!.options).toMatchObject({ login: "streamer", channel: "streamer" });
    expect(el<HTMLButtonElement>("start").disabled).toBe(false);
    expect(el<HTMLButtonElement>("demo").disabled).toBe(true);
  });

  it("takes chat bets while open, locks, draws the seed after the lock, runs the bout and pays out into the live ledger", async () => {
    await connectAndOpen();
    expect(el("signal").textContent).toBe("BETS OPEN");
    expect(el("red-name").textContent).toBe("KUMA"); expect(el("blue-name").textContent).toBe("YUME");
    expect(el("matchup").hidden).toBe(false);
    expect(el("clock").textContent).toBe("0:20");
    say("alice", "!bet red 300"); say("bob", "!bet yume 200"); say("cy", "hello there"); say("dee", "!bet red 5000");
    expect(rows("red")).toEqual(["|300|alice"]); expect(rows("blue")).toEqual(["|200|bob"]);
    expect(el("red-count").textContent).toBe("1"); expect(el("odds").textContent).toBe("1.5 : 1");
    expect(el("ticker").textContent).toBe("dee · only 1,000 points");
    expect(document.querySelector("#bet-arena iframe")).toBeNull();
    const drawsBeforeLock = draws;

    await vi.advanceTimersByTimeAsync(20_000);
    expect(el("signal").textContent).toBe("BETS LOCKED"); expect(el("matchup").hidden).toBe(true);
    const bout = boot();
    expect(bout.request).toMatchObject({ a: "kuma", b: "yume", seed: drawsBeforeLock + 1 });
    expect(el("status").textContent).toBe("KUMA vs YUME · fight!");
    say("erin", "!bet blue 10"); expect(el("ticker").textContent).toBe("erin · bets are closed");
    await vi.advanceTimersByTimeAsync(2_600); say("erin", "!bet blue 10"); expect(el("ticker").textContent).toBe(""); // one notice per viewer per 15 s

    send(bout.frame, win(bout.request, 0)); await flush();
    expect(el("signal").textContent).toBe("KUMA WINS"); expect(el("status").textContent).toBe("Payouts to Team Red.");
    expect(rows("red")).toEqual(["won|+200|alice"]); expect(rows("blue")).toEqual(["lost|−200|bob"]);
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.betLedger)!);
    expect(saved).toMatchObject({ version: 1, matches: 1, accounts: { "twitch-user-id:alice": { balance: 1200 }, "twitch-user-id:bob": { balance: 800 } },
      fighters: { kuma: { wins: 1, losses: 0 }, yume: { wins: 0, losses: 1 } } });
    expect(localStorage.getItem(STORAGE_KEYS.betLedgerDemo)).toBeNull();
    expect(el("leaders").textContent).toBe("1alice1,2002bob800");
    expect(el("match-count").textContent).toBe("1 match");
    await vi.advanceTimersByTimeAsync(3_000);
    say("alice", "!balance"); expect(el("ticker").textContent).toBe("alice · 1,200 points");
    say("alice", "!balance"); await vi.advanceTimersByTimeAsync(2_600); expect(el("ticker").textContent).toBe("");

    await vi.advanceTimersByTimeAsync(5_000);
    expect(el("signal").textContent).toBe("BETS OPEN");
    expect(el("red-list").children).toHaveLength(0);
    expect(el("red-record").textContent).toMatch(/^\dW · \dL$/);
    await vi.advanceTimersByTimeAsync(20_000);
    // The next bout runs in the same host document through a validated start message.
    const start = bout.post.mock.calls.at(-1)![0] as TwitchArenaBoutRequest & { type: string };
    expect(start.type).toBe("oddbout:twitch:start-bout");
    expect(document.querySelectorAll("iframe")).toHaveLength(1);
  });

  it("voids a failed bout without moving points, and pauses after three in a row", async () => {
    await connectAndOpen();
    say("alice", "!bet red all");
    for (let failure = 1; failure <= 3; failure++) {
      await vi.advanceTimersByTimeAsync(20_000);
      const bout = boot();
      send(bout.frame, { ...bout.request, type: "oddbout:twitch:bout-error", message: "Could not load the match." }); await flush();
      if (failure < 3) { expect(el("signal").textContent).toBe("MATCH VOID"); await vi.advanceTimersByTimeAsync(2_000); }
    }
    expect(el("signal").textContent).toBe("PAUSED");
    expect(el("status").textContent).toContain("repeated failed bouts");
    expect(el("start").textContent).toBe("Resume betting");
    expect(localStorage.getItem(STORAGE_KEYS.betLedger)).toBeNull();
  });

  it("pauses at once while open and finishes the bout first while fighting", async () => {
    await connectAndOpen(); say("alice", "!bet red 100");
    click("start"); await flush();
    expect(el("signal").textContent).toBe("PAUSED"); expect(document.querySelector("#bet-arena iframe")).toBeNull();
    click("start"); await flush(); await vi.advanceTimersByTimeAsync(20_000);
    const bout = boot();
    click("start"); await flush();
    expect(el("start").textContent).toBe("Pausing after this match…"); expect(el<HTMLButtonElement>("start").disabled).toBe(true);
    send(bout.frame, win(bout.request, 1)); await flush();
    expect(el("signal").textContent).toBe(`${el("blue-name").textContent} WINS`); // the second round avoids the first's matchup
    expect(bout.request.a).toBe("kuma"); expect(bout.request.b).not.toBe("yume");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(el("signal").textContent).toBe("PAUSED");
  });

  it("writes viewer names as text", async () => {
    await connectAndOpen();
    say("x", "!bet red 10", "77");
    mocks.chats.at(-1)!.callbacks.onMessage?.({ channel: "streamer", login: "evil", displayName: '<img src=x onerror="alert(1)">', userId: "66",
      identity: { kind: "twitch-user-id", value: "66" }, messageId: "evil", text: "!bet blue 10" });
    expect(el("blue-list").querySelector("img")).toBeNull();
    expect(rows("blue")).toEqual(['|10|<img src=x onerror="alert(1)">']);
  });

  it("runs a demo with simulated bettors on its own ledger", async () => {
    click("demo"); await flush();
    expect(el("demo-form").hidden).toBe(false); expect(el<HTMLButtonElement>("connect").disabled).toBe(true);
    click("start"); await flush();
    el<HTMLInputElement>("demo-name").value = "Tester"; el<HTMLInputElement>("demo-text").value = "!bet blue 50";
    el("demo-form").dispatchEvent(new Event("submit", { cancelable: true })); await flush();
    expect(el("notice").textContent).toBe("Tester bet 50 on blue.");
    await vi.advanceTimersByTimeAsync(14_000);
    expect(el("red-list").children.length + el("blue-list").children.length).toBe(7);
    await vi.advanceTimersByTimeAsync(6_000);
    const bout = boot(); send(bout.frame, win(bout.request, 1)); await flush();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.betLedgerDemo)!).matches).toBe(1);
    expect(localStorage.getItem(STORAGE_KEYS.betLedger)).toBeNull();
    expect(el("ledger-info").textContent).toMatch(/^Demo ledger · \d viewers · 1 match$/);
  });

  it("voids the round and stops when the page is hidden, and toggles the stream view", async () => {
    await connectAndOpen(); say("alice", "!bet red 100");
    click("theater");
    expect(document.getElementById("test-bet")!.classList.contains("theater")).toBe(true);
    expect(el("theater").textContent).toBe("Host view");
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false })); await flush();
    expect(el("signal").textContent).toBe("PAUSED");
    expect(el("connection").textContent).toBe("Offline");
    expect(localStorage.getItem(STORAGE_KEYS.betLedger)).toBeNull();
  });
});
