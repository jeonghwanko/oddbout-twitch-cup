import Phaser from "phaser";
import { DEFAULT_LOCALE, isLocale } from "../../app/Locale";
import type { Locale } from "../../app/Locale";
import { t } from "../../app/i18n";

const LOCALE_REGISTRY_KEY = "locale";

export function installLocaleRuntime(game: Phaser.Game, locale: Locale): void {
  game.registry.set(LOCALE_REGISTRY_KEY, locale);
  globalThis.document?.documentElement?.setAttribute("lang", locale);
  const links = globalThis.document?.querySelectorAll<HTMLAnchorElement>("#privacy-link > span > a") ?? [];
  for (const link of Array.from(links)) {
    if (link.getAttribute("href")?.includes("studio") === true) {
      link.textContent = t(locale, "common.footer.studio");
      link.setAttribute("aria-label", t(locale, "common.footer.studioAria"));
    } else {
      link.textContent = t(locale, "common.footer.privacy");
    }
  }
}

export function localeFor(scene: Phaser.Scene): Locale {
  const value: unknown = scene.registry.get(LOCALE_REGISTRY_KEY);
  return isLocale(value) ? value : DEFAULT_LOCALE;
}
