import Phaser from "phaser";
import { cssHex, FONT, PALETTE } from "../../art/palette";
import { uiFeedback } from "../../ui/UiFeedback";
import type { ArenaScreenSpace } from "./ArenaHudSpace";

/** What an icon button draws: pause (two bars), play (a triangle), or close (a cross). */
export type ArenaIcon = "pause" | "play" | "close";

/** The footer's icon buttons (HUD px): their side, the icon's share of it, the armed word's size and gap. */
export const ARENA_ICON_BUTTON = Object.freeze({ side: 44, icon: 0.4, wordPx: 15, wordGap: 10 });

export interface ArenaIconButtonHandle {
  readonly objects: readonly Phaser.GameObjects.GameObject[];

  draw(x: number, y: number, icon: ArenaIcon, armed: boolean, word: string, wordSide: "left" | "right"): void;
  destroy(): void;
}

/**
 * 무투장 경기 화면의 아이콘 버튼(2026-10-23, 시안 v5 — 하단의 남색 글자 블록 둘을 대신한다): 잉크 정사각형 위 흰 1 px 테와 흰 아이콘 하나.
 * 기권을 한 번 물으면(`armed`) 핫분홍로 바뀌고 옆에 "다시 눌러 기권"이 선다. 반응(호버·누름)은 공용 `uiFeedback` 이 맡는다.
 */
export function arenaIconButton(scene: Phaser.Scene, space: ArenaScreenSpace, name: string, onActivate: () => void): ArenaIconButtonHandle {
  const side = ARENA_ICON_BUTTON.side;
  const plate = space.add(scene.add.rectangle(0, 0, side, side, PALETTE.oddboutInk, 0.82).setOrigin(0.5).setStrokeStyle(1, PALETTE.white, 0.32)
    .setName(`${name}-frame`).setInteractive({ useHandCursor: true }));
  const icon = space.add(scene.add.graphics().setName(`${name}-icon`));
  const word = space.add(scene.add.text(0, 0, "", { fontFamily: FONT.hudSans, fontStyle: "bold", fontSize: `${ARENA_ICON_BUTTON.wordPx}px`,
    color: cssHex(PALETTE.oddboutPink) }).setOrigin(0, 0.5).setVisible(false).setName(name));
  plate.on("pointerdown", (_p: unknown, _x: number, _y: number, event: Phaser.Types.Input.EventData) => { event.stopPropagation(); onActivate(); });
  uiFeedback(plate, { visuals: [plate, icon], frame: false, burst: false, intensity: "subtle" });
  return {
    objects: [plate, icon, word],
    draw(x, y, kind, armed, label, wordSide) {
      plate.setFillStyle(armed ? PALETTE.oddboutPink : PALETTE.oddboutInk, armed ? 1 : 0.82);
      // The plate and the icon both stand at the button's centre, the icon drawn around (0, 0), so the hover lift grows them in place. The
      // icon once sat at the screen origin with its strokes at the corner: the lift scaled it from there and the ✕ flew off (2026-10-24).
      const cx = x + side / 2, cy = y + side / 2;
      space.setLogicalPosition(plate, cx, cy);
      space.setLogicalPosition(icon, cx, cy);
      const g = icon.clear().fillStyle(armed ? PALETTE.oddboutInk : PALETTE.white, armed ? 1 : 0.9);
      const r = side * ARENA_ICON_BUTTON.icon / 2;
      if (kind === "pause") { g.fillRect(-r * 0.75, -r, r * 0.55, r * 2); g.fillRect(r * 0.2, -r, r * 0.55, r * 2); }
      else if (kind === "play") g.fillTriangle(-r * 0.7, -r, -r * 0.7, r, r, 0);
      else {
        g.lineStyle(Math.max(2, side * 0.07), armed ? PALETTE.oddboutInk : PALETTE.white, 0.9);
        g.lineBetween(-r, -r, r, r); g.lineBetween(-r, r, r, -r);
      }
      if (word.text !== label) word.setText(label);
      word.setVisible(label !== "").setOrigin(wordSide === "left" ? 1 : 0, 0.5);
      space.setLogicalPosition(word, wordSide === "left" ? x - ARENA_ICON_BUTTON.wordGap : x + side + ARENA_ICON_BUTTON.wordGap, cy);
    },
    destroy() { plate.destroy(); icon.destroy(); word.destroy(); },
  };
}
