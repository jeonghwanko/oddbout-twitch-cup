import { UI_METRICS } from "../../art/palette";

/**
 * Every control stays this many CSS px above the bottom (a phone's home bar and rounded corners). In CSS px, not layout px — a phone's
 * layout px are smaller than its CSS px (2026-10-22: at 390 × 844 a 44-unit gap was 27 CSS px). The art credit tab that once owned the
 * bottom right corner is gone (2026-10-24 사용자: the entry funnel shows the credits before the game).
 */
export const ARENA_SELECT_BOTTOM_CLEAR = 20;

export interface ArenaRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The cup's slots: 16, 0~7 the left half, 8~15 the right half; two by two a match of the round of 16 (`ArenaCupRules`). */
const SLOTS = 16;
const HALF = 8;

/** A rect's own copy (frozen). */
const rect = (x: number, y: number, width: number, height: number): ArenaRect => Object.freeze({ x, y, width, height });

/**
 * The first scene's geometry in HUD-sized screen pixels (2026-10-24, docs/Plan/2026-10-24-oddbout-cup-and-free-play 3단계 — 사용자: PLAY 뒤
 * 첫 씬은 후보·16강 대진 짜기). ODDBOUT poster tone as before (2026-10-22). The auto sparring window is a second screen of its own
 * (`arenaPracticeLayout`), opened by the 자동 연습 경기 button (2026-10-24 사용자: "자율 전투는 버튼으로 만들어서 2depth로").
 * - `wide` (a landscape window): the bracket across the board — the left half's eight slots down its left edge, the right half's down its
 *   right edge, their lines meeting at the final in the middle — and its message row under it; the candidates' face strip; one row at the
 *   bottom: the bracket tools on the left, then 자동 연습 경기 and the start on the right.
 * - `tall` (a phone held upright): the two halves as two columns of eight (no lines), the message row, the strip, the tools row, and
 *   자동 연습 경기 beside the start across the board.
 * A window too low for two columns of eight lays the slots four columns of four, without lines (`slotGrid`). A short window (a phone on its
 * side) drops the titles and puts the message row on top. Every touch target is ≥ 44 px, except the slots: ≥ 40 (a phone's two columns keep
 * their names; a laptop window keeps the lines), ≥ 24 on a short window. (fighter.html's top bar takes ~48 px: a 390 × 844 phone lays out
 * 390 × ~796, a 1280 × 720 window 1280 × ~672.)
 */
export function arenaSelectLayout(width: number, height: number, textScale = 1, cssPerUnit = 1) {
  const scale = Math.min(1.5, Math.max(1, textScale));
  const narrow = width < 700, short = height < 520;
  const tall = narrow && !short;
  const margin = narrow || short ? 16 : 32;
  const boardWidth = Math.min(1440, width - margin * 2), x = (width - boardWidth) / 2, right = x + boardWidth;
  const top = short ? 8 : tall ? 12 : 20;
  const control = Math.max(44, UI_METRICS.controlHeight);
  const bottom = height - ARENA_SELECT_BOTTOM_CLEAR / Math.max(0.1, cssPerUnit);
  const buttonHeight = Math.max(48, control);
  const titleLine = Math.round(24 * scale);
  // The message row (the cursor's fighter, his matchup and record; a passing notice): one line, the slot's two actions on its right.
  const messageHeight = Math.max(control, Math.round(24 * scale));
  // A phone's steps row (2026-10-25 갈림길: ① 대진 짜기 · ② 경기 · ③ 결과, and the last cup's chip).
  const stageHeight = Math.round(30 * scale);

  if (tall) {
    // The hub's steps and the last cup's chip: a row of their own over the slots.
    const stage = rect(x, top, boardWidth, stageHeight);
    const sparringWidth = Math.round((boardWidth - 8) * 0.42);
    const sparring = rect(x, bottom - buttonHeight, sparringWidth, buttonHeight);
    const start = rect(x + sparringWidth + 8, sparring.y, boardWidth - sparringWidth - 8, buttonHeight);
    const toolWidth = (boardWidth - 16) / 3, toolY = start.y - 8 - control;
    const tools = [0, 1, 2].map(i => rect(x + i * (toolWidth + 8), toolY, toolWidth, control));
    const cell = Math.round(Math.min(64, Math.max(48, boardWidth / 7)));
    const strip = { x, y: toolY - 10 - cell, width: boardWidth, cell, gap: 6, arrow: 28 };
    const builderTop = stage.y + stage.height + 6;
    const builder = rect(x, builderTop, boardWidth, strip.y - 10 - builderTop);
    const message = rect(builder.x, builder.y + builder.height - messageHeight, builder.width, messageHeight);
    const area = rect(builder.x, builder.y, builder.width, message.y - 6 - builder.y);
    // A phone's rows give a little (40) so its two columns of eight keep their names; the 4 × 4 grid is for a smaller one.
    const grid = slotGrid(area, 40, null);
    // A passing notice takes the message row's words (there is no room beside the start on a phone).
    const actions = slotActions(message, control, scale);
    return finish({ width, height, tall, short, scale, board: { x, width: boardWidth, right }, title: null, stage, builder, area, slots: grid.slots,
      slotRows: grid.rows, final: null, columns: null, message, actions, strip, tools, sparring, start, notice: actions.text });
  }

  // The bottom row's five buttons at their own widths; a board too narrow for them (a 600 px window) narrows all five alike.
  const wanted = { start: Math.min(300, Math.max(180, boardWidth * 0.24)), sparring: Math.min(220, Math.max(140, boardWidth * 0.16)),
    tool: Math.min(150, Math.max(96, boardWidth * 0.1)) };
  const rowGaps = 4 * 8, fitRow = Math.min(1, (boardWidth - rowGaps) / (wanted.start + wanted.sparring + 3 * wanted.tool));
  const startWidth = wanted.start * fitRow, sparringWidth = wanted.sparring * fitRow, toolWidth = wanted.tool * fitRow;
  const rowY = bottom - buttonHeight;
  const start = rect(right - startWidth, rowY, startWidth, buttonHeight);
  const sparring = rect(start.x - 8 - sparringWidth, rowY, sparringWidth, buttonHeight);
  const tools = [0, 1, 2].map(i => rect(x + i * (toolWidth + 8), rowY + (buttonHeight - control) / 2, toolWidth, control));
  const noticeX = tools[2]!.x + toolWidth + 16;
  const cell = Math.round(short ? 44 : Math.min(72, Math.max(48, height * 0.085)));
  const strip = { x, y: rowY - 12 - cell, width: boardWidth, cell, gap: 8, arrow: 28 };
  // A short window (a phone on its side) drops the titles and puts the message row on top, giving the slots every row it can.
  const contentTop = short ? top : top + titleLine + 8, contentBottom = strip.y - 12;
  const builder = rect(x, contentTop, boardWidth, contentBottom - contentTop);
  const message = short ? rect(builder.x, builder.y, builder.width, messageHeight)
    : rect(builder.x, builder.y + builder.height - messageHeight, builder.width, messageHeight);
  const area = short ? rect(builder.x, message.y + messageHeight + 6, builder.width, builder.y + builder.height - (message.y + messageHeight + 6))
    : rect(builder.x, builder.y, builder.width, message.y - 8 - builder.y);
  const slotWidth = Math.round(Math.min(280, Math.max(120, area.width * 0.24)));
  // A landscape window's slots are a mouse's targets: 40 keeps a 1280 × 720 window (~672 under the page's top bar) in two columns of eight.
  const grid = slotGrid(area, short ? 24 : 40, slotWidth);
  const title = short ? null : { y: top, height: titleLine, builderX: builder.x };
  // The hub's steps and the last cup's chip share the title row (a short window has neither).
  const stage = short ? null : rect(x, top, boardWidth, titleLine);
  const actions = slotActions(message, control, scale);
  // A passing notice beside 자동 연습 경기, or (a narrow window, no room there) in the message row's words as on a phone.
  const besideStart = sparring.x - 16 - noticeX;
  const notice = besideStart >= 160 ? rect(noticeX, rowY, besideStart, buttonHeight) : actions.text;
  if (grid.rows !== HALF) {
    return finish({ width, height, tall, short, scale, board: { x, width: boardWidth, right }, title, stage, builder, area, slots: grid.slots,
      slotRows: grid.rows, final: null, columns: null, message, actions, strip, tools, sparring, start, notice });
  }
  // The final in the middle, as tall as a pair of slots; each half's three junction columns spread evenly between its slots and the final.
  const slots = grid.slots, first = slots[0]!, last = slots[HALF - 1]!;
  const finalWidth = Math.round(Math.min(110, Math.max(64, area.width * 0.13)));
  const finalHeight = Math.min(area.height, slots[1]!.y + slots[1]!.height - first.y);
  const centre = area.x + area.width / 2, middle = (first.y + last.y + last.height) / 2;
  const final = rect(centre - finalWidth / 2, middle - finalHeight / 2, finalWidth, finalHeight);
  const leftFrom = area.x + slotWidth, leftTo = final.x, rightFrom = area.x + area.width - slotWidth, rightTo = final.x + finalWidth;
  const columns = {
    left: [0, 1, 2].map(r => leftFrom + (leftTo - leftFrom) * (r + 0.5) / 3),
    right: [0, 1, 2].map(r => rightFrom - (rightFrom - rightTo) * (r + 0.5) / 3),
  };
  return finish({ width, height, tall, short, scale, board: { x, width: boardWidth, right }, title, stage, builder, area, slots, slotRows: grid.rows,
    final, columns, message, actions, strip, tools, sparring, start, notice });
}

/**
 * The sixteen slots in `area`, never under `minHeight`: two columns of eight (a half each — at the area's edges `edgeWidth` wide for the
 * bracket's lines, else filling it), or, where eight rows do not fit (a short or small window), four columns of four (a quarter each, no
 * lines). Down a column a pair's two slots sit close and pairs a little apart. `rows`: slots per column (the cursor walks a column).
 */
function slotGrid(area: ArenaRect, minHeight: number, edgeWidth: number | null): { readonly slots: readonly ArenaRect[]; readonly rows: 4 | 8 } {
  const gap = Math.max(3, Math.min(8, area.height * 0.012));
  const eight = (area.height - (HALF - 1) * gap - 3 * gap) / HALF;
  const rows: 4 | 8 = eight >= minHeight ? HALF : 4;
  const pairs = rows / 2;
  const height = Math.max(minHeight, Math.min(72, (area.height - (rows - 1) * gap - (pairs - 1) * gap) / rows));
  const used = rows * height + (rows - 1 + pairs - 1) * gap, y0 = area.y + Math.max(0, (area.height - used) / 2);
  const y = (row: number) => y0 + row * (height + gap) + Math.floor(row / 2) * gap;
  const columns = SLOTS / rows, columnGap = 10;
  const columnWidth = rows === HALF && edgeWidth !== null ? edgeWidth : (area.width - (columns - 1) * columnGap) / columns;
  const columnX = (column: number) => rows === HALF && edgeWidth !== null
    ? (column === 0 ? area.x : area.x + area.width - edgeWidth) : area.x + column * (columnWidth + columnGap);
  return { rows, slots: Object.freeze(Array.from({ length: SLOTS }, (_, slot) =>
    rect(columnX(Math.floor(slot / rows)), y(slot % rows), columnWidth, height))) };
}

/** The message row's two slot actions (★ 대표로, 빼기) at its right end; the words keep the rest. */
function slotActions(message: ArenaRect, control: number, scale: number): { readonly represent: ArenaRect; readonly remove: ArenaRect;
  readonly text: ArenaRect } {
  const width = Math.round(Math.min(140, Math.max(88, message.width * 0.16)) * Math.min(1.25, scale));
  const remove = rect(message.x + message.width - width, message.y + (message.height - control) / 2, width, control);
  const represent = rect(remove.x - 8 - width, remove.y, width, control);
  return { represent, remove, text: rect(message.x, message.y, Math.max(0, represent.x - 12 - message.x), message.height) };
}

/**
 * The auto sparring screen (2026-10-24 사용자: the first scene's 자동 연습 경기 button opens it; 뒤로 comes back): a header (← 뒤로, the
 * title, a passing notice on its right) and the versus card under it across the board, no wider than 1120 px and centred.
 */
export function arenaPracticeLayout(width: number, height: number, textScale = 1, cssPerUnit = 1) {
  const scale = Math.min(1.5, Math.max(1, textScale));
  const narrow = width < 700, short = height < 520;
  const margin = narrow || short ? 16 : 32;
  const boardWidth = Math.min(1120, width - margin * 2), x = (width - boardWidth) / 2;
  const top = short ? 8 : narrow ? 12 : 20;
  const control = Math.max(44, UI_METRICS.controlHeight);
  const bottom = height - ARENA_SELECT_BOTTOM_CLEAR / Math.max(0.1, cssPerUnit);
  const backWidth = Math.round(Math.min(140, Math.max(96, boardWidth * 0.12)) * Math.min(1.25, scale));
  const back = rect(x, top, backWidth, control);
  const titleX = back.x + backWidth + 16;
  // The title keeps up to 40 % of what is right of the back button; the notice the rest.
  const titleWidth = Math.round((x + boardWidth - titleX) * 0.4);
  const title = { x: titleX, y: top, width: titleWidth, height: control };
  const notice = rect(titleX + titleWidth + 12, top, Math.max(0, x + boardWidth - (titleX + titleWidth + 12)), control);
  const boxY = top + control + (short ? 8 : 16);
  const practice = practicePanel(rect(x, boxY, boardWidth, bottom - boxY), control, scale);
  return finish({ width, height, short, scale, board: { x, width: boardWidth, right: x + boardWidth }, back, title, notice, practice });
}

/**
 * The versus card (2026-10-24 3단계 a still card; 4단계 the live bout): the two fighters' pictures side by side with VS between, a row under
 * each (‹ his name ›), a line for his record, and its buttons (무작위, 크게 보기, the registered duel).
 */
function practicePanel(box: ArenaRect, control: number, scale: number) {
  const line = Math.round(20 * scale);
  const vsWidth = 56, buttons = control, gap = 8;
  const buttonsY = box.y + box.height - buttons, lineY = buttonsY - gap - line, rowY = lineY - 6 - control;
  const side = (box.width - vsWidth) / 2, artHeight = Math.max(60, rowY - 6 - box.y);
  const a = rect(box.x, box.y, side, artHeight), b = rect(box.x + side + vsWidth, box.y, side, artHeight);
  const third = (box.width - 2 * gap) / 3;
  return { box, a, b, vs: { x: box.x + box.width / 2, y: box.y + artHeight * 0.45, size: Math.round(Math.min(72, Math.max(40, artHeight * 0.1))) },
    aRow: rect(a.x, rowY, side, control), bRow: rect(b.x, rowY, side, control),
    random: rect(box.x, buttonsY, third, buttons), watch: rect(box.x + third + gap, buttonsY, third, buttons),
    duel: rect(box.x + 2 * (third + gap), buttonsY, third, buttons), line: rect(box.x, lineY, box.width, line) };
}

/**
 * 내 선수 고르기 (2026-10-27 — 사용자: "PLAY를 누르면 적어도 내 캐릭터 선택이 있고, 내가 선택한 캐릭터가 좌상단 1번 슬롯에 있는 상태에서 16강
 * 토너먼트 대진이 뿅뿅뿅 채워지고"): the practice screen's header (← 대진표, the title, a passing notice), the picked fighter standing with his
 * name, title and record on one side, the `count` candidates' faces in a grid on the other, and 선택 at the bottom right. A phone stacks them:
 * the fighter over his lines, the grid, 선택 across the board.
 */
export function arenaPickLayout(width: number, height: number, count: number, textScale = 1, cssPerUnit = 1) {
  const scale = Math.min(1.5, Math.max(1, textScale));
  const narrow = width < 700, short = height < 520, tall = narrow && !short;
  const margin = narrow || short ? 16 : 32;
  const boardWidth = Math.min(1280, width - margin * 2), x = (width - boardWidth) / 2, right = x + boardWidth;
  const top = short ? 8 : narrow ? 12 : 20;
  const control = Math.max(44, UI_METRICS.controlHeight);
  const bottom = height - ARENA_SELECT_BOTTOM_CLEAR / Math.max(0.1, cssPerUnit);
  const buttonHeight = Math.max(48, control);
  const backWidth = Math.round(Math.min(160, Math.max(112, boardWidth * 0.13)) * Math.min(1.25, scale));
  const back = rect(x, top, backWidth, control);
  const titleX = back.x + backWidth + 16, titleWidth = Math.round((right - titleX) * 0.4);
  const title = { x: titleX, y: top, width: titleWidth, height: control };
  const notice = rect(titleX + titleWidth + 12, top, Math.max(0, right - (titleX + titleWidth + 12)), control);
  const contentY = top + control + (short ? 8 : 16);
  // The picked fighter's lines under his picture: his name (display), his title, his cup record.
  const nameLine = Math.round((short ? 28 : 40) * scale), subLine = Math.round(20 * scale), infoHeight = nameLine + 2 * subLine + 8;
  const gap = narrow ? 6 : 10;
  // The faces' columns: of the counts whose faces are within 10 % of the biggest that fits `area` (`largest` at most), the one with the
  // fewest empty cells in its last row, then the bigger face (25 → 5 × 5, not 7 + 7 + 7 + 4).
  const grid = (area: ArenaRect, largest: number) => {
    const options = [4, 5, 6, 7, 8, 9].map(columns => {
      const rows = Math.ceil(count / columns);
      const cell = Math.floor(Math.max(36, Math.min(largest, (area.width - (columns - 1) * gap) / columns, (area.height - (rows - 1) * gap) / rows)));
      return { columns, rows, cell, empty: rows * columns - count };
    });
    const biggest = Math.max(...options.map(option => option.cell));
    const { columns, rows, cell } = options.filter(option => option.cell >= biggest * 0.9)
      .sort((a, b) => a.empty - b.empty || b.cell - a.cell)[0]!;
    return { x: area.x, y: area.y, columns, rows, cell, gap, width: columns * cell + (columns - 1) * gap, height: rows * cell + (rows - 1) * gap };
  };
  if (tall) {
    const choose = rect(x, bottom - buttonHeight, boardWidth, buttonHeight);
    // The faces take under half of what is left, so he still stands tall over his lines.
    const cells = grid(rect(x, 0, boardWidth, (choose.y - 12 - contentY) * 0.46), 72);
    const gridY = choose.y - 12 - cells.height;
    const info = rect(x, gridY - 12 - infoHeight, boardWidth, infoHeight);
    const figure = rect(x, contentY, boardWidth, Math.max(80, info.y - 4 - contentY));
    return finish({ width, height, tall, short, scale, back, title, notice, figure, info, nameLine, subLine,
      grid: { ...cells, x: x + (boardWidth - cells.width) / 2, y: gridY }, choose });
  }
  const chooseWidth = Math.min(300, Math.max(180, boardWidth * 0.24));
  const choose = rect(right - chooseWidth, bottom - buttonHeight, chooseWidth, buttonHeight);
  const contentBottom = choose.y - 16;
  const figureWidth = Math.round(boardWidth * 0.36), gridX = x + figureWidth + 32;
  const info = rect(x, contentBottom - infoHeight, figureWidth, infoHeight);
  const figure = rect(x, contentY, figureWidth, Math.max(80, info.y - 8 - contentY));
  const cells = grid(rect(gridX, contentY, right - gridX, contentBottom - contentY), 128);
  return finish({ width, height, tall, short, scale, back, title, notice, figure, info, nameLine, subLine,
    grid: { ...cells, x: right - cells.width, y: contentY + Math.max(0, (contentBottom - contentY - cells.height) / 2) }, choose });
}

export type ArenaPracticeLayout = ReturnType<typeof arenaPracticeLayout>;
export type ArenaPickLayout = ReturnType<typeof arenaPickLayout>;

/** Freezes the layout's top level (its rects are frozen already). */
function finish<T extends object>(layout: T): T {
  return Object.freeze(layout);
}

export type ArenaSelectLayout = ReturnType<typeof arenaSelectLayout>;

/** One line of the bracket: a feed (into a junction column, owned by the subtree `node` at `round`) or a join (the junction of match `node`). */
export interface ArenaBracketSegment {
  readonly kind: "feed" | "join";
  /** 0 = the round of 16 … 3 = the final (a feed into the final). */
  readonly round: number;
  /** A feed: the subtree at that round (`slot >> round`). A join: the match (`slot >> (round + 1)`). */
  readonly node: number;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/**
 * The wide bracket's lines (none on a tall screen): each slot feeds its round-of-16 junction, each junction feeds the next column, the two
 * semifinal junctions feed the final's sides. A slot's path to the final is its feeds `(round, slot >> round)` for rounds 0~3.
 */
export function arenaBracketSegments(layout: ArenaSelectLayout): readonly ArenaBracketSegment[] {
  const { slots, final, columns } = layout;
  if (!final || !columns) return [];
  const segments: ArenaBracketSegment[] = [];
  for (const side of [0, 1] as const) {
    const xs = side === 0 ? columns.left : columns.right, edge = (slot: number) => side === 0 ? slots[slot]!.x + slots[slot]!.width : slots[slot]!.x;
    // Each subtree's point: its x (the slot edge, then a junction column) and y (the middle of its two children).
    let points = Array.from({ length: HALF }, (_, i) => { const slot = side * HALF + i, s = slots[slot]!; return { x: edge(slot), y: s.y + s.height / 2 }; });
    for (let round = 0; round < 3; round += 1) {
      const x = xs[round]!, next: { x: number; y: number }[] = [];
      points.forEach((point, i) => segments.push(Object.freeze({ kind: "feed", round, node: (side * HALF >> round) + i, x1: point.x, y1: point.y, x2: x, y2: point.y })));
      for (let m = 0; m < points.length / 2; m += 1) {
        const top = points[m * 2]!, bottom = points[m * 2 + 1]!;
        segments.push(Object.freeze({ kind: "join", round, node: (side * HALF >> (round + 1)) + m, x1: x, y1: top.y, x2: x, y2: bottom.y }));
        next.push({ x, y: (top.y + bottom.y) / 2 });
      }
      points = next;
    }
    const semi = points[0]!, into = side === 0 ? final.x : final.x + final.width;
    segments.push(Object.freeze({ kind: "feed", round: 3, node: side, x1: semi.x, y1: semi.y, x2: into, y2: semi.y }));
  }
  return Object.freeze(segments);
}

/**
 * The segment is on the representative's road — the one rule the select screen and the archive paint in acid (2026-10-25: the archive had
 * copied it without the knockout and drew a first-round loser's road to the final). His road is his slot's (`repSlot`, -1: no representative)
 * feeds `(round, slot >> round)` and the junctions of his bouts, as far as he went: knocked out in round `outRound` (null: still in, or the
 * champion), it ends at the bout he lost — its feed in, not its junction (the winner's line goes on from there).
 */
export function arenaOnRepresentativeRoad(segment: ArenaBracketSegment, repSlot: number, outRound: number | null): boolean {
  if (repSlot < 0 || segment.node !== repSlot >> (segment.kind === "feed" ? segment.round : segment.round + 1)) return false;
  return outRound === null || (segment.kind === "feed" ? segment.round <= outRound : segment.round < outRound);
}

/**
 * The pieces a bout's winner (in slot `at`) takes on up the bracket — his feed into round `round`'s bout, that bout's junction, the next
 * round's feed (2026-10-25: the select screen's lines, its winner-going-up stroke and the archive each looked them up). A piece the layout
 * lacks — no lines, or no feed above the final — is undefined.
 */
export function arenaWinnerSegments(segments: readonly ArenaBracketSegment[], round: number, at: number)
  : readonly [ArenaBracketSegment | undefined, ArenaBracketSegment | undefined, ArenaBracketSegment | undefined] {
  const find = (kind: ArenaBracketSegment["kind"], r: number, node: number) => segments.find(s => s.kind === kind && s.round === r && s.node === node);
  return [find("feed", round, at >> round), find("join", round, at >> (round + 1)), find("feed", round + 1, at >> (round + 1))];
}

/**
 * How many faces of `count` the strip shows at once, and whether it needs its ‹ › arrows (a strip that does not hold them all scrolls; its
 * arrows take a slot at each end).
 */
export function arenaStripWindow(strip: ArenaSelectLayout["strip"], count: number): { readonly visible: number; readonly arrows: boolean } {
  const fits = Math.max(1, Math.floor((strip.width + strip.gap) / (strip.cell + strip.gap)));
  if (count <= fits) return { visible: count, arrows: false };
  return { visible: Math.max(1, Math.floor((strip.width - 2 * (strip.arrow + strip.gap) + strip.gap) / (strip.cell + strip.gap))), arrows: true };
}

export function arenaRoundPage(width: number, height: number, textScale: number, matches: number) {
  const rowHeight = 28 * textScale, available = height - 304;
  const columns = matches * (rowHeight * 2 + 12) > available && width >= 600 ? 2 : 1;
  const rows = Math.max(1, Math.floor(available / (rowHeight * 2 + 12)));
  const capacity = rows * columns;
  return { rowHeight, columns, capacity, pages: Math.max(1, Math.ceil(matches / capacity)) };
}
