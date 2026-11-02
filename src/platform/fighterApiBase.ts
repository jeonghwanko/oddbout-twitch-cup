/**
 * 로컬 무대(2026-10-27, `npm run fighter:local` — `tools/ai-fighter/local-stage.mjs`): 개발 서버에서만, 같은 출처의 `/local/ai-fighter`가 운영
 * API 의 읽기를 넘기고 쓰기를 막으며 `/local/oddbout-arena`가 로컬 데이터베이스 위의 검증기다. 그 무대에서는 컵 표·결과 중계도 로컬로 간다.
 * 프로덕션 빌드는 이 값을 읽지 않는다(`DEV`).
 */
export function fighterApiLocalStage(): boolean {
  return import.meta.env.DEV === true && import.meta.env.VITE_ODDBOUT_LOCAL_STAGE === "1" && typeof globalThis.location?.origin === "string";
}

export function fighterApiBase(): string | null {
  return fighterApiLocalStage() ? `${globalThis.location.origin}/local/ai-fighter` : fighterApiLiveBase();
}

/** The live API (its Supabase project holds the auth and the public tables the creator pages read directly), even on the local stage. */
export function fighterApiLiveBase(): string | null {
  const base: unknown = import.meta.env.VITE_AI_FIGHTER_API_BASE;
  return typeof base === "string" && /^https:\/\/[a-z0-9]{20}\.supabase\.co\/functions\/v1\/ai-fighter$/.test(base) ? base : null;
}
