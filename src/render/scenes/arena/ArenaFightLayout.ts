import { FIGHT_BAR_THUMB } from "../../effects/NativeCityFightHpBar";

/** Both HP bars' thickness (HUD px). */
export const arenaHpBarHeight = 12;

/** Screens at least this wide show each fighter's face beside his bar (narrower ones keep the bars' width instead). */
export const ARENA_FACES_MIN_WIDTH = 1000;

/**
 * One shared grid for both fighters (2026-10-20 — 사용자: "무투장에서 상단 UI가 다른데, 통일할 수 없어???": the player's bout and the AI duel
 * draw the same pair). Each corner: his face at the outer edge (`faces`), his bar beside it full at that end, his name over the bar's outer
 * end. Widths are HUD/CSS units, never EXPAND backbuffer pixels.
 */
export function arenaFightHudLayout(width: number, height: number, textScale = 1) {
  const margin = width < 700 || height < 520 ? 16 : 28;
  const gap = width < 600 ? 40 : 64;
  const faces = width >= ARENA_FACES_MIN_WIDTH;
  const inset = margin + (faces ? FIGHT_BAR_THUMB.px + FIGHT_BAR_THUMB.gapPx : 0);
  const columnWidth = Math.min(360, (width - inset * 2 - gap) / 2);
  const metaHeight = 20 * textScale + 16;
  const nameY = margin + metaHeight + 8;
  const nameHeight = 22 * textScale * (width < 600 ? 2 : 1);
  const barY = nameY + nameHeight + 8;
  return {
    margin, faces, columnWidth, metaY: margin, metaHeight, nameY, nameHeight, barY,
    left: inset, right: width - inset - columnWidth,
    statusY: barY + 24,
    footerY: height - 16, footerWidth: width - margin * 2,
  };
}

/** Pause and exit never share a hit area; portrait screens put them on separate rows. */
export function arenaDuelFooterLayout(width: number, height: number, margin: number,
  control: { width: number; height: number }, exit: { width: number; height: number }) {
  const bottom = height - 16;
  const stacked = control.width + exit.width + 24 > width - margin * 2;
  return {
    control: { x: stacked ? (width - control.width) / 2 : margin,
      y: bottom - control.height - (stacked ? exit.height + 4 : 0), ...control },
    exit: { x: stacked ? (width - exit.width) / 2 : width - margin - exit.width, y: bottom - exit.height, ...exit },
  };
}

export type ArenaDuelEndAction = "share" | "community" | "back";

/** Completed-bout actions share one row, or stack on a narrow screen. The short landscape view keeps room for the winner. */
export function arenaDuelEndButtonsLayout(width: number, height: number, margin: number, size: { width: number; height: number },
  actions: readonly ArenaDuelEndAction[] = ["share", "back"]) {
  const bottom = height - 16, gap = 12, count = actions.length, available = width - margin * 2;
  const stacked = count * Math.min(size.width, 180) + (count - 1) * gap > available;
  const buttonWidth = Math.min(size.width, stacked ? available : (available - (count - 1) * gap) / Math.max(1, count));
  const left = (width - (stacked ? buttonWidth : count * buttonWidth + (count - 1) * gap)) / 2;
  return actions.map((action, index) => ({ action, width: buttonWidth, height: size.height,
    x: stacked ? left : left + index * (buttonWidth + gap),
    y: stacked ? bottom - (count - index) * size.height - (count - index - 1) * 4 : bottom - size.height }));
}

/**
 * 얼굴 HUD 의 자리(2026-10-23, 시안 v5): 위쪽 양 끝에 표정 초상 패널, 그 안쪽에 이름·큰 HP 숫자·막대, 가운데에 남은 초. 넓은 화면은 한 줄
 * (`stacked` false — 1600 HUD px 기준 치수를 화면에 맞춰 줄이고 늘린다), 세로 휴대폰은 패널 밑에 이름·숫자·막대를 쌓는다(`stacked`).
 * 값은 모두 HUD/CSS px 이다.
 */
export interface ArenaFaceHudLayout {
  readonly stacked: boolean;
  readonly margin: number;
  /** The portrait's panel (its top, size) and the portrait's side (it stands on the panel's bottom and rises over its top). */
  readonly panelTop: number;
  readonly panelW: number;
  readonly panelH: number;
  readonly face: number;
  /** How far the portrait reaches past the panel's outer edge. */
  readonly faceOut: number;
  /** The name, number and bar: their distance in from the screen edge (the panel's inner edge in the wide row), their tops and sizes. */
  readonly textInset: number;
  readonly nameTop: number;
  readonly name: number;
  readonly numTop: number;
  readonly num: number;
  readonly barTop: number;
  readonly bar: number;
  readonly barH: number;
  readonly clockTop: number;
  readonly clock: number;
  /** Below the whole HUD (the KO cut-in and the status card keep under it). */
  readonly bottom: number;
}

export function arenaFaceHudLayout(width: number, height: number, textScale = 1): ArenaFaceHudLayout {
  const text = Math.max(1, Math.min(1.5, textScale));
  if (width < 640) {
    const s = Math.max(0.8, Math.min(1.25, width / 430)), margin = 12 * s, panelW = 118 * s;
    const nameTop = 158 * s, num = 58 * s;
    return { stacked: true, margin, panelTop: 64 * s, panelW, panelH: 86 * s, face: 140 * s, faceOut: 6 * s, textInset: margin,
      nameTop, name: 12 * s * text, numTop: nameTop + 18 * s * text, num, barTop: nameTop + 18 * s * text + num * 0.92, bar: Math.min(160 * s, width / 2 - margin - 24),
      barH: 4, clockTop: 44 * s, clock: 18 * s, bottom: nameTop + 18 * s * text + num * 0.92 + 16 };
  }
  const s = Math.max(0.55, Math.min(1.15, Math.min(width / 1600, height / 852))), margin = 28 * s, panelW = 190 * s;
  const textInset = margin + panelW + 22 * s, bar = Math.min(470 * s, width / 2 - textInset - 56 * s);
  return { stacked: false, margin, panelTop: 80 * s, panelW, panelH: 128 * s, face: 206 * s, faceOut: 8 * s, textInset,
    nameTop: 84 * s, name: 17 * s * text, numTop: 110 * s, num: 86 * s, barTop: 196 * s, bar, barH: Math.max(4, 6 * s),
    clockTop: 102 * s, clock: 40 * s, bottom: 220 * s };
}

/** A box in HUD/CSS px. */
export interface ArenaBox { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

/**
 * 승자 찍기 카드의 자리(2026-10-24, `ArenaVersusCard`): 위쪽 가운데 제목 한 줄, 두 선수의 정면 원화를 좌우에(a 왼쪽, b 오른쪽 — 링의 코너와
 * 같다), 원화 밑에 이름, 둘 사이 가운데에 VS. 아래쪽은 나가기 아이콘 버튼 줄(`ARENA_ICON_BUTTON`)을 비운다. 한 선수를 누르는 칸
 * (`hits`)은 원화와 이름을 합친 세로 띠다. 세로 휴대폰도 좌우 두 장이다.
 * 글자 크기(`font`)는 배율 1 의 값이다 — 화면의 글자 배율은 접근성 런타임이 모든 글자에 입힌다(`AccessibilityRuntime`). 자리는 그 배율로
 * 커진 글자가 들어가게 잡는다.
 */
export function arenaVersusLayout(width: number, height: number, textScale = 1) {
  const text = Math.max(1, Math.min(1.5, textScale));
  const margin = width < 700 || height < 520 ? 16 : 28;
  const titleFont = Math.round(Math.max(26, Math.min(48, height * 0.06))), title = titleFont * text;
  const titleY = Math.max(margin + title / 2, height * 0.1);
  const vsGap = Math.max(56, Math.min(160, width * 0.1));
  const column = Math.min(440, (width - margin * 2 - vsGap) / 2);
  const nameFont = 20, nameHeight = Math.max(44, Math.round(nameFont * text) + 24);
  // The bottom row's icon button (`ARENA_ICON_BUTTON.side` 44, 18 px off the bottom) and a breath over it.
  const bottomReserve = 18 + 44 + 16;
  const artTop = titleY + title / 2 + 20, artBottom = height - bottomReserve - nameHeight;
  const artHeight = Math.max(80, artBottom - artTop);
  const left = width / 2 - vsGap / 2 - column, right = width / 2 + vsGap / 2;
  const art = (x: number): ArenaBox => ({ x, y: artTop, width: column, height: artHeight });
  const name = (x: number): ArenaBox => ({ x, y: artTop + artHeight, width: column, height: nameHeight });
  const hit = (x: number): ArenaBox => ({ x, y: artTop, width: column, height: artHeight + nameHeight });
  return {
    margin,
    title: { x: width / 2, y: titleY, size: title, font: titleFont, width: width - margin * 2 },
    vs: { x: width / 2, y: artTop + artHeight * 0.55, size: Math.round(Math.max(28, Math.min(72, vsGap * 0.55))) * text,
      font: Math.round(Math.max(28, Math.min(72, vsGap * 0.55))), width: vsGap },
    nameFont,
    art: [art(left), art(right)] as const,
    names: [name(left), name(right)] as const,
    hits: [hit(left), hit(right)] as const,
  };
}
