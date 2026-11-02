import { nativeCityChainLaunch } from "./NativeCityMelee";
import { NATIVE_CITY_COMBAT, type NativeCityImpactTier, type NativeCityMeleeTier, type NativeCityPlayerActionKind } from "./NativeCityCombatTuning";
import type { VillageFacing } from "../VillageFacing";
import type { CityPoint } from "../../world/NativeCityDefinition";
import type { NativeCityContactMotion, NativeCityPlayerSwingTimeline } from "./NativeCityPlayerSwing";
import type { FightFrame, NativeCityHitAccent } from "./NativeCityFightFrame";




export interface PlayerStrike {
  readonly attackId: number;
  readonly kind: NativeCityPlayerActionKind;
  readonly hitIndex: number;
  readonly damage: number;
  readonly tier: NativeCityMeleeTier;
  /** 이 접촉의 휘두름 안 시각(역경직이 이 칸으로 되돌린다). */
  readonly contactMs: number;
  /** 휘두름이 그려진 방향 = 타격 축. */
  readonly swingFacing: VillageFacing;
  readonly timeline: NativeCityPlayerSwingTimeline;
  readonly motion: NativeCityContactMotion;
  /**
   * 이 휘두름이 이 적에게 처음 닿은 접촉(`receiveDuelContact`의 `first`). 같은 휘두름의 다음 접촉(투망의 조임)은 움찔을 다시 걸지 않고
   * 이어 간다 — 동작당 한 번 움찔(2026-10-18 사용자).
   */
  readonly first: boolean;

  readonly origin: CityPoint;
  /** 타격 축의 평면 방향(밀림이 따라간다). */
  readonly push: CityPoint;
  /** 이 접촉의 그림에서 읽은 사거리(몸 닿는 거리 너머, 보) — 넥타이 날리기 거리가 여기서 나온다. 없으면 `melee.reachExtraStrides`. */
  readonly reach?: number;
  /** V 를 모은 정도(0..1, `player.actions.attack.charge`). 모으지 않는 동작은 없다. */
  readonly charge?: number;
  /** 필살기(`super`, 2026-10-20): 게이지를 쓴 V — 가드가 받지 못한다. */
  readonly super?: boolean;
}

/**
 * 적이 접촉을 어떻게 받았나: 받지 않음, 막음(공통 막기 박자), 맞음 — 맞음은 공통 박자에 쓸 수치와, 그 뒤에 얹는 그 적만의 박자(`after`,
 * 멈춤 길이를 받는다).
 */
export type EnemyTake =
  | { readonly kind: "none" }
  | { readonly kind: "guard" }
  | { readonly kind: "hit"; readonly impact: NativeCityImpactTier; readonly armored: boolean; readonly stopTier: NativeCityImpactTier;
    /** The HP this contact took off him (his rules' scaling applied — armour, the poise break; 0 for a contact that scores nothing). */
    readonly damage: number;
    readonly skidUnits: number; readonly chainLight: boolean | number; readonly speedLines: boolean; readonly accent: NativeCityHitAccent | null;
    /** His rules' own freeze for this contact (fight ms, before `hitStopScale`) over the tier's — the launch into the air. */
    readonly hitStopMs?: number;

    readonly followUp?: { readonly id: string; readonly damage: number };
    readonly after?: (freeze: number) => void };


export interface CityFightFoeRules {

  receive<K>(f: FightFrame<K>, strike: PlayerStrike): EnemyTake;
}

/** Only the last contact of an ending swing gives the receiver its ender/knockdown response. */
export function endsString(strike: PlayerStrike): boolean {
  return (strike.kind === "attack" || strike.timeline.ender === true)
    && strike.hitIndex - strike.timeline.firstHit === strike.timeline.hitsMs.length - 1;
}

/** A burst only launches on its final contact; all contacts keep their segment's guard policy. */
export function chainLaunchFor(strike: PlayerStrike) {
  const t = strike.timeline;
  // V's kick launches only at a full charge (2026-10-18), regardless of the receiving character or drawn sprite width; a lesser one pushes
  // like any ender.
  if (strike.kind === "attack" && endsString(strike)) {
    return (strike.charge ?? 1) >= 1 - 1e-9 ? nativeCityChainLaunch(0, 0, NATIVE_CITY_COMBAT.player.actions.attack.launch) : null;
  }
  if (strike.kind !== "combo" || strike.hitIndex - t.firstHit < t.hitsMs.length - 1) return null;
  return nativeCityChainLaunch(t.chainSegment ?? strike.hitIndex, strike.reach);
}
