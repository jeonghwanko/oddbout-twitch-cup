import type { CityFightAwakeningMotif } from "../CityFightAwakeningMotifView";
import { AURORA_EXPRESS_MOTIF } from "./AuroraExpressMotif";
import { BEAR_SPIRIT_MOTIF } from "./BearSpiritMotif";
import { BLOSSOM_MOTIF } from "./BlossomMotif";
import { BURROW_RUSH_MOTIF } from "./BurrowRushMotif";
import { CAGE_MATCH_MOTIF } from "./CageMatchMotif";
import { CONFESSION_MOTIF } from "./ConfessionMotif";
import { COUNTDOWN_MOTIF } from "./CountdownMotif";
import { DISCO_MOTIF } from "./DiscoMotif";
import { DOODLE_REACH_MOTIF } from "./DoodleReachMotif";
import { DREAM_BEACH_MOTIF } from "./DreamBeachMotif";
import { ENCORE_MOTIF } from "./EncoreMotif";
import { FANFARE_MOTIF } from "./FanfareMotif";
import { HUH_MOTIF } from "./HuhMotif";
import { LIFTOFF_MOTIF } from "./LiftoffMotif";
import { MIRROR_ROOM_MOTIF } from "./MirrorRoomMotif";
import { NO_PASSING_MOTIF } from "./NoPassingMotif";
import { POLE_VAULT_MOTIF } from "./PoleVaultMotif";
import { RAINBOW_MOTIF } from "./RainbowMotif";
import { RESOLVE_MOTIF } from "./ResolveMotif";
import { SPOTLIGHT_STEAL_MOTIF } from "./SpotlightStealMotif";
import { THATS_FAR_MOTIF } from "./ThatsFarMotif";
import { TOME_MOTIF } from "./TomeMotif";
import { TREMBLE_MOTIF } from "./TrembleMotif";

/**
 * 캐릭터 각성기 모티프 목록(2026-10-23 — 기획 docs/Plan/2026-10-23-character-awakenings): 각성기 목록(`world/city-fight-awakenings.json`)의
 * `staging` 이름 → 그 캐릭터의 모양. `CityFightAwakeningStages` 가 고른다.
 */
export const CITY_FIGHT_AWAKENING_MOTIFS: ReadonlyMap<string, CityFightAwakeningMotif> = new Map<string, CityFightAwakeningMotif>([
  ["bearSpirit", BEAR_SPIRIT_MOTIF],
  ["blossom", BLOSSOM_MOTIF],
  ["tome", TOME_MOTIF],
  ["liftoff", LIFTOFF_MOTIF],
  ["mirrorRoom", MIRROR_ROOM_MOTIF],
  ["countdown", COUNTDOWN_MOTIF],
  ["dreamBeach", DREAM_BEACH_MOTIF],
  ["cageMatch", CAGE_MATCH_MOTIF],
  ["fanfare", FANFARE_MOTIF],
  ["confession", CONFESSION_MOTIF],
  ["disco", DISCO_MOTIF],
  ["rainbow", RAINBOW_MOTIF],
  ["auroraExpress", AURORA_EXPRESS_MOTIF],
  ["noPassing", NO_PASSING_MOTIF],
  ["burrowRush", BURROW_RUSH_MOTIF],
  ["spotlightSteal", SPOTLIGHT_STEAL_MOTIF],
  ["tremble", TREMBLE_MOTIF],
  ["encore", ENCORE_MOTIF],
  ["thatsFar", THATS_FAR_MOTIF],
  ["doodleReach", DOODLE_REACH_MOTIF],
  ["huh", HUH_MOTIF],
  ["resolve", RESOLVE_MOTIF],
  ["poleVault", POLE_VAULT_MOTIF],
]);
