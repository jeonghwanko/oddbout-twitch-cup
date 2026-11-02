import type { SpriteSheetAssetDefinition } from "../../assets/RuntimeArtTypes";
import { NATIVE_CITY_SIDE_HEADINGS, nativeCityOrthoClip, nativeCityOrthoClipSheets,
  type NativeCityOrthoGait, type NativeCityOrthoPack } from "../../assets/NativeCityOrthoPack";

/** The arena draws left/right only; keep the pack's authored mirror fallback and each sheet's original frame layout. */
export function arenaGaitSheets(pack: NativeCityOrthoPack, gaits: readonly NativeCityOrthoGait[]): SpriteSheetAssetDefinition[] {
  const sheets = NATIVE_CITY_SIDE_HEADINGS.flatMap(facing => gaits.flatMap(gait => {
    const clip = nativeCityOrthoClip(pack, facing, gait);
    return clip ? nativeCityOrthoClipSheets(clip) : [];
  }));
  return [...new Map(sheets.map(sheet => [sheet.key, sheet])).values()];
}
