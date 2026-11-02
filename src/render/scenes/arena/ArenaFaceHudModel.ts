/*
 * 무투장 얼굴 HUD 의 상태(2026-10-23 — 사용자: "이거 좋다", 시안 v5): 두 코너의 표정, HP 숫자의 색 단계, 맞은 순간의 튐·흔들림·번쩍임.
 * 순수 계산이다 — Phaser 를 모른다. 씬이 화면 ms 와 두 코너의 HP 를 매 프레임 넘기면, HP 가 준 프레임을 "맞음"으로 센다(연타·소환물·
 * 각성기 이어 치기가 모두 같은 길로 들어온다). 시간은 화면 ms 라 타격 멈춤 동안에도 얼굴과 숫자는 반응한다.
 */

import type { ArenaFaceExpression } from "../../../assets/ArenaFaceArtCatalog";


export type ArenaFaceTone = "white" | "lime" | "magenta";

export const ARENA_FACE_HUD = Object.freeze({
  /** The struck face holds this long after the blow (screen ms). */
  hitMs: 370,
  /** The striker grins this long after his blow lands. */
  smugMs: 600,

  warnShare: 0.5,
  dangerShare: 0.25,
  /** Ahead by this share of HP: the side-eye. */
  leadShare: 0.35,
  /** The number's pop on a blow: up in `riseMs`, back on `decayMs`; `scale` its peak growth (the portrait grows `panelScale`). */
  pop: Object.freeze({ riseMs: 33, decayMs: 83, scale: 0.24, panelScale: 0.07, endMs: 660 }),
  /** The sideways shake on a blow (HUD px), decaying over `decayMs`, over by `endMs`. */
  shake: Object.freeze({ px: 9, radPerMs: 0.144, decayMs: 67, endMs: 230 }),
  /** The white flash of the struck number and portrait. */
  flashMs: 33,

  koHoldMs: 700,
});

export function arenaFaceTone(share: number): ArenaFaceTone {
  const t = ARENA_FACE_HUD;
  return share > t.warnShare ? "white" : share > t.dangerShare ? "lime" : "magenta";
}

/** One corner's drawn state this frame. */
export interface ArenaFaceCorner {
  readonly expression: ArenaFaceExpression;
  readonly tone: ArenaFaceTone;
  /** 0..1: the blow's pop now (0 at rest). */
  readonly pop: number;
  /** HUD px sideways now. */
  readonly shake: number;
  readonly flash: boolean;
}

export interface ArenaFaceHudInput {
  readonly hp: readonly [number, number];
  readonly maxHp: readonly [number, number];
  /** The bout's KO loser once it is decided by KO, else null (a decision keeps the faces as they are). */
  readonly koLoser: 0 | 1 | null;
  readonly reducedMotion: boolean;
}

const NEVER = Number.POSITIVE_INFINITY;

/** The pop of a blow `ms` ago (0..1). */
export function arenaFacePop(ms: number): number {
  const p = ARENA_FACE_HUD.pop;
  if (!(ms >= 0) || ms > p.endMs) return 0;
  return ms < p.riseMs ? (ms + p.riseMs / 2) / (p.riseMs * 1.5) : Math.exp(-(ms - p.riseMs) / p.decayMs);
}

/** The shake of a blow `ms` ago (HUD px). */
export function arenaFaceShake(ms: number): number {
  const s = ARENA_FACE_HUD.shake;
  if (!(ms >= 0) || ms > s.endMs) return 0;
  return Math.sin(ms * s.radPerMs) * s.px * Math.exp(-ms / s.decayMs);
}

/** Both corners' faces through a bout: feed it every frame; a drop in a corner's HP is a blow on him. */
export class ArenaFaceHudModel {
  private readonly last: [number | null, number | null] = [null, null];
  private readonly since: [number, number] = [NEVER, NEVER];

  /** A new bout (a rematch): forget the last one's blows. */
  reset(): void {
    this.last[0] = this.last[1] = null;
    this.since[0] = this.since[1] = NEVER;
  }

  frame(dtMs: number, input: ArenaFaceHudInput): readonly [ArenaFaceCorner, ArenaFaceCorner] {
    const dt = Number.isFinite(dtMs) ? Math.max(0, dtMs) : 0, t = ARENA_FACE_HUD;
    for (const k of [0, 1] as const) {
      this.since[k] += dt;
      const hp = input.hp[k], before = this.last[k];
      if (before !== null && hp < before - 1e-9) this.since[k] = 0;
      this.last[k] = hp;
    }
    const share = [0, 1].map(k => Math.max(0, input.hp[k]!) / Math.max(1e-6, input.maxHp[k]!));
    return [0, 1].map(k => {
      const other = 1 - k, ms = this.since[k]!, reduced = input.reducedMotion;
      let expression: ArenaFaceExpression;
      if (input.koLoser !== null) expression = input.koLoser === k ? "ko" : "sideeye";
      else if (ms <= t.hitMs) expression = "hit";
      else if (this.since[other]! <= t.smugMs) expression = "smug";
      else if (share[k]! < t.dangerShare) expression = "danger";
      else if (share[k]! - share[other]! > t.leadShare) expression = "sideeye";
      else expression = "default";
      return { expression, tone: arenaFaceTone(share[k]!), pop: reduced ? 0 : arenaFacePop(ms), shake: reduced ? 0 : arenaFaceShake(ms),
        flash: !reduced && ms <= t.flashMs };
    }) as unknown as readonly [ArenaFaceCorner, ArenaFaceCorner];
  }
}
