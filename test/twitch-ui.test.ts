// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { parseTwitchArenaBoutRequest, twitchBoutBootTimeoutMs, type TwitchArenaBoutRequest } from "../src/app/TwitchArenaBout";
import { CITY_FIGHTER_IDS } from "../src/sim/cityFight/CityFighterIds";
import type { TwitchChatCallbacks, TwitchChatClientOptions } from "../src/platform/twitchChat";
import type { TwitchSession } from "../src/platform/twitchAuth";

type ChatHarness = { options: TwitchChatClientOptions; callbacks: TwitchChatCallbacks; disconnect: () => void };
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
const element = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const click = (id: string): void => element<HTMLButtonElement>(id).click();
const flush = async (): Promise<void> => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
let listeners: MockInstance<typeof window.addEventListener>;

beforeEach(async () => {
  vi.resetModules(); vi.useFakeTimers();
  mocks.chats.length = 0;
  mocks.authorize.mockReset().mockResolvedValue(session);
  mocks.validate.mockReset().mockResolvedValue(session);
  mocks.registry.mockReset().mockResolvedValue([]);
  document.body.innerHTML = '<main id="twitch-cup"></main>';
  let seed = 100;
  vi.spyOn(crypto, "getRandomValues").mockImplementation(array => { (array as Uint32Array)[0] = ++seed; return array; });
  listeners = vi.spyOn(window, "addEventListener");
  await import("../src/twitch");
  await flush();
});

afterEach(() => {
  window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false }));
  for (const [type, listener, options] of listeners.mock.calls) window.removeEventListener(type, listener, options);
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, "clipboard");
  document.body.replaceChildren();
});

async function connect(): Promise<void> { click("connect"); await flush(); }
function viewer(index: number, chat = mocks.chats.at(-1)!): void {
  chat.callbacks.onMessage?.({ channel: "streamer", login: `viewer${index}`, displayName: `Viewer ${index}`,
    userId: String(index), identity: { kind: "twitch-user-id", value: String(index) }, messageId: `message${index}`,
    text: `!join ${CITY_FIGHTER_IDS[index - 1]}` });
}
function send(frame: HTMLIFrameElement, data: unknown): void {
  window.dispatchEvent(new MessageEvent("message", { origin: location.origin, source: frame.contentWindow, data }));
}
async function start(): Promise<{ frame: HTMLIFrameElement; request: TwitchArenaBoutRequest; post: ReturnType<typeof vi.spyOn> }> {
  click("start"); await vi.advanceTimersByTimeAsync(0);
  const frame = document.querySelector<HTMLIFrameElement>("#arena iframe")!;
  const request = parseTwitchArenaBoutRequest(new URL(frame.src).search)!;
  const post = vi.spyOn(frame.contentWindow!, "postMessage").mockImplementation(() => {});
  send(frame, { type: "oddbout:twitch:host-ready", protocol: 1 });
  send(frame, { ...request, type: "oddbout:twitch:bout-ready" });
  return { frame, request, post };
}
function result(frame: HTMLIFrameElement, request: TwitchArenaBoutRequest): void {
  send(frame, { ...request, type: "oddbout:twitch:bout-result", winnerId: request.a,
    result: { winner: 0, how: "ko", ms: 1000, hp: [0.5, 0], contacts: [1, 1], digest: "1234abcd" } });
}

describe("Twitch Cup browser controls", () => {
  it("shows the validated host failure reason without changing the bracket", async () => {
    await connect(); for (let i = 1; i <= 4; i++) viewer(i);
    const bout = await start();
    const message = "The battle exceeded its time limit. Retry this match.";
    send(bout.frame, { ...bout.request, type: "oddbout:twitch:bout-error", message });
    expect(element("notice").textContent).toBe(message);
    expect(element("retry").hidden).toBe(false);
    expect(element("round").textContent).toBe("Semifinal 1");
    expect(document.querySelector("#bracket .won")).toBeNull();
  });

  it("resends the retry token on fresh host-ready after a stale document's ready was accepted", async () => {
    await connect(); for (let i = 1; i <= 4; i++) viewer(i);
    click("start"); await vi.advanceTimersByTimeAsync(0);
    const frame = document.querySelector<HTMLIFrameElement>("#arena iframe")!;
    const initial = parseTwitchArenaBoutRequest(new URL(frame.src).search)!;
    await vi.advanceTimersByTimeAsync(twitchBoutBootTimeoutMs(initial) + 1);
    const retry = parseTwitchArenaBoutRequest(new URL(frame.src).search)!;
    expect(retry).toMatchObject({ a: initial.a, b: initial.b, seed: initial.seed });
    expect(retry.boutId).not.toBe(initial.boutId);
    const post = vi.spyOn(frame.contentWindow!, "postMessage").mockImplementation(() => {});
    // A queued ready from the old document has the same WindowProxy after navigation.
    // Its start can be lost before the replacement document installs its listener.
    send(frame, { type: "oddbout:twitch:host-ready", protocol: 1 });
    expect(post).toHaveBeenCalledTimes(1);
    send(frame, { type: "oddbout:twitch:host-ready", protocol: 1 });
    expect(post).toHaveBeenCalledTimes(2);
    for (const [data, origin] of post.mock.calls) {
      expect(data).toEqual({ ...retry, type: "oddbout:twitch:start-bout" });
      expect(origin).toBe(location.origin);
    }
    send(frame, { ...retry, type: "oddbout:twitch:bout-ready" });
    result(frame, retry);
    expect(document.querySelector("#bracket .match .won")).not.toBeNull();
    expect(element("retry").hidden).toBe(true);
  });

  it("links the wordmark to the standalone cup entry", () => {
    expect(document.querySelector<HTMLAnchorElement>(".wordmark")!.getAttribute("href")).toBe("./twitch.html");
  });

  it.each(["missing", "rejected", "throws"])("shows a manual command when clipboard access is %s", async failure => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: failure === "missing" ? undefined : {
      writeText: failure === "throws" ? () => { throw new Error("unavailable"); } : vi.fn().mockRejectedValue(new Error("denied")),
    } });
    const chip = document.querySelector<HTMLButtonElement>(".fighter-chip")!;
    const command = chip.querySelector("code")!.textContent;
    chip.click(); await flush();
    expect(element("notice").textContent).toBe(`Type ${command} in chat.`);
    expect(chip.querySelector("code")!.textContent).toBe(command);
  });

  it("disconnects a completed cup into a clean lobby and gives the next cup fresh seeds", async () => {
    await connect(); for (let i = 1; i <= 4; i++) viewer(i);
    const bout = await start();
    let request = bout.request;
    for (let i = 0; i < 3; i++) {
      result(bout.frame, request);
      if (i < 2) {
        await vi.advanceTimersByTimeAsync(3501);
        request = bout.post.mock.calls.at(-1)![0] as TwitchArenaBoutRequest;
        send(bout.frame, { ...request, type: "oddbout:twitch:bout-ready" });
      }
    }
    expect(element("twitch-cup").dataset.phase).toBe("complete");
    expect(element("round").textContent).toBe("CHAMPION CROWNED");
    click("disconnect");
    expect(element("twitch-cup").dataset.phase).toBe("registration");
    expect(document.querySelector("#arena iframe")).toBeNull();
    expect(document.querySelector("#arena .arena-empty")).not.toBeNull();
    expect(element("round").textContent).toBe("OPEN LOBBY");
    expect(element("pairing").textContent).toBe("Registration open");
    expect(element("champion").textContent).toBe("");
    expect(element("count").textContent).toBe("0 / 4");
    expect(element("activity").children).toHaveLength(0);
    click("demo"); click("demo-fill");
    const next = await start();
    expect(next.request.seed).not.toBe(bout.request.seed);
    expect(next.request.boutId.slice(0, 36)).not.toBe(bout.request.boutId.slice(0, 36));
  });

  it("restores a cached running cup with a retry that preserves fighters and seed", async () => {
    await connect(); for (let i = 1; i <= 4; i++) viewer(i);
    const previous = await start();
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
    expect(document.querySelector("#arena iframe")).toBeNull();
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    await flush();
    expect(element("retry").hidden).toBe(false);
    expect(element<HTMLButtonElement>("reset").disabled).toBe(false);
    click("retry"); await vi.advanceTimersByTimeAsync(0);
    const frame = document.querySelector<HTMLIFrameElement>("#arena iframe")!;
    const request = parseTwitchArenaBoutRequest(new URL(frame.src).search)!;
    expect(request).toMatchObject({ a: previous.request.a, b: previous.request.b, seed: previous.request.seed });
    expect(request.boutId).not.toBe(previous.request.boutId);
    result(previous.frame, previous.request);
    expect(element("round").textContent).toBe("Semifinal 1");
    expect(mocks.validate).toHaveBeenCalledWith(session.accessToken, session.clientId);
    expect(mocks.authorize).toHaveBeenCalledTimes(1);
  });

  it("revalidates the cached account and preserves registration while ignoring the retired chat", async () => {
    await connect(); viewer(1);
    const retired = mocks.chats[0]!;
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
    viewer(2, retired);
    expect(element("count").textContent).toBe("1 / 4");
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    await flush();
    expect(mocks.chats).toHaveLength(2);
    expect(mocks.chats[1]!.options.channel).toBe(session.login);
    for (let i = 2; i <= 4; i++) viewer(i);
    expect(element("count").textContent).toBe("4 / 4");
    expect(element<HTMLButtonElement>("start").disabled).toBe(false);
  });

  it("allows a new connection after a pending popup resolves while the page is cached", async () => {
    let authorize!: (value: TwitchSession) => void;
    mocks.authorize.mockReturnValue(new Promise<TwitchSession>(resolve => { authorize = resolve; }));
    click("connect");
    expect(element<HTMLButtonElement>("connect").disabled).toBe(true);
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    authorize(session); await flush();
    expect(mocks.chats).toHaveLength(0);
    expect(element<HTMLButtonElement>("connect").disabled).toBe(false);
    expect(element("connect").hidden).toBe(false);
  });

  it("offers a clean reconnect when the cached account has expired", async () => {
    await connect(); viewer(1);
    mocks.validate.mockRejectedValueOnce(new Error("expired"));
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    await flush();
    expect(element("notice").textContent).toContain("session expired");
    expect(element("reset").hidden).toBe(false);
    expect(element<HTMLButtonElement>("reset").disabled).toBe(false);
    click("reset");
    expect(element<HTMLButtonElement>("connect").disabled).toBe(false);
    expect(element("count").textContent).toBe("0 / 4");
  });

  it("clears a failed demo cup and its retired host before starting a new cup", async () => {
    click("demo"); click("demo-fill");
    const previous = await start();
    send(previous.frame, { ...previous.request, type: "oddbout:twitch:bout-error", message: "failed" });
    expect(element("retry").hidden).toBe(false);
    click("reset");
    expect(element("retry").hidden).toBe(true);
    expect(element("notice").textContent).toBe("");
    expect(element("count").textContent).toBe("0 / 4");
    expect(element("round").textContent).toBe("OPEN LOBBY");
    expect(document.querySelector("#arena iframe")).toBeNull();
    click("demo-fill");
    const next = await start();
    result(previous.frame, previous.request);
    expect(element("round").textContent).toBe("Semifinal 1");
    expect(next.request.seed).not.toBe(previous.request.seed);
  });
});
