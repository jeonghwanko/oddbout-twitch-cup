import { t, type StringKey } from "../../../app/i18n";
import type { Locale } from "../../../app/Locale";
import type { KumaPatrolPlan } from "../../../sim/cityFight/NativeCityKumaPatrol";
import FIGHTERS_JSON from "../../../world/native-city-fighters.json";
import { CITY_FIGHTERS, type CityFighterRules } from "../../../sim/cityFight/CityFighters";
import type { NativeCityKumaProfile } from "../../view/NativeCityKumaView";
import type { NativeCitySpectatorSpec } from "../../view/NativeCitySpectatorSpots";
import { nativeCityKumaSkin, nativeCitySkinName } from "../../art/NativeCityKumaSkin";
import type { NativeCityOrthoClip } from "../../art/NativeCityOrthoPack";
import { CITY_KUMA_ENCOUNTER, KUMA_FIGHT_OVERLAY_CATALOG, type CombatEncounterConfig, type CombatOverlayLineKey,
  type CombatRivalFrameCut } from "../../effects/webtoon/CombatEndingDirector";
import { kumaClipFrame } from "../../art/NativeCityKumaArt";

/**
 * The village's fighters as drawn and spoken: KUMA (2026-10-07) and YUME the wuxia sleeve fighter (2026-10-11, a skin - our own
 * art, always there, `NativeCityKumaSkin`). Their RULES - post, size, footprint, fight numbers, measured reach - are the fight's (`sim/cityFight/CityFighters`,
 * 2026-10-11): every fighter is a KUMA (same patrol rules, same fight, the same fight session) with his own numbers. Here he gets his
 * body art, name, challenge lines and fight-overlay rival art. The scene stands one `NativeCityKumaView` per fighter and fights the one
 * the player challenged; the others stay neutral at their posts.
 */

/** Dialogue lines a fighter speaks (keys with no placeholders). */
export type NativeCityFighterLineKey = Extract<StringKey, "village.kuma.challenge" | "village.kuma.rematch" | `fight.fighter.${string}`>;

export interface NativeCityFighter {
  /** KUMA or a skin's id (`yume`). */
  readonly id: string;
  /** Speaker id in dialogue, sprite / name plate / footprint id (`native-city-npc-<actorId>`): `kuma`, `yume`. */
  readonly actorId: string;
  /** The skin's pack id (`NativeCityKumaSkin`); null for KUMA's own art. */
  readonly skinId: string | null;
  /** His post: patrol points, alert radius and body scale (a distinct spot in the same plaza) — the rules' (`CityFighterRules.plan`). */
  readonly plan: KumaPatrolPlan;
  /** His fight tuning and footprint — the rules' (`CityFighterRules`). */
  readonly profile: NativeCityKumaProfile;
  /** Challenging him locks the fight to a side-scroll stage (`NativeCityScene` stage). */
  readonly sideScroll: boolean;
  /** A tournament guest (`CityFighterRules.guest`): not in the village — his art loads when the bracket board opens, he fights in the arena. */
  readonly guest: boolean;
  readonly lines: {
    readonly challenge: NativeCityFighterLineKey;
    readonly rematch: NativeCityFighterLineKey;
    /** His one-liner on the defeat card, rotating per defeat this visit. */
    readonly defeat: readonly CombatOverlayLineKey[];
    /** His challenge to a particular opponent (by his id) instead of `challenge` (`nativeCityFighterChallenge`). */
    readonly against?: Readonly<Record<string, NativeCityFighterLineKey>>;
  };
}

/** The side-scroll stage's camera and bars (`native-city-fighters.json` stage). */
export interface NativeCityFightStageSpec {
  readonly halfWidthScreens: number;
  readonly padBodies: number;
  readonly feetAt: number;
  readonly zoomRange: readonly [number, number];
  /** The stage frame's final zoom multiplier (0.9 = fighters drawn 10% smaller). */
  readonly zoomScale: number;

  readonly drawnTopAt: number;
  /**
   * An opponent thrown up (the air combo) raises the camera before it zooms out: his feet line sinks from `feetAt` at most to this share
   * of the screen height (2026-10-21; `airNote`).
   */
  readonly airFeetAt: number;
  readonly followMs: number;
  /** The arena's zoom out for a drawing or flight that sets the zoom (`topShare` given — 2026-10-24, `reachNote`): faster than `followMs`. */
  readonly reachFollowMs: number;
  /** The arena's room left for a blow's punch-in over a reach fitted under its HUD (a share of the reach, `reachNote`). */
  readonly reachPunchRoom: number;
  readonly barsShare: number;
  readonly barsMs: number;
  /** A challenged fighter's line stops where a body there would be at least this share hidden behind a building (2026-10-15). */
  readonly clipOccludedShare: number;
  /** The stride of that check along the line (strides). */
  readonly clipStepStrides: number;
  /**
   * The camera's turn onto the stage's side heading (ms; 0 under reduced motion). It runs while the fight intro holds the HUD (2026-10-16:
   * it used to wait for the intro to end and turned under the first swing), so the round starts on a settled camera.
   */
  readonly turnMs: number;
  /** The street neighbours who watch the fight from behind its line (`NativeCitySpectatorSpots`, 2026-10-16). */
  readonly spectators: NativeCitySpectatorSpec;
  /** How the stage camera's centre follows the fighters along the line (2026-10-17, `NativeCityFightStageController.cameraFrame`). */
  readonly camera: NativeCityFightStageCameraSpec;
}

/** The stage camera's dead zone, edges and follow (screen shares, body heights, ms). */
export interface NativeCityFightStageCameraSpec {
  /** The fighters' midpoint moves this share of the screen width either way before the camera follows. */
  readonly deadZoneShare: number;
  /** A body this share of the screen width from an edge is followed at once (`edgeFollowMs`). */
  readonly edgeShare: number;
  /** A body's half width for the edges (body heights). */
  readonly bodyHalfWidth: number;
  readonly centerFollowMs: number;
  readonly edgeFollowMs: number;
  /** The dead-zone follow's speed cap (screen widths a second; the edge follow is uncapped). */
  readonly maxPanScreensPerSec: number;
}

export const NATIVE_CITY_FIGHT_STAGE: NativeCityFightStageSpec = Object.freeze(FIGHTERS_JSON.stage as unknown as NativeCityFightStageSpec);

/** A fighter's challenge, rematch and defeat lines. */
const LINES: Readonly<Record<string, NativeCityFighter["lines"]>> = Object.freeze({kuma: { challenge: "village.kuma.challenge", rematch: "village.kuma.rematch", defeat: CITY_KUMA_ENCOUNTER.lines.defeat },
yume: { challenge: "fight.fighter.yume.challenge", rematch: "fight.fighter.yume.rematch",
    defeat: ["fight.fighter.yume.defeat.1", "fight.fighter.yume.defeat.2", "fight.fighter.yume.defeat.3"] },
bravow: { challenge: "fight.fighter.bravow.challenge", rematch: "fight.fighter.bravow.rematch",
    defeat: ["fight.fighter.bravow.defeat.1", "fight.fighter.bravow.defeat.2", "fight.fighter.bravow.defeat.3"],
    against: { beotim: "fight.fighter.bravow.challengeBeotim" } },
beotim: { challenge: "fight.fighter.beotim.challenge", rematch: "fight.fighter.beotim.rematch",
    defeat: ["fight.fighter.beotim.defeat.1", "fight.fighter.beotim.defeat.2", "fight.fighter.beotim.defeat.3"],
    against: { bravow: "fight.fighter.beotim.challengeBravow" } },
quickcat: { challenge: "fight.fighter.quickcat.challenge", rematch: "fight.fighter.quickcat.rematch",
    defeat: ["fight.fighter.quickcat.defeat.1", "fight.fighter.quickcat.defeat.2", "fight.fighter.quickcat.defeat.3"] },
kungjjak: { challenge: "fight.fighter.kungjjak.challenge", rematch: "fight.fighter.kungjjak.rematch",
    defeat: ["fight.fighter.kungjjak.defeat.1", "fight.fighter.kungjjak.defeat.2", "fight.fighter.kungjjak.defeat.3"] },
sikeundung: { challenge: "fight.fighter.sikeundung.challenge", rematch: "fight.fighter.sikeundung.rematch",
    defeat: ["fight.fighter.sikeundung.defeat.1", "fight.fighter.sikeundung.defeat.2", "fight.fighter.sikeundung.defeat.3"],
    against: { eoridung: "fight.fighter.sikeundung.challengeEoridung" } },
duldul: { challenge: "fight.fighter.duldul.challenge", rematch: "fight.fighter.duldul.rematch",
    defeat: ["fight.fighter.duldul.defeat.1", "fight.fighter.duldul.defeat.2", "fight.fighter.duldul.defeat.3"] },
eoridung: { challenge: "fight.fighter.eoridung.challenge", rematch: "fight.fighter.eoridung.rematch",
    defeat: ["fight.fighter.eoridung.defeat.1", "fight.fighter.eoridung.defeat.2", "fight.fighter.eoridung.defeat.3"],
    against: { sikeundung: "fight.fighter.eoridung.challengeSikeundung" } }});


export function nativeCityFighterChallenge(fighter: Pick<NativeCityFighter, "lines">, opponentId: string | null): NativeCityFighterLineKey {
  return (opponentId ? fighter.lines.against?.[opponentId] : undefined) ?? fighter.lines.challenge;
}

function drawnFighter(rules: CityFighterRules): NativeCityFighter {
  const lines = LINES[rules.id];
  if (!lines) throw new Error(`city fighter "${rules.id}" has no lines`);
  return { id: rules.id, actorId: rules.actorId, skinId: rules.skinId, plan: rules.plan, sideScroll: rules.sideScroll, guest: rules.guest, lines,
    profile: rules.skinId === null ? {} : { tuning: rules.tuning, footprint: rules.footprint } };
}


export const NATIVE_CITY_FIGHTERS: readonly NativeCityFighter[] = Object.freeze(CITY_FIGHTERS.map(drawnFighter));

/** His name on the plate and as the dialogue speaker: KUMA's string, a skinned fighter's pack `displayName`. */
export function nativeCityFighterName(fighter: NativeCityFighter, locale: Locale): string {
  if (fighter.skinId === null) return t(locale, "village.kuma.name");
  return nativeCitySkinName(fighter.skinId, locale) ?? fighter.id;
}

/** The sheet cell a clip frame draws (`frames` maps clip frames onto the sheet). */
const sheetCell = (clip: Pick<NativeCityOrthoClip, "frames">, frame: number) => clip.frames[frame] ?? frame;

/**
 * The fight overlays' encounter for `fighter`. KUMA keeps `CITY_KUMA_ENCOUNTER` (his drawn art, unchanged). A skinned fighter gets
 * the same letters, stamp, captions and tuning, with:
 * - his rival art from his pack's `fightArt` (shock / anger faces, decisive hit) - a missing slot or file is simply not there,
 *   never KUMA's piece;
 * - his own frames for anything without a drawn piece (`rivalFrames`: standing cell, recoil head, recoil cell);
 * - his defeat one-liners.
 */
export function nativeCityFighterEncounter(fighter: NativeCityFighter): CombatEncounterConfig {
  if (fighter.skinId === null) return CITY_KUMA_ENCOUNTER;
  const loaded = nativeCityKumaSkin(fighter.skinId), fightArt = loaded?.fightArt ?? {};
  const art = (id: string) => Object.hasOwn(fightArt, id) ? fightArt[id as keyof typeof fightArt] ?? null : null;
  const facesRight = loaded?.skin.facing !== "left";
  const side = loaded?.pack.directions.side;
  const idle = side?.idle, hit = side?.hit;
  // His body's top in a cell (the origin is his feet), with a little headroom.
  const top = (clip: { readonly frameHeight: number; readonly bodyHeight: number; readonly origins: NativeCityOrthoClip["origins"] }) =>
    Math.max(0, (clip.origins[0]?.originY ?? clip.frameHeight) - clip.bodyHeight - 4);
  const bust: CombatRivalFrameCut = idle
    ? { key: idle.key, frame: sheetCell(idle, 0), facesRight,
      region: { x: 0, y: top(idle), w: idle.frameWidth, h: Math.min(idle.frameHeight - top(idle), idle.bodyHeight * 0.72) } }
    : { key: "", frame: 0, facesRight, region: { x: 0, y: 0, w: 1, h: 1 } };
  // The recoil cell (`keys.recoil`, the hit clip's sequence step): the whole body, and its upper part for the shocked head.
  const recoilCell = hit?.key ? sheetCell(hit, kumaClipFrame(hit, typeof hit.keys?.recoil === "number" ? hit.keys.recoil : 12)) : null;
  const recoil: CombatRivalFrameCut | null = hit?.key && recoilCell !== null
    ? { key: hit.key, frame: recoilCell, facesRight, region: { x: 0, y: 0, w: hit.frameWidth, h: hit.frameHeight } } : null;
  const shock: CombatRivalFrameCut | null = recoil && hit
    ? { ...recoil, region: { x: 0, y: top(hit), w: hit.frameWidth, h: Math.min(hit.frameHeight - top(hit), hit.bodyHeight * 0.45) } } : null;
  return Object.freeze({
    ...CITY_KUMA_ENCOUNTER,
    id: `city-${fighter.actorId}`,
    catalog: Object.freeze({ art, letter: KUMA_FIGHT_OVERLAY_CATALOG.letter, letterText: KUMA_FIGHT_OVERLAY_CATALOG.letterText }),
    art: Object.freeze({ decisiveHit: "decisiveHit",
      rivalShock: "faceShock", rivalAnger: "faceAnger" }),
    lines: Object.freeze({ ...CITY_KUMA_ENCOUNTER.lines, defeat: fighter.lines.defeat }),
    rivalFrames: Object.freeze({ bust, shock, recoil }),
  });
}
