import type { CityFightExchangeKind } from "./bout/CityFightExchangeKinds";
import moves from "../../world/native-city-kuma-moves.json";
import { NATIVE_CITY_COMBAT, type NativeCityCombatTuning, type NativeCityKumaActionKind, type NativeCityKumaAirTuning, type NativeCityKumaChanceKind, type NativeCityMeleeTier } from "./NativeCityCombatTuning";
import type { VillageFacing } from "../VillageFacing";
import type { CityPoint, NativeCityDefinition } from "../../world/NativeCityDefinition";
import type { KumaGrabBeats } from "./NativeCityKumaGrab";
import type { CityFightSummonKind } from "./CityFightSummonTuning";
import type { KumaAir } from "./NativeCityKumaAir";
import type { CityFighterAirChaseTuning } from "./NativeCityKumaAirChase";
import type { CityFighterSkillKind, CityFighterSkillTuning, CityFighterSuperSkillTuning, KumaSkillMarks } from "./NativeCityKumaSkill";

/** KUMA형 파이터의 싸움 상태와 계약(2026-10-13, `NativeCityKumaPatrol`에서 나눔): 상태·입력·사건 타입, 그린 기술 표(`native-city-kuma-moves.json`), 새 싸움과 그 전이 몇 개. */

/**
 * KUMA's drawn moves (2026-10-11, `native-city-kuma-moves.json` — its notes are the spec): the iron-ball swing / string / smash / roll-and-
 * rise as his fast / combo / slam / dash, and the specials (the jumping butt slam, the bear bowling tackle), on the headings whose art draws
 * them (`KumaCombatTiming.move` / `.leap`, `KumaCombatInput.dashLanding`). Without that art every rule below is the old swings' and dash's.
 */
export const NATIVE_CITY_KUMA_MOVES = moves;

/**
 * His specials (`native-city-kuma-moves.json` specials): the butt slam instead of a slam, the bowling tackle instead of the dash — and
 * (2026-10-20) a summon cast drawn from its own clip (`cast:<clip>`, `CityFighterSummonTuning.clip`; his `summon` clip carries none).
 */
export type KumaSpecialMove = "buttSlam" | "bowl" | "airChase" | "airChase3" | `cast:${string}` | `skill:${CityFighterSkillKind}` | `super:${CityFighterSkillKind}`;

/** The special that draws a summon cast from `clip` (null for his plain `summon` clip — the cast as it was before casts had clips). */
export function kumaCastSpecial(clip: string | undefined): KumaSpecialMove | null {
  return clip === undefined || clip === "summon" ? null : `cast:${clip}`;
}

/** The pack clip a summon cast's special draws (`summon` without one). */
export function kumaCastClip(special: KumaSpecialMove | null | undefined): string {
  return special?.startsWith("cast:") ? special.slice(5) : "summon";
}

/** A drawn dash at a heading (`KumaCombatInput.dashLanding`): which one, its pop-out after a strike (fight ms), its strike's reach. */
export interface KumaDashLanding {
  readonly move: "rollRise" | "bowl";
  readonly popMs: number;
  /** The strike's reach beyond body contact (strides: the rising ball); absent: the dash's own. */
  readonly reachExtraStrides?: number;
}



export type KumaCombatMode = "idle" | "chase" | "attack" | "abort" | "cooldown" | "hurt" | "parried" | "break" | "down" | "getup"
  | "return" | "dash";

/**
 * A drawn dash's pop-out (`native-city-kuma-moves.json` rollRise / bowling `popSteps`): after a strike that landed or was blocked he finishes
 * it (the swing's shudder and follow / the ball's popout and stomp) for `ms` before the restart (`restart`, a hit) or his stand (a block).
 */
export interface KumaDashPop {
  readonly ms: number;
  /** The cut attack he restarts once landed (a hit); null: he stands (a block). */
  readonly restart: { readonly action: NativeCityKumaActionKind; readonly counts: boolean } | null;
}


export interface KumaLeap {
  readonly from: CityPoint;
  readonly to: CityPoint;
  /** Fight ms into the swing: the takeoff and the landing (the contact). */
  readonly takeoffMs: number;
  readonly landMs: number;
}

/** His dash (`kuma.dash`): its phase and path. */
export interface KumaDash {
  /**
   * windup: the planted crouch; travel: the charge; slide: braking past a missed contact (the skid); recover: open after a whiff; pop: the
   * bowling tackle popping out and landing after a strike that landed or was blocked (`pop`).
   */
  readonly phase: "windup" | "travel" | "slide" | "recover" | "pop";
  /** The pop-out in progress (phase `pop`). */
  readonly pop?: KumaDashPop | null;
  /** This dash is the bowling tackle (`specials.bowling`), else his main dash. */
  readonly special?: KumaSpecialMove | null;
  /** The strike's reach beyond body contact (strides, the drawn dash's — the rising ball); null / absent: his `strikes.dash`. */
  readonly reachExtraStrides?: number | null;
  /**
   * A dash skill's stop (2026-10-22, `skill` feint — `NativeCityKumaSkill`): the dash stops at its branch point without a contact, and the
   * open phase (`recover`) draws the stop. Absent / false: it goes on.
   */
  readonly feintStop?: boolean;
  /**
   * The slide's super form (2026-10-22 4차, `superSkill.passes`): the runs through the body still to come after this one, and this run's
   * place (0 first — its contact's `hitIndex`). Absent: one run.
   */
  readonly passesLeft?: number;
  readonly pass?: number;
  /** Fight ms into this phase. */
  readonly phaseMs: number;
  /** This dash's crouch (`dash.windupMs`, `chaseWindupMs` when it came out of a chase). */
  readonly windupMs: number;
  /** Fight ms of the charge so far (its ease-in burst, `dash.accelMs`). */
  readonly travelMs: number;
  /** Share of top speed this frame (0 crouching / open, rising through the burst, falling through the brake). */
  readonly speedShare: number;
  readonly from: CityPoint;

  readonly target: CityPoint;
  /** The plan line from → where he will be (locked at launch); the charge homes off it by at most `dash.homingDeg`. */
  readonly aim: CityPoint;
  /** The charge's plan direction this frame (homed). */
  readonly heading: CityPoint;
  /** Plan units charged / slid so far. */
  readonly travelled: number;
  readonly slid: number;

  readonly struck: boolean;
  /** The attack the dash cut (or, from the stance, his next one): restarted when the dash connects. */
  readonly resume: NativeCityKumaActionKind;
  /** The restart is a new swing in his rotation (the dash came from the stance; a cut swing was already counted). */
  readonly resumeCounts: boolean;
}

export interface KumaCombatState {
  readonly mode: KumaCombatMode;
  readonly modeMs: number;
  readonly hp: number;
  readonly action: NativeCityKumaActionKind | null;
  /** 지금까지 시작한 공격 수(`comboEvery`). */
  readonly attacks: number;
  readonly attackId: number;

  readonly counterSpentId: number | undefined;
  /** 이번 공격에서 이미 낸 접촉 수. */
  readonly hitsFired: number;
  /** 이번(마지막) 공격이 향한 평면 방향. */
  readonly direction: CityPoint;
  /**
   * 걷기·서기는 8방향. 공격·피격·쓰러짐은 그 동작이 **그려지는** 방향(`kumaActionFacing`): 그 8방향 원화가 있으면 그대로,
   * 없으면 앞쪽 치우친 대각(화면 사분면). 타이밍·부채꼴·접촉점이 모두 이 방향을 쓴다.
   */
  readonly facing: VillageFacing;
  readonly point: CityPoint;
  readonly phase: number;
  readonly movedPx: number;
  /** return 길(남은 점). */
  readonly path: readonly CityPoint[];
  /** 균형(0..`poise.max`). 0 이 되는 한 방이 break 를 연다. */
  readonly poise: number;
  /** 마지막으로 맞은 뒤 흐른 싸움 시간(균형 회복 지연). */
  readonly poiseIdleMs: number;
  /** 지금 움찔(hurt)이 반격에서 왔다 — 그 안의 후속타도 반격이다. */
  readonly counterChain: boolean;
  /** 이번(마지막) 공격의 접촉 수. 0 이면 모른다(회복 판정 안 함). */
  readonly attackHits: number;

  readonly lastLandedHit: number;

  readonly lastHurtHit: number;
  /** Chasing at the run (latched until he swings or something interrupts the chase). */
  readonly running: boolean;

  readonly openingMs: number;
  /** Last chase frame's gap beyond contact (plan units); NaN when none. */
  readonly lastGap: number;

  readonly lastPlayer: CityPoint | null;
  readonly playerVel: CityPoint;
  /** This attack passed its commit point: facing, aim and feet are locked. */
  readonly committed: boolean;
  /** Screen px this attack stepped in before its commit. */
  readonly trackedPx: number;
  /** Consecutive aborts and whiffs (`antiKite`). */
  readonly kiteCount: number;
  /** The current attack is the anti-kite lunge. */
  readonly lunge: boolean;
  /** Abort: the windup's ms where it was cut (the recovery rewinds it from there). */
  readonly abortFromMs: number;
  /** The dash in progress (mode `dash`), else null. */
  readonly dash: KumaDash | null;
  /** Fight ms until the next dash may start (`kuma.dash.cooldownMs` from the last one's start). */
  readonly dashCooldownMs: number;
  /** The current attack is the restart after a connecting dash: it steps in but never cancels and is never fled from. */
  readonly restart: boolean;

  readonly playerInside: boolean;

  readonly fleeOutsideAtStart: boolean;
  /** This flinch's length (fight ms, `kuma.hurt`); 0 = the input's default `hurtMs`. */
  readonly hurtMs: number;
  /** Flinches taken in the current unbroken string (consecutive hurts); the `hurt.stringCap`-th is taken as the ender. */
  readonly stringHits: number;
  /** This flinch ends a string: when it is over he swings at once (his turn, `hurt.retaliate`). */
  readonly retaliate: boolean;

  readonly knockdown: boolean;
  /** Knockdowns this fight: the wake-up pattern (`knockdown.wakeup.pattern`) alternates by it. */
  readonly knockdowns: number;
  /** This swing's windup to its first contact runs this many times faster than `tempo.kuma.windupRate` (the reversal, the seeded variety). */
  readonly windupScale: number;
  /** Wake-up reversal, pending while chasing into reach, then uncancellable once the swing starts. */
  readonly reversal: boolean;
  /** He rose from a knockdown with his guard up at once (mode cooldown, `knockdown.wakeup.guardMs`). */
  readonly wakeGuard: boolean;

  readonly pressOn: boolean;

  readonly guardBlocks: number;
  /** Remaining fight ms of the guard's contact recovery; extends the stand without replaying its step back. Absent = 0. */
  readonly guardHoldMs: number | undefined;
  /**
   * The bout AI's footsies (`KumaFighterOverrides.boutAi`): his neutral now — backing off `backUnits` more (plan units), then standing
   * `leftMs` more — else null; `measured`: the attack count whose measure is done; `reacted`: the other's attack id he has read;
   * `aiGuard`: the other's attack id his raised guard waits out; `backstep`: plan units of his step back left.
   */
  readonly neutral: { readonly leftMs: number; readonly backUnits: number } | null | undefined;
  readonly measured: number | undefined;
  readonly reacted: number | undefined;
  readonly aiGuard: number | null | undefined;
  readonly backstep: number | undefined;
  /** His vault over the other (`KumaFighterOverrides.vault`): fight ms into it, its length, and his feet's start and landing; else null. */
  readonly vault: { readonly ms: number; readonly totalMs: number; readonly from: CityPoint; readonly to: CityPoint } | null | undefined;
  /** Plan units he has stepped back in this stand (`kuma.spacing`); absent = 0. */
  readonly backedUnits: number | undefined;
  /** The butt slam's leap, locked at its takeoff (absent / null: not leaping). */
  readonly leap: KumaLeap | null | undefined;
  /** This swing is a special (`KumaSpecialMove`: the butt slam), else his main one. */
  readonly special: KumaSpecialMove | null | undefined;
  /** This swing's contacts as drawn (`KumaCombatTiming.move`): their reach beyond contact (strides) and which strike on either side. */
  readonly swingReach: readonly number[] | null | undefined;
  readonly swingRadial: readonly boolean[] | null | undefined;
  /** Slams started this fight (`specials.buttSlam.lowHpEvery`). */
  readonly slams: number | undefined;
  /** He was knocked down since his last slam: the next one is the butt slam (`specials.buttSlam.afterKnockdown`). */
  readonly slamAfterDown: boolean | undefined;

  readonly farMs: number | undefined;

  readonly fleeMs: number | undefined;

  readonly grab: { readonly beats: number } | null | undefined;

  readonly blockedHits: number | undefined;
  /** Rotation attacks since his last grab (`kuma.grab.every`: at `every` − 1 the grab is owed — the next one he can start in its range). */
  readonly sinceGrab: number | undefined;
  /** He is down from a shift change (`kuma.phases`): he rises into the guard wake-up, never the reversal. Absent = false. */
  readonly shiftRise: boolean | undefined;
  /**
   * The duel's rhythm (`kuma.rhythm`, 2026-10-18) — all absent without it:
   * `jabCut`: this swing started from his stand or chase, so its first `jabCut.windowMs` is the window a blow cuts it in.
   */
  readonly jabCut: boolean | undefined;
  /** A just dodge or a parry opened it (`rhythm.chance`): `leftMs` of it (fight ms) still to run outside his flinch. Null / absent: none. */
  readonly chance: { readonly kind: NativeCityKumaChanceKind; readonly leftMs: number } | null | undefined;
  /** His flinch is a counter string's launch (`rhythm.launch`): a blow on it starts the string again instead of re-snapping the ender. */
  readonly followOpen: boolean | undefined;
  /** Launches followed since his last swing started (`rhythm.launch.maxFollowUps`). */
  readonly followUps: number | undefined;
  /**
   * Thrown up by the launch (`rhythm.launch.air`, 2026-10-21 — the air combo, `NativeCityKumaAir`): his height and flight. While it is set he
   * only flies (mode `hurt`, or `down` for a KO in the air); touching the ground lands him into the knockdown. Absent / null: on the ground.
   */
  readonly air: KumaAir | null | undefined;
  /** Down from V's knockdown, the ground blow still his to take (`rhythm.down`). */
  readonly groundOpen: boolean | undefined;
  /** How much the rhythm slowed this swing's windup (`kumaRhythmWindupSlow`); his step-in slows by it. Absent = 1. */
  readonly windupSlow: number | undefined;
  /** His meter (`CityFightMeter`, 2026-10-20): what his landed, guarded and taken blows have built toward his super. Absent: empty. */
  readonly meter: number | undefined;
  /**
   * The attack id his meter was spent on (`super`): while it is the attack he is in (`kumaSuperSwing`), its contacts hit `super.damageScale`
   * harder and build no meter. An id, not a flag: every later swing — the dash, its restart, the next rotation pick — takes a new id, so the
   * super never leaks into them (2026-10-20 review: a flag copied on through the stand and the dash made a plain swing ×1.6).
   */
  readonly superAttack: number | undefined;
  /**
   * His recoil's own length while `parried` (2026-10-22 5차, a fighter bout's clash — `CityFightBoutRules.clash`): absent, the parry's
   * (`parry.recoilMs`). Cleared when the recoil ends.
   */
  readonly recoilMs: number | undefined;

  readonly superArmed: boolean | undefined;
  /**
   * A person holds his guard up (2026-10-22, the competitive engine — `KumaCombatInput.control`): he stands in his neutral with the guard of
   * the stand (`kumaCombatGuarding`). Only a controlled fighter writes it; absent / false: the AI's guard alone.
   */
  readonly controlGuard: boolean | undefined;
  /** Rotation attacks since his last summon cast (`KumaTuning.summons` `everyAttacks`); only a summoner writes it. Absent = 0. */
  readonly sinceSummon: number | undefined;
  /**
   * The slot of his current / last summon cast (`KumaTuning.summons`): the next cast is looked for from the slot after it. Only a fighter with
   * more than one summon writes it (absent: slot 0).
   */
  readonly summonSlot: number | undefined;
  /** Rotation attacks since his last skill (`KumaTuning.skill` everyAttacks); only a fighter with a skill writes it. Absent = his cadence (free). */
  readonly sinceSkill: number | undefined;
  /**
   * The slot of his current / last skill (0: `KumaTuning.skill`, 1: `skill2`): the AI looks for the next from the slot after it. Only a fighter
   * with two skills writes it (absent: before slot 0).
   */
  readonly skillSlot: number | undefined;
  /** The skill swing's drawn marks (`KumaSkillMarks`, copied at its start: the hit side reads them without the art). Absent / null: no skill. */
  readonly skillMarks: KumaSkillMarks | null | undefined;
  /** The skill's stance took its blow (`counter`: the counter strike runs; `brace`: the block, its shove window from `skillTriggerMs`). */
  readonly skillTriggered: boolean | undefined;
  readonly skillTriggerMs: number | undefined;
  /** The skill's follow-up is decided (`recoil`: the poke comes after the wait). */
  readonly skillFollow: boolean | undefined;
  /**
   * Presses a person's skill took inside a move it was already in (`feint`'s stop, `recoil`'s poke, `brace`'s shove): the arena's press
   * buffer spends a press when this count moves, as it does when his swing starts (`attackId`). Absent = 0.
   */
  readonly skillPress: number | undefined;
  /**
   * A bout's exchange set piece owns him now (2026-10-25 — `CityFightBoutExchange`): the bout moves him and lands its blows; this is what
   * the view draws. Absent / null: his own rules.
   */
  readonly exchange: KumaExchangePose | null | undefined;
}

/** An exchange set piece's kind (`CityFightExchangeKinds`). */
export type KumaExchangeKind = CityFightExchangeKind;

/** His part in a bout's exchange (`KumaCombatState.exchange`) as the view draws it. */
export interface KumaExchangePose {
  readonly kind: KumaExchangeKind;
  /**
   * The cross's (`cross`): set the crouch; run running through; turn turning round at the end of a run; skid the last pass won, braking.
   * The pinball's (`pinball`): the struck one out (thrown into the rope), rope (hanging on it), back (thrown back at the striker); the
   * striker step (stepping up to meet him) and ready (waiting for him). The rush's (`rush`): flurry (string against string, his blows
   * counted in `slashPass`).
   */
  readonly phase: "set" | "run" | "turn" | "skid" | "out" | "rope" | "back" | "step" | "ready" | "flurry";
  readonly phaseMs: number;
  /** Passes (the cross) or rope hits (the pinball) done so far. */
  readonly pass: number;
  /** This turn's length (fight ms — the one before the last pass is longer, a standoff). */
  readonly turnMs: number;
  /** The blow his strike (`slashMs`) draws: `slashAction`'s `slashPass`-th contact (each pass draws its own). */
  readonly slashPass: number;
  readonly slashAction: "combo" | "slam";
  /** Fight ms since his strike in passing (he won a pass) / since he took one; null: none yet. */
  readonly slashMs: number | null;
  readonly struckMs: number | null;
  /** His last strike was the set piece's last (the heavy one): he holds it. */
  readonly finalSlash: boolean;
  /** His drawn lift (body heights over his feet — the pinball's thrown body); 0 on the ground. */
  readonly liftBodies: number;
}

export interface KumaCombatTiming {
  readonly totalMs: number;
  readonly hitsMs: readonly number[];
  /**
   * His air chase's spike among its contacts (2026-10-22 4차, the `airCombo` clip's `keys.spike`): the ones after it are his own ending on the
   * body bouncing off it. Absent: the last contact is the spike.
   */
  readonly airSpike?: number;
  /** Slam: when its apex hold starts (its commit point). Absent: first contact − `attack.commitLeadMs`. */
  readonly apexMs?: number;
  /**
   * The slam is drawn as the jumping butt slam (`native-city-kuma-moves.json` buttSlam): he leaves the ground at `takeoffMs` (= `apexMs`,
   * the commit and the lock) and lands on the first contact. Absent: the old slam.
   */
  readonly leap?: { readonly takeoffMs: number };

  readonly move?: { readonly name: string; readonly reachExtraStrides: readonly number[]; readonly radial: readonly boolean[];
    readonly startStrides?: number };
  /** The swing is the red grab (`kumaGrabTiming`): its catch is `hitsMs[0]`, the hold's beats from it. Absent: not a grab. */
  readonly grab?: KumaGrabBeats;
  /** The swing is a fighter's skill (2026-10-22, `KumaTuning.skill`): its drawn marks (fight ms = art ms, played as drawn). Absent: not a skill. */
  readonly skill?: KumaSkillMarks;
}

/**
 * A move a person pressed for a controlled fighter this step (2026-10-22, the competitive engine): `light` his string (`combo`), `heavy` his
 * slam, `super` his super (his `superAction`, only with a full meter), `special` his summon cast (a summoner's slots in turn; nothing for a
 * fighter without one).
 */
export type KumaControlPress = "light" | "heavy" | "super" | "special";

/**
 * A person's command for one step of a fighter (2026-10-22, docs/Plan/2026-10-22-competitive-fighter-engine): it stands in for the AI's
 * choices — the chase, the commit's abort, the rotation, the guard's stands, the flight dash, the retaliation and the wake-up mix-up. His
 * rules carry it out as they carry out the AI's: the same swing, contact, armour, flinch, knockback, knockdown and super.
 */
export interface KumaControl {
  /** Walk along the stage: +1 toward the opponent, −1 away (still facing him, the walk played backwards), 0 stand. */
  readonly walk: -1 | 0 | 1;
  /** The guard held: he stands guarding in his neutral (no walk). A press this step wins over it. */
  readonly guard: boolean;
  /** The move pressed this step (the caller buffers a press made while he cannot act); null none. */
  readonly press: KumaControlPress | null;
}

export interface KumaCombatInput {
  readonly dtMs: number;
  /** 진영표에서 KUMA 가 적군인가. */
  readonly hostile: boolean;
  /** 같은 화면의 주인공 발. 다른 화면이면 null(서서 기다린다). */
  readonly player: CityPoint | null;
  readonly projection: NativeCityDefinition["projection"];
  readonly stepUnits: number;
  /** KUMA·주인공 발 원 반지름 합(평면). */
  readonly contactUnits: number;
  /** 순찰 걸음 화면 속도(px/s)와 보폭(px). */
  readonly pacePxPerSec: number;
  readonly stridePx: number;
  /** Screen px of one run cycle at run pace. Absent: `stridePx` × `chase.runPaceScale` (the walk's cycle length). */
  readonly runStridePx?: number;
  /**
   * 그 방향에서 그 공격의 원화 타이밍. null 이면 아직 원화가 없어 공격하지 않는다. `windupScale`: the swing's windup to its first contact
   * runs this many times faster (the state's `windupScale`; 1 = `tempo.kuma.windupRate` as is). `special`: the special drawn instead
   * (`KumaSpecialMove`) when his art has it there (its timing says so: `leap`), else his main swing.
   */
  readonly timing: (action: NativeCityKumaActionKind, facing: VillageFacing, windupScale?: number, special?: KumaSpecialMove | null)
    => KumaCombatTiming | null;
  /** His drawn fall from the blow to its lying step (fight ms; a knockdown lies `knockdown.lieMs` after it). Absent: `exchangeFx.ko.launchMs`. */
  readonly fallMs?: number;
  /** Fight ms from the blow to his drawn fall's ground impact (the air combo's landing picks the fall up there). Absent: `fallMs`. */
  readonly fallImpactMs?: number;
  /** Which heading his pack draws a clip at (`kumaActionFacing`). Absent: the four diagonals only (front-biased). */
  readonly artFacing?: KumaArtFacing;
  readonly hurtMs: number;
  /** 패리당한 반동(parried) 길이. 없으면 `parry.recoilMs`. */
  readonly parriedMs?: number;
  /** 균형이 무너진 휘청(break) 전체 길이. 없으면 1000. */
  readonly breakMs?: number;
  readonly getUpMs: number;
  /** 한 걸음을 벽·몸에 맞춰 끝 자리로. */
  readonly move: (from: CityPoint, to: CityPoint) => CityPoint;

  readonly moveGhost?: (from: CityPoint, to: CityPoint) => CityPoint;
  /**
   * His dash is drawn at that heading (`KumaDashLanding`: the roll-and-rise, or the bowling tackle when `special` asks for it and it is
   * drawn): its pop-out after a strike and its strike's reach; null / absent: the old dash (no pop-out).
   */
  readonly dashLanding?: (facing: VillageFacing, special?: KumaSpecialMove | null) => KumaDashLanding | null;

  readonly playerSteered?: boolean;

  readonly playerGuardMs?: number;

  readonly opponentOpen?: boolean;

  readonly opponentAir?: { readonly heightBodies: number; readonly spiked: boolean; readonly hits: number } | null;

  readonly opponentSwing?: { readonly attackId: number; readonly ms: number; readonly contacted: boolean } | null;

  readonly highShotComing?: boolean;
  /** The bout's other corner is down or rising (2026-10-23): no super at him, and the bout AI gives him room. */
  readonly opponentDown?: boolean;
  /** Plan units behind him (away from the other) to the end of the bout's line (2026-10-23 2차, the vault's corner); absent: unknown. */
  readonly backRoomUnits?: number;
  /**
   * Plan units behind the other (away from him) to the end of the bout's line (2026-10-25 — a through-dash needs room to come out the far
   * side, `CityFighterSkillTuning.roomBeyondStrides`); absent: unknown.
   */
  readonly beyondRoomUnits?: number;
  /**
   * The bout holds his super (2026-10-23 arena audit: two awakenings went off on top of each other): the other's super or its follow-up is
   * playing, or just ended. His meter waits.
   */
  readonly superLocked?: boolean;
  /**
   * This frame takes a summon cast (2026-10-20, `KumaTuning.summons`): the fight has a stage line for it to travel, and `live` of each of his
   * kinds are out now (`cityFightSummonLiveCount`; a kind not listed: none). Absent: he never casts (a fight without a stage, a fighter who is
   * not the opponent).
   */
  readonly summons?: { readonly live: Readonly<Partial<Record<CityFightSummonKind, number>>> };
  /** A person controls him this step (`KumaControl`, 2026-10-22). Absent: the AI — the rules exactly as before. */
  readonly control?: KumaControl;
  /** 자리로 돌아가는 길(시작점 제외). 없으면 null. */
  readonly route: (from: CityPoint, to: CityPoint) => readonly CityPoint[] | null;
  /** 대결 뒤 돌아갈 순찰 자리. */
  readonly home: CityPoint;
}

export type KumaCombatEvent =
  | { readonly kind: "attack-start"; readonly action: NativeCityKumaActionKind; readonly attackId: number; readonly lunge?: true }
  /** He cancelled the swing before its commit: nothing was thrown. */
  | { readonly kind: "attack-abort"; readonly action: NativeCityKumaActionKind; readonly attackId: number }
  /**
   * One contact. `direction`: the hit cone's plan direction; `facing`: the heading the swing is DRAWN at — the blow's strike axis
   * (the victim turns back along it and is pushed along it, json note "SAME AXIS").
   */
  | { readonly kind: "strike"; readonly action: NativeCityKumaActionKind; readonly attackId: number; readonly hitIndex: number;
    readonly damage: number; readonly tier: NativeCityMeleeTier; readonly direction: CityPoint; readonly facing: VillageFacing;
    /** The contact is his super's (`kumaSuperSwing`; presentation — its damage is already scaled). */
    readonly super?: true;
    /**
     * The air combo (2026-10-22, `NativeCityKumaAirChase`): his skill's contact throws the body up (`launch`), his air chase's contacts juggle
     * it (`hit`) and drive it down (`spike`). Absent: a ground blow.
     */
    readonly air?: "launch" | "hit" | "spike";
    /** A run of his super slide before its last (2026-10-22 4차, `superSkill.passes`): a light blow that keeps the body there for the next. */
    readonly pass?: true }
  /** He spends his meter: the swing he starts is his super (`super`, 2026-10-20) — the fight holds `super.flashMs` for its flash. */
  | { readonly kind: "super"; readonly action: NativeCityKumaActionKind; readonly attackId: number }

  | { readonly kind: "dash-start"; readonly attackId: number; readonly from: CityPoint; readonly target: CityPoint;
    readonly resume: NativeCityKumaActionKind }

  | { readonly kind: "grab"; readonly beat: "squeeze" | "throw"; readonly attackId: number; readonly index: number; readonly damage: number;
    readonly direction: CityPoint; readonly facing: VillageFacing;
    /** The grab is his super (2026-10-22 4차, a row's `superAction: "grab"` — its damage already scaled; the throw flies `superGrabThrowStrides`). */
    readonly super?: true }

  | { readonly kind: "summon"; readonly summon: CityFightSummonKind; readonly attackId: number; readonly damage: number;
    readonly direction: CityPoint; readonly facing: VillageFacing }
  | { readonly kind: "recovered" }
  | { readonly kind: "home" }
  /** The air combo (`NativeCityKumaAir`): the spiked body bounced off the ground (`bounce`), or he landed into the knockdown (`land`). */
  | { readonly kind: "air"; readonly beat: "bounce" | "land"; readonly point: CityPoint }

  | { readonly kind: "knock-wall"; readonly point: CityPoint; readonly direction: CityPoint; readonly strides: number };

export interface KumaCombatStep {
  readonly state: KumaCombatState;
  readonly events: readonly KumaCombatEvent[];
}

/**
 * Per-fighter overrides on KUMA's tuning (the skinned fighters, `native-city-fighters.json`). Every field is optional and KUMA
 * sets none, so his fight reads exactly as before.
 */
/**
 * The bout AI's rhythm (`KumaFighterOverrides.boutAi`, 2026-10-23 arena audit: both corners were free together 4.7 % of a bout, 37 % of the
 * swings started within 0.1 s of the other's and 39 % were cut — a turn-based trade without footsies or defence). Every pick is seeded off
 * the attack count and his `windupSalt` (the bout replays).
 * - `measure`: on reaching his swing's start distance, `share` of his swings first stand just outside it for a seeded `holdMs` [min, max]
 *   (`marginStrides` past the start), facing the other — he swings at once into an opening (`KumaCombatInput.opponentOpen`).
 * - `retreat`: let go after a string on him (hurt, break, a parry's recoil), `share` of the time he backs off `strides` [min, max] before he
 *   measures again; after knocking the other down he backs off to `afterDownStrides` beyond contact and waits for him to rise.
 * - `react`: the other's swing seen `fromMs`..`toMs` into its windup (no contact out yet): `guardShare` of them he raises his guard until that
 *   swing is over; `backstepShare` he steps back `backstepStrides` at `backstepPaceScale` × his walk (an opening to punish when it whiffs).
 * - `standMs`: added to his stand after a swing [min, max] (the step back's time) — and that step back follows every swing, landed or not.
 */
export interface KumaBoutAiTuning {
  readonly measure: { readonly share: number; readonly holdMs: readonly [number, number]; readonly marginStrides: number };
  readonly retreat: { readonly share: number; readonly strides: readonly [number, number]; readonly afterDownStrides: number };
  readonly react: { readonly fromMs: number; readonly toMs: number; readonly guardShare: number; readonly backstepShare: number;
    readonly backstepStrides: number; readonly backstepPaceScale: number;
    /** Cornered (`cornerStrides` or less behind him to the line's end): `vaultShare` of the swings read, a fighter with a vault
     *  (`KumaFighterOverrides.vault`) goes over the other to land `passStrides` past him (2026-10-23 2차). */
    readonly vaultShare: number; readonly cornerStrides: number; readonly passStrides: number;
    /**
     * Of the other's swings he does not answer, `yieldShare` he lets play out — he starts no swing of his own into it until its contact
     * fires or it ends, then goes in on its recovery (2026-10-24 — 사용자 "경기 리듬": 20 % of the swings still started within 0.1 s of the
     * other's and 26 % were cut by the first contact; a race, not an exchange).
     */
    readonly yieldShare: number };
  readonly standMs: readonly [number, number];
  /** His stand's step back in the bout (over `kuma.spacing`): how far, within how long, up to which gap beyond contact. */
  readonly standBack: { readonly backStrides: number; readonly withinMs: number; readonly maxGapStrides: number };
  /** The bout holds a corner's super this long (fight ms) after the other's super and its follow-up are over. */
  readonly superLockTailMs: number;
  /** The bout's extra meter for a blow taken (over `super.gainTaken` — the one on the end of a string gets his comeback's super sooner). */
  readonly meterTakenBonus: number;

  readonly superDamageScale: number;
  /** His seeded windup rates (`kuma.attack.windupRates`) × this: the bout's windups run that much faster, the answer's floor with them. */
  readonly windupSpeed: number;
  /** After a KO the winner finishes his swing and stands this long (fight ms) before he walks back (the visible bout's epilogue). */
  readonly winnerHoldMs: number;

  readonly grabWaits: boolean;
}

/**
 * A corner's own bout temperament over the bout's (`KumaBoutAiTuning`, 2026-10-27 — a registered fighter's style, `RegisteredDuelStyle`):
 * only these shares and his stand; everything else stays the bout's. Absent fields are the bout's (`kumaBoutAiWith`).
 */
export interface KumaBoutAiOverride {
  readonly measureShare?: number;
  readonly retreatShare?: number;
  readonly guardShare?: number;
  readonly backstepShare?: number;
  readonly yieldShare?: number;
  readonly standMs?: readonly [number, number];
}

export interface KumaFighterOverrides {
  /** Weights of his rotation swings, picked deterministically per attack (`kumaNextAction`), instead of `comboEvery` / `fastCombo`. */
  readonly attackMix?: Readonly<Partial<Record<"slam" | "combo" | "fast", number>>>;
  /** His stand after a swing (`tempo.kuma.cooldownMs` [min, max]). */
  readonly cooldownMs?: readonly [number, number];
  /** His swings' reach beyond body contact (over `strikes.<action>.reachExtraStrides`), measured on his clips. */
  readonly reachExtraStrides?: Readonly<Partial<Record<NativeCityKumaActionKind, number>>>;
  /** The gap beyond contact at which he starts each swing (`attackStartStrides`). */
  readonly attackStartStridesBy?: Readonly<Partial<Record<NativeCityKumaActionKind, number>>>;

  readonly slamShockwave?: { readonly reachExtraStrides: number };

  readonly summons?: readonly CityFighterSummonTuning[];
  /** The swing his full meter buys (`super`, 2026-10-20; a fighter's row `superAction`). Absent: `super.kumaAction`. */
  readonly superAction?: NativeCityKumaActionKind;
  /** No meter, no super (the headless bout until the engine version moves). */
  readonly superOff?: boolean;
  /**
   * His attack armour (`armorDuringAttack`) on his super's swing only (2026-10-21, the fighter-against-fighter bout — 사용자: "서로 공격 중인
   * 난전이 어색하다, 먼저 때린 사람이 판정에서 이겨야"): a blow landing in any other swing cuts it (he flinches and is pushed). Absent: the
   * armour on every swing.
   */
  readonly armorOnSuperOnly?: boolean;
  /**
   * Salts his seeded windup rate pick (`kuma.attack.windupRates`, `kumaWindupScale`; 2026-10-22 5차 — a fighter bout seeds one per corner so
   * the two do not swing at one tempo). Absent: 0 (KUMA in town, as ever).
   */
  readonly windupSalt?: number;

  readonly drawnClips?: true;
  /**
   * His heavy swing (`slam`) only into an opening (`KumaCombatInput.opponentOpen`; 2026-10-21, the bout where the first contact wins — its
   * 600-900 ms windup was cut by any jab, 80 % of the slow slams never landed): with the opponent free to strike, his rotation's light swing
   * instead (`combo`, or `fast` where his mix weighs it more). Absent: the rotation as drawn.
   */
  readonly heavyOnOpening?: boolean;

  readonly fighterGrab?: true;
  /**
   * His own move (2026-10-22, the ODDBOUT event fighters — `native-city-fighters.json` row `skill`, `NativeCityKumaSkill`): a kind of move
   * the rules carry out on top of his attack, dash or leap, drawn by his pack's `skill` clip, its contact the numbers of `action`. Picked by
   * the AI on its cadence (`everyAttacks`, `weight`) and by a person's X. Absent: he has none.
   */
  readonly skill?: CityFighterSkillTuning;

  readonly skill2?: CityFighterSkillTuning;

  readonly highActions?: readonly NativeCityKumaActionKind[];

  readonly boutAir?: NativeCityKumaAirTuning;

  readonly boutAi?: KumaBoutAiTuning;

  readonly vault?: { readonly ms: number };
  /** His air chase after his launch (2026-10-22, a fighter's row `airChase`, `NativeCityKumaAirChase`). Absent: he never chases. */
  readonly airChase?: CityFighterAirChaseTuning;
  /**
   * His super is his skill's super form (2026-10-22 4차 — a row's `superSkill`, `NativeCityKumaSkill`): his full meter buys his skill in its
   * big form (`super:<kind>`, his `superSkill` clip). Absent: his super is his `superAction` swing.
   */
  readonly superSkill?: CityFighterSuperSkillTuning;
  /** His super grab's throw (2026-10-22 4차, a row's `grab.superThrowStrides`): how far the super's throw flies (strides). Absent: `grab.throwStrides`. */
  readonly superGrabThrowStrides?: number;

  readonly downSlide?: { readonly strides: number; readonly koStrides: number; readonly ms: number };
}
/** One of a fighter's summons (`KumaFighterOverrides.summons`, `native-city-fighters.json` row `summons`). */
export interface CityFighterSummonTuning {
  /** The pack clip his cast is drawn from (absent: `summon` — and without that, his slam). */
  readonly clip?: string;
  readonly kind: CityFightSummonKind;
  readonly weight: number;
  readonly minGapStrides: number;
  readonly startStrides: number;
  readonly everyAttacks: number;
  readonly damageScale: number;
  /**
   * The AI's alone (2026-10-22 5차, ODDBOUT's second skill — 사용자: "AI전용으로"): a person's X never casts it (X stays his skill,
   * `kumaControlPress`); the AI casts it on its own cadence like any slot.
   */
  readonly aiOnly?: boolean;
}
export type KumaTuning = NativeCityCombatTuning["kuma"] & KumaFighterOverrides;

/** His drawn clips the fight picks a heading for (a swing by its kind; `hit` for the flinch / parry recoil / break; `fall` for the KO; `dash` for the charge). */
export type KumaDrawnClip = NativeCityKumaActionKind | "hit" | "fall" | "dash";

/**
 * The heading his pack draws `clip` at, given the exact 8-way heading and the front-biased diagonal of the same vector
 * (the view's pack: `nativeCityOrthoActionFacing` — exact clip, else `fallbackFrom`, else that diagonal).
 */
export type KumaArtFacing = (clip: KumaDrawnClip, exact: VillageFacing, diagonal: VillageFacing) => VillageFacing;

/**
 * A fresh fight state at `point` with `hp` (his tuning's — `KumaTuning.hp`). Every key is here, in the interface's order — the ones no step
 * has set yet as `undefined` — and no step removes one (2026-10-30): every copy a step makes then keeps one object shape, which V8 copies
 * fast. With keys coming and going a bout spent most of its time copying this state.
 */
export function createKumaCombat(point: CityPoint, hp: number): KumaCombatState {
  return { mode: "idle", modeMs: 0, hp, action: null, attacks: 0, attackId: 0, counterSpentId: undefined, hitsFired: 0, direction: [1, 0],
    facing: "down", point, phase: 0, movedPx: 0, path: [], poise: NATIVE_CITY_COMBAT.poise.max, poiseIdleMs: 0, counterChain: false,
    attackHits: 0, lastLandedHit: -1, lastHurtHit: -1, running: false, openingMs: 0, lastGap: Number.NaN, lastPlayer: null,
    playerVel: [0, 0], committed: false, trackedPx: 0, kiteCount: 0, lunge: false, abortFromMs: 0, dash: null, dashCooldownMs: 0,
    restart: false, playerInside: false, fleeOutsideAtStart: false, hurtMs: 0, stringHits: 0, retaliate: false, knockdown: false,
    knockdowns: 0, windupScale: 1, reversal: false, wakeGuard: false, pressOn: false, guardBlocks: 0, guardHoldMs: 0, neutral: undefined,
    measured: undefined, reacted: undefined, aiGuard: undefined, backstep: undefined, vault: undefined, backedUnits: undefined,
    leap: undefined, special: undefined, swingReach: undefined, swingRadial: undefined, slams: undefined, slamAfterDown: undefined,
    farMs: undefined, fleeMs: undefined, grab: undefined, blockedHits: undefined, sinceGrab: undefined, shiftRise: undefined,
    jabCut: undefined, chance: undefined, followOpen: undefined, followUps: undefined, air: undefined, groundOpen: undefined,
    windupSlow: undefined, meter: undefined, superAttack: undefined, recoilMs: undefined, superArmed: undefined, controlGuard: undefined,
    sinceSummon: undefined, summonSlot: undefined, sinceSkill: undefined, skillSlot: undefined, skillMarks: undefined,
    skillTriggered: undefined, skillTriggerMs: undefined, skillFollow: undefined, skillPress: undefined, exchange: undefined };
}

/** 지금 대결 중인가(순찰 상태 기계가 쉬는 동안). */
export function kumaCombatEngaged(state: KumaCombatState): boolean {
  return state.mode !== "idle";
}

export function enterReturn(state: KumaCombatState, input: KumaCombatInput): KumaCombatState {
  return { ...state, mode: "return", modeMs: 0, action: null, hitsFired: 0, movedPx: 0, reversal: false,
    path: input.route(state.point, input.home) ?? [input.home] };
}

/** A fresh chase: walking, no run latch, no gap history. */
export function toChase(state: KumaCombatState): KumaCombatState {
  return { ...state, mode: "chase", modeMs: 0, running: false, openingMs: 0, lastGap: Number.NaN, reversal: false, wakeGuard: false };
}

export interface KumaCombatHit {
  readonly state: KumaCombatState;
  /** 피해가 들어갔다. */
  readonly hit: boolean;
  /** 이 피해로 HP 0 이 되어 쓰러졌다. */
  readonly defeated: boolean;
  /** 하던 동작이 끊기고 반동(hurt)·휘청(break)·쓰러짐으로 넘어갔다. */
  readonly staggered: boolean;
  /** 실제로 깎인 HP(갑옷 ×armorDamageScale, break 중 ×damageScale). */
  readonly damage: number;
  /** 공격 중 갑옷이 받아 냈다(움찔하지 않음). */
  readonly armored: boolean;
  /** 헛친 회복을 찌른 반격(균형 ×counterScale). */
  readonly counter: boolean;
  /** 이 한 방으로 균형이 0 이 되어 break 가 열렸다. */
  readonly broke: boolean;
  /** 이미 무너진(break) 몸에 들어갔다. */
  readonly onBroken: boolean;
  /** A counter that came from the flinch an earlier counter caused (it keeps the colour and poise ×2, see `chainHitStop`). */
  readonly chained: boolean;
  /** His guard took it (`kumaCombatGuarding`): no damage, no flinch, poise × `guard.poiseScale` down to `guard.poiseFloor`. */
  readonly blocked: boolean;

  readonly ender: boolean;

  readonly knockdown: boolean;
  /** A later contact of the same swing went on with the flinch it already started (`continues`): the drawing does not snap again. */
  readonly continued?: boolean;

  readonly follow?: boolean;
  /** V's ground blow on the body on the ground (`kuma.rhythm.down`): no flinch, no push. */
  readonly ground?: boolean;
  /**
   * This blow took his HP across a shift's line (`kuma.phases`): the shift (0-based) he is in now — he is knocked down for it (`knockdown`).
   * Absent: no crossing.
   */
  readonly shift?: number;
  /**
   * The air combo (`rhythm.launch.air`): this blow threw him up (`launch`), kept him up (`juggle`) or drove him down (`spike`). Absent: on the
   * ground as before.
   */
  readonly air?: "launch" | "juggle" | "spike";
}

export interface KumaCombatHitOptions {
  /** Count a complete input swing once; setup contacts in a burst use zero. */
  readonly stringCount?: number;
  /** 이 접촉이 깎는 균형(갑옷·반격 배율 전). 없으면 0. */
  readonly poise?: number;
  /** 이 접촉은 그의 가드를 뚫는다(`kuma.guard.pierce` — 연타 3타 훅). */
  readonly pierce?: boolean;

  readonly throughArmor?: boolean;
  /** An object's contact (a summon — 2026-10-22): a counter's stance (`KumaTuning.skill` counter) does not take it, a body's blow only. */
  readonly ranged?: boolean;
  /** His pack's drawn headings (`kumaActionFacing`); absent: the four diagonals. */
  readonly artFacing?: KumaArtFacing;

  readonly axis?: VillageFacing;

  readonly flinchMs?: number;

  readonly ender?: boolean;

  readonly continues?: boolean;

  readonly knockdown?: boolean;
  /** This contact can reach his body on the ground (V's ground blow, `kuma.rhythm.down`); every other one passes over it. */
  readonly ground?: boolean;
  /**
   * An awakening's blow on his body lying in a knockdown (2026-10-23, `CityFightAwakening` — its `down` beat): it reaches him whether or not
   * his ground blow is open (a fighter-against-fighter bout has no rhythm), as a plain ground blow (no charge); never a shift's fall, the KO or
   * the get-up (`kumaCombatLying`). On a body not lying it passes.
   */
  readonly lying?: boolean;

  readonly groundCharge?: number;
  /** This contact launches him (the tie whip, V — `launch.curve`): as a counter string's ender it can be followed (`kuma.rhythm.launch`). */
  readonly launches?: boolean;

  readonly air?: "hit" | "spike";
  /** An air hit's own lift (body heights) instead of the juggle's `hitLiftBodies` (an awakening's follow-up blow — `kumaAirJuggle`). */
  readonly airLift?: number;

  readonly airLaunch?: boolean;
  /**
   * With `airLaunch`: the blow throws him up whatever the string (2026-10-22, a fighter's launching skill — `NativeCityKumaAirChase`) — not
   * only a counter string's ender. His guard, armour and a break still take it as any blow.
   */
  readonly forceLaunch?: boolean;

  readonly answerMs?: number;

  readonly freeBeforeMs?: number;
}

export interface KumaCombatParryOptions {
  /** Straight into the poise break (the back-hand of a string, `parry.groggyHitIndex`). */
  readonly groggy: boolean;
  /** Poise taken (`parry.poiseDrain`). */
  readonly poise: number;
  /** His pack's drawn headings (`kumaActionFacing`); absent: the four diagonals. */
  readonly artFacing?: KumaArtFacing;
}
