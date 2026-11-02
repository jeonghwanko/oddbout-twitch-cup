/**
 * 마을 퀘스트의 연출 전용 아트 서술 단일 소유자.
 *
 * `VillageQuestPresentation.ts`가 문장을 소유하듯, 이 파일은 그 문장 옆에 무엇이 그려지는지를
 * 소유한다. 값은 전부 문자열 id다 — Phaser도, 텍스처 키도, 좌표도 여기 없다. 아틀라스 칸
 * 이름과 매니페스트 키를 고르는 일은 렌더 쪽 몫이고, 이 파일은 "어느 스텝이 어느 그림인가"
 * 하나만 답한다. 그래서 원화가 아직 없어도(텍스처 부재) 모델은 그대로 참이고, 빠지는 것은
 * 그 시각 요소 하나뿐이다.
 *
 * 칸 순서(`VILLAGE_QUEST_ICON_FRAMES`, `VILLAGE_QUEST_SYMBOL_FRAMES`)도 여기가 원본이다.
 * 빌더·매니페스트·뷰가 각자 순서를 적어 두면 아틀라스 한 칸이 밀렸을 때 셋이 따로 틀린다.
 */

import type { VillageQuestStepId } from "../sim/VillageQuestRules";
import type { VillageStoryId } from "../sim/VillageStoryRules";

/** 스텝 아이콘 아틀라스(`village-quest-icons-v1`)의 칸 순서. 이 배열이 곧 좌→우 배치다. */
export const VILLAGE_QUEST_ICON_FRAMES = [
  "scissors",
  "thief-hat",
  "music-box",
  "potion",
  "pocket-watch",
  "closed-door",
  "business-card",
  "manor-crest",
  "clockwork-bird",
  "calling-card",
] as const;

export type VillageQuestIconFrame = (typeof VILLAGE_QUEST_ICON_FRAMES)[number];

/** 선택 사건은 아틀라스 칸을 쓰지 않는다 — 사이드 문장(말풍선)만으로 구분한다. */
export type VillageQuestIconId = VillageQuestIconFrame | "story";

/** 퀘스트 기호 아틀라스(`village-quest-symbols-v1`)의 칸 순서. */
export const VILLAGE_QUEST_SYMBOL_FRAMES = ["marker", "stamp", "emblem-main", "emblem-side"] as const;

export type VillageQuestSymbolFrame = (typeof VILLAGE_QUEST_SYMBOL_FRAMES)[number];

/** 저널 히어로 카드가 쓰는 줄기 삽화. 스텝마다 그리지 않고 줄기당 한 장을 재사용한다. */
export type VillageQuestChainId = "rosaline" | "clockmaker" | "expedition";

/** 본선은 문장 방패, 선택 사건은 말풍선. 정보 위계를 색이 아니라 모양으로 먼저 말한다. */
export type VillageQuestEmblemId = "main" | "side";

/** 기존 표정 시트(`{rosaline,clockmaker}-expressions-v1`)만 쓴다. 새 초상은 만들지 않는다. */
export type VillageQuestPortraitId = "rosaline" | "clockmaker";

/** 표정 시트 2×2 칸: 0 담담 / 1 놀람 / 2 웃음 / 3 걱정. */
export type VillageQuestExpression = 0 | 1 | 2 | 3;

/** 사람이 아니라 장소가 목적지인 스텝은 기존 실내 리빌 스틸을 썸네일로 쓴다. */
export type VillageQuestStillId = "training-hall" | "manor-foyer" | "auction-lobby";

export interface VillageQuestStepArt {
  readonly icon: VillageQuestIconId;
  readonly chain: VillageQuestChainId | null;
  readonly emblem: VillageQuestEmblemId;
  readonly portrait: VillageQuestPortraitId | null;
  /** `portrait`가 null이면 읽히지 않는다. 그래도 0으로 두어 값이 비지 않게 한다. */
  readonly expression: VillageQuestExpression;
  readonly still: VillageQuestStillId | null;
}

function stepArt(
  icon: VillageQuestIconFrame,
  chain: VillageQuestChainId,
  face: readonly [VillageQuestPortraitId, VillageQuestExpression] | VillageQuestStillId,
): VillageQuestStepArt {
  const still = typeof face === "string" ? face : null;
  return Object.freeze({
    icon,
    chain,
    emblem: "main" as const,
    portrait: typeof face === "string" ? null : face[0],
    expression: typeof face === "string" ? 0 : face[1],
    still,
  });
}

/**
 * 스텝 하나에 그림 하나. 사람을 만나러 가는 스텝은 그 사람의 얼굴을, 장소로 가는 스텝은
 * 그 장소의 스틸을 건다 — 둘을 같이 걸면 "누구에게"와 "어디서"가 서로를 가린다.
 */
export const VILLAGE_QUEST_STEP_ART: Readonly<Record<VillageQuestStepId, VillageQuestStepArt>> = Object.freeze({
  "outfit-merchant-greeting": stepArt("scissors", "rosaline", ["rosaline", 2]),
  "outfit-thief-costume": stepArt("thief-hat", "rosaline", ["rosaline", 0]),
  "outfit-training-music-box": stepArt("music-box", "rosaline", "training-hall"),
  "outfit-music-box-delivery": stepArt("potion", "rosaline", ["rosaline", 2]),
  "clockmaker-introduction": stepArt("pocket-watch", "clockmaker", ["clockmaker", 3]),
  "blackthorne-turned-away": stepArt("closed-door", "clockmaker", "manor-foyer"),
  "blackthorne-guest-list": stepArt("business-card", "clockmaker", ["clockmaker", 1]),
  "manor-clockwork-bird": stepArt("manor-crest", "clockmaker", "manor-foyer"),
  "clockmaker-bird-return": stepArt("clockwork-bird", "clockmaker", ["clockmaker", 2]),
  "calling-card-campaign": stepArt("calling-card", "expedition", "auction-lobby"),
});

const SIDE_ART: VillageQuestStepArt = Object.freeze({
  icon: "story" as const,
  chain: null,
  emblem: "side" as const,
  portrait: null,
  expression: 0 as const,
  still: null,
});

/**
 * 선택 사건 4종은 한 벌을 나눠 쓴다.
 *
 * 사이드에 전용 그림을 주면 기록에서 본선과 무게가 같아 보이고, 트래커에 올라갈 수 없는
 * 항목이 더 눈에 띄는 역전이 생긴다. 모양(말풍선)으로만 "선택"이라고 말한다.
 */
export const VILLAGE_QUEST_SIDE_ART: Readonly<Record<VillageStoryId, VillageQuestStepArt>> = Object.freeze({
  magpie: SIDE_ART,
  market: SIDE_ART,
  apprentice: SIDE_ART,
  rumor: SIDE_ART,
});
