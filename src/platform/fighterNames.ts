import type { Locale } from "../app/Locale";

/**
 * A creator fighter's name per page language (contract `profile.names`, 2026-10-24): `{ ko?, en? }`, each 1–40 characters. The identity
 * name (`profile.name`) stays the fallback for a language with none — the roster, the arena and the homepage all show the same choice.
 */
export interface FighterNames { readonly ko?: string; readonly en?: string }

/** `profile.names` from a server or manifest value; anything malformed is dropped (the identity name still shows). */
export function parseFighterNames(value: unknown): FighterNames | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const names: { ko?: string; en?: string } = {};
  for (const locale of ["ko", "en"] as const) {
    const name = (value as Record<string, unknown>)[locale];
    if (typeof name === "string" && name.trim() && name.length <= 40) names[locale] = name;
  }
  return names.ko !== undefined || names.en !== undefined ? names : undefined;
}

/** The contract carries Korean and English names only: any other language reads the English one. */
export function localizedFighterName(name: string, names: FighterNames | undefined, locale: Locale): string {
  return (locale === "ko" ? names?.ko : names?.en) ?? name;
}
