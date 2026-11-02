import { describe, expect, it } from "vitest";
import { createTwitchArenaBoutUrl, parseTwitchArenaBoutRequest, twitchArenaCorner, twitchBoutBootTimeoutMs, validateTwitchArenaBoutMessage,
  validateTwitchArenaStartMessage, validateTwitchArenaHostReady, createTwitchArenaStartGate,
  type TwitchArenaBoutRequest } from "../src/app/TwitchArenaBout";
import { TWITCH_BOUT_BOOT_TIMEOUT_MS, TWITCH_REGISTERED_CORNER_BOOT_MS } from "../src/app/TwitchBoutRecovery";

const request: TwitchArenaBoutRequest = { boutId: "cup-1-semi-1", a: "kuma", b: "yume", seed: 0xffffffff };
const origin = "https://example.com";
const frame = {} as MessageEventSource;
const result = { winner: 1, how: "ko", ms: 25000, hp: [0, 0.4], contacts: [9, 12], digest: "1234abcd" };
const message = { ...request, type: "oddbout:twitch:bout-result", winnerId: request.b, result };
const event = (data: unknown) => ({ origin, source: frame, data });
const read = (data: unknown) => validateTwitchArenaBoutMessage(event(data), origin, frame, request);

describe("방송 경기 iframe 계약", () => {
  it("배포 하위 경로를 유지하고 현재 경기와 32비트 시드를 전달한다", () => {
    const url = new URL(createTwitchArenaBoutUrl("https://example.com/game/twitch.html?old=1#x", request, "en"));
    expect(url.pathname).toBe("/game/fighter.html");
    expect(url.searchParams.get("old")).toBeNull();
    expect(url.hash).toBe("");
    expect(parseTwitchArenaBoutRequest(url.search)).toEqual(request);
    expect(url.searchParams.get("lang")).toBe("en");
    expect(parseTwitchArenaBoutRequest("?play=1&fighter=kuma")).toBeNull();
  });
  it("등록 선수는 id 로 내장 선수·다른 등록 선수와 맞붙는다", () => {
    const fixtureOne = "abc00194-0000-4000-8000-000000000001", fixtureTwo = "abc00a16-0000-4000-8000-00000000000b";
    for (const pair of [{ a: fixtureOne, b: "kuma" }, { a: "yume", b: fixtureOne }, { a: fixtureOne, b: fixtureTwo }]) {
      const bout = { ...request, ...pair };
      expect(parseTwitchArenaBoutRequest(new URL(createTwitchArenaBoutUrl(origin, bout, "en")).search)).toEqual(bout);
    }
    expect(twitchArenaCorner(fixtureOne)).toBe("registered");
    expect(twitchArenaCorner("kuma")).toBe("fighter");
    for (const id of ["unshipped-b", "unknown", fixtureOne.toUpperCase(), `${fixtureOne}0`]) expect(twitchArenaCorner(id)).toBeNull();
    const start = { ...request, a: fixtureOne, b: fixtureTwo, type: "oddbout:twitch:start-bout" };
    expect(validateTwitchArenaStartMessage(event(start), origin, frame)).toEqual(start);
  });
  it("등록 선수 한 명마다 로딩 제한을 늘린다", () => {
    const fixtureOne = "abc00194-0000-4000-8000-000000000001", fixtureTwo = "abc00a16-0000-4000-8000-00000000000b";
    expect(twitchBoutBootTimeoutMs({ a: "kuma", b: "yume" })).toBe(TWITCH_BOUT_BOOT_TIMEOUT_MS);
    expect(twitchBoutBootTimeoutMs({ a: fixtureOne, b: "yume" })).toBe(TWITCH_BOUT_BOOT_TIMEOUT_MS + TWITCH_REGISTERED_CORNER_BOOT_MS);
    expect(twitchBoutBootTimeoutMs({ a: fixtureOne, b: fixtureTwo })).toBe(TWITCH_BOUT_BOOT_TIMEOUT_MS + 2 * TWITCH_REGISTERED_CORNER_BOOT_MS);
  });
  it("자기 대결·없는 선수·없는 선수·잘못된 경기 키나 시드를 받지 않는다", () => {
    for (const bad of [{ b: request.a }, { a: "unknown" }, { a: "unshipped-a" }, { a: "ABC00194-0000-4000-8000-000000000001" }, { boutId: "bad/id" },
      { seed: -1 }, { seed: 1.5 }, { seed: 0x100000000 }]) {
      expect(() => createTwitchArenaBoutUrl(origin, { ...request, ...bad })).toThrow();
    }
    for (const seed of ["", "1junk", "1e2", "-1", "4294967296"]) {
      expect(() => parseTwitchArenaBoutRequest(`?twitchBout=semi&fighter=kuma&opponent=yume&bout=${seed}`)).toThrow();
    }
  });
  it("출처·iframe·현재 경기 키·선수·시드가 모두 맞는 결과만 받는다", () => {
    expect(read(message)).toEqual(message);
    expect(validateTwitchArenaBoutMessage({ ...event(message), origin: "https://evil.example" }, origin, frame, request)).toBeNull();
    expect(validateTwitchArenaBoutMessage({ ...event(message), source: {} as MessageEventSource }, origin, frame, request)).toBeNull();
    expect(validateTwitchArenaBoutMessage(event(message), origin, null, request)).toBeNull();
    for (const bad of [{ boutId: "old" }, { a: request.b }, { b: request.a }, { seed: 2 }, { winnerId: request.a }]) {
      expect(read({ ...message, ...bad })).toBeNull();
    }
  });
  it("잘못된 승자·결판·지문·체력·시간을 거부하고 준비와 실패는 승자로 해석하지 않는다", () => {
    for (const bad of [{ winner: 2 }, { how: "forfeit" }, { digest: "invalid" }, { hp: [0, 2] }, { hp: [0] },
      { ms: Infinity }, { ms: -1 }, { contacts: [1.5, 2] }]) {
      expect(read({ ...message, result: { ...result, ...bad } })).toBeNull();
    }
    expect(read({ ...request, type: "oddbout:twitch:bout-ready" })?.type).toBe("oddbout:twitch:bout-ready");
    expect(read({ ...request, type: "oddbout:twitch:bout-error", message: "Load failed" })?.type).toBe("oddbout:twitch:bout-error");
    expect(read(null)).toBeNull();
    expect(read({ ...request, type: "other" })).toBeNull();
  });

  it("accepts a bout start command only from the same-origin host and this iframe", () => {
    const start = { ...request, type: "oddbout:twitch:start-bout" };
    expect(validateTwitchArenaStartMessage(event(start), origin, frame)).toEqual(start);
    expect(validateTwitchArenaStartMessage({ ...event(start), origin: "https://evil.example" }, origin, frame)).toBeNull();
    expect(validateTwitchArenaStartMessage({ ...event(start), source: {} as MessageEventSource }, origin, frame)).toBeNull();
    expect(validateTwitchArenaStartMessage(event(start), origin, null)).toBeNull();
    for (const bad of [
      { ...request, type: "other" },
      { ...start, boutId: "bad/id" },
      { ...start, a: request.b },
      { ...start, b: "unknown-fighter" },
      { ...start, seed: -1 },
      { ...start, seed: 1.5 },
      { ...start, seed: 0x1_0000_0000 },
      { ...start, boutId: "" },
      [],
    ]) expect(validateTwitchArenaStartMessage(event(bad), origin, frame)).toBeNull();
    const inheritedStart = Object.create(start) as object;
    expect(validateTwitchArenaStartMessage(event(inheritedStart), origin, frame)).toBeNull();
  });

  it("accepts only the host-ready protocol marker from the expected frame", () => {
    expect(validateTwitchArenaHostReady(event({ type: "oddbout:twitch:host-ready", protocol: 1 }), origin, frame)).toBe(true);
    expect(validateTwitchArenaHostReady({ ...event({ type: "oddbout:twitch:host-ready", protocol: 1 }), origin: "https://evil.example" }, origin, frame)).toBe(false);
    expect(validateTwitchArenaHostReady({ ...event({ type: "oddbout:twitch:host-ready", protocol: 1 }), source: {} as MessageEventSource }, origin, frame)).toBe(false);
    expect(validateTwitchArenaHostReady(event({ type: "oddbout:twitch:host-ready", protocol: 2 }), origin, frame)).toBe(false);
    expect(validateTwitchArenaHostReady(event([]), origin, frame)).toBe(false);
    const inheritedReady = Object.create({ type: "oddbout:twitch:host-ready", protocol: 1 }) as object;
    expect(validateTwitchArenaHostReady(event(inheritedReady), origin, frame)).toBe(false);
  });

  it("consumes a start attempt token once, rejecting duplicate and replayed commands", () => {
    const acceptStart = createTwitchArenaStartGate();
    expect(acceptStart(request)).toBe(true);
    expect(acceptStart(request)).toBe(false);
    expect(acceptStart({ ...request, boutId: "cup-1-semi-2" })).toBe(true);
    expect(acceptStart({ ...request, boutId: "cup-1-semi-2", a: "yume", b: "bravow", seed: 42 })).toBe(false);
  });
});
