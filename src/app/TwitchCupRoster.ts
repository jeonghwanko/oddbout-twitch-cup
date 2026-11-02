import { localizedFighterName, type FighterNames } from "../platform/fighterNames";

/** A Twitch Cup fighter: a shipped one (his id is his chat command) or a creator's registered one approved to meet others. */
export interface TwitchCupFighter {
  readonly id: string;
  readonly kind: "fighter" | "registered";
  /** What a viewer types after `!join` (lowercase). */
  readonly command: string;
  /** His English name on the page (a shipped fighter's id, as before). */
  readonly label: string;
}

/** A registry row as the roster states it (`RegisteredFighterEntry`). */
export interface TwitchCupRegisteredEntry { readonly id: string; readonly name: string; readonly names?: FighterNames; readonly duelApproved?: boolean }

/** What a command is matched on: lowercase a-z0-9 only (`!join Nova-Beat` is `novabeat`). */
const commandKey = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * The shipped fighters, then every approved registered fighter in the registry's order (newest first). A registered fighter's command is his
 * English name (`profile.names.en`, else the identity name) as `commandKey` reads it; an empty one, or one another fighter already holds, falls
 * back to `f` + the first 6 hex characters of his id (longer only if that is held too). Commands are given oldest first, so a newcomer with an
 * older fighter's name never takes that fighter's command.
 */
export function twitchCupRoster(shippedIds: readonly string[], registered: readonly TwitchCupRegisteredEntry[]): readonly TwitchCupFighter[] {
  const ids = new Set(shippedIds), keys = new Set(shippedIds.map(commandKey)), given: TwitchCupFighter[] = [];
  // A fighter listed twice stands at his first place.
  const once = registered.filter((entry, index) => registered.findIndex(other => other.id === entry.id) === index);
  for (const entry of [...once].reverse()) {
    if (entry.duelApproved !== true || ids.has(entry.id)) continue;
    const label = localizedFighterName(entry.name, entry.names, "en"), hex = entry.id.replace(/-/g, "");
    const plain = commandKey(label);
    let command = plain && !keys.has(plain) ? plain : `f${hex.slice(0, 6)}`;
    for (let length = 7; keys.has(command) && length <= hex.length; length++) command = `f${hex.slice(0, length)}`;
    if (keys.has(command)) continue;
    ids.add(entry.id); keys.add(command);
    given.push({ id: entry.id, kind: "registered", command, label });
  }
  return [...shippedIds.map(id => ({ id, kind: "fighter" as const, command: id, label: id })), ...given.reverse()];
}

/** The fighter id `command` names (any case, any characters outside a-z0-9 ignored), or null. */
export function twitchCupFighterFor(roster: readonly TwitchCupFighter[], command: string): string | null {
  const wanted = commandKey(command);
  return wanted ? roster.find(fighter => commandKey(fighter.command) === wanted)?.id ?? null : null;
}
