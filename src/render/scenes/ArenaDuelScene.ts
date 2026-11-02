import Phaser from "phaser";
import { arenaDuelPersonPlays, type ArenaDuelData } from "../../app/ArenaDuel";
import type { ServerDuelMatch } from "../../app/RankedDuel";
import { arenaDuelMode, arenaServerDuelResult } from "../../app/ArenaDuelMode";
import { arenaPlayable } from "../../app/ArenaRoster";
import { boutRecordTally } from "../../app/BoutRecord";
import { GAME_FLOW, SCENE_KEYS, type GameRoute } from "../../app/GameFlow";
import { t } from "../../app/i18n";
import { NATIVE_CITY_FIGHTERS } from "./village/NativeCityFighters";
import { bindingLabel, confirmKeycapLabel, INPUT_BINDINGS } from "../../app/InputBindings";
import { nativeCityCameraFrame } from "../../app/NativeCityPresentation";
import { NATIVE_CITY_ZOOM_STYLE } from "../../app/NativeCityOrbit";
import { ARENA_AIRSHIP_ART, ARENA_RING_ART, arenaConceptArt, arenaFaceArt, type ArenaConceptArt } from "../../assets/ArenaArtCatalog";
import { recordBout } from "../../platform/boutRecordStorage";
import { fetchFighterRankings } from "../../platform/rankedDuels";
import { cityFightBoutMark, cityFightBoutTuning, type CityFightBoutResult } from "../../sim/cityFight/bout/CityFightFighterBout";
import { NATIVE_CITY_COMBAT } from "../../sim/cityFight/NativeCityCombatTuning";
import { kumaScreenDelta } from "../../sim/cityFight/NativeCityKumaGeometry";
import type { GunTier } from "../effects/GunshotFx";
import { nativeCityKumaFighterPoint } from "../../sim/cityFight/NativeCityKumaFighter";
import { cityProject, type CityPoint } from "../../world/NativeCityDefinition";
import { ArenaDuelReactions, type ArenaDuelReaction } from "./arena/ArenaDuelReactions";
import { ArenaCrossSlashView } from "./arena/ArenaCrossSlashView";
import { ArenaPinballRopeView, type ArenaPinballRopeState } from "./arena/ArenaPinballRopeView";
import { ArenaReactionMarks, type ArenaReactionHead } from "./arena/ArenaReactionMarks";
import { applyPlayerTextScale, effectiveReducedMotion, playerSettingsFor } from "../accessibility/AccessibilityRuntime";
import { readRuntimeOptions } from "../../app/RuntimeOptions";
import { createRegisteredArenaDuel } from "../art/RegisteredArenaDuel";
import { cityFighterArtBridge, cityFighterPack, loadCityFighterPack } from "../art/CityFighterPacks";
import { cityTournamentPlayerEntry, sameCityTournamentEntry } from "../../app/CityTournamentProgress";
import { currentProgress } from "../../app/ProgressStore";
import type { ArenaSceneData } from "../../app/GameFlow";
import { arenaDeclineRoute, arenaExitRoute } from "./arena/ArenaBoutController";
import { cityTournamentArena, cityTournamentBoutSetup, type CityTournamentRegistered } from "../../app/CityTournamentBouts";
import { arenaCupRegistered } from "../../app/ArenaCupSteps";
import { cityTournamentEntrant } from "../../app/CityTournamentProgress";
import { recordArenaTournamentBout } from "./arena/ArenaTournamentRecord";
import { cityFightRushPushing } from "../../sim/cityFight/bout/CityFightBoutRush";
import { createCityFightFighterBout, type CityFightBoutAir, type CityFightBoutBounce, type CityFightBoutClash, type CityFightBoutHit, type CityFightBoutSuper, type CityFightBoutWall, type CityFightBoutSession } from "../../sim/cityFight/bout/CityFightFighterBout";
import type { CityFightBoutHold } from "../../sim/cityFight/bout/CityFightBoutGrab";
import { kumaGrabMove } from "../../sim/cityFight/NativeCityKumaFrames";
import { cityFightMeterShare } from "../../sim/cityFight/CityFightMeter";
import { nativeCityWallFreezeMs } from "../../sim/cityFight/NativeCityFight";
import type { CityFighterRules } from "../../sim/cityFight/CityFighters";
import { fighterContactLetter, FIGHTER_CONTACT_LETTERS, KUMA_FIGHT_LETTERS, type KumaFightLetterId } from "../../assets/KumaFightArtCatalog";
import { fighterMoveFxCues, fighterMoveFxOwnsContact } from "../../assets/FighterMoveFxArtCatalog";
import type { NativeCityOrthoActionClip, NativeCityOrthoPack } from "../../assets/NativeCityOrthoPack";
import { currentArenaCup, currentArenaCupBout, recordArenaCupResult, seeArenaCupArchiveEntryFinal } from "../../app/ArenaCupProgress";
import { claimOddboutGold } from "../../app/OddboutGoldShow";
import { seePublicArenaCupFinal } from "../../app/ArenaPublicCup";
import { ARENA_CUP_ROUNDS, arenaCupEarlierRules, arenaCupMatchAt, sameArenaCupBout } from "../../sim/tournament/ArenaCupRules";
import { cityFightSummonAlong, EMPTY_CITY_FIGHT_SUMMONS } from "../../sim/cityFight/CityFightSummons";
import { nativeCityFootprintRadius } from "../../sim/NativeCityActorCollision";
import { arenaDuelBoutAssets, arenaDuelCornerRules, arenaDuelCorners, arenaDuelFaceSheet, arenaDuelGrabRevealArt, arenaDuelIntroLetters,
  arenaDuelKoLetter, arenaDuelOwnRules, type ArenaDuelCorners } from "./arena/ArenaDuelAssets";
import { prepareRegisteredArenaFighter, registeredArenaFaceArt, registeredArenaFighterReady, registeredArenaLines,
  registeredArenaStyle, registeredCupFighter, registeredSuperCutInArt } from "../art/RegisteredArenaFighters";
import { registeredAccent, type RegisteredAccentSample } from "../art/RegisteredAccent";
import { registeredAwakeningAction, registeredAwakeningMotif } from "../view/awakening/RegisteredAwakeningMotifs";
import type { CityFightAwakeningMotif } from "../view/CityFightAwakeningMotifView";
import type { CityFightAwakeningHooks } from "../view/CityFightAwakeningStages";
import { preloadCharacterSpriteSheets, preloadImageAssets } from "../art/PhaserAssetLoader";
import { artTextureKey } from "../art/ArtFallback";
import { AWAKENING_COLORS, FONT, PALETTE, TYPE, UI_METRICS, cssHex } from "../art/palette";
import { preparePhaserTexture } from "../PhaserTextureFamilies";
import { releasePhaserTextureKeys } from "../PhaserTextureResidency";
import { attachAudioUnlock, sfx } from "../audio/sfx";
import { nativeCityExchangeHitStopMs } from "../effects/NativeCityExchangeFx";
import { isFighterMoveSound } from "../audio/CityFightAudio";
import { CameraRig } from "../camera/CameraRig";
import { ARENA_DEPTHS, VILLAGE_DEPTHS } from "../depths";
import { combatFxFrame } from "../effects/CombatFxClock";
import type { NativeCityAttackTrailFrame } from "../effects/NativeCityAttackTrail";
import { CITY_KUMA_ENCOUNTER } from "../effects/webtoon/CombatEndingDirector";
import { CombatIntroDirector } from "../effects/webtoon/CombatIntroTimeline";
import { FixedCameraSpace } from "../FixedCameraSpace";
import { mainCameraAtRenderZoom } from "../ResponsiveViewport";
import { createSceneScope, type SceneScope } from "../lifecycle/SceneScope";
import { localeFor } from "../localization/LocaleRuntime";
import { InputContextController } from "../input/InputContextController";
import { MenuInputRouter } from "../input/MenuInputRouter";
import { ArenaDuelControl, arenaDuelAnswerKeys, arenaDuelClaimedPad, arenaDuelHands, arenaDuelKeyChips, arenaDuelKeys, type ArenaDuelKeys }
  from "./arena/ArenaDuelControl";
import { FightStatusPanel, type FightStatusSource } from "../view/FightStatusPanel";
import { handleDomModalGamepad } from "../dom/domModalGamepad";
import { CITY_FIGHT_FOE_STATUSES } from "../../sim/cityFight/CityFightStatus";
import { ArenaSummonBadge } from "./arena/ArenaSummonBadge";
import type { CityFightSummonKind } from "../../sim/cityFight/CityFightSummonTuning";
import { ArenaHudView } from "./arena/ArenaHudView";
import type { FrameButtonHandle } from "../ui/FrameButton";
import { NativeCityHitOutline } from "../view/NativeCityHitOutline";
import { NativeCityImpactFeelView } from "../view/NativeCityImpactFeelView";
import { NativeCityKumaView, type NativeCityKumaFrameInput, type NativeCityKumaStagedClip } from "../view/NativeCityKumaView";
import { CombatIntroView } from "../view/webtoon/CombatIntroView";
import { CombatOverlayStage } from "../view/webtoon/CombatOverlayStage";
import { FightWinnerCard } from "../view/webtoon/FightWinnerCard";
import { startRoute } from "./SceneRouter";
import { ArenaDuelCamera, ArenaDuelClock, ARENA_DUEL_FEEL, ARENA_DUEL_STOPS, ARENA_FIGHTER_MOTION, arenaDuelBlow, arenaDuelBlowAirBodies,
  arenaDuelClashHeightPx, arenaDuelContactBodies, arenaDuelFollowUpStopMs, arenaDuelStopMs } from "./arena/ArenaDuelFeel";
import { ArenaAirship } from "./arena/ArenaAirship";
import { ArenaTraceView } from "./arena/ArenaTraces";
import { ArenaGround } from "./arena/ArenaGround";
import { ArenaHudSpace } from "./arena/ArenaHudSpace";
import { arenaDuelEndButtonsLayout, arenaFightHudLayout, type ArenaDuelEndAction } from "./arena/ArenaFightLayout";
import { arenaBoutLinkable, arenaBoutShareUrl, arenaSharedBoutRulesChanged, arenaSharedBoutVerdict, type ArenaSharedBoutVerdict } from "../../app/ArenaBoutShare";
import { arenaPickKey, arenaPickOf, arenaPickStreak, pickArenaBout, settleArenaPick } from "../../app/ArenaPicks";
import { loadArenaPicks, saveArenaPicks } from "../../platform/arenaPickStorage";
import { ArenaVersusCard, type ArenaVersusCardArt, type ArenaVersusCardContent } from "./arena/ArenaVersusCard";
import type { MenuInput } from "../ui/MenuCursor";
import { shareLink } from "../../platform/linkShare";
import { oddboutDiscordInviteUrl } from "../../app/OddboutCommunity";
import { openExternalLink } from "../../platform/externalLink";
import { MOBILE_DEVICE } from "../DeviceProfile";
import { ArenaGrabReveal } from "./arena/ArenaGrabReveal";
import type { Locale } from "../../app/Locale";
import { ArenaFaceHud, type ArenaFaceHudCornerFrame, type ArenaFacePicture } from "./arena/ArenaFaceHud";
import { ARENA_FACE_HUD } from "./arena/ArenaFaceHudModel";
import { ArenaKoCutIn } from "./arena/ArenaKoCutIn";
import { ARENA_GOLD_DROP, arenaGoldDropPlan } from "./arena/ArenaGoldDrop";
import { arenaGoldTarget, ArenaGoldDropView } from "./arena/ArenaGoldDropView";
import { cameraShareY } from "../view/WorldCeiling";
import { spriteInkTopY } from "../art/FrameInkTop";
import { ArenaDrawnReach } from "./arena/ArenaDrawnReach";
import { ARENA_ICON_BUTTON, arenaIconButton, type ArenaIconButtonHandle } from "./arena/ArenaIconButton";
import type { ArenaFaceSheet } from "../../assets/ArenaFaceArtCatalog";
import { NativeCityFightStageBars } from "./village/NativeCityFightStageFraming";
import { arenaFlatButton, fitArenaText } from "./arena/ArenaUi";
import { arenaPlayerName } from "./arena/ArenaNames";
import { nativeCityImpactKickFrame } from "./village/NativeCityFightCamera";
import { nativeCityFightDeps, nativeCityPhaserDrawnFightArt } from "./village/NativeCityFightDeps";
import { NativeCityFightSinks } from "./village/NativeCityFightSinks";
import { cityFightSuperCast } from "../view/CityFightSuperCutIn";
import { CITY_FIGHT_STARFALL } from "../view/CityFightStarfallView";
import { nativeCityEnemyHitNumber } from "../effects/NativeCityFloatText";
import { sfxLetterSizePx } from "../effects/webtoon/SfxLetter";
import type { CityFightAwakeningCue } from "../view/CityFightAwakeningMotifView";
import { cityFightAwakening, cityFightFollowUpDownInMs } from "../../sim/cityFight/CityFightAwakening";
import { FightVoicePlayer } from "../audio/FightVoicePlayer";
import { ArenaIntroAudio } from "../audio/ArenaIntroAudio";
import { FIGHT_VOICE_PRIORITY as VOICE } from "../../app/FightVoiceCues";
import { NativeCityFightStagecraft } from "./village/NativeCityFightStagecraft";

/**
 * Two village fighters' corners as the weekly bracket fights them (2026-10-20, the arena's AI duel of shipped fighters — 사용자: "AI 대 AI 관전
 * 경기"): the bracket's own setup (`cityTournamentBoutSetup` — their tuning, art beats, tournament strength, arena and rules) on the engine
 * the visible registered duel runs.
 */
function createBuiltInArenaDuel(a: string, b: string, seed: number, played: boolean,
  registered: CityTournamentRegistered = () => null) {
  const height = cityTournamentArena().view.actorHeightPx;
  // the beats, his drawn pack (his costume's duel clips when it has them) for the view. A registered corner (내 선수 출전, 2026-10-27): his
  // package's pack, the beats off its clips (`registered` — the cup's pinned package).
  const setup = cityTournamentBoutSetup(cityTournamentEntrant(a), cityTournamentEntrant(b),
    id => cityFighterArtBridge(id, height), undefined, registered);
  const drawn = (id: string) => registered(id)?.pack ?? cityFighterPack(id);
  const packs = [drawn(a), drawn(b)] as const;
  if (!setup || !packs[0] || !packs[1]) throw new Error("duel-not-ready");
  // A played corner starts with the bell (no seeded late start for a person's hands).
  const rules = played ? { ...setup.rules, startDelayMs: 0 } : setup.rules;
  return { session: createCityFightFighterBout(setup.corners[0], setup.corners[1], setup.arena, rules, seed),
    packs: [packs[0], packs[1]] as const, arena: setup.arena, view: setup.view, rules, corners: setup.corners };
}

/**
 * The striker's move draws its own contact effect: his skin (`FighterMoveFxCue`) has an effect that starts in front of him on the clip he
 * swings now (his special, his dash's, else his action — the clip names the cues use), or a light cue that lights the blow itself
 * (2026-11-02, the registered witches — `fighterMoveFxOwnsContact`).
 */
function arenaDuelOwnContactFx(skinId: string | null, combat: ArenaDuelMoveState): boolean {
  const clip = arenaDuelMove(combat);
  return clip !== null && fighterMoveFxCues(skinId).some(cue => fighterMoveFxOwnsContact(cue, clip));
}

type ArenaDuelMoveState = { readonly special?: string | null; readonly action: string | null; readonly dash: { readonly special?: string | null } | null };

/** The move a corner swings, by the name his move-FX cues and his own call letters use (his special, his dash's, else his action). */
function arenaDuelMove(combat: ArenaDuelMoveState): string | null {
  return combat.special ?? combat.dash?.special ?? combat.action ?? null;
}

/**
 * A corner's own call letters (2026-10-24): a village fighter's `FIGHTER_CONTACT_LETTERS` and every call his pack's clips name
 * (`keys.contactLetter` — the ODDBOUT skills'). The bout requests their drawings with its letters (`SfxLetterView.prepareCalls`).
 */
function arenaDuelCallLetters(id: string | null, pack: NativeCityOrthoPack): KumaFightLetterId[] {
  const named = Object.values(id === null ? {} : FIGHTER_CONTACT_LETTERS[id] ?? {});
  // His clips' calls, and his grab's own beat letters (2026-10-24, the kimchi slap's "짝!" / "철퍽!" — `KumaGrabMove.letters`).
  const drawn = [...Object.values(pack.directions).flatMap(clips => Object.values(clips)
    .map(clip => (clip as Partial<NativeCityOrthoActionClip> | undefined)?.keys?.contactLetter)), ...Object.values(id === null ? {} : arenaDuelGrabLetters(id))];
  return [...named, ...drawn.filter((letter): letter is KumaFightLetterId => typeof letter === "string" && letter in KUMA_FIGHT_LETTERS)];
}

/** A corner's grab beat letters (`KumaGrabMove.letters`, by beat): his row's grab move's (`KumaTuning.grab.move`), else KUMA's (none). */
function arenaDuelGrabLetters(id: string): Readonly<Partial<Record<"squeeze" | "throw", string>>> {
  return kumaGrabMove(arenaDuelCornerRules(id).tuning.grab.move).letters;
}

/** The KO's fall (and a summon still out) plays this much FIGHT time before the result panel comes up (the KO's freeze and slow add to it on screen). */
const RESULT_HOLD_MS = 1400;
/** How long 경기 공유 says 링크 복사됨 (or that the copy failed) before its own word comes back. */
const SHARE_NOTE_MS = 2200;

/**
 * The ground bursting under a struck body (a super's contact, the spike's bounce — `superRupture`): about half the village's size and on the
 * ground layer behind his body (2026-10-23 arena audit, b06 #330 / b07 #85: 500 × 350 px over the landing body hid him; now about 260 × 180).
 */
const ARENA_GROUND_BURST = Object.freeze({ drawnScale: 0.52, behindBodies: true });

/**
 * An awakening's damage number (`awakeningNumber`, 2026-10-23 arena audit — the follow-up's numbers sat 0.45–0.5 s on one spot, "2" and
 * "3" read "23"): `overHeadPx` CSS px over the struck's head, `lifeMs` long, and each new one on him pushes the ones still up `pushPx` higher.
 * Thrown high (his head near the HUD) it stands no higher than the face HUD's floor (`ArenaFaceHud.floorShare` — 0.22 of the view under
 * the old bars) plus room for `pushRoom` pushes, `besideBodies` of his height out beside him (pushed into the view's top the numbers piled
 * up on one spot again).
 */
const ARENA_AWAKENING_NUMBER = Object.freeze({ overHeadPx: 40, lifeMs: 300, pushPx: 28, pushRoom: 2, besideBodies: 0.45 });

/** The KO's light at the blow over the decisive ink (`ArenaGround.koLight`): this many of the struck's heights across. */
const ARENA_KO_LIGHT_BODIES = 3;

/** A gun fighter aims at the other's chest: this share of his drawn height over his feet (`GunshotFxView.aimAt`). */
const GUN_CHEST_BODIES = 0.58;

/**
 * A blow's comic letter's place and life in the AI duel (`arenaLetter`, 2026-10-23 arena audit): kept under the face HUD's floor
 * (`ArenaFaceHud.floorShare` — under the old bars it was 0.2 of the view; the face HUD comes down to about 0.29).
 */
const ARENA_LETTER = Object.freeze({ overHeadPx: 60, outBodies: 0.35, maxBodies: 0.35, holdMs: 120, lingerMs: 130,
  /**
   * Kept inside the view across (2026-10-24 — the upright phone: the bodies fill its width, so a struck body often stands by an edge and a
   * wide call ran off it): its drawn width (`SfxLetterView.aspect`, `fallbackAspect` before its art) × `settleRoom` for the stamp's settle,
   * its drift's sideways share and `edgePx` (screen px).
   */
  fallbackAspect: 1.6, settleRoom: 1.1, edgePx: 8 });

/** A swing that found nothing (`ArenaDuelReactions` `whiff`): its wind blows this far ahead of the swinger's feet (strides) at this height. */
const ARENA_WHIFF_WIND = Object.freeze({ strides: 0.8, height: 0.78 });

/** "쾅!" on a loud heavy blow: its bottom edge at this share of the victim's body height (his cell top), at this × its heavy size. */
const KWANG_LETTER = Object.freeze({ height: 1, scale: 0.85 });
/** The spike's bounce shakes the ring this hard (canvas px, mostly vertical — the body driven into the floor). */
const ARENA_AIR_SHAKE_PX = 9;
/** How long a rival's own challenge stays in his bubble over the intro (`sayRivalChallenge`). */
const RIVAL_LINE_MS = 2_600;
/** A call letter over that bubble cracks it and breaks it this soon (screen ms — it shatters inside the blow's hit stop). */
const RIVAL_BUBBLE_BREAK_MS = 80;

/** The winner's victory loop starts this long after the KO blow (screen ms): as the airship comes back for him, before its light. */
const ARENA_VICTORY_AFTER_MS = 600;
/** An awakening motif's camera beats (`CityFightAwakeningCue`): a shake's length, a zoom punch's (screen ms). */
const ARENA_AWAKENING_SHAKE_MS = 260;
const ARENA_AWAKENING_PUNCH_MS = 320;
/** A winner who draws a victory loop holds the KO card back this much more fight time (its pose under the light first). */
const ARENA_VICTORY_HOLD_MS = 900;
/** After a KO blow: the loser's line once his body is down, the winner's taunt after it (screen ms). */
const ARENA_DUEL_VOICE = Object.freeze({ loseDelayMs: 1_400, tauntDelayMs: 3_000 });

/** The duel's menu actions besides the six: a played bout's F8, the versus card's 1 · 2 (`INPUT_BINDINGS.arena`). */
type ArenaDuelMenuAction = "autoPlay" | "pickA" | "pickB";

/** One contact of this frame's steps, and whether it was the blow that decided the bout by KO. */
interface DuelContact { readonly hit: CityFightBoutHit; readonly ko: boolean }

/**
 * A visible, symmetric AI bout. Its simulation is also the weekly bracket's headless engine. Two registered fighters (the server's ranked
 * duel), or (2026-10-20) two of the village's fighters — their summons drawn and their blows heard. (2026-10-28: every pair is heard, gets
 * READY → FIGHT! and draws its summons — two registered fighters' bout had none of it; a registered fighter's super gets his own awakening,
 * `RegisteredAwakeningMotifs`.)
 *
 * Its screen (2026-10-20, 사용자: "액션감이 턱없이 부족하고 짜릿함이 없다"): the camera pulls in on the pair (`ArenaDuelCamera` — about 45 %
 * of the screen height, wider as they part), and every contact plays the village fight's recipe (`NativeCityFightStagecraft.impactFeel` — the
 * comic contact art and light burst, the shake and camera kick, the victim's flash and ink outline; "쾅!" on a loud heavy), held in a hit
 * stop (`ArenaDuelClock`: the session's steps wait — the same steps in the same order, so the result and digest never change). The KO gets
 * the finisher's burst, the ink impact frame, a slow motion and a push-in toward the fallen body; the HP bars keep the village's white bite.
 * A village pair opens on READY → FIGHT! (`CombatIntroView`). Reduced motion: no shake, punch, slow motion or push-in (the freezes stay).
 */
export class ArenaDuelScene extends Phaser.Scene {
  private dataIn!: ArenaDuelData;
  private scope!: SceneScope;
  private duel: ReturnType<typeof createRegisteredArenaDuel> | ReturnType<typeof createBuiltInArenaDuel> | null = null;

  private builtIn = false;
  /** A registered corner's accent (his portrait's colour — `registeredAccent`), by his id, read once his face is in. */
  private readonly accents = new Map<string, number>();
  /**
   * Each corner is a registered fighter on the cup's engine (내 선수 출전, 2026-10-27 — against a built-in one, a shared link's too, or any in a
   * cup bout or its replay): no roster rules, skin, letters or card picture of his.
   */
  private mine: readonly [boolean, boolean] = [false, false];
  /** A person's hands on corner `a` (`arenaDuelPersonPlays` — the board's bracket bout only), else null (the AI fights both corners). */
  private control: ArenaDuelControl | null = null;
  private keys: ArenaDuelKeys | null = null;
  /** The AI plays the person's corner until a key or button is touched (`ArenaDuelData.player.autoPlay` — the board's bout; no control: the AI). */
  private auto = false;
  /** The two corners' voices (`FightVoicePlayer`, 2026-10-21) — built-in fighters only, as the sounds are. */
  private voice: FightVoicePlayer | null = null;
  /** READY → FIGHT!'s announcer (`ArenaIntroAudio`, 2026-10-24) — built-in fighters only, as the intro is. */
  private introSound: ArenaIntroAudio | null = null;
  private fighters: NativeCityKumaView[] = [];
  /** The ink outline round each body while its hit flash fills it (`feel.impact.flash.outlinePx`). */
  private outlines: NativeCityHitOutline[] = [];
  private sinks!: NativeCityFightSinks;
  private stagecraft!: NativeCityFightStagecraft;
  private impactFeel!: NativeCityImpactFeelView;
  private ground!: ArenaGround;
  /** The ODDBOUT airship at the bout's two ends (READY, the KO): stage dressing only (`ArenaAirship`). */
  private airship: ArenaAirship | null = null;
  /** The skills' traces on the ring (2026-10-22 4차 — the penguin's ice, the gopher's holes, `ArenaTraceView`). */
  private traceView: ArenaTraceView | null = null;
  /** Screen ms since the KO blow (the airship's return and light), else null. */
  private koScreenMs: number | null = null;
  /** Screen ms READY → FIGHT! has played (the fighters' entrances run on it, `stagedClip`). */
  private introMs = 0;
  /** Where the winner stands for his victory (world px — pinned while the epilogue walks him home), else null. */
  private victorySpot: { readonly x: number; readonly y: number } | null = null;
  private worldCamera!: Phaser.Cameras.Scene2D.Camera;
  private rig!: CameraRig;
  private fixedSpace!: FixedCameraSpace;
  private space!: ArenaHudSpace;
  private inputContext!: InputContextController;
  private duelCamera = new ArenaDuelCamera();
  /** How high the bodies' drawings reach over their feet, held through a pose (`ArenaDrawnReach`) — the camera keeps it under the HUD. */
  private drawnReach = new ArenaDrawnReach();
  private clock = new ArenaDuelClock();
  /** The letterbox bands and their slide (the player's bout's, `NativeCityFightStageBars`). */
  private bands!: Phaser.GameObjects.Graphics;
  private stageBands = new NativeCityFightStageBars();
  /**
   * The top HUD (2026-10-23, mock-up v5 — `ArenaFaceHud`): each corner's expression portrait, name, big HP number and bar, his statuses under
   * it, the seconds between them. Null until the HUD is built.
   */
  private faceHud: ArenaFaceHud | null = null;
  /** The KO cut-in (`ArenaKoCutIn`): it stands in for the winner's card when the bout ends by KO. */
  private koCutIn: ArenaKoCutIn | null = null;
  private status!: Phaser.GameObjects.Text;
  /** Completed-bout actions, rebuilt when their layout or labels change. */
  private buttons: FrameButtonHandle[] = [];
  private buttonsKey = "";
  private endActions: ArenaDuelEndAction[] = [];
  private endFocus: ArenaDuelEndAction = "back";
  /** 경기 공유's word for a moment after a press (`SHARE_NOTE_MS`): the link copied, or the copy failed; null: its own word. */

  private grabReveal: ArenaGrabReveal | null = null;
  private revealedGrab: [number, number] = [-1, -1];
  private shareNote: "copied" | "failed" | null = null;
  private shareNoteMs = 0;
  private sharing = false;
  /**
   * A shared link's bout under other rules, told ahead (2026-10-26): the same bout fought off the screen once, its digest set against the
   * link's (`arenaSharedBoutVerdict`). Null: not asked (the link's rules are these, or it carries no digest) — the end judges it.
   */
  private sharedAhead: ArenaSharedBoutVerdict | null = null;
  /**
   * 승자 찍기 (a shared link's bout, `app/ArenaPicks`): its key, the corner he backed as kept (null: not yet — the versus card asks before
   * READY; a link opened again keeps its first pick and asks nothing), and the card until it has gone. Null: no link.
   */
  private pick: { readonly key: string; corner: 0 | 1 | null; card: ArenaVersusCard | null } | null = null;
  /** The bout's two icon buttons along the bottom (2026-10-23, mock-up v5): pause · resume at the left, 나가기 · 기권 at the right. */
  private iconButtons: { readonly control: ArenaIconButtonHandle; readonly exit: ArenaIconButtonHandle } | null = null;
  /** The records line under the winner's name (the server's ranks replace it once they come). */
  private resultText!: Phaser.GameObjects.Text;
  /** The winner's card (2026-10-20, `FightWinnerCard`): the winner fills the screen, the KO stamped over the band. */
  private winnerCard!: FightWinnerCard;
  private sheetKeys: string[] = [];
  /** READY → FIGHT! before a village pair's bout (null: not yet, or done). */
  private intro: { readonly director: CombatIntroDirector; view: CombatIntroView | null } | null = null;
  private introDone = false;
  private accumulator = 0;
  private loadMs = 0;
  /** Screen ms since the bout came up (the stagecraft's letter and accent clock). */
  private screenMs = 0;
  private started = false;
  private paused = false;
  private recorded = false;
  /** Fight ms since the result came (the KO's fall and the last summons play out before the result panel — `RESULT_HOLD_MS`). */
  private resultMs = 0;
  /** The corner the KO put down (the camera pushes in toward him), else null. */
  private koCorner: 0 | 1 | null = null;
  /** A summon's KO (`ARENA_DUEL_FEEL.summonKo`): the summon's plan point at the blow — the KO's push-in leans toward it, not the fallen. */
  private koFocus: CityPoint | null = null;
  /** A summon's KO: the summons as they stood at the blow, held on the stage `ms` more screen ms (the result clears the rest at once). */
  private koSummons: { readonly field: CityFightBoutSession["snapshot"]["summons"]; ms: number } | null = null;
  /** The corner speaking his challenge to this very opponent over the intro (`lines.against`, his bubble), else null. */
  private talker: 0 | 1 | null = null;
  /** A thrown corner's hold offset carried onto his flight (`heldDraw`), else null. */
  private carries: [{ dx: number; dy: number; ms: number } | null, { dx: number; dy: number; ms: number } | null] = [null, null];
  /** Each corner's air hits since he was thrown up (−1 once spiked: the hit after it is the ending, not a juggle) — the third's payoff. */
  private juggles: [number, number] = [-1, -1];
  /** The cross the screen has staged (`exchangeCues`): its number in the bout and the passes it sparked. */
  private exchangeSeen: { readonly seq: number; passed: number; phases: [string, string]; standoff: boolean } | null = null;
  /** The cross's cut across the passed body (`ArenaCrossSlashView`). */
  private crossSlash: ArenaCrossSlashView | null = null;
  /** The pinball's ropes at its corner post (2026-10-26, `ArenaPinballRopeView`); null without the ring picture. */
  private pinballRope: ArenaPinballRopeView | null = null;
  /** Screen ms the camera's frame holds still (the cross's last blow's freeze). */
  private cameraHoldMs = 0;
  /** Each corner's unbroken string (`streak`): its blow count and its last blow's fight ms. */
  private streaks: [{ n: number; atMs: number }, { n: number; atMs: number }] = [{ n: 0, atMs: -1e9 }, { n: 0, atMs: -1e9 }];
  /** What the corners did that the duel acts out with no rule of its own (`ArenaDuelReactions` — the marks, the dust, the swing's wind). */
  private reactions = new ArenaDuelReactions();
  /** The comic marks by their heads (`ArenaReactionMarks`). */
  private marks: ArenaReactionMarks | null = null;
  /** Screen ms to each corner's next ice spray while he slides down on the ice (`iceTrails`). */
  private iceTrailMs: [number, number] = [0, 0];
  /** Each body's knock-down has met the ground (its dust and thud played once). */
  private landed = [false, false];
  private failed = false;
  private reducedMotion = false;
  private menu!: MenuInputRouter<ArenaDuelMenuAction>;
  /** A played bout's key chips and control switch (the practice arena's HUD, `ArenaHudView`); null in an AI duel. */
  private hud: ArenaHudView | null = null;
  /** The status card (a corner's icon or face pressed): open, it holds the bout. `statusCorner`: whose card it is. */
  private statusPanel: FightStatusPanel | null = null;
  private statusCorner: 0 | 1 = 0;
  /** Each corner's summon out on the stage, at the end of his status icons (`ArenaSummonBadge`). */
  private summonBadges: ArenaSummonBadge[] = [];
  /** A tournament bout's result on its way into the bracket (`recordTournament`): the prize it paid. */
  private recording: Promise<number> | null = null;
  /** The way out has been taken (a route is on its way): no second one. */
  private leaving = false;
  /** 기권 pressed once in a tournament bout under way: the next press forfeits (any resume calls it off). */
  private forfeitArmed = false;
  /** The walk and guard held last frame: only a new press takes the corner back from the AI (`handsFrame`). */
  private heldBefore = { left: false, right: false, guard: false };
  /** Resumed this frame: a pad's A that resumed is not also his C. */
  private justResumed = false;



  private corners: ArenaDuelCorners = { mine: [false, false], builtIn: false };
  /** A replayed archive bout (`ArenaDuelData.replay`): its digest against the archive's at its end (null: not seen to the end, or none kept). */
  private replayDrift: boolean | null = null;

  constructor() { super(SCENE_KEYS.arenaDuel); }
  init(data: ArenaDuelData): void {
    this.dataIn = data; this.duel = null; this.sharedAhead = null;
    const corners = this.corners = arenaDuelCorners(this, data);
    this.mine = corners.mine; this.builtIn = corners.builtIn;
    this.fighters = []; this.outlines = [];
    this.faceHud = null; this.koCutIn = null; this.sheetKeys = []; this.buttons = []; this.buttonsKey = ""; this.iconButtons = null; this.stageBands = new NativeCityFightStageBars();
    this.shareNote = null; this.shareNoteMs = 0; this.sharing = false; this.grabReveal = null; this.revealedGrab = [-1, -1];
    this.endActions = []; this.endFocus = "back";
    const pickKey = data.shared ? arenaPickKey(data.a, data.b, data.seed, data.shared.rules) : null;
    this.pick = pickKey === null ? null : { key: pickKey, corner: arenaPickOf(loadArenaPicks(), pickKey)?.pick ?? null, card: null };
    this.accumulator = 0; this.loadMs = 0; this.screenMs = 0; this.started = false; this.paused = false; this.recorded = false; this.failed = false;
    this.resultMs = 0; this.introMs = 0; this.victorySpot = null; this.koCorner = null; this.koFocus = null; this.koSummons = null; this.landed = [false, false]; this.intro = null; this.introDone = false; this.talker = null; this.carries = [null, null]; this.juggles = [-1, -1]; this.iceTrailMs = [0, 0];
    this.streaks = [{ n: 0, atMs: -1e9 }, { n: 0, atMs: -1e9 }];
    this.reactions = new ArenaDuelReactions();
    this.duelCamera = new ArenaDuelCamera(); this.drawnReach = new ArenaDrawnReach(); this.clock = new ArenaDuelClock();
    // A person's hands only in the story's bracket bout from the village board: the select screen's bouts are AI vs AI (2026-10-22 사용자
    // 결정 — 무투장은 항상 AI 자동 대결, 직접 조종 없음 — no F8 switch, no control chip, no key chips; his corner is still his record's).
    this.control = this.builtIn && arenaDuelPersonPlays(data) ? new ArenaDuelControl() : null; this.keys = null; this.auto = data.player?.autoPlay === true;
    this.hud = null; this.recording = null; this.leaving = false; this.forfeitArmed = false; this.statusPanel = null; this.statusCorner = 0; this.summonBadges = [];
    this.heldBefore = { left: false, right: false, guard: false }; this.justResumed = false; this.replayDrift = null;
  }
  preload(): void {
    // Each corner's sheets, the summons, the ring and the rest (`arenaDuelBoutAssets` — the 16강 VS card loads the same list ahead, so its keys
    // are in and this finishes at once).
    const { sheets, summons, images } = arenaDuelBoutAssets(this, this.dataIn, this.corners);
    this.sheetKeys = sheets.map(sheet => sheet.key);
    preloadCharacterSpriteSheets(this, [...sheets, ...summons]); preloadImageAssets(this, images);
  }
  create(): void {
    this.scope = createSceneScope(this); attachAudioUnlock(this);
    // The bracket's match this entry was for: anything else (another week, a decided match — another tab) leaves at once, nothing fought (as
    // the arena's bout).
    const tournament = this.tournamentData();
    if (tournament && this.dataIn.tournament
      && !sameCityTournamentEntry(cityTournamentPlayerEntry(currentProgress().cityTournament), this.dataIn.tournament.entry)) {
      startRoute(this, arenaDeclineRoute(tournament));
      return;
    }
    // A cup bout that is not the cup's bout now (another tab played it, the cup ended) — or a watched final that is not this cup's decided
    // final: back to the bracket, nothing fought.
    const cupBout = this.dataIn.cup, cupNow = cupBout?.watch ? currentArenaCup().cup : null;
    const watched = cupBout && cupNow ? arenaCupMatchAt(cupNow, cupBout.key.round, cupBout.key.slot) : undefined;
    // A watched bout decided on older rules is another bout on these (`arenaCupEarlierRules`): not fought on the screen either.
    if (cupBout && !(cupBout.watch ? cupNow !== null && cupNow.seed === cupBout.key.seed && watched !== undefined && watched.how !== null
      && watched.a === cupBout.key.a && watched.b === cupBout.key.b && arenaCupEarlierRules(cupNow, cupBout.key.round, cupBout.key.slot) === null
      : sameArenaCupBout(currentArenaCupBout(), cupBout.key))) {
      startRoute(this, this.selectRoute());
      return;
    }
    // A bout entered from the village board or a bracket may come before the fighters' packs: they come in, then the screen starts over
    // (its preload then asks for their sheets).
    const ids = [this.dataIn.a, this.dataIn.b] as const;
    if (this.builtIn && ids.some((id, i) => !this.mine[i] && !cityFighterPack(id))) {
      const scope = this.scope, data = this.dataIn;
      void Promise.all(ids.map(id => loadCityFighterPack(id))).then(packs => {
        if (!scope.alive) return;
        if (packs.every(pack => pack !== null)) this.scene.restart(data); else this.leave();
      });
      return;
    }
    // A registered corner with only his roster idle in (a bout opened before his package was fetched — 2026-11-02, the live cup's reload
    // loop): his package comes in, then the screen starts over; one that cannot come in leaves.
    const unready = ids.filter(id => arenaPlayable(id)?.kind === "registered" && !registeredArenaFighterReady(id));
    if (unready.length > 0) {
      const scope = this.scope, data = this.dataIn;
      void Promise.all(unready.map(id => prepareRegisteredArenaFighter(id))).then(() => unready.every(registeredArenaFighterReady), () => false)
        .then(ready => { if (!scope.alive) return; if (ready) this.scene.restart(data); else this.leave(); });
      return;
    }
    this.reducedMotion = effectiveReducedMotion(readRuntimeOptions(), playerSettingsFor(this));
    // A cup bout's registered fighter fights on the package the cup pinned (`arenaCupRegistered`); a replay's on the one he has now (its
    // digest tells if that is another bout).
    const pinning = this.dataIn.cup ? currentArenaCup().cup : null;
    const registered = pinning ? arenaCupRegistered(pinning, registeredCupFighter) : registeredCupFighter;
    try { this.duel = this.builtIn ? createBuiltInArenaDuel(this.dataIn.a, this.dataIn.b, this.dataIn.seed, this.control !== null, registered)
      : createRegisteredArenaDuel(this.dataIn.a, this.dataIn.b, this.dataIn.seed); }
    catch {
      if (this.dataIn.broadcast) { this.failed = true; this.dataIn.broadcast.onError("Could not create the battle"); return; }
      startRoute(this, tournament ? arenaDeclineRoute(tournament) : this.selectRoute()); return;
    }
    const duel = this.duel, { view, arena, corners, packs, session } = duel;
    this.sharedAhead = this.sharedBoutAhead();
    // A replayed archive bout from one of its scenes (기록실 B단계): fought ahead off the screen to that moment, then shown from there — no
    // READY → FIGHT! (the same steps, so the rest of the bout is the archive's).
    const startMs = this.dataIn.replay?.startMs ?? 0;
    if (startMs > 0) {
      while (session.snapshot.result === null && session.snapshot.ms < startMs) session.step();
      this.introDone = true;
    }
    this.ground = new ArenaGround(this, arena.line, view, arena.stepUnits, view.actorHeightPx);
    const airship = new ArenaAirship(this, () => this.reducedMotion);
    if (airship.picture) this.ground.adopt(airship.picture);
    this.airship = airship; this.koScreenMs = null;
    this.scope.add(() => { airship.destroy(); if (this.airship === airship) this.airship = null; });
    const traceView = new ArenaTraceView(this);
    this.traceView = traceView;
    this.scope.add(() => { traceView.destroy(); if (this.traceView === traceView) this.traceView = null; });
    const art = nativeCityPhaserDrawnFightArt(this, nativeCityFightDeps(this).art);
    this.fighters = corners.map((corner, i) => {
      // A village fighter stands at his own body scale and draws his own skin (KUMA none); a registered one at 1, his id as the skin.
      const own = this.ownRules(i);
      const plan = { viewId: "V1" as const, bodyScale: own?.plan.bodyScale ?? 1, alertStrides: 1e6, releaseStrides: 1e6,
        points: [{ at: cityFightBoutMark(arena, duel.rules.startStrides * arena.stepUnits, i === 0 ? -1 : 1), pauseMs: 1e9 }] };
      // The rule-tell rims are the player's read: on his opponent in a played bout, on nobody in an AI duel. The arena's body motion
      // (`ARENA_FIGHTER_MOTION`, 2026-10-23 arena audit): the windup's beats, the flinch's cells and shove, the corner outline.
      const fighter = new NativeCityKumaView(this, this.scope, plan, own ? own.skinId : corner.id, corner.id,
        { pack: packs[i]!, tuning: cityFightBoutTuning(corner.tuning, duel.rules.air),
          footprint: corner.footprint, tellRims: this.control !== null && i === 1,
          arenaMotion: { spec: ARENA_FIGHTER_MOTION, corner: i === 0 ? 0 : 1, rival: () => session.snapshot.states[1 - i]!,
            followUp: () => session.snapshot.followUps[i] !== null, rivalCrown: () => this.fighters[1 - i]?.crownPoint ?? null } }, art,
        () => session.snapshot.states[i]!);
      fighter.sprite.disableInteractive(); return fighter;
    });
    this.outlines = this.fighters.map((_, i) => new NativeCityHitOutline(this, `arena-duel-hit-outline-${i}`));
    this.scope.add(() => { for (const outline of this.outlines) outline.destroy(); });
    // The fight's world effects (the village's set: contact art, letters, ink impact frame, the summons' fixed pool) — made now, before the
    // UI camera takes its ignore list.
    this.sinks = new NativeCityFightSinks(this, this.scope, { locale: () => localeFor(this), projection: () => duel.view,
      actorHeight: () => duel.view.actorHeightPx, worldPxPerScreenPx: () => this.worldPxPerScreenPx(), reducedMotion: () => this.reducedMotion,
      cardMode: () => false, awakeningSky: () => this.ground.nightReady, worldCamera: () => this.worldCamera,
      actors: () => this.fighters.map(fighter => fighter.sprite), blastBehindBodies: true, arena: { behindDepth: ARENA_DEPTHS.awakeningBehind },
      comboLook: "arena", hudFloor: () => this.hudFloor() });
    if (corners.some(corner => (corner.tuning.summons?.length ?? 0) > 0)) this.sinks.summons.prepare();
    // The drawn comic letters (the corners' own calls with them) and hit cels come in with the bout (until they do, the code font and
    // shapes stand in).
    this.sinks.letters.prepareCalls([...new Set(corners.flatMap((corner, i) => arenaDuelCallLetters(this.ownRules(i) ? corner.id : null, packs[i]!)))]);
    this.sinks.hitFx.prepare();
    const marks = this.marks = new ArenaReactionMarks(this);
    this.scope.add(() => { marks.destroy(); if (this.marks === marks) this.marks = null; });
    const slash = this.crossSlash = new ArenaCrossSlashView(this);
    this.scope.add(() => { slash.destroy(); if (this.crossSlash === slash) this.crossSlash = null; });
    const ropes = this.ground.ropes ? new ArenaPinballRopeView(this, this.ground.ropes) : null;
    this.pinballRope = ropes;
    if (ropes) this.scope.add(() => { ropes.destroy(); if (this.pinballRope === ropes) this.pinballRope = null; });
    this.sinks.superFlash.prepare(corners.map(corner => corner.id));
    const uiCamera = mainCameraAtRenderZoom(this);
    this.worldCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height).setName("duel-world");
    this.cameras.remove(uiCamera, false); this.cameras.addExisting(uiCamera, true);
    uiCamera.ignore([...this.children.list]);
    this.fixedSpace = new FixedCameraSpace(this, this.scope, { camera: uiCamera, onAdd: object => this.worldCamera.ignore(object) });
    this.space = new ArenaHudSpace(this, this.scope, this.fixedSpace);
    this.rig = new CameraRig(this.worldCamera, { quiet: () => this.reducedMotion });
    this.rig.snapTo(this.cameraFrame(0));
    // The camera kick of a blow (`NativeCityImpactFeel` — summed into the frame); this duel shows no hurt glow and plays no rumble.
    this.impactFeel = new NativeCityImpactFeelView(this, this.fixedSpace);
    const sinks = this.sinks, fighters = this.fighters, control = this.control !== null;
    this.stagecraft = new NativeCityFightStagecraft({ projection: () => duel.view, actorHeight: () => duel.view.actorHeightPx,
      reducedMotion: () => this.reducedMotion, letters: sinks.letters, fx: sinks.combatFx, hitFx: sinks.hitFx, floats: sinks.floats,
      shake: (px, durationMs, verticalShare = 0) => { this.rig.shakePx(durationMs, px, verticalShare); },
      kick: kick => this.impactFeel.kick(kick),
      // A played bout (2026-10-22): the enemy's blows on the player's corner glow his screen's edge red, and the player's hands feel every
      // blow on the pad — the village fight's feel. An AI duel (nobody plays) shows neither.
      hurt: tier => this.impactFeel.hurt(tier),
      rumble: rumble => { if (this.control && !this.auto) this.impactFeel.rumble(rumble); },
      // The enemy (`by` "kuma"): the AI's corner in a played bout; never read in an AI duel (every contact there is the player's side's).
      get kuma() { return fighters[control ? 1 : 0]!; } }, () => this.screenMs, () => duel.arena.stepUnits);
    this.buildHud();
    this.inputContext = new InputContextController(this, this.scope);
    // A played bout's fight buttons on the pad are the fight's, never 확인 / 뒤로 (`arenaDuelClaimedPad`).
    const settings = playerSettingsFor(this);
    if (this.control) this.keys = arenaDuelKeys(this.input.keyboard!, settings);
    // The versus card's 1 · 2 are always bound (they act only while it asks); F8 only does anything in a played bout (`toggleAuto`).
    this.menu = new MenuInputRouter<ArenaDuelMenuAction>(this, this.scope, this.inputContext, { onInput: input => {
      if (this.dataIn.broadcast) return;
      if (this.picking()) this.pickInput(input);
      else if (this.recorded || this.failed) this.endInput(input);
      else if (input.actions.includes("autoPlay")) this.toggleAuto();
      else if (input.nav.back) this.back(); else if (input.nav.confirm) this.confirm();
    }, actions: { autoPlay: { key: INPUT_BINDINGS.arena.autoPlay }, pickA: { key: INPUT_BINDINGS.arena.pickA }, pickB: { key: INPUT_BINDINGS.arena.pickB } },
    ...(this.control ? { claimedPad: () => this.paused || this.recorded || this.failed ? [] : arenaDuelClaimedPad(playerSettingsFor(this)),
      capture: [...INPUT_BINDINGS.arena.autoPlay] } : {}) });
    if (this.control) this.hud = new ArenaHudView(this, this.space, { help: () => undefined, auto: () => this.toggleAuto() });
    sfx.beginVillageScore(); sfx.setVillageFight(true);
    if (this.builtIn) {
      const voice = this.voice = new FightVoicePlayer(null, [this.dataIn.a, this.dataIn.b]);
      this.scope.add(() => { voice.dispose(); if (this.voice === voice) this.voice = null; });
    }
    // READY → FIGHT! for every pair (2026-10-28: two registered fighters' bout had none — it opened at once, unheard).
    const introSound = this.introSound = new ArenaIntroAudio();
    this.scope.add(() => { introSound.dispose(); if (this.introSound === introSound) this.introSound = null; });
    this.scope.add(() => { sfx.setVillageFight(false); this.intro?.director.finish(); this.intro?.view?.destroy(); this.intro = null;
      releasePhaserTextureKeys(this.game, [...this.sheetKeys, ARENA_RING_ART.key, ARENA_AIRSHIP_ART.key], { afterUse: true }); });
  }

  private ownRules(i: number): CityFighterRules | null {
    return arenaDuelOwnRules(this.corners, this.dataIn, i);
  }

  private label(text: string, size: string = TYPE.body): Phaser.GameObjects.Text {
    return this.space.add(applyPlayerTextScale(this, this.add.text(0, 0, text, { fontFamily: FONT.hudSans, fontSize: size, color: cssHex(PALETTE.white),
      stroke: cssHex(PALETTE.navyInk), strokeThickness: 3 }).setDepth(ARENA_DEPTHS.hud)));
  }
  private buildHud(): void {
    const locale = localeFor(this);
    this.bands = this.fixedSpace.add(this.add.graphics().setDepth(VILLAGE_DEPTHS.fightStageBars).setName("duel-stage-bars"));
    // Each corner's statuses under his bar (2026-10-22 사용자: "어떤 효과가 발동중인데 아이콘 표시를 해줘", "아이콘을 누르면 팝업으로 어떤
    // 효과인지 설명"): the village fighters' rule reads (`kumaFightStatuses`); an icon (or his summon badge) opens the effect board (`FightStatusPanel.board` — every effect, positive and negative, beside the ones on him
    // now), his face his card — the bout holds meanwhile.
    const panel = this.statusPanel = new FightStatusPanel(this, () => this.statusSource());
    this.scope.add(() => panel.close());
    this.faceHud = new ArenaFaceHud(this, this.space, {
      statusName: status => t(localeFor(this), `fight.status.${status}.name`),
      status: corner => { if (!this.dataIn.broadcast && this.statusReady()) { this.statusCorner = corner; panel.board(); } },
      card: corner => { if (!this.dataIn.broadcast && this.statusReady()) { this.statusCorner = corner; panel.card(); } } });
    this.scope.add(() => this.faceHud?.destroy());
    // His summon out on the stage (the car, the crane…) is no rule status but the thing on screen: its own picture after his icons.
    this.summonBadges = [0, 1].map(corner => new ArenaSummonBadge(this, this.space, VILLAGE_DEPTHS.fightStageBars + 0.5, `duel-summon-badge-${corner}`,
      () => { if (!this.dataIn.broadcast && this.statusReady()) { this.statusCorner = corner as 0 | 1; panel.board(); } }));
    // Between the bars: the seconds left, big; or, at the top, the word for the hold (불러오는 중 · 일시정지).
    this.status = this.label(t(locale, "arena.select.loading"), TYPE.display).setFontStyle("bold").setOrigin(0.5, 0).setName("duel-status");
    this.winnerCard = new FightWinnerCard(this, object => this.space.add(object), () => sfx.stampThud());
    this.koCutIn = new ArenaKoCutIn(this, this.space);
    this.scope.add(() => this.koCutIn?.destroy());
    // The versus card that asks who wins (a shared bout not picked yet): over the ring and the face HUD, under the bottom icon buttons.
    const pick = this.pick;
    if (pick && pick.corner === null) {
      const card = pick.card = new ArenaVersusCard(this, object => this.space.add(object), corner => this.takePick(corner, false));
      this.scope.add(() => { card.destroy(); if (pick.card === card) pick.card = null; });
    }
    // Over everything for its third of a second (the face HUD and the KO cut-in included): the grab's windup flash. Its "두둥" is the stamp.
    this.grabReveal = new ArenaGrabReveal(this, this.space, () => { sfx.stampThud(); });
    this.scope.add(() => this.grabReveal?.destroy());
    const control = arenaIconButton(this, this.space, "duel-controls", () => { if (this.paused) this.resume(); else this.confirm(); });
    const exit = arenaIconButton(this, this.space, "duel-exit", () => this.exit());
    this.iconButtons = { control, exit };
    this.scope.add(() => { control.destroy(); exit.destroy(); });
    this.resultText = this.label("", TYPE.body).setLineSpacing(8)
      .setOrigin(0.5, 0).setAlign("center").setName("duel-result").setVisible(false);
  }
  /** 확인 (Enter · F · a pad's A while paused): an asked 기권 is confirmed; else it resumes, skips the intro or pauses. */
  private confirm(): void {
    if (this.dataIn.broadcast) return;
    const card = this.pick?.card;
    if (card?.open) { if (card.focused !== null) this.takePick(card.focused, true); return; }
    if (this.recorded || this.failed || this.forfeitArmed) this.leave();
    else if (this.paused) this.resume();
    else if (this.intro?.director.holdsFight) { if (this.intro.director.skip()) this.intro.view?.render(); }
    else if (this.live()) this.paused = true;
  }
  private resume(): void { this.paused = false; this.forfeitArmed = false; this.justResumed = true; }
  /** The bout is under way: started, not yet decided (its result hold is not — nothing pauses it), nothing failed. */
  private live(): boolean {
    return this.started && !this.recorded && !this.failed && this.duel !== null && this.duel.session.snapshot.result === null;
  }
  /** The status icons show and their card can open: the bout under way, not paused, past READY → FIGHT!. */
  private statusReady(): boolean { return this.live() && !this.paused && !this.picking() && this.intro?.director.holdsFight !== true; }
  /** The kinds of the corner's summons still out on the stage (not one knocked back at him), oldest first. */
  private liveSummons(corner: 0 | 1): CityFightSummonKind[] {
    const owner = this.duel?.corners[corner]?.id;
    return (this.duel?.session.snapshot.summons.live ?? [])
      .filter(summon => summon.end === null && !summon.reflected && summon.ownerId === owner).map(summon => summon.kind);
  }
  /** The pressed corner's statuses and moves for the card (`statusCorner`), named after him. */
  private statusSource(): FightStatusSource | null {
    const fighter = this.fighters[this.statusCorner];
    if (!this.statusReady() || !fighter) return null;
    const locale = localeFor(this), name = arenaPlayerName(this.statusCorner === 0 ? this.dataIn.a : this.dataIn.b, locale);
    return { locale, foeName: name, foePortrait: null, foeAll: CITY_FIGHT_FOE_STATUSES, foeLit: fighter.fightStatuses,
      skills: fighter.fightSkills, keys: arenaDuelAnswerKeys(playerSettingsFor(this), this.inputContext.activeDevice === "gamepad"), meLit: [],
      liveSummons: this.liveSummons(this.statusCorner) };
  }
  /**
   * Esc · 뒤로 (a pad's B while paused; its Start pauses): a bout under way pauses first (2026-10-22 review: one Esc forfeited a tournament
   * match, and a pad had no way to pause); paused, it goes on to 나가기 (`exit` — a tournament bout's 기권 asks first); an asked 기권 it calls
   * off — Esc never confirms one (second review: Esc meant to back out of the question recorded the loss). Not under way, it leaves.
   */
  private back(): void {
    if (this.dataIn.broadcast) return;
    if (!this.live()) this.leave();
    else if (!this.paused) this.paused = true;
    else if (this.forfeitArmed) this.forfeitArmed = false;
    else this.exit();
  }
  /** 나가기 — 기권 in a tournament bout under way, which asks once more first (the arena's pause menu's two-press 기권하기). */
  private exit(): void {
    if (this.dataIn.broadcast) return;
    if (this.live() && this.dataIn.tournament && !this.forfeitArmed) { this.forfeitArmed = true; this.paused = true; return; }
    this.leave();
  }
  /** F8 or the control chip in a played bout: the AI takes his corner, or gives it back. */
  private toggleAuto(): void {
    if (!this.control || !this.started || this.recorded) return;
    this.auto = !this.auto; this.control.clear();
  }
  private leave(): void {
    if (this.dataIn.broadcast) {
      if (!this.recorded) this.dataIn.broadcast.onError("The battle could not continue");
      return;
    }
    if (this.leaving) return;
    // A decided bout not yet recorded (the result hold — 2026-10-22 review: leaving in it recorded nothing, so a lost tournament bout could be
    // fought again) is recorded first, as if the hold had run out.
    const result = this.duel?.session.snapshot.result ?? null;
    if (result && this.started && !this.recorded && !this.failed) this.finish(result);
    else this.settleLeftPick();
    // A tournament bout: back to its bracket with its prize once its result is in; unfought, the bracket still waits on it.
    const tournament = this.tournamentData(), entry = this.dataIn.tournament?.entry;
    if (tournament && entry) {
      // Out of a bout under way: a forfeit, a lost match (the arena's pause-menu 기권하기) — never a way round a losing bout.
      if (this.live()) { this.recorded = true; this.recording = this.recordTournament(false, "forfeit", entry); }
      this.leaving = true;
      const recording = this.recording, scope = this.scope;
      if (!recording) { startRoute(this, arenaDeclineRoute(tournament)); return; }
      void recording.then(gold => { if (scope.alive) startRoute(this, arenaExitRoute({ won: false, how: "ko", choice: null }, tournament, gold)); });
      return;
    }
    this.leaving = true;
    startRoute(this, this.selectRoute());
  }
  /** Back to the select screen: a cup bout to its bracket (the hub — the result is in the cup already), another bout to his sparring card. */
  private selectRoute(): GameRoute {
    const cup = this.dataIn.cup, replay = this.dataIn.replay;
    if (replay) return GAME_FLOW.arenaArchiveEntered({ cupId: replay.cupId, bout: { round: replay.round, slot: replay.slot }, drifted: this.replayDrift });
    return cup ? GAME_FLOW.arenaSelectEntered(cup.watch ? { cupWatched: { round: cup.key.round, slot: cup.key.slot } } : {})
      : GAME_FLOW.arenaSelectEntered({ focus: this.dataIn.a });
  }
  /** The played tournament bout as the arena's own data (its exit and decline routes read it), else null. */
  private tournamentData(): ArenaSceneData | null {
    const tournament = this.dataIn.tournament;
    return tournament ? { mode: "tournament", entry: tournament.entry, from: tournament.from, autoPlay: this.auto } : null;
  }
  override update(_time: number, dtMs: number): void {
    const duel = this.duel;
    if (!duel || !this.space) return;
    if (this.shareNote && (this.shareNoteMs -= dtMs) <= 0) this.shareNote = null;
    // A broadcaster edits chat controls outside this iframe while the automatic bout keeps fighting.
    const hidden = document.hidden || (!this.dataIn.broadcast && !document.hasFocus());
    if (!this.started && !this.failed) {
      this.loadMs += dtMs;
      if (this.fighters.every(f => f.artReady && !f.requestCombatArt()) && this.sheetKeys.every(key => preparePhaserTexture(this.game, key))) {
        this.started = true;
        this.dataIn.broadcast?.onReady();
      }
      else if (this.loadMs > 15000) { this.failed = true; this.dataIn.broadcast?.onError("Battle art did not become ready"); }
    }
    // A pad's Start (the fight's other buttons are the fight's — `arenaDuelClaimedPad`): pauses, or resumes — before this frame's hold is
    // read, so the frame it pauses on steps nothing.
    // The status card is the top window while open: its pad moves and presses go to it (B closes it), and it holds the bout.
    const card = this.statusPanel?.open === true;
    if (card) handleDomModalGamepad(this.menu.pad.pressed);
    else if (this.control && this.menu.pad.pressed.start) { if (this.paused) this.resume(); else this.back(); }
    // After the result the bodies and the summons go on (the KO's fall, a blast finishing); only the rules have stopped.
    const held = !this.started || this.paused || hidden || this.failed || card;
    const screenDt = held ? 0 : Math.min(Math.max(0, dtMs), 100);
    this.screenMs += screenDt;
    const introHolds = this.stepPick(screenDt) || this.stepIntro(screenDt);
    // The hit stop and the KO's slow motion: how much fight time this frame lets the session step.
    const clock = this.clock.frame(introHolds ? 0 : screenDt);
    const contacts: DuelContact[] = [], walls: CityFightBoutWall[] = [], supers: CityFightBoutSuper[] = [], airs: CityFightBoutAir[] = [];
    const clashes: CityFightBoutClash[] = [], bounces: CityFightBoutBounce[] = [];
    const control = this.handsFrame(held || introHolds || duel.session.snapshot.result !== null, clock.fightDtMs);
    // A frozen frame steps nothing — not even the fight time left over from the frame its contact landed on (it runs after the freeze).
    if (!held && !introHolds && !clock.hitStopped) {
      this.accumulator += clock.fightDtMs;
      // Past the result the session plays its epilogue (the fallen lies, the other walks back) until the panel comes up.
      while (this.accumulator >= duel.rules.dtMs && !this.recorded) {
        const decided = duel.session.snapshot.result !== null;
        const swung = duel.session.snapshot.states[0].combat.attackId, took = duel.session.snapshot.states[0].combat.skillPress ?? 0;
        if (decided) duel.session.settle(); else duel.session.step(control ? [control.command(this.playerSide()), null] : undefined);
        // His press went out on this step (his swing started, or his skill took it — a feint's stop, a recoil's poke, a brace's shove): it is spent.
        const mine = duel.session.snapshot.states[0].combat;
        if (control && (mine.attackId !== swung || (mine.skillPress ?? 0) !== took)) control.spent();
        this.accumulator -= duel.rules.dtMs;
        const after = duel.session.snapshot, ko = !decided && after.result?.how === "ko" ? after.result.winner : null;
        for (const hit of after.hits ?? []) contacts.push({ hit, ko: ko !== null && hit.target !== ko });
        walls.push(...after.walls); supers.push(...after.supers); airs.push(...after.airs); clashes.push(...after.clashes); bounces.push(...after.bounces);
        // A contact (a splat, a super, a body thrown up meeting the ground, a clash) freezes on its own step: the rest of this frame's steps wait out its hold.
        if (contacts.length > 0 || walls.length > 0 || supers.length > 0 || airs.length > 0 || clashes.length > 0 || bounces.length > 0) break;
      }
    }
    for (const contact of contacts) this.blow(contact);
    for (const wall of walls) this.wall(wall);
    for (const beat of airs) this.airBeat(beat);
    for (const met of clashes) this.clash(met);
    for (const spring of bounces) this.bounce(spring);
    for (const spent of supers) this.superFlash(spent);
    const snapshot = duel.session.snapshot;
    if (!held) this.exchangeCues(snapshot);
    // The marks, the dust and the swing's wind (2026-10-24 effect pass 3·4): read off this frame's states and contacts, during the bout only.
    if (snapshot.result === null) {
      for (const reaction of this.reactions.observe(snapshot.states, contacts.map(contact => contact.hit), clashes, snapshot.ms)) this.react(reaction);
    }
    // The frame a contact lands on already stands still (its first frozen frame).
    const stopped = clock.hitStopped || this.clock.stopping, timeScale = stopped ? 0 : clock.timeScale;
    const wpp = this.worldPxPerScreenPx();
    // A corner held by the other's grab (`fighterGrab`) draws at the grabber's hands: the grabber first, so his hold point is this frame's.
    const order = snapshot.held[0] ? [1, 0] : [0, 1];
    for (const i of order) {
      const fighter = this.fighters[i]!;
      const input: NativeCityKumaFrameInput = { dtMs: screenDt, viewId: "V1", travel: false, hostile: true,
        player: nativeCityKumaFighterPoint(snapshot.states[1 - i]!), projection: duel.view, actorHeight: duel.view.actorHeightPx,
        frozen: held, reducedMotion: this.reducedMotion, worldPxPerScreenPx: wpp };
      // His victory (`stagedClip`) stands where it began: the epilogue's walk home would slide the drawn pose.
      const staged = this.stagedClip(i);
      if (staged?.clip === "victory" && this.koCorner !== null && i !== this.koCorner) {
        this.victorySpot ??= (([x, y]) => ({ x, y }))(cityProject(nativeCityKumaFighterPoint(snapshot.states[i]!), duel.view));
        fighter.holdAt(this.victorySpot);
      } else fighter.holdAt(this.heldDraw(i, snapshot.held[i] ?? null, screenDt));
      // His air chase meets the other where that body is drawn up in the air (`chaseTarget`).
      const other = this.fighters[1 - i]!;
      fighter.chaseTarget(other.airBodies * other.drawnBodyPx);
      // A gun fighter's lines end on the other's chest (as drawn last frame — 2026-10-27, `GunshotFxView`).
      if (fighter.gunArmed) fighter.aimGun(other.sprite.visible ? { x: other.sprite.x, y: other.sprite.y - other.drawnBodyPx * GUN_CHEST_BODIES } : null);
      fighter.stageClip(staged);
      fighter.prepare(input); fighter.draw(input, { hitStopped: stopped, timeScale });
      // His drawn moves' own sounds (the ODDBOUT ice, claws and dirt — `FighterMoveFxCue.sound`): a village pair's sound only.
      for (const id of fighter.takeSounds()) if (this.builtIn && isFighterMoveSound(id)) sfx.villageMelee(id);
    }
    // His fill flash gets the ink outline (not an iron one — his armour ate it).
    this.fighters.forEach((fighter, i) => this.outlines[i]!.draw(fighter.sprite, fighter.sprite.tintFill === true && fighter.sprite.isTinted
      && !fighter.armored, wpp));
    this.marks?.draw(stopped ? 0 : screenDt * timeScale, this.fighters.map((_, i) => this.reactionHead(i)));
    this.crossSlash?.update(screenDt);
    this.pinballRope?.update(this.pinballRopeState(snapshot), duel.view.actorHeightPx, stopped ? 0 : screenDt * timeScale, this.reducedMotion);
    this.iceTrails(snapshot, screenDt, stopped);
    this.ground.shadowsAt(this.fighters);
    this.landings();
    this.effectsFrame(screenDt, stopped, timeScale, clock.desaturate);
    this.frameCamera(screenDt);
    // A winner with a victory loop is given its time under the KO light before the card (`ARENA_VICTORY_HOLD_MS`).
    const victory = snapshot.result?.how === "ko" && this.fighters[snapshot.result.winner]?.drawsStageClip("victory") === true;
    const hold = RESULT_HOLD_MS + (victory ? ARENA_VICTORY_HOLD_MS : 0);
    if (snapshot.result && !this.recorded && !held && (this.resultMs += clock.fightDtMs) >= hold) this.finish(snapshot.result);
    this.watchGrabReveal(screenDt);
    this.drawHud(screenDt);
  }

  /** Each corner's grab reveal art (`NativeCityKumaSkinPack.fightArt.grabReveal`), or null — a fighter whose pack draws none. */
  private grabRevealArt(): readonly ({ key: string; path: string } | null)[] {
    return arenaDuelGrabRevealArt(this.corners, this.dataIn);
  }



  private watchGrabReveal(screenDt: number): void {
    const duel = this.duel, reveal = this.grabReveal;
    if (!duel || !reveal) return;
    const states = duel.session.snapshot.states, art = this.grabRevealArt();
    states.forEach((state, i) => {
      const combat = state.combat;
      if (combat.mode !== "attack" || combat.action !== "grab" || combat.attackId === this.revealedGrab[i]) return;
      this.revealedGrab[i] = combat.attackId;
      const piece = art[i];
      if (!piece || artTextureKey(this, piece.key, "decorative") === null) return;
      const [x] = cityProject(nativeCityKumaFighterPoint(state), duel.view), [other] = cityProject(nativeCityKumaFighterPoint(states[1 - i]!), duel.view);
      reveal.show(piece.key, x <= other ? -1 : 1, this.reducedMotion);
    });
    reveal.update(screenDt);
  }


  private heldDraw(i: number, hold: CityFightBoutHold | null, screenDt: number): { readonly x: number; readonly y: number } | null {
    const duel = this.duel!, feet = cityProject(nativeCityKumaFighterPoint(duel.session.snapshot.states[i]!), duel.view);
    const at = hold ? this.fighters[hold.by]!.holdPoint : null;
    if (at) { this.carries[i] = { dx: at.x - feet[0], dy: at.y - feet[1], ms: 0 }; return { x: at.x, y: at.y }; }
    const carry = this.carries[i];
    if (!carry) return null;
    const spec = kumaGrabMove().throwCarry;
    carry.ms += screenDt;
    if (this.reducedMotion || carry.ms >= spec.ms) { this.carries[i] = null; return null; }
    const k = (1 - carry.ms / Math.max(1, spec.ms)) ** spec.power;
    return { x: feet[0] + carry.dx * k, y: feet[1] + carry.dy * k };
  }

  /**
   * One contact as the village fight shows it (`NativeCityFightStagecraft`): its freeze on the duel clock, its sound (a village pair), the
   * victim's flash, the contact art and light burst, the shake and kick, "쾅!" on a loud heavy. A guarded one sparks on the guard; the KO
   * adds the finisher's burst, the ink impact frame and the slow motion after its freeze.
   */
  private blow({ hit, ko }: DuelContact): void {
    const duel = this.duel!, snapshot = duel.session.snapshot, target = hit.target, victim = this.fighters[target]!, striker = this.fighters[1 - target]!;
    const feet = nativeCityKumaFighterPoint(snapshot.states[target]), other = nativeCityKumaFighterPoint(snapshot.states[1 - target]!);
    const push = planUnit([feet[0] - hit.from[0], feet[1] - hit.from[1]]) ?? planUnit([feet[0] - other[0], feet[1] - other[1]]) ?? duel.arena.line.direction;
    // His own rules said whether his armour ate it (`CityFightBoutHit.armored`); a played bout's blow on the player's corner is the enemy's
    // blow on him ("kuma" — his hurt glow, the striker's technique trail), every other the player's side's (an AI duel: all of them).
    const armored = !hit.blocked && !ko && hit.armored === true, by = this.control && target === 0 ? "kuma" as const : "player" as const;
    const plain = arenaDuelBlow(hit, armored, ko), reduced = this.reducedMotion;
    const blow = { ...plain, stopMs: arenaDuelStopMs(plain.stopMs, hit, ko, this.streak((1 - target) as 0 | 1, snapshot.ms, hit)) };
    // Up there with him when the blow found him in the air (the air combo's chase and spike): its spark, letter and number at his lifted body.
    // A KO up there takes the drawn body (2026-10-23 audit: the rules lay him down at once, the burst went off on the empty floor under him).
    const bodyPx = duel.view.actorHeightPx * victim.bodyScale, air = arenaDuelBlowAirBodies(snapshot, target, victim, bodyPx, ko);
    // A swing between two bodies on the ground lights up at the striker's contact held inside the struck's body (`ARENA_DUEL_FEEL.contact` —
    // a big one's jab over a small one's head lit his crown, not his chest); a summon's or an air blow keeps the struck's own.
    const contact = NATIVE_CITY_COMBAT.feel.fx.contactHeight, grounded = !hit.summon && hit.air === undefined && air <= 0 && striker.drawnLiftPx <= 0;
    const height = (grounded ? arenaDuelContactBodies(duel.view.actorHeightPx * striker.bodyScale, bodyPx, contact) : contact) + air;
    const weapon = hit.summon ? "blunt" : striker.weaponImpactKind;
    // "덥석!", a thud and a short shake (no blow on his body); a squeeze is the hug's small ring where the arms close and a light struck feel.
    if (hit.grab === "catch") {
      // A super grab's catch (2026-10-22 4차, the crab's): its cut-in's letterbox goes with it (its throw is the super's big contact).
      if (hit.super === true) this.sinks.superFlash.resolve();
      const freeze = NATIVE_CITY_COMBAT.kuma.grab.catchHitStopMs * NATIVE_CITY_COMBAT.hitStopScale;
      this.clock.stop(freeze);
      this.stagecraft.letter("deopseok", "heavy", feet, bodyPx, push, freeze);
      this.stagecraft.exchangeShake("clash");
      sfx.villageMelee("struckHeavy", striker.weaponImpactKind);
      return;
    }
    if (hit.followUp !== undefined) { this.followUpBlow(hit, ko); return; }
    // A trip in the other's hole (2026-10-22 4차, `CityFightBoutTraces`): no blow — a puff of dirt round his feet and its thud.
    if (hit.trip === true) {
      this.stagecraft.exchangeFx("koDustRing", feet, 0, push, bodyPx * 0.7);
      sfx.villageMelee("dirtBurst");
      return;
    }
    const hug = hit.grab === "squeeze" ? striker.holdPoint?.hug ?? null : null;
    if (hug) {
      const [fx, fy] = cityProject(feet, duel.view);
      this.stagecraft.exchangeFx("hugSqueeze", feet, 0, push, bodyPx, { offsetPx: [hug.x - fx, hug.y - fy] });
    }
    this.clock.stop(blow.stopMs);
    sfx.villageMelee(blow.cue);
    this.voiceBlow(duel.corners.map(corner => corner.id), target, hit.blocked, armored, ko, blow.impact === "light");
    // The hit counters (`CityFightComboCounterView`): a blow that took HP runs the striker's count on, at the edge on his side; the struck's
    if (hit.damage > 0 || ko) {
      const ids = duel.corners.map(corner => corner.id);
      this.sinks.combo.land(ids[1 - target]!, kumaScreenDelta(duel.view.projection, [feet[0] - other[0], feet[1] - other[1]])[0] < 0 ? 1 : -1, ko);
      this.sinks.combo.struck(ids[target]!);
    }
    // A super's contact (2026-10-21, the staged super — the village fighter's, `NativeCityKumaFightCues.strikeLanded`): its letterbox goes and
    // the caster's awakening's staging resolves on it; unguarded, the ground bursts under the struck (not under an awakening that draws its
    const lit = hit.super === true && this.sinks.awakening.lit;
    if (hit.super === true) {
      this.sinks.superFlash.resolve();
      this.sinks.awakening.resolve(hit.blocked, hit.damage, (1 - target) as 0 | 1);
      if (lit && !hit.blocked) this.awakeningNumber(hit.damage, duel.corners[target].id, feet, bodyPx, push, air, ko ? "ko" : "last");
      if (!hit.blocked) {
        if (!lit) this.stagecraft.exchangeFx("superRupture", feet, 0, push, duel.view.actorHeightPx, ARENA_GROUND_BURST);
        if (ko) this.stagecraft.exchangeFx("superCrack", feet, 0.6, push, duel.view.actorHeightPx);
      }
    }
    if (hit.blocked && !ko) {
      victim.showGuard();
      this.stagecraft.guardContact(weapon, feet, bodyPx, push, height, blow.stopMs);
      if (!hit.summon) this.gunImpact(striker, victim, feet, height, bodyPx, push, "light", true);
      return;
    }
    victim.markImpact(blow.impact, armored);
    // The three-hit air combo's third air hit (`airCombo3`, 2026-10-22 5차): held a beat longer, a punch-in.
    if (hit.air === "launch") this.juggles[target] = 0;
    else if (hit.air === "spike") this.juggles[target] = -1;
    else if (hit.air === "juggle" && this.juggles[target] >= 0 && ++this.juggles[target] === 3) {
      const third = ARENA_DUEL_FEEL.thirdJuggle;
      this.clock.stop(blow.stopMs + third.extraStopMs);
      if (!reduced) this.rig.impactZoom(third.zoom, third.riseMs, third.fallMs);
    }
    // A blow on the other's ice (2026-10-22 4차): he slides further — the ice sprays under him.
    if (hit.slip === true) {
      this.traceView?.spray(feet, bodyPx * 0.9);
      sfx.villageMelee("iceSkid");
    }
    // The cross's cut (2026-10-25, `CityFightBoutExchange`): the blade of light across the struck body along the winner's run and a
    // punch-in; the last one also the ink plate's short beat and a slow, the camera held through its freeze.
    if (hit.exchange) {
      const [vx, vy] = cityProject(feet, duel.view), [ox, oy] = duel.arena.line.origin, [dx, dy] = duel.arena.line.direction;
      const strides = duel.arena.stepUnits * ARENA_DUEL_FEEL.cross.slashLengthStrides;
      const lengthPx = Math.abs(cityProject([ox + dx * strides, oy + dy * strides], duel.view)[0] - cityProject([ox, oy], duel.view)[0]);
      this.crossSlash?.slash(vx, vy - height * bodyPx, kumaScreenDelta(duel.view.projection, push)[0] < 0 ? -1 : 1, lengthPx, bodyPx,
        hit.exchange.final, reduced);
      const zoom = hit.exchange.final ? ARENA_DUEL_FEEL.cross.finalPassZoom : ARENA_DUEL_FEEL.cross.passZoom;
      if (!reduced) this.rig.impactZoom(zoom.zoom, zoom.riseMs, zoom.fallMs);
    }
    if (hit.exchange?.final === true) this.cameraHoldMs = blow.stopMs;
    if (hit.exchange?.final === true && !ko) {
      const [x, y] = cityProject(feet, duel.view), screenX = kumaScreenDelta(duel.view.projection, push)[0];
      this.sinks.impactFrame.trigger([x, y - height * bodyPx], screenX < 0 ? -1 : 1, "short", reduced, undefined, bodyPx, target);
      if (!reduced) this.clock.slow(ARENA_DUEL_FEEL.cross.finalSlow);
    }
    const accent = ko ? "ko" : blow.impact === "light" ? null : "heavy";
    // (2026-10-23 arena audit, b03 #176–184: the green burst, the gold spark, "쾅!" and the cream fill four deep). The KO keeps its burst.
    const gun = !hit.summon && striker.gunArmed;
    if (gun) this.gunImpact(striker, victim, feet, height, bodyPx, push, ko || hit.super === true ? "heavy" : blow.impact === "light" ? "light" : "medium", false);
    const ownFx = !ko && !hit.summon && (gun || arenaDuelOwnContactFx(this.ownRules(1 - target) ? this.ownRules(1 - target)!.skinId
      : duel.corners[1 - target]!.id, snapshot.states[1 - target]!.combat));
    this.stagecraft.impactFeel(blow.impact, armored, by, feet, bodyPx, push, height, blow.stopMs, 0, blow.impact !== "light", accent,
      weapon, duel.corners[target].id, false, false, undefined, !lit && !ownFx);
    // Under a lit awakening's contact: no call letter, no KO burst or ink plate (its light speaks) — the KO's slow motion stays.
    if (lit) { if (ko) { this.koCorner = target; this.summonKo(hit, target); if (!reduced) this.clock.slow(); } return; }
    const loud = this.stagecraft.blow.loud;
    // A skill's own call (its clip's `keys.contactLetter`, 2026-10-22: "딱!" / "뿅!" / "쭈욱!"), else the fighter's own on that move
    // (2026-10-23 arena audit: a jab's letter on the face says nothing a heavy's would not).
    // A grab's beat calls its move's own letter on every slap and on the throw (2026-10-24, the kimchi slap's "짝!" / "철퍽!"), light or not.
    const grabCall = this.ownRules(1 - target) && (hit.grab === "squeeze" || hit.grab === "throw") ? arenaDuelGrabLetters(duel.corners[1 - target]!.id)[hit.grab] ?? null : null;
    const grabbed = grabCall !== null && grabCall in KUMA_FIGHT_LETTERS ? grabCall as KumaFightLetterId : null;
    const called = striker.contactLetter ?? (this.ownRules(1 - target) ? fighterContactLetter(duel.corners[1 - target]!.id, arenaDuelMove(snapshot.states[1 - target]!.combat)) : null);
    const own = grabbed ?? (called !== null && called in KUMA_FIGHT_LETTERS ? called as KumaFightLetterId : null);
    const lettered = !ko && !armored && (grabbed !== null || blow.impact !== "light" && (own !== null || loud));
    // A call letter or the KO over a rival's challenge (2026-10-23: "카운터!" landed on his bubble's words): the blow breaks the bubble
    // (`strike`, the village's dodged-blow gag), from the struck's side — at once (`RIVAL_BUBBLE_BREAK_MS`), not after the dodge's shake.
    if ((lettered || ko) && this.talker !== null && this.sinks.foeBubble.visible) {
      const head = this.fighters[this.talker]!.sprite.getBounds().centerX;
      this.sinks.foeBubble.strike(cityProject(feet, duel.view)[0] < head ? -1 : 1, RIVAL_BUBBLE_BREAK_MS);
    }
    if (lettered) {
      this.arenaLetter(own ?? "kwang", target, push, blow.stopMs);
      if (!reduced) this.rig.impactZoom(ARENA_DUEL_FEEL.heavyPunch.zoom, ARENA_DUEL_FEEL.heavyPunch.riseMs, ARENA_DUEL_FEEL.heavyPunch.fallMs);
    }
    if (!ko) return;
    // The KO (the village finisher's beats): no call letter left over the blow, the white-core burst, the full ink impact frame, then the slow.
    this.koCorner = target;
    this.summonKo(hit, target);
    this.sinks.letters.clear();
    const at = this.stagecraft.contactOn(feet, victim.radius, push);
    this.stagecraft.exchangeFx("finisherBurst", at, height, push, bodyPx);
    const [x, y] = cityProject(at, duel.view), screenX = kumaScreenDelta(duel.view.projection, push)[0];
    // Its plate tells the striker (dark) from the struck (gold), and the ink after it is lit at the blow (2026-10-23 arena audit) — a summon's
    // KO centred on the summon (`summonKo`).
    const [px, py] = hit.summon ? cityProject(hit.from, duel.view) : [x, y];
    this.sinks.impactFrame.trigger([px, py - height * bodyPx], screenX < 0 ? -1 : 1, "full", reduced, undefined, bodyPx, target);
    this.ground.koLight({ x, y: y - height * bodyPx, size: bodyPx * ARENA_KO_LIGHT_BODIES });
    if (!reduced) this.clock.slow();
  }

  /**
   * A summon knocked corner `target` out (`ARENA_DUEL_FEEL.summonKo`, 2026-10-23 2차): the KO's push-in leans toward the summon, and the summoner
   * (the other corner) lights up — who won reads off him, not off the thing that landed it.
   */
  private summonKo(hit: CityFightBoutHit, target: 0 | 1): void {
    if (!hit.summon) return;
    this.koFocus = hit.from;
    this.koSummons = { field: this.duel!.session.snapshot.summons, ms: ARENA_DUEL_FEEL.summonKo.ownerLightMs };
    this.fighters[1 - target]?.highlight(ARENA_DUEL_FEEL.summonKo.ownerLightMs);
  }

  /**
   * A blow's comic letter in the AI duel (2026-10-23 arena audit — "떡!", "쭈욱!", "쾅!" sat on the faces, b03's for 470 ms): one at a time
   * (`feel.letters.maxOnScreen`), `overHeadPx` CSS px over the higher of the two heads (kept under the face HUD — `hudFloor`),
   * `outBodies` of the struck's height out past him, at most `maxBodies` of his height tall, held at most `holdMs` and lingering `lingerMs`
   * (about 350 ms in all).
   */
  private arenaLetter(id: KumaFightLetterId, target: number, push: CityPoint, holdMs: number): void {
    const duel = this.duel!, L = ARENA_LETTER, wpp = this.worldPxPerScreenPx(), view = this.worldCamera.worldView;
    const heads = this.fighters.map((fighter, i) => {
      const [x, y] = cityProject(nativeCityKumaFighterPoint(duel.session.snapshot.states[i]!), duel.view), h = duel.view.actorHeightPx * fighter.bodyScale;
      return { x, top: y - (fighter.airBodies + 1) * h, h };
    });
    const struck = heads[target]!, side: -1 | 1 = kumaScreenDelta(duel.view.projection, push)[0] < 0 ? -1 : 1;
    const size = Math.min(sfxLetterSizePx("heavy", struck.h) * KWANG_LETTER.scale, struck.h * L.maxBodies);
    const over = Math.min(...heads.map(head => head.top)) - L.overHeadPx * wpp - size / 2, drift: CityPoint = [side * 0.45, -0.89];
    const halfWidth = size * (this.sinks.letters.aspect(id) ?? L.fallbackAspect) / 2 * L.settleRoom
      + Math.abs(drift[0]) * NATIVE_CITY_COMBAT.feel.letters.driftShare * size + L.edgePx * wpp;
    const out = struck.x + side * struck.h * L.outBodies, x = view.width > 2 * halfWidth
      ? Math.max(view.x + halfWidth, Math.min(view.x + view.width - halfWidth, out)) : view.x + view.width / 2;
    this.sinks.letters.pop({ id, weight: "heavy", at: [x, Math.max(view.y + view.height * this.hudFloor() + size / 2, over)],
      sizePx: size, side, drift, holdMs: Math.min(holdMs, L.holdMs), lingerMs: L.lingerMs });
  }

  /**
   * The face HUD's floor as a share of the view's height (`ArenaFaceHud.floorShare`): the fight's letters (every pop — `SfxLetterView`'s
   * ceiling, the clash's "텅!" and a grab's "덥석!" too), damage numbers and hit counters stand under it.
   */
  private hudFloor(): number {
    return this.faceHud?.floorShare ?? 0;
  }

  /**
   * The striker's blow count in his unbroken string (`ARENA_DUEL_STOPS`), this one counted: a blow more than `stringGapMs` fight ms after his
   * last starts a new one, and a blow on him ends his. A guarded blow neither counts nor breaks.
   */
  private streak(striker: 0 | 1, ms: number, hit: Pick<CityFightBoutHit, "blocked">): number {
    if (hit.blocked) return 0;
    const run = this.streaks[striker], other = this.streaks[1 - striker]!;
    run.n = ms - run.atMs > ARENA_DUEL_STOPS.stringGapMs ? 1 : run.n + 1;
    run.atMs = ms;
    other.n = 0;
    return run.n;
  }


  private gunImpact(striker: NativeCityKumaView, victim: NativeCityKumaView, feet: CityPoint, height: number, bodyPx: number, push: CityPoint,
    tier: GunTier, blocked: boolean): void {
    if (!striker.gunArmed) return;
    const duel = this.duel!, [x, y] = cityProject(feet, duel.view), side = kumaScreenDelta(duel.view.projection, push)[0] < 0 ? -1 : 1;
    striker.gunImpact(x, y - height * bodyPx, side < 0 ? Math.PI : 0, bodyPx, tier, blocked, victim.sprite.depth, this.reducedMotion);
  }


  private followUpBlow(hit: CityFightBoutHit, ko: boolean): void {
    const duel = this.duel!, snapshot = duel.session.snapshot, target = hit.target, victim = this.fighters[target]!, striker = this.fighters[1 - target]!;
    const feet = nativeCityKumaFighterPoint(snapshot.states[target]), other = nativeCityKumaFighterPoint(snapshot.states[1 - target]!);
    const push = planUnit([feet[0] - hit.from[0], feet[1] - hit.from[1]]) ?? planUnit([feet[0] - other[0], feet[1] - other[1]]) ?? duel.arena.line.direction;
    const beat = cityFightAwakening(duel.corners[1 - target]!.id)?.followUp?.beats[hit.followUp!];
    const beats = cityFightAwakening(duel.corners[1 - target]!.id)?.followUp?.beats.length ?? 0;
    const blow = arenaDuelBlow(hit, false, ko), stop = arenaDuelFollowUpStopMs((beat?.hitStopMs ?? 0) * NATIVE_CITY_COMBAT.hitStopScale || blow.stopMs,
      hit.followUp === beats - 1, ko);
    const bodyPx = duel.view.actorHeightPx * victim.bodyScale, by = this.control && target === 0 ? "kuma" as const : "player" as const;
    // Up there with him: the feel at his lifted body (as the village's follow-up blows).
    const air = arenaDuelBlowAirBodies(snapshot, target, victim, bodyPx, ko), height = NATIVE_CITY_COMBAT.feel.fx.contactHeight + air;
    this.clock.stop(stop);
    sfx.villageMelee(blow.cue);
    const ids = duel.corners.map(corner => corner.id);
    this.sinks.combo.land(ids[1 - target]!, kumaScreenDelta(duel.view.projection, [feet[0] - other[0], feet[1] - other[1]])[0] < 0 ? 1 : -1, ko);
    this.sinks.combo.struck(ids[target]!);
    victim.markImpact(blow.impact, false);
    this.stagecraft.impactFeel(blow.impact, false, by, feet, bodyPx, push, height, stop, 0, false, ko ? "ko" : null, striker.weaponImpactKind,
      ids[target], false, false, undefined, false);
    this.gunImpact(striker, victim, feet, height, bodyPx, push, hit.followUp === beats - 1 || ko ? "heavy" : "medium", false);
    this.sinks.awakening.beat(hit.followUp!, hit.damage, (1 - target) as 0 | 1);
    this.awakeningNumber(hit.damage, ids[target]!, feet, bodyPx, push, air, ko ? "ko" : hit.followUp === beats - 1 ? "last" : "beat");
    if (ko) { this.koCorner = target; if (!this.reducedMotion) this.clock.slow(); }
  }

  /**
   * An awakening's blow shows the HP it took (2026-10-23 — user: "대미지를 넣는 시퀀스가 있어야 멋지네"): the village fight's number beside the
   * contact (`NativeCityFloatTextView`), its super's contact and each follow-up beat. The arena's other blows show none. `air`: his body's
   * lift (body heights) — the number sits over his lifted head.
   */
  private awakeningNumber(damage: number, body: string, feet: CityPoint, bodyPx: number, push: CityPoint, air: number,
    weight: "beat" | "last" | "ko"): void {
    // Its size by the blow (2026-10-23 arena audit): a beat of the string light, the super's contact and the last beat heavy, the KO's finisher.
    const number = damage > 0 ? nativeCityEnemyHitNumber({ damage, tier: weight === "ko" ? "ko" : weight === "last" ? "heavy" : "light",
      armored: false }) : null;
    if (!number) return;
    // Over his head, short-lived, each new one pushing the last up (b04 #1538–1560: "2" then "3" on one spot read "23").
    const N = ARENA_AWAKENING_NUMBER, wpp = this.worldPxPerScreenPx(), [x, y] = cityProject(feet, this.duel!.view), view = this.worldCamera.worldView;
    const head = air + 1, side = kumaScreenDelta(this.duel!.view.projection, push)[0] < 0 ? -1 : 1;
    const over = y - head * bodyPx - N.overHeadPx * wpp, floor = view.y + view.height * this.hudFloor() + N.pushRoom * N.pushPx * wpp;
    this.sinks.floats.number(number, { at: [x, Math.max(over, floor)], side, sidePx: over < floor ? bodyPx * N.besideBodies : 0, body,
      scale: ARENA_DUEL_FEEL.awakeningNumberScale, lifeMs: N.lifeMs, pushPx: N.pushPx });
  }


  private awakeningCue(cue: CityFightAwakeningCue, value: number): void {
    if (this.reducedMotion) return;
    const L = CITY_FIGHT_STARFALL;
    if (cue === "lead" && value !== 0) this.impactFeel.kick({ tier: "light", dir: [Math.sign(value), 0], shakePx: 0, shakeMs: 0,
      lead: { px: Math.abs(value), inMs: L.lead.inMs, outMs: L.lead.outMs } });
    else if (cue === "split") this.rig.shakePx(L.rift.shakeMs, L.rift.shakePx, 0);
    // A motif's own beats (`CityFightAwakeningMotif`): a shake of `value` px, a zoom punch of `value` (×, the rig's accent policy).
    else if (cue === "shake" && value > 0) this.rig.shakePx(ARENA_AWAKENING_SHAKE_MS, value, 0.4);
    else if (cue === "punch" && value > 0) this.rig.punch(value, ARENA_AWAKENING_PUNCH_MS);
  }

  /**
   * Two swings met (2026-10-22 5차, `CityFightBoutClash`): neither landed — the clash's freeze, its spark between them, "텅!", the clash shake
   * and the armour's clang; both bodies play their recoil (`parried`, its own length).
   */
  private clash(met: CityFightBoutClash): void {
    const duel = this.duel!, bodies = this.fighters.map(fighter => duel.view.actorHeightPx * fighter.bodyScale), bodyPx = Math.max(...bodies);
    const freeze = nativeCityExchangeHitStopMs("clash");
    const feel = ARENA_DUEL_FEEL.clash, sparkPx = bodyPx * feel.sparkScale;
    this.clock.stop(freeze);
    // At the lower of the two chests (`arenaDuelClashHeightPx` — over a small body it sparked in the air above him, b12 #700).
    const height = arenaDuelClashHeightPx(bodies, NATIVE_CITY_COMBAT.feel.fx.contactHeight) / Math.max(1, sparkPx);
    this.stagecraft.exchangeFx("clashSpark", met.point, height, duel.arena.line.direction, sparkPx);
    this.stagecraft.letter("teong", met.tier === "heavy" ? "heavy" : "light", met.point, bodyPx, null, freeze);
    this.stagecraft.exchangeShake("clash");
    if (!this.reducedMotion) { this.rig.impactZoom(feel.zoom, feel.riseMs, feel.fallMs); this.clock.slow(feel.slowMo); }
    sfx.villageMelee("hitArmored");
  }

  /** One reaction of the corners (`ArenaDuelReactions`): a mark by his head, the slide dust at his feet, a missed swing's wind ahead of him. */
  private react(reaction: ArenaDuelReaction): void {
    const duel = this.duel!, bodyPx = duel.view.actorHeightPx * this.fighters[reaction.corner]!.bodyScale;
    switch (reaction.kind) {
      case "scuff": this.stagecraft.exchangeFx("slideDust", reaction.point, 0, reaction.direction, bodyPx); return;
      case "whiff": {
        this.marks?.pop(reaction.corner, "sweat");
        const d = planUnit(reaction.direction), reach = duel.arena.stepUnits * ARENA_WHIFF_WIND.strides;
        if (d) this.stagecraft.exchangeFx("whiffWind", [reaction.point[0] + d[0] * reach, reaction.point[1] + d[1] * reach], ARENA_WHIFF_WIND.height, d, bodyPx);
        return;
      }
      case "fumed": this.marks?.pop(reaction.corner, "anger"); return;
      case "caught": this.marks?.pop(reaction.corner, "shock"); return;
    }
  }

  /** Corner `i`'s drawn head for his mark (`ArenaReactionMarks`); null while he lies down or is not drawn. */
  private reactionHead(i: number): ArenaReactionHead | null {
    const fighter = this.fighters[i]!, head = fighter.headPoint, other = this.fighters[1 - i]!;
    if (!head || fighter.downMs !== null || !fighter.sprite.visible) return null;
    return { x: head[0], top: spriteInkTopY(fighter.sprite), bodyPx: fighter.drawnBodyPx,
      front: (other.headPoint?.[0] ?? other.sprite.x) >= head[0] ? 1 : -1 };
  }

  /**
   * A body sprang off the rope (2026-10-22 5차, `CityFightBoutBounce` — after its splat, `wall`): the splat's freeze held a beat longer, a
   * punch-in and a sideways shake (the rope's give — the ropes are part of the ring picture, so the camera carries it).
   */
  private bounce(spring: CityFightBoutBounce): void {
    const feel = ARENA_DUEL_FEEL.bounce;
    this.clock.stop(nativeCityWallFreezeMs() + feel.stopMs);
    // The pinball's rope (2026-10-25, `CityFightBoutPinball`): a burst where his back meets it, the dust off his heels.
    const run = this.duel!.session.snapshot.exchange;
    if (run?.kind === "pinball") {
      const duel = this.duel!, bodyPx = duel.view.actorHeightPx * this.fighters[spring.corner]!.bodyScale;
      const back: CityPoint = [duel.arena.line.direction[0] * run.dir, duel.arena.line.direction[1] * run.dir];
      this.stagecraft.exchangeFx("hitBurst", spring.point, NATIVE_CITY_COMBAT.feel.fx.contactHeight, back, bodyPx);
      this.stagecraft.exchangeFx("slideDust", spring.point, 0, [-back[0], -back[1]], bodyPx);
    }
    if (this.reducedMotion) return;
    this.rig.impactZoom(feel.zoom, feel.riseMs, feel.fallMs);
    this.rig.shakePx(feel.shakeMs, feel.shakePx, 0.15);
  }

  /** The penguin's sliding down (`downSlide`): his flight's ground slide leaves ice sprays behind him (`iceTrailEveryMs`). */
  private iceTrails(snapshot: CityFightBoutSession["snapshot"], screenDt: number, stopped: boolean): void {
    const duel = this.duel!;
    snapshot.states.forEach((state, i) => {
      const knock = state.knockback, slide = knock?.slide;
      const sliding = state.combat.mode === "down" && knock && slide && knock.elapsedMs >= slide.afterMs && knock.elapsedMs < slide.afterMs + slide.ms;
      if (!sliding) { this.iceTrailMs[i] = 0; return; }
      if (stopped) return;
      this.iceTrailMs[i]! -= screenDt;
      if (this.iceTrailMs[i]! > 0) return;
      this.iceTrailMs[i] = ARENA_DUEL_FEEL.iceTrailEveryMs;
      this.traceView?.spray(nativeCityKumaFighterPoint(state), duel.view.actorHeightPx * this.fighters[i]!.bodyScale * 0.7);
    });
  }

  /**
   * A body thrown up met the ground (2026-10-22, the air combo — `CityFightBoutAir`): the spike's bounce bursts the ring's floor under him
   * (a freeze, a vertical shake, the ground's rupture), the landing raises the dust ring.
   */
  private airBeat(beat: CityFightBoutAir): void {
    const duel = this.duel!, fighter = this.fighters[beat.corner]!, bodyPx = duel.view.actorHeightPx * fighter.bodyScale;
    const air = duel.rules.air, back: CityPoint = [0, 0];
    if (beat.beat === "bounce") {
      this.clock.stop(nativeCityWallFreezeMs());
      if (!this.duel!.session.snapshot.followUps.some(run => run !== null)) {
        this.stagecraft.exchangeFx("superRupture", beat.point, 0, back, bodyPx, ARENA_GROUND_BURST);
      }
      if (!this.reducedMotion) this.rig.shakePx(260, ARENA_AIR_SHAKE_PX, 0.85);
      sfx.villageMelee("down");
      return;
    }
    if (air) this.clock.stop(air.landHitStopMs * NATIVE_CITY_COMBAT.hitStopScale);
    this.stagecraft.exchangeFx("koDustRing", beat.point, 0, back, bodyPx);
    sfx.villageMelee("down");
  }

  /**
   * A flight splatted on the end of the ring's line (`CityFightBoutWall` — a launch, or the KO blow's flight, 2026-10-20): the village's wall
   * splat (`NativeCityKumaFightCues.wall`) — its freeze on the duel clock, his heavy flash, "쾅!", dust off the rope back along the flight, the
   * sideways jolt and the thud.
   */
  private wall(wall: CityFightBoutWall): void {
    const duel = this.duel!, fighter = this.fighters[wall.corner]!, bodyPx = duel.view.actorHeightPx * fighter.bodyScale;
    const back: CityPoint = [-wall.direction[0], -wall.direction[1]], freeze = nativeCityWallFreezeMs();
    this.clock.stop(freeze);
    fighter.markImpact("heavy", false);
    this.stagecraft.wallSplat(wall.point, back, bodyPx, freeze, KWANG_LETTER);
    sfx.villageMelee("down");
  }

  /**
   * A corner spent his full meter (`CityFightBoutSuper`, 2026-10-20): the village fight's super flash — the duel clock holds `super.flashMs` (the
   * steps wait: the result never changes), the ring under ink, a burst at him, the cut-in band with his body, a glint.
   */
  private superFlash(spent: CityFightBoutSuper): void {
    const duel = this.duel!, snapshot = duel.session.snapshot, i = spent.corner, fighter = this.fighters[i]!;
    const feet = nativeCityKumaFighterPoint(snapshot.states[i]), other = nativeCityKumaFighterPoint(snapshot.states[1 - i]!);
    const toward: CityPoint = [other[0] - feet[0], other[1] - feet[1]];
    this.clock.stop(NATIVE_CITY_COMBAT.super.flashMs);
    this.sinks.letters.clear();
    this.stagecraft.backdrop.superFlash(this.reducedMotion);
    // own motifs round theirs). One that draws its own light keeps the ink bursts off.
    const struck = this.fighters[1 - i]!, who = duel.corners[i].id;
    // A registered fighter has no awakening of the roster's: his own, in his own art and colour (2026-10-28).
    const awakening = cityFightAwakening(who), own = awakening ? null : this.ownAwakening(who);
    const hooks: CityFightAwakeningHooks = {
      target: () => {
        const [x, y] = cityProject(nativeCityKumaFighterPoint(duel.session.snapshot.states[1 - i]!), duel.view);
        return { x, y: y - struck.airBodies * struck.drawnBodyPx, h: struck.drawnBodyPx };
      },
      caster: () => {
        const [x, y] = cityProject(nativeCityKumaFighterPoint(duel.session.snapshot.states[i]), duel.view);
        return { x, y: y - fighter.airBodies * fighter.drawnBodyPx, h: fighter.drawnBodyPx };
      },
      figure: (whose, clip, ms, loop) => (whose === 0 ? fighter : struck).clipFigure(clip, ms, loop),
      cue: (cue, value = 0) => this.awakeningCue(cue, value),
      progress: () => duel.session.snapshot.followUps[i]?.fightMs ?? null,
      downIn: () => cityFightFollowUpDownInMs(duel.session.snapshot.followUps[i] ?? null) };
    const lit = own ? this.sinks.awakening.playOwn(i, own, this.reducedMotion, hooks) : this.sinks.awakening.play(i, awakening, this.reducedMotion, hooks);
    if (!lit) this.stagecraft.exchangeFx("finisherBurst", feet, NATIVE_CITY_COMBAT.feel.fx.contactHeight, toward, duel.view.actorHeightPx * fighter.bodyScale);
    this.sinks.superFlash.play(fighter.sprite, kumaScreenDelta(duel.view.projection, toward)[0] < 0 ? 1 : -1, this.reducedMotion,
      own ? { art: registeredSuperCutInArt(who), name: null } : cityFightSuperCast(localeFor(this), who), { burst: !lit });
    sfx.villageMelee("glint");
    this.voice?.cue(duel.corners[i].id, "line-super", VOICE.super);
  }

  /** A registered fighter's own awakening (`RegisteredAwakeningMotifs` — his super's action, his colour), or null for anyone else. */
  private ownAwakening(who: string): CityFightAwakeningMotif | null {
    if (arenaPlayable(who)?.kind !== "registered") return null;
    const action = registeredAwakeningAction(registeredArenaStyle(who)?.super ?? NATIVE_CITY_COMBAT.super.kumaAction);
    return registeredAwakeningMotif(action, this.accentOf(who));
  }

  /** His accent: his portrait face's most painted vivid colour (a grid of its pixels), else the shared one; read once. */
  private accentOf(who: string): number {
    const known = this.accents.get(who);
    if (known !== undefined) return known;
    const face = registeredArenaFaceArt(who), key = face ? artTextureKey(this, face.key, "decorative") : null, samples: RegisteredAccentSample[] = [];
    if (face && key) {
      const { x, y, side } = face.face, grid = 14;
      for (let row = 0; row < grid; row++) for (let col = 0; col < grid; col++) {
        const pixel = this.textures.getPixel(Math.floor(x + (col + 0.5) * side / grid), Math.floor(y + (row + 0.5) * side / grid), key);
        if (pixel) samples.push({ r: pixel.red, g: pixel.green, b: pixel.blue, a: pixel.alpha });
      }
    }
    const accent = registeredAccent(samples) ?? AWAKENING_COLORS.registered.accent;
    this.accents.set(who, accent);
    return accent;
  }

  /**
   * A contact's voices (`FightVoicePlayer.cue` — the village fight's moments, from what a bout knows): the striker's shout and the struck's
   * grunt; the KO's cry, then the loser's line once he is down and the winner's taunt (his defeat-card line) after it.
   */
  private voiceBlow(ids: readonly string[], target: number, blocked: boolean, armored: boolean, ko: boolean, light: boolean): void {
    const voice = this.voice, striker = ids[1 - target]!, struck = ids[target]!;
    if (!voice || (blocked && !ko)) return;
    voice.cue(striker, light ? "kiai-light" : "kiai-heavy", light ? VOICE.kiai : VOICE.kiaiHeavy);
    if (ko) {
      voice.cue(struck, "ko", VOICE.ko);
      voice.cue(struck, "line-lose", VOICE.line, { delayMs: ARENA_DUEL_VOICE.loseDelayMs, queue: true });
      voice.cue(striker, "line-defeat", VOICE.line, { delayMs: ARENA_DUEL_VOICE.tauntDelayMs, queue: true });
    } else if (!armored) voice.cue(struck, light ? "hurt-light" : "hurt-heavy", VOICE.hurt);
  }

  /** A knocked-down body meets the ground (once a fall): the dust ring where he lies and the thud; the KO's landing shakes the ring too. */
  private landings(): void {
    const duel = this.duel!, snapshot = duel.session.snapshot;
    this.fighters.forEach((fighter, i) => {
      const down = fighter.downMs;
      if (down === null) { this.landed[i] = false; return; }
      if (this.landed[i] || down < fighter.koImpactMs) return;
      this.landed[i] = true;
      const feet = nativeCityKumaFighterPoint(snapshot.states[i]!), other = nativeCityKumaFighterPoint(snapshot.states[1 - i]!);
      const side = Math.sign(cityProject(feet, duel.view)[0] - cityProject(other, duel.view)[0]) || 1;
      this.stagecraft.bodyLanded(feet, side, duel.view.actorHeightPx * fighter.bodyScale, fighter.koGroundOffset, this.koCorner === i);
      sfx.villageMelee("down");
    });
  }

  /**
   * This frame's fight effects on the frame's one effect clock (`CombatFxClock` — frozen through a hit stop): the bodies' travel wake, the
   * swing ribbons, the contact art, the summons, the comic letters, the ink impact frame, the drawn hits, the slow motion's colour and the
   * decisive blows' ink over the ring.
   */
  private effectsFrame(screenDt: number, stopped: boolean, timeScale: number, desaturate: number): void {
    const duel = this.duel!, snapshot = duel.session.snapshot, sinks = this.sinks, reduced = this.reducedMotion;
    const fx = combatFxFrame(screenDt, { hitStopMs: stopped ? 1 : 0, scale: timeScale });
    sinks.combatFx.motionFrame(fx.fightDtMs, this.fighters.map((fighter, i) => {
      const down = fighter.downMs;
      return { id: duel.corners[i]!.id, point: nativeCityKumaFighterPoint(snapshot.states[i]!), airborne: down !== null && down < fighter.koImpactMs,
        knocked: snapshot.states[i]!.knockback !== null, ...(down !== null ? { landOffset: fighter.koGroundOffset, landingHandled: true } : {}) };
    }));
    sinks.combatFx.attackTrails(reduced ? [] : this.fighters.map(fighter => fighter.weaponTrailFrame())
      .filter((trail): trail is NativeCityAttackTrailFrame => trail !== null), reduced);
    sinks.combatFx.frame(fx.screenDtMs, fx.rate, null, null, duel.arena.stepUnits);
    const bodies = duel.corners.map((corner, i) => ({ id: corner.id, along: cityFightSummonAlong(duel.arena.line, nativeCityKumaFighterPoint(snapshot.states[i]!)),
      radius: nativeCityFootprintRadius(corner.footprint, duel.arena.stepUnits) }));
    // The rules stop at the result, so do the summons: they leave the ring with it (a frozen one would hang there) — but the one that knocked
    // him out stays on him through the KO's beat (`summonKo` — what won is on the screen).
    const held = this.koSummons;
    if (held) held.ms -= screenDt;
    const field = !snapshot.result ? snapshot.summons : held && held.ms > 0 ? held.field : EMPTY_CITY_FIGHT_SUMMONS;
    for (const cue of sinks.summons.frame({ field, line: duel.arena.line, bodies, screenDtMs: fx.screenDtMs })) sfx.villageMelee(cue);
    // Under the versus card the airship waits off stage: its READY fly-in is for READY.
    this.airshipFrame(this.picking() ? 0 : screenDt);
    this.traceView?.frame(snapshot.traces, duel.view, duel.arena.line.direction, fx.screenDtMs, reduced);
    sinks.letters.update(screenDt, reduced);
    sinks.impactFrame.update(screenDt);
    sinks.floats.update(screenDt, reduced);
    sinks.combo.update(screenDt, fx.frozen, reduced);
    sinks.superFlash.update(screenDt);
    sinks.awakening.update(screenDt);
    if (this.talker !== null) {
      // Over his head, its body under the face HUD (2026-10-24: a challenge over a tall corner stood 70 px into it — his cell's top).
      const body = this.fighters[this.talker]!.sprite.getBounds();
      const under = cameraShareY(this.worldCamera, this.hudFloor()) + sinks.foeBubble.reachPx;
      sinks.foeBubble.update(screenDt, [body.centerX, Math.max(body.top, under)], reduced);
    }
    // The meters stand under the face HUD's bars (2026-10-23), not in the bottom corners.
    sinks.meters.update(screenDt, null, reduced);
    sinks.hitFx.update(fx.screenDtMs, fx.frozen);
    sinks.screenGrade.frame(screenDt, reduced ? 0 : desaturate);
    const dim = this.stagecraft.backdrop.frame(fx.screenDtMs, fx.frozen);
    this.ground.backdrop((this.ground.nightReady ? sinks.awakening.backdrop() : null) ?? dim, this.worldCamera.worldView);
    this.impactFeel.step(screenDt, null, 0, reduced);
  }

  /** The airship's cue this frame: READY while a village pair's intro is still ahead or holding, the KO's light, else the bout (gone). */
  private airshipFrame(screenDt: number): void {
    const duel = this.duel!, ko = this.koCorner;
    if (ko !== null) this.koScreenMs = (this.koScreenMs ?? 0) + screenDt;
    const winner = ko === null ? null : 1 - ko;
    const cue = winner !== null ? { kind: "ko" as const, ms: this.koScreenMs ?? 0,
      winner: (([x, y]) => ({ x, y }))(cityProject(nativeCityKumaFighterPoint(duel.session.snapshot.states[winner]!), duel.view)),
      bodyPx: duel.view.actorHeightPx * this.fighters[winner]!.bodyScale }
      : !this.introDone ? { kind: "ready" as const } : { kind: "fight" as const };
    this.airship?.frame(cue, this.worldCamera.worldView, this.scale.width, screenDt);
  }

  /**
   * What corner `i` plays over his stand (2026-10-22 4차, ODDBOUT — `NativeCityKumaView.stageClip`; a pack without the clip draws on): his
   * entrance while READY → FIGHT! plays, his victory loop once the airship comes back for the winner (`ARENA_VICTORY_AFTER_MS`) unless he is
   * down — drawn where it began (the epilogue's walk home is not drawn under it).
   */
  private stagedClip(i: number): NativeCityKumaStagedClip | null {
    if (this.intro && !this.introDone && this.introMs > 0) return { clip: "entrance", ms: this.introMs };
    // His awakening's acting (`CityFightAwakeningMotif.casterClip`): his own clip over the rules' stand while he casts it — the KO's victory
    // takes over once it is due.
    const acting = this.sinks.awakening.casterClip(i as 0 | 1);
    const ko = this.koCorner, since = this.koScreenMs;
    if (ko === null || i === ko || since === null || since < ARENA_VICTORY_AFTER_MS) return acting;
    const winner = this.duel!.session.snapshot.states[i]!.combat;
    return winner.mode === "down" || winner.mode === "getup" ? acting : { clip: "victory", ms: since - ARENA_VICTORY_AFTER_MS, loop: true };
  }

  /**
   * 승자 찍기: the versus card over the ring before READY (a shared bout not picked yet); the bout waits while it is up — its seed is fixed, so
   * waiting changes nothing. Returns whether it holds the fight this frame (READY → FIGHT! starts the frame it has gone).
   */
  private stepPick(dt: number): boolean {
    const card = this.pick?.card;
    if (!card || !this.started || this.failed) return false;
    if (!card.open && !card.closed) card.show(this.pickContent(), this.reducedMotion);
    card.update(dt);
    if (!card.closed) return true;
    card.destroy(); this.pick!.card = null;
    return false;
  }
  /** The versus card is up (or still going): the face HUD, the seconds and the status icons wait for it, as they do for READY → FIGHT!. */
  private picking(): boolean { return this.pick?.card?.open === true; }
  private pickContent(): ArenaVersusCardContent {
    const locale = localeFor(this), { a, b } = this.dataIn;
    // Not the bout that was shared (the rules changed since): a tag on the title, no sentence.
    const title = t(locale, "arena.duel.pickTitle") + (this.sharedAhead === "changed" ? ` · ${t(locale, "arena.duel.sharedNewRules")}` : "");
    const art = (id: string): ArenaVersusCardArt | null => {
      const concept = arenaConceptArt(id, null);
      return concept && artTextureKey(this, concept.key, "decorative") !== null ? { key: concept.key, width: concept.width, height: concept.height } : null;
    };
    return { title, names: [arenaPlayerName(a, locale), arenaPlayerName(b, locale)], art: [art(a), art(b)] };
  }
  /** The keys and the pad on the versus card: 1 · 2 take a corner, ← → move the cursor, 확인 takes the one under it, 뒤로 leaves. */
  private pickInput(input: MenuInput<ArenaDuelMenuAction>): void {
    const card = this.pick?.card;
    if (!card) return;
    if (input.actions.includes("pickA")) this.takePick(0, true);
    else if (input.actions.includes("pickB")) this.takePick(1, true);
    else if (input.nav.left) card.focus(0);
    else if (input.nav.right) card.focus(1);
    else if (input.nav.confirm) { if (card.focused !== null) this.takePick(card.focused, true); }
    else if (input.nav.back) this.leave();
  }
  /**
   * He backs `corner`: the card takes it (once) and the pick is kept before the bout starts. The kept pick is his corner from then on — a link
   * picked meanwhile in another tab keeps that tab's first pick, and this screen follows it.
   */
  private takePick(corner: 0 | 1, keyed: boolean): void {
    const pick = this.pick;
    if (!pick?.card?.choose(corner, keyed)) return;
    const kept = pickArenaBout(loadArenaPicks(), pick.key, corner, Date.now());
    saveArenaPicks(kept);
    pick.corner = arenaPickOf(kept, pick.key)?.pick ?? corner;
  }
  /**
   * Leaving a shared bout he picked before its end (나가기, 뒤로): the rest is fought out headless and his pick settled — the seed has fixed the
   * result, so walking out on a bout going the wrong way does not keep the run (`arenaPickStreak`). The same session steps in the same order as
   * on screen (the screen only waits between steps). Nothing else is recorded: not his practice book, he did not watch it to the end.
   */
  private settleLeftPick(): void {
    const pick = this.pick, duel = this.duel;
    if (!pick || pick.corner === null || !duel || !this.started || this.failed || this.recorded) return;
    const session = duel.session, steps = Math.ceil(duel.rules.limitMs / duel.rules.dtMs) + 1;
    for (let i = 0; session.snapshot.result === null && i < steps; i++) session.step(undefined);
    const result = session.snapshot.result;
    if (result) saveArenaPicks(settleArenaPick(loadArenaPicks(), pick.key, result.winner));
  }
  /**
   * The result card's pick line: 맞혔다 (with the run of hits when this settled it and it is two or more) or 빗나갔다, judged by the bout
   * just played; the pick is settled once (a link opened again shows the line, the run stays as it was). Empty for no pick.
   */
  private pickLine(result: CityFightBoutResult, locale: Locale): string {
    const pick = this.pick;
    if (!pick || pick.corner === null) return "";
    // Judged on the kept pick (another tab may have kept its own first).
    const before = loadArenaPicks(), entry = arenaPickOf(before, pick.key), settling = entry?.hit === null;
    const after = settling ? settleArenaPick(before, pick.key, result.winner) : before;
    if (settling) saveArenaPicks(after);
    if ((entry?.pick ?? pick.corner) !== result.winner) return `\n${t(locale, "arena.duel.pickMiss")}`;
    const streak = settling ? arenaPickStreak(after) : 0;
    return `\n${streak >= 2 ? t(locale, "arena.duel.pickHitStreak", { n: streak }) : t(locale, "arena.duel.pickHit")}`;
  }

  /**
   * READY → FIGHT! before a village pair's bout (the village fight's letters, `CombatIntroView`); the bout waits while it holds. The confirm
   * key or a click skips it. Returns whether it holds the fight this frame.
   */
  private stepIntro(dt: number): boolean {
    if (!this.started || this.introDone || this.failed) return false;
    const encounter = CITY_KUMA_ENCOUNTER;
    if (!this.intro) this.intro = { director: new CombatIntroDirector("full", this.reducedMotion, false, encounter.tuning), view: null };
    const intro = this.intro, sound = this.introSound;
    const ready = this.introLetters().every(letter => artTextureKey(this, letter.key, "decorative") !== null) && (sound?.ready ?? true);
    for (const cue of intro.director.update(dt, ready)) sound?.play(cue);
    for (const letter of intro.director.consumeImpacts()) {
      const stamp = encounter.tuning.intro.stamps[letter];
      this.rig.shakePx(stamp.worldShakeMs, stamp.worldShakePx, 0.7);
    }
    if (intro.director.phase !== "load" && !intro.view && intro.director.active) {
      intro.view = new CombatIntroView(new CombatOverlayStage(this, this.fixedSpace, ARENA_DEPTHS.overlay, encounter.tuning), {
        encounter, director: intro.director, locale: localeFor(this),
        skipLabel: confirmKeycapLabel(this.inputContext.activeDevice === "gamepad" ? "gamepad" : "keyboard"),
        onSkip: () => { if (intro.director.skip()) intro.view?.render(); } });
    }
    intro.view?.render();
    if (intro.director.phase !== "load") this.introMs += dt;
    const holds = intro.director.holdsFight;
    if (!intro.director.active) { intro.view?.destroy(); this.intro = null; this.introDone = true; this.sayRivalChallenge(); }
    return holds;
  }


  private sayRivalChallenge(): void {
    const ids = this.duel!.corners.map(corner => corner.id);
    this.talker = null;
    // A registered fighter's own challenge (2026-10-27, `profile.lines.challenge`) first: what his creator gave him to say.
    for (const i of [0, 1] as const) {
      const own = registeredArenaLines(ids[i]!)?.challenge;
      if (!own) continue;
      this.sinks.foeBubble.say(own, RIVAL_LINE_MS);
      this.talker = i;
      return;
    }
    for (const i of [0, 1] as const) {
      const line = NATIVE_CITY_FIGHTERS.find(fighter => fighter.id === ids[i])?.lines.against?.[ids[1 - i]!];
      if (!line) continue;
      this.sinks.foeBubble.say(t(localeFor(this), line), RIVAL_LINE_MS);
      this.voice?.line(line, ids[i]);
      this.talker = i;
      return;
    }
  }

  /** The drawn KO letter in this locale (the winner's card stamps it; absent: the card writes "KO"). */
  private koLetter(): { readonly key: string; readonly path: string }[] {
    return arenaDuelKoLetter(localeFor(this));
  }





  /** The winner's card for `result` (`FightWinnerCard`): his picture and the KO letter when they are in. */
  private showWinner(result: CityFightBoutResult, name: string): void {
    const locale = localeFor(this), id = result.winner === 0 ? this.dataIn.a : this.dataIn.b;
    // A registered winner's own win line (2026-10-27, `profile.lines.win`), else a registered loser's loss line, in the bubble over him.
    const win = registeredArenaLines(id)?.win, lose = registeredArenaLines(result.winner === 0 ? this.dataIn.b : this.dataIn.a)?.lose;
    const spoken = win ? { line: win, corner: result.winner } : lose ? { line: lose, corner: 1 - result.winner } : null;
    if (spoken) { this.sinks.foeBubble.say(spoken.line, RIVAL_LINE_MS); this.talker = spoken.corner as 0 | 1; }
    const art = arenaConceptArt(id, null), letter = result.how === "ko" ? this.koLetter()[0] ?? null : null;
    const loaded = (key: string) => artTextureKey(this, key, "decorative") !== null;
    const size = (key: string) => { const frame = this.textures.getFrame(key); return { width: frame.width, height: frame.height }; };
    if (result.how === "ko" && this.koCutIn) {
      this.koCutIn.show({ winner: result.winner, name, winnerPicture: this.facePicture(result.winner), loserPicture: this.facePicture(result.winner === 0 ? 1 : 0) },
        this.reducedMotion);
      sfx.stampThud();
      return;
    }
    this.winnerCard.show({ side: result.winner, name,
      how: result.how === "ko" ? "KO" : t(locale, "arena.duel.decision"),
      art: art && loaded(art.key) ? { key: art.key, width: art.width, height: art.height } : null,
      koLetter: letter && loaded(letter.key) ? { key: letter.key, ...size(letter.key) } : null }, this.reducedMotion);
  }

  /** READY / FIGHT!'s drawn letters in this locale (absent ones bake in the code font). */
  private introLetters(): { readonly key: string; readonly path: string }[] {
    return arenaDuelIntroLetters(localeFor(this));
  }


  /** The duel camera's frame (`ArenaDuelCamera`) with the blows' kick on it, handed to the rig (its shake and punch on top). */
  private frameCamera(dtMs: number): void {
    this.worldCamera.setSize(this.scale.width, this.scale.height);
    // The cross's last blow (2026-10-25 game-animator review): the frame holds through its freeze — the flight's framing after it.
    const hold = this.cameraHoldMs > 0;
    this.cameraHoldMs = Math.max(0, this.cameraHoldMs - dtMs);
    this.rig.setBase(nativeCityImpactKickFrame(this.cameraFrame(hold ? 0 : dtMs), this.impactFeel.camera, this.cssPerCanvasPx()));
    this.rig.update(dtMs);
  }

  private cameraFrame(dtMs: number) {
    const duel = this.duel!, snapshot = duel.session.snapshot, fit = nativeCityCameraFrame(this.scale.width, this.scale.height, duel.view);
    const feet = [0, 1].map(i => cityProject(nativeCityKumaFighterPoint(snapshot.states[i]!), duel.view)) as [CityPoint, CityPoint];
    const ko = this.koCorner;
    // Each body's drawing over its own feet, read off its art (`FrameInkTop` — a cell's box adds the room over the head).
    // The whole move's tallest cell (its sheet's), so the frame eases out as the move starts, not when its highest cell shows; and his own
    const reaches = this.fighters.flatMap((fighter, i) => fighter.sprite.visible ? [feet[i]![1] - spriteInkTopY(fighter.sprite, true),
      ...fighter.moveFxSprites.filter(fx => fx.visible && fx.alpha > 0.05).map(fx => feet[i]![1] - spriteInkTopY(fx))] : []);
    const reachPx = this.drawnReach.update(dtMs, reaches, this.reducedMotion);
    return this.duelCamera.frame({ feet, tallPx: duel.view.actorHeightPx * Math.max(1, ...this.fighters.map(fighter => fighter.bodyScale)),
      fitZoom: fit.zoom * NATIVE_CITY_ZOOM_STYLE.default, screen: this.scale, reducedMotion: this.reducedMotion,
      koVictimX: ko === null ? null : this.koFocus ? cityProject(this.koFocus, duel.view)[0] : feet[ko][0],
      airPx: Math.max(0, ...this.fighters.map(fighter => fighter.airPeakBodies * fighter.drawnBodyPx)),
      lifts: [this.fighters[0]?.drawnLiftPx ?? 0, this.fighters[1]?.drawnLiftPx ?? 0], topShare: this.hudFloor(), reachPx,
      laneX: this.exchangeLane(feet) }, dtMs);
  }

  /** The cross's lane to frame (world px x — `ARENA_DUEL_FEEL.cross.laneStrides` each side of the pair's middle) while it runs, else null. */
  private exchangeLane(feet: readonly [CityPoint, CityPoint]): readonly [number, number] | null {
    const duel = this.duel!, run = duel.session.snapshot.exchange;
    if (!run) return null;
    const { origin: [ox, oy], direction: [dx, dy], min, max } = duel.arena.line;
    // The pinball: from the striker to the rope he throws the other at (the thrown body flying out and back stays in frame).
    if (run.kind === "pinball") {
      const end = run.dir === 1 ? max : min, rope = cityProject([ox + dx * end, oy + dy * end], duel.view)[0], striker = feet[run.striker][0];
      return [Math.min(rope, striker), Math.max(rope, striker)];
    }
    const stride = duel.arena.stepUnits * ARENA_DUEL_FEEL.cross.laneStrides;
    const half = Math.abs(cityProject([ox + dx * stride, oy + dy * stride], duel.view)[0] - cityProject([ox, oy], duel.view)[0]);
    const middle = (feet[0][0] + feet[1][0]) / 2;
    return [middle - half, middle + half];
  }

  /**
   * The cross's beats on screen (2026-10-25, `CityFightBoutExchange`): its crouch lights both pairs of eyes under a short slow, and so does the
   * standoff before its last pass; each run kicks up dust off the mark and each brake in front of him. A pass with a winner lands its blow at
   * contact (`blow` — the cut, its freeze and punch-in); a tie only sparks where they crossed.
   */
  /**
   * The rush's beats (2026-10-25, `CityFightBoutRush` — a power struggle): a spark where the fists meet each blow — between them while they
   * struggle, on the loser's guard once he is pushed (his heels dragging dust); a light shake every other one. The clash that began it had the
   * big spark.
   */
  private rushCues(run: Extract<NonNullable<CityFightBoutSession["snapshot"]["exchange"]>, { kind: "rush" }>,
    snapshot: CityFightBoutSession["snapshot"]): void {
    const seen = this.exchangeSeen?.seq === run.seq ? this.exchangeSeen : (this.exchangeSeen = { seq: run.seq, passed: 0, phases: ["", ""], standoff: false });
    if (run.beats <= seen.passed || run.finalAtMs !== null) return;
    seen.passed = run.beats;
    const duel = this.duel!, feet = [0, 1].map(i => nativeCityKumaFighterPoint(snapshot.states[i]!)) as [CityPoint, CityPoint];
    const bodies = this.fighters.map(fighter => duel.view.actorHeightPx * fighter.bodyScale), sparkPx = Math.max(...bodies) * ARENA_DUEL_FEEL.rush.sparkScale;
    const height = arenaDuelClashHeightPx(bodies, ARENA_DUEL_FEEL.rush.sparkHeight) / Math.max(1, sparkPx);
    const loser = (1 - run.winner) as 0 | 1, along: CityPoint = [duel.arena.line.direction[0] * run.dir, duel.arena.line.direction[1] * run.dir];
    // Each one's fist (his drawn reach toward the other): the spark between the two, or on the winner's once he pushes.
    const fist = (i: 0 | 1): CityPoint => {
      const toward = i === run.winner ? 1 : -1, reach = run.fists[i] * duel.arena.stepUnits * toward;
      return [feet[i][0] + along[0] * reach, feet[i][1] + along[1] * reach];
    };
    const pushing = cityFightRushPushing(run), [a, b] = [fist(0), fist(1)];
    const at: CityPoint = pushing ? fist(run.winner) : [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    this.stagecraft.exchangeFx("clashSpark", at, height, along, sparkPx);
    if (pushing) this.stagecraft.exchangeFx("slideDust", feet[loser], 0, along, bodies[loser]);
    if (!this.reducedMotion && run.beats % 2 === 0) this.rig.shakePx(ARENA_DUEL_FEEL.rush.shakeMs, ARENA_DUEL_FEEL.rush.shakePx, 0);
    if (run.beats % 2 === 0) sfx.villageMelee("hit");
  }

  /**
   * The pinball's ropes this frame (`ArenaPinballRopeView`): the corner post at the end its thrown body flies to (the post nearer that end of
   * the stage line on screen), his middle as drawn, and whether he is on the ropes; null while no pinball runs.
   */
  private pinballRopeState(snapshot: CityFightBoutSession["snapshot"]): ArenaPinballRopeState | null {
    const run = snapshot.exchange, ropes = this.ground.ropes, duel = this.duel!;
    if (run?.kind !== "pinball" || !ropes) return null;
    const { line } = duel.arena, end = run.dir > 0 ? line.max : line.min;
    const [x] = cityProject([line.origin[0] + line.direction[0] * end, line.origin[1] + line.direction[1] * end], duel.view);
    const thrown = (1 - run.striker) as 0 | 1, body = this.fighters[thrown]!;
    const [, feet] = cityProject(nativeCityKumaFighterPoint(snapshot.states[thrown]), duel.view);
    return { post: Math.abs(x - ropes.faces[0]) <= Math.abs(x - ropes.faces[1]) ? 0 : 1, bodyY: feet - body.drawnBodyPx * 0.5,
      pressed: run.flight === "rope" };
  }

  private exchangeCues(snapshot: CityFightBoutSession["snapshot"]): void {
    const run = snapshot.exchange, duel = this.duel!;
    // (The pinball's beats are its blows and the rope's springs — `blow`, `bounce`.)
    if (run?.kind === "rush") { this.rushCues(run, snapshot); return; }
    if (!run || run.kind !== "cross") { this.exchangeSeen = null; return; }
    const feel = ARENA_DUEL_FEEL.cross, feet = [0, 1].map(i => nativeCityKumaFighterPoint(snapshot.states[i]!)) as [CityPoint, CityPoint];
    const bodies = this.fighters.map(fighter => duel.view.actorHeightPx * fighter.bodyScale), bodyPx = Math.max(...bodies);
    const glint = () => feet.forEach((at, i) => {
      const toward = planUnit([feet[1 - i]![0] - at[0], feet[1 - i]![1] - at[1]]) ?? duel.arena.line.direction, ahead = duel.arena.stepUnits * feel.glintAheadStrides;
      this.stagecraft.exchangeFx("eyeGlint", [at[0] + toward[0] * ahead, at[1] + toward[1] * ahead], feel.glintHeight, toward, bodies[i]);
    });
    if (this.exchangeSeen?.seq !== run.seq) {
      this.exchangeSeen = { seq: run.seq, passed: 0, phases: ["set", "set"], standoff: false };
      glint();
      if (!this.reducedMotion) this.clock.slow(feel.startSlow);
    }
    const seen = this.exchangeSeen;
    // The standoff before the last pass: the eyes again, a held breath.
    if (!seen.standoff && run.passed === run.passes - 1 && run.corners.every(c => c.phase === "turn")) {
      seen.standoff = true;
      glint();
      if (!this.reducedMotion) this.clock.slow(feel.startSlow);
    }
    // Off the mark (dust behind him) and into a brake (dust ahead of him).
    run.corners.forEach((c, i) => {
      const was = seen.phases[i]!;
      seen.phases[i] = c.phase;
      if (was === c.phase || c.phase !== "run" && c.phase !== "turn" && c.phase !== "skid") return;
      const along: CityPoint = [duel.arena.line.direction[0] * c.dir, duel.arena.line.direction[1] * c.dir];
      this.stagecraft.exchangeFx("slideDust", feet[i]!, 0, c.phase === "run" ? [-along[0], -along[1]] : along, bodies[i]);
    });
    if (run.passed <= seen.passed) return;
    seen.passed = run.passed;
    const pass = run.passed - 1, winner = run.lead?.pass === pass ? run.lead.winner : null;
    if (winner !== null) return;
    // A tie: only the sparks where they crossed (a pass with a winner lands its blow at contact — `blow`).
    const at: CityPoint = [(feet[0][0] + feet[1][0]) / 2, (feet[0][1] + feet[1][1]) / 2], sparkPx = bodyPx * feel.sparkScale;
    const height = arenaDuelClashHeightPx(bodies, NATIVE_CITY_COMBAT.feel.fx.contactHeight) / Math.max(1, sparkPx);
    this.clock.stop(feel.passStopMs);
    this.stagecraft.exchangeFx("clashSpark", at, height, duel.arena.line.direction, sparkPx);
    sfx.villageMelee("hitArmored");
  }



  private faceArt(_corner: 0 | 1, id: string): ArenaConceptArt | null {
    return arenaFaceArt(id) ?? registeredArenaFaceArt(id);
  }

  private facePicture(corner: 0 | 1): ArenaFacePicture {
    const id = corner === 0 ? this.dataIn.a : this.dataIn.b;
    const sheet = this.faceSheet(corner);
    if (sheet) return { kind: "sheet", sheet };
    const art = this.faceArt(corner, id);
    return art ? { kind: "card", art } : null;
  }
  private faceSheet(corner: 0 | 1): ArenaFaceSheet | null {
    return arenaDuelFaceSheet(this, this.corners, this.dataIn, corner);
  }


  private cssPerCanvasPx(): number { return Math.max(1, this.scale.displaySize.width) / Math.max(1, this.scale.width); }
  private worldPxPerScreenPx(): number { return 1 / (this.cssPerCanvasPx() * Math.max(1e-6, this.worldCamera?.zoom ?? 1)); }

  /**
   * The person's hands this frame (`ArenaDuelControl`): read into the control while the bout runs, cleared while it holds or is over. Null when
   * nobody plays (an AI duel) or the AI plays his corner — a key or button touched then takes it back (`auto` off).
   */
  private handsFrame(holding: boolean, fightDt: number): ArenaDuelControl | null {
    const control = this.control, keys = this.keys;
    if (!control || !keys) return null;
    const read = arenaDuelHands(keys, key => Phaser.Input.Keyboard.JustDown(key as Phaser.Input.Keyboard.Key), this.menu.pad, playerSettingsFor(this));
    const hands = this.justResumed ? { ...read, press: null } : read;
    this.justResumed = false;
    // Only a new press takes the corner back: a walk or guard still held when the AI took it over leaves it with the AI. What is held is
    // read through a pause too (a key first held in it is not new after it).
    const before = this.heldBefore, fresh = hands.press !== null || (hands.left && !before.left) || (hands.right && !before.right)
      || (hands.guard && !before.guard);
    this.heldBefore = { left: hands.left, right: hands.right, guard: hands.guard };
    if (holding) { control.clear(); return this.auto ? null : control; }
    if (this.auto && fresh) this.auto = false;
    // The buffer ages on the fight clock: a freeze (a contact's hit stop, the super's flash) does not age a press (the village fight's rule).
    control.frame(hands, fightDt);
    return this.auto ? null : control;
  }

  /** The played corner's side of his opponent on the screen: -1 left of him, +1 right of him. */
  private playerSide(): -1 | 1 {
    const duel = this.duel!, [a, b] = duel.session.snapshot.states.map(state => cityProject(nativeCityKumaFighterPoint(state), duel.view));
    return a![0] <= b![0] ? -1 : 1;
  }

  /** 판 끝: 이 판의 종류(`arenaDuelMode`) 하나로 기록·전송·돌아갈 곳을 정한다. */
  private finish(result: CityFightBoutResult): void {
    const mode = arenaDuelMode(this.dataIn, this.builtIn);
    if (mode.kind === "broadcast") {
      this.finishBuiltIn(result);
      mode.broadcast.onResult(result);
      return;
    }
    switch (mode.kind) {
      case "cup": this.finishCup(result, mode.cup); return;
      case "replay": this.finishReplay(result, mode.replay); return;
      case "tournament": this.finishTournament(result, mode.entry); return;
      case "practice": this.finishPlayed(result); return;
      case "exhibition": this.finishBuiltIn(result); return;
      case "registered": this.finishRegistered(result, mode.server); return;
    }
  }
  /** 등록 선수끼리의 대결 끝: 두 선수의 기록(서버 판이면 서버의 결과로), 그다음 서버 순위가 오면 그 줄로 바꾼다. */
  private finishRegistered(bout: CityFightBoutResult, server: ServerDuelMatch | null): void {
    const a = arenaPlayable(this.dataIn.a), b = arenaPlayable(this.dataIn.b);
    if (a?.kind !== "registered" || b?.kind !== "registered") { this.failed = true; return; }
    // The server already computed and committed this match. A replay mismatch never overwrites its result.
    const { result, matches, atMs } = arenaServerDuelResult(bout, server, Date.now());
    const book = recordBout({ at: atMs, mode: "duel", player: a.id, opponent: b.id, won: result.winner === 0, how: result.how,
      duel: { id: this.dataIn.matchId, seed: this.dataIn.seed, hashes: [a.manifestSha256, b.manifestSha256], digest: result.digest } });
    this.recorded = true;
    const locale = localeFor(this), winner = result.winner === 0 ? a : b;
    const tally = (id: string) => t(locale, "arena.select.record", { ...boutRecordTally(book, id) });
    this.showWinner(result, winner.name);
    // Both records under the winner; the server's ranks replace them once they come. Only a mismatch or a failed lookup adds a line.
    const local = `${a.name} · ${tally(a.id)}\n${b.name} · ${tally(b.id)}`, mismatch = matches ? "" : `\n${t(locale, "arena.duel.replayMismatch")}`;
    this.resultText.setText(local + mismatch);
    if (server) {
      const scope = this.scope;
      void fetchFighterRankings().then(rows => {
        if (!scope.alive) return;
        const line = (id: string, name: string) => { const row = rows.find(row => row.id === id);
          return `${name} · ${row ? t(locale, "arena.duel.rankedRecord", { rank: row.rank, won: row.won, lost: row.lost }) : t(locale, "arena.duel.rankFailed")}`; };
        this.resultText.setText(`${line(a.id, a.name)}\n${line(b.id, b.name)}${mismatch}`);
      }).catch(() => { if (scope.alive) this.resultText.setText(`${local}${mismatch}\n${t(locale, "arena.duel.rankFailed")}`); });
    }
  }
  /** A played practice bout's end: the winner's card, and the bout in the guest's record (`BoutRecord`) as a practice bout. */
  private finishPlayed(result: CityFightBoutResult): void {
    this.recorded = true;
    const locale = localeFor(this), { a, b } = this.dataIn;
    const book = recordBout({ at: Date.now(), mode: "exhibition", player: a, opponent: b, won: result.winner === 0, how: result.how });
    this.showWinner(result, arenaPlayerName(result.winner === 0 ? a : b, locale));
    // A shared bout's pick comes first (the viewer backed a corner; the record is corner a's practice book).
    const record = `${arenaPlayerName(a, locale)} · ${t(locale, "arena.select.record", { ...boutRecordTally(book, a) })}`;
    this.resultText.setText(`${this.pickLine(result, locale)}\n${record}${this.sharedRulesLine(locale, result)}`.trimStart());
  }
  /**
   * A shared bout that was not the one shared: one line. A link with the bout's digest knows (`arenaSharedBoutVerdict` — the rules changed,
   * or another device parted ways); an old link without it only says its rules changed and the result may differ. The same bout: nothing.
   */
  private sharedRulesLine(locale: Locale, result: CityFightBoutResult): string {
    const shared = this.dataIn.shared, verdict = shared ? arenaSharedBoutVerdict(shared, result.digest) : "same";
    return verdict === "changed" ? `\n${t(locale, "arena.duel.sharedBoutChanged")}`
      : verdict === "maybe" ? `\n${t(locale, "arena.duel.sharedRulesChanged")}` : "";
  }
  /**
   * A shared link fought under other rules and carrying its digest: the same bout off the screen, its digest set against the link's — the
   * versus card can tell before READY. The same inputs as the bout on screen (`createBuiltInArenaDuel`), so the same steps. Once per link,
   * as `settleLeftPick` fights the rest of a bout at once.
   */
  private sharedBoutAhead(): ArenaSharedBoutVerdict | null {
    const shared = this.dataIn.shared;
    // Only for the versus card (a link not picked yet): the end line judges by the bout's own digest anyway, and the pre-run costs a whole
    // bout on the main thread (about 60 ms on a desktop).
    if (!this.builtIn || !shared?.digest || !arenaSharedBoutRulesChanged(shared.rules) || this.pick?.corner !== null) return null;
    try {
      const { session, rules } = createBuiltInArenaDuel(this.dataIn.a, this.dataIn.b, this.dataIn.seed, this.control !== null,
        registeredCupFighter);
      const steps = Math.ceil(rules.limitMs / rules.dtMs) + 1;
      for (let i = 0; session.snapshot.result === null && i < steps; i++) session.step(undefined);
      return arenaSharedBoutVerdict(shared, session.snapshot.result?.digest ?? null);
    } catch { return null; }
  }
  /**
   * A played tournament bout's end: the result into the bracket (the round's other matches fought headless on the fighters' packs, as the
   * arena's bout records it — `recordPlayerBout` with the whole entry as the key), the prize, the guest's record; the winner's card meanwhile.
   */
  private finishTournament(result: CityFightBoutResult, entry: NonNullable<ArenaDuelData["tournament"]>["entry"]): void {
    this.recorded = true;
    const locale = localeFor(this), { a, b } = this.dataIn, won = result.winner === 0;
    this.showWinner(result, result.winner === 0 ? t(locale, "arena.tournament.youAs", { name: arenaPlayerName(a, locale) }) : arenaPlayerName(b, locale));
    this.resultText.setText("");
    // 나가기 waits for it and carries its prize to the bracket (`leave`).
    this.recording = this.recordTournament(won, result.how, entry);
  }
  /** The player's tournament result into the bracket and the guest's record; the prize it paid (0 on a failure — it never holds the arena). */
  private async recordTournament(won: boolean, how: "ko" | "decision" | "forfeit", entry: NonNullable<ArenaDuelData["tournament"]>["entry"]): Promise<number> {
    // The bout's corners now: the scene may start another bout before the art comes in.
    const { a, b } = this.dataIn;
    return recordArenaTournamentBout({ player: a, opponent: b, won, how }, entry, this.duel!.view.actorHeightPx, "arena-duel");
  }
  /**
   * A cup bout's end (2026-10-24, 5단계): the winner's card, and the result into the cup by its key — the same seed and corners as the headless
   * result, so it is the bracket's result (a key another tab has played meanwhile records nothing) — and into the guest's record as a cup bout
   * (6단계). A watched final records nothing (it was decided already).
   */
  private finishCup(result: CityFightBoutResult, cup: NonNullable<ArenaDuelData["cup"]>): void {
    this.recorded = true;
    const locale = localeFor(this), key = cup.key, winner = result.winner === 0 ? key.a : key.b;
    this.showWinner(result, arenaPlayerName(winner, locale));
    this.resultText.setText("");
    if (cup.watch) return;
    const { gold } = recordArenaCupResult(key, winner, result.how);
    this.dropGold(gold, winner === currentArenaCup().cup?.representative, result.winner === 0 ? 1 : 0);
  }
  /**
   * The bout's gold as coins (G3 — docs/Plan/2026-10-27-oddbout-cup-champion-and-gold): from the loser's feet once the winner's card stands,
   * bounced, then sucked up to the bar's counter (a lost bout's three coins rise quietly from his own). Claimed in the same call as the payment
   * so the counter waits for them; leaving hands the rest over at once. Reduced motion: none — the counter counts by itself.
   */
  private dropGold(gold: number, won: boolean, loser: 0 | 1): void {
    const delivery = this.reducedMotion ? null : claimOddboutGold(gold);
    if (!delivery) return;
    const duel = this.duel!, [wx, wy] = cityProject(nativeCityKumaFighterPoint(duel.session.snapshot.states[loser]), duel.view);
    const camera = this.worldCamera, view = camera.worldView, perCanvasPx = this.space.width / Math.max(1, camera.width);
    const w = this.space.width, h = this.space.height;
    const from = { x: Math.min(w - 24, Math.max(24, (wx - view.x) * camera.zoom * perCanvasPx)),
      y: Math.min(h - 12, Math.max(h * 0.4, (wy - view.y) * camera.zoom * perCanvasPx)) };
    const drop = new ArenaGoldDropView(this, { plan: arenaGoldDropPlan(gold, won, from, arenaGoldTarget(this, w, delivery)), delivery, depth: 0,
      place: object => this.space.add(object), toObject: point => point, delayMs: ARENA_GOLD_DROP.afterCardMs });
    this.scope.add(() => drop.finish());
  }
  /**
   * A replayed archive bout's end (기록실 B단계): the winner's card, nothing recorded; its digest against the archive's — a different course (the
   * rules changed since) is told under the winner, the archive keeps its own result. A replayed final counts as its final seen.
   */
  private finishReplay(result: CityFightBoutResult, replay: NonNullable<ArenaDuelData["replay"]>): void {
    this.recorded = true;
    const locale = localeFor(this);
    this.showWinner(result, arenaPlayerName(result.winner === 0 ? this.dataIn.a : this.dataIn.b, locale));
    this.replayDrift = replay.digest === null ? null : replay.digest !== result.digest;
    this.resultText.setText(this.replayDrift ? t(locale, "arena.archive.drifted") : "");
    if (replay.round === ARENA_CUP_ROUNDS - 1) { seeArenaCupArchiveEntryFinal(replay.cupId); seePublicArenaCupFinal(replay.cupId); }
  }
  /** A village duel's end: the winner's card. Nothing is recorded (it was nobody's bout). The KO's sound was its blow's. */
  private finishBuiltIn(result: CityFightBoutResult): void {
    this.recorded = true;
    const locale = localeFor(this);
    this.showWinner(result, arenaPlayerName(result.winner === 0 ? this.dataIn.a : this.dataIn.b, locale));
    this.resultText.setText((this.pickLine(result, locale) + this.sharedRulesLine(locale, result)).trimStart());
  }

  private drawHud(dtMs: number): void {
    const duel = this.duel!, locale = localeFor(this), w = this.space.width, h = this.space.height, textScale = playerSettingsFor(this).textScale;
    const grid = arenaFightHudLayout(w, h, textScale);
    // The top (2026-10-23, mock-up v5 — the player's bout and the AI duel alike): the letterbox bands and the face HUD (`ArenaFaceHud` —
    // each corner's expression portrait, name, HP number and bar, his statuses; the seconds between them).
    this.stageBands.draw(this.bands, dtMs, true, this.reducedMotion, this.fixedSpace);
    // Quiet through a super's flash and its awakening's staging after it (2026-10-24: its lights, words and the drawn-big body stood over the
    // face HUD — a fighting game's cinematic hides its HUD).
    this.bands.setAlpha(this.space.quiet(this.sinks.superFlash.active || this.sinks.awakening.lit, dtMs));
    // Up with the bout, not under READY → FIGHT! (the player's bout hides them under its intro too).
    // The KO cut-in takes the screen: the HUD steps aside under it.
    // After a KO it holds the fallen's 0 a moment, then gives the airship and its light the top (`ARENA_FACE_HUD.koHoldMs`).
    const koOver = this.koScreenMs !== null && this.koScreenMs > ARENA_FACE_HUD.koHoldMs;
    const shown = this.started && !this.picking() && this.intro?.director.holdsFight !== true && this.koCutIn?.shown !== true && !koOver, snapshot = duel.session.snapshot;
    // A played corner's super key beside his full meter (the bottom chips' last one).
    const superKey = this.control && !this.auto ? arenaDuelKeyChips(playerSettingsFor(this), locale, this.inputContext.activeDevice === "gamepad", null).at(-1)?.key ?? null : null;
    const corner = (corner: 0 | 1): ArenaFaceHudCornerFrame => {
      const fighter = this.fighters[corner]!, id = corner === 0 ? this.dataIn.a : this.dataIn.b;
      // The player's corner in his tournament bout: "나 · 쿠마" (`arena.tournament.youAs`), as the bracket and the arena name him.
      // A cup bout's representative: ★ before his name, as the bracket shows him.
      const cupRep = this.dataIn.cup?.representative === id;
      const name = corner === 0 && this.dataIn.tournament ? t(locale, "arena.tournament.youAs", { name: arenaPlayerName(id, locale) })
        : cupRep ? `★ ${arenaPlayerName(id, locale)}` : arenaPlayerName(id, locale);
      const frame = fighter.barFrame(name, shown, this.reducedMotion);
      const meter = snapshot.result ? null : cityFightMeterShare(snapshot.states[corner].combat.meter);
      // A shared bout: the corner he backed (none before he picks); a cup bout: the representative; a played one: his corner a.
      const mine = this.pick ? this.pick.corner === corner : this.dataIn.cup ? cupRep
        : corner === 0 && (this.dataIn.player !== undefined || this.dataIn.tournament !== undefined);
      return { name, hp: frame.hp, maxHp: frame.maxHp, lines: frame.lines ?? [], picture: this.facePicture(corner),
        statuses: this.statusReady() ? fighter.fightStatuses : [], mine,
        meter, meterKey: corner === 0 ? superKey : null };
    };
    const corners = [corner(0), corner(1)] as const;
    const seconds = this.started && !this.picking() && !this.paused && !this.failed && !this.recorded ? Math.max(0, Math.ceil((duel.rules.limitMs - snapshot.ms) / 1000)) : null;
    const koLoser = snapshot.result?.how === "ko" ? (snapshot.result.winner === 0 ? 1 : 0) : null;
    this.faceHud?.update(dtMs, { shown, corners, seconds, koLoser, reducedMotion: this.reducedMotion, textScale });
    ([0, 1] as const).forEach(corner => {
      // His summon's badge after his status icons, under his bar's outer end.
      const anchor = this.faceHud?.badgeAnchor(corner);
      if (anchor) this.summonBadges[corner]?.update(dtMs, this.statusReady() ? this.liveSummons(corner).at(-1) ?? null : null, duel.corners[corner].id,
        this.faceHud?.statuses(corner).length ?? 0, anchor.x, anchor.y, anchor.mirror, this.reducedMotion);
    });
    if (!this.statusReady()) this.statusPanel?.close();
    // Top centre: the hold's word, the seconds left, nothing once the result is up.
    // Top centre: the word for a hold (불러오는 중 · 일시정지 · the failure); the seconds are the face HUD's.
    const word = this.failed ? t(locale, "arena.select.failed") : this.recorded ? "" : !this.started ? t(locale, "arena.select.loading")
      : this.paused ? t(locale, "arena.duel.paused") : "";
    if (this.status.text !== word) this.status.setText(word);
    this.status.setVisible(word !== "");
    fitArenaText(this.status, grid.footerWidth);
    this.status.setOrigin(0.5, 0);
    this.space.setLogicalPosition(this.status, w / 2, grid.metaY);
    const footerTop = this.placeButtons(w, h, grid.margin);
    // A played bout: his moves' chips along the bottom (none while the AI plays him), the control switch at the top right.
    if (this.hud) {
      const tuning = duel.corners[0].tuning, special = (tuning.summons?.length ?? 0) > 0 ? "summon" as const : tuning.skill ? "skill" as const : null, live = this.started && !this.recorded && this.intro?.director.holdsFight !== true;
      this.hud.update({ keys: live && !this.auto ? arenaDuelKeyChips(playerSettingsFor(this), locale, this.inputContext.activeDevice === "gamepad", special) : [],
        autoLabel: t(locale, this.auto ? "arena.select.autoOn" : "arena.select.autoOff"), autoKey: bindingLabel("autoPlay", INPUT_BINDINGS.arena),
        autoAvailable: live, hidden: !live, statusHelp: false, autoTop: (this.faceHud?.bottom ?? 0) + 8 });
    }
    // The winner's card over the ring, between the bars and the buttons; the records line small under his name.
    this.winnerCard.update(dtMs);
    this.winnerCard.layout({ width: w, height: h, top: grid.statusY, bottom: footerTop - 8 });
    this.koCutIn?.update(dtMs);
    this.pick?.card?.layout(w, h, textScale);
    const records = this.koCutIn?.shown ? this.koCutIn.recordsAnchor() : this.winnerCard.recordsAnchor();
    if (this.resultText.style.wordWrapWidth !== records.width) this.resultText.setWordWrapWidth(records.width, true);
    this.resultText.setVisible(records.shown && this.resultText.text !== "");
    this.space.setLogicalPosition(this.resultText, records.x, Math.min(records.y, footerTop - 8 - this.resultText.height));
  }

  /**
   * 일시정지 · 재개 and 나가기 as two navy blocks along the bottom; once the bout is over one brass 선수 목록 in the middle (both went to the
   * same list). Returns their top edge.
   */
  private placeButtons(w: number, h: number, margin: number): number {
    const locale = localeFor(this), over = this.recorded || this.failed, icons = this.iconButtons;
    if (this.dataIn.broadcast) {
      if (icons) for (const object of [...icons.control.objects, ...icons.exit.objects])
        (object as unknown as Phaser.GameObjects.Components.Visible).setVisible(false);
      return h - margin;
    }
    if (!over && icons) {
      if (this.buttons.length > 0) { for (const button of this.buttons) button.destroy(); this.buttons = []; this.buttonsKey = ""; }
      const side = ARENA_ICON_BUTTON.side, top = h - 18 - side;
      const forfeit = this.dataIn.tournament !== undefined && this.live() && this.forfeitArmed;
      // Under the versus card only 나가기 stands (pause has nothing to hold yet).
      const picking = this.picking();
      for (const object of icons.control.objects) (object as unknown as Phaser.GameObjects.Components.Visible).setVisible(!picking);
      for (const object of icons.exit.objects) (object as unknown as Phaser.GameObjects.Components.Visible).setVisible(true);
      icons.control.draw(margin, top, this.paused ? "play" : "pause", false, "", "right");
      icons.exit.draw(w - margin - side, top, "close", forfeit, forfeit ? t(locale, "arena.duel.forfeitConfirm") : "", "left");
      return top;
    }
    if (icons) for (const object of [...icons.control.objects, ...icons.exit.objects]) (object as unknown as Phaser.GameObjects.Components.Visible).setVisible(false);
    // Share and community entry are offered after an actual result; a failed load only offers the way back.
    const label = t(locale, "arena.duel.back"), shareable = this.recorded && !this.failed && this.shareable();
    const invite = this.recorded && !this.failed ? oddboutDiscordInviteUrl() : null;
    const shareLabel = t(locale, this.shareNote === "copied" ? "arena.duel.shareCopied" : this.shareNote === "failed" ? "arena.duel.shareFailed"
      : "arena.duel.share");
    const size = { width: Math.min(220, w - margin * 2), height: Math.max(48, UI_METRICS.controlHeight) };
    const actions: ArenaDuelEndAction[] = [...(shareable ? ["share" as const] : []), ...(invite ? ["community" as const] : []), "back"];
    const layout = arenaDuelEndButtonsLayout(w, h, margin, size, actions);
    const communityLabel = t(locale, "arena.duel.community");
    const signature = `${w}\u0000${h}\u0000${label}\u0000${shareable ? shareLabel : ""}\u0000${invite ? communityLabel : ""}`;
    if (signature !== this.buttonsKey) {
      this.buttonsKey = signature;
      for (const button of this.buttons) button.destroy();
      this.endActions = actions;
      if (!actions.includes(this.endFocus)) this.endFocus = "back";
      this.buttons = layout.map(({ action, ...rect }) => {
        const name = action === "back" ? "duel-controls" : action === "share" ? "duel-share" : "duel-community";
        return arenaFlatButton(this, { ...rect, primary: action === "back", onStage: action !== "back", name: `${name}-frame`, labelName: name,
          label: action === "back" ? label : action === "share" ? shareLabel : communityLabel,
          onActivate: () => this.activateEndAction(action) });
      });
      for (const button of this.buttons) for (const object of button.objects) this.space.add(object as Phaser.GameObjects.Image).setDepth(ARENA_DEPTHS.hud);
      this.focusEndAction();
    }
    return Math.min(...layout.map(rect => rect.y));
  }

  /** Direction keys and the pad reach every end action. Confirm still defaults to the existing back action. */
  private endInput(input: MenuInput<ArenaDuelMenuAction>): void {
    if (input.nav.back) { this.leave(); return; }
    if (input.nav.confirm) { this.activateEndAction(this.endFocus); return; }
    const step = input.nav.left || input.nav.up ? -1 : input.nav.right || input.nav.down ? 1 : 0;
    if (!step || this.endActions.length === 0) return;
    const index = this.endActions.indexOf(this.endFocus);
    this.endFocus = this.endActions[(index + step + this.endActions.length) % this.endActions.length]!;
    this.focusEndAction();
  }

  private focusEndAction(): void {
    this.buttons.forEach((button, index) => button.feedback.setFocused(this.endActions[index] === this.endFocus));
  }

  private activateEndAction(action: ArenaDuelEndAction): void {
    if (action === "back") { this.leave(); return; }
    if (!this.recorded || this.failed) return;
    if (action === "share") this.share();
    else {
      const invite = oddboutDiscordInviteUrl();
      if (invite) openExternalLink(invite);
    }
  }


  private shareable(): boolean {
    return this.builtIn && this.dataIn.tournament === undefined && arenaBoutLinkable(this.dataIn.a, this.dataIn.b);
  }

  /** 경기 공유: this bout's link (`ArenaBoutShare`) to the device's share sheet (a phone) or the clipboard; the button says how it went. */
  private share(): void {
    if (this.sharing || !this.shareable()) return;
    const locale = localeFor(this), { a, b, seed } = this.dataIn, scope = this.scope, digest = this.duel?.session.snapshot.result?.digest;
    // The ended bout's digest rides along: the one who opens it knows whether he watched this very bout (`arenaSharedBoutVerdict`).
    const url = arenaBoutShareUrl(globalThis.location.href, { a, b, seed, ...(digest ? { digest } : {}) }, locale);
    const text = t(locale, "arena.duel.shareText", { a: arenaPlayerName(a, locale), b: arenaPlayerName(b, locale) });
    this.sharing = true;
    void shareLink({ title: "ODDBOUT", text, url }, MOBILE_DEVICE).then(outcome => {
      if (!scope.alive) return;
      this.sharing = false;
      if (outcome === "copied" || outcome === "failed") { this.shareNote = outcome; this.shareNoteMs = SHARE_NOTE_MS; }
    });
  }
}

/** `v` (plan) as a unit vector, or null when it has no length. */
function planUnit(v: CityPoint): CityPoint | null {
  const length = Math.hypot(v[0], v[1]);
  return length > 1e-6 ? [v[0] / length, v[1] / length] : null;
}
