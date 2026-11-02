import type Phaser from "phaser";
import { FIGHTER_GUN_CUES, gunBulletSprites, gunEventLifeMs, gunEventSprites, type FighterGunCue, type GunEvent, type GunSprite,
  type GunTex, type GunTier } from "../effects/GunshotFx";
import { GUN_TEXTURES, drawGunTexture } from "../effects/GunshotTextures";
import { fxHashString, fxMix } from "../effects/FxRandom";
import type { NativeCityOrthoPack } from "../art/NativeCityOrthoPack";
import { villageActorFxDepth } from "../depths";
import { fighterMoveFxCellIndex, type FighterMoveFxCell, type FighterMoveFxFrame } from "./FighterMoveFxView";

/**
 * 총 이펙트의 그림(2026-10-27, `GunshotFx` — docs/kaito-web/gunshot-fx.md). 두 부분이다.
 *
 * - `GunFxLayer`: 스프라이트 풀. 사건(쏨·착탄)을 싸움 시계로 늙히며 레시피 그대로 그리고, 한 프레임짜리 그림(날아가는 탄환의 꼬리)을 받는다.
 *   텍스처는 게임 전역으로 한 번 굽는다. 첫 장은 만들 때 같이 만들어 UI 카메라 무시 목록에 들고, 늘어나는 장은 첫 장의 카메라 필터를 물려받는다
 *   (`HypeImpactView` 와 같은 까닭).
 * - `GunshotFxView`: 쏘는 몸의 칸을 받아(`FighterMoveFxView` 와 같은 칸 색인) 총 쏘는 칸(`FIGHTER_GUN_CUES`)에 들어서는 순간 총구에서 쏜다.
 *   과녁(상대 가슴, `aimAt`)이 총이 겨눈 쪽에 있으면 선이 거기까지 가고, 아니면 빈 곳으로 뻗는다. 규칙을 읽지 않는다 — 그려진 칸이 신호라서
 *   판정·박자·정지와 어긋나지 않는다. 착탄은 장면이 접촉 때 부른다(`impact`).
 */

/** Sprites made with the layer (the rest grow on demand, up to `MAX_SPRITES`). */
const FIRST_SPRITES = 1;
const MAX_SPRITES = 160;
/** Events alive at once (the oldest goes first). */
const MAX_EVENTS = 24;
/** Depth steps: the light behind the shooter, everything else in front (a hair over his move effects). */
const BEHIND_STEP = -1, FRONT_STEP = 3, LAYER_STEP = 1e-7;

/** Bakes the gun textures once per game. */
export function ensureGunTextures(scene: Phaser.Scene): void {
  for (const [tex, spec] of Object.entries(GUN_TEXTURES) as [GunTex, (typeof GUN_TEXTURES)[GunTex]][]) {
    if (scene.textures.exists(spec.key)) continue;
    const canvas = scene.textures.createCanvas(spec.key, spec.width, spec.height);
    if (!canvas) continue;
    drawGunTexture(tex, canvas.getContext());
    canvas.refresh();
  }
}

interface LiveEvent { readonly event: GunEvent; readonly depth: number; readonly still: boolean; ageMs: number }

export class GunFxLayer {
  private readonly sprites: Phaser.GameObjects.Image[] = [];
  private readonly live: LiveEvent[] = [];
  private used = 0;

  constructor(private readonly scene: Phaser.Scene, private readonly name = "gun-fx") {
    ensureGunTextures(scene);
    for (let i = 0; i < FIRST_SPRITES; i++) this.sprites.push(this.make(GUN_TEXTURES.glow.key));
  }

  get objects(): readonly Phaser.GameObjects.Image[] { return this.sprites; }

  private make(key: string): Phaser.GameObjects.Image {
    const image = this.scene.add.image(0, 0, key).setName(this.name).setVisible(false);
    const first = this.sprites[0];
    if (first) image.cameraFilter = first.cameraFilter;
    return image;
  }


  spawn(event: GunEvent, depth: number, still: boolean): void {
    this.live.push({ event, depth, still, ageMs: 0 });
    while (this.live.length > MAX_EVENTS) this.live.shift();
  }

  /** Ages every event `fightDtMs` (0 through a freeze: they stand still), draws them and `extra` (this frame's own), hides the rest. */
  frame(fightDtMs: number, extra: readonly { readonly sprites: readonly GunSprite[]; readonly depth: number }[] = []): void {
    this.used = 0;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const live = this.live[i]!;
      live.ageMs += Math.max(0, fightDtMs);
      if (live.ageMs >= gunEventLifeMs(live.event)) { this.live.splice(i, 1); continue; }
    }
    for (const live of this.live) this.paintAll(gunEventSprites(live.event, live.ageMs, live.still), live.depth);
    for (const item of extra) this.paintAll(item.sprites, item.depth);
    for (let i = this.used; i < this.sprites.length; i++) this.sprites[i]!.setVisible(false);
  }

  clear(): void {
    this.live.length = 0;
    for (const sprite of this.sprites) sprite.setVisible(false);
  }

  private paintAll(sprites: readonly GunSprite[], depth: number): void {
    sprites.forEach((s, layer) => {
      if (this.used >= MAX_SPRITES) return;
      const spec = GUN_TEXTURES[s.tex];
      let image = this.sprites[this.used];
      if (!image) { image = this.make(spec.key); this.sprites.push(image); }
      this.used++;
      if (image.texture.key !== spec.key) image.setTexture(spec.key);
      image.setOrigin(spec.origin[0], spec.origin[1]).setPosition(s.x, s.y).setScale(s.w / spec.width, s.h / spec.height).setRotation(s.rot)
        .setTint(s.color).setAlpha(s.alpha).setBlendMode(s.add ? "ADD" : "NORMAL")
        .setDepth(villageActorFxDepth(depth, s.behind ? BEHIND_STEP : FRONT_STEP) + layer * LAYER_STEP).setVisible(true);
    });
  }

  destroy(): void {
    for (const sprite of this.sprites) sprite.destroy();
    this.sprites.length = 0;
    this.live.length = 0;
  }
}

/** A bullet's paint this frame (`GunFxLayer.frame` extra): its head, its way, how far it has come. */
export function gunBulletPaint(x: number, y: number, angle: number, trailPx: number, bodyPx: number, depth: number)
  : { readonly sprites: readonly GunSprite[]; readonly depth: number } {
  return { sprites: gunBulletSprites(x, y, angle, trailPx, bodyPx), depth };
}

/** The other's chest this frame (screen): the shooter's lines end there when it is where he aims. */
export interface GunTarget { readonly x: number; readonly y: number }

export class GunshotFxView {
  private readonly cues: readonly FighterGunCue[];
  private readonly layer: GunFxLayer | null;
  private index: ReadonlyMap<string, FighterMoveFxCell> = new Map();
  private lastCell: string | null = null;
  private target: GunTarget | null = null;
  private shots = 0;
  private readonly salt: number;

  constructor(scene: Phaser.Scene, skinId: string | null) {
    this.cues = FIGHTER_GUN_CUES[skinId ?? ""] ?? [];
    this.layer = this.cues.length > 0 ? new GunFxLayer(scene, `gun-fx-${skinId}`) : null;
    this.salt = fxHashString(skinId ?? "");
  }

  /** Whether his moves are gunshots (a fighter without gun cues makes no sprites, draws nothing). */
  get armed(): boolean { return this.layer !== null; }

  get objects(): readonly Phaser.GameObjects.Image[] { return this.layer?.objects ?? []; }

  setPack(pack: NativeCityOrthoPack): void { if (this.layer) this.index = fighterMoveFxCellIndex(pack); }

  /** Where the other's chest is this frame (null: nobody to aim at). */
  aimAt(target: GunTarget | null): void { this.target = target; }

  /** He was drawn this frame: a shot when his cell turns to a firing one, then everything live on the fight clock. */
  frame(input: FighterMoveFxFrame): void {
    const layer = this.layer;
    if (!layer) return;
    const key = `${input.texture}#${input.frame}`, entered = key !== this.lastCell;
    this.lastCell = key;
    const drawn = entered ? this.index.get(key) ?? null : null;
    const cue = drawn ? this.cues.find(c => c.clip === drawn.clip && c.cells.includes(drawn.cell)) : undefined;
    if (cue) this.fire(cue, input);
    layer.frame(input.fightDtMs);
  }

  /** A shot of his landed on the other (`ArenaDuelScene.blow`): its light on the struck body — `angle` the way it flew (radians). */
  impact(x: number, y: number, angle: number, bodyPx: number, tier: GunTier, blocked: boolean, depth: number, still: boolean): void {
    this.layer?.spawn({ kind: "impact", x, y, angle, bodyPx, tier, blocked, seed: fxMix(this.salt, 0x1e00 + this.shots++) }, depth, still);
  }

  /** He is not drawn: nothing of his shows. */
  hide(): void { this.lastCell = null; this.layer?.clear(); }

  destroy(): void { this.layer?.destroy(); }

  private fire(cue: FighterGunCue, input: FighterMoveFxFrame): void {
    const forward = input.flipX ? -1 : 1, b = input.bodyPx;
    const x = input.x + forward * cue.muzzle[0] * b, y = input.y - cue.muzzle[1] * b;
    // The cue's own way (screen radians): its angle down from level, mirrored when he faces left.
    const nominal = forward > 0 ? cue.angle : Math.PI - cue.angle;
    let angle = nominal, reach = b * cue.freeReach;
    const t = this.target;
    if (t && cue.tracer) {
      const aim = Math.atan2(t.y - y, t.x - x), off = Math.abs(Math.atan2(Math.sin(aim - nominal), Math.cos(aim - nominal)));
      const dist = Math.hypot(t.x - x, t.y - y);
      // Within his aim's give and in reach: the line goes to the chest (a hair through it); point-blank it still shows its spark.
      if (off <= cue.aimGive && dist <= b * cue.freeReach * 1.6) { angle = aim; reach = Math.max(b * 0.25, dist + b * 0.08); }
    }
    this.layer!.spawn({ kind: "shot", x, y, angle, reachPx: cue.tracer ? reach : 0, bodyPx: b, tier: cue.tier,
      seed: fxMix(this.salt, this.shots++) }, input.depth, input.reducedMotion);
  }
}
