import type { SpriteSheetAssetDefinition } from "../../assets/RuntimeArtTypes";
import type { VillageFacing } from "../../sim/VillageFacing";
import { NATIVE_CITY_COMBAT, type NativeCityKumaActionKind } from "../../sim/cityFight/NativeCityCombatTuning";
import { NATIVE_CITY_KUMA_MOVES } from "../../sim/cityFight/NativeCityKumaCombatState";
import { CITY_FIGHTERS } from "../../sim/cityFight/CityFighters";
import { kumaGrabBeats } from "../../sim/cityFight/NativeCityKumaGrab";
import { nativeCityWarpArtMs } from "../animation/NativeCityTempoWarp";
import { nativeCityOrthoActionAssets, nativeCityOrthoActionClip, nativeCityOrthoActionFacing, nativeCityOrthoActionSteps, nativeCityOrthoActionTiming,
  nativeCityOrthoClip, nativeCityOrthoClipCell, nativeCityOrthoClipSheets, nativeCityOrthoHitSteps,
  type NativeCityOrthoAction, type NativeCityOrthoActionClip, type NativeCityOrthoClip, type NativeCityOrthoPack } from "./NativeCityOrthoPack";
import { duelAirborneLift, duelReboundLift, duelWallFallLift } from "../animation/DuelReactionPose";
import { stepIndexAt, stepsTotal } from "../animation/StepTimeline";
import { type KumaFrameSpec, KUMA_MAIN_MOVE_CLIPS, KUMA_SPECIAL_MOVE_CLIPS, type KumaDashMove, type KumaGrabMove, type KumaKeyedClip, type KumaMoveClipKind, type KumaMoveStep, hitKeys, kumaBreakSteps, kumaClipFrame, kumaGrabMove, kumaMoveStepMs, kumaTempoWarp } from "../../sim/cityFight/NativeCityKumaFrames";

/** The frame data the rules read (`sim/cityFight/NativeCityKumaFrames`, 2026-10-22): this module keeps its names for render. */
export * from "../../sim/cityFight/NativeCityKumaFrames";
/**
 * Translation only: the shared down clock holds zero in hit stop and returns to the authored floor on impact. `wallMs`: the down clock when
 * the flight splatted on the line's end (`NativeCityKumaFighterState.downWallMs`) — from there it falls to the floor by the same impact.
 */
export function nativeCityKnockdownLift(timeMs: number, impactMs: number, bodyPx: number, reducedMotion: boolean, wallMs?: number): number {
  return duelWallFallLift(t => duelAirborneLift(t, impactMs, bodyPx * NATIVE_CITY_COMBAT.kuma.knockdown.liftBodies, reducedMotion),
    timeMs, impactMs, wallMs);
}

/**
 * The KO blow's flight (`knockback.ko.liftBodies`, 2026-10-20): the same arc to his drawn fall's ground impact, higher. `wallMs`: as above.
 * `reboundBodies` (2026-10-24, a bout's KO rope rebound — `NativeCityKumaFighterState.downRebound`): off the rope he rises that much more
 * from the height he hit it at, then comes down to the ground at the same impact.
 */
export function nativeCityKoLift(timeMs: number, impactMs: number, bodyPx: number, reducedMotion: boolean, wallMs?: number,
  reboundBodies?: number): number {
  const lift = (t: number) => duelAirborneLift(t, impactMs, bodyPx * NATIVE_CITY_COMBAT.knockback.ko.liftBodies, reducedMotion);
  if (reboundBodies === undefined || wallMs === undefined || timeMs <= wallMs) return duelWallFallLift(lift, timeMs, impactMs, wallMs);
  return duelReboundLift(lift(wallMs), reducedMotion ? 0 : bodyPx * reboundBodies, timeMs - wallMs, impactMs - wallMs);
}

/**
 * KUMA's art read as numbers (Phaser-free, 2026-10-10 — moved out of `NativeCityKumaView`, which re-exports them): his sheets, his walk
 * and run measure, the drawn headings, his swing's time warp and fight timing, the flinch / break / get-up step lists, the rim colours,
 * and the rule bridge built from his pack (`nativeCityKumaArtBridge`) — the view feeds it to his fighter every frame, and a rule test
 * builds the same bridge from `native-city-kuma-ortho-runtime.json` with no Phaser and no mocks.
 */

/** Village states loaded with the scene. Run stays unused; the fight actions load on the first challenge. */
export const KUMA_VILLAGE_STATES = ["idle", "walk"] as const;
/**
 * The eight screen headings the village draws him at. A declared pixel mirror ships once (2026-10-13): a heading whose clip is the other
 * side's mirror draws that one flipped (`nativeCityOrthoClip`) — his right side's gaits are side_left's, his left front diagonal and left
 * back diagonal's moves are the right ones'. His left back diagonal keeps its own still (a separate drawing, not a mirror).
 */
const KUMA_FACINGS: readonly VillageFacing[] = ["down", "down-right", "right", "up-right", "up", "up-left", "left", "down-left"];
/**
 * Fight actions, requested when he first turns hostile (`kumaCombatSheets`): the four diagonals, plus front / side_left / back
 * once his 8-way action art is in (2026-10-09; `side` draws `side_left` mirrored, `actionMirror`). `block` / `groggy` (a loop) /
 * `fall` are the traditional exchange's drawn clips (2026-10-09); a pack without them loads nothing for them and the view's
 * procedural rig stands in (`exchangeFx.rig.kuma`). `fightIdle` (2026-10-10 KOF pass, the side only) is his fight-stance breathing
 * loop: lazy with the fight sheets, since only a fight draws it.
 */
export const KUMA_COMBAT_ACTIONS = ["slam", "combo", "hit", "block", "groggy", "fall", "dash", "fightIdle", "ballSwing", "ballCombo", "ballSmash", "rollRise",
  "bowl", "buttSlam", "fightIdleBall", "guardIdle", "walkBall", "runBall", "summon", "fightWalk",
  // A fighter's own red grab sheet (2026-10-22, the parody guests — KUMA draws his grab on the iron-ball atlas, `kumaGrabClip`).
  "ballGrab",
  // A fighter's own skill (2026-10-22, the ODDBOUT event fighters — `kumaSkillClip`) and his air chase (`kumaAirChaseClip`).
  "skill", "airCombo",
  "skill2",
  // Its super form (2026-10-22 4차, `superSkill`), his READY entrance and his victory loop under the KO light (the arena's `stageClip`).
  "superSkill", "entrance", "victory",
  // The air chase's three-hit branch (2026-10-22 5차, `KUMA_AIR_CHASE_LONG` — one more juggle before the spike).
  "airCombo3"] as const;

/**
 * The clips the summon casts are drawn from (2026-10-20, `KumaTuning.summons` — her `spell`, his `drill`, and the plain `summon`): every
 * fighter's slot clips, fetched with his fight sheets like his own (`kumaSummonClip`). Read off the fighters' rows, not spelled out here.
 */
export const KUMA_CAST_CLIPS: readonly string[] = Object.freeze([...new Set(["summon",
  ...CITY_FIGHTERS.flatMap(fighter => (fighter.tuning.summons ?? []).map(slot => slot.clip ?? "summon"))])]);

/** Every fight clip a fighter's sheets may hold: the shared list and the casts'. */
const KUMA_FIGHT_CLIPS: readonly string[] = Object.freeze([...new Set<string>([...KUMA_COMBAT_ACTIONS, ...KUMA_CAST_CLIPS])]);


export function kumaFightGaitClip(pack: NativeCityOrthoPack, facing: VillageFacing, gait: "walk" | "run")
  : { readonly clip: NativeCityOrthoActionClip; readonly flipX: boolean } | null {
  return nativeCityOrthoActionClip(pack, facing, (gait === "walk" ? "walkBall" : "runBall") as NativeCityOrthoAction)
    ?? (gait === "walk" ? nativeCityOrthoActionClip(pack, facing, "fightWalk" as NativeCityOrthoAction) : null);
}

/**
 * The cell of a fight gait clip at the town gait's stride phase (0..1): `keys.cyclesPerStride` of its cycles per town stride (a fight
 * walk's short guarded steps cover less ground than a town step - its own loop turns that many times so the planted foot does not slide).
 */
export function kumaFightGaitFrame(found: { readonly clip: NativeCityOrthoActionClip; readonly flipX: boolean }, phase: number) {
  const frames = found.clip.frames, n = frames.length;
  const cycles = Number(found.clip.keys?.cyclesPerStride ?? 1) || 1;
  const k = ((Math.floor((Number.isFinite(phase) ? phase : 0) * cycles * n) % n) + n) % n;
  return nativeCityOrthoClipCell(found.clip, frames[k] ?? k, found.flipX);
}


export function kumaGrabThrowCarryShare(travelMs: number, flightMs: number, carry: KumaGrabMove["throwCarry"] = kumaGrabMove().throwCarry): number {
  const ms = flightMs > 0 ? Math.min(carry.ms, flightMs) : carry.ms;
  if (!(ms > 0) || !Number.isFinite(travelMs)) return 0;
  const u = Math.min(1, Math.max(0, travelMs / ms));
  return (1 - u) ** Math.max(1, carry.power);
}


export function kumaGrabHugPoint(hold: KumaGrabMove["hold"][string] | null, feetX: number, feetY: number, forward: 1 | -1, bodyPx: number)
  : { readonly x: number; readonly y: number } | null {
  const hug = hold?.hugCentreBody;
  if (!hug || !Number.isFinite(hug[0]) || !Number.isFinite(hug[1])) return null;
  return { x: feetX + forward * hug[0] * bodyPx, y: feetY - hug[1] * bodyPx };
}


export function kumaGrabStepAt(ms: number, caught: boolean, name?: string): { readonly cell: string; readonly shake: readonly [number, number];
  readonly hold: KumaGrabMove["hold"][string] | null } {
  const move = kumaGrabMove(name), beats = kumaGrabBeats(name), catchMs = beats.catchMs, t = Math.max(0, ms);
  const branch = caught ? move.caughtSteps : move.whiffSteps;
  const step = t < catchMs ? kumaMoveStepAt(move.steps, t) : kumaMoveStepAt(branch, t - catchMs);
  const last = (t < catchMs ? move.steps : branch).at(-1);
  const cell = step?.cell ?? last?.[0] ?? "bs-ready", shake = step?.shake ?? [0, 0];
  // Held from the catch until the throw lets go (the throw's own cell still holds him on its first frame — the release is the rules').
  const held = caught && t >= catchMs && t - catchMs < beats.throwMs + 1;
  return { cell, shake, hold: held ? move.hold[cell] ?? null : null };
}

/**
 * The step of a found clip (`kumaMoveClip`) drawn `elapsedMs` (art ms) into it, as `nativeCityOrthoActionFrame` draws a named action: its
 * cell (mirrored), its tremble (runtime-body px, mirrored) and its step index.
 */
export function kumaClipFrameAt(found: { readonly clip: NativeCityOrthoActionClip; readonly flipX: boolean }, elapsedMs: number)
  : { readonly frame: ReturnType<typeof nativeCityOrthoClipCell>; readonly shake: readonly [number, number]; readonly sequenceIndex: number } {
  const steps = nativeCityOrthoActionSteps(found.clip);
  const index = stepIndexAt(steps, Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0, "hold");
  const step = steps[index]!, shake = step.shake ?? [0, 0];
  return { frame: nativeCityOrthoClipCell(found.clip, step.frame, found.flipX), shake: [(found.flipX ? -1 : 1) * (shake[0] ?? 0), shake[1] ?? 0],
    sequenceIndex: index };
}

/**
 * A drawn move's contact cell trembling through the hit stop (2026-10-17, the move's `freezeShake` in native-city-kuma-moves.json): runtime
 * px for `frozenMs` of screen time spent frozen on that cell, or null (not on the contact, not frozen, or a move without one).
 */
export function kumaFreezeShake(found: { readonly clip: NativeCityOrthoActionClip; readonly flipX: boolean }, sequenceIndex: number,
  frozenMs: number): readonly [number, number] | null {
  const move = found.clip.keys?.move;
  const spec = typeof move === "string" ? (NATIVE_CITY_KUMA_MOVES as unknown as Readonly<Record<string, { readonly freezeShake?: {
    readonly stepMs: number; readonly steps: readonly (readonly number[])[] } }>>)[move]?.freezeShake : undefined;
  if (!spec || !(frozenMs > 0) || sequenceIndex !== nativeCityOrthoHitSteps(found.clip)[0]) return null;
  const step = spec.steps[Math.min(spec.steps.length - 1, Math.floor(frozenMs / Math.max(1, spec.stepMs)))]!, k = found.clip.bodyHeight / 640;
  return [(found.flipX ? -1 : 1) * (step[0] ?? 0) * k, (step[1] ?? 0) * k];
}

/** Translation in body heights: quick lift, readable apex, accelerating descent. The clip owns the contact clock. */
export function kumaButtSlamLift(clip: NativeCityOrthoActionClip, artMs: number): number {
  if (clip.keys?.groundedFlight !== true || !Number.isFinite(artMs)) return 0;
  const timing = nativeCityOrthoActionTiming(clip);
  const at = (key: string) => typeof clip.keys?.[key] === "number" ? timing.startsMs[clip.keys[key]] ?? 0 : 0;
  const takeoff = at("takeoff"), apex = at("apex"), fall = at("fall"), contact = at("impactSequenceIndex");
  if (artMs <= takeoff || artMs >= contact || apex <= takeoff || contact <= fall) return 0;
  const height = NATIVE_CITY_KUMA_MOVES.buttSlam.liftBody;
  if (artMs < apex) return height * (1 - (1 - (artMs - takeoff) / (apex - takeoff)) ** 2);
  if (artMs < fall) return height;
  return height * (1 - ((artMs - fall) / (contact - fall)) ** 2);
}

/**
 * A drawn dash's roll one frame on: `cells` (90 deg cells rolled so far, unwrapped) plus this frame's `travelMs` of charge and `slideMs` of
 * skid at his `speedShare` — one cell per `rollCellMs` at top speed, slower with his speed share (floor `rollMinShare`); the skid rolls on
 * at `slideRollScale`. Summed frame by frame, so the ball only ever rolls forward and slows as he brakes (2026-10-18: the old read put the
 * whole dash's time at the CURRENT share — through the whiff's skid the share falls 1 → 0 while the charge time stays, and the ball
 * tumbled backwards, 8.0 → 3.2 cells over ~8 frames).
 */
export function kumaDashRollAdvance(move: Pick<KumaDashMove, "rollCellMs" | "rollMinShare" | "slideRollScale">, cells: number,
  travelMs: number, slideMs: number, speedShare: number): number {
  const perMs = Math.max(move.rollMinShare, Math.min(1, speedShare)) / Math.max(1, move.rollCellMs);
  return cells + (Math.max(0, travelMs) + Math.max(0, slideMs) * move.slideRollScale) * perMs;
}

/**
 * Which roll cell a drawn dash draws after `cells` rolled (`kumaDashRollAdvance`). Stepped on time — never the per-frame wagon wheel a
 * distance-driven roll would make at his top speed.
 */
export function kumaDashRollIndex(move: Pick<KumaDashMove, "roll">, cells: number): number {
  return Math.floor(Math.max(0, cells)) % Math.max(1, move.roll.length);
}


export interface KumaDashRoll { readonly attackId: number; readonly travelMs: number; readonly slideMs: number; readonly cells: number }

/**
 * The roll one frame on (`kumaDashRollAdvance`), from `last` by what the dash's own fight clocks moved since: `travelMs` (charge ms past
 * the dive) and `slideMs` (skid ms; 0 in the charge) at this frame's `speedShare`. A hit stop or a freeze moves neither clock — the roll
 * holds. Another dash (`attackId`), or none before: it rolls from the first cell.
 */
export function kumaDashRollStep(move: Pick<KumaDashMove, "rollCellMs" | "rollMinShare" | "slideRollScale">, last: KumaDashRoll | null,
  attackId: number, travelMs: number, slideMs: number, speedShare: number): KumaDashRoll {
  const from = last && last.attackId === attackId && travelMs >= last.travelMs ? last : { attackId, travelMs: 0, slideMs: 0, cells: 0 };
  return { attackId, travelMs, slideMs,
    cells: kumaDashRollAdvance(move, from.cells, travelMs - from.travelMs, slideMs - from.slideMs, speedShare) };
}

/**
 * The step of a move's step list drawn `ms` into it: its cell and tremble (template px at body 640, side_left), or null once the list has
 * played (the stand's own cell).
 */
export function kumaMoveStepAt(steps: readonly KumaMoveStep[], ms: number): { readonly cell: string; readonly shake: readonly [number, number] } | null {
  const index = stepIndexAt(steps, Math.max(0, ms), "once", kumaMoveStepMs);
  if (index < 0) return null;
  const [cell, , shake] = steps[index]!;
  return { cell, shake: [shake?.[0] ?? 0, shake?.[1] ?? 0] };
}

/** Sheets the village loads for KUMA: idle + walk at every heading he draws (each sheet once — a mirrored heading shares its other side's). */
export function kumaVillageSheets(pack: NativeCityOrthoPack): SpriteSheetAssetDefinition[] {
  const sheets = new Map<string, SpriteSheetAssetDefinition>();
  for (const facing of KUMA_FACINGS) for (const state of KUMA_VILLAGE_STATES) {
    const clip = nativeCityOrthoClip(pack, facing, state) as NativeCityOrthoClip | undefined;
    // A skin draws the side only (`NativeCityKumaSkin`): its other headings fall back to it.
    if (!clip) continue;
    if (!clip.key) throw new Error(`KUMA village clip paged: ${facing}-${state}`);
    sheets.set(clip.key, { key: clip.key, path: clip.path, frameWidth: clip.frameWidth, frameHeight: clip.frameHeight, columns: clip.columns, rows: clip.rows });
  }
  return [...sheets.values()];
}

/** Fight sheets (slam, paged combo, hit, block, groggy, fall on every heading that draws them; fallback combos share their source pages). */
export function kumaCombatSheets(pack: NativeCityOrthoPack): SpriteSheetAssetDefinition[] {
  // His moves' clips (`bowl`, `buttSlam`) are names of his own, outside the shared ortho action list.
  return nativeCityOrthoActionAssets(pack, KUMA_FIGHT_CLIPS as readonly NativeCityOrthoAction[]);
}

/**
 * The fight sheets his view draws at `facing` (2026-10-13): every fight clip at the heading it resolves to there, and a swing's move clips
 * at the plain heading its kind resolves to (`kumaMoveClip`), every page. A 1:1 fight is side-on, so the challenge asks for the two side
 * headings only; any other heading asks for its own when it first draws a fight clip (stand-ins until then).
 */
export function kumaCombatSheetsAt(pack: NativeCityOrthoPack, facing: VillageFacing): SpriteSheetAssetDefinition[] {
  const headings = new Set<VillageFacing>([facing]);
  for (const kind of ["slam", "combo", "dash"] as const) {
    const plain = nativeCityOrthoActionFacing(pack, facing, kind);
    if (plain) headings.add(plain);
  }
  const sheets = new Map<string, SpriteSheetAssetDefinition>();
  for (const heading of headings) for (const action of KUMA_FIGHT_CLIPS) {
    const found = nativeCityOrthoActionClip(pack, heading, action as NativeCityOrthoAction);
    if (found) for (const sheet of nativeCityOrthoClipSheets(found.clip)) sheets.set(sheet.key, sheet);
  }
  return [...sheets.values()];
}

/** His run sheet at `facing` (the chase's run), else none. */
export function kumaRunSheetsAt(pack: NativeCityOrthoPack, facing: VillageFacing): SpriteSheetAssetDefinition[] {
  const clip = nativeCityOrthoClip(pack, facing, "run") as NativeCityOrthoClip | undefined;
  return clip?.key ? nativeCityOrthoClipSheets(clip) : [];
}

/**
 * His run on the eight headings (the chase's gap closer, `kuma.chase`), requested with the fight sheets on the first challenge.
 * The fight does not wait for them: until they are in, a run draws the walk clip at run speed.
 */
export function kumaRunSheets(pack: NativeCityOrthoPack): SpriteSheetAssetDefinition[] {
  const sheets = new Map<string, SpriteSheetAssetDefinition>();
  for (const facing of KUMA_FACINGS) for (const sheet of kumaRunSheetsAt(pack, facing)) sheets.set(sheet.key, sheet);
  return [...sheets.values()];
}

/**
 * A rig step of his hit clip (`exchangeFx.rig.kuma.parriedFrames` / `koFrame`, authored on the sample hit whose recoil is step
 * 12), shifted by this clip's own recoil - a derived keypose landmark set may put it elsewhere.
 */
export function kumaRigHitStep(clip: Pick<NativeCityOrthoActionClip, "keys">, step: number): number {
  return Math.max(0, step + hitKeys(clip).recoil - 12);
}

/**
 * Steps `from..to` (inclusive) of his clip spread evenly over `ms`: one per step, at least `minMs` each — a short span samples fewer
 * steps (always ending on `to`) instead of snapping through all of them.
 */
function kumaSpreadSteps(clip: KumaKeyedClip, from: number, to: number, ms: number, minMs: number): { frame: number; durationMs: number }[] {
  const count = to - from + 1;
  if (count <= 0 || !(ms > 0)) return [];
  const n = Math.max(1, Math.min(count, Math.floor(ms / Math.max(1, minMs))));
  const out: { frame: number; durationMs: number }[] = [];
  for (let i = 0; i < n; i++) {
    const step = n === 1 ? to : from + Math.round(i * (count - 1) / (n - 1));
    out.push({ frame: kumaClipFrame(clip, step), durationMs: ms / n });
  }
  return out;
}

/**
 * His flinch from the `hit` clip, `totalMs` long (`kuma.hurt`, 2026-10-09). The frozen frame is already the recoil (the snap lands
 * with the freeze, `framesBeforeRecoil` 0), held `holdMs`; a chain flinch spreads the stagger frames over the middle and ends on the
 * recover frames at `recoverFrameMs` — a side clip with a chain tail (`keys.chainTailSequenceIndex`) holds the snap to the end instead;
 * the string's `ender` holds the recoil through the skid (`enderHoldMs`) and samples the recover frames into the rest (never a step under
 * `minFrameMs` — no 22 ms-per-frame snap back). `beat` (the chain's jab 1 / straight 2): the jab snaps him to the stagger's first step
 * (the wince — a smaller recoil) instead of the recoil, so the straight's full recoil changes the drawing (2026-10-09: every hit read the
 * same).
 */
export function kumaHurtSteps(clip: KumaKeyedClip, totalMs: number = NATIVE_CITY_COMBAT.kuma.hurt.fallbackFlinchMs, ender = false,
  beat?: 1 | 2, holdTotalMs?: number): readonly { readonly frame: number; readonly durationMs: number }[] {
  const { recoil, stagger, recover } = hitKeys(clip), h = NATIVE_CITY_COMBAT.kuma.hurt, steps: { frame: number; durationMs: number }[] = [];
  // The jab (beat 1) snaps him to the stagger's first step — the wince (2026-10-18: the mid-stagger step was his hunched crouch, which read
  // as a guard); the straight to the full recoil; the ender knocks him back from it.
  const snap = !ender && beat === 1 ? stagger[0] : recoil;
  for (let i = Math.max(0, snap - Math.max(0, Math.floor(h.framesBeforeRecoil))); i < snap; i++) {
    steps.push({ frame: kumaClipFrame(clip, i), durationMs: h.frameMs });
  }
  const before = steps.length * h.frameMs, total = Math.max(before + 1, Number.isFinite(totalMs) ? totalMs : h.fallbackFlinchMs);
  // `holdTotalMs`: a flinch that went on (a later contact of the same swing, `KumaCombatHit.continued`) keeps the hold of the length its
  // first contact set — the longer end stretches what comes after the hold, the drawing never jumps back to the snap.
  const hold = Math.min(kumaHurtHoldMs(holdTotalMs ?? totalMs, ender, before), total - before);
  steps.push({ frame: kumaClipFrame(clip, snap), durationMs: hold });
  const left = total - before - hold;
  if (left <= 0) return steps;
  const tail = clip.keys?.chainTailSequenceIndex;
  if (!ender && typeof tail === "number" && Number.isInteger(tail) && tail >= 0 && clip.sequence?.[tail]) {
    // A string's hurt lock must still LOOK hurt until the next blow can land (2026-10-18 user: keep the hurt pose between the blows): the
    // snapped pose holds to its end — a later contact of the same swing then only stretches it (one flinch per move). The authored tail
    // step (his hunched crouch) read as a guard between the jab and the straight.
    steps[steps.length - 1]!.durationMs += left;
    return steps;
  }
  const recoverMs = ender ? left : Math.min(left, (recover[1] - recover[0] + 1) * h.recoverFrameMs);
  // The stagger after the snap (a mid-stagger snap goes on from there).
  steps.push(...kumaSpreadSteps(clip, snap === recoil ? stagger[0] : Math.min(stagger[1], snap + 1), stagger[1], left - recoverMs, h.minFrameMs));
  steps.push(...kumaSpreadSteps(clip, recover[0], recover[1], recoverMs, h.minFrameMs));
  return steps;
}

/** The snapped recoil's hold in a flinch `totalMs` long (`kuma.hurt`): the ender's `enderHoldMs`, else `holdShare` of it, at least `holdMs`. */
export function kumaHurtHoldMs(totalMs: number = NATIVE_CITY_COMBAT.kuma.hurt.fallbackFlinchMs, ender = false, beforeMs = 0): number {
  const h = NATIVE_CITY_COMBAT.kuma.hurt, total = Math.max(beforeMs + 1, Number.isFinite(totalMs) ? totalMs : h.fallbackFlinchMs);
  return ender ? h.enderHoldMs : Math.max(h.holdMs, (total - beforeMs) * h.holdShare);
}

/** When the groggy hold of a break starts and ends (ms into the break). */
export function kumaGroggySpan(clip: KumaKeyedClip | null): { readonly startMs: number; readonly endMs: number } {
  let at = 0;
  for (const step of kumaBreakSteps(clip ?? {})) {
    if (step.groggy) return { startMs: at, endMs: at + step.durationMs };
    at += step.durationMs;
  }
  return { startMs: at, endMs: at };
}

/** The art time drawn at fight-clock `modeMs` of that swing (the inverse of `kumaTempoWarp`). */
export function kumaArtMs(clip: NativeCityOrthoActionClip, action: NativeCityKumaActionKind, modeMs: number, spec: KumaFrameSpec,
  windupScale = 1): number {
  return nativeCityWarpArtMs(kumaTempoWarp(clip, action, spec, windupScale), modeMs);
}

/**
 * A cell of another of his clips that a side clip borrows (2026-10-10 KOF pass, `tools/art/kuma-side-sequences.mjs`): the side's dash
 * draws no crouch or breather of its own and the fall no get-up, so their missing poses are other clips' cells at the same heading.
 * Of the drawn moves only the iron-ball atlas itself (`ballSwing`) may lend a cell: the iron-ball get-up's scoop (2026-10-18). A heading
 * without it draws the fall played back instead (the view finds no clip).
 */
export interface KumaBorrowedCell {
  readonly clip: Exclude<(typeof KUMA_COMBAT_ACTIONS)[number], Exclude<KumaMoveClipKind, "ballSwing"> | "bowl" | "buttSlam" | "fightIdleBall"
    | "walkBall" | "runBall">;
  readonly frame: number;
}

function kumaBorrowedCell(value: unknown): KumaBorrowedCell | null {
  if (!value || typeof value !== "object") return null;
  const { clip, frame } = value as { readonly clip?: unknown; readonly frame?: unknown };
  const drawn: readonly string[] = [...Object.values(KUMA_MAIN_MOVE_CLIPS).filter(move => move !== "ballSwing"), ...Object.values(KUMA_SPECIAL_MOVE_CLIPS),
    "fightIdleBall", "walkBall", "runBall"];
  const kind = KUMA_COMBAT_ACTIONS.find((action): action is KumaBorrowedCell["clip"] => action === clip && !drawn.includes(action));
  return kind && typeof frame === "number" && Number.isInteger(frame) && frame >= 0 ? { clip: kind, frame } : null;
}

/** The cell his dash borrows for `phase` (`keys.standIns` on the dash clip: the crouch, the open stand after a whiff), else null. */
export function kumaDashStandIn(dash: Pick<NativeCityOrthoActionClip, "keys">, phase: "windup" | "recover"): KumaBorrowedCell | null {
  const standIns = dash.keys?.standIns;
  return standIns && typeof standIns === "object" ? kumaBorrowedCell((standIns as Readonly<Record<string, unknown>>)[phase]) : null;
}

/**
 * The cell his charge draws (2026-10-10 KOF stage 2): the travel plays the dash clip's steps from the launch — the side's grounded
 * travel stride, then the airborne still — and holds the last step; the slide holds it too. `airborne`: the last step, the still every
 * heading flies on (a one-cell clip is only that) — the one the view trembles and stretches, so it does not slide like a cut-out.
 */
export function kumaDashCell(dash: Pick<NativeCityOrthoActionClip, "sequence" | "frames" | "durationMs">, phase: "travel" | "slide",
  phaseMs: number): { readonly frame: number; readonly airborne: boolean } {
  const steps = dash.sequence && dash.sequence.length > 0 ? dash.sequence : [{ frame: dash.frames[0] ?? 0, durationMs: dash.durationMs ?? 1 }];
  const index = phase === "travel" ? stepIndexAt(steps, phaseMs, "hold", step => Math.max(0, step.durationMs)) : steps.length - 1;
  return { frame: steps[index]!.frame, airborne: index === steps.length - 1 };
}

/**
 * His drawn get-up (`keys.getUp` on the fall clip: lying -> the iron-ball scoop crouch -> standing, never back through the airborne fall
 * cells) spread over `totalMs` by its steps' shares; null when the clip has none (the fall is played back instead).
 */
export function kumaGetUpCells(fall: Pick<NativeCityOrthoActionClip, "keys">, totalMs: number)
  : readonly (KumaBorrowedCell & { readonly durationMs: number })[] | null {
  const list = fall.keys?.getUp;
  if (!Array.isArray(list) || list.length === 0) return null;
  const cells: (KumaBorrowedCell & { readonly ms: number })[] = [];
  for (const item of list) {
    const cell = kumaBorrowedCell(item), ms = (item as { readonly durationMs?: unknown } | null)?.durationMs;
    if (!cell || typeof ms !== "number" || !(ms > 0)) return null;
    cells.push({ ...cell, ms });
  }
  const sum = stepsTotal(cells, cell => cell.ms), length = Math.max(0, totalMs);
  return cells.map(({ clip, frame, ms }) => ({ clip, frame, durationMs: length * ms / sum }));
}

/** The held down pose: a late stagger frame. */
export function kumaDownFrame(clip: KumaKeyedClip): number {
  const { stagger } = hitKeys(clip);
  return kumaClipFrame(clip, Math.min(stagger[1], stagger[0] + NATIVE_CITY_COMBAT.kuma.down.staggerOffset));
}

/** The afterimage windows (recipes `afterimage.usedOn`): around each swipe contact, the slam's release, and the first half of a launch. */
export function kumaAfterimageActive(clock: { readonly action: NativeCityKumaActionKind; readonly modeMs: number;
  readonly hitsMs: readonly number[] }): boolean {
  if (clock.action === "slam") { const impact = clock.hitsMs[0]; return impact !== undefined && clock.modeMs >= impact - 100 && clock.modeMs <= impact + 20; }
  return clock.hitsMs.some(hit => clock.modeMs >= hit - 90 && clock.modeMs <= hit + 40);
}

/**
 * The opening's rim — the "attack now" magenta (`PALETTE.fightAttackNow`, 2026-10-19; gold before) — is lit `ms` after his counter window
 * opened (`feel.tells.opening`: on / off every `pulseMs` for `flashMs`).
 */
export function kumaOpeningRimOn(ms: number): boolean {
  const o = NATIVE_CITY_COMBAT.feel.tells.opening;
  return ms >= 0 && ms < o.flashMs && Math.floor(ms / Math.max(1, o.pulseMs)) % 2 === 0;
}

/** The widest body support in the impact cell, not the centre of the later lying pose or the iron ball. World-pixel offset. */
export function kumaPackGroundImpactOffset(pack: NativeCityOrthoPack | null, facing: VillageFacing, bodyPx: number): readonly [number, number] | null {
  const fall = pack ? nativeCityOrthoActionClip(pack, facing, "fall") : null;
  if (!fall) return null;
  const clip = fall.clip, step = nativeCityOrthoHitSteps(clip)[0];
  const index = step === undefined ? undefined : nativeCityOrthoActionSteps(clip)[step]?.frame;
  const origin = index === undefined ? undefined : clip.origins[index];
  const support = origin?.groundContacts?.length ? origin.groundContacts.reduce((a, b) => a.rx >= b.rx ? a : b) : null;
  if (!origin || !support) return null;
  const scale = bodyPx / clip.bodyHeight;
  return [(support.x - origin.originX) * scale * (fall.flipX ? -1 : 1), (support.y - origin.originY) * scale];
}
