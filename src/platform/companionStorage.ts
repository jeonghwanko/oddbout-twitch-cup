import { decodeCompanionJournal, emptyCompanionJournal, type CompanionJournal } from '../app/CompanionConversation';
import { COMPANION_CHARACTER_IDS, type CompanionCharacterId } from '../world/CompanionCharacterIds';
import { activeSlotKey } from './activeSaveSlot';
import { STORAGE_KEYS } from './storageKeys';
/** 인물마다 따로 남긴다. 로잘린은 처음 쓰던 키 그대로라 기존 저장을 그대로 읽는다. */
export function companionJournalBaseKey(character: CompanionCharacterId): string {
  return character === 'rosaline' ? STORAGE_KEYS.companionJournal : `${STORAGE_KEYS.companionJournal}.${character}`;
}
/** 슬롯 삭제가 함께 지우는 인물별 키(슬롯 접미사 전). */
export const COMPANION_JOURNAL_BASE_KEYS: readonly string[] = Object.freeze(COMPANION_CHARACTER_IDS.map(companionJournalBaseKey));
const fallback = new Map<string, { journal: CompanionJournal; dirty: boolean }>();
function journalKey(character: CompanionCharacterId): string {
  try { return activeSlotKey(companionJournalBaseKey(character)); }
  catch { return 'unavailable-storage-session:' + character; }
}
export function loadCompanionJournal(character: CompanionCharacterId = 'rosaline'): CompanionJournal {
  const key = journalKey(character), cached = fallback.get(key);
  if (cached?.dirty) return cached.journal;
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? decodeCompanionJournal(JSON.parse(raw)) : emptyCompanionJournal();
  } catch { return cached?.journal ?? emptyCompanionJournal(); }
}
export function saveCompanionJournal(journal: CompanionJournal, character: CompanionCharacterId = 'rosaline'): boolean {
  const key = journalKey(character), entry = { journal, dirty: true };
  fallback.set(key, entry);
  try {
    const storage = globalThis.localStorage;
    if (!storage) return false;
    storage.setItem(key, JSON.stringify(journal)); entry.dirty = false; return true;
  } catch { return false; }
}
/** 지금 슬롯의 모든 인물 대화를 지운다(새 게임). */
export function clearCompanionJournal(): void {
  fallback.clear();
  for (const character of COMPANION_CHARACTER_IDS) {
    try { globalThis.localStorage?.removeItem(journalKey(character)); } catch { /* Optional local journal. */ }
  }
}
