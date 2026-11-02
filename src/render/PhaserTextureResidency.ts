import Phaser from "phaser";
import type { SpriteSheetAssetDefinition } from "../assets/RuntimeArtTypes";
import { phaserAssetPath, phaserTextureFile, setPhaserSpriteSheetStub } from "./art/PhaserAssetLoader";
import { isPhaserDrawnTexture, onPhaserDrawnTextures, phaserTextureFamilyOf, setPhaserTextureReadiness } from "./PhaserTextureFamilies";
import { MIB, registerRenderStats } from "./RenderStats";

/**
 * Phaser GPU 텍스처를 저해상도로 내려 두고, Phaser 가 그리려 할 때 원본으로 되돌리는 장부.
 *
 * 마을은 three.js 가 캐릭터 시트를 자기 컨텍스트에 따로 올려 그린다(`NativeCityCardView.actorTexture`). 컨텍스트가 달라
 * 같은 시트가 GPU 에 두 벌 있는데, 그동안 Phaser 는 그 시트를 거의 그리지 않는다(2026-10-11 측정: 광장까지 걸은 뒤 겹침
 * 157 MiB, Phaser 가 그린 몫 0). 그래서 three 가 맡은 시트는 Phaser 사본을 1/`LOW_RES_DIVISOR` 해상도로 바꿔 둔다.
 *
 * - 내리기·되돌리기 모두 원래 파일을 메인 스레드 밖에서 디코드한다(`createImageBitmap(blob)`). 메인 스레드는 올리기만 한다.
 * - Phaser 가 내린 시트를 그리려 하면(`WebGLPipeline.flush`, 모든 파이프라인이 배치의 텍스처를 GPU 에 묶는 한 곳 — Light2D 처럼
 *   `pushBatch` 를 거치지 않고 배치를 만드는 경로도 여기를 지난다) 기다리지 않는다.
 *   저해상도로 그리면서 원본 디코드를 시작하고, 끝나면 바꿔 끼운다. 대화 초상·웹툰 컷·문 앞 무대의 주인공·다음 씬의 같은
 *   시트가 몇 프레임 흐리게 나올 뿐 멈추거나 비지 않는다. Phaser 가 한 번 쓴 시트는 다시 내리지 않는다 — 떠나는 씬이 다 쓴 시트를
 *   돌려줄 때(`afterUse`, 옷가게 배우 시트)만 예외다.
 * - 3D 가 켜진 동안 Phaser 가 그리지 않는 마을 2D 화면 원화(바닥·거리 장식·건물 층)도 내린다(`NativeCityScene.releaseCityPlateArt`).
 * - 같은 GL 객체에 Phaser 의 `update` 로 올린다. Phaser 프레임 좌표는 원본 크기로 계산하므로 작은 텍스처도 같은 자리에 그린다.
 *   올린 뒤 Phaser 가 기억하는 원본 이미지·크기는 되돌려 둔다 — 컨텍스트 복구 때 Phaser 가 원본에서 다시 만든다. 복구가 끝나면
 *   그때 내려 있던 시트를 다시 내린다.
 * - 같은 캐릭터의 시트 묶음(`PhaserTextureFamilies`)은 하나를 내리면 나머지도 내린다. 몸을 돌리면 three 가 쓸 시트다.
 * - 이미 내린 묶음의 시트가 나중에 들어오면(대결 상대·주인공의 대결 시트처럼 늦게 받는 시트) 처음부터 저해상도로 태어난다(2026-10-13):
 *   Phaser 가 텍스처를 만들 때(`TextureSource.init`) 원본 대신 투명한 3×3 을 올리고 저해상도 디코드를 줄에 넣는다. 전에는 원본을 메인
 *   스레드에서 한 번 다 올린 뒤 내렸다 — 대결을 거는 순간 큰 시트 한 장에 50~180ms 씩 멈췄다(`perf:village:stalls`). 그 사이 Phaser 가
 *   그리면 곧장 원본 디코드로 간다.
 * - 원본으로 올리는 원화도 메인 스레드에서 디코드하지 않는다(2026-10-13, `installPhaserImageUploads`): 로더가 받은 파일을 메인 스레드 밖에서
 *   비트맵으로 디코드해 두고, 텍스처를 만들 때 그 비트맵을 올린다. 마을에 들어갈 때 Phaser 원화 업로드가 메인 스레드를 1.05 s 쥐었다.
 * - 내리지 않는 시트: Phaser 가 그린다고 알린 시트(대화 초상·웹툰 컷, 늦게 알리면 되돌린다), `MIN_LOWER_BYTES` 보다 작은 시트
 *   (서기 시트 — 문 앞 무대의 주인공처럼 Phaser 가 그리는 일이 가장 잦고 줄이는 양은 작다), 원래 경로를 모르는(`phaserAssetPath`)
 *   텍스처, 여러 장짜리·이미지가 아닌 텍스처, 가로세로가 2의 거듭제곱인 시트(Phaser 가 만든 밉맵 단계가 남는다).
 * - 파일 없는 시트(2026-10-18, `setPhaserStubSheetPolicy`): 저해상도로 태어날 시트 가운데 three 가 GPU 압축판으로만 그리는 시트는 WebP 를
 *   받지 않는다. 로더 대신 크기·프레임만 가진 시트를 만들고(이미지는 픽셀 없는 `Image`, 가로·세로만 원래 값) GPU 에는 3×3 대역을 둔다.
 *   Phaser 가 그리려 하면 그때 WebP 를 받아 올린다. 컨텍스트 복구 때도 원본이 없으므로 대역으로 다시 만든다(`stubSources`).
 */
interface TextureWrapper {
  webGLTexture: WebGLTexture | null;
  pixels: unknown;
  width: number;
  height: number;
  readonly pma: boolean;
  readonly flipY: boolean;
  readonly wrapS: number;
  readonly wrapT: number;
  readonly minFilter: number;
  readonly magFilter: number;
  readonly format: number;
  update(source: unknown, width: number, height: number, flipY: boolean,
    wrapS: number, wrapT: number, minFilter: number, magFilter: number, format: number): void;
}

/** 내린 사본의 가로·세로 배율. 4 면 GPU 메모리가 1/16 이다. */
const LOW_RES_DIVISOR = 4;
/** 동시에 디코드하는 시트 수. 마을에 들어설 때 묶음 수십 장을 한꺼번에 디코드하지 않는다. */
const DECODE_CONCURRENCY = 2;
/** 이보다 작은 시트는 내리지 않는다(원본 RGBA 바이트). 서기 시트(0.2~0.3 MiB)가 여기 걸린다. */
const MIN_LOWER_BYTES = 1024 * 1024;

type Phase = "lowering" | "low" | "raising";
interface Entry {
  readonly source: Phaser.Textures.TextureSource;
  readonly wrapper: TextureWrapper;
  readonly path: string;
  readonly generation: number;
  phase: Phase;
  /** Born low (`installTextureSourceInit`): the GPU holds a 3×3 stand-in until the low decode lands — never the original. */
  readonly born?: boolean;
}

const entries = new Map<TextureWrapper, Entry>();
/** Phaser 가 그린 시트. 다시 내리지 않는다. */
const kept = new WeakSet<TextureWrapper>();
/** 내린 묶음 이름. 그 묶음의 시트가 나중에 로드되면 그때 내린다. */
const loweredFamilies = new Set<string>();
const queue: (() => Promise<void>)[] = [];
const totals = { raised: 0, cancelled: 0, failed: 0, born: 0, stubbed: 0, decodedAhead: 0, uploadMs: 0, uploadMaxMs: 0 };
/** Which sheet paths three draws from their compressed copy only (`setPhaserStubSheetPolicy`), so Phaser need not fetch the WebP. */
let stubPolicy: ((path: string) => boolean) | null = null;
/** The key `stubSheet` is creating right now (`installTextureSourceInit` makes its GPU copy the stand-in). */
let stubbingKey: string | null = null;
/** Sheets made without their file: their image holds no pixels — never upload it, never rebuild from it. */
const stubSources = new Set<Phaser.Textures.TextureSource>();
let running = 0;
/** 컨텍스트가 복구되면 늘어난다. Phaser 가 모든 텍스처를 원본에서 다시 만들었으므로 진행 중인 디코드는 버린다. */
let generation = 0;
let installedGame: Phaser.Game | null = null;

const isPowerOfTwo = (value: number) => value > 0 && (value & (value - 1)) === 0;
const lowSize = (source: Phaser.Textures.TextureSource): [number, number] =>
  [Math.max(1, Math.ceil(source.width / LOW_RES_DIVISOR)), Math.max(1, Math.ceil(source.height / LOW_RES_DIVISOR))];
/** What a low entry holds on the GPU: a sheet without its file, never raised, holds the 3×3 stand-in. */
const lowGpuSize = (entry: Entry): [number, number] => entry.born && stubSources.has(entry.source) ? [3, 3] : lowSize(entry.source);
const wrapperOf = (source: Phaser.Textures.TextureSource) => source.glTexture as unknown as TextureWrapper | null;
const live = (entry: Entry) => entries.get(entry.wrapper) === entry && entry.generation === generation
  && wrapperOf(entry.source) === entry.wrapper && entry.wrapper.webGLTexture !== null;

function pump(): void {
  while (running < DECODE_CONCURRENCY && queue.length > 0) {
    const task = queue.shift()!;
    running++;
    void task().finally(() => { running--; pump(); });
  }
}

async function decode(entry: Entry, size?: readonly [number, number]): Promise<ImageBitmap> {
  // Phaser 로더가 막 받은 파일이다. 캐시에 있으면 다시 확인하지 않고 쓴다.
  const response = await fetch(entry.path, { cache: "force-cache" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  // ImageBitmap 은 WebGL 의 UNPACK 플래그를 따르지 않는다. Phaser 가 이미지에 거는 알파 곱하기·뒤집기를 디코드에서 맞춘다.
  return createImageBitmap(await response.blob(), {
    premultiplyAlpha: entry.wrapper.pma ? "premultiply" : "none", imageOrientation: entry.wrapper.flipY ? "flipY" : "from-image",
    ...(size ? { resizeWidth: size[0], resizeHeight: size[1], resizeQuality: "medium" as const } : {}),
  });
}

function upload(entry: Entry, pixels: ImageBitmap | HTMLImageElement): void {
  const { wrapper, source } = entry;
  const started = performance.now();
  wrapper.update(pixels, pixels.width, pixels.height, wrapper.flipY, wrapper.wrapS, wrapper.wrapT,
    wrapper.minFilter, wrapper.magFilter, wrapper.format);
  // A sheet without its file has no original: a context restore makes the stand-in (`RESTORE_WEBGL` raises it again if Phaser drew it).
  wrapper.pixels = stubSources.has(source) ? standInCanvas() : source.image; wrapper.width = source.width; wrapper.height = source.height;
  const ms = performance.now() - started;
  totals.uploadMs += ms; totals.uploadMaxMs = Math.max(totals.uploadMaxMs, ms);
}

/** The sheet may live low in Phaser (its file path known, one image, not power-of-two, big enough, not one Phaser draws). */
function lowerable(source: Phaser.Textures.TextureSource): string | null {
  return source.image instanceof HTMLImageElement ? lowerablePath(source.texture.key, source.width, source.height) : null;
}
function lowerablePath(key: string, width: number, height: number): string | null {
  // The file Phaser's copy was made from (a mobile copy on a phone — `ArenaMobileArt`): raising it must not put the original on the GPU.
  const path = phaserTextureFile(key);
  if (!path || (isPowerOfTwo(width) && isPowerOfTwo(height))) return null;
  return width * height * 4 < MIN_LOWER_BYTES || isPhaserDrawnTexture(key) ? null : path;
}
/** A sheet of a family three already draws is created low (`installTextureSourceInit`); its file path, else null. */
function bornLowPath(key: string, width: number, height: number): string | null {
  const family = phaserTextureFamilyOf(key);
  return family && loweredFamilies.has(family.id) ? lowerablePath(key, width, height) : null;
}

function lower(source: Phaser.Textures.TextureSource): void {
  const wrapper = wrapperOf(source), path = lowerable(source);
  if (!wrapper || !path || entries.has(wrapper) || kept.has(wrapper) || source.texture.source.length !== 1) return;
  queueLow({ source, wrapper, path, generation, phase: "lowering" });
}

/** Decode `entry`'s sheet at low resolution off the main thread and swap it in (`entry.phase` "lowering" → "low"). */
function queueLow(entry: Entry): void {
  const { source, wrapper } = entry;
  entries.set(wrapper, entry);
  queue.push(async () => {
    if (!live(entry) || entry.phase !== "lowering") return;
    try {
      const bitmap = await decode(entry, lowSize(source));
      if (live(entry) && entry.phase === "lowering") { upload(entry, bitmap); entry.phase = "low"; }
      bitmap.close();
    } catch {
      totals.failed++;
      if (!live(entry) || entry.phase !== "lowering") return;
      entries.delete(wrapper);
      // Born low, the GPU holds only the stand-in: the original goes up the old way (a main-thread upload of Phaser's image).
      if (entry.born && !stubSources.has(source)) upload(entry, source.image as HTMLImageElement);
    }
  });
  pump();
}

/** Phaser 가 그리려 한다(또는 그린다고 알렸다): 내리는 중이면 그만두고, 내려 있으면 원본 디코드를 줄 맨 앞에 넣는다. 저해상도는 그동안 그대로 그린다. */
function onPhaserUse(entry: Entry): void {
  kept.add(entry.wrapper);
  // Lowering an original: stop (it is still the original). A sheet born low has none on the GPU yet: raise it at once.
  if (entry.phase === "lowering" && !entry.born) { entries.delete(entry.wrapper); totals.cancelled++; return; }
  if (entry.phase !== "low" && entry.phase !== "lowering") return;
  entry.phase = "raising";
  queue.unshift(async () => {
    if (!live(entry)) return;
    try {
      const bitmap = await decode(entry);
      if (live(entry)) upload(entry, bitmap);
      bitmap.close();
    } catch {
      totals.failed++;
      // 파일을 다시 못 받으면 Phaser 가 들고 있는 이미지로 올린다(메인 스레드 디코드 — 예전 방식). 파일 없는 시트는 대역을 그대로 둔다.
      if (live(entry) && !stubSources.has(entry.source)) upload(entry, entry.source.image as HTMLImageElement);
    }
    if (entries.get(entry.wrapper) === entry) { entries.delete(entry.wrapper); totals.raised++; }
  });
  pump();
}

/**
 * The clear stand-in a sheet born low holds on the GPU until its low decode lands: 3×3, not a power of two, so Phaser makes it as it makes
 * the sheet itself (clamped, no mipmaps — `createTextureFromSource` reads the size off the source it uploads).
 */
let standIn: HTMLCanvasElement | null = null;
const standInCanvas = (): HTMLCanvasElement => standIn ??= Object.assign(document.createElement("canvas"), { width: 3, height: 3 });

/**
 * Images the loader decoded off the main thread (`installPhaserImageUploads`), waiting for their texture. Phaser's own upload of an
 * `HTMLImageElement` decodes it on the main thread inside `texImage2D` — 3 ms a MiB, 35~100 ms a big sheet (2026-10-13: 1.05 s on entering
 * the village); a decoded bitmap uploads at about 0.4 ms a MiB. A bitmap no texture takes (a failed file, a part of a load that never
 * completed) is closed after `AHEAD_HOLD_MS`.
 */
const decodedAhead = new Map<HTMLImageElement, ImageBitmap>();
/** Smaller images decode on the main thread as before: the extra step is not worth it (HUD icons and the like). */
const MIN_AHEAD_BYTES = 256 * 1024;
const AHEAD_HOLD_MS = 30_000;
/** How long a loaded file waits for its decode (a big sheet takes 20~100 ms off the main thread). */
const AHEAD_WAIT_MS = 2_000;

/**
 * Every image texture is made here (`TextureSource.init`), in one interception:
 * - a sheet of a family already lowered (three draws that character) is created low: the GPU gets a 3×3 stand-in instead of the original
 *   upload, and the low decode is queued. Phaser keeps the original image and size (frames, a context restore).
 * - else an image the loader decoded ahead goes up as its bitmap (closed right after); Phaser keeps the image for a context restore.
 */
function installTextureSourceInit(): void {
  if (textureSourceInitInstalled) return;
  textureSourceInitInstalled = true;
  const prototype = Phaser.Textures.TextureSource.prototype as unknown as { init(this: Phaser.Textures.TextureSource, game: Phaser.Game): void };
  const init = prototype.init;
  prototype.init = function (this: Phaser.Textures.TextureSource, game: Phaser.Game) {
    const image = this.image, webgl = game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer;
    if (webgl && this.texture.key === stubbingKey && this.texture.source.length === 0) { stubLow(this, game, init); return; }
    const bitmap = image instanceof HTMLImageElement ? decodedAhead.get(image) : undefined;
    if (bitmap) decodedAhead.delete(image as HTMLImageElement);
    const path = image instanceof HTMLImageElement ? bornLowPath(this.texture.key, this.width, this.height) : null;
    if (path && webgl && this.texture.source.length === 0) { bitmap?.close(); bornLow(this, game, init, path); return; }
    if (!bitmap || !webgl) { bitmap?.close(); init.call(this, game); return; }
    this.image = bitmap as unknown as HTMLImageElement;
    try { init.call(this, game); } finally { this.image = image; bitmap.close(); }
    const wrapper = wrapperOf(this);
    // A context restore rebuilds from Phaser's image (the bitmap is closed).
    if (wrapper) wrapper.pixels = image;
    totals.decodedAhead++;
  };
}
let textureSourceInitInstalled = false;

type SourceInit = (this: Phaser.Textures.TextureSource, game: Phaser.Game) => void;

/** Phaser makes the source's GPU texture from the 3×3 stand-in instead of its image; the wrapper keeps the sheet's own size. */
function initWithStandIn(source: Phaser.Textures.TextureSource, game: Phaser.Game, init: SourceInit): TextureWrapper | null {
  const image = source.image;
  source.image = standInCanvas();
  try { init.call(source, game); } finally { source.image = image; }
  const wrapper = wrapperOf(source);
  if (wrapper) { wrapper.width = source.width; wrapper.height = source.height; }
  return wrapper;
}

function bornLow(source: Phaser.Textures.TextureSource, game: Phaser.Game, init: SourceInit, path: string): void {
  const wrapper = initWithStandIn(source, game, init);
  if (!wrapper) return;
  // A context restore rebuilds from the original (`wrapper.pixels`), as it does for every lowered sheet.
  wrapper.pixels = source.image;
  totals.born++;
  queueLow({ source, wrapper, path, generation, phase: "lowering", born: true });
}

/** A sheet without its file (`stubSheet`): the stand-in on the GPU, low and waiting — no decode until Phaser draws it. */
function stubLow(source: Phaser.Textures.TextureSource, game: Phaser.Game, init: SourceInit): void {
  const wrapper = initWithStandIn(source, game, init), path = phaserAssetPath(source.texture.key);
  if (!wrapper || !path) return;
  wrapper.pixels = standInCanvas();
  stubSources.add(source);
  totals.stubbed++;
  entries.set(wrapper, { source, wrapper, path, generation, phase: "low", born: true });
}

/**
 * The loader's stub (`setPhaserSpriteSheetStub`): a sheet that would be born low (a family three draws) and that three draws from its
 * compressed copy only is made from its size and frames, without its file. Its image is an empty `Image` sized like the sheet (code that
 * measures the source still reads the right size). True when made.
 */
function stubSheet(scene: Phaser.Scene, asset: SpriteSheetAssetDefinition): boolean {
  const game = scene.game, width = asset.frameWidth * asset.columns, height = asset.frameHeight * asset.rows;
  if (!stubPolicy || !(game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) || !(width > 0 && height > 0)) return false;
  if (!bornLowPath(asset.key, width, height) || !stubPolicy(asset.path)) return false;
  install(game, game.renderer);
  stubbingKey = asset.key;
  try {
    const texture = scene.textures.create(asset.key, Object.assign(new Image(), { width, height }), width, height);
    if (!texture) return false;
    scene.textures.addSpriteSheet(asset.key, texture, { frameWidth: asset.frameWidth, frameHeight: asset.frameHeight });
  } finally { stubbingKey = null; }
  return true;
}

/** After a context restore Phaser remade a stub's GPU copy from the stand-in: low again, raised at once if Phaser drew it before. */
function restub(source: Phaser.Textures.TextureSource): void {
  const wrapper = wrapperOf(source), path = phaserAssetPath(source.texture.key);
  if (!wrapper || !path) { stubSources.delete(source); return; }
  wrapper.width = source.width; wrapper.height = source.height;
  const entry: Entry = { source, wrapper, path, generation, phase: "low", born: true };
  entries.set(wrapper, entry);
  if (kept.has(wrapper)) onPhaserUse(entry);
}

interface ImageFileLike {
  state: number;
  data: HTMLImageElement;
  readonly key: string;
  readonly crossOrigin: string | undefined;
  readonly xhrLoader: XMLHttpRequest;
  readonly loader: { readonly systems: { readonly game: Phaser.Game } };
  onProcessComplete(): void;
  onProcessError(): void;
}

/**
 * Phaser decodes loaded images off the main thread before they become textures (installed once at boot, before the game). The loader's
 * `ImageFile` makes its `Image` from the downloaded file as before; for a WebGL game and an image big enough, it also decodes the same
 * file into an `ImageBitmap` (premultiplied, as Phaser uploads images) and hands the file on once both are ready. The texture is then made
 * from the bitmap (`installTextureSourceInit`). A sheet that will be born low is not decoded. A browser that cannot decode leaves it as before.
 */
export function installPhaserImageUploads(): void {
  installTextureSourceInit();
  const File = Phaser.Loader.File as unknown as { revokeObjectURL(image: HTMLImageElement): void;
    createObjectURL(image: HTMLImageElement, blob: Blob, type: string): void };
  const prototype = Phaser.Loader.FileTypes.ImageFile.prototype as unknown as { onProcess(this: ImageFileLike): void };
  prototype.onProcess = function (this: ImageFileLike) {
    this.state = Phaser.Loader.FILE_PROCESSING;
    const image = this.data = new Image();
    image.crossOrigin = this.crossOrigin ?? null;
    const blob = this.xhrLoader.response as unknown;
    image.onload = () => {
      const done = () => { File.revokeObjectURL(image); this.onProcessComplete(); };
      const { naturalWidth: width, naturalHeight: height } = image;
      if (!(blob instanceof Blob) || typeof createImageBitmap !== "function" || width * height * 4 < MIN_AHEAD_BYTES
        || !(this.loader.systems.game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) || bornLowPath(this.key, width, height)) {
        done(); return;
      }
      // The file never waits on the decode for long: past `AHEAD_WAIT_MS` it goes on without it (its upload decodes, as before) and a
      // bitmap that arrives later is closed.
      let finished = false;
      const finish = (bitmap: ImageBitmap | null) => {
        if (finished) { bitmap?.close(); return; }
        finished = true;
        if (bitmap && (bitmap.width !== width || bitmap.height !== height)) bitmap.close();
        else if (bitmap) {
          decodedAhead.set(image, bitmap);
          setTimeout(() => { if (decodedAhead.get(image) === bitmap) { decodedAhead.delete(image); bitmap.close(); } }, AHEAD_HOLD_MS);
        }
        done();
      };
      const wait = setTimeout(() => finish(null), AHEAD_WAIT_MS);
      createImageBitmap(blob, { premultiplyAlpha: "premultiply" })
        .then(bitmap => { clearTimeout(wait); finish(bitmap); }, () => { clearTimeout(wait); finish(null); });
    };
    image.onerror = () => { File.revokeObjectURL(image); this.onProcessError(); };
    File.createObjectURL(image, blob as Blob, "image/png");
  };
}

function install(game: Phaser.Game, renderer: Phaser.Renderer.WebGL.WebGLRenderer): void {
  if (installedGame) return;
  installedGame = game;
  installTextureSourceInit();
  type Batch = { readonly texture: readonly TextureWrapper[] };
  const pipeline = Phaser.Renderer.WebGL.WebGLPipeline.prototype as unknown as { flush(this: { batch?: readonly Batch[] }, ...args: unknown[]): unknown };
  const flush = pipeline.flush;
  pipeline.flush = function (this: { batch?: readonly Batch[] }, ...args: unknown[]) {
    if (entries.size > 0) for (const batch of this.batch ?? []) for (const texture of batch.texture) {
      const entry = entries.get(texture);
      if (entry) onPhaserUse(entry);
    }
    return flush.apply(this, args);
  };
  // Phaser 는 모든 텍스처를 원본 이미지에서 다시 만든 뒤 이 사건을 낸다. 내려 있던(내리던) 시트를 새 회차로 다시 내린다.
  setPhaserTextureReadiness(prepare);
  renderer.on(Phaser.Renderer.Events.RESTORE_WEBGL, () => {
    const sources = [...entries.values()].map(entry => entry.source);
    generation++; entries.clear();
    for (const source of sources) if (!stubSources.has(source)) lower(source);
    for (const source of [...stubSources]) restub(source);
  });
  // 그리는 시트를 늦게 알리면(묶음보다 늦게 알게 되는 시트) 내리기를 그만두거나 원본으로 되돌린다.
  onPhaserDrawnTextures(keys => {
    for (const key of keys) {
      const wrapper = game.textures.exists(key) ? wrapperOf(game.textures.get(key).source[0]!) : null;
      const entry = wrapper ? entries.get(wrapper) : undefined;
      if (entry) onPhaserUse(entry);
    }
  });
  // 묶음의 시트가 나중에 들어오면(쿠마처럼 뷰가 늦게 받는 묶음) 그 묶음이 이미 내려가 있을 때 같이 내린다.
  game.textures.on(Phaser.Textures.Events.ADD, (key: string, texture: Phaser.Textures.Texture) => {
    const family = phaserTextureFamilyOf(key);
    if (family && loweredFamilies.has(family.id) && texture.source.length === 1) lower(texture.source[0]!);
  });
  const mib = (bytes: number) => Math.round(bytes / MIB);
  registerRenderStats({
    title: "phaser texture residency",
    read: () => {
      let low = 0, full = 0, pending = 0;
      for (const entry of entries.values()) {
        if (entry.phase === "lowering") { pending++; continue; }
        const [w, h] = lowGpuSize(entry);
        low += w * h * 4; full += entry.source.width * entry.source.height * 4;
      }
      return {
        lowered: entries.size - pending, lowMiB: mib(low), savedMiB: mib(full - low), pending, queued: queue.length,
        raised: totals.raised, cancelled: totals.cancelled, failed: totals.failed, born: totals.born, stubbed: totals.stubbed,
        decodedAhead: totals.decodedAhead,
        uploadMs: Math.round(totals.uploadMs * 10) / 10, uploadMaxMs: Math.round(totals.uploadMaxMs * 10) / 10,
      };
    },
  });
}

/**
 * 3D 마을이 그릴 캐릭터 묶음(`declarePhaserTextureFamily` 로 알린 시트들)을 처음부터 내려 둔다 — 두 번째 방문처럼(그때는 three 가
 * 이미 묶음마다 시트 하나를 맡아 내려 있다) 그 묶음의 시트가 저해상도로 태어난다. 첫 방문에는 로딩 화면에서 원본을 메인 스레드로
 * 다 올린 뒤에 내렸다(2026-10-13: 시트 한 장에 40~75 ms). 마을 preload 가 3D 를 쓸 때(WebGL2) 부른다. 그 뒤 Phaser 가 그리는 시트는
 * 내린 다른 시트처럼 원본으로 되돌린다.
 */
export function lowerPhaserTextureFamiliesAhead(game: Phaser.Game, keys: readonly string[]): void {
  if (!(game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) return;
  install(game, game.renderer);
  for (const key of keys) {
    const family = phaserTextureFamilyOf(key);
    if (family) loweredFamilies.add(family.id);
    const texture = game.textures.exists(key) ? game.textures.get(key) : null;
    if (family && texture?.source.length === 1) lower(texture.source[0]!);
  }
}

/** Phaser 가 당분간 그리지 않을 시트(와 그 묶음)의 GPU 사본을 저해상도로 바꾼다. Phaser 가 그리면 원본으로 되돌린다. */
export function releasePhaserTexture(game: Phaser.Game, source: Phaser.Textures.TextureSource,
  { afterUse = false }: { readonly afterUse?: boolean } = {}): void {
  if (!(game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) return;
  install(game, game.renderer);
  // 화면을 떠나는 씬이 다 쓴 시트를 돌려줄 때(옷가게 배우 시트): Phaser 가 그렸던 시트도 다시 내린다. 또 그리면 다시 되돌린다.
  const wrapper = afterUse ? wrapperOf(source) : null;
  if (wrapper) kept.delete(wrapper);
  lower(source);
  const family = phaserTextureFamilyOf(source.texture.key);
  if (!family || loweredFamilies.has(family.id)) return;
  loweredFamilies.add(family.id);
  for (const key of family.keys) {
    const texture = game.textures.exists(key) ? game.textures.get(key) : null;
    if (texture?.source.length === 1) lower(texture.source[0]!);
  }
}

/**
 * `PhaserTextureFamilies.preparePhaserTexture` 의 판정. 내려가 있으면 원본 되돌리기를 시작하고 false. 내리는 중이면 그만두고
 * true(아직 원본이다). 장부가 모르는 시트는 true.
 */
function prepare(game: Phaser.Game, key: string): boolean {
  const texture = game.textures.exists(key) ? game.textures.get(key) : null;
  const wrapper = texture && texture.source.length === 1 ? wrapperOf(texture.source[0]!) : null;
  const entry = wrapper ? entries.get(wrapper) : undefined;
  if (!entry) return true;
  const ready = entry.phase === "lowering" && !entry.born;
  onPhaserUse(entry);
  return ready;
}

/** 저해상도로 내려 둔 원본이면 지금 GPU 에 있는 크기, 아니면 null. 성능 표시가 GPU 메모리 어림에 쓴다. */
export function phaserTextureLowSize(source: Phaser.Textures.TextureSource): readonly [number, number] | null {
  const wrapper = wrapperOf(source);
  const entry = wrapper ? entries.get(wrapper) : undefined;
  return entry && entry.phase !== "lowering" ? lowGpuSize(entry) : null;
}

/**
 * 3D 마을이 GPU 압축판으로만 그리는 시트의 경로 판정을 건다(`NativeCityActorSheets` — 부팅 경로는 마을 목록을 import 하지 않는다).
 * 그 뒤 로더는 저해상도로 태어날 그런 시트를 파일 없이 만든다(`stubSheet`).
 */
export function setPhaserStubSheetPolicy(policy: (path: string) => boolean): void {
  stubPolicy = policy;
  setPhaserSpriteSheetStub(stubSheet);
}

/** 파일 없이 만든 시트인가(`stubSheet`). 그 이미지에는 픽셀이 없다 — 3D 카드는 압축판을 못 받으면 WebP 를 따로 받는다. */
export function isPhaserStubSheet(source: Phaser.Textures.TextureSource): boolean {
  return stubSources.has(source);
}

/** 키로 내린다: 로드된 한 장짜리 텍스처만(없는 키는 건너뛴다). `afterUse` 는 `releasePhaserTexture` 와 같다. */
export function releasePhaserTextureKeys(game: Phaser.Game, keys: Iterable<string>, options: { readonly afterUse?: boolean } = {}): void {
  for (const key of keys) {
    const texture = game.textures.exists(key) ? game.textures.get(key) : null;
    if (texture?.source.length === 1) releasePhaserTexture(game, texture.source[0]!, options);
  }
}
