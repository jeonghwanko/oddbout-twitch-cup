import type Phaser from "phaser";
import { nativeCityOrthoGaitAssets } from "../art/NativeCityOrthoPack";
import { arenaGaitSheets } from "../art/ArenaGaitSheets";
import type { NativeCityFightHpBarFrame } from "./NativeCityFightHpBarView";
import { kumaFightSkills, kumaFightStatuses, type CityFightFoeSkill, type CityFightFoeStatus } from "../../sim/cityFight/CityFightStatus";
import type { SpriteSheetAssetDefinition } from "../../assets/RuntimeArtTypes";
import { fighterCellDrawScale, fighterDrawScaleIndex, fighterDrawScales } from "../../assets/FighterDrawScale";
import { FIGHTER_MOVE_FX_SHEETS } from "../../assets/FighterMoveFxArtCatalog";
import { cityProject, type CityPoint, type CityViewId } from "../../world/NativeCityDefinition";
import { NATIVE_CITY_KUMA_POST, type KumaPatrolPlan } from "../../sim/cityFight/NativeCityKumaPatrol";
import { kumaCombatAirborne, kumaCommitMs } from "../../sim/cityFight/NativeCityKumaSwing";
import { kumaCombatArmored, kumaCombatChance, kumaCombatGuarding, kumaCombatJabCutOpen, kumaCombatOpening, kumaCombatVulnerable, kumaWakeupKind }
  from "../../sim/cityFight/NativeCityKumaHit";
import { kumaCombatCounterGauge, kumaCombatLinkWindow, type KumaCounterGauge } from "../../sim/cityFight/NativeCityKumaCounter";
import { kumaCombatEngaged, type KumaCombatHit, type KumaCombatState, type KumaTuning } from "../../sim/cityFight/NativeCityKumaCombatState";
import { kumaNextAction } from "../../sim/cityFight/NativeCityKumaCombat";
import { kumaShiftLines } from "../../sim/cityFight/NativeCityKumaShift";
import { kumaAirRiseGravity } from "../../sim/cityFight/NativeCityKumaAir";
import { nativeCityKumaGrade } from "../../sim/cityFight/NativeCityExchange";
import { kumaScreenDelta, kumaScreenFacing, kumaStrikeDirection } from "../../sim/cityFight/NativeCityKumaGeometry";
import { nativeCityKumaFightDt, nativeCityKumaFighterPoint, nativeCityKumaFighterPresent, nativeCityKumaFighterReachExtraStrides,
  nativeCityKumaFighterGrade, nativeCityKumaFighterStrikeZone, type NativeCityKumaArtBridge, type NativeCityKumaFighterState, type NativeCityKumaStrikeZone } from "../../sim/cityFight/NativeCityKumaFighter";
import type { CityFightFighterFrame } from "../../sim/cityFight/CityFightSession";
import { nativeCityStepUnits } from "../../world/NativeCityTalkSpot";
import { nativeCityBackpedalPhase } from "../../sim/cityFight/NativeCityFightBackpedal";
import { clamp01 } from "../../sim/geom";
import { NATIVE_CITY_FOOTPRINT_STRIDES, nativeCityFootprintRadius, type NativeCityFootprint } from "../../sim/NativeCityActorCollision";
import { NATIVE_CITY_COMBAT, type NativeCityImpactTier, type NativeCityKumaActionKind, type NativeCityKumaGrade, type NativeCityKumaWakeup, type NativeCityMeleeTier } from "../../sim/cityFight/NativeCityCombatTuning";
import type { VillageFacing } from "../../sim/VillageFacing";
import { mixColor } from "../art/ColorMix";
import { NATIVE_CITY_SIDE_HEADINGS, nativeCityOrthoActionClip, nativeCityOrthoActionSteps, nativeCityOrthoActionTiming, nativeCityOrthoClipCell,
  nativeCityOrthoClipSheets, nativeCityOrthoHitSteps, type NativeCityOrthoAction, type NativeCityOrthoActionClip, type NativeCityOrthoPack } from "../art/NativeCityOrthoPack";
import { kumaDashMove, kumaClipFrameAt, kumaCombatSheets, kumaCombatSheetsAt, kumaMoveClip, kumaSwingClip, kumaFightTiming, kumaGrabHugPoint, kumaOpeningRimOn,
  kumaPackGetUpMs, kumaPackKoImpactMs, kumaPackGroundImpactOffset, kumaRunSheets, kumaRunSheetsAt, kumaVillageSheets, kumaWalkPace, nativeCityKumaArtBridge,
  nativeCityKnockdownLift, nativeCityKoLift, type KumaFrameSpec } from "../art/NativeCityKumaArt";
import { NATIVE_CITY_EXCHANGE_FX, nativeCityExchangeAfterimagesOn } from "../effects/NativeCityExchangeFx";
import { NativeCityHitOutline, type NativeCityOutlinePose } from "./NativeCityHitOutline";
import { NativeCityPoseTrail, type NativeCityPoseSample } from "./NativeCityPoseTrail";
import type { VictimHit, VictimReactionTier } from "../effects/VictimReactionPresentation";
import { nativeCityStaccatoVictimFrame, NATIVE_CITY_VICTIM_REFERENCE_BODY_PX, nativeCityVictimReactionOver } from "../effects/NativeCityStaccato";
import { NativeCityBodyFeel, NativeCityRebound, nativeCityArmorRimColor } from "../effects/NativeCityImpactFeel";
import { PALETTE } from "../art/palette";
import { declarePhaserTextureFamily } from "../PhaserTextureFamilies";
import { loadNativeCityKumaSkinPack, nativeCityKumaSkinPortraitSheet } from "../art/NativeCityKumaSkin";
import type { SceneScope } from "../lifecycle/SceneScope";
import type { NativeCityFightArt } from "../scenes/village/NativeCityFightDeps";
import { VILLAGE_DEPTHS, villageActorFxDepth, villageYSorted } from "../depths";
import { kumaSkillKind, kumaSkillSpec, kumaSkillSuperForm } from "../../sim/cityFight/NativeCityKumaSkill";
import { kumaAirSpec } from "../../sim/cityFight/NativeCityKumaAirChase";
import { nativeCityWeaponImpactKind, type NativeCityWeaponImpactKind } from "../effects/NativeCityWeaponImpact";
import { nativeCityIronBallStrokes, type NativeCityAttackTrailFrame } from "../effects/NativeCityAttackTrail";
import { FighterMoveFxView } from "./FighterMoveFxView";
import { GunshotFxView, type GunTarget } from "./GunshotFxView";
import { ARENA_NO_LEAD, arenaCornerRimAlpha } from "./ArenaFighterMotion";
import { NativeCityKumaPoser, kumaWorldPxPerScreenPx, type KumaCell, type KumaPaintFrame, type KumaPose, type NativeCityKumaFrameInput, type NativeCityKumaProfile, type KumaAttackClock, type KumaDashClock, type NativeCityKumaStagedClip } from "./NativeCityKumaPoser";
export type { NativeCityKumaFrameInput, NativeCityKumaProfile, KumaAttackClock, KumaDashClock, NativeCityKumaStagedClip } from "./NativeCityKumaPoser";

/** His rules wait this frame (his art is not in). */
const WAIT: CityFightFighterFrame = Object.freeze({ kind: "wait" });

// KUMA's pure art helpers live in the Phaser-free `NativeCityKumaArt` (2026-10-10); import them from there.

/** The sample's KUMA body px (reference/render.py KUMA_H): the rig's px are at this size. */
const KUMA_SAMPLE_BODY_PX = 330;
/** The burrow's exit mark glows for this long before he comes up (its last stage — 2026-10-22 action review: "now"). */
const EXIT_BURST_MS = 100;
/** The super burrow's false exits (`keys.decoys`) burst empty this long before he comes up, the first first. */
const DECOY_BURST_LEADS_MS = [520, 300] as const;
/** A false exit's empty burst (the dirt sheet's eruption cells, `dirtErupt`), each cell's ms. */
const DECOY_BURST_MS = [50, 80, 160] as const;

const ARENA_EVADE_CLIPS = ["backstep", "dodge", "vault"] as const satisfies readonly NativeCityOrthoAction[];


/**
 * A blow he took, as drawn. `ageMs` is screen time (the flash and the tremble run through the freeze); `fightMs` is the fight
 * clock (the recoil and lean hold in the frozen reaction pose until the hit stop lets go).
 */
/**
 * `trembleOnly`: a later contact of the same swing (one flinch per move) — the contact tremble, no new lean. `braced`: his armour took it
 * (his move goes on) — the softened lean over his attack's drawing, `ARMOR_BRACE_SCALE` of a flinch's, and the tremble.
 */
interface KumaReaction { readonly hit: VictimHit; ageMs: number; fightMs: number; readonly trembleOnly?: boolean; readonly braced?: boolean }

/**
 * The armoured brace's lean over the absorbed reaction (`ABSORBED_SCALE` 0.35 → ~0.6 of a flinch's): 2026-10-19 user — "C 에 몹 반응이
 * 없다" while he is armoured; he must visibly take the blow and give ground (the rule's `armor.pushStrides`) though his move goes on.
 */
const ARMOR_BRACE_SCALE = 1.7;

/** His body's place on screen over the pose (`NativeCityKumaView.place`): offset (world px), tilt (deg), and the hop off his shadow. */
interface KumaPlacement { offsetX: number; offsetY: number; angle: number; hop: number }


/**
 * KUMA in the village: a neutral brawler who guards a post (`NativeCityKumaPatrol`) until the player talks him into a
 * fight. His ground footprint (`footprint`, 0.6 stride) blocks the player and he waits rather than step into anyone.
 * His 16 idle/walk sheets (~6 MiB) are requested after the scene has started and the fight sheets (slam, paged combo,
 * hit; ~11 MiB) when he is asked for a fight (the challenge line opens); he stays hidden until the walk sheets are ready. His
 * fight rules read the pack's data, never the sheets (2026-10-11): before they are in he swings, falls and gets up on the same beats,
 * drawn as stand-ins. The runtime JSON itself is a lazy chunk.
 *
 * His rules (patrol, fight, knockback) are a pure world state (`NativeCityKumaFighter`, 2026-10-10): the view steps it each frame with
 * the art bridge read off his pack, hands it the blows, parries and strike landings, and draws what it says.
 *
 * The fight's hidden rules are drawn on him (2026-10-09, `feel.tells`): a steel rim while he is armoured, a magenta rim pulse when his
 * counter window opens (the "attack now" colour, 2026-10-19), the guard's raise beat, a sway at low poise; his flinch runs as long as it really lasts (`kumaHurtSteps`).
 */
/** A clip he plays over his stand (`NativeCityKumaView.stageClip`): its name in his pack, the stage's clock, looped (default: the victory). */

export class NativeCityKumaView {
  /** `native-city-npc-` prefix: the 3D card view gives it the same contact shadow as the residents. Not a stop. */
  readonly sprite: Phaser.GameObjects.Sprite;
  private pack: NativeCityOrthoPack | null = null;
  private sheets: SpriteSheetAssetDefinition[] = [];
  private combatRequested = false;
  /** Hostile this frame (`prepare`): only then does a heading not in yet ask for its fight sheets (not on his walk home). */
  private hostile = false;
  /** Headings whose fight / run sheets are in (once in, never back) and the sheet keys already asked for. */
  private readonly combatAt = new Set<VillageFacing>();
  private readonly runAt = new Set<VillageFacing>();
  private readonly asked = new Set<string>();
  private ready = false;
  private disposed = false;
  /** His walk's screen pace and stride at the last frame's body height (`kumaWalkPace`) — the fight's read of his art (`fightArt`). */
  private walkMeasure: { readonly pacePxPerSec: number; readonly stridePx: number } = { pacePxPerSec: 0, stridePx: 1 };
  /** The last art bridge `fightArt` built, for the pack and walk measure it was built at. */
  private artBridge: { readonly pack: NativeCityOrthoPack | null; readonly pacePxPerSec: number; readonly stridePx: number;
    readonly bridge: NativeCityKumaArtBridge } | null = null;
  private reaction: KumaReaction | null = null;
  /** The body feel of the last blow he took (`NativeCityBodyFeel`): flash on screen time, fallback hop on the fight clock. `flashOnly`: his own blow's flash (the dash's 쾅) — no hop on the striking body. */
  private impact: NativeCityBodyFeel | null = null;
  /** The sprite carries a `spatialAnchor` (his feet) while a hop lifts him off his shadow. */
  private anchored = false;
  /** His rebound after one of his blows landed (`NativeCityRebound`; the charge's own curve, `dash`). */
  private rebound: NativeCityRebound | null = null;
  /** Afterimage: up to two pearl ghosts sampling his recent frames (`NativeCityPoseTrail`; none under reduced motion). */
  private readonly afterimages: NativeCityPoseTrail;
  /** World px of his head and how strongly the dizzy stars show (groggy / falling), from the last draw. */
  private head: readonly [number, number] | null = null;
  /** Over his standing head whatever the pose (his lines' anchor — he says them as he falls); null while he is not drawn here. */
  private speech: readonly [number, number] | null = null;
  private lastBodyPx = 0;
  /**
   * His cells drawn bigger or smaller than they are painted (`FighterDrawScale` — a town walk painted smaller than his blows, KUMA's iron-ball
   * stance painted bigger): `texture#frame` → scale. Drawing only, and only in a fight (`fightDrawScale`).
   */
  private drawScale: ReadonlyMap<string, number> = new Map();
  private selectHandler: (() => void) | null = null;
  /** The rule tells (`feel.tells`): the armour / opening rim copies (behind him, `NativeCityHitOutline`), the armour clock, the opening's flash clock. */
  private readonly rim: NativeCityHitOutline;

  private readonly moveFx: FighterMoveFxView;

  private readonly gunFx: GunshotFxView;
  /** The arena caster's light (`arenaMotion.spec.cast`, 2026-10-23 arena audit): an additive copy of his cell while he casts; none elsewhere. */
  private readonly castGlow: Phaser.GameObjects.Sprite | null;
  private armorMs = 0;
  private openingMs: number | null = null;
  /** His fight tuning: KUMA's, or a skinned fighter's over it — the fight's rules (`CityFighterRules.tuning`, its reach baked). */
  private readonly tuning: KumaTuning;
  /** 그의 자세 계산(`NativeCityKumaPoser`, Phaser 없음): 모드별 자세와 프레임 사이에 이어지는 자세 상태. */
  private readonly poser: NativeCityKumaPoser;
  /** The opening backpedal this frame: his reversed walk phase and whether he is still stepping back; null when not staged. */
  private backpedal: { readonly phase: number; readonly moving: boolean } | null = null;
  /** His walk phase when the backpedal started (it runs backwards from there). */
  private backpedalFrom: number | null = null;

  private held: { readonly x: number; readonly y: number; readonly player: string; readonly front: boolean;
    readonly hug: { readonly x: number; readonly y: number } | null } | null = null;
  /** His burrow's exit (`KumaTuning.skill` burrow, 2026-10-22): a ring of earth where he will come up, while he is under. Only a burrower's. */
  private readonly exitMark: Phaser.GameObjects.Sprite | null;
  /** His super burrow's false exits (2026-10-22 4차, `superSkill` — its clip's `keys.decoys`): cracked like the real one, then burst empty. */
  private readonly decoyMarks: readonly Phaser.GameObjects.Sprite[];
  /** The sounds his drawing asked for this frame (his move effects' `sound`, a false exit's burst) — the scene plays them (`takeSounds`). */
  private sounds: string[] = [];
  /** His whole drawn lift at the last draw (world px over his feet): the rules' flight, his chase, a knockdown's arc, the blow's hop. */
  private lastHopPx = 0;
  /** Screen ms left of the summoner's light (`highlight` — a summon's KO). */
  private ownerLightMs = 0;

  /**
   * `skinId`: a skinned fighter (`NativeCityKumaSkin`) drawn from its own pack - when that pack is missing he stays absent,
   * never KUMA in disguise. `actorId` names his sprite (`native-city-npc-<id>`) and footprint, so several fighters can stand
   * together and each knows which body is his own. `art`: his sheets' loaded-yet and their request (the encounter's `host.art` — the
   * scene's `nativeCityFightDeps`; a fake in tests), so the view imports no Phaser loader. Required: a view that cannot load never shows.
   */
  constructor(scene: Phaser.Scene, scope: SceneScope, private readonly plan: KumaPatrolPlan = NATIVE_CITY_KUMA_POST,
    skinId: string | null = null, readonly actorId: string = "kuma", private readonly profile: NativeCityKumaProfile = {},
    private readonly art: NativeCityFightArt, private readonly rules: () => NativeCityKumaFighterState) {
    this.tuning = profile.tuning ?? NATIVE_CITY_COMBAT.kuma;
    // 자세 계산은 뷰의 시트·시계·입력을 콜백으로 읽는다.
    this.poser = new NativeCityKumaPoser(this.tuning, profile, art, rules, {
      combatArtAt: facing => this.combatArtAt(facing), runArtAt: facing => this.runArtAt(facing), ask: sheets => this.ask(sheets),
      attackClock: () => this.attackClock(), koImpactMs: () => this.koImpactMs, koBodyOffset: () => this.koBodyOffset,
      backpedal: () => this.backpedal, walkMeasure: () => this.walkMeasure, artBridge: () => this.artBridge,
      drawScale: () => this.drawScale, heldAt: () => this.heldAt });
    this.sprite = scene.add.sprite(0, 0, "__DEFAULT").setVisible(false).setName(`native-city-npc-${actorId}`);
    // Afterimage ghosts, made with him (before the scene's UI camera takes its ignore list), hidden until a swipe or a launch.
    this.afterimages = new NativeCityPoseTrail(scene.add, Math.max(0, NATIVE_CITY_EXCHANGE_FX.fx.afterimage.ghostCount.at(-1) ?? 2),
      "native-city-kuma-ghost");
    // The armour / opening rim (`feel.tells`): flat-filled copies of his frame round him, made with him (before the UI camera).
    this.rim = new NativeCityHitOutline(scene, "native-city-kuma-rim", true);
    // His own move effects (a fixed pool, made with him — before the UI camera — and only for a fighter that has any): a skin's by its id, a
    this.moveFx = new FighterMoveFxView(scene, skinId ?? actorId, key => art.textureKey(key), profile.arenaMotion !== undefined);
    this.gunFx = new GunshotFxView(scene, skinId ?? actorId);
    this.castGlow = profile.arenaMotion ? scene.add.sprite(0, 0, "__DEFAULT").setVisible(false).setBlendMode("ADD")
      .setName(`arena-fighter-cast-glow-${actorId}`) : null;
    this.exitMark = kumaSkillSpec(this.tuning, "burrow") ? scene.add.sprite(0, 0, "__DEFAULT").setVisible(false).setName("fighter-burrow-exit")
      : null;
    this.decoyMarks = kumaSkillSpec(this.tuning, "burrow") && this.tuning.superSkill
      ? DECOY_BURST_LEADS_MS.map((_, i) => scene.add.sprite(0, 0, "__DEFAULT").setVisible(false).setName(`fighter-burrow-decoy-${i}`)) : [];
    this.sprite.setInteractive({ useHandCursor: true }).on("pointerdown",
      (_pointer: unknown, _x: number, _y: number, event: { stopPropagation(): void }) => { event.stopPropagation(); this.selectHandler?.(); });
    scope.add(() => { this.disposed = true; });
    // A skinned fighter draws his own pack (the skin's lazy chunk); KUMA his (a lazy chunk).
    const extraSheets: SpriteSheetAssetDefinition[] = [];
    const packed: Promise<NativeCityOrthoPack | null> = profile.pack ? Promise.resolve(profile.pack) : skinId !== null
      ? loadNativeCityKumaSkinPack(skinId).then(skinned => {
        if (!skinned) return null;
        // His size and reach were measured off this pack ahead of time (`native-city-fighter-measure.json`): his plan carries the size.
        // A drawn dialogue portrait (a shipped skin) comes in with her standing sheets; her readiness does not wait for it.
        const portrait = nativeCityKumaSkinPortraitSheet(skinned);
        if (portrait) extraSheets.push(portrait);
        return skinned.pack;
      })
      : import("../../assets/native-city-kuma-ortho-runtime.json").then(module => module.default as unknown as NativeCityOrthoPack);
    void packed.then(pack => {
      if (this.disposed || !pack) return;
      this.pack = pack;
      this.moveFx.setPack(pack);
      this.gunFx.setPack(pack);
      this.drawScale = fighterDrawScaleIndex(profile.drawScalePack ?? pack, fighterDrawScales(skinId ?? actorId));
      this.sheets = profile.arenaMotion ? arenaGaitSheets(this.pack, ["idle", "walk"])
        : profile.pack ? nativeCityOrthoGaitAssets(this.pack, ["idle", "walk"]) : kumaVillageSheets(this.pack);
      // 그의 몸 시트는 한 묶음이다(3D 카드가 하나를 맡으면 Phaser 사본을 함께 내린다). 대화 초상 시트는 Phaser 가 그리므로 뺀다.
      // In the 3D village they are born low from the start (`NativeCityFightArt.family`).
      const body = [...this.sheets, ...kumaCombatSheets(this.pack),
        ...(profile.pack ? nativeCityOrthoGaitAssets(this.pack, ["run"]) : kumaRunSheets(this.pack))].map(sheet => sheet.key);
      if (art.family) art.family(body); else declarePhaserTextureFamily(body);
      art.preload([...this.sheets, ...extraSheets]);
    }).catch(() => { /* Missing art keeps him absent rather than substituting another actor. */ });
  }

  /** His pack and standing sheets are in (the tournament arena lifts its veil on it). */
  get artReady(): boolean {
    if (!this.ready && this.pack) this.ready = this.sheets.every(sheet => this.art.textureKey(sheet.key) !== null);
    return this.ready;
  }

  /** His sprite, its afterimage ghosts and the rim copies (the 3D card view draws them all; ghosts and rims cast no shadow). */
  get objects(): readonly Phaser.GameObjects.Sprite[] { return [...this.rim.objects, this.sprite, ...this.afterimages.objects]; }

  /** Clicking him (walk over and talk) — the scene owns what that means. */
  onSelect(handler: (() => void) | null): void { this.selectHandler = handler; }

  /**
   * A clip he plays over his stand (2026-10-22 4차, ODDBOUT — the arena's): his READY `entrance` (`ms` into it; he travels in from behind his
   * corner over its `keys.fromStrides`) or his `victory` loop under the KO light. Null: his fight as drawn. A pack without the clip draws on.
   */
  stageClip(cue: NativeCityKumaStagedClip | null): void {
    if (cue?.clip !== this.poser.staged?.clip) this.poser.stagedFacing = null;
    this.poser.staged = cue;
  }

  /**
   * A cell of his own clip `clip` at `ms` (looped, else held on its last cell) at his facing, as his sprite would draw it at his drawn body
   * height (the awakenings' figures — `CityFightAwakeningCanvas.figure`), or null (no such clip, his fight sheets not in yet).
   */
  clipFigure(clip: string, ms: number, loop: boolean): { readonly texture: string; readonly frame: number; readonly originX: number;
    readonly originY: number; readonly scale: number; readonly flipX: boolean } | null {
    const facing = this.combat.facing;
    const found = this.pack && this.combatArtAt(facing) ? nativeCityOrthoActionClip(this.pack, facing, clip as NativeCityOrthoAction) : null;
    if (!found || this.lastBodyPx <= 0) return null;
    const total = Math.max(1, nativeCityOrthoActionTiming(found.clip).totalMs);
    const { frame } = kumaClipFrameAt(found, loop ? ms % total : Math.min(total - 1, ms));
    return { texture: frame.texture, frame: frame.frame, originX: frame.originX / frame.frameWidth, originY: frame.originY / frame.frameHeight,
      scale: this.lastBodyPx / frame.bodyHeight * fighterCellDrawScale(this.drawScale, frame.texture, frame.frame), flipX: frame.flipX };
  }

  /** His pack draws `clip` at his facing with his fight sheets in (the arena holds its KO card for his victory, `ArenaDuelScene`). */
  drawsStageClip(clip: "entrance" | "victory"): boolean {
    return this.pack !== null && this.combatArtAt(this.combat.facing)
      && nativeCityOrthoActionClip(this.pack, this.combat.facing, clip as NativeCityOrthoAction) !== null;
  }

  /** The sounds his drawing asked for since the last call (`FighterMoveFxCue.sound`, a false exit's burst): the scene plays them. */
  takeSounds(): readonly string[] {
    const out = [...this.sounds, ...this.moveFx.takeSounds()];
    this.sounds = [];
    return out;
  }

  /**
   * His rules (`NativeCityKumaFighter`: patrol, fight, knockback, the last frame's measure): the fight session's state (`CityFightSession`,
   * held by `NativeCityCombatController`), read live. This view never changes it — it draws it and stages the reactions the fight's events
   * call for (`showHit` …).
   */
  private get fighter(): NativeCityKumaFighterState { return this.rules(); }
  private get combat(): KumaCombatState { return this.fighter.combat; }

  /** Where his feet are (plan). */
  get point(): CityPoint { return this.poser.point; }
  /**
   * Where his feet are drawn while another fighter's grab holds him (2026-10-22, a fighter-against-fighter bout — the grabber's `holdPoint`,
   * world px; the bout's rules keep his feet where he was caught). Null: at his own feet.
   */
  holdAt(point: { readonly x: number; readonly y: number } | null): void { this.heldAt = point; }
  private heldAt: { readonly x: number; readonly y: number } | null = null;
  /** The drawn crown, for another actor's supporting hand. Independent of the fighter's collision radius. */
  get crownPoint(): CityPoint | null { return this.head; }

  get holdPoint(): { readonly x: number; readonly y: number; readonly player: string; readonly front: boolean;
    readonly hug: { readonly x: number; readonly y: number } | null } | null { return this.held; }
  /** The current technique's contact material. A skin's fists do not inherit KUMA's iron-ball effect. */
  get weaponImpactKind(): NativeCityWeaponImpactKind {
    const combat = this.combat, action = combat.mode === "dash" ? "dash" : combat.action;
    const special = combat.mode === "dash" ? combat.dash?.special ?? null : combat.special ?? null;
    return nativeCityWeaponImpactKind(this.pack && action ? kumaMoveClip(this.pack, combat.facing, action, special)?.clip : null);
  }
  /**
   * The call-out his current move's clip names (`keys.contactLetter` — 2026-10-22, the ODDBOUT skills' "딱!" / "뿅!" / "쭈욱!"), else null:
   * the blow's own tier letter.
   */
  get contactLetter(): string | null {
    const combat = this.combat, action = combat.mode === "dash" ? "dash" : combat.action;
    const special = combat.mode === "dash" ? combat.dash?.special ?? null : combat.special ?? null;
    const letter = this.pack && action ? kumaMoveClip(this.pack, combat.facing, action, special)?.clip.keys?.contactLetter : null;
    return typeof letter === "string" ? letter : null;
  }
  /** Visual-only trail authored for this pack's iron-ball technique; independent of which receiver stands in front. */
  weaponTrailFrame(): NativeCityAttackTrailFrame | null {
    if (!this.pack || !this.combatArtAt(this.combat.facing) || !this.sprite.visible || this.weaponImpactKind !== "blunt") return null;
    const clock = this.attackClock(), dash = this.dashClock(), action = clock?.action ?? (dash ? "dash" : null);
    if (!action) return null;
    const found = kumaMoveClip(this.pack, this.combat.facing, action, this.combat.special ?? this.combat.dash?.special ?? null);
    if (!found?.move) return null;
    const rollingHit = dash?.drawn?.move === "rollRise" && dash.struck;
    if (!clock && !rollingHit) return null;
    const hits = clock?.hitsMs ?? [60], timeMs = clock?.modeMs ?? 60 + (dash?.phaseMs ?? 0);
    return { actorId: this.actorId, attackId: this.combat.attackId, technique: found.move,
      ground: [...this.combat.point],
      x: this.sprite.x, y: this.sprite.y, bodyPx: found.clip.bodyHeight * Math.abs(this.sprite.scaleY),
      side: found.flipX ? 1 : -1, timeMs, strokes: nativeCityIronBallStrokes(found.move, hits) };
  }

  present(viewId: CityViewId): boolean { return nativeCityKumaFighterPresent(this.fighter) && viewId === this.plan.viewId; }
  /** Standing calmly at his post: the only time he can be talked to. */
  get talkable(): boolean { return this.ready && this.sprite.visible && this.combat.mode === "idle"; }
  get hp(): number { return this.combat.hp; }
  get maxHp(): number { return this.tuning.hp; }
  /** The HP shares where his later shifts begin (`kuma.phases` — the fight HP bar's lines); empty for a fighter without shifts. */
  get shiftLines(): readonly number[] { return kumaShiftLines(this.tuning); }
  /** His fight HP bar under `name` (the village fight and the tournament arena read him the same way). */
  barFrame(name: string, shown: boolean, reducedMotion: boolean): NativeCityFightHpBarFrame {
    return { shown, hp: this.hp, maxHp: this.maxHp, name, reducedMotion, lines: this.shiftLines };
  }
  get poise(): number { return this.combat.poise; }
  get maxPoise(): number { return NATIVE_CITY_COMBAT.poise.max; }
  /** His poise is broken: the long stagger plays and he cannot act. */
  get broken(): boolean { return this.combat.mode === "break"; }
  /** Fight-clock ms into the current break (0 when not broken). */
  get brokenMs(): number { return this.combat.mode === "break" ? this.combat.modeMs : 0; }
  /** Winding up or swinging: blows do not flinch him. */
  get armored(): boolean { return kumaCombatArmored(this.combat, this.tuning); }
  /** His status icons on now (`kumaFightStatuses`: the rules' own reads — armour, guard, opening, break, down, grab, invulnerable). */
  get fightStatuses(): CityFightFoeStatus[] { return kumaFightStatuses(this.combat, this.tuning); }
  /** His card's moves (`kumaFightSkills`). */
  get fightSkills(): CityFightFoeSkill[] { return kumaFightSkills(this.tuning); }
  /** His frame data's own numbers (`kumaFrameSpec` of his tuning — the rules' bridge for him reads the same). */
  private get frames(): KumaFrameSpec { return this.poser.frames; }
  /** His guard stance between attacks (`kumaCombatGuarding`). */
  get guarding(): boolean { return kumaCombatGuarding(this.combat, this.tuning); }
  /** The triangle class of the move he has coming (`nativeCityKumaFighterGrade`): his windup tells' colour; null when none is coming. */
  get threatGrade(): NativeCityKumaGrade | null { return nativeCityKumaFighterGrade(this.fighter); }
  /**
   * The grade his badge shows (`feel.tells.gradeMark`): the coming move's (`threatGrade`), or in the last beat of a reversal get-up the
   * grade of the swing it rises into (`wakeTell`) — one mark from the tell through that swing's contacts. Null when nothing is coming.
   */
  get threatMarkGrade(): NativeCityKumaGrade | null { return this.threatGrade ?? this.wakeTell?.grade ?? null; }
  /**
   * Which threat the badge marks: the dash is its own (its attack id), every other one shares one key — so a gold swing cut into the dash
   * (the same grade) pops the badge and its warning again from the dash's first frame (2026-10-16 review).
   */
  get threatMarkKey(): number { return this.combat.mode === "dash" ? this.combat.attackId : -1; }
  /**
   * His counter window is open as a tell (`kumaCombatOpening`: a whiffed recovery / stand, a parry recoil, the dash's open stand — and with the
   * duel's rhythm, `kuma.rhythm`: the jab's window at a swing's start, a chance, a launch that can be followed).
   */
  get opening(): boolean { return kumaCombatOpening(this.combat, NATIVE_CITY_COMBAT, this.tuning); }
  /** The first moments of his swing a jab cuts (`kuma.rhythm.jabCut`): the magenta rim flashes, no letter (it comes with every such swing). */
  get jabCutOpen(): boolean { return kumaCombatJabCutOpen(this.combat, this.tuning); }
  /**
   * V's counter gauge on his armoured swing (`kuma.rhythm.counter`, 2026-10-18 손맛 2단계): it fills over the windup, full = the window before
   * his last contact. Off the swing's own clock (`attackClock`), as the rule reads it; null with no counter, no such swing or no pack.
   */
  get counterGauge(): KumaCounterGauge | null { return kumaCombatCounterGauge(this.combat, this.attackClock()?.hitsMs ?? null, this.tuning); }
  /**
   * The string's link (`kumaCombatLinkWindow`, 2026-10-19): a V pressed now still lands in his chain flinch and knocks him down; `fill` is
   * the share of the window left. Its lead is V's tap to contact (`player.actions.attack.charge` entry + startup). Null when closed.
   */
  get linkWindow(): { readonly fill: number } | null {
    const charge = NATIVE_CITY_COMBAT.player.actions.attack.charge;
    return kumaCombatLinkWindow(this.combat, (charge?.entryMs ?? 0) + (charge?.releaseStartupMs ?? 0), this.tuning);
  }
  /** A just dodge or a parry opened a chance on him (`kuma.rhythm.chance`): which, else null. Its rising edge pops "빈틈!" (2026-10-19 신호 정리: the "기회" status label is gone). */
  get chance(): "dodge" | "parry" | null { return kumaCombatChance(this.combat); }
  /** His poise is low enough to wobble and sweat (`feel.tells.poise.wobbleAt`), and he is not broken or down. */
  get lowPoise(): boolean {
    const mode = this.combat.mode;
    return kumaCombatVulnerable(this.combat) && mode !== "break" && this.combat.poise <= NATIVE_CITY_COMBAT.feel.tells.poise.wobbleAt;
  }
  /** World px of his head from the last draw (letters, sweat, the eye glint); null before he is drawn here. */
  get headPoint(): readonly [number, number] | null { return this.head; }
  /** Where his overhead line sits: over his standing head, whatever the pose (world px); null while he is not drawn here. */
  get speechPoint(): readonly [number, number] | null { return this.speech; }
  /** World px of his body height from the last draw. */
  get drawnBodyPx(): number { return this.lastBodyPx; }

  get parried(): boolean { return this.combat.mode === "parried"; }
  /** Knocked out (down after his HP ran out): fight-clock ms since the KO blow, else null. */
  get downMs(): number | null { return this.combat.mode === "down" ? this.combat.modeMs : null; }
  /**
   * The scene tells him how high the body he would chase is drawn (world px above its feet; 0 on the ground) — his air chase meets it there
   * (`airChaseLift`). The rules only lock his jump along the ground.
   */
  chaseTarget(liftPx: number): void { this.poser.chaseTargetPx = Number.isFinite(liftPx) ? Math.max(0, liftPx) : 0; }
  /** His feet's height thrown up for the air combo (body heights, `combat.air`); 0 on the ground. */
  get airBodies(): number { return this.combat.air?.heightBodies ?? 0; }
  /**
   * How high his body was drawn at the last draw (world px over his feet; 0 on the ground): the rules' flight and also what only the drawing
   * holds — his air chase, a KO flight that keeps falling after the rules put him down. The arena frames and lights what is drawn
   * (2026-10-23 audit: an air KO's burst went off on the empty floor under him).
   */
  /** His own move effects' sprites (`FighterMoveFxView` — the arena's camera reads how high they reach over him, 2026-10-24). */
  get moveFxSprites(): readonly Phaser.GameObjects.Sprite[] { return this.moveFx.objects; }


  get gunArmed(): boolean { return this.gunFx.armed; }

  /** Where the other's chest is this frame (his gunshots' lines end there), or null. */
  aimGun(target: GunTarget | null): void { this.gunFx.aimAt(target); }

  /** A shot of his landed (or was blocked) at `x, y` on a body `bodyPx` tall, flying `angle` (radians): the gun's impact light there. */
  gunImpact(x: number, y: number, angle: number, bodyPx: number, tier: "light" | "medium" | "heavy", blocked: boolean, depth: number,
    reduced: boolean): void {
    this.gunFx.impact(x, y, angle, bodyPx, tier, blocked, depth, reduced);
  }

  get drawnLiftPx(): number { return Math.max(this.lastHopPx, this.poser.vaultLiftPx); }
  /**
   * The top of his flight thrown up (body heights): where his rise stops under the rise's gravity, or his height once falling; 0 on the
   * ground. The stage camera frames it ahead of him (2026-10-21: an air hit's re-lift carried his head out of the top of the frame).
   */
  get airPeakBodies(): number {
    const air = this.combat.air, spec = kumaAirSpec(this.tuning);
    if (!air) return 0;
    return air.vy > 0 && spec ? air.heightBodies + air.vy * air.vy / (2 * Math.max(1e-12, kumaAirRiseGravity(spec))) : air.heightBodies;
  }
  /**
   * When his KO body meets the ground (fight ms after the KO blow): the drawn `fall` clip's ground-impact step, else the procedural
   * launch (`exchangeFx.ko.launchMs`) — the rules' beat (`NativeCityKumaArtBridge.koImpactMs`), whether or not the fall's sheet is in yet.
   */
  get koImpactMs(): number { return kumaPackKoImpactMs(this.pack, this.combat.facing); }
  /** The back's actual floor contact on the impact cell; the later resting body has a different centre. */
  get koGroundOffset(): readonly [number, number] {
    const fall = this.fallClip(), impact = kumaPackGroundImpactOffset(this.pack, this.combat.facing, this.lastBodyPx);
    if (!impact) return [this.koBodyOffset[0], 0];
    const k = fall ? this.fallStepDrawScale(fall.clip, nativeCityOrthoHitSteps(fall.clip)[0]) : 1;
    return [impact[0] * k, impact[1] * k];
  }
  /**
   * World px from his feet to the middle of his lying body (the calling card and KO stars): from the drawn fall's cell (it lies
   * where the art drew it — the back diagonal toward the camera, the front one away), else beside his feet away from his facing.
   */
  get koBodyOffset(): readonly [number, number] {
    const bodyPx = this.lastBodyPx, fall = this.fallClip();
    if (fall) {
      // The lying body the builder measured (`lieOffset`); an older clip without it: its cell's centre.
      const clip = fall.clip, origin = clip.origins.at(-1) ?? clip.origins[0]!;
      const k = bodyPx / clip.bodyHeight * this.fallStepDrawScale(clip, clip.lieSequenceIndex);
      const [ox, oy] = clip.lieOffset ?? [clip.frameWidth / 2 - origin.originX, clip.frameHeight / 2 - origin.originY];
      return [(fall.flipX ? -ox : ox) * k, oy * k];
    }
    return [(this.combat.facing.endsWith("left") ? 1 : -1) * 0.45 * bodyPx, 0];
  }

  /** The draw scale (`FighterDrawScale`) of the fall's cell at sequence step `step` (1 where the table has none, or no step). */
  private fallStepDrawScale(clip: NativeCityOrthoActionClip, step: number | undefined): number {
    const frame = step === undefined ? undefined : nativeCityOrthoActionSteps(clip)[step]?.frame;
    if (frame === undefined) return 1;
    const cell = nativeCityOrthoClipCell(clip, frame, false);
    return fighterCellDrawScale(this.drawScale, cell.texture, cell.frame);
  }

  /** The drawn fall for his current facing (or `facing`), once the fight sheets are in. */
  private fallClip(facing: VillageFacing = this.combat.facing) {
    return this.pack && this.combatArtAt(facing) ? nativeCityOrthoActionClip(this.pack, facing, "fall") : null;
  }


  get knockedDown(): boolean { return (this.combat.mode === "down" || this.combat.mode === "getup") && this.combat.knockdown; }

  /**
   * The wake-up he is about to rise into, in the last `knockdown.wakeup.tellLeadMs` of his get-up (the tell — reversal: his charge
   * aura; guard: the guard glint and clink, `NativeCityCombatController`), else null. `grade`: the triangle class of the reversal swing
   * it rises into (`reversalAction` — the charge is tinted by it, as the swing's own windup is), null for the guard.
   */
  get wakeTell(): { readonly kind: NativeCityKumaWakeup; readonly leftMs: number; readonly grade: NativeCityKumaGrade | null } | null {
    const combat = this.combat;
    if (combat.mode !== "getup" || !combat.knockdown) return null;
    const left = this.getUpMs() - combat.modeMs, kind = kumaWakeupKind(combat.knockdowns, this.tuning);
    if (!kind || left > NATIVE_CITY_COMBAT.kuma.knockdown.wakeup.tellLeadMs) return null;
    return { kind, leftMs: Math.max(0, left), grade: kind === "reversal" ? nativeCityKumaGrade(this.tuning.knockdown.wakeup.reversalAction) : null };
  }

  /** His get-up's length (the hit clip's recover frames at `down.getUpFrameMs`; 500 without a hit clip) — the rules' (`getUpMs`). */
  private getUpMs(): number { return kumaPackGetUpMs(this.pack, this.combat.facing, this.frames); }
  /** The dizzy stars over his head (groggy or falling), from the last draw: world px of the head and their opacity. */
  get dizzy(): { readonly head: readonly [number, number]; readonly alpha: number } | null {
    return this.head && this.poser.dizzyAlpha > 0.01 ? { head: this.head, alpha: this.poser.dizzyAlpha } : null;
  }
  /** Fighting (not patrolling, down or walking home). */
  get engaged(): boolean { return kumaCombatVulnerable(this.combat); }
  /**
   * Out of the fight entirely: not fighting, down or walking home - back on his patrol. The scene lets go of its challenged fighter
   * only then, so a KO, the defeat card's "다시" and the walk home all still talk to the same man.
   */
  get atPost(): boolean { return !kumaCombatEngaged(this.combat); }
  /** His fight sheets at his heading are in. */
  get fightReady(): boolean { return this.combatArtAt(this.combat.facing); }
  /** He can take a blow now (fighting, not down or walking home). */
  get vulnerable(): boolean { return this.ready && kumaCombatVulnerable(this.combat); }
  get radius(): number { return this.fighter.footprintRadius; }
  /**
   * His swing's reach beyond body contact (strides) as the fight judges it now (`nativeCityKumaFighterReachExtraStrides` — the drawn iron
   * ball's, the butt slam's shockwave, the drawn dash's, else his tuning's): the telegraph draws the same reach the blow lands with.
   */
  reachExtraStrides(action: NativeCityKumaActionKind): number {
    return nativeCityKumaFighterReachExtraStrides(this.fighter, action, this.tuning);
  }

  strikeZone(playerRadius: number): NativeCityKumaStrikeZone | null {
    return nativeCityKumaFighterStrikeZone(this.fighter, playerRadius, this.tuning);
  }

  get slamShockwave(): boolean { return this.tuning.slamShockwave !== undefined; }
  /** His body height over the player's (`KumaPatrolPlan.bodyScale` — a skinned fighter's measured off his pack ahead of time). */
  get bodyScale(): number { return this.plan.bodyScale; }

  get openingReach(): { readonly contactStrides: number; readonly reachStrides: number } {
    return { contactStrides: NATIVE_CITY_FOOTPRINT_STRIDES[this.profile.footprint ?? "kuma"] + NATIVE_CITY_FOOTPRINT_STRIDES.player,
      reachStrides: this.reachExtraStrides(kumaNextAction(this.combat.attacks, this.tuning)) };
  }

  snapshot() {
    return { ready: this.ready, ...this.fighter.patrol, x: this.sprite.x, y: this.sprite.y, visible: this.sprite.visible,
      combat: { mode: this.combat.mode, modeMs: Math.round(this.combat.modeMs), hp: this.combat.hp, action: this.combat.action,
        point: this.combat.point, facing: this.combat.facing, fightReady: this.fightReady,
        poise: Math.round(this.combat.poise * 100) / 100, counterChain: this.combat.counterChain, armored: this.armored,
        guarding: this.guarding, running: this.combat.running, kiteCount: this.combat.kiteCount, lunge: this.combat.lunge,
        committed: this.combat.committed, opening: this.opening, hurtMs: Math.round(this.combat.hurtMs), stringHits: this.combat.stringHits,
        retaliate: this.combat.retaliate, knockdown: this.combat.knockdown, knockdowns: this.combat.knockdowns, wakeGuard: this.combat.wakeGuard,
        reversal: this.combat.reversal, windupScale: this.combat.windupScale, wakeTell: this.wakeTell?.kind ?? null } };
  }

  /** Ground footprint (plan point + radius) while he stands in `viewId`; null before his art is ready, elsewhere, or in the air. */
  footprint(viewId: CityViewId): NativeCityFootprint | null {
    if (!this.ready || !this.sprite.visible || viewId !== this.plan.viewId || !(this.fighter.footprintRadius > 0)) return null;
    if (kumaCombatAirborne(this.combat)) return null;
    const engaged = kumaCombatEngaged(this.combat);
    return { id: this.actorId, point: this.point, radius: this.fighter.footprintRadius,
      moving: (engaged ? this.combat.movedPx : this.fighter.patrol.movedPx) > 0 };
  }

  /**
   * Requests the fight and run sheets of the stage's two headings (once — every 1:1 fight is side-on; another heading asks for its own
   * when it first draws). Returns true while they are still on their way.
   */
  requestCombatArt(): boolean {
    const pack = this.pack;
    if (!pack) return false;
    this.combatRequested = true;
    for (const facing of NATIVE_CITY_SIDE_HEADINGS) this.ask([...kumaCombatSheetsAt(pack, facing), ...kumaRunSheetsAt(pack, facing)]);
    this.ask(this.moveFx.skinSheets);
    // The arena's evade and vault clips (`arenaClip` — drawn once in; the bout does not wait for them).
    if (this.profile.arenaMotion) for (const facing of NATIVE_CITY_SIDE_HEADINGS) for (const action of ARENA_EVADE_CLIPS) {
      const found = nativeCityOrthoActionClip(pack, facing, action);
      if (found) this.ask(nativeCityOrthoClipSheets(found.clip));
    }
    return !NATIVE_CITY_SIDE_HEADINGS.every(facing => this.combatArtAt(facing));
  }

  /**
   * His fight sheets at `facing` are in (`kumaCombatSheetsAt`: every fight clip he draws there). Only after the fight art was requested
   * (he turned hostile or was challenged); a heading not in yet asks for its sheets while he is hostile.
   */
  private combatArtAt(facing: VillageFacing): boolean {
    if (!this.pack || !this.combatRequested) return false;
    if (this.combatAt.has(facing)) return true;
    const sheets = kumaCombatSheetsAt(this.pack, facing);
    if (sheets.length > 0 && sheets.every(sheet => this.art.textureKey(sheet.key) !== null)) { this.combatAt.add(facing); return true; }
    if (this.hostile) this.ask(sheets);
    return false;
  }

  /** His run sheet at `facing` is in (the chase draws the walk at run speed until then). */
  private runArtAt(facing: VillageFacing): boolean {
    if (!this.pack || !this.combatRequested) return false;
    if (this.runAt.has(facing)) return true;
    const sheets = kumaRunSheetsAt(this.pack, facing);
    if (sheets.length > 0 && sheets.every(sheet => this.art.textureKey(sheet.key) !== null)) { this.runAt.add(facing); return true; }
    if (this.hostile) this.ask(sheets);
    return false;
  }

  private ask(sheets: readonly SpriteSheetAssetDefinition[]): void {
    const wanted = sheets.filter(sheet => !this.asked.has(sheet.key));
    if (wanted.length === 0) return;
    for (const sheet of wanted) this.asked.add(sheet.key);
    this.art.preload(wanted);
  }


  showHit(event: { readonly taken: KumaCombatHit; readonly push: CityPoint; readonly meleeTier: NativeCityMeleeTier;
    readonly chainBeat: 1 | 2 | null }): void {
    const result = event.taken, chainBeat = event.chainBeat ?? undefined, projection = this.fighter.projection;
    // One flinch per move (2026-10-18): a later contact of the same swing (`continued`) keeps the flinch's beat and hold — only a tremble.
    if (result.state.mode === "hurt" && !result.continued) {
      this.poser.flinchBeat = !result.ender && chainBeat !== undefined ? chainBeat : null;
      this.poser.flinchFirstMs = result.state.hurtMs;
    }
    if (!projection) return;
    const screen = kumaScreenDelta(projection, event.push);
    const reactionTier: VictimReactionTier = result.defeated || result.broke ? "finisher" : result.counter || result.ender ? "heavy" : event.meleeTier;
    const beat = reactionTier === "light" && !result.ender && result.state.mode === "hurt" && chainBeat !== undefined ? { chainBeat } : {};
    this.reaction = { hit: { tier: reactionTier, facing: screen[0] < 0 ? -1 : 1, knockbackPx: 0, wallHit: false, absorbed: result.armored, ...beat },
      // Armour: he goes on with his move but braces against it (2026-10-19 user — the blow must read): the softened lean, `braced`.
      // A later contact of one swing and the ground blow (`kuma.rhythm.down`) on the body lying there: only the contact tremble.
      ageMs: 0, fightMs: 0, ...(result.continued || result.ground ? { trembleOnly: true } : result.armored ? { braced: true } : {}) };
  }


  showGuard(): void { this.poser.blockReact = { fightMs: 0 }; }

  /**
   * The body feel of a blow that landed (after `receiveHit`, with the exchange's final tier): the flash and,
   * heavy and up, the hop (`NativeCityImpactFeel`). Authored reactions keep only the flash. `uppercut` selects the fallback hop; an
   * authored pose retains its proportions for every contact direction.
   */
  markImpact(tier: NativeCityImpactTier, armored: boolean, flashOnly = false, uppercut = false, crush = false, grounded = false): void {
    this.poser.airBlowHeavy = tier !== "light";
    // The arena's flinch reads each blow (`arenaMotion`): the next hurt cell and the shove's weight.
    this.poser.blows += 1; this.poser.blowHeavy = tier !== "light"; this.poser.blowMs = 0;
    // The arena (`arenaMotion`) flashes its blows in its own grade (2026-10-23 arena audit — `NATIVE_CITY_ARENA_IMPACT_GRADE`: a light
    // blow tints, no cream fill).
    this.impact = new NativeCityBodyFeel({ tier, victim: "kuma", armored, ...(uppercut ? { uppercut } : {}), ...(crush ? { crush } : {}),
      ...(grounded ? { grounded } : {}) }, flashOnly, this.profile.arenaMotion ? "arena" : "village");
  }


  showParried(): void {
    this.reaction = null; this.rebound = null; this.poser.blockReact = null; this.impact = null;
  }


  showRecoil(event: { readonly attackId: number; readonly hitIndex: number; readonly push: CityPoint; readonly pushbackPx: number;
    readonly freezeMs: number; readonly followTier: NativeCityImpactTier | null }): void {
    const { attackId, hitIndex, push, pushbackPx, freezeMs, followTier } = event;
    const clock = this.attackClock();
    const found = clock && this.pack ? kumaSwingClip(this.pack, this.combat.facing, clock.action, this.combat.special ?? null) : null;
    // A seat-first landing braces against the floor, not sideways against the receiver.
    if (found?.move === "buttSlam") { this.rebound = null; return; }
    if (found && clock && clock.action !== "slam") {
      const step = nativeCityOrthoHitSteps(found.clip)[hitIndex];
      const hold = step === undefined ? 0 : found.clip.sequence?.[step]?.durationMs ?? 0;
      if (this.poser.displaySkip.attackId !== attackId) this.poser.displaySkip = { attackId, ms: 0 };
      this.poser.displaySkip.ms += Math.max(0, Math.min(Math.max(0, freezeMs), hold - NATIVE_CITY_COMBAT.feel.hitLag.contactHoldMinMs));
    }
    const projection = this.fighter.projection;
    if ((pushbackPx > 0 || followTier !== null) && projection) {
      const [sx, sy] = kumaScreenDelta(projection, push), length = Math.hypot(sx, sy);
      if (length > 1e-6) this.rebound = new NativeCityRebound({ screen: [-sx / length, -sy / length], px: pushbackPx, followTier,
        dash: this.combat.mode === "dash" });
    }
  }

  /** His dash right now (crouch, charge, slide, open), else null. */
  dashClock(): KumaDashClock | null {
    const combat = this.combat, dash = combat.dash;
    if (combat.mode !== "dash" || !dash) return null;
    return { attackId: combat.attackId, phase: dash.phase, phaseMs: dash.phaseMs, windupMs: dash.windupMs,
      from: dash.from, target: dash.target, point: combat.point, direction: dash.heading, struck: dash.struck, speedShare: dash.speedShare,
      drawn: this.drawnDash(combat) };
  }

  /** His drawn dash right now (`KumaDashClock.drawn` — the rules' dash, `dashLanding`, whether or not its sheet is in yet), else null. */
  private drawnDash(combat: KumaCombatState): KumaDashClock["drawn"] {
    if (!this.pack) return null;
    const move = kumaDashMove(kumaMoveClip(this.pack, combat.facing, "dash", combat.dash?.special ?? null)?.clip);
    return move ? { move: move.name, landsAtMs: move.landsAtMs } : null;
  }

  /**
   * His current swing's clock (null unless attacking): the rules' timing off his pack (`kumaFightTiming`), whether or not its sheet is in
   * yet — the telegraph, glint and whooshes follow the blow that lands, and only the drawn cells wait for the sheet (`paint`).
   */
  attackClock(): KumaAttackClock | null {
    const combat = this.combat, pack = this.pack;
    if (combat.mode !== "attack" || !combat.action || !pack) return null;
    const found = kumaSwingClip(pack, combat.facing, combat.action, combat.special ?? null);
    if (!found) return null;
    const timing = kumaFightTiming(found.clip, combat.action, this.frames, combat.windupScale);
    return { action: combat.action, attackId: combat.attackId, modeMs: combat.modeMs, hitsMs: timing.hitsMs, totalMs: timing.totalMs,
      apexMs: timing.apexMs ?? 0, commitMs: kumaCommitMs(combat.action, timing, combat.lunge, this.tuning), lunge: combat.lunge,
      hitsFired: combat.hitsFired, point: combat.point,
      // The contact point (telegraph, glint) along the heading he is drawn at, like the strike's cone.
      direction: this.fighter.projection ? kumaStrikeDirection(this.fighter.projection, combat.direction, combat.facing) : combat.direction,
      leap: combat.leap ?? null, buttSlam: found.move === "buttSlam" };
  }

  /** His fight tuning: KUMA's, or a skinned fighter's over it (`profile.tuning` — `CityFighterRules.tuning`, its reach baked). */
  get fightTuning(): KumaTuning { return this.tuning; }

  /** His pack has loaded: his art bridge (`fightArt`) answers his swings' timing (a tournament bout can run on it, sheets or not). */
  get packed(): boolean { return this.pack !== null; }

  /**
   * What his art says to the fight's rules (`nativeCityKumaArtBridge` over his pack — none yet: the authored defaults, no swing): the
   * swing timing, the drawn headings, the fall's ground impact, the dash's landing, at the last frame's walk measure.
   */
  fightArt(): NativeCityKumaArtBridge {
    // The same bridge while his pack and walk measure stay (the rules and the fight ask for it several times a frame).
    const pack = this.pack, { pacePxPerSec, stridePx } = this.walkMeasure, last = this.artBridge;
    if (last && last.pack === pack && last.pacePxPerSec === pacePxPerSec && last.stridePx === stridePx) return last.bridge;
    const bridge = nativeCityKumaArtBridge(pack, { pacePxPerSec, stridePx }, this.frames);
    this.artBridge = { pack, pacePxPerSec, stridePx, bridge };
    return bridge;
  }


  prepare(input: NativeCityKumaFrameInput): CityFightFighterFrame {
    const pack = this.pack;
    if (!pack || this.disposed) return WAIT;
    if (!this.ready) {
      // 장식 등급: 시트가 하나라도 없으면 대체 그림 없이 그를 숨긴 채 둔다(ArtFallback 정책).
      this.ready = this.sheets.every(sheet => this.art.textureKey(sheet.key) !== null);
      if (!this.ready) return WAIT;
    }
    this.hostile = input.hostile === true;
    if (input.hostile && !this.combatRequested) this.requestCombatArt();
    const here = input.viewId === this.plan.viewId && !input.travel;
    const { stridePx } = this.walkMeasure = kumaWalkPace(pack, input.actorHeight * this.bodyScale);
    const stepUnits = nativeCityStepUnits(input.projection.projection, input.actorHeight);
    const staged = here ? input.backpedal ?? null : null;
    if (staged) {
      // A frozen chase step at the talk distance would already start his swing: the rules wait while he backs off.
      const engaged = kumaCombatEngaged(this.combat);
      const facing = kumaScreenFacing(input.projection.projection, [input.player[0] - staged.point[0], input.player[1] - staged.point[1]])
        ?? (engaged ? this.combat.facing : this.fighter.patrol.facing);
      this.backpedalFrom ??= engaged ? this.combat.phase : this.fighter.patrol.phase;
      const [ax, ay] = cityProject(staged.from, input.projection), [bx, by] = cityProject(staged.point, input.projection);
      this.backpedal = { phase: nativeCityBackpedalPhase(this.backpedalFrom, Math.hypot(bx - ax, by - ay), stridePx), moving: staged.moving };
      return { kind: "staged", point: staged.point, facing };
    }
    this.backpedal = null; this.backpedalFrom = null;
    return { kind: "step", input: {
      plan: this.plan, tuning: this.tuning, dtMs: input.dtMs, frozen: input.frozen, reducedMotion: input.reducedMotion,
      hostile: input.hostile === true, player: here ? input.player : null,
      playerRadius: input.playerRadius, playerSteered: input.playerSteered, blockers: here ? input.blockers ?? [] : [],
      walkable: input.walkable, route: input.route, line: input.line, projection: input.projection.projection, stepUnits,
      footprintRadius: nativeCityFootprintRadius(this.profile.footprint ?? "kuma", stepUnits),
      art: this.fightArt(),
    } };
  }

  /** Draws him after his rules' step (`clock`: the fight clock he walked on — `cityFightFighterClock`). Hidden outside his view. */
  draw(input: NativeCityKumaFrameInput, clock: { readonly hitStopped: boolean; readonly timeScale: number }): void {
    const pack = this.pack;
    if (!pack || this.disposed || !this.ready) return;
    const here = input.viewId === this.plan.viewId && !input.travel;
    this.sprite.setVisible(here);
    if (!here) {
      this.afterimages.hide(); this.rim.hide(); this.moveFx.hide(); this.gunFx.hide(); this.castGlow?.setVisible(false);
      this.head = null; this.speech = null; this.poser.dizzyAlpha = 0;
      this.exitMark?.setVisible(false); for (const mark of this.decoyMarks) mark.setVisible(false);
      return;
    }
    this.paint(pack, input, input.actorHeight * this.bodyScale, input.frozen ? 0 : input.dtMs, nativeCityKumaFightDt({ ...input, ...clock }));
  }

  private paint(pack: NativeCityOrthoPack, input: NativeCityKumaFrameInput, bodyPx: number, dtMs: number, fightDt: number): void {
    const combat = this.combat, reduced = input.reducedMotion === true;
    this.poser.dizzyAlpha = 0;
    this.sounds = [];
    this.lastBodyPx = bodyPx;
    this.poser.vaultLiftPx = 0;
    this.ownerLightMs = Math.max(0, this.ownerLightMs - dtMs);
    this.poser.screenMs += dtMs;
    this.poser.frozenScreenMs = fightDt > 0 ? 0 : this.poser.frozenScreenMs + dtMs;
    if (this.poser.blockReact) this.poser.blockReact.fightMs += fightDt;
    const fightArt = this.combatArtAt(combat.facing);
    const f: KumaPaintFrame = { pack, input, bodyPx, fightDt, combat, engaged: kumaCombatEngaged(combat), reduced,
      away: combat.facing.endsWith("left") ? 1 : -1, sampleK: bodyPx / KUMA_SAMPLE_BODY_PX, fightArt,
      hitClip: fightArt ? nativeCityOrthoActionClip(pack, combat.facing, "hit") : null };
    const pose: KumaPose = { frame: null, shake: [0, 0], darken: 0, rigAngle: 0, rigX: 0, rigY: 0, ghosting: false, headOverride: null,
      depthDy: 0, artOwnsBody: false, authoredHop: 0, guardStanding: false, mirror: false, stretchY: 1 };
    this.poser.holdCell = null;
    if (this.profile.arenaMotion) this.poser.arenaMotionClocks(combat, dtMs, fightDt);
    // A body brought down out of the air (the spike, its bounce) lies head first where his pack draws it (`keys.stuck`); a new flinch clears it.
    if (combat.air && (combat.air.spiked || combat.air.bounced)) this.poser.stuckDown = true;
    else if (!["down", "getup"].includes(combat.mode) && !combat.air) this.poser.stuckDown = false;
    if (!combat.air) {
      this.poser.airTurnDeg = 0; this.poser.airPhase = "fly"; this.poser.airHits = 0; this.poser.airSinceMs = 0; this.poser.airFrame = null;
      this.poser.airCell = null; this.poser.airFirst = false;
    }
    this.poser.pose(f, pose);
    if (this.profile.arenaMotion) this.poser.arenaMotionPose(f, pose, this.profile.arenaMotion);
    // Low poise (`feel.tells.poise`): he sways on his feet (the sweat is the controller's) — the break is near.
    if (f.engaged && !reduced && this.lowPoise && ["chase", "cooldown", "hurt", "abort", "parried"].includes(combat.mode)) {
      const w = NATIVE_CITY_COMBAT.feel.tells.poise;
      pose.rigAngle += f.away * w.wobbleDeg * Math.sin(2 * Math.PI * this.poser.screenMs / Math.max(1, w.wobbleMs));
    }
    if (this.poser.blockReact && this.poser.blockReact.fightMs > 1000) this.poser.blockReact = null;
    let frame = pose.frame;
    if (!frame) { frame = this.poser.walkOrStandCell(f); this.poser.gaitRig(f, pose); }
    else {
      this.poser.standMs = 0;
      // A swing or a flinch ends a walk that starts on its first cell: the next steps start there again.
      if (this.poser.gaitClock?.fromStart) this.poser.gaitClock = null;
    }
    if (!pose.guardStanding) this.poser.guardStandMs = 0;
    this.place(f, pose, frame, dtMs);
  }

  /** His burrow's exit ring (`KumaLeap.to`) while he is under (from the dig-in to coming up); hidden otherwise. */
  private markExit(f: KumaPaintFrame): void {
    const combat = f.combat, leap = combat.leap;
    const under = combat.mode === "attack" && leap != null && combat.hitsFired === 0 && kumaSkillKind(combat.special) === "burrow"
      && combat.modeMs >= leap.takeoffMs;
    const mark = this.exitMark;
    if (!mark) return;
    this.markDecoys(f, under);
    if (!under) { mark.setVisible(false); return; }
    // Drawn on his dirt sheet (2026-10-22 action review: the old sienna ring was a third of his body and the floor's own brightness — the
    // answer's signal failed): a crack in the floor, the floor bulging, then its cracks glowing for the last `EXIT_BURST_MS` before he comes up.
    const sheet = FIGHTER_MOVE_FX_SHEETS.oddboutDirt, key = this.art.textureKey(sheet.key);
    if (key === null) { mark.setVisible(false); return; }
    const [x, y] = cityProject(leap.to, f.input.projection);
    const k = clamp01((combat.modeMs - leap.takeoffMs) / Math.max(1, leap.landMs - leap.takeoffMs));
    const stage = leap.landMs - combat.modeMs <= EXIT_BURST_MS ? 2 : k < 0.4 ? 0 : 1;
    const pulse = f.reduced || stage < 2 ? 1 : 1 + 0.06 * Math.sin(this.poser.screenMs / 40);
    // Under a body standing on the exit (the ground ring of an actor there).
    const depth = villageActorFxDepth(villageYSorted(VILLAGE_DEPTHS.actorBody, y), -3);
    mark.setTexture(key, stage).setOrigin(0.5, 0.8).setScale(f.bodyPx * (0.8 + 0.4 * k) * pulse / sheet.frameWidth)
      .setPosition(x, y).setDepth(depth).setVisible(true);
  }

  /**
   * His super burrow's false exits (`keys.decoys`, strides along his dig past the real one): cracked and bulging like the real one while he is
   * under, each bursting empty (the dirt eruption, its thud) `DECOY_BURST_LEADS_MS` before he comes up — the real one alone glows.
   */
  private markDecoys(f: KumaPaintFrame, under: boolean): void {
    const combat = f.combat, leap = combat.leap, marks = this.decoyMarks;
    if (marks.length === 0) return;
    const found = under && kumaSkillSuperForm(combat.special) ? kumaMoveClip(f.pack, combat.facing, "slam", combat.special ?? null) : null;
    const offsets = found?.clip.keys?.decoys as readonly number[] | undefined;
    const sheet = FIGHTER_MOVE_FX_SHEETS.oddboutDirt, key = this.art.textureKey(sheet.key);
    const dig = leap ? Math.hypot(leap.to[0] - leap.from[0], leap.to[1] - leap.from[1]) : 0;
    const line: CityPoint | null = leap && dig > 1e-9 ? [(leap.to[0] - leap.from[0]) / dig, (leap.to[1] - leap.from[1]) / dig] : null;
    marks.forEach((mark, i) => {
      const offset = offsets?.[i];
      if (!leap || !line || key === null || offset === undefined) { mark.setVisible(false); return; }
      const at: CityPoint = [leap.to[0] + line[0] * offset * this.fighter.stepUnits, leap.to[1] + line[1] * offset * this.fighter.stepUnits];
      const [x, y] = cityProject(at, f.input.projection);
      const burstAt = leap.landMs - (DECOY_BURST_LEADS_MS[i] ?? 0), since = combat.modeMs - burstAt;
      const total = DECOY_BURST_MS.reduce((sum, ms) => sum + ms, 0);
      if (since >= total) { mark.setVisible(false); return; }
      if (since >= 0 && since - f.fightDt < 0 && this.sounds.length < 8) this.sounds.push("dirtBurst");
      const k = clamp01((combat.modeMs - leap.takeoffMs) / Math.max(1, leap.landMs - leap.takeoffMs));
      let cell = k < 0.4 ? 0 : 1, width = f.bodyPx * (0.8 + 0.4 * k), originY = 0.8;
      if (since >= 0) {
        let left = since, step = 0;
        while (step < DECOY_BURST_MS.length - 1 && left >= DECOY_BURST_MS[step]!) { left -= DECOY_BURST_MS[step]!; step++; }
        cell = 3 + step; width = f.bodyPx * 1.3; originY = 0.95;
      }
      const depth = villageActorFxDepth(villageYSorted(VILLAGE_DEPTHS.actorBody, y), -3);
      mark.setTexture(key, cell).setOrigin(0.5, originY).setScale(width / sheet.frameWidth).setPosition(x, y).setDepth(depth)
        .setAlpha(since >= total - DECOY_BURST_MS[2] ? 1 - (since - (total - DECOY_BURST_MS[2])) / DECOY_BURST_MS[2] : 1).setVisible(true);
    });
  }

  /** A summon of his won the bout (2026-10-23 2차 — the arena's KO by a summon): his light and corner outline for `ms` screen ms. */
  highlight(ms: number): void { this.ownerLightMs = Math.max(this.ownerLightMs, Math.max(0, ms)); }

  /** Puts `frame` on his sprite with the pose's rig and the blow reactions over it (`KumaPlacement`), then his tells and afterimages. */
  private place(f: KumaPaintFrame, pose: KumaPose, drawnFrame: KumaCell, dtMs: number): void {
    const { input, bodyPx, combat, reduced } = f;
    // Turned about (`pose.mirror`, the spins): the same cell mirrored about where he stands.
    const drawnSupport = "supportOffsetBody" in drawnFrame ? drawnFrame.supportOffsetBody : undefined;
    const frame: KumaCell = pose.mirror ? { ...drawnFrame, flipX: !drawnFrame.flipX, originX: drawnFrame.frameWidth - drawnFrame.originX,
      groundContacts: undefined, ...(drawnSupport ? { supportOffsetBody: [-drawnSupport[0], drawnSupport[1]] as const } : {}) } : drawnFrame;
    const scale = bodyPx / frame.bodyHeight * this.poser.fightDrawScale(f, frame);
    const [x, y] = this.heldAt ? [this.heldAt.x, this.heldAt.y] : cityProject(this.point, input.projection);
    const at: KumaPlacement = { offsetX: pose.shake[0] * scale + pose.rigX, offsetY: pose.shake[1] * scale + pose.rigY, angle: pose.rigAngle,
      // A drawn knockdown lifts off the ground on its own fall, the KO's flight higher (`knockback.ko`); else the pose's drawn lift (the
      // impact feel's hop may take over).
      hop: pose.artOwnsBody && combat.mode === "down" && combat.knockdown
        ? nativeCityKnockdownLift(combat.modeMs, this.koImpactMs, bodyPx, reduced, this.fighter.downWallMs)
        : pose.artOwnsBody && combat.mode === "down" && combat.hp <= 0
          ? nativeCityKoLift(combat.modeMs, this.koImpactMs, bodyPx, reduced, this.fighter.downWallMs, this.fighter.downRebound)
        : pose.authoredHop };
    // Thrown up for the air combo (`combat.air`): the rules' height over the drawn pose (a KO in the air keeps falling from it).
    if (combat.air) at.hop += combat.air.heightBodies * bodyPx;
    // His air chase (`NativeCityKumaAirChase`): up to the body he jumped after, with it, then down from the spike.
    at.hop += this.poser.airChaseLift(f);
    this.sprite.clearTint();
    this.reactionLean(f, pose.artOwnsBody, at, dtMs);
    this.impactFeel(f, pose.artOwnsBody, at, dtMs);
    this.reboundPush(f, at, dtMs);
    if (pose.darken > 0 && !this.sprite.isTinted) this.sprite.setTint(mixColor(PALETTE.white, 0x000000, 1 - pose.darken));
    const { offsetX, angle, hop } = at;
    this.lastHopPx = Math.max(0, hop);
    let offsetY = at.offsetY;
    const depth = villageYSorted(VILLAGE_DEPTHS.actorBody, y + pose.depthDy);
    const facingSign: 1 | -1 = combat.facing.endsWith("left") ? -1 : 1;
    const hold = this.poser.holdCell, forward: 1 | -1 = pose.mirror ? (-facingSign as 1 | -1) : facingSign;
    this.held = hold ? { x: x + forward * hold.offset[0] * bodyPx, y: y - hold.offset[1] * bodyPx, player: hold.player, front: hold.front,
      hug: kumaGrabHugPoint(hold, x, y, forward, bodyPx) } : null;
    // The hop: drawn higher, his feet (and the 3D card's shadow) stay on the ground.
    if (hop > 0) {
      this.sprite.setData("spatialAnchor", { x: x + offsetX, y: y + offsetY });
      this.anchored = true;
      offsetY -= hop;
    } else if (this.anchored) {
      this.sprite.setData("spatialAnchor", undefined);
      this.anchored = false;
    }
    const originX = frame.originX / frame.frameWidth, originY = frame.originY / frame.frameHeight;
    // The arena windup's squash and stretch about his feet (`pose.stretchY`, 1 elsewhere): the width takes its root's inverse.
    const scaleX = scale / Math.sqrt(pose.stretchY), scaleY = scale * pose.stretchY;
    this.sprite.setData('groundContacts', hop > 0 ? undefined : frame.groundContacts);
    this.sprite.setTexture(frame.texture, frame.frame).setOrigin(originX, originY)
      .setFlipX(frame.flipX).setScale(scaleX, scaleY).setAngle(angle)
      .setPosition(x + offsetX, y + offsetY).setDepth(depth);
    this.drawRims({ texture: frame.texture, frame: frame.frame, flipX: frame.flipX, x: x + offsetX, y: y + offsetY, feetX: x + offsetX,
      feetY: y + offsetY + hop, scaleX, scaleY, angle, originX, originY, depth }, kumaWorldPxPerScreenPx(input), dtMs, reduced);
    // The arena caster's light: his cell again, added over him at `cast.lift` (just over his body, under the other body's front sort).
    const glow = this.castGlow, lift = this.profile.arenaMotion?.spec.cast.lift ?? 0;
    if (glow && this.arenaCasting() && lift > 0) {
      const glowDepth = villageActorFxDepth(depth, 1);
      glow.setTexture(frame.texture, frame.frame).setOrigin(originX, originY).setFlipX(frame.flipX).setScale(scaleX, scaleY).setAngle(angle)
        .setPosition(x + offsetX, y + offsetY).setDepth(glowDepth).setAlpha(lift).setVisible(true);
    } else glow?.setVisible(false);
    // The head the dizzy stars orbit: up the body from the feet, turned with the tilt (Phaser angles run clockwise).
    const support = ("supportOffsetBody" in frame ? frame.supportOffsetBody : null) as readonly [number, number] | null;
    const headOverride = pose.headOverride ?? (support ? [support[0] * bodyPx, support[1] * bodyPx] as const : null);
    const rad = angle * Math.PI / 180, height = 0.95 * bodyPx;
    this.head = headOverride ? [x + offsetX + headOverride[0], y + offsetY + headOverride[1]]
      : [x + offsetX + Math.sin(rad) * height, y + offsetY - Math.cos(rad) * height];
    // Above his name plate (which sits over his head).
    this.speech = [x + offsetX, y + offsetY - 1.4 * bodyPx];
    // The ghosts keep his feet (a hop's ghost sorts where he stands, not as a body further back).
    this.afterimage({ t: this.poser.screenMs, texture: frame.texture, frame: frame.frame, originX, originY, flipX: frame.flipX, scaleX,
      scaleY, angle, x: x + offsetX, y: y + offsetY, depth, feetX: x + offsetX, feetY: y + offsetY + hop },
      pose.ghosting && nativeCityExchangeAfterimagesOn(reduced));
    this.markExit(f);
    // His own move effects ride the cell he draws (its name says which), on the fight clock.
    // His move effects ride the cell as drawn (`fightDrawScale`): their anchors are body heights of the painted figure. Not on a rush's
    // flurry (2026-10-25): its cells are his string's borrowed, a burst a cell hid both bodies (its own sparks tell it).
    const flurry = f.combat.exchange?.phase === "flurry" && !f.combat.exchange.finalSlash;
    if (flurry) this.moveFx.hide();
    else this.moveFx.frame({ texture: frame.texture, frame: frame.frame, flipX: frame.flipX, x: x + offsetX, y: y + offsetY,
      bodyPx: bodyPx * this.poser.fightDrawScale(f, frame), depth, fightDtMs: f.fightDt, reducedMotion: reduced });
    // His gunshots ride his firing cells the same way (the flash at the muzzle, the line to the other's chest).
    this.gunFx.frame({ texture: frame.texture, frame: frame.frame, flipX: frame.flipX, x: x + offsetX, y: y + offsetY,
      bodyPx: bodyPx * this.poser.fightDrawScale(f, frame), depth, fightDtMs: f.fightDt, reducedMotion: reduced });
  }


  private reactionLean(f: KumaPaintFrame, artOwnsBody: boolean, at: KumaPlacement, dtMs: number): void {
    const reaction = this.reaction;
    if (!reaction) return;
    reaction.ageMs += dtMs;
    reaction.fightMs += f.fightDt;
    const body = nativeCityStaccatoVictimFrame(reaction.hit, reaction.fightMs, reaction.ageMs, f.reduced);
    const px = f.bodyPx / NATIVE_CITY_VICTIM_REFERENCE_BODY_PX;
    // A later contact of the same swing (`trembleOnly`, one flinch per move): only the contact tremble on the freeze, no new lean.
    if (reaction.trembleOnly) { if (reaction.fightMs === 0) at.offsetX += body.jitterX * px; }
    else if (reaction.braced) {
      // His attack's drawing goes on (a drawn slam too): the brace leans the whole card back and shakes through the freeze.
      at.offsetX += (body.recoilX * ARMOR_BRACE_SCALE + body.jitterX) * px; at.angle += body.angleDeg * ARMOR_BRACE_SCALE;
    }
    else if (!artOwnsBody) { at.offsetX += (body.recoilX + body.jitterX) * px; at.angle += body.angleDeg; }
    else if (reaction.fightMs === 0 && (f.combat.mode === "hurt" || f.combat.mode === "down" && f.combat.modeMs === 0)) {
      // The drawn pose owns the bend. Only the brief contact tremble survives on the held frame; it ends before flight or recovery.
      at.offsetX += body.jitterX * px;
    }
    if (nativeCityVictimReactionOver(reaction.hit.tier, reaction.ageMs, reaction.fightMs)) this.reaction = null;
  }

  /**
   * The impact feel (`NativeCityImpactFeel`, `markImpact`): a 1-2 frame fill then a warm-red fade, a held contact pose, and the hop of a
   * heavy blow — him lifted off his shadow (the 3D card reads the lift from his `spatialAnchor` feet). A drawn reaction keeps the flash only.
   */
  private impactFeel(f: KumaPaintFrame, artOwnsBody: boolean, at: KumaPlacement, dtMs: number): void {
    const impact = this.impact;
    if (!impact) return;
    impact.tick(dtMs, f.fightDt);
    if (!artOwnsBody && !impact.flashOnly) at.hop = impact.hop(f.bodyPx, f.reduced);
    const flash = impact.flash(f.reduced);
    if (flash?.fill) this.sprite.setTintFill(flash.color);
    else if (flash) this.sprite.setTint(flash.color);
    if (impact.over) this.impact = null;
  }

  /**
   * His rebound after one of his blows landed (`NativeCityRebound`): the fist presses on along the blow inside the freeze (follow-through),
   * then the rebound pushes back against it (screen px, on the fight clock).
   */
  private reboundPush(f: KumaPaintFrame, at: KumaPlacement, dtMs: number): void {
    const rebound = this.rebound;
    if (!rebound) return;
    rebound.tick(dtMs, f.fightDt);
    const k = rebound.pushPx(f.reduced);
    const world = kumaWorldPxPerScreenPx(f.input);
    at.offsetX += rebound.screen[0] * k * world; at.offsetY += rebound.screen[1] * k * world;
    if (rebound.over) this.rebound = null;
  }

  /**
   * The rule tells on his silhouette (`feel.tells`): while he is ARMOURED (`kumaCombatArmored` — a swing before its last contact, the
   * dash crouch and charge) flat-filled copies of this frame sit `armor.rimPx` screen px out round him, behind him, the shared armour
   * steel (`nativeCityArmorRimColor` — lit white by a blow on it); when his COUNTER WINDOW opens (`kumaCombatOpening`) the same rim pulses the
   * "attack now" magenta (`PALETTE.fightAttackNow`, 2026-10-19) for `opening.flashMs`. The copies carry a
   * `spatialAnchor` a little behind his feet so the 3D card view sorts them behind his card (`NativeCityHitOutline.drawPose`).
   */
  private drawRims(pose: NativeCityOutlinePose, worldPxPerScreenPx: number, dtMs: number, reduced: boolean): void {
    if (this.profile.tellRims === false) { this.drawCornerRim(pose, worldPxPerScreenPx); return; }
    const armored = kumaCombatArmored(this.combat, this.tuning), opening = kumaCombatOpening(this.combat, NATIVE_CITY_COMBAT, this.tuning);
    this.armorMs = armored ? this.armorMs + dtMs : 0;
    this.openingMs = opening ? (this.openingMs === null ? 0 : this.openingMs + dtMs) : null;
    // A blow on his armour lights the rim with the body's flash (`nativeCityArmorRimColor`).
    const lit = this.impact?.hit.armored ? this.impact.screenMs : null;
    const color = armored ? nativeCityArmorRimColor(this.armorMs, reduced, lit)
      : this.openingMs !== null && kumaOpeningRimOn(this.openingMs) ? PALETTE.fightAttackNow : null;
    if (color === null) { this.drawCornerRim(pose, worldPxPerScreenPx); return; }
    // The navy ink line round the ring (`armor.inkPx`, 2026-10-19 user: 외곽선이 잘 안 보인다) keeps the steel off the pale paving.
    const armor = NATIVE_CITY_COMBAT.feel.tells.armor;
    // (The arena's corner outline fades its copies: a tell rim there is drawn whole.)
    this.rim.drawPose(this.profile.arenaMotion ? { ...pose, alpha: 1 } : pose, color, armor.rimPx * worldPxPerScreenPx,
      { color: PALETTE.navyInk, widthWorldPx: (armor.inkPx ?? 0) * worldPxPerScreenPx });
  }

  /**
   * The arena's corner outline (`arenaMotion`, 2026-10-23 arena audit — a same-colour or black-suited pair read as one lump where they met):
   * inside `corner.nearStrides` of the other body (faded in over `fadeStrides`) his corner's colour round him, `rimScreenPx` screen px — the
   * left corner warm, the right cool; whole while he casts his awakening and through a KO's ink. No rim elsewhere (the village draws only the
   * tells).
   */
  private drawCornerRim(pose: NativeCityOutlinePose, worldPxPerScreenPx: number): void {
    const arena = this.profile.arenaMotion, stepUnits = this.fighter.stepUnits;
    if (!arena || !(stepUnits > 0)) { this.rim.hide(); return; }
    const rival = arena.rival(), [ax, ay] = this.point, [bx, by] = nativeCityKumaFighterPoint(rival), spec = arena.spec.corner;
    // While he casts his awakening (the caster sank into its dark stage) and through a KO's ink (the KO freeze: either body down out of HP,
    // its fall not started — the ring dark behind both) his outline stands whole wherever the other is.
    const koInk = [this.combat, rival.combat].some(c => c.mode === "down" && !c.knockdown && c.hp <= 0 && c.modeMs <= 0);
    const alpha = koInk || this.arenaCasting() ? 1 : arenaCornerRimAlpha(Math.hypot(bx - ax, by - ay) / stepUnits, spec);
    if (alpha <= 0.01) { this.rim.hide(); return; }
    this.rim.drawPose({ ...pose, alpha }, arena.corner === 0 ? PALETTE.arenaCornerWarm : PALETTE.arenaCornerCool,
      spec.rimScreenPx * worldPxPerScreenPx);
  }

  /**
   * He casts his awakening now (`arenaMotion`): his super's swing or dash from its cut-in, his follow-up running on the other, or his
   * awakening's acting clip over his stand (`stageClip` — not the READY entrance or the victory); or his summon's KO lights him (`highlight`).
   */
  private arenaCasting(): boolean {
    const arena = this.profile.arenaMotion, combat = this.combat, staged = this.poser.staged;
    if (!arena) return false;
    return this.ownerLightMs > 0 || staged !== null && staged.clip !== "entrance" && staged.clip !== "victory"
      || (combat.mode === "attack" || combat.mode === "dash") && combat.superAttack === combat.attackId
      || arena.followUp?.() === true;
  }

  /** Records this frame and shows up to `afterimage.ghostCount` pearl ghosts from 45 ms apart while `active`. */
  private afterimage(sample: NativeCityPoseSample, active: boolean): void {
    this.afterimages.record(sample, 240);
    if (!active) { this.afterimages.hide(); return; }
    this.afterimages.show(sample.t, 45, 0.3);
  }

  /**
   * A fresh fight (a challenge, the defeat card's "다시" — the rules' reset is the session's, `nativeCityKumaFighterRematch`): nothing in
   * flight here (reaction, impact feel, rebound, block reaction, display skip, the dash's roll, afterimage, the hop's anchor).
   */
  resetPresentation(): void {
    this.reaction = null; this.impact = null; this.rebound = null; this.poser.blockReact = null; this.poser.flinchFirstMs = null;
    this.poser.standMs = 0; this.poser.guardStandMs = 0;
    this.poser.displaySkip = { attackId: -1, ms: 0 };
    this.poser.roll = null;
    this.afterimages.clear();
    this.afterimages.hide();
    this.moveFx.hide();
    this.gunFx.hide();
    this.poser.staged = null; this.poser.stuckDown = false; this.sounds = [];
    this.poser.swingLead = null; this.poser.arenaLead = ARENA_NO_LEAD; this.poser.leadRelease = null; this.poser.blowMs = null; this.poser.swingCell = null; this.poser.lastMode = null;
    this.poser.cut = null; this.poser.hurtShown = null; this.poser.snap = null; this.castGlow?.setVisible(false);
    this.poser.evade = null; this.poser.vaultLiftPx = 0; this.ownerLightMs = 0;
    if (this.anchored) { this.sprite.setData("spatialAnchor", undefined); this.anchored = false; }
  }
}
