import type Phaser from "phaser";
import type { ArenaDuelData } from "../../../app/ArenaDuel";
import { arenaPlayable } from "../../../app/ArenaRoster";
import type { Locale } from "../../../app/Locale";
import { ARENA_AIRSHIP_ART, ARENA_RING_ART, arenaConceptArt, type ArenaConceptArt } from "../../../assets/ArenaArtCatalog";
import { arenaFaceSheet, type ArenaFaceSheet } from "../../../assets/ArenaFaceArtCatalog";
import type { ImageAssetDefinition } from "../../../assets/RuntimeArtTypes";
import type { SpriteSheetAssetDefinition } from "../../../assets/RuntimeArtTypes";
import { FIGHT_STATUS_ICON_ATLAS } from "../../../assets/FightStatusArtCatalog";
import { cityFighterRules, type CityFighterRules } from "../../../sim/cityFight/CityFighters";
import { nativeCityKumaSkin } from "../../art/NativeCityKumaSkin";
import { registeredArenaFaceArt, registeredArenaSheets, registeredArenaStyle } from "../../art/RegisteredArenaFighters";
import { CITY_KUMA_ENCOUNTER } from "../../effects/webtoon/CombatEndingDirector";
import { localeFor } from "../../localization/LocaleRuntime";
import { nativeCitySummonSheets } from "../../view/NativeCitySummonView";
import { arenaFighterSheets } from "./ArenaAssetPreload";

/**
 * 무투장 경기 한 판의 코너와 원화 목록(2026-11-02 — `ArenaDuelScene` 의 `init`·`preload` 에서 떼어 냄). 경기 화면과 16강 VS 카드
 * (`ArenaSelectScene.openCupBout` — 사용자: "Fight를 누르면 대전 상대가 나오거든. 그 밑에 로딩바")가 같은 목록을 받는다. 카드가 받아 두면
 * 경기 화면의 preload 는 들어온 키를 건너뛰어 바로 끝난다.
 */

export function arenaDuelCornerRules(id: string): CityFighterRules { return cityFighterRules(id); }

/** Who stands in a duel's two corners and on which engine. */
export interface ArenaDuelCorners {




  /**
   * Each corner is a registered fighter on the cup's engine (내 선수 출전, 2026-10-27 — against a built-in one, a shared link's too, or any in a
   * cup bout or its replay): no roster rules, skin, letters or card picture of his.
   */
  readonly mine: readonly [boolean, boolean];

  readonly builtIn: boolean;
}

/** The corners of `data`'s bout, as the duel screen fights it. */
export function arenaDuelCorners(_scene: Phaser.Scene, data: ArenaDuelData): ArenaDuelCorners {
  // A cup bout or its replay fights on the cup's engine even with two registered corners (a weekly public cup's — 2026-10-27), as does a
  // Twitch Cup bout (2026-11-02, `broadcast`); elsewhere two registered fighters meet on the registered duel.
  const registered = [data.a, data.b].map(id => arenaPlayable(id)?.kind === "registered");
  const cupEngine = data.cup !== undefined || data.replay !== undefined || data.broadcast !== undefined;
  const mine = registered.map((own, i) => own && (cupEngine || !registered[1 - i])) as unknown as readonly [boolean, boolean];
  const builtIn = [data.a, data.b].every((id, i) => arenaPlayable(id)?.kind === "fighter" || mine[i]);
  return { mine, builtIn };
}


export function arenaDuelOwnRules(corners: ArenaDuelCorners, data: ArenaDuelData, i: number): CityFighterRules | null {
  return corners.builtIn && !corners.mine[i] ? arenaDuelCornerRules(i === 0 ? data.a : data.b) : null;
}

/** READY / FIGHT!'s drawn letters in `locale` (absent ones bake in the code font). */
export function arenaDuelIntroLetters(locale: Locale): { readonly key: string; readonly path: string }[] {
  const encounter = CITY_KUMA_ENCOUNTER;
  return [encounter.letters.ready, encounter.letters.fight].map(id => encounter.catalog.letter(id, locale))
    .filter((letter): letter is { readonly key: string; readonly path: string } => letter !== null);
}

/** The drawn KO letter in `locale` (the winner's card stamps it; absent: the card writes "KO"). */
export function arenaDuelKoLetter(locale: Locale): { readonly key: string; readonly path: string }[] {
  const letter = CITY_KUMA_ENCOUNTER.catalog.letter(CITY_KUMA_ENCOUNTER.letters.ko, locale);
  return letter ? [letter] : [];
}

/** Both corners' card pictures (`ARENA_CONCEPT_ART`; a registered fighter has none). */
export function arenaDuelCornerArt(data: ArenaDuelData): ArenaConceptArt[] {
  return [data.a, data.b].map(id => arenaConceptArt(id, null)).filter((art): art is ArenaConceptArt => art !== null);
}

/** Each corner's grab reveal art (`NativeCityKumaSkinPack.fightArt.grabReveal`), or null — a fighter whose pack draws none. */
export function arenaDuelGrabRevealArt(corners: ArenaDuelCorners, data: ArenaDuelData): readonly ({ key: string; path: string } | null)[] {
  return [0, 1].map(i => {
    const skin = arenaDuelOwnRules(corners, data, i)?.skinId ?? null;
    return skin ? nativeCityKumaSkin(skin)?.fightArt.grabReveal ?? null : null;
  });
}


export function arenaDuelFaceSheet(_scene: Phaser.Scene, _corners: ArenaDuelCorners, data: ArenaDuelData, corner: 0 | 1): ArenaFaceSheet | null {
  return arenaFaceSheet(corner === 0 ? data.a : data.b);
}

/** Everything one bout's screen loads before it fights (`arenaDuelBoutAssets`). */
export interface ArenaDuelBoutAssets {
  /** The corners' sheets (each once): the duel waits for them before its bell and lets them go after it. */
  readonly sheets: readonly SpriteSheetAssetDefinition[];
  /** A summoner's objects (their first cast then draws its art, not the stand-in). */
  readonly summons: readonly SpriteSheetAssetDefinition[];
  /** The ring, the airship, the status icons, READY / FIGHT! / KO, the card pictures, the grab reveals and the faces. */
  readonly images: readonly ImageAssetDefinition[];
}


export function arenaDuelBoutAssets(scene: Phaser.Scene, data: ArenaDuelData, corners = arenaDuelCorners(scene, data)): ArenaDuelBoutAssets {
  const listed = [data.a, data.b].flatMap((id, i) => {
    if (corners.builtIn && !corners.mine[i]) return arenaFighterSheets(id);
    return registeredArenaSheets(id);
  });
  const sheets = [...new Map(listed.map(sheet => [sheet.key, sheet])).values()];
  // A corner's summons (a roster fighter's rules, a registered fighter's style — 2026-10-28: his were never preloaded, so they flew unseen).
  const summons = [0, 1].some(i => (arenaDuelOwnRules(corners, data, i)?.tuning.summons?.length ?? 0) > 0
    || registeredArenaStyle(i === 0 ? data.a : data.b)?.summon) ? nativeCitySummonSheets() : [];
  const locale = localeFor(scene);
  const images: ImageAssetDefinition[] = [ARENA_RING_ART, ARENA_AIRSHIP_ART, FIGHT_STATUS_ICON_ATLAS,
    ...arenaDuelIntroLetters(locale), ...arenaDuelKoLetter(locale), ...arenaDuelCornerArt(data),
    ...(corners.builtIn ? arenaDuelGrabRevealArt(corners, data).filter((art): art is { key: string; path: string } => art !== null) : []),
    // Both corners' expression sheets for the face HUD and the KO cut-in.
    ...[0, 1].flatMap(corner => arenaDuelFaceSheet(scene, corners, data, corner as 0 | 1) ?? []),
    ...[data.a, data.b].flatMap(id => registeredArenaFaceArt(id) ?? [])];
  return { sheets, summons, images };
}
