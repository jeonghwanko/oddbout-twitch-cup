// @vitest-environment jsdom
import { createRequire } from "node:module";
import type Phaser from "phaser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RENDER_FRAME_RATE, TWITCH_RENDER_FRAME_RATE } from "../src/render/RenderFrameRate";

// Use Phaser's actual scheduler and delta filter without booting WebGL or loading the game bundle.
const require = createRequire(import.meta.url);
const TimeStep = require("phaser/src/core/TimeStep") as typeof Phaser.Core.TimeStep;
const loops: Phaser.Core.TimeStep[] = [];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  // Model a visible but occluded browser whose rAF callbacks do not arrive.
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
});
afterEach(() => {
  for (const loop of loops.splice(0)) loop.stop();
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks();
});

function running(config: Phaser.Types.Core.FPSConfig) {
  const loop = new TimeStep({} as Phaser.Game, config);
  loops.push(loop);
  const deltas: number[] = [];
  loop.start((_time, delta) => { deltas.push(delta); });
  return { loop, deltas, total: () => deltas.reduce((sum, delta) => sum + delta, 0) };
}
function manual(config: Phaser.Types.Core.FPSConfig, intervalMs: number, frames: number, blurred = false): number {
  const clock = running(config);
  if (blurred) clock.loop.blur();
  const start = clock.loop.lastTime;
  for (let frame = 1; frame <= frames; frame++) {
    const now = start + frame * intervalMs;
    if (clock.loop.hasFpsLimit) clock.loop.stepLimitFPS(now); else clock.loop.step(now);
  }
  clock.loop.stop();
  return clock.total();
}

describe("broadcast frame clock using real Phaser TimeStep", () => {
  it("reproduces the existing blur filter reducing a 100ms frame to 16.67ms", () => {
    const { loop } = running(RENDER_FRAME_RATE);
    loop.blur();
    expect(loop.smoothDelta(100)).toBeCloseTo(1000 / 60, 8);
    expect(manual(RENDER_FRAME_RATE, 100, 60, true)).toBeCloseTo(1000, 6);
    expect(manual(TWITCH_RENDER_FRAME_RATE, 100, 60, true)).toBeCloseTo(6000, 6);
  });

  it("reproduces the existing slow-frame filter even when the document is visible and focused", () => {
    expect(document.hidden).toBe(false);
    expect(manual(RENDER_FRAME_RATE, 1000, 60)).toBeCloseTo(1000, 6);
    expect(manual(TWITCH_RENDER_FRAME_RATE, 1000, 60)).toBeCloseTo(60_000, 6);
  });

  it("keeps the broadcast timer loop advancing while rAF callbacks are absent", () => {
    const original = running(RENDER_FRAME_RATE), timer = running(TWITCH_RENDER_FRAME_RATE);
    vi.advanceTimersByTime(5000);
    expect(original.deltas).toHaveLength(0);
    expect(timer.loop.raf.isSetTimeOut).toBe(true);
    expect(timer.total()).toBeGreaterThanOrEqual(4950);
    expect(timer.total()).toBeLessThanOrEqual(5000);
    expect(timer.deltas.length).toBeGreaterThanOrEqual(250);
  });

  it("preserves accumulated normal 60Hz time within one frame", () => {
    const original = manual(RENDER_FRAME_RATE, 1000 / 60, 600);
    const timer = manual(TWITCH_RENDER_FRAME_RATE, 1000 / 60, 600);
    expect(Math.abs(original - 10_000)).toBeLessThanOrEqual(1000 / 60 + 1e-6);
    expect(Math.abs(timer - original)).toBeLessThanOrEqual(1000 / 60 + 1e-6);
  });

  it("stops scheduled callbacks when the timer loop stops", () => {
    const timer = running(TWITCH_RENDER_FRAME_RATE);
    vi.advanceTimersByTime(1000);
    const calls = timer.deltas.length;
    expect(calls).toBeGreaterThan(0);
    timer.loop.stop();
    vi.advanceTimersByTime(5000);
    expect(timer.deltas).toHaveLength(calls);
    expect(vi.getTimerCount()).toBe(0);
  });
});
