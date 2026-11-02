import { arenaPlayable } from "./ArenaRoster";
import { readRuntimeOptions, type RuntimeOptions } from "./RuntimeOptions";
import { TWITCH_BOUT_BOOT_TIMEOUT_MS, TWITCH_REGISTERED_CORNER_BOOT_MS } from "./TwitchBoutRecovery";
import type { CityFightBoutResult } from "../sim/cityFight/bout/CityFightFighterBout";

/**
 * Local broadcast bouts: shipped fighters and creators' registered ones (by id — the iframe loads him and checks his approval), never a
 * registered duel, ranking, cup record or result post.
 */
export interface TwitchArenaBoutRequest {
  readonly boutId: string;
  readonly a: string;
  readonly b: string;
  readonly seed: number;
}

export const TWITCH_ARENA_BOUT_TIMEOUT_MS = 240_000;
export type TwitchArenaMessage = TwitchArenaBoutRequest & (
  | { readonly type: "oddbout:twitch:bout-ready" }
  | { readonly type: "oddbout:twitch:bout-error"; readonly message: string }
  | { readonly type: "oddbout:twitch:bout-result"; readonly winnerId: string; readonly result: CityFightBoutResult }
);

export type TwitchArenaStartMessage = TwitchArenaBoutRequest & { readonly type: "oddbout:twitch:start-bout" };
type MessageEnvelope = Pick<MessageEvent, "origin" | "source" | "data">;

/** A host can run many scenes in one document; each attempt token is consumed once. */
export function createTwitchArenaStartGate(): (request: TwitchArenaBoutRequest) => boolean {
  const attempts = new Set<string>();
  return request => {
    if (attempts.has(request.boutId)) return false;
    attempts.add(request.boutId); return true;
  };
}

export function validateTwitchArenaStartMessage(event: MessageEnvelope, expectedOrigin: string,
  expectedSource: MessageEventSource | null): TwitchArenaStartMessage | null {
  if (event.origin !== expectedOrigin || expectedSource === null || event.source !== expectedSource) return null;
  if (!event.data || typeof event.data !== "object" || Array.isArray(event.data)) return null;
  const message = event.data as Record<string, unknown>;
  if (!["type", "boutId", "a", "b", "seed"].every(key => Object.hasOwn(message, key))) return null;
  if (message.type !== "oddbout:twitch:start-bout" || typeof message.boutId !== "string"
    || typeof message.a !== "string" || typeof message.b !== "string" || typeof message.seed !== "number") return null;
  const request = { boutId: message.boutId, a: message.a, b: message.b, seed: message.seed };
  return validRequest(request) ? { ...request, type: "oddbout:twitch:start-bout" } : null;
}

export function validateTwitchArenaHostReady(event: MessageEnvelope, expectedOrigin: string,
  expectedSource: MessageEventSource | null): boolean {
  if (event.origin !== expectedOrigin || expectedSource === null || event.source !== expectedSource) return false;
  if (!event.data || typeof event.data !== "object" || Array.isArray(event.data)) return false;
  const message = event.data as Record<string, unknown>;
  return Object.hasOwn(message, "type") && Object.hasOwn(message, "protocol")
    && message.type === "oddbout:twitch:host-ready" && message.protocol === 1;
}

const REGISTERED_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;


export function twitchArenaCorner(id: string): "fighter" | "registered" | null {
  return arenaPlayable(id)?.kind === "fighter" ? "fighter" : REGISTERED_ID.test(id) ? "registered" : null;
}

/** One bout's loading window, the parent's watchdog and the host's deadline alike: longer for each registered corner. */
export function twitchBoutBootTimeoutMs(request: Pick<TwitchArenaBoutRequest, "a" | "b">): number {
  return TWITCH_BOUT_BOOT_TIMEOUT_MS
    + [request.a, request.b].filter(id => twitchArenaCorner(id) === "registered").length * TWITCH_REGISTERED_CORNER_BOOT_MS;
}

function validRequest(request: TwitchArenaBoutRequest): boolean {
  return /^[a-zA-Z0-9_-]{1,100}$/.test(request.boutId)
    && Number.isInteger(request.seed) && request.seed >= 0 && request.seed <= 0xffffffff
    && request.a !== request.b && [request.a, request.b].every(id => twitchArenaCorner(id) !== null);
}

export function parseTwitchArenaBoutRequest(search: string): TwitchArenaBoutRequest | null {
  return twitchArenaBoutRequest(readRuntimeOptions(search));
}

/** Consume the shared URL parser so boot and presentation see exactly the same options. */
export function twitchArenaBoutRequest(options: RuntimeOptions): TwitchArenaBoutRequest | null {
  if (options.arenaBroadcastId == null) return null;
  const request = { boutId: options.arenaBroadcastId, a: options.arenaPlayer ?? "",
    b: options.arenaOpponent ?? "", seed: options.arenaBoutSeed ?? NaN };
  if (!validRequest(request)) throw new Error("Invalid broadcast bout request");
  return request;
}

export function createTwitchArenaBoutUrl(baseUrl: string, request: TwitchArenaBoutRequest, locale = "ko"): string {
  if (!validRequest(request)) throw new Error("Invalid broadcast bout request");
  const url = new URL("fighter.html", baseUrl);
  url.search = new URLSearchParams({ arena: "1", twitchBout: request.boutId, fighter: request.a, opponent: request.b,
    bout: String(request.seed), lang: locale }).toString();
  url.hash = "";
  return url.href;
}

const pair = (value: unknown): value is readonly [number, number] => Array.isArray(value)
  && value.length === 2 && value.every(n => typeof n === "number" && Number.isFinite(n) && n >= 0);

/** The controller accepts only its current iframe, same origin, pairing, seed and bout token. */
export function validateTwitchArenaBoutMessage(event: Pick<MessageEvent, "origin" | "source" | "data">,
  expectedOrigin: string, expectedSource: MessageEventSource | null, request: TwitchArenaBoutRequest): TwitchArenaMessage | null {
  if (event.origin !== expectedOrigin || expectedSource === null || event.source !== expectedSource) return null;
  const data: unknown = event.data;
  if (typeof data !== "object" || data === null) return null;
  const message = data as Record<string, unknown>;
  if (message.boutId !== request.boutId || message.a !== request.a || message.b !== request.b || message.seed !== request.seed) return null;
  if (message.type === "oddbout:twitch:bout-ready") return data as TwitchArenaMessage;
  if (message.type === "oddbout:twitch:bout-error") return typeof message.message === "string" && message.message.length <= 200
    ? data as TwitchArenaMessage : null;
  if (message.type !== "oddbout:twitch:bout-result" || typeof message.result !== "object" || message.result === null) return null;
  const result = message.result as Record<string, unknown>;
  if ((result.winner !== 0 && result.winner !== 1) || (result.how !== "ko" && result.how !== "decision")
    || typeof result.ms !== "number" || !Number.isFinite(result.ms) || result.ms < 0
    || !pair(result.hp) || result.hp.some(hp => hp > 1) || !pair(result.contacts)
    || !result.contacts.every(Number.isInteger) || typeof result.digest !== "string" || !/^[0-9a-f]{8}$/i.test(result.digest)
    || message.winnerId !== (result.winner === 0 ? request.a : request.b)) return null;
  return data as TwitchArenaMessage;
}
