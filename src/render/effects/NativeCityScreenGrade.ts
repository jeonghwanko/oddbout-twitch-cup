import { NATIVE_CITY_COMBAT, type NativeCityBackdropMode, type NativeCityImpactTier, type NativeCityScreenGradeTuning } from "../../sim/cityFight/NativeCityCombatTuning";
import type { NativeCityFightSlowMoBeat } from "../../sim/cityFight/NativeCityFight";
import { combatSlowMoIntensityAt } from "./CombatSlowMo";

/**
 * 마을 대결의 화면 전체 색 박자(2026-10-12). 마을은 three.js 바닥 캔버스 위에 Phaser 캔버스를 겹친다(`GameCanvasUnderlay`) — Phaser
 * 카메라 postFX 는 아래 마을에 닿지 않아 인물만 색이 빠졌다. 그래서 두 캔버스의 부모에 CSS filter 하나를 걸어 합성기가 둘에 같이
 * 적용한다(`NativeCityScreenGradeView`). 여기는 순수 계산이다:
 *
 * - 패리(2026-10-16): 예전 CSS 흑백·고대비 잉크 반전은 두 싸움꾼까지 회색으로 만들었다. 이제 배경 누르기의 결정타 셰이더
 *   (`feel.screenGrade.parry.mode`, 마을만 반전, 두 몸은 컬러)를 정지 동안 건다 — `NativeCityBackdropDim.parry`.
 * - 슬로모 채도: 박자 자신의 `desaturate` 를 `combatSlowMoIntensityAt`(90ms 에 차오르고 풀림과 함께 빠짐)으로 곱한다 — 저택과 같은 곡선.
 */

/** This frame's grade: `desaturate` (0..1 of the colour taken out). */
export interface NativeCityScreenGrade {
  readonly desaturate: number;
}

/** How much colour a running fight slow-mo takes out now: its beat's `desaturate` along its intensity curve. */
export function nativeCitySlowMoDesaturate(slowMo: { readonly beat: NativeCityFightSlowMoBeat; readonly ageMs: number } | null): number {
  if (!slowMo || !(slowMo.beat.desaturate > 0)) return 0;
  return Math.max(0, Math.min(1, slowMo.beat.desaturate * combatSlowMoIntensityAt(slowMo.beat, slowMo.ageMs)));
}

const round = (value: number) => Math.round(value * 1000) / 1000;

/** This frame's backdrop pass: what it draws (`mode`) and how strongly (`alpha`, 0: none); `clockMs`: a moving shader's clock (the night). */
export interface NativeCityBackdropFrame {
  readonly alpha: number;
  readonly mode: NativeCityBackdropMode;
  readonly clockMs?: number;
  /** The night's own colours (an awakening's sky — deep, high, cloud, star); the starry night's without. */
  readonly sky?: readonly [number, number, number, number];
}

const NO_BACKDROP: NativeCityBackdropFrame = Object.freeze({ alpha: 0, mode: "dim" });

/**
 * 배경 누르기(`feel.screenGrade.backdrop`, 2026-10-16 엣지 연출): 큰 한 방(돌진·반격·붕괴·KO, 크게 재생된 강조)의 정지 동안 마을을 잉크
 * 막 아래로 누르고 두 몸만 그 위에 세운다 — 효과를 키우지 않고 밝은 광장 위에서 두 실루엣을 띄운다. 결정타(`modes`: 반격·KO)는 잉크 막
 * 대신 마을 전체에 셰이더를 건다(반전·망점, `NativeCityCardView`). 잉크 막은 해제 첫 프레임에 절반, 그다음 꺼진다. 셰이더는 바로 끊는다.
 * 상태 기계 하나: `trigger`(접촉) → `frame`(프레임마다, 이펙트 시계의 정지 여부)이 이번 프레임의 모드와 세기를 돌려준다.
 * 화면 전체 패스는 지난 패스 뒤 `minGapMs`(화면 ms)를 기다린다 — KO 만 예외다(2026-10-17, 사용자: 대결 영상이 어지럽다).
 */
export class NativeCityBackdropDim {
  private armed: NativeCityBackdropMode | null = null;
  private releasedMs: number | null = null;
  /** Screen ms since the last parry frame (the photosensitivity gap, `parry.minGapMs`). */
  private sinceParryMs = Number.POSITIVE_INFINITY;
  /** Screen ms since the last whole-screen pass of any kind (`minGapMs`). */
  private sinceScreenMs = Number.POSITIVE_INFINITY;

  constructor(private readonly t: NativeCityScreenGradeTuning = NATIVE_CITY_COMBAT.feel.screenGrade) {}

  /**
   * A connecting blow: arms the pass when it is one of the tiers, played loud and `minGapMs` after the last pass (the KO and the counter
   * always — the counter is the read's payoff, 2026-10-19 "삥~ → 팡"; never under reduced motion). Returns whether it armed — that freeze's whole-screen beat is the pass's (the caller drops its zoom pulse).
   */
  trigger(tier: NativeCityImpactTier, loud: boolean, reducedMotion: boolean): boolean {
    if (reducedMotion || !loud || !this.t.backdrop.tiers.includes(tier)) return false;
    if (tier !== "ko" && tier !== "counter" && this.sinceScreenMs < this.t.minGapMs) return false;
    this.arm(this.t.backdrop.modes[tier] ?? "dim");
    return true;
  }


  parry(reducedMotion: boolean): void {
    const mode = this.t.parry.mode;
    if (reducedMotion || mode === null || this.sinceParryMs < this.t.parry.minGapMs || this.sinceScreenMs < this.t.minGapMs) return;
    this.sinceParryMs = 0;
    this.arm(mode);
  }

  /**
   * A super's flash (`super`, 2026-10-20): the town as ink silhouettes through its hold (`backdrop.silhouette`, 2026-10-21 — the stage goes
   * ink, the two fighters in colour); under reduced motion the ink sheet (it does not move either).
   */
  superFlash(reducedMotion = false): void { this.arm(reducedMotion ? "dim" : "silhouette"); }

  private arm(mode: NativeCityBackdropMode): void {
    this.armed = mode;
    this.releasedMs = null;
    this.sinceScreenMs = 0;
  }

  /** This frame's pass: full while the freeze holds; the ink sheet steps to half on the release's first frame, a shader just cuts. */
  frame(screenDtMs: number, frozen: boolean): NativeCityBackdropFrame {
    const dt = Math.max(0, Number.isFinite(screenDtMs) ? screenDtMs : 0);
    this.sinceParryMs += dt;
    this.sinceScreenMs += dt;
    const mode = this.armed;
    if (mode === null) return NO_BACKDROP;
    const full = mode === "dim" ? this.t.backdrop.alpha : 1;
    if (frozen && this.releasedMs === null) return { alpha: full, mode };
    this.releasedMs = this.releasedMs === null ? 0 : this.releasedMs + dt;
    // The half-grey release frame of a shader read as a double exposure (2026-10-17): only the ink sheet steps down.
    if (mode === "dim" && this.releasedMs < this.t.backdrop.releaseMs / 2) return { alpha: full / 2, mode };
    this.armed = null;
    this.releasedMs = null;
    return NO_BACKDROP;
  }

  clear(): void { this.armed = null; this.releasedMs = null; }
}

/** The CSS filter for a grade ("" — none — when it changes nothing, so the parent leaves its compositing layer alone). */
export function nativeCityScreenGradeFilter(grade: NativeCityScreenGrade): string {
  const desaturate = Math.max(0, Math.min(1, grade.desaturate));
  return desaturate > 0.001 ? `saturate(${round(1 - desaturate)})` : "";
}
