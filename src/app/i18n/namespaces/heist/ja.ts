import { definePartialTranslation } from "../../catalog";
import type { HEIST_EN } from "./en";

/**
 * `heist` 이름공간의 일본어 — 무투장 도전 대화(`ConversationPanelView`)가 쓰는 문구만. 나머지는 본편 전용이라 영어로 남는다
 * (`bundles/game/ja.ts` 가 영어 표 위에 덮는다).
 */
export const HEIST_JA = definePartialTranslation<typeof HEIST_EN>({
  "heist.conversation.replayFromStart": "最初から聞く",
  "heist.conversation.readingBack": "前の会話",
  "heist.conversation.nextLine": "次のセリフ",
  "heist.conversation.aMoment": "少し見つめる…",
  "heist.conversation.previousLine": "前のセリフ",
  "heist.conversation.tap": "タップ",
});
