import type Phaser from "phaser";
import type { FixedCameraSpace } from "../FixedCameraSpace";
import { cssHex, FONT, PALETTE, TYPE } from "../art/palette";
import { artTextureKey } from "../art/ArtFallback";
import { FIGHT_STATUS_DEPTH_LIFT } from "../depths";
import { FIGHT_STATUS_ICON_ATLAS, fightStatusIcon, fightStatusIconCell, type FightStatusIcon } from "../../assets/FightStatusArtCatalog";
import type { CityFightFoeStatus, CityFightPlayerStatus } from "../../sim/cityFight/CityFightStatus";

type Status = CityFightFoeStatus | CityFightPlayerStatus;

/** The fixed-camera space the row draws in (the scene's UI space); its `width` keeps the name tip on screen. */
export type FightStatusIconSpace = Pick<FixedCameraSpace, "add" | "setLogicalPosition"> & { readonly width?: number };

/** The name tip's least gap to the space's sides (logical px). */
const TIP_EDGE_PX = 4;

/** Icon size and the gap between icons (logical px). */
export const FIGHT_STATUS_ICON_PX = 30;
const GAP_PX = 4;

/** The atlas cell of `icon` as a frame of the loaded atlas (added once; the atlas's default frame stays the whole sheet). */
export function fightStatusIconFrame(scene: Phaser.Scene, icon: FightStatusIcon): string | null {
  if (artTextureKey(scene, FIGHT_STATUS_ICON_ATLAS.key, "decorative") === null) return null;
  const texture = scene.textures.get(FIGHT_STATUS_ICON_ATLAS.key), name = `status-${icon}`;
  if (!texture.has(name)) {
    const first = texture.firstFrame, cell = fightStatusIconCell(icon);
    texture.add(name, 0, cell.x, cell.y, FIGHT_STATUS_ICON_ATLAS.frameWidth, FIGHT_STATUS_ICON_ATLAS.frameHeight);
    texture.firstFrame = first;
  }
  return name;
}

/**
 * 싸움 게이지 옆 상태 아이콘 한 줄(2026-10-18): 켜진 상태마다 아이콘 하나(`CityFightStatus` 순서), 가리키면 이름이 아래에 뜨고 누르면
 * `onPress`(설명 창). 상시 UI 라 바탕·그림자 없이 아이콘만 — 이름표만 남색 판. 아이콘이 켜지는 순간 짧게 커졌다 돌아온다.
 */
export class FightStatusIconRow<S extends Status = Status> {
  private readonly icons: Phaser.GameObjects.Image[] = [];
  private readonly ages: number[] = [];
  private shown: readonly S[] = [];
  private readonly tip: Phaser.GameObjects.Text;
  private hovered: S | null = null;

  /**
   * `hover` false: no hover at all — no hand cursor, no brass corners, no name tip; a press still opens the card. The village 1:1 fight
   * (2026-10-19 사용자: "마을 전투에서는 mouse over 이벤트를 막아줘").
   */
  constructor(private readonly scene: Phaser.Scene, private readonly space: FightStatusIconSpace, private readonly depth: number,
    private readonly name: (status: S) => string, private readonly onPress: (status: S) => void, private readonly prefix: string,
    private readonly hover = true) {
    this.tip = space.add(scene.add.text(0, 0, "", { fontFamily: FONT.hudSans, fontSize: TYPE.caption, fontStyle: "bold",
      color: cssHex(PALETTE.white), backgroundColor: cssHex(PALETTE.navyInk) }).setPadding(6, 3).setOrigin(0.5, 0)
      .setDepth(depth + FIGHT_STATUS_DEPTH_LIFT.tip).setVisible(false).setName(`${prefix}-tip`));
  }

  /** The statuses drawn now (for tests and the scene's snapshot). */
  get statuses(): readonly S[] { return this.shown; }

  /**
   * One frame: `lit` from (`x`, `y`) — the row's left end (`align` "left") or right end ("right") at the icons' top. `alpha`: the bar's fade.
   */
  update(dtMs: number, lit: readonly S[], x: number, y: number, align: "left" | "right", alpha: number, reducedMotion: boolean): void {
    const was = this.shown;
    this.shown = alpha > 0 ? lit : [];
    while (this.icons.length < this.shown.length) {
      const index = this.icons.length;
      const image = this.space.add(this.scene.add.image(0, 0, FIGHT_STATUS_ICON_ATLAS.key).setOrigin(0.5).setDepth(this.depth)
        .setName(`${this.prefix}-${index}`).setInteractive({ useHandCursor: this.hover }));
      if (this.hover) {
        image.on("pointerover", () => { this.hovered = this.shown[index] ?? null; });
        image.on("pointerout", () => { if (this.hovered === (this.shown[index] ?? null)) this.hovered = null; });
      }
      image.on("pointerdown", (_p: unknown, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        const status = this.shown[index];
        if (status) this.onPress(status);
      });
      this.icons.push(image); this.ages.push(0);
    }
    const n = this.shown.length, width = n * FIGHT_STATUS_ICON_PX + Math.max(0, n - 1) * GAP_PX;
    const left = align === "left" ? x : x - width;
    this.icons.forEach((image, i) => {
      const status = this.shown[i], frame = status ? fightStatusIconFrame(this.scene, fightStatusIcon(status)) : null;
      if (!status || !frame) { image.setVisible(false); this.ages[i] = 0; return; }
      if (!was.includes(status)) this.ages[i] = 0; else this.ages[i] = (this.ages[i] ?? 0) + dtMs;
      if (image.frame.name !== frame) image.setFrame(frame);
      // Just lit: a short pop (1.35 → 1 over 180 ms) so a rule turning on is seen.
      const pop = reducedMotion ? 1 : 1 + 0.35 * Math.max(0, 1 - (this.ages[i] ?? 0) / 180);
      image.setVisible(true).setAlpha(alpha).setDisplaySize(FIGHT_STATUS_ICON_PX * pop, FIGHT_STATUS_ICON_PX * pop);
      this.space.setLogicalPosition(image, left + i * (FIGHT_STATUS_ICON_PX + GAP_PX) + FIGHT_STATUS_ICON_PX / 2, y + FIGHT_STATUS_ICON_PX / 2);
    });
    const hover = this.hovered !== null ? this.shown.indexOf(this.hovered) : -1;
    if (hover < 0) { this.tip.setVisible(false); return; }
    const label = this.name(this.shown[hover]!);
    if (this.tip.text !== label) this.tip.setText(label);
    // Under its icon, kept inside the space (2026-10-20 review: under the right bar's last icon a long name ran off a narrow screen).
    const centre = left + hover * (FIGHT_STATUS_ICON_PX + GAP_PX) + FIGHT_STATUS_ICON_PX / 2, half = this.tip.displayWidth / 2;
    const right = this.space.width === undefined ? Number.POSITIVE_INFINITY : this.space.width - half - TIP_EDGE_PX;
    this.space.setLogicalPosition(this.tip, Math.max(half + TIP_EDGE_PX, Math.min(right, centre)), y + FIGHT_STATUS_ICON_PX + 3);
    this.tip.setVisible(true).setAlpha(alpha);
  }

  destroy(): void { for (const image of this.icons) image.destroy(); this.tip.destroy(); }
}
