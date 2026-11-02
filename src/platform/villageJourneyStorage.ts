import { EMPTY_JOURNEY, parseJourneyMemory, type JourneyMemory } from '../app/VillageJourneyMemory';
import { activeSlotKey } from './activeSaveSlot';
import { STORAGE_KEYS } from './storageKeys';

const session = new Map<string, JourneyMemory>();
function journeyKey(): string {
  try { return activeSlotKey(STORAGE_KEYS.villageJourney); } catch { return STORAGE_KEYS.villageJourney; }
}
export function loadVillageJourney(): JourneyMemory {
  const key = journeyKey();
  if (session.has(key)) return session.get(key)!;
  try {
    return parseJourneyMemory(JSON.parse(globalThis.localStorage?.getItem(key) ?? 'null'));
  } catch { return EMPTY_JOURNEY; }
}
export function saveVillageJourney(memory: JourneyMemory): void {
  const key = journeyKey();
  session.set(key, memory);
  try { globalThis.localStorage?.setItem(key, JSON.stringify(memory)); } catch { /* Session hints remain usable. */ }
}
export function clearVillageJourney(): void {
  const key = journeyKey(); session.delete(key);
  try { globalThis.localStorage?.removeItem(key); } catch { /* A new session starts with all hints available. */ }
}
