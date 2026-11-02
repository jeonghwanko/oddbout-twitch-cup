import type Phaser from "phaser";
import type { SpriteSheetAssetDefinition } from "../../../assets/RuntimeArtTypes";
import { ARENA_RING_ART } from "../../../assets/ArenaArtCatalog";
import { cityFighterPack } from "../../art/CityFighterPacks";
import { registeredArenaPack } from "../../art/RegisteredArenaFighters";
import { kumaCombatSheetsAt, kumaRunSheetsAt, kumaVillageSheets } from "../../art/NativeCityKumaArt";
import { NATIVE_CITY_SIDE_HEADINGS, nativeCityOrthoActionAssets, nativeCityOrthoActionClip, nativeCityOrthoClipSheets, nativeCityOrthoGaitAssets,
  type NativeCityOrthoAction, type NativeCityOrthoPack } from "../../art/NativeCityOrthoPack";
import { preloadCharacterSpriteSheets, preloadImageAssets } from "../../art/PhaserAssetLoader";
/** Each sheet once (fallback clips share their source pages). */
function distinctSheets(sheets: readonly SpriteSheetAssetDefinition[]): SpriteSheetAssetDefinition[] {
  return [...new Map(sheets.map(sheet => [sheet.key, sheet])).values()];
}


function stageActionSheets(pack: NativeCityOrthoPack, actions: readonly NativeCityOrthoAction[]): SpriteSheetAssetDefinition[] {
  return distinctSheets(NATIVE_CITY_SIDE_HEADINGS.flatMap(facing => actions.flatMap(action => {
    const clip = nativeCityOrthoActionClip(pack, facing, action)?.clip;
    return clip ? nativeCityOrthoClipSheets(clip) : [];
  })));
}

/**
 * The fight and run sheets a fighter's view asks for on the stage (`NativeCityKumaView.requestCombatArt`: the two side headings), not every
 * heading's (KUMA's eight came to 400 MB decoded).
 */
function stageFighterSheets(pack: NativeCityOrthoPack): SpriteSheetAssetDefinition[] {
  return distinctSheets(NATIVE_CITY_SIDE_HEADINGS.flatMap(facing => [...kumaCombatSheetsAt(pack, facing), ...kumaRunSheetsAt(pack, facing)]));
}


function fighterSheets(id: string, played = false): SpriteSheetAssetDefinition[] {
  const registered = registeredArenaPack(id);
  // Registered v1 packs contain only the two arena side headings. Do not route them through the eight-heading village gait loop.
  if (registered) return [...nativeCityOrthoGaitAssets(registered, ["idle", "walk", "run"]), ...nativeCityOrthoActionAssets(registered)];
  const pack = cityFighterPack(id);
  return pack ? distinctSheets([...kumaVillageSheets(pack), ...stageFighterSheets(pack),
    ...(played ? nativeCityOrthoActionAssets(pack, ["dodge"]) : [])]) : [];
}

/**
 * A village fighter's sheets for the arena's AI duel (2026-10-20, `ArenaDuelScene`): his pack must be in (`loadCityFighterPack`). With his
 * dodge on the stage's side headings (2026-10-23 2차 — the duel draws the bout AI's step back as it, `NativeCityKumaView` `poseEvade`).
 */
export function arenaFighterSheets(id: string): SpriteSheetAssetDefinition[] {
  const pack = registeredArenaPack(id) ? null : cityFighterPack(id);
  return distinctSheets([...fighterSheets(id), ...(pack ? stageActionSheets(pack, ["dodge"]) : [])]);
}


export function preloadArenaDuelAssets(scene: Phaser.Scene, a: string, b: string): void {
  preloadCharacterSpriteSheets(scene, distinctSheets([...arenaFighterSheets(a), ...arenaFighterSheets(b)]));
  preloadImageAssets(scene, [ARENA_RING_ART]);
}
