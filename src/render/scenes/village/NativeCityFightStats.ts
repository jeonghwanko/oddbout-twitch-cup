import { registerRenderStats } from "../../RenderStats";

/**
 * The village fight's per-frame cost counters (2026-10-13): the `?perf=1` overlay's "city fight" section and the fight perf probe
 * (`npm run perf:village:fight`) read the same running totals — the probe diffs two reads over its sample window.
 *
 * - effect ticks: the fight's shared effects frame (`NativeCityCombatController.effectsFrame`: motion, trails, cues, letters, impact frame,
 *   hit effects, screen grade, outlines) and its wall-clock ms. It runs every frame, fight or not: measured 2026-10-13 at 0.11 ms outside
 *   a fight (0.30 ms in one) — too little to be worth an idle skip that could freeze a fading effect on screen.
 * - HUD refreshes: the scene's `refreshHud` calls (the frame's own and every `changed()` the fight raised).
 */
export class NativeCityFightStats {
  private frames = 0;
  private effectTicks = 0;
  private effectMs = 0;
  private hudRefreshes = 0;
  private readonly release: () => void;

  constructor() {
    this.release = registerRenderStats({ title: "city fight", read: () => this.read() });
  }

  /** One scene frame. */
  frame(): void { this.frames += 1; }

  /** An effects tick starts: its start time (`performance.now`), for `effectsEnd`. */
  effectsBegin(): number { return performance.now(); }

  effectsEnd(startedMs: number): void {
    this.effectTicks += 1;
    this.effectMs += performance.now() - startedMs;
  }

  hudRefresh(): void { this.hudRefreshes += 1; }

  read(): Readonly<Record<string, number>> {
    return { frames: this.frames, effectTicks: this.effectTicks,
      effectMsTotal: Math.round(this.effectMs * 1000) / 1000, hudRefreshes: this.hudRefreshes };
  }

  destroy(): void { this.release(); }
}
