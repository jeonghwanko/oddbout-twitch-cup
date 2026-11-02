import Phaser from "phaser";
import type { OddboutGoldDelivery } from "../../../app/OddboutGoldShow";
import { PALETTE } from "../../art/palette";
import { sfx } from "../../audio/sfx";
import { ARENA_GOLD_DROP, arenaGoldCoinAt, arenaGoldLandings, type ArenaGoldDropPlan, type ArenaGoldPoint } from "./ArenaGoldDrop";

/**
 * 금화 동전 화면(2026-10-27 G3, 박자는 `ArenaGoldDrop`): 둥근 금화(금색 몸 · 잉크 안쪽 테 · 흰 윗빛 — 위 막대 카운터의 G 동전과 같은 문법,
 * 평면 다각형 없음)와 그 뒤의 받음 빛(동전 뒤, 더하기 섞기 — `LootPickupFx` 와 같은 문법). 머무는 동안 빛이 한 번 반짝이고 날아가는 동안
 * 빛이 꼬리처럼 따라간다. 동전이 닿을 때마다 카운터에 그 몫을 넘기고(`delivery.land`) 짤랑. 끝나거나 끊기면(`finish` — 씬을 떠날 때)
 * 남은 몫을 한꺼번에 넘긴다. 움직임 줄이기에서는 만들지 않는다(카운터가 혼자 센다).
 */

const COIN_TEXTURE = "oddbout-gold-drop-coin";
const GLOW_TEXTURE = "oddbout-gold-drop-glow";
/** The coin (logical px radius) drawn at `bake`× for a crisp edge; its glow's radius and alpha at rest, its one shine at the hold. */
const COIN = Object.freeze({ radius: 9, bake: 3, glowRadius: 22, glowAlpha: 0.32, shineAlpha: 0.9 });

function bakeTextures(scene: Phaser.Scene): void {
  const b = COIN.bake;
  if (!scene.textures.exists(COIN_TEXTURE)) {
    const r = COIN.radius * b, g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(PALETTE.oddboutInk, 1).fillCircle(r + b, r + b, r + b);
    g.fillStyle(PALETTE.oddboutGold, 1).fillCircle(r + b, r + b, r);
    g.lineStyle(1.4 * b, PALETTE.oddboutInk, 0.85).strokeCircle(r + b, r + b, r * 0.62);
    g.lineStyle(1.2 * b, PALETTE.white, 0.7).beginPath().arc(r + b, r + b, r * 0.8, Math.PI * 1.1, Math.PI * 1.45).strokePath();
    g.generateTexture(COIN_TEXTURE, (r + b) * 2, (r + b) * 2);
    g.destroy();
  }
  if (!scene.textures.exists(GLOW_TEXTURE)) {
    const r = COIN.glowRadius * b, g = scene.make.graphics({ x: 0, y: 0 }, false);
    // A soft round: rings that fade outward.
    for (let k = 12; k >= 1; k--) g.fillStyle(PALETTE.oddboutGold, 0.09).fillCircle(r, r, (r * k) / 12);
    g.generateTexture(GLOW_TEXTURE, r * 2, r * 2);
    g.destroy();
  }
}

export interface ArenaGoldDropViewOptions {
  readonly plan: ArenaGoldDropPlan;
  readonly delivery: OddboutGoldDelivery;
  /** Over everything the drop flies across (the winner card, the end card). */
  readonly depth: number;
  /** Puts a made object on the screen's camera (the duel's fixed space). */
  readonly place: (object: Phaser.GameObjects.Image) => void;
  /** A plan point (logical screen px) as the objects' own position. */
  readonly toObject: (point: ArenaGoldPoint) => ArenaGoldPoint;
  /** Screen ms before the first coin moves. */
  readonly delayMs: number;
}

export class ArenaGoldDropView {
  private readonly coins: { readonly coin: Phaser.GameObjects.Image; readonly glow: Phaser.GameObjects.Image }[];
  private ms: number;
  private done = false;

  constructor(private readonly scene: Phaser.Scene, private readonly options: ArenaGoldDropViewOptions) {
    bakeTextures(scene);
    this.ms = -options.delayMs;
    this.coins = options.plan.coins.map(() => {
      const glow = scene.add.image(0, 0, GLOW_TEXTURE).setScale(1 / COIN.bake).setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(options.depth).setVisible(false);
      // The same depth as its glow, made after it: drawn over it.
      const coin = scene.add.image(0, 0, COIN_TEXTURE).setScale(1 / COIN.bake).setDepth(options.depth).setVisible(false);
      options.place(glow); options.place(coin);
      return { coin, glow };
    });
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.tick, this);
  }

  private tick(_time: number, deltaMs: number): void {
    if (this.done) return;
    const before = this.ms;
    this.ms += Math.min(deltaMs, 100);
    if (this.ms < 0) return;
    const plan = this.options.plan, D = ARENA_GOLD_DROP;
    this.coins.forEach(({ coin, glow }, i) => {
      const pose = arenaGoldCoinAt(plan, i, this.ms), at = this.options.toObject(pose), shown = pose.phase !== "landed" && pose.alpha > 0;
      coin.setVisible(shown).setPosition(at.x, at.y).setAlpha(pose.alpha).setScale(pose.scale / COIN.bake);
      // The glow: a breath at rest (the one shine), a trail in the flight, none in the bounces.
      const restT = (this.ms - D.bounceMs) / D.holdMs;
      const glowAlpha = pose.phase === "rest" && plan.won ? COIN.glowAlpha + (COIN.shineAlpha - COIN.glowAlpha) * Math.sin(Math.PI * Math.min(1, Math.max(0, restT)))
        : pose.phase === "fly" ? COIN.glowAlpha * pose.alpha : 0;
      glow.setVisible(shown && glowAlpha > 0).setPosition(at.x, at.y).setAlpha(glowAlpha).setScale(pose.scale / COIN.bake);
    });
    const landed = arenaGoldLandings(plan, before, this.ms), last = plan.coins.length - 1;
    for (const i of landed) {
      this.options.delivery.land(plan.coins[i]!.share);
      sfx.oddboutCoin(i, i === last, !plan.won);
    }
    if (this.ms >= plan.endMs) this.finish();
  }

  /** The rest of the gold to the counter at once and the coins gone (the drop ended, or the scene leaves). Again is nothing. */
  finish(): void {
    if (this.done) return;
    this.done = true;
    this.options.delivery.finish();
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.tick, this);
    for (const { coin, glow } of this.coins) { coin.destroy(); glow.destroy(); }
  }
}

/**
 * Where the coins fly to on a screen `logicalWidth` logical px wide: the counter's x over the canvas, just above its top edge (the bar sits
 * right over the canvas, so the coins pass under it). Off the page: the top right.
 */
export function arenaGoldTarget(scene: Phaser.Scene, logicalWidth: number, delivery: OddboutGoldDelivery): ArenaGoldPoint {
  const anchor = delivery.anchor(), box = scene.game.canvas.getBoundingClientRect(), edge = 12;
  const x = anchor && box.width > 0 ? (anchor.x - box.left) * (logicalWidth / box.width) : logicalWidth - 40;
  return { x: Math.min(logicalWidth - edge, Math.max(edge, x)), y: -edge };
}
