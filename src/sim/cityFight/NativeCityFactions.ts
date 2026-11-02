/**
 * 도시 배우의 진영(순수). 아군·중립·적군 셋이고, **한쪽만 적군일 때** 서로 피해를 준다 — 아군끼리·중립끼리·적군끼리,
 * 아군과 중립은 서로 때려도 피해가 없다.
 *
 * 기본값: 주인공 = 아군, 주민·KUMA = 중립. 쿠마에게 말을 걸어 "싸우자"를 고르면 쿠마가 적군이 되고, 어느 한쪽이 쓰러졌다
 * 일어나면 중립으로 돌아간다. 방문 단위(씬 레지스트리의 `CityVisit`)이고 저장하지 않는다.
 */
export type NativeCityFaction = "ally" | "neutral" | "enemy";

/** 배우 id → 진영. 없는 배우는 `nativeCityFaction` 의 기본값을 따른다. */
export type NativeCityFactionMap = Readonly<Record<string, NativeCityFaction>>;

/** 이 슬라이스에 진영이 있는 배우. */
export const NATIVE_CITY_PLAYER_ID = "player";
export const NATIVE_CITY_KUMA_ID = "kuma";
/**
 * The fight's opponent slot when a call names none (`NativeCityFightSimContext.opponentId` absent): KUMA's, the first village fighter.
 * Shared fight code reads this, never an NPC's own id (2026-10-13 guard, `architecture.test.ts`).
 */
export const NATIVE_CITY_DEFAULT_OPPONENT_ID = NATIVE_CITY_KUMA_ID;

export function createNativeCityFactions(): NativeCityFactionMap {
  return Object.freeze({ [NATIVE_CITY_PLAYER_ID]: "ally", [NATIVE_CITY_KUMA_ID]: "neutral" });
}

export function nativeCityFaction(map: NativeCityFactionMap | undefined, id: string): NativeCityFaction {
  return map?.[id] ?? (id === NATIVE_CITY_PLAYER_ID ? "ally" : "neutral");
}

/** 정확히 한쪽만 적군이면 참. */
export function canHarm(a: NativeCityFaction, b: NativeCityFaction): boolean {
  return (a === "enemy") !== (b === "enemy");
}

/** 두 배우가 서로 피해를 주는가(진영표 기준). */
export function canActorsHarm(map: NativeCityFactionMap | undefined, a: string, b: string): boolean {
  return canHarm(nativeCityFaction(map, a), nativeCityFaction(map, b));
}

export function withNativeCityFaction(map: NativeCityFactionMap | undefined, id: string, faction: NativeCityFaction): NativeCityFactionMap {
  return Object.freeze({ ...createNativeCityFactions(), ...map, [id]: faction });
}
