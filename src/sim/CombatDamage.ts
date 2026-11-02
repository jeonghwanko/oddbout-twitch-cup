/** Weapon and target data enter the same deterministic HP damage calculation. */
export type CombatWeaponId = "fist" | "kick" | "dagger" | "club" | "crossbow" | "blade";
/** `tool`: 괴도 무기 개조가 만든 빈틈. 다른 빈틈과 같은 배율·순위라 겹쳐도 한 번만 적용된다. */
export type CombatOpportunity = "normal" | "rear" | "recovery" | "counter" | "tool";
export type CombatContactMaterial = "body" | "cloth" | "metal";

export interface CombatWeaponProfile {
  readonly baseDamage: number;
  readonly armorPenetration: number;
  readonly material: CombatContactMaterial;
}


export const COMBAT_WEAPONS: Readonly<Record<CombatWeaponId, CombatWeaponProfile>> = Object.freeze({
  fist: Object.freeze({ baseDamage: 1, armorPenetration: 0, material: "body" }),
  kick: Object.freeze({ baseDamage: 1, armorPenetration: 0, material: "body" }),
  dagger: Object.freeze({ baseDamage: 1, armorPenetration: 0, material: "metal" }),
  club: Object.freeze({ baseDamage: 1, armorPenetration: 0, material: "body" }),
  crossbow: Object.freeze({ baseDamage: 1, armorPenetration: 0, material: "metal" }),
  blade: Object.freeze({ baseDamage: 1, armorPenetration: 0, material: "metal" }),
});

/** A single opening is chosen; simultaneous rear/recovery/counter/tool openings never multiply. */
const COMBAT_OPPORTUNITY_RANK: Readonly<Record<CombatOpportunity, number>> = Object.freeze({
  normal: 0,
  rear: 1,
  recovery: 1,
  counter: 1,
  tool: 1,
});

export interface CombatDamageInput {
  readonly weaponId: CombatWeaponId;
  readonly moveCoefficient?: number;
  readonly opportunity?: CombatOpportunity;
  readonly opportunities?: readonly CombatOpportunity[];
  readonly armor?: number;
  readonly armorPenetration?: number;
  /** Global armor curve coefficient from tuning.combat.armorK. */
  readonly armorK: number;
  /** Shared opening multiplier from tuning.combat.punishDamage. */
  readonly opportunityMultiplier: number;
  readonly blocked?: boolean;
  readonly invulnerable?: boolean;
  readonly material?: CombatContactMaterial;
}

export interface CombatDamageResult {
  readonly damage: number;
  readonly opportunity: CombatOpportunity;
  readonly material: CombatContactMaterial;
}

const DAMAGE_PRECISION = 1_000;

export function evaluateCombatDamage(input: CombatDamageInput): CombatDamageResult {
  const weapon = COMBAT_WEAPONS[input.weaponId];
  const openings = input.opportunities ?? [input.opportunity ?? "normal"];
  const opportunity = openings.reduce<CombatOpportunity>((strongest, candidate) =>
    COMBAT_OPPORTUNITY_RANK[candidate] > COMBAT_OPPORTUNITY_RANK[strongest]
      ? candidate : strongest, "normal");
  const material = input.material ?? weapon.material;
  if (input.blocked || input.invulnerable) return { damage: 0, opportunity, material };

  const effectiveArmor = Math.max(0, (input.armor ?? 0) - (input.armorPenetration ?? weapon.armorPenetration));
  const armorK = Math.max(Number.EPSILON, input.armorK);
  const damage = weapon.baseDamage * (input.moveCoefficient ?? 1)
    * (opportunity === "normal" ? 1 : input.opportunityMultiplier)
    * armorK / (armorK + effectiveArmor);
  return {
    damage: Math.max(0, Math.round(damage * DAMAGE_PRECISION) / DAMAGE_PRECISION),
    opportunity,
    material,
  };
}
