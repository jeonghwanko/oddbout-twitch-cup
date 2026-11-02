import data from "./fighter-draw-scale.json";
import { nativeCityOrthoClipCell, type NativeCityOrthoActionClip, type NativeCityOrthoPack } from "./NativeCityOrthoPack";


const FIGHTERS = data.fighters as unknown as Readonly<Record<string, Readonly<Record<string, number>>>>;
const EYE = data.eye as unknown as Readonly<Record<string, Readonly<Record<string, number>>>>;
const STAND = data.stand as unknown as Readonly<Record<string, Readonly<Record<string, number>>>>;

/** `id`'s draw scale by clip name or `clip#ordinal` (none: an empty table). */
export function fighterDrawScales(id: string | null): Readonly<Record<string, number>> {
  if (id === null) return {};
  const base: Readonly<Record<string, number>> = { ...FIGHTERS[id], ...EYE[id] };
  const stand = STAND[id];
  if (!stand) return base;
  const scales: Record<string, number> = { ...base };
  for (const [entry, k] of Object.entries(stand)) {
    const clip = entry.split("#")[0]!;
    if (entry.includes("#")) {
      scales[entry] = (base[entry] ?? base[clip] ?? 1) * k;
      continue;
    }
    // A whole clip: its own scale and every cell entry of it.
    scales[clip] = (base[clip] ?? 1) * k;
    for (const key of Object.keys(base)) if (key.startsWith(`${clip}#`)) scales[key] = base[key]! * k;
  }
  return scales;
}

/**
 * The draw scale of every side cell of `pack` a table rescales (`texture#frame` → scale): the view reads a drawn cell, not its clip. Both
 * side headings (KUMA's right side mirrors `side_left`). A cell no rescaled clip draws is absent (scale 1).
 */
export function fighterDrawScaleIndex(pack: NativeCityOrthoPack, scales: Readonly<Record<string, number>>): ReadonlyMap<string, number> {
  const index = new Map<string, number>();
  if (Object.keys(scales).length === 0) return index;
  const directions = pack.directions as unknown as Readonly<Record<string, Readonly<Record<string, NativeCityOrthoActionClip>> | undefined>>;
  for (const heading of ["side", "side_left"]) {
    for (const [name, clip] of Object.entries(directions[heading] ?? {})) {
      if (!Array.isArray(clip?.frames)) continue;
      clip.frames.forEach((frame, ordinal) => {
        const scale = scales[`${name}#${ordinal}`] ?? scales[name];
        if (scale === undefined) return;
        const cell = nativeCityOrthoClipCell(clip, frame, false);
        index.set(`${cell.texture}#${cell.frame}`, scale);
      });
    }
  }
  return index;
}

/** A cell's draw scale in `index` (1 where none). */
export function fighterCellDrawScale(index: ReadonlyMap<string, number>, texture: string, frame: number | string): number {
  return index.get(`${texture}#${frame}`) ?? 1;
}

/** `frame` as `index` draws it: its body height over the cell's draw scale (the same frame where it has none). */
export function fighterDrawnFrame<T extends { readonly texture: string; readonly frame: number | string; readonly bodyHeight: number }>(
  index: ReadonlyMap<string, number>, frame: T): T {
  const scale = fighterCellDrawScale(index, frame.texture, frame.frame);
  return scale === 1 ? frame : { ...frame, bodyHeight: frame.bodyHeight / scale };
}
