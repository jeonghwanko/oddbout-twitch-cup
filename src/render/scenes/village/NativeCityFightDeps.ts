import type Phaser from "phaser";
import type { SpriteSheetAssetDefinition } from "../../../assets/RuntimeArtTypes";
import { artTextureKey } from "../../art/ArtFallback";
import { preloadSpriteSheets } from "../../art/PhaserAssetLoader";
import { declareNativeCityActorSheets } from "../../art/NativeCityActorSheets";
import { preparePhaserTexture } from "../../PhaserTextureFamilies";
import type { VillageImpactSound, VillageMeleeCue } from "../../audio/CityFightAudio";
import type { NativeCityWeaponImpactKind } from "../../effects/NativeCityWeaponImpact";
import type { NativeCityImpactFeelTuning } from "../../../sim/cityFight/NativeCityCombatTuning";
import { sfx } from "../../audio/sfx";

/**
 * The village fight's sounds — `SfxPlayer`'s village pair. The presenter (`NativeCityCombatController`) and the Otto encounter play
 * through this, never through the `sfx` singleton, so neither imports Phaser at runtime and a test hands them a recorder (2026-10-10).
 */
export interface NativeCityFightAudio {
  /** One cue of the fight's sound plan (`villageMeleeSoundPlan`): whooshes, windup, glint, guard, dodge, down, ... */
  villageMelee(cue: VillageMeleeCue, weaponKind?: NativeCityWeaponImpactKind): void;
  /** One landed contact's layered impact (`villageImpactSoundPlan`: hit + body thud + the heavy tiers' low boom), pitched by `tuning`. */
  villageImpact(hit: VillageImpactSound, tuning: NativeCityImpactFeelTuning["sfx"]): void;
}


export interface NativeCityFightArt {
  /** The sheet's texture key once it is loaded, else null (`artTextureKey` at the decorative grade: no stand-in silhouette). */
  textureKey(key: string): string | null;
  /** Queues the sheets not yet loaded (`preloadSpriteSheets`) and kicks the scene's loader when it sits idle with work queued. */
  preload(sheets: readonly SpriteSheetAssetDefinition[]): void;
  /**
   * These sheets are one character's body (`declareNativeCityActorSheets` — in the 3D village they are born low). Absent (a test's art):
   * the view declares the family itself.
   */
  family?(keys: readonly string[]): void;
}

/** What the city scene lends the fight's classes: the hosts' `audio` / `art` (combat, Otto, KUMA's encounter) and KUMA's view's `art`. */
export interface NativeCityFightDeps {
  readonly audio: NativeCityFightAudio;
  readonly art: NativeCityFightArt;
}

/**
 * Sheets this scene's loader already fetches. A scene restart resets the loader but not the download: the old file still lands in the
 * game-wide texture manager. Queuing the same key again then hits "Texture key already in use" (2026-10-11), so a restarted scene waits
 * for the earlier file instead. Failed, dropped or finished files leave the map, so such a sheet is asked for again.
 */
const IN_FLIGHT = new Map<string, Phaser.Loader.File>();
// Phaser.Loader.FILE_LOADING / FILE_LOADED / FILE_PROCESSING (src/loader/const.js): the download or decode is live. A file still
// FILE_PENDING in the list is dropped by the reset and never lands, so it does not count.
const LIVE_FILE_STATES: ReadonlySet<number> = new Set([11, 12, 14]);

function inFlight(scene: Phaser.Scene, key: string): boolean {
  const file = IN_FLIGHT.get(key);
  if (file && LIVE_FILE_STATES.has(file.state) && !scene.textures.exists(key)) return true;
  IN_FLIGHT.delete(key);
  return false;
}

/**
 * The real ones (the only Phaser-importing piece of the fight's wiring): the shared `sfx` player — handed whole, so its methods keep
 * their `this` — and the scene's texture manager and loader, exactly as the classes called them before (same calls, same order).
 */
export function nativeCityFightDeps(scene: Phaser.Scene, prepareTexture?: (key: string) => void): NativeCityFightDeps {
  return {
    audio: sfx,
    art: {
      textureKey: key => {
        const ready = artTextureKey(scene, key, "decorative");
        if (ready) prepareTexture?.(ready);
        return ready;
      },
      preload: sheets => {
        const wanted = sheets.filter(sheet => !inFlight(scene, sheet.key));
        preloadSpriteSheets(scene, wanted);
        for (const file of scene.load.list.getArray()) if (wanted.some(sheet => sheet.key === file.key)) IN_FLIGHT.set(file.key, file);
        if (!scene.load.isLoading() && scene.load.list.size > 0) scene.load.start();
      },
      family: keys => { declareNativeCityActorSheets(scene.game, keys); },
    },
  };
}

/**
 * The fight's art where Phaser itself draws both fighters (the tournament arena — no 3D view, 2026-10-18): a sheet counts as in only once
 * its full copy is back (`preparePhaserTexture` starts that — the village lowers the Phaser copies of the sheets its 3D view draws, and
 * stubs some), so nobody is drawn blurred or blank; the opponent's sheets form a plain Phaser texture family (no `family` hook).
 */
export function nativeCityPhaserDrawnFightArt(scene: Phaser.Scene, art: NativeCityFightArt): NativeCityFightArt {
  return {
    textureKey: key => {
      const ready = art.textureKey(key);
      return ready && preparePhaserTexture(scene.game, ready) ? ready : null;
    },
    preload: sheets => art.preload(sheets),
  };
}
