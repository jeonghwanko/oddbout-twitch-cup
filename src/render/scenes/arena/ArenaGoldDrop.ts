/**
 * 컵 대표 경기의 금화 동전 연출 박자(2026-10-27, docs/Plan/2026-10-27-oddbout-cup-champion-and-gold G3 — 사용자: "경기에서 승리하면 골드가
 * 드롭되었다가 우상단으로 빨려들어가게"). 이긴 경기: 동전이 진 선수의 발치에서 튀어 올라 바닥에 두세 번 튕기고(`bounceMs`), 잠깐 머문 뒤
 * (`holdMs` — 빛이 한 번 반짝), 하나씩 `staggerMs` 간격으로 카운터 아래 지점까지 곡선으로 빨려 올라간다(끝으로 갈수록 빠르게). 진 경기는
 * 위로금: 동전 셋이 튕기지 않고 조용히 올라간다. 동전 수는 금액이 아니라 크기 느낌(20 → 5, 40 → 8, 80 → 12, 160 → 20). 금액은 동전마다
 * 나눠 닿을 때 카운터에 더한다(합은 금액 그대로). 여기는 좌표와 시간만 — 화면은 `ArenaGoldDropView`. 좌표는 화면 논리 px.
 */

export const ARENA_GOLD_DROP = Object.freeze({
  /** A won bout's coins by its gold (the first row it reaches), and a lost bout's. */
  coins: Object.freeze([Object.freeze({ from: 160, count: 20 }), Object.freeze({ from: 80, count: 12 }), Object.freeze({ from: 40, count: 8 }),
    Object.freeze({ from: 0, count: 5 })]),
  lossCoins: 3,
  /** The bounces (ms): all of them, each arc's share of it and height (of the coin's own first hop). */
  bounceMs: 600,
  arcs: Object.freeze([Object.freeze({ share: 0.5, height: 1 }), Object.freeze({ share: 0.3, height: 0.4 }), Object.freeze({ share: 0.2, height: 0.15 })]),
  /** The first hop's height (px) and each coin's own spread round it (±share), how far the coins scatter sideways (px each side). */
  hopPx: 110,
  hopSpread: 0.3,
  /** The room kept over the highest hop (px from the screen's top — a slot near the top hops lower). */
  hopRoomPx: 16,
  scatterPx: 90,
  /** The rest on the floor before the flight (the shine), the flight, the coins' spacing in it, how much a coin shrinks by its end. */
  holdMs: 250,
  flyMs: 520,
  staggerMs: 40,
  flyScale: 0.55,
  /** The flight's bend (px sideways at its middle, alternating by coin). */
  bendPx: 60,
  /** A lost bout's coins: each rises in `riseMs`, `riseStaggerMs` apart, fading in over the first `fadeShare`. */
  riseMs: 900,
  riseStaggerMs: 120,
  fadeShare: 0.15,
  /** On the duel screen: the drop starts this long after the bout's end (the KO cut-in or the winner card stands, + 0.3 s). */
  afterCardMs: 900,
});

export interface ArenaGoldPoint {
  readonly x: number;
  readonly y: number;
}

/** One coin: its gold, when it reaches the counter, and its own course. */
export interface ArenaGoldCoin {
  readonly share: number;
  readonly landMs: number;
  readonly restX: number;
  readonly hopPx: number;
  readonly flyFromMs: number;
  readonly bend: number;
}

export interface ArenaGoldDropPlan {
  readonly won: boolean;
  readonly from: ArenaGoldPoint;
  readonly to: ArenaGoldPoint;
  readonly coins: readonly ArenaGoldCoin[];
  /** The last coin's landing. */
  readonly endMs: number;
}

/** Where a coin is at a moment: its place, size and opacity, and what it is doing. */
export interface ArenaGoldCoinPose extends ArenaGoldPoint {
  readonly scale: number;
  readonly alpha: number;
  readonly phase: "bounce" | "rest" | "fly" | "landed";
}

/** How many coins `amount` drops: by the won table, 3 for a lost bout — never more coins than gold. */
export function arenaGoldCoinCount(amount: number, won: boolean): number {
  if (!(amount > 0)) return 0;
  const count = won ? ARENA_GOLD_DROP.coins.find(row => amount >= row.from)!.count : ARENA_GOLD_DROP.lossCoins;
  return Math.min(count, Math.floor(amount));
}

/** `amount` split over `count` coins: as even as whole coins go, the first ones taking the remainder (the sum is `amount`). */
export function arenaGoldShares(amount: number, count: number): number[] {
  if (count <= 0) return [];
  const each = Math.floor(amount / count), extra = amount - each * count;
  return Array.from({ length: count }, (_, i) => each + (i < extra ? 1 : 0));
}

/** A fixed spread in [-1, 1] for coin `i` (the golden ratio's walk — no randomness, the same drop every time). */
function spread(i: number): number {
  return ((i * 0.618034 + 0.37) % 1) * 2 - 1;
}

/** The drop of `amount` gold from `from` (the floor there) to `to`. */
export function arenaGoldDropPlan(amount: number, won: boolean, from: ArenaGoldPoint, to: ArenaGoldPoint): ArenaGoldDropPlan {
  const D = ARENA_GOLD_DROP, shares = arenaGoldShares(amount, arenaGoldCoinCount(amount, won));
  const room = Math.max(0, from.y - D.hopRoomPx);
  const coins = shares.map((share, i): ArenaGoldCoin => {
    const flyFromMs = won ? D.bounceMs + D.holdMs + i * D.staggerMs : i * D.riseStaggerMs;
    return { share, flyFromMs, landMs: flyFromMs + (won ? D.flyMs : D.riseMs),
      restX: from.x + spread(i) * (won ? D.scatterPx : D.scatterPx / 3), hopPx: Math.min(room, D.hopPx * (1 + spread(i + 7) * D.hopSpread)),
      bend: (i % 2 === 0 ? 1 : -1) * D.bendPx };
  });
  return { won, from, to, coins, endMs: coins.reduce((end, coin) => Math.max(end, coin.landMs), 0) };
}

/** The height over the floor `ms` into the bounces of a coin hopping `hopPx` first. */
function bounceHeight(ms: number, hopPx: number): number {
  let start = 0;
  for (const arc of ARENA_GOLD_DROP.arcs) {
    const length = arc.share * ARENA_GOLD_DROP.bounceMs;
    if (ms < start + length) { const t = (ms - start) / length; return hopPx * arc.height * 4 * t * (1 - t); }
    start += length;
  }
  return 0;
}

/** A quadratic curve's point. */
function curve(a: ArenaGoldPoint, c: ArenaGoldPoint, b: ArenaGoldPoint, t: number): ArenaGoldPoint {
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
}

/** Coin `index` of `plan` at `ms` into the drop. */
export function arenaGoldCoinAt(plan: ArenaGoldDropPlan, index: number, ms: number): ArenaGoldCoinPose {
  const D = ARENA_GOLD_DROP, coin = plan.coins[index]!, floor = plan.from.y;
  if (ms >= coin.landMs) return { ...plan.to, scale: D.flyScale, alpha: 0, phase: "landed" };
  if (!plan.won) {
    // 위로금: straight up from his feet, slow, no bounce — a soft ease both ends.
    const t = Math.max(0, (ms - coin.flyFromMs) / (coin.landMs - coin.flyFromMs)), eased = t * t * (3 - 2 * t);
    const start = { x: coin.restX, y: floor }, control = { x: coin.restX, y: floor + (plan.to.y - floor) * 0.5 };
    return { ...curve(start, control, plan.to, eased), scale: 1 - (1 - D.flyScale) * eased, alpha: ms < coin.flyFromMs ? 0 : Math.min(1, t / D.fadeShare),
      phase: ms < coin.flyFromMs ? "rest" : "fly" };
  }
  if (ms < D.bounceMs) {
    // Out from his feet to its rest, sideways quick first, three hops on the floor.
    const t = Math.max(0, ms) / D.bounceMs, out = 1 - (1 - t) ** 2;
    return { x: plan.from.x + (coin.restX - plan.from.x) * out, y: floor - bounceHeight(Math.max(0, ms), coin.hopPx), scale: 1, alpha: 1, phase: "bounce" };
  }
  const rest = { x: coin.restX, y: floor };
  if (ms < coin.flyFromMs) return { ...rest, scale: 1, alpha: 1, phase: "rest" };
  // Sucked up: a bent path, slow off the floor and quicker to the end.
  const t = (ms - coin.flyFromMs) / (coin.landMs - coin.flyFromMs), eased = t * t;
  const control = { x: rest.x + coin.bend, y: rest.y + (plan.to.y - rest.y) * 0.6 };
  return { ...curve(rest, control, plan.to, eased), scale: 1 - (1 - D.flyScale) * eased, alpha: 1, phase: "fly" };
}

/** The coins that land in (`fromMs`, `toMs`] (their indexes), in landing order — what a frame from `fromMs` to `toMs` hands the counter. */
export function arenaGoldLandings(plan: ArenaGoldDropPlan, fromMs: number, toMs: number): number[] {
  return plan.coins.flatMap((coin, i) => coin.landMs > fromMs && coin.landMs <= toMs ? [i] : [])
    .sort((a, b) => plan.coins[a]!.landMs - plan.coins[b]!.landMs);
}
