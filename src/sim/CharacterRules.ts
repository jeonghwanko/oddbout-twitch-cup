import type { Tuning } from "./tuning";

/**
 * 남/여 주인공.
 *
 * 성능 차이는 "서로 다른 경로가 열린다" 수준에서만 준다. 한쪽이 모든 면에서 우월하면
 * 선택이 사라지고, 차이가 크면 밸런싱 대상이 두 배가 된다. 그래서 총합은 같게 두고
 * 어느 축에 몰아줄지만 다르게 한다.
 *
 * 남 괴도 — 힘. 더 많이 들고 더 멀리 뛴다. 대신 시끄럽다.
 * 여 괴도 — 기술. 조용하고 손이 빠르다. 대신 적게 든다.
 */

export const CHARACTER_IDS = Object.freeze(["male", "female"] as const);
export type CharacterId = (typeof CHARACTER_IDS)[number];

export interface CharacterDef {
  readonly id: CharacterId;
  readonly name: string;
  readonly tagline: string;
  /** 브리핑 화면에 그대로 쓰는 장단점 문구. */
  readonly pros: readonly string[];
  readonly cons: readonly string[];
  readonly carryMul: number;
  readonly jumpMul: number;
  readonly noiseMul: number;
  readonly grabSpeedMul: number;
  readonly staminaMul: number;
  readonly skillStartBonus: number;
}

export const CHARACTERS: Readonly<Record<CharacterId, CharacterDef>> = Object.freeze({
  male: {
    id: "male",
    name: "남 괴도",
    tagline: "힘으로 훔친다",
    pros: ["적재 한계 +25%", "점프 +10%", "체력 +15%"],
    cons: ["발소리 +20%", "절도 속도 -10%"],
    carryMul: 1.25,
    jumpMul: 1.1,
    noiseMul: 1.2,
    grabSpeedMul: 0.9,
    staminaMul: 1.15,
    skillStartBonus: 0,
  },
  female: {
    id: "female",
    name: "여 괴도",
    tagline: "품격으로 훔친다",
    pros: ["발소리 -25%", "절도 속도 +20%", "기술 시작치 +10"],
    cons: ["적재 한계 -15%", "점프 -5%"],
    carryMul: 0.85,
    jumpMul: 0.95,
    noiseMul: 0.75,
    grabSpeedMul: 1.2,
    staminaMul: 1,
    skillStartBonus: 10,
  },
});

/** 저장·URL 같은 외부 값을 검증된 캐릭터 ID로 좁히는 경계 함수. */
export function isCharacterId(value: unknown): value is CharacterId {
  return typeof value === "string" && (CHARACTER_IDS as readonly string[]).includes(value);
}

/** 검증을 통과한 ID의 total lookup. 기본 캐릭터 선택은 codec이 소유한다. */
export function characterOf(id: CharacterId): CharacterDef {
  return CHARACTERS[id];
}

/** 캐릭터 특성을 튜닝에 반영한다. sim 은 완성된 튜닝만 본다. */
export function applyCharacter(tuning: Tuning, character: CharacterDef): Tuning {
  return {
    ...tuning,
    carry: { ...tuning.carry, maxWeight: tuning.carry.maxWeight * character.carryMul },
    stamina: { ...tuning.stamina, max: tuning.stamina.max * character.staminaMul },
    movement: {
      ...tuning.movement,
      jumpVelocity: tuning.movement.jumpVelocity * character.jumpMul,
    },
    noise: {
      ...tuning.noise,
      walkRadius: tuning.noise.walkRadius * character.noiseMul,
      runRadius: tuning.noise.runRadius * character.noiseMul,
      softLandingRadius: tuning.noise.softLandingRadius * character.noiseMul,
      hardLandingRadius: tuning.noise.hardLandingRadius * character.noiseMul,
    },
    skill: { ...tuning.skill, start: tuning.skill.start + character.skillStartBonus },
    loot: {
      ...tuning.loot,
      // 절도 속도는 자물쇠 따기 강화와 같은 축이다. 배수의 역수를 시간에 곱한다.
      grabDurationMul: 1 / character.grabSpeedMul,
    },
  };
}
