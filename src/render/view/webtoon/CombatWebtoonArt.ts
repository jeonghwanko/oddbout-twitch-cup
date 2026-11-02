import type Phaser from "phaser";
import { applyPlayerTextScale } from "../../accessibility/AccessibilityRuntime";
import { artTextureKey } from "../../art/ArtFallback";
import { FONT, PALETTE, cssAlpha, cssHex } from "../../art/palette";
import type { FxPoint } from "../../effects/FxPrim";
import { fxRng } from "../../effects/FxRandom";
import { inkBlobPoints } from "../../effects/webtoon/InkStrokeReveal";
import { coverCrop } from "../../effects/webtoon/TitleWebtoonPrologueTimeline";
import type { FightOverlayRect, FightOverlayTuning } from "../../effects/webtoon/CombatOverlayTuning";
import type { CombatEncounterConfig, CombatRivalFrameCut } from "../../effects/webtoon/CombatEndingDirector";
import { preparePhaserTexture } from "../../PhaserTextureFamilies";



/** A region of a texture to show in a panel. `opaque`: it fills its panel (a painting); else a cut-out over a drawn backdrop. */
export interface ArtCut {
  readonly key: string;
  readonly frame?: string | number;
  /** Frame-local px. */
  readonly region: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  /** Mirror it (the art faces the other way from where the panel wants it). */
  readonly flipX: boolean;
  readonly opaque: boolean;
}

export type KumaCutMood = "bust" | "shock" | "recoil";

// ── KUMA ───────────────────────────────────────────────────────────────

interface KumaClipRef { readonly key: string; readonly frameWidth: number; readonly frameHeight: number }
let kumaClips: { readonly idle: KumaClipRef; readonly hit: KumaClipRef | null } | null = null;
let kumaClipsRequested = false;

/** Reads KUMA's runtime JSON (the lazy chunk his view already loads) for the front-diagonal idle and hit sheets. Once. */
export function requestKumaCutClips(): void {
  if (kumaClipsRequested) return;
  kumaClipsRequested = true;
  void import("../../../assets/native-city-kuma-ortho-runtime.json").then(module => {
    const pack = module.default as unknown as { readonly directions?: Readonly<Record<string, Readonly<Record<string, KumaClipRef | undefined>> | undefined>> };
    const front = pack.directions?.["front_diagonal"];
    if (front?.["idle"]) kumaClips = { idle: front["idle"], hit: front["hit"] ?? null };
    // 이 두 장은 승리 웹툰의 대체 그림일 뿐이다(그린 놀람·결정타·분노 그림이 먼저). '그리는 시트'로 선언하면 3D 카드가 맡은 그의 몸 시트가
    // 대결을 걸 때마다 원본으로 올라간다(정면 대각 피격 29 MiB — 거는 순간의 끊김, 2026-10-13). 쓸 때만 원본을 되돌린다(`kumaCut`).
  }).catch(() => { /* No runtime JSON: the overlays draw KUMA's drawn art or nothing (the panel keeps its backdrop). */ });
}


export function kumaCut(scene: Phaser.Scene, mood: KumaCutMood, drawn: { readonly key: string } | null, faceLeft: boolean): ArtCut | null {
  if (drawn && artTextureKey(scene, drawn.key, "decorative") !== null) {
    const source = scene.textures.get(drawn.key).getSourceImage() as { width: number; height: number };
    return { key: drawn.key, region: { x: 0, y: 0, w: source.width, h: source.height }, flipX: false, opaque: false };
  }
  const clips = kumaClips;
  if (!clips) return null;
  // 그의 몸 시트는 3D 카드가 맡아 Phaser 사본이 저해상도로 내려가 있을 수 있다(`preparePhaserTexture` — 되돌리는 동안은 다음 대체로).
  const ready = (clip: KumaClipRef) => artTextureKey(scene, clip.key, "decorative") !== null && preparePhaserTexture(scene.game, clip.key);
  const hit = clips.hit && ready(clips.hit) ? clips.hit : null;
  if (mood === "shock" && hit) return { key: hit.key, frame: 10, region: { x: 104, y: 14, w: 196, h: 164 }, flipX: faceLeft, opaque: false };
  if (mood === "recoil" && hit) return { key: hit.key, frame: 12, region: { x: 30, y: 0, w: 330, h: hit.frameHeight }, flipX: faceLeft, opaque: false };
  if (!ready(clips.idle)) return null;
  const region = mood === "shock" ? { x: 40, y: 0, w: 180, h: 150 } : { x: 0, y: 0, w: clips.idle.frameWidth, h: Math.min(clips.idle.frameHeight, 330) };
  return { key: clips.idle.key, frame: 0, region, flipX: faceLeft, opaque: false };
}

/**
 * The encounter's rival for a cut: its drawn piece when ready (`drawn`), else its own frames (`rivalFrames` — a skinned
 * fighter: standing cell for `bust`, a head crop of the recoil for `shock`, the recoil for `recoil`, each falling back to the
 * standing cell while the hit sheet is not in), else KUMA's (`kumaCut`). A rival with own frames never shows KUMA.
 */
export function rivalCut(scene: Phaser.Scene, encounter: Pick<CombatEncounterConfig, "rivalFrames">, mood: KumaCutMood,
  drawn: { readonly key: string } | null, faceLeft: boolean): ArtCut | null {
  const frames = encounter.rivalFrames;
  if (!frames) return kumaCut(scene, mood, drawn, faceLeft);
  if (drawn && artTextureKey(scene, drawn.key, "decorative") !== null) {
    const source = scene.textures.get(drawn.key).getSourceImage() as { width: number; height: number };
    return { key: drawn.key, region: { x: 0, y: 0, w: source.width, h: source.height }, flipX: false, opaque: false };
  }
  const ready = (cut: CombatRivalFrameCut | null) => cut && artTextureKey(scene, cut.key, "decorative") !== null ? cut : null;
  const bust = ready(frames.bust);
  const cut = mood === "shock" ? ready(frames.shock) ?? (bust && { ...bust, region: { ...bust.region, h: bust.region.h * 0.45 } })
    : mood === "recoil" ? ready(frames.recoil) ?? bust : bust;
  // The art faces `facesRight`; the panel wants it facing left (`faceLeft`) or right.
  return cut ? { key: cut.key, frame: cut.frame, region: cut.region, flipX: faceLeft === cut.facesRight, opaque: false } : null;
}

// ── 컷 배치 ─────────────────────────────────────────────────────────────

/**
 * One art cut inside a panel: a wrapper container (mirrors by its scaleX, origin at the cut's centre) holding the cropped image.
 * `cover` fills a rect (a painting), `stand` sizes a cut-out by height on a bottom anchor.
 */
export class CutView {
  readonly root: Phaser.GameObjects.Container;
  readonly image: Phaser.GameObjects.Image;
  private cut: ArtCut | null = null;

  constructor(scene: Phaser.Scene, name: string) {
    this.image = scene.add.image(0, 0, "__DEFAULT").setOrigin(0).setName(`${name}-image`);
    this.root = scene.add.container(0, 0, [this.image]).setName(name);
  }

  get placed(): boolean { return this.cut !== null; }

  setCut(cut: ArtCut | null): this {
    this.cut = cut;
    this.root.setVisible(cut !== null);
    if (cut) this.image.setTexture(cut.key, cut.frame);
    return this;
  }

  /**
   * Fills `rect` (container-local px) with the cut; `focus` is the point of the cut's region (0..1, in the art's own unmirrored
   * coordinates) kept centred, `zoom` ≥ 1 extra.
   */
  cover(rect: FightOverlayRect, focusX = 0.5, focusY = 0.5, zoom = 1): void {
    const cut = this.cut;
    if (!cut) return;
    const r = cut.region;
    const local = { x: -rect.w / 2, y: -rect.h / 2, w: rect.w, h: rect.h };
    const fit = coverCrop(r.w, r.h, local, focusX, focusY, zoom);
    const k = fit.w / Math.max(1e-6, r.w);
    this.image.setScale(k).setPosition(fit.x - r.x * k, fit.y - r.y * k)
      .setCrop(r.x + fit.crop.x, r.y + fit.crop.y, fit.crop.w, fit.crop.h);
    this.root.setPosition(rect.x + rect.w / 2, rect.y + rect.h / 2).setScale(cut.flipX ? -1 : 1, 1);
  }

  /** A cut-out standing `height` px tall with its bottom centre at (`x`, `bottom`) (container-local px). */
  stand(x: number, bottom: number, height: number): void {
    const cut = this.cut;
    if (!cut) return;
    const r = cut.region, k = height / Math.max(1e-6, r.h);
    this.image.setScale(k).setPosition(-(r.x + r.w / 2) * k, -(r.y + r.h) * k).setCrop(r.x, r.y, r.w, r.h);
    this.root.setPosition(x, bottom).setScale(cut.flipX ? -1 : 1, 1);
  }
}

// ── 글자 ────────────────────────────────────────────────────────────────

/** A baked letter texture and the scale that shows it at its design size. */
export interface BakedLetter {
  readonly key: string;
  readonly scale: number;
}

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힣]/u;

/** Latin call-outs take the lettering face (Black Han Sans, full ASCII); Hangul takes Pretendard Bold (the lettering subset has no 결·투·칼·퇴). */
function letterFont(text: string, px: number): string {
  return HANGUL.test(text) ? `bold ${Math.round(px)}px ${FONT.hudSans}` : `${Math.round(px)}px ${FONT.lettering}`;
}

function measureContext(scene: Phaser.Scene): CanvasRenderingContext2D | null {
  try { return scene.game.canvas.ownerDocument.createElement("canvas").getContext("2d"); } catch { return null; }
}

/**
 * A code-font call-out letter ("VS", "결투!", "K.O.", "!?"): slanted, an ink drop shadow, a paper rim, a heavy ink outline and a
 * cream → gold → gilt fill with a printed gloss band — baked once per key at `letters.bakeScale` × the design size.
 */
export function bakeCallLetter(scene: Phaser.Scene, key: string, text: string, designPx: number, tuning: FightOverlayTuning): BakedLetter | null {
  const L = tuning.letters, bake = Math.max(1, L.bakeScale);
  if (artTextureKey(scene, key, "decorative") !== null) return { key, scale: 1 / bake };
  const measure = measureContext(scene);
  if (!measure) return null;
  const size = designPx * bake, font = letterFont(text, size);
  measure.font = font;
  const metrics = measure.measureText(text);
  const ascent = metrics.actualBoundingBoxAscent || size * 0.78, descent = metrics.actualBoundingBoxDescent || size * 0.12;
  const stroke = Math.max(L.strokeMinPx * bake, size * L.strokeRatio), rim = size * L.rimRatio, shadow = size * L.shadowRatio;
  const skew = Math.abs(L.skewX), pad = stroke / 2 + rim + 4;
  const width = Math.ceil(metrics.width + skew * (ascent + descent) + 2 * pad + shadow);
  const height = Math.ceil(ascent + descent + 2 * pad + shadow);
  const texture = scene.textures.createCanvas(key, width, height);
  if (!texture) return null;
  const ctx = texture.context;
  ctx.font = font;
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.translate(pad + skew * descent, pad + ascent);
  ctx.transform(1, 0, L.skewX, 1, 0, 0);
  const outline = (lineWidth: number, color: string) => { ctx.lineWidth = lineWidth; ctx.strokeStyle = color; ctx.strokeText(text, 0, 0); };
  // Drop shadow (ink 55 %), then the paper rim, the fill with its gloss, the ink outline on top.
  ctx.save();
  ctx.translate(shadow, shadow);
  outline(stroke + 2 * rim, cssAlpha(PALETTE.webtoonInk, "8c"));
  ctx.restore();
  outline(stroke + 2 * rim, cssHex(PALETTE.paper));
  const gradient = ctx.createLinearGradient(0, -ascent, 0, descent);
  gradient.addColorStop(0, cssHex(PALETTE.hotGold));
  gradient.addColorStop(0.55, cssHex(PALETTE.brightGold));
  gradient.addColorStop(1, cssHex(PALETTE.gildShadow));
  ctx.fillStyle = gradient;
  ctx.fillText(text, 0, 0);
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = cssAlpha(PALETTE.paper, "55");
  ctx.fillRect(-pad, -ascent * 0.82, metrics.width + 2 * pad, ascent * 0.13);
  ctx.globalCompositeOperation = "source-over";
  outline(stroke, cssHex(PALETTE.webtoonInk));
  texture.refresh();
  return { key, scale: 1 / bake };
}

/**
 * The "칼퇴 완료" rubber stamp: burgundy ink, a rounded double border round the words, the ink worn by seeded pinholes (a real
 * stamp never inks evenly). Baked once per key.
 */
export function bakeStamp(scene: Phaser.Scene, key: string, text: string, tuning: FightOverlayTuning): BakedLetter | null {
  const S = tuning.victory.stamp, bake = Math.max(1, tuning.letters.bakeScale);
  if (artTextureKey(scene, key, "decorative") !== null) return { key, scale: 1 / bake };
  const measure = measureContext(scene);
  if (!measure) return null;
  const size = S.sizePx * bake, font = letterFont(text, size), border = S.borderPx * bake;
  measure.font = font;
  const metrics = measure.measureText(text);
  const ascent = metrics.actualBoundingBoxAscent || size * 0.78, descent = metrics.actualBoundingBoxDescent || size * 0.12;
  const boxW = metrics.width + 2 * S.padX * bake + 2 * border, boxH = ascent + descent + 2 * S.padY * bake + 2 * border;
  const width = Math.ceil(boxW + border * 2), height = Math.ceil(boxH + border * 2);
  const texture = scene.textures.createCanvas(key, width, height);
  if (!texture) return null;
  const ctx = texture.context, ink = cssHex(PALETTE.burgundyInk);
  const x0 = border, y0 = border, radius = boxH * 0.18;
  const rounded = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  };
  ctx.strokeStyle = ink;
  ctx.lineWidth = border;
  rounded(x0, y0, boxW, boxH, radius);
  ctx.stroke();
  ctx.lineWidth = border * 0.35;
  const inset = border * 1.6;
  rounded(x0 + inset, y0 + inset, boxW - 2 * inset, boxH - 2 * inset, Math.max(2, radius - inset));
  ctx.stroke();
  ctx.font = font;
  ctx.fillStyle = ink;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "center";
  ctx.fillText(text, x0 + boxW / 2, y0 + boxH / 2 + (ascent - descent) / 2);
  // Worn ink: seeded pinholes and a dry streak.
  const rng = fxRng(S.seed);
  ctx.globalCompositeOperation = "destination-out";
  for (let index = 0; index < 150; index++) {
    ctx.globalAlpha = 0.45 + 0.55 * rng();
    ctx.beginPath();
    ctx.arc(rng() * width, rng() * height, (0.5 + rng() * 1.8) * bake, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 0.35;
  ctx.fillRect(0, height * (0.62 + 0.1 * rng()), width, Math.max(1, 1.2 * bake));
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  texture.refresh();
  return { key, scale: 1 / bake };
}

// ── 그림 도구 ───────────────────────────────────────────────────────────

/** A paper-coloured halftone dot tile (for TileSprite backdrops). `color` dots of `radius` on a `size` px transparent cell. */
export function ensureHalftone(scene: Phaser.Scene, key: string, color: number, alphaHex: string, size = 12, radius = 2.2): string | null {
  if (artTextureKey(scene, key, "decorative") !== null) return key;
  const texture = scene.textures.createCanvas(key, size, size);
  if (!texture) return null;
  const ctx = texture.context;
  ctx.fillStyle = cssAlpha(color, alphaHex);
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
  ctx.fill();
  texture.refresh();
  return key;
}

/**
 * Focus lines converging on (cx, cy): `count` thin wedges from `outer` in to a seeded inner radius past `inner` — the centre stays
 * empty (characters are never lined over). `limit(angle)` caps a line's outer end (keeps them inside a tilted panel). Drawn into `g`.
 */
export function drawFocusLines(g: Phaser.GameObjects.Graphics, cx: number, cy: number, inner: number, outer: number, count: number,
  seed: number, color: number, alpha: number, widthPx: number, limit?: (angle: number) => number): void {
  const rng = fxRng(seed);
  g.fillStyle(color, alpha);
  for (let index = 0; index < count; index++) {
    const angle = (index + (rng() - 0.5) * 0.7) / count * Math.PI * 2;
    const r0 = inner * (1 + rng() * 0.35), half = widthPx * (0.35 + rng() * 0.9) / 2 / Math.max(1, outer);
    const r1 = Math.min(outer, limit?.(angle) ?? outer);
    if (r1 <= r0 + 4) continue;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    g.fillTriangle(cx + cos * r0, cy + sin * r0,
      cx + Math.cos(angle - half) * r1, cy + Math.sin(angle - half) * r1,
      cx + Math.cos(angle + half) * r1, cy + Math.sin(angle + half) * r1);
  }
}

/** A round ink blob (no corners: `inkBlobPoints`) centred on (cx, cy). */
export function drawInkBlob(g: Phaser.GameObjects.Graphics, cx: number, cy: number, radius: number, seed: number, color: number,
  alpha = 1, stretchX = 1): void {
  const points = inkBlobPoints(cx, cy, radius, seed, 28, stretchX);
  const shape: FxPoint[] = [];
  for (let index = 0; index + 1 < points.length; index += 2) shape.push({ x: points[index]!, y: points[index + 1]! });
  g.fillStyle(color, alpha).fillPoints(shape, true);
}

/** The splat that bursts behind a slammed letter: a core blob and seeded droplets round it (centred on 0, 0). */
export function drawSplat(g: Phaser.GameObjects.Graphics, radius: number, count: number, seed: number, color: number): void {
  drawInkBlob(g, 0, 0, radius * 0.55, seed, color, 1, 1.6);
  const rng = fxRng(seed + 1);
  for (let index = 0; index < count; index++) {
    const angle = rng() * Math.PI * 2, distance = radius * (0.65 + rng() * 0.5);
    drawInkBlob(g, Math.cos(angle) * distance * 1.5, Math.sin(angle) * distance * 0.7, radius * (0.08 + rng() * 0.12), seed + 7 + index, color);
  }
}

/** The 2nd-order Bézier points p0 → c → p1 (p0 excluded). */
function quadPoints(p0: FxPoint, c: FxPoint, p1: FxPoint, steps: number): FxPoint[] {
  return Array.from({ length: steps }, (_unused, index) => {
    const t = (index + 1) / steps, u = 1 - t;
    return { x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x, y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y };
  });
}

/** An impact star whose sides curve in toward the centre (never a flat gem), `spikes` long tips alternating with short ones. */
export function drawImpactStar(g: Phaser.GameObjects.Graphics, radius: number, spikes: number, seed: number, fill: number, outline: number,
  outlinePx: number): void {
  const rng = fxRng(seed), n = Math.max(4, spikes) * 2;
  const tips = Array.from({ length: n }, (_unused, index) => {
    const angle = index / n * Math.PI * 2 + (rng() - 0.5) * 0.12;
    const r = index % 2 === 0 ? radius * (0.8 + rng() * 0.3) : radius * (0.34 + rng() * 0.1);
    return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
  });
  const outlinePoints: FxPoint[] = [tips[0]!];
  tips.forEach((tip, index) => {
    const next = tips[(index + 1) % n]!;
    const mid = { x: (tip.x + next.x) * 0.36, y: (tip.y + next.y) * 0.36 };
    outlinePoints.push(...quadPoints(tip, mid, next, 6));
  });
  g.fillStyle(fill).fillPoints(outlinePoints, true);
  if (outlinePx > 0) g.lineStyle(outlinePx, outline).strokePoints(outlinePoints, true);
}

/** A sweat drop (round bottom, pointed top) at (x, y), `size` tall, tipped `angle` rad. */
export function drawSweatDrop(g: Phaser.GameObjects.Graphics, x: number, y: number, size: number, angle: number): void {
  const r = size * 0.32, cos = Math.cos(angle), sin = Math.sin(angle);
  const at = (px: number, py: number): FxPoint => ({ x: x + px * cos - py * sin, y: y + px * sin + py * cos });
  const tip = at(0, -size * 0.6), left = at(-r, size * 0.1), right = at(r, size * 0.1);
  const points: FxPoint[] = [tip, ...quadPoints(tip, at(-r * 0.9, -size * 0.18), left, 6)];
  for (let index = 1; index <= 10; index++) {
    const a = Math.PI + index / 10 * Math.PI;
    points.push(at(Math.cos(a) * r, size * 0.1 - Math.sin(a) * r));
  }
  points.push(...quadPoints(right, at(r * 0.9, -size * 0.18), tip, 6));
  g.fillStyle(PALETTE.pearl).fillPoints(points, true);
  g.lineStyle(Math.max(2, size * 0.09), PALETTE.webtoonInk).strokePoints(points, true);
}

/** A tapering ink slash lens along +x (0 → `length`), `width` at its middle, with a paper highlight — the prologue's 베기. */
export function drawSlashLens(g: Phaser.GameObjects.Graphics, length: number, width: number): void {
  const start = { x: 0, y: 0 }, end = { x: length, y: 0 };
  const upper = quadPoints(start, { x: length / 2, y: -width }, end, 18);
  const lower = quadPoints(end, { x: length / 2, y: width }, start, 18);
  g.fillStyle(PALETTE.webtoonInk).fillPoints([start, ...upper, ...lower], true);
  g.lineStyle(Math.max(2, width * 0.12), PALETTE.paper, 0.95).lineBetween(length * 0.06, 0, length * 0.94, 0);
}

/**
 * A keycap glyph: a paper key with an ink border and the key's label (the HUD face, scaled by the text-size setting like every
 * HUD word); `chevrons` adds the skip ▶▶ after it. Its top-left is the container origin; `width`/`height` give its box.
 */
export function buildKeyGlyph(scene: Phaser.Scene, label: string, heightPx: number, fontPx: number, chevrons: boolean, name: string):
  { readonly root: Phaser.GameObjects.Container; readonly width: number; readonly height: number } {
  const text = applyPlayerTextScale(scene, scene.add.text(0, 0, label, { fontFamily: FONT.hudSans, fontSize: `${fontPx}px`, fontStyle: "bold",
    color: cssHex(PALETTE.webtoonInk) }).setOrigin(0.5).setName(`${name}-label`));
  const height = Math.max(heightPx, text.height + 8), keyW = Math.max(height, text.width + height * 0.6), radius = Math.min(8, height * 0.22);
  const g = scene.add.graphics().setName(`${name}-key`);
  g.fillStyle(PALETTE.webtoonInk, 0.55).fillRoundedRect(3, 4, keyW, height, radius);
  g.fillStyle(PALETTE.paper).fillRoundedRect(0, 0, keyW, height, radius);
  g.lineStyle(2.5, PALETTE.webtoonInk).strokeRoundedRect(0, 0, keyW, height, radius);
  text.setPosition(keyW / 2, height / 2);
  const parts: Phaser.GameObjects.GameObject[] = [g, text];
  let width = keyW;
  if (chevrons) {
    const c = scene.add.graphics().setName(`${name}-chevrons`), size = height * 0.46, cy = height / 2;
    for (let index = 0; index < 2; index++) {
      const x = keyW + 10 + index * size * 0.72;
      c.fillStyle(PALETTE.paper).fillTriangle(x, cy - size / 2, x + size * 0.7, cy, x, cy + size / 2);
      c.lineStyle(2, PALETTE.webtoonInk).strokeTriangle(x, cy - size / 2, x + size * 0.7, cy, x, cy + size / 2);
    }
    parts.push(c);
    width = keyW + 10 + size * 0.72 + size * 0.7 + 2;
  }
  return { root: scene.add.container(0, 0, parts).setName(name), width, height };
}

/**
 * A speech bubble: a paper pill round `w×h` (top-left at 0, 0) with a curved tail to (`tailX`, `tailY`), one clean ink outline
 * round the union (strokes first at double width, the paper fills cover their inner halves).
 */
export function drawSpeechBubble(g: Phaser.GameObjects.Graphics, w: number, h: number, tailX: number, tailY: number, outlinePx: number): void {
  const r = Math.min(h / 2, 34), cx = w / 2, cy = h / 2;
  const toward = Math.atan2(tailY - cy, tailX - cx), spread = 0.22;
  const baseA = { x: cx + Math.cos(toward - spread) * w * 0.3, y: cy + Math.sin(toward - spread) * h * 0.3 };
  const baseB = { x: cx + Math.cos(toward + spread) * w * 0.3, y: cy + Math.sin(toward + spread) * h * 0.3 };
  const tip = { x: tailX, y: tailY };
  const tail: FxPoint[] = [baseA, ...quadPoints(baseA, { x: (baseA.x + tip.x) / 2 + 6, y: (baseA.y + tip.y) / 2 }, tip, 8),
    ...quadPoints(tip, { x: (baseB.x + tip.x) / 2 - 6, y: (baseB.y + tip.y) / 2 }, baseB, 8)];
  g.lineStyle(outlinePx * 2, PALETTE.webtoonInk);
  g.strokeRoundedRect(0, 0, w, h, r);
  g.strokePoints(tail, true);
  g.fillStyle(PALETTE.paper);
  g.fillPoints(tail, true);
  g.fillRoundedRect(0, 0, w, h, r);
}
