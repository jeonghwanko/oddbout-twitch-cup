import type { Facing, SimEvent, Vec2 } from "./types";
import type { AttackTier } from "./AttackMoves";
import { archetypeOf, GUARD_ARCHETYPES, type CombatProfile, type GuardArchetypeId } from "./GuardArchetypes";
import { SIM_STEP_MS, type Tuning } from "./tuning";
import type { Reach } from "./CombatReach";
import { FORWARD_OVERLAP_PX, forwardDistance } from "./CombatReach";
import { sameFloorVerticalPx } from "./geom";
import { evaluateCombatDamage, type CombatWeaponId } from "./CombatDamage";
import { resolveDuelContact } from "./duel/DuelContact";

/**
 * 전투. 지정된 상대와만 성립한다.
 *
 * 공격은 선부 → 판정 → 후딜 세 구간이고, 유효타는 **후딜에만** 들어간다.
 * 무작정 두들기면 반격당하고, 선부를 보고 회피로 통과하면 등을 잡을 수 있다.
 * 잠입의 "등 뒤" 규칙이 전투에서도 그대로 이어지는 것이 이 설계의 핵심이다.
 *
 * 선부가 길고(곤봉병 1.4초) 눈에 띄게 만든 이유는 잠입의 순찰 반전 예고와 같다 —
 * 플레이어가 커밋할 수 있어야 발각이든 피격이든 자기 실수로 읽힌다.
 */

export type AttackPhase = "ready" | "windup" | "strike" | "recovery" | "cooldown";

export const ATTACK_PHASE_IDS = Object.freeze([
  "ready",
  "windup",
  "strike",
  "recovery",
  "cooldown",
] as const satisfies readonly AttackPhase[]);

export type TelegraphedAttackPhase = Extract<AttackPhase, "windup" | "strike" | "recovery">;
export type MeleeDodgeResponseStep = 0 | 1 | 2;
type CombatDurationField = keyof Pick<CombatProfile, "windupMs" | "strikeMs" | "recoveryMs" | "cooldownMs">;

/**
 * 마지막 아래 키를 켜도 회피 무적이 첫 타격 스텝까지 남는 최대 선행 시간.
 *
 * 한 스텝은 입력으로 회피를 시작하고, 다음 스텝은 windup→strike 경계를 넘는 데 쓸 수 있다.
 * 그 두 스텝을 빼지 않으면 HUD가 켜진 즉시 누른 회피가 타격 직전에 끝날 수 있다.
 */
export function meleeDodgeCueLeadMs(tuning: Tuning): number {
  return Math.max(SIM_STEP_MS, tuning.combat.dodgeMs - SIM_STEP_MS * 2);
}

/**
 * 실제 공격·회피 시간으로 방향 잡기 → 질주 준비 → 지금 구르기를 나눈다.
 *
 * `targetForwardPx`(공격 방향 기준 대상까지의 전방 거리)를 주고 프로필이 판정 중 전진하는
 * 공격(`strikeTravelPx`)이면, 선딜 잔여 + 몸이 사거리까지 달려오는 시간을 접촉 시각으로 보고
 * 그 시각이 회피 선행 시간 안에 들어올 때만 "지금 구르기"(2)를 낸다. 멀리 선 대상에게
 * 선딜 끝에 구르라고 하면 무적이 돌진 도착 전에 끝난다. 인자가 없으면 기존 판정 그대로다.
 */
export function meleeDodgeResponseStep(
  state: CombatState,
  profile: CombatProfile,
  tuning: Tuning,
  targetForwardPx?: number,
): MeleeDodgeResponseStep | null {
  if (profile.attackKind !== "melee") return null;
  const travelling = targetForwardPx !== undefined && profile.strikeTravelPx !== undefined
    && profile.strikeTravelSpeedPxPerSec !== undefined;
  if (state.phase === "strike") {
    if (!travelling) return 2;
    return strikeContactInMs(profile, state.phaseMs, targetForwardPx) <= meleeDodgeCueLeadMs(tuning) ? 2 : 1;
  }
  if (state.phase !== "windup") return null;
  const remainingMs = Math.max(0, profile.windupMs - state.phaseMs);
  const contactInMs = travelling ? remainingMs + strikeContactInMs(profile, 0, targetForwardPx) : remainingMs;
  if (contactInMs <= meleeDodgeCueLeadMs(tuning)) return 2;
  return combatPhaseProgress(state, profile) >= 0.25 ? 1 : 0;
}

/**
 * 판정 시작 후 `elapsedMs` 까지 전진한 거리. 순항 속도까지 `strikeTravelRampMs` 동안 선형 가속
 * (위치는 easeIn quad)하고 그 뒤로 일정하다. 막힘(`strikeTravelPx`)은 반영하지 않는 원곡선이다.
 */
export function strikeTravelCurvePx(profile: CombatProfile, elapsedMs: number): number {
  const pxPerMs = (profile.strikeTravelSpeedPxPerSec ?? 0) / 1000;
  const rampMs = Math.max(0, profile.strikeTravelRampMs ?? 0);
  const t = Math.max(0, elapsedMs);
  if (t < rampMs) return pxPerMs * t * t / (2 * rampMs);
  return pxPerMs * (t - rampMs / 2);
}

/** `elapsedMs` 시점의 전진 속도(px/s). */
export function strikeTravelSpeedAt(profile: CombatProfile, elapsedMs: number): number {
  const speed = profile.strikeTravelSpeedPxPerSec ?? 0;
  const rampMs = Math.max(0, profile.strikeTravelRampMs ?? 0);
  return rampMs > 0 && elapsedMs < rampMs ? speed * Math.max(0, elapsedMs) / rampMs : speed;
}

/**
 * 판정 경과 `elapsedMs` 에서 현재 전방 `targetForwardPx` 에 선 대상에게 사거리가 닿기까지 남은 시간.
 * 등 뒤이거나 남은 전진(`strikeTravelPx`)·판정 시간으로 닿지 못하면 Infinity.
 */
function strikeContactInMs(profile: CombatProfile, elapsedMs: number, targetForwardPx: number): number {
  if (targetForwardPx < -FORWARD_OVERLAP_PX) return Number.POSITIVE_INFINITY;
  const gapPx = targetForwardPx - profile.attackRangePx;
  if (gapPx <= 0) return 0;
  const pxPerMs = (profile.strikeTravelSpeedPxPerSec ?? 0) / 1000;
  if (gapPx > (profile.strikeTravelPx ?? 0) || pxPerMs <= 0) return Number.POSITIVE_INFINITY;
  const rampMs = Math.max(0, profile.strikeTravelRampMs ?? 0);
  const goalPx = strikeTravelCurvePx(profile, elapsedMs) + gapPx;
  const rampPx = pxPerMs * rampMs / 2;
  const reachMs = goalPx <= rampPx && rampMs > 0
    ? Math.sqrt(2 * rampMs * goalPx / pxPerMs)
    : goalPx / pxPerMs + rampMs / 2;
  const inMs = Math.max(0, reachMs - Math.max(0, elapsedMs));
  return inMs <= Math.max(0, profile.strikeMs - Math.max(0, elapsedMs)) ? inMs : Number.POSITIVE_INFINITY;
}

export interface CombatPhaseRule {
  readonly durationField: CombatDurationField | null;
  readonly next: AttackPhase;
  /** 페이즈 자체가 공격자의 발을 묶는가. */
  readonly rooted: boolean;
  /** 머리 아이콘·공간 텔레그래프·상단 전술 UI에 노출할 판독 단계인가. */
  readonly telegraphed: boolean;
  readonly playerRead: "idle" | "avoid" | "impact" | "punish";
}

/** 판정과 표현이 함께 읽는 공격 페이즈 계약. */
export const COMBAT_PHASE_RULES = Object.freeze({
  ready: phaseRule(null, "windup", false, false, "idle"),
  windup: phaseRule("windupMs", "strike", true, true, "avoid"),
  strike: phaseRule("strikeMs", "recovery", true, true, "impact"),
  recovery: phaseRule("recoveryMs", "cooldown", true, true, "punish"),
  cooldown: phaseRule("cooldownMs", "ready", false, false, "idle"),
} satisfies Record<AttackPhase, CombatPhaseRule>);

/**
 * 전투 표(`GuardArchetypes` 의 `combat` 프로필)와 런 튜닝 사이의 관계(`tuning.tuningViolations` 의 짝 — 튜닝만으로는
 * 표를 볼 수 없어 표의 주인 쪽에 둔다). 밸런스 편집 오타가 규칙 하나를 통째로 죽인 채 배포되지 않게 한다.
 * - `capture-inside-engage`: 접촉 포박 거리(`tuning.guard.captureRangePx`)가 교전 시작 거리보다 작다. 아니면 교전 없이 포박이 성립한다.
 * - `combat-phase-duration-positive`: 시간이 있는 공격 페이즈(`COMBAT_PHASE_RULES` 의 `durationField`)는 0 보다 길다. 아니면 그 페이즈를 건너뛴다.
 * 위반이 없으면 빈 배열이다. 항목 뒤 `:` 다음은 아키타입(과 페이즈)이다.
 */
export function combatContractViolations(tuning: Tuning): readonly string[] {
  const violations: string[] = [];
  for (const [id, archetype] of Object.entries(GUARD_ARCHETYPES)) {
    const profile = archetype.combat;
    if (profile === undefined) continue;
    if (!(tuning.guard.captureRangePx < profile.engageRangePx)) violations.push(`capture-inside-engage:${id}`);
    for (const [phase, rule] of Object.entries(COMBAT_PHASE_RULES)) {
      if (rule.durationField !== null && !(profile[rule.durationField] > 0)) violations.push(`combat-phase-duration-positive:${id}:${phase}`);
    }
  }
  return violations;
}

export interface CombatState {
  readonly hp: number;
  readonly phase: AttackPhase;
  readonly phaseMs: number;
  /** 이번 휘두르기의 명중/완벽 회피 판정이 이미 끝났는가. 한 공격을 여러 번 처리하지 않는다. */
  readonly struck: boolean;
  /** 선딜을 시작한 순간 잠근 공격 방향. 예고 뒤 목표를 따라 회전하지 않는다. */
  readonly attackFacing: Facing | null;
  readonly defeated: boolean;
  /** Authored encounter timing/reach; saved on the combat state consumed by both sim and view. */
  readonly profileOverride?: CombatProfile;
}

export function effectiveCombatProfile(guard: {
  readonly archetypeId: GuardArchetypeId;
  readonly combat: CombatState | null;
}): CombatProfile | undefined {
  return guard.combat?.profileOverride ?? archetypeOf(guard.archetypeId).combat;
}

export function combatPhaseRule(phase: AttackPhase): CombatPhaseRule {
  return COMBAT_PHASE_RULES[phase];
}

export function nextCombatPhase(phase: AttackPhase): AttackPhase {
  return combatPhaseRule(phase).next;
}

export function combatPhaseDurationMs(phase: AttackPhase, profile: CombatProfile): number {
  const field = combatPhaseRule(phase).durationField;
  return field === null ? 0 : profile[field];
}

export function combatPhaseProgress(state: CombatState, profile: CombatProfile): number {
  const durationMs = combatPhaseDurationMs(state.phase, profile);
  if (durationMs <= 0) return 0;
  return Math.max(0, Math.min(1, state.phaseMs / durationMs));
}

export function isTelegraphedAttackPhase(phase: AttackPhase): phase is TelegraphedAttackPhase {
  return combatPhaseRule(phase).telegraphed;
}

export function enterCombatPhase(
  state: CombatState,
  phase: AttackPhase,
  changes: Partial<Pick<CombatState, "struck" | "attackFacing">> = {},
): CombatState {
  return { ...state, ...changes, phase, phaseMs: 0 };
}

export function createCombat(profile: CombatProfile): CombatState {
  return {
    hp: profile.hp,
    phase: "ready",
    phaseMs: 0,
    struck: false,
    attackFacing: null,
    defeated: false,
  };
}

/**
 * 포박처럼 전투 밖의 제압 흐름이 끝났을 때 이전 공격 사이클을 폐기한다.
 * 체력과 쓰러짐 여부는 결과 상태이므로 보존하고, 동작을 붙드는 일시 상태만 초기화한다.
 */
export function resetAttackCycle(state: CombatState): CombatState {
  return {
    ...state,
    phase: "ready",
    phaseMs: 0,
    struck: false,
    attackFacing: null,
  };
}

export interface CombatStepInput {
  readonly attackerId: string;
  readonly self: Vec2;
  readonly facing: Facing;
  readonly target: Vec2;
  /** 플레이어가 회피 무적 중인가. */
  readonly targetInvulnerable: boolean;
  /** 은신처·환기구처럼 월드 좌표는 있어도 직접 타격할 수 없는 상태가 아닌가. */
  readonly targetHittable?: boolean;
  /** 추격 중인가. 평온한 상대는 공격을 시작하지 않는다. */
  readonly engaged: boolean;
  /** 다수전 공격권을 가졌는가. 생략하면 단일 경비 호출과 기존 테스트를 위해 허용한다. */
  readonly canStartAttack?: boolean;
  /** 원거리 공격의 현재 사선. 근접 공격에서는 사용하지 않는다. */
  readonly lineOfFireClear: boolean;
}

export interface CombatStepResult {
  readonly state: CombatState;
  /** 이번 스텝에 플레이어를 맞췄는가. */
  readonly hitPlayer: boolean;
  /** 접근을 멈춰야 하는가. 공격 중에는 발이 묶인다. */
  readonly rooted: boolean;
  readonly events: readonly SimEvent[];
}

export function step(
  state: CombatState,
  input: CombatStepInput,
  profile: CombatProfile,
  tuning: Tuning,
  dtMs: number,
): CombatStepResult {
  if (state.defeated) {
    return { state, hitPlayer: false, rooted: true, events: [] };
  }

  const distance = Math.abs(input.target.x - input.self.x);
  // 공격이 시작된 뒤에는 최초 방향이 판정의 진실원이다. 플레이어가 예고를 읽고
  // 등 뒤로 굴렀는데 곤봉병이 선딜 중 180도 회전해 맞히면 텔레그래프가 거짓이 된다.
  const attackFacing = state.attackFacing ?? input.facing;
  const targetInFront = forwardDistance(input.self, attackFacing, input.target) >= -FORWARD_OVERLAP_PX;
  const sameHeight = Math.abs(input.target.y - input.self.y) < meleeReach(profile, tuning).verticalPx;
  const phaseMs = state.phaseMs + dtMs;
  const events: SimEvent[] = [];

  switch (state.phase) {
    case "ready": {
      // 사거리에 들어오면 크게 무기를 든다. 이 선딜이 플레이어의 판단 시간이다.
      if (input.canStartAttack !== false && input.engaged && sameHeight && distance <= profile.engageRangePx
        && (profile.attackKind === "ranged" || targetInFront)) {
        return {
          state: enterCombatPhase(state, nextCombatPhase(state.phase), {
            struck: false,
            attackFacing: input.facing,
          }),
          hitPlayer: false,
          rooted: true,
          events: [{
            kind: "GuardAttackTelegraphed",
            guardId: input.attackerId,
            attackKind: profile.attackKind,
            at: input.self,
            facing: input.facing,
          }],
        };
      }
      return { state: { ...state, phaseMs }, hitPlayer: false, rooted: false, events };
    }

    case "windup": {
      const cueThresholdMs = combatPhaseDurationMs(state.phase, profile) - meleeDodgeCueLeadMs(tuning);
      if (profile.attackKind === "melee" && state.phaseMs < cueThresholdMs && phaseMs >= cueThresholdMs) {
        events.push({
          kind: "GuardAttackImminent",
          guardId: input.attackerId,
          at: input.self,
          facing: attackFacing,
        });
      }
      if (phaseMs < combatPhaseDurationMs(state.phase, profile)) {
        return { state: { ...state, phaseMs }, hitPlayer: false, rooted: combatPhaseRule(state.phase).rooted, events };
      }
      // 휘두르는 순간 교전 소음. 근처 경비가 전부 모인다.
      events.push({
        kind: "NoiseEmitted",
        at: input.self,
        floor: Math.floor(input.self.y / tuning.world.floorHeightPx),
        radius: tuning.combat.engageNoiseRadius,
        source: "combat",
      });
      if (profile.attackKind === "ranged") {
        const threatens = input.targetHittable !== false
          && input.lineOfFireClear
          && sameHeight
          && distance <= profile.attackRangePx;
        const dodged = threatens && input.targetInvulnerable;
        const connects = threatens && !input.targetInvulnerable;
        events.push({
          kind: "CrossbowFired",
          guardId: input.attackerId,
          from: input.self,
          to: input.target,
          blocked: !input.lineOfFireClear,
        });
        if (dodged) events.push({ kind: "PerfectDodge", guardId: input.attackerId, at: input.target });
        return {
          // 정확히 통과하면 투사체 판정을 다시 만들지 않고 즉시 긴 재장전/반격 창으로 넘긴다.
          state: enterCombatPhase(state, dodged ? "recovery" : nextCombatPhase(state.phase), {
            struck: connects || dodged,
          }),
          hitPlayer: connects,
          rooted: true,
          events,
        };
      }
      return {
        state: enterCombatPhase(state, nextCombatPhase(state.phase)),
        hitPlayer: false,
        rooted: true,
        events,
      };
    }

    case "strike": {
      // 판정 구간. 무적이 아니고 사거리 안이면 맞는다.
      const contact = resolveDuelContact({ alreadyContacted: state.struck,
        targetHittable: input.targetHittable !== false && profile.attackKind === "melee",
        targetInvulnerable: input.targetInvulnerable, inFront: targetInFront, sameFloor: sameHeight,
        inReach: distance <= profile.attackRangePx });
      const dodged = contact.dodged;
      if (dodged) {
        return {
          // 성공한 구르기는 타격 구간을 끝내고 즉시 녹색 반격 창을 연다.
          state: enterCombatPhase(state, nextCombatPhase(state.phase), { struck: true }),
          hitPlayer: false,
          rooted: true,
          events: [{ kind: "PerfectDodge", guardId: input.attackerId, at: input.target }],
        };
      }
      const connects = contact.connects;
      if (connects) {
        return {
          state: { ...state, phaseMs, struck: true },
          hitPlayer: true,
          rooted: true,
          events,
        };
      }
      if (phaseMs < combatPhaseDurationMs(state.phase, profile)) {
        return { state: { ...state, phaseMs }, hitPlayer: false, rooted: combatPhaseRule(state.phase).rooted, events };
      }
      return {
        state: enterCombatPhase(state, nextCombatPhase(state.phase)),
        hitPlayer: false,
        rooted: true,
        events: [{ kind: "GuardRecoveryOpened", guardId: input.attackerId, at: input.self }],
      };
    }

    case "recovery": {
      // 반격 창. 여기서 맞은 타격만 제압으로 이어진다.
      if (phaseMs < combatPhaseDurationMs(state.phase, profile)) {
        return { state: { ...state, phaseMs }, hitPlayer: false, rooted: combatPhaseRule(state.phase).rooted, events };
      }
      return {
        state: enterCombatPhase(state, nextCombatPhase(state.phase), { attackFacing: null }),
        hitPlayer: false,
        rooted: false,
        events,
      };
    }

    case "cooldown": {
      if (phaseMs < combatPhaseDurationMs(state.phase, profile)) {
        return { state: { ...state, phaseMs }, hitPlayer: false, rooted: combatPhaseRule(state.phase).rooted, events };
      }
      return {
        state: enterCombatPhase(state, nextCombatPhase(state.phase), { attackFacing: null }),
        hitPlayer: false,
        rooted: false,
        events,
      };
    }
  }
}

/**
 * 무기 개조가 연 빈틈(`tool`)이 지금 유효한가. 넘어져 있는 동안만이다 — 기상한 경비에게
 * 남은 타이머가 빈틈을 주면 화면의 금색 표식과 실제 배율이 갈라진다.
 */
export function hasToolOpening(guard: { readonly staggerMs: number; readonly toolOpeningMs: number }): boolean {
  return guard.staggerMs > 0 && guard.toolOpeningMs > 0;
}

/** 지금이 반격 창인가. 후딜에만 유효타가 들어간다. */
export function isPunishable(state: CombatState): boolean {
  return state.phase === "recovery";
}

/**
 * 이 적의 근접 사거리.
 *
 * 화면의 피격 브래킷도 이 값을 읽는다. 판정과 표시가 다른 숫자를 쓰면 플레이어는
 * 브래킷 밖에서 맞고, 그것을 자기 실수로 오해한다.
 */
export function meleeReach(profile: CombatProfile, tuning: Tuning): Reach {
  return {
    forwardPx: profile.attackRangePx,
    verticalPx: sameFloorVerticalPx(tuning.world.floorHeightPx),
  };
}

/**
 * 피해를 준다.
 *
 * 후딜 중이거나 등 뒤에서 때리면 제압타가 들어가고, 그 밖에는 단검 한 발 분량이다.
 * 정면 무효 상대(기사)는 등 뒤가 아니면 아예 통하지 않는다.
 */
export function damage(
  state: CombatState,
  opts: {
    readonly fromBehind: boolean;
    readonly profile: CombatProfile;
    readonly tuning: Tuning;
    readonly damage?: number;
    readonly weaponId?: CombatWeaponId;
    readonly invulnerable?: boolean;
    /**
     * 때린 공격의 무게. 평타만 적 공격 사이클을 보존한다.
     * 생략하면 단검·환경 공격처럼 기존의 "끊는" 계약을 그대로 쓴다.
     */
    readonly tier?: AttackTier;
    /** 무게 표 밖에서 직접 지정할 때만. 생략하면 `tier` 가 결정한다. */
    readonly interruptOnHit?: boolean;
    /** 입력 시 이미 획득한 완벽 반격처럼, 접촉 전 후딜이 끝나도 제압 보상을 보존한다. */
    readonly forcePunish?: boolean;
    /**
     * 무기 개조가 연 빈틈(`hasToolOpening`). 다른 빈틈과 같은 배율이며 겹쳐도 한 번만 적용된다.
     * 배율만 주고 정면 체력 하한(`nonPunishHpFloor`)은 풀지 않는다.
     */
    readonly toolOpening?: boolean;
  },
): { state: CombatState; landed: boolean; defeated: boolean; damage: number } {
  if (state.defeated) return { state, landed: false, defeated: false, damage: 0 };

  const punish = opts.forcePunish === true || opts.toolOpening === true || isPunishable(state) || opts.fromBehind;
  if ((opts.profile.frontImmune && !opts.fromBehind) || opts.invulnerable) {
    return { state, landed: false, defeated: false, damage: 0 };
  }

  const evaluated = evaluateCombatDamage({
    weaponId: opts.weaponId ?? "dagger",
    moveCoefficient: opts.damage ?? opts.tuning.combat.daggerDamage,
    opportunities: [
      opts.fromBehind ? "rear" : "normal",
      isPunishable(state) ? "recovery" : "normal",
      opts.forcePunish ? "counter" : "normal",
      opts.toolOpening ? "tool" : "normal",
    ],
    armor: opts.profile.armor,
    armorK: opts.tuning.combat.armorK,
    opportunityMultiplier: opts.tuning.combat.punishDamage,
  });
  // 곤봉병의 정면 평타는 공간을 만들고 체력을 깎을 수 있지만 마지막 한 칸은 남긴다.
  // 선딜을 읽지 않은 3연타만으로 전용 회피·후딜 문법을 삭제하지 않으면서도,
  // 기존 피니셔의 넉백·연쇄·벽꿍 보상은 그대로 유지한다.
  // 무기 개조 빈틈은 배율만 준다. 정면에서 연 빈틈이 마지막 한 칸까지 지우면 곤봉병의
  // "마무리는 반격·등 뒤" 문법을 도구 한 번으로 건너뛴다(2026-09-28 단계 3 검토: 올가미 투척 뒤
  // 평타 한 방에 곤봉병이 쓰러졌다). 도구가 문을 열고, 마무리는 기존 빈틈이 닫는다.
  const finisherOpening = opts.forcePunish === true || isPunishable(state) || opts.fromBehind;
  const hpFloor = finisherOpening ? 0 : opts.profile.nonPunishHpFloor ?? 0;
  // 콘텐츠가 바뀌어 현재 HP가 새 바닥보다 이미 낮더라도 피해가 회복으로 뒤집히면 안 된다.
  const hp = Math.max(0, Math.min(state.hp, Math.max(hpFloor, state.hp - evaluated.damage)));
  const defeated = hp <= 0;
  // 무게가 곧 계약이다: 평타는 끊지 않고, 강공격·대시·피니셔는 끊는다.
  const interruptOnHit = opts.interruptOnHit ?? (opts.tier === undefined || opts.tier !== "light");
  const keepsPhase = defeated || (!punish && !interruptOnHit);
  const damaged = { ...state, hp, defeated };
  return {
    // 후딜·등 뒤의 제압타와 제한 탄약 단검은 공격을 끊는다. 무제한 평타까지 매번
    // 끊어 버리면 선딜 중 연타가 영구 경직이 되어 회피 타이밍이 사라진다.
    state: keepsPhase
      ? damaged
      : enterCombatPhase(damaged, "cooldown", { attackFacing: null }),
    landed: true,
    defeated,
    damage: Math.round((state.hp - hp) * 1_000) / 1_000,
  };
}

function phaseRule(
  durationField: CombatDurationField | null,
  next: AttackPhase,
  rooted: boolean,
  telegraphed: boolean,
  playerRead: CombatPhaseRule["playerRead"],
): CombatPhaseRule {
  return Object.freeze({ durationField, next, rooted, telegraphed, playerRead });
}

/** 공격자가 대상의 등 뒤에 있는가. */
export function isBehind(attacker: Vec2, targetAt: Vec2, targetFacing: Facing): boolean {
  const dx = attacker.x - targetAt.x;
  return dx !== 0 && Math.sign(dx) !== targetFacing;
}
