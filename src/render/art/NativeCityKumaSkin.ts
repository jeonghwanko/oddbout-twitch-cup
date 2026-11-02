import { pickLocalized, type Locale, type Localized } from "../../app/Locale";
import type { ConversationPortraitFacing } from "../../app/ConversationPanel";
import type { NativeCityOrthoPack } from "./NativeCityOrthoPack";
import type { SpriteSheetAssetDefinition } from "../../assets/RuntimeArtTypes";
import { declarePhaserDrawnTextures } from "../PhaserTextureFamilies";

/**
 * Fighter skins: a village fighter with KUMA's whole fight (`NativeCityFighters`) drawn from his own pack. The skin swaps only the
 * body art, display name, bust, body scale and the fight overlays' rival art - the fight (`NativeCityKumaPatrol`, the view's state
 * machine, every hit feel) is KUMA's. A missing or malformed pack leaves that fighter out, never KUMA in disguise.
 *
 * Every skin is our own generated art (2026-10-11: YUME), always in the village. Its pack is a runtime JSON imported lazily (its own
 * chunk, like KUMA's), its sheets and fight art live under `public/art/characters/<id>/` and are registered with the asset manifest
 * (`YumeSideArtCatalog`). Speaker / actor id = the skin id. (The local `?kof=` test fighters drawn from fighting-game sprites were
 * deleted on 2026-10-13 - 사용자 결정.)
 */

/**
 * Skins: id -> its lazily imported runtime pack (built by the skin's own tool, e.g. `tools/art/build-native-city-yume-side.mjs`).
 * Adding one = build its pack and list it here (and in `NativeCityFighters`).
 */
export const NATIVE_CITY_SKINS: Readonly<Record<string, () => Promise<unknown>>> = Object.freeze({
  beotim: () => import("../../assets/native-city-beotim-side-runtime.json").then(module => module.default),
  bravow: () => import("../../assets/native-city-bravow-side-runtime.json").then(module => module.default),
  duldul: () => import("../../assets/native-city-duldul-side-runtime.json").then(module => module.default),
  eoridung: () => import("../../assets/native-city-eoridung-side-runtime.json").then(module => module.default),
  kungjjak: () => import("../../assets/native-city-kungjjak-side-runtime.json").then(module => module.default),
  quickcat: () => import("../../assets/native-city-quickcat-side-runtime.json").then(module => module.default),
  sikeundung: () => import("../../assets/native-city-sikeundung-side-runtime.json").then(module => module.default),
  yume: () => import("../../assets/native-city-yume-side-runtime.json").then(module => module.default),

});

/** A skinned fighter's id (also his speaker / actor id). */
export function nativeCityIsSkin(id: string): boolean { return Object.hasOwn(NATIVE_CITY_SKINS, id); }

export interface NativeCityKumaSkin {
  readonly id: string;
  readonly name: Localized<string>;
  /** His body height over the player's; null keeps the post's (`KumaPatrolPlan.bodyScale`). */
  readonly bodyScale: number | null;

  readonly facing?: "left" | "right";
  /** The dialogue bust: a square crop of the standing cell (texture px of `key`). */
  readonly bust: { readonly key: string; readonly centerX: number; readonly headTopY: number; readonly size: number };
  /**
   * A drawn dialogue portrait (2026-10-11): a square crop of one of its fight art pieces (`slot`, `width` x `height`
   * px), which the village then loads with her standing sheets; the conversation panel prefers it to the sprite crop (`bust`), and the
   * fight overlays find that piece already loaded.
   */
  readonly portrait?: { readonly slot: NativeCitySkinFightArtSlot; readonly width: number; readonly height: number; readonly centerX: number;
    readonly headTopY: number; readonly size: number; readonly facing: ConversationPortraitFacing };
}


export const NATIVE_CITY_SKIN_FIGHT_ART_SLOTS = ["cutin", "faceShock", "faceGroggy", "faceAnger", "facePanic", "decisiveHit", "grabReveal"] as const;
export type NativeCitySkinFightArtSlot = typeof NATIVE_CITY_SKIN_FIGHT_ART_SLOTS[number];

/** A loaded skin: its skin, its pack (the view draws it) and whichever fight art pieces its pack names. */
export interface NativeCityKumaSkinPack {
  readonly skin: NativeCityKumaSkin;
  readonly pack: NativeCityOrthoPack;
  readonly fightArt: Readonly<Partial<Record<NativeCitySkinFightArtSlot, { readonly key: string; readonly path: string }>>>;
}

type SkinnedPack = NativeCityOrthoPack & {
  readonly skin?: NativeCityKumaSkin;
  readonly displayName?: Partial<Record<Locale, unknown>>;
  readonly fightArt?: Partial<Record<string, unknown>>;
};

const loaded = new Map<string, NativeCityKumaSkinPack>();
const requests = new Map<string, Promise<NativeCityKumaSkinPack | null>>();

/** The skin's folder (public-root relative): fight art paths resolve against it. */
const packDir = (id: string) => `art/characters/${id}/`;

/**
 * A fight art path from the pack: relative to the skin's folder (`cutin.webp`, `./fight/cutin.webp`), or already public-root
 * relative (`art/characters/<id>/...`). Anything that would leave the fighter's folder is refused (null).
 */
export function nativeCitySkinFightArtPath(id: string, value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const dir = packDir(id), raw = value.trim();
  try {
    const url = raw.startsWith(dir) ? new URL(`/${raw}`, "https://pack.invalid/") : new URL(raw, `https://pack.invalid/${dir}pack.json`);
    const path = decodeURIComponent(url.pathname).slice(1);
    return url.host === "pack.invalid" && path.startsWith(dir) && path.length > dir.length ? path : null;
  } catch {
    return null;
  }
}

/**
 * Loads (once) and validates skin `id`'s pack. Null for an unknown id, a failed import, or a pack that is not this fighter's. Its
 * `displayName` (when present) names him; its `fightArt` slots become texture keys `native-city-<id>-fight-<slot>`.
 */
export function loadNativeCityKumaSkinPack(id: string): Promise<NativeCityKumaSkinPack | null> {
  if (!nativeCityIsSkin(id)) return Promise.resolve(null);
  const pending = requests.get(id);
  if (pending) return pending;
  const request = (async (): Promise<NativeCityKumaSkinPack | null> => {
    try {
      const pack = await NATIVE_CITY_SKINS[id]!() as SkinnedPack;
      if (pack?.schemaVersion !== 1 || pack.skin?.id !== id || !pack.directions?.side?.idle?.key) return null;
      const display = pack.displayName, named = (locale: Locale) => typeof display?.[locale] === "string" && display[locale] !== ""
        ? display[locale] : pickLocalized(locale, pack.skin!.name);
      const portrait = pack.skin.portrait, finite = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v > 0;
      const portraitOk = portrait !== undefined && (NATIVE_CITY_SKIN_FIGHT_ART_SLOTS as readonly string[]).includes(portrait.slot)
        && [portrait.width, portrait.height, portrait.size].every(finite) && Number.isFinite(portrait.centerX) && Number.isFinite(portrait.headTopY);
      const skin: NativeCityKumaSkin = { ...pack.skin, portrait: portraitOk ? portrait : undefined, name: { ko: named("ko"), en: named("en"), ja: named("ja") } };
      const fightArt: Partial<Record<NativeCitySkinFightArtSlot, { key: string; path: string }>> = {};
      for (const slot of NATIVE_CITY_SKIN_FIGHT_ART_SLOTS) {
        const path = nativeCitySkinFightArtPath(id, pack.fightArt?.[slot]);
        if (path) fightArt[slot] = { key: `native-city-${id}-fight-${slot}`, path };
      }
      const entry: NativeCityKumaSkinPack = { skin, pack, fightArt };
      loaded.set(id, entry);
      // 대화 초상은 서기 시트(`bust`)를 Phaser 가 잘라 그린다. 3D 카드가 같은 시트를 맡아도 내리지 않는다.
      declarePhaserDrawnTextures([skin.bust.key]);
      return entry;
    } catch {
      return null;
    }
  })();
  requests.set(id, request);
  return request;
}

/** The drawn portrait's fight art piece as a one-cell sheet (the village loads it with the standing sheets), else null. */
export function nativeCityKumaSkinPortraitSheet(entry: NativeCityKumaSkinPack): SpriteSheetAssetDefinition | null {
  const portrait = entry.skin.portrait, art = portrait ? entry.fightArt[portrait.slot] : undefined;
  return portrait && art ? { key: art.key, path: art.path, frameWidth: portrait.width, frameHeight: portrait.height, columns: 1, rows: 1 } : null;
}

/** Fighter `id`'s skin once its pack has loaded, else null. */
export function nativeCityKumaSkin(id: string): NativeCityKumaSkinPack | null { return loaded.get(id) ?? null; }
/** His shown name in `locale` (the base language's when that one has none); null until his pack is loaded. */
export function nativeCitySkinName(id: string, locale: Locale): string | null {
  const entry = loaded.get(id);
  return entry ? pickLocalized(locale, entry.skin.name) : null;
}
