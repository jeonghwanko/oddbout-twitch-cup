import { NATIVE_CITY_COMBAT, type NativeCityAccentBudgetTuning, type NativeCityAccentKind } from "../../sim/cityFight/NativeCityCombatTuning";

/**
 * 한 교환에 강조 하나(2026-10-10 3단계, "정신없이 끝난다" — 맞을 때마다 9~21 갈래의 효과가 겹치고 글자가 거의 늘 떠 있었다). 강조는
 * 그 방의 센 신호 묶음이다: 무거운 만화 글자("쾅!"·"카운터!"), 줌 펄스와 마무리의 카메라 펀치, 잉크 임팩트 프레임, 집중선. 하나가 지나간 뒤
 * `accentGapMs` 안에 오는 강조는 앞의 것보다 높을 때만(`rank` — KO·붕괴는 반격·마무리 위) 센 신호를 내고, 아니면 조용히 맞는다: 정지·
 * 섬광·별·소리·진동은 그대로, 흔들림만 `quietShakeScale` 배. 규칙을 알리는 신호("빈틈!"·"막!"·"텅!"·"휙!"·"깨짐!"·"스윽!")는 이 예산에
 * 들지 않는다 — 숨은 규칙은 늘 보인다. 화면 시계(ms)로 센다. 수치는 `native-city-combat.json` `feel.budget`.
 */

/** The last accent that played (screen ms) and its rank; before any, never. */
export interface NativeCityAccentClock {
  readonly atMs: number;
  readonly rank: number;
}

export const NATIVE_CITY_ACCENT_REST: NativeCityAccentClock = Object.freeze({ atMs: Number.NEGATIVE_INFINITY, rank: 0 });

/** What one accent got: `loud` (its strong cues play) and the clock after it (unchanged when it stayed quiet). */
export interface NativeCityAccentGrant {
  readonly loud: boolean;
  readonly clock: NativeCityAccentClock;
}

/**
 * An accent of `kind` at `nowMs` (screen clock): loud when `accentGapMs` has passed since the last loud one, or it out-ranks that one
 * (a break right after a counter, the KO after anything) — then it is the new last accent. A quiet one leaves the clock as it was, so a
 * run of same-rank accents cannot keep pushing the window on.
 */
export function nativeCityAccentGrant(clock: NativeCityAccentClock, kind: NativeCityAccentKind, nowMs: number,
  t: NativeCityAccentBudgetTuning = NATIVE_CITY_COMBAT.feel.budget): NativeCityAccentGrant {
  const rank = t.rank[kind] ?? 0;
  const loud = !(nowMs - clock.atMs < t.accentGapMs) || rank > clock.rank;
  return loud ? { loud, clock: { atMs: nowMs, rank } } : { loud, clock };
}


export function nativeCityStruckAccent(tier: string): NativeCityAccentKind | null {
  if (tier === "ko") return "ko";
  return tier === "light" ? null : "heavy";
}
