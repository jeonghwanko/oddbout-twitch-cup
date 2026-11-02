import { PALETTE } from "../art/palette";
import type { DamageNumberStyle } from "./DamageNumberPresentation";

/**
 * 상태 글자(버프·디버프) — 대미지 숫자와 같은 자리, 같은 곡선(`damageNumberFrame`)으로 맞은 몸 옆에 뜨는 짧은 이름(2026-10-18).
 *
 * 마을 대결에서 상태를 말하던 만화 글자(깨짐!·텅!·빈틈!)를 이 표가 대신한다(사용자 결정: 상태 글자로 통일 — 만화 글자는 타격음
 * 퍽!·쾅!·휙!·막!·카운터!와, 원화를 그린 덥석!(잡기)·스윽!(기술 소매치기)이 남는다 — 그래서 "잡힘"·"기술 확보"는 없다). 새 상태는
 * 여기 한 줄과 i18n 한·영 한 쌍이다. 쿠마 근무 전환은 말풍선이 말하므로 없다.
 *
 * 극성이 색을 정한다: 버프는 청록(`PALETTE.loot`), 디버프는 경보 빨강(`PALETTE.alarm`). 숫자보다 작고 흔들리지 않으며 조금 오래 남는다 —
 * 숫자는 "얼마나", 이 글자는 "무엇이 걸렸나"다.
 */

export type CombatStatusId =
  | "guardBroken"
  | "dizzy"
  | "invulnerable"
  | "beatMissed"
  | "groggy"
  | "guardPierced"
  | "armor"
  | "opening"
  | "chance"
  | "down"
  | "haste";

export type CombatStatusPolarity = "buff" | "debuff";

/** A status's label (`fight.status.*` — no placeholders). */
export type CombatStatusLabelKey = `fight.status.${CombatStatusId}`;

export interface CombatStatusTag {
  readonly polarity: CombatStatusPolarity;
  readonly labelKey: CombatStatusLabelKey;
}

export const COMBAT_STATUS_TAGS: Readonly<Record<CombatStatusId, CombatStatusTag>> = Object.freeze({
  guardBroken: { polarity: "debuff", labelKey: "fight.status.guardBroken" },
  dizzy: { polarity: "debuff", labelKey: "fight.status.dizzy" },
  invulnerable: { polarity: "buff", labelKey: "fight.status.invulnerable" },
  beatMissed: { polarity: "debuff", labelKey: "fight.status.beatMissed" },
  // 상대
  groggy: { polarity: "debuff", labelKey: "fight.status.groggy" },
  guardPierced: { polarity: "debuff", labelKey: "fight.status.guardPierced" },
  armor: { polarity: "buff", labelKey: "fight.status.armor" },
  opening: { polarity: "debuff", labelKey: "fight.status.opening" },
  // 저스트 회피·패리가 연 기회(2026-10-18 손맛 1단계, `kuma.rhythm.chance`): 그의 몸이 무방비 — 빈틈보다 큰 창.
  chance: { polarity: "debuff", labelKey: "fight.status.chance" },
  down: { polarity: "debuff", labelKey: "fight.status.down" },
  haste: { polarity: "buff", labelKey: "fight.status.haste" },
});

/** 극성별 모양(월드 px 기준은 저택 숫자 표와 같다). 흔들림·기울기·받침 없이, 작게 박혀 천천히 떠오른다. */
export const COMBAT_STATUS_STYLES: Readonly<Record<CombatStatusPolarity, DamageNumberStyle>> = Object.freeze({
  buff: { fontPx: 14, fillTop: PALETTE.white, fillBottom: PALETTE.loot, stroke: PALETTE.outline, strokePx: 4, lifeMs: 900, risePx: 16,
    driftPx: 4, popFrom: 1.3, popMs: 90, shakePx: 0, shakeMs: 0, backing: null, backingPx: 0, backingAlpha: 0, fall: false, tiltRad: 0 },
  debuff: { fontPx: 14, fillTop: PALETTE.white, fillBottom: PALETTE.alarm, stroke: PALETTE.outline, strokePx: 4, lifeMs: 900, risePx: 16,
    driftPx: 4, popFrom: 1.3, popMs: 90, shakePx: 0, shakeMs: 0, backing: null, backingPx: 0, backingAlpha: 0, fall: false, tiltRad: 0 },
});

export function combatStatusStyle(id: CombatStatusId): DamageNumberStyle {
  const style = COMBAT_STATUS_STYLES[COMBAT_STATUS_TAGS[id].polarity];
  // "갑옷" is the read of a blocked blow (2026-10-18, user: 못 봤다): larger and a little longer than the other labels.
  return id === "armor" ? { ...style, fontPx: ARMOR_STATUS_FONT_PX, lifeMs: ARMOR_STATUS_LIFE_MS } : style;
}

/** The "갑옷" label's size and life (`combatStatusStyle`). */
const ARMOR_STATUS_FONT_PX = 20, ARMOR_STATUS_LIFE_MS = 1100;
