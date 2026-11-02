import { definePartialTranslation } from "../../catalog";
import type { INPUT_EN } from "./en";

/** `input` 이름공간의 일본어 — 설정 조작법의 전투 줄(`combatControlsLabel`)만. 나머지는 본편 전용이라 영어로 남는다. */
export const INPUT_JA = definePartialTranslation<typeof INPUT_EN>({
  "input.cityFight": "シティファイト",
});
