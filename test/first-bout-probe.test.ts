// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi, type MockInstance } from "vitest";

const probe = readFileSync("scripts/first-bout-probe.js", "utf8");
const upload = vi.fn();
let listeners: MockInstance<typeof window.addEventListener>;
let clicks: MockInstance<typeof document.addEventListener>;
let frame: HTMLIFrameElement;

beforeEach(() => {
  document.body.innerHTML = '<button id="start">Start cup</button><div id="arena"><iframe></iframe></div>';
  frame = document.querySelector("iframe")!;
  frame.src = `${location.origin}/fighter.html?twitchBout=first&fighter=kuma&opponent=yume&bout=1`;
  Object.defineProperty(frame.contentWindow, "__firstBoutSnapshot", { configurable: true, value: () => ({
    originTime: 1000, visibility: [{ at: 0, hidden: false }], errors: [],
    resources: [{ path: "/assets/engine.js", transfer: 500, encoded: 200, decoded: 600, status: 200 }],
  }) });
  vi.stubGlobal("performance", { timeOrigin: 1000, now: () => 10,
    setResourceTimingBufferSize: () => {}, getEntriesByType: () => [] });
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  upload.mockReset().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", upload);
  listeners = vi.spyOn(window, "addEventListener");
  clicks = vi.spyOn(document, "addEventListener");
  window.eval(probe);
  document.querySelector<HTMLButtonElement>("#start")!.click();
});
afterEach(() => {
  for (const [type, listener, options] of listeners.mock.calls) window.removeEventListener(type, listener, options);
  for (const [type, listener, options] of clicks.mock.calls) document.removeEventListener(type, listener, options);
  Reflect.deleteProperty(window, "__firstBoutSnapshot");
  vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren();
});
const send = (type: string, boutId = "first") => window.dispatchEvent(new MessageEvent("message", {
  origin: location.origin, source: frame.contentWindow, data: { type: `oddbout:twitch:${type}`, boutId, a: "kuma", b: "yume", seed: 1, message: "art failed" },
}));
const reports = () => upload.mock.calls.map(([, init]) => JSON.parse(init.body));
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

it("records a complete visible uncached sample exactly once", async () => {
  send("bout-ready"); send("bout-ready"); await flush();
  expect(reports()).toHaveLength(1);
  expect(reports()[0]).toMatchObject({ kind: "ready", frameEncodedBytes: 200, cacheHits: [] });
});
it("never relabels an errored first attempt as a successful cold sample", async () => {
  send("bout-error"); send("bout-ready"); await flush();
  expect(reports().map(r => r.kind)).toEqual(["error", "invalid"]);
  expect(document.querySelector("output")!.textContent).toContain("invalid");
});
it("rejects missing iframe timings instead of claiming zero cache hits and bytes", async () => {
  Reflect.deleteProperty(frame.contentWindow!, "__firstBoutSnapshot");
  send("bout-ready"); await flush();
  expect(reports()[0].kind).toBe("invalid");
});
it("rejects a retry's ready even when no first-attempt error was received", async () => {
  send("bout-ready", "retry"); await flush();
  expect(reports()[0].kind).toBe("invalid");
});
it.each([0, 300, 503])("rejects cached or failed resource evidence (%s)", async transfer => {
  Object.defineProperty(frame.contentWindow, "__firstBoutSnapshot", { value: () => ({
    originTime: 1000, visibility: [{ at: 0, hidden: false }], errors: [],
    resources: [{ path: "/assets/engine.js", transfer, encoded: 200, decoded: 600, status: transfer === 503 ? 503 : 200 }],
  }) });
  send("bout-ready"); await flush();
  expect(reports()[0].kind).toBe("invalid");
});
it("rejects a sample that became hidden after Start", async () => {
  vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  document.dispatchEvent(new Event("visibilitychange"));
  send("bout-ready"); await flush();
  expect(reports()[0].kind).toBe("invalid");
});
it.each(["http", "network"])("shows a recording failure instead of success on %s failure", async failure => {
  if (failure === "http") upload.mockResolvedValue({ ok: false });
  else upload.mockRejectedValue(new Error("collector offline"));
  send("bout-ready"); await flush();
  expect(document.querySelector("output")!.textContent).toContain("could not be saved");
});
