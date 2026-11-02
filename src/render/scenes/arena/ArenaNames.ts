import { arenaPlayable } from "../../../app/ArenaRoster";
import { t } from "../../../app/i18n";
import type { Locale } from "../../../app/Locale";
import { cityFighterRules } from "../../../sim/cityFight/CityFighters";
import { nativeCitySkinName } from "../../art/NativeCityKumaSkin";
import { localizedFighterName } from "../../../platform/fighterNames";


export function arenaPlayerName(id: string, locale: Locale): string {
  const playable = arenaPlayable(id);
  if (playable?.kind === "registered") return localizedFighterName(playable.name, playable.names, locale);
  // An id no longer on the roster (a saved week's fighter after a roster change, 2026-10-19) shows as itself — `cityFighterRules` throws.
  if (playable === null) return id;
  const rules = cityFighterRules(id);
  if (rules.skinId === null) return t(locale, "village.kuma.name");
  return nativeCitySkinName(rules.skinId, locale) ?? id;
}
