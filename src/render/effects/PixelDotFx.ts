

import { PALETTE } from "../art/palette.ts";
import { fxRng } from "./FxRandom.ts";

/** `[x, y]` — 평면 점(`CityPoint`) 또는 월드 px. 메서드마다 어느 쪽인지 적는다. */
export type PixelDotPoint = readonly [number, number];

/** 이 이펙트들이 쓰는 색 전부. 격자 글자는 색이 아니라 이 토큰을 가리킨다. */
export const PIXEL_DOT_TONES = Object.freeze({
  ink: PALETTE.outline,
  goldDeep: PALETTE.gildShadow,
  gold: PALETTE.accent,
  hotGold: PALETTE.hotGold,
  /** 1~2칸 반짝임 전용. */
  white: PALETTE.white,
  pearl: PALETTE.eyeWhite,
  ivory: PALETTE.paper,
  dust: PALETTE.throwDust,
  dustShade: PALETTE.throwDustShade,
  dustDeep: PALETTE.villageWalnut,
  /** 쿠마 예고의 따뜻한 위험색. */
  danger: PALETTE.guardAlert,
  dangerHot: PALETTE.alarm,
  dangerDeep: PALETTE.burgundyInk,
  /** 옷가게 첫 변신의 하트·점 고리(2026-10-13). 팝아트 하트의 테는 `ink`, 빨강은 `dangerHot`, 노랑은 `gold`. */
  heart: PALETTE.villageAuroraPink,
  heartShade: PALETTE.waxRose,
  violet: PALETTE.villageAuroraViolet,
  mint: PALETTE.loot,
});
export type PixelDotTone = keyof typeof PIXEL_DOT_TONES;

/** 모든 격자가 같은 글자를 같은 뜻으로 쓴다. 이펙트는 여기서 쓸 글자만 골라 자기 팔레트로 삼는다. */
const KEYS = Object.freeze({
  i: "ink", G: "goldDeep", g: "gold", h: "hotGold", w: "white", p: "pearl", v: "ivory",
  d: "dust", D: "dustShade", b: "dustDeep", o: "danger", r: "dangerHot", R: "dangerDeep",
  m: "heart", e: "heartShade", u: "violet", n: "mint",
} as const satisfies Record<string, PixelDotTone>);
type Key = keyof typeof KEYS;

function palette(keys: string): Readonly<Record<string, PixelDotTone>> {
  const out: Record<string, PixelDotTone> = {};
  for (const key of keys) out[key] = KEYS[key as Key];
  return Object.freeze(out);
}

export type PixelDotSpriteId = "dashStreak0" | "dashStreak45" | "dashStreak90" | "dashDust" | "dashImpact" | "stunStars"
  | "stunStarsCalm" | "stunDazeRing" | "telegraphDot" | "telegraphArrow0" | "telegraphArrow45" | "telegraphArrow90";

/** `once` 는 한 번 재생 후 사라지고, `loop` 는 돌고, `state` 는 프레임을 상태로 고른다(시간으로 넘기지 않는다). */
export type PixelDotPlayback = "once" | "loop" | "state";

export interface PixelDotSprite<Id extends string = PixelDotSpriteId> {
  readonly id: Id;
  readonly width: number;
  readonly height: number;
  /** 대상 좌표에 중심이 놓이는 칸(아트 px). */
  readonly anchor: PixelDotPoint;
  readonly palette: Readonly<Record<string, PixelDotTone>>;
  readonly frames: readonly (readonly string[])[];
  /** 프레임마다 ms(`state` 는 쓰지 않는다). */
  readonly frameMs: readonly number[];
  readonly playback: PixelDotPlayback;
}

function sprite<Id extends string>(id: Id, anchor: PixelDotPoint, keys: string, playback: PixelDotPlayback, frameMs: readonly number[],
  frames: readonly (readonly string[])[]): PixelDotSprite<Id> {
  const first = frames[0] ?? [];
  return Object.freeze({ id, width: first[0]?.length ?? 0, height: first.length, anchor, palette: palette(keys),
    frames: Object.freeze(frames.map(frame => Object.freeze([...frame]))), frameMs: Object.freeze([...frameMs]), playback });
}

// ① 속도선 — 오른쪽으로 달리는 몸 기준. 앵커(오른쪽 끝 가운데 줄)가 그 순간 몸 중심이라 머리쪽은 몸 뒤에 숨는다.
//    머리(오른쪽)부터 짧아지며 금 → 짙은 금으로 식고, 셋째 프레임에 대시로 끊기고, 넷째에 점만 남는다.
const STREAK_0 = sprite("dashStreak0", [15, 3], "Gghw", "once", [40, 45, 55, 60], [
  [
    ".......Gggghhh..",
    "................",
    "................",
    "..GG.gggghhhhhw.",
    "................",
    "................",
    ".....Gggghh.....",
  ],
  [
    "......GGggh.....",
    "................",
    "................",
    ".G.GG.ggghhh....",
    "................",
    "................",
    "....GGggh.......",
  ],
  [
    ".....G.Gg.......",
    "................",
    "................",
    "G..G.Ggg.h......",
    "................",
    "................",
    "...G.Gg.........",
  ],
  [
    "....G...........",
    "................",
    "................",
    "...G..G.........",
    "................",
    "................",
    "..G.............",
  ],
]);

// 위로 달리는 몸 기준(꼬리가 아래). 화면 세로는 원근으로 줄어 가로판보다 짧게 찍었다.
const STREAK_90 = sprite("dashStreak90", [3, 0], "Gghw", "once", [40, 45, 55, 60], [
  [
    "...w...",
    "...h..h",
    "h..h..h",
    "h..h..g",
    "g..h..g",
    "g..g..G",
    "G..g...",
    "...g...",
    ".......",
    "...G...",
    "...G...",
  ],
  [
    ".......",
    ".......",
    ".......",
    "...h..h",
    "h..h..g",
    "g..g..G",
    "g..g...",
    "G......",
    "...G...",
    "...G...",
    ".......",
  ],
  [
    ".......",
    ".......",
    ".......",
    ".......",
    ".......",
    "...g..G",
    "G..g...",
    "g......",
    "...G...",
    ".......",
    "...G...",
  ],
  [
    ".......",
    ".......",
    ".......",
    ".......",
    ".......",
    ".......",
    "......G",
    "G......",
    ".......",
    "...G...",
    ".......",
  ],
]);

// 오른쪽 위로 달리는 몸 기준(꼬리가 왼쪽 아래). 계단 한 칸씩 내려가는 1px 대각선 세 줄.
const STREAK_45 = sprite("dashStreak45", [11, 0], "Gghw", "once", [40, 45, 55, 60], [
  [
    "...........w",
    ".......h..h.",
    "......g..h..",
    ".....g..h..h",
    "....G..g..g.",
    "......g..g..",
    ".....g..G...",
    ".......G....",
    "...G........",
    "..G.........",
    "............",
  ],
  [
    "............",
    "............",
    "............",
    ".....g..h...",
    "....g..h....",
    "...G..g..h..",
    ".....g..g...",
    ".......G....",
    "...G........",
    "............",
    ".G..........",
  ],
  [
    "............",
    "............",
    "............",
    "............",
    "....G.......",
    "......g.....",
    "..G.....g...",
    "....G.......",
    "......G.....",
    "..G.........",
    "............",
  ],
  [
    "............",
    "............",
    "............",
    "............",
    "............",
    "............",
    "............",
    ".G..G.......",
    "............",
    ".....G......",
    "............",
  ],
]);

// ② 흙먼지 — 오른쪽으로 달리는 발 기준(앵커 = 발, 먼지는 뒤·위로). 땅에 납작한 차오름 → 세 덩이(큰 덩이 4칸,
//    작은 덩이 2칸)로 갈라져 오름 → 줄며 짙어짐 → 두 점.
const DUST = sprite("dashDust", [7, 9], "vdDb", "once", [50, 60, 70, 80, 90], [
  [
    "..........",
    "..........",
    "..........",
    "..........",
    "..........",
    "..........",
    "..........",
    ".....vv...",
    "...vvddD..",
    "..dDDbDDb.",
  ],
  [
    "..........",
    "..........",
    "..........",
    "..........",
    "..........",
    "....vv....",
    "vv.vvdD...",
    "dD.dDDD...",
    "....DD.vd.",
    ".......Db.",
  ],
  [
    "..........",
    "..........",
    "..........",
    "...vv.....",
    "vv.vdD....",
    "D..dDD....",
    "....D.....",
    "......vD..",
    "..........",
    "..........",
  ],
  [
    "..........",
    "..........",
    "...vD.....",
    "D..DD.....",
    "..........",
    "..........",
    "......D...",
    "..........",
    "..........",
    "..........",
  ],
  [
    "..........",
    "...D......",
    "....b.....",
    "..........",
    "..........",
    "..........",
    "..........",
    "..........",
    "..........",
    "..........",
  ],
]);

// ③ 충돌 — 한 프레임 하얀 심(십자 섬광), 그 뒤 여덟 갈래 별 고리가 퍼지며 금 → 짙은 금 → 불씨로 식는다.
//    별 끝 사이 상아 점이 고리를 잇는다. 13칸 ≈ 머리 1.2배(화면 배율 2에서 머리 ≈ 20px).
const IMPACT = sprite("dashImpact", [6, 6], "Gghwpvb", "once", [40, 50, 60, 70, 80], [
  [
    "......g......",
    "......h......",
    "......h......",
    "......h......",
    ".....ghg.....",
    "....ghhhg....",
    "ghhhhhwhhhhhg",
    "....ghhhg....",
    ".....ghg.....",
    "......h......",
    "......h......",
    "......h......",
    "......g......",
  ],
  [
    ".............",
    ".............",
    "......h......",
    "...h..g..h...",
    "....g...g....",
    ".............",
    "..hg.....gh..",
    ".............",
    "....g...g....",
    "...h..g..h...",
    "......h......",
    ".............",
    ".............",
  ],
  [
    "......g......",
    "......G......",
    "..g.p...p.g..",
    "...G.....G...",
    "..p.......p..",
    ".............",
    "gG.........Gg",
    ".............",
    "..p.......p..",
    "...G.....G...",
    "..g.p...p.g..",
    "......G......",
    "......g......",
  ],
  [
    "......G......",
    "....v........",
    "..G.......G..",
    ".............",
    "...........v.",
    ".............",
    "G...........G",
    ".............",
    ".v...........",
    ".............",
    "..G.......G..",
    "........v....",
    "......G......",
  ],
  [
    ".............",
    ".............",
    ".............",
    ".............",
    ".............",
    ".............",
    ".............",
    ".G.........G.",
    ".............",
    ".............",
    ".............",
    "...b.....b...",
    ".............",
  ],
]);

// ④ 기절 별 — 도장(손으로 찍음)과 궤도(손으로 정함). 앞(아래 호)은 큰 별, 옆은 중간, 뒤(위 호)는 작고 짙은 별.
const STAR_FRONT = Object.freeze(["..g..", ".ggg.", "gghgg", ".ggg.", ".g.g."]);
const STAR_FRONT_GLINT = Object.freeze(["..g..", ".ggg.", "ggwgg", ".ggg.", ".g.g."]);
const STAR_SIDE = Object.freeze([".g.", "ghg", ".g."]);
const STAR_BACK = Object.freeze([".G.", "GgG", ".G."]);
/** 오른쪽으로 나는 새: 날개 위('v') / 아래('^'), 가운데 몸은 잉크 한 칸. */
const BIRD_UP = Object.freeze(["p...p", ".pip.", "....."]);
const BIRD_DOWN = Object.freeze([".....", ".pip.", "p...p"]);

export const PIXEL_DOT_STUN_ORBIT = Object.freeze({
  width: 25, height: 11,
  /** 타원 중심(아트 px). 앵커는 그보다 3칸 아래 — 머리 꼭대기가 거기 놓여 앞 호의 별이 머리끝을 스친다. */
  center: Object.freeze([12, 5] as const),
  rx: 9, ry: 3, frames: 8, frameMs: 70, stars: 3,
});

function stamp(grid: string[][], art: readonly string[], cx: number, cy: number, flipX = false): void {
  const h = art.length, w = art[0]?.length ?? 0, ox = cx - Math.floor(w / 2), oy = cy - Math.floor(h / 2);
  for (let y = 0; y < h; y++) {
    const row = grid[oy + y];
    if (!row) continue;
    for (let x = 0; x < w; x++) {
      const key = art[y]![flipX ? w - 1 - x : x]!;
      if (key !== "." && ox + x >= 0 && ox + x < row.length) row[ox + x] = key;
    }
  }
}

function stunFrames(withBird: boolean): string[][] {
  const o = PIXEL_DOT_STUN_ORBIT, frames: string[][] = [];
  for (let f = 0; f < o.frames; f++) {
    const grid = Array.from({ length: o.height }, () => Array.from({ length: o.width }, () => "."));
    const items: { phase: number; bird: boolean }[] = [];
    // 새가 있으면 넷이 ¼ 바퀴씩, 없으면 셋이 ⅓ 바퀴씩. (⅙ 차이는 타원 양 끝에서 같은 열에 겹쳤다 — 시트 확인)
    const orbiters = o.stars + (withBird ? 1 : 0);
    for (let i = 0; i < orbiters; i++) items.push({ phase: f / o.frames + i / orbiters, bird: i === o.stars });
    const placed = items.map(item => {
      const angle = item.phase * 2 * Math.PI;
      return { ...item, s: Math.sin(angle), x: Math.round(o.center[0] + o.rx * Math.cos(angle)), y: Math.round(o.center[1] + o.ry * Math.sin(angle)) };
    }).sort((a, b) => a.s - b.s);
    const front = placed.filter(item => !item.bird).at(-1);
    for (const item of placed) {
      if (item.bird) {
        // 앞 호에서는 왼쪽으로, 뒤 호에서는 오른쪽으로 난다(각이 늘수록 시계 방향).
        stamp(grid, f % 2 === 0 ? BIRD_UP : BIRD_DOWN, item.x, item.y - 1, item.s > 0);
        continue;
      }
      const art = item.s > 0.5 ? (item === front && f % 2 === 0 ? STAR_FRONT_GLINT : STAR_FRONT) : item.s < -0.5 ? STAR_BACK : STAR_SIDE;
      stamp(grid, art, item.x, item.y);
    }
    frames.push(grid.map(row => row.join("")));
  }
  return frames;
}

const STUN_ANCHOR: PixelDotPoint = [PIXEL_DOT_STUN_ORBIT.center[0], PIXEL_DOT_STUN_ORBIT.center[1] + 3];
const STUN_FRAME_MS = Array.from({ length: PIXEL_DOT_STUN_ORBIT.frames }, () => PIXEL_DOT_STUN_ORBIT.frameMs);
const STUN = sprite("stunStars", STUN_ANCHOR, "Gghwpi", "loop", STUN_FRAME_MS, stunFrames(true));
const STUN_CALM = sprite("stunStarsCalm", STUN_ANCHOR, "Gghw", "loop", STUN_FRAME_MS, stunFrames(false));

// ⑤ 발밑 점선 고리 — 40칸 타원 둘레를 두 칸 켜고 두 칸 끈 대시가 한 칸씩 돈다(4프레임 고리). 앞 호는 금, 뒤 호는 짙은 금.
const DAZE_RING = sprite("stunDazeRing", [10, 3], "Gg", "loop", [90, 90, 90, 90], [
  [
    "........GG..GG.......",
    "....GG..........GG...",
    ".G...................",
    "g...................g",
    "...................g.",
    "...gg..........gg....",
    ".......gg..gg........",
  ],
  [
    ".......GG..GG........",
    "...GG..........GG....",
    "...................G.",
    "g...................g",
    ".g...................",
    "....gg..........gg...",
    "........gg..gg.......",
  ],
  [
    "......GG..GG..G......",
    "...G...........G.....",
    "..G...............GG.",
    ".....................",
    ".gg...............g..",
    ".....g...........g...",
    "......g..gg..gg......",
  ],
  [
    "......G..GG..GG......",
    ".....G...........G...",
    ".GG...............G..",
    ".....................",
    "..g...............gg.",
    "...g...........g.....",
    "......gg..gg..g......",
  ],
]);

// ⑥ 예고 바닥 점(납작한 마름모) — 0 빈 점(잉크 테·짙은 빨강), 1 찬 점(주황 테·빨강 심), 2 막 찬 점(뜨거운 금·흰 반짝임).
export const TELEGRAPH_DOT_EMPTY = 0;
export const TELEGRAPH_DOT_FILLED = 1;
export const TELEGRAPH_DOT_LEAD = 2;
const TELEGRAPH_DOT = sprite("telegraphDot", [1, 1], "iRorhw", "state", [0, 0, 0], [
  [".ii.", "iRRi", ".ii."],
  [".oo.", "orro", ".RR."],
  [".hh.", "hwoh", ".oo."],
]);
// 화살촉 — 0 어둠(아직 덜 찼다), 1 켜짐. 앵커는 촉 끝.
const ARROW_0 = sprite("telegraphArrow0", [3, 2], "oriR", "state", [0, 0], [
  ["R...", "RiR.", "RiiR", "RiR.", "R..."],
  ["o...", "oro.", "orro", "oro.", "o..."],
]);
const ARROW_90 = sprite("telegraphArrow90", [2, 0], "oriR", "state", [0, 0], [
  ["..R..", ".RiR.", "RiiiR"],
  ["..o..", ".oro.", "orrro"],
]);
const ARROW_45 = sprite("telegraphArrow45", [3, 0], "oriR", "state", [0, 0], [
  ["RRRR", ".iiR", "..iR", "...R"],
  ["oooo", ".rro", "..ro", "...o"],
]);

export const PIXEL_DOT_SPRITES: Readonly<Record<PixelDotSpriteId, PixelDotSprite>> = Object.freeze({
  dashStreak0: STREAK_0, dashStreak45: STREAK_45, dashStreak90: STREAK_90, dashDust: DUST, dashImpact: IMPACT,
  stunStars: STUN, stunStarsCalm: STUN_CALM, stunDazeRing: DAZE_RING, telegraphDot: TELEGRAPH_DOT,
  telegraphArrow0: ARROW_0, telegraphArrow45: ARROW_45, telegraphArrow90: ARROW_90,
});

// ⑦ 옷가게 첫 변신(2026-10-13, `OutfitTransformationView`). 도시 뷰는 굽지 않는다 — 가게 뷰가 따로 굽는다.
//    곡선·점·고리만 쓴다(다각형 폭발 없음). 흰색은 프레임마다 한 칸.
export type PixelDotTransformSpriteId = "transformHeartBig" | "transformHeartSmall" | "transformSparkle" | "transformMote" | "transformRingDot"
  | "transformHalftone" | "transformTwinkle";

/**
 * 팝아트 하트 — 채움 모양을 손으로 찍고, 테는 코드로 두른다: 안쪽 두 칸 굵은 잉크 테 + 바깥 한 칸 상아 테(잉크 암전 위에서도
 * 잉크 테가 읽히게 — 잉크만 두르면 검은 바탕에 묻혀 테가 없는 것처럼 보였다, 2026-10-13 캡처). 모서리는 둥글게. 채움은 평평한
 * 원색 한 가지, 왼쪽 위 볼록에 흰 하이라이트 2×2. 프레임 = 색: 0 분홍 · 1 빨강 · 2 노랑 · 3 민트.
 */
const POP_HEART_FILLS = Object.freeze(["m", "r", "g", "n"]);
function popHeartFrames(fill: readonly string[], highlight: PixelDotPoint): string[][] {
  const ink = 2, pad = ink + 1, h = fill.length + pad * 2, w = (fill[0]?.length ?? 0) + pad * 2;
  const inside = (x: number, y: number): boolean => fill[y - pad]?.[x - pad] === "X";
  const near = (x: number, y: number, r: number): boolean => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.abs(dx) + Math.abs(dy) <= r + 1 && inside(x + dx, y + dy)) return true;
    }
    return false;
  };
  const shape = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) =>
    inside(x, y) ? "F" : near(x, y, ink) ? "i" : near(x, y, pad) ? "v" : "."));
  const lit = (x: number, y: number): boolean => x - pad >= highlight[0] && x - pad <= highlight[0] + 1
    && y - pad >= highlight[1] && y - pad <= highlight[1] + 1;
  return POP_HEART_FILLS.map(key => shape.map((row, y) => row.map((cell, x) => cell === "F" ? (lit(x, y) ? "w" : key) : cell).join("")));
}
const TRANSFORM_HEART_BIG = sprite("transformHeartBig", [7, 6], "ivmrgnw", "state", [0, 0, 0, 0], popHeartFrames([
  ".XX...XX.",
  "XXXX.XXXX",
  "XXXXXXXXX",
  "XXXXXXXXX",
  ".XXXXXXX.",
  "..XXXXX..",
  "...XXX...",
  "....X....",
], [1, 1]));
const TRANSFORM_HEART_SMALL = sprite("transformHeartSmall", [6, 5], "ivmrgnw", "state", [0, 0, 0, 0], popHeartFrames([
  ".XX.XX.",
  "XXXXXXX",
  "XXXXXXX",
  ".XXXXX.",
  "..XXX..",
  "...X...",
], [1, 1]));

/** 네 갈래 반짝임 — 0 작게, 1 크게, 2 중간(윙크·결정 포즈). */
const TRANSFORM_SPARKLE = sprite("transformSparkle", [3, 3], "ghw", "state", [0, 0, 0], [
  [".......", ".......", "...h...", "..hwh..", "...h...", ".......", "......."],
  ["...g...", "...h...", "...h...", "ghhwhhg", "...h...", "...h...", "...g..."],
  [".......", "...g...", "...h...", ".ghwhg.", "...h...", "...g...", "......."],
]);

/** 빨려 드는 빛 점(3×3) — 0 뜨거운 점, 1 금 점(몸에 가까워지며), 2 꼬리 한 칸, 3 몸에 닿는 순간의 반짝(네 귀 + 흰 심). */
const TRANSFORM_MOTE = sprite("transformMote", [1, 1], "ghw", "state", [0, 0, 0, 0], [
  ["hhh", "hwh", "hhh"],
  ["ghg", "hhh", "ghg"],
  ["...", ".h.", "..."],
  ["h.h", ".w.", "h.h"],
]);

/** 배경 별 — 0 보라 점, 1 보라 십자에 분홍 심, 2 분홍 점. */
const TRANSFORM_TWINKLE = sprite("transformTwinkle", [1, 1], "um", "state", [0, 0, 0], [
  ["...", ".u.", "..."],
  [".u.", "umu", ".u."],
  ["...", ".m.", "..."],
]);

/** 벤데이 점 고리의 점(2×2) — 0 분홍, 1 노랑. */
const TRANSFORM_HALFTONE = sprite("transformHalftone", [0, 0], "mg", "state", [0, 0], [
  ["mm", "mm"],
  ["gg", "gg"],
]);

/**
 * 점 고리를 이루는 점 하나(2×2) — 0 금, 1 분홍, 2 노랑. 팡의 고리(`burstRings`, 금·분홍)와 하트 고리의 점선 궤적
 * (`orbitTrailDot`, 안쪽 분홍·바깥 노랑)은 뷰가 이 점을 늘어놓아 만든다.
 */
const TRANSFORM_RING_DOT = sprite("transformRingDot", [0, 0], "ghme", "state", [0, 0, 0], [
  ["hh", "hg"],
  ["mm", "me"],
  ["gg", "gg"],
]);

export const PIXEL_DOT_TRANSFORM_SPRITES: Readonly<Record<PixelDotTransformSpriteId, PixelDotSprite<PixelDotTransformSpriteId>>> = Object.freeze({
  transformHeartBig: TRANSFORM_HEART_BIG, transformHeartSmall: TRANSFORM_HEART_SMALL, transformSparkle: TRANSFORM_SPARKLE,
  transformMote: TRANSFORM_MOTE, transformRingDot: TRANSFORM_RING_DOT, transformHalftone: TRANSFORM_HALFTONE, transformTwinkle: TRANSFORM_TWINKLE,
});

/** 이펙트 → 그 이펙트를 이루는 격자들(시트·보고용). */
export const PIXEL_DOT_EFFECTS = Object.freeze({
  dashStreak: ["dashStreak0", "dashStreak45", "dashStreak90"],
  dashDust: ["dashDust"],
  dashImpact: ["dashImpact"],
  stunStars: ["stunStars", "stunStarsCalm"],
  stunDazeRing: ["stunDazeRing"],
  telegraphLine: ["telegraphDot", "telegraphArrow0", "telegraphArrow45", "telegraphArrow90"],
} as const satisfies Record<string, readonly PixelDotSpriteId[]>);

/** 수치. 시간은 이펙트 시계(ms), 거리는 따로 적지 않으면 아트 px. */
export const PIXEL_DOT_FX = Object.freeze({
  /** 화면 배우 키 / 이 값 → 아트 픽셀 하나의 화면 px(정수). 75~124px → 2, 125px~ → 3. */
  scale: Object.freeze({ actorArtPx: 50, min: 2, max: 4 }),
  /** 동시에 사는 일회성 조각(속도선·먼지·충돌) 상한. 넘치면 가장 오래된 것이 비킨다. */
  budget: Object.freeze({ transient: 24, transientCalm: 12, telegraphDots: 14 }),
  dash: Object.freeze({
    streakEveryMs: 45, streakEveryCalmMs: 90, dustEveryMs: 110, dustEveryCalmMs: 220,
    /** 속도선 높이(돌진하는 몸 키 비율): 가슴·무릎 두 줄, 차분 모드는 허리 한 줄. */
    streakLifts: Object.freeze([0.62, 0.34]), streakLiftCalm: 0.5,
    /** 둘째 줄은 이만큼 늦게 — 두 줄이 같은 박자로 찍히면 기계처럼 보인다. */
    streakStaggerMs: 20,
    /**
     * With the charge's speed (share of top speed, 2026-10-09): the streak / dust beat x (1 - speedBeat * share) - more segments at
     * the peak - and at `peakShare` or more a third streak line at `peakLift` (not in the calm mode).
     */
    speedBeat: 0.55, peakShare: 0.85, peakLift: 0.48,
    startDust: 3, startDustCalm: 1, impactDust: 2, impactDustCalm: 1,
    /** 흩뿌림 범위(아트 px): 먼지는 뒤쪽으로 치우친다. */
    dustSpreadX: Object.freeze([-6, 1] as const), dustSpreadY: Object.freeze([-1, 1] as const), dustDelayMs: 60,
  }),
  /** 충돌점 기본 높이(맞은 몸 키 비율). */
  impactLift: 0.55,
  stun: Object.freeze({ fadeMs: 240, endFadeMs: 120, calmFrameScale: 1.6, ringAlpha: 0.55 }),
  telegraph: Object.freeze({ spacingArtPx: 5, startGapArtPx: 6, endGapArtPx: 6, freshMs: 150, blinkMs: 90, emptyAlpha: 0.55 }),
  /** 3D 카드 모드는 모든 조각이 배우 위에 그려진다 — 바닥·몸 뒤 조각을 이만큼 흐리게. */
  cardAlpha: 0.75,
  /** 몸 뒤에 앉는 조각의 깊이 빼기(쿠마 기 모으기 `AURA_BEHIND` 보다 몸에 가깝다). */
  behindDepth: 0.0003,
});

/** 화면 배우 키(CSS px) → 아트 픽셀 하나의 화면 px. 항상 정수라 점이 번지지 않는다. */
export function pixelDotScale(actorScreenPx: number): number {
  const s = PIXEL_DOT_FX.scale;
  if (!Number.isFinite(actorScreenPx) || actorScreenPx <= 0) return s.min;
  return Math.max(s.min, Math.min(s.max, Math.round(actorScreenPx / s.actorArtPx)));
}

/** 한 번 재생하는 격자의 길이(ms). `loop` 는 한 바퀴. */
export function pixelDotDuration(sprite: PixelDotSprite<string>): number {
  return sprite.frameMs.reduce((sum, ms) => sum + ms, 0);
}

/** 나이 → 프레임. `once` 가 끝났으면 -1, `state` 는 늘 0. */
export function pixelDotFrameAt(sprite: PixelDotSprite<string>, ageMs: number, frameScale = 1): number {
  if (sprite.playback === "state") return 0;
  const scale = Number.isFinite(frameScale) && frameScale > 0 ? frameScale : 1;
  const total = pixelDotDuration(sprite) * scale;
  if (!(total > 0) || !Number.isFinite(ageMs) || ageMs < 0) return ageMs < 0 ? -1 : 0;
  let t = ageMs;
  if (sprite.playback === "loop") t %= total;
  else if (t >= total) return -1;
  for (let f = 0; f < sprite.frameMs.length; f++) {
    t -= sprite.frameMs[f]! * scale;
    if (t < 0) return f;
  }
  return sprite.frameMs.length - 1;
}

/** 화면 방향(y 아래) → 8방위 0=동 1=북동 2=북 3=북서 4=서 5=남서 6=남 7=남동. 길이 0 이면 동. */
export function pixelDotOctant(dx: number, dy: number): number {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < 1e-9) return 0;
  return ((Math.round(Math.atan2(-dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
}

export interface PixelDotOrientation { readonly sprite: PixelDotSpriteId; readonly flipX: boolean; readonly flipY: boolean }

/** 방향을 타는 격자(속도선·화살촉): 0°·45°·90° 세 벌 + 뒤집기로 8방위. */
export function pixelDotOriented(effect: "dashStreak" | "telegraphArrow", octant: number): PixelDotOrientation {
  const o = ((Math.round(octant) % 8) + 8) % 8;
  const angle = o === 0 || o === 4 ? "0" : o === 2 || o === 6 ? "90" : "45";
  return { sprite: `${effect}${angle}` as PixelDotSpriteId, flipX: o === 3 || o === 4 || o === 5, flipY: o === 5 || o === 6 || o === 7 };
}

/** 결정적 난수(시드 → 0..1). */
export function pixelDotRng(seed: number): () => number {
  return fxRng(Number.isFinite(seed) ? Math.floor(seed) : 0);
}

export interface PixelDotScatter {
  /** 아트 px(정수). */
  readonly dx: number;
  readonly dy: number;
  readonly delayMs: number;
}

/** 시드로 흩뿌린 사본들. 같은 시드는 언제나 같은 자리·같은 지연이다. */
export function pixelDotScatter(seed: number, count: number, spreadX: readonly [number, number], spreadY: readonly [number, number],
  maxDelayMs: number): PixelDotScatter[] {
  const rng = pixelDotRng(seed), out: PixelDotScatter[] = [];
  const n = Math.max(0, Math.min(16, Math.floor(count)));
  const pick = (range: readonly [number, number]) => Math.round(range[0] + (range[1] - range[0]) * rng());
  for (let i = 0; i < n; i++) {
    out.push({ dx: pickInt(pick(spreadX)), dy: pickInt(pick(spreadY)), delayMs: i === 0 ? 0 : Math.round(rng() * Math.max(0, maxDelayMs)) });
  }
  return out;
}
const pickInt = (v: number): number => (Object.is(v, -0) ? 0 : v);

export type PixelDotLayer = "ground" | "behind" | "over";

/** 한 조각을 그리는 데 필요한 전부. 좌표는 칸 격자에 붙은 좌상단 월드 px. */
export interface PixelDotDraw {
  readonly sprite: PixelDotSpriteId;
  readonly frame: number;
  readonly x: number;
  readonly y: number;
  /** 월드 px 당 아트 픽셀 한 칸(이미지 배율). */
  readonly cell: number;
  readonly flipX: boolean;
  readonly flipY: boolean;
  readonly alpha: number;
  readonly layer: PixelDotLayer;
  /** `behind` 의 y 정렬 기준 — 그 조각을 낳은 발의 월드 y. */
  readonly sortY: number;
}

/** 앵커 칸 중심을 `at`(월드 px)에, 좌상단을 `cell` 격자에 붙인다. 뒤집으면 앵커도 뒤집힌다. */
export function pixelDotPlace(sprite: PixelDotSprite, at: PixelDotPoint, cell: number, flipX = false, flipY = false,
  offsetArt: PixelDotPoint = [0, 0]): PixelDotPoint {
  const c = Number.isFinite(cell) && cell > 0 ? cell : 1;
  const ax = flipX ? sprite.width - 1 - sprite.anchor[0] : sprite.anchor[0];
  const ay = flipY ? sprite.height - 1 - sprite.anchor[1] : sprite.anchor[1];
  const x = at[0] + (offsetArt[0] - ax - 0.5) * c, y = at[1] + (offsetArt[1] - ay - 0.5) * c;
  return [Math.round(x / c) * c, Math.round(y / c) * c];
}

export interface PixelDotTelegraphStamp {
  readonly sprite: PixelDotSpriteId;
  readonly frame: number;
  /** 앵커가 놓일 월드 px. */
  readonly at: PixelDotPoint;
  readonly flipX: boolean;
  readonly flipY: boolean;
  readonly alpha: number;
}

/**
 * 예고선 배치(투영된 월드 px). 출발점에서 `startGapArtPx` 떨어져 `spacingArtPx` 마다 점, 끝에 화살촉. 진행도는 계단으로 —
 * `floor(progress × n)` 개가 차고 그중 마지막이 막 찬 점(뜨거운 금)이다. 다 차면 화살촉이 켜지고(차분 모드가 아니면
 * `blinkMs` 박자로 깜빡인다). 너무 길면 점 수를 상한에 맞춰 간격을 넓힌다.
 */
export function pixelDotTelegraphLayout(from: PixelDotPoint, to: PixelDotPoint, progress: number, cell: number, nowMs: number,
  calm: boolean): PixelDotTelegraphStamp[] {
  const t = PIXEL_DOT_FX.telegraph, c = Number.isFinite(cell) && cell > 0 ? cell : 1;
  const dx = to[0] - from[0], dy = to[1] - from[1], length = Math.hypot(dx, dy) / c;
  if (!Number.isFinite(length) || length < t.startGapArtPx + t.endGapArtPx) return [];
  const ux = dx / (length * c), uy = dy / (length * c);
  const p = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  const span = length - t.startGapArtPx - t.endGapArtPx;
  let n = Math.floor(span / t.spacingArtPx) + 1, spacing = t.spacingArtPx;
  if (n > PIXEL_DOT_FX.budget.telegraphDots) { n = PIXEL_DOT_FX.budget.telegraphDots; spacing = span / (n - 1); }
  const filled = Math.floor(p * n + 1e-9), out: PixelDotTelegraphStamp[] = [];
  for (let i = 0; i < n; i++) {
    const d = (t.startGapArtPx + i * spacing) * c;
    const frame = i >= filled ? TELEGRAPH_DOT_EMPTY : i === filled - 1 && filled < n ? TELEGRAPH_DOT_LEAD : TELEGRAPH_DOT_FILLED;
    out.push({ sprite: "telegraphDot", frame, at: [from[0] + ux * d, from[1] + uy * d], flipX: false, flipY: false,
      alpha: frame === TELEGRAPH_DOT_EMPTY ? t.emptyAlpha : 1 });
  }
  const arrow = pixelDotOriented("telegraphArrow", pixelDotOctant(dx, dy));
  const ready = filled >= n, lit = ready && (calm || Math.floor(nowMs / t.blinkMs) % 2 === 0);
  out.push({ sprite: arrow.sprite, frame: lit ? 1 : 0, at: to, flipX: arrow.flipX, flipY: arrow.flipY, alpha: ready ? 1 : t.emptyAlpha });
  return out;
}

type Project = (point: PixelDotPoint) => PixelDotPoint;

interface Transient {
  readonly serial: number;
  readonly effect: "dashStreak" | "dashDust" | "dashImpact";
  readonly bornMs: number;
  /** 이만큼 늦게 나타난다. */
  readonly delayMs: number;
  /** 나이를 이만큼 건너뛰고 시작(차분 모드 충돌은 하얀 심 프레임을 건너뛴다). */
  readonly skipMs: number;
  /** 바닥 점(평면). */
  readonly at: PixelDotPoint;
  /** 바닥에서 올린 높이(월드 px). */
  readonly liftPx: number;
  /** 화면 아트 px 오프셋(뒤집기 전 기준). */
  readonly offset: PixelDotPoint;
  /** 평면 방향(그릴 때 투영해 8방위를 고른다). */
  readonly dir: PixelDotPoint;
  /** 세로 돌진의 먼지는 좌우가 없어 시드로 고른다. */
  readonly flipHint: boolean;
}

interface Stun {
  head: PixelDotPoint;
  feet: PixelDotPoint | null;
  readonly startMs: number;
  endMs: number;
}

interface Telegraph { readonly from: PixelDotPoint; readonly to: PixelDotPoint; readonly progress: number; readonly setMs: number }

export interface PixelDotMode { readonly reducedMotion: boolean; readonly cardMode: boolean }

/**
 * 도트 이펙트의 상태 — 무엇이 어디서 몇 살인가. Phaser 를 모른다(`PixelDotFxView` 가 그린다).
 * 시계는 `update(dt, rate)` 로만 흐른다(히트스톱이면 rate 를 낮춘다). 같은 호출 순서는 언제나 같은 그림이다.
 */
export class PixelDotFxState {
  private nowMs = 0;
  private serial = 0;
  private transients: Transient[] = [];
  private stun: Stun | null = null;
  private tele: Telegraph | null = null;
  private lastStreakMs = Number.NEGATIVE_INFINITY;
  private lastDustMs = Number.NEGATIVE_INFINITY;
  private mode: PixelDotMode;

  constructor(mode: Partial<PixelDotMode> = {}, private readonly seed = 0x5eed) {
    this.mode = { reducedMotion: mode.reducedMotion === true, cardMode: mode.cardMode === true };
  }

  setMode(mode: PixelDotMode): void { this.mode = { reducedMotion: mode.reducedMotion, cardMode: mode.cardMode }; }

  /** 차분: 움직임 줄이기 또는 3D 카드(배우 위로 그려지므로 수를 줄인다). */
  private get calm(): boolean { return this.mode.reducedMotion || this.mode.cardMode; }

  /** 일회성 조각 상한(지금 모드). */
  get transientCap(): number { return this.calm ? PIXEL_DOT_FX.budget.transientCalm : PIXEL_DOT_FX.budget.transient; }

  /** 살아 있는 일회성 조각 수. */
  get transientCount(): number { return this.transients.length; }

  get clockMs(): number { return this.nowMs; }

  /**
   * 돌진 출발: 발밑 흙먼지가 터지고 첫 속도선이 찍힌다. 예고선은 거둔다.
   * `from`·`to` 평면 점, `dir` 평면 방향(0이면 `to - from`), `bodyPx` 돌진하는 몸 키(월드 px).
   */
  dashStart(from: PixelDotPoint, to: PixelDotPoint, dir: PixelDotPoint, bodyPx: number): void {
    this.tele = null;
    const heading: PixelDotPoint = nonZero(dir) ? dir : [to[0] - from[0], to[1] - from[1]];
    const d = PIXEL_DOT_FX.dash, count = this.calm ? d.startDustCalm : d.startDust;
    this.spawnDust(from, heading, count, d.dustDelayMs);
    this.lastDustMs = this.nowMs;
    this.lastStreakMs = Number.NEGATIVE_INFINITY;
    this.dashTick(from, heading, bodyPx);
  }

  /**
   * 돌진 중 매 프레임: 박자마다 속도선과 먼지를 그 자리에 남긴다. `pos` 평면 발, `dir` 평면 방향. `speedShare`(0..1, 최고 속도 비율,
   * 없으면 예전 박자): 빠를수록 박자가 촘촘해지고 정점에서는 속도선이 한 줄 더 생긴다.
   */
  dashTick(pos: PixelDotPoint, dir: PixelDotPoint, bodyPx: number, speedShare?: number): void {
    if (!usable(pos)) return;
    const d = PIXEL_DOT_FX.dash, calm = this.calm, body = Number.isFinite(bodyPx) && bodyPx > 0 ? bodyPx : 0;
    const share = speedShare === undefined || !Number.isFinite(speedShare) ? null : Math.max(0, Math.min(1, speedShare));
    const beat = share === null ? 1 : 1 - d.speedBeat * share;
    if (this.nowMs - this.lastStreakMs >= (calm ? d.streakEveryCalmMs : d.streakEveryMs) * beat) {
      this.lastStreakMs = this.nowMs;
      const lifts = calm ? [d.streakLiftCalm] : share !== null && share >= d.peakShare ? [...d.streakLifts, d.peakLift] : d.streakLifts;
      const rng = pixelDotRng(this.nextSeed());
      lifts.forEach((lift, i) => this.push({ effect: "dashStreak", delayMs: i * d.streakStaggerMs, skipMs: 0, at: pos, liftPx: body * lift,
        offset: [0, Math.round(rng() * 2) - 1], dir, flipHint: false }));
    }
    if (this.nowMs - this.lastDustMs >= (calm ? d.dustEveryCalmMs : d.dustEveryMs) * beat) {
      this.lastDustMs = this.nowMs;
      this.spawnDust(pos, dir, 1, 0);
    }
  }

  /** 충돌: 접촉점(평면 발 `point` 에서 `liftPx` 위)에 별 고리, 발밑에 먼지. 차분 모드는 하얀 심 프레임을 건너뛴다. */
  dashImpact(point: PixelDotPoint, dir: PixelDotPoint, liftPx: number): void {
    if (!usable(point)) return;
    const d = PIXEL_DOT_FX.dash, calm = this.mode.reducedMotion;
    this.push({ effect: "dashImpact", delayMs: 0, skipMs: calm ? IMPACT.frameMs[0]! : 0, at: point,
      liftPx: Number.isFinite(liftPx) ? Math.max(0, liftPx) : 0, offset: [0, 0], dir, flipHint: false });
    this.spawnDust(point, dir, this.calm ? d.impactDustCalm : d.impactDust, d.dustDelayMs / 2);
  }

  /** 기절 시작: 머리 위 별이 `durationMs` 동안 돈다. `head` 월드 px(머리 꼭대기), `feet` 평면 발(있으면 발밑 고리). */
  stunStart(head: PixelDotPoint, durationMs: number, feet: PixelDotPoint | null = null): void {
    const ms = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
    this.stun = { head, feet, startMs: this.nowMs, endMs: this.nowMs + ms };
  }

  /** 기절 중 매 프레임: 머리(월드 px)·발(평면)을 따라간다. */
  stunUpdate(head: PixelDotPoint, feet?: PixelDotPoint | null): void {
    if (!this.stun) return;
    if (usable(head)) this.stun.head = head;
    if (feet !== undefined) this.stun.feet = feet;
  }

  /** 기절 끝: 짧게(`endFadeMs`) 계단으로 꺼진다. */
  stunEnd(): void {
    if (!this.stun) return;
    this.stun.endMs = Math.min(this.stun.endMs, this.nowMs + PIXEL_DOT_FX.stun.endFadeMs);
  }

  get stunned(): boolean { return this.stun !== null; }

  /** 예고선(평면 `from` → `to`, 진행 0..1). 와인드업 동안 매 프레임 부른다 — 끊기면 `freshMs` 뒤 사라진다. */
  telegraph(from: PixelDotPoint, to: PixelDotPoint, progress: number): void {
    if (!usable(from) || !usable(to)) return;
    this.tele = { from, to, progress, setMs: this.nowMs };
  }

  telegraphEnd(): void { this.tele = null; }

  /** 시계를 `dtMs × rate` 만큼 흘리고 끝난 조각을 걷는다. */
  update(dtMs: number, rate = 1): void {
    const dt = Number.isFinite(dtMs) ? Math.max(0, Math.min(100, dtMs)) : 0;
    this.nowMs += dt * (Number.isFinite(rate) ? Math.max(0, rate) : 1);
    this.transients = this.transients.filter(item => {
      const age = this.nowMs - item.bornMs - item.delayMs + item.skipMs;
      return age < pixelDotDuration(PIXEL_DOT_SPRITES[spriteOf(item.effect)]);
    });
    if (this.stun && this.nowMs >= this.stun.endMs) this.stun = null;
    if (this.tele && this.nowMs - this.tele.setMs > PIXEL_DOT_FX.telegraph.freshMs) this.tele = null;
  }

  /**
   * 지금 그릴 조각들. `project` 평면 → 월드 px(지금 투영), `cell` 아트 픽셀 하나의 월드 px(`pixelDotScale × 월드px/화면px`).
   * 순서: 바닥 → 몸 뒤 → 위(같은 층 안에서는 생긴 순서).
   */
  draws(project: Project, cell: number): PixelDotDraw[] {
    const out: PixelDotDraw[] = [], card = this.mode.cardMode ? PIXEL_DOT_FX.cardAlpha : 1, calm = this.mode.reducedMotion;
    if (this.tele) {
      const from = project(this.tele.from), to = project(this.tele.to);
      for (const s of pixelDotTelegraphLayout(from, to, this.tele.progress, cell, this.nowMs, calm)) {
        const sprite = PIXEL_DOT_SPRITES[s.sprite], [x, y] = pixelDotPlace(sprite, s.at, cell, s.flipX, s.flipY);
        out.push({ sprite: s.sprite, frame: s.frame, x, y, cell, flipX: s.flipX, flipY: s.flipY, alpha: s.alpha * card, layer: "ground", sortY: s.at[1] });
      }
    }
    const stun = this.stun, stunAge = stun ? this.nowMs - stun.startMs : 0;
    const stunAlpha = stun ? steppedFade(stun.endMs - this.nowMs, PIXEL_DOT_FX.stun.fadeMs) : 0;
    if (stun?.feet && usable(stun.feet)) {
      const at = project(stun.feet), ring = DAZE_RING, [x, y] = pixelDotPlace(ring, at, cell);
      out.push({ sprite: ring.id, frame: pixelDotFrameAt(ring, stunAge, calm ? PIXEL_DOT_FX.stun.calmFrameScale : 1), x, y, cell, flipX: false,
        flipY: false, alpha: PIXEL_DOT_FX.stun.ringAlpha * stunAlpha * card, layer: "ground", sortY: at[1] });
    }
    const behind: PixelDotDraw[] = [], over: PixelDotDraw[] = [];
    for (const item of this.transients) {
      const age = this.nowMs - item.bornMs - item.delayMs + item.skipMs;
      if (age < 0) continue;
      const feet = project(item.at), at: PixelDotPoint = [feet[0], feet[1] - item.liftPx];
      const ahead = project([item.at[0] + item.dir[0], item.at[1] + item.dir[1]]);
      const octant = pixelDotOctant(ahead[0] - feet[0], ahead[1] - feet[1]);
      let id: PixelDotSpriteId, flipX = false, flipY = false;
      if (item.effect === "dashStreak") ({ sprite: id, flipX, flipY } = pixelDotOriented("dashStreak", octant));
      else if (item.effect === "dashDust") { id = "dashDust"; flipX = octant === 2 || octant === 6 ? item.flipHint : octant >= 3 && octant <= 5; }
      else id = "dashImpact";
      const sprite = PIXEL_DOT_SPRITES[id], frame = pixelDotFrameAt(sprite, age);
      if (frame < 0) continue;
      const offset: PixelDotPoint = [flipX ? -item.offset[0] : item.offset[0], item.offset[1]];
      const [x, y] = pixelDotPlace(sprite, at, cell, flipX, flipY, offset);
      const draw: PixelDotDraw = { sprite: id, frame, x, y, cell, flipX, flipY, alpha: item.effect === "dashImpact" ? 1 : card,
        layer: item.effect === "dashImpact" ? "over" : "behind", sortY: feet[1] };
      (draw.layer === "over" ? over : behind).push(draw);
    }
    out.push(...behind, ...over);
    if (stun && usable(stun.head)) {
      const stars = PIXEL_DOT_SPRITES[calm || this.mode.cardMode ? "stunStarsCalm" : "stunStars"];
      const [x, y] = pixelDotPlace(stars, stun.head, cell);
      out.push({ sprite: stars.id, frame: pixelDotFrameAt(stars, stunAge, calm ? PIXEL_DOT_FX.stun.calmFrameScale : 1), x, y, cell, flipX: false,
        flipY: false, alpha: stunAlpha, layer: "over", sortY: stun.head[1] });
    }
    return out;
  }

  /** 모든 조각을 지운다(시계는 그대로). */
  clear(): void {
    this.transients = [];
    this.stun = null;
    this.tele = null;
  }

  private spawnDust(at: PixelDotPoint, dir: PixelDotPoint, count: number, maxDelayMs: number): void {
    const d = PIXEL_DOT_FX.dash, seed = this.nextSeed();
    pixelDotScatter(seed, count, d.dustSpreadX, d.dustSpreadY, maxDelayMs).forEach((s, i) => this.push({ effect: "dashDust",
      delayMs: s.delayMs, skipMs: 0, at, liftPx: 0, offset: [s.dx, s.dy], dir, flipHint: ((seed >>> i) & 1) === 1 }));
  }

  private push(item: Omit<Transient, "serial" | "bornMs">): void {
    this.transients.push({ ...item, serial: this.serial, bornMs: this.nowMs });
    this.serial += 1;
    const cap = this.transientCap;
    if (this.transients.length > cap) this.transients.splice(0, this.transients.length - cap);
  }

  private nextSeed(): number {
    this.serial += 1;
    return (Math.imul(this.serial, 0x9e3779b1) ^ this.seed) >>> 0;
  }
}

const spriteOf = (effect: Transient["effect"]): PixelDotSpriteId =>
  effect === "dashStreak" ? "dashStreak0" : effect === "dashDust" ? "dashDust" : "dashImpact";

const nonZero = (p: PixelDotPoint): boolean => usable(p) && Math.hypot(p[0], p[1]) > 1e-9;

const usable = (p: PixelDotPoint | null | undefined): p is PixelDotPoint =>
  p !== null && p !== undefined && Number.isFinite(p[0]) && Number.isFinite(p[1]);

/** 남은 시간이 `fadeMs` 안이면 1 → ⅔ → ⅓ 세 계단(도트는 부드럽게 흐려지지 않는다). */
function steppedFade(remainingMs: number, fadeMs: number): number {
  if (!(fadeMs > 0) || remainingMs >= fadeMs) return 1;
  return Math.max(0, Math.ceil(Math.max(0, remainingMs) / fadeMs * 3) / 3);
}
