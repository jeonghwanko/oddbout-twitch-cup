import type Phaser from "phaser";
import { SUPER_CUT_IN_ART } from "../../assets/SuperCutInArtCatalog";
import { clamp01 } from "../../sim/geom";
import { easeOutCubic } from "../art/easing";
import { artTextureKey } from "../art/ArtFallback";
import { FONT, PALETTE, cssHex } from "../art/palette";
import { preloadImageAssets } from "../art/PhaserAssetLoader";
import { VILLAGE_DEPTHS } from "../depths";
import { CITY_FIGHT_SUPER_CUT_IN, cityFightSuperCutInFrame, type CityFightSuperCast, type CityFightSuperCutInFrame } from "./CityFightSuperCutIn";

/**
 * The super's staged cut-in (2026-10-20 the Rivals flash; 2026-10-21 staged — user: "필살기 연출이 너무 밋밋하고 촌스럽다. UI 가
 * 순차적으로 뜨고, 액션이 일어나는 연출 시퀀스가 필요해"; the timeline, its sources and its review: `CityFightSuperCutIn`). While the
 * fight holds for the super (`super.flashMs`): ink-and-gold wedges burst out of the caster's chest, the letterbox drops in, a slanted
 * panel lit from his eye (a radial gold ramp) slams in from his side with focus lines, two frames of impact frame (navy, his face a cream
 * silhouette), then his painted face close-up (`SuperCutInArtCatalog`; his own frame where none is drawn) pushing in, his super's name
 * stamped across its lower edge, the panel out, and a navy brush wipe hands the screen back to the blow. The bars stay until the super
 * resolves (`resolve` — its contact). The village fight, the arena's bout and its AI duel play it through the same sinks. World layer,
 * placed on the camera's view each frame (the push-in zooms it with the stage); its pieces are made with the sinks (before a scene's UI
 * camera takes the world's ignore list).
 */
export const CITY_FIGHT_SUPER_CUT = Object.freeze({
  /**
   * The chest burst: `count` wedges reaching `radius` view heights out, `width` of it wide at their root, which sits `inner` view heights
   * off his chest (`chest` of his height up his body) — a ring of rays round him, his body clear in the middle.
   */
  burst: { count: 12, radius: 0.32, inner: 0.1, width: 0.045, chest: 0.58 },
  /** The panel's ink border and cream inner rule (screen px). */
  edgePx: 7,
  rulePx: 2,
  /** The face: the band (`SuperCutInArt.band`) this many panel heights tall, its eye this far across the view from his side. */
  faceBand: 1.12,
  eyeAt: 0.36,
  /**
   * The focus lines (manga 集中線): `count` wedges from `inner` panel heights round his eye out past the panel, every `cream`-th one a
   * cream highlight, `width` panel heights wide at the far end; they boil (re-drawn) every `lineFrameMs`.
   */
  lines: { count: 64, inner: 0.6, width: 0.035, cream: 4, alpha: 0.8, lineFrameMs: 50 },
  /** The panel's light: a radial ramp round his eye, `reach` views to its rim; its four stops (hot gold, gold, amber, sienna). */
  glow: { reach: 1.05, stops: [0.16, 0.5, 0.82, 1] },
  /**
   * The name: this share of the view's height tall, its centre this far across the view from the far side, on the panel's lower edge;
   * a long one (`3-SECOND STORM`) shrinks to at most `nameMaxWidth` of the view's width so it stays on screen.
   */
  nameSize: 0.1,
  nameAt: 0.25,
  nameMaxWidth: 0.44,
  /** The fallback body (no close-up): this many panel heights tall, its feet below the panel. */
  bodyScale: 1.55,
  /** The wipe: a navy band this many views wide, slanted by `skew` of the view's height. */
  wipe: { width: 0.4, skew: 0.25 },
});

/** The burst's colour as it cools (`burst.coolMs`): cream, hot gold, gold, amber. */
const BURST_RAMP = [PALETTE.fxWarmCream, PALETTE.hotGold, PALETTE.fxWarmGold, PALETTE.fxWarmAmber] as const;
/** The panel glow texture (made once per scene). */
const GLOW_KEY = "city-fight-super-glow";
const GLOW_PX = 512;
/** The name's drawn font size (scaled to `nameSize` of the view). */
const NAME_FONT_PX = 96;

/** A deterministic 0..1 per line and boil frame (the focus lines' jitter). */
const jitter = (i: number, frame: number, salt: number) => ((i * 7919 + frame * 104729 + salt * 1299709) % 1000 + 1000) % 1000 / 1000;

export class CityFightSuperFlashView {
  private readonly burst: Phaser.GameObjects.Graphics;
  private readonly panel: Phaser.GameObjects.Graphics;
  private readonly glow: Phaser.GameObjects.Image;
  private readonly lines: Phaser.GameObjects.Graphics;
  private readonly face: Phaser.GameObjects.Image;
  private readonly body: Phaser.GameObjects.Image;
  private readonly edges: Phaser.GameObjects.Graphics;
  private readonly name: Phaser.GameObjects.Text;
  private readonly bars: Phaser.GameObjects.Graphics;
  private readonly wipe: Phaser.GameObjects.Graphics;
  private readonly clip: Phaser.GameObjects.Graphics;
  private ms = Number.POSITIVE_INFINITY;
  private resolvedMs: number | null = null;

  private burstOn = true;
  /** Where the burst leaves his chest (world px), or null (no caster). */
  private chest: { readonly x: number; readonly y: number } | null = null;
  private side: -1 | 1 = -1;
  private reduced = false;
  private cast: CityFightSuperCast = { art: null, name: null };

  constructor(private readonly scene: Phaser.Scene, private readonly camera: () => Phaser.Cameras.Scene2D.Camera) {
    const depth = VILLAGE_DEPTHS.fightSuperCut;
    // One depth: the creation order is the drawing order (burst, panel and its glow, lines, face, edges, name, bars, wipe).
    const graphics = (name: string) => scene.add.graphics().setDepth(depth).setName(name).setVisible(false);
    this.burst = graphics("city-fight-super-burst");
    this.panel = graphics("city-fight-super-panel");
    this.glow = scene.add.image(0, 0, this.glowTexture()).setDepth(depth).setName("city-fight-super-glow").setVisible(false);
    this.lines = graphics("city-fight-super-lines");
    this.face = scene.add.image(0, 0, "__DEFAULT").setOrigin(0, 0).setDepth(depth).setName("city-fight-super-face").setVisible(false);
    this.body = scene.add.image(0, 0, "__DEFAULT").setOrigin(0.5, 1).setDepth(depth).setName("city-fight-super-body").setVisible(false);
    this.edges = graphics("city-fight-super-edges");
    this.name = scene.add.text(0, 0, "", { fontFamily: FONT.hudSans, fontSize: `${NAME_FONT_PX}px`, fontStyle: "bold",
      color: cssHex(PALETTE.white), stroke: cssHex(PALETTE.navyInk), strokeThickness: 18 })
      .setOrigin(0.5).setDepth(depth).setName("city-fight-super-name").setVisible(false);
    this.bars = graphics("city-fight-super-bars");
    this.wipe = graphics("city-fight-super-wipe");
    // The panel's shape clips its glow, lines, face and body (never drawn itself).
    this.clip = scene.make.graphics({}, false);
    const mask = this.clip.createGeometryMask();
    for (const piece of [this.glow, this.lines, this.face, this.body]) piece.setMask(mask);
  }

  /** It plays now (bars included). */
  get active(): boolean { return this.ms < Number.POSITIVE_INFINITY; }

  /** Load the close-ups of these cut-in ids (a fight's two casters, at its challenge). */
  prepare(ids: readonly string[]): void {
    preloadImageAssets(this.scene, ids.flatMap(id => SUPER_CUT_IN_ART[id] ? [{ key: SUPER_CUT_IN_ART[id].key, path: SUPER_CUT_IN_ART[id].path }] : []));
    if (!this.scene.load.isLoading() && this.scene.load.list.size > 0) this.scene.load.start();
  }

  /**
   * The super starts: `caster`'s sprite (his burst's chest and the fallback body; null: neither), on screen `side` of his opponent (-1
   * left), and who he is (`cast`).
   */
  play(caster: Phaser.GameObjects.Sprite | null, side: -1 | 1, reducedMotion: boolean, cast: CityFightSuperCast = { art: null, name: null },
    options: { readonly burst?: boolean } = {}): void {
    this.ms = 0; this.resolvedMs = null; this.side = side; this.reduced = reducedMotion; this.cast = cast; this.burstOn = options.burst !== false;
    if (caster && caster.texture && caster.frame) this.body.setTexture(caster.texture.key, caster.frame.name).setFlipX(caster.flipX);
    this.body.setData("hasBody", caster !== null);
    const box = caster?.getBounds();
    this.chest = box ? { x: box.centerX, y: box.bottom - box.height * CITY_FIGHT_SUPER_CUT.burst.chest } : null;
    this.name.setText(cast.name ?? "");
  }

  /** The super resolved (its contact): the bars go now (at the earliest when the cut-in ends). */
  resolve(): void { if (this.active && this.resolvedMs === null) this.resolvedMs = this.ms; }

  /** One frame (screen ms — the fight holds through the cut-in). */
  update(screenDtMs: number): void {
    if (!this.active) { this.hide(); return; }
    this.ms += Math.max(0, Number.isFinite(screenDtMs) ? screenDtMs : 0);
    const f = cityFightSuperCutInFrame(this.ms, this.reduced, this.resolvedMs);
    if (!f) { this.ms = Number.POSITIVE_INFINITY; this.hide(); return; }
    const view = this.camera().worldView, perPx = view.width / Math.max(1, this.camera().width);
    this.drawBurst(view, this.burstOn ? f.burst : null);
    this.drawPanel(view, perPx, f);
    this.drawBars(view, perPx, f.bars);
    this.drawWipe(view, perPx, f.wipe);
  }

  destroy(): void {
    for (const piece of [this.burst, this.panel, this.glow, this.lines, this.face, this.body, this.edges, this.name, this.bars, this.wipe, this.clip]) {
      piece.destroy();
    }
  }

  private hide(): void {
    for (const piece of [this.burst, this.panel, this.glow, this.lines, this.face, this.body, this.edges, this.name, this.bars, this.wipe]) {
      piece.setVisible(false);
    }
  }

  /** The panel's light: a radial ramp from hot gold at the middle to sienna at the rim (a canvas texture, made once per scene). */
  private glowTexture(): string {
    if (artTextureKey(this.scene, GLOW_KEY, "decorative") !== null) return GLOW_KEY;
    const texture = this.scene.textures.createCanvas(GLOW_KEY, GLOW_PX, GLOW_PX);
    const ctx = texture?.getContext();
    if (!texture || !ctx) return "__DEFAULT";
    const r = GLOW_PX / 2, gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
    const colors = [PALETTE.hotGold, PALETTE.fxWarmGold, PALETTE.fxWarmAmber, PALETTE.fxWarmSienna];
    CITY_FIGHT_SUPER_CUT.glow.stops.forEach((at, i) => gradient.addColorStop(at, cssHex(colors[i]!)));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, GLOW_PX, GLOW_PX);
    texture.refresh();
    return GLOW_KEY;
  }

  /** The chest burst: ink-rimmed wedges out of his chest, grown over `growMs`, cooling cream to amber, gone as the panel lands. */
  private drawBurst(view: Phaser.Geom.Rectangle, life: number | null): void {
    const B = CITY_FIGHT_SUPER_CUT.burst, T = CITY_FIGHT_SUPER_CUT_IN.burst, chest = this.chest;
    if (life === null || !chest) { this.burst.setVisible(false); return; }
    const ms = life * T.ms, grow = easeOutCubic(clamp01(ms / T.growMs)), cool = clamp01(ms / T.coolMs) * (BURST_RAMP.length - 1);
    const color = BURST_RAMP[Math.min(BURST_RAMP.length - 1, Math.floor(cool))]!, fade = 1 - clamp01((life - 0.8) / 0.2);
    const g = this.burst.clear().setVisible(true).setAlpha(fade), inner = view.height * B.inner, length = view.height * (B.radius - B.inner) * grow;
    for (let i = 0; i < B.count; i++) {
      const a = (i + 0.5 * jitter(i, 0, 5)) / B.count * Math.PI * 2, long = inner + length * (0.65 + 0.5 * jitter(i, 0, 6));
      const half = view.height * B.width * (0.4 + 0.6 * jitter(i, 0, 7)) / 2, ca = Math.cos(a), sa = Math.sin(a), nx = -sa, ny = ca;
      const root = { x: chest.x + ca * inner, y: chest.y + sa * inner };
      const wedge = (scale: number) => [{ x: root.x + nx * half * scale, y: root.y + ny * half * scale },
        { x: root.x + ca * (long - inner) * scale, y: root.y + sa * (long - inner) * scale }, { x: root.x - nx * half * scale, y: root.y - ny * half * scale }];
      g.fillStyle(PALETTE.navyInk, 1).fillPoints(wedge(1.12), true);
      g.fillStyle(color, 1).fillPoints(wedge(1), true);
    }
  }

  /** The letterbox: navy bars from the top and bottom edges with a gold rule on their inner edge. */
  private drawBars(view: Phaser.Geom.Rectangle, perPx: number, share: number): void {
    const g = this.bars.clear().setVisible(share > 0.001);
    if (share <= 0.001) return;
    const h = view.height * CITY_FIGHT_SUPER_CUT_IN.bars.share * share, rule = 3 * perPx;
    g.fillStyle(PALETTE.navyInk, 1);
    g.fillRect(view.x - 8, view.y - 8, view.width + 16, h + 8);
    g.fillRect(view.x - 8, view.bottom - h, view.width + 16, h + 8);
    g.fillStyle(PALETTE.fxWarmGold, 1);
    g.fillRect(view.x - 8, view.y + h - rule, view.width + 16, rule);
    g.fillRect(view.x - 8, view.bottom - h, view.width + 16, rule);
  }

  /** The brush wipe: a slanted navy band sweeping to the far side, a cream rule on its leading edge. */
  private drawWipe(view: Phaser.Geom.Rectangle, perPx: number, lead: number | null): void {
    const g = this.wipe.clear().setVisible(lead !== null);
    if (lead === null) return;
    const W = CITY_FIGHT_SUPER_CUT.wipe, toward = -this.side, width = view.width * W.width, skew = view.height * W.skew;
    // The leading edge runs from beyond his side's edge (0) past the far edge (1), the band trailing it.
    const travel = view.width + width + skew;
    const front = toward > 0 ? view.x - skew + travel * lead : view.right + skew - travel * lead;
    const back = front - toward * width, top = view.y - 8, bottom = view.bottom + 8;
    const band = [{ x: back, y: top }, { x: front, y: top }, { x: front - toward * skew, y: bottom }, { x: back - toward * skew, y: bottom }];
    g.fillStyle(PALETTE.navyInk, 1).fillPoints(band, true);
    g.lineStyle(4 * perPx, PALETTE.fxWarmCream, 1).lineBetween(front, top, front - toward * skew, bottom);
  }

  /** The focus lines round (cx, cy): wedges (ink, every few a cream highlight; all cream on the impact frame) out past the panel, boiling. */
  private drawLines(cx: number, cy: number, panelPx: number, reachPx: number, alpha: number, inverted: boolean): void {
    const L = CITY_FIGHT_SUPER_CUT.lines, frame = this.reduced ? 0 : Math.floor(this.ms / L.lineFrameMs);
    const g = this.lines.clear().setVisible(true).setAlpha(alpha), outer = reachPx * 1.3;
    for (let i = 0; i < L.count; i++) {
      const a = (i + jitter(i, frame, 1) * 0.6) / L.count * Math.PI * 2, inner = panelPx * L.inner * (1 + 0.45 * jitter(i, frame, 2));
      const highlight = i % L.cream === 0, cream = inverted || highlight, thin = highlight && !inverted ? 0.5 : 1;
      const half = panelPx * L.width * (0.35 + jitter(i, frame, 3)) / 2 * thin, ca = Math.cos(a), sa = Math.sin(a), nx = -sa * half, ny = ca * half;
      g.fillStyle(cream ? PALETTE.fxWarmCream : PALETTE.navyInk, cream ? 0.9 : L.alpha);
      g.fillPoints([{ x: cx + ca * inner, y: cy + sa * inner }, { x: cx + ca * outer + nx, y: cy + sa * outer + ny },
        { x: cx + ca * outer - nx, y: cy + sa * outer - ny }], true);
    }
  }

  /** The panel, its glow and focus lines, his face (or body), the edges and the name. */
  private drawPanel(view: Phaser.Geom.Rectangle, perPx: number, f: CityFightSuperCutInFrame): void {
    const P = CITY_FIGHT_SUPER_CUT_IN.panel, C = CITY_FIGHT_SUPER_CUT, W = view.width, H = view.height;
    const pieces = [this.panel, this.glow, this.lines, this.face, this.body, this.edges, this.name];
    if (f.panelAlpha <= 0) { for (const piece of pieces) piece.setVisible(false); return; }
    // From his side: the offsets run toward the far side (`side` -1: he stands left, it comes in from the left).
    const toward = -this.side as -1 | 1, mid = view.y + H * P.y, panelPx = H * P.height, half = panelPx / 2, rise = panelPx * P.tilt * toward;
    const x = view.x + f.panelX * W * toward, left = x - W * 0.1, right = x + W * 1.1;
    const shape = [{ x: left, y: mid - half + rise }, { x: right, y: mid - half - rise }, { x: right, y: mid + half - rise }, { x: left, y: mid + half + rise }];
    this.panel.clear().setVisible(true).setAlpha(f.panelAlpha).fillStyle(f.inverted ? PALETTE.navyInk : PALETTE.fxWarmAmber, 1).fillPoints(shape, true);
    this.clip.clear().fillStyle(PALETTE.white, 1).fillPoints(shape, true);
    const eyeX = (this.side < 0 ? view.x + W * C.eyeAt : view.right - W * C.eyeAt) + f.panelX * W * toward;
    const art = this.cast.art, key = art ? artTextureKey(this.scene, art.key, "decorative") : null;
    // His eye: where the light and the lines centre (the band's eye row on the panel's middle; up his chest without a close-up).
    const eyeY = art ? mid + (art.eye[1] - (art.band[0] + art.band[1]) / 2) * panelPx * C.faceBand / Math.max(1, art.band[1] - art.band[0])
      : mid - half * 0.35;
    const glowPx = W * C.glow.reach * 2;
    this.glow.setVisible(!f.inverted).setAlpha(f.panelAlpha).setDisplaySize(glowPx, glowPx).setPosition(eyeX, eyeY);
    this.drawLines(eyeX, eyeY, panelPx, W, f.panelAlpha, f.inverted);
    const shift = (f.artX - f.panelX) * W * toward;
    if (art && key && f.art) {
      const scale = panelPx * C.faceBand / Math.max(1, art.band[1] - art.band[0]) * f.artZoom;
      // His eye at `eyeX` (+ the drift), the band's middle on the panel's middle (flipped for a caster on the right: he looks left).
      const flip = this.side > 0, ex = flip ? art.width - art.eye[0] : art.eye[0], top = mid - (art.band[0] + art.band[1]) / 2 * scale;
      this.face.setTexture(key).setFlipX(flip).setScale(scale).setAlpha(f.panelAlpha).setPosition(eyeX + shift - ex * scale, top).setVisible(true);
      if (f.inverted) this.face.setTintFill(PALETTE.fxWarmCream); else this.face.clearTint();
      this.body.setVisible(false);
    } else if (!art && f.art && this.body.getData("hasBody") === true) {
      this.face.setVisible(false);
      const height = panelPx * C.bodyScale * f.artZoom, frame = this.body.frame, width = height * frame.width / Math.max(1, frame.height);
      this.body.setVisible(true).setAlpha(f.panelAlpha).setDisplaySize(width, height).setPosition(eyeX + shift, mid + half * 1.6);
      if (f.inverted) this.body.setTintFill(PALETTE.fxWarmCream); else this.body.clearTint();
    } else { this.face.setVisible(false); this.body.setVisible(false); }
    const edge = C.edgePx * perPx, rule = C.rulePx * perPx, e = this.edges.clear().setVisible(true).setAlpha(f.panelAlpha);
    for (const [a, b, inward] of [[shape[0]!, shape[1]!, 1], [shape[3]!, shape[2]!, -1]] as const) {
      e.lineStyle(edge, PALETTE.navyInk, 1).lineBetween(a.x, a.y, b.x, b.y);
      e.lineStyle(rule, PALETTE.fxWarmCream, 1).lineBetween(a.x, a.y + inward * (edge / 2 + rule), b.x, b.y + inward * (edge / 2 + rule));
    }
    if (f.nameAlpha > 0 && this.cast.name) {
      // Across the panel's lower edge on the far side, tilted with it — it breaks the frame.
      const fit = Math.min(H * C.nameSize / NAME_FONT_PX, W * C.nameMaxWidth / Math.max(1, this.name.width));
      const scale = fit * f.nameScale, lower = [shape[3]!, shape[2]!] as const;
      const nx = (this.side < 0 ? view.right - W * C.nameAt : view.x + W * C.nameAt) + f.panelX * W * toward;
      const ny = lower[0].y + (lower[1].y - lower[0].y) * ((nx - left) / Math.max(1, right - left));
      this.name.setScale(scale).setRotation(Math.atan2(lower[1].y - lower[0].y, right - left)).setAlpha(f.nameAlpha)
        .setPosition(nx + f.nameShake * perPx, ny + f.nameShake * perPx * 0.5).setVisible(true);
    } else this.name.setVisible(false);
  }
}
