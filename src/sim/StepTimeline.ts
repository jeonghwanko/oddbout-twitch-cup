/**
 * 걸음마다 제 길이를 갖는 시간표(2026-10-18 — 원화 칸 시퀀스·떨림 걸음·플립북 노출이 따로 세던 조회 하나): `stepIndexAt` 은 `t` ms 에
 * 어느 걸음이 보이는지, `stepsTotal` 은 시간표 전체 길이다. 걸음은 목록 순서대로 이어지고, 길이 0 인 걸음은 건너뛴다.
 *
 * 시계와 그 다듬기(음수·유한하지 않은 `t`)는 부르는 쪽의 것이다. 조회는 걸음 끝을 차례로 더하며 `t < 끝` 인 첫 걸음을 찾을 뿐이다.
 * 끝을 넘으면: `hold` 마지막 걸음, `once` 없음(-1), `loop` 전체 길이로 감아 다시 찾는다. 빈 목록과 NaN 은 `hold` 밖에서 -1 이다.
 */
export type StepTimelineMode = "hold" | "once" | "loop";

const durationMsOf = (step: { readonly durationMs: number }): number => step.durationMs;

/** The step `t` ms into the list (`mode` past its end); -1: none. */
export function stepIndexAt(steps: readonly { readonly durationMs: number }[], t: number, mode: StepTimelineMode): number;
export function stepIndexAt<T>(steps: readonly T[], t: number, mode: StepTimelineMode, durationOf: (step: T) => number): number;
export function stepIndexAt<T>(steps: readonly T[], t: number, mode: StepTimelineMode,
  durationOf: (step: T) => number = durationMsOf as unknown as (step: T) => number): number {
  let at = t;
  if (mode === "loop") {
    const total = stepsTotal(steps, durationOf);
    if (total > 0 && at >= total) at %= total;
  }
  let end = 0;
  for (let i = 0; i < steps.length; i++) {
    end += durationOf(steps[i]!);
    if (at < end) return i;
  }
  return mode === "hold" ? steps.length - 1 : -1;
}

/** How long the list lasts: its steps' durations summed in order. */
export function stepsTotal(steps: readonly { readonly durationMs: number }[]): number;
export function stepsTotal<T>(steps: readonly T[], durationOf: (step: T) => number): number;
export function stepsTotal<T>(steps: readonly T[], durationOf: (step: T) => number = durationMsOf as unknown as (step: T) => number): number {
  return steps.reduce((sum, step) => sum + durationOf(step), 0);
}
