import Phaser from "phaser";
import { cssHex, FONT, PALETTE } from "../../art/palette";
import { artTextureKey } from "../../art/ArtFallback";
import { applyConversationPortrait } from "../../hud/PortraitImage";
import { easeOutBackWith, easeOutCubic } from "../../art/easing";
import type { ArenaScreenSpace } from "./ArenaHudSpace";
import { defineArenaFaceFrames, type ArenaFacePicture } from "./ArenaFaceHud";

export interface ArenaKoCutInSpec {
  /** The winner's corner (0 left, 1 right): his portrait faces as his HUD corner does. */
  readonly winner: 0 | 1;
  readonly name: string;
  readonly winnerPicture: ArenaFacePicture;
  readonly loserPicture: ArenaFacePicture;
}

/** The cut-in's beats (screen ms from its start): each part's start and how long it takes to settle. */
export const ARENA_KO_CUT_IN = Object.freeze({
  slab: Object.freeze({ at: 0, ms: 230 }),
  portrait: Object.freeze({ at: 50, ms: 270, fromPx: 160 }),
  mark: Object.freeze({ at: 70, ms: 230, fromScale: 1.25 }),
  name: Object.freeze({ at: 130, ms: 230, fromPx: 60 }),
  sticker: Object.freeze({ at: 170, ms: 230, tiltDeg: -10, outlinePx: 4 }),
  dim: 0.62,
  /** Reduced motion: everything fades in together over this. */
  fadeMs: 150,
});

/** The place of each part (HUD px) on a `width` × `height` screen: the wide row, or the phone's stack. */
function cutInLayout(width: number, height: number) {
  if (width < 640) {
    const s = Math.max(0.8, Math.min(1.25, width / 430));
    return { slabTop: 102 * s, slabW: width * 0.93, slabH: 260 * s, big: 330 * s, bigX: -6 * s, bigTop: 32 * s, whoX: 22 * s, whoTop: 384 * s, who: 64 * s,
      markX: width - 254 * s, markTop: 452 * s, mark: 170 * s, lo: 150 * s, loX: width - 180 * s, loTop: 612 * s, recordsW: width - 44 * s };
  }
  const s = Math.max(0.55, Math.min(1.15, Math.min(width / 1600, height / 852)));
  return { slabTop: 252 * s, slabW: 820 * s, slabH: 360 * s, big: 560 * s, bigX: 50 * s, bigTop: 52 * s, whoX: width - 540 * s, whoTop: 382 * s, who: 110 * s,
    markX: width - 720 * s, markTop: 162 * s, mark: 340 * s, lo: 230 * s, loX: width - 350 * s, loTop: 552 * s, recordsW: 460 * s };
}


/**
 * 무투장 KO 컷인(2026-10-23, 시안 v5 — 사용자: "이거 좋다"): 승자 카드 대신 뜬다. 링이 어둡게 가라앉고, 라임 띠가 왼쪽에서 쓸려 들어오며 그
 * 위로 승자의 옆눈질 초상이 튀어 오르고(표정 시트 `sideeye`), 큰 외곽선 KO 와 승자 이름이 서고, 패자의 KO 얼굴(눈이 도는 표정)이 흰 테두리
 * 밈 스티커로 기울어 붙는다. 모션 줄이기면 한꺼번에 페이드로 선다. 판정승은 이 컷인이 아니라 승자 카드다.
 */
export class ArenaKoCutIn {
  private readonly dim: Phaser.GameObjects.Graphics;
  private readonly slab: Phaser.GameObjects.Graphics;
  private readonly portrait: Phaser.GameObjects.Image;
  private readonly mark: Phaser.GameObjects.Text;
  private readonly name: Phaser.GameObjects.Text;
  private readonly outline: Phaser.GameObjects.Image[] = [];
  private readonly sticker: Phaser.GameObjects.Image;
  private spec: ArenaKoCutInSpec | null = null;
  private ms = 0;
  private reduced = false;

  constructor(private readonly scene: Phaser.Scene, private readonly space: ArenaScreenSpace) {
    this.dim = space.add(scene.add.graphics().setName("arena-ko-dim").setVisible(false));
    this.slab = space.add(scene.add.graphics().setName("arena-ko-slab").setVisible(false));
    this.mark = space.add(scene.add.text(0, 0, "KO", { fontFamily: FONT.lettering, color: "rgba(0,0,0,0)", stroke: cssHex(PALETTE.oddboutAcid), strokeThickness: 3 })
      .setOrigin(0.5, 0.5).setName("arena-ko-mark").setVisible(false));
    this.portrait = space.add(scene.add.image(0, 0, "__DEFAULT").setOrigin(0.5, 1).setName("arena-ko-winner").setVisible(false));
    this.name = space.add(scene.add.text(0, 0, "", { fontFamily: FONT.hudSans, fontStyle: "bold", color: cssHex(PALETTE.oddboutAcid) })
      .setOrigin(0, 0).setShadow(0, 4, cssHex(PALETTE.oddboutInk), 0, false, true).setName("arena-ko-name").setVisible(false));
    for (let i = 0; i < 8; i++) this.outline.push(space.add(scene.add.image(0, 0, "__DEFAULT").setTintFill(PALETTE.white).setVisible(false).setName("arena-ko-sticker-edge")));
    this.sticker = space.add(scene.add.image(0, 0, "__DEFAULT").setName("arena-ko-loser").setVisible(false));
  }

  get shown(): boolean { return this.spec !== null; }

  /** Every part has come in (the sticker's beat over, or the reduced fade) — the screen's choices can stand under it. */
  get settled(): boolean {
    const T = ARENA_KO_CUT_IN;
    return this.spec !== null && this.ms >= (this.reduced ? T.fadeMs : T.sticker.at + T.sticker.ms);
  }

  show(spec: ArenaKoCutInSpec, reducedMotion: boolean): void {
    this.spec = spec; this.ms = 0; this.reduced = reducedMotion;
    this.name.setText(spec.name);
    // Each picture's face: an expression cell whole, or a square of a card picture or of a dialogue portrait's bust (kept as `square`).
    const face = (image: Phaser.GameObjects.Image, picture: ArenaFacePicture, expression: "sideeye" | "ko"): boolean => {
      image.setData("square", null);
      if (picture === null) return false;
      if (picture.kind === "portrait") {
        if (!applyConversationPortrait(this.scene, image, picture.portrait, null)) return false;
        const f = image.frame, side = Math.min(f.cutWidth, f.cutHeight * 0.62), sq = { x: (f.cutWidth - side) / 2, y: f.cutHeight * 0.06, side };
        image.setFlipX(false).setCrop(sq.x, sq.y, sq.side, sq.side).setData("square", sq);
        return true;
      }
      const key = picture.kind === "sheet" ? picture.sheet.key : picture.art.key;
      if (artTextureKey(this.scene, key, "decorative") === null) return false;
      if (picture.kind === "sheet") { if (!defineArenaFaceFrames(this.scene, picture.sheet)) return false; image.setTexture(key, expression).setCrop(); }
      else { const sq = picture.art.face; image.setTexture(key).setCrop(sq.x, sq.y, sq.side, sq.side).setData("square", sq); }
      return true;
    };
    this.portrait.setData("ok", face(this.portrait, spec.winnerPicture, "sideeye"));
    const loser = face(this.sticker, spec.loserPicture, "ko");
    this.sticker.setData("ok", loser);
    for (const edge of this.outline) { if (loser) edge.setTexture(this.sticker.texture.key, this.sticker.frame.name); edge.setData("ok", loser); }
    const loserSquare = this.sticker.getData("square") as { x: number; y: number; side: number } | null;
    for (const edge of this.outline) { if (loserSquare) edge.setCrop(loserSquare.x, loserSquare.y, loserSquare.side, loserSquare.side); else edge.setCrop(); }
  }

  hide(): void {
    this.spec = null;
    for (const object of this.objects()) object.setVisible(false);
  }

  /** Where the records line stands: under the winner's name (HUD px). */
  recordsAnchor(): { readonly x: number; readonly y: number; readonly width: number; readonly shown: boolean } {
    const L = cutInLayout(this.space.width, this.space.height), width = Math.min(L.recordsW, this.space.width - 24);
    // The records line is centred: under the name, kept on the screen.
    const x = Math.max(12 + width / 2, Math.min(this.space.width - 12 - width / 2, L.whoX + this.name.displayWidth / 2));
    return { x, y: L.whoTop + L.who * 1.08, width, shown: this.spec !== null };
  }

  update(dtMs: number): void {
    const spec = this.spec;
    if (!spec) return;
    this.ms += Math.max(0, Math.min(100, Number.isFinite(dtMs) ? dtMs : 0));
    const T = ARENA_KO_CUT_IN, W = this.space.width, H = this.space.height, L = cutInLayout(W, H);
    const fade = this.reduced ? Math.min(1, this.ms / T.fadeMs) : 1;
    const part = (beat: { readonly at: number; readonly ms: number }) => this.reduced ? 1 : Math.max(0, Math.min(1, (this.ms - beat.at) / beat.ms));
    const slab = easeOutCubic(part(T.slab));
    // The ring sinks; the slab wipes in from the left, its outer edge slanted.
    this.space.setLogicalPosition(this.dim, 0, 0);
    this.dim.clear().fillStyle(PALETTE.oddboutInk, T.dim * slab * fade).fillRect(0, 0, W, H).setVisible(true);
    const sx = L.slabW * slab, slant = L.slabH * 0.39;
    this.space.setLogicalPosition(this.slab, 0, 0);
    this.slab.clear().fillStyle(PALETTE.oddboutAcid, fade).fillPoints([new Phaser.Math.Vector2(0, L.slabTop), new Phaser.Math.Vector2(sx, L.slabTop),
      new Phaser.Math.Vector2(Math.max(0, sx - slant), L.slabTop + L.slabH), new Phaser.Math.Vector2(0, L.slabTop + L.slabH)], true).setVisible(slab > 0);
    // The winner's side-eye, standing on the slab's bottom, sliding in with a little overshoot.
    const p = part(T.portrait), flip = spec.winner === 1 ? -1 : 1;
    if (this.portrait.getData("ok") === true && p > 0) {
      const f = this.portrait.frame, square = this.portrait.getData("square") as { x: number; y: number; side: number } | null, card = square !== null;
      const side = square ? square.side : f.cutHeight;
      const scale = L.big / side, x = L.bigX + L.big / 2 - (1 - easeOutBackWith(p, 1.6)) * T.portrait.fromPx;
      this.portrait.setOrigin(0.5, card ? 0.5 : 1).setScale(scale * flip, scale).setAlpha(fade).setVisible(true);
      if (card) {
        const sq = square;
        this.space.setLogicalPosition(this.portrait, x - (sq.x + sq.side / 2 - f.cutWidth / 2) * scale * flip, L.bigTop + L.big / 2 - (sq.y + sq.side / 2 - f.cutHeight / 2) * scale);
      } else this.space.setLogicalPosition(this.portrait, x, L.bigTop + L.big);
    } else this.portrait.setVisible(false);
    // The big outlined KO, settling from a little larger.
    const m = easeOutCubic(part(T.mark)), markSize = `${Math.round(L.mark)}px`;
    if (this.mark.style.fontSize !== markSize) this.mark.setFontSize(markSize);
    this.mark.setScale(T.mark.fromScale - (T.mark.fromScale - 1) * m).setAlpha(m * fade).setVisible(m > 0);
    const markLeft = Math.min(L.markX, W - 12 - this.mark.width);
    this.space.setLogicalPosition(this.mark, markLeft + this.mark.width / 2, L.markTop + this.mark.height / 2);
    // The winner's name.
    const n = easeOutCubic(part(T.name)), nameSize = `${Math.round(L.who)}px`;
    if (this.name.style.fontSize !== nameSize) this.name.setFontSize(nameSize);
    this.name.setAlpha(n * fade).setVisible(n > 0);
    this.space.setLogicalPosition(this.name, L.whoX - (1 - n) * T.name.fromPx, L.whoTop);
    // The loser's KO face as a white-edged sticker, tilted.
    const k = easeOutCubic(part(T.sticker)), ok = this.sticker.getData("ok") === true && k > 0;
    const loserFlip = spec.winner === 1 ? 1 : -1, sf = this.sticker.frame, loserSquare = this.sticker.getData("square") as { x: number; y: number; side: number } | null;
    const side = loserSquare ? loserSquare.side : sf.cutHeight, scale = L.lo / side;
    const cx = L.loX + L.lo / 2, cy = L.loTop + L.lo / 2, tilt = Phaser.Math.DegToRad(T.sticker.tiltDeg), edgePx = T.sticker.outlinePx;
    const centre = (image: Phaser.GameObjects.Image, dx: number, dy: number) => {
      const off = loserSquare;
      const ox = off ? (off.x + off.side / 2 - sf.cutWidth / 2) * scale * loserFlip : 0, oy = off ? (off.y + off.side / 2 - sf.cutHeight / 2) * scale : 0;
      image.setOrigin(0.5).setScale(scale * loserFlip * (0.85 + 0.15 * k), scale * (0.85 + 0.15 * k)).setRotation(tilt).setAlpha(k * fade).setVisible(ok);
      this.space.setLogicalPosition(image, cx - ox + dx, cy - oy + dy);
    };
    this.outline.forEach((edge, i) => { const a = (i / this.outline.length) * Math.PI * 2; centre(edge, Math.cos(a) * edgePx, Math.sin(a) * edgePx); });
    centre(this.sticker, 0, 0);
    if (ok) this.sticker.setTint(0xdadada);
  }

  private objects(): Phaser.GameObjects.Components.Visible[] {
    return [this.dim, this.slab, this.portrait, this.mark, this.name, ...this.outline, this.sticker];
  }

  destroy(): void {
    for (const object of [this.dim, this.slab, this.portrait, this.mark, this.name, ...this.outline, this.sticker]) object.destroy();
  }
}
