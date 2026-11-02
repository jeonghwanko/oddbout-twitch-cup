import data from "./fighter-move-fx.json";
import type { SpriteSheetAssetDefinition } from "./RuntimeArtTypes";
import { COMBAT_SMEAR_ART, type CombatSmearKind } from "./CombatSmearArtCatalog";
import type { FighterMoveLightRecipe } from "./FighterMoveLightRecipe";


export type FighterMoveFxSheetId = keyof typeof data.sheets;

/** One drawn effect: its cells on a sheet, played once (`frameMs` per cell) or held looping (`loopMs`). */
export interface FighterMoveFxEffect {
  readonly sheet: FighterMoveFxSheetId;
  readonly frames: readonly number[];
  readonly frameMs?: readonly number[];
  readonly loopMs?: number;
  /** The cell point laid on the anchor (cell shares). */
  readonly pivot: readonly [number, number];
  /** The drawn cell's width in the fighter's body heights. */
  readonly size: number;
  /** The last cell fades out over its time. */
  readonly fade?: boolean;
}

/**
 * Where an effect plays on a fighter's move: `clip` and the `cells` (by name) that start it — once as the drawn cell turns to one of them
 * (`enter`), drawn on him while it is one of them (`hold`), or spawned every `everyMs` and left behind (`trail`). `at`: [forward, up] body
 * heights from his drawn feet (his side art faces right); `layer`: in front of his body (default) or behind it.
 */
export interface FighterMoveFxCue {
  readonly clip: string;
  readonly cells: readonly string[];
  readonly on?: "enter" | "hold" | "trail";
  readonly everyMs?: number;
  readonly effect: string;
  readonly at: readonly [number, number];
  readonly layer?: "front" | "behind";
  readonly scale?: number;
  /** A sound the cue starts with it (2026-10-22 4차, ODDBOUT — `enter` cues only; the scene plays it, `FighterMoveFxView.takeSounds`). */
  readonly sound?: string;
  /** Its opacity (2026-10-23 2차). Absent: 1. */
  readonly alpha?: number;
  /**
   * A held loop's longest run (fight ms, `hold` cues — 2026-10-23 2차): it fades over its last quarter and is gone until its cells come round
   * again. Absent: as long as its cells.
   */
  readonly maxMs?: number;

  readonly arena?: { readonly scale?: number; readonly alpha?: number; readonly maxMs?: number };
  /**
   * A swing's brush smear (2026-10-24 — the fighters' swings carry no authored path, so one across the shoulder to the contact ran off the
   * limb: an uppercut smeared sideways): the attack smear art (`CombatSmear`) laid from `from` ([forward, up] body heights, as `at`) to `at`,
   * the limb's tip on its contact cell — drawn while the cue's cells are (it holds through the blow's freeze). `kind`: the brush (absent:
   * off its chord — down `slam`, up `hook`, else `swing`); `bow`: its middle this many body heights over its chord (absent: 0.12). The
   * cue's `effect` is "smear" (no sheet effect).
   */
  readonly smear?: { readonly from: readonly [number, number]; readonly kind?: CombatSmearKind; readonly bow?: number };
  /**
   * A light cue's limb path (2026-11-02 — its `effect` names a light recipe, `FIGHTER_MOVE_LIGHTS`): the points the limb's tip ran through
   * up to its cell, [forward, up] body heights from his drawn feet as `at` — the recipe's arcs are drawn along it.
   */
  readonly path?: readonly (readonly [number, number])[];
  /** A light cue's anchor on each of its cells (by cell name), where the body moves across them (a leap's comet): else `at`. */
  readonly cellAt?: Readonly<Record<string, readonly [number, number]>>;
  /**
   * A light cue that lights the blow itself (its contact cell — the white heart, the flare): the arena keeps the shared contact art off the
   * blows of its move (`fighterMoveFxOwnsContact`), as a drawn effect in front of him does.
   */
  readonly contact?: boolean;
}

const SHEET_DIR = "art/fx/fighter-move-fx-20261021";

export const FIGHTER_MOVE_FX_SHEETS: Readonly<Record<FighterMoveFxSheetId, SpriteSheetAssetDefinition>> = Object.freeze(Object.fromEntries(
  (Object.keys(data.sheets) as FighterMoveFxSheetId[]).map(id => {
    const sheet = data.sheets[id];
    return [id, Object.freeze({ key: `fighter-move-fx-${id}`, path: `${SHEET_DIR}/${sheet.image}`, frameWidth: sheet.frameWidth,
      frameHeight: sheet.frameHeight, columns: sheet.columns, rows: sheet.rows })];
  })) as Record<FighterMoveFxSheetId, SpriteSheetAssetDefinition>);

export const FIGHTER_MOVE_FX_EFFECTS = data.effects as unknown as Readonly<Record<string, FighterMoveFxEffect>>;

const CUES = data.fighters as unknown as Readonly<Record<string, readonly FighterMoveFxCue[]>>;

/**
 * The light recipes (2026-11-02, the registered witches' moves — `FighterMoveLight`): a cue whose `effect` names one draws it in added light
 * from code (no sheet).
 */
export const FIGHTER_MOVE_LIGHTS = data.lights as unknown as Readonly<Record<string, FighterMoveLightRecipe>>;

/** The light recipe a cue draws, or null (a sheet effect, a smear). */
export function fighterMoveFxLight(cue: FighterMoveFxCue): FighterMoveLightRecipe | null {
  return Object.hasOwn(FIGHTER_MOVE_LIGHTS, cue.effect) ? FIGHTER_MOVE_LIGHTS[cue.effect]! : null;
}

/**
 * Whether `cue` draws the blows of `move` (the striker's move by the arena's name — his special, his dash's, else his action) itself: a
 * drawn effect starting in front of him on that clip (2026-10-23 arena audit), or a light cue marked `contact` on it (a skill's
 * `skill:<kind>` is its `skill` clip). The arena then keeps the shared contact art off.
 */
export function fighterMoveFxOwnsContact(cue: FighterMoveFxCue, move: string): boolean {
  if (fighterMoveFxLight(cue)) return cue.contact === true && (cue.clip === move || move.startsWith(`${cue.clip}:`));
  return cue.clip === move && (cue.on ?? "enter") === "enter" && cue.layer !== "behind";
}


export function fighterMoveFxCues(skinId: string | null): readonly FighterMoveFxCue[] {
  return skinId !== null ? CUES[skinId] ?? [] : [];
}

/** The sheets a fighter's cues draw from (what his view asks for with his fight sheets). */
export function fighterMoveFxSheets(skinId: string | null): SpriteSheetAssetDefinition[] {
  const cues = fighterMoveFxCues(skinId);
  const ids = new Set(cues.map(cue => FIGHTER_MOVE_FX_EFFECTS[cue.effect]?.sheet).filter(id => id !== undefined));
  return [...[...ids].map(id => FIGHTER_MOVE_FX_SHEETS[id]), ...cues.some(cue => cue.smear) ? [COMBAT_SMEAR_ART] : []];
}

export const FIGHTER_MOVE_FX_FILE_PATHS: readonly string[] = Object.freeze(Object.values(FIGHTER_MOVE_FX_SHEETS).map(sheet => sheet.path));
