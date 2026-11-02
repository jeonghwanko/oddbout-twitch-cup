import type { CityPoint } from "../../world/NativeCityDefinition";
import type { NativeCityKumaActionKind } from "./NativeCityCombatTuning";
import type { KumaCombatInput, KumaCombatState, KumaDash, KumaSpecialMove, KumaTuning } from "./NativeCityKumaCombatState";
import { kumaActionFacing, kumaGap, kumaScreenDelta, kumaWalkPhase, unit } from "./NativeCityKumaGeometry";
import { nativeCityMeleeInCone } from "./NativeCityMelee";

/**
 * 파이터 고유 기술(2026-10-22, ODDBOUT 이벤트 선수 10종 — docs/Plan/2026-10-22-oddbout-event-fighters): 행의 `skill` 하나가 그의 공격·돌진·도약
 * 위에 작은 갈래를 더한다. 그림은 그의 팩 `skill` 클립(그린 박자 그대로, `KumaSkillMarks`), 접촉은 늘 기존 `strike` 사건이고 수치는 `action` 의 것.
 *
 * - 공격 위(`attack` 모드, 특수 `skill:<kind>`):
 *   - pincer: 집게 호 한 번 — 사거리 `reachStrides`.
 *   - stretch: 다 뻗은 주먹 끝만 — `innerStrides` 보다 가까우면 지나쳐 헛친다(`kumaSkillStrikeMisses`).
 *   - recoil: 물러남(`backStrides`, 무적 없음) → 기다림 → 다시 누름(AI 는 거리·몫)이면 찌르기, 아니면 아무것도 던지지 않고 선다.
 *   - counter: 자세 창 안에 정면 근접 타격 → 막고(피해 0) 곧장 되친다. 빈 창은 아무것도 안 던진 헛침 — 회복이 열린다.
 *   - brace: 자세 창 동안 정면 가드(가드 규칙 그대로) → 막은 뒤 `followMs` 안에 다시 누름(AI 는 `aiFollowMs` 뒤)이면 밀어내기.
 *   - burrow: 파고들기(예고) → 도약 경로(엉덩방아와 같은 잠금·통과·맞지 않음, 거리 `maxStrides`) → 표시한 출구에서 앞발.
 *   - matrix(2026-10-25, 이토 「매트릭스인 줄」): 가슴을 펴고(예고) 뒤로 크게 젖힌다 → 버티지 못하고 넘어지며 솟은 발이 한 번 찬다(접촉) →
 *     누워 버둥 → 지팡이를 짚고 일어남. 젖힘부터 일어나기 전까지 몸이 낮다(`kumaCombatLow`): 높은 소환물과 높은 공격(`highActions`)이 위로
 *     지나간다. 무적은 아니다 — 낮은 공격·근접 타격은 맞는다.
 * - 돌진 위(`dash` 모드): slide(방향 고정·감속), flight(몸을 통과해 정해진 끝까지, 접촉 한 번), feint(분기점에서 멈춤 — 다시 누름 / AI 몫).
 *
 * AI 는 소환처럼 주기(`everyAttacks`)·몫(`weight`)·최소 거리로 고른다. 사람은 X(`special`)로 쓴다(같은 주기). 기술이 없는 파이터의 규칙은 그대로다.
 *
 * 필살기 형(2026-10-22 4차, 행 `superSkill` — 사용자: "다채롭고 도파민 터지게"): 게이지를 다 쓴 필살기가 그의 기술의 큰 판이다. 특수
 * `super:<kind>`, 그림은 팩의 `superSkill` 클립(없으면 `skill` 클립), 접촉은 필살기의 것(피해 배수·갑옷·표시 — `kumaSuperSwing`).
 * - slide: `passes` 번 관통 왕복 — 한 번 지나가 `passStrides`(공중 추격의 것)를 넘기거나 벽·달리기 끝에 닿으면 상대 쪽으로 돌아 다시 달린다.
 *   마지막이 아닌 관통은 `passAction` 의 첫 접촉 수치(가벼운 한 대)이고, 마지막 관통이 띄운다(`launches`).
 * - burrow: 잠복의 도약을 `maxStrides`·`landGapStrides`·`reachStrides` 로 덮는다(출구가 상대 발밑). 가짜 출구는 그림뿐이다(클립 `keys.decoys`).
 */

export type CityFighterSkillKind = "pincer" | "stretch" | "recoil" | "counter" | "brace" | "burrow" | "slide" | "flight" | "feint" | "matrix";

/** One fighter's skill (`native-city-fighters.json` row `skill`, `KumaTuning.skill`). Distances are strides beyond body contact. */
export interface CityFighterSkillTuning {
  readonly kind: CityFighterSkillKind;
  /** The action whose numbers its contact takes (damage, tier, the answer to it, knockback); `dash` for the dash kinds. */
  readonly action: NativeCityKumaActionKind;
  /** Rotation attacks between two skills (the first is free) — the AI's cadence and a person's X alike. */
  readonly everyAttacks: number;
  /**
   * The AI's cadence when the opponent already stands where the skill works — between `minGapStrides` and `startStrides` beyond contact
   * (2026-10-22 5차, 추천 5번 "공격 두 번마다 고정이 아니라 거리를 보고"): sooner than `everyAttacks`. It binds against an opponent who keeps
   * his distance (a caster); up close the skill does not come at all (`minGapStrides`). Absent: `everyAttacks` everywhere.
   */
  readonly inRangeEveryAttacks?: number;
  /** The AI's seeded share of using it when it may (0..1). */
  readonly weight: number;
  /** Where his chase starts it, and the nearest gap the AI uses it from. */
  readonly startStrides: number;
  readonly minGapStrides: number;
  /** Its contact's reach (pincer, stretch, recoil, counter, brace, burrow); `innerStrides`: nearer than this the stretch's fist overshoots. */
  readonly reachStrides?: number;
  readonly innerStrides?: number;
  /** recoil: the hop back. */
  readonly backStrides?: number;
  /** burrow: the farthest exit from where he dug in, and how far short of the opponent's contact it opens. */
  readonly maxStrides?: number;
  readonly landGapStrides?: number;
  /** brace: the shove's window after the block (fight ms), the AI's shove after the block. */
  readonly followMs?: number;
  readonly aiFollowMs?: number;
  /** recoil: the AI's seeded share of poking with the opponent out of reach; feint: of stopping. */
  readonly aiShare?: number;
  /**
   * The AI uses it only at a body within this far beyond contact (strides), and only with `roomBehindStrides` of the line behind him
   * (2026-10-25, 이토's strategic retreat — 코믹 스킬 기획서: from a close opponent, never with no room to run). Absent: no such limit.
   */
  readonly aiWithinStrides?: number;
  readonly roomBehindStrides?: number;

  readonly roomBeyondStrides?: number;
  /** The dash kinds' run: top speed (strides/s), the length of the run, how far it turns after the opponent (deg). Absent: his dash's. */
  readonly topSpeedStrides?: number;
  readonly maxTravelStrides?: number;
  readonly homingDeg?: number;
  /** slide: the speed at the end of the run, a share of top speed (the belly slows on the floor). */
  readonly endSpeedShare?: number;
  /** feint: where it stops — a share of the way to where it locked on at launch (never past its run). */
  readonly branchShare?: number;
  /**
   * Its contact throws the body up for his air chase (2026-10-22, `NativeCityKumaAirChase`; a fighter-against-fighter bout only — the bout's
   * air, `KumaTuning.boutAir`). Absent: a ground blow as before.
   */
  readonly launches?: boolean;
  /** slide: it runs on through the body it strikes, as the flight does (2026-10-22 — the slide under him and out the other side). */
  readonly passThrough?: boolean;

  readonly leaves?: "ice" | "hole";
}

/**
 * His super as his skill's super form (`native-city-fighters.json` row `superSkill`, `KumaTuning.superSkill`, 2026-10-22 4차): his full meter
 * buys his skill in its big form — special `super:<kind>`, drawn by his pack's `superSkill` clip (else his `skill` clip), its contacts his
 * super's. Distances are strides beyond body contact; absent fields keep the skill's.
 */
export interface CityFighterSuperSkillTuning {
  /** slide: how many runs through the body (each turns back after `airChase.passStrides`, a wall or its run's end); only the last launches. */
  readonly passes?: number;
  /** slide: the action whose first contact the passes before the last strike with (a light blow that keeps him there), else the skill's. */
  readonly passAction?: NativeCityKumaActionKind;
  /** slide: how far past the body a run goes before it turns back (strides). Absent: the air chase's `passStrides`. */
  readonly turnStrides?: number;
  /** burrow: the leap over the skill's (`CityFighterSkillTuning.maxStrides` / `landGapStrides` / `reachStrides`). */
  readonly maxStrides?: number;
  readonly landGapStrides?: number;
  readonly reachStrides?: number;
}

/**
 * A skill clip's drawn marks (fight ms into the swing — the clip plays as drawn): the stance's window and the strike segment it jumps to
 * (counter, brace), the hop and the wait (recoil), the dig-in (burrow), the dash kinds' tell and open stand.
 */
export interface KumaSkillMarks {
  readonly kind: CityFighterSkillKind;
  readonly totalMs: number;
  /** How many contacts the clip draws (the ones a stance or a recoil skips are spent unthrown). */
  readonly hits: number;
  readonly windowFromMs?: number;
  readonly windowToMs?: number;
  readonly strikeFromMs?: number;
  readonly strikeToMs?: number;
  readonly backFromMs?: number;
  readonly backToMs?: number;
  readonly waitToMs?: number;
  /** matrix: his body is low from the lean until he gets up (`kumaCombatLow`). */
  readonly lowFromMs?: number;
  readonly lowToMs?: number;

  readonly lowTravel?: boolean;
  /**
   * recoil: the hop is a run away (`keys.flee`, 2026-10-25 — 이토's strategic retreat): until its poke's ready (`waitToMs`) the other reads
   * him as a man running away, not a swing to wait out (`kumaSkillFleeing`).
   */
  readonly flee?: boolean;
  readonly takeoffMs?: number;
  /** The dash kinds: the crouch's tell (the dash's windup) and the open stand after the run (the landing, the brake, the stop). */
  readonly windupMs?: number;
  readonly recoverMs?: number;
}

const DASH_KINDS: ReadonlySet<CityFighterSkillKind> = new Set(["slide", "flight", "feint"]);

/** The special that draws `kind` (`skill:<kind>`), its super form (`super:<kind>`, `superSkill`). */
export function kumaSkillSpecial(kind: CityFighterSkillKind, superForm = false): KumaSpecialMove {
  return superForm ? `super:${kind}` : `skill:${kind}`;
}

/** The skill a special draws (its super form too), else null. */
export function kumaSkillKind(special: KumaSpecialMove | null | undefined): CityFighterSkillKind | null {
  return special?.startsWith("skill:") || special?.startsWith("super:") ? special.slice(6) as CityFighterSkillKind : null;
}

/** The special is a skill's super form (`super:<kind>`, `KumaTuning.superSkill`). */
export function kumaSkillSuperForm(special: KumaSpecialMove | null | undefined): boolean {
  return special?.startsWith("super:") === true;
}

/** His skill in `slot` (0: `KumaTuning.skill`, 1: `skill2` — 2026-10-25), else undefined. */
export function kumaSkillSlotSpec(t: Pick<KumaTuning, "skill" | "skill2">, slot: number): CityFighterSkillTuning | undefined {
  return slot === 1 ? t.skill2 : slot === 0 ? t.skill : undefined;
}

/** His skill of `kind` (his `skill`, else his `skill2` — the two are different kinds), else undefined. */
export function kumaSkillSpec(t: Pick<KumaTuning, "skill" | "skill2">, kind: CityFighterSkillKind | null | undefined)
  : CityFighterSkillTuning | undefined {
  if (!kind) return undefined;
  return t.skill?.kind === kind ? t.skill : t.skill2?.kind === kind ? t.skill2 : undefined;
}

/** The slot of his skill of `kind` (0 or 1), else null. */
export function kumaSkillSlotOf(t: Pick<KumaTuning, "skill" | "skill2">, kind: CityFighterSkillKind): number | null {
  return t.skill?.kind === kind ? 0 : t.skill2?.kind === kind ? 1 : null;
}

/**
 * The dash skill runs on through the body it strikes (walls only): the flight, a slide that passes through (`passThrough`), and the slide's
 * super form with passes to run (`superSkill.passes`).
 */
export function kumaSkillThrough(kind: CityFighterSkillKind | null, t: Pick<KumaTuning, "skill" | "skill2" | "superSkill">, superForm = false): boolean {
  return kind === "flight" || kind === "slide" && (kumaSkillSpec(t, kind)?.passThrough === true || superForm && (t.superSkill?.passes ?? 1) > 1);
}

/** The kind runs as his dash (`dash` mode): slide, flight, feint. */
export function kumaSkillDashKind(kind: CityFighterSkillKind): boolean {
  return DASH_KINDS.has(kind);
}

/** The skill he is in (his swing's or his dash's), else null. */
export function kumaSkillOf(state: Pick<KumaCombatState, "mode" | "special" | "dash">): CityFighterSkillKind | null {
  if (state.mode === "attack") return kumaSkillKind(state.special);
  return state.mode === "dash" ? kumaSkillKind(state.dash?.special) : null;
}

/**
 * A skill that wears no attack armour: the stances (their window is the defence), the recoil (no protection on the hop) and the matrix (the
 * lean is a real move of his body, not a protection).
 */
export function kumaSkillBare(state: Pick<KumaCombatState, "mode" | "special" | "dash">): boolean {
  const kind = kumaSkillOf(state);
  return kind === "counter" || kind === "brace" || kind === "recoil" || kind === "matrix";
}


export function kumaCombatLow(state: Pick<KumaCombatState, "mode" | "modeMs" | "special" | "dash" | "skillMarks">): boolean {
  const m = kumaSkillMarksNow(state);
  if (state.mode === "dash") return m?.lowTravel === true && state.dash?.phase === "travel";
  return state.mode === "attack" && m?.kind === "matrix" && m.lowFromMs !== undefined && state.modeMs >= m.lowFromMs
    && state.modeMs < (m.lowToMs ?? m.totalMs);
}

/**
 * The marks of the skill he is in now (`skillMarks`, kept only while his swing or dash is that skill's — a later swing of his rotation, a
 * dash's restart, carries none), else null.
 */
export function kumaSkillMarksNow(state: Pick<KumaCombatState, "mode" | "special" | "dash" | "skillMarks">): KumaSkillMarks | null {
  const m = state.skillMarks;
  return m && kumaSkillOf(state) === m.kind ? m : null;
}

/**
 * He is running away in his strategic retreat (2026-10-25, 이토 — `KumaSkillMarks.flee`): his recoil swing before its poke's ready. The
 * bout's other corner reads no swing to wait out then (he gives chase into the trip — 코믹 스킬 기획서 5번).
 */
export function kumaSkillFleeing(state: Pick<KumaCombatState, "mode" | "modeMs" | "special" | "dash" | "skillMarks">): boolean {
  const m = kumaSkillMarksNow(state);
  return state.mode === "attack" && m?.kind === "recoil" && m.flee === true && state.modeMs < (m.waitToMs ?? m.totalMs);
}

/** His skill is ready (`everyAttacks` rotation attacks since the last one; the first is free). */
export function kumaSkillReady(state: Pick<KumaCombatState, "sinceSkill">, t: KumaTuning): boolean {
  const spec = t.skill;
  return spec !== undefined && (state.sinceSkill ?? spec.everyAttacks) >= spec.everyAttacks;
}

/** His heading toward `player` draws the skill there. */
export function kumaSkillDrawn(point: CityPoint, player: CityPoint, input: Pick<KumaCombatInput, "projection" | "artFacing" | "timing">,
  t: KumaTuning, spec: CityFighterSkillTuning | undefined = t.skill): boolean {
  if (!spec) return false;
  const aim = unit([player[0] - point[0], player[1] - point[1]]);
  const facing = aim ? kumaActionFacing(input.projection, aim, kumaSkillDashKind(spec.kind) ? "dash" : "slam", input.artFacing) : null;
  return facing !== null && input.timing(spec.action, facing, 1, kumaSkillSpecial(spec.kind)) !== null;
}

type KumaSkillDueInput = Pick<KumaCombatInput, "projection" | "artFacing" | "timing" | "contactUnits" | "stepUnits" | "opponentSwing"
  | "highShotComing" | "backRoomUnits" | "beyondRoomUnits">;

/**
 * The AI uses a skill of his now (deterministic): his skill of `kind` when one is named, else any (`kumaSkillDueSlot`).
 */
export function kumaSkillDue(state: Pick<KumaCombatState, "sinceSkill" | "attackId" | "point" | "skillSlot">, player: CityPoint,
  input: KumaSkillDueInput, t: KumaTuning, kind?: CityFighterSkillKind): boolean {
  if (kind === undefined) return kumaSkillDueSlot(state, player, input, t) !== null;
  const slot = kumaSkillSlotOf(t, kind);
  return slot !== null && kumaSkillDueOf(kumaSkillSlotSpec(t, slot), slot, state, player, input, t);
}

/**
 * The slot of the skill the AI uses now (0: `skill`, 1: `skill2`), tried in turn from the one after his last (`skillSlot`); null: none. One
 * skill: slot 0 as ever.
 */
export function kumaSkillDueSlot(state: Pick<KumaCombatState, "sinceSkill" | "attackId" | "point" | "skillSlot">, player: CityPoint,
  input: KumaSkillDueInput, t: KumaTuning): number | null {
  if (!t.skill2) return kumaSkillDueOf(t.skill, 0, state, player, input, t) ? 0 : null;
  for (let k = 1; k <= 2; k++) {
    const slot = ((state.skillSlot ?? -1) + k) % 2;
    if (kumaSkillDueOf(kumaSkillSlotSpec(t, slot), slot, state, player, input, t)) return slot;
  }
  return null;
}

/**
 * The AI uses `spec` (his skill in `slot`) now: ready (`everyAttacks` since the last, or `inRangeEveryAttacks` with the opponent already in
 * the skill's band), the opponent at least `minGapStrides` beyond contact (and within `aiWithinStrides`, with `roomBehindStrides` behind him,
 * where set), the attack's seeded share (`kumaSkillShare`, slot 1 its own stretch) under `weight`, and his heading draws it.
 */
function kumaSkillDueOf(spec: CityFighterSkillTuning | undefined, slot: number, state: Pick<KumaCombatState, "sinceSkill" | "attackId" | "point">,
  player: CityPoint, input: KumaSkillDueInput, t: KumaTuning): boolean {
  if (!spec) return false;
  // The matrix answers a high shot he sees coming (2026-10-25, `highShotComing` — the bout's read): never a plain swing, never on its cadence
  if (spec.kind === "matrix" && input.highShotComing !== true) return false;
  const gap = Math.hypot(player[0] - state.point[0], player[1] - state.point[1]) - input.contactUnits;
  // The bout AI uses a skill when its gag reads (2026-10-23 arena audit — ODDBOUT's counter stood scared for 1.2 s and ended, the brace was
  // cut by a slam, the feint drew no reaction): the stances only into the other's swing just begun, the feint at a body standing close.
  if (t.boutAi && !kumaBoutSkillMoment(spec.kind, gap, input)) return false;
  const inBand = spec.inRangeEveryAttacks !== undefined && gap <= spec.startStrides * input.stepUnits + 1e-9;
  const every = inBand ? Math.min(spec.everyAttacks, spec.inRangeEveryAttacks) : spec.everyAttacks;
  if ((state.sinceSkill ?? spec.everyAttacks) < every) return false;
  if (gap < spec.minGapStrides * input.stepUnits - 1e-9 || kumaSkillShare(state.attackId + 1 + SKILL2_SALT * slot) >= spec.weight) return false;
  // A move from a body close by (2026-10-25, 이토's strategic retreat): only within `aiWithinStrides`, and with room to run behind him.
  if (spec.aiWithinStrides !== undefined && gap > spec.aiWithinStrides * input.stepUnits + 1e-9) return false;
  if (spec.roomBehindStrides !== undefined && input.backRoomUnits !== undefined && input.backRoomUnits < spec.roomBehindStrides * input.stepUnits) return false;
  if (spec.roomBeyondStrides !== undefined && input.beyondRoomUnits !== undefined
    && input.beyondRoomUnits < spec.roomBeyondStrides * input.stepUnits) return false;
  return kumaSkillDrawn(state.point, player, input, t, spec);
}

/** Slot 1's seeded share reads its own stretch of the scramble (slot 0's is the skill's as it was). */
const SKILL2_SALT = 6151;

/** The bout AI's moment for a skill of `kind` (`kumaSkillDue`): a stance into a swing in its first `BOUT_STANCE_READ_MS`, a feint close. */
function kumaBoutSkillMoment(kind: CityFighterSkillKind, gap: number, input: Pick<KumaCombatInput, "stepUnits" | "opponentSwing">): boolean {
  const swing = input.opponentSwing ?? null;
  if (kind === "counter" || kind === "brace") return swing !== null && !swing.contacted && swing.ms <= BOUT_STANCE_READ_MS;
  if (kind === "feint") return swing === null && gap <= BOUT_FEINT_GAP_STRIDES * input.stepUnits;
  return true;
}
/** The bout AI's stance skill (counter, brace) answers a swing at most this far into it (fight ms). */
const BOUT_STANCE_READ_MS = 300;
/** The bout AI's feint plays at a body standing at most this far beyond contact (strides). */
const BOUT_FEINT_GAP_STRIDES = 1.5;

/** The `n`-th attack's seeded share in [0, 1) for the skill (its own scramble — never the rotation's, the summon's or the super's). */
export function kumaSkillShare(n: number): number {
  let h = Math.imul((Math.max(0, Math.floor(n)) + 41) | 0, 0x2545f491);
  h = Math.imul(h ^ (h >>> 15), 0x7feb352d);
  h ^= h >>> 14;
  return (h >>> 0) / 0x100000000;
}

/** The recoil's and the feint's AI share reads its own stretch of the scramble. */
const BRANCH_SALT = 7331;

/** The counter's or the brace's window is open (before its blow). */
export function kumaSkillStanceOpen(state: Pick<KumaCombatState, "mode" | "modeMs" | "special" | "dash" | "skillMarks" | "skillTriggered">): boolean {
  const m = kumaSkillMarksNow(state);
  if (state.mode !== "attack" || !m || (m.kind !== "counter" && m.kind !== "brace") || state.skillTriggered === true) return false;
  return state.modeMs >= (m.windowFromMs ?? 0) && state.modeMs < (m.windowToMs ?? 0);
}

/** The brace guards (its window, and after its block until the shove or the window's end): the guard's rules take the blow. */
export function kumaSkillGuarding(state: Pick<KumaCombatState, "mode" | "modeMs" | "special" | "dash" | "skillMarks">): boolean {
  const m = kumaSkillMarksNow(state);
  return state.mode === "attack" && m?.kind === "brace" && state.modeMs >= (m.windowFromMs ?? 0) && state.modeMs < (m.windowToMs ?? 0);
}

/**
 * His counter's window takes a blow from `from` (its cue): in his front cone (`guard.coneHalfAngleDeg`), a blow of a body — not an object
 * (`ranged`), not one through every armour (the super, the throw).
 */
export function kumaSkillCounterCued(state: KumaCombatState, from: CityPoint,
  blow: { readonly ranged?: boolean; readonly throughArmor?: boolean; readonly pierce?: boolean }, t: KumaTuning): boolean {
  // A blow through every guard (the bout's super, 2026-10-23) goes through his counter's stance too.
  if (kumaSkillMarksNow(state)?.kind !== "counter" || !kumaSkillStanceOpen(state) || blow.ranged === true || blow.throughArmor === true
    || blow.pierce === true) return false;
  return nativeCityMeleeInCone(state.point, state.direction, from, t.guard.coneHalfAngleDeg);
}

/** The counter's cue: the blow is met (no damage) and his counter strike runs at once (the clip's strike segment). */
export function kumaSkillCounter(state: KumaCombatState): KumaCombatState {
  const m = state.skillMarks!;
  return { ...state, modeMs: m.strikeFromMs ?? m.windowToMs ?? state.modeMs, skillTriggered: true, skillTriggerMs: state.modeMs };
}

/** The brace's block (`kumaSkillGuarding` took a blow): its shove window opens from now. */
export function kumaSkillBraced(state: KumaCombatState): KumaCombatState {
  return kumaSkillMarksNow(state)?.kind === "brace" && kumaSkillGuarding(state) && state.skillTriggered !== true
    ? { ...state, skillTriggered: true, skillTriggerMs: state.modeMs } : state;
}

/** A person's press that takes the follow-up (`recoil`'s poke, `brace`'s shove, `feint`'s stop): X, or the light / heavy buttons. */
function followPressed(input: Pick<KumaCombatInput, "control">, heavyToo: boolean): boolean {
  const press = input.control?.press ?? null;
  return press === "special" || press === "light" || heavyToo && press === "heavy";
}

/**
 * His skill's own step inside his swing (`attack` mode, before its contacts fire this step — `stepKumaCombat`): the recoil's hop back and its
 * branch, the stance's window running out, the brace's shove. The swing's clock may jump; the contacts a jump skips are spent unthrown.
 */
export function kumaSkillSwingStep(s: KumaCombatState, input: KumaCombatInput, t: KumaTuning, dt: number): KumaCombatState {
  const m = kumaSkillMarksNow(s), spec = kumaSkillSpec(t, m?.kind);
  if (s.mode !== "attack" || !m || !spec) return s;
  const took = (state: KumaCombatState) => input.control ? { ...state, skillPress: (state.skillPress ?? 0) + 1 } : state;
  switch (m.kind) {
    case "recoil": {
      let next = s;
      const from = m.backFromMs ?? 0, to = m.backToMs ?? from, wait = m.waitToMs ?? to;
      // The hop back: straight away from the opponent, evenly over [from, to] (walls and bodies stop it; no protection on it).
      const a = Math.max(from, s.modeMs - dt), b = Math.min(to, s.modeMs);
      if (input.player && to > from && b > a) {
        const units = Math.max(0, spec.backStrides ?? 0) * input.stepUnits * (b - a) / (to - from);
        const away = unit([s.point[0] - input.player[0], s.point[1] - input.player[1]]) ?? [-s.direction[0], -s.direction[1]];
        const point = input.move(s.point, [s.point[0] + away[0] * units, s.point[1] + away[1] * units]);
        const movedPx = Math.hypot(...kumaScreenDelta(input.projection, [point[0] - s.point[0], point[1] - s.point[1]]));
        next = { ...next, point, movedPx, phase: kumaWalkPhase(s.phase, movedPx, input.stridePx, true) };
      }
      // A person's press from the hop on is the poke.
      if (next.skillFollow !== true && input.control && s.modeMs >= from && followPressed(input, false)) next = took({ ...next, skillFollow: true });
      if (s.modeMs < wait || next.skillFollow === true) return next;
      // The branch at the wait's end: the AI pokes at an opponent who came after him (in its reach) or on its seeded share.
      const inReach = input.player !== null && kumaGap(next, input.player, input) <= Math.max(0, spec.reachStrides ?? 0) * input.stepUnits + 1e-9;
      if (!input.control && (inReach || kumaSkillShare(s.attackId + BRANCH_SALT) < (spec.aiShare ?? 0))) return { ...next, skillFollow: true };
      // No poke: nothing is thrown (no whiff, no counter window) — he stands.
      return { ...next, modeMs: Math.max(next.modeMs, m.totalMs), hitsFired: m.hits, attackHits: 0 };
    }
    case "counter": {
      const windowTo = m.windowToMs ?? 0, strikeTo = m.strikeToMs ?? m.totalMs;
      // The counter struck: it ends with its strike (the whiff's look is not his).
      if (s.skillTriggered === true) return s.modeMs >= strikeTo ? { ...s, modeMs: Math.max(s.modeMs, m.totalMs) } : s;
      // The window ran out untouched: the whiff — eyes open, a look round. Its contacts are spent unthrown, so its recovery is open.
      if (s.modeMs >= windowTo && s.modeMs < strikeTo) return { ...s, modeMs: strikeTo + (s.modeMs - windowTo), hitsFired: m.hits };
      return s;
    }
    case "brace": {
      const windowTo = m.windowToMs ?? 0, strikeFrom = m.strikeFromMs ?? windowTo, strikeTo = m.strikeToMs ?? m.totalMs;
      // The shove is running (`skillFollow`): its strike, then his arms settle.
      if (s.skillFollow === true) return s;
      if (s.skillTriggered === true) {
        // The shove: a person's press in its window after the block, or the AI after its beat.
        const since = s.modeMs - (s.skillTriggerMs ?? s.modeMs);
        const shove = since <= Math.max(0, spec.followMs ?? 0)
          && (input.control ? followPressed(input, true) : since >= Math.max(0, spec.aiFollowMs ?? 0));
        if (shove) return took({ ...s, modeMs: Math.max(s.modeMs, strikeFrom), skillFollow: true });
      }
      // The window ran out without a shove: his arms settle (the recovery), the shove spent unthrown — no whiff.
      if (s.modeMs >= windowTo) return { ...s, modeMs: strikeTo + (s.modeMs - windowTo), hitsFired: m.hits, attackHits: 0 };
      return s;
    }
    default:
      return s;
  }
}

/** The stretch's fist overshoots an opponent nearer than `innerStrides` beyond contact: its contact goes out unthrown. */
export function kumaSkillStrikeMisses(s: KumaCombatState, player: CityPoint | null, input: Pick<KumaCombatInput, "contactUnits" | "stepUnits">,
  t: KumaTuning): boolean {
  return kumaSkillMarksNow(s)?.kind === "stretch" && player !== null
    && kumaGap(s, player, input) < Math.max(0, kumaSkillSpec(t, "stretch")?.innerStrides ?? 0) * input.stepUnits - 1e-9;
}

/** A dash kind's run (`KumaTuning.dash` with the skill's numbers over it): its speed, length, homing, and its open stand (`recoverMs`). */
export function kumaSkillDashTuning(t: KumaTuning, d: Pick<KumaDash, "special">, marks: KumaSkillMarks | null | undefined): KumaTuning {
  const kind = kumaSkillKind(d.special), spec = kumaSkillSpec(t, kind);
  if (!kind || !spec) return t;
  return { ...t, dash: { ...t.dash,
    ...(spec.topSpeedStrides !== undefined ? { topSpeedStrides: spec.topSpeedStrides } : {}),
    ...(spec.maxTravelStrides !== undefined ? { maxTravelStrides: spec.maxTravelStrides } : {}),
    homingDeg: spec.homingDeg ?? (kind === "feint" ? t.dash.homingDeg : 0),
    ...(marks?.recoverMs !== undefined ? { whiffRecoverMs: marks.recoverMs } : {}) } };
}

/** The slide's share of top speed `travelled` units into its run (`endSpeedShare` at its end): the belly slows on the floor. */
export function kumaSkillSlideShare(travelled: number, maxUnits: number, t: KumaTuning): number {
  const end = Math.max(0, Math.min(1, kumaSkillSpec(t, "slide")?.endSpeedShare ?? 1));
  return 1 - (1 - end) * Math.max(0, Math.min(1, maxUnits > 0 ? travelled / maxUnits : 1));
}

/**
 * The feint stops (decided before its branch point): a person's second X (or C) in the dash, the AI's seeded share at its launch. Returns the
 * dash with `feintStop`, and whether a person's press was taken. Its super form never stops (2026-10-23, 브라보우: a full meter that
 * whiffs on purpose is a wasted super) — it always runs in and strikes.
 */
export function kumaSkillFeintDecides(s: KumaCombatState, d: KumaDash, input: Pick<KumaCombatInput, "control">, t: KumaTuning)
  : { readonly dash: KumaDash; readonly took: boolean } {
  if (kumaSkillKind(d.special) !== "feint" || kumaSkillSuperForm(d.special) || d.feintStop === true || d.struck) return { dash: d, took: false };
  if (input.control) return followPressed(input, false) ? { dash: { ...d, feintStop: true }, took: true } : { dash: d, took: false };
  return d.phase === "windup" && kumaSkillShare(s.attackId + BRANCH_SALT) < (kumaSkillSpec(t, "feint")?.aiShare ?? 0)
    ? { dash: { ...d, feintStop: true }, took: false } : { dash: d, took: false };
}
