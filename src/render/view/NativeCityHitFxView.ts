import type Phaser from "phaser";
import type { SpriteSheetAssetDefinition } from "../../assets/RuntimeArtTypes";
import { KUMA_FIGHT_ART, kumaFightArtReady, type KumaFightArtId } from "../../assets/KumaFightArtCatalog";
import { NATIVE_CITY_COMBAT, type NativeCityHitFxTuning } from "../../sim/cityFight/NativeCityCombatTuning";
import { artTextureKey } from "../art/ArtFallback";
import { preloadSpriteSheets } from "../art/PhaserAssetLoader";
import { VILLAGE_DEPTHS, villageActorFxDepth, villageYSorted } from "../depths";

/** Over the fighters and the code burst (a blow's star covers the body it lands on), under the comic letters (`SfxLetterView`). */
const HIT_FX_DEPTH = VILLAGE_DEPTHS.ambientFx + 2;
/** The speed lines' 3D card anchor sits this many world px behind the victim's feet, so the card view sorts it behind his card. */
const SPEED_BEHIND_PX = 3;
/** Each strip is one row of 6 frames of 256 px (`assets/art/kuma-fight-20261009/README.md`). */
const STRIP_FRAME_PX = 256;
const STRIP_FRAMES = 6;
/** Live speed-line rings at once (opening counter, break, dash hit — they never stack more than this). */
const SPEED_SLOTS = 2;

/** star: the muted ink impact star (an absorbed fist); speed: the focus-line ring behind the victim. */
export type NativeCityHitFxKind = "star" | "speed";

/** One drawn burst, in world px. */
export interface NativeCityHitFxSpec {
  readonly kind: NativeCityHitFxKind;
  readonly at: readonly [number, number];
  /** The frame's drawn height on screen (world px). */
  readonly sizePx: number;
  readonly angleDeg: number;
  readonly flipX: boolean;
  /** A tint, else the art's own colours. */
  readonly tint: number | null;
  /** This contact's own freeze. A later hit must not keep an earlier star alive. */
  readonly holdMs?: number;
  readonly tailFrameMs?: number;
  /** speed: world px of the victim's feet — the ring sits right behind his body (its depth, and its 3D card anchor). */
  readonly feet?: readonly [number, number];
}

const ART: Readonly<Record<NativeCityHitFxKind, KumaFightArtId>> = Object.freeze({ star: "fxImpactStar", speed: "fxSpeedLines" });
/**
 * The strips a fight asks for up front (`prepare`): the focus-line ring a punish draws. The star asks for its own strip at its first burst
 * (that burst draws nothing; the next ones do) — it only marks a fist his armour absorbed, sized x `feel.hitFx.star.armoredScale`, which
 * is 0 now: no star is ever burst, so its strip is never fetched.
 */
const PREPARED: readonly NativeCityHitFxKind[] = ["speed"];

function sheet(kind: NativeCityHitFxKind): SpriteSheetAssetDefinition {
  return { key: `kuma-fight-${ART[kind]}`, path: KUMA_FIGHT_ART[ART[kind]], frameWidth: STRIP_FRAME_PX, frameHeight: STRIP_FRAME_PX,
    columns: STRIP_FRAMES, rows: 1 };
}

/** A strip frame to show and its opacity. */
export interface NativeCityHitFxFrame { readonly frame: number; readonly alpha: number }

/**
 * The frame a star strip shows `ageMs` (screen) after its blow, or null once it is over (`feel.hitFx.frames`): `startFrame`
 * at once (the tiny frame 0 is skipped), the `peakFrame` from `leadMs`, HELD until `releasedMs` (the age at which the fight's freeze
 * let go, never before `leadMs + peakMinMs`; null while it still holds), then one frame every `tailFrameMs` to the strip's end, the
 * last one fading. No freeze: 16, 16, 33, 33, 33 ms — the peak is what the frozen picture shows.
 */
export function nativeCityHitFxStripFrame(ageMs: number, releasedMs: number | null,
  f: NativeCityHitFxTuning["frames"] = NATIVE_CITY_COMBAT.feel.hitFx.frames): NativeCityHitFxFrame | null {
  const age = Math.max(0, ageMs);
  if (age < f.leadMs) return { frame: f.startFrame, alpha: 1 };
  if (releasedMs === null || age < releasedMs) return { frame: f.peakFrame, alpha: 1 };
  const tail = (age - releasedMs) / Math.max(1, f.tailFrameMs), step = Math.floor(tail), frame = f.peakFrame + 1 + step;
  if (frame >= STRIP_FRAMES) return null;
  return { frame, alpha: frame === STRIP_FRAMES - 1 ? 1 - (tail - step) : 1 };
}

/** The speed-line ring `ageMs` (screen) in: `speedLines.frames` frames of `frameMs` each at `alpha` (not held by the freeze), then over. */
export function nativeCityHitFxSpeedFrame(ageMs: number,
  s: NativeCityHitFxTuning["speedLines"] = NATIVE_CITY_COMBAT.feel.hitFx.speedLines): NativeCityHitFxFrame | null {
  const frame = Math.floor(Math.max(0, ageMs) / Math.max(1, s.frameMs));
  return frame >= Math.min(STRIP_FRAMES, s.frames) ? null : { frame, alpha: s.alpha };
}

/**
 * `fresh`: born since the last update (its first shown frame is age 0). `heldMs`: the last age the freeze still held it;
 * `releasedMs`: the age its peak let go (null while held).
 */
interface Slot { readonly sprite: Phaser.GameObjects.Sprite; spec: NativeCityHitFxSpec | null; ageMs: number; startedAt: number;
  fresh: boolean; heldMs: number; releasedMs: number | null }

/**
 * 쿠마 대결의 그린 타격·피격 이펙트(`feel.hitFx`): 갑옷이 막아 낸 주먹 자리엔 흐린 먹 충격 별, 반격 첫 방·균형 붕괴·쿠마 돌진 적중·
 * 결판엔 맞은 몸 뒤의 집중선 고리. codex 스트립(`KumaFightArtCatalog` fxImpactStar·fxSpeedLines, 256px 6프레임)을 화면 시간으로
 * 넘긴다. 별은 자기 접촉의 경직 동안 정점을 붙든다. 다음 타격이 이전 별의 수명을 늘리지 않는다. 별은 코드 접촉 폭발
 * (`NativeCityCombatFx`) 위, 집중선은 맞은 몸 바로 뒤(3D 카드 모드에서는 그의 카드 뒤 카드 — `cardObjects`). 원화가 아직 안
 * 왔으면 조용히 건너뛴다(코드 폭발이 남는다). 슬롯은 미리 만든다 — 월드 카메라 전용(씬이 UI 카메라보다 먼저 만든다).
 */
export class NativeCityHitFxView {
  private readonly slots: Slot[] = [];
  private readonly speedSlots: Slot[] = [];
  private readonly requested = new Set<NativeCityHitFxKind>();
  private serial = 0;

  constructor(private readonly scene: Phaser.Scene) {
    const make = (name: string): Slot => ({ sprite: scene.add.sprite(0, 0, "__DEFAULT").setOrigin(0.5).setDepth(HIT_FX_DEPTH).setVisible(false)
      .setName(name), spec: null, ageMs: 0, startedAt: 0, fresh: false, heldMs: 0, releasedMs: null });
    const cap = Math.max(1, NATIVE_CITY_COMBAT.feel.hitFx.maxOnScreen);
    for (let i = 0; i < cap; i++) this.slots.push(make("native-city-hit-fx"));
    for (let i = 0; i < SPEED_SLOTS; i++) this.speedSlots.push(make("native-city-hit-fx-speed"));
  }

  /** Every object (the scene keeps them off its UI camera). */
  get objects(): readonly Phaser.GameObjects.GameObject[] { return [...this.slots, ...this.speedSlots].map(slot => slot.sprite); }

  /** The speed-line sprites: bodies in the 3D card view (a card just behind the victim's), plain sprites otherwise. */
  get cardObjects(): readonly Phaser.GameObjects.Sprite[] { return this.speedSlots.map(slot => slot.sprite); }

  /** Requests the up-front strips once (lazily, when a fight is on — `PREPARED`, only the ones the catalog lists as ready). */
  prepare(): void { this.request(PREPARED); }

  /** Requests each strip once (only the ones the catalog lists as ready). */
  private request(kinds: readonly NativeCityHitFxKind[]): void {
    const fresh = kinds.filter(kind => !this.requested.has(kind));
    if (fresh.length === 0) return;
    for (const kind of fresh) this.requested.add(kind);
    const ready = fresh.filter(kind => kumaFightArtReady(ART[kind])).map(sheet);
    if (ready.length === 0) return;
    preloadSpriteSheets(this.scene, ready);
    if (!this.scene.load.isLoading() && this.scene.load.list.size > 0) this.scene.load.start();
  }

  /** Plays a burst (the oldest of its pool gives way past the cap). Nothing until its strip is in. */
  burst(spec: NativeCityHitFxSpec): void {
    this.prepare();
    this.request([spec.kind]);
    const key = kumaFightArtReady(ART[spec.kind]) ? artTextureKey(this.scene, sheet(spec.kind).key, "decorative") : null;
    if (key === null) return;
    const pool = spec.kind === "speed" ? this.speedSlots : this.slots;
    const slot = pool.find(candidate => candidate.spec === null)
      ?? pool.reduce((oldest, candidate) => candidate.startedAt < oldest.startedAt ? candidate : oldest);
    slot.spec = spec; slot.ageMs = 0; slot.startedAt = ++this.serial; slot.fresh = true; slot.heldMs = 0; slot.releasedMs = null;
    if (slot.sprite.texture.key !== key) slot.sprite.setTexture(key, 0);
  }

  /** One frame of screen time; `frozen`: the fight's freeze holds (a star keeps its peak frame). */
  update(dtMs: number, frozen: boolean): void {
    const dt = Number.isFinite(dtMs) ? Math.max(0, dtMs) : 0, f = NATIVE_CITY_COMBAT.feel.hitFx.frames, peakEnd = f.leadMs + f.peakMinMs;
    for (const slot of [...this.slots, ...this.speedSlots]) {
      const spec = slot.spec;
      if (!spec) { slot.sprite.setVisible(false); continue; }
      // A burst's first shown frame is its contact frame (age 0), whatever part of this frame it was born in.
      if (slot.fresh) slot.fresh = false; else slot.ageMs += dt;
      if (slot.releasedMs === null) {
        if (frozen) slot.heldMs = slot.ageMs;
        else if (slot.ageMs >= peakEnd) slot.releasedMs = Math.max(peakEnd, slot.heldMs);
      }
      const release = spec.holdMs === undefined ? slot.releasedMs : Math.max(peakEnd, spec.holdMs);
      const frames = spec.tailFrameMs === undefined ? f : { ...f, tailFrameMs: spec.tailFrameMs };
      const shown = spec.kind === "speed" ? nativeCityHitFxSpeedFrame(slot.ageMs) : nativeCityHitFxStripFrame(slot.ageMs, release, frames);
      if (!shown) { slot.spec = null; slot.sprite.setVisible(false).setData("spatialAnchor", undefined); continue; }
      const sprite = slot.sprite.setFrame(shown.frame);
      if (spec.tint === null) sprite.clearTint(); else sprite.setTint(spec.tint);
      sprite.setVisible(true).setPosition(spec.at[0], spec.at[1]).setScale(spec.sizePx / STRIP_FRAME_PX).setAngle(spec.angleDeg)
        .setFlipX(spec.flipX).setAlpha(shown.alpha);
      if (spec.kind === "speed") {
        // Right behind the victim: his y-sorted depth minus a step, and a card anchor a few px behind his feet (3D card view).
        const feet = spec.feet ?? [spec.at[0], spec.at[1]];
        const behindVictim = villageActorFxDepth(villageYSorted(VILLAGE_DEPTHS.actorBody, feet[1]), -3);
        sprite.setDepth(behindVictim)
          .setData("spatialAnchor", { x: feet[0], y: feet[1] - SPEED_BEHIND_PX });
      } else sprite.setDepth(HIT_FX_DEPTH);
    }
  }

  destroy(): void {
    for (const slot of [...this.slots, ...this.speedSlots]) slot.sprite.destroy();
    this.slots.length = 0;
    this.speedSlots.length = 0;
  }
}
