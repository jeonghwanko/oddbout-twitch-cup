import type { ComicImpactArtKind } from "../../assets/ComicImpactArtCatalog";
import type { DUEL_COMIC_IMPACT } from "./DuelComicImpact";
import type { HypeRank } from "./HypeImpactFx";
import type { VictimReactionTier } from "./VictimReactionPresentation";

/**
 * 마을 대결과 저택 전투가 함께 쓰는 타격 레시피(2026-10-15 — 사용자 결정: 저택 전투도 같은 레시피로 묶는다).
 *
 * 두 전투의 티어 이름이 등급 하나로 모인다(`combatImpactGrade`): 마을 `NativeCityImpactTier`(light·heavy·slam·dash·counter·break·ko),
 * 저택 `CombatHitTier`(light·heavy·dash·finisher·struck), 저택 사건 이름(crash·parry). 한 등급이 접촉의 만화 원화(`DuelComicArt`)와
 * 빛 터짐층(`HypeImpactFx`) 등급을 정한다. 마을(`NativeCityComicArt`)과 저택(`DuelActionImpact`)의 어댑터는 자리·방향만 맡는다.
 * 정지 중 이펙트 시계의 정책은 `CombatFxClock` 이 소유한다.
 */
export type CombatImpactGrade = "light" | "heavy" | "dash" | "counter" | "finisher" | "struck" | "parry";

export interface CombatImpactRecipe {
  /** 만화 원화 종류. 날붙이 접촉은 등급과 상관없이 `slash`(`COMBAT_SLASH_ART_WIDTH`). */
  readonly art: ComicImpactArtKind;
  /** 원화 폭 ÷ 맞은 몸 키. */
  readonly artWidth: number;
  /** 빛 터짐층 등급(0 평타 · 1 강타 · 2 돌진 충돌·반격 · 3 결정타). */
  readonly light: HypeRank;
}

/**
 * 원화 폭은 맞은 몸을 덮지 않는 크기다(2026-10-15 2차 검수: 옛 1.25~1.96 배는 결정타의 주인공인 맞은 몸을 지웠다). 크기는 이 표
 * 하나가 정한다 — 어댑터는 티어의 연출 배율(`fxScale`)을 다시 곱하지 않는다.
 */
export const COMBAT_IMPACT_RECIPES: Readonly<Record<CombatImpactGrade, CombatImpactRecipe>> = Object.freeze({
  light: { art: "strike", artWidth: .5, light: 0 },
  heavy: { art: "heavy", artWidth: .75, light: 1 },
  dash: { art: "heavy", artWidth: .85, light: 2 },
  counter: { art: "heavy", artWidth: .85, light: 2 },
  finisher: { art: "heavy", artWidth: 1.0, light: 3 },

  struck: { art: "strike", artWidth: .45, light: 0 },
  parry: { art: "parry", artWidth: .8, light: 2 },
});

/**
 * 막힌 타격의 원화 폭 ÷ 몸 키(2026-10-17 이펙트 화풍 통일 — 흰 별·진주 방패 호를 그린 원화로): 쇠 갑옷·쇠공·판금 기사의 정면에 튕긴
 * "텅!" `clang`, 올린 가드에 멈춘 "막!" `block`. 원화의 그림은 칸의 절반쯤이다. 평타 / 그보다 무거운 타격.
 */
export const COMBAT_BLOCK_ART_WIDTH = Object.freeze({
  clang: { light: .6, heavy: .8 },
  block: { light: .7, heavy: .85 },
});

/** 날붙이(단도·칼·참격) 접촉의 원화 폭 ÷ 몸 키. */
export const COMBAT_SLASH_ART_WIDTH = .9;

/**
 * 날붙이 평타(평타·맞은 쪽 평타)의 원화 폭 ÷ 몸 키(2026-10-16 애니메이터 검수: 0.9 배 참격이 넥타이 연타마다 3~4프레임 동안 맞은 몸의
 * 상체와 얼굴을 덮었다). 강타 이상은 `COMBAT_SLASH_ART_WIDTH` 그대로다.
 */
export const COMBAT_SLASH_LIGHT_ART_WIDTH = .5;

/**
 * 저택의 원화 폭 배율 — 저택 몸은 화면에서 마을의 약 0.6 배라 같은 몸 배율로는 결정타가 약하게 읽힌다(2026-10-15 2차 검수 ×1.15).
 */
export const COMBAT_MANSION_ART_SCALE = 1.15;

/**
 * 버틴 평타(흡수타): 경직 저항이 찬 경비에게 들어간 C 한 대. 피해·넉백은 들어가고 움찔만 없다. 같은 평타 원화와 빛 층을 이만큼 작고
 * 옅게 그린다(2026-10-17 사용자 결정). 막힘 원화(`clang`)는 "피해 0" 이라 쓰지 않는다. 크기와 광량을 함께 낮춰 색각과 무관하게 읽힌다.
 */
export const COMBAT_ABSORBED_HIT = Object.freeze({ scale: .6, alpha: .6 });

/** 어느 전투의 티어 이름이든 등급 하나로. 모르는 이름은 평타다. */
export function combatImpactGrade(tier: string | undefined): CombatImpactGrade {
  switch (tier) {
    case "finisher": case "break": case "ko": return "finisher";
    case "counter": return "counter";
    case "dash": case "crash": return "dash";
    case "heavy": case "slam": return "heavy";
    case "struck": return "struck";
    case "parry": return "parry";
    default: return "light";
  }
}

/**
 * 타격 무게 서열(2026-10-18 — 마을 이펙트·저택 어댑터·두 맞은 몸이 따로 세던 사다리 하나): 평타·맞은 접촉 0, 강타·내려찍기 1,
 * 돌진·반격·돌진 충돌 2, 깨짐·결정타 3, KO 4. 마을 `feel.fx.pressureWave.minRank`(native-city-combat.json)가 이 서열을 읽는다.
 * 모르는 이름은 0 이다. 등급(`combatImpactGrade`)과 같은 사다리이고, KO 만 결정타 등급에서 한 칸 위로 갈린다.
 */
export type CombatImpactRank = 0 | 1 | 2 | 3 | 4;

export function combatImpactRank(tier: string | undefined): CombatImpactRank {
  switch (tier) {
    case "ko": return 4;
    case "finisher": case "break": return 3;
    case "dash": case "counter": case "crash": return 2;
    case "heavy": case "slam": return 1;
    default: return 0;
  }
}

/** 그린 접촉 윤곽(`DuelComicImpact`)의 종류. */
export type CombatComicContactKind = keyof typeof DUEL_COMIC_IMPACT;

/** 서열 → 그린 접촉 윤곽: 3 이상 결정타, 2 충돌, 1 강타, 그 아래 평타. */
export function comicKindOfRank(rank: number): CombatComicContactKind {
  return rank >= 3 ? "finisher" : rank === 2 ? "crash" : rank === 1 ? "heavy" : "strike";
}

/** 티어 → 맞은 몸의 반응 티어(`VictimReactionPresentation`): 서열 3 이상 결정타, 0 평타, 그 사이 강타. */
export function combatVictimTier(tier: string | undefined): Extract<VictimReactionTier, "light" | "heavy" | "finisher"> {
  const rank = combatImpactRank(tier);
  return rank >= 3 ? "finisher" : rank === 0 ? "light" : "heavy";
}

/** 한 접촉의 만화 원화: 종류와 폭(몸 키 배율). 날붙이는 `slash`. */
export function combatContactArt(grade: CombatImpactGrade, sharp: boolean): { readonly kind: ComicImpactArtKind; readonly widthPerBody: number } {
  const recipe = COMBAT_IMPACT_RECIPES[grade];
  if (!sharp || grade === "parry") return { kind: recipe.art, widthPerBody: recipe.artWidth };
  return { kind: "slash", widthPerBody: grade === "light" || grade === "struck" ? COMBAT_SLASH_LIGHT_ART_WIDTH : COMBAT_SLASH_ART_WIDTH };
}
