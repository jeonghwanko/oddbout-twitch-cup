import type Phaser from "phaser";
import { KUMA_FIGHT_ART, kumaFightArtReady, kumaFightLetterArtId, kumaFightLetterPath, type KumaFightLetterId,
  type KumaFightLocale } from "../../assets/KumaFightArtCatalog";
import type { SpriteSheetAssetDefinition } from "../../assets/RuntimeArtTypes";
import { NATIVE_CITY_COMBAT } from "../../sim/cityFight/NativeCityCombatTuning";
import { artTextureKey } from "../art/ArtFallback";
import { cssHex, FONT, PALETTE } from "../art/palette";
import { preloadImageAssets, preloadSpriteSheets } from "../art/PhaserAssetLoader";
import { VILLAGE_DEPTHS } from "../depths";
import { holdUnderCeiling } from "./WorldCeiling";
import { nativeCityExchangeStarPoints } from "../effects/NativeCityExchangeFx";
import { pushSfxLetter, sfxLetterFrame, sfxLetterShards, sfxLetterStyle, sfxLetterText, stepSfxLetters, type SfxLetterLive,
  type SfxLetterSpec } from "../effects/webtoon/SfxLetter";

/** Above every world layer (the impact frame's plate sits under it), below the name plates and the HUD. */
const LETTER_DEPTH = VILLAGE_DEPTHS.ambientFx + 3;
/** The ink burst behind a heavy letter sits just under the letters. */
const LETTER_BURST_DEPTH = LETTER_DEPTH - 0.01;
/** The code font is set this big and scaled down to the letter's world height (crisp at any zoom). */
const FONT_PX = 72;

/** The texture key of a drawn letter (`KumaFightArtCatalog`). */
function letterTextureKey(id: KumaFightLetterId, locale: KumaFightLocale): string {
  return `kuma-fight-${kumaFightLetterArtId(id, locale)}`;
}

/** The drawn ink-gold shards a heavy letter breaks into (`sfxLetterShards`): one row of six 256 px cells. */
const SHARDS: SpriteSheetAssetDefinition = Object.freeze({ key: "kuma-fight-letterShards", path: KUMA_FIGHT_ART.letterShards,
  frameWidth: 256, frameHeight: 256, columns: 6, rows: 1 });
const SHARD_COUNT = 6;

/**
 * The letters the fight itself pops (the intro / victory letters — 결투·VS·K.O.·칼퇴 — are the overlay's): the hit sounds and the drawn
 * 스윽!·덥석! (B074). Since 2026-10-18 the statuses ("텅!", "깨짐!") are status labels (`CombatStatusTag`, `NativeCityFloatTextView`).
 * "빈틈!" (an opening's one word since 2026-10-19 신호 정리) stays OFF this list on purpose: its drawn art is gold, and the code font draws it
 * in the "attack now" magenta (`sfxLetterStyle`) — gold is the gold grade's only.
 */
const FIGHT_LETTERS: readonly KumaFightLetterId[] = ["puk", "kwang", "mak", "hwik", "counter", "seuk", "deopseok", "superArmor"];

/** A pooled letter. `shown`: the letter its text was last styled for (a Phaser Text re-renders on every style call — only on change). */
interface Slot { readonly text: Phaser.GameObjects.Text; readonly image: Phaser.GameObjects.Image; readonly shards: Phaser.GameObjects.Image[];
  shown: SfxLetterSpec | null }

/**
 * 쿠마 대결의 만화 효과음 글자(`effects/webtoon/SfxLetter` 시간표)를 월드 위에 그린다. 원화가 준비된 글자(`kumaFightArtReady`)는 그
 * 그림을, 아니면 코드 글꼴(웹툰 식자체, 두꺼운 잉크 외곽선·따뜻한 채움·기울임·한 칸 밀린 그늘)을 쓴다. 코드 글꼴의 무거운 글자
 * 뒤에만 잉크 별이 터진다(그린 글자는 제 잉크 가시가 있다). 글자 수는 `feel.letters.maxOnScreen` 이 상한이고 슬롯은 미리 만든다 — 월드 카메라 전용(씬이 UI 카메라보다 먼저
 * 만든다). 언어는 씬의 지금 언어(`locale`)를 매 팝마다 읽는다. 원화는 대결이 시작될 때(`prepare`) 그 언어 것만 늦게 받는다.
 */
export class SfxLetterView {
  private readonly slots: Slot[] = [];
  private readonly bursts: Phaser.GameObjects.Graphics;
  private live: SfxLetterLive[] = [];
  /** The locale each live letter was popped in (its slot keeps that text). */
  private readonly locales = new WeakMap<SfxLetterSpec, KumaFightLocale>();
  /** Drawn letters requested so far (`prepare`), by texture key: each locale's, each asked for once. */
  private readonly requested = new Set<string>();
  /** The host's own call letters, requested with the fight's (`prepareCalls`). */
  private readonly calls = new Set<KumaFightLetterId>();

  /**
   * `ceiling`: the highest world y a letter or shard may show at now (the arena's face HUD floor — `NativeCityFightSinksSpec.hudFloor`,
   * read from the camera's scroll and zoom of the moment); absent, anywhere (the village's letters float over the heads).
   */
  constructor(private readonly scene: Phaser.Scene, private readonly locale: () => KumaFightLocale,
    private readonly ceiling: (() => number) | null = null) {
    const cap = Math.max(1, NATIVE_CITY_COMBAT.feel.letters.maxOnScreen);
    this.bursts = scene.add.graphics().setDepth(LETTER_BURST_DEPTH).setName("native-city-sfx-letter-burst");
    for (let i = 0; i < cap; i++) {
      const text = scene.add.text(0, 0, "", { fontFamily: FONT.lettering, fontSize: `${FONT_PX}px`, fontStyle: "bold", color: cssHex(PALETTE.hotGold),
        stroke: cssHex(PALETTE.webtoonInk), strokeThickness: 14, align: "center", padding: { x: 10, y: 8 } })
        .setOrigin(0.5).setResolution(2).setDepth(LETTER_DEPTH).setVisible(false).setName("native-city-sfx-letter");
      const image = scene.add.image(0, 0, "__DEFAULT").setOrigin(0.5).setDepth(LETTER_DEPTH).setVisible(false).setName("native-city-sfx-letter-art");
      const shards = Array.from({ length: SHARD_COUNT }, () => scene.add.image(0, 0, "__DEFAULT").setOrigin(0.5).setDepth(LETTER_DEPTH)
        .setVisible(false).setName("native-city-sfx-letter-shard"));
      this.slots.push({ text, image, shards, shown: null });
    }
    // Under a ceiling the frame's last word is the camera's: the scene's update ran before the camera rig moved this frame (a punch-in
    // carried a shard 0.9 of a letter up into the HUD), so just before the cameras draw, each shown piece is put back under it.
    if (this.ceiling) this.release = holdUnderCeiling(scene, () => this.slots.flatMap(slot => [slot.text, slot.image, ...slot.shards]), this.ceiling);
  }

  private release: (() => void) | null = null;

  /** Every object (the scene keeps them off its UI camera). */
  get objects(): readonly Phaser.GameObjects.GameObject[] {
    return [this.bursts, ...this.slots.flatMap(slot => [slot.text, slot.image, ...slot.shards])];
  }

  /**
   * Requests the drawn fight letters of the current locale (and the host's calls — `prepareCalls`), each once (lazily — the controller
   * calls it when a fight is on, and every pop does too). Only ids the catalog lists as ready (`kumaFightArtReady`) are requested, by `kumaFightLetterPath`, so
   * no missing file is ever asked for; until a texture is in (`artTextureKey`), the code font draws the letter.
   */
  prepare(): void {
    const locale = this.locale();
    // The shard strip is the same for every locale: asked for with the first.
    if (this.requested.size === 0 && kumaFightArtReady("letterShards")) preloadSpriteSheets(this.scene, [SHARDS]);
    const ready = [...FIGHT_LETTERS, ...this.calls].filter(id => kumaFightArtReady(kumaFightLetterArtId(id, locale)))
      .map(id => ({ key: letterTextureKey(id, locale), path: kumaFightLetterPath(id, locale) })).filter(asset => !this.requested.has(asset.key));
    if (ready.length === 0) return;
    for (const asset of ready) this.requested.add(asset.key);
    preloadImageAssets(this.scene, ready);
    if (!this.scene.load.isLoading() && this.scene.load.list.size > 0) this.scene.load.start();
  }

  /**
   * Adds the host's own call letters to the fight's (the AI duel's two corners' — `FIGHTER_CONTACT_LETTERS`, the ODDBOUT clips'
   * `keys.contactLetter`; 2026-10-24: they were never requested, and their drawings never showed) and requests them now. Only the corners'
   * calls, not every fighter's.
   */
  prepareCalls(ids: readonly KumaFightLetterId[]): void {
    for (const id of ids) this.calls.add(id);
    this.prepare();
  }

  /**
   * Pops a letter (the oldest gives way past the cap), under the ceiling: its top no higher than it, and the room it has up to it kept on
   * the letter (`roomPx`) — its stamp, drift and shards stay under it too.
   */
  pop(popped: SfxLetterSpec): void {
    const ceiling = this.ceiling?.() ?? null, low = ceiling === null ? popped.at[1] : Math.max(popped.at[1], ceiling + popped.sizePx / 2);
    const spec = ceiling === null ? popped : { ...popped, at: [popped.at[0], low] as const, roomPx: low - ceiling };
    // A call nobody asked for ahead (its clip came in after the fight began): drawn from its next pop on.
    this.calls.add(popped.id);
    this.prepare();
    this.locales.set(spec, this.locale());
    this.live = pushSfxLetter(this.live, spec);
  }

  /** Drops every live letter (a host enemy's KO — 2026-10-17: the opening's "빈틈!" stayed over the KO plate). */
  clear(): void { this.live = []; }

  /** A drawn letter's width over its height in the current locale once its art is in (`kumaFightLetterPath`), else null. */
  aspect(id: KumaFightLetterId): number | null {
    const locale = this.locale();
    const key = kumaFightArtReady(kumaFightLetterArtId(id, locale)) ? artTextureKey(this.scene, letterTextureKey(id, locale), "decorative") : null;
    const frame = key === null ? null : this.scene.textures.getFrame(key);
    return frame && frame.height > 0 ? frame.width / frame.height : null;
  }

  /** Drops the live letters popped as `id` at once (`NativeCityLetterSink.dismiss`). */
  dismiss(id: KumaFightLetterId): void { this.live = this.live.filter(letter => letter.spec.id !== id); }

  /** One frame of screen time. */
  update(dtMs: number, reducedMotion: boolean): void {
    const shardKey = kumaFightArtReady("letterShards") ? artTextureKey(this.scene, SHARDS.key, "decorative") : null;
    // No drawn shards yet: a heavy letter drifts and fades instead of being cut with nothing flying.
    const shardsReady = shardKey !== null;
    this.live = stepSfxLetters(this.live, dtMs, reducedMotion, undefined, shardsReady);
    // The ceiling where it is now: the letters are world objects and a camera punch-in carries them up the screen after their pop (its
    // `roomPx` keeps their own motion under the pop's ceiling; this keeps them under the HUD as the camera moves).
    const ceiling = this.ceiling?.() ?? null, under = (y: number, halfPx: number) => ceiling === null ? y : Math.max(y, ceiling + halfPx);
    const g = this.bursts.clear();
    this.slots.forEach((slot, i) => {
      const letter = this.live[i];
      for (const shard of slot.shards) shard.setVisible(false);
      if (!letter) { slot.text.setVisible(false); slot.image.setVisible(false); return; }
      const { spec } = letter, frame = sfxLetterFrame(spec, letter.ageMs, reducedMotion, undefined, shardsReady);
      // A heavy letter that broke: its drawn shards fly (the letter itself is already cut — alpha 0 below).
      if (shardKey !== null) {
        sfxLetterShards(spec, letter.ageMs, reducedMotion, undefined, shardsReady).forEach((shard, n) => {
          const image = slot.shards[n];
          if (!image) return;
          if (image.texture.key !== shardKey || image.frame.name !== String(shard.frame)) image.setTexture(shardKey, shard.frame);
          if (spec.tone === "miss") image.setTint(PALETTE.fightLetterMiss); else image.clearTint();
          image.setVisible(true).setPosition(spec.at[0] + shard.dx, under(spec.at[1] + shard.dy, shard.sizePx / 2)).setAngle(shard.angleDeg)
            .setScale(shard.sizePx / SHARDS.frameHeight);
        });
      }
      const x = spec.at[0] + frame.dx, y = under(spec.at[1] + frame.dy, spec.sizePx * frame.scale / 2);
      const locale = this.locales.get(spec) ?? this.locale();
      const key = kumaFightArtReady(kumaFightLetterArtId(spec.id, locale)) ? artTextureKey(this.scene, letterTextureKey(spec.id, locale), "decorative") : null;
      // The code font's heavy letter gets an ink burst behind it (a concave ink star, a warm one inside — curved arms, not a flat
      // polygon). A drawn letter has its own ink spikes: nothing behind it.
      if (key === null && frame.burst > 0 && frame.burstAlpha > 0.01) {
        const r = spec.sizePx * frame.burst * 0.5 * frame.scale, rot = spec.side * 0.2;
        const style = sfxLetterStyle(spec.id);
        g.fillStyle(PALETTE.webtoonInk, 0.88 * frame.burstAlpha).fillPoints(toPoints(nativeCityExchangeStarPoints(x, y, r, rot, 0.5, 9, 4)), true);
        g.fillStyle(style.fill, 0.55 * frame.burstAlpha).fillPoints(toPoints(nativeCityExchangeStarPoints(x, y, r * 0.62, rot + 0.17, 0.55, 9, 4)), true);
      }
      if (key !== null) {
        slot.text.setVisible(false);
        if (slot.image.texture.key !== key) slot.image.setTexture(key);
        const k = spec.sizePx / Math.max(1, slot.image.height);
        if (spec.tone === "miss") slot.image.setTint(PALETTE.fightLetterMiss); else slot.image.clearTint();
        slot.image.setVisible(true).setPosition(x, y).setScale(k * frame.scale).setAngle(frame.angleDeg).setAlpha(frame.alpha);
        return;
      }
      slot.image.setVisible(false);
      if (slot.shown !== spec) {
        slot.shown = spec;
        const style = sfxLetterStyle(spec.id);
        slot.text.setText(sfxLetterText(spec.id, locale)).setColor(cssHex(spec.tone === "miss" ? PALETTE.fightLetterMiss : style.fill))
          .setStroke(cssHex(style.stroke), 14)
          .setShadow(5, 6, cssHex(style.shade), 0, true, true);
      }
      const k = spec.sizePx / FONT_PX;
      slot.text.setVisible(true).setPosition(x, y).setScale(k * frame.scale).setAngle(frame.angleDeg).setAlpha(frame.alpha);
    });
  }

  destroy(): void {
    this.release?.();
    this.bursts.destroy();
    for (const slot of this.slots) { slot.text.destroy(); slot.image.destroy(); for (const shard of slot.shards) shard.destroy(); }
    this.slots.length = 0;
    this.live = [];
  }
}

function toPoints(flat: readonly number[]): Phaser.Types.Math.Vector2Like[] {
  const out: Phaser.Types.Math.Vector2Like[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push({ x: flat[i]!, y: flat[i + 1]! });
  return out;
}
