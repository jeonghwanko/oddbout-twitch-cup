import baseArt from "./native-city-smash-fx.json";
import ottoRock from "./native-city-otto-rock-fx.json";
import type { SpriteSheetAssetDefinition } from "./RuntimeArtTypes";

const art = { ...baseArt, ottoRock };

export type SmashLayer = keyof typeof art;
export interface SmashFlipbook extends SpriteSheetAssetDefinition {
  readonly durationsMs: readonly number[];
  /** Swing is anchored at its ball endpoint; every other layer uses its authored contact pivot. */
  readonly pivot: readonly [number, number];
}

/** Raster delivery. Equal-size cells, unequal exposures, normal alpha blend; each source keeps its provenance manifest. */
function flipbook(kind: SmashLayer): SmashFlipbook {
  const sheet = art[kind];
  return {
  key: `native-city-smash-${kind}`, path: `art/fx/${kind === "ottoRock" ? "combat-ground-eruption" : "kuma-smash-20261012"}/${sheet.image}`,
  frameWidth: sheet.frameWidth, frameHeight: sheet.frameHeight, columns: sheet.columns, rows: sheet.rows,
  durationsMs: sheet.durationsMs, pivot: [sheet.pivot[0]!, sheet.pivot[1]!],
  };
}
export const SMASH_FLIPBOOKS = Object.freeze({
  gather: flipbook("gather"), swing: flipbook("swing"), contact: flipbook("contact"), dust: flipbook("dust"),
  /** The iron ball meeting the ground (2026-10-17, ink + candle gold; replaces the yellow dust and ring on his slam). */
  impact: flipbook("impact"),
  /** A guard breaking open ("깨짐!", 2026-10-17): porcelain shards round a keyhole crack. */
  shatter: flipbook("shatter"),
  /**
   * Small ground dust in the same hand (2026-10-18, replaces the exchange recipe's last code-drawn stand-ins): `skid` — dust kicked back
   * behind a slide, drawn trailing LEFT of its pivot (the leading edge; flip it for dust flying right); `puff` — a body thudding down,
   * both ways.
   */
  skid: flipbook("skid"), puff: flipbook("puff"), ottoRock: flipbook("ottoRock"),

  crescent: flipbook("crescent"), crack: flipbook("crack"),
});
/** The flipbooks that lie on the ground (drawn just above the actors' foot dust, not with the bursts). */
export const SMASH_GROUND_LAYERS: ReadonlySet<SmashLayer> = new Set<SmashLayer>(["dust", "skid", "puff", "ottoRock"]);

export const SMASH_FX_FILE_PATHS = Object.values(SMASH_FLIPBOOKS).map(sheet => sheet.path);
export const smashDurationMs = (kind: SmashLayer): number => SMASH_FLIPBOOKS[kind].durationsMs.reduce((a, b) => a + b, 0);
/** Authored release occupies the first four cells; contact holds the fifth on the shared fight clock. */
export const SMASH_RELEASE_MS = art.swing.releaseMs;
