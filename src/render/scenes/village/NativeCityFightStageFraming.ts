import type Phaser from "phaser";
import { nativeCitySpanFrame } from "../../../app/NativeCityPresentation";
import type { CityFightStageLine } from "../../../sim/cityFight/CityFightStageLine";
import { cityProject, type CityPoint, type NativeCityDefinition } from "../../../world/NativeCityDefinition";
import { PALETTE } from "../../art/palette";
import { NATIVE_CITY_FIGHT_STAGE } from "./NativeCityFighters";

/** A camera frame: zoom and centre (world px). */
export interface NativeCityStageCameraFrame { zoom: number; centerX: number; centerY: number }


export interface NativeCityStageFramedFoe {
  readonly point: CityPoint;
  readonly bodyScale: number;
  readonly landing?: CityPoint | null;
  /** Thrown up for the air combo: his feet's height (body heights) — the camera keeps his head in frame. Absent: on the ground. */
  readonly airBodies?: number;
  /** The top of that flight (body heights, ≥ `airBodies`): the camera frames it before he gets there. Absent: `airBodies`. */
  readonly airPeakBodies?: number;
}

/** One frame of what the stage camera frames. */
export interface NativeCityStageFramingInput {
  /** The stage's line while it is on; null: off (the camera eases back to the normal frame). */
  readonly line: CityFightStageLine | null;

  readonly point: CityPoint;
  /** The opponent standing here, else null. */
  readonly foe: NativeCityStageFramedFoe | null;
  readonly projection: NativeCityDefinition;
  readonly actorHeight: number;
  readonly reducedMotion: boolean;
  /** The normal frame's zoom over its default zoom (the village orbit's `toDefaultZoom`; 1 where the player cannot zoom). */
  readonly toDefaultZoom: number;

  readonly drawnReach?: number;
  /** The screen's top share kept for the HUD (the arena's face HUD floor, 2026-10-24); absent: `stage.drawnTopAt`, the village's. */
  readonly topShare?: number;
  /** The backbuffer size the camera fills. */
  readonly screen: { readonly width: number; readonly height: number };
  /** The game loop's frame index (the village clips its line once a side-on frame has rendered). */
  readonly loopFrame: number;
}

/**
 * The stage's letterbox bars (the "fight stage" cue): ink bands sliding in from the top and bottom edges while `on`, out after it. The
 * village stage and the arena's two screens (the player's bout and the AI duel — 2026-10-20, one look for both) draw the same bands.
 */
export class NativeCityFightStageBars {
  /** The bars' slide 0..1. */
  private slide = 0;

  draw(g: Phaser.GameObjects.Graphics, dtMs: number, on: boolean, reducedMotion: boolean, ui: { readonly width: number; readonly height: number }): void {
    const S = NATIVE_CITY_FIGHT_STAGE, goal = on ? 1 : 0, step = reducedMotion ? 1 : Math.max(0, dtMs) / Math.max(1, S.barsMs);
    this.slide = goal > this.slide ? Math.min(goal, this.slide + step) : Math.max(goal, this.slide - step);
    g.clear();
    if (this.slide <= 0) return;
    const k = this.slide * this.slide * (3 - 2 * this.slide), w = ui.width, h = ui.height, bar = h * S.barsShare * k;
    g.fillStyle(PALETTE.webtoonInk, 0.88).fillRect(0, 0, w, bar).fillRect(0, h - bar, w, bar);
  }
}

/**
 * The side-scroll fight stage's camera and letterbox bars (2026-10-18, out of `NativeCityFightStageController` so the village and the
 * tournament arena frame their fights the same way): both fighters framed with a dead zone along the line, the zoom fitting their gap,
 * feet at `feetAt` of the screen, eased over `followMs`; after the stage it eases back to the normal frame. Numbers: `native-city-fighters.json`
 * stage (`NATIVE_CITY_FIGHT_STAGE`).
 */
export class NativeCityFightStageFraming {
  /** The stage camera's eased frame (it also eases back to the normal frame after the stage lets go, then clears). */
  private frame: NativeCityStageCameraFrame | null = null;
  /** The game frame the stage camera last framed. */
  private tick = -1;
  /** The camera's centre while the stage is on: plan units along its line (re-projected each frame — the ground holds still under it). */
  private centerAlong: number | null = null;

  private lens: CityPoint | null = null;
  /** The letterbox bars. */
  private readonly bars = new NativeCityFightStageBars();

  /** The camera is still easing back to the normal frame after the stage let go. */
  get easing(): boolean { return this.frame !== null; }
  /** The game frame the stage camera last framed (−1 before the first). */
  get frameTick(): number { return this.tick; }

  lensTarget(): CityPoint | null { return this.lens; }

  /**
   * The stage camera on top of the normal frame: zoomed so the gap between the fighters plus `padBodies` body heights each side fills
   * the screen width (closer = tighter, apart = wider; within `zoomRange` of the normal fit, never cutting a head off), centred between
   * them with their feet at `feetAt` of the screen height - eased over `followMs`. After the stage it eases back to the normal frame.
   * The normal fit is taken at the DEFAULT zoom (`toDefaultZoom`), not the zoom the player left the town at (2026-10-17). `dtMs`: 0 on a
   * later composition the same frame and while the page is hidden, so the eases hold.
   */
  cameraFrame(frame: NativeCityStageCameraFrame, dtMs: number, input: NativeCityStageFramingInput): NativeCityStageCameraFrame {
    const scale = input.screen;
    this.tick = input.loopFrame;
    const S = NATIVE_CITY_FIGHT_STAGE, dt = Math.min(100, Math.max(0, dtMs));
    let target = { zoom: frame.zoom, centerX: frame.centerX, centerY: frame.centerY }, reaching = false;
    if (input.line) {
      const body = input.actorHeight, foe = input.foe;
      const player = cityProject(input.point, input.projection);
      // A flying opponent is framed where he will land (`NativeCityFightStageOtto.landing`).
      const foePoint = foe?.landing ?? foe?.point ?? null;
      const other = foePoint ? cityProject(foePoint, input.projection) : player;
      const tall = body * Math.max(1, foe?.bodyScale ?? 1), [low, high] = S.zoomRange;
      const fit = frame.zoom * input.toDefaultZoom, pair = nativeCitySpanFrame([player, other], scale.width, 2 * S.padBodies * tall);
      // `zoomScale`: the whole stage frame's scale (사용자 2026-10-11 "캐릭터가 너무 크다, 10% 줄여" 0.9; 2026-10-17 "액션감" 1.2 — as far
      // as the street's paintings stay sharp, measured on a zoom ladder: 1.5x of the old frame still crisp, 1.75x soft).
      // The arena (`topShare` given) fits it with room for a blow's punch-in (`reachPunchRoom`); the village as it was.
      const room = input.topShare === undefined ? 1 : 1 + S.reachPunchRoom;
      const reach = Math.max(tall, input.drawnReach ?? 0) * room, topAt = input.topShare ?? S.drawnTopAt;
      const ground = S.zoomScale * Math.max(fit * low, Math.min(fit * high, pair.zoom, scale.height * (S.feetAt - 0.08) / tall));
      // A drawing reaching far above him (the vault's handstand): its top no higher than `drawnTopAt` of the screen (the arena: its HUD's floor).
      let zoom = Math.min(ground, scale.height * (S.feetAt - topAt) / reach);
      let feetAt = S.feetAt;
      // The opponent thrown up (the air combo): his drawn top is his own body over his lift (`airBodies` are his body heights). The camera
      // rises first - the feet line sinks toward `airFeetAt` until that top stands at `drawnTopAt` - and zooms out only for the rest
      // (2026-10-21 blind test: zoomed out with the feet held, both bodies sat small at the top edge over empty ground).
      // Framed at the top of his flight, ahead of him (a re-lift outran the follow and took his head out of the frame).
      const air = Math.max(foe?.airBodies ?? 0, foe?.airPeakBodies ?? 0);
      if (air > 0) {
        const top = Math.max(reach, body * (foe?.bodyScale ?? 1) * (1 + air) * room);
        zoom = Math.min(zoom, scale.height * (S.airFeetAt - topAt) / top);
        feetAt = Math.min(S.airFeetAt, Math.max(S.feetAt, topAt + top * zoom / scale.height));
      }
      const centerX = this.stageCenterX(input.line, input.point, foePoint ?? input.point, zoom, tall, dt, input);
      target = { zoom, centerX, centerY: pair.bottom - (feetAt - 0.5) * scale.height / zoom };
      reaching = input.topShare !== undefined && zoom < ground - 1e-9;
    } else this.centerAlong = null;
    const from = this.frame ?? target, ease = (ms: number) => input.reducedMotion ? 1 : 1 - Math.exp(-dt / Math.max(1, ms));
    // The arena's drawing or flight that sets the zoom eases out faster (`reachFollowMs`), its height with it (the feet stay on their line).
    const k = ease(S.followMs), kOut = reaching && target.zoom < from.zoom ? ease(S.reachFollowMs) : k;
    // On the stage the centre is already eased along the line (`stageCenterX`); the zoom and the height ease here.
    const next = { zoom: from.zoom + (target.zoom - from.zoom) * kOut,
      centerX: input.line ? target.centerX : from.centerX + (target.centerX - from.centerX) * k,
      centerY: from.centerY + (target.centerY - from.centerY) * kOut };
    this.easeLens(k, input);
    const settled = Math.abs(next.zoom - frame.zoom) < frame.zoom * 0.004 && Math.hypot(next.centerX - frame.centerX, next.centerY - frame.centerY) < 2;
    this.frame = input.line || !settled ? next : null;
    return next;
  }

  /**
   * The stage camera's centre this frame (world px x): a point on the line that stays while the fighters' midpoint moves inside the dead
   * zone, follows the excess slowly (speed-capped), and follows at once only to keep a body off the screen's edges (`stage.camera`).
   */
  private stageCenterX(line: CityFightStageLine, player: CityPoint, foe: CityPoint, zoom: number, tall: number, dtMs: number,
    input: NativeCityStageFramingInput): number {
    const C = NATIVE_CITY_FIGHT_STAGE.camera, proj = input.projection, [d0, d1] = line.direction;
    const along = (p: CityPoint) => (p[0] - line.origin[0]) * d0 + (p[1] - line.origin[1]) * d1;
    const at = (t: number): CityPoint => [line.origin[0] + d0 * t, line.origin[1] + d1 * t];
    const o = cityProject(line.origin, proj), u = cityProject(at(1), proj);
    // World px per plan unit along the line; the screen spans `screen` plan units at this zoom.
    const pxPerUnit = Math.max(1e-6, Math.abs(u[0] - o[0])), screen = input.screen.width / Math.max(1e-6, zoom) / pxPerUnit;
    const a = along(player), b = along(foe), lo = Math.min(a, b), hi = Math.max(a, b), mid = (lo + hi) / 2;
    const half = screen / 2, edge = C.edgeShare * screen, body = C.bodyHalfWidth * tall / pxPerUnit, dz = C.deadZoneShare * screen;
    const from = this.centerAlong ?? mid;
    let goal = mid > from + dz ? mid - dz : mid < from - dz ? mid + dz : from;
    // Both bodies inside the edges (the middle of them when they cannot both fit).
    const minGoal = hi + body - half + edge, maxGoal = lo - body + half - edge;
    const pinned = minGoal > maxGoal ? (lo + hi) / 2 : goal < minGoal ? minGoal : goal > maxGoal ? maxGoal : null;
    if (pinned !== null) goal = pinned;
    let next = goal;
    if (!input.reducedMotion) {
      const k = 1 - Math.exp(-dtMs / Math.max(1, pinned !== null ? C.edgeFollowMs : C.centerFollowMs));
      let step = (goal - from) * k;
      if (pinned === null) { const cap = C.maxPanScreensPerSec * screen * dtMs / 1000; step = Math.max(-cap, Math.min(cap, step)); }
      next = from + step;
    }
    this.centerAlong = next;
    this.lens = at(next);
    return cityProject(at(next), proj)[0];
  }


  private easeLens(k: number, input: NativeCityStageFramingInput): void {
    if (input.line || !this.lens) return;
    const player = input.point, next: CityPoint = [this.lens[0] + (player[0] - this.lens[0]) * k, this.lens[1] + (player[1] - this.lens[1]) * k];
    this.lens = Math.hypot(player[0] - next[0], player[1] - next[1]) < 1e-3 || !this.frame ? null : next;
  }

  /** The stage's letterbox bars (`NativeCityFightStageBars`). */
  drawBars(g: Phaser.GameObjects.Graphics, dtMs: number, on: boolean, reducedMotion: boolean,
    ui: { readonly width: number; readonly height: number }): void {
    this.bars.draw(g, dtMs, on, reducedMotion, ui);
  }
}
