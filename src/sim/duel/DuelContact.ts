/** Adapters supply geometry in their own world; this gate owns one contact and its outcome. */
export interface DuelContactInput {
  readonly alreadyContacted: boolean;
  readonly targetHittable: boolean;
  readonly targetInvulnerable: boolean;
  readonly inFront: boolean;
  readonly sameFloor: boolean;
  readonly inReach: boolean;
}

export function resolveDuelContact(input: DuelContactInput) {
  const threatens = !input.alreadyContacted && input.targetHittable && input.inFront && input.sameFloor && input.inReach;
  return { threatens, connects: threatens && !input.targetInvulnerable, dodged: threatens && input.targetInvulnerable };
}


export interface DuelStrikeIdentity {
  readonly attackerId: string;
  /** Increasing within an encounter. Clear this attacker's memory before restarting its counter. */
  readonly attackId: number;
  readonly hitIndex: number;
}

/** One receiver's contact memory, owned by the encounter session. */
export interface DuelContactState {
  readonly invulnerableMs: number;
  /** Last contact, retained for existing snapshots and fixtures. */
  readonly lastStrike: string | null;
  /** One execution per attacker; memory stays bounded by participants and contacts in that execution. */
  readonly contacts?: Readonly<Record<string, { readonly attackId: number; readonly hitIndices: readonly number[] }>>;
}

export const EMPTY_DUEL_CONTACT: DuelContactState = Object.freeze({ invulnerableMs: 0, lastStrike: null });

export function duelStrikeKey(strike: DuelStrikeIdentity): string {
  return `${strike.attackerId}:${strike.attackId}:${strike.hitIndex}`;
}

/** Fight time only: contact protection does not expire while both actors are frozen. */
export function stepDuelContactState(state: DuelContactState, dtMs: number): DuelContactState {
  const dt = Number.isFinite(dtMs) ? Math.max(0, dtMs) : 0;
  return state.invulnerableMs > 0 ? { ...state, invulnerableMs: Math.max(0, state.invulnerableMs - dt) } : state;
}

/**
 * The session calls this for each receiver. Geometry comes from its world adapter; guard, damage,
 * armour and unique openings remain the receiver's rules. A miss never spends contact memory.
 * `first`: the attack execution's first contact on this receiver — its later contacts (a net's cinches, a flurry's) continue the
 * receiver's reaction instead of snapping it again (one flinch per move, 2026-10-18 user).
 */
export function receiveDuelContact(state: DuelContactState, strike: DuelStrikeIdentity,
  geometry: Pick<DuelContactInput, "targetHittable" | "inFront" | "sameFloor" | "inReach">, invulnerableMs: number) {
  const key = duelStrikeKey(strike);
  const previous = state.contacts && Object.hasOwn(state.contacts, strike.attackerId) ? state.contacts[strike.attackerId] : undefined;
  const alreadyContacted = state.lastStrike === key || previous !== undefined && (strike.attackId < previous.attackId
    || strike.attackId === previous.attackId && previous.hitIndices.includes(strike.hitIndex));
  const contact = resolveDuelContact({ ...geometry, alreadyContacted,
    targetInvulnerable: state.invulnerableMs > 0 });
  if (!contact.connects) return { ...contact, first: false, state };
  const first = previous?.attackId !== strike.attackId;
  const hitIndices = previous?.attackId === strike.attackId ? [...previous.hitIndices, strike.hitIndex] : [strike.hitIndex];
  return { ...contact, first, state: { invulnerableMs: Math.max(0, invulnerableMs), lastStrike: key,
    contacts: Object.freeze({ ...state.contacts, [strike.attackerId]: Object.freeze({ attackId: strike.attackId, hitIndices: Object.freeze(hitIndices) }) }) } };
}

/** A fresh encounter may reuse attack numbers. Forget only that owner, never another actor or protection time. */
export function forgetDuelAttacker(state: DuelContactState, attackerId: string): DuelContactState {
  const ownsLast = state.lastStrike?.split(":").slice(0, -2).join(":") === attackerId;
  const hasContacts = state.contacts !== undefined && Object.hasOwn(state.contacts, attackerId);
  if (!ownsLast && !hasContacts) return state;
  const contacts = { ...state.contacts };
  delete contacts[attackerId];
  return { ...state, lastStrike: ownsLast ? null : state.lastStrike,
    ...(hasContacts ? { contacts: Object.freeze(contacts) } : {}) };
}
