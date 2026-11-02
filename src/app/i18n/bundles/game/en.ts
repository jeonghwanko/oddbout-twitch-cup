import { COMMON_EN } from "../../namespaces/common/en";
import { INPUT_EN } from "../../namespaces/input/en";
import { HEIST_EN } from "../../namespaces/heist/en";
import { MANOR_EN } from "../../namespaces/manor/en";
import { VILLAGE_EN } from "../../namespaces/village/en";
import { ARENA_EN } from "../../namespaces/arena/en";
import { FIGHT_EN } from "../../namespaces/fight/en";
import { META_EN } from "../../namespaces/meta/en";
import { SETTINGS_EN } from "../../namespaces/settings/en";
import { INVITATION_EN } from "../../namespaces/invitation/en";

/** 게임 화면(fighter.html·본편)의 문구 표, 영어. 키와 자리표시자 타입의 원천이다(`import type`). */
export default Object.freeze({
  ...COMMON_EN,
  ...INPUT_EN,
  ...HEIST_EN,
  ...MANOR_EN,
  ...VILLAGE_EN,
  ...ARENA_EN,
  ...FIGHT_EN,
  ...META_EN,
  ...SETTINGS_EN,
  ...INVITATION_EN,
});
