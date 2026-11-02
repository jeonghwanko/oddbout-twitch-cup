import type { NativeCityOrthoPack } from '../../src/render/art/NativeCityOrthoPack';
export interface FighterValidationIssue { code: string; path: string; expected: unknown; actual: unknown }
export interface FighterValidationResult { ok: boolean; stage: string; errors: FighterValidationIssue[];
  assetBytes?: number; decodedPixels?: number; pending?: string[] }
export function parseFighterJson(text: string): { ok: true; data: unknown } | { ok: false; errors: FighterValidationIssue[] };
export function validateFighter(data: unknown): FighterValidationResult;
export type FighterStatKey = 'power' | 'toughness' | 'speed';
/** Integer grades `spec.combatStats.min`..`max` that sum to its `budget`. */
export type FighterDuelStats = Readonly<Record<FighterStatKey, number>>;
/** Only for a manifest `validateFighter` accepted. */
export function toDuelStats(data: unknown): FighterDuelStats;
/** A skill clip's rule (`spec.combatStyle.skillKinds`). */
export type FighterSkillKind = 'stretch' | 'pincer' | 'flight' | 'feint' | 'slide';
/** The fighting style a creator picked (2026-10-27): closed choices and grades only; `skill` is his skill clip's kind. */
export interface FighterDuelStyle {
  readonly mix?: Readonly<Record<'slam' | 'combo' | 'fast', number>>;
  readonly special?: 'slam' | 'combo' | 'fast';
  readonly super?: 'slam' | 'combo' | 'fast' | 'dash';
  readonly distance?: number;
  readonly shockwave?: true;
  readonly summon?: 'crane' | 'bolt' | 'sportsCar' | 'roadster';
  readonly temper?: Readonly<Partial<Record<'guard' | 'retreat' | 'measure' | 'patience', number>>>;
  readonly exchanges?: Readonly<Partial<Record<'cross' | 'pinball' | 'rush', number>>>;
  readonly skill?: FighterSkillKind;
}
/** Only for a manifest `validateFighter` accepted: its style, or null (the standard kit as it was). */
export function toDuelStyle(data: unknown): FighterDuelStyle | null;
/** Only the two arena side headings may consume this preview pack. */
export function toSidePreviewPack(data: unknown): Pick<NativeCityOrthoPack, 'schemaVersion' | 'adopted' | 'camera'> & {
  directions: Pick<NativeCityOrthoPack['directions'], 'side'>;
};
