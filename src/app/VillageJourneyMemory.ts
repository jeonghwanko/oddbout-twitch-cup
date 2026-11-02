/**
 * 마을 길 안내가 이 브라우저에 남기는 기억의 저장 형식(`platform/villageJourneyStorage`). 안내 규칙(`VillageJourneyGuide`)은 마을 퀘스트 진행까지
 * import 하므로, 진행 저장(`metaStorage` 의 새 게임 지우기)이 그 규칙 없이 형식만 쓰게 따로 둔다 — 무투장 페이지가 마을 코드를 받지 않는다.
 */
export type JourneyLesson = 'move' | 'guide' | 'interact' | 'run';
export interface JourneyMemory {
  readonly learned: readonly JourneyLesson[];
  readonly previous: { readonly key: string; readonly title: string } | null;
  readonly completed: string | null;
}
export const EMPTY_JOURNEY: JourneyMemory = { learned: [], previous: null, completed: null };
export function parseJourneyMemory(value: unknown): JourneyMemory {
  if (!value || typeof value !== 'object') return EMPTY_JOURNEY;
  const raw = value as Record<string, unknown>, previous = raw.previous as Record<string, unknown> | null, learned = raw.learned;
  return { learned: Array.isArray(learned) ? (['move', 'guide', 'interact', 'run'] as const).filter(id => learned.includes(id)) : [],
    previous: previous && typeof previous.key === 'string' && previous.key.length < 150 && typeof previous.title === 'string'
      && previous.title.length < 300 ? { key: previous.key, title: previous.title } : null,
    completed: typeof raw.completed === 'string' && raw.completed.length < 300 ? raw.completed : null };
}
