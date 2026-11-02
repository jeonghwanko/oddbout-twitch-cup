import art from "./super-cutin-art.json";


export interface SuperCutInArt {
  readonly key: string;
  readonly path: string;
  readonly width: number;
  readonly height: number;
  readonly eye: readonly [number, number];
  readonly band: readonly [number, number];
}

export const SUPER_CUT_IN_ART: Readonly<Record<string, SuperCutInArt>> = Object.freeze(Object.fromEntries(
  Object.entries(art.art).map(([id, a]) => [id, Object.freeze({ key: `super-cutin-${id}`, path: a.path, width: a.width, height: a.height,
    eye: [a.eye[0]!, a.eye[1]!] as const, band: [a.band[0]!, a.band[1]!] as const })]),
));

export const SUPER_CUT_IN_FILE_PATHS: readonly string[] = Object.values(SUPER_CUT_IN_ART).map(a => a.path);

/** The close-up of cut-in id `id`, or null where none is drawn. */
export function superCutInArt(id: string): SuperCutInArt | null { return SUPER_CUT_IN_ART[id] ?? null; }
