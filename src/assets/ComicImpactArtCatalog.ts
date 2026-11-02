import type { SpriteSheetAssetDefinition } from "./RuntimeArtTypes";

/**
 * The drawn contact cels (comic-impact family, 3 x 2 sheets of 384 px cells). strike / heavy / slash / parry: one sheet each, six cels.
 * 2026-10-17 (이펙트 화풍 통일 — the procedural white stars, shield arcs and glints read as clip art over the painted cels): two sheets of
 * two three-cel kinds each, top row then bottom row — `block.webp` (clang: a blow off iron armour or the iron ball; block: a blow stopped
 * by a raised guard) and `glint.webp` (glint: the eye gleam before a charge; twinkle: a small sparkle — a raised guard, a wind-up tell).
 */
export type ComicImpactArtKind = "strike" | "heavy" | "slash" | "parry" | "clang" | "block" | "glint" | "twinkle";
const sheet = (file: string): SpriteSheetAssetDefinition => Object.freeze({ key: `comic-impact-${file}`,
  path: `art/fx/comic-impact-20261015/${file}.webp`, frameWidth: 384, frameHeight: 384, columns: 3, rows: 2 });
const BLOCK_SHEET = sheet("block"), GLINT_SHEET = sheet("glint");
export const COMIC_IMPACT_ART: Readonly<Record<ComicImpactArtKind, SpriteSheetAssetDefinition>> = Object.freeze({
  strike: sheet("strike"), heavy: sheet("heavy"), slash: sheet("slash"), parry: sheet("parry"),
  clang: BLOCK_SHEET, block: BLOCK_SHEET, glint: GLINT_SHEET, twinkle: GLINT_SHEET,
});
export const COMIC_IMPACT_ART_KINDS = Object.freeze(Object.keys(COMIC_IMPACT_ART) as ComicImpactArtKind[]);
/** Each sheet once (two kinds share the block and glint sheets). */
export const COMIC_IMPACT_SHEETS: readonly SpriteSheetAssetDefinition[] = Object.freeze([...new Set(Object.values(COMIC_IMPACT_ART))]);
export const COMIC_IMPACT_FILE_PATHS = COMIC_IMPACT_SHEETS.map(s => s.path);
/** The kind's first cel on its sheet (the shared sheets' bottom-row kinds start at cel 3). */
export const COMIC_IMPACT_FIRST_FRAME: Readonly<Record<ComicImpactArtKind, number>> = Object.freeze({
  strike: 0, heavy: 0, slash: 0, parry: 0, clang: 0, block: 3, glint: 0, twinkle: 3,
});
/**
 * The peak holds with the actual contact. The tail is two torn cels, then cut (2026-10-15 frame review: the last cels' round flame
 * tongues came back over the struck face during the slow-mo). The three-cel kinds: one lead cel, the peak, one tail cel.
 */
export const COMIC_IMPACT_EXPOSURES = Object.freeze({
  // Keep the peak across a 30 Hz presentation interval: 16 + 16 skipped cel 1 entirely at 33 ms.
  strike: { leadMs: 16, peakMs: 32, tailMs: [16, 17] },
  heavy: { leadMs: 16, peakMs: 32, tailMs: [17, 16] },
  slash: { leadMs: 16, peakMs: 24, tailMs: [17, 16] },
  parry: { leadMs: 16, peakMs: 32, tailMs: [17, 16] },
  // A stopped blow (vfx-artist 2026-10-17): 17 ms of the first contact, the peak through the freeze (at least 40 ms), 33 ms, cut.
  clang: { leadMs: 17, peakMs: 40, tailMs: [33] },
  block: { leadMs: 17, peakMs: 40, tailMs: [33] },
  // The tells: the eye gleam 33 / 67 / 50, the sparkle 40 / 110 / 70 (a caller's hold stretches the peak — the wind-up's 180).
  glint: { leadMs: 33, peakMs: 67, tailMs: [50] },
  twinkle: { leadMs: 40, peakMs: 110, tailMs: [70] },
});
/** While the peak holds, it "boils" every this many ms (a tiny turn and swell) — a frozen picture that is still alive. */
export const COMIC_IMPACT_BOIL_MS = 33;


export const COMIC_IMPACT_CLEAR_HOLD = Object.freeze({ alpha: .45, scale: .68 });

export function comicImpactArtFrame(kind: ComicImpactArtKind, ageMs: number, holdMs = 0, clearHold = false):
  { frame: number; alpha: number; boil?: 1; scale?: number } | null {
  if (!Number.isFinite(ageMs) || ageMs < 0) return null;
  const t = COMIC_IMPACT_EXPOSURES[kind], first = COMIC_IMPACT_FIRST_FRAME[kind];
  if (ageMs < t.leadMs) return { frame: first, alpha: 1 };
  const own = t.leadMs + t.peakMs, release = Math.max(own, kind === "strike" || kind === "parry" ? 0 : holdMs);
  const aside = clearHold && (kind === "heavy" || kind === "slash") && release > own, C = COMIC_IMPACT_CLEAR_HOLD;
  if (ageMs < release) {
    const held = aside && ageMs >= own ? { alpha: C.alpha, scale: C.scale } : { alpha: 1 };
    return Math.floor((ageMs - t.leadMs) / COMIC_IMPACT_BOIL_MS) % 2 === 1 ? { frame: first + 1, ...held, boil: 1 } : { frame: first + 1, ...held };
  }
  let at = release;
  for (let i = 0; i < t.tailMs.length; i++) {
    const duration = t.tailMs[i]!;
    const alpha = i === t.tailMs.length - 1 ? 1 - (ageMs - at) / duration : 1;
    if (ageMs < at + duration) return aside ? { frame: first + i + 2, alpha: alpha * C.alpha, scale: C.scale } : { frame: first + i + 2, alpha };
    at += duration;
  }
  return null;
}
