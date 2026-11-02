// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { validateTwitchArenaBoutMessage, type TwitchArenaBoutRequest } from "../src/app/TwitchArenaBout";
import { readRuntimeOptions } from "../src/app/RuntimeOptions";
import type { CityFightBoutResult } from "../src/sim/cityFight/bout/CityFightFighterBout";

type Broadcast = { onReady: () => void; onResult: (result: CityFightBoutResult) => void; onError: (message: string) => void };
const mocks = vi.hoisted(() => ({ boot: vi.fn(), moduleReady: vi.fn(), load: vi.fn(), addScene: vi.fn(), broadcasts: [] as Broadcast[] }));
vi.mock("phaser", () => ({ default: { Scene: class { constructor(_key: string) {} } } }));
vi.mock("../src/render/boot/GameBoot", () => ({ bootGame: mocks.boot }));
vi.mock("../src/render/audio/sfx", () => ({ sfx: { shutdown: vi.fn() } }));
vi.mock("../src/render/art/CityFighterPacks", () => ({ loadCityFighterPack: mocks.load }));
vi.mock("../src/render/art/RegisteredArenaFighters", () => ({ prepareRegisteredCupFighter: vi.fn(), registeredArenaDuelReady: () => true }));

const first: TwitchArenaBoutRequest = { boutId: "cup-semi-1", a: "kuma", b: "yume", seed: 123 };
const next: TwitchArenaBoutRequest = { boutId: "cup-semi-2", a: "yume", b: "bravow", seed: 456 };
const result: CityFightBoutResult = { winner: 0, how: "ko", ms: 1000, hp: [0.5, 0], contacts: [1, 1], digest: "1234abcd" };
const flush = async (): Promise<void> => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
let post: MockInstance<typeof window.postMessage>;
let bootTwitchArenaBout: typeof import("../src/render/boot/TwitchArenaBoot").bootTwitchArenaBout;

beforeEach(async () => {
  vi.resetModules(); vi.useFakeTimers(); mocks.broadcasts.length = 0;
  mocks.moduleReady.mockReset().mockResolvedValue(undefined);
  vi.doMock("../src/render/scenes/ArenaDuelScene", async () => {
    await mocks.moduleReady();
    return { ArenaDuelScene: class { init(data: { broadcast: Broadcast }): void { mocks.broadcasts.push(data.broadcast); } } };
  });
  mocks.load.mockReset().mockResolvedValue({}); mocks.addScene.mockReset(); mocks.boot.mockReset();
  const scenes = new Map<string, unknown>();
  const game = {
    loop: { stop: vi.fn() },
    scene: {
      getScene: (key: string) => scenes.get(key), pause: vi.fn(), stop: vi.fn(),
      remove: (key: string) => scenes.delete(key),
      add: mocks.addScene.mockImplementation((key: string, Scene: new () => { init: () => void }) => {
        const scene = new Scene(); scenes.set(key, scene); scene.init();
      }),
    },
  };
  mocks.boot.mockImplementation(async (spec: { scenes: (new () => { game: unknown; create: () => void })[] }) => {
    const host = new spec.scenes[0]!(); host.game = game; host.create(); return game;
  });
  post = vi.spyOn(window.parent, "postMessage").mockImplementation(() => {});
  ({ bootTwitchArenaBout } = await import("../src/render/boot/TwitchArenaBoot"));
});

afterEach(() => {
  window.dispatchEvent(new PageTransitionEvent("pagehide"));
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks();
});

async function boot(): Promise<void> {
  await bootTwitchArenaBout(first, readRuntimeOptions("?lang=en"));
  await vi.dynamicImportSettled();
}
async function start(request: TwitchArenaBoutRequest): Promise<void> {
  window.dispatchEvent(new MessageEvent("message", { origin: location.origin, source: window.parent,
    data: { ...request, type: "oddbout:twitch:start-bout" } }));
  await flush();
}
function messages(request: TwitchArenaBoutRequest) {
  return post.mock.calls.map(([data]) => validateTwitchArenaBoutMessage({ origin: location.origin, source: window.parent, data },
    location.origin, window.parent, request)).filter(message => message !== null);
}

describe("Twitch arena host recovery", () => {
  it("boots with the broadcast timer and unsmoothed frame policy", async () => {
    await boot();
    expect(mocks.boot).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      frameRate: expect.objectContaining({ target: 60, limit: 0, forceSetTimeOut: true, smoothStep: false }),
    }));
  });

  it("runs sequential bouts in one host with each attempt's own lifecycle messages", async () => {
    await boot();
    await start(first); mocks.broadcasts[0]!.onReady(); mocks.broadcasts[0]!.onResult(result);
    await start(next); mocks.broadcasts[1]!.onReady(); mocks.broadcasts[1]!.onResult(result);
    expect(mocks.addScene).toHaveBeenCalledTimes(2);
    for (const request of [first, next]) expect(messages(request).map(message => message.type))
      .toEqual(["oddbout:twitch:bout-ready", "oddbout:twitch:bout-result"]);
  });

  it.each(["error", "unhandledrejection"])("rejects a new bout immediately after a completed bout and global %s", async event => {
    await boot();
    await start(first); mocks.broadcasts[0]!.onReady(); mocks.broadcasts[0]!.onResult(result);
    window.dispatchEvent(new Event(event));
    await start(next);
    expect(messages(next)).toEqual([expect.objectContaining({ ...next, type: "oddbout:twitch:bout-error" })]);
    expect(mocks.addScene).toHaveBeenCalledTimes(1);
    expect(mocks.load).toHaveBeenCalledTimes(2);
  });

  it("fails an active bout on a global error and rejects later requests without creating a scene", async () => {
    await boot();
    await start(first); mocks.broadcasts[0]!.onReady();
    window.dispatchEvent(new ErrorEvent("error", { message: "render failure" }));
    expect(messages(first).at(-1)?.type).toBe("oddbout:twitch:bout-error");
    await start(next);
    expect(messages(next).map(message => message.type)).toEqual(["oddbout:twitch:bout-error"]);
    expect(mocks.addScene).toHaveBeenCalledTimes(1);
  });

  it("allows a new request after an ordinary fighter load failure", async () => {
    await boot();
    mocks.load.mockResolvedValueOnce(null);
    await start(first);
    expect(messages(first).map(message => message.type)).toEqual(["oddbout:twitch:bout-error"]);
    await start(next); mocks.broadcasts[0]!.onReady();
    expect(messages(next).map(message => message.type)).toEqual(["oddbout:twitch:bout-ready"]);
    expect(mocks.addScene).toHaveBeenCalledTimes(1);
  });

  it("allows a new request after an ordinary scene-reported bout error", async () => {
    await boot();
    await start(first); mocks.broadcasts[0]!.onError("art failed");
    await start(next); mocks.broadcasts[1]!.onReady();
    expect(messages(first).map(message => message.type)).toEqual(["oddbout:twitch:bout-error"]);
    expect(messages(next).map(message => message.type)).toEqual(["oddbout:twitch:bout-ready"]);
    expect(mocks.addScene).toHaveBeenCalledTimes(2);
  });

  it("boots the game while the arena module is pending, then fulfills the queued start", async () => {
    let release!: () => void;
    mocks.moduleReady.mockReturnValue(new Promise<void>(resolve => { release = resolve; }));
    const pendingBoot = bootTwitchArenaBout(first, readRuntimeOptions("?lang=en"));
    await flush();
    expect(mocks.boot).toHaveBeenCalledTimes(1);
    expect(post.mock.calls.some(([data]) => data.type === "oddbout:twitch:host-ready")).toBe(true);
    await start(first);
    expect(mocks.addScene).not.toHaveBeenCalled();
    release(); await pendingBoot; await vi.dynamicImportSettled(); await flush();
    expect(mocks.addScene).toHaveBeenCalledTimes(1);
    mocks.broadcasts[0]!.onReady();
    expect(messages(first).map(message => message.type)).toEqual(["oddbout:twitch:bout-ready"]);
  });

  it("does not start late resources after the host is disposed", async () => {
    let release!: () => void;
    mocks.moduleReady.mockReturnValue(new Promise<void>(resolve => { release = resolve; }));
    const pendingBoot = bootTwitchArenaBout(first, readRuntimeOptions("?lang=en"));
    await flush(); await start(first);
    window.dispatchEvent(new PageTransitionEvent("pagehide"));
    release(); await pendingBoot; await vi.dynamicImportSettled(); await flush();
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.addScene).not.toHaveBeenCalled();
    expect(messages(first)).toEqual([]);
  });

  it("starts only the newest token when commands arrive while resources are pending", async () => {
    let release!: () => void;
    mocks.moduleReady.mockReturnValue(new Promise<void>(resolve => { release = resolve; }));
    const pendingBoot = bootTwitchArenaBout(first, readRuntimeOptions("?lang=en"));
    await flush(); await start(first); await start(next); await start(next);
    release(); await pendingBoot; await vi.dynamicImportSettled(); await flush();
    expect(mocks.addScene).toHaveBeenCalledTimes(1);
    expect(mocks.load).toHaveBeenCalledTimes(2);
    mocks.broadcasts[0]!.onReady();
    expect(messages(first)).toEqual([]);
    expect(messages(next).map(message => message.type)).toEqual(["oddbout:twitch:bout-ready"]);
  });

  it.each([false, true])("observes a rejected arena import with a queued start = %s", async queued => {
    let reject!: (error: Error) => void;
    mocks.moduleReady.mockReturnValue(new Promise<void>((_resolve, fail) => { reject = fail; }));
    const pendingBoot = bootTwitchArenaBout(first, readRuntimeOptions("?lang=en"));
    await flush();
    if (queued) await start(first);
    reject(new Error("module unavailable"));
    await pendingBoot; await vi.dynamicImportSettled(); await flush();
    expect(messages(first).map(message => message.type)).toEqual(["oddbout:twitch:bout-error"]);
    await start(next);
    expect(messages(next).map(message => message.type)).toEqual(["oddbout:twitch:bout-error"]);
    expect(mocks.addScene).not.toHaveBeenCalled();
  });
});
