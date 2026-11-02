import MEASURE from "./native-city-fighter-measure.json";

/**
 * 마을 대결 상대(쿠마의 스킨을 쓰는 파이터 — 유메)의 원화에서 잰 규칙 수치(2026-10-11).
 *
 * 전에는 뷰(`NativeCityKumaView`)가 팩을 비동기로 받은 뒤 이 값을 재서 그의 튜닝을 바꿨다: 판정(사거리)이 원화 로딩에 기댔고 규칙 수치가
 * 렌더에서 만들어졌다. 이제 도구(`tools/art/measure-city-fighters.mjs`)가 팩에서 미리 재서 `native-city-fighter-measure.json` 에 굽고,
 * 싸움 규칙(`sim/cityFight/CityFighters`)이 그것을 읽는다. 시험이 팩에서 다시 재서 구운 값과 맞춰 본다(원화가 바뀌면 다시 굽는다).
 *
 * - `bodyScale`: 그의 몸 높이(주인공 대비) — 스킨의 값(없으면 자리의 값)에 서 있는 칸의 보이는 몸(발 → 머리 끝)으로 고친 것. 그림도 이것으로
 *   그린다.
 * - `front`: 오른쪽을 본 옆 클립(`slam`·`combo`)의 앞쪽 끝(프레임 폭 − 가장 왼쪽 원점 — 그려진 휘두름과 그 불꽃까지)을 몸 높이로 나눈 값.
 */
export interface NativeCityFighterMeasure {
  readonly packSha256: string;
  readonly bodyScale: number;
  readonly front: { readonly slam: number | null; readonly combo: number | null };
}

/** What the measure reads off a pack (the runtime ortho pack's side view and its skin), structurally. */
export interface NativeCityMeasurablePack {
  readonly directions: { readonly side: Readonly<Record<string, MeasurableClip | undefined>> };
  readonly skin?: { readonly bodyScale?: number | null; readonly bust: { readonly headTopY: number } };
}
interface MeasurableClip {
  readonly frameWidth: number;
  readonly bodyHeight: number;
  readonly origins: readonly { readonly originX: number; readonly originY: number }[];
}

/** The baked measures by fighter id (`yume`). */
export const NATIVE_CITY_FIGHTER_MEASURE: Readonly<Record<string, NativeCityFighterMeasure>> =
  MEASURE.fighters;

/** A fighter's baked measure; a skinned fighter without one is a build error (run the measure tool). */
export function nativeCityFighterMeasure(id: string): NativeCityFighterMeasure {
  const measure = NATIVE_CITY_FIGHTER_MEASURE[id];
  if (!measure) throw new Error(`city fighter "${id}" has no baked measure (node tools/art/measure-city-fighters.mjs)`);
  return measure;
}

/**
 * Measures a skinned fighter's pack (`postBodyScale`: his post's body scale, used when the skin names none). His height is his VISIBLE
 * body on the idle cell (feet to head top, `bust.headTopY`), whatever the pack's `bodyHeight` says.
 */
export function measureNativeCityFighterPack(pack: NativeCityMeasurablePack, postBodyScale: number): Omit<NativeCityFighterMeasure, "packSha256"> {
  const side = pack.directions.side, idle = side["idle"];
  const visible = (idle?.origins[0]?.originY ?? 0) - (pack.skin?.bust.headTopY ?? 0);
  const correction = idle && visible > idle.bodyHeight * 0.5 ? idle.bodyHeight / visible : 1;
  const bodyScale = (pack.skin?.bodyScale ?? postBodyScale) * correction;
  const front = (clip: "slam" | "combo"): number | null => {
    const found = side[clip];
    if (!found || !(found.bodyHeight > 0) || found.origins.length === 0) return null;
    return (found.frameWidth - Math.min(...found.origins.map(origin => origin.originX))) / found.bodyHeight;
  };
  return { bodyScale, front: { slam: front("slam"), combo: front("combo") } };
}
