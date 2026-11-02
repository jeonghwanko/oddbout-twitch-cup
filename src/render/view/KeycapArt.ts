import Phaser from "phaser";
import { CSS, PALETTE } from "../art/palette";
import { playerSettingsFor } from "../accessibility/AccessibilityRuntime";
import { KEYCAP_COLORS, KEYCAP_FONT, KEYCAP_HEIGHT } from "./KeycapStyle";

/** 키 하나의 색·글꼴·높이는 `KeycapStyle` 이 소유한다(Phaser 없이). 이 파일은 그 키를 그린다. */
export { KEYCAP_COLORS, KEYCAP_FONT, KEYCAP_HEIGHT } from "./KeycapStyle";

/** 라벨 길이에 맞춘 키 폭. 한 글자 키와 화살표는 정사각에 가깝게 둔다. */
export function keycapWidth(label: string): number {
  if (["←", "→", "↑", "↓"].includes(label)) return 36;
  if (label.length === 1) return 34;
  return Math.max(44, label.length * 7 + 18);
}

/** 아이보리 상판, 얇은 앞턱, 문맥색 불빛을 분리한 로우 프로파일 키캡. */
export function drawKeycap(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  accent: number,
  scale: number,
  pressOffset = 0,
  active = false,
): void {
  y += pressOffset * scale;
  const right = x + width;

  // 문맥색은 키 전체를 칠하지 않고 바닥에 새는 얇은 불빛으로만 사용한다.
  graphics.fillStyle(accent, active ? 0.72 : pressOffset > 0 ? 0.42 : 0.2);
  graphics.fillEllipse(
    x + width / 2,
    y + (26 - pressOffset) * scale,
    Math.max(18 * scale, width - 8 * scale),
    (active ? 9 : 6) * scale,
  );

  graphics.fillStyle(KEYCAP_COLORS.shell, 0.98);
  graphics.fillPoints([
    point(x + 4 * scale, y),
    point(right - 4 * scale, y),
    point(right, y + 4 * scale),
    point(right - scale, y + 23 * scale),
    point(x + scale, y + 23 * scale),
    point(x, y + 4 * scale),
  ], true);

  graphics.fillStyle(KEYCAP_COLORS.side, 1);
  graphics.fillPoints([
    point(x + 2 * scale, y + 17 * scale),
    point(right - 2 * scale, y + 17 * scale),
    point(right - 3 * scale, y + 22 * scale),
    point(x + 3 * scale, y + 22 * scale),
  ], true);
  graphics.fillStyle(KEYCAP_COLORS.sideHighlight, 0.8);
  graphics.fillRect(x + 3 * scale, y + 17 * scale, width - 6 * scale, scale);

  graphics.fillStyle(KEYCAP_COLORS.topShade, 1);
  graphics.fillPoints([
    point(x + 4 * scale, y + 5 * scale),
    point(right - 4 * scale, y + 5 * scale),
    point(right - 3 * scale, y + 18 * scale),
    point(x + 3 * scale, y + 18 * scale),
  ], true);

  graphics.fillStyle(KEYCAP_COLORS.top, 1);
  graphics.fillPoints([
    point(x + 4 * scale, y + 3 * scale),
    point(right - 4 * scale, y + 3 * scale),
    point(right - 5 * scale, y + 16 * scale),
    point(x + 5 * scale, y + 16 * scale),
    point(x + 4 * scale, y + 6 * scale),
  ], true);
  graphics.fillStyle(KEYCAP_COLORS.topHighlight, 0.9);
  graphics.fillRect(x + 7 * scale, y + 4 * scale, width - 14 * scale, scale);

  graphics.fillStyle(accent, 0.9);
  graphics.fillRect(x + 7 * scale, y + 24 * scale, width - 14 * scale, 2 * scale);
}

/** Persistent combat HUD keys are neutral flat chips; only the active step gains state color. */
export function drawFlatHudKey(
  graphics: Phaser.GameObjects.Graphics, x: number, y: number, width: number,
  accent: number, scale: number, active: boolean, held: boolean,
): void {
  const height = 23 * scale;
  graphics.fillStyle(active || held ? PALETTE.hudFlatSelected : PALETTE.hudFlatChip, 0.98)
    .fillRoundedRect(x, y + 2 * scale, width, height, 3 * scale);
  if (active) graphics.fillStyle(accent, 0.92).fillRect(x, y + 2 * scale, 2 * scale, height);
}

export interface KeycapBadge {
  readonly container: Phaser.GameObjects.Container;
  readonly width: number;
  readonly height: number;
}

/**
 * 어디에나 놓을 수 있는 키 한 알.
 *
 * 컨테이너의 원점이 키 한가운데라, 화면은 "여기 두고 싶다" 는 좌표 하나만 정하면 된다.
 */
export function keycapBadge(
  scene: Phaser.Scene,
  label: string,
  scale = 1,
  accent: number = PALETTE.accent,
): KeycapBadge {
  const width = keycapWidth(label) * scale;
  const height = KEYCAP_HEIGHT * scale;
  const graphics = scene.add.graphics();
  drawKeycap(graphics, -width / 2, -height / 2, width, accent, scale);
  const text = scene.add.text(0, -height / 2 + 11 * scale, label, {
    fontFamily: KEYCAP_FONT,
    fontSize: `${Math.round(12 * scale)}px`,
    fontStyle: "bold",
    color: CSS.outline,
  }).setOrigin(0.5);
  const container = scene.add.container(0, 0, [graphics, text]).setSize(width, height);
  return { container, width, height };
}

function point(x: number, y: number): Phaser.Types.Math.Vector2Like {
  return { x, y };
}

/**
 * 납작한 키 칩.
 *
 * 입체 키캡은 어두운 저택 위에 크게 놓일 때 물리적인 키로 읽힌다. 같은 모양을 밝고
 * 장식적인 메뉴 버튼 옆에 1배로 붙이면 부스러기처럼 보인다 — 그래서 UI 어포던스는
 * 같은 재질(상아 종이 · 남색 잉크)의 납작한 칩으로 그린다. 두 모양의 경계는
 * "월드 위에서 배우는 키" 대 "메뉴에서 누를 키" 이고, 그 밖에 다른 키 표기는 없다.
 */
export function keyChip(
  scene: Phaser.Scene,
  label: string,
  fontSize = 13,
): KeycapBadge {
  const scale = textScaleOf(scene);
  const measured = measureAtDisplaySize(scene, label, {
    fontFamily: KEYCAP_FONT,
    fontStyle: "bold",
    color: CSS.navyInk,
  }, fontSize);
  measured.text.setOrigin(0.5);
  const paddingX = 9 * scale;
  // 판 높이는 글자 실측이 아니라 지정한 글자 크기에서 뽑는다 — 라벨이 "S" 든 "Enter" 든
  // 한 줄에 선 칩들의 키가 같아야 한 벌로 읽힌다.
  const height = (fontSize + 13) * scale;
  const width = Math.max(height, measured.width + paddingX * 2);
  const graphics = scene.add.graphics();
  graphics.fillStyle(PALETTE.paper, 0.96);
  graphics.fillRoundedRect(-width / 2, -height / 2, width, height, 5 * scale);
  graphics.lineStyle(1.5 * scale, PALETTE.navyInk, 0.85);
  graphics.strokeRoundedRect(-width / 2, -height / 2, width, height, 5 * scale);
  // 아래 잉크선 한 줄로 "눌리는 것" 을 표시한다. 입체를 흉내 내지 않는다.
  graphics.fillStyle(PALETTE.navyInk, 0.28);
  graphics.fillRoundedRect(-width / 2 + 4 * scale, height / 2 - 3 * scale, width - 8 * scale, 2 * scale, scale);
  const container = scene.add.container(0, 0, [graphics, measured.text]).setSize(width, height);
  return { container, width, height };
}

/**
 * 접근성 글자 배율을 반영한 실제 표시 크기로 글자를 만들고 그 폭·높이를 잰다.
 *
 * 글자 배율은 매 프레임 PRE_STEP 이 Text 를 찾아 키운다 — 만들 때의 기본 크기로 재면
 * 125%·150% 에서 칩 판과 줄 간격만 그대로 남아 글자가 판을 넘고 서로 겹친다. 그래서
 * 잴 때만 확대해 두고, 배율 적용은 그대로 런타임에 맡긴다.
 */
function measureAtDisplaySize(
  scene: Phaser.Scene,
  label: string,
  style: Phaser.Types.GameObjects.Text.TextStyle,
  basePx: number,
): { readonly text: Phaser.GameObjects.Text; readonly width: number; readonly height: number } {
  const applied = Math.max(8, Math.round(basePx * textScaleOf(scene)));
  const text = scene.add.text(0, 0, label, { ...style, fontSize: `${applied}px` });
  const width = Math.ceil(text.width);
  const height = Math.ceil(text.height);
  if (applied !== basePx) text.setFontSize(basePx);
  return { text, width, height };
}

function textScaleOf(scene: Phaser.Scene): number {
  const scale = playerSettingsFor(scene).textScale;
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

/** 스타일에 적힌 글자 크기의 픽셀 값. 없으면 Phaser 기본 16px 을 따른다. */
function basePixels(value: string | number | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 16;
  if (typeof value !== "string") return 16;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 16;
}

export interface KeyHintItem {
  /** 이 동작을 부르는 키들. 여러 개면 나란히 놓는다. */
  readonly keys: readonly string[];
  readonly label: string;
}

/**
 * 키 칩과 설명 사이의 간격. 타이틀의 "설정 / 메뉴 [S]" 가 기준이고, 그 한 값을
 * 모든 화면이 함께 쓴다 — 화면마다 따로 정하면 같은 안내가 화면마다 다른 리듬으로
 * 읽힌다.
 */
export const KEY_LABEL_GAP = 10;
/** 같은 동작을 부르는 키끼리(ENTER·SPACE)의 간격. 설명과의 간격보다 좁아야 한 묶음으로 읽힌다. */
export const KEY_CHIP_GAP = 5;
/** 서로 다른 안내 항목 사이. 칩-설명 묶음이 서로 붙어 보이지 않을 만큼만 벌린다. */
export const KEY_ITEM_GAP = 24;

export interface KeyHintRow {
  readonly container: Phaser.GameObjects.Container;
  readonly width: number;
  readonly height: number;
}

export interface KeyHintRowOptions {
  /** 0 왼쪽 · 0.5 가운데 · 1 오른쪽. 놓을 좌표가 줄의 어디인지 고른다. */
  readonly originX?: number;
  readonly keyFontSize?: number;
}

/**
 * "무엇을 누르면 무엇이 되는가" 한 줄.
 *
 * 키를 문장 안에 글자로 섞으면 어디까지가 키이고 어디부터가 설명인지 매번 다시
 * 갈라 읽어야 한다. 키는 칩으로, 설명은 글로 둔다.
 */
export function keyHintRow(
  scene: Phaser.Scene,
  items: readonly KeyHintItem[],
  x: number,
  y: number,
  labelStyle: Phaser.Types.GameObjects.Text.TextStyle,
  options: KeyHintRowOptions = {},
): KeyHintRow {
  const originX = options.originX ?? 0.5;
  const keyFontSize = options.keyFontSize ?? 12;
  const scale = textScaleOf(scene);
  const labelGap = KEY_LABEL_GAP * scale;
  const chipGap = KEY_CHIP_GAP * scale;
  const itemGap = KEY_ITEM_GAP * scale;
  const children: Phaser.GameObjects.GameObject[] = [];
  const placements: { readonly move: (offset: number) => void; readonly width: number }[] = [];
  let total = 0;

  const push = (
    object: Phaser.GameObjects.GameObject & { setX(value: number): unknown },
    width: number,
    center: boolean,
  ): void => {
    const left = total;
    placements.push({
      move: (offset) => object.setX(offset + left + (center ? width / 2 : 0)),
      width,
    });
    children.push(object);
    total += width;
  };

  let height = 0;
  items.forEach((item, index) => {
    if (index > 0) total += itemGap;
    item.keys.forEach((key, keyIndex) => {
      if (keyIndex > 0) total += chipGap;
      const chip = keyChip(scene, key, keyFontSize);
      height = Math.max(height, chip.height);
      push(chip.container, chip.width, true);
    });
    if (item.label === "") return;
    if (item.keys.length > 0) total += labelGap;
    const measured = measureAtDisplaySize(scene, item.label, labelStyle, basePixels(labelStyle.fontSize));
    measured.text.setOrigin(0, 0.5);
    height = Math.max(height, measured.height);
    push(measured.text, measured.width, false);
  });

  const offset = -total * originX;
  placements.forEach((placement) => placement.move(offset));
  const container = scene.add.container(x, y, children).setSize(total, height);
  return { container, width: total, height };
}
