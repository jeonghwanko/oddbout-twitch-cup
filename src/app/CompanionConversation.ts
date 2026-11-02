export const COMPANION_RELATIONSHIPS = ['친구', '동료', '로맨스'] as const;
export interface CompanionPreferences {
  name: string; relationship: typeof COMPANION_RELATIONSHIPS[number]; note: string; shareWithVillage: boolean;
}
export interface CompanionMessage { id: number; role: 'player' | 'character'; text: string }
export interface CompanionJournal {
  version: 1; nextId: number; preferences: CompanionPreferences; messages: CompanionMessage[]; memories: string[];
}
export function emptyCompanionJournal(): CompanionJournal {
  return { version: 1, nextId: 1, preferences: { name: '', relationship: '친구', note: '', shareWithVillage: false }, messages: [], memories: [] };
}
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max && !/[\u0000-\u0008\u000b-\u001f]/.test(v);
export function validCompanionPreferences(v: unknown): v is CompanionPreferences {
  return record(v) && Object.keys(v).length === 4 && text(v.name, 30) && text(v.note, 240)
    && COMPANION_RELATIONSHIPS.includes(v.relationship as CompanionPreferences['relationship']) && typeof v.shareWithVillage === 'boolean';
}
export function decodeCompanionJournal(value: unknown): CompanionJournal {
  const empty = emptyCompanionJournal();
  if (!record(value) || value.version !== 1 || !validCompanionPreferences(value.preferences)
    || !Array.isArray(value.messages) || value.messages.length > 80 || !Array.isArray(value.memories) || value.memories.length > 8
    || !value.memories.every(m => text(m, 240) && m.trim()) || !Number.isSafeInteger(value.nextId) || Number(value.nextId) < 1
    || !value.messages.every(m => record(m) && Number.isSafeInteger(m.id) && Number(m.id) > 0
      && ['player', 'character'].includes(String(m.role)) && text(m.text, 240) && m.text.trim())) return empty;
  const messages = value.messages as CompanionMessage[];
  if (messages.some((m, i) => m.id >= Number(value.nextId) || i > 0 && m.id <= messages[i - 1]!.id)) return empty;
  return { version: 1, nextId: Number(value.nextId), preferences: { ...value.preferences },
    messages: messages.map(m => ({ ...m })), memories: [...value.memories] as string[] };
}
/** Store only completed exchanges: cancellation/errors cannot create a memory of a reply. */
export function appendCompanionExchange(journal: CompanionJournal, player: string, character: string): CompanionJournal {
  return { ...journal, nextId: journal.nextId + 2, messages: [...journal.messages,
    { id: journal.nextId, role: 'player' as const, text: player.slice(0, 240) },
    { id: journal.nextId + 1, role: 'character' as const, text: character.slice(0, 240) }].slice(-80) };
}
export function toggleCompanionMemory(journal: CompanionJournal, text: string): CompanionJournal {
  if (journal.memories.includes(text)) return { ...journal, memories: journal.memories.filter(m => m !== text) };
  if (!text.trim() || text.length > 240 || journal.memories.length >= 8) return journal;
  return { ...journal, memories: [...journal.memories, text] };
}
