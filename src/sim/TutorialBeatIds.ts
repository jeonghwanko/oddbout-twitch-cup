import tutorialContent from "./quests/tutorial.json";

// 튜토리얼 장의 ID — 게임 흐름(`GameFlow`)·브리핑·잠입이 함께 쓴다. 장의 판정(`TutorialRules`)과 떼어, 게임 흐름을 import 하는 무투장 페이지가
// 튜토리얼 판정과 그 저택 배치를 끌어오지 않게 한다(2026-10-30). 장 목록의 검사(`parseTutorialQuestDefinitions`)는 `TutorialRules`를 불러올 때 한다.

export type TutorialBeatId = keyof typeof tutorialContent.beats;

export const TUTORIAL_BEAT_IDS = Object.freeze(tutorialContent.order as TutorialBeatId[]);

/** 온보딩이 언제나 처음 여는 장. 저장이 없거나 "처음부터"를 고른 진입이 여기로 온다. */
export const TUTORIAL_FIRST_BEAT_ID: TutorialBeatId = tutorialContent.first as TutorialBeatId;

export function isTutorialBeatId(value: unknown): value is TutorialBeatId {
  return typeof value === "string" && (TUTORIAL_BEAT_IDS as readonly string[]).includes(value);
}
