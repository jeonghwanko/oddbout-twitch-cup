import Phaser from "phaser";
import { NATIVE_CITY_SUMMON_ART, NATIVE_CITY_SUMMON_CASTER_ART, NATIVE_CITY_SUMMON_FX_ART, nativeCitySummonArt,
  type NativeCitySummonArt } from "../../assets/NativeCitySummonArtCatalog";
import { cityFightSummonPoint, cityFightSummonStrikePhase, cityFightSummonStrikeTimes, cityFightSummonTelling, cityFightSummonTravel,
  type CityFightSummon, type CityFightSummonField, type CityFightSummonTarget } from "../../sim/cityFight/CityFightSummons";
import { cityFightSummonSpec, type CityFightSummonKind } from "../../sim/cityFight/CityFightSummonTuning";
import type { CityFightStageLine } from "../../sim/cityFight/CityFightStageLine";
import { cityProject, type NativeCityDefinition } from "../../world/NativeCityDefinition";
import { nativeCityStepUnits } from "../../world/NativeCityTalkSpot";
import { artTextureKey } from "../art/ArtFallback";
import { easeOutCubic } from "../art/easing";
import { PALETTE } from "../art/palette";
import { preloadSpriteSheets } from "../art/PhaserAssetLoader";
import { VILLAGE_DEPTHS, villageDepthJustAbove, villageYSorted } from "../depths";
import { GunFxLayer, gunBulletPaint } from "./GunshotFxView";



export interface NativeCitySummonViewSpec {
  readonly projection: () => NativeCityDefinition;
  readonly actorHeight: () => number;
  readonly reducedMotion: () => boolean;
  /**
   * The roadster's vapour cloud sits just behind the bodies on its line instead of over them (2026-10-20, the arena's AI duel — game-animator:
   * the cloud covered both fighters whole). Absent: over them (the village fight).
   */
  readonly blastBehindBodies?: boolean;
}

/**
 * A summon's sound this frame (the presenter plays it — `VillageMeleeCue`): a car's tell and its go. The crane's release is the cast's own
 * whoosh (the opponent's swing cues time it to the release).
 */
export type NativeCitySummonCue = "swingHeavy" | "glint";

/** One frame of the field: its state, the stage it travels, the bodies on it (the depth rule) and the frame's screen clock. */
export interface NativeCitySummonFrame {
  readonly field: CityFightSummonField;
  readonly line: CityFightStageLine | null;
  /** The fighters on the stage (their feet along the line, their radius): a summon goes behind its owner and a body it has passed. */
  readonly bodies: readonly CityFightSummonTarget[];
  readonly screenDtMs: number;
}

/** What the fight's effects frame hands the summons (`NativeCityCombatHost.summons`). */
export interface NativeCitySummonSink {
  /** Draws the field; returns the frame's sound cues. */
  frame(input: NativeCitySummonFrame): readonly NativeCitySummonCue[];
  /**
   * Asks for the sheets now (a summoner was challenged): the first summon then draws its art, not the stand-in. `casters`: the fighters whose
   * own drawings (`NATIVE_CITY_SUMMON_CASTER_ART`) come too.
   */
  prepare?(casters?: readonly string[]): void;
  /** Sprites the 3D card view draws as bodies. */
  readonly cardObjects?: readonly Phaser.GameObjects.Sprite[];
}

/** Sprites in the pool: two cranes, a car and its beam (or the roadster and its vapour), their folds, with room to spare. */
const POOL_SIZE = 8;
/** At most this many folds playing at once (the oldest goes first). */
const MAX_BURSTS = 3;
/** The crane's and the roadster's bob (share of the actor's height, its period ms). */
const BOB = { share: 0.025, periodMs: 520 };
/** The sports car's headlight beams through its tell: two blinks (on / off ms), then they grow from `from` to full length. */
const BEAM = { onMs: 100, offMs: 80, blinks: 2, from: 0.6 };
/** A summon drawn behind a body sits this share of the actor's height farther back on the 3D cards. */
const BEHIND_SHARE = 0.04;

interface Burst {
  readonly kind: CityFightSummonKind;
  readonly art: NativeCitySummonArt;
  readonly x: number;
  readonly y: number;
  readonly widthPx: number;
  readonly flip: boolean;
  readonly groundY: number;
  ageMs: number;
}

/** One sprite's paint: the cell, where, how wide, flipped, the ground under it, in front of the bodies or not, its scale / alpha / blend. */
interface Paint {
  readonly kind: CityFightSummonKind;
  /** The summon's drawing (its caster's or its kind's, `nativeCitySummonArt`). */
  readonly art: NativeCitySummonArt;
  readonly frame: number;
  readonly x: number;
  readonly y: number;
  readonly widthPx: number;
  readonly flip: boolean;
  readonly groundY: number;
  readonly front: boolean;
  readonly scale?: number;
  readonly scaleX?: number;
  readonly alpha?: number;
  readonly angle?: number;
  readonly add?: boolean;
  /** The cell's anchor (cell shares); absent: the kind's `pivot`. */
  readonly origin?: readonly [number, number];
  /** Another sheet than the summon's (the roadster's vapour, `NATIVE_CITY_SUMMON_FX_ART`): no stand-in while it loads. */
  readonly sheet?: NativeCitySummonArt;
  /** Drawn as the stand-in shape while the sheet is not in (a strike's body cells); absent: the kind's travel / tell cells only. */
  readonly standIn?: boolean;
}

/**
 * Every summon sheet (the kinds' and the vapour) and the `casters`' own drawings (`NATIVE_CITY_SUMMON_CASTER_ART`): what a scene that knows a
 * summoner is coming preloads.
 */
export function nativeCitySummonSheets(casters: readonly string[] = []): NativeCitySummonArt[] {
  return [...Object.values(NATIVE_CITY_SUMMON_ART), ...Object.values(NATIVE_CITY_SUMMON_FX_ART),
    ...casters.flatMap(caster => Object.values(NATIVE_CITY_SUMMON_CASTER_ART[caster] ?? {}))];
}

export class NativeCitySummonView implements NativeCitySummonSink {
  private readonly sprites: Phaser.GameObjects.Sprite[];
  private readonly seen = new Set<number>();
  private readonly ended = new Set<number>();
  private readonly driving = new Set<number>();
  /** When each summon first passed a body (its own age then): the roadster's roll starts there. */
  private readonly passedAt = new Map<number, number>();
  /** Strikes whose active window has opened (its sound plays once). */
  private readonly struck = new Set<number>();
  private readonly bursts: Burst[] = [];
  private cues: NativeCitySummonCue[] = [];
  private used = 0;
  private requested = false;
  /** The casters whose own drawings were asked for. */
  private readonly casters = new Set<string>();
  /** The bullets' streaks and impacts (`GunFxLayer`), and where each bullet was first seen (screen x — its streak grows from there). */
  private readonly gun: GunFxLayer;
  private readonly bulletFrom = new Map<number, number>();
  private bulletPaints: ReturnType<typeof gunBulletPaint>[] = [];

  constructor(private readonly scene: Phaser.Scene, private readonly spec: NativeCitySummonViewSpec) {
    this.sprites = Array.from({ length: POOL_SIZE }, () => scene.add.sprite(0, 0, "__DEFAULT").setVisible(false).setName("native-city-summon"));
    this.gun = new GunFxLayer(scene, "native-city-summon-gun");
  }

  get cardObjects(): readonly Phaser.GameObjects.Sprite[] { return this.sprites; }

  /**
   * Ask for the sheets (once, and once per caster with drawings of his own): the first summon of a fight brings them in; a scene that knows a
   * summoner is coming can ask earlier.
   */
  prepare(casters: readonly string[] = []): void {
    const fresh = casters.filter(caster => !this.casters.has(caster) && NATIVE_CITY_SUMMON_CASTER_ART[caster] !== undefined);
    if (this.requested && fresh.length === 0) return;
    for (const caster of fresh) this.casters.add(caster);
    const sheets = this.requested ? fresh.flatMap(caster => Object.values(NATIVE_CITY_SUMMON_CASTER_ART[caster] ?? {})) : nativeCitySummonSheets(fresh);
    this.requested = true;
    preloadSpriteSheets(this.scene, sheets);
    if (!this.scene.load.isLoading() && this.scene.load.list.size > 0) this.scene.load.start();
  }

  frame(input: NativeCitySummonFrame): readonly NativeCitySummonCue[] {
    const { field, line } = input;
    this.cues = [];
    this.used = 0;
    this.bulletPaints = [];
    if (field.live.length > 0) this.prepare([...new Set(field.live.map(summon => summon.ownerId))]);
    if (line) {
      for (const summon of field.live) {
        if (summon.end !== null) this.end(summon, line);
        else this.draw(summon, line, input.bodies);
      }
    }
    this.burstsFrame(input.screenDtMs);
    this.gun.frame(input.screenDtMs, this.bulletPaints);
    for (let i = this.used; i < this.sprites.length; i++) this.sprites[i]!.setVisible(false);
    // Forget the ids the field no longer holds (it never reuses one).
    if (this.seen.size > 32) for (const id of [...this.seen]) if (!field.live.some(summon => summon.id === id)) this.seen.delete(id);
    for (const id of [...this.passedAt.keys()]) if (!field.live.some(summon => summon.id === id)) this.passedAt.delete(id);
    for (const id of [...this.bulletFrom.keys()]) if (!field.live.some(summon => summon.id === id)) this.bulletFrom.delete(id);
    for (const id of [...this.struck]) if (!field.live.some(summon => summon.id === id)) this.struck.delete(id);
    return this.cues;
  }

  destroy(): void { for (const sprite of this.sprites) sprite.destroy(); this.bursts.length = 0; this.gun.destroy(); }

  /** One summon out on the stage: its tell (the car's beams) or its travel; a strike by its phase (`drawStrike`). */
  private draw(summon: CityFightSummon, line: CityFightStageLine, bodies: readonly CityFightSummonTarget[]): void {
    if (cityFightSummonStrikePhase(summon) !== null) { this.drawStrike(summon, line, bodies); return; }
    const def = this.spec.projection(), h = this.spec.actorHeight(), art = nativeCitySummonArt(summon.kind, summon.ownerId);
    const spec = cityFightSummonSpec(summon.kind), reduced = this.spec.reducedMotion();
    const telling = cityFightSummonTelling(summon), tellMs = Math.max(1, spec.spawn.tellMs);
    if (!this.seen.has(summon.id)) { this.seen.add(summon.id); if (spec.spawn.tellMs > 0) this.cues.push("glint"); }
    if (!telling && spec.motion !== "fly" && !this.driving.has(summon.id)) { this.driving.add(summon.id); this.cues.push("swingHeavy"); }
    if (summon.touched.length > 0 && !this.passedAt.has(summon.id)) this.passedAt.set(summon.id, summon.ageMs);
    const { ground, widthPx, flip } = this.place(summon, line, def);
    if (summon.kind === "bullet") { this.drawBullet(summon, ground, flip, this.inFront(summon, line, bodies)); return; }
    // Its height: the crane glides at its lift (bobbing a little), the bolt at the wand's (a caster's drawing at its own — the eyes).
    let lift = Math.max(0, art.liftShare ?? spec.liftShare) * h;
    if (lift > 0 && !reduced && !telling && summon.kind === "crane") lift += Math.sin(summon.ageMs / BOB.periodMs * Math.PI * 2) * BOB.share * h;
    const front = this.inFront(summon, line, bodies);
    // The sports car's beams through its tell: blinking twice, then growing to full length out of its nose.
    if (telling && art.beam) {
      const beamMs = summon.ageMs, blink = BEAM.onMs + BEAM.offMs;
      const lit = reduced || beamMs >= blink * BEAM.blinks || beamMs % blink < BEAM.onMs;
      const grow = reduced ? 1 : BEAM.from + (1 - BEAM.from) * Math.min(1, Math.max(0, beamMs - blink * BEAM.blinks) / Math.max(1, tellMs - blink * BEAM.blinks));
      const scale = this.cellScale(widthPx, summon.kind, art);
      const noseX = ground[0] + (flip ? -1 : 1) * art.frameWidth * art.bodyShare * scale / 2;
      const beamY = ground[1] - lift - (art.pivot[1] - art.beam.headlightY) * art.frameHeight * scale;
      if (lit) this.paint({ kind: summon.kind, art, frame: art.beam.frame, x: noseX, y: beamY, widthPx, flip, groundY: ground[1], front, scaleX: grow,
        add: true, origin: [0, art.beam.pivotY] });
    }
    const frames = telling && art.tell.length > 0 ? art.tell : art.travel;
    let frame = frames[Math.floor(summon.ageMs / Math.max(1, art.travelFrameMs)) % Math.max(1, frames.length)] ?? 0;
    // A roll once it has passed a body (a kind with a `flourish`).
    let angle = 0;
    const passed = this.passedAt.get(summon.id);
    if (art.flourish && passed !== undefined && !reduced && summon.ageMs - passed < art.flourish.ms) {
      const k = (summon.ageMs - passed) / art.flourish.ms;
      frame = k > 0.3 && k < 0.7 ? art.flourish.frame : frame;
      angle = (flip ? -1 : 1) * 360 * k;
    }
    this.paint({ kind: summon.kind, art, frame, x: ground[0], y: ground[1] - lift, widthPx, flip, groundY: ground[1], front, angle });
  }

  /**
   * A strike by its phase (`phases`): the roadster rises behind its owner (the tell), arcs over to its spot rolling (the travel), hangs over it
   * on its jets (the charge), blasts down with the vapour cloud under it (the active window) and settles into the cloud fading out (the
   * recovery); the drill's crack under the target (behind the bodies), then the drill bursting up and sinking (in front of them).
   */
  private drawStrike(summon: CityFightSummon, line: CityFightStageLine, bodies: readonly CityFightSummonTarget[]): void {
    const def = this.spec.projection(), h = this.spec.actorHeight(), art = nativeCitySummonArt(summon.kind, summon.ownerId);
    const spec = cityFightSummonSpec(summon.kind), reduced = this.spec.reducedMotion();
    const phase = cityFightSummonStrikePhase(summon)!, t = cityFightSummonStrikeTimes(summon.kind)!;
    if (!this.seen.has(summon.id)) { this.seen.add(summon.id); this.cues.push("glint"); }
    if (phase !== "tell" && t.travel > t.tell && !this.driving.has(summon.id)) { this.driving.add(summon.id); this.cues.push("swingHeavy"); }
    if ((phase === "active" || phase === "recover") && !this.struck.has(summon.id)) { this.struck.add(summon.id); this.cues.push("swingHeavy"); }
    const { ground, widthPx, flip } = this.place(summon, line, def);
    const start = { tell: 0, travel: t.tell, charge: t.travel, active: t.charge, recover: t.active, spent: t.recover }[phase];
    const end = { tell: t.tell, travel: t.travel, charge: t.charge, active: t.active, recover: t.recover, spent: t.recover }[phase];
    const k = Math.min(1, Math.max(0, (summon.ageMs - start) / Math.max(1, end - start)));
    // Its height: a flyer rises to a little under its hover through its tell, arcs over (rising to the hover) and settles in its recovery.
    const hover = Math.max(0, art.liftShare ?? spec.liftShare) * h, riseTo = hover * 0.6;
    let lift = 0, alpha = 1;
    if (hover > 0) {
      if (phase === "tell") lift = riseTo * easeOutCubic(k);
      else if (phase === "travel") lift = riseTo + (hover - riseTo) * cityFightSummonTravel(summon) + (reduced ? 0 : Math.sin(Math.PI * k) * 0.35 * h);
      else if (phase === "recover") { lift = hover * (1 - 0.75 * easeOutCubic(k)); alpha = 1 - Math.max(0, k - 0.35) / 0.65; }
      else lift = hover + (phase === "charge" && !reduced ? Math.sin(summon.ageMs / BOB.periodMs * Math.PI * 2) * BOB.share * h : 0);
    }
    const cells = art.phases?.[phase === "spent" ? "recover" : phase];
    const frames = cells?.frames ?? [];
    const frame = frames.length === 0 ? null : cells?.frameMs ? frames[Math.floor(summon.ageMs / cells.frameMs) % frames.length]!
      : frames[Math.min(frames.length - 1, Math.floor(k * frames.length))]!;
    // The drill's crack lies on the ground behind the bodies; it bursts up in front of them.
    const front = hover > 0 ? this.inFront(summon, line, bodies) : phase !== "tell";
    if (frame !== null) this.paint({ kind: summon.kind, art, frame, x: ground[0], y: ground[1] - lift, widthPx, flip, groundY: ground[1], front, alpha,
      standIn: true, scale: cells?.scale ?? 1 });
    // The roadster's blast: the vapour cloud on the ground under its spot, through the active window and the recovery.
    const fx = art.blastFx, vapour = fx ? NATIVE_CITY_SUMMON_FX_ART[fx.sheet] : null;
    if (fx && vapour && (phase === "active" || phase === "recover")) {
      const list = phase === "active" ? fx.active : fx.recover;
      const cell = list[Math.min(list.length - 1, Math.floor(k * list.length))]!;
      const zone = 2 * spec.halfLengthStrides * nativeCityStepUnits(def.projection, h) * this.pxPerUnit(line, def) * fx.lengthScale;
      this.paint({ kind: summon.kind, art, sheet: vapour, frame: cell, x: ground[0], y: ground[1], widthPx: zone, flip, groundY: ground[1],
        front: this.spec.blastBehindBodies !== true,
        alpha: phase === "recover" ? 1 - Math.max(0, k - 0.4) / 0.6 : 1 });
    }
  }

  /** A bullet in flight: its glowing head at chest height and its streak back along the way it came. */
  private drawBullet(summon: CityFightSummon, ground: readonly [number, number], flip: boolean, front: boolean): void {
    const h = this.spec.actorHeight(), lift = Math.max(0, cityFightSummonSpec(summon.kind).liftShare) * h, y = ground[1] - lift;
    const from = this.bulletFrom.get(summon.id) ?? ground[0];
    this.bulletFrom.set(summon.id, from);
    const body = villageYSorted(VILLAGE_DEPTHS.actorBody, ground[1]), depth = front ? villageDepthJustAbove(body) : body - 1e-4;
    this.bulletPaints.push(gunBulletPaint(ground[0], y, flip ? Math.PI : 0, Math.abs(ground[0] - from), h, depth));
  }

  /** A bullet that met a body (hit or guarded): the gun's impact light where it stopped; one that flew off the stage just goes. */
  private bulletImpact(summon: CityFightSummon, line: CityFightStageLine): void {
    if (summon.end !== "consumed") return;
    const def = this.spec.projection(), h = this.spec.actorHeight(), { ground, flip } = this.place(summon, line, def);
    const y = ground[1] - Math.max(0, cityFightSummonSpec(summon.kind).liftShare) * h;
    this.gun.spawn({ kind: "impact", x: ground[0], y, angle: flip ? Math.PI : 0, bodyPx: h, tier: "light", blocked: false, seed: summon.id * 7919 },
      villageDepthJustAbove(villageYSorted(VILLAGE_DEPTHS.actorBody, ground[1])), this.spec.reducedMotion());
  }

  /** In front of the bodies, except over its owner (it comes out of his back) and over a body it has already passed (hit, guarded, passed). */
  private inFront(summon: CityFightSummon, line: CityFightStageLine, bodies: readonly CityFightSummonTarget[]): boolean {
    const half = cityFightSummonSpec(summon.kind).halfLengthStrides * nativeCityStepUnits(this.spec.projection().projection, this.spec.actorHeight());
    for (const body of bodies) {
      if (Math.abs(body.along - summon.along) > half + body.radius) continue;
      if (body.id === summon.ownerId || summon.touched.includes(body.id)) return false;
    }
    void line;
    return true;
  }

  /** Its end, seen once: the crane bursts into paper where it was (not a reset — a rematch just clears it). */
  private end(summon: CityFightSummon, line: CityFightStageLine): void {
    if (this.ended.has(summon.id)) return;
    this.ended.add(summon.id);
    this.driving.delete(summon.id);
    const art = nativeCitySummonArt(summon.kind, summon.ownerId);
    if (summon.kind === "bullet") { this.bulletImpact(summon, line); return; }
    if (summon.end === "reset" || !art.burst) return;
    const def = this.spec.projection(), { ground, widthPx, flip } = this.place(summon, line, def);
    const lift = Math.max(0, art.liftShare ?? cityFightSummonSpec(summon.kind).liftShare) * this.spec.actorHeight();
    this.bursts.push({ kind: summon.kind, art, x: ground[0], y: ground[1] - lift, widthPx, flip, groundY: ground[1], ageMs: 0 });
    if (this.bursts.length > MAX_BURSTS) this.bursts.shift();
    if (this.ended.size > 32) this.ended.clear();
  }

  /** The folds on screen time (they read through a freeze): the pop at `popScale`, the scraps, then the scraps falling and fading. */
  private burstsFrame(dtMs: number): void {
    const reduced = this.spec.reducedMotion();
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const burst = this.bursts[i]!, burstArt = burst.art.burst;
      burst.ageMs += Math.max(0, dtMs);
      if (!burstArt) { this.bursts.splice(i, 1); continue; }
      const { popMs, scrapsMs, fallMs } = burstArt, at = burst.ageMs;
      if (at >= popMs + scrapsMs + fallMs) { this.bursts.splice(i, 1); continue; }
      const paint = { kind: burst.kind, art: burst.art, x: burst.x, widthPx: burst.widthPx, flip: burst.flip, groundY: burst.groundY, front: true };
      if (at < popMs) this.paint({ ...paint, frame: burstArt.pop, y: burst.y, scale: reduced ? 1 : burstArt.popScale });
      else if (at < popMs + scrapsMs) this.paint({ ...paint, frame: burstArt.scraps, y: burst.y });
      else {
        const k = (at - popMs - scrapsMs) / Math.max(1, fallMs);
        this.paint({ ...paint, frame: burstArt.scraps, y: burst.y + (reduced ? 0 : k * burstArt.dropShare * this.spec.actorHeight()), alpha: 1 - k });
      }
    }
  }

  /** Its ground point on screen, its drawn width (its rule body along the line × `lengthScale`) and whether it faces left on screen. */
  private place(summon: CityFightSummon, line: CityFightStageLine, def: NativeCityDefinition)
    : { readonly ground: readonly [number, number]; readonly widthPx: number; readonly flip: boolean } {
    const ground = cityProject(cityFightSummonPoint(line, summon), def), art = nativeCitySummonArt(summon.kind, summon.ownerId);
    const half = cityFightSummonSpec(summon.kind).halfLengthStrides * nativeCityStepUnits(def.projection, this.spec.actorHeight());
    const a = cityProject(line.origin, def);
    const ahead = cityProject([line.origin[0] + line.direction[0] * summon.heading, line.origin[1] + line.direction[1] * summon.heading], def);
    return { ground: [ground[0], ground[1]], widthPx: 2 * half * this.pxPerUnit(line, def) * art.lengthScale, flip: ahead[0] < a[0] };
  }

  /** Screen px of one plan unit along the stage line. */
  private pxPerUnit(line: CityFightStageLine, def: NativeCityDefinition): number {
    const a = cityProject(line.origin, def), b = cityProject([line.origin[0] + line.direction[0], line.origin[1] + line.direction[1]], def);
    return Math.max(1e-6, Math.hypot(b[0] - a[0], b[1] - a[1]));
  }

  /** Display scale of one cell for a drawn body `widthPx` wide (the sheet's, or the stand-in's). */
  private cellScale(widthPx: number, kind: CityFightSummonKind, sheet: NativeCitySummonArt): number {
    return artTextureKey(this.scene, sheet.key, "decorative") ? widthPx / Math.max(1, sheet.frameWidth * sheet.bodyShare)
      : widthPx / standInTexture(this.scene, kind).width;
  }

  /** Lays one cell on the next free sprite: the sheet when it is in, else the baked stand-in shape (the body only). */
  private paint(p: Paint): void {
    const sprite = this.sprites[this.used];
    if (!sprite) return;
    const art = p.sheet ?? p.art, key = artTextureKey(this.scene, art.key, "decorative");
    const scale = this.cellScale(p.widthPx, p.kind, art) * (p.scale ?? 1);
    if (key) {
      const [ox, oy] = p.origin ?? [art.centres[p.frame] ?? art.pivot[0], art.pivot[1]];
      sprite.setTexture(key, p.frame).setOrigin(p.flip ? 1 - ox : ox, oy).setScale(scale * (p.scaleX ?? 1), scale);
    } else {
      if (p.sheet || !(p.standIn || art.travel.includes(p.frame) || art.tell.includes(p.frame))) return;
      const stand = standInTexture(this.scene, p.kind);
      sprite.setTexture(stand.key).setOrigin(0.5, p.kind === "crane" || p.kind === "bolt" || p.kind === "bullet" ? 0.5 : 1).setScale(scale);
    }
    this.used++;
    const h = this.spec.actorHeight();
    // In front of the bodies on its line, or (over its owner / a body it passed) just behind them — on the 3D cards a hand's breadth back.
    const body = villageYSorted(VILLAGE_DEPTHS.actorBody, p.groundY), depth = p.front ? villageDepthJustAbove(body) : body - 1e-4;
    sprite.setPosition(p.x, p.y).setFlipX(p.flip).setAngle(p.angle ?? 0).setAlpha((p.alpha ?? 1) * (p.art.alpha ?? 1)).setDepth(depth).setVisible(true)
      .setBlendMode(p.add ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL)
      .setData("cardOverBodies", p.front).setData("spatialAnchor", { x: p.x, y: p.groundY - (p.front ? 0 : BEHIND_SHARE * h) });
  }
}

/** The stand-in shapes, baked once per game (global keys) — never per summon. */
function standInTexture(scene: Phaser.Scene, kind: CityFightSummonKind): { readonly key: string; readonly width: number } {
  const small = kind === "crane" || kind === "bolt" || kind === "bullet";
  const key = `native-city-summon-standin-${kind}`, width = small ? 64 : 192, height = small ? 48 : kind === "drill" ? 128 : 64;
  if (!scene.textures.exists(key)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.lineStyle(3, PALETTE.paperInk, 1);
    if (kind === "bullet") {
      g.lineStyle(6, PALETTE.white, 1).lineBetween(10, 24, 60, 24);
      g.fillStyle(PALETTE.paperInk, 1).fillCircle(8, 24, 5);
    } else if (kind === "bolt") {
      g.fillStyle(PALETTE.white, 1).fillTriangle(2, 24, 22, 14, 22, 34).strokeTriangle(2, 24, 22, 14, 22, 34);
      g.lineStyle(5, PALETTE.white, 1).lineBetween(22, 24, 38, 16).lineBetween(38, 16, 48, 30).lineBetween(48, 30, 62, 22);
    } else if (kind === "drill") {
      g.fillStyle(PALETTE.white, 1).fillTriangle(96, 8, 60, 96, 132, 96).strokeTriangle(96, 8, 60, 96, 132, 96);
      g.fillStyle(PALETTE.hotGold, 1).fillRect(60, 96, 72, 18).strokeRect(60, 96, 72, 18);
      g.fillStyle(PALETTE.paperInk, 1).fillEllipse(96, 120, 180, 14);
    } else if (kind === "crane") {
      g.fillStyle(PALETTE.white, 1).fillTriangle(4, 30, 60, 22, 26, 4).strokeTriangle(4, 30, 60, 22, 26, 4);
      g.fillStyle(PALETTE.fightArmorRim, 1).fillTriangle(20, 30, 50, 24, 30, 44).strokeTriangle(20, 30, 50, 24, 30, 44);
    } else {
      g.fillStyle(kind === "roadster" ? PALETTE.white : PALETTE.alarm, 1).fillRoundedRect(6, 18, 180, 30, 10).strokeRoundedRect(6, 18, 180, 30, 10);
      g.fillStyle(PALETTE.paperInk, 1).fillCircle(44, 50, 12).fillCircle(150, 50, 12);
      g.fillStyle(PALETTE.hotGold, 1).fillCircle(182, 30, 5);
    }
    g.generateTexture(key, width, height);
    g.destroy();
  }
  return { key, width };
}
