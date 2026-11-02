import { superCutInArt, type SuperCutInArt } from "../../assets/SuperCutInArtCatalog";
import { t, type StringKey } from "../../app/i18n";
import type { Locale } from "../../app/Locale";
import { clamp01 } from "../../sim/geom";
import { cityFightAwakening } from "../../sim/cityFight/CityFightAwakening";
import { easeInCubic, easeOutBackWith, easeOutCubic, easeOutExpo } from "../art/easing";

/**
 * The super's staged cut-in (2026-10-21 — user: "필살기 연출이 너무 밋밋하고 촌스럽다. UI 가 순차적으로 뜨고, 액션이 일어나는 연출
 * 시퀀스가 필요해"). Measured on fighting-game supers at 30 fps (Guilty Gear Strive's overdrives, BlazBlue's distortion drives) and revised
 * after a VFX review of our frames (one still picture held for 1.1 s read flat; every piece eased the same way, so nothing read as "one
 * after another"; a cream flash read as a fade). Each piece now lands on its own beat, a different motion each:
 *
 * - burst 0..`burst.ms`: ink-and-gold wedges out of the caster's chest (the focus lines' family), cooling from cream to amber.
 * - bars: the letterbox drops in (`bars`) and stays until the super resolves (its contact, or `bars.holdAfterMs` after the cut-in).
 * - panel: slams in from the caster's side on an exponential ease with a small overshoot (`panel`).
 * - invert: for two frames the panel is an impact frame — navy, his face a cream silhouette (`invert`; dark, so no photosensitive flash).
 * - face: then in colour, pushing in and drifting toward the far side through the hold (`art`).
 * - name: stamped across the panel's lower edge, a two-frame shake as it lands (`name`).
 * - panel out fast (`panel.outFromMs`), then a navy brush wipe sweeps to the far side as the fight lets go (`wipe`), at `totalMs`.
 * Reduced motion: nothing slides, stamps, shakes or wipes — the bars, panel, face and name fade in and out; no burst or impact frame.
 */
export const CITY_FIGHT_SUPER_CUT_IN = Object.freeze({
  totalMs: 800,
  burst: { ms: 240, growMs: 50, coolMs: 250 },
  bars: { fromMs: 60, inMs: 90, share: 0.11, outMs: 180, holdAfterMs: 1200 },
  /** The panel: its middle at `y` of the view, `height` of it tall, its edges tilted by `tilt` of the height, sliding `slide` views. */
  panel: { fromMs: 150, inMs: 90, overshoot: 0.6, outFromMs: 600, outMs: 90, y: 0.33, height: 0.3, tilt: 0.12, slide: 1.15 },
  invert: { fromMs: 240, ms: 33 },
  /** The face: shown from `fromMs`, pushed in by `zoom` and drifted `drift` views toward the far side until the panel leaves. */
  art: { fromMs: 273, zoom: 0.14, drift: 0.04 },
  /** The name: stamped in over `stampMs` from `fromScale`, then shaken `shakePx` (screen px) for `shakeMs`. */
  name: { fromMs: 330, stampMs: 90, fromScale: 1.8, shakeMs: 33, shakePx: 4 },
  wipe: { fromMs: 700, ms: 100 },
});

/** One frame of the cut-in. Shares are 0..1; `panelX` / `artX` are slide offsets in views (+ toward the far side). */
export interface CityFightSuperCutInFrame {
  /** The chest burst's life 0..1 (null: none now). */
  readonly burst: number | null;
  readonly bars: number;
  readonly panelAlpha: number;
  readonly panelX: number;
  /** The impact frame (navy panel, cream face silhouette). */
  readonly inverted: boolean;
  /** His face: shown, its offset, its push-in. */
  readonly art: boolean;
  readonly artX: number;
  readonly artZoom: number;
  readonly nameAlpha: number;
  readonly nameScale: number;
  /** The name's shake this frame (screen px, ± along x and y). */
  readonly nameShake: number;
  /** The brush wipe's leading edge 0..1 across the view (null: none). */
  readonly wipe: number | null;
}

const C = CITY_FIGHT_SUPER_CUT_IN;
const span = (ms: number, from: number, length: number) => clamp01((ms - from) / Math.max(1, length));

/**
 * The cut-in at `ms` (screen ms from the press). `resolvedMs`: when the super resolved (its contact), or null — the bars hold until then
 * (at the latest `bars.holdAfterMs` after the cut-in). Null when it is over.
 */
export function cityFightSuperCutInFrame(ms: number, reduced: boolean, resolvedMs: number | null): CityFightSuperCutInFrame | null {
  if (!Number.isFinite(ms) || ms < 0) return null;
  const barsEnd = Math.max(C.totalMs, Math.min(resolvedMs ?? Number.POSITIVE_INFINITY, C.totalMs + C.bars.holdAfterMs));
  if (ms >= barsEnd + C.bars.outMs) return null;
  const barsIn = span(ms, C.bars.fromMs, C.bars.inMs), barsOut = span(ms, barsEnd, C.bars.outMs);
  const bars = reduced ? Math.min(barsIn, 1 - barsOut) : easeOutCubic(barsIn) * (1 - barsOut * barsOut);
  const enter = span(ms, C.panel.fromMs, C.panel.inMs), leave = span(ms, C.panel.outFromMs, C.panel.outMs);
  const shown = ms >= C.panel.fromMs && leave < 1;
  const arrive = enter >= 1 ? 1 : easeOutBackWith(easeOutExpo(enter), C.panel.overshoot);
  const panelX = reduced ? 0 : -(1 - arrive) * C.panel.slide + easeInCubic(leave) * C.panel.slide;
  const hold = span(ms, C.art.fromMs, C.panel.outFromMs - C.art.fromMs);
  const artX = reduced ? 0 : panelX + C.art.drift * easeOutCubic(hold);
  const artZoom = 1 + (reduced ? 0 : C.art.zoom * easeOutCubic(hold));
  const inverted = !reduced && ms >= C.invert.fromMs && ms < C.invert.fromMs + C.invert.ms;
  const art = shown && (inverted || ms >= C.art.fromMs);
  const stamp = span(ms, C.name.fromMs, C.name.stampMs), landed = ms - C.name.fromMs - C.name.stampMs;
  const nameAlpha = ms < C.name.fromMs || leave >= 1 ? 0 : reduced ? Math.min(stamp, 1 - leave) : Math.min(1, stamp * 3) * (1 - leave);
  const nameScale = reduced ? 1 : C.name.fromScale + (1 - C.name.fromScale) * easeOutExpo(stamp);
  const nameShake = !reduced && landed >= 0 && landed < C.name.shakeMs ? C.name.shakePx * (Math.floor(landed / 17) % 2 === 0 ? 1 : -1) : 0;
  const wipeAge = ms - C.wipe.fromMs;
  const wipe = reduced || wipeAge < 0 || wipeAge >= C.wipe.ms ? null : easeOutCubic(wipeAge / C.wipe.ms);
  const burst = reduced || ms >= C.burst.ms ? null : ms / C.burst.ms;
  return { burst, bars, panelAlpha: !shown ? 0 : reduced ? Math.min(enter, 1 - leave) : 1, panelX, inverted, art, artX, artZoom,
    nameAlpha, nameScale, nameShake, wipe };
}

/** Who casts: his close-up (null: his own frame) and his super's name (null: none). */
export interface CityFightSuperCast {
  readonly art: SuperCutInArt | null;
  readonly name: string | null;
}

/** A super's name's i18n key (`village.fightSuper.*` — the awakening's `name`). */
type SuperNameKey = Extract<StringKey, `village.fightSuper.${string}`>;


export function cityFightSuperCast(locale: Locale, who: string): CityFightSuperCast {
  const name = cityFightAwakening(who)?.name as SuperNameKey | undefined;
  return { art: superCutInArt(who), name: name ? t(locale, name) : null };
}
