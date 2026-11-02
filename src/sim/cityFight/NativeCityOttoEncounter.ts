
import { cityFightStageLine, cityFightStageSnap, type CityFightStageLine } from "./CityFightStageLine";
import { stepNativeCityKnockedBody, type NativeCityKnock } from "./NativeCityMelee";
import type { NativeCityImpactTier } from "./NativeCityCombatTuning";
import type { NativeCityContactMotion } from "./NativeCityPlayerSwing";
import { startDuelHitReaction, stepDuelHitReaction, duelHitReactionPrepareMs, type DuelHitReaction } from "../duel/DuelHitReaction";
import type { CityPoint, CityViewId } from "../../world/NativeCityDefinition";
import type { NativeCityEnemyBlow } from "./NativeCityFightFrame";
import OTTO from "../../world/native-city-otto.json";
import { OTTO_GROUND_SLAM, ottoGroundRocks, ottoGroundSlams, ottoRisingRockContact } from "./NativeCityOttoGroundSlam";

export const NATIVE_CITY_OTTO = OTTO;
export const NATIVE_CITY_OTTO_ID = "otto";

/** The view his yard stands in (the clockshop front): his fight, his body and the barrier exist only there. */
export const NATIVE_CITY_OTTO_VIEW_ID: CityViewId = "V1";


export const NATIVE_CITY_OTTO_BLOW: NativeCityEnemyBlow = Object.freeze({ ...OTTO.playerHit, tier: "slam", defendAs: "combo" });


export function ottoStrikeDamage(maxHp: number): number {
  return Math.max(1, Math.round(maxHp * OTTO.playerDamageShare));
}

export type OttoPattern = "sweep" | "drive" | "reverse";
export type OttoPhase = "ready" | "approach" | "windup" | "active" | "recovery" | "snag" | "fumble" | "neutral" | "defeated";

export interface OttoState {
  readonly hp: number;
  readonly phase: OttoPhase;
  /** 지금 단계에 머문 시간(ms). */
  readonly ms: number;
  readonly point: CityPoint;
  readonly pattern: OttoPattern | null;

  readonly aim: CityPoint;
  readonly locked: boolean;
  /** 이번 시도에서 시작한 패턴 수(순서표의 위치). */
  readonly step: number;
  /** 후반 루프의 위치. */
  readonly lateStep: number;
  /** HP 가 절반 이하로 내려갔다(후반 전환 예약). */
  readonly late: boolean;
  /** 후반 루프가 실제로 시작됐다(빈틈이 끝난 뒤). */
  readonly lateApplied: boolean;
  readonly fumbled: boolean;
  /** 공격 실행 번호. 예고마다 1 씩 늘어난다. */
  readonly execution: number;

  readonly struck: number;
  /** Contact inside one execution. Drive has hook/finisher; sweep and reverse each have three contacts. */
  readonly comboBeat?: 0 | 1 | 2;
  /** Actual shared defense outcomes, not geometric overlaps. Protects the whole execution's damage cap. */
  readonly comboHits?: number;
  /** 이번 빈틈(회수·걸림)에서 이미 들어간 유효타 수(`hitsPerOpening` 이 상한). */
  readonly openingHits: number;
  /** A scoring swing may finish its authored contacts without spending another HP/opening allowance. */
  readonly openingAttackId?: number | null;
  /** 직진을 시작한 자리(걸림은 실제로 고정대 쪽으로 밀고 들어갔을 때만). */
  readonly driveFrom: CityPoint | null;
  /** C 반대쪽 호가 치우치는 쪽(+1/-1). C 마다 번갈아 바뀐다. */
  readonly reverseSide: 1 | -1;
  /** 지난 걸음이 옆보기 무대 선(`OttoInput.line`) 위였다 — 빈틈 판정이 방향을 보지 않는다(`stage.openingsIgnoreFacing`). */
  readonly staged: boolean;

  readonly knock?: OttoKnock | null;
  /** Shared contact/brace/flight/landing clock, independent of his opening phase. */
  readonly hitReaction?: DuelHitReaction | null;
}

/** `liftBodies`: this flight's arc height in his drawn heights (the KO's, `reaction.ko`); absent: `reaction.liftBodies`. */
/**
 * `wallMs`: the knock's clock when his KO flight stopped flat (the stage's end, a wall — 2026-10-20 review): the clock runs on to his landing,
 * only the lift comes down from where it hit (`duelWallFallLift`).
 */
export type OttoKnock = NativeCityKnock & { readonly launch: boolean; readonly liftBodies?: number; readonly wallMs?: number };

/** The shared contact response; Otto's opening rules remain his own. */
export interface NativeCityOttoImpact {
  readonly tier: NativeCityImpactTier;
  readonly push: CityPoint;
  readonly chainBeat?: 1 | 2;
  readonly motion: NativeCityContactMotion;
  readonly freezeMs?: number;
}

export interface OttoInput {
  readonly dtMs: number;
  readonly player: CityPoint;
  readonly playerRadius: number;
  /** 한 보폭의 평면 단위(`nativeCityStepUnits`). */
  readonly stride: number;
  /** 차단봉이 전투용 개방 상태다(빈 회수 칸의 고정대가 갈고리를 받는다). */
  readonly barrierOpen: boolean;
  /** 오토 몸이 한 걸음 옮겨 갈 수 있는가(벽·수레에서 멈춘다). 없으면 어디든 갈 수 있다. */
  readonly walkable?: (from: CityPoint, to: CityPoint) => boolean;

  readonly walkUnitsPerMs?: number;
  /** 옆보기 싸움 무대의 선(`ottoStageAnchor` 로 깐 고정 선). 있으면 오토의 발이 매 프레임 그 선 위(양 끝 안)에 붙는다. */
  readonly line?: CityFightStageLine | null;

  readonly pass?: number | null;
}

/** 오토 무대 선의 고정 정의(`ottoStageAnchor`). */
export interface OttoStageAnchor {
  readonly through: CityPoint;
  readonly toward: CityPoint;
  /** 한쪽 길이(평면 단위, 보폭 × halfStrides). */
  readonly halfUnits: number;
  /** 선의 두 끝이 머무는 원: 마당 중심에서 (leashStrides − leashMarginStrides) 보. 무대 끝까지 걸어도 시도가 끝나지 않는다. */
  readonly leash: { readonly center: CityPoint; readonly radius: number };
}


export function ottoStageAnchor(stride: number): OttoStageAnchor {
  const places = OTTO.places as unknown as Record<string, CityPoint>;
  return { through: places[OTTO.stage.through]!, toward: places[OTTO.stage.toward]!, halfUnits: OTTO.stage.halfStrides * stride,
    leash: { center: places.arenaCenter!, radius: Math.max(0, OTTO.places.leashStrides - OTTO.stage.leashMarginStrides) * stride } };
}

/** `point` 가 무대 선 끝의 원(`anchor.leash`) 안이다. */
export function ottoStageInside(anchor: OttoStageAnchor, point: CityPoint): boolean {
  return Math.hypot(point[0] - anchor.leash.center[0], point[1] - anchor.leash.center[1]) <= anchor.leash.radius;
}

/**
 * Otto's stage line: his fixed anchor clipped like any fight's (`cityFightStageLine`, walkable ground) and, more, to the leash circle —
 * both ends stay `stage.leashMarginStrides` inside his arena's leash, so walking to an end never ends the attempt.
 */
export function ottoStageLine(anchor: OttoStageAnchor, walkable: (point: CityPoint) => boolean,
  segmentWalkable: (from: CityPoint, to: CityPoint) => boolean): CityFightStageLine | null {
  return cityFightStageLine(anchor.through, anchor.toward, anchor.halfUnits, point => walkable(point) && ottoStageInside(anchor, point),
    segmentWalkable);
}

export type OttoEvent =
  | { readonly kind: "landed"; readonly point: CityPoint; readonly direction: CityPoint }
  | { readonly kind: "telegraph"; readonly pattern: OttoPattern; readonly execution: number }
  | { readonly kind: "aim-lock"; readonly pattern: OttoPattern }
  /** 직진 예고의 포획 창이 열렸다(기술 소매치기 — 갈고리 번쩍임·"칭"). */
  | { readonly kind: "capture-window"; readonly execution: number }
  | { readonly kind: "hitbox-on"; readonly pattern: OttoPattern }
  | { readonly kind: "strike"; readonly pattern: OttoPattern; readonly execution: number; readonly direction: CityPoint; readonly contact?: 0 | 1 | 2 }
  | { readonly kind: "snag" }
  | { readonly kind: "recover-open"; readonly snag: boolean }
  | { readonly kind: "recover-close" }
  | { readonly kind: "fumble" };

export type OttoHitOutcome = "hit" | "guard" | "none";

type PatternSpec = (typeof OTTO.patterns)[OttoPattern];

/** B(플레이어 지상 충돌폭) 의 평면 단위: 플레이어 반경 × 2. */
export function ottoBlockUnits(playerRadius: number): number { return playerRadius * 2; }

export function ottoBodyRadius(stride: number): number { return OTTO.bodyStrides * stride; }

export function createOttoState(point: CityPoint = OTTO.places.home as unknown as CityPoint): OttoState {
  return Object.freeze({ hp: OTTO.hp, phase: "neutral", ms: 0, point, pattern: null, aim: [0, 1] as CityPoint, locked: false,
    step: 0, lateStep: 0, late: false, lateApplied: false, fumbled: false, execution: 0, struck: 0, openingHits: 0, driveFrom: null,
    reverseSide: 1, staged: false, hitReaction: null });
}

function unit(v: CityPoint, fallback: CityPoint): CityPoint {
  const length = Math.hypot(v[0], v[1]);
  return length > 1e-6 ? [v[0] / length, v[1] / length] : fallback;
}

function rotate(v: CityPoint, degrees: number): CityPoint {
  const r = degrees * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c];
}

function angleBetween(a: CityPoint, b: CityPoint): number {
  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1]));
  return Math.acos(dot) * 180 / Math.PI;
}

/**
 * A tell's timing now (`lateTempo`, 2026-10-17): in the late loop (`lateApplied`) it is `tellScale` of its length, the cut taken from
 * before the aim lock — the locked tail (its read, the tremble, the capture window) keeps its length.
 */
export function ottoTellTiming(state: Partial<Pick<OttoState, "lateApplied" | "comboBeat">>, pattern: OttoPattern)
  : { readonly windupMs: number; readonly aimLockMs: number } {
  if (pattern === "drive" && state.comboBeat === 1) return OTTO.lastHand;
  if (pattern !== "drive" && state.comboBeat) return OTTO.chains[pattern][state.comboBeat - 1]!;
  const p = OTTO.patterns[pattern];
  if (!state.lateApplied) return { windupMs: p.windupMs, aimLockMs: p.aimLockMs };
  const cut = Math.min(p.aimLockMs, p.windupMs * (1 - OTTO.lateTempo.tellScale));
  return { windupMs: p.windupMs - cut, aimLockMs: p.aimLockMs - cut };
}

/** The rest after an attack before he picks the next one: the pattern's, `lateTempo.neutralMs` in the late loop. */
export function ottoNeutralMs(state: Partial<Pick<OttoState, "lateApplied">>, pattern: OttoPattern | null): number {
  return state.lateApplied ? OTTO.lateTempo.neutralMs : OTTO.patterns[pattern ?? "sweep"].neutralMs;
}

/** 직진 예고에서 포획 창이 열리는 시각(ms): `max(aimLockMs, windupMs − pickpocket.captureWindowMs)`(`ottoTellTiming` — 후반도). 창은 windupMs 직전까지다. */
export function ottoCaptureWindowStart(state: Partial<Pick<OttoState, "lateApplied">> = {}): number {
  const drive = ottoTellTiming(state, "drive");
  return Math.max(drive.aimLockMs, drive.windupMs - OTTO.pickpocket.captureWindowMs);
}

/** 지금 포획 창 안이다: 직진 예고, 조준 고정, `ottoCaptureWindowStart() ≤ ms < windupMs`. */
export function ottoCaptureWindowOpen(state: Pick<OttoState, "phase" | "pattern" | "locked" | "ms"> & Partial<Pick<OttoState, "lateApplied" | "comboBeat">>): boolean {
  return state.comboBeat !== 1 && state.phase === "windup" && state.pattern === "drive" && state.locked && state.ms >= ottoCaptureWindowStart(state)
    && state.ms < ottoTellTiming(state, "drive").windupMs;
}

/** 이 단계에서 다음에 고를 패턴(순서표). */
export function ottoNextPattern(state: OttoState): OttoPattern {
  if (state.lateApplied) return OTTO.sequence.late[state.lateStep % OTTO.sequence.late.length] as OttoPattern;
  const { opening, loop } = OTTO.sequence;
  if (state.step < opening.length) return opening[state.step] as OttoPattern;
  return loop[(state.step - opening.length) % loop.length] as OttoPattern;
}

/** 패턴의 판정 중심 방향(C 는 고정 방향에서 offsetDeg 만큼 `side` 쪽으로 치우친다 — C 마다 번갈아). */
export function ottoArcCenter(pattern: OttoPattern, aim: CityPoint, side: 1 | -1 = 1): CityPoint {
  return pattern === "reverse" ? rotate(aim, side * OTTO.patterns.reverse.offsetDeg) : aim;
}

/** 패턴이 닿는 거리(평면 단위). drive 는 끝까지 밀고 들어간 거리. */
export function ottoPatternReach(pattern: OttoPattern, playerRadius: number): number {
  const b = ottoBlockUnits(playerRadius), spec = OTTO.patterns[pattern];
  return ("reachB" in spec ? spec.reachB : spec.travelB) * b;
}

function inArc(origin: CityPoint, center: CityPoint, arcDeg: number, reach: number, target: CityPoint, targetRadius: number): boolean {
  const v: CityPoint = [target[0] - origin[0], target[1] - origin[1]], distance = Math.hypot(v[0], v[1]);
  if (distance > reach + targetRadius) return false;
  if (distance <= targetRadius) return true;
  const slack = Math.asin(Math.min(1, targetRadius / distance)) * 180 / Math.PI;
  return angleBetween(center, [v[0] / distance, v[1] / distance]) <= arcDeg / 2 + slack;
}

function enter(state: OttoState, phase: OttoPhase, extra: Partial<OttoState> = {}): OttoState {
  return Object.freeze({ ...state, openingAttackId: null, ...extra, phase, ms: 0 });
}

/** Actual shared defense outcome gates the follow-up. A miss, block, invulnerability or stolen hook never starts it. */
export function ottoConfirmHook(state: OttoState, execution: number, outcome: string): OttoState {
  if (outcome !== "hit" || state.execution !== execution || state.pattern !== "drive" || state.comboBeat === 1
    || (state.phase !== "active" && state.phase !== "recovery")) return state;
  return enter(state, "windup", { comboBeat: 1, locked: true, struck: -1, driveFrom: null });
}

/** Contact and its floor telegraph read the same finisher geometry. */
export function ottoFinisher(state: Pick<OttoState, "pattern"> & Partial<Pick<OttoState, "comboBeat">>): boolean {
  return state.pattern === "drive" && state.comboBeat === 1;
}

/** Timing and geometry of this contact, shared by simulation, floor marks and animation. */
export function ottoContactSpec(state: Pick<OttoState, "pattern"> & Partial<Pick<OttoState, "comboBeat">>) {
  const pattern = state.pattern ?? "sweep";
  if (ottoFinisher(state)) return OTTO.lastHand;
  if (pattern !== "drive" && state.comboBeat) return OTTO.chains[pattern][state.comboBeat - 1]!;
  return OTTO.patterns[pattern];
}

/** The visible weapon contact within each active sequence. Stone contact uses its own rising cells. */
export function ottoContactFeel(state: Pick<OttoState, "pattern"> & Partial<Pick<OttoState, "comboBeat">>) {
  const pattern = state.pattern ?? "sweep";
  return pattern === "drive" ? OTTO.contactFeel.drive : OTTO.contactFeel[pattern][state.comboBeat ?? 0]!;
}

export function ottoContactArc(state: Pick<OttoState, "pattern" | "aim" | "reverseSide"> & Partial<Pick<OttoState, "comboBeat">>, playerRadius: number)
  : { readonly center: CityPoint; readonly arcDeg: number; readonly reach: number } | null {
  const spec = ottoContactSpec(state);
  if (!("arcDeg" in spec)) return null;
  const beat = state.comboBeat ?? 0;
  const center = state.pattern === "reverse" && beat < 2
    ? ottoArcCenter("reverse", state.aim, beat === 0 ? state.reverseSide : state.reverseSide === 1 ? -1 : 1) : state.aim;
  return { center, arcDeg: spec.arcDeg, reach: spec.reachB * ottoBlockUnits(playerRadius) };
}

/** 오토가 싸움 중인가(공격·빈틈이 있는 단계). */
export function ottoFighting(state: OttoState): boolean { return state.phase !== "defeated"; }

/** 오토의 등이 열린 단계인가. */
export function ottoOpen(state: Pick<OttoState, "phase">): boolean { return state.phase === "recovery" || state.phase === "snag"; }

/** Scoring swings left in this opening. Contact rules, the HUD and the recovery pose share this reading. */
export function ottoOpeningHitsLeft(state: Pick<OttoState, "phase"> & Partial<Pick<OttoState, "openingHits">>): number {
  if (!ottoOpen(state)) return 0;
  const cap = state.phase === "snag" ? OTTO.hitsPerOpening.snag : OTTO.hitsPerOpening.recovery;
  return Math.max(0, cap - (state.openingHits ?? 0));
}

/** `origin` 에서 온 타격이 오토의 열린 면에 맞는가(recovery 는 뒤 180°, snag 은 240°; 옆보기 무대 선 위에서는 방향 무관). */
export function ottoVulnerableFrom(state: OttoState, origin: CityPoint): boolean {
  if (!ottoOpen(state)) return false;
  // 옆보기 무대 선 위: 빈틈은 위치가 아니라 시간 — 회수·걸림 동안의 접촉은 어느 쪽에서든 열린 면이다.
  if (state.staged && OTTO.stage.openingsIgnoreFacing) return true;
  const v = unit([origin[0] - state.point[0], origin[1] - state.point[1]], [-state.aim[0], -state.aim[1]]);
  const arc = state.phase === "snag" ? OTTO.snagArcDeg : OTTO.rearArcDeg;
  return angleBetween([-state.aim[0], -state.aim[1]], v) <= arc / 2;
}


export function ottoTakeHit(state: OttoState, origin: CityPoint, attackId?: number): { readonly state: OttoState; readonly outcome: OttoHitOutcome;
  readonly defeated: boolean; readonly followUp?: boolean } {
  if (state.phase === "defeated") return { state, outcome: "none", defeated: false };
  if (!ottoVulnerableFrom(state, origin)) return { state, outcome: "guard", defeated: false };
  // The contact latch already rejects duplicate frames. Follow-up contacts of this scoring swing may recoil/launch at their real
  // authored moment, but cannot take more HP or extend the opening. A phase transition clears this permission. `followUp`: it took no
  // HP, so it shows as a small recoil, never as a scoring blow (2026-10-17 fight film review: V's second contact drew a bigger hit than
  // its first while the bar did not move).
  // One flinch per move (2026-10-18): a follow-up of the swing he is still reacting to goes on with that reaction (no new snap).
  if (attackId !== undefined && state.openingAttackId === attackId && state.openingHits > 0) {
    return { state: Object.freeze({ ...state, hitReaction: state.hitReaction ?? startDuelHitReaction() }), outcome: "hit", defeated: false, followUp: true };
  }
  // 한 빈틈에 유효타는 정해진 수까지(직접 공략은 회수마다 한 번, 걸림은 두 번 정도). 넘친 타격은 막는다.
  if (ottoOpeningHitsLeft(state) === 0) return { state, outcome: "guard", defeated: false };
  const hp = Math.max(0, state.hp - OTTO.hitDamage);
  // Defeat stops his rules (no more attacks). The blow's own flight is `ottoKoLaunch`, stepped by `stepOttoDown` to the floor.
  if (hp <= 0) return { state: enter(state, "defeated", { hp: 0, pattern: null, knock: null, hitReaction: null }), outcome: "hit", defeated: true };
  return { state: Object.freeze({ ...state, hp, late: state.late || hp <= OTTO.halfHp, openingHits: state.openingHits + 1,
    openingAttackId: attackId ?? null, hitReaction: startDuelHitReaction() }), outcome: "hit",
    defeated: false };
}


export function ottoLaunch(state: OttoState, direction: CityPoint, units: number, launch: boolean): { readonly state: OttoState; readonly units: number } {
  const length = Math.hypot(direction[0], direction[1]);
  if (state.phase === "snag" || state.phase === "defeated" || !(units > 0) || !(length > 1e-6)) return { state, units: 0 };
  const knock: OttoKnock = Object.freeze({ direction: [direction[0] / length, direction[1] / length] as CityPoint, units, elapsedMs: 0, launch,
    ...(launch ? { flightMs: OTTO.reaction.flightMs, holdMs: duelHitReactionPrepareMs(OTTO.reaction) } : {}) });
  return { state: Object.freeze({ ...state, knock, ...(launch ? { hitReaction: startDuelHitReaction(true) } : {}) }), units };
}

/**
 * The decisive blow throws him (`reaction.ko`, 2026-10-17 fight film review — his body used to sit down in the frame of the blow): `strides`
 * along `direction`, flying `flightMs` with the contact / brace beat first (the shared hit reaction), on his drawn height × `liftBodies`.
 * Only a defeated Otto; `stepOttoDown` carries the flight to the floor (walls stop it as any push).
 */
export function ottoKoLaunch(state: OttoState, direction: CityPoint, stride: number): { readonly state: OttoState; readonly units: number } {
  const length = Math.hypot(direction[0], direction[1]), ko = OTTO.reaction.ko, units = ko.strides * Math.max(0, stride);
  if (state.phase !== "defeated" || !(units > 0) || !(length > 1e-6)) return { state, units: 0 };
  const knock: OttoKnock = Object.freeze({ direction: [direction[0] / length, direction[1] / length] as CityPoint, units, elapsedMs: 0, launch: true,
    flightMs: ko.flightMs, holdMs: duelHitReactionPrepareMs(OTTO.reaction), liftBodies: ko.liftBodies });
  return { state: Object.freeze({ ...state, knock, hitReaction: startDuelHitReaction(true) }), units };
}

/** He is down and still falling (the KO's flight or its landing beat): his body keeps stepping (`stepOttoDown`). */
export function ottoFalling(state: OttoState): boolean {
  return state.phase === "defeated" && (Boolean(state.knock) || Boolean(state.hitReaction));
}

/**
 * One frame of a defeated Otto's fall (`ottoKoLaunch`): the flight on the fight clock, the stage line under his feet, the one landing
 * event and the reaction's landing beat. Nothing else of his rules runs.
 */
export function stepOttoDown(state: OttoState, input: OttoInput): { readonly state: OttoState; readonly events: readonly OttoEvent[] } {
  if (!ottoFalling(state)) return { state, events: [] };
  const dt = Math.max(0, input.dtMs), flying = state.knock, events: OttoEvent[] = [];
  let next = flying ? stepOttoKnock(state, dt, input, true) : state;
  if (input.line) {
    const on = cityFightStageSnap(input.line, next.point);
    if (on[0] !== next.point[0] || on[1] !== next.point[1]) next = Object.freeze({ ...next, point: on });
  }
  if (flying && !next.knock) events.push({ kind: "landed", point: next.point, direction: flying.direction });
  const hitReaction = stepDuelHitReaction(state.hitReaction, OTTO.reaction, dt, next.knock, events.length > 0);
  if (hitReaction !== next.hitReaction) next = Object.freeze({ ...next, hitReaction });
  return { state: next, events };
}

/**
 * 밀려 나는 몸의 이번 걸음 — 쿠마형 상대와 같은 규칙(`stepNativeCityKnockedBody`): 벽·수레에 막힌 축은 버리고 남은 축으로 미끄러진다
 * (2026-10-17 사용자 결정 — 전에는 처음 닿은 벽에서 밀림이 끝났다). 정면으로 막혀 밀리는 쪽으로 한 뼘도 못 가면 날아가기가 그 자리에서
 * 끝난다(내려선다). 넉아웃(`ko`)은 다르다: 무대 선 끝에서도 붙잡히고, 막히면 시계를 그대로 흘려 제때 내려앉고 높이만 거기서 내려온다
 * (`wallMs`, 2026-10-20 리뷰 — 3보로 늘린 뒤 무대 끝에서 기둥을 타고 오르거나 한 프레임에 떨어졌다). 무대 선은 부르는 쪽도 붙인다.
 */
function stepOttoKnock(state: OttoState, dt: number, input: OttoInput, ko = false): OttoState {
  const knock = state.knock;
  if (!knock || dt <= 0) return state;
  const line = ko ? input.line : undefined;
  const step = stepNativeCityKnockedBody(state.point, knock, dt, input.stride, ottoBodyRadius(input.stride), [], input.walkable,
    line ? point => cityFightStageSnap(line, point) : undefined);
  const blocked = step.travel > 0 && step.moved <= 1e-6;
  if (ko && blocked && knock.flightMs !== undefined && step.knock) {
    return Object.freeze({ ...state, point: step.point, knock: Object.freeze({ ...step.knock, wallMs: knock.wallMs ?? knock.elapsedMs }) });
  }
  return Object.freeze({ ...state, point: step.point, knock: blocked ? null : step.knock });
}

/** 한 프레임. 단계 경계는 한 번만 넘는다(프레임 길이는 부르는 쪽이 제한한다). */
export function stepOtto(state: OttoState, input: OttoInput): { readonly state: OttoState; readonly events: readonly OttoEvent[] } {
  const events: OttoEvent[] = [];
  if (state.phase === "defeated") return { state, events };
  const dt = Math.max(0, input.dtMs);
  let next: OttoState = Object.freeze({ ...state, ms: state.ms + dt });
  const toPlayer = unit([input.player[0] - next.point[0], input.player[1] - next.point[1]], next.aim);
  const body = ottoBodyRadius(input.stride), b = ottoBlockUnits(input.playerRadius);
  const spec: PatternSpec | null = next.pattern ? OTTO.patterns[next.pattern] : null;
  switch (next.phase) {
    // 쓰러진 오토는 위에서 이미 돌아갔다.
    case "defeated": break;
    case "neutral":
      if (next.ms >= ottoNeutralMs(next, spec ? next.pattern : null)) next = enter(next, "ready", { pattern: null });
      break;
    case "ready":
    case "approach": {
      // Openings continue on their own clock; only choosing a new attack waits for the grounded return.
      if (state.hitReaction || (state.knock?.flightMs ?? 0) > 0) break;
      const pattern = ottoNextPattern(next);
      const distance = Math.hypot(input.player[0] - next.point[0], input.player[1] - next.point[1]);
      const reach = ottoPatternReach(pattern, input.playerRadius) * (pattern === "drive" ? 0.85 : 0.8) + input.playerRadius + body * 0.5;
      if (distance > reach) {
        // 닿지 않으면 공격하지 않는다: 일정 시간 다가가도 못 닿으면(벽 너머·너무 멀리) 숨을 고르고 다시 본다.
        if (next.phase === "approach" && next.ms >= OTTO.approachGiveUpMs) { next = enter(next, "neutral", { pattern: null }); break; }
        if (next.phase === "ready") { next = enter(next, "approach"); break; }
        // 플레이어 기본 걸음의 70%. 화면 밖에서 예고 없이 들이받지 않는다(접근은 그냥 걷는다).
        const speed = OTTO.approachSpeedShare * (input.walkUnitsPerMs ?? input.stride * 1.1 / 1000);
        const step = Math.min(dt * speed, distance - reach);
        const to: CityPoint = [next.point[0] + toPlayer[0] * step, next.point[1] + toPlayer[1] * step];
        if (!input.walkable || input.walkable(next.point, to)) next = Object.freeze({ ...next, point: to, aim: toPlayer });
        break;
      }
      const execution = next.execution + 1;
      next = enter(next, "windup", { pattern, aim: toPlayer, locked: false, execution, comboBeat: 0, comboHits: 0,
        step: next.lateApplied ? next.step : next.step + 1, lateStep: next.lateApplied ? next.lateStep + 1 : next.lateStep,
        reverseSide: pattern === "reverse" ? (next.reverseSide === 1 ? -1 : 1) : next.reverseSide });
      events.push({ kind: "telegraph", pattern, execution });
      break;
    }
    case "windup": {
      const pattern = next.pattern!, p = ottoTellTiming(next, pattern);
      if (!next.locked) {
        next = Object.freeze({ ...next, aim: toPlayer });
        if (next.ms >= p.aimLockMs) { next = Object.freeze({ ...next, locked: true }); events.push({ kind: "aim-lock", pattern }); }
      }
      // 포획 창이 이번 걸음에 열렸다(창을 통째로 건너뛴 큰 걸음은 아니다 — 그때는 아래에서 곧장 판정으로 넘어간다).
      if (ottoCaptureWindowOpen(next) && state.ms < ottoCaptureWindowStart(next)) events.push({ kind: "capture-window", execution: next.execution });
      if (next.ms >= p.windupMs) { next = enter(next, "active", { driveFrom: next.point }); events.push({ kind: "hitbox-on", pattern }); }
      break;
    }
    case "active": {
      const pattern = next.pattern!, p = ottoContactSpec(next);
      if (pattern === "drive" && !ottoFinisher(next)) {
        const drive = OTTO.patterns.drive, speed = drive.travelB * b / drive.activeMs;
        const travelDt = Math.min(dt, Math.max(0, drive.activeMs - state.ms));
        const to: CityPoint = [next.point[0] + next.aim[0] * speed * travelDt, next.point[1] + next.aim[1] * speed * travelDt];
        if (input.walkable && !input.walkable(next.point, to)) {
          // 벽·수레에 막히면 직진은 거기서 끝난다(판정도 함께 꺼진다).
          next = enter(next, "recovery", { openingHits: 0 });
          events.push({ kind: "recover-open", snag: false });
          break;
        }
        next = Object.freeze({ ...next, point: to });
        const slot = OTTO.places.snagSlot as unknown as CityPoint, from = next.driveFrom ?? next.point;
        const travelled = Math.hypot(next.point[0] - from[0], next.point[1] - from[1]);
        const toward = (slot[0] - from[0]) * next.aim[0] + (slot[1] - from[1]) * next.aim[1] > 0;
        if (input.barrierOpen && toward && travelled >= OTTO.snag.minTravelB * b
          && Math.hypot(next.point[0] - slot[0], next.point[1] - slot[1]) <= OTTO.snag.radiusStrides * input.stride) {
          // 갈고리가 빈 고정대에 걸렸다: 판정은 즉시 끝나고 긴 빈틈.
          events.push({ kind: "snag" }, { kind: "recover-open", snag: true });
          next = enter(next, "snag", { openingHits: 0 });
          break;
        }
        const tip: CityPoint = [next.point[0] + next.aim[0] * b * 0.5, next.point[1] + next.aim[1] * b * 0.5];
        if (next.struck !== next.execution && next.execution !== input.pass
          && Math.hypot(input.player[0] - tip[0], input.player[1] - tip[1]) <= drive.widthB * b / 2 + input.playerRadius) {
          next = Object.freeze({ ...next, struck: next.execution });
          events.push({ kind: "strike", pattern, execution: next.execution, direction: next.aim });
        }
      } else if (next.struck !== next.execution && (next.comboHits ?? 0) < OTTO.chains.maxScoringContacts && next.execution !== input.pass) {
        const arc = ottoContactArc(next, input.playerRadius)!;
        const rock = ottoGroundSlams(next)
          ? ottoRisingRockContact(ottoGroundRocks(next, input.playerRadius, input.walkable, input.line), state.ms, next.ms, input.player, input.playerRadius) : null;
        if ((!input.walkable || input.walkable(next.point, input.player))
          && (ottoGroundSlams(next) ? rock !== null : next.ms >= ottoContactFeel(next).contactMs
            && inArc(next.point, arc.center, arc.arcDeg, arc.reach, input.player, input.playerRadius))) {
          next = Object.freeze({ ...next, struck: next.execution,
            ...(rock ? { ms: Math.min(next.ms, Math.max(state.ms, rock.bornMs + OTTO_GROUND_SLAM.hitDelayMs)) } : {}) });
          events.push({ kind: "strike", pattern, execution: next.execution, direction: ottoGroundSlams(next) ? next.aim : toPlayer,
            ...((next.comboBeat ?? 0) > 0 ? { contact: next.comboBeat } : {}) });
        }
      }
      // Answer a newly emitted contact before changing its identity, even when a large frame crosses the phase end.
      if (next.phase === "active" && next.ms >= p.activeMs && !events.some(event => event.kind === "strike")) {
        const beat = next.comboBeat ?? 0;
        if (pattern !== "drive" && beat < OTTO.chains[pattern].length) {
          next = enter(next, "windup", { comboBeat: (beat + 1) as 1 | 2, locked: true, struck: -1 });
        } else {
          next = enter(next, "recovery", { openingHits: 0 }); events.push({ kind: "recover-open", snag: false });
        }
      }
      break;
    }
    case "recovery":
    case "snag": {
      const p = OTTO.patterns[next.pattern!];
      const length = next.phase === "snag" ? OTTO.patterns.drive.snagRecoveryMs : p.recoveryMs;
      if (next.ms < length) break;
      events.push({ kind: "recover-close" });
      // 후반 전환은 빈틈을 끝까지 보장한 뒤. 단추를 놓치는 반응은 한 번만.
      if (next.late && !next.lateApplied) {
        next = enter(next, "fumble", { lateApplied: true, lateStep: 0, fumbled: true });
        events.push({ kind: "fumble" });
      } else next = enter(next, "neutral");
      break;
    }
    case "fumble":
      if (next.ms >= OTTO.buttonFumbleMs) next = enter(next, "neutral");
      break;
  }
  const flying = next.knock;
  if (flying && next.phase !== "defeated") next = stepOttoKnock(next, dt, input);
  // 옆보기 무대: 선 위에 있는지 기억하고(빈틈 판정), 다가가기·직진이 옮긴 발을 선 위로(쓰러진 몸은 그대로 둔다).
  const staged = Boolean(input.line);
  if (next.staged !== staged) next = Object.freeze({ ...next, staged });
  if (input.line && next.phase !== "defeated") {
    const on = cityFightStageSnap(input.line, next.point);
    if (on[0] !== next.point[0] || on[1] !== next.point[1]) next = Object.freeze({ ...next, point: on });
  }
  // Completing the flight or meeting a wall lands once; a held clock cannot land it again.
  if (flying?.launch && !next.knock && next.phase !== "defeated") events.push({ kind: "landed", point: next.point, direction: flying.direction });
  const hitReaction = stepDuelHitReaction(state.hitReaction, OTTO.reaction, dt, next.knock, events.some(event => event.kind === "landed"));
  if (hitReaction !== next.hitReaction) next = Object.freeze({ ...next, hitReaction });
  return { state: next, events };
}

/** 차단봉 손잡이: 닫힘/전투용 개방 두 안정 상태. 붙어서 holdMs 동안 누르고 있어야 열리고, 맞거나 움직이면 취소된다. */
export interface OttoBarrierState { readonly open: boolean; readonly holdMs: number }

export function createOttoBarrier(): OttoBarrierState { return Object.freeze({ open: false, holdMs: 0 }); }

export function stepOttoBarrier(state: OttoBarrierState, input: { readonly dtMs: number; readonly holding: boolean; readonly interrupted: boolean }): OttoBarrierState {
  if (state.open) return state;
  // 같은 틱의 취소(피격·이동)가 완료보다 먼저다.
  if (!input.holding || input.interrupted) return state.holdMs === 0 ? state : Object.freeze({ open: false, holdMs: 0 });
  const holdMs = state.holdMs + Math.max(0, input.dtMs);
  return Object.freeze(holdMs >= OTTO.barrier.holdMs ? { open: true, holdMs: 0 } : { open: false, holdMs });
}
