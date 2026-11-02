import type { SpriteSheetAssetDefinition } from "../../assets/RuntimeArtTypes";
import { fighterCellDrawScale } from "../../assets/FighterDrawScale";
import { cityProject, type CityPoint, type CityViewId, type NativeCityDefinition } from "../../world/NativeCityDefinition";
import { kumaCombatGuarding } from "../../sim/cityFight/NativeCityKumaHit";
import type { KumaCombatState, KumaDash, KumaExchangePose, KumaTuning, KumaLeap } from "../../sim/cityFight/NativeCityKumaCombatState";
import { CITY_FIGHT_EXCHANGES } from "../../sim/cityFight/bout/CityFightBoutExchange";
import { kumaAirBounceMs, kumaAirRiseGravity, type KumaAir } from "../../sim/cityFight/NativeCityKumaAir";
import { nativeCityAirCell, nativeCityAirFlinch, nativeCityAirTarget, nativeCityAirTurnCarried, nativeCityAirTurnLimit, nativeCityAirTurnStep, nativeCityAirTurnWanted,
  nativeCityPivotOffset, type NativeCityAirCell } from "../effects/NativeCityAirReaction";
import { kumaScreenDelta } from "../../sim/cityFight/NativeCityKumaGeometry";
import { nativeCityKumaFighterPoint, type NativeCityKumaArtBridge, type NativeCityKumaFighterState } from "../../sim/cityFight/NativeCityKumaFighter";
import { clamp01 } from "../../sim/geom";
import { NATIVE_CITY_COMBAT, type NativeCityKumaActionKind, type NativeCityKumaAirTuning } from "../../sim/cityFight/NativeCityCombatTuning";
import type { VillageFacing } from "../../sim/VillageFacing";
import { stepIndexAt, stepsTotal } from "../animation/StepTimeline";
import { nativeCityOrthoActionClip, nativeCityOrthoActionFrame, nativeCityOrthoActionLoopFrame, nativeCityOrthoActionSteps, nativeCityOrthoActionTiming, nativeCityOrthoClip, nativeCityOrthoClipCell,
  nativeCityOrthoClipSheets, nativeCityOrthoFrame, nativeCityOrthoHitSteps, nativeCityOrthoLaunchContact, type NativeCityOrthoAction,
  type NativeCityOrthoActionClip, type NativeCityOrthoPack } from "../art/NativeCityOrthoPack";
import { kumaAfterimageActive, kumaArtMs, kumaButtSlamLift, kumaDashMove, kumaDashRollIndex, kumaDashRollStep, kumaMoveCell, kumaMoveStepAt, kumaBreakSteps,
  kumaClipFrame, kumaClipFrameAt, kumaFreezeShake, kumaMoveClip, kumaSwingClip,
  kumaDashCell, kumaDashStandIn, kumaFightGaitClip, kumaFightGaitFrame, kumaGetUpCells, kumaGrabCell, kumaGrabClip, kumaGrabStepAt, kumaGetUpSteps, kumaGroggySpan, kumaHurtSteps,
  kumaPackFallLieMs, kumaRigHitStep, kumaFrameSpec, kumaAirChaseClip, kumaPackFightTiming, type KumaDashRoll, type KumaFrameSpec } from "../art/NativeCityKumaArt";
import { NATIVE_CITY_EXCHANGE_FX } from "../effects/NativeCityExchangeFx";
import { nativeCityStaccatoHold, nativeCityStaccatoHoldMs, nativeCityStaccatoSnapIn, nativeCityStaccatoTime } from "../effects/NativeCityStaccato";
import type { NativeCityFightArt } from "../scenes/village/NativeCityFightDeps";
import { kumaSkillKind, kumaSkillSuperForm, kumaSkillThrough } from "../../sim/cityFight/NativeCityKumaSkill";
import { KUMA_AIR_CHASE_LONG, kumaAirChasing, kumaAirSpec } from "../../sim/cityFight/NativeCityKumaAirChase";
import { easeOutCubic } from "../art/easing";
import { smoothstep } from "../effects/CombatFxShapes";
import { ARENA_NO_LEAD, arenaAnticipationLead, arenaCutInertia, arenaDrawsInFront, arenaEvadeArtMs, arenaEvadeBackEndMs,
  arenaFrontMode, arenaHurtCell, arenaHurtCells, arenaHurtPush, arenaLeadRelease, arenaVaultFallShare, arenaVaultFlipLift, type ArenaBodyLead, type ArenaEvade, type ArenaFighterMotionSpec } from "./ArenaFighterMotion";
import { nativeCityPlayerVaultSupportWeight, nativeCityPlayerVaultTimeline } from "../animation/NativeCityPlayerAction";
import { hitKeys } from "../../sim/cityFight/NativeCityKumaFrames";
import type { NativeCityFootprint, NativeCityFootprintKind } from "../../sim/NativeCityActorCollision";

/*
 * 쿠마형 파이터의 자세 계산(2026-11-01 — `NativeCityKumaView` 에서 그대로 옮김). Phaser 를 들이지 않는다: 값으로 import 하는 모듈도
 * Phaser 를 값으로 들이지 않는다(뷰 쪽 타입은 `import type` 만). 스프라이트·소리·HUD 읽기는 뷰에 남는다.
 */

export interface NativeCityKumaFrameInput {
  readonly dtMs: number;
  readonly viewId: CityViewId;
  readonly travel: boolean;
  readonly player: CityPoint;
  /** Current (orbit-rotated) projection. */
  readonly projection: NativeCityDefinition;
  /** `nativeCityActorHeight` — the player's on-screen body. */
  readonly actorHeight: number;
  /** Time stops (dialogue, hidden or unfocused window): patrol and fight both hold. */
  readonly frozen: boolean;
  /** The reduced-motion setting holds the patrol only; a fight still runs. */
  readonly reducedMotion?: boolean;
  /** 몸이 있는 다른 배우(주인공·주민·거리 주민). 다음 걸음이 그 원에 파고들면 그 자리에 서서 기다린다. */
  readonly blockers?: readonly NativeCityFootprint[];
  /** He is an enemy in the visit's faction table (talked into a fight). */
  readonly hostile?: boolean;
  /** World px per screen (CSS) px — the attacker push-back is in screen px. */
  readonly worldPxPerScreenPx?: number;
  /** Walls for the chase, knockback and the walk home. */
  readonly walkable?: (from: CityPoint, to: CityPoint) => boolean;
  readonly route?: (from: CityPoint, to: CityPoint) => readonly CityPoint[] | null;
  /** Player body radius (plan units), for the stop/attack distance. */
  readonly playerRadius?: number;
  /** The player moved this frame under his own control (input or a click path): only that can be fleeing (`kuma.dash`). */
  readonly playerSteered?: boolean;
  /**
   * The side-scroll stage (`native-city-fighters.json` stage): a plan point snapped onto the fight's line, clipped to its ends. While
   * given, every step he takes (walk, chase, step-in, dash, knockback) is held on it, so he still walks, dashes, backs off and swings
   * along it.
   */
  readonly line?: (point: CityPoint) => CityPoint;

  readonly backpedal?: { readonly point: CityPoint; readonly from: CityPoint; readonly moving: boolean } | null;
}

/**
 * Who this view is beyond KUMA's look (a skinned fighter, `NativeCityFighters`). KUMA passes nothing: his tuning, footprint
 * and reaches stay the shared ones.
 */
export interface NativeCityKumaProfile {
  /** Already validated arena pack. It stays local to this view and never registers a village skin. */
  readonly pack?: NativeCityOrthoPack;

  readonly drawScalePack?: NativeCityOrthoPack;
  /** His fight tuning over KUMA's (HP, damage, attack mix, stand) — rules and feel stay KUMA's. */
  readonly tuning?: KumaTuning;
  /** His body's footprint kind (a human-sized fighter: `player`, 0.45 stride, instead of KUMA's 0.6). */
  readonly footprint?: NativeCityFootprintKind;
  /**
   * The rule-tell rims round him (`drawRims`: the armour steel, the opening's "attack now" magenta) — a read for the player who fights him.
   * False in a bout nobody plays (the arena's AI duel, 2026-10-20 game-animator: lit on about half its frames, they flattened both bodies
   * into stickers); his rules are unchanged.
   */
  readonly tellRims?: boolean;
  /**
   * The arena AI duel's body motion (2026-10-23 arena audit — `ArenaFighterMotion`): the windup's two beats, the alternating hurt cells and
   * shove, a cut swing's inertia, the corner outline and front-body sort, the KO falling from its first falling cell. `corner`: his corner
   * (0 left, warm outline; 1 right, cool); `rival`: the other corner's rules; `followUp`: his awakening's follow-up runs on the other (he is
   * still casting — lit and outlined); `rivalCrown`: the other body's drawn crown (world px, his `crownPoint`) — a vault's palms meet it.
   * With it (2026-10-23 2차) his backstep draws his evade clip and his vault its clip over the other. Absent in the village: its drawing
   * stays as it was.
   */
  readonly arenaMotion?: { readonly spec: ArenaFighterMotionSpec; readonly corner: 0 | 1; readonly rival: () => NativeCityKumaFighterState;
    readonly followUp?: () => boolean; readonly rivalCrown?: () => readonly [number, number] | null };
}

/** His swing right now, for the fight's telegraph and whooshes (`NativeCityKumaView.attackClock`). */
export interface KumaAttackClock {
  readonly action: NativeCityKumaActionKind;
  readonly attackId: number;
  readonly modeMs: number;
  readonly hitsMs: readonly number[];
  readonly totalMs: number;
  /** Slam: when the apex hold starts (the telegraph grows from here to the impact). */
  readonly apexMs: number;

  readonly commitMs: number;
  /** The anti-kite lunge (`kuma.antiKite`): it charges visibly, then pounces. */
  readonly lunge: boolean;
  readonly hitsFired: number;
  readonly direction: CityPoint;
  readonly point: CityPoint;
  /** The butt slam's leap (`KumaLeap`, locked at its takeoff; its `to` is the landing point the telegraph marks), else null. */
  readonly leap: KumaLeap | null;
  /** The swing is drawn as the jumping butt slam (`native-city-kuma-moves.json`): its takeoff is `apexMs`. */
  readonly buttSlam: boolean;
}

/** His dash right now, for the fight's telegraph line, streaks and sounds (`NativeCityKumaView.dashClock`). */
export interface KumaDashClock {
  readonly attackId: number;
  readonly phase: KumaDash["phase"];
  readonly phaseMs: number;
  readonly windupMs: number;
  readonly from: CityPoint;
  readonly target: CityPoint;
  /** His feet now. */
  readonly point: CityPoint;
  /** The charge's plan direction (homed). */
  readonly direction: CityPoint;
  readonly struck: boolean;
  /** Share of his top charge speed this frame (the streaks and dust thicken with it). */
  readonly speedShare: number;
  /** His drawn dash (`native-city-kuma-moves.json`: the roll-and-rise, the bowling tackle), else null: its boots meet the ground `landsAtMs` into
   * its pop-out / open stand (the dust ring; null: no landing). */
  readonly drawn: { readonly move: "rollRise" | "bowling"; readonly landsAtMs: number | null } | null;
}

/**
 * A clip he plays over his stand (`stageClip`): raised `liftBodies` and moved `towardBodies` toward the other (body heights) where given,
 * drawn facing away from the other when `turned`, trailing his afterimages when `ghost`.
 */
export interface NativeCityKumaStagedClip {
  readonly clip: string; readonly ms: number; readonly loop?: boolean; readonly liftBodies?: number; readonly towardBodies?: number;
  readonly turned?: boolean; readonly ghost?: boolean;
}


/** One swing of a weeble's rock to rest (`keys.wobble` on his hit clip). */
const WOBBLE_SWING_MS = 90;
/**
 * The ODDBOUT super pass (2026-10-22 4차 — user: 다채롭고 도파민 터지게): each later run of the penguin's super slide opens on his belly spin
 * (`keys.turn`) for this long, turned about every `SPIN_HALF_MS` (a top on the ice).
 */
const SUPER_TURN_MS = 150;
const SPIN_HALF_MS = 50;
/**
 * The pinball's drawn beats (`posePinball`): the striker leans `PINBALL_STEP_LEAN_DEG` into his step up to the rope; the thrown body on the
 * rope is squashed to `PINBALL_ROPE_SQUASH` and pressed `PINBALL_ROPE_PRESS_BODIES` of his body into it.
 */
const PINBALL_STEP_LEAN_DEG = 6, PINBALL_ROPE_SQUASH = 0.9, PINBALL_ROPE_PRESS_BODIES = 0.05;

const RUSH_STRIKE_CELLS = 2, RUSH_THROW_BODIES = 0.04;
/**
 * The cross's drawn beats (2026-10-25 game-animator review of the first take — `poseExchange`): the crouch pulls back `pullBodies` of his
 * body over `pullShare` of it, squashed to `pullStretch` and leaning `pullLeanDeg` away, then springs (`springMs` before the run) leaning in
 * and stretched; the turn leans back `brakeLeanDeg` through its brake, turns about once at `turnFlipShare` of it and crouches
 * (`recrouchStretch`) for `recrouchMs`; struck head on he is rocked `struckLeanDeg` and `struckPushBodies` back, easing forward.
 * Through the pass the one striking stands `depthBodies` nearer the camera, the one passed as far back.
 */
const CROSS_POSE = Object.freeze({ pullBodies: 0.06, pullShare: 0.7, pullStretch: 0.93, pullLeanDeg: 6, springMs: 50, springStretch: 1.04,
  brakeLeanDeg: 8, turnFlipShare: 0.4, recrouchMs: 50, recrouchStretch: 0.94, struckLeanDeg: 12, struckPushBodies: 0.02, depthBodies: 0.05 });
/** The head-first pop out of the ground (`keys.stuck.getUp`) holds this share of his get-up before the drawn get-up. */
const STUCK_POP_SHARE = 0.45;
/** An air chase cut off up there falls to the ground over this much fight time (ms; 12 frames — game-animator, 2026-10-23 arena audit). */
const AIR_CHASE_DROP_MS = 200;
/**
 * A vault drawn without a vault clip (`poseVaultLeap`): the air chase's stance through the vault's first `crouchShare`, its rise cell on an
 * arc to `clearBodies` of his body over the other's crown until `landShare`, then its landing cell.
 */
const ARENA_VAULT_LEAP = Object.freeze({ crouchShare: 0.08, landShare: 0.8, clearBodies: 0.15 });

const easeInOut = (t: number) => smoothstep(0, 1, clamp01(t));

/** The step `elapsedMs` into `steps`, the last one held past the end (`StepTimeline`). */
function stepAt<T extends { readonly durationMs: number }>(steps: readonly T[], elapsedMs: number): T {
  return steps[stepIndexAt(steps, elapsedMs, "hold")]!;
}

/** A vault clip's highest drawn cell top over his feet (body heights, cells before its landing), by clip (`arenaVaultPeakBodies`). */
const VAULT_PEAK = new WeakMap<object, number>();
function arenaVaultPeakBodies(clip: NativeCityOrthoActionClip): number {
  const known = VAULT_PEAK.get(clip);
  if (known !== undefined) return known;
  const steps = nativeCityOrthoActionSteps(clip), land = typeof clip.keys?.land === "number" ? clip.keys.land : steps.length;
  const peak = Math.max(1, ...steps.slice(0, land).map(step => nativeCityOrthoClipCell(clip, step.frame, false).originY / Math.max(1, clip.bodyHeight)));
  VAULT_PEAK.set(clip, peak);
  return peak;
}
/** A hit clip's hurt cells (`arenaHurtCells`), by clip (the arena's alternating flinch). */
const HURT_CELLS = new WeakMap<object, readonly number[]>();
/** A fall clip's first step that leaves its first (standing) cell, by clip (the arena's KO falls from it). */
const FALL_LEAD = new WeakMap<object, number>();

/** World px per screen (CSS) px from the frame input — 1 when it is missing or not a positive number. */
export function kumaWorldPxPerScreenPx(input: NativeCityKumaFrameInput): number {
  const world = input.worldPxPerScreenPx;
  return world !== undefined && Number.isFinite(world) && world > 0 ? world : 1;
}

/** One drawn cell of his pack: a walk or stand frame, or a cell of an action clip. */
export type KumaCell = ReturnType<typeof nativeCityOrthoFrame> | ReturnType<typeof nativeCityOrthoClipCell>;
/** One of his action clips at a facing (with its mirror). */
export type KumaClip = NonNullable<ReturnType<typeof nativeCityOrthoActionClip>>;

/** What every pose of one draw reads (`NativeCityKumaView.paint`). */
export interface KumaPaintFrame {
  readonly pack: NativeCityOrthoPack;
  readonly input: NativeCityKumaFrameInput;
  /** World px of his body height. */
  readonly bodyPx: number;
  /** The fight clock's step this frame (held by a freeze). */
  readonly fightDt: number;
  readonly combat: KumaCombatState;
  readonly engaged: boolean;
  readonly reduced: boolean;
  /** Leaning away from the one he faces: facing left, a clockwise (positive) tilt. */
  readonly away: 1 | -1;
  /** His body over the rig's sample body (`KUMA_SAMPLE_BODY_PX`): the rig's px scale with it. */
  readonly sampleK: number;
  /** His fight sheets at his facing are in. */
  readonly fightArt: boolean;
  /** His drawn hit clip at his facing, once his fight sheets are in. */
  readonly hitClip: KumaClip | null;
}

/**
 * One draw's pose before it lands on his sprite (`NativeCityKumaView.paint`): the cell (none — his walk or stand), and the exchange rig
 * over it (2026-10-09: procedural stand-ins for the drawn clips, spec "대체" — they keep the drawing's proportions; weight comes from
 * authored poses, travel and contact holds).
 */
export interface KumaPose {
  frame: KumaCell | null;
  /** The cell's drawn tremble (runtime-body px). */
  shake: readonly [number, number];
  /** The KO's darkening (0..1). */
  darken: number;
  rigAngle: number;
  rigX: number;
  rigY: number;
  /** His afterimages trail. */
  ghosting: boolean;
  /** Where the dizzy stars orbit from his feet (world px), when the pose places his head (a lying body). */
  headOverride: readonly [number, number] | null;
  /** He sorts by a point this far below his feet (a body lying toward the camera). */
  depthDy: number;
  /** The drawn reaction draws the body itself: no procedural recoil or hop on top. */
  artOwnsBody: boolean;
  /** A lift off the ground (the drawn butt slam, the stance shuffle's bounce), world px. */
  authoredHop: number;
  /** He holds his drawn guard (its idle loop's clock runs). */
  guardStanding: boolean;
  /** Drawn turned about (2026-10-22 4차, the spins — the slide's turn, the grab's hold, a cartoon down): the cell mirrored where he stands. */
  mirror: boolean;
  /** His height's scale about his feet (the arena windup's squash and stretch, `arenaMotion`; 1 elsewhere): the width takes its root's inverse. */
  stretchY: number;
}

/**
 * 자세 계산이 뷰(`NativeCityKumaView`)에게 묻는 것: 그 방향의 대결·달리기 시트가 들어왔나(없으면 요청)·시트 요청, 지금 휘두르기의 시계,
 * KO 몸이 땅에 닿는 때와 누운 몸의 가운데, 그리고 뷰가 들고 있는 입력·캐시(오프닝 뒷걸음, 걷기 보폭, 규칙 다리, 칸 그리기 배율,
 * 다른 이의 잡기가 붙든 자리).
 */
export interface KumaPoserHost {
  readonly combatArtAt: (facing: VillageFacing) => boolean;
  readonly runArtAt: (facing: VillageFacing) => boolean;
  readonly ask: (sheets: readonly SpriteSheetAssetDefinition[]) => void;
  readonly attackClock: () => KumaAttackClock | null;
  readonly koImpactMs: () => number;
  readonly koBodyOffset: () => readonly [number, number];
  readonly backpedal: () => { readonly phase: number; readonly moving: boolean } | null;
  readonly walkMeasure: () => { readonly pacePxPerSec: number; readonly stridePx: number };
  readonly artBridge: () => { readonly bridge: NativeCityKumaArtBridge } | null;
  readonly drawScale: () => ReadonlyMap<string, number>;
  readonly heldAt: () => { readonly x: number; readonly y: number } | null;
}

/**
 * 그의 이번 프레임 자세(그린 칸, 없으면 대체 리그)를 모드별로 고르고, 프레임 사이에 이어지는 자세 상태를 든다. 뷰가 이 결과를
 * 스프라이트에 놓는다(`NativeCityKumaView.place`).
 */
export class NativeCityKumaPoser {
  /** Display-only lead of his current swing's art: the freeze ate this much of a drawn contact hold (`hitLag.contactHoldMinMs`). */
  displaySkip: { attackId: number; ms: number } = { attackId: -1, ms: 0 };
  /** His guard just took a blow (fight clock): the block reaction (drawn `block` clip, else the rig's tilt). */
  blockReact: { fightMs: number } | null = null;
  screenMs = 0;
  /** Screen ms the fight clock has stood still (a hit stop) — his contact's freeze tremble (`kumaFreezeShake`); 0 once it moves. */
  frozenScreenMs = 0;
  /** 어지러움 별의 불투명도(그로기·쓰러짐), 마지막 그림의 것 — 머리 자리는 뷰의 `head`. */
  dizzyAlpha = 0;
  /** The gait's own phase while a rescaled walk or run plays (`drawnGaitPhase`): the rules' phase it last read and the one drawn. */
  /**
   * A gait's drawn phase against the rules' (`drawnGaitPhase`): `dir` the way it last stepped (+1 toward his facing, -1 backing off);
   * `fromStart` a walk that began on its first cell (`keys.fromFirstCell`).
   */
  gaitClock: { readonly clip: string; sim: number; drawn: number; dir: number; readonly fromStart: boolean } | null = null;
  /** The pinball striker's step-in on his fight walk (`stepInCell`): his rules' phase last frame and the walk's drawn phase. */
  private stepInClock: { sim: number; walk: number } | null = null;
  /** The chain beat of the flinch he is in (jab 1 / straight 2: a different drawing each, `kumaHurtSteps`); null for any other. */
  flinchBeat: 1 | 2 | null = null;
  /** The flinch length its first contact set (`hurtMs`; 0 = the default): later contacts of that swing keep its hold (`kumaHurtSteps`). */
  flinchFirstMs: number | null = null;
  /** Fight-clock ms of his drawn stance loop: it holds in a freeze like everything on the fight clock. */
  standMs = 0;
  guardStandMs = 0;

  holdCell: { readonly offset: readonly [number, number]; readonly player: string; readonly front: boolean;
    readonly hugCentreBody?: readonly [number, number] } | null = null;
  /** His drawn dash's roll so far (`kumaDashRollStep` — summed on the dash's own fight clocks, so it never runs backwards). */
  roll: KumaDashRoll | null = null;
  /**
   * The clip he plays over his stand (`stageClip`): his entrance or victory (2026-10-22 4차 — the arena's READY and KO light), or a clip of
   * his awakening's (2026-10-23 — `CityFightAwakeningMotif.casterClip`), else null.
   */
  staged: NativeCityKumaStagedClip | null = null;
  /** The facing his victory loop began at (`poseStaged`); cleared when the staged clip changes. */
  stagedFacing: VillageFacing | null = null;
  /** This down came out of the air (a spike, its bounce): a pack with `keys.stuck` lies head first in the ground. */
  stuckDown = false;
  /** His flight's turn up there (deg, head down +, `airLean`) and its phase; the air blows' count and clock last seen (`noteAirBlow`). */
  airTurnDeg = 0;
  airPhase: "fly" | "spike" | "bounce" = "fly";
  /** The fall cell he held up there last frame and its measure (a new one carries the turn). */
  airFrame: number | null = null;
  airCell: NativeCityAirCell | null = null;
  airFirst = false;
  airHits = 0;
  airSinceMs = 0;
  private airChained = false;
  /** The last blow on him was heavier than a jab (`markImpact`): the air flinch's bigger kick. */
  airBlowHeavy = false;
  /** The body he would chase, drawn this high (world px, `chaseTarget`), and his own drawn lift at his spike (the fall starts there). */
  chaseTargetPx = 0;
  private chaseSpikePx = 0;
  /**
   * His air chase cut off up there (2026-10-23 arena audit: the bell's walk home dropped the winner from the juggle to the floor in one
   * frame): the lift he was drawn at last, and the fall from it (fight ms) — he drops over `AIR_CHASE_DROP_MS` instead.
   */
  private chaseLastPx = 0;
  private chaseDrop: { readonly fromPx: number; ms: number } | null = null;

  private throughStruck: { readonly attackId: number; readonly pass: number; readonly travelMs: number } | null = null;
  /**
   * The arena's body motion (`profile.arenaMotion`, 2026-10-23 arena audit): this frame's windup lead (`poseSwing`), the lead last drawn and its
   * release once the swing stops; the blows taken (`markImpact` — the hurt cell alternates on it), the last one's weight and fight ms since;
   * the swing cell last drawn (and whether a contact was still to come), the mode last drawn, and a cut swing's inertia (screen ms).
   */
  swingLead: ArenaBodyLead | null = null;
  arenaLead: ArenaBodyLead = ARENA_NO_LEAD;
  leadRelease: { readonly from: ArenaBodyLead; ms: number } | null = null;
  blows = 0;
  blowHeavy = false;
  blowMs: number | null = null;
  swingCell: { readonly frame: KumaCell; readonly open: boolean } | null = null;
  lastMode: KumaCombatState["mode"] | null = null;
  cut: { readonly frame: KumaCell; screenMs: number } | null = null;
  /** The hurt cell last drawn in this flinch, and the cell the last blow snapped to (`arenaSnapCell`, decided once per blow). */
  hurtShown: number | null = null;
  snap: { readonly blow: number; readonly frame: number | null } | null = null;
  /**
   * The arena's evade (2026-10-23 2차, `arenaMotion`): his backstep (`combat.backstep`) drawn as his evade clip — the units it started with
   * and the `ArenaEvade` beat; null when none runs. `vaultLiftPx`: how far the drawn vault cell reaches over one body standing on his feet
   * this draw (world px — the camera frames it as a lift, `drawnLiftPx`).
   */
  evade: { startUnits: number; beat: ArenaEvade } | null = null;
  vaultLiftPx = 0;

  constructor(private readonly tuning: KumaTuning, private readonly profile: NativeCityKumaProfile, private readonly art: NativeCityFightArt,
    private readonly rules: () => NativeCityKumaFighterState, private readonly host: KumaPoserHost) {}

  /** 그의 규칙(뷰의 `fighter` 와 같은 것 — 세션 상태를 그대로 읽는다). */
  private get fighter(): NativeCityKumaFighterState { return this.rules(); }
  /** Where his feet are (plan). */
  get point(): CityPoint { return nativeCityKumaFighterPoint(this.fighter); }
  /** His frame data's own numbers (`kumaFrameSpec` of his tuning — the rules' bridge for him reads the same). */
  get frames(): KumaFrameSpec { return kumaFrameSpec(this.tuning); }

  /** The cell his dash borrows for its crouch / its open stand at that heading (`kumaDashStandIn`), once the fight sheets are in. */
  private dashStandIn(pack: NativeCityOrthoPack, facing: VillageFacing, phase: "windup" | "recover") {
    const still = this.host.combatArtAt(facing) ? nativeCityOrthoActionClip(pack, facing, "dash") : null;
    const borrowed = still ? kumaDashStandIn(still.clip, phase) : null;
    const from = borrowed ? nativeCityOrthoActionClip(pack, facing, borrowed.clip as NativeCityOrthoAction) : null;
    return borrowed && from ? nativeCityOrthoClipCell(from.clip, borrowed.frame, from.flipX) : null;
  }

  /**
   * His fight walk's cell at walk `phase` (0..1, the side stride's) at that heading (`kumaFightGaitClip`: KUMA's iron-ball `walkBall`,
   * 2026-10-11; a fighter's own `fightWalk`, 2026-10-20), else null (no such clip there, or the fight sheets not in yet).
   */
  private fightWalkCell(pack: NativeCityOrthoPack, facing: VillageFacing, phase: number) {
    const found = this.host.combatArtAt(facing) ? kumaFightGaitClip(pack, facing, "walk") : null;
    return found ? kumaFightGaitFrame(found, phase) : null;
  }

  /** His iron-ball run's cell at run `phase` (`runBall`, 2026-10-18: drawn while he runs back in), else null — like `fightWalkCell`. */
  private fightRunCell(pack: NativeCityOrthoPack, facing: VillageFacing, phase: number) {
    const found = this.host.combatArtAt(facing) ? nativeCityOrthoActionClip(pack, facing, "runBall" as NativeCityOrthoAction) : null;
    if (!found) return null;
    const n = found.clip.frames.length, k = ((Math.floor((Number.isFinite(phase) ? phase : 0) * n) % n) + n) % n;
    return nativeCityOrthoClipCell(found.clip, found.clip.frames[k] ?? k, found.flipX);
  }

  /**
   * His fight stance's first cell at that heading (held): the iron-ball stance (`fightIdleBall`) where his pack draws it, else `fightIdle`;
   * null before his fight sheets are in.
   */
  private fightStanceCell(pack: NativeCityOrthoPack, facing: VillageFacing) {
    if (!this.host.combatArtAt(facing)) return null;
    const found = nativeCityOrthoActionClip(pack, facing, "fightIdleBall" as NativeCityOrthoAction)
      ?? nativeCityOrthoActionClip(pack, facing, "fightIdle");
    return found ? kumaClipFrameAt(found, 0).frame : null;
  }

  /** This frame's pose by his mode (the drawn clip, else its stand-in): none for walking and standing (`walkOrStandCell`). */
  pose(f: KumaPaintFrame, pose: KumaPose): void {
    const { combat, engaged, fightArt, hitClip } = f, backpedal = this.host.backpedal();
    if (this.staged && this.poseStaged(f, pose, this.staged)) return;
    // The arena's vault over the other and its backstep's evade (2026-10-23 2차): their own clips where his pack draws them.
    if (!backpedal && engaged && fightArt && this.profile.arenaMotion) {
      if (combat.vault ? this.poseVault(f, pose, combat.vault) : this.evade !== null && this.poseEvade(f, pose, this.evade.beat)) return;
    }
    if (backpedal) this.poseBackpedal(f, pose, backpedal);
    else if (engaged && fightArt && combat.mode === "attack" && combat.action) this.poseSwing(f, pose, combat.action);
    else if (engaged && combat.mode === "attack" && combat.action) this.poseSwingStandIn(f, pose);
    else if (engaged && combat.exchange) this.poseExchange(f, pose, combat.exchange);
    else if (engaged && combat.mode === "dash" && combat.dash) this.poseDash(f, pose, combat.dash);
    else if (engaged && fightArt && combat.mode === "abort" && combat.action) this.poseAbort(f, pose, combat.action);
    else if (engaged && combat.mode === "hurt" && combat.air) this.poseAir(f, pose, hitClip);
    else if (engaged && hitClip && combat.mode === "hurt") this.poseHurt(f, pose, hitClip);
    else if (engaged && hitClip && combat.mode === "parried") this.poseParried(f, pose, hitClip);
    else if (engaged && hitClip && combat.mode === "break") this.poseBreak(f, pose, hitClip);
    else if (engaged && combat.mode === "down") this.poseDown(f, pose);
    else if (engaged && hitClip && combat.mode === "getup") this.poseGetUp(f, pose, hitClip);
    // A person's held guard (`KumaControl.guard`) stands in his neutral.
    else if (engaged && fightArt && (combat.mode === "cooldown" || combat.controlGuard === true) && kumaCombatGuarding(combat, this.tuning)) this.poseGuard(f, pose);
  }

  /**
   * His READY entrance or his victory loop (`stageClip`, 2026-10-22 4차): the clip on the stage's clock — the entrance once (he travels in from
   * `keys.fromStrides` behind his corner, arriving at its `keys.travelTo` step), the victory looping; an awakening's clip once or looped
   * (`loop`). False without the clip (his stand draws).
   */
  private poseStaged(f: KumaPaintFrame, pose: KumaPose, staged: NativeCityKumaStagedClip): boolean {
    // The victory faces where it began (2026-10-24 — when the winner's walk home began he turned about in the middle of his loop).
    const facing = staged.clip === "victory" ? (this.stagedFacing ??= f.combat.facing) : f.combat.facing;
    const facingClip = f.fightArt ? nativeCityOrthoActionClip(f.pack, facing, staged.clip as NativeCityOrthoAction) : null;
    if (!facingClip) return false;
    // Turned (an awakening's pass running back through the other): the same cells mirrored.
    const found = staged.turned ? { ...facingClip, flipX: !facingClip.flipX } : facingClip;
    const timing = nativeCityOrthoActionTiming(found.clip), total = Math.max(1, timing.totalMs);
    const loop = staged.loop ?? staged.clip === "victory";
    const drawn = kumaClipFrameAt(found, loop ? staged.ms % total : Math.min(total - 1, staged.ms));
    pose.frame = drawn.frame;
    if (!f.reduced) pose.shake = drawn.shake;
    pose.artOwnsBody = true;
    // An awakening's acting off the ground (2026-10-25, 이토's vault): lifted and moved toward the other as its motif says.
    if (staged.liftBodies) pose.authoredHop += staged.liftBodies * f.bodyPx;
    if (staged.towardBodies) pose.rigX -= f.away * staged.towardBodies * f.bodyPx;
    if (staged.ghost && !f.reduced) pose.ghosting = true;
    const keys = found.clip.keys as { readonly fromStrides?: number; readonly travelTo?: number } | undefined;
    if (staged.clip === "entrance" && (keys?.fromStrides ?? 0) > 0) {
      const projection = f.input.projection.projection, stepPx = this.fighter.stepUnits * Math.hypot(projection.x[0], projection.y[0]);
      const arrive = timing.startsMs[keys?.travelTo ?? 0] ?? total, k = clamp01(staged.ms / Math.max(1, arrive));
      pose.rigX += f.away * keys!.fromStrides! * stepPx * (1 - easeOutCubic(k));
      pose.ghosting = k < 1 && !f.reduced;
    }
    return true;
  }

  /** His drawn block, groggy or fall clip at his facing, once his fight sheets are in. */
  private drawnClip(f: KumaPaintFrame, action: "block" | "groggy" | "fall") {
    return f.fightArt ? nativeCityOrthoActionClip(f.pack, f.combat.facing, action) : null;
  }

  /** The opening backpedal: his own forward walk clip, its phase running backwards (`nativeCityBackpedalPhase`); standing once it ends. */
  private poseBackpedal(f: KumaPaintFrame, pose: KumaPose, backpedal: { readonly phase: number; readonly moving: boolean }): void {
    const { pack, combat, engaged } = f;
    const facing = engaged ? combat.facing : this.fighter.patrol.facing, clip = nativeCityOrthoClip(pack, facing, "walk");
    // The fight's walk (KUMA's iron-ball `walkBall`, a fighter's `fightWalk`) where his pack draws it, and once it ends he stands in his
    // fight stance's first cell (held: the fight clock has not started) — the ball never vanishes between the backpedal and his first
    // swing, and nobody waits out READY in his town idle (2026-10-24).
    pose.frame = (backpedal.moving ? this.fightWalkCell(pack, facing, backpedal.phase) : this.fightStanceCell(pack, facing))
      ?? nativeCityOrthoFrame(pack, facing, backpedal.phase * clip.frames.length * clip.durationMs / 1000, backpedal.moving, "walk");
  }

  /** His drawn swing (his fight sheets are in): the swing clip at the rules' clock, the butt slam's drawn lift, its afterimages. */
  private poseSwing(f: KumaPaintFrame, pose: KumaPose, swing: NativeCityKumaActionKind): void {
    if (swing === "grab") { this.poseGrab(f, pose); return; }
    const { pack, bodyPx, combat } = f;
    const found = kumaSwingClip(pack, combat.facing, swing, combat.special ?? null);
    const skip = this.displaySkip.attackId === combat.attackId ? this.displaySkip.ms : 0;
    const artMs = found ? Math.min(nativeCityOrthoActionTiming(found.clip).totalMs,
      kumaArtMs(found.clip, swing, combat.modeMs, this.frames, combat.windupScale) + skip) : 0;
    const action = found ? kumaClipFrameAt(found, artMs) : null;
    if (action) { pose.frame = action.frame; pose.shake = action.shake; }
    // His contact held through the hit stop trembles on screen time (2026-10-17, the move's `freezeShake`): pressed into the ground.
    const tremble = found && action && !f.reduced ? kumaFreezeShake(found, action.sequenceIndex, this.frozenScreenMs) : null;
    if (tremble) pose.shake = [pose.shake[0] + tremble[0], pose.shake[1] + tremble[1]];
    if (found?.move === "buttSlam") { pose.authoredHop = kumaButtSlamLift(found.clip, artMs) * bodyPx; pose.artOwnsBody = true; }
    // His air combo's own ending turned about as it strikes (`keys.spinCell`, 2026-10-22 4차 — the penguin's belly top on the bounce).
    const spinCell = kumaAirChasing(combat.special) && found && action ? found.clip.keys?.spinCell : undefined;
    if (typeof spinCell === "number" && !f.reduced && nativeCityOrthoActionSteps(found!.clip)[action!.sequenceIndex]?.frame === spinCell) {
      pose.mirror = Math.floor(this.screenMs / SPIN_HALF_MS) % 2 === 1;
    }
    const clock = this.host.attackClock();
    pose.ghosting = found?.clip.keys?.bodyTrail !== "none" && clock !== null && kumaAfterimageActive(clock)
      // His air chase streaks the whole way (2026-10-22: speedy and flashy).
      || kumaAirChasing(combat.special) && !f.reduced;
    // The arena (`arenaMotion`): the swing cell a cut would hold, and the windup's two beats on a plain combo / slam (a skill, an air chase,
    // the lunge, a super or the butt slam moves its body its own way).
    if (this.profile.arenaMotion && clock && pose.frame) {
      this.swingCell = { frame: pose.frame, open: combat.hitsFired < clock.hitsMs.length };
      const plain = (swing === "combo" || swing === "fast" || swing === "slam") && !combat.special && !combat.lunge
        && combat.superAttack !== combat.attackId && found?.move !== "buttSlam";
      if (plain && !f.reduced) this.swingLead = arenaAnticipationLead(clock.modeMs, clock.hitsMs[0] ?? 0, this.profile.arenaMotion.spec.anticipation);
    }
  }


  private poseGrab(f: KumaPaintFrame, pose: KumaPose): void {
    const { pack, combat, reduced } = f, found = kumaGrabClip(pack, combat.facing);
    const step = kumaGrabStepAt(combat.modeMs, combat.grab != null, this.tuning.grab.move);
    const index = found ? kumaGrabCell(found.clip, step.cell, this.tuning.grab.move) : null;
    if (found && index !== null) {
      pose.frame = nativeCityOrthoClipCell(found.clip, index, found.flipX);
      // Template px @ body 640 (side_left), mirrored with the cell, as runtime-body px (`shake`).
      const k = found.clip.bodyHeight / 640;
      if (!reduced) pose.shake = [(found.flipX ? -1 : 1) * step.shake[0] * k, step.shake[1] * k];
    }
    this.holdCell = step.hold;
    // A grab whose clip spins (`keys.spin`, 2026-10-22 4차 — the crab's super): from the catch to the throw he turns about every `ms`, the
    // held body swinging round to his other side with him (`place` mirrors the hold).
    const spin = found?.clip.keys?.spin as { readonly ms?: number } | undefined;
    if (spin && combat.grab != null && step.hold && !reduced) pose.mirror = Math.floor(combat.modeMs / Math.max(1, spin.ms ?? 80)) % 2 === 1;
    if (step.hold) pose.depthDy = step.hold.front ? -4 : 4;
  }

  /**
   * His swing before his fight sheets are in: the rules swing on his pack's beats all the same (`attackClock`, the telegraph above him),
   * so his standing frame (`walkOrStandCell`) leans into each contact over its lead and eases back (`rig.kuma.attackStandInLeanDeg`).
   */
  private poseSwingStandIn(f: KumaPaintFrame, pose: KumaPose): void {
    const { reduced, away } = f;
    const rig = NATIVE_CITY_COMBAT.exchangeFx.rig.kuma;
    const clock = this.host.attackClock();
    if (clock && !reduced) {
      let pulse = 0;
      for (const hitMs of clock.hitsMs) {
        const t = clock.modeMs - hitMs;
        pulse = Math.max(pulse, t < 0 ? clamp01(1 + t / 160) ** 2 : 1 - clamp01(t / 140));
      }
      pose.rigAngle = -away * rig.attackStandInLeanDeg * pulse;
    }
  }

  /**
   * The dash (`kuma.dash`): a planted crouch leaning in, then the charge on his `dash` clip (the side launches on its grounded travel
   * stride, then flies on the still; else his run frame tilted forward), the slide on the still; standing open after a whiff draws his
   * idle frame.
   */
  private poseDash(f: KumaPaintFrame, pose: KumaPose, dash: KumaDash): void {
    if (kumaSkillKind(dash.special) && f.fightArt && this.poseSkillDash(f, pose, dash)) return;
    const { pack, input, combat, reduced, sampleK, fightArt } = f;
    const spec = NATIVE_CITY_COMBAT.kuma.dash;
    const [sx] = kumaScreenDelta(input.projection.projection, dash.heading);
    const forward = combat.facing.endsWith("left") ? -1 : combat.facing.endsWith("right") ? 1 : sx < 0 ? -1 : 1;
    // His drawn dash where his pack draws it (`native-city-kuma-moves.json`: the roll-and-rise, or the bowling tackle when it is the
    // special): the same phases, its cells picked by name.
    const drawnClip = fightArt ? kumaMoveClip(pack, combat.facing, "dash", dash.special ?? null) : null;
    const drawnDash = drawnClip ? kumaDashMove(drawnClip.clip) : null;
    const moveCell = (name: string) => {
      const index = drawnClip ? kumaMoveCell(drawnClip.clip, name) : null;
      return index === null ? null : nativeCityOrthoClipCell(drawnClip!.clip, index, drawnClip!.flipX);
    };
    // Template px @ body 640 (side_left), mirrored with the cell, as runtime-body px (`shake`).
    const moveShake = (px: readonly [number, number]): readonly [number, number] => {
      const k = drawnClip ? drawnClip.clip.bodyHeight / 640 : 0;
      return [(drawnClip?.flipX ? -1 : 1) * px[0] * k, px[1] * k];
    };
    // The pop-out after a strike / the open stand after a whiff: the move's steps, then (the stand) the breather cell.
    const finishing = drawnDash && (dash.phase === "pop" || dash.phase === "recover")
      ? kumaMoveStepAt(dash.phase === "pop" ? drawnDash.popSteps : dash.struck ? drawnDash.recoverStruckSteps : drawnDash.recoverSteps, dash.phaseMs) : null;
    if (drawnDash && finishing) {
      pose.frame = moveCell(finishing.cell);
      pose.shake = moveShake(finishing.shake);
    } else if (drawnDash && dash.phase === "slide" && dash.struck && drawnDash.struck) {
      // The rising swing's strike: the ball's impact cell from the strike frame (held through the freeze), skidding on after a dodge.
      pose.frame = moveCell(drawnDash.struck);
    } else if (drawnDash && (dash.phase === "travel" || dash.phase === "slide")) {
      // The dive, then the roll along the line, one 90 deg cell per step of time (`kumaDashRollIndex`), summed frame by frame so it slows
      // through the skid instead of running backwards (`kumaDashRollStep`); a roll neither trembles nor stretches.
      const launch = drawnDash.launch, slideMs = dash.phase === "slide" ? dash.phaseMs : 0;
      if (dash.phase === "travel" && launch && dash.travelMs < launch[1]) pose.frame = moveCell(launch[0]);
      else {
        this.roll = kumaDashRollStep(drawnDash, this.roll, combat.attackId, Math.max(0, dash.travelMs - (launch?.[1] ?? 0)), slideMs, dash.speedShare);
        pose.frame = moveCell(drawnDash.roll[kumaDashRollIndex(drawnDash, this.roll.cells)]!);
      }
      pose.ghosting = dash.phase === "travel";
    } else if (drawnDash && dash.phase === "windup") {
      // The crouch (hugging the ball / the tuck) snapped in (`feel.staccato.anticipation`) and held, trembling in whole steps — already
      // low: preserve its drawn proportions.
      const k = nativeCityStaccatoSnapIn(dash.phaseMs);
      pose.frame = moveCell(drawnDash.windup);
      if (!reduced && k >= 1) pose.rigX += (Math.floor(dash.phaseMs / NATIVE_CITY_COMBAT.feel.staccato.stepMs) % 2 === 0 ? 1 : -1) * 1.5 * sampleK;
      if (!reduced) this.dashWindBack(f, pose, dash, k);
    } else if (dash.phase === "windup") {
      // Snapped into the crouch (`feel.staccato.anticipation`: a settle key, then the full crouch held rigid) — no ease into it.
      const k = nativeCityStaccatoSnapIn(dash.phaseMs);
      // The side borrows the combo's coil cell for the crouch (`keys.standIns`): already low, so only a lighter lean on top.
      const coil = this.dashStandIn(pack, combat.facing, "windup");
      if (coil) pose.frame = coil;
      const lean = coil ? spec.crouchCellLeanDeg : spec.crouchLeanDeg;
      pose.rigAngle = forward * lean * k;
      if (!reduced) this.dashWindBack(f, pose, dash, k);
    } else if (dash.phase === "travel" || dash.phase === "slide") {
      const still = fightArt ? nativeCityOrthoActionClip(pack, combat.facing, "dash") : null;
      if (still) {
        const cell = kumaDashCell(still.clip, dash.phase, dash.phaseMs);
        pose.frame = nativeCityOrthoClipCell(still.clip, cell.frame, still.flipX);
        // One still would slide like a cut-out: it trembles across the travel (a square wave — whole frames) without deforming it.
        // The grounded stride is drawn motion with its boots on the floor: neither.
        const [hx, hy] = kumaScreenDelta(input.projection.projection, dash.heading), length = Math.hypot(hx, hy);
        if (!reduced && cell.airborne && length > 1e-6) {
          const side = Math.floor(this.screenMs * spec.stillTrembleHz * 2 / 1000) % 2 === 0 ? 1 : -1;
          const px = side * spec.stillTremblePx * kumaWorldPxPerScreenPx(input);
          pose.rigX += -hy / length * px; pose.rigY += hx / length * px;
        }
      } else {
        const gait = this.host.runArtAt(combat.facing) ? "run" : "walk", clip = nativeCityOrthoClip(pack, combat.facing, gait);
        pose.frame = nativeCityOrthoFrame(pack, combat.facing, combat.phase * clip.frames.length * clip.durationMs / 1000, true, gait);
        pose.rigAngle = forward * spec.fallbackTiltDeg * (dash.phase === "slide" ? 0.6 : 1);
      }
      pose.ghosting = dash.phase === "travel";
    } else if (dash.phase === "recover") {
      // Open after a whiff: the side borrows the slam's breather cell (hunched, arms hanging) — the opening drawn; else his idle.
      pose.frame = this.dashStandIn(pack, combat.facing, "recover");
    }
    // (A plain dash never pops out — no drawn dash: the pop phase draws his stand.)
  }

  /**
   * A bout's exchange set piece (2026-10-25, `CityFightBoutExchange` — 교차 돌파; numbers after the same day's game-animator review,
   * `CROSS_POSE`): the crouch pulled back, squashed and leaning away, sprung forward over its last beat; the run on his run cycle leaning in,
   * his afterimages streaking; his strike in passing on his combo's contact cell (the last pass his slam's, held through his skid and past
   * his blow — the cut's follow-through); taken from behind, his run cell thrown forward and easing back; the turn a lean back through its
   * brake, turned about once, then crouched low for the next run.
   */
  private poseExchange(f: KumaPaintFrame, pose: KumaPose, ex: KumaExchangePose): void {
    const { pack, combat, reduced, fightArt, bodyPx, away } = f, spec = CITY_FIGHT_EXCHANGES.cross, P = CROSS_POSE;
    const forward = -away, tilt = NATIVE_CITY_COMBAT.kuma.dash.fallbackTiltDeg;
    // The `hit`-th contact cell of his move (its last one past its end): each pass of the cross strikes with the next blow of his string.
    const contactCell = (action: "combo" | "slam", hit = 0) => {
      const found = fightArt ? nativeCityOrthoActionClip(pack, combat.facing, action) : null;
      const hits = found ? nativeCityOrthoHitSteps(found.clip) : [], step = hits[Math.min(hit, hits.length - 1)];
      const frame = found && step !== undefined ? nativeCityOrthoActionSteps(found.clip)[step]?.frame : undefined;
      return found && frame !== undefined ? nativeCityOrthoClipCell(found.clip, frame, found.flipX) : null;
    };
    const runCell = () => {
      const gait = this.host.runArtAt(combat.facing) ? "run" : "walk", clip = nativeCityOrthoClip(pack, combat.facing, gait);
      return nativeCityOrthoFrame(pack, combat.facing, combat.phase * clip.frames.length * clip.durationMs / 1000, true, gait);
    };
    // His strike: its move's contact cell (a slam's one, a string's `slashPass`-th).
    const strikeCell = () => contactCell(ex.slashAction, ex.slashAction === "slam" ? 0 : ex.slashPass) ?? contactCell("combo", ex.slashPass);
    if (ex.kind === "pinball") { this.posePinball(f, pose, ex, strikeCell, runCell); return; }
    if (ex.kind === "rush") {
      // The rush (`CityFightBoutRush`, a power struggle): striking with the other, his string's first two contact cells in turn, thrown
      // forward a little; pushed (`struckMs` set) he is on his block cell, rocked back a little. No afterimages (2026-10-26: a cell every
      // 70 ms with its ghosts read as a bug). The breaking slam held.
      if (ex.finalSlash) { pose.frame = strikeCell(); return; }
      const striking = ex.struckMs === null;
      const block = this.drawnClip(f, "block");
      pose.frame = striking ? contactCell("combo", ex.slashPass % RUSH_STRIKE_CELLS)
        : block ? nativeCityOrthoClipCell(block.clip, nativeCityOrthoActionSteps(block.clip)[0]?.frame ?? 0, block.flipX) : null;
      if (!reduced) pose.rigX += (striking ? 1 : -0.5) * forward * RUSH_THROW_BODIES * bodyPx;
      return;
    }
    // Running through each other, the two stand apart in depth (2026-10-25 review: they merged into one heap at the pass): the one
    // striking a little nearer the camera, the one passed a little further.
    const rival = this.profile.arenaMotion?.rival().combat.exchange ?? null;
    const striking = (pose: KumaExchangePose | null) => pose?.slashMs != null && (pose.finalSlash || pose.slashMs < spec.slashMs);
    if (!reduced && ex.phase !== "set") pose.rigY += (striking(ex) ? 1 : striking(rival) ? -1 : 0) * P.depthBodies * bodyPx;
    if (ex.phase === "set") {
      pose.frame = this.dashStandIn(pack, combat.facing, "windup");
      if (reduced) return;
      // Pulled back and squashed over most of the crouch, then sprung forward over its last beat.
      const springAt = spec.setMs - P.springMs, k = clamp01(ex.phaseMs / Math.max(1, springAt * P.pullShare));
      if (ex.phaseMs < springAt) {
        pose.rigX += away * P.pullBodies * bodyPx * easeOutCubic(k);
        pose.stretchY *= 1 - (1 - P.pullStretch) * k;
        pose.rigAngle = -forward * P.pullLeanDeg * k;
      } else {
        pose.rigAngle = forward * tilt;
        pose.stretchY *= P.springStretch;
      }
      return;
    }
    if (ex.phase === "turn") {
      const flipAt = ex.turnMs * P.turnFlipShare;
      if (ex.phaseMs < spec.turnBrakeMs) { pose.frame = runCell(); pose.rigAngle = -forward * P.brakeLeanDeg; }
      else pose.frame = this.dashStandIn(pack, combat.facing, "windup") ?? runCell();
      // Turned about once (his rules face the old way until the run): crouched low for a beat after it — the next run's anticipation.
      if (ex.phaseMs >= flipAt) {
        pose.mirror = true;
        if (!reduced && ex.phaseMs < flipAt + P.recrouchMs) pose.stretchY *= P.recrouchStretch;
      }
      return;
    }
    const slashing = ex.slashMs !== null && (ex.finalSlash || ex.slashMs < spec.slashMs);
    const struck = ex.struckMs !== null && ex.struckMs < spec.struckMs;
    if (slashing) pose.frame = strikeCell();
    if (!pose.frame) {
      pose.frame = runCell();
      pose.rigAngle = forward * tilt;
      // Met head on: rocked back over his run and easing forward again.
      if (struck && !reduced) {
        const k = 1 - ex.struckMs / spec.struckMs;
        pose.rigAngle -= forward * P.struckLeanDeg * k;
        pose.rigX -= forward * P.struckPushBodies * bodyPx * k;
      }
    }
    pose.ghosting = !reduced;
  }

  /**
   * The pinball (2026-10-25 교전 패턴 2 — `CityFightBoutPinball`): the striker steps up on his fight walk and waits in his stand, his strike on
   * its contact cell (the slam's held); the thrown body flies on his drawn fall's air cells (thrown out on its flung cell, back on its falling
   * one) lifted along the flight's arc, and hangs on the rope on his struck cell.
   */
  private posePinball(f: KumaPaintFrame, pose: KumaPose, ex: KumaExchangePose, strikeCell: () => KumaCell | null, runCell: () => KumaCell): void {
    const spec = CITY_FIGHT_EXCHANGES.pinball, { reduced, bodyPx, away, hitClip } = f;
    if (ex.phase !== "step") this.stepInClock = null;
    if (ex.phase === "step" || ex.phase === "ready") {
      const slashing = ex.slashMs !== null && (ex.finalSlash || ex.slashMs < spec.slashMs);
      if (slashing) pose.frame = strikeCell();
      else if (ex.phase === "step") { pose.frame = this.stepInCell(f) ?? runCell(); pose.rigAngle = -away * PINBALL_STEP_LEAN_DEG; }
      return;
    }
    const struck = hitClip ? nativeCityOrthoClipCell(hitClip.clip, nativeCityOrthoActionSteps(hitClip.clip)[0]?.frame ?? 0, hitClip.flipX) : null;
    // On the rope (2026-10-25 first take: his struck cell read as standing there): flung back into it, squashed against it.
    pose.frame = this.fallAirCell(f, ex.phase === "back" ? "fall" : "flung") ?? struck;
    pose.artOwnsBody = true;
    if (ex.phase === "rope" && !reduced) { pose.stretchY *= PINBALL_ROPE_SQUASH; pose.rigX += away * PINBALL_ROPE_PRESS_BODIES * bodyPx; }
    if (!reduced) pose.authoredHop = ex.liftBodies * bodyPx;
    pose.ghosting = !reduced && ex.phase === "out";
  }


  private stepInCell(f: KumaPaintFrame): KumaCell | null {
    const { pack, combat } = f, run = this.host.artBridge()?.bridge.runStridePx() ?? 0, walk = this.host.walkMeasure().stridePx;
    const clock = this.stepInClock ??= { sim: combat.phase, walk: 0 };
    const step = ((((combat.phase - clock.sim) % 1) + 1.5) % 1) - 0.5;
    clock.sim = combat.phase;
    const cell = this.fightWalkCell(pack, combat.facing, clock.walk);
    if (!cell) return null;
    if (run > 0 && walk > 0) clock.walk = (((clock.walk + step * run / (walk * this.fightDrawScale(f, cell))) % 1) + 1) % 1;
    return this.fightWalkCell(pack, combat.facing, clock.walk) ?? cell;
  }

  /** His drawn fall's air cell (`keys.air` — the flung first beat, a falling one), else the fall's first cell / the one before its impact. */
  private fallAirCell(f: KumaPaintFrame, key: "flung" | "fall"): KumaCell | null {
    const fall = this.drawnClip(f, "fall");
    if (!fall) return null;
    const own = fall.clip.keys?.air as Readonly<Record<string, unknown>> | undefined, steps = nativeCityOrthoActionSteps(fall.clip);
    const hit = nativeCityOrthoHitSteps(fall.clip)[0] ?? steps.length;
    const index = typeof own?.[key] === "number" ? own[key] : key === "flung" ? steps[0]?.frame : steps[Math.max(0, hit - 1)]?.frame;
    return index === undefined ? null : nativeCityOrthoClipCell(fall.clip, index, fall.flipX);
  }

  /**
   * A dash skill (`KumaTuning.skill` slide / flight / feint, 2026-10-22) on his `skill` clip (`keys.windupTo`, `run`, `recoverFrom`): the tell
   * as drawn over the crouch, the two run cells in turn through the charge, the first recover cell through the brake, then the recover as
   * drawn (the landing, the get-up, the feint's stop). False without the clip (the plain dash draws it).
   */
  private poseSkillDash(f: KumaPaintFrame, pose: KumaPose, dash: KumaDash): boolean {
    const found = kumaMoveClip(f.pack, f.combat.facing, "dash", dash.special ?? null);
    const keys = found?.clip.keys as { readonly windupTo?: number; readonly run?: readonly number[]; readonly recoverFrom?: number;
      readonly launch?: number; readonly struck?: number; readonly struckInPassing?: boolean; readonly bodyTrail?: string; readonly turn?: number;
      readonly faceOnRecover?: boolean } | undefined;
    if (!found || keys?.windupTo === undefined || keys.recoverFrom === undefined) return false;
    // A later run of his super slide (`superSkill.passes`) opens on his belly spin (`keys.turn`), turned about every `SPIN_HALF_MS`.
    if (keys.turn !== undefined && dash.phase === "travel" && (dash.pass ?? 0) > 0 && dash.travelMs < SUPER_TURN_MS) {
      pose.frame = nativeCityOrthoClipCell(found.clip, keys.turn, found.flipX);
      pose.mirror = !f.reduced && Math.floor(dash.travelMs / SPIN_HALF_MS) % 2 === 1;
      pose.ghosting = !f.reduced;
      return true;
    }
    const timing = nativeCityOrthoActionTiming(found.clip), at = (step: number) => timing.startsMs[step] ?? timing.totalMs;
    const span = (step: number | undefined) => step === undefined ? 0 : at(step + 1) - at(step);
    const run = keys.run ?? [keys.windupTo], windupTo = at(keys.windupTo), recoverFrom = at(keys.recoverFrom);
    // The run's drawn launch (the belly dive, 2026-10-22) over its first ms; the bump of his front striking before the recover.
    const through = kumaSkillThrough(kumaSkillKind(dash.special), this.tuning, kumaSkillSuperForm(dash.special));
    const launchMs = span(keys.launch), bumpMs = dash.struck && !through ? span(keys.struck) : 0;
    // struck cell over the run from the moment it struck (no stop).
    const struckMs = this.throughStruckMs(f.combat.attackId, dash, through && keys.struck !== undefined && keys.struckInPassing === true);
    let artMs: number;
    if (dash.phase === "windup") artMs = Math.min(windupTo - 1, dash.phaseMs * windupTo / Math.max(1, dash.windupMs));
    else if (dash.phase === "travel" && struckMs !== null && dash.travelMs - struckMs < span(keys.struck)) artMs = at(keys.struck!);
    else if (dash.phase === "travel" && keys.launch !== undefined && dash.travelMs < launchMs) artMs = at(keys.launch);
    else if (dash.phase === "travel") {
      const stepMs = Math.max(1, at(run[0]! + 1) - at(run[0]!)), k = Math.floor((dash.travelMs - launchMs) / stepMs) % run.length;
      artMs = at(run[k]!);
    } else if (dash.phase === "slide") artMs = recoverFrom;
    else if (keys.struck !== undefined && dash.phaseMs < bumpMs) artMs = at(keys.struck);
    else artMs = Math.min(timing.totalMs - 1, recoverFrom + dash.phaseMs - bumpMs);
    const drawn = kumaClipFrameAt(found, artMs);
    pose.frame = drawn.frame;
    if (!f.reduced) pose.shake = drawn.shake;
    // A move that draws its own trail (the slide's ice) leaves no afterimage ghost over the body (`keys.bodyTrail: "none"`).
    pose.ghosting = dash.phase === "travel" && keys.bodyTrail !== "none";
    // gun-kata and sliding shot aimed at the empty floor ahead for half a second).
    if (keys.faceOnRecover === true && (dash.phase === "recover" || dash.phase === "slide")) {
      const p = f.combat.point, o = f.input.player;
      pose.mirror = (o[0] - p[0]) * dash.heading[0] + (o[1] - p[1]) * dash.heading[1] < 0;
    }
    return true;
  }

  /** The run's ms a through-dash struck at (`throughStruck`), recorded the first frame it shows struck; null before it or without one. */
  private throughStruckMs(attackId: number, dash: KumaDash, drawsIt: boolean): number | null {
    const pass = dash.pass ?? 0, seen = this.throughStruck;
    if (!drawsIt || !dash.struck) return seen && seen.attackId === attackId && seen.pass === pass ? seen.travelMs : null;
    if (!seen || seen.attackId !== attackId || seen.pass !== pass) this.throughStruck = { attackId, pass, travelMs: dash.travelMs };
    return this.throughStruck!.travelMs;
  }

  /**
   * His drawn lift in his air chase (world px): from his jump (`leap.takeoffMs`) up to the body he chases by his first contact, with it through
   * the juggle, then falling from his spike to the ground at his landing cell (`keys.land`). 0 outside it and without its clip.
   */
  airChaseLift(f: KumaPaintFrame): number {
    const raw = this.airChaseRaw(f);
    if (raw > 0 || f.combat.mode === "attack" || f.combat.air) {
      this.chaseDrop = null;
      this.chaseLastPx = raw;
      return raw;
    }
    // Cut out of the chase while still up (the bell sends him home): he falls from where he was drawn.
    if (this.chaseLastPx > 0) this.chaseDrop = { fromPx: this.chaseLastPx, ms: 0 };
    this.chaseLastPx = 0;
    const drop = this.chaseDrop;
    if (!drop) return 0;
    drop.ms += f.fightDt;
    const k = clamp01(drop.ms / AIR_CHASE_DROP_MS);
    if (k >= 1) { this.chaseDrop = null; return 0; }
    return drop.fromPx * (1 - k * k);
  }

  private airChaseRaw(f: KumaPaintFrame): number {
    const combat = f.combat;
    if (combat.mode !== "attack" || !kumaAirChasing(combat.special)) return 0;
    const found = kumaAirChaseClip(f.pack, combat.facing, combat.special === KUMA_AIR_CHASE_LONG);
    const timing = found ? kumaPackFightTiming(f.pack, "combo", combat.facing, this.frames, 1, combat.special) : null;
    if (!found || !timing?.leap) return 0;
    const art = nativeCityOrthoActionTiming(found.clip), land = typeof found.clip.keys?.land === "number" ? art.startsMs[found.clip.keys.land] ?? art.totalMs : art.totalMs;
    const t = combat.modeMs, takeoff = timing.leap.takeoffMs, first = timing.hitsMs[0] ?? land;
    const spike = timing.hitsMs[timing.airSpike ?? timing.hitsMs.length - 1] ?? first;
    if (t <= takeoff) return 0;
    if (t < first) return this.chaseTargetPx * easeOutCubic(clamp01((t - takeoff) / Math.max(1, first - takeoff)));
    if (t < spike) return (this.chaseSpikePx = this.chaseTargetPx);
    const k = clamp01((t - spike) / Math.max(1, land - spike));
    return this.chaseSpikePx * (1 - k * k);
  }

  /**
   * The dash crouch's wind-back: it pulls back against the charge (`windBackStrides`, as far as the crouch has snapped in, `k`), then the
   * launch springs from it.
   */
  private dashWindBack(f: KumaPaintFrame, pose: KumaPose, dash: KumaDash, k: number): void {
    const projection = f.input.projection.projection;
    const [hx, hy] = kumaScreenDelta(projection, dash.heading), length = Math.hypot(hx, hy);
    const stepPx = this.fighter.stepUnits * Math.hypot(projection.x[0], projection.y[0]);
    const back = NATIVE_CITY_COMBAT.kuma.dash.windBackStrides * stepPx * k;
    if (length > 1e-6) { pose.rigX -= hx / length * back; pose.rigY -= hy / length * back; }
  }

  /** A cancelled swing (`kuma.attack`): the windup rewinds from where it was cut, then he stands (`walkOrStandCell`). */
  private poseAbort(f: KumaPaintFrame, pose: KumaPose, swing: NativeCityKumaActionKind): void {
    const { pack, combat } = f;
    const spec = NATIVE_CITY_COMBAT.kuma.attack, rewindMs = spec.abortRecoveryMs * clamp01(spec.abortRewindShare);
    const found = kumaSwingClip(pack, combat.facing, swing, combat.special ?? null);
    if (found && combat.modeMs < rewindMs) {
      const artMs = kumaArtMs(found.clip, swing, combat.abortFromMs, this.frames, combat.windupScale) * (1 - combat.modeMs / Math.max(1, rewindMs));
      pose.frame = kumaClipFrameAt(found, artMs).frame;
    }
  }

  /** The flinch as long as it really lasts (`hurtMs`: the chain's computed hold, or the ender's skid then his turn). */
  private poseHurt(f: KumaPaintFrame, pose: KumaPose, hitClip: KumaClip): void {
    const { combat } = f;
    const first = this.flinchFirstMs !== null && this.flinchFirstMs > 0 ? this.flinchFirstMs : undefined;
    const steps = kumaHurtSteps(hitClip.clip, combat.hurtMs > 0 ? combat.hurtMs : undefined, combat.retaliate, this.flinchBeat ?? undefined,
      combat.retaliate ? undefined : first);
    const index = stepIndexAt(steps, combat.modeMs, "hold"), frame = this.arenaSnapCell(hitClip.clip, index) ?? steps[index]!.frame;
    pose.frame = nativeCityOrthoClipCell(hitClip.clip, frame, hitClip.flipX);
    this.hurtShown = frame;
    pose.artOwnsBody = hitClip.clip.keys?.bodyMotion === "drawn";
    // A round body rocks back and forth to rest like a weeble (`keys.wobble`: each swing's degrees, the first away from the blow — the
    // penguin, 2026-10-22 action review: his hit only shook sideways).
    const wobble = hitClip.clip.keys?.wobble;
    if (Array.isArray(wobble) && !f.reduced) {
      const k = Math.floor(combat.modeMs / WOBBLE_SWING_MS), amp = wobble[k];
      if (typeof amp === "number") pose.rigAngle += f.away * (k % 2 === 0 ? 1 : -1) * amp * Math.sin(Math.PI * (combat.modeMs % WOBBLE_SWING_MS) / WOBBLE_SWING_MS);
    }
  }

  /**
   * Thrown up for the air combo (`combat.air`, `rhythm.launch.air`): his drawn fall held off the ground — its first cell for the launch's
   * first beat, then only its two flight cells, the one two steps before the ground impact while he rises and the one right before it while
   * he falls (2026-10-21, user: 공중 타격이 어색 — every air hit restarted the fall from its flung cell through its arched upright one, so he
   * stood up in mid-air twice a second). An air hit keeps the flight (his flash and the hit's shake tell it). The spike holds the cell before
   * the impact; its bounce flies the cells between the impact and the lying step. The rules' height lifts him (`place`). Without a drawn
   * fall: the flinch.
   */
  private poseAir(f: KumaPaintFrame, pose: KumaPose, hitClip: KumaClip | null): void {
    const { pack, combat } = f, air = combat.air!, spec = kumaAirSpec(this.tuning);
    const fall = this.drawnClip(f, "fall");
    this.noteAirBlow(air);
    if (fall && spec) {
      const impact = this.host.koImpactMs(), lie = Math.max(impact, kumaPackFallLieMs(pack, combat.facing) ?? impact);
      const steps = nativeCityOrthoActionSteps(fall.clip), { startsMs } = nativeCityOrthoActionTiming(fall.clip);
      const hit = nativeCityOrthoHitSteps(fall.clip)[0] ?? steps.length;
      // His flight's cells (fall clip frames): the pack's own (`keys.air` — the launch's first beat, rising, falling, driven down, an air
      // blow's freeze; 2026-10-23), else the first step's for the first beat and the two steps' before the ground impact.
      type AirCellKey = "flung" | "rise" | "fall" | "spike" | "hit";
      const own = fall.clip.keys?.air as Readonly<Record<AirCellKey, unknown>> | undefined;
      const cell = (key: AirCellKey) => typeof own?.[key] === "number" ? own[key] : null;
      const frameAt = (index: number) => steps[Math.max(0, Math.min(steps.length - 1, index))]?.frame ?? 0;
      const falling = cell("fall") ?? frameAt(hit - 1), rising = cell("rise") ?? frameAt(hit - 2);
      // The launch's first beat: the first cell for as long as the clip holds it.
      const flungMs = startsMs[steps.findIndex(step => step.frame !== steps[0]?.frame)] ?? 0;
      const first = air.hits === 0 && !air.spiked && air.sinceMs < flungMs;
      const flinch = nativeCityAirFlinch(air, this.airChained, this.airBlowHeavy, NATIVE_CITY_COMBAT.exchangeFx.rig.kuma.air);
      let frame: number, shake: readonly [number, number] = [0, 0];
      if (air.bounced) {
        // Its bounce flies the cells between the impact and the lying step.
        const at = nativeCityOrthoActionFrame(pack, combat.facing, "fall", impact + (lie - 1 - impact) * clamp01(air.sinceMs / Math.max(1, kumaAirBounceMs(spec))));
        frame = at ? frameAt(at.sequenceIndex) : falling; shake = at?.shake ?? shake;
      } else if (air.spiked) {
        // first — his flail's upright body read as jumping down feet first, game-animator 2026-10-23).
        const held = air.sinceMs < (NATIVE_CITY_COMBAT.exchangeFx.rig.kuma.air.kickSteps[0]?.[0] ?? 0);
        frame = held && cell("hit") !== null ? cell("hit")! : cell("spike") ?? falling;
      }
      else if (first) frame = cell("flung") ?? frameAt(stepIndexAt(steps, air.sinceMs, "hold"));
      else if (flinch.held && cell("hit") !== null) frame = cell("hit")!;
      else frame = air.vy > 0 ? rising : falling;
      pose.frame = nativeCityOrthoClipCell(fall.clip, frame, fall.flipX); pose.shake = shake; pose.artOwnsBody = true;
      this.airLean(f, pose, air, spec, fall, frame, first, flinch);
      return;
    }
    this.airTurnDeg = 0;
    if (hitClip) this.poseHurt(f, pose, hitClip);
  }

  /**
   * The arena's flinch (`arenaMotion`, 2026-10-23 arena audit — one hurt cell held through a whole string): on the snapped step (`kumaHurtSteps`'
   * held recoil, `index`) each blow takes the other hurt cell (`arenaHurtCell`); null elsewhere and outside the arena (the steps' own cell).
   */
  private arenaSnapCell(clip: KumaClip["clip"], index: number): number | null {
    if (!this.profile.arenaMotion || this.blows <= 0) return null;
    const { recoil, stagger } = hitKeys(clip);
    if (index !== Math.min(recoil, Math.max(0, Math.floor(NATIVE_CITY_COMBAT.kuma.hurt.framesBeforeRecoil)))) return null;
    if (this.snap?.blow === this.blows) return this.snap.frame;
    let cells = HURT_CELLS.get(clip);
    if (!cells) {
      const count = clip.sequence && clip.sequence.length > 0 ? clip.sequence.length : clip.frames.length;
      cells = arenaHurtCells(Array.from({ length: count }, (_, i) => kumaClipFrame(clip, i)), recoil, stagger[1]);
      HURT_CELLS.set(clip, cells);
    }
    this.snap = { blow: this.blows, frame: arenaHurtCell(cells, this.blows - 1, this.blowHeavy, this.hurtShown) };
    return this.snap.frame;
  }

  /** The air blows' rhythm for the flinch: whether this one came under `chainMs` after the one before (its clock reset in between). */
  private noteAirBlow(air: KumaAir): void {
    if (air.hits > this.airHits) this.airChained = this.airSinceMs < NATIVE_CITY_COMBAT.exchangeFx.rig.kuma.air.chainMs;
    this.airHits = air.hits; this.airSinceMs = air.sinceMs;
  }


  private airLean(f: KumaPaintFrame, pose: KumaPose, air: KumaAir, spec: NativeCityKumaAirTuning, fall: KumaClip, frame: number, first: boolean,
    flinch: ReturnType<typeof nativeCityAirFlinch>): void {
    const t = NATIVE_CITY_COMBAT.exchangeFx.rig.kuma.air, measured = nativeCityAirCell(fall.clip.key ?? fall.clip.pages?.[0]?.key ?? "", frame);
    const launchSpeed = Math.sqrt(2 * kumaAirRiseGravity(spec) * Math.max(0, spec.liftBodies));
    const limit = measured ? nativeCityAirTurnLimit(measured, air.spiked, t) : 0;
    const wanted = first ? 0 : nativeCityAirTurnWanted(measured, nativeCityAirTarget(air, launchSpeed, t), limit);
    // A new cell up there carries the line his body pointed along (not the launch's first beat's — its near-upright line would stand him up
    // again); the spike and the bounce turn at once (their contact).
    if (frame !== this.airFrame) this.airTurnDeg = first || this.airFirst ? 0 : nativeCityAirTurnCarried(this.airTurnDeg, this.airCell, measured, limit);
    this.airFrame = frame; this.airCell = measured; this.airFirst = first;
    const phase = air.bounced ? "bounce" : air.spiked ? "spike" : "fly";
    this.airTurnDeg = nativeCityAirTurnStep(this.airTurnDeg, wanted, f.fightDt, phase !== this.airPhase && phase !== "fly", t);
    this.airPhase = phase;
    const share = f.reduced ? t.reduced : { kick: 1, turn: 1, push: 1 };
    // The turn lowers the head: clockwise when the drawn head is on the right (an unmeasured cell turns none).
    const head = measured ? measured.head * (fall.flipX ? -1 : 1) : f.away;
    const deg = this.airTurnDeg * share.turn * head + f.away * flinch.kickDeg * share.kick;
    const [cx, cy] = measured ? [measured.center[0] * (fall.flipX ? -1 : 1), measured.center[1]] : [0, -t.pivotFallbackBodies];
    const [dx, dy] = nativeCityPivotOffset(deg, cx * f.bodyPx, cy * f.bodyPx);
    pose.rigAngle += deg;
    pose.rigX += dx + f.away * flinch.pushBodies * share.push * f.bodyPx;
    pose.rigY += dy;
  }

  /** Parried (spec beat 4): hit frames `parriedFrames` over the recoil, tipped back off balance and partly recovering. */
  private poseParried(f: KumaPaintFrame, pose: KumaPose, hitClip: KumaClip): void {
    const { combat, away } = f;
    const rig = NATIVE_CITY_COMBAT.exchangeFx.rig.kuma;
    const [a, b] = rig.parriedFrames.map(step => kumaRigHitStep(hitClip.clip, step)) as [number, number];
    const k = clamp01(nativeCityStaccatoTime(combat.modeMs) / Math.max(1, combat.recoilMs ?? NATIVE_CITY_COMBAT.parry.recoilMs));
    pose.frame = nativeCityOrthoClipCell(hitClip.clip, kumaClipFrame(hitClip.clip, Math.min(b, a + Math.floor(k * (b - a + 1)))), hitClip.flipX);
    pose.rigAngle = away * (rig.parriedRotDeg * Math.sin(Math.PI / 2 * Math.min(1, k * 1.6)) - 4 * Math.max(0, k - 0.6));
  }

  /** Groggy (the poise break): the recoil, then a held stagger frame swayed (or the drawn groggy loop), dizzy stars, then the recover frames. */
  private poseBreak(f: KumaPaintFrame, pose: KumaPose, hitClip: KumaClip): void {
    const { pack, combat, reduced, away, sampleK } = f;
    const rig = NATIVE_CITY_COMBAT.exchangeFx.rig.kuma;
    const steps = kumaBreakSteps(hitClip.clip), step = stepAt(steps, combat.modeMs), span = kumaGroggySpan(hitClip.clip);
    const loop = step.groggy ? this.drawnClip(f, "groggy") : null;
    if (loop) {
      const total = Math.max(1, nativeCityOrthoActionTiming(loop.clip).totalMs);
      pose.frame = nativeCityOrthoActionFrame(pack, combat.facing, "groggy", (combat.modeMs - span.startMs) % total)?.frame ?? null;
    }
    pose.frame ??= nativeCityOrthoClipCell(hitClip.clip, step.frame, hitClip.flipX);
    const t = combat.modeMs - span.startMs;
    if (step.groggy && !loop && !reduced) {
      pose.rigAngle = away * rig.groggySwayDeg * Math.sin(2 * Math.PI * t / Math.max(1, rig.groggySwayMs));
      pose.rigX = rig.groggyShiftPx * sampleK * Math.sin(2 * Math.PI * t / Math.max(1, rig.groggyShiftMs));
    } else if (step.groggy && loop && !reduced && combat.facing.startsWith("up")) {
      // The back diagonal's drawn loop sways weakly: a little procedural sway on top.
      pose.rigAngle = away * rig.drawnGroggyBackSwayDeg * Math.sin(2 * Math.PI * t / Math.max(1, rig.groggySwayMs));
    }
    this.dizzyAlpha = combat.modeMs >= span.startMs ? clamp01(t / 200) * clamp01((span.endMs - combat.modeMs) / 200) : 0;
  }

  /**
   * Down — the KO (spec beats 5-6): launched (rotate up to koSquashBounce.rotDeg about the feet, lifted), lands with one small bounce,
   * then lies darkened. A drawn `fall` clip plays instead (landing on its impact step) and holds its lying frame. A knockdown falls the
   * same way, neither darkened nor dizzy.
   */
  private poseDown(f: KumaPaintFrame, pose: KumaPose): void {
    const { pack, bodyPx, combat, away, sampleK, hitClip } = f;
    const rig = NATIVE_CITY_COMBAT.exchangeFx.rig.kuma;
    const sq = NATIVE_CITY_EXCHANGE_FX.fx.koSquashBounce, launch = NATIVE_CITY_COMBAT.exchangeFx.ko.launchMs, t = combat.modeMs;
    const tilt = Math.abs(sq.rotDeg), fall = this.drawnClip(f, "fall");
    if (fall) {
      const at = nativeCityOrthoActionFrame(pack, combat.facing, "fall", t);
      if (at) { pose.frame = at.frame; pose.shake = at.shake; }
      // The arena (`arenaMotion`, 2026-10-23 audit — the KO stood upright ~12 frames once its freeze let go): the fall starts on its first
      // falling cell; the rules' beats (its ground impact) stay the clip's.
      if (at && t > 0 && this.profile.arenaMotion) {
        const lead = this.fallLead(fall.clip);
        if (at.sequenceIndex < lead) pose.frame = nativeCityOrthoClipCell(fall.clip, nativeCityOrthoActionSteps(fall.clip)[lead]!.frame, fall.flipX);
      }
      // Lying, a body that flails turns its lying cell and its flail in turn (`keys.lieLoop` — the crab on his back, 2026-10-22).
      const loop = fall.clip.keys?.lieLoop as { readonly cells?: readonly number[]; readonly ms?: number } | undefined;
      const lieMs = kumaPackFallLieMs(pack, combat.facing);
      if (loop?.cells && loop.cells.length > 0 && lieMs !== null && t >= lieMs && !f.reduced) {
        const cell = loop.cells[Math.floor((t - lieMs) / Math.max(1, loop.ms ?? 150)) % loop.cells.length]!;
        pose.frame = nativeCityOrthoClipCell(fall.clip, cell, fall.flipX);
      }
      // The cartoon downs (2026-10-22 4차, ODDBOUT): brought down out of the air, a body whose pack draws it lies head first in the ground
      // kicking (`keys.stuck`: its cells in turn); landing, a round body spins on the floor like a top (`keys.lieSpin`: each half turn's ms
      // from the ground impact, slowing to rest the way it fell).
      const stuck = this.stuckDown ? fall.clip.keys?.stuck as { readonly cells?: readonly number[]; readonly ms?: number } | undefined : undefined;
      if (stuck?.cells && stuck.cells.length > 0) {
        const cell = f.reduced ? stuck.cells[0]! : stuck.cells[Math.floor(Math.max(0, t) / Math.max(1, stuck.ms ?? 130)) % stuck.cells.length]!;
        pose.frame = nativeCityOrthoClipCell(fall.clip, cell, fall.flipX);
        pose.shake = [0, 0];
      }
      const spin = fall.clip.keys?.lieSpin as readonly number[] | undefined;
      if (spin && !stuck?.cells && !f.reduced && t >= this.host.koImpactMs()) {
        let left = t - this.host.koImpactMs(), turns = 0;
        while (turns < spin.length && left >= spin[turns]!) { left -= spin[turns]!; turns++; }
        pose.mirror = turns < spin.length && turns % 2 === 1;
      }
      // Catch the heel with the body first. The shared freeze keeps modeMs at zero; the first released tick starts the fall
      // and the rule-owned displacement together. No extra clock, stretch or opponent-specific frame number.
      const catchFrame = t <= 0 ? nativeCityOrthoLaunchContact(pack, combat.facing) : null;
      if (catchFrame) { pose.frame = catchFrame; pose.shake = [0, 0]; }
      // The stars circle over the lying body, and it sorts by its own middle when it lies toward the camera.
      const [ox, oy] = this.host.koBodyOffset();
      pose.headOverride = [ox, oy - 0.25 * bodyPx];
      pose.depthDy = Math.max(0, oy);
    } else if (hitClip) {
      pose.frame = nativeCityOrthoClipCell(hitClip.clip, kumaClipFrame(hitClip.clip, kumaRigHitStep(hitClip.clip, rig.koFrame)), hitClip.flipX);
      // The procedural launch and landing held on twos (`feel.staccato`).
      const t = nativeCityStaccatoTime(combat.modeMs);
      if (t < launch) {
        const k = t / Math.max(1, launch);
        pose.rigAngle = away * (rig.koStartDeg + (tilt - rig.koStartDeg) * k * k);
        pose.rigY = -sq.liftPx * sampleK * Math.sin(Math.PI * Math.min(1, k * 1.15));
      } else {
        const a = t - launch;
        pose.rigAngle = away * tilt;
        if (a < sq.landSquashMs) {
          pose.rigAngle = away * (tilt - sq.bounceRotAmpDeg * Math.sin(Math.PI * clamp01((a - 80) / 180)));
        }
      }
    }
    // The drawn fall lands on its own impact step.
    const land = fall ? this.host.koImpactMs() : launch;
    pose.ghosting = !combat.knockdown && t > 0 && t < land * 0.5;
    // A knockdown (`kuma.knockdown`) is not the KO: no darkening, no dizzy stars — he is getting back up.
    if (!combat.knockdown) {
      pose.darken = 1 - (1 - NATIVE_CITY_COMBAT.kuma.down.darken) * clamp01((t - land) / 200);
      this.dizzyAlpha = t < land + 600 ? 1 : clamp01(1 - (t - land - 600) / 400);
    }
    pose.artOwnsBody = fall !== null;
  }

  /** The fall's first step off its first (standing) cell, before its ground impact; 0 when it starts falling at once. */
  private fallLead(clip: KumaClip["clip"]): number {
    let lead = FALL_LEAD.get(clip);
    if (lead === undefined) {
      const steps = nativeCityOrthoActionSteps(clip), impact = nativeCityOrthoHitSteps(clip)[0] ?? steps.length;
      const first = steps.findIndex(step => step.frame !== steps[0]?.frame);
      lead = first > 0 && first < impact ? first : 0;
      FALL_LEAD.set(clip, lead);
    }
    return lead;
  }

  /** Getting up: the drawn get-up cells, else the fall played backwards, else the hit clip easing upright. */
  private poseGetUp(f: KumaPaintFrame, pose: KumaPose, hitClip: KumaClip): void {
    const { pack, combat, away } = f;
    const rig = NATIVE_CITY_COMBAT.exchangeFx.rig.kuma;
    const fall = this.drawnClip(f, "fall");
    // The side's drawn get-up (`keys.getUp`): lying, the iron-ball scoop crouch (`ballSwing`'s atlas), standing — over its own length.
    // Out of the ground head first (`keys.stuck.getUp`, 2026-10-22 4차): the yank and the dazed sit hold the first share of his get-up.
    const getUpMs = stepsTotal(kumaGetUpSteps(hitClip.clip, this.frames));
    const pop = this.stuckDown && fall ? (fall.clip.keys?.stuck as { readonly getUp?: number } | undefined)?.getUp : undefined;
    if (fall && pop !== undefined && combat.modeMs < getUpMs * STUCK_POP_SHARE) {
      pose.frame = nativeCityOrthoClipCell(fall.clip, pop, fall.flipX);
      return;
    }
    const cells = fall ? kumaGetUpCells(fall.clip, getUpMs) : null;
    const at = cells && cells.length > 0 ? stepAt(cells, combat.modeMs) : null;
    const from = at ? nativeCityOrthoActionClip(pack, combat.facing, at.clip as NativeCityOrthoAction) : null;
    if (at && from) {
      pose.frame = nativeCityOrthoClipCell(from.clip, at.frame, from.flipX);
    } else if (fall) {
      const timing = nativeCityOrthoActionTiming(fall.clip), lie = fall.clip.lieSequenceIndex;
      const lieAt = lie !== undefined ? timing.startsMs[lie] ?? timing.totalMs : timing.totalMs;
      const getUp = stepsTotal(kumaGetUpSteps(hitClip.clip, this.frames));
      pose.frame = nativeCityOrthoActionFrame(pack, combat.facing, "fall", lieAt * (1 - clamp01(combat.modeMs / Math.max(1, getUp))))?.frame ?? null;
    } else {
      pose.frame = nativeCityOrthoClipCell(hitClip.clip, stepAt(kumaGetUpSteps(hitClip.clip, this.frames), combat.modeMs).frame, hitClip.flipX);
      // Up off the ground: the KO tilt eases back to standing.
      pose.rigAngle = away * Math.abs(NATIVE_CITY_EXCHANGE_FX.fx.koSquashBounce.rotDeg) * (1 - easeInOut(nativeCityStaccatoTime(combat.modeMs) / Math.max(1, rig.getUpMs)));
    }
  }

  /**
   * Guard stance between attacks (spec beat 3): the drawn block clip's guard cell, else the combo clip's guard frame; a blow on his guard
   * plays the block reaction (the drawn clip, else the block frame tipped back).
   */
  private poseGuard(f: KumaPaintFrame, pose: KumaPose): void {
    const { pack, fightDt, combat, reduced, away } = f;
    const rig = NATIVE_CITY_COMBAT.exchangeFx.rig.kuma;
    const block = this.drawnClip(f, "block"), react = this.blockReact;
    if (block) {
      // The guard cell held; a blow on it plays the clip from its impact step back to the guard cell (its last step is the anchor stance).
      const timing = nativeCityOrthoActionTiming(block.clip), at = (timing.hitsMs[0] ?? 0) + (react?.fightMs ?? 0);
      const reacting = react !== null && at < (timing.startsMs.at(-1) ?? timing.totalMs);
      if (reacting) {
        const played = nativeCityOrthoActionFrame(pack, combat.facing, "block", at);
        if (played) { pose.frame = played.frame; pose.shake = played.shake; }
      } else if (!(combat.movedPx > 0)) {
        // During a guarded back-step the gait owns his feet; an actual block reaction still takes priority.
        const guardFrame = typeof block.clip.keys?.guardFrame === "number" ? block.clip.keys.guardFrame : rig.drawnGuardFrame;
        pose.guardStanding = true;
        this.guardStandMs = reduced ? 0 : this.guardStandMs + fightDt;
        pose.frame = nativeCityOrthoActionLoopFrame(pack, combat.facing, "guardIdle", this.guardStandMs)?.frame
          ?? nativeCityOrthoClipCell(block.clip, Math.min(block.clip.frames.length - 1, guardFrame), block.flipX);
      }
    } else {
      const combo = nativeCityOrthoActionClip(pack, combat.facing, "combo"), reacting = react !== null && react.fightMs < rig.blockMs;
      if (combo && (reacting || !(combat.movedPx > 0))) pose.frame = nativeCityOrthoClipCell(combo.clip, kumaClipFrame(combo.clip, reacting ? rig.blockFrame : rig.guardFrame), combo.flipX);
      // Tipped back on the blow's first frame, held, then stepped upright (`feel.staccato`).
      if (reacting) pose.rigAngle = away * rig.blockTiltDeg * nativeCityStaccatoHold(react.fightMs, nativeCityStaccatoHoldMs(rig.blockMs));
    }
  }

  /**
   * No pose drew him this frame: his walk or run (the chase, the walk home, the patrol), his fight stance between swings, or the
   * iron-ball walk in the fight. Without a dedicated fight gait, movement uses the authored walk/run cycle.
   */
  walkOrStandCell(f: KumaPaintFrame): KumaCell {
    const { pack, fightDt, combat, engaged, reduced } = f;
    let frame: KumaCell | null = null;
    const facing = engaged ? combat.facing : this.fighter.patrol.facing;
    const phase = engaged ? combat.phase : this.fighter.patrol.phase;
    const moving = (engaged ? combat.movedPx : this.fighter.patrol.movedPx) > 0;
    // The chase's run (`kuma.chase`) once its sheets are in; before that the walk clip carries the run's phase.
    const gait = engaged && combat.mode === "chase" && combat.running && this.host.runArtAt(facing) ? "run" : "walk";
    // Squared up and standing between swings (not the patrol, nor the walk home), or on his mark before the bout starts (the fight is on,
    // his rules still idle — READY → FIGHT!). That stand was his town idle: upright and, in the arena, at his fight scale, so he towered
    // over his stance and dropped into it on FIGHT! (2026-10-24, 사용자: "존 시나는 경기 시작할 때 idle에서 엄청 커").
    const standing = !moving && (engaged ? ["chase", "cooldown", "abort"].includes(combat.mode) : f.input.hostile === true);
    // His drawn fight stance (`fightIdle`, 2026-10-10 KOF stage 2; the side only): fists low, knees bent, breathing in a loop on the
    // fight clock (it holds in a freeze), from its first cell each time he stands; reduced motion holds that cell. Its feet are the
    // guard's, so a swing starting from it does not slide. Since 2026-10-11 it holds the iron ball (`fightIdleBall`, its boots the
    // ball swing's ready cell's) where his pack draws it.
    const stance = standing && this.host.combatArtAt(facing)
      ? nativeCityOrthoActionClip(pack, facing, "fightIdleBall" as NativeCityOrthoAction) ?? nativeCityOrthoActionClip(pack, facing, "fightIdle") : null;
    if (stance) {
      this.standMs = reduced ? 0 : this.standMs + fightDt;
      const loopMs = Math.max(1, nativeCityOrthoActionTiming(stance.clip).totalMs);
      frame = kumaClipFrameAt(stance, this.standMs % loopMs).frame;
    }
    // Walking in the fight (the chase's walk, his step back — not the walk home): the iron-ball walk where drawn.
    if (!frame && engaged && moving && gait === "walk" && combat.mode !== "return") {
      frame = this.fightWalkCell(pack, facing, phase);
      const fromStart = kumaFightGaitClip(pack, facing, "walk")?.clip.keys?.fromFirstCell === true;
      if (frame) frame = this.fightWalkCell(pack, facing, this.drawnGaitPhase(f, phase, frame, "fightWalk", fromStart)) ?? frame;
    }
    // Running back in (the chase's run): the iron-ball run where drawn.
    if (!frame && engaged && moving && gait === "run") {
      frame = this.fightRunCell(pack, facing, phase);
      if (frame) frame = this.fightRunCell(pack, facing, this.drawnGaitPhase(f, phase, frame, "fightRun")) ?? frame;
    }
    if (!frame) {
      // One shared phase (side stride); each heading's clip maps it onto its own cycle.
      const clip = nativeCityOrthoClip(pack, facing, gait), at = (p: number) => p * clip.frames.length * clip.durationMs / 1000;
      frame = nativeCityOrthoFrame(pack, facing, at(phase), moving, gait);
      if (moving) frame = nativeCityOrthoFrame(pack, facing, at(this.drawnGaitPhase(f, phase, frame, gait)), moving, gait);
      this.standMs = 0;
    }
    if (!moving || standing) this.gaitClock = null;
    return frame;
  }


  private drawnGaitPhase(f: KumaPaintFrame, phase: number, cell: KumaCell, clip: string, fromStart = false): number {
    const scale = this.fightDrawScale(f, cell), clock = this.gaitClock;
    if (scale === 1 && !fromStart) { this.gaitClock = null; return phase; }
    if (!clock || clock.clip !== clip) {
      this.gaitClock = { clip, sim: phase, drawn: fromStart ? 0 : phase, dir: 1, fromStart };
      return this.gaitClock.drawn;
    }
    const step = ((((phase - clock.sim) % 1) + 1.5) % 1) - 0.5;
    clock.sim = phase;
    if (step !== 0) clock.dir = Math.sign(step);
    clock.drawn = (((clock.drawn + step / scale) % 1) + 1) % 1;
    return clock.drawn;
  }

  /**
   * A cell's draw scale (`FighterDrawScale`) while he fights — engaged, or anywhere in the arena's AI duel (its READY stand too). His town
   * patrol keeps his true scale (2026-10-19, user decision: the town's stand and walk are true size; the fight art stands taller).
   */
  fightDrawScale(f: KumaPaintFrame, cell: Pick<KumaCell, "texture" | "frame">): number {
    return f.engaged || this.profile.arenaMotion ? fighterCellDrawScale(this.host.drawScale(), cell.texture, cell.frame) : 1;
  }


  gaitRig(f: KumaPaintFrame, pose: KumaPose): void {
    const { pack, combat, engaged, reduced, bodyPx } = f;
    if (!engaged || combat.movedPx <= 0 || combat.running || combat.mode === "return" || !this.host.combatArtAt(combat.facing)) return;
    const found = kumaFightGaitClip(pack, combat.facing, "walk"), clock = this.gaitClock;
    const keys = found?.clip.keys as { readonly sway?: number; readonly bob?: number; readonly rootSnap?: boolean;
      readonly cyclesPerStride?: number } | undefined;
    if (keys?.rootSnap === true && found && clock?.clip === "fightWalk") {
      const cells = found.clip.frames.length * Math.max(1, Math.round(keys.cyclesPerStride ?? 1));
      const at = clock.drawn * cells, fraction = at - Math.floor(at), covered = clock.dir > 0 ? fraction : 1 - fraction;
      pose.rigX -= clock.dir * (combat.facing.includes("left") ? -1 : 1) * covered * this.host.walkMeasure().stridePx / cells;
    }
    if (reduced) return;
    const turn = 2 * Math.PI * combat.phase;
    if (typeof keys?.sway === "number") pose.rigAngle += keys.sway * Math.sin(turn);
    if (typeof keys?.bob === "number") pose.rigY -= keys.bob * bodyPx * Math.abs(Math.sin(turn * 2));
  }

  /**
   * The arena motion's clocks before this frame's pose (`profile.arenaMotion`): the last blow's fight ms, a cut swing's screen ms, and a new
   * cut — a swing with a contact still to come that a blow turned into a flinch (not a launch).
   */
  arenaMotionClocks(combat: KumaCombatState, dtMs: number, fightDt: number): void {
    this.swingLead = null;
    this.evadeClock(combat, fightDt);
    if (this.blowMs !== null) this.blowMs += fightDt;
    if (this.cut) this.cut.screenMs += dtMs;
    if (combat.mode !== "hurt" || combat.air) { this.cut = null; this.hurtShown = null; }
    else if (this.lastMode === "attack" && this.swingCell?.open) this.cut = { frame: this.swingCell.frame, screenMs: 0 };
    if (combat.mode !== "attack") this.swingCell = null;
  }

  /**
   * His backstep's evade beat (2026-10-23 2차, `ArenaEvade`): it starts as the rules' step back (`combat.backstep`) does — its units the
   * bout AI's whole step (`boutAi.react.backstepStrides`), the first seen already part walked — runs on its progress, then its return on the
   * fight clock while he stands: a swing, a blow, a walk or the vault ends it.
   */
  private evadeClock(combat: KumaCombatState, fightDt: number): void {
    const back = combat.backstep ?? 0;
    if (combat.mode === "chase" && back > 1e-9 && !combat.vault) {
      const whole = Math.max(back, (this.tuning.boutAi?.react.backstepStrides ?? 0) * this.fighter.stepUnits);
      if (!this.evade || this.evade.beat.phase === "return" || back > this.evade.startUnits + 1e-9) this.evade = { startUnits: whole, beat: { phase: "back", progress: 0, returnMs: 0 } };
      this.evade.beat = { phase: "back", progress: clamp01(1 - back / this.evade.startUnits), returnMs: 0 };
      return;
    }
    const evade = this.evade;
    if (!evade) return;
    if ((combat.mode !== "chase" && combat.mode !== "cooldown") || combat.vault) { this.evade = null; return; }
    if (evade.beat.phase === "back") { evade.beat = { phase: "return", progress: 1, returnMs: 0 }; return; }
    if (combat.movedPx > 0) { this.evade = null; return; }
    evade.beat = { ...evade.beat, returnMs: evade.beat.returnMs + Math.max(0, fightDt) };
  }

  /**
   * The arena clip `actions`' first his pack draws at his facing, once its sheets are in (asked for here otherwise — `requestCombatArt`
   * already did on the stage); null: none drawn (yet).
   */
  private arenaClip(f: KumaPaintFrame, actions: readonly NativeCityOrthoAction[]): { readonly clip: NativeCityOrthoActionClip; readonly flipX: boolean } | null {
    for (const action of actions) {
      const found = nativeCityOrthoActionClip(f.pack, f.combat.facing, action);
      if (!found) continue;
      const sheets = nativeCityOrthoClipSheets(found.clip);
      if (sheets.every(sheet => this.art.textureKey(sheet.key) !== null)) return found;
      this.host.ask(sheets);
      return null;
    }
    return null;
  }


  private poseEvade(f: KumaPaintFrame, pose: KumaPose, beat: ArenaEvade): boolean {
    const found = this.arenaClip(f, ["backstep", "dodge"]);
    if (!found) return false;
    const ms = arenaEvadeArtMs(beat, arenaEvadeBackEndMs(nativeCityOrthoActionSteps(found.clip)), nativeCityOrthoActionTiming(found.clip).totalMs);
    if (ms === null) { this.evade = null; return false; }
    const drawn = kumaClipFrameAt(found, ms);
    pose.frame = drawn.frame;
    if (!f.reduced) pose.shake = drawn.shake;
    return true;
  }


  private poseVault(f: KumaPaintFrame, pose: KumaPose, vault: NonNullable<KumaCombatState["vault"]>): boolean {
    const found = this.arenaClip(f, ["vault"]);
    if (!found) return this.poseVaultLeap(f, pose, vault);
    const clip = found.clip, timing = nativeCityOrthoActionTiming(clip);
    const ms = Math.min(timing.totalMs - 1, clamp01(vault.ms / Math.max(1, vault.totalMs)) * timing.totalMs);
    // 2026-10-31), and its palms, float and top with it.
    const drawn = kumaClipFrameAt(found, ms), frame = drawn.frame, k = this.fightDrawScale(f, frame), scale = f.bodyPx / frame.bodyHeight * k;
    pose.frame = frame;
    if (!f.reduced) pose.shake = drawn.shake;
    pose.artOwnsBody = true;
    const keys = clip.keys ?? {}, palmHeight = keys.palmHeightPx, contactTravel = keys.contactTravelPx;
    if (typeof keys.apex === "number") { this.poseVaultFlip(f, pose, clip, ms, frame.originY * scale); return true; }
    const crown = this.profile.arenaMotion?.rivalCrown?.() ?? null, timeline = nativeCityPlayerVaultTimeline(f.pack, f.combat.facing);
    if (crown && timeline && typeof palmHeight === "number" && typeof contactTravel === "number") {
      const weight = nativeCityPlayerVaultSupportWeight(timeline, ms);
      const source = f.bodyPx / (clip.sourceBodyHeight ?? clip.bodyHeight) * k, sign = frame.flipX ? -1 : 1;
      const [x, y] = cityProject(this.point, f.input.projection);
      const palmX = x + sign * (contactTravel * source - timeline.overPx * f.bodyPx / clip.bodyHeight), palmY = y - palmHeight * source;
      pose.rigX += (crown[0] - palmX) * weight; pose.rigY += (crown[1] - palmY) * weight;
    }
    const float = Math.max(0, (frame.originY - frame.frameHeight) * scale);
    const fall = keys.fall, fallStep = typeof fall === "number" ? nativeCityOrthoActionSteps(clip)[fall] : undefined;
    if (fallStep) pose.rigY += float * arenaVaultFallShare(ms, timing.startsMs[fall as number] ?? 0, fallStep.durationMs);
    // The camera frames a lifted body as one body over its lift: the cell's top less a body (the handstand reaches ~2.3 bodies up) — up to
    // the landing its highest cell's, so the frame is out before he is up there (it follows in ~0.1 s; the handstand comes 0.2 s in).
    const land = typeof keys.land === "number" ? timing.startsMs[keys.land] ?? timing.totalMs : timing.totalMs;
    const peak = ms < land ? (arenaVaultPeakBodies(clip) * k - 1) * f.bodyPx : 0;
    this.vaultLiftPx = Math.max(0, peak, frame.originY * scale - pose.rigY - f.bodyPx);
    return true;
  }


  private poseVaultFlip(f: KumaPaintFrame, pose: KumaPose, clip: NativeCityOrthoActionClip, ms: number, topPx: number): void {
    const keys = clip.keys ?? {}, steps = nativeCityOrthoActionSteps(clip), { startsMs, totalMs } = nativeCityOrthoActionTiming(clip);
    const at = (key: unknown, fallback: number) => typeof key === "number" ? startsMs[key] ?? fallback : fallback;
    const apex = keys.apex as number, apexStep = steps[apex];
    if (!apexStep) return;
    const takeoff = at(keys.takeoff, 0), land = at(keys.land, totalMs), apexMs = (startsMs[apex] ?? 0) + apexStep.durationMs / 2;
    const cell = nativeCityOrthoClipCell(clip, apexStep.frame, false), cellScale = f.bodyPx / cell.bodyHeight;
    const bottom = Math.max(0, (cell.originY - cell.frameHeight) * cellScale);
    const crown = this.profile.arenaMotion?.rivalCrown?.() ?? null, [, y] = cityProject(this.point, f.input.projection);
    const over = crown ? Math.max(0, y - crown[1]) : f.bodyPx;
    const lift = Math.max(0, over + ARENA_VAULT_LEAP.clearBodies * f.bodyPx - bottom);
    pose.authoredHop = lift * arenaVaultFlipLift(ms, takeoff, apexMs, land);
    const peak = ms < land ? arenaVaultPeakBodies(clip) * f.bodyPx + lift - f.bodyPx : 0;
    this.vaultLiftPx = Math.max(0, peak, topPx + pose.authoredHop - f.bodyPx);
  }


  private poseVaultLeap(f: KumaPaintFrame, pose: KumaPose, vault: NonNullable<KumaCombatState["vault"]>): boolean {
    const found = this.arenaClip(f, ["airCombo" as NativeCityOrthoAction, "dodge"]);
    const steps = found ? nativeCityOrthoActionSteps(found.clip) : [], keys = found?.clip.keys ?? {};
    const rise = typeof keys.takeoff === "number" ? keys.takeoff : 1, land = typeof keys.land === "number" ? keys.land : steps.length - 2;
    if (!found || !steps[rise] || !steps[land]) return false;
    const L = ARENA_VAULT_LEAP, k = clamp01(vault.ms / Math.max(1, vault.totalMs)), u = clamp01((k - L.crouchShare) / Math.max(1e-6, L.landShare - L.crouchShare));
    const step = k < L.crouchShare ? 0 : k < L.landShare ? rise : land;
    pose.frame = nativeCityOrthoClipCell(found.clip, steps[step]!.frame, found.flipX);
    pose.artOwnsBody = true;
    if (step !== rise) return true;
    const crown = this.profile.arenaMotion?.rivalCrown?.() ?? null, [, y] = cityProject(this.point, f.input.projection);
    const over = crown ? Math.max(0, y - crown[1]) : f.bodyPx;
    pose.authoredHop = (over + L.clearBodies * f.bodyPx) * Math.sin(Math.PI * u);
    this.vaultLiftPx = pose.authoredHop;
    return true;
  }

  /**
   * The arena's body motion over the pose (`ArenaFighterMotion`, 2026-10-23 arena audit): the windup's lead (or its release once the swing
   * stopped), the flinch's shove, a cut swing's held cell and inertia, and the front-body sort where the two overlap. Reduced motion keeps
   * the held cell only.
   */
  arenaMotionPose(f: KumaPaintFrame, pose: KumaPose, arena: NonNullable<NativeCityKumaProfile["arenaMotion"]>): void {
    const { combat, reduced, bodyPx, away } = f, spec = arena.spec;
    // The windup's lead; once it stops (the contact settled, a cut, a cancel) the last one drawn eases home.
    let lead = reduced ? null : this.swingLead;
    if (lead) { this.arenaLead = lead; this.leadRelease = null; }
    else {
      if (this.arenaLead !== ARENA_NO_LEAD && !reduced) this.leadRelease = { from: this.arenaLead, ms: 0 };
      this.arenaLead = ARENA_NO_LEAD;
      const release = reduced ? null : this.leadRelease;
      if (release) {
        lead = arenaLeadRelease(release.from, release.ms, spec.anticipation.releaseMs);
        release.ms += f.fightDt;
        if (lead === ARENA_NO_LEAD) this.leadRelease = null;
      } else this.leadRelease = null;
    }
    if (lead) { pose.rigX += away * lead.back * bodyPx; pose.stretchY *= lead.stretchY; }
    if (combat.mode === "hurt" && !combat.air) {
      // Each blow shoves the flinching body away from the striker and lets it back (the jab moved nothing).
      if (!reduced && this.blowMs !== null) pose.rigX += away * arenaHurtPush(this.blowMs, this.blowHeavy, spec.hurt) * bodyPx;
      // A cut swing: its swing cell held a frame, then the flinch tipped back and shoved, easing out.
      const inertia = this.cut ? arenaCutInertia(this.cut.screenMs, spec.cut) : null;
      if (!inertia) this.cut = null;
      else {
        if (inertia.holdCell) pose.frame = this.cut!.frame;
        if (!reduced) { pose.rigAngle += away * inertia.deg; pose.rigX += away * inertia.back * bodyPx; }
      }
    }
    // Where the two overlap the struck body (else the striking one, else the right corner) sorts in front — a grab's hold sorts its own way.
    if (!this.holdCell && !this.host.heldAt() && arenaDrawsInFront(arenaFrontMode(combat), arenaFrontMode(arena.rival().combat), arena.corner)) {
      pose.depthDy += spec.corner.frontPx;
    }
    this.lastMode = combat.mode;
  }
}
