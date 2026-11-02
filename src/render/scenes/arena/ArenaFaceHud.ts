import Phaser from "phaser";
import { arenaFaceCell, ARENA_FACE_EXPRESSIONS, type ArenaFaceSheet } from "../../../assets/ArenaFaceArtCatalog";
import type { ArenaConceptArt } from "../../../assets/ArenaArtCatalog";
import { NATIVE_CITY_COMBAT } from "../../../sim/cityFight/NativeCityCombatTuning";
import type { CityFightFoeStatus, CityFightPlayerStatus } from "../../../sim/cityFight/CityFightStatus";
import type { ConversationPortrait } from "../../../app/ConversationPanel";
import { applyConversationPortrait } from "../../hud/PortraitImage";
import { cssHex, FONT, PALETTE } from "../../art/palette";
import { artTextureKey } from "../../art/ArtFallback";
import { createNativeCityFightBarDrain, nativeCityFightBarFlash, nativeCityFightBarLinesCrossed, stepNativeCityFightBarDrain,
  type NativeCityFightBarDrain } from "../../effects/NativeCityFightHpBar";
import { NATIVE_CITY_DAMAGE_DISPLAY_SCALE } from "../../effects/NativeCityFloatText";
import { FIGHT_STATUS_ICON_PX, FightStatusIconRow } from "../../view/FightStatusIconRow";
import { syncTextStyle } from "../../ui/TextStyleSync";
import type { ArenaScreenSpace } from "./ArenaHudSpace";
import { arenaFaceHudLayout, type ArenaFaceHudLayout } from "./ArenaFightLayout";
import { ArenaFaceHudModel, ARENA_FACE_HUD, type ArenaFaceCorner, type ArenaFaceTone } from "./ArenaFaceHudModel";

/**
 * A corner's portrait: his expression sheet, else a square of his card picture, else his dialogue portrait's head (a registered fighter —
 * those two are one face for every mood), else none.
 */
export type ArenaFacePicture =
  | { readonly kind: "sheet"; readonly sheet: ArenaFaceSheet }
  | { readonly kind: "card"; readonly art: ArenaConceptArt }
  | { readonly kind: "portrait"; readonly portrait: ConversationPortrait }
  | null;


export type ArenaFaceStatus = CityFightFoeStatus | CityFightPlayerStatus;

export interface ArenaFaceHudCornerFrame {
  readonly name: string;
  readonly hp: number;
  readonly maxHp: number;
  /** His shift lines (`kuma.phases` HP shares), drawn over the bar. */
  readonly lines: readonly number[];
  readonly picture: ArenaFacePicture;
  /** His status icons under the bar (while the bout is live). */
  readonly statuses: readonly ArenaFaceStatus[];
  /** His super meter (0..1) — a thin line under his bar, glowing when full; null: none (a host enemy). */
  readonly meter: number | null;
  /** The super's key beside his full meter (the played corner), else null. */
  readonly meterKey: string | null;
  /** The viewer's own corner (his card in a practice bout, his entry in his bracket): a small lime mark over his name. */
  readonly mine: boolean;
}

export interface ArenaFaceHudFrame {
  readonly shown: boolean;
  readonly corners: readonly [ArenaFaceHudCornerFrame, ArenaFaceHudCornerFrame];
  /** The seconds left, or null while a word holds the top (loading, paused) or the result is up. */
  readonly seconds: number | null;
  readonly koLoser: 0 | 1 | null;
  readonly reducedMotion: boolean;
  readonly textScale: number;
}

export interface ArenaFaceHudActions {
  readonly statusName: (status: ArenaFaceStatus) => string;
  readonly status: (corner: 0 | 1, status: ArenaFaceStatus) => void;
  readonly card: (corner: 0 | 1) => void;
}

const TONE_COLOR: Readonly<Record<ArenaFaceTone, number>> = Object.freeze({ white: PALETTE.white, lime: PALETTE.oddboutAcid, magenta: PALETTE.oddboutPink });

/** The frames of `sheet`'s texture, one per expression (made once per texture). */
export function defineArenaFaceFrames(scene: Phaser.Scene, sheet: ArenaFaceSheet): boolean {
  if (artTextureKey(scene, sheet.key, "decorative") === null) return false;
  const texture = scene.textures.get(sheet.key), scale = texture.getSourceImage().width / sheet.width;
  for (const expression of ARENA_FACE_EXPRESSIONS) {
    if (texture.has(expression)) continue;
    const cell = arenaFaceCell(sheet, expression);
    texture.add(expression, 0, cell.x * scale, cell.y * scale, sheet.cell * scale, sheet.cell * scale);
  }
  return true;
}

/** Only a changed size or shadow touches the text (a Phaser style setter redraws and re-uploads it even when the value is the same). */
function syncLettering(text: Phaser.GameObjects.Text, px: number, shadow: { readonly y: number; readonly color: string; readonly blur: number }): void {
  const size = `${Math.round(px)}px`, style = text.style;
  if (style.fontSize !== size) text.setFontSize(size);
  if (style.shadowOffsetY !== shadow.y || style.shadowColor !== shadow.color || style.shadowBlur !== shadow.blur || !style.shadowFill) {
    text.setShadow(0, shadow.y, shadow.color, shadow.blur, false, true);
  }
}

/** The super meter line under the bar: its share of the bar's length, gap, height, the full one's breath and its key's size (HUD px). */
export const ARENA_FACE_METER = Object.freeze({ share: 0.42, gapPx: 6, heightPx: 4, breatheRadPerMs: 0.006, keyPx: 14 });

/** The status icons' row under a corner's bar and meter (HUD px). */
export function arenaFaceIconsTop(L: ArenaFaceHudLayout): number {
  return L.barTop + L.barH + ARENA_FACE_METER.gapPx + ARENA_FACE_METER.heightPx + 8;
}

/**
 * Below everything the HUD draws (HUD px): its panels, names, numbers, bars, meters and the status icons' row. The fight's comic letters,
 * damage numbers and hit counters stand under it (`ArenaFaceHud.floorShare`).
 */
export function arenaFaceHudFloor(L: ArenaFaceHudLayout): number {
  return Math.max(L.bottom, L.panelTop + L.panelH, arenaFaceIconsTop(L) + FIGHT_STATUS_ICON_PX);
}

/** HP as the HUD shows it: the fight's × 10 whole number, never 0 while he stands. */
export function arenaFaceHpLabel(hp: number): string {
  return hp > 0 ? String(Math.max(1, Math.round(hp * NATIVE_CITY_DAMAGE_DISPLAY_SCALE))) : "0";
}

class Corner {
  readonly panel: Phaser.GameObjects.Graphics;
  readonly portrait: Phaser.GameObjects.Image;
  readonly flash: Phaser.GameObjects.Graphics;
  readonly name: Phaser.GameObjects.Text;
  readonly number: Phaser.GameObjects.Text;
  readonly bar: Phaser.GameObjects.Graphics;
  readonly key: Phaser.GameObjects.Text;
  readonly icons: FightStatusIconRow<ArenaFaceStatus> | null;
  drain: NativeCityFightBarDrain | null = null;
  pictureKey = "";
  readonly lineFlash = new Map<number, number>();

  constructor(scene: Phaser.Scene, space: ArenaScreenSpace, readonly side: 0 | 1, actions: ArenaFaceHudActions | null) {
    const tag = side === 0 ? "left" : "right";
    this.panel = space.add(scene.add.graphics().setName(`arena-face-panel-${tag}`));
    this.portrait = space.add(scene.add.image(0, 0, "__DEFAULT").setOrigin(0.5, 1).setVisible(false).setName(`arena-face-portrait-${tag}`));
    this.flash = space.add(scene.add.graphics().setName(`arena-face-flash-${tag}`));
    this.name = space.add(scene.add.text(0, 0, "", { fontFamily: FONT.hudSans, fontStyle: "bold", color: cssHex(PALETTE.white) })
      .setOrigin(side === 0 ? 0 : 1, 0).setName(`arena-face-name-${tag}`));
    this.number = space.add(scene.add.text(0, 0, "", { fontFamily: FONT.lettering, color: cssHex(PALETTE.white) })
      .setOrigin(side === 0 ? 0 : 1, 0).setName(`arena-face-hp-${tag}`));
    this.bar = space.add(scene.add.graphics().setName(`arena-face-bar-${tag}`));
    this.key = space.add(scene.add.text(0, 0, "", { fontFamily: FONT.lettering, color: cssHex(PALETTE.oddboutInk), backgroundColor: cssHex(PALETTE.oddboutAcid),
      padding: { x: 4, y: 1 } }).setOrigin(side === 0 ? 0 : 1, 0.5).setVisible(false).setName(`arena-face-super-key-${tag}`));
    this.icons = actions ? new FightStatusIconRow<ArenaFaceStatus>(scene, space, 0, actions.statusName, status => actions.status(side, status),
      `arena-face-status-${tag}`, true) : null;
    if (actions) this.portrait.setInteractive({ useHandCursor: true }).on("pointerdown",
      (_p: unknown, _x: number, _y: number, event: Phaser.Types.Input.EventData) => { event.stopPropagation(); actions.card(side); });
  }

  destroy(): void {
    for (const object of [this.panel, this.portrait, this.flash, this.name, this.number, this.bar, this.key]) object.destroy();
    this.icons?.destroy();
  }
}

/**
 * 무투장 얼굴 HUD(2026-10-23, 시안 v5 — 사용자: "이거 좋다"): 위쪽 양 끝에 선수의 표정 초상이 라임 테 패널 위로 머리를 내밀고 서고, 그 안쪽에
 * 이름·큰 HP 숫자(Black Han Sans, HP × 10)·가는 막대, 가운데에 남은 초. 표정은 경기를 따라 바뀐다(`ArenaFaceHudModel` — 맞으면 찡그리고,
 * 때리면 으스대고, 4분의 1 아래면 식은땀, 크게 앞서면 옆눈질, KO 면 눈이 돈다). 숫자는 흰색 → 라임 → 분홍로 위기를 말하고, 맞은 순간
 * 튀고 흔들리고 번쩍인다(모션 줄이기면 색만). 막대의 깎인 몫은 마을 HP 막대와 같은 흰 덩어리 곡선(`NativeCityFightHpBar`)이다.
 * 오른쪽 코너의 초상은 뒤집어 안쪽(상대)을 본다.
 */
export class ArenaFaceHud {
  private readonly model = new ArenaFaceHudModel();
  private readonly corners: readonly [Corner, Corner];
  private readonly clock: Phaser.GameObjects.Text;
  private alpha = 0;
  /** Screen ms since the HUD was made (the full meter's breath). */
  private clockMs = 0;
  private layout: ArenaFaceHudLayout;

  constructor(private readonly scene: Phaser.Scene, private readonly space: ArenaScreenSpace, actions: ArenaFaceHudActions | null) {
    this.corners = [new Corner(scene, space, 0, actions), new Corner(scene, space, 1, actions)];
    this.clock = space.add(scene.add.text(0, 0, "", { fontFamily: FONT.lettering, color: cssHex(PALETTE.white) })
      .setOrigin(0.5, 0).setName("arena-face-clock"));
    this.layout = arenaFaceHudLayout(space.width, space.height);
  }

  /** Where corner `side`'s summon badge stands: on his status icons' row, under his bar and meter (HUD px), and which way it grows. */
  badgeAnchor(side: 0 | 1): { readonly x: number; readonly y: number; readonly mirror: boolean } {
    const L = this.layout, x = side === 0 ? L.textInset : this.space.width - L.textInset;
    return { x, y: arenaFaceIconsTop(L), mirror: side === 1 };
  }

  /** Below the whole HUD (HUD px). */
  get bottom(): number { return this.layout.bottom; }

  /** `arenaFaceHudFloor` as a share of the screen's height (the world view spans the screen: `view.y + view.height × share`). */
  get floorShare(): number { return arenaFaceHudFloor(this.layout) / Math.max(1, this.space.height); }

  /** The status icons drawn now for `side` (tests, the scene's snapshot). */
  statuses(side: 0 | 1): readonly ArenaFaceStatus[] { return this.corners[side].icons?.statuses ?? []; }

  /** The expression each corner shows now (tests, the E2E). */
  expressions: readonly string[] = ["", ""];

  update(dtMs: number, frame: ArenaFaceHudFrame): void {
    const dt = Number.isFinite(dtMs) ? Math.max(0, Math.min(100, dtMs)) : 0, fade = NATIVE_CITY_COMBAT.feel.fightBar.fadeMs;
    const step = frame.reducedMotion ? 1 : dt / Math.max(1, fade);
    this.alpha = frame.shown ? Math.min(1, this.alpha + step) : Math.max(0, this.alpha - step);
    this.clockMs += dt;
    const L = this.layout = arenaFaceHudLayout(this.space.width, this.space.height, frame.textScale);
    const faces = this.model.frame(dt, { hp: [frame.corners[0].hp, frame.corners[1].hp], maxHp: [frame.corners[0].maxHp, frame.corners[1].maxHp],
      koLoser: frame.koLoser, reducedMotion: frame.reducedMotion });
    this.expressions = faces.map(face => face.expression);
    for (const side of [0, 1] as const) this.drawCorner(this.corners[side], frame.corners[side], faces[side], L, dt, frame.reducedMotion);
    const seconds = frame.seconds;
    this.clock.setVisible(this.alpha > 0 && seconds !== null).setAlpha(this.alpha);
    if (seconds !== null) {
      const label = String(seconds);
      if (this.clock.text !== label) this.clock.setText(label);
      syncLettering(this.clock, L.clock, { y: 3, color: cssHex(PALETTE.oddboutInk), blur: 0 });
      this.space.setLogicalPosition(this.clock, this.space.width / 2, L.clockTop);
    }
  }

  private drawCorner(c: Corner, frame: ArenaFaceHudCornerFrame, face: ArenaFaceCorner, L: ArenaFaceHudLayout, dt: number, reduced: boolean): void {
    const shown = this.alpha > 0, right = c.side === 1, W = this.space.width;
    for (const object of [c.panel, c.portrait, c.flash, c.name, c.number, c.bar, c.key]) object.setAlpha(this.alpha);
    if (!shown) {
      c.panel.clear(); c.flash.clear(); c.bar.clear();
      c.portrait.setVisible(false); c.name.setVisible(false); c.number.setVisible(false); c.key.setVisible(false);
      c.icons?.update(dt, [], 0, 0, right ? "right" : "left", 0, reduced);
      c.drain = null;
      return;
    }
    // The portrait's panel: ink under a lime rim, its inner edge slanted toward the middle.
    const shake = face.shake, grow = 1 + ARENA_FACE_HUD.pop.panelScale * face.pop;
    const px = (right ? W - L.margin - L.panelW : L.margin) + shake, py = L.panelTop, pw = L.panelW, ph = L.panelH, slant = pw * 0.12;
    const points = right
      ? [new Phaser.Math.Vector2(px + slant, py), new Phaser.Math.Vector2(px + pw, py), new Phaser.Math.Vector2(px + pw, py + ph), new Phaser.Math.Vector2(px, py + ph)]
      : [new Phaser.Math.Vector2(px, py), new Phaser.Math.Vector2(px + pw - slant, py), new Phaser.Math.Vector2(px + pw, py + ph), new Phaser.Math.Vector2(px, py + ph)];
    this.space.setLogicalPosition(c.panel, 0, 0);
    c.panel.clear().fillStyle(PALETTE.oddboutInk, 0.92).fillPoints(points, true).lineStyle(3, PALETTE.oddboutAcid, 1).strokePoints(points, true, true);
    this.drawPortrait(c, frame.picture, face, L, px, py, pw, ph, grow);
    this.space.setLogicalPosition(c.flash, 0, 0);
    c.flash.clear();
    if (face.flash) c.flash.fillStyle(PALETTE.white, 0.85).fillPoints(points, true);
    // Name, number and bar, from the panel's inner edge (the wide row) or under the panel (the phone's stack).
    const anchorX = right ? W - L.textInset : L.textInset;
    const nameLabel = frame.name;
    if (c.name.text !== nameLabel) c.name.setText(nameLabel);
    const nameSize = `${Math.round(L.name)}px`;
    if (c.name.style.fontSize !== nameSize) c.name.setFontSize(nameSize);
    c.name.setVisible(true);
    this.space.setLogicalPosition(c.name, anchorX, L.nameTop);
    const hpLabel = arenaFaceHpLabel(frame.hp), tone = TONE_COLOR[face.tone];
    if (c.number.text !== hpLabel) c.number.setText(hpLabel);
    const pop = 1 + ARENA_FACE_HUD.pop.scale * face.pop;
    syncLettering(c.number, L.num, face.flash ? { y: 0, color: cssHex(tone), blur: 22 } : { y: 3, color: cssHex(PALETTE.oddboutInk), blur: 0 });
    syncTextStyle(c.number, { color: cssHex(face.flash ? PALETTE.white : tone) });
    c.number.setVisible(true).setOrigin(right ? 1 : 0, 0.9).setScale(pop * (1 + 0.04 * face.pop), pop * (1 - 0.03 * face.pop));
    this.space.setLogicalPosition(c.number, anchorX + shake * 0.6, L.numTop + L.num * 0.9);
    // The viewer's own corner: a short lime dash over his name.
    if (frame.mine) c.panel.fillStyle(PALETTE.oddboutAcid, 1).fillRect(right ? anchorX - 18 : anchorX, L.nameTop - 10, 18, 3);
    // The bar: full at its outer end, the bite's white chunk behind the fill (the village bar's drain), his shift lines over it.
    const hp = Math.max(0, frame.hp), max = Math.max(1e-6, frame.maxHp);
    for (const [index, age] of c.lineFlash) { if (age + dt >= 700) c.lineFlash.delete(index); else c.lineFlash.set(index, age + dt); }
    if (c.drain) for (const index of nativeCityFightBarLinesCrossed(c.drain.hp, hp, max, frame.lines)) c.lineFlash.set(index, 0);
    c.drain = stepNativeCityFightBarDrain(c.drain ?? createNativeCityFightBarDrain(hp), hp, dt);
    const bx = right ? anchorX - L.bar : anchorX, by = L.barTop, bw = L.bar, bh = L.barH;
    const at = (share: number) => right ? bx + bw * (1 - share) : bx + bw * share;
    const span = (a: number, b: number): [number, number] => right ? [at(b), bw * (b - a)] : [at(a), bw * (b - a)];
    const fill = Math.max(0, Math.min(1, c.drain.hp / max)), white = Math.max(fill, Math.min(1, c.drain.white / max));
    this.space.setLogicalPosition(c.bar, 0, 0);
    const g = c.bar.clear();
    g.fillStyle(PALETTE.oddboutInk, 0.6).fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    g.fillStyle(PALETTE.white, 0.14).fillRect(bx, by, bw, bh);
    if (white > fill) { const [x, w] = span(fill, white); g.fillStyle(PALETTE.white, nativeCityFightBarFlash(c.drain) ? 1 : 0.7).fillRect(x, by, w, bh); }
    if (fill > 0) { const [x, w] = span(0, fill); g.fillStyle(tone, 1).fillRect(x, by, w, bh); }
    frame.lines.forEach((share, index) => {
      const x = Math.round(at(Math.max(0, Math.min(1, share)))) - 1, passed = fill <= share + 1e-9, lit = c.lineFlash.has(index);
      g.fillStyle(lit ? PALETTE.white : PALETTE.pearl, passed && !lit ? 0.45 : 1).fillRect(x, by - 2, 2, bh + 4);
    });
    // His super meter: a thin line from the bar's outer end, acid as it fills; full, it breathes and (his own) shows the super's key.
    const meter = frame.meter;
    if (meter !== null) {
      const mw = bw * ARENA_FACE_METER.share, mx = right ? bx + bw - mw : bx, my = by + bh + ARENA_FACE_METER.gapPx, share = Math.max(0, Math.min(1, meter));
      const full = share >= 1 - 1e-9, breathe = full && !reduced ? 0.7 + 0.3 * Math.sin(this.clockMs * ARENA_FACE_METER.breatheRadPerMs) : 1;
      g.fillStyle(PALETTE.oddboutInk, 0.6).fillRect(mx - 1, my - 1, mw + 2, ARENA_FACE_METER.heightPx + 2);
      g.fillStyle(PALETTE.white, 0.14).fillRect(mx, my, mw, ARENA_FACE_METER.heightPx);
      g.fillStyle(PALETTE.oddboutAcid, full ? breathe : 0.75).fillRect(right ? mx + mw * (1 - share) : mx, my, mw * share, ARENA_FACE_METER.heightPx);
      const key = full ? frame.meterKey : null;
      if (key) {
        if (c.key.text !== key) c.key.setText(key);
        const keySize = `${Math.round(ARENA_FACE_METER.keyPx)}px`;
        if (c.key.style.fontSize !== keySize) c.key.setFontSize(keySize);
        this.space.setLogicalPosition(c.key, right ? mx - 6 : mx + mw + 6, my + ARENA_FACE_METER.heightPx / 2);
      }
      c.key.setVisible(key !== null);
    } else c.key.setVisible(false);
    c.icons?.update(dt, frame.statuses, anchorX, arenaFaceIconsTop(L), right ? "right" : "left", this.alpha, reduced);
  }

  /** The portrait standing on the panel's bottom, rising over its top: the expression's cell, or the card's face square. */
  private drawPortrait(c: Corner, picture: ArenaFacePicture, face: ArenaFaceCorner, L: ArenaFaceHudLayout,
    px: number, py: number, pw: number, ph: number, grow: number): void {
    const right = c.side === 1;
    if (picture?.kind === "portrait") { this.drawDialoguePortrait(c, picture.portrait, px, py, pw, ph, grow); return; }
    const key = picture === null ? "" : picture.kind === "sheet" ? picture.sheet.key : picture.art.key;
    if (key === "" || artTextureKey(this.scene, key, "decorative") === null) { c.portrait.setVisible(false); c.pictureKey = ""; return; }
    if (picture!.kind === "sheet") {
      if (!defineArenaFaceFrames(this.scene, picture!.sheet)) { c.portrait.setVisible(false); return; }
      const frameName = `${key}:${face.expression}`;
      if (c.pictureKey !== frameName) { c.portrait.setTexture(key, face.expression).setCrop(); c.pictureKey = frameName; }
      const scale = L.face / c.portrait.frame.cutHeight;
      c.portrait.setOrigin(0.5, 1).setScale(scale * grow * (right ? -1 : 1), scale * grow);
    } else {
      const art = picture!.art, square = art.face;
      if (c.pictureKey !== key) { c.portrait.setTexture(key).setCrop(square.x, square.y, square.side, square.side); c.pictureKey = key; }
      // A card's square: inside the panel (no expressions to show over its top).
      const scale = Math.min(pw, ph) * 0.92 / square.side;
      c.portrait.setOrigin(0.5, 0.5).setScale(scale * grow * (right ? -1 : 1), scale * grow);
      const f = c.portrait.frame;
      const cx = px + pw / 2, cy = py + ph / 2;
      this.space.setLogicalPosition(c.portrait, cx - (square.x + square.side / 2 - f.cutWidth / 2) * scale * (right ? -1 : 1), cy - (square.y + square.side / 2 - f.cutHeight / 2) * scale);
      c.portrait.setVisible(true);
      return;
    }
    const x = right ? px + pw - L.face / 2 + L.faceOut : px + L.face / 2 - L.faceOut;
    this.space.setLogicalPosition(c.portrait, x, py + ph);
    c.portrait.setVisible(true);
  }

  /** A dialogue portrait's head inside the panel (a registered fighter): the top of his bust, facing the middle. */
  private drawDialoguePortrait(c: Corner, portrait: ConversationPortrait, px: number, py: number, pw: number, ph: number, grow: number): void {
    const key = `portrait:${portrait.key}:${String(portrait.frame ?? "")}`;
    if (c.pictureKey !== key) {
      c.pictureKey = applyConversationPortrait(this.scene, c.portrait, portrait, c.side === 1 ? "right" : "left") ? key : "";
    }
    if (c.pictureKey === "") { c.portrait.setVisible(false); return; }
    const f = c.portrait.frame, side = Math.min(f.cutWidth, f.cutHeight * 0.62), cropX = (f.cutWidth - side) / 2, cropY = f.cutHeight * 0.06;
    const scale = Math.min(pw, ph) * 0.92 / side;
    c.portrait.setCrop(cropX, cropY, side, side).setOrigin(0.5, 0.5).setScale(scale * grow, scale * grow).setVisible(true);
    this.space.setLogicalPosition(c.portrait, px + pw / 2 - (cropX + side / 2 - f.cutWidth / 2) * scale, py + ph / 2 - (cropY + side / 2 - f.cutHeight / 2) * scale);
  }

  destroy(): void {
    for (const corner of this.corners) corner.destroy();
    this.clock.destroy();
  }
}
