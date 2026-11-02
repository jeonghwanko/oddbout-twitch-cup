import type { VillageHomecomingPresentation } from '../app/VillageHomecoming';
import { activeSlotKey } from './activeSaveSlot';
import { STORAGE_KEYS } from './storageKeys';

/**
 * 도시에서 아직 읽을 만큼 보이지 못한 귀환 보고(`app/NativeCityHomecoming`). 정산 뒤 도시에 들어올 때 적고, 보이면 지운다.
 * 보상·진행은 meta 가 이미 저장했다 — 여기는 보여 줄 문구 한 장뿐이라 손상·모르는 버전은 조용히 버린다.
 */
let session: { readonly key: string; readonly report: VillageHomecomingPresentation | null } | null = null;

function sanitize(value: unknown): VillageHomecomingPresentation | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record['version'] !== 1 || typeof record['report'] !== 'object' || record['report'] === null) return null;
  const report = record['report'] as Record<string, unknown>;
  const text = ['eyebrow', 'title', 'result', 'nextObjective', 'badge'] as const;
  if (!text.every(name => typeof report[name] === 'string') || typeof report['success'] !== 'boolean') return null;
  return Object.freeze({ eyebrow: report['eyebrow'] as string, title: report['title'] as string, result: report['result'] as string,
    nextObjective: report['nextObjective'] as string, badge: report['badge'] as string, success: report['success'] });
}

export function loadPendingHomecoming(): VillageHomecomingPresentation | null {
  const key = activeSlotKey(STORAGE_KEYS.villageHomecoming);
  try {
    const storage = globalThis.localStorage;
    if (!storage) return session?.key === key ? session.report : null;
    const raw = storage.getItem(key);
    if (!raw) return null;
    try { return sanitize(JSON.parse(raw)); } catch { return null; }
  } catch { return session?.key === key ? session.report : null; }
}

export function savePendingHomecoming(report: VillageHomecomingPresentation): void {
  const key = activeSlotKey(STORAGE_KEYS.villageHomecoming);
  session = { key, report };
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify({ version: 1, report }));
  } catch { /* Private browsing keeps the report for this session. */ }
}

export function clearPendingHomecoming(): void {
  const key = activeSlotKey(STORAGE_KEYS.villageHomecoming);
  session = { key, report: null };
  try { globalThis.localStorage?.removeItem(key); }
  catch { /* Storage may be unavailable. */ }
}
