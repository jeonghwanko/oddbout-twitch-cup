import Phaser from "phaser";
import { HYPE_UNDER_LAYERS, hypeContactLifeMs, hypeImpactSprites, type HypeContact, type HypeSprite, type HypeTex,
  type KeyedHypeContact } from "../effects/HypeImpactFx";
import { HYPE_TEXTURES, drawHypeTexture } from "../effects/HypeImpactTextures";

/** 원화 깊이 기준 층 간격. 마을 충격파(-0.0001)보다 위, y-sort 한 픽셀(0.001)보다 훨씬 작다. */
const UNDER_OFFSET = -0.00008, OVER_OFFSET = 0.00001, LAYER_STEP = 0.000001;
/** 화면 전체 상한(접촉 하나는 많아야 20여 장 — 2026-10-15 다시 잡은 층). */
const MAX_SPRITES = 200;
/** 새 접촉이 이 거리(맞은 몸 키 배율) 안의 이전 접촉을 바로 지운다 — 같은 몸 위에 잔해가 쌓이지 않게. */
const CUT_RADIUS = .6;

/** 텍스처는 게임 전역이다 — 씬마다 한 번만 굽는다. */
export function ensureHypeTextures(scene: Phaser.Scene): void {
  for (const [tex, spec] of Object.entries(HYPE_TEXTURES) as [HypeTex, (typeof HYPE_TEXTURES)[HypeTex]][]) {
    if (scene.textures.exists(spec.key)) continue;
    const canvas = scene.textures.createCanvas(spec.key, spec.width, spec.height);
    if (!canvas) continue;
    drawHypeTexture(tex, canvas.getContext());
    canvas.refresh();
  }
}

interface Live { contact: HypeContact; seenAt: number }

/**
 * `HypeImpactFx` 를 그리는 스프라이트 풀. 호출자(마을·저택 원화 명령)가 접촉을 일찍 놓아도 끝까지 그린다 —
 * 마지막으로 받은 나이에서 화면 시계로 이어 간다. 그래서 호출자의 효과 수명을 늘리지 않는다.
 */
export class HypeImpactView {
  private readonly sprites: Phaser.GameObjects.Image[] = [];
  private readonly live = new Map<string, Live>();

  constructor(private readonly scene: Phaser.Scene, private readonly depth: number) {
    ensureHypeTextures(scene);
    // 풀의 첫 장은 씬의 다른 오브젝트와 함께 지금 만든다. 마을은 UI 카메라를 만들 때 그때까지의 월드 오브젝트만 UI 카메라에서
    // 뺀다(`NativeCityScene`). 그래서 첫 장은 그 명단에 들고, 나중에 늘어나는 장은 첫 장의 카메라 필터를 물려받는다(`make`).
    // 물려받지 않으면 늘어난 불티를 UI 카메라가 한 번 더 그려 하늘에 같은 빛 터짐이 하나 더 뜬다(2026-10-15).
    this.sprites.push(this.make(HYPE_TEXTURES.glow.key));
  }

  private make(key: string): Phaser.GameObjects.Image {
    const image = this.scene.add.image(0, 0, key).setName("hype-impact").setVisible(false);
    const first = this.sprites[0];
    if (first) image.cameraFilter = first.cameraFilter;
    return image;
  }

  /** 장면 정리·되감기: 남은 불티까지 즉시 지운다. */
  clear(): void {
    this.live.clear();
    for (const sprite of this.sprites) sprite.setVisible(false);
  }

  /**
   * `nowMs` 는 호출자의 화면 시계(마을 `NativeCityCombatFxView`·저택 `ActionEffectView`) — 호출자가 일찍 놓은 접촉을 같은 시계로
   * 끝까지 잇는다. 게임 루프 시간을 따로 읽지 않는다(시계가 둘이면 한쪽이 멈출 때 접촉이 화면에 남았다).
   */
  draw(contacts: readonly KeyedHypeContact[], nowMs: number): void {
    for (const c of contacts) {
      if (!(c.ageMs >= 0)) continue;
      // A fresh contact cuts the older ones on the same body: one burst per victim on screen.
      if (!this.live.has(c.key)) {
        for (const [key, entry] of this.live) {
          const d = Math.hypot(entry.contact.x - c.x, entry.contact.y - c.y);
          if (d < c.bodyPx * CUT_RADIUS && entry.contact.ageMs + Math.max(0, nowMs - entry.seenAt) > c.ageMs) this.live.delete(key);
        }
      }
      this.live.set(c.key, { contact: c, seenAt: nowMs });
    }
    const perContact: HypeSprite[][] = [];
    for (const [key, entry] of this.live) {
      const ageMs = entry.contact.ageMs + Math.max(0, nowMs - entry.seenAt);
      if (ageMs >= hypeContactLifeMs(entry.contact)) { this.live.delete(key); continue; }
      perContact.push(hypeImpactSprites({ ...entry.contact, ageMs }));
    }
    // Over budget, the oldest contacts give way whole — never the bottom layers of every contact.
    let total = 0, from = perContact.length;
    while (from > 0 && total + perContact[from - 1]!.length <= MAX_SPRITES) total += perContact[--from]!.length;
    const shown = perContact.slice(from).flat().sort((a, b) => a.layer - b.layer);
    for (let i = 0; i < shown.length; i++) {
      const s = shown[i]!, spec = HYPE_TEXTURES[s.tex];
      let image = this.sprites[i];
      if (!image) {
        image = this.make(spec.key);
        this.sprites.push(image);
      }
      if (image.texture.key !== spec.key) image.setTexture(spec.key);
      image.setOrigin(spec.origin[0], spec.origin[1]).setPosition(s.x, s.y)
        .setScale(s.w / spec.width, s.h / spec.height).setRotation(s.rot)
        .setTint(s.color).setAlpha(s.alpha)
        .setBlendMode(s.add ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL)
        .setDepth(this.depth + (s.layer < HYPE_UNDER_LAYERS ? UNDER_OFFSET : OVER_OFFSET) + s.layer * LAYER_STEP)
        .setVisible(true);
    }
    for (let i = shown.length; i < this.sprites.length; i++) this.sprites[i]!.setVisible(false);
  }

  get count(): number { return this.live.size; }

  destroy(): void {
    for (const sprite of this.sprites) sprite.destroy();
    this.sprites.length = 0;
    this.live.clear();
  }
}
