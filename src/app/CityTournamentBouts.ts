import { CITY_TOURNAMENT, cityTournamentEntrant, type CityTournamentConfig } from "./CityTournamentProgress";
import { cityFightBoutArena, runCityFightFighterBout, type CityFightBoutArena, type CityFightBoutCorner, type CityFightBoutResult,
  type CityFightBoutRules } from "../sim/cityFight/bout/CityFightFighterBout";
import { CITY_FIGHTERS, cityFighterDamageScale, cityFighterRules } from "../sim/cityFight/CityFighters";
import type { NativeCityKumaArtBridge } from "../sim/cityFight/NativeCityKumaFighter";
import { REGISTERED_DUEL_DEFAULT_STATS, registeredDuelPower } from "../sim/cityFight/bout/RegisteredDuelStats";
import { registeredDuelCorner } from "../sim/cityFight/bout/RegisteredDuelRules";
import type { FighterDuelStats, FighterDuelStyle } from "../../contracts/ai-fighter/validate.mjs";
import type { NativeCityOrthoPack } from "../assets/NativeCityOrthoPack";
import { DEFAULT_TUNING } from "../sim/tuning";
import {
  cityTournamentMatchSeed, cityTournamentRegisteredId, resolveCityTournamentRated, type CityTournamentEntrant, type CityTournamentResolver,
} from "../sim/tournament/CityTournamentRules";
import { CITY_TOURNAMENT_ARENA_VIEW } from "../world/CityTournamentArenaView";
import type { NativeCityDefinition } from "../world/NativeCityDefinition";

/**
 * The weekly tournament's matches without the player (2026-10-18, docs/Plan/2026-10-18-ai-fighter-tournament 3단계): two village fighters
 * fight a headless bout under the village fight's rules (`runCityFightFighterBout`) on the bracket's fixed arena (`city-tournament.json`
 * bout), seeded by the match (`cityTournamentMatchSeed`). Its winner and "KO" / "판정승" go on the bracket; the bracket saves them, so
 * reopening never fights them again. A pair the simulation cannot fight (Otto, an entrant whose art has not loaded) is judged on ratings
 * as before (`resolveCityTournamentRated`, "판정").
 *
 * `art`: a fighter's art bridge (`nativeCityKumaArtBridge` over his loaded pack — the village's fighter views hold them), or null.
 */
export type CityTournamentArt = (fighterId: string) => NativeCityKumaArtBridge | null;

/**
 * A server-registered fighter in a cup bout (내 선수 출전, 2026-10-27 — docs/Plan/2026-10-27-oddbout-agent-world 1단계): his package's side pack
 * (`toSidePreviewPack` — the clips' beats; the headless bout needs no picture), his duel grades and the package's hash.
 */
export interface CityTournamentRegisteredFighter {
  readonly pack: NativeCityOrthoPack;
  readonly stats: FighterDuelStats;
  /** His fighting style (`toDuelStyle`), or null — the standard kit. */
  readonly style: FighterDuelStyle | null;
  readonly manifestSha256: string;
}

/** A registered entrant's package by his UUID, or null while it is not in (his bout then waits — no rating judgement stands in). */
export type CityTournamentRegistered = (fighterId: string) => CityTournamentRegisteredFighter | null;

const NO_REGISTERED: CityTournamentRegistered = () => null;

/**
 * A registered fighter's blows in a cup bout: KUMA's tournament strength — his corner is KUMA's raw tuning under his own clips
 * (`registeredDuelCorner`), so he starts where KUMA stands — times his power grade over the other's toughness (a roster fighter's grades are
 * the defaults). A roster fighter's blows on him: his own strength over the registered fighter's toughness.
 */
export function cityTournamentRegisteredPower(striker: FighterDuelStats, target: FighterDuelStats = REGISTERED_DUEL_DEFAULT_STATS,
  config: CityTournamentConfig = CITY_TOURNAMENT): number {
  return cityTournamentBoutPower(cityTournamentEntrant("kuma", config), config) * registeredDuelPower(striker, target);
}

export function cityTournamentBoutPower(entrant: CityTournamentEntrant, config: CityTournamentConfig = CITY_TOURNAMENT): number {
  return entrant.rating / 100 * (config.bout.power[entrant.id] ?? 1) / Math.max(1e-9, cityFighterDamageScale(entrant.id));
}

/**
 * The tournament's ring (2026-10-18): the plaza's V1 view (its projection, actor height and walk rule — baked without its ground,
 * `CITY_TOURNAMENT_ARENA_VIEW`) and the fixed straight arena on it (`city-tournament.json` bout.arena). The headless bouts and the arena
 * scene both stand their fighters on it.
 */
export function cityTournamentArena(config: CityTournamentConfig = CITY_TOURNAMENT): { readonly view: NativeCityDefinition; readonly arena: CityFightBoutArena } {
  const view = CITY_TOURNAMENT_ARENA_VIEW, bout = config.bout;
  return { view, arena: cityFightBoutArena(view.projection, view.actorHeightPx, bout.arena.origin, bout.arena.halfStrides) };
}

/**
 * Two fighter entrants' corners, the arena and its rules — the setup a bracket bout fights on (headless, `cityTournamentBout`) and the arena's
 * AI duel shows (2026-10-20, `ArenaDuelScene`). Null: one of them is not a village fighter, or his art is not in. A registered entrant (his
 * UUID, 내 선수 출전) fights from `registered`'s package — null while it is not in.
 */
export function cityTournamentBoutSetup(a: CityTournamentEntrant, b: CityTournamentEntrant, art: CityTournamentArt,
  config: CityTournamentConfig = CITY_TOURNAMENT, registered: CityTournamentRegistered = NO_REGISTERED)
  : { readonly corners: readonly [CityFightBoutCorner, CityFightBoutCorner]; readonly arena: CityFightBoutArena; readonly view: NativeCityDefinition;
    readonly rules: CityFightBoutRules } | null {
  const height = cityTournamentArena(config).view.actorHeightPx;
  const statsOf = (entrant: CityTournamentEntrant) => cityTournamentRegisteredId(entrant.id) ? registered(entrant.id)?.stats ?? null : null;
  const corner = (entrant: CityTournamentEntrant, rival: CityTournamentEntrant): CityFightBoutCorner | null => {
    if (cityTournamentRegisteredId(entrant.id)) {
      const fighter = registered(entrant.id);
      if (!fighter) return null;
      return { ...registeredDuelCorner(entrant.id, fighter.pack, height, fighter.stats, undefined, fighter.style),
        power: cityTournamentRegisteredPower(fighter.stats, statsOf(rival) ?? REGISTERED_DUEL_DEFAULT_STATS, config) };
    }
    if (entrant.kind !== "fighter" || !CITY_FIGHTERS.some(fighter => fighter.actorId === entrant.id)) return null;
    const bridge = art(entrant.id);
    if (!bridge) return null;
    const rules = cityFighterRules(entrant.id);
    // On a registered fighter his blows go through that one's toughness grade (a roster fighter's own: 1).
    const toughness = registeredDuelPower(REGISTERED_DUEL_DEFAULT_STATS, statsOf(rival) ?? REGISTERED_DUEL_DEFAULT_STATS);
    return { id: entrant.id, tuning: rules.tuning, footprint: rules.footprint, art: bridge, power: cityTournamentBoutPower(entrant, config) * toughness };
  };
  const ca = corner(a, b), cb = corner(b, a);
  if (!ca || !cb) return null;
  const { arena, view } = cityTournamentArena(config), bout = config.bout;
  return { corners: [ca, cb], arena, view, rules: { dtMs: bout.dtMs, limitMs: config.boutTimeLimitMs, startStrides: bout.startStrides,
    referenceHp: DEFAULT_TUNING.combat.playerMaxHp, damageScale: bout.damageScale, poise: bout.poise, startDelayMs: bout.startDelayMs, air: bout.air,
    traces: bout.traces, clash: bout.clash, wallBounce: bout.wallBounce, koRebound: bout.koRebound, stringPushScale: bout.stringPushScale, ai: bout.ai, proration: bout.proration,
    ...(bout.exchanges ? { exchanges: bout.exchanges } : {}) } };
}

/** A bout between two fighter entrants (null: one of them is not a village fighter, or his art is not in). */
export function cityTournamentBout(a: CityTournamentEntrant, b: CityTournamentEntrant, seed: number,
  art: CityTournamentArt, config: CityTournamentConfig = CITY_TOURNAMENT, registered: CityTournamentRegistered = NO_REGISTERED): CityFightBoutResult | null {
  const setup = cityTournamentBoutSetup(a, b, art, config, registered);
  return setup ? runCityFightFighterBout(setup.corners[0], setup.corners[1], setup.arena, setup.rules, seed) : null;
}

/** The resolver the village hands the bracket: a simulated bout where both are fighters with their art in, else the rating judgement. */
export function cityTournamentBoutResolver(art: CityTournamentArt, config: CityTournamentConfig = CITY_TOURNAMENT,
  registered: CityTournamentRegistered = NO_REGISTERED): CityTournamentResolver {
  return (state, match) => {
    const entrant = (id: string | null) => state.entrants.find(candidate => candidate.id === id) ?? null;
    const a = entrant(match.a), b = entrant(match.b);
    const result = a && b ? cityTournamentBout(a, b, cityTournamentMatchSeed(state.seed, match.round, match.slot), art, config, registered) : null;
    if (!result || !a || !b) return resolveCityTournamentRated(state, match);
    return { winner: result.winner === 0 ? a.id : b.id, how: result.how };
  };
}
