import { damagedHp } from "../PlayerHealthRules";
import { DEFAULT_TUNING } from "../tuning";
import { NATIVE_CITY_COMBAT, type NativeCityImpactTier } from "./NativeCityCombatTuning";
import type { CityPoint } from "../../world/NativeCityDefinition";
import { kumaScreenFacing } from "./NativeCityKumaGeometry";
import { freezeNativeCityFight } from "./NativeCityFight";
import { calmKuma, emit, nativeCityUnit, opponentOf, type FightEnemy, type FightFrame } from "./NativeCityFightFrame";
import { kumaFightEnemy } from "./CityFightFighterFoe";
import { cityFightMeterGain } from "./CityFightMeter";
import { takeBlow } from "./NativeCityFightDefend";
import { cityFightFollowUpById, stepCityFightFollowUp, type CityFightFollowUp } from "./CityFightAwakening";



/** A hold beat freezing this long (fight ms) or longer lands as a heavy blow on him (the rush's hardest). */
const HOLD_HEAVY_STOP_MS = 120;
/** The launch's push along the stage (strides): it flies him back a little, the blows follow him. */
const LAUNCH_STRIDES = 0.6;
/** A launch with no spike after it flies this long (fight ms) before he lands. */
const LAUNCH_FLIGHT_MS = 520;
/** He lies this long past the `down` beat's wait before he gets up (fight ms) — the beat lands on a body still down. */
const DOWN_LIE_EXTRA_MS = 520;
/** The burst's height over his feet on the flying beats (body heights): up with his thrown body. */
const AIR_CONTACT_LIFT = 0.25;


export function stepNativeCityFoeFollowUp<K>(f: FightFrame<K>, fightDt: number): void {
  const s = f.s, run = s.foeFollowUp;
  if (!run) return;
  const follow = cityFightFollowUpById(run.id), ko = s.fight.ko;
  // Over once he is out (a KO, not the beats' own knockdown) or the opponent is gone.
  if (!follow || (ko !== null && ko.downed !== true) || f.hp <= 0 || !f.ctx.kumaOps.present(f.kuma)) { s.foeFollowUp = null; return; }
  const lying = ko !== null && ko.landed && ko.elapsedMs >= ko.timing.lieAtMs;
  const stepped = stepCityFightFollowUp(run, fightDt, lying);
  s.foeFollowUp = stepped.run;
  if (stepped.beat === null) return;
  if (strikeFoeFollowUpBeat(f, follow, stepped.beat, run.damage) === "ko") s.foeFollowUp = null;
}


function strikeFoeFollowUpBeat<K>(f: FightFrame<K>, follow: CityFightFollowUp, index: number, superDamage: number): "hit" | "ko" {
  const { s, ctx } = f, ops = ctx.kumaOps, opponent = opponentOf(f), by = kumaFightEnemy(f.kuma, ops, f.factions, opponent);
  const beat = follow.beats[index]!, damage = superDamage * beat.share, fx = NATIVE_CITY_COMBAT.feel.fx;
  const from = ops.point(f.kuma), push: CityPoint = nativeCityUnit([ctx.point[0] - from[0], ctx.point[1] - from[1]]) ?? [1, 0];
  const axis = kumaScreenFacing(ctx.projection, push) ?? "left", freezeMs = beat.hitStopMs * NATIVE_CITY_COMBAT.hitStopScale;
  emit(f, { kind: "foeFollowUpBeat", beat: index, damage });
  if (beat.kind === "hold" || beat.kind === "launch") {
    const launch = beat.kind === "launch", heavy = launch || beat.hitStopMs >= HOLD_HEAVY_STOP_MS;
    const impact: NativeCityImpactTier = heavy ? "heavy" : "light";
    const spike = follow.beats.find(b => b.kind === "spike"), flightMs = launch && spike?.atMs != null && beat.atMs != null
      ? Math.max(120, spike.atMs - beat.atMs) : LAUNCH_FLIGHT_MS;
    const hp = takeBlow(f, by, { damage, victim: s.fight.victim, axis, push, direction: push, impact, freezeMs, reaction: heavy ? "heavy" : "light",
      knockbackStrides: launch ? LAUNCH_STRIDES : 0, contactHeight: fx.contactHeight,
      ...(launch ? { knockdown: true, launch: true,
        landing: { flightMs, lieMs: follow.down ? follow.down.afterDownMs + DOWN_LIE_EXTRA_MS : DOWN_LIE_EXTRA_MS } }
        : { stunMs: beat.holdMs, first: false }) });
    return hp <= 0 ? "ko" : "hit";
  }
  // Up there (air, spike) or lying (down): the blow lands on the flying or downed body — its HP, its freeze, its struck feel; the fall goes on.
  const hp = f.hp = damagedHp(f.hp, damage, DEFAULT_TUNING);
  emit(f, { kind: "playerDamaged", amount: damage, hp });
  if (damage > 0) s.meter = cityFightMeterGain(s.meter, "taken");
  s.fight = freezeNativeCityFight(s.fight, freezeMs);
  const tier: NativeCityImpactTier = beat.kind === "air" ? "light" : "heavy";
  emit(f, { kind: "struckBy", enemy: opponent, tier, freezeMs, skidUnits: 0, push,
    contactHeight: fx.contactHeight + (beat.kind === "down" ? 0 : AIR_CONTACT_LIFT), speedLines: false });
  emit(f, { kind: "sound", cue: tier === "light" ? "struck" : "struckHeavy", tier });
  if (hp <= 0) { knockedOut(f, by); emit(f, { kind: "changed" }); return "ko"; }
  emit(f, { kind: "changed" });
  return "hit";
}

/** The beats' knockdown becomes his KO (its fall and lie go on — the defeat card's, or the host enemy's `playerDown`). */
function knockedOut<K>(f: FightFrame<K>, by: FightEnemy): void {
  const ko = f.s.fight.ko;
  if (ko?.downed === true) {
    const { downed: _downed, ...rest } = ko;
    f.s.fight = Object.freeze({ ...f.s.fight, ko: Object.freeze({ ...rest, defeatCard: by.defeatCard }) });
  }
  if (by.defeatCard) calmKuma(f); else emit(f, { kind: "playerDown", by: by.id });
}
