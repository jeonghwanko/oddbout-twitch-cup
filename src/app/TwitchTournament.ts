export type TwitchEntrantIdentity = {
  kind: "twitch-user-id" | "twitch-login" | "local-demo";
  value: string;
};

export type TwitchEntrant = {
  identity: TwitchEntrantIdentity;
  login: string;
  displayName: string;
  fighterId: string;
  /** Test slot only; identity remains the actual authenticated Twitch account. */
  rehearsalSlot?: number;
};

export type TwitchMatch = {
  id: "semi-1" | "semi-2" | "final";
  fighterIds: string[];
  status: "waiting" | "active" | "complete";
  winnerFighterId: string | null;
};

export type TwitchTournamentState = {
  registrationPolicy: { kind: "live" } | { kind: "solo-rehearsal"; broadcasterUserId: string };
  status: "registration" | "running" | "complete";
  entrants: TwitchEntrant[];
  matches: TwitchMatch[];
  activeMatchId: TwitchMatch["id"] | null;
  championFighterId: string | null;
  allowedFighterIds: readonly string[];
};

export type JoinRejection = "closed" | "full" | "duplicate-user" | "fighter-taken" | "unknown-fighter" | "invalid-identity" | "solo-broadcaster-only";
export type JoinResult = { state: TwitchTournamentState; accepted: true } | { state: TwitchTournamentState; accepted: false; reason: JoinRejection };
export type StartResult = { state: TwitchTournamentState; started: true } | { state: TwitchTournamentState; started: false; reason: "already-started" | "requires-four" };
export type MatchResult = { state: TwitchTournamentState; applied: true } | { state: TwitchTournamentState; applied: false; reason: "not-running" | "stale-match" | "invalid-winner" | "duplicate-result" };

const MAX_ENTRANTS = 4;
const identityKey = (identity: TwitchEntrantIdentity): string => `${identity.kind}:${identity.value.trim().toLowerCase()}`;
const sameTwitchViewer = (left: TwitchEntrant, right: TwitchEntrant): boolean => {
  if (identityKey(left.identity) === identityKey(right.identity)) return true;
  const twitchKinds = new Set(["twitch-user-id", "twitch-login"]);
  return twitchKinds.has(left.identity.kind) && twitchKinds.has(right.identity.kind)
    && left.login.trim().toLowerCase() === right.login.trim().toLowerCase();
};

export function createTwitchTournament(allowedFighterIds: readonly string[]): TwitchTournamentState {
  return {
    registrationPolicy: { kind: "live" },
    status: "registration",
    entrants: [],
    matches: [
      { id: "semi-1", fighterIds: [], status: "waiting", winnerFighterId: null },
      { id: "semi-2", fighterIds: [], status: "waiting", winnerFighterId: null },
      { id: "final", fighterIds: [], status: "waiting", winnerFighterId: null },
    ],
    activeMatchId: null,
    championFighterId: null,
    allowedFighterIds: Object.freeze([...new Set(allowedFighterIds)]),
  };
}

function stateWith(state: TwitchTournamentState, changes: Partial<TwitchTournamentState>): TwitchTournamentState {
  return { ...state, ...changes };
}

/** Call with a validated connected session's user ID; null opts back into live registration. */
export function setTwitchSoloRehearsal(state: TwitchTournamentState, broadcasterUserId: string | null):
  { state: TwitchTournamentState; changed: true } | { state: TwitchTournamentState; changed: false; reason: "mode-locked" | "invalid-identity" } {
  if (state.status !== "registration" || state.entrants.length > 0) return { state, changed: false, reason: "mode-locked" };
  if (broadcasterUserId !== null && !broadcasterUserId.trim()) return { state, changed: false, reason: "invalid-identity" };
  return { state: stateWith(state, { registrationPolicy: broadcasterUserId === null
    ? { kind: "live" } : { kind: "solo-rehearsal", broadcasterUserId: broadcasterUserId.trim() } }), changed: true };
}

export function joinTwitchTournament(state: TwitchTournamentState, entrant: TwitchEntrant): JoinResult {
  if (state.status !== "registration") return { state, accepted: false, reason: "closed" };
  if (state.entrants.length >= MAX_ENTRANTS) return { state, accepted: false, reason: "full" };
  const identity = entrant.identity;
  if (!identity || !["twitch-user-id", "twitch-login", "local-demo"].includes(identity.kind) || !identity.value.trim()) {
    return { state, accepted: false, reason: "invalid-identity" };
  }
  const solo = state.registrationPolicy.kind === "solo-rehearsal";
  if (state.registrationPolicy.kind === "solo-rehearsal"
    && (identity.kind !== "twitch-user-id" || identity.value.trim() !== state.registrationPolicy.broadcasterUserId)) {
    return { state, accepted: false, reason: "solo-broadcaster-only" };
  }
  if (!state.allowedFighterIds.includes(entrant.fighterId)) return { state, accepted: false, reason: "unknown-fighter" };
  if (!solo && state.entrants.some(existing => sameTwitchViewer(existing, entrant))) return { state, accepted: false, reason: "duplicate-user" };
  if (state.entrants.some(existing => existing.fighterId === entrant.fighterId)) return { state, accepted: false, reason: "fighter-taken" };
  const clean: TwitchEntrant = {
    identity: { kind: identity.kind, value: identity.value.trim() },
    login: entrant.login.trim(), displayName: entrant.displayName.trim(), fighterId: entrant.fighterId,
    ...(solo ? { rehearsalSlot: state.entrants.length + 1 } : {}),
  };
  return { state: stateWith(state, { entrants: [...state.entrants, clean] }), accepted: true };
}

export function startTwitchTournament(state: TwitchTournamentState): StartResult {
  if (state.status !== "registration") return { state, started: false, reason: "already-started" };
  if (state.entrants.length !== MAX_ENTRANTS) return { state, started: false, reason: "requires-four" };
  const ids = state.entrants.map(entrant => entrant.fighterId);
  const matches: TwitchMatch[] = [
    { id: "semi-1", fighterIds: ids.slice(0, 2), status: "active", winnerFighterId: null },
    { id: "semi-2", fighterIds: ids.slice(2, 4), status: "waiting", winnerFighterId: null },
    { id: "final", fighterIds: [], status: "waiting", winnerFighterId: null },
  ];
  return { state: stateWith(state, { status: "running", matches, activeMatchId: "semi-1" }), started: true };
}

export function applyTwitchMatchResult(state: TwitchTournamentState, matchId: string, winnerFighterId: string): MatchResult {
  if (state.status !== "running") return { state, applied: false, reason: "not-running" };
  const match = state.matches.find(candidate => candidate.id === matchId);
  if (match?.status === "complete") return { state, applied: false, reason: "duplicate-result" };
  if (state.activeMatchId !== matchId || !match || match.status !== "active") return { state, applied: false, reason: "stale-match" };
  if (!match.fighterIds.includes(winnerFighterId)) return { state, applied: false, reason: "invalid-winner" };

  const matches = state.matches.map(candidate => candidate.id === matchId
    ? { ...candidate, status: "complete" as const, winnerFighterId }
    : { ...candidate });
  if (matchId === "semi-1") matches[1] = { ...matches[1]!, status: "active" };
  if (matchId === "semi-2") {
    const semi1Winner = state.matches[0]!.winnerFighterId;
    matches[2] = { ...matches[2]!, fighterIds: semi1Winner ? [semi1Winner, winnerFighterId] : [], status: "active" };
  }
  if (matchId === "final") return { state: stateWith(state, { status: "complete", matches, activeMatchId: null, championFighterId: winnerFighterId }), applied: true };
  const nextActive = matchId === "semi-1" ? "semi-2" : "final";
  return { state: stateWith(state, { matches, activeMatchId: nextActive }), applied: true };
}

/** Fighters that arrive after the cup opened (the registry's, read after the page loads) join the allowed list while registration is open. */
export function allowTwitchFighters(state: TwitchTournamentState, fighterIds: readonly string[]): TwitchTournamentState {
  if (state.status !== "registration") return state;
  return stateWith(state, { allowedFighterIds: Object.freeze([...new Set([...state.allowedFighterIds, ...fighterIds])]) });
}

/** `!join <command>`'s command, lowercased; the roster maps it to a fighter (`twitchCupFighterFor`). */
export function parseJoinCommand(text: string): { command: string } | null {
  const match = /^!join\s+([a-zA-Z0-9_-]{1,64})\s*$/i.exec(text.trim());
  return match ? { command: match[1]!.toLowerCase() } : null;
}
