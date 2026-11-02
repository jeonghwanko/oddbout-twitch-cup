import type Phaser from "phaser";
import { FIGHTER_MOVE_FX_EFFECTS, FIGHTER_MOVE_FX_SHEETS, fighterMoveFxCues, fighterMoveFxLight, fighterMoveFxSheets, type FighterMoveFxCue,
  type FighterMoveFxEffect } from "../../assets/FighterMoveFxArtCatalog";
import type { SpriteSheetAssetDefinition } from "../../assets/RuntimeArtTypes";
import { COMBAT_SMEAR_ART } from "../../assets/CombatSmearArtCatalog";
import { nativeCityOrthoClipCell, type NativeCityOrthoActionClip, type NativeCityOrthoPack } from "../art/NativeCityOrthoPack";
import { villageActorFxDepth, villageBehindStageBodiesDepth } from "../depths";
import { combatSmearPlace } from "../effects/CombatSmear";
import { FIGHTER_MOVE_LIGHT_POOL, FighterMoveLightRunner, type FighterMoveLightSink } from "../effects/FighterMoveLight";
import { CityFightLightPool } from "./CityFightLightKit";



/** One frame of the fighter's drawn body: the cell drawn (texture key and frame), where its origin (his drawn feet) and body height are. */
export interface FighterMoveFxFrame {
  readonly texture: string;
  readonly frame: number;
  readonly flipX: boolean;
  readonly x: number;
  readonly y: number;
  readonly bodyPx: number;
  readonly depth: number;
  readonly fightDtMs: number;
  readonly reducedMotion: boolean;
}

/** A drawn cell of his side clips: which clip, its name, and the clip's body height (cell px). */
export interface FighterMoveFxCell {
  readonly clip: string;
  readonly cell: string;
  readonly bodyHeight: number;
}

/** Sprites in the pool: a trail's few, a burst or two and a held loop. */
const POOL_SIZE = 10;

/** A held loop with a longest run (`FighterMoveFxCue.maxMs`) fades out over this last share of it. */
const HOLD_FADE_SHARE = 0.25;
/** A swing smear shows this long (fight ms — it holds through the blow's freeze) unless its cue says (`maxMs`). */
const SMEAR_MS = 90;
/** A smear's arc bulges away from his middle (body heights up from his feet), off its chord by its `bow`. */
const SMEAR_CENTRE_UP = 0.55;
const SMEAR_BOW = 0.12;

interface Live {
  readonly effect: FighterMoveFxEffect;
  readonly x: number;
  readonly y: number;
  readonly widthPx: number;
  readonly flip: boolean;
  readonly front: boolean;
  readonly depth: number;
  /** Its cue's opacity (`FighterMoveFxCue.alpha`). */
  readonly alpha: number;
  ageMs: number;
}

/** Each step's start (ms) and the whole length of a one-shot effect. */
function oneShotTimes(effect: FighterMoveFxEffect): { readonly starts: readonly number[]; readonly totalMs: number } {
  const starts: number[] = [];
  let at = 0;
  for (let i = 0; i < effect.frames.length; i++) { starts.push(at); at += effect.frameMs?.[i] ?? 60; }
  return { starts, totalMs: at };
}


export function fighterMoveFxCellIndex(pack: NativeCityOrthoPack): ReadonlyMap<string, FighterMoveFxCell> {
  const index = new Map<string, FighterMoveFxCell>();
  const directions = pack.directions as unknown as Readonly<Record<string, Readonly<Record<string, NativeCityOrthoActionClip>>>>;
  const named = (drawn: NativeCityOrthoActionClip) => (drawn as { readonly cells?: readonly string[] }).cells;
  const ordinals = !["side", "side_left"].some(heading => Object.values(directions[heading] ?? {}).some(drawn => named(drawn)));
  for (const heading of ["side", "side_left"]) {
    for (const [clip, drawn] of Object.entries(directions[heading] ?? {})) {
      const names = named(drawn);
      if (!names && !(ordinals && Array.isArray(drawn.frames))) continue;
      drawn.frames.forEach((frame, ordinal) => {
        const cell = nativeCityOrthoClipCell(drawn, frame, false), name = names ? names[ordinal] : `#${ordinal}`;
        if (name !== undefined) index.set(`${cell.texture}#${cell.frame}`, { clip, cell: name, bodyHeight: drawn.bodyHeight });
      });
    }
  }
  return index;
}

export class FighterMoveFxView {
  /** The sheets his cues draw (asked for with his fight sheets). */
  readonly skinSheets: readonly SpriteSheetAssetDefinition[];
  private readonly cues: readonly FighterMoveFxCue[];
  private readonly sprites: Phaser.GameObjects.Sprite[];
  /** Sprites painted so far this frame. */
  private used = 0;
  private index: ReadonlyMap<string, FighterMoveFxCell> = new Map();
  private readonly live: Live[] = [];
  /** The drawn cell last frame (`texture#frame`); null while he was not drawn. */
  private lastCell: string | null = null;
  /** Fight ms since each trail cue last spawned (by cue index), while its cells are drawn. */
  private readonly trailMs = new Map<number, number>();
  /** Fight ms each held loop has been drawn (by cue index). */
  private readonly holdMs = new Map<number, number>();
  /** The sounds of the `enter` cues started since the last `takeSounds` (`FighterMoveFxCue.sound`). */
  private sounds: string[] = [];
  /** His light cues (`FighterMoveFxCue` naming a light recipe): their runner and the two light pools; null without any. */
  private readonly lights: { readonly runner: FighterMoveLightRunner; readonly front: CityFightLightPool; readonly behind: CityFightLightPool;
    readonly sink: FighterMoveLightSink } | null;

  /**
   * `skinId`'s cues (none: no sprites, nothing drawn — KUMA and every fighter without move effects). `textureKey`: the sheet's loaded key or
   * null (the fight's art — `NativeCityFightArt.textureKey`).
   */
  constructor(scene: Phaser.Scene, skinId: string | null, private readonly textureKey: (key: string) => string | null, arena = false) {
    // The arena's AI duel draws each cue's own arena form (`FighterMoveFxCue.arena`).
    const cues = fighterMoveFxCues(skinId).map(cue => arena && cue.arena ? { ...cue, ...cue.arena } : cue);
    this.cues = cues.filter(cue => !fighterMoveFxLight(cue));
    this.sprites = this.cues.length === 0 ? []
      : Array.from({ length: POOL_SIZE }, () => scene.add.sprite(0, 0, "__DEFAULT").setVisible(false).setName("fighter-move-fx"));
    this.skinSheets = fighterMoveFxSheets(skinId);
    const lit = cues.flatMap(cue => { const recipe = fighterMoveFxLight(cue); return recipe ? [{ cue, recipe }] : []; });
    if (lit.length === 0) this.lights = null;
    else {
      // Made with him, before the UI camera takes its ignore list (as the sprites); their depth follows his each frame.
      const front = new CityFightLightPool(scene, 0, FIGHTER_MOVE_LIGHT_POOL.front, "fighter-move-light");
      const behind = new CityFightLightPool(scene, 0, FIGHTER_MOVE_LIGHT_POOL.behind, "fighter-move-light");
      this.lights = { runner: new FighterMoveLightRunner(lit), front, behind,
        sink: (kind, x, y, w, h, rotation, originX, tint, alpha, layer) => (layer === "behind" ? behind : front)
          .light(kind, x, y, w, h, rotation, tint, alpha, originX) };
    }
  }

  get objects(): readonly Phaser.GameObjects.Sprite[] { return this.sprites; }

  /** His pack has loaded: which clip and cell each drawn cell is. */
  setPack(pack: NativeCityOrthoPack): void { if (this.cues.length > 0 || this.lights) this.index = fighterMoveFxCellIndex(pack); }

  /** He was drawn this frame: start the cues his cell starts, then draw everything live. */
  frame(input: FighterMoveFxFrame): void {
    if (this.cues.length === 0 && !this.lights) return;
    const key = `${input.texture}#${input.frame}`, entered = key !== this.lastCell;
    this.lastCell = key;
    const drawn = this.index.get(key) ?? null, forward = input.flipX ? -1 : 1, dt = Math.max(0, input.fightDtMs);
    if (this.lights) {
      const { runner, front, behind, sink } = this.lights;
      const frontDepth = villageActorFxDepth(input.depth, 2), behindDepth = villageBehindStageBodiesDepth(input.depth);
      front.setDepth(frontDepth);
      behind.setDepth(behindDepth);
      front.begin(); behind.begin();
      runner.step({ drawn, entered, x: input.x, y: input.y, flipX: input.flipX, bodyPx: input.bodyPx, fightDtMs: dt,
        reducedMotion: input.reducedMotion }, sink);
      front.end(); behind.end();
    }
    if (this.cues.length === 0) return;
    for (let i = 0; i < this.cues.length; i++) {
      const cue = this.cues[i]!, effect = FIGHTER_MOVE_FX_EFFECTS[cue.effect];
      const on = drawn !== null && drawn.clip === cue.clip && cue.cells.includes(drawn.cell);
      const mode = cue.on ?? "enter";
      if (cue.smear) {
        if (!on) { this.holdMs.delete(i); continue; }
        const ms = (this.holdMs.get(i) ?? -dt) + dt, longest = cue.maxMs ?? SMEAR_MS;
        this.holdMs.set(i, ms);
        const fade = Math.min(1, (longest - ms) / Math.max(1, longest * HOLD_FADE_SHARE));
        if (fade > 0) this.paintSmear(cue, input, forward, fade * (cue.alpha ?? 1));
        continue;
      }
      if (!on || !effect) { this.trailMs.delete(i); this.holdMs.delete(i); continue; }
      const spawn = (): Live => ({ effect, x: input.x + forward * cue.at[0] * input.bodyPx, y: input.y - cue.at[1] * input.bodyPx,
        widthPx: effect.size * (cue.scale ?? 1) * input.bodyPx, flip: forward < 0, front: cue.layer !== "behind",
        depth: cue.layer === "behind" ? villageBehindStageBodiesDepth(input.depth) : villageActorFxDepth(input.depth, 2), alpha: cue.alpha ?? 1, ageMs: 0 });
      if (mode === "enter" && entered) {
        this.push(spawn());
        // Kept for the scene to play (a few at most: a fight that never takes them does not pile them up).
        if (cue.sound && this.sounds.length < 8) this.sounds.push(cue.sound);
      }
      else if (mode === "trail" && !input.reducedMotion) {
        const since = this.trailMs.get(i);
        if (since === undefined || since + dt >= (cue.everyMs ?? 80)) { this.push(spawn()); this.trailMs.set(i, 0); }
        else this.trailMs.set(i, since + dt);
      } else if (mode === "hold") {
        const ms = (this.holdMs.get(i) ?? -dt) + dt;
        this.holdMs.set(i, ms);
        const fade = cue.maxMs === undefined ? 1 : Math.min(1, (cue.maxMs - ms) / Math.max(1, cue.maxMs * HOLD_FADE_SHARE));
        if (fade <= 0) continue;
        const step = input.reducedMotion ? 0 : Math.floor(ms / Math.max(1, effect.loopMs ?? 60)) % effect.frames.length;
        this.paint(spawn(), effect.frames[step]!, fade);
      }
    }
    for (let i = this.live.length - 1; i >= 0; i--) {
      const fx = this.live[i]!, { starts, totalMs } = oneShotTimes(fx.effect);
      fx.ageMs += dt;
      if (fx.ageMs >= totalMs) { this.live.splice(i, 1); continue; }
      let step = starts.length - 1;
      while (step > 0 && fx.ageMs < starts[step]!) step--;
      const last = step === starts.length - 1, k = last ? (fx.ageMs - starts[step]!) / Math.max(1, totalMs - starts[step]!) : 0;
      this.paint(fx, fx.effect.frames[step]!, last && fx.effect.fade ? 1 - k : 1);
    }
    this.hideUnused();
  }


  frameFromSprite(sprite: Phaser.GameObjects.Sprite, fightDtMs: number, reducedMotion: boolean): void {
    if (this.cues.length === 0 && !this.lights) return;
    if (!sprite.visible) { this.hide(); return; }
    const texture = sprite.texture.key, frame = Number(sprite.frame.name), cell = this.index.get(`${texture}#${frame}`);
    this.frame({ texture, frame, flipX: sprite.flipX, x: sprite.x, y: sprite.y, bodyPx: Math.abs(sprite.scaleY) * (cell?.bodyHeight ?? 0),
      depth: sprite.depth, fightDtMs, reducedMotion });
  }

  /** The sounds his cues started since the last call (the scene plays them; a fight without sound simply drops them). */
  takeSounds(): readonly string[] {
    const out = this.sounds;
    this.sounds = [];
    return out;
  }

  /** He is not drawn here: nothing of his shows, his cues start over. */
  hide(): void {
    this.lastCell = null;
    this.live.length = 0;
    this.sounds = [];
    this.trailMs.clear(); this.holdMs.clear();
    for (const sprite of this.sprites) sprite.setVisible(false);
    if (this.lights) { this.lights.runner.reset(); this.lights.front.hide(); this.lights.behind.hide(); }
  }

  private push(fx: Live): void {
    this.live.push(fx);
    // The oldest goes first when the pool would overflow (a long trail).
    while (this.live.length > POOL_SIZE - 2) this.live.shift();
  }

  private paint(fx: Live, frame: number, alpha: number): void {
    const sprite = this.sprites[this.used], sheet = FIGHTER_MOVE_FX_SHEETS[fx.effect.sheet];
    const key = this.textureKey(sheet.key);
    if (!sprite || !key) return;
    this.used++;
    const scale = fx.widthPx / sheet.frameWidth, [px, py] = fx.effect.pivot;
    sprite.setTexture(key, frame).setOrigin(fx.flip ? 1 - px : px, py).setFlipX(fx.flip).setFlipY(false).setRotation(0).setScale(scale)
      .setPosition(fx.x, fx.y).setAlpha(alpha * fx.alpha).setDepth(fx.depth).setVisible(true);
  }

  /** A swing's smear (`FighterMoveFxCue.smear`): the brush from `from` to the limb's tip `at`, just behind his body. */
  private paintSmear(cue: FighterMoveFxCue, input: FighterMoveFxFrame, forward: number, alpha: number): void {
    const smear = cue.smear!, sprite = this.sprites[this.used], key = this.textureKey(COMBAT_SMEAR_ART.key), b = input.bodyPx;
    if (!sprite || !key) return;
    const at = (p: readonly [number, number]): [number, number] => [input.x + forward * p[0] * b, input.y - p[1] * b];
    const head = at(cue.at), tail = at(smear.from), centre = at([0, SMEAR_CENTRE_UP]);
    const dx = head[0] - tail[0], dy = head[1] - tail[1], chord = Math.hypot(dx, dy);
    if (chord < 1) return;
    // The chord's normal on the side away from his middle: a limb swings round a shoulder or hip, its path bowed outward.
    const half: [number, number] = [(head[0] + tail[0]) / 2, (head[1] + tail[1]) / 2];
    let nx = -dy / chord, ny = dx / chord;
    if ((half[0] - centre[0]) * nx + (half[1] - centre[1]) * ny < 0) { nx = -nx; ny = -ny; }
    const bow = (smear.bow ?? SMEAR_BOW) * b, rise = smear.from[1] - cue.at[1];
    const kind = smear.kind ?? (rise > 0.3 ? "slam" : rise < -0.25 ? "hook" : "swing");
    const d = combatSmearPlace(kind, head, tail, [half[0] + nx * bow, half[1] + ny * bow]);
    if (!d) return;
    this.used++;
    const behind = villageActorFxDepth(input.depth, -1);
    sprite.setTexture(key, d.frame).setOrigin(d.originX, d.originY).setFlipX(false).setFlipY(d.flipY).setRotation(d.rotation)
      .setScale(d.scale, d.scaleY).setPosition(d.x, d.y).setAlpha(alpha).setDepth(behind).setVisible(true);
  }

  private hideUnused(): void {
    for (let i = this.used; i < this.sprites.length; i++) this.sprites[i]!.setVisible(false);
    this.used = 0;
  }

  destroy(): void {
    for (const sprite of this.sprites) sprite.destroy();
    this.live.length = 0;
    this.lights?.front.destroy(); this.lights?.behind.destroy();
  }
}
