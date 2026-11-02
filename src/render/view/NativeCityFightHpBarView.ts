import type Phaser from "phaser";
import type { FixedCameraSpace } from "../FixedCameraSpace";
import { FIGHT_STATUS_DEPTH_LIFT, VILLAGE_DEPTHS } from "../depths";
import { cssHex, FONT, PALETTE, TYPE } from "../art/palette";
import { createNativeCityFightBarDrain, FIGHT_BAR_THUMB, nativeCityFightBarFlash, nativeCityFightBarLayout, nativeCityFightBarLinesCrossed,
  nativeCityFightBarShakePx, stepNativeCityFightBarDrain, type NativeCityFightBarDrain, type NativeCityFightBarLayout } from "../effects/NativeCityFightHpBar";
import { NATIVE_CITY_COMBAT } from "../../sim/cityFight/NativeCityCombatTuning";
import type { CityFightFoeStatus, CityFightPlayerStatus } from "../../sim/cityFight/CityFightStatus";
import type { ConversationPortrait } from "../../app/ConversationPanel";
import { artTextureKey } from "../art/ArtFallback";
import { applyConversationPortrait } from "../hud/PortraitImage";
import { FightStatusIconRow } from "./FightStatusIconRow";


type BarStatus = CityFightFoeStatus | CityFightPlayerStatus;

/** A picture with its face square (texture px) for the thumbnail — the arena's card pictures (`ArenaConceptArt`). */
export interface FightBarFace {
  readonly key: string;
  readonly face: { readonly x: number; readonly y: number; readonly side: number };
}

/** One frame of the bar: whose HP, and whether the 1:1 fight is on (it fades in / out). */
export interface NativeCityFightHpBarFrame<S extends BarStatus = CityFightFoeStatus> {
  readonly shown: boolean;
  readonly hp: number;
  readonly maxHp: number;
  /** Whose HP it is: his name, over the bar. */
  readonly name: string;
  /**
   * His shift lines (`kuma.phases`: HP shares where his later shifts begin): drawn pearl over the bar instead of the quarter marks, and the
   * one his HP just crossed flashes white. Absent / empty: the `segments` marks. (Pearl since 2026-10-19 신호 정리 — gold means only the gold
   * grade. The frame no longer turns iron under his armour either: the steel rim on his body says it.)
   */
  readonly lines?: readonly number[];
  /** The bar split into this many equal parts by its tick marks (Otto: one per scoring hit). Absent: `feel.fightBar.ticks`. */
  readonly segments?: number;
  readonly reducedMotion: boolean;

  readonly statuses?: readonly S[];
  /**
   * His face: the thumbnail beside the bar's full end — pressing it opens his card (`actions.card`). `portrait` (`conversationParticipant`,
   * the village) or `face` (a square of his arena card picture); absent / null / not loaded: no thumbnail.
   */
  readonly portrait?: ConversationPortrait | null;
  readonly face?: FightBarFace | null;
  /** An arena-owned placement. Omitted in the village, which keeps its centred bar. */
  readonly layout?: NativeCityFightBarLayout;
  /** His name over the bar's middle (the village) or over its full, outer end (the arena's pair of bars). */
  readonly nameAlign?: "center" | "outer";
  readonly nameMaxHeight?: number;
}

/**
 * What a press on the bar's icons and thumbnail opens (the scene's status card), and the icons' names for the hover label. `card` absent:
 * the thumbnail is only a picture.
 */
export interface NativeCityFightHpBarActions<S extends BarStatus = CityFightFoeStatus> {
  readonly statusName: (status: S) => string;
  readonly status: (status: S) => void;
  readonly card?: () => void;
}

/** The thumbnail's side and its gap to the bar (logical px). */
const THUMB_PX = FIGHT_BAR_THUMB.px;
const THUMB_GAP_PX = FIGHT_BAR_THUMB.gapPx;

/** How long a crossed shift line flashes (screen ms). */
const LINE_FLASH_MS = 700;

/** The gap between his name and the bar (px). */
const NAME_GAP_PX = 3;

/** The fixed-camera space the bar draws in (the scene's UI space). */
export type NativeCityFightHpBarSpace = Pick<FixedCameraSpace, "add" | "setLogicalPosition" | "width" | "height">;

/**
 * 1:1 싸움 상대의 큰 HP 막대(2026-10-10 3단계): 2026-10-17 부터 화면 위 한가운데, 그 위에 상대 이름(쿠마·유메·오토가 같은 막대 —
 * 사용자: "오토는 HP가 보이고, 쿠마는 HP가 없거든. HP를 중앙 상단에"). 왼쪽 끝이 차 있고 오른쪽부터 줄어든다. 2026-10-16 에는 오른쪽 위
 * 거울 막대였는데 이름이 없고 레터박스 띠 가장자리에 걸쳐 그의 HP 로 읽히지 않았다. 그 전에는 아래 레터박스 띠 한가운데였다. 버건디 채움이 맞자마자 떨어지고, 깎인 몫이
 * 흰 덩어리로 머물렀다가 따라 빠진다(`NativeCityFightHpBar`). 4분할 눈금(근무가 있는 쿠마는 근무 경계 진주빛 선 — 넘는 순간 흰빛),
 * 맞으면 짧게 흔들림(모션 감소면 없음). 2026-10-19 신호 정리부터 갑옷 중 쇠빛 테는 없다(몸의 강철 테두리가 말한다).
 * 씬이 UI 공간(`FixedCameraSpace`)과 함께 하나 만들고 매 프레임 `update` 한다 — 싸움이 아니면 사라진다.
 * 무투장은 2026-10-23부터 이 막대가 아니라 얼굴 HUD(`ArenaFaceHud`)를 쓴다. 이 막대의 `layout`·`nameAlign`·`face` 자리는 그 전 무투장의 것이다.
 */
export class NativeCityFightHpBarView<S extends BarStatus = CityFightFoeStatus> {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private drain: NativeCityFightBarDrain | null = null;
  private alpha = 0;
  /** Screen ms since each shift line was crossed (its flash), by line index. */
  private readonly lineFlash = new Map<number, number>();
  private readonly icons: FightStatusIconRow<S> | null;
  private readonly thumb: Phaser.GameObjects.Image;
  private thumbKey = "";

  /** `hover`: the icons' hover name tip and hand cursor (`FightStatusIconRow`) — off in the village fight, on in the arena. */
  constructor(private readonly scene: Phaser.Scene, private readonly space: NativeCityFightHpBarSpace, depth = VILLAGE_DEPTHS.fightStageBars + 0.5,
    actions: NativeCityFightHpBarActions<S> | null = null, hover = false) {
    this.graphics = space.add(scene.add.graphics().setDepth(depth).setName("native-city-fight-hp-bar"));
    this.label = space.add(scene.add.text(0, 0, "", { fontFamily: FONT.hudSans, fontSize: TYPE.body, fontStyle: "bold",
      color: cssHex(PALETTE.white), stroke: cssHex(PALETTE.webtoonInk), strokeThickness: 3 })
      .setOrigin(0.5, 1).setDepth(depth).setName("native-city-fight-hp-name").setVisible(false));
    this.icons = actions ? new FightStatusIconRow<S>(scene, space, depth + FIGHT_STATUS_DEPTH_LIFT.icons, actions.statusName, actions.status, "native-city-fight-status", hover) : null;
    this.thumb = space.add(scene.add.image(0, 0, "__DEFAULT").setOrigin(0.5).setDepth(depth + FIGHT_STATUS_DEPTH_LIFT.thumb).setVisible(false)
      .setName("native-city-fight-thumb"));
    // No hover in the village fight (no hand cursor, so no brass corners either — `FightStatusIconRow`'s `hover`); the press still opens the card.
    const card = actions?.card;
    if (card) this.thumb.setInteractive().on("pointerdown",
      (_p: unknown, _x: number, _y: number, event: Phaser.Types.Input.EventData) => { event.stopPropagation(); card(); });
  }

  /** The status icons drawn now (for tests and the scene's snapshot). */
  get statuses(): readonly S[] { return this.icons?.statuses ?? []; }

  /** The thumbnail's picture as shown now (its texture key and frame, or `face:<key>`; "" while none shows): for tests and the E2E. */
  get thumbnail(): string { return this.thumb.visible ? this.thumbKey : ""; }

  /** His name over the bar as shown now ("" while hidden): for tests. */
  get name(): string { return this.label.visible ? this.label.text : ""; }

  /** The drain the bar shows (null while hidden): for tests and the scene's snapshot. */
  get state(): NativeCityFightBarDrain | null { return this.drain; }

  /** One frame (screen ms). */
  update(dtMs: number, frame: NativeCityFightHpBarFrame<S>): void {
    const t = NATIVE_CITY_COMBAT.feel.fightBar, dt = Number.isFinite(dtMs) ? Math.max(0, Math.min(100, dtMs)) : 0;
    const step = frame.reducedMotion ? 1 : dt / Math.max(1, t.fadeMs);
    this.alpha = frame.shown ? Math.min(1, this.alpha + step) : Math.max(0, this.alpha - step);
    const g = this.graphics.clear();
    if (this.alpha <= 0) {
      this.drain = null; g.setVisible(false); this.label.setVisible(false); this.thumb.setVisible(false);
      this.icons?.update(dt, [], 0, 0, "left", 0, frame.reducedMotion);
      return;
    }
    // A fight's first frame starts full of what he has (a rematch's refill snaps up — the drain never runs upward).
    const hp = Math.max(0, frame.hp), lines = frame.lines ?? [];
    for (const [index, age] of this.lineFlash) {
      if (age + dt >= LINE_FLASH_MS) this.lineFlash.delete(index); else this.lineFlash.set(index, age + dt);
    }
    if (this.drain) for (const index of nativeCityFightBarLinesCrossed(this.drain.hp, hp, frame.maxHp, lines)) this.lineFlash.set(index, 0);
    this.drain = stepNativeCityFightBarDrain(this.drain ?? createNativeCityFightBarDrain(hp), hp, dt);
    this.space.setLogicalPosition(g, 0, 0);
    g.setVisible(true).setAlpha(this.alpha);
    const layout = frame.layout ?? nativeCityFightBarLayout(this.space.width, this.space.height, t, frame.segments), max = Math.max(1e-6, frame.maxHp);
    const left = layout.left + nativeCityFightBarShakePx(this.drain, frame.reducedMotion), { top, width, height } = layout;
    if (this.label.text !== frame.name) this.label.setText(frame.name);
    if (frame.layout) {
      if (this.label.style.wordWrapWidth !== layout.width) this.label.setWordWrapWidth(layout.width, true);
      this.label.setScale(Math.min(1, (frame.nameMaxHeight ?? Number.POSITIVE_INFINITY) / Math.max(1, this.label.height)));
    }
    // The bar's full end: its left, or its right when mirrored (the arena's right corner). Its face and statuses stand there.
    const outer = frame.nameAlign === "outer", right = layout.mirror;
    // The village never asks: its label keeps the centre origin it was made with.
    if (frame.nameAlign !== undefined) {
      const align = outer ? (right ? "right" : "left") : "center";
      this.label.setOrigin(outer ? (right ? 1 : 0) : 0.5, 1);
      // `setAlign` redraws and re-uploads the text even when unchanged (2026-10-20 review): only on a change.
      if (this.label.style.align !== align) this.label.setAlign(align);
    }
    this.space.setLogicalPosition(this.label, outer ? (right ? left + width : left) : left + width / 2, top - NAME_GAP_PX);
    this.label.setVisible(frame.name !== "").setAlpha(this.alpha);
    // His face beside the bar's full end (centred on the name and bar together), his statuses under the bar from that end.
    const thumbX = right ? layout.left + width + THUMB_GAP_PX + THUMB_PX / 2 : layout.left - THUMB_GAP_PX - THUMB_PX / 2, thumbY = top + height / 2 - 8;
    this.drawThumb(frame.portrait ?? null, frame.face ?? null, thumbX, thumbY);
    this.icons?.update(dt, frame.statuses ?? [], right ? layout.left + width : layout.left, top + height + 7, right ? "right" : "left", this.alpha,
      frame.reducedMotion);
    if (this.thumb.visible) {
      // The thumbnail's frame: pure white inside a navy 1 px line (the HUD's flat words), no plate.
      const tx = thumbX - THUMB_PX / 2, ty = thumbY - THUMB_PX / 2;
      g.fillStyle(PALETTE.navyInk, 1).fillRect(tx - 3, ty - 3, THUMB_PX + 6, THUMB_PX + 6);
      g.fillStyle(PALETTE.white, 1).fillRect(tx - 2, ty - 2, THUMB_PX + 4, THUMB_PX + 4);
      g.fillStyle(PALETTE.navyInk, 1).fillRect(tx, ty, THUMB_PX, THUMB_PX);
    }
    const fill = Math.max(0, Math.min(1, this.drain.hp / max)), white = Math.max(fill, Math.min(1, this.drain.white / max));
    // 신호 정리: the iron frame was one more channel of the same tell — the steel rim on his body is it).
    g.fillStyle(PALETTE.paper, 0.85).fillRect(left - 3, top - 3, width + 6, height + 6);
    g.fillStyle(PALETTE.webtoonInk, 1).fillRect(left - 2, top - 2, width + 4, height + 4);
    g.fillStyle(PALETTE.navyInk, 1).fillRect(left, top, width, height);
    // Shares of the bar [a, b] on screen: from the left, or from the outer (right) end when mirrored.
    const at = (share: number) => layout.mirror ? left + width * (1 - share) : left + width * share;
    const span = (a: number, b: number): [number, number] => layout.mirror ? [at(b), width * (b - a)] : [at(a), width * (b - a)];
    // The white chunk (the bite just taken): pure white right after the blow, ivory while it waits and drains.
    if (white > fill) {
      const [x, w] = span(fill, white);
      g.fillStyle(nativeCityFightBarFlash(this.drain) ? PALETTE.white : PALETTE.paper, 1).fillRect(x, top, w, height);
    }
    if (fill > 0) {
      const [x, w] = span(0, fill);
      g.fillStyle(PALETTE.burgundyInk, 1).fillRect(x, top, w, height);
      // A thin warm highlight along its top edge (the bar reads as a bar on the ink band, not a hole).
      g.fillStyle(PALETTE.hotGold, 0.35).fillRect(x, top, w, Math.max(1, Math.round(height * 0.18)));
    }
    if (lines.length > 0) {
      // His shift lines (2026-10-15 3단계 근무): pearl ahead of him (gold until 2026-10-19 신호 정리 — gold is the gold grade's only), dim
      // once passed, white for a moment as he crosses one.
      lines.forEach((share, index) => {
        const x = Math.round(at(Math.max(0, Math.min(1, share)))) - 1, passed = fill <= share + 1e-9;
        g.fillStyle(PALETTE.webtoonInk, 1).fillRect(x - 1, top - 3, 4, height + 6);
        g.fillStyle(this.lineFlash.has(index) ? PALETTE.white : PALETTE.pearl, passed && !this.lineFlash.has(index) ? 0.45 : 1).fillRect(x, top - 2, 2, height + 4);
      });
      return;
    }
    // The marks over everything: KUMA's 48 HP reads in quarters, Otto's in his scoring hits.
    g.fillStyle(PALETTE.webtoonInk, 0.7);
    for (const x of layout.ticks) g.fillRect(Math.round(x + left - layout.left), top, 1, height);
  }

  /**
   * His face cropped square into the thumbnail centred at (`x`, `y`): a portrait's top of the bust, or a picture's given square (`face`);
   * hidden without one (or until its picture is in).
   */
  private drawThumb(portrait: ConversationPortrait | null, face: FightBarFace | null, x: number, y: number): void {
    const key = portrait ? `${portrait.key}:${String(portrait.frame ?? "")}` : face ? `face:${face.key}` : "";
    if (key !== this.thumbKey) {
      this.thumbKey = key;
      if (portrait) { if (!applyConversationPortrait(this.scene, this.thumb, portrait, "right")) this.thumbKey = ""; }
      else if (face && artTextureKey(this.scene, face.key, "decorative") !== null) this.thumb.setTexture(face.key).setFlipX(false);
      else this.thumbKey = "";
    }
    if (this.thumbKey === "") { this.thumb.setVisible(false); return; }
    const f = this.thumb.frame, square = portrait === null ? face?.face ?? null : null;
    const side = square ? square.side : Math.min(f.cutWidth, f.cutHeight * 0.62);
    const cropX = square ? square.x : (f.cutWidth - side) / 2, cropY = square ? square.y : f.cutHeight * 0.06;
    const scale = THUMB_PX / side;
    // The crop keeps the image's origin at its whole frame's centre: shift so the cropped square's centre lands on (x, y).
    this.thumb.setCrop(cropX, cropY, side, side).setScale(scale).setVisible(true).setAlpha(this.alpha);
    // Its press answers on the square only (2026-10-20 review: a whole 600 px card picture's hit area reached far below the bar).
    const input = this.thumb.input;
    if (input) { (input.hitArea as Phaser.Geom.Rectangle).setTo(cropX, cropY, side, side); input.customHitArea = true; }
    this.space.setLogicalPosition(this.thumb, x - (cropX + side / 2 - f.cutWidth / 2) * scale, y - (cropY + side / 2 - f.cutHeight / 2) * scale);
  }

  destroy(): void { this.graphics.destroy(); this.label.destroy(); this.thumb.destroy(); this.icons?.destroy(); }
}
