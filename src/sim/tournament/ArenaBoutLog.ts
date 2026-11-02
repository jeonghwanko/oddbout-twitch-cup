import type { CityFightBoutResult, CityFightBoutSession } from "../cityFight/bout/CityFightFighterBout";

/**
 * 경기 하나의 기록(2026-10-24, docs/Plan/2026-10-24-oddbout-cup-drama-and-archive A단계): 끝난 시각, 남은 HP, 맞힌 수, 지문, 그리고 다시 볼
 * 만한 장면(하이라이트)의 시각. 경기 엔진의 걸음마다 `snapshot` 을 읽어 모은다 — 화면 없는 경기도 화면 경기도 같은 시드면 같은 걸음이라
 * 같은 기록이 나온다. 영상은 저장하지 않는다: 두 코너와 시드면 경기가 처음부터 다시 돈다.
 *
 * 순수 규칙이다(경기 세션은 부르는 쪽이 만든다).
 */
export type ArenaBoutHighlightKind = "super" | "air" | "throw" | "wall" | "bigHit" | "comeback" | "ko" | "clutch";

export interface ArenaBoutHighlight {
  /** 경기 시각(ms). */
  readonly ms: number;
  readonly kind: ArenaBoutHighlightKind;
  /** 그 장면의 주인(때린 쪽, 역전·KO 는 이긴 쪽): 0 = a, 1 = b. */
  readonly corner: 0 | 1;
}

export interface ArenaBoutSummary {
  readonly winner: 0 | 1;
  readonly how: "ko" | "decision";
  readonly ms: number;
  /** 끝났을 때 HP 몫(0..1). */
  readonly hp: readonly [number, number];
  readonly contacts: readonly [number, number];
  readonly digest: string;
  /** 시각 순, 많아야 `ARENA_BOUT_LOG.max` 개. */
  readonly highlights: readonly ArenaBoutHighlight[];
  /** 명경기 점수(하이라이트 점수의 합과 접전 덤) — 기록실의 명경기 순서. */
  readonly score: number;
}

/**
 * 하이라이트를 고르는 값(첫 값이다 — 명경기가 컵당 1~2개 나오게 실제 분포를 보고 맞춘다).
 * - `comebackGap`: 이긴 쪽이 이만큼(HP 몫) 뒤졌다가 앞서면 역전. `clutchHp`: 이긴 쪽 HP 가 이 아래인 KO 는 막판 KO.
 * - `airHits`: 띄운 뒤 이만큼 이어 맞히면 공중 연타 — 경기에서 가장 긴 것 하나만. `bigHit`: 한 걸음에 이만큼 깎이면 큰 한 방(가장 큰 것 하나).
 * - `mergeMs`: 같은 주인·같은 종류는 이 안에서 하나로(필살기 한 번이 여러 번 맞아도 장면 하나).
 * - 점수: 흔한 장면(필살기·KO — 거의 모든 경기에 있다)은 낮게, 드문 장면(역전·막판 KO)은 높게. 2026-10-24 개발 서버 컵 하나(15경기)를
 *   잰 첫 값(공중 3연타 기준)에서는 공중 연타가 하이라이트 73개 중 45개, 모든 경기가 5개를 채워 명경기가 갈리지 않았다.
 */
export const ARENA_BOUT_LOG = Object.freeze({
  max: 5, comebackGap: 0.25, clutchHp: 0.1, airHits: 4, bigHit: 0.12, mergeMs: 1500,
  scores: Object.freeze({ comeback: 5, clutch: 4, air: 3, throw: 2, wall: 2, bigHit: 2, super: 1, ko: 1 } satisfies Record<ArenaBoutHighlightKind, number>),
  /** 판정이 접전(두 HP 몫 차가 0.1 아래)이면 더하는 점수. */
  closeDecision: 2,
});

type Snapshot = CityFightBoutSession["snapshot"];

/** 걸음마다 `observe`, 끝나면 `finish`. 시작 전 스냅숏으로 만든다(첫 HP 를 그 값으로 잰다). */
export class ArenaBoutLog {
  private readonly startHp: readonly [number, number];
  private share: [number, number] = [1, 1];
  private found: ArenaBoutHighlight[] = [];
  private biggest: { ms: number; corner: 0 | 1; drop: number } | null = null;
  private air: [number, number] = [0, 0];
  /** Each corner's air chain on now (its last hit's ms), and the bout's longest chain so far. */
  private airAt: [number, number] = [0, 0];
  private longestAir: { ms: number; corner: 0 | 1; hits: number } | null = null;
  private behind: [boolean, boolean] = [false, false];
  private comeback: [number | null, number | null] = [null, null];

  constructor(start: Snapshot) {
    this.startHp = [Math.max(1e-9, start.states[0].combat.hp), Math.max(1e-9, start.states[1].combat.hp)];
  }

  /** 한 걸음 뒤의 스냅숏. */
  observe(snapshot: Snapshot): void {
    const ms = snapshot.ms;
    for (const hit of snapshot.hits) {
      const striker = (1 - hit.target) as 0 | 1;
      if (hit.super && !hit.blocked) this.add("super", striker, ms);
      if (hit.grab === "throw") this.add("throw", striker, ms);
      if (hit.air === "launch" || hit.air === "juggle" || hit.air === "spike") { this.air[hit.target] += 1; this.airAt[hit.target] = ms; }
    }
    for (const beat of snapshot.airs) if (beat.beat === "land") this.endAir(beat.corner);
    for (const wall of snapshot.walls) this.add("wall", (1 - wall.corner) as 0 | 1, ms);
    const share: [number, number] = [snapshot.states[0].combat.hp / this.startHp[0], snapshot.states[1].combat.hp / this.startHp[1]];
    for (const i of [0, 1] as const) {
      const drop = this.share[i] - share[i];
      if (drop > 0 && (!this.biggest || drop > this.biggest.drop)) this.biggest = { ms, corner: (1 - i) as 0 | 1, drop };
      const lead = share[i] - share[1 - i]!;
      if (lead <= -ARENA_BOUT_LOG.comebackGap) this.behind[i] = true;
      else if (lead > 0 && this.behind[i] && this.comeback[i] === null) this.comeback[i] = ms;
    }
    this.share = share;
  }

  finish(result: CityFightBoutResult): ArenaBoutSummary {
    const w = result.winner, L = ARENA_BOUT_LOG;
    this.endAir(0); this.endAir(1);
    if (this.longestAir) this.found.push({ ms: this.longestAir.ms, kind: "air", corner: this.longestAir.corner });
    const comeback = this.comeback[w];
    if (comeback !== null) this.found.push({ ms: comeback, kind: "comeback", corner: w });
    if (this.biggest && this.biggest.drop >= L.bigHit) this.found.push({ ms: this.biggest.ms, kind: "bigHit", corner: this.biggest.corner });
    if (result.how === "ko") this.found.push({ ms: result.ms, kind: result.hp[w] <= L.clutchHp ? "clutch" : "ko", corner: w });
    const picked = [...this.found].sort((x, y) => L.scores[y.kind] - L.scores[x.kind] || x.ms - y.ms).slice(0, L.max);
    const close = result.how === "decision" && Math.abs(result.hp[0] - result.hp[1]) < 0.1 ? L.closeDecision : 0;
    return Object.freeze({
      winner: result.winner, how: result.how, ms: result.ms, hp: Object.freeze([result.hp[0], result.hp[1]] as const),
      contacts: Object.freeze([result.contacts[0], result.contacts[1]] as const), digest: result.digest,
      highlights: Object.freeze(picked.sort((x, y) => x.ms - y.ms).map(h => Object.freeze(h))),
      score: picked.reduce((sum, h) => sum + L.scores[h.kind], 0) + close,
    });
  }

  /** `corner` came down (or the bout ended): his air chain is over — the longest one so far stays (`airHits` or more). */
  private endAir(corner: 0 | 1): void {
    const hits = this.air[corner];
    this.air[corner] = 0;
    if (hits >= ARENA_BOUT_LOG.airHits && (!this.longestAir || hits > this.longestAir.hits)) {
      this.longestAir = { ms: this.airAt[corner], corner: (1 - corner) as 0 | 1, hits };
    }
  }

  private add(kind: ArenaBoutHighlightKind, corner: 0 | 1, ms: number): void {
    for (let i = this.found.length - 1; i >= 0; i -= 1) {
      const last = this.found[i]!;
      if (last.kind === kind && last.corner === corner) { if (ms - last.ms < ARENA_BOUT_LOG.mergeMs) return; break; }
    }
    this.found.push({ ms, kind, corner });
  }
}

/** 경기를 끝까지 돌리며 기록한다(화면 없이 — 결과만 보기, 기록 채우기). */
export function runLoggedBout(session: CityFightBoutSession): ArenaBoutSummary {
  const log = new ArenaBoutLog(session.snapshot);
  let result = session.step();
  log.observe(session.snapshot);
  while (!result) { result = session.step(); log.observe(session.snapshot); }
  return log.finish(result);
}

const isShare = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
const isCount = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;
const KINDS = Object.keys(ARENA_BOUT_LOG.scores) as ArenaBoutHighlightKind[];

/** 저장된 기록(손상이면 undefined). */
export function sanitizeArenaBoutSummary(value: unknown): ArenaBoutSummary | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const r = value as Record<string, unknown>;
  const pair = (v: unknown, ok: (x: unknown) => boolean) => Array.isArray(v) && v.length === 2 && ok(v[0]) && ok(v[1]);
  if ((r["winner"] !== 0 && r["winner"] !== 1) || (r["how"] !== "ko" && r["how"] !== "decision") || !isCount(r["ms"])
    || !pair(r["hp"], isShare) || !pair(r["contacts"], isCount) || typeof r["digest"] !== "string" || !/^[a-f0-9]{8}$/.test(r["digest"])
    || !isCount(r["score"]) || !Array.isArray(r["highlights"])) return undefined;
  const highlights = (r["highlights"] as unknown[]).flatMap(h => {
    const x = h as Record<string, unknown> | null;
    return x && isCount(x["ms"]) && KINDS.includes(x["kind"] as ArenaBoutHighlightKind) && (x["corner"] === 0 || x["corner"] === 1)
      ? [Object.freeze({ ms: x["ms"], kind: x["kind"] as ArenaBoutHighlightKind, corner: x["corner"] })] : [];
  }).slice(0, ARENA_BOUT_LOG.max);
  const hp = r["hp"] as number[], contacts = r["contacts"] as number[];
  return Object.freeze({ winner: r["winner"], how: r["how"], ms: r["ms"],
    hp: Object.freeze([hp[0]!, hp[1]!] as const), contacts: Object.freeze([contacts[0]!, contacts[1]!] as const), digest: r["digest"],
    highlights: Object.freeze(highlights), score: r["score"] });
}
