import type { OtherworldItemId } from "../sim/OtherworldItemRules";
import type { VillageImageAsset } from "./VillageArtCatalog";

/**
 * 이세계 자판기와 건너온 현대 물건 원화.
 *
 * 옛 자판기 원본은 `assets/art-archive/otherworld-receiver-20261001/`, 현재 상품·로고 원본은
 * `kaito_web/assets/art/otherworld-items-anime-20261013/`에 있다. 재생성은
 * `tools/art/import-otherworld-art.mjs`가 현재 상품 패키저를 호출한다. 자판기는 강림 뒤 광장의
 * 황금 까치 분수 자리를 대신하는 랜드마크라 분수와 같은 접지점에 하단 중앙 앵커로 선다.
 */
export const OTHERWORLD_VENDING_ART = Object.freeze({
  key: "village-otherworld-vending",
  path: "art/village/iso-v3/otherworld-vending-line-v1.webp",
  w: 268,
  h: 267,
  transparent: true,
  /** 분화구 하단 중앙. import 보고서의 anchor 와 같다. */
  anchor: Object.freeze({ x: 134, y: 259 }),
  /** 분화구가 옛 분수 수반(월드 약 150px)을 덮고 조금 넘치게 하는 배율. */
  renderScale: 0.64,
} satisfies VillageImageAsset & Record<string, unknown>);

/**
 * 떨어지는 동안의 자판기(분화구·돌 없이 기계만). 박힌 원화와 같은 배율로 그리며, 기계 밑면이
 * 박힌 원화의 분화구 안 기계 밑면 높이(`groundLiftPx`, 월드 px)에 닿는 순간이 박힘이다.
 */
export const OTHERWORLD_VENDING_FALL_ART = Object.freeze({
  key: "otherworld-vending-falling",
  path: "art/village/otherworld/vending-falling-v1.webp",
  w: 166,
  h: 251,
  transparent: true,
  anchor: Object.freeze({ x: 83, y: 243 }),
  renderScale: OTHERWORLD_VENDING_ART.renderScale,
  groundLiftPx: 30,
} satisfies VillageImageAsset & Record<string, unknown>);

/** Anime reward pack: assets/art/otherworld-items-anime-20261013, tools/art/package-otherworld-anime.mjs. */
export const OTHERWORLD_ITEM_ART: Readonly<Record<OtherworldItemId, VillageImageAsset>> = Object.freeze({
  "can-coffee": itemArt("can-coffee"),
  smartphone: itemArt("smartphone"),
  "running-shoes": itemArt("running-shoes"),
  "card-wallet": itemArt("card-wallet"),
  "power-bank": itemArt("power-bank"),
});

/** 자판기 원화와 같은 치즈 고양이의 앞발. 릴을 미는 순간에만 사용한다. */
export const OTHERWORLD_REEL_PAW_ART = Object.freeze({
  key: "otherworld-reel-tap-paw", path: "art/ui/otherworld/reel-tap-paw.webp",
  w: 560, h: 214, transparent: true,
} satisfies VillageImageAsset);

export const OTHERWORLD_WORDMARK_ART = Object.freeze({
  key: "otherworld-wordmark", path: "art/ui/otherworld/wordmark.webp", w: 720, h: 180, transparent: true,
} satisfies VillageImageAsset);

export const OTHERWORLD_IMAGE_ASSETS: readonly VillageImageAsset[] = Object.freeze([
  OTHERWORLD_WORDMARK_ART,
  OTHERWORLD_REEL_PAW_ART,
  { key: OTHERWORLD_VENDING_ART.key, path: OTHERWORLD_VENDING_ART.path, w: OTHERWORLD_VENDING_ART.w, h: OTHERWORLD_VENDING_ART.h, transparent: true },
  { key: OTHERWORLD_VENDING_FALL_ART.key, path: OTHERWORLD_VENDING_FALL_ART.path, w: OTHERWORLD_VENDING_FALL_ART.w, h: OTHERWORLD_VENDING_FALL_ART.h, transparent: true },
  ...Object.values(OTHERWORLD_ITEM_ART),
]);

function itemArt(id: OtherworldItemId): VillageImageAsset {
  return Object.freeze({ key: `otherworld-item-${id}`, path: `art/ui/otherworld/${id}.webp`, w: 256, h: 256, transparent: true });
}
