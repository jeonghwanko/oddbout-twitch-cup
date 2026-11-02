// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseTwitchArenaBoutRequest, twitchBoutBootTimeoutMs, TWITCH_ARENA_BOUT_TIMEOUT_MS, type TwitchArenaBoutRequest } from "../src/app/TwitchArenaBout";
import { mountBroadcast } from "../src/broadcast";

const input = { jobId: "private-job-1", leaseToken: "private-lease-1", seed: 123, fighterIds: ["kuma", "yume", "bravow", "beotim"] };
let dispose: () => void;
const flush = async (): Promise<void> => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const frame = (): HTMLIFrameElement => document.querySelector("iframe")!;
const send = (source: HTMLIFrameElement, data: unknown, origin = location.origin): void => { window.dispatchEvent(new MessageEvent("message", { source: source.contentWindow, origin, data })); };
const result = (request: TwitchArenaBoutRequest) => ({ ...request, type: "oddbout:twitch:bout-result", winnerId: request.a, result: { winner: 0, how: "ko", ms: 1234, hp: [0.6, 0], contacts: [3, 1], digest: "1234abcd" } });
function boot(): { mounted: HTMLIFrameElement; request: TwitchArenaBoutRequest; post: ReturnType<typeof vi.spyOn> } {
  const mounted = frame(); const request = parseTwitchArenaBoutRequest(new URL(mounted.src).search)!;
  const post = vi.spyOn(mounted.contentWindow!, "postMessage").mockImplementation(() => {});
  send(mounted, { type: "oddbout:twitch:host-ready", protocol: 1 });
  send(mounted, { ...request, type: "oddbout:twitch:bout-ready" });
  return { mounted, request, post };
}

beforeEach(() => { vi.useFakeTimers(); document.body.innerHTML = '<main id="test-broadcast"></main>'; dispose = mountBroadcast(document.getElementById("test-broadcast")!); });
afterEach(async () => { dispose(); await flush(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); document.body.replaceChildren(); });

describe("broadcast browser API with the real bracket and iframe message contract", () => {
  it("starts only on command; runs all three validated bouts in one host and returns raw battle evidence", async () => {
    expect(window.oddboutBroadcast.protocolVersion).toBe(1); expect(frame()).toBeNull();
    const pending = window.oddboutBroadcast.runCup(input); await flush();
    const first = boot(); let current = first.request;
    for (let index = 0; index < 3; index++) {
      send(first.mounted, result(current)); await flush();
      if (index < 2) { current = first.post.mock.calls.at(-1)![0] as TwitchArenaBoutRequest; send(first.mounted, { ...current, type: "oddbout:twitch:bout-ready" }); }
    }
    const completed = await pending;
    expect(completed).toMatchObject({ protocolVersion: 1, jobId: input.jobId, leaseToken: input.leaseToken, winnerId: "kuma", seed: 123 });
    expect(completed.bouts.map(bout => [bout.leftId, bout.rightId, bout.seed, bout.digest])).toEqual([["kuma", "yume", 123, "1234abcd"], ["bravow", "beotim", 124, "1234abcd"], ["kuma", "bravow", 125, "1234abcd"]]);
    expect(document.querySelectorAll("iframe")).toHaveLength(1);
    expect(document.getElementById("broadcast-champion")!.textContent).toBe("KUMA");
    expect(document.body.textContent).not.toContain(input.jobId); expect(document.body.textContent).not.toContain(input.leaseToken);
    expect(await window.oddboutBroadcast.runCup(input)).toEqual(completed);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("requires host-ready/start and bout-ready; rejects wrong origins/windows/ids/fighters/seeds and stale results", async () => {
    const pending = window.oddboutBroadcast.runCup(input); const rejected = expect(pending).rejects.toThrow("broadcast_cancelled"); await flush();
    const mounted = frame(); const request = parseTwitchArenaBoutRequest(new URL(mounted.src).search)!;
    send(mounted, { ...request, type: "oddbout:twitch:bout-ready" });
    send(mounted, result(request)); expect(window.oddboutBroadcast.getStatus().bouts).toHaveLength(0);
    const first = boot();
    send(mounted, result(request), "https://attacker.test");
    window.dispatchEvent(new MessageEvent("message", { source: window, origin: location.origin, data: result(request) }));
    for (const change of [{ boutId: "stale" }, { a: "beotim" }, { b: "beotim" }, { seed: 124 }, { winnerId: "bravow" }]) send(mounted, { ...result(request), ...change });
    expect(window.oddboutBroadcast.getStatus().bouts).toHaveLength(0);
    send(mounted, result(first.request)); await flush();
    send(mounted, result(first.request)); await flush(); expect(window.oddboutBroadcast.getStatus().bouts).toHaveLength(1);
    window.oddboutBroadcast.cancel(); await rejected;
  });

  it("retransmits the current start token on each host-ready and never treats readiness as a win", async () => {
    const pending = window.oddboutBroadcast.runCup(input); const rejected = expect(pending).rejects.toThrow(); await flush();
    const first = boot();
    send(first.mounted, { type: "oddbout:twitch:host-ready", protocol: 1 });
    expect(first.post).toHaveBeenCalledTimes(2);
    for (const [data, origin] of first.post.mock.calls) { expect(data).toEqual({ ...first.request, type: "oddbout:twitch:start-bout" }); expect(origin).toBe(location.origin); }
    expect(window.oddboutBroadcast.getStatus().bouts).toHaveLength(0); window.oddboutBroadcast.cancel(); await rejected;
  });

  it.each(["error", "boot-timeout", "fight-timeout", "pagehide"])("rejects %s without inventing results and clears iframe/watchdogs/listeners", async failure => {
    const pending = window.oddboutBroadcast.runCup(input); const rejected = expect(pending).rejects.toThrow(); await flush();
    const mounted = frame(); const request = parseTwitchArenaBoutRequest(new URL(mounted.src).search)!;
    if (failure === "error") send(mounted, { ...request, type: "oddbout:twitch:bout-error", message: "Could not load fighter" });
    if (failure === "boot-timeout") await vi.advanceTimersByTimeAsync(twitchBoutBootTimeoutMs(request));
    if (failure === "fight-timeout") { boot(); await vi.advanceTimersByTimeAsync(TWITCH_ARENA_BOUT_TIMEOUT_MS); }
    if (failure === "pagehide") window.dispatchEvent(new PageTransitionEvent("pagehide"));
    await rejected; expect(window.oddboutBroadcast.getStatus().bouts).toHaveLength(0); expect(frame()).toBeNull(); expect(vi.getTimerCount()).toBe(0);
    send(mounted, result(request)); await flush(); expect(window.oddboutBroadcast.getStatus().bouts).toHaveLength(0);
  });

  it.each(["load", "early host-ready"])("treats iframe document replacement (%s) as failure before replaying the active bout", async event => {
    const pending = window.oddboutBroadcast.runCup(input); const rejected = expect(pending).rejects.toThrow("broadcast_execution_failed"); await flush();
    const current = boot();
    vi.spyOn(current.mounted, "contentDocument", "get").mockReturnValue(document.implementation.createHTMLDocument());
    if (event === "load") current.mounted.dispatchEvent(new Event("load"));
    else send(current.mounted, { type: "oddbout:twitch:host-ready", protocol: 1 });
    await rejected;
    send(current.mounted, { type: "oddbout:twitch:host-ready", protocol: 1 });
    expect(current.post).toHaveBeenCalledTimes(1);
    expect(window.oddboutBroadcast.getStatus()).toMatchObject({ status: "failed", bouts: [] });
    expect(frame()).toBeNull(); expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["error", "cancel"])("a %s after a completed semifinal cannot poison the next cup's fresh iframe document", async failure => {
    const original = window.oddboutBroadcast.runCup(input); const rejected = expect(original).rejects.toThrow(); await flush();
    const first = boot(); send(first.mounted, result(first.request)); await flush();
    const second = first.post.mock.calls.at(-1)![0] as TwitchArenaBoutRequest;
    send(first.mounted, { ...second, type: "oddbout:twitch:bout-ready" });
    if (failure === "cancel") window.oddboutBroadcast.cancel();
    else send(first.mounted, { ...second, type: "oddbout:twitch:bout-error", message: "Observed host failure" });
    await rejected; expect(frame()).toBeNull(); expect(vi.getTimerCount()).toBe(0);
    const nextInput = { ...input, jobId: "private-job-next", leaseToken: "private-lease-next", seed: 200 };
    const next = window.oddboutBroadcast.runCup(nextInput); await flush();
    expect(window.oddboutBroadcast.getStatus()).toMatchObject({ status: "running", bouts: [] });
    const fresh = boot(); expect(fresh.mounted).not.toBe(first.mounted);
    send(first.mounted, { type: "oddbout:twitch:host-ready", protocol: 1 }); send(first.mounted, result(second)); await flush();
    expect(fresh.post).toHaveBeenCalledTimes(1); expect(window.oddboutBroadcast.getStatus().bouts).toHaveLength(0);
    let current = fresh.request;
    for (let index = 0; index < 3; index++) {
      send(fresh.mounted, result(current)); await flush();
      if (index < 2) { current = fresh.post.mock.calls.at(-1)![0] as TwitchArenaBoutRequest; send(fresh.mounted, { ...current, type: "oddbout:twitch:bout-ready" }); }
    }
    expect((await next).bouts.map(bout => bout.seed)).toEqual([200, 201, 202]);
    expect(window.oddboutBroadcast.getStatus().status).toBe("completed"); expect(vi.getTimerCount()).toBe(0);
    await expect(window.oddboutBroadcast.runCup(input)).rejects.toThrow();
  });
});
