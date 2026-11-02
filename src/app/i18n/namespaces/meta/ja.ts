import { definePartialTranslation } from "../../catalog";
import type { META_EN } from "./en";

/** `meta` 이름공간의 일본어 — 경기 도입의 건너뛰기 안내(`CutsceneSkipHintView`)만. 나머지는 본편 전용이라 영어로 남는다. */
export const META_JA = definePartialTranslation<typeof META_EN>({
  "meta.cutscene.skipAgain": "もう一度押すとスキップ",
});
