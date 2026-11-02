import spec from "../../../world/city-tournament.json";
import { CITY_TOURNAMENT_ARENA_VIEW as view } from "../../../world/CityTournamentArenaView";
import { NATIVE_CITY_COMBAT } from "../NativeCityCombatTuning";
import { DEFAULT_TUNING } from "../../tuning";
import { cityFightBoutArena, type CityFightBoutCorner, type CityFightBoutRules } from "./CityFightFighterBout";
import { kumaFrameSpec, kumaWalkPace, nativeCityKumaArtBridge } from "../NativeCityKumaFrames";
import type { KumaBoutAiTuning } from "../NativeCityKumaCombatState";
import { REGISTERED_DUEL_DEFAULT_STATS, registeredDuelPower, registeredDuelTuning } from "./RegisteredDuelStats";
import type { FighterDuelStats, FighterDuelStyle } from "../../../../contracts/ai-fighter/validate.mjs";
import { registeredDuelStyleAi, registeredDuelStyleExchanges, registeredDuelStyleTuning } from "./RegisteredDuelStyle";
import type { NativeCityOrthoPack } from "../../../assets/NativeCityOrthoPack";
import type { CityPoint } from "../../../world/NativeCityDefinition";

/**
 * The registered AI fighters' duel (moved from `render/art/RegisteredDuelRules` 2026-10-22, the competitive engine's stage 5): the corners,
 * arena and rules both the browser and the Edge verifier (`server/ai-fighter-duel.ts`) run — no render code in the server's bundle. The
 * engine's name is the fingerprint of its results (`app/RankedDuel.REGISTERED_DUEL_ENGINE`).
 * Each corner fights with his manifest's duel grades (2026-10-23, `RegisteredDuelStats`); his `power` already holds the other's toughness.
 * His fighting style (2026-10-27, `RegisteredDuelStyle`): his swings, skill, summon and shockwave on the tuning, his temperament over the bout's
 * AI, his set-piece weights. No style: the corner as it was.
 */
export function registeredDuelCorner(id: string, pack: NativeCityOrthoPack, actorHeight: number,
  stats: FighterDuelStats = REGISTERED_DUEL_DEFAULT_STATS, opponent: FighterDuelStats = REGISTERED_DUEL_DEFAULT_STATS,
  style: FighterDuelStyle | null = null): CityFightBoutCorner {
  const tuning = registeredDuelTuning(registeredDuelStyleTuning(NATIVE_CITY_COMBAT.kuma, style), stats);
  const ai = registeredDuelStyleAi(style, { measureShare: spec.bout.ai.measure.share, retreatShare: spec.bout.ai.retreat.share,
    guardShare: spec.bout.ai.react.guardShare, standMs: spec.bout.ai.standMs as unknown as readonly [number, number] });
  const exchangeWeights = registeredDuelStyleExchanges(style);
  return { id, tuning, footprint: "player", power: registeredDuelPower(stats, opponent),
    art: nativeCityKumaArtBridge(pack, kumaWalkPace(pack, actorHeight), kumaFrameSpec(tuning)),
    ...(ai ? { ai } : {}), ...(exchangeWeights ? { exchangeWeights } : {}) };
}
/** Pure configuration shared by the browser and the Edge verifier; never loads progress or platform state. */
export function registeredDuelSetup(a: string, b: string, packs: readonly [NativeCityOrthoPack, NativeCityOrthoPack],
  stats: readonly [FighterDuelStats, FighterDuelStats] = [REGISTERED_DUEL_DEFAULT_STATS, REGISTERED_DUEL_DEFAULT_STATS],
  styles: readonly [FighterDuelStyle | null, FighterDuelStyle | null] = [null, null]) {
  const arena = cityFightBoutArena(view.projection, view.actorHeightPx, spec.bout.arena.origin as unknown as CityPoint, spec.bout.arena.halfStrides);
  // The JSON's [min, max] ranges read as number[]: the AI's rhythm as its tuning (`CityTournamentProgress.readBoutAi` checks the same table).
  // (The exchanges' kinds read as string[]: `CityTournamentProgress.readExchanges` checks the same list.)
  const rules: CityFightBoutRules = { ...spec.bout, ai: spec.bout.ai as unknown as KumaBoutAiTuning, limitMs: spec.boutTimeLimitMs,
    referenceHp: DEFAULT_TUNING.combat.playerMaxHp, exchanges: spec.bout.exchanges as unknown as CityFightBoutRules["exchanges"] };
  const corners = [registeredDuelCorner(a, packs[0], view.actorHeightPx, stats[0], stats[1], styles[0]),
    registeredDuelCorner(b, packs[1], view.actorHeightPx, stats[1], stats[0], styles[1])] as const;
  return { arena, view, rules, corners };
}
