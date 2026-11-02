import type { SpriteSheetAssetDefinition } from "./RuntimeArtTypes";


export const WIRE_NET_ART: SpriteSheetAssetDefinition = Object.freeze({ key: "combat-wire-net",
  path: "art/fx/combat-wire-net/net.webp", frameWidth: 384, frameHeight: 384, columns: 3, rows: 2 });
export const WIRE_NET_FILE_PATHS = [WIRE_NET_ART.path];

export type WireNetCel = "bundle" | "burst" | "open" | "wrapped" | "tear" | "fragments";
export const WIRE_NET_CELS: readonly WireNetCel[] = Object.freeze(["bundle", "burst", "open", "wrapped", "tear", "fragments"]);

/**
 * Each cel's net centre and the height its leash leaves the cell's left edge (cell fractions, measured by the packager — delivery.json).
 * The fragments have no leash (it is torn).
 */
export const WIRE_NET_CEL_ANCHORS: Readonly<Record<WireNetCel, { readonly centre: readonly [number, number]; readonly leash: number | null }>> =
  Object.freeze({
    bundle: { centre: [.584, .501], leash: .457 },
    burst: { centre: [.574, .51], leash: .456 },
    open: { centre: [.642, .519], leash: .503 },
    wrapped: { centre: [.612, .439], leash: .383 },
    tear: { centre: [.61, .447], leash: .364 },
    fragments: { centre: [.558, .555], leash: null },
  });
