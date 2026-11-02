import Phaser from "phaser";
import { CSS, FONT, scrim } from "../render/art/palette";
import { phaserTextureLowSize } from "../render/PhaserTextureResidency";
import { MIB, renderStatsSections, textureBytes, type RenderStatsValue } from "../render/RenderStats";
import { RENDER_SCALE } from "../render/RenderScale";

/**
 * `?perf=1` 성능 표시. 실제 기기(내장 GPU 노트북 등)의 브라우저에서 그대로 열어 숫자를 읽기 위한 화면이다.
 * 헤드리스 측정은 화면 합성과 노트북 CPU 를 대신하지 못한다(`tools/e2e/village-performance.mjs`).
 *
 * - 프레임: rAF 간격으로 fps·p95 프레임 시간, Phaser 한 스텝+렌더의 메인 스레드 작업 시간(3D 갱신 포함).
 * - GPU 작업량: Phaser 컨텍스트 드로콜, 렌더러별 섹션(마을 3D 드로콜·삼각형 등, `RenderStats`).
 * - 메모리: Phaser·three 텍스처 GPU 메모리 어림, 업로드 뒤에도 남은 디코드 비트맵, JS 힙.
 *   Phaser 텍스처는 세 갈래로 나눈다: 다른 렌더러가 다시 올린 몫(`sharedThreeMiB`, 컨텍스트가 달라 두 벌),
 *   지금 Phaser 가 그리는 몫(`drawnMiB`), 어느 쪽도 아닌 몫(`idleMiB`). 사본을 저해상도로 내린 원본(`PhaserTextureResidency`)은
 *   `releasedMiB` 로 따로 세고, GPU 어림(`textureMiB`)에는 내린 크기로 넣는다. 키별 목록은 `globalThis.__perfTextures()`.
 *   '지금 그림'은 읽는 순간의 표시 목록이다 — 대화 초상처럼 가끔 쓰는 원화는 그 순간 `idle` 로 잡힌다.
 *
 * 규칙을 바꾸지 않는 표시라 밸런스 표본 판정에 영향이 없다. `globalThis.__perfStats()` 로 같은 숫자를 읽을 수 있다.
 */
const WINDOW = 120;
const REFRESH_MS = 500;
const IDLE_TOP = 5;

type Stats = Record<string, Record<string, RenderStatsValue>>;
type TextureUse = "released" | "shared" | "drawn" | "idle";
interface TextureRow { key: string; use: TextureUse; sources: number; bytes: number }

export function installPerfOverlay(game: Phaser.Game): void {
  const doc = globalThis.document;
  if (!doc) return;
  const panel = doc.createElement("pre");
  panel.id = "perf-overlay";
  Object.assign(panel.style, {
    position: "fixed", left: "8px", top: "8px", zIndex: "30", margin: "0", padding: "6px 8px", pointerEvents: "none",
    background: scrim("d9"), color: CSS.hudFlatText, font: `11px/1.35 ${FONT.hudSans}`, fontVariantNumeric: "tabular-nums",
    whiteSpace: "pre", borderRadius: "4px",
  } satisfies Partial<CSSStyleDeclaration>);
  doc.body.append(panel);

  const intervals: number[] = [], work: number[] = [], draws: number[] = [];
  let lastRaf = 0, stepStart = 0, frameDraws = 0, wrapped = false;
  const push = (list: number[], value: number) => { list.push(value); if (list.length > WINDOW) list.shift(); };
  const tick = (time: number) => {
    if (lastRaf) push(intervals, time - lastRaf);
    lastRaf = time;
    globalThis.requestAnimationFrame(tick);
  };
  globalThis.requestAnimationFrame(tick);

  const wrapDraws = () => {
    if (wrapped || !(game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) return;
    const gl = game.renderer.gl as WebGLRenderingContext & Record<string, unknown>;
    for (const name of ["drawElements", "drawArrays"] as const) {
      const original = gl[name].bind(gl) as (...args: unknown[]) => void;
      gl[name] = ((...args: unknown[]) => { frameDraws++; original(...args); });
    }
    wrapped = true;
  };
  game.events.on(Phaser.Core.Events.PRE_STEP, () => { stepStart = performance.now(); });
  game.events.on(Phaser.Core.Events.POST_RENDER, () => {
    wrapDraws();
    push(work, performance.now() - stepStart);
    push(draws, frameDraws); frameDraws = 0;
  });

  const avg = (list: readonly number[]) => list.length ? list.reduce((sum, value) => sum + value, 0) / list.length : 0;
  const p95 = (list: readonly number[]) => {
    if (!list.length) return 0;
    const sorted = [...list].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * 0.95))]!;
  };
  const round = (value: number, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;
  /** 읽는 순간 보이는 씬의 표시 목록(컨테이너·레이어 안까지)에서 그려질 물체가 쓰는 텍스처 원본. */
  const drawnSources = (): Set<Phaser.Textures.TextureSource> => {
    const sources = new Set<Phaser.Textures.TextureSource>();
    type Item = Partial<{ frame: Phaser.Textures.Frame; texture: Phaser.Textures.Texture; list: Phaser.GameObjects.GameObject[] }>;
    const visit = (object: Phaser.GameObjects.GameObject, camera: Phaser.Cameras.Scene2D.Camera) => {
      if (!object.willRender(camera)) return;
      const item = object as Item;
      if (item.frame?.source) sources.add(item.frame.source);
      else for (const source of item.texture?.source ?? []) sources.add(source);
      for (const child of Array.isArray(item.list) ? item.list : []) visit(child, camera);
    };
    for (const scene of game.scene.getScenes(true)) {
      if (!scene.sys.settings.visible) continue;
      for (const object of scene.children.list) visit(object, scene.cameras.main);
    }
    return sources;
  };
  /** GPU 에 올라간 Phaser 텍스처를 키·쓰임별로 센다. 다른 렌더러가 다시 올린 원본이 먼저, 그다음 지금 그리는 원본. */
  const textureRows = (): TextureRow[] => {
    const shared = new Set<object>();
    for (const section of renderStatsSections()) for (const source of section.sharedSources?.() ?? []) shared.add(source);
    const drawn = drawnSources();
    const rows = new Map<string, TextureRow>();
    for (const key of game.textures.getTextureKeys()) {
      for (const source of game.textures.get(key).source) {
        if (!source.glTexture) continue;
        const low = phaserTextureLowSize(source);
        const use: TextureUse = low ? "released" : shared.has(source.image) ? "shared" : drawn.has(source) ? "drawn" : "idle";
        const row = rows.get(`${use}:${key}`) ?? { key, use, sources: 0, bytes: 0 };
        row.sources++; row.bytes += textureBytes(low?.[0] ?? source.width, low?.[1] ?? source.height, 4, false);
        rows.set(`${use}:${key}`, row);
      }
    }
    return [...rows.values()].sort((a, b) => b.bytes - a.bytes);
  };

  let gpuName: string | null = null;
  const phaserGpu = (): Record<string, RenderStatsValue> => {
    if (!(game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) return { renderer: "canvas" };
    const gl = game.renderer.gl;
    if (gpuName === null) {
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      gpuName = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "unknown";
    }
    const rows = textureRows();
    const sum = (use?: TextureUse) => (use ? rows.filter(row => row.use === use) : rows).reduce((total, row) => total + row.bytes, 0);
    const idleTop = rows.filter(row => row.use === "idle").slice(0, IDLE_TOP)
      .map(row => `${row.key} ${round(row.bytes / MIB)}`).join(", ");
    return {
      gpu: gpuName, textures: rows.reduce((total, row) => total + row.sources, 0), textureMiB: round(sum() / MIB, 0),
      sharedThreeMiB: round(sum("shared") / MIB, 0), drawnMiB: round(sum("drawn") / MIB, 0), idleMiB: round(sum("idle") / MIB, 0),
      releasedMiB: round(sum("released") / MIB, 0),
      idleTop: idleTop || null,
    };
  };

  const read = (): Stats => {
    const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
    const stats: Stats = {
      frame: {
        fps: round(intervals.length ? 1000 / avg(intervals) : 0), frameP95Ms: round(p95(intervals)),
        workMs: round(avg(work)), workP95Ms: round(p95(work)), workMaxMs: round(Math.max(0, ...work)),
      },
      phaser: {
        ...phaserGpu(), drawCalls: round(avg(draws), 0),
        backbuffer: `${game.canvas.width}x${game.canvas.height}`, dpr: round(globalThis.devicePixelRatio ?? 1, 2), renderScale: round(RENDER_SCALE, 2),
        jsHeapMiB: heap === undefined ? null : round(heap / MIB, 0),
      },
    };
    for (const section of renderStatsSections()) stats[section.title] = { ...section.read() };
    return stats;
  };
  const format = (stats: Stats) => Object.entries(stats).map(([title, values]) =>
    `${title}\n${Object.entries(values).map(([key, value]) => `  ${key.padEnd(15)} ${value ?? "-"}`).join("\n")}`).join("\n");
  globalThis.setInterval(() => { panel.textContent = format(read()); }, REFRESH_MS);
  (globalThis as unknown as Record<string, unknown>).__perfStats = read;
  (globalThis as unknown as Record<string, unknown>).__perfTextures = () =>
    textureRows().map(({ key, use, sources, bytes }) => ({ key, use, sources, mib: round(bytes / MIB, 2) }));
}
