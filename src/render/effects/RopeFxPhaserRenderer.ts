import Phaser from "phaser";
import { buildRopeFxLightTexture } from "../art/PlaceholderArt";
import { bakeTintedTextureLru } from "../art/CanvasTint";
import type { FxPrim } from "./FxPrim";

/** 한 프레임에 동시에 켜지는 빛의 최대 수. 박자 하나에 한두 개면 충분하다. */
const LIGHT_POOL = 8;

/**
 * Canvas 에서 빛 색별로 구워 두는 사본의 상한. 무대 하나가 쓰는 빛 색은 팔레트 램프·결투 색 스무 남짓이다 —
 * 그 이상이면 가장 오래 안 쓴 사본부터 지운다(`bakeTintedTextureLru`).
 */
const CANVAS_LIGHT_TINT_CAP = 32;

/** 살아 있는 렌더러의 빛 이미지들(게임마다) — Canvas 사본을 지워도 되는지 묻는다. */
const LIVE_LIGHTS = new WeakMap<Phaser.Game, Set<Phaser.GameObjects.Image>>();

/**
 * `drawRopeFx`·`drawCombatHitFx` 가 낸 도형을 Phaser 로 그린다. 보통 다각형은 Graphics 한 장,
 * 가산 다각형(`additive`, 전투 코어·가시)은 가산 Graphics 한 장, 빛은 방사형 텍스처
 * 이미지 풀(가산 합성). WebGL·Canvas 백엔드 모두에서 같은 모양이다.
 *
 * 가산 다각형은 기본으로 빛 층(`lightDepth`)에 앉는다. `additiveDepth` 를 주면 따로 올린다 —
 * 전투 접촉은 빛 웅덩이 < 조각·고리 < 코어·가시 순서여야 흰 코어가 보통 합성 조각에 안 덮인다.
 */
export class RopeFxPhaserRenderer {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly additive: Phaser.GameObjects.Graphics;
  private readonly lights: Phaser.GameObjects.Image[] = [];
  private lightScale = 1;
  private readonly lightKey: string;
  /**
   * Phaser 3.90 Canvas 렌더러는 Image tint 를 그리지 않는다 — 가산 빛이 색 없이 회백색으로 더해졌다(금고지기전 열기
   * 웅덩이, b497cc48). Canvas 는 색 곱한 사본 텍스처를 끼우고, WebGL 은 tint 그대로다.
   */
  private readonly canvasTint: boolean;
  private readonly game: Phaser.Game;
  /**
   * 꼭짓점 수마다 하나씩 둔 다각형 배열. 늘기만 하고 x·y 를 제자리에서 덮는다 — 상시 뷰 스무 남짓이 매 프레임
   * 꼭짓점마다 객체를 만들었다. Graphics 는 좌표를 명령 버퍼에 복사하므로 다음 도형이 같은 배열을 써도 된다.
   * `fillPoints` 는 배열 길이만큼 읽으므로 길이가 꼭 맞는 배열을 넘긴다.
   */
  private readonly polygons = new Map<number, Phaser.Types.Math.Vector2Like[]>();

  constructor(scene: Phaser.Scene, lightDepth: number, depth: number, name: string, additiveDepth: number = lightDepth,
    lightPool = LIGHT_POOL) {
    const light = buildRopeFxLightTexture(scene);
    this.lightKey = light;
    this.canvasTint = scene.game.renderer.type !== Phaser.WEBGL;
    this.game = scene.game;
    let live = LIVE_LIGHTS.get(scene.game);
    if (live === undefined) LIVE_LIGHTS.set(scene.game, live = new Set());
    // 씬이 닫히며 함께 사라진 이미지(scene 이 비었다)는 목록에서 걷는다.
    for (const image of live) if (image.scene === undefined || image.scene === null) live.delete(image);
    this.graphics = scene.add.graphics().setDepth(depth).setName(name);
    this.additive = scene.add.graphics().setDepth(additiveDepth).setName(`${name}-additive`)
      .setBlendMode(Phaser.BlendModes.ADD);
    for (let i = 0; i < lightPool; i += 1) {
      const image = scene.add.image(0, 0, light).setDepth(lightDepth)
        .setBlendMode(Phaser.BlendModes.ADD).setVisible(false).setName(`${name}-light`);
      this.lights.push(image);
      live.add(image);
    }
  }

  draw(prims: readonly FxPrim[], elementCount: number): void {
    const g = this.graphics.clear();
    const add = this.additive.clear();
    let light = 0;
    for (const prim of prims) {
      if (prim.kind === "light") {
        const image = this.lights[light];
        if (image === undefined) continue;
        light += 1;
        if (this.canvasTint) {
          const live = LIVE_LIGHTS.get(this.game);
          const key = bakeTintedTextureLru(image.scene, this.lightKey, prim.color, CANVAS_LIGHT_TINT_CAP,
            (tinted) => [...(live ?? [])].some((other) => other.scene != null && other.visible && other.texture.key === tinted));
          // 키가 같아도 지워졌다 다시 구운 사본일 수 있다 — 텍스처 객체로 비교한다.
          if (image.texture !== image.scene.textures.get(key)) image.setTexture(key);
        } else {
          image.setTint(prim.color);
        }
        image.setVisible(true).setPosition(prim.x, prim.y)
          .setDisplaySize(prim.radius * 2, prim.radius * 2 * (prim.squash ?? 1))
          .setAlpha(Math.min(1, prim.alpha) * this.lightScale);
        continue;
      }
      const polygon = this.polygon(Math.ceil(prim.points.length / 2));
      for (let i = 0; i < polygon.length; i += 1) {
        const point = polygon[i]!;
        point.x = prim.points[i * 2]!;
        point.y = prim.points[i * 2 + 1]!;
      }
      (prim.additive ? add : g).fillStyle(prim.color, prim.alpha).fillPoints(polygon, true);
    }
    for (let i = light; i < this.lights.length; i += 1) this.lights[i]!.setVisible(false);
    // E2E 가 연출이 실제로 돌았는지 읽는다.
    g.setData("elements", elementCount).setData("prims", prims.length).setData("lights", light);
  }

  /** 꼭짓점 `count` 개짜리 재사용 배열. */
  private polygon(count: number): Phaser.Types.Math.Vector2Like[] {
    let polygon = this.polygons.get(count);
    if (polygon === undefined) {
      polygon = Array.from({ length: count }, () => ({ x: 0, y: 0 }));
      this.polygons.set(count, polygon);
    }
    return polygon;
  }

  /** y 정렬 씬(마을)에서 매 프레임 층을 옮긴다. 빛·보통·가산 순서는 인자 순서 그대로다. */
  setDepths(lightDepth: number, depth: number, additiveDepth: number = lightDepth): void {
    this.graphics.setDepth(depth);
    this.additive.setDepth(additiveDepth);
    for (const image of this.lights) image.setDepth(lightDepth);
  }

  /** 보통 층 Graphics 의 가시성 — E2E 가 "지금 연출이 떠 있는가" 를 이것으로 읽는다. */
  setVisible(visible: boolean): void {
    this.graphics.setVisible(visible);
    this.additive.setVisible(visible);
  }

  /** 모션 감소: 형태(보통 다각형)는 두고 순간 광량(가산 다각형·빛)만 낮춘다. */
  setLightScale(scale: number): void {
    this.lightScale = Math.max(0, Math.min(1, scale));
    this.additive.setAlpha(this.lightScale);
  }

  destroy(): void {
    this.graphics.destroy();
    this.additive.destroy();
    const live = LIVE_LIGHTS.get(this.game);
    for (const image of this.lights) {
      live?.delete(image);
      image.destroy();
    }
  }
}
