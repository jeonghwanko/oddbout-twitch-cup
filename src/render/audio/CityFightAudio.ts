import { BODY_IMPACT_HEAVY_SFX, CLOTH_LIGHT_SFX, COMBAT_SFX, DODGE_SFX, WOOD_IMPACT_HEAVY_SFX } from "../../assets/RuntimeMediaCatalog";
import type { NativeCityWeaponImpactKind } from "../effects/NativeCityWeaponImpact";
import type { NativeCityFighter, NativeCityImpactFeelTuning, NativeCityImpactTier } from "../../sim/cityFight/NativeCityCombatTuning";
import { COMBAT_SFX_PEAK_MS, CHARGE_LEAD_MS, TRANSIENT_ATTACK_MS, BODY_FALL_DELAY_MS, LIGHT_CHAIN_HIT_SOUND, combatRate, pickVariant, type CombatSampleBeat } from "./CombatAudioBeats";

/**
 * 마을(도시) 대결의 소리 신호. 기술의 무기 재질과 sim 접촉 사건으로 샘플을 고른다(2026-10-08 공방의 합: 휘두름은 접촉
 * 직전에 정점, 접촉은 티어별 — 반격·균형 붕괴·KO 는 피니셔 샘플, 갑옷에 먹힌 한 방은 먹먹하게, 내려찍기는 헛쳐도 바닥이 운다).
 */
export type VillageMeleeCue = "swing" | "swingHeavy" | "windup" | "hit" | "hitHeavy" | "hitArmored" | "counter" | "break" | "ko"
  | "struck" | "struckHeavy" | "slamGround" | "down"
  /**
   * Rule tells (`feel.tells`): `guardUp` — his guard coming up (quiet cloth); `guardBreak` — the hook through his guard ("가드 뚫림": a
   * dry crack); `glint` — the dash's eye glint (a short muted tap); `dodge` — a swipe passing over the bow-duck ("휙!").
   */
  | "guardUp" | "guardBreak" | "glint" | "dodge"
  /** The red grab's windup (2026-10-14, `kuma.grab`): a short, distinct double warning tap — "this one you cannot guard". */
  | "grabWarn"
  /**
   * The grade badge appearing (2026-10-14 fun audit, `feel.tells.gradeMark` — the triangle told by ear too): `tellWhite` a bright single
   * tick (guard it), `tellGold` a low soft thud (duck it). The red one is `grabWarn`.
   */
  | "tellWhite" | "tellGold"
  /** V's counter window opened (`kuma.rhythm.counter`, 2026-10-18 — "찡"): the white tell's tick pitched up and doubled, a bright ring. */
  | "counterReady"
  /**
   * V's counter taken (2026-10-19 "삥~ → 팡", `kuma.rhythm.counter.accent`): the ring over the deep slow — a high, sustained metal "삥" (the
   * clang pitched up, the ready tick on its front). No crack: the heel's contact carries it ("counter").
   */
  | "counterAccept"
  /**
   * The ODDBOUT fighters' own move sounds (2026-10-22 4차 — user: 다채롭고 도파민 터지게; their move effects' `sound`, `FIGHTER_MOVE_SOUNDS`):
   * `iceSkid` the belly on ice (a fast whoosh with a glassy ring), `clawClack` a claw snapped shut (a bright clack), `dirtBurst` earth
   * bursting up (a low crumble). Each at one pitch: never a rising run.
   */
  | FighterMoveSound;

/** The move sounds a fighter's drawn moves may ask for (`FighterMoveFxCue.sound`). */
export const FIGHTER_MOVE_SOUNDS = Object.freeze(["iceSkid", "clawClack", "dirtBurst"] as const);
export type FighterMoveSound = (typeof FIGHTER_MOVE_SOUNDS)[number];

/** `id` is a move sound this audio knows (a cue's unknown sound plays nothing). */
export function isFighterMoveSound(id: string): id is FighterMoveSound {
  return (FIGHTER_MOVE_SOUNDS as readonly string[]).includes(id);
}

const VILLAGE_SWING_RATE = Object.freeze({ swing: 1, swingHeavy: 0.9, windup: 0.85 });

/**
 * 접촉보다 얼마나 앞에서 이 신호를 틀어야 정점이 접촉 직전(`swingLeadMs`, 차징은 `CHARGE_LEAD_MS`)에 오는가(ms). 휘두름·차징
 * 샘플의 정점(`COMBAT_SFX_PEAK_MS`)을 재생 배율로 늘인 값을 더한다 — 진행자가 싸움 시계로 그 순간에 튼다(끊기면 안 튼다).
 */
export function villageMeleeLeadMs(cue: "swing" | "swingHeavy" | "windup", swingLeadMs: number): number {
  switch (cue) {
    case "swing": return swingLeadMs + COMBAT_SFX_PEAK_MS.swingLight / VILLAGE_SWING_RATE.swing;
    case "swingHeavy": return swingLeadMs + COMBAT_SFX_PEAK_MS.swingHeavy / VILLAGE_SWING_RATE.swingHeavy;
    case "windup": return CHARGE_LEAD_MS + COMBAT_SFX_PEAK_MS.charge / VILLAGE_SWING_RATE.windup;
  }
}

/** 마을 대결 신호 하나의 소리 계획(위치 감쇠 없음 — 두 배우가 늘 화면 안이다). `variant` 로 파일·음높이를 돌린다. */
export function villageMeleeSoundPlan(cue: VillageMeleeCue, variant: number,
  weaponKind: NativeCityWeaponImpactKind = "fist"): readonly CombatSampleBeat[] {
  const rate = combatRate(variant);
  if (weaponKind !== "fist") {
    const heavy = cue === "hitHeavy" || cue === "struckHeavy" || cue === "counter" || cue === "break" || cue === "ko" || cue === "guardBreak";
    if (heavy || cue === "hit" || cue === "struck" || cue === "hitArmored") {
      const samples = weaponKind === "sharp" ? heavy ? COMBAT_SFX.hitSharpHeavy : COMBAT_SFX.hitSharp
        : heavy ? COMBAT_SFX.hitBluntHeavy : COMBAT_SFX.hitBlunt;
      const resisted = cue === "hitArmored";
      return [{ key: pickVariant(samples, variant).key, gain: resisted ? 0.52 : heavy ? 0.94 : 0.82, delayMs: 0,
        rate: rate * (resisted ? 0.94 : cue === "ko" ? 0.88 : 1), attackMs: resisted ? 3 : TRANSIENT_ATTACK_MS }];
    }
  }
  switch (cue) {
    case "swing": return [{ key: pickVariant(COMBAT_SFX.swingLight, variant).key, gain: 0.5, delayMs: 0, rate: VILLAGE_SWING_RATE.swing * rate }];
    case "swingHeavy": return [{ key: COMBAT_SFX.swingHeavy.key, gain: 0.6, delayMs: 0, rate: VILLAGE_SWING_RATE.swingHeavy }];
    case "windup": return [{ key: COMBAT_SFX.charge.key, gain: 0.34, delayMs: 0, rate: VILLAGE_SWING_RATE.windup }];
    case "hit": return [{ key: pickVariant(COMBAT_SFX.hitLight, variant).key, gain: 0.85, delayMs: 0, rate, attackMs: TRANSIENT_ATTACK_MS }];
    case "hitHeavy": return [{ key: pickVariant(COMBAT_SFX.hitHeavy, variant).key, gain: 0.95, delayMs: 0, rate, attackMs: TRANSIENT_ATTACK_MS }];
    // Super armour absorbs the blow in the body: a short, dry thud, with no sustained metal ring.
    case "hitArmored": return [{ key: pickVariant(COMBAT_SFX.hitResist, variant).key, gain: 0.68, delayMs: 0, rate: 0.96 * rate, attackMs: 3 }];
    // Counter: the heavy hit with the finisher's crack on top (0.85 since 2026-10-19 — the counter's 팡; its ring rang at the accept).
    case "counter": return [
      { key: pickVariant(COMBAT_SFX.hitHeavy, variant).key, gain: 0.95, delayMs: 0, rate, attackMs: TRANSIENT_ATTACK_MS },
      { key: COMBAT_SFX.hitFinisher.key, gain: 0.85, delayMs: 0, rate: 1.12, attackMs: TRANSIENT_ATTACK_MS },
    ];
    // Poise break / KO: the finisher sample, with a low body thump under it.
    case "break":
    case "ko": return [
      { key: COMBAT_SFX.hitFinisher.key, gain: 1, delayMs: 0, attackMs: TRANSIENT_ATTACK_MS },
      { key: COMBAT_SFX.hitHeavy[0]!.key, gain: LIGHT_CHAIN_HIT_SOUND.bodyThump.gain, delayMs: LIGHT_CHAIN_HIT_SOUND.bodyThump.delayMs,
        rate: LIGHT_CHAIN_HIT_SOUND.bodyThump.rate, attackMs: TRANSIENT_ATTACK_MS },
    ];
    case "struck": return [{ key: pickVariant(COMBAT_SFX.hurt, variant).key, gain: 0.9, delayMs: 0, rate, attackMs: TRANSIENT_ATTACK_MS }];
    case "struckHeavy": return [{ key: COMBAT_SFX.hurtHeavy.key, gain: 1, delayMs: 0, attackMs: TRANSIENT_ATTACK_MS }];
    // The slam meets the paving (hit or whiff): a low body-impact thud and a slowed crash.
    case "slamGround": return [
      { key: BODY_IMPACT_HEAVY_SFX.key, gain: 0.8, delayMs: 0, rate: 0.6, attackMs: TRANSIENT_ATTACK_MS },
      { key: COMBAT_SFX.crash.key, gain: 0.35, delayMs: 10, rate: 0.75, attackMs: TRANSIENT_ATTACK_MS },
    ];
    case "down": return [{ key: COMBAT_SFX.bodyFall.key, gain: 0.7, delayMs: BODY_FALL_DELAY_MS }];
    case "iceSkid": return [
      { key: COMBAT_SFX.swingHeavy.key, gain: 0.42, delayMs: 0, rate: 1.75 },
      { key: COMBAT_SFX.clang.key, gain: 0.14, delayMs: 20, rate: 2.3, attackMs: TRANSIENT_ATTACK_MS },
    ];
    case "clawClack": return [
      { key: COMBAT_SFX.clang.key, gain: 0.42, delayMs: 0, rate: 1.9, attackMs: TRANSIENT_ATTACK_MS },
      { key: pickVariant(COMBAT_SFX.hitLight, variant).key, gain: 0.35, delayMs: 0, rate: 1.6, attackMs: TRANSIENT_ATTACK_MS },
    ];
    case "dirtBurst": return [
      { key: COMBAT_SFX.crash.key, gain: 0.4, delayMs: 0, rate: 0.62, attackMs: TRANSIENT_ATTACK_MS },
      { key: COMBAT_SFX.bodyFall.key, gain: 0.5, delayMs: 15, rate: 0.85 },
    ];
    case "guardUp": return [{ key: CLOTH_LIGHT_SFX.key, gain: 0.16, delayMs: 0, rate: 1.1, attackMs: 12 }];
    case "guardBreak": return [
      { key: pickVariant(COMBAT_SFX.hitResist, variant).key, gain: 0.48, delayMs: 0, rate: 0.82, attackMs: TRANSIENT_ATTACK_MS },
      { key: WOOD_IMPACT_HEAVY_SFX.key, gain: 0.2, delayMs: 8, rate: 0.7, attackMs: TRANSIENT_ATTACK_MS },
    ];
    case "glint": return [{ key: pickVariant(COMBAT_SFX.hitResist, variant).key, gain: 0.16, delayMs: 0, rate: 1.18, attackMs: 3 }];
    case "tellWhite": return [{ key: pickVariant(COMBAT_SFX.hitResist, variant).key, gain: 0.2, delayMs: 0, rate: 2, attackMs: 3 }];
    case "counterReady": return [{ key: pickVariant(COMBAT_SFX.hitResist, variant).key, gain: 0.24, delayMs: 0, rate: 2.6, attackMs: 2 },
      { key: pickVariant(COMBAT_SFX.hitResist, variant + 1).key, gain: 0.14, delayMs: 45, rate: 3.1, attackMs: 2 }];
    case "counterAccept": return [
      { key: pickVariant(COMBAT_SFX.hitResist, variant).key, gain: 0.3, delayMs: 0, rate: 2.6, attackMs: 2 },
      { key: COMBAT_SFX.clang.key, gain: 0.62, delayMs: 0, rate: 1.9, attackMs: 2 },
      { key: COMBAT_SFX.clang.key, gain: 0.3, delayMs: 30, rate: 2.4, attackMs: 4 },
    ];
    case "tellGold": return [{ key: BODY_IMPACT_HEAVY_SFX.key, gain: 0.32, delayMs: 0, rate: 0.5, attackMs: 6 }];
    case "grabWarn": return [
      { key: pickVariant(COMBAT_SFX.hitResist, variant).key, gain: 0.3, delayMs: 0, rate: 1.5, attackMs: 3 },
      { key: pickVariant(COMBAT_SFX.hitResist, variant + 1).key, gain: 0.3, delayMs: 85, rate: 1.75, attackMs: 3 },
    ];
    case "dodge": return [
      { key: DODGE_SFX.key, gain: 0.45, delayMs: 0 },
      { key: pickVariant(COMBAT_SFX.swingLight, variant).key, gain: 0.3, delayMs: 0, rate: 1.15 * rate },
    ];
  }
}

/** One village contact for the layered impact sound (`villageImpactSoundPlan`). */
export interface VillageImpactSound {
  /** Same technique material as the contact VFX; never inferred from the receiver. */
  readonly weaponKind?: NativeCityWeaponImpactKind;
  /** The impact sample cue (`villageMeleeSoundPlan`): hit / hitHeavy / hitArmored / counter / break / ko / struck / struckHeavy. */
  readonly cue: VillageMeleeCue;
  readonly tier: NativeCityImpactTier;
  /** Who threw it. KUMA's blows sound heavier (`feel.impact.sfx.kuma*Scale`). */
  readonly by: NativeCityFighter;
  readonly armored: boolean;
  /** His rhythm armour took it whole (`kuma.rhythm.armor`, damage 0): the blow is BLOCKED — the armour thud and a metal clang. */
  readonly bounced?: boolean;
  /** The blow's number (a contact counter): it picks the rate/gain swing — no `Math.random`. */
  readonly hitIndex: number;
}

/** The clang on a blow the rhythm armour bounced (`villageImpactSoundPlan` bounced): as loud as a guarded slam's. */
const BOUNCE_CLANG_GAIN = 0.75;

/** A fixed walk of offsets in [-1, 1] — consecutive blows never repeat the same pitch, replays sound the same. */
const IMPACT_WALK = Object.freeze([0, 0.8, -0.6, 0.35, -1, 0.6, -0.25, 1]);
const impactWalk = (i: number) => IMPACT_WALK[((i % IMPACT_WALK.length) + IMPACT_WALK.length) % IMPACT_WALK.length]!;

/**
 * 마을 대결 한 접촉의 겹친 소리: 무기별 편집본(`villageMeleeSoundPlan`). 주먹은 몸통 쿵(BODY_IMPACT_HEAVY, 맞은 몸이
 * 클수록 낮게) + 강타 이상의 낮은 붐(피니셔 샘플을 늘여). 쿠마가 때린 것은 낮고 크게. 접촉 번호로 음높이·음량을 조금씩 흔든다.
 * 휘두름은 접촉 직전에 이미 울렸다(진행자의 정점 예약). 갑옷에 먹힌 한 방은 쿵·붐 없이 먹먹한 타격만.
 * 흔들기·쿠마 배율 `t`는 부르는 쪽이 넘긴다(`NATIVE_CITY_COMBAT.feel.impact.sfx`) — 이 표가 전투 수치 JSON 전체를 import 하면 효과음 재생기를 거쳐
 * 무투장 첫 화면까지 실린다(2026-10-30).
 */
export function villageImpactSoundPlan(input: VillageImpactSound, variant: number, t: NativeCityImpactFeelTuning["sfx"]): readonly CombatSampleBeat[] {
  const kuma = input.by === "kuma";
  const rateMul = (1 + t.pitchSpread * impactWalk(input.hitIndex)) * (kuma ? t.kumaRateScale : 1);
  const gainMul = (1 + t.gainSpread * impactWalk(input.hitIndex + 3)) * (kuma ? t.kumaGainScale : 1);
  const scaled = (beat: CombatSampleBeat): CombatSampleBeat => ({ ...beat, gain: beat.gain * gainMul, rate: (beat.rate ?? 1) * rateMul });
  const weaponKind = input.weaponKind ?? "fist";
  const beats = villageMeleeSoundPlan(input.armored ? "hitArmored" : input.cue, variant, weaponKind).map(scaled);
  // A bounce off the rhythm armour (2026-10-18, user: "갑옷 글자나 쇳소리가 안 났음"): the clang over the thud — the fist met metal.
  if (input.bounced) return [...beats, scaled({ key: COMBAT_SFX.clang.key, gain: BOUNCE_CLANG_GAIN, delayMs: 0, rate: 1.05, attackMs: TRANSIENT_ATTACK_MS })];
  // Sharp/blunt samples already contain their contact layers. A generic finisher would erase their timbre.
  if (input.armored || weaponKind !== "fist") return beats;
  const victim: NativeCityFighter = kuma ? "player" : "kuma";
  const thud = t.thudGain[input.tier], boom = t.boomGain[input.tier];
  const layers: CombatSampleBeat[] = [];
  if (thud > 0) layers.push(scaled({ key: BODY_IMPACT_HEAVY_SFX.key, gain: thud, delayMs: t.thudDelayMs, rate: t.thudRate[victim],
    attackMs: TRANSIENT_ATTACK_MS }));
  if (boom > 0) layers.push(scaled({ key: COMBAT_SFX.hitFinisher.key, gain: boom, delayMs: t.boomDelayMs, rate: t.boomRate,
    attackMs: TRANSIENT_ATTACK_MS }));
  return [...beats, ...layers];
}
