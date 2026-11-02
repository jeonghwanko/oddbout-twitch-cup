import type { SpriteSheetAssetDefinition } from "./RuntimeArtTypes";
import type { VillageFacing } from "../sim/VillageFacing";
import { villagePathFacing } from "../sim/VillagePathFacing";
import type { NativeCityMotionClip } from "./NativeCityMotionClip";
import { nativeCityWalkContacts } from "./NativeCityWalkContacts";
import { stepIndexAt } from "../sim/StepTimeline";

export type NativeCityOrthoDirection = "front" | "front_diagonal" | "side" | "back_diagonal" | "back";
/** Left headings drawn on their own (asymmetric looks). Without them the right view is mirrored. */
export type NativeCityOrthoLeftDirection = "front_diagonal_left" | "side_left" | "back_diagonal_left";
export type NativeCityOrthoGait = "idle" | "walk" | "run";

/** Contact ellipse in frame-local pixels, independent of the actor's identity or opponent. */
export interface NativeCityGroundContact {
  readonly x: number; readonly y: number; readonly rx: number; readonly ry: number;
}
export interface NativeCityOrthoOrigin {
  readonly originX: number; readonly originY: number;
  readonly groundContacts?: readonly NativeCityGroundContact[];
}

export interface NativeCityOrthoClip extends SpriteSheetAssetDefinition {
  readonly frames: readonly number[];
  readonly durationMs: number;
  readonly bodyHeight: number;
  /** Authored body height before the one-time runtime downscale (640). */
  readonly sourceBodyHeight?: number;
  readonly stridePixels?: number;
  readonly origins: readonly NativeCityOrthoOrigin[];
}


export type NativeCityOrthoAction = "attack" | "combo" | "slam" | "hit" | "ko" | "block" | "dodge" | "parry" | "groggy" | "fall" | "dash"
  | "fightIdle" | "guardIdle" | "vault" | "idleBreath" | "talk" | "reach" | "pickup" | "dashAttack" | "backstep"

  | "grabbed"

  | "guardBreak"

  | "airC" | "airV" | "airStomp"

  | "flung" | "dizzy"
  /**
   * The merchant's Otto seizure cells (2026-10-17, front / back diagonal, plaza pack): `carry`, `clutch`, `yanked`, `brace`, `kneel` in
   * `keys.cells` — the incident clock picks one by name (`app/OttoTownStaging`), the clip is never played on its own.
   */
  | "tussle"
  /**
   * A street neighbour cheering a side-view fight (2026-10-18, front / back diagonal loop, plaza pack): fist pumps and claps, feet planted.
   * Without it the watcher cheers with the talk loop (`nativeCityPlazaNpcCell`).
   */
  | "cheer";

export interface NativeCityOrthoSequenceStep {
  readonly frame: number;
  readonly durationMs: number;
  /** Runtime-body px offset for this step (impact tremble). */
  readonly shake?: readonly number[];
}

/** One atlas page of a clip too large for a single texture. `firstFrame` is the clip frame of the page's cell 0. */
export interface NativeCityOrthoPage {
  readonly key: string;
  readonly path: string;
  readonly firstFrame: number;
  readonly frames: number;
  readonly columns: number;
  readonly rows: number;
  /**
   * This page's own cell size (variable pages, 2026-10-11 — trimmed cells of similar size share a page; the clip's `frameWidth` /
   * `frameHeight` is then the largest page's). Absent: the clip's.
   */
  readonly frameWidth?: number;
  readonly frameHeight?: number;
}

export interface NativeCityOrthoActionClip {
  readonly sourceBodyHeight?: number;
  readonly oneShot?: boolean;
  /** Single-atlas clip. Paged clips carry `pages` instead. */
  readonly key?: string;
  readonly path?: string;
  readonly columns?: number;
  readonly rows?: number;
  readonly pages?: readonly NativeCityOrthoPage[];
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly frames: readonly number[];
  /** Frame time when there is no `sequence` (null for keypose clips that always carry one). */
  readonly durationMs: number | null;
  readonly bodyHeight: number;
  readonly origins: readonly NativeCityOrthoOrigin[];
  readonly sequence?: readonly NativeCityOrthoSequenceStep[];
  /** The single impact step (KUMA slam). */
  readonly impactSequenceIndex?: number;

  readonly hitSequenceIndices?: readonly number[];

  readonly lieSequenceIndex?: number;

  readonly hitSegments?: readonly { readonly startSequenceIndex: number; readonly endSequenceIndex: number; readonly hitSequenceIndex: number }[];
  /** A knock-down's lying body (its lie step's alpha box centre) from the root, runtime px (unmirrored). */
  readonly lieOffset?: readonly [number, number];
  /** Per contact, runtime px from the root to the farthest drawn pixel along the facing (the builder measures it): the reach the rules read. */
  readonly hitReachPx?: readonly number[];

  readonly rootTravelPx?: readonly number[];
  readonly totalMs?: number;
  /**
   * Authoring landmarks (`recoil`, `stagger`, `recover`, ...). `contacts` is ordered by hitSequenceIndices:
   * { motion: "lateral" | "rising" | "downward", releaseSequenceIndex, fxHeight? }. Release ends anticipation; the contact starts the hit stop.
   * fxHeight (0..1) positions the hit / guard effect relative to the receiver's body height; fxInset (0..1, optional) moves a hit's
   * effect back from the receiver's centre toward the attacker instead of `feel.fx.contactInset`. Neither alters hit judgment.
   * Receiver clips own `guardFrame` and `bodyMotion: "drawn"` (no extra procedural body bend). `bodyTrail: "none"` suppresses ghosts.
   * `hit.chainTailSequenceIndex` keeps a hurt pose between contacts; `hit.launchContactSequenceIndex` holds a planted catch during
   * a knockdown's hit stop. Both index the authored sequence, so atlas repacking cannot change their meaning.
   * `hit.launchReaction` selects contact/flight/landing/dazed sequence indices and settleMs for a non-KO launch. Missing keys keep
   * the existing hit/spin fallback. These poses follow the simulation's knock clock; they never extend its input locks.
   */
  readonly keys?: Readonly<Record<string, unknown>>;
  readonly fallbackFrom?: string;
}

export type NativeCityOrthoStates = Readonly<Record<NativeCityOrthoGait, NativeCityOrthoClip>>
  & Readonly<Partial<Record<NativeCityOrthoAction, NativeCityOrthoActionClip>>>;

export type NativeCityOrthoAnyDirection = NativeCityOrthoDirection | NativeCityOrthoLeftDirection;

export interface NativeCityOrthoPack {
  readonly schemaVersion: 1;

  readonly adopted: { readonly look: string; readonly runtimeApproved?: boolean; readonly identityId?: string; readonly outfit?: string };
  readonly camera: { readonly projection: "orthographic"; readonly elevationDegrees: number };
  readonly directions: Readonly<Record<NativeCityOrthoDirection, NativeCityOrthoStates>>
    & Readonly<Partial<Record<NativeCityOrthoLeftDirection, NativeCityOrthoStates>>>;
  /**
   * Action mirror map (symmetric costumes): a direction without an action clip draws the named direction's clip mirrored
   * (KUMA 2026-10-09: `side` ← `side_left`). A left direction without one always falls back to its right counterpart.
   */
  readonly actionMirror?: Readonly<Partial<Record<NativeCityOrthoAnyDirection, NativeCityOrthoAnyDirection>>>;
}

export interface NativeCityPlayerIdentity {
  readonly schemaVersion: number;
  readonly identityId: string;
  readonly activePack: string;
}

/** A generated direction pack can replace the approved grid only after explicit identity adoption. */
export function nativeCityOrthoIdentityApproved(pack: NativeCityOrthoPack, identity: NativeCityPlayerIdentity): boolean {
  return identity.schemaVersion === 1 && identity.activePack === "ortho"
    && identity.identityId.length > 0 && pack.adopted.runtimeApproved === true
    && pack.adopted.identityId === identity.identityId;
}

const FACING: Readonly<Record<VillageFacing, { direction: NativeCityOrthoDirection; flipX: boolean }>> = {
  down: { direction: "front", flipX: false },
  "down-right": { direction: "front_diagonal", flipX: false },
  right: { direction: "side", flipX: false },
  "up-right": { direction: "back_diagonal", flipX: false },
  up: { direction: "back", flipX: false },
  "down-left": { direction: "front_diagonal", flipX: true },
  left: { direction: "side", flipX: true },
  "up-left": { direction: "back_diagonal", flipX: true },
};

/** Undo the orthographic ground-plane foreshortening before choosing an authored yaw. */
export function nativeCityOrthoFacing(dx: number, dy: number, elevationDegrees: number): VillageFacing {
  const verticalScale = Math.sin(elevationDegrees * Math.PI / 180);
  return villagePathFacing(dx, dy / verticalScale);
}

/**
 * The authored view for a heading: an own left view when the pack has one, else the mirrored right view. With `state`: a view that does
 * not draw it borrows the other side's, flipped — a pack ships a declared pixel mirror once (2026-10-13, KUMA: his right side's gaits are
 * side_left's flipped, his left front diagonal is the right one flipped).
 */
function orthoView(pack: NativeCityOrthoPack, facing: VillageFacing, state?: string) {
  const { direction, flipX } = FACING[facing];
  const left = pack.directions[`${direction}_left` as NativeCityOrthoLeftDirection], right = pack.directions[direction];
  const view = flipX && left ? { states: left, flipX: false } : { states: right, flipX };
  if (state === undefined || view.states?.[state as keyof NativeCityOrthoStates] !== undefined) return view;
  // The other side's art drawn for this heading is always mirrored: a left heading from the right view, a right heading from the left one.
  const other = view.states === left ? right : left;
  return other?.[state as keyof NativeCityOrthoStates] !== undefined ? { states: other, flipX: true } : view;
}

/** The two side headings: the side-scroll stage draws every 1:1 village fight at these (사용자 결정 2026-10-10). */
export const NATIVE_CITY_SIDE_HEADINGS: readonly VillageFacing[] = Object.freeze(["left", "right"]);

export function nativeCityOrthoClip(pack: NativeCityOrthoPack, facing: VillageFacing, gait: NativeCityOrthoGait): NativeCityOrthoClip {
  return orthoView(pack, facing, gait).states[gait];
}

const HEADING_RING: readonly VillageFacing[] = ["right", "down-right", "down", "down-left", "left", "up-left", "up", "up-right"];

/**
 * The heading a gait draws at: `facing` when its view carries a clip `usable` takes, else the nearest heading 45° away that does —
 * toward the camera first (the face reads), then the right one; null when none within 45° does. A scripted walk on the stride clock
 * (`nativeCityPlazaNpcWalkStride`) takes only views with a measured stride, so a view that steps in place lends to its neighbour.
 */
export function nativeCityOrthoGaitFacing(pack: NativeCityOrthoPack, facing: VillageFacing, gait: NativeCityOrthoGait,
  usable: (clip: NativeCityOrthoClip) => boolean = () => true): VillageFacing | null {
  const carries = (heading: VillageFacing) => {
    const clip = orthoView(pack, heading, gait).states?.[gait];
    return clip !== undefined && usable(clip);
  };
  if (carries(facing)) return facing;
  const at = HEADING_RING.indexOf(facing), score = (heading: VillageFacing) =>
    (heading.startsWith("down") ? 2 : heading.startsWith("up") ? 0 : 1) * 2 + (heading.endsWith("right") ? 1 : 0);
  return [HEADING_RING[(at + 1) % 8]!, HEADING_RING[(at + 7) % 8]!].sort((a, b) => score(b) - score(a)).find(carries) ?? null;
}

/**
 * Screen length of a ground step along a heading over the same step seen from the side (1 for the side, sin(elevation) for front / back,
 * |(√½, sin·√½)| for the diagonals) — the projection the plaza NPC builder bakes a ground stride into each view's `stridePixels` with
 * (tools/art/build-native-city-plaza-npc.mjs). Dividing a view's stride by it gives the ground stride in side-view pixels.
 */
export function nativeCityOrthoStrideShare(facing: VillageFacing, elevationDegrees: number): number {
  const sin = Math.sin(elevationDegrees * Math.PI / 180), { direction } = FACING[facing];
  return direction === "side" ? 1 : direction.includes("diagonal") ? Math.hypot(Math.SQRT1_2, sin * Math.SQRT1_2) : sin;
}

const GAITS: readonly NativeCityOrthoGait[] = ["idle", "walk", "run"];
// The guest-list cells (`flung`, `dizzy`) are left out on purpose: only the Phaser door stage draws them (never a 3D card), so they are not
// declared with the actor's 3D sheets (`declareNativeCityActorSheets`, born low-res) — the scene requests them lazily for the quest step
// that plays them and lowers them after use (`NativeCityGuestListController`). test/guest-list-drawn.test.ts holds this.
const ACTIONS: readonly NativeCityOrthoAction[] = ["attack", "combo", "slam", "hit", "ko", "block", "dodge", "parry", "groggy", "fall", "dash",
  "fightIdle", "guardIdle", "vault", "idleBreath", "talk", "reach", "pickup", "dashAttack", "backstep", "grabbed", "guardBreak", "cheer",
  "airC", "airV", "airStomp"];
/**
 * Village life actions (lazy, requested after the scene's first load). The neighbours' `cheer` is not one of them: its sheets come when a
 * fight first draws the watchers (`NativeCityLifeView`), not with every entry.
 */
export const NATIVE_CITY_ORTHO_LIFE_ACTIONS: readonly NativeCityOrthoAction[] = ["idleBreath", "talk", "reach", "pickup"];

/** Every sheet a clip needs: one per page for paged clips (a variable page at its own cell size). */
export function nativeCityOrthoClipSheets(clip: NativeCityOrthoClip | NativeCityOrthoActionClip): SpriteSheetAssetDefinition[] {
  const { frameWidth, frameHeight } = clip;
  if ("pages" in clip && clip.pages) return clip.pages.map(page => ({ key: page.key, path: page.path, frameWidth: page.frameWidth ?? frameWidth,
    frameHeight: page.frameHeight ?? frameHeight, columns: page.columns, rows: page.rows }));
  if (!clip.key || !clip.path || clip.columns === undefined || clip.rows === undefined) throw new Error("Ortho clip has neither an atlas nor pages");
  return [{ key: clip.key, path: clip.path, frameWidth, frameHeight, columns: clip.columns, rows: clip.rows }];
}

/** Locomotion sheets (idle/walk/run) the scene preloads. One-shot actions are requested later (`nativeCityOrthoActionAssets`). */
export function nativeCityOrthoAssets(pack: NativeCityOrthoPack): SpriteSheetAssetDefinition[] {
  return nativeCityOrthoGaitAssets(pack, GAITS);
}

/** The listed gaits' sheets of every heading (the village loads `run` after its arrival veil lifts — `nativeCityArrivalLateSheets`). */
export function nativeCityOrthoGaitAssets(pack: NativeCityOrthoPack, gaits: readonly NativeCityOrthoGait[]): SpriteSheetAssetDefinition[] {
  // A heading that ships a gait once (its other side's mirror) has no clip of its own for it.
  return Object.values(pack.directions).flatMap(states => gaits.flatMap(gait => states[gait] ? nativeCityOrthoClipSheets(states[gait]) : []));
}

/** Action sheets of a pack (all actions, or the listed ones), deduplicated — fallback clips share their source pages. */
export function nativeCityOrthoActionAssets(pack: NativeCityOrthoPack,
  actions: readonly NativeCityOrthoAction[] = ACTIONS): SpriteSheetAssetDefinition[] {
  const sheets = new Map<string, SpriteSheetAssetDefinition>();
  for (const states of Object.values(pack.directions)) for (const action of actions) {
    const clip = states[action];
    if (clip) for (const sheet of nativeCityOrthoClipSheets(clip)) sheets.set(sheet.key, sheet);
  }
  return [...sheets.values()];
}

/** Whether any heading of the pack draws this action. */
export function nativeCityOrthoHasAction(pack: NativeCityOrthoPack, action: NativeCityOrthoAction): boolean {
  return (Object.values(pack.directions)).some(states => states[action] !== undefined);
}

export function nativeCityOrthoMotionClip(pack: NativeCityOrthoPack, facing: VillageFacing,
  gait: "walk" | "run", actorHeight: number): NativeCityMotionClip {
  const clip = nativeCityOrthoClip(pack, facing, gait);
  const contacts = gait === "walk" ? nativeCityWalkContacts(clip.key, clip.frames.length) : undefined;
  return {
    cycleMs: clip.frames.length * clip.durationMs,
    playbackRate: 1,
    stridePixels: clip.stridePixels === undefined ? undefined : clip.stridePixels * actorHeight / clip.bodyHeight,
    ...(contacts ? { contacts } : {}),
  };
}

export function nativeCityOrthoFrame(pack: NativeCityOrthoPack, facing: VillageFacing,
  elapsedSec: number, moving: boolean, gait: "walk" | "run") {
  const { states, flipX } = orthoView(pack, facing, moving ? gait : "idle");
  const clip = states[moving ? gait : "idle"];
  const elapsedMs = Number.isFinite(elapsedSec) ? Math.max(0, elapsedSec) * 1000 : 0;
  const ordinal = moving ? Math.floor(elapsedMs / clip.durationMs + 1e-9) % clip.frames.length : 0;
  const frame = clip.frames[ordinal]!;
  const origin = clip.origins[ordinal]!;
  return {
    texture: clip.key, frame, row: Math.floor(frame / clip.columns), column: frame % clip.columns,
    frameWidth: clip.frameWidth, frameHeight: clip.frameHeight, bodyHeight: clip.bodyHeight,
    originX: flipX ? clip.frameWidth - origin.originX : origin.originX, originY: origin.originY,
    groundContacts: origin.groundContacts,
    flipX, adopted: true as const,
  };
}

/**
 * The nearest diagonal (the four-diagonal fallback of `nativeCityOrthoActionFacing`). Diagonals stay; a side view
 * turns to its front diagonal (the face reads); straight up/down lean to `lean` (the last horizontal side, default right).
 */
export function nativeCityOrthoDiagonal(facing: VillageFacing, lean: "left" | "right" = "right"): VillageFacing {
  switch (facing) {
    case "right": return "down-right";
    case "left": return "down-left";
    case "down": return lean === "left" ? "down-left" : "down-right";
    case "up": return lean === "left" ? "up-left" : "up-right";
    default: return facing;
  }
}

/** The screen quadrant of a vector as a diagonal heading (dy > 0 is toward the camera). */
export function nativeCityScreenDiagonal(dx: number, dy: number): VillageFacing {
  return dy >= 0 ? (dx >= 0 ? "down-right" : "down-left") : (dx >= 0 ? "up-right" : "up-left");
}

/** The screen heading a direction's art faces. */
const DIRECTION_HEADING: Readonly<Record<NativeCityOrthoAnyDirection, VillageFacing>> = {
  front: "down", front_diagonal: "down-right", side: "right", back_diagonal: "up-right", back: "up",
  front_diagonal_left: "down-left", side_left: "left", back_diagonal_left: "up-left",
};
const REFLECTED: Readonly<Record<VillageFacing, VillageFacing>> = {
  down: "down", up: "up", right: "left", left: "right",
  "down-right": "down-left", "down-left": "down-right", "up-right": "up-left", "up-left": "up-right",
};
const headingSide = (facing: VillageFacing): "left" | "right" | null =>
  facing.endsWith("left") ? "left" : facing.endsWith("right") ? "right" : null;
const isDiagonalHeading = (facing: VillageFacing): boolean => facing.includes("-");

/** The heading of a direction on `side` of the screen (front / back stay down / up). */
function directionHeading(direction: string, side: "left" | "right"): VillageFacing | null {
  const heading = DIRECTION_HEADING[direction as NativeCityOrthoAnyDirection];
  if (!heading) return null;
  const own = headingSide(heading);
  return own && own !== side ? REFLECTED[heading] : heading;
}

type ActionClipAt = { readonly clip: NativeCityOrthoActionClip; readonly flipX: boolean };

/**
 * The action clip a heading draws WITHOUT turning: its own view's (an own left view when authored, else the mirrored right
 * one), else its mirror direction's clip flipped — the pack's `actionMirror`, and for a left heading always its right
 * counterpart (KUMA's exchange clips: symmetric costume, right diagonals only).
 */
function headingActionClip(pack: NativeCityOrthoPack, facing: VillageFacing, action: NativeCityOrthoAction): ActionClipAt | null {
  const { states, flipX } = orthoView(pack, facing);
  const own = states?.[action];
  if (own) return { clip: own, flipX };
  const { direction, flipX: left } = FACING[facing];
  const name = (left && pack.directions[`${direction}_left` as NativeCityOrthoLeftDirection] ? `${direction}_left` : direction) as NativeCityOrthoAnyDirection;
  const mirror = pack.actionMirror?.[name] ?? (left ? direction : undefined);
  const clip = mirror && mirror !== name ? pack.directions[mirror]?.[action] : undefined;
  return clip ? { clip, flipX: headingSide(DIRECTION_HEADING[mirror!]) !== headingSide(facing) } : null;
}

export interface NativeCityOrthoActionFacingOptions {
  /** Which side straight up / down turns to when it falls back (default right). Ignored for headings that have a side. */
  readonly lean?: "left" | "right";
  /** The diagonal to fall back to (KUMA's front-biased one); default `nativeCityOrthoDiagonal(facing, lean)`. */
  readonly diagonal?: VillageFacing;
}


export function nativeCityOrthoActionFacing(pack: NativeCityOrthoPack, facing: VillageFacing, action: NativeCityOrthoAction,
  options: NativeCityOrthoActionFacingOptions = {}): VillageFacing | null {
  const exact = headingActionClip(pack, facing, action);
  if (exact && !exact.clip.fallbackFrom) return facing;
  const side = headingSide(facing) ?? options.lean ?? "right";
  if (exact?.clip.fallbackFrom && !isDiagonalHeading(facing)) {
    const to = directionHeading(exact.clip.fallbackFrom, side);
    if (to && to !== facing && headingActionClip(pack, to, action)) return to;
  }
  const diagonal = options.diagonal ?? nativeCityOrthoDiagonal(facing, side);
  if (headingActionClip(pack, diagonal, action)) return diagonal;
  return exact ? facing : null;
}

/** The action clip a heading draws, at the heading `nativeCityOrthoActionFacing` resolves; null without art. */
export function nativeCityOrthoActionClip(pack: NativeCityOrthoPack, facing: VillageFacing, action: NativeCityOrthoAction,
  options: NativeCityOrthoActionFacingOptions = {}): ActionClipAt | null {
  const drawn = nativeCityOrthoActionFacing(pack, facing, action, options);
  return drawn ? headingActionClip(pack, drawn, action) : null;
}

/** Contact steps of a clip: authored list, KUMA `keys.hits`, or the single impact step. */
export function nativeCityOrthoHitSteps(clip: NativeCityOrthoActionClip): readonly number[] {
  if (clip.hitSequenceIndices) return clip.hitSequenceIndices;
  const hits = clip.keys?.hits;
  if (Array.isArray(hits) && hits.every(value => typeof value === "number")) return hits;
  return clip.impactSequenceIndex === undefined ? [] : [clip.impactSequenceIndex];
}

/** The clip's steps: its authored `sequence`, else every frame at `durationMs`. */
export function nativeCityOrthoActionSteps(clip: NativeCityOrthoActionClip): readonly NativeCityOrthoSequenceStep[] {
  return actionSteps(clip);
}

function actionSteps(clip: NativeCityOrthoActionClip): readonly NativeCityOrthoSequenceStep[] {
  return clip.sequence ?? clip.frames.map(frame => ({ frame, durationMs: clip.durationMs ?? 41.67 }));
}

/** When each step starts and the clip's length (ms). */
export function nativeCityOrthoActionTiming(clip: NativeCityOrthoActionClip): { readonly startsMs: readonly number[]; readonly totalMs: number;
  readonly hitsMs: readonly number[] } {
  const steps = actionSteps(clip), startsMs: number[] = [];
  let at = 0;
  for (const step of steps) { startsMs.push(at); at += Math.max(0, step.durationMs); }
  return { startsMs, totalMs: at, hitsMs: nativeCityOrthoHitSteps(clip).map(index => startsMs[index] ?? at) };
}

/** One clip frame as a drawable cell (page-aware), mirrored like `nativeCityOrthoFrame`. */
export function nativeCityOrthoClipCell(clip: NativeCityOrthoActionClip, frame: number, flipX: boolean) {
  const ordinal = Math.max(0, Math.min(clip.frames.length - 1, clip.frames.indexOf(frame) >= 0 ? clip.frames.indexOf(frame) : frame));
  const page = clip.pages?.find(candidate => frame >= candidate.firstFrame && frame < candidate.firstFrame + candidate.frames);
  const texture = page ? page.key : clip.key ?? "";
  const local = page ? frame - page.firstFrame : frame;
  const columns = page ? page.columns : clip.columns ?? 1;
  const origin = clip.origins[ordinal] ?? clip.origins[0]!;
  const supportOffsets = clip.keys?.supportOffsetsBody as readonly (readonly [number, number] | null)[] | undefined;
  const support = supportOffsets?.[ordinal];
  const frameWidth = page?.frameWidth ?? clip.frameWidth, frameHeight = page?.frameHeight ?? clip.frameHeight;
  return {
    texture, frame: local, row: Math.floor(local / columns), column: local % columns,
    frameWidth, frameHeight, bodyHeight: clip.bodyHeight,
    originX: flipX ? frameWidth - origin.originX : origin.originX, originY: origin.originY,
    groundContacts: origin.groundContacts,
    supportOffsetBody: support ? [(flipX ? -1 : 1) * support[0], support[1]] as const : undefined,
    flipX, adopted: true as const,
  };
}

export interface NativeCityOrthoActionFrame {
  readonly frame: ReturnType<typeof nativeCityOrthoClipCell>;
  /** The whole clip has played (the last step is held). */
  readonly done: boolean;
  /** Which contact (0-based) the current step is, if it is one. */
  readonly hitIndex?: number;
  /** Contacts whose step has started by `elapsedMs` — a caller that tracks fired hits never misses a short step. */
  readonly hitsReached: number;
  readonly sequenceIndex: number;
  /** This step's tremble in runtime-body px, mirrored with the frame. */
  readonly shake: readonly [number, number];
  readonly totalMs: number;
}

/** A receiver's planted catch before its fall starts. The caller uses this only while the shared fight clock is held at contact. */
export function nativeCityOrthoLaunchContact(pack: NativeCityOrthoPack, facing: VillageFacing): ReturnType<typeof nativeCityOrthoClipCell> | null {
  const found = nativeCityOrthoActionClip(pack, facing, "hit");
  const index = found?.clip.keys?.launchContactSequenceIndex;
  if (!found || typeof index !== "number" || !Number.isInteger(index) || index < 0) return null;
  const step = found.clip.sequence?.[index];
  return step ? nativeCityOrthoClipCell(found.clip, step.frame, found.flipX) : null;
}

/** The frame of a one-shot action `elapsedMs` after it started, or null when this heading has no such clip. */
export function nativeCityOrthoActionFrame(pack: NativeCityOrthoPack, facing: VillageFacing, action: NativeCityOrthoAction,
  elapsedMs: number, options: NativeCityOrthoActionFacingOptions = {}): NativeCityOrthoActionFrame | null {
  const found = nativeCityOrthoActionClip(pack, facing, action, options);
  if (!found) return null;
  const { clip, flipX } = found;
  const steps = actionSteps(clip), timing = nativeCityOrthoActionTiming(clip), hits = nativeCityOrthoHitSteps(clip);
  const at = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const index = stepIndexAt(steps, at, "hold");
  const step = steps[index]!;
  const hitIndex = hits.indexOf(index);
  const shake = step.shake ?? [0, 0];
  return {
    frame: nativeCityOrthoClipCell(clip, step.frame, flipX),
    done: at >= timing.totalMs,
    ...(hitIndex >= 0 ? { hitIndex } : {}),
    hitsReached: timing.hitsMs.filter(ms => ms <= at).length,
    sequenceIndex: index,
    shake: [(flipX ? -1 : 1) * (shake[0] ?? 0), shake[1] ?? 0],
    totalMs: timing.totalMs,
  };
}

/**
 * A looping action (`talk`) `elapsedMs` after it started, wrapped at its length; null when the heading has no such clip. Same heading
 * rules and mirroring as the one-shots (`nativeCityOrthoActionFacing`).
 */
export function nativeCityOrthoActionLoopFrame(pack: NativeCityOrthoPack, facing: VillageFacing, action: NativeCityOrthoAction,
  elapsedMs: number, options: NativeCityOrthoActionFacingOptions = {}): NativeCityOrthoActionFrame | null {
  const found = nativeCityOrthoActionClip(pack, facing, action, options);
  if (!found) return null;
  const totalMs = nativeCityOrthoActionTiming(found.clip).totalMs;
  const at = Number.isFinite(elapsedMs) && totalMs > 0 ? Math.max(0, elapsedMs) % totalMs : 0;
  return nativeCityOrthoActionFrame(pack, facing, action, at, options);
}
