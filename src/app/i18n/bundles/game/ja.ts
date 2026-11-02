import type { Translation } from "../../catalog";
import type GAME_EN from "./en";
import { COMMON_JA } from "../../namespaces/common/ja";
import { INPUT_EN } from "../../namespaces/input/en";
import { INPUT_JA } from "../../namespaces/input/ja";
import { HEIST_EN } from "../../namespaces/heist/en";
import { HEIST_JA } from "../../namespaces/heist/ja";
import { MANOR_EN } from "../../namespaces/manor/en";
import { VILLAGE_JA } from "../../namespaces/village/ja";
import { ARENA_JA } from "../../namespaces/arena/ja";
import { FIGHT_JA } from "../../namespaces/fight/ja";
import { META_EN } from "../../namespaces/meta/en";
import { META_JA } from "../../namespaces/meta/ja";
import { SETTINGS_JA } from "../../namespaces/settings/ja";
import { INVITATION_EN } from "../../namespaces/invitation/en";

/**
 * 게임 화면의 문구 표, 일본어. 본편 전용 이름공간은 영어 표 위에 무투장이 쓰는 몇 문구만 일본어로 덮는다(부분 번역).
 * 한 페이지는 이 표 하나만 받으므로 빠진 문구의 영어는 여기서 미리 채운다.
 */
export default Object.freeze({
  ...COMMON_JA,
  ...INPUT_EN, // 일본어로 옮기지 않은 본편 문구: 영어
  ...INPUT_JA,
  ...HEIST_EN, // 일본어로 옮기지 않은 본편 문구: 영어
  ...HEIST_JA,
  ...MANOR_EN, // 일본어로 옮기지 않은 본편 문구: 영어
  ...VILLAGE_JA,
  ...ARENA_JA,
  ...FIGHT_JA,
  ...META_EN, // 일본어로 옮기지 않은 본편 문구: 영어
  ...META_JA,
  ...SETTINGS_JA,
  ...INVITATION_EN, // 일본어로 옮기지 않은 본편 문구: 영어
}) satisfies Translation<typeof GAME_EN>;
