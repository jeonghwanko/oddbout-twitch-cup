import type { MetaState } from "./MetaProgressRules";

/**
 * 도시 기록 조사(BH-17 소포)의 저장 진행. 만난 기록 담당자 수(`step`)와 블랙손 정문 집사가 사본을 받았는지(`closed`).
 *
 * 대사 줄 하나가 아니라 "마지막 줄까지 넘긴 만남"만 센다 — 씬이 그 순간에만 `commitNativeCityRecords` 를 부른다.
 * 문구와 만남 순서는 `app/NativeCityStory.ts` 가 소유한다. 여기는 숫자의 범위와 단조성만 지킨다.
 */
export interface NativeCityRecordsState {
  /** payload 스키마 버전. 모르는 버전은 새 조사로 읽는다. */
  readonly version: 1;
  /** 0..`NATIVE_CITY_RECORDS_STEPS`. 끝까지 오면 증거를 다 모았다. */
  readonly step: number;
  /** 정문 집사가 사본을 확인해 조사를 마쳤다. 증거를 다 모은 뒤에만 참이다. */
  readonly closed?: true;
}

/** 기록 담당자 만남 수. `app/NativeCityStory.ts` 의 만남 표 길이와 같다(`native-city-records.test.ts`). */
export const NATIVE_CITY_RECORDS_STEPS = 7;

/** 손상·모르는 버전·범위 밖 값은 저장이 없는 것으로 본다(새 조사). */
export function sanitizeNativeCityRecords(value: unknown): NativeCityRecordsState | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const step = record["step"];
  if (record["version"] !== 1 || typeof step !== "number" || !Number.isInteger(step) || step < 0 || step > NATIVE_CITY_RECORDS_STEPS) return undefined;
  const closed = step === NATIVE_CITY_RECORDS_STEPS && record["closed"] === true;
  return Object.freeze({ version: 1, step, ...(closed ? { closed: true as const } : {}) });
}

/** 저장이 없던 저장은 아직 배달원을 만나지 않았다. */
export function nativeCityRecordsOf(meta: MetaState): { readonly step: number; readonly closed: boolean } {
  const records = meta.nativeCityRecords;
  return { step: records?.step ?? 0, closed: records?.closed === true };
}

/**
 * 끝낸 만남을 기록한다. 진행은 뒤로 가지 않고, 마친 조사는 마친 채로 남는다 — 같은 대화를 다시 넘겨도(이어하기 뒤 다른 탭 등)
 * 앞선 기록을 지우지 않는다. 바뀐 것이 없으면 같은 객체를 돌려준다.
 */
export function commitNativeCityRecords(meta: MetaState, step: number, closed = false): MetaState {
  const before = nativeCityRecordsOf(meta);
  const safe = Number.isInteger(step) ? Math.max(0, Math.min(NATIVE_CITY_RECORDS_STEPS, step)) : 0;
  const nextStep = Math.max(before.step, safe);
  const nextClosed = before.closed || (closed && nextStep === NATIVE_CITY_RECORDS_STEPS);
  if (nextStep === before.step && nextClosed === before.closed) return meta;
  return { ...meta, nativeCityRecords: Object.freeze({ version: 1, step: nextStep, ...(nextClosed ? { closed: true as const } : {}) }) };
}
