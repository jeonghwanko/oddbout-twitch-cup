/** Stable journal/account keys. Loading saved games must not load character prompts or translations. */
export const COMPANION_CHARACTER_IDS = ['rosaline', 'clockmaker', 'gentleman', 'blackthorne', 'plaza', 'B141', 'pier-cargo', 'B004', 'B143', 'B144'] as const;
export type CompanionCharacterId = typeof COMPANION_CHARACTER_IDS[number];
