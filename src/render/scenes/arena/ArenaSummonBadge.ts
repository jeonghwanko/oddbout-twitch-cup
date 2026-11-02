import type Phaser from "phaser";
import { artTextureKey } from "../../art/ArtFallback";
import { FIGHT_STATUS_DEPTH_LIFT } from "../../depths";
import { FIGHT_STATUS_ICON_PX } from "../../view/FightStatusIconRow";
import type { ArenaScreenSpace } from "./ArenaHudSpace";
import { nativeCitySummonArt } from "../../../assets/NativeCitySummonArtCatalog";
import type { CityFightSummonKind } from "../../../sim/cityFight/CityFightSummonTuning";

/** The badge's box (logical px): as tall as a status icon, wider for a side-on object. */
const BADGE_W = 46;
const GAP_PX = 4;

/**
 * 무투장 AI 대결의 소환물 배지(2026-10-22 사용자: "어떤 효과가 발동중인데 아이콘 표시를 해줘"): 그의 소환물(차·종이학·번개…)이 무대에 나와 있는
 * 동안, 체력바 아래 상태 아이콘 줄 끝에 그 소환물의 원화 한 칸을 작게 세운다(상시 UI 라 바탕 없이 그림만). 누르면 `onPress` — 그 기술의 한 줄.
 * 규칙 상태(`kumaFightStatuses`)가 아니라 무대에 나온 물체라 아틀라스 아이콘이 아닌 소환물 자체의 그림이다.
 */
export class ArenaSummonBadge {
  private readonly image: Phaser.GameObjects.Image;
  private kind: CityFightSummonKind | null = null;
  private drawn = "";
  private ageMs = 0;
  /** The drawn object's box in its cell: its centre off the cell's centre and its size (texture px). */
  private crop = { x: 0, y: 0, width: 1, height: 1 };

  constructor(private readonly scene: Phaser.Scene, private readonly space: ArenaScreenSpace, depth: number, name: string,
    onPress: (kind: CityFightSummonKind) => void) {
    this.image = space.add(scene.add.image(0, 0, "__DEFAULT").setOrigin(0.5).setDepth(depth + FIGHT_STATUS_DEPTH_LIFT.icons).setVisible(false)
      .setName(name).setInteractive({ useHandCursor: true }));
    this.image.on("pointerdown", (_p: unknown, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      if (this.kind) onPress(this.kind);
    });
  }

  /** The summon drawn now (null while none): for tests and the scene's snapshot. */
  get shown(): CityFightSummonKind | null { return this.image.visible ? this.kind : null; }

  /**
   * One frame: `kind` cast by `casterId` out on the stage (null: none), after `icons` status icons of the row starting at (`x`, `y`) — its
   * outer end (`mirror`: the right corner, the row runs leftward and the object faces in).
   */
  update(dtMs: number, kind: CityFightSummonKind | null, casterId: string, icons: number, x: number, y: number, mirror: boolean, reducedMotion: boolean): void {
    const art = kind ? nativeCitySummonArt(kind, casterId) : null;
    if (!kind || !art || artTextureKey(this.scene, art.key, "decorative") === null) {
      this.kind = null; this.drawn = ""; this.image.setVisible(false); return;
    }
    const frame = art.travel[0] ?? art.phases?.travel?.frames[0] ?? art.phases?.active?.frames[0] ?? art.tell[0] ?? 0;
    const signature = `${art.key}:${frame}`;
    if (signature !== this.drawn || kind !== this.kind) {
      this.drawn = signature; this.kind = kind; this.ageMs = 0;
      this.image.setTexture(art.key, frame);
      // The cell is mostly empty round the object (2026-10-22 check: the roadster drew ~30 × 8 px): crop to its drawn pixels.
      const f = this.image.frame, box = drawnBounds(this.image);
      this.image.setCrop(box.x, box.y, box.width, box.height);
      this.crop = { x: box.x + box.width / 2 - f.cutWidth / 2, y: box.y + box.height / 2 - f.cutHeight / 2, width: box.width, height: box.height };
      const input = this.image.input;
      if (input) { (input.hitArea as Phaser.Geom.Rectangle).setTo(box.x, box.y, box.width, box.height); input.customHitArea = true; }
    } else this.ageMs += dtMs;
    // Just out: the status icons' short pop (1.35 → 1 over 180 ms).
    const pop = reducedMotion ? 1 : 1 + 0.35 * Math.max(0, 1 - this.ageMs / 180);
    const crop = this.crop, scale = Math.min(BADGE_W / crop.width, FIGHT_STATUS_ICON_PX / crop.height) * pop;
    const offset = icons * (FIGHT_STATUS_ICON_PX + GAP_PX) + BADGE_W / 2;
    this.image.setScale(scale).setFlipX(mirror).setVisible(true);
    // The crop keeps the origin at the whole cell's centre: shift so the cropped object's centre lands on the badge's (mirrored when flipped).
    const cx = mirror ? x - offset : x + offset;
    this.space.setLogicalPosition(this.image, cx - (mirror ? -crop.x : crop.x) * scale, y + FIGHT_STATUS_ICON_PX / 2 - crop.y * scale);
  }

  destroy(): void { this.image.destroy(); }
}

/** Each sheet cell's drawn box (`key:frame`), read once. */
const BOUNDS = new Map<string, { x: number; y: number; width: number; height: number }>();

/** The box of `image`'s frame holding its visible pixels (alpha > 24), in frame px; the whole frame when its pixels cannot be read. */
function drawnBounds(image: Phaser.GameObjects.Image): { x: number; y: number; width: number; height: number } {
  const f = image.frame, key = `${image.texture.key}:${String(f.name)}`, whole = { x: 0, y: 0, width: f.cutWidth, height: f.cutHeight };
  const known = BOUNDS.get(key);
  if (known) return known;
  let box = whole;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = f.cutWidth; canvas.height = f.cutHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const source = f.source.image as HTMLImageElement | HTMLCanvasElement | undefined;
    if (ctx && source) {
      // The image may be a mobile copy smaller than the sheet (`ArenaMobileArt`): cut in its own pixels.
      const ratio = (source.width || f.source.width) / f.source.width;
      ctx.drawImage(source, f.cutX * ratio, f.cutY * ratio, f.cutWidth * ratio, f.cutHeight * ratio, 0, 0, f.cutWidth, f.cutHeight);
      const data = ctx.getImageData(0, 0, f.cutWidth, f.cutHeight).data;
      let x0 = f.cutWidth, y0 = f.cutHeight, x1 = -1, y1 = -1;
      for (let y = 0; y < f.cutHeight; y++) for (let x = 0; x < f.cutWidth; x++) {
        if (data[(y * f.cutWidth + x) * 4 + 3]! > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      if (x1 >= x0 && y1 >= y0) box = { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
    }
  } catch { box = whole; }
  BOUNDS.set(key, box);
  return box;
}
