import type { KumaFightLetterId } from "../../../assets/KumaFightArtCatalog";
import { NATIVE_CITY_COMBAT, type NativeCityAccentKind, type NativeCityImpactTier } from "../../../sim/cityFight/NativeCityCombatTuning";
import { NativeCityBackdropDim } from "../../effects/NativeCityScreenGrade";
import { cityProject, type CityPoint } from "../../../world/NativeCityDefinition";
import { kumaScreenDelta } from "../../../sim/cityFight/NativeCityKumaGeometry";
import { PALETTE } from "../../art/palette";
import { nativeCityExchangeShake, type NativeCityExchangeCue, type NativeCityExchangeFxKind } from "../../effects/NativeCityExchangeFx";
import { NATIVE_CITY_ACCENT_REST, nativeCityAccentGrant, type NativeCityAccentClock } from "../../effects/NativeCityAccentBudget";
import { nativeCityCameraKickPlan, nativeCityImpactRumble } from "../../effects/NativeCityImpactFeel";
import { sfxLetterOffset, sfxLetterSizePx, type SfxLetterWeight } from "../../effects/webtoon/SfxLetter";
import type { NativeCityDefinition } from "../../../world/NativeCityDefinition";
import type { NativeCityCombatFxSink } from "../../effects/NativeCityCombatFx";
import type { NativeCityCameraKick, NativeCityRumble } from "../../effects/NativeCityImpactFeel";
import type { NativeCityHitFxView } from "../../view/NativeCityHitFxView";
import type { NativeCityFloatTextView } from "../../view/NativeCityFloatTextView";
import type { SfxLetterView } from "../../view/SfxLetterView";
import type { NativeCityKumaView } from "../../view/NativeCityKumaView";
import type { NativeCityWeaponImpactKind } from "../../effects/NativeCityWeaponImpact";
import type { CombatStatusId } from "../../effects/CombatStatusTag";
import { NATIVE_CITY_FLOAT_PLACE, type NativeCityHitNumber } from "../../effects/NativeCityFloatText";

/** What the stagecraft reads from the fight's host (the same getters — this frame's values). */
export interface NativeCityStagecraftHost {
 readonly projection: () => NativeCityDefinition;
 readonly actorHeight: () => number;
 readonly reducedMotion: () => boolean;
 readonly letters?: Pick<SfxLetterView, "pop">;
 readonly fx?: NativeCityCombatFxSink;
 readonly shake?: (px: number, durationMs: number, verticalShare?: number) => void;
 readonly hitFx?: Pick<NativeCityHitFxView, "burst">;
 readonly kick?: (kick: NativeCityCameraKick) => void;
 readonly rumble?: (rumble: NativeCityRumble) => void;
 readonly hurt?: (tier: NativeCityImpactTier) => void;
 readonly kuma: Pick<NativeCityKumaView, "weaponTrailFrame">;
 readonly floats?: Pick<NativeCityFloatTextView, "number" | "status" | "update">;
}

/**
 * 어느 몸에나 쓰는 싸움 무대 기술(2026-10-10 진행자에서 떼어 냄): 만화 글자의 줄(번갈아 비켜 서는 자리), 공방 이펙트·흔들림, 그린
 * 타격(별·베기·집중선), 접촉 자리, 한 방의 공용 박자(`impactFeel`) — 그리고 이펙트 씨앗의 일련번호 하나. 진행자가 하나를 갖고
 * 쿠마의 신호(`NativeCityKumaFightCues`)에 빌려준다. 같은 호출, 같은 인자, 같은 순서 — 일련번호도 하나라 씨앗이 그대로다.
 * 강조 예산(2026-10-10 3단계, `NativeCityAccentBudget`)도 여기 하나다: 한 방의 `impactFeel` 이 그 방의 강조를 정하고(`blow`), 바로 뒤의
 * 그 몸만의 신호(쿠마의 글자·임팩트 프레임·카메라 펀치)가 같은 결정을 읽는다.
 */
export class NativeCityFightStagecraft {
  /** Every effect's seed steps this one serial (`seed`), so the effects' order keeps their seeds. */
  private fxSerial = 0;
  /** The comic letters' run (alternating offsets, `sfxLetterOffset`) and when the last one popped (screen clock). */
  private letterRun = { index: 0, atMs: Number.NEGATIVE_INFINITY };
  /** The last accent that played loud (`feel.budget`). */
  private accents: NativeCityAccentClock = NATIVE_CITY_ACCENT_REST;
  /**
   * The last blow's accent (`impactFeel`): what it was and whether it played loud — the body's own cues on the same contact read it
   * (`NativeCityKumaFightCues.landed` / `strikeLanded`). A blow without an accent is "loud" (nothing of it is budgeted).
   */
  private lastBlow: { readonly accent: NativeCityAccentKind | null; readonly loud: boolean } = { accent: null, loud: true };
  /** The backdrop dim (`feel.screenGrade.backdrop`): armed by a loud big blow here, stepped by the presenter's effect frame. */
  readonly backdrop = new NativeCityBackdropDim();

  /** `clockMs`: the fight's screen clock; `stepUnits`: one stride in plan units right now. */
  constructor(private readonly host: NativeCityStagecraftHost, private readonly clockMs: () => number, private readonly stepUnits: () => number) {}

  /** The next effect seed: the shared serial stepped once, times `prime` (each effect family its own prime). */
  seed(prime: number): number { return (this.fxSerial += 1) * prime; }

  /**
   * Pops a comic letter (`SfxLetterView`) over `feet` (plan) at `height` of `bodyPx`, drifting along `push` (plan; null floats it
   * up) after holding `holdMs`. Consecutive letters of a run alternate their offset (`sfxLetterOffset`) so a chain never stacks.
   */
  letter(id: KumaFightLetterId, weight: SfxLetterWeight, feet: CityPoint, bodyPx: number, push: CityPoint | null, holdMs: number,
    tone?: "miss"): void {
    const letters = this.host.letters;
    if (!letters) return;
    const definition = this.host.projection(), [x, y] = cityProject(feet, definition), clockMs = this.clockMs();
    // A run of letters restarts its offsets after a pause.
    if (clockMs - this.letterRun.atMs > 700) this.letterRun.index = 0;
    const index = this.letterRun.index++, size = sfxLetterSizePx(weight, bodyPx), [ox, oy] = sfxLetterOffset(index, size);
    this.letterRun.atMs = clockMs;
    let drift: readonly [number, number] = [0, -1];
    if (push) {
      const [sx, sy] = kumaScreenDelta(definition.projection, push), length = Math.hypot(sx, sy);
      // Up, leaning a little along the push (letters float off the blow, never down over the fighters).
      if (length > 1e-6) { const dx = 0.5 * sx / length, l = Math.hypot(dx, 1); drift = [dx / l, -1 / l]; }
    }
    const top = y - (1 + NATIVE_CITY_COMBAT.feel.letters.aboveHead) * bodyPx - 0.5 * size;
    letters.pop({ id, weight, at: [x + ox, top + oy], sizePx: size, side: index % 2 === 0 ? -1 : 1, drift, holdMs, ...(tone ? { tone } : {}) });
  }

  /**
   * Pops a comic letter AT a blow's contact (`feet` plan, `height` of `bodyPx` up), `sizeScale` × its weight's size: its bottom edge
   * sits on the contact so it reads where the fist met him without covering the swing below. Drifts along `push` like `letter`.
   */
  contactLetter(id: KumaFightLetterId, weight: SfxLetterWeight, feet: CityPoint, height: number, bodyPx: number, push: CityPoint | null,
    holdMs: number, sizeScale = 1): void {
    const letters = this.host.letters;
    if (!letters) return;
    const definition = this.host.projection(), [x, y] = cityProject(feet, definition);
    const size = sfxLetterSizePx(weight, bodyPx) * Math.max(0.1, sizeScale);
    let drift: readonly [number, number] = [0, -1], side: -1 | 1 = 1;
    if (push) {
      const [sx, sy] = kumaScreenDelta(definition.projection, push), length = Math.hypot(sx, sy);
      if (length > 1e-6) { const dx = 0.5 * sx / length, l = Math.hypot(dx, 1); drift = [dx / l, -1 / l]; side = sx < 0 ? -1 : 1; }
    }
    this.letterRun.atMs = this.clockMs();
    letters.pop({ id, weight, at: [x, y - height * bodyPx - 0.5 * size], sizePx: size, side, drift, holdMs });
  }

  /**
   * Pops a blow's own call-out (what hit him) BESIDE the struck body (`bodyPx` tall, drawn `liftPx` world px off the ground — the air
   * combo): on his far side from the blow (`push`, plan), its centre `feel.letters.beside` of his body from the `contact` (plan feet),
   * `height` of his body up (thrown up: under his flat body, `besideAirDrop`), drifting on away from the blow. Over his head the launch
   * carried him up into it (`feel.letters.besideNote`).
   */
  sideLetter(id: KumaFightLetterId, weight: SfxLetterWeight, contact: CityPoint, height: number, bodyPx: number, liftPx: number,
    push: CityPoint, holdMs: number): void {
    const letters = this.host.letters;
    if (!letters) return;
    const definition = this.host.projection(), [x, y] = cityProject(contact, definition);
    const side: -1 | 1 = kumaScreenDelta(definition.projection, push)[0] < 0 ? -1 : 1;
    // Thrown up he lies flat along the push, so beside him is on him: under his flat body instead (over it is the HUD's corner), drifting
    // away and a little down, off him.
    const S = NATIVE_CITY_COMBAT.feel.letters, air = liftPx > 0, up = air ? liftPx - S.besideAirDrop * bodyPx : height * bodyPx;
    const dy = air ? 0.3 : -0.5, l = Math.hypot(1, dy);
    this.letterRun.atMs = this.clockMs();
    letters.pop({ id, weight, at: [x + side * S.beside * bodyPx, y - up],
      sizePx: sfxLetterSizePx(weight, bodyPx), side, drift: [side / l, dy / l], holdMs });
  }

  /**
   * A damage number (`NativeCityFloatTextView`) beside a blow's contact on `body`: the drawn hit's contact (`hitBurst` — `contactInset`
   * back toward the attacker — the contact's own `contactInset` when it has one —, `contactHeight` of `bodyPx` up from `victim`'s feet),
   * leaning to the pushed side (`push`, plan).
   */
  hitNumber(number: NativeCityHitNumber, body: string, victim: CityPoint, bodyPx: number, push: CityPoint, contactHeight: number,
    contactInset?: number, scale?: number): void {
    const floats = this.host.floats;
    if (!floats) return;
    const definition = this.host.projection(), [sx, sy] = kumaScreenDelta(definition.projection, push);
    const angle = Math.hypot(sx, sy) < 1e-6 ? 0 : Math.atan2(sy, sx), [fx, fy] = cityProject(victim, definition);
    const place = NATIVE_CITY_FLOAT_PLACE, inset = (contactInset ?? NATIVE_CITY_COMBAT.feel.fx.contactInset) * bodyPx;
    floats.number(number, { at: [fx - Math.cos(angle) * inset, fy - (contactHeight + place.numberLift) * bodyPx], side: sx < 0 ? -1 : 1,
      sidePx: place.numberSide * bodyPx, body, ...(scale !== undefined ? { scale } : {}) });
  }

  /** A status label (`CombatStatusTag`) by the head of `body` (feet `feet`, plan; `bodyPx` tall), on its side away from `other` (plan). */
  status(id: CombatStatusId, body: string, feet: CityPoint, bodyPx: number, other: CityPoint | null,
    height: number = NATIVE_CITY_FLOAT_PLACE.statusHeight): void {
    const floats = this.host.floats;
    if (!floats) return;
    const definition = this.host.projection(), [x, y] = cityProject(feet, definition), place = NATIVE_CITY_FLOAT_PLACE;
    const away = other ? x - cityProject(other, definition)[0] : 1;
    floats.status(id, { at: [x, y - height * bodyPx], side: away < 0 ? -1 : 1, sidePx: place.statusSide * bodyPx, body });
  }


  exchangeFx(kind: NativeCityExchangeFxKind, feet: CityPoint, height: number, direction: CityPoint, bodyPx = this.host.actorHeight(),
    extra: Partial<Pick<NativeCityExchangeCue, "big" | "to" | "toHeight" | "stayMs" | "offsetPx" | "toOffsetPx" | "grade" | "blow" | "drawnScale"
      | "behindBodies">> = {}): void {
    this.host.fx?.exchange?.({ kind, feet, height, bodyPx, scale: this.host.actorHeight() / NATIVE_CITY_COMBAT.exchangeFx.sampleBodyPx,
      direction, seed: this.seed(7919), reducedMotion: this.host.reducedMotion(), ...extra });
  }

  /**
   * A body splatted on the end of the stage line (2026-10-22, one recipe for the village fight and the arena duel — `kumaWall`,
   * `CityFightBoutWall`): "쾅!" (a heavy accent — budgeted, `feel.budget`), dust thrown off the wall back along the flight, the sideways
   * jolt (`knockback.launch.wallShake`). The body's flash and the thud are the caller's. `letter`: "쾅!" at the contact instead, at that
   * height of the body and that size (the arena's tight frame — over his head it would sit under the HP bars).
   */
  wallSplat(point: CityPoint, back: CityPoint, bodyPx: number, freezeMs: number, letter?: { readonly height: number; readonly scale: number }): void {
    if (this.accent("heavy")) {
      if (letter) this.contactLetter("kwang", "heavy", point, letter.height, bodyPx, back, freezeMs, letter.scale);
      else this.letter("kwang", "heavy", point, bodyPx, back, freezeMs);
    }
    this.exchangeFx("koDustRing", point, 0, back, bodyPx);
    this.exchangeFx("slideDust", point, 0, back, bodyPx);
    const shake = NATIVE_CITY_COMBAT.knockback.launch.wallShake;
    this.host.shake?.(shake.px, shake.ms, shake.verticalShare);
  }

  /**
   * A thrown-down body meets the ground (2026-10-22, one recipe — the KO's landing, the air combo's spike and landing, the arena duel's
   * falls): the dust ring where he lies (`offsetPx`: his drawn fall's own cell from his feet), and the KO landing's shake when `shake`.
   * The thud is the caller's.
   */
  bodyLanded(point: CityPoint, side: number, bodyPx: number, offsetPx: readonly [number, number] | undefined, shake: boolean): void {
    this.exchangeFx("koDustRing", point, 0, [side, 0], bodyPx, offsetPx ? { offsetPx } : {});
    if (shake) this.exchangeShake("koLand");
  }

  /** A recipe shake (`nativeCityExchangeShake`); none under reduced motion. */
  exchangeShake(beat: Parameters<typeof nativeCityExchangeShake>[0]): void {
    if (this.host.reducedMotion()) return;
    const shake = nativeCityExchangeShake(beat);
    this.host.shake?.(shake.ampPx, shake.durMs, 0);
  }

  /** The last blow's accent decision (`impactFeel`, this frame): its accent and whether its strong cues play. */
  get blow(): { readonly accent: NativeCityAccentKind | null; readonly loud: boolean } { return this.lastBlow; }

  /**
   * One accent asked for now (screen clock, `nativeCityAccentGrant`): true when its strong cues play. Null (no accent) is always true —
   * the budget only weighs accents.
   */
  accent(kind: NativeCityAccentKind | null): boolean {
    if (!kind) return true;
    const grant = nativeCityAccentGrant(this.accents, kind, this.clockMs());
    this.accents = grant.clock;
    return grant.loud;
  }

  /** Where a fist meets a body: `feet` pulled back toward the attacker along `push` by most of the body radius. */
  contactOn(feet: CityPoint, radius: number, push: CityPoint): CityPoint {
    return [feet[0] - push[0] * radius * 0.8, feet[1] - push[1] * radius * 0.8];
  }


  impactFeel(tier: NativeCityImpactTier, armored: boolean, by: "player" | "kuma", victim: CityPoint, bodyPx: number,
    direction: CityPoint, contactHeight: number, stop: number, skidUnits: number, speedLines: boolean,
    accent: NativeCityAccentKind | null = null, weaponKind: NativeCityWeaponImpactKind = "fist", victimId?: string, netted = false,
    squeezed = false, contactInset?: number, drawn = true): void {
    const feel = NATIVE_CITY_COMBAT.feel, base = feel.tiers[tier], reduced = this.host.reducedMotion();
    const loud = this.accent(accent);
    this.lastBlow = { accent, loud };
    // A whole-screen pass owns its freeze: the camera kick below then keeps its nudge but drops its zoom pulse (one beat, one owner).
    const screenPass = this.backdrop.trigger(tier, loud && !armored, reduced);
    const spec = loud ? base : { ...base, shakePx: base.shakePx * feel.budget.quietShakeScale };
    const finisher = tier === "ko" && by === "player";
    // The camera: part of the tier's shake runs along the blow (with a nudge toward it and the tier's micro zoom pulse — none on a
    // plain hook / V, whose ender punch carries it; the counter's the biggest — `NativeCityImpactFeel`), the rest is the rig's shake.
    // None under reduced motion.
    const screen = kumaScreenDelta(this.host.projection().projection, direction);
    if (!reduced && finisher) {
      const shake = nativeCityExchangeShake("finisher");
      this.host.shake?.(shake.ampPx, shake.durMs, 0);
      const kick = nativeCityCameraKickPlan(tier, screen, 0, 0).kick;
      if (kick) this.host.kick?.(kick);
    } else if (!reduced && !armored) {
      const plan = nativeCityCameraKickPlan(tier, screen, tier === "slam" ? 0 : spec.shakePx, spec.shakeMs);
      if (tier === "slam" && spec.shakePx > 0 && spec.shakeMs > 0) this.host.shake?.(spec.shakePx, spec.shakeMs, feel.slamGround.verticalShare);
      else if (plan.isoPx > 0 && spec.shakeMs > 0) this.host.shake?.(plan.isoPx, spec.shakeMs, 0);
      // A quiet accent keeps its nudge but not its zoom pulse.
      if (plan.kick) this.host.kick?.(loud && !screenPass ? plan.kick : { ...plan.kick, zoomScale: 0 });
    }
    const rumble = nativeCityImpactRumble(tier, armored, reduced);
    if (rumble) this.host.rumble?.(rumble);
    if (by === "kuma") this.host.hurt?.(tier);
    if (!drawn) return;
    this.host.fx?.impact({ tier, weaponKind, victimId, armored, victim, bodyPx, stepUnits: this.stepUnits(), direction, contactHeight,
      technique: by === "kuma" ? this.host.kuma.weaponTrailFrame?.()?.technique : undefined,
      scale: spec.fxScale * (armored ? feel.armoredFxScale : 1), seed: this.seed(7919), freezeMs: stop, skidUnits,
      reducedMotion: reduced, emphasis: loud, ...(netted ? { netted: true } : {}), ...(squeezed ? { squeezed: true } : {}),
      ...(contactInset !== undefined ? { contactInset } : {}) });
    if (netted || squeezed) return;
    const enderFocus = by === "player" && tier === "heavy" && (accent === "ender" || accent === "knockdown");
    this.hitBurst(tier, armored, victim, bodyPx, screen, contactHeight, reduced, !armored && loud && (speedLines || enderFocus), stop, weaponKind,
      contactInset);
  }

  /** A block retains the attacking weapon's silhouette, with the guard's pale material and no extra camera/sound cue. */
  guardContact(weaponKind: NativeCityWeaponImpactKind, victim: CityPoint, bodyPx: number, direction: CityPoint,
    contactHeight: number, freezeMs: number): void {
    this.host.fx?.impact({ tier: "heavy", weaponKind, guarded: true, armored: false, victim, bodyPx, direction, contactHeight,
      stepUnits: this.stepUnits(), scale: 0.7, seed: this.seed(7919), freezeMs, reducedMotion: this.host.reducedMotion(), emphasis: false });
  }


  hitBurst(tier: NativeCityImpactTier, armored: boolean, victim: CityPoint, bodyPx: number, screen: CityPoint, contactHeight: number,
    reduced: boolean, speedLines = false, freezeMs = 0, weaponKind: NativeCityWeaponImpactKind = "fist", contactInset?: number): void {
    const sink = this.host.hitFx;
    if (!sink) return;
    const t = NATIVE_CITY_COMBAT.feel.hitFx, angle = Math.hypot(screen[0], screen[1]) < 1e-6 ? 0 : Math.atan2(screen[1], screen[0]);
    const [fx, fy] = cityProject(victim, this.host.projection());
    const at: readonly [number, number] = [fx - Math.cos(angle) * (contactInset ?? NATIVE_CITY_COMBAT.feel.fx.contactInset) * bodyPx,
      fy - contactHeight * bodyPx];
    const spin = (this.fxSerial * 47) % 360;
    // The speed lines ring his body's middle, behind him (a punish reads different in SHAPE from a plain hit).
    if (speedLines && !reduced) {
      const size = tier === "heavy" ? t.speedLines.heavySize : t.speedLines.size;
      sink.burst({ kind: "speed", at: [fx, fy - 0.5 * bodyPx], sizePx: size * bodyPx, angleDeg: spin, flipX: false, tint: null,
        feet: [fx, fy] });
    }
    // Clean contacts own their ink silhouette in the shared comic recipe. Only absorbed hits use the muted raster star.
    if (weaponKind !== "fist" || !armored) return;
    const star = (t.star.size[tier] ?? t.star.size.light ?? 0.36) * bodyPx * (armored ? t.star.armoredScale : 1);
    if (star > 0) sink.burst({ kind: "star", at, sizePx: star, angleDeg: spin, flipX: false, tint: armored ? PALETTE.manorIronEdge : null,
      holdMs: freezeMs, tailFrameMs: tier === "light" ? t.frames.lightTailFrameMs : t.frames.tailFrameMs });
  }
}
