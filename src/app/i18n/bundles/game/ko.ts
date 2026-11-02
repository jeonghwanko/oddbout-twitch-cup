import type { Translation } from "../../catalog";
import type GAME_EN from "./en";
import { COMMON_KO } from "../../namespaces/common/ko";
import { INPUT_KO } from "../../namespaces/input/ko";
import { HEIST_KO } from "../../namespaces/heist/ko";
import { MANOR_KO } from "../../namespaces/manor/ko";
import { VILLAGE_KO } from "../../namespaces/village/ko";
import { ARENA_KO } from "../../namespaces/arena/ko";
import { FIGHT_KO } from "../../namespaces/fight/ko";
import { META_KO } from "../../namespaces/meta/ko";
import { SETTINGS_KO } from "../../namespaces/settings/ko";
import { INVITATION_KO } from "../../namespaces/invitation/ko";

/** 게임 화면의 문구 표, 한국어. 페이지가 한국어일 때만 이 모듈을 받는다(`localeLoader`). */
export default Object.freeze({
  ...COMMON_KO,
  ...INPUT_KO,
  ...HEIST_KO,
  ...MANOR_KO,
  ...VILLAGE_KO,
  ...ARENA_KO,
  ...FIGHT_KO,
  ...META_KO,
  ...SETTINGS_KO,
  ...INVITATION_KO,
}) satisfies Translation<typeof GAME_EN>;
