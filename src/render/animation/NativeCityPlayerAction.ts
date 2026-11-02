import { nativeCityArtReachExtraStrides } from "../../sim/cityFight/NativeCityMelee";
import { NATIVE_CITY_COMBAT, type NativeCityPlayerAirMove, type NativeCityPlayerActionKind, type NativeCityTempoTuning } from "../../sim/cityFight/NativeCityCombatTuning";
import type { VillageFacing } from "../../sim/VillageFacing";
import type { NativeCityHitReaction, NativeCityKoLanding } from "../../sim/cityFight/NativeCityFightFrame";
import type { CityPoint } from "../../world/NativeCityDefinition";
import { nativeCityPlayerVaultReleaseMs, type NativeCityPlayerVaultTimeline } from "../../sim/cityFight/NativeCityPlayerVault";
import type { NativeCityPlayerBackstepTimeline } from "../../sim/cityFight/NativeCityPlayerBackstep";
import { NATIVE_CITY_STEP_BODY_RATIO } from "../../world/NativeCityTalkSpot";
import { nativeCityFightHitClock, nativeCityFightHitLocks, nativeCityFightHitTiming, nativeCityFightKoClock, nativeCityPlaceholderKoTiming,
  stepNativeCityFightHit, stepNativeCityFightKo, type NativeCityFightHit, type NativeCityFightKoClock } from "../../sim/cityFight/NativeCityFight";
import { cancelNativeCityPlayerSwing, createNativeCityPlayerSwing, holdNativeCityPlayerSwing, markNativeCityPlayerSwingLanded,
  nativeCityPlayerLungeUnits as simPlayerLungeUnits, nativeCityPlayerSwingAttackId, nativeCityPlayerSwingCancelAtMs, nativeCityPlayerSwingCancellable,
  startNativeCityPlayerSwing, stepNativeCityPlayerSwing, type NativeCityCancelBy, type NativeCityPlayerContact as SimPlayerContact, type NativeCityPlayerSwingState,
  type NativeCityPlayerSwingStep, type NativeCityPlayerSwingTimeline, type NativeCitySwingContact } from "../../sim/cityFight/NativeCityPlayerSwing";
import { clamp01 } from "../../sim/geom";
import { easeOutCubic } from "../art/easing";
import { stepIndexAt, stepsTotal } from "./StepTimeline";
import { nativeCityOrthoActionClip, nativeCityOrthoActionFrame, nativeCityOrthoActionSteps, nativeCityOrthoActionTiming, nativeCityOrthoClipCell,
  nativeCityOrthoHitSteps, type NativeCityOrthoActionClip, type NativeCityOrthoActionFrame, type NativeCityOrthoPack } from "../art/NativeCityOrthoPack";
import { nativeCityClipWarp, nativeCityFixedSection, nativeCityRateSection, nativeCityWarpArtMs, nativeCityWarpFightMs, nativeCityWarpTotalMs,
  type NativeCityWarpSection } from "./NativeCityTempoWarp";




export type NativeCityPlayerActionTimeline = NativeCityPlayerSwingTimeline;

/** One swing of the C chain: art ms [fromMs, toMs) of the combo clip holding one contact (`hitMs`). */
export interface NativeCityChainSegment {
  readonly fromMs: number;
  readonly toMs: number;
  readonly hitMs: number;
  /** Art steps [fromStep, toStep) and the contact step (art clips only). */
  readonly fromStep?: number;
  readonly toStep?: number;
  readonly hitStep?: number;
}

/**
 * The authored C-chain cut of a combo clip (`hitSegments`, inclusive step ranges), as [fromStep, toStep) per contact — when it fits
 * the clip's contacts (one each, in order, inside the clip).
 */
function authoredSegments(clip: NativeCityOrthoActionClip, hits: readonly number[], steps: number): readonly (readonly [number, number])[] | null {
  const raw = clip.hitSegments;
  if (!raw?.length) return null;
  const ranges = raw.map(segment => [segment.startSequenceIndex, segment.endSequenceIndex + 1] as const);
  const fits = ranges.every(([from, to], i) => Number.isInteger(from) && Number.isInteger(to) && from >= 0 && to <= steps
    && hits.some(hit => hit >= from && hit < to) && (i === 0 || from >= ranges[i - 1]![1]))
    && hits.every(hit => ranges.filter(([from, to]) => hit >= from && hit < to).length === 1);
  return fits ? ranges : null;
}

/**
 * The C chain's swings (2026-10-09): the combo clip cut into one contact each — where the art records them (`hitSegments`), else
 * halfway between contacts (the first swing from the clip's start, the last to its end). Without a clip, the placeholder beats
 * (`player.actions.combo.placeholderHitsMs` / `placeholderTotalMs`) cut the same way.
 */
export function nativeCityChainSegments(clip: NativeCityOrthoActionClip | null): readonly NativeCityChainSegment[] {
  if (clip) {
    const steps = nativeCityOrthoActionSteps(clip), hits = nativeCityOrthoHitSteps(clip), { startsMs, totalMs } = nativeCityOrthoActionTiming(clip);
    if (hits.length > 0) {
      const starts = hits.map((hit, i) => i === 0 ? 0 : hits[i - 1]! + 1 + Math.floor((hit - hits[i - 1]! - 1) / 2));
      const ranges = authoredSegments(clip, hits, steps.length)
        ?? starts.map((from, i) => [from, starts[i + 1] ?? steps.length] as const);
      return ranges.map(([fromStep, toStep]) => {
        const hit = hits.find(h => h >= fromStep && h < toStep)!;
        return { fromMs: startsMs[fromStep] ?? 0, toMs: startsMs[toStep] ?? totalMs, hitMs: startsMs[hit] ?? 0, fromStep, toStep, hitStep: hit };
      });
    }
  }
  const spec = NATIVE_CITY_COMBAT.player.actions.combo, hits = spec.placeholderHitsMs;
  return hits.map((hitMs, i) => ({ fromMs: i === 0 ? 0 : (hits[i - 1]! + hitMs) / 2,
    toMs: i + 1 < hits.length ? (hitMs + hits[i + 1]!) / 2 : spec.placeholderTotalMs, hitMs }));
}


export function nativeCityHeavyBlowFromStep(clip: NativeCityOrthoActionClip): number {
  const hits = nativeCityOrthoHitSteps(clip), last = hits.at(-1) ?? 0, before = hits.at(-2) ?? -1;
  const flow = clip.keys?.heavyFlow as { readonly windups?: unknown } | undefined;
  const authored = Array.isArray(flow?.windups) ? flow.windups
    .map(w => (w as { readonly fromSequenceIndex?: unknown } | null)?.fromSequenceIndex)
    .filter((step): step is number => typeof step === "number" && Number.isInteger(step) && step > before && step < last).at(-1) : undefined;
  if (authored !== undefined) return authored;
  const steps = nativeCityOrthoActionSteps(clip), held = steps[before]?.frame;
  for (let step = before + 1; step < last; step++) if (steps[step]!.frame !== held) return step;
  return nativeCityChainSegments(clip).at(-1)?.fromStep ?? 0;
}


export function nativeCityStartupMs(kind: NativeCityPlayerActionKind, segment: number,
  tempo: NativeCityTempoTuning["player"] = NATIVE_CITY_COMBAT.tempo.player): number {
  const s = tempo.startupMs;
  return kind === "attack" ? s.heavy : kind === "dashAttack" ? s.dash : ([s.jab, s.straight, s.hook][Math.max(0, Math.floor(segment))] ?? s.hook);
}


export function nativeCityPlayerActionTimeline(pack: NativeCityOrthoPack | null, facing: VillageFacing, kind: NativeCityPlayerActionKind,
  segment: number | null = null, tempo: NativeCityTempoTuning["player"] = NATIVE_CITY_COMBAT.tempo.player, clip?: "airC" | "airV" | "airStomp"): NativeCityPlayerActionTimeline {
  const found = pack ? nativeCityOrthoActionClip(pack, facing, clip ?? kind) : null;
  // A staccato clip (`keys.staccato`, the side duel moves 2026-10-11) is authored pose to pose at fight ms: no rate, no startup squeeze.
  const staccato = found?.clip.keys?.staccato === true;
  const rate = staccato ? 1 : kind === "combo" ? tempo.chainRate : tempo.heavyRate;
  const chain = kind === "combo" && segment !== null;
  const segments = chain ? nativeCityChainSegments(found?.clip ?? null) : [];
  const index = chain ? Math.max(0, Math.min(segments.length - 1, Math.floor(segment))) : 0;
  // V and the sliding tackle end a string; of the C chain, its last segment (or the whole clip).
  const ender = kind !== "combo" || chain && index === segments.length - 1 || !chain;
  const startup = nativeCityStartupMs(kind, chain ? index : 0, tempo);
  const charge = kind === "attack" && !clip ? NATIVE_CITY_COMBAT.player.actions.attack.charge : undefined;
  if (found) {
    const steps = nativeCityOrthoActionSteps(found.clip), hitSteps = nativeCityOrthoHitSteps(found.clip);
    const { startsMs } = nativeCityOrthoActionTiming(found.clip);
    if (charge && hitSteps.length > 0) return heavyChargeTimeline(found.clip, hitSteps, staccato ? 1 : rate, staccato, charge);
    if (hitSteps.length > 0) {
      const part = chain ? segments[index]! : null;
      const heavy = kind === "attack" && hitSteps.length > 1 ? nativeCityHeavyBlowFromStep(found.clip) : null;
      const from = part?.fromStep ?? heavy ?? 0, to = part?.toStep ?? steps.length;
      const contacts = hitSteps.filter(step => step >= from && step < to);
      const first = contacts[0] ?? to;
      let lead = 0;
      for (let step = from; step < first; step++) lead += Math.max(0, steps[step]!.durationMs) / Math.max(1e-6, rate);
      const squeeze = !staccato && lead > startup && lead > 0 ? startup / lead : 1;
      const sections: NativeCityWarpSection[] = [];
      for (let step = from; step < to; step++) {
        const at = startsMs[step]!, duration = Math.max(0, steps[step]!.durationMs);
        // The drawn contact hold keeps its length (the freeze eats it); every other step plays at the swing's rate.
        sections.push(contacts.includes(step) ? nativeCityFixedSection(at, at + duration, duration)
          : step < first ? nativeCityFixedSection(at, at + duration, duration / Math.max(1e-6, rate) * squeeze)
          : nativeCityRateSection(at, at + duration, rate));
      }
      const warp = nativeCityClipWarp(sections);
      const burst = chain ? NATIVE_CITY_COMBAT.player.actions[kind].bursts?.[index] : undefined;
      const reach = burst && contacts.length > 1 ? contacts.map(() => burst.reachExtraStrides)
        : nativeCityClipReachExtraStrides(found.clip, hitSteps, contacts);
      const hitsMs = contacts.map(step => nativeCityWarpFightMs(warp, startsMs[step]!));
      const authoredContacts = found.clip.keys?.contacts;
      const strikeContacts = Array.isArray(authoredContacts) ? contacts.map((step): NativeCitySwingContact | null => {
        const spec = authoredContacts[hitSteps.indexOf(step)] as { motion?: unknown; releaseSequenceIndex?: unknown; fxHeight?: unknown;
          fxInset?: unknown } | undefined;
        const release = spec?.releaseSequenceIndex, motion = spec?.motion;
        if ((motion !== "lateral" && motion !== "rising" && motion !== "downward") || typeof release !== "number"
          || !Number.isInteger(release) || release < from || release >= step) return null;
        const height = spec?.fxHeight;
        return { motion, releaseMs: nativeCityWarpFightMs(warp, startsMs[release]!),
          ...(typeof height === "number" && Number.isFinite(height) && height >= 0 && height <= 1 ? { fxHeight: height } : {}),
          ...contactFxInset(spec?.fxInset) };
      }) : [];
      // The side heel drop (`keys.move` heelDrop) is a real jump: off the ground from its first airborne step to the heel's contact.
      const airborne = found.clip.keys?.airborneSequence, takeoff = Array.isArray(airborne) ? airborne[0] : undefined;
      const jump = kind === "attack" && found.clip.keys?.move === "heelDrop" && typeof takeoff === "number" && startsMs[takeoff] !== undefined
        && hitsMs[0] !== undefined ? { takeoffMs: nativeCityWarpFightMs(warp, startsMs[takeoff]), contactMs: hitsMs[0] } : null;
      return { totalMs: nativeCityWarpTotalMs(warp), hitsMs, art: true, ...(clip ? { clip } : {}),
        ...(staccato ? { preserveContactHold: true } : {}),
        contactHoldsMs: contacts.map(step => steps[step]?.durationMs ?? 0), firstHit: chain ? index : 0, ender, warp,
        ...(chain ? { chainSegment: index } : {}),
        ...(reach ? { reachExtraStrides: reach } : {}),
        ...(strikeContacts.length === contacts.length && strikeContacts.every((c): c is NativeCitySwingContact => c !== null)
          ? { contacts: strikeContacts } : {}),
        ...(jump && jump.contactMs > jump.takeoffMs ? { jump } : {}) };
    }
  }
  const spec = NATIVE_CITY_COMBAT.player.actions[kind];
  const part = chain ? segments[index]! : { fromMs: 0, toMs: spec.placeholderTotalMs, hitMs: Number.NaN };
  const hits = chain ? [part.hitMs] : spec.placeholderHitsMs;
  // The same startup warp over the placeholder beats.
  const first = Math.max(part.fromMs, Math.min(part.toMs, hits[0] ?? part.toMs)), lead = (first - part.fromMs) / Math.max(1e-6, rate);
  const warp = nativeCityClipWarp([nativeCityFixedSection(part.fromMs, first, Math.min(lead, startup)),
    nativeCityRateSection(first, part.toMs, rate)]);
  const placeholderHits = hits.map(ms => nativeCityWarpFightMs(warp, ms));
  // The placeholder V charges too: it holds just short of its contact.
  const holdAtMs = charge && placeholderHits[0] !== undefined ? Math.max(0, Math.min(charge.entryMs, placeholderHits[0] - 1)) : null;
  return { totalMs: nativeCityWarpTotalMs(warp), hitsMs: placeholderHits, art: false, contactHoldsMs: [],
    firstHit: chain ? index : 0, ender, warp, ...(holdAtMs !== null ? { charge: { holdAtMs } } : {}) };
}

/**
 * An air move drawn by a pack without its air clip (`nativeCityPlayerAirTimeline`'s clips): the kind's own clip held on the move's contact —
 * the air C on its C chain segment's (`player.air.c.segment`), the spike and the stomp (a kick down on him) on V's last; null without that
 * clip either.
 */
export function nativeCityAirStandInFrame(pack: NativeCityOrthoPack, facing: VillageFacing, kind: NativeCityPlayerActionKind,
  clip?: "airC" | "airV" | "airStomp"): ReturnType<typeof nativeCityOrthoActionFrame> {
  if (clip === "airStomp") kind = "attack";
  const found = nativeCityOrthoActionClip(pack, facing, kind);
  if (!found) return null;
  const segment = NATIVE_CITY_COMBAT.player.air?.c.segment ?? 1;
  const hitMs = kind === "combo" ? nativeCityChainSegments(found.clip)[segment]?.hitMs : nativeCityOrthoActionTiming(found.clip).hitsMs.at(-1);
  return hitMs === undefined ? null : nativeCityOrthoActionFrame(pack, facing, kind, hitMs);
}


export function nativeCityPlayerAirTimeline(pack: NativeCityOrthoPack | null, facing: VillageFacing, move: NativeCityPlayerAirMove)
  : NativeCityPlayerActionTimeline | null {
  const clip = move === "c" ? "airC" : move === "v" ? "airV" : "airStomp", found = pack ? nativeCityOrthoActionClip(pack, facing, clip) : null;
  if (!pack || !found) return null;
  const timeline = nativeCityPlayerActionTimeline(pack, facing, move === "v" ? "attack" : "combo", null, NATIVE_CITY_COMBAT.tempo.player, clip);
  // Its drawn landing (`keys.land`, a sequence step): the rules play it from the touchdown.
  const land = found.clip.keys?.land, landArtMs = typeof land === "number" ? nativeCityOrthoActionTiming(found.clip).startsMs[land] : undefined;
  return landArtMs !== undefined ? { ...timeline, landArtMs } : timeline;
}


function contactFxInset(value: unknown): { fxInset?: number } {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? { fxInset: value } : {};
}

/**
 * V's charged kick on a drawn `attack` clip (2026-10-18, `player.actions.attack.charge`): the clip's first steps up to the crouch — the
 * step before its first contact's release (`keys.contacts[0]`), held at its middle — squeezed to `entryMs`; everything from there to the
 * last contact's windup (`keys.heavyFlow.windups` last `fromSequenceIndex`, else just after the contact before it) is skipped (0 fight ms —
 * the side clip's two snapping punches); the chamber squeezed to `releaseStartupMs`; then the LAST contact and the follow-through as drawn
 * (staccato) or at `rate`. Squeezes never stretch. One contact, an ender. `charge.holdAtMs`: the crouch, where the clock waits while V is down.
 */
function heavyChargeTimeline(clip: NativeCityOrthoActionClip, hitSteps: readonly number[], rate: number, staccato: boolean,
  charge: NonNullable<typeof NATIVE_CITY_COMBAT.player.actions.attack.charge>): NativeCityPlayerActionTimeline {
  const steps = nativeCityOrthoActionSteps(clip), { startsMs, totalMs } = nativeCityOrthoActionTiming(clip);
  const keys = clip.keys as { contacts?: unknown; heavyFlow?: { windups?: unknown } } | undefined;
  const authored = Array.isArray(keys?.contacts) ? keys.contacts as { motion?: unknown; releaseSequenceIndex?: unknown; fxHeight?: unknown;
    fxInset?: unknown }[] : [];
  const strike = hitSteps.at(-1)!, first = hitSteps[0]!;
  // The crouch: the step before the first contact's authored release; a clip without one holds the middle of its windup (the rest of the
  // windup is then the chamber — the four-diagonal clips draw one contact and no keys).
  const firstRelease = authored[0]?.releaseSequenceIndex;
  const hold = typeof firstRelease === "number" && Number.isInteger(firstRelease)
    ? Math.max(0, Math.min(first, firstRelease) - 1) : Math.floor(first / 2);
  const windups = Array.isArray(keys?.heavyFlow?.windups) ? keys.heavyFlow.windups as { fromSequenceIndex?: unknown }[] : [];
  const lastWindup = windups.at(-1)?.fromSequenceIndex;
  // Without a drawn windup key: the first step after the contact before it whose cell changes (its held contact cell is not the chamber).
  const before = hitSteps.at(-2), changed = before === undefined ? -1
    : steps.findIndex((step, index) => index > before && index < strike && step.frame !== steps[before]!.frame);
  const fallback = before === undefined ? hold + 1 : changed >= 0 ? changed : before + 1;
  const from = Math.min(strike, Math.max(hold + 1, typeof lastWindup === "number" && Number.isInteger(lastWindup) && lastWindup > hold
    && lastWindup <= strike ? lastWindup : fallback));
  const duration = (step: number) => Math.max(0, steps[step]?.durationMs ?? 0);
  const holdMid = Math.min(startsMs[hold]! + duration(hold) / 2, startsMs[strike]!);
  // No drawn step between the crouch and the contact: the crouch's own second half is the chamber.
  const chamberFrom = from < strike ? startsMs[from]! : holdMid, chamber = startsMs[strike]! - chamberFrom;
  const entry = (holdMid - startsMs[0]!) / Math.max(1e-6, rate), chamberMs = chamber / Math.max(1e-6, rate);
  const strikeEnd = startsMs[strike]! + duration(strike);
  // The release step (the last contact's authored release, `keys.contacts`) keeps its drawn length — the step-in rides it (game-animator
  // 2026-10-18: squeezed with the rest, 0.75 stride crossed in one frame); the chamber before it takes the rest of the squeeze.
  const spec = authored[hitSteps.length - 1], release = spec?.releaseSequenceIndex;
  const releaseAt = typeof release === "number" && Number.isInteger(release) && startsMs[release]! > chamberFrom && release < strike
    ? startsMs[release]! : null;
  const chamberTotal = Math.min(chamberMs, charge.releaseStartupMs), releaseMs = releaseAt === null ? 0 : (startsMs[strike]! - releaseAt) / Math.max(1e-6, rate);
  const keepRelease = releaseAt !== null && releaseMs < chamberTotal;
  const warp = nativeCityClipWarp([
    nativeCityFixedSection(startsMs[0]!, holdMid, Math.min(entry, charge.entryMs)),
    nativeCityFixedSection(holdMid, chamberFrom, 0),
    ...(keepRelease ? [nativeCityFixedSection(chamberFrom, releaseAt, chamberTotal - releaseMs), nativeCityFixedSection(releaseAt, startsMs[strike]!, releaseMs)]
      : [nativeCityFixedSection(chamberFrom, startsMs[strike]!, chamberTotal)]),
    nativeCityFixedSection(startsMs[strike]!, strikeEnd, duration(strike)),
    staccato ? nativeCityFixedSection(strikeEnd, totalMs, totalMs - strikeEnd) : nativeCityRateSection(strikeEnd, totalMs, rate),
  ]);
  const hitMs = nativeCityWarpFightMs(warp, startsMs[strike]!);
  const motion = spec?.motion, height = spec?.fxHeight;
  const contact: NativeCitySwingContact | null = (motion === "lateral" || motion === "rising" || motion === "downward")
    && typeof release === "number" && Number.isInteger(release) && release >= from && release < strike
    ? { motion, releaseMs: nativeCityWarpFightMs(warp, startsMs[release]!),
      ...(typeof height === "number" && Number.isFinite(height) && height >= 0 && height <= 1 ? { fxHeight: height } : {}),
      ...contactFxInset(spec?.fxInset) } : null;
  const reach = nativeCityClipReachExtraStrides(clip, hitSteps, [strike]);
  return { totalMs: nativeCityWarpTotalMs(warp), hitsMs: [hitMs], art: true, ...(staccato ? { preserveContactHold: true } : {}),
    contactHoldsMs: [duration(strike)], firstHit: 0, ender: true, warp, ...(reach ? { reachExtraStrides: reach } : {}),
    ...(contact ? { contacts: [contact] } : {}), charge: { holdAtMs: nativeCityWarpFightMs(warp, holdMid) } };
}

/**
 * The reach beyond body contact of each contact step in `contacts` read off its drawn tip (`hitReachPx`, `melee.reachFromArt`) — null when
 * the clip records none (the old fists keep `melee.reachExtraStrides`).
 */
export function nativeCityClipReachExtraStrides(clip: NativeCityOrthoActionClip, hitSteps: readonly number[], contacts: readonly number[])
  : readonly number[] | null {
  const tips = clip.hitReachPx;
  if (!tips || tips.length !== hitSteps.length || !(clip.bodyHeight > 0)) return null;
  const moves = clip.keys?.moves;
  return contacts.map(step => {
    const at = hitSteps.indexOf(step), segment = clip.hitSegments?.findIndex(s => step >= s.startSequenceIndex && step <= s.endSequenceIndex);
    const move = Array.isArray(moves) ? moves[segment !== undefined && segment >= 0 ? segment : at] : undefined;
    return nativeCityArtReachExtraStrides((tips[at] ?? Number.NaN) / clip.bodyHeight / NATIVE_CITY_STEP_BODY_RATIO,
      NATIVE_CITY_COMBAT.melee.reachFromArt, typeof move === "string" ? move : undefined);
  });
}


export function nativeCityPlayerVaultTimeline(pack: NativeCityOrthoPack | null, facing: VillageFacing): NativeCityPlayerVaultTimeline | null {
  const found = pack ? nativeCityOrthoActionClip(pack, facing, "vault") : null;
  const clip = found?.clip, travel = clip?.rootTravelPx;
  if (!clip || !travel) return null;
  const steps = nativeCityOrthoActionSteps(clip), { startsMs, totalMs } = nativeCityOrthoActionTiming(clip);
  const keys = clip.keys ?? {}, handstand = keys.handstand, land = keys.land;
  if (!Number.isInteger(handstand) || !Number.isInteger(land) || !(totalMs > 0)) return null;
  const at = (index: number) => travel[steps[index]?.frame ?? -1] ?? 0;
  return { totalMs, steps: steps.map((step, i) => ({ atMs: startsMs[i]!, travelPx: travel[step.frame] ?? 0 })),
    overPx: at(handstand as number), apexMs: startsMs[handstand as number] ?? 0, landPx: at(land as number),
    landMs: startsMs[land as number] ?? totalMs };
}


export function nativeCityPlayerBackstepTimeline(pack: NativeCityOrthoPack | null, facing: VillageFacing): NativeCityPlayerBackstepTimeline | null {
  const clip = pack ? nativeCityOrthoActionClip(pack, facing, "backstep")?.clip : null;
  if (!clip) return null;
  const { startsMs, totalMs } = nativeCityOrthoActionTiming(clip);
  const keys = clip.keys ?? {}, takeoff = keys.takeoff, land = keys.land;
  if (!Number.isInteger(takeoff) || !Number.isInteger(land) || !(totalMs > 0)) return null;
  const takeoffMs = startsMs[takeoff as number], landMs = startsMs[land as number];
  if (takeoffMs === undefined || landMs === undefined || !(landMs > takeoffMs)) return null;
  return { totalMs, takeoffMs, landMs, art: true };
}

/** Hand contact grows through takeoff, holds on the crown, then releases before the planted landing. */
export function nativeCityPlayerVaultSupportWeight(timeline: NativeCityPlayerVaultTimeline, ms: number): number {
  const steps = timeline.steps, spring = steps.find(step => step.travelPx > 0)?.atMs ?? 0;
  const overIndex = steps.findIndex(step => step.travelPx >= timeline.overPx);
  const over = steps[overIndex]?.atMs ?? spring, release = nativeCityPlayerVaultReleaseMs(timeline);
  const u = ms < over ? clamp01((ms - spring) / Math.max(1, over - spring))
    : 1 - clamp01((ms - release) / Math.max(1, timeline.landMs - release));
  return u * u * (3 - 2 * u);
}

/**
 * 시작부터 `elapsedMs` 까지 내디딘 평면 거리. `firstHit`: 이 휘두름 첫 접촉의 표 번호(연타 토막). `leadMs`: 내딛기 시작이 접촉보다
 * 앞서는 시간(휘두름 시작 안으로 줄인다).
 */
export function nativeCityPlayerLungeUnits(kind: NativeCityPlayerActionKind, hitsMs: readonly number[], elapsedMs: number, stepUnits: number,
  firstHit = 0, leadMs = NATIVE_CITY_COMBAT.player.actions[kind].lungeLeadMs): number {
  return simPlayerLungeUnits(kind, hitsMs, elapsedMs, stepUnits, firstHit, leadMs, easeOutCubic);
}


export type NativeCityPlayerContact = SimPlayerContact;
/** A swing step's outcome without the state (the standalone body keeps it). */
export type NativeCityPlayerActionStep = Omit<NativeCityPlayerSwingStep, "state">;
export type { NativeCityCancelBy };


export class NativeCityPlayerAction {
  /** On its own (no fight clock): the swing's state, stepped by the fight sim's rule. */
  private own: NativeCityPlayerSwingState = createNativeCityPlayerSwing();

  constructor(private readonly clock?: () => NativeCityPlayerSwingState) {}

  private get state(): NativeCityPlayerSwingState { return this.clock ? this.clock() : this.own; }

  get active(): boolean { return this.state.current !== null; }
  get kind(): NativeCityPlayerActionKind | null { return this.state.current?.kind ?? null; }
  get facing(): VillageFacing | null { return this.state.current?.facing ?? null; }
  get direction(): CityPoint | null { return this.state.current?.direction ?? null; }
  get attackId(): number { return nativeCityPlayerSwingAttackId(this.state); }
  get elapsedMs(): number { return this.state.current?.elapsedMs ?? 0; }
  get timeline(): NativeCityPlayerActionTimeline | null { return this.state.current?.timeline ?? null; }

  /**
   * 새 동작(혼자 쓰는 몸). `facing` 은 그려지는 방향, `direction` 은 평면 판정 방향, `stepUnits` 는 지금 투영의 한 보. `segment`: C 연타의
   * 몇 번째 토막(`combo` 만, 없으면 클립 통째).
   */
  start(kind: NativeCityPlayerActionKind, facing: VillageFacing, direction: CityPoint, stepUnits: number, pack: NativeCityOrthoPack | null,
    segment: number | null = null): number {
    // On its own there is no V key to hold: a V is a tap (it kicks as soon as it crouches — `player.actions.attack.charge`).
    this.own = startNativeCityPlayerSwing(this.own, { kind, facing, direction, stepUnits,
      timeline: nativeCityPlayerActionTimeline(pack, facing, kind, kind === "combo" ? segment : null), released: true });
    return this.own.serial;
  }

  cancel(): void { this.own = cancelNativeCityPlayerSwing(this.own); }


  markLanded(localIndex: number): void { this.own = markNativeCityPlayerSwingLanded(this.own, localIndex); }


  cancelAtMs(by: NativeCityCancelBy): number | null { return nativeCityPlayerSwingCancelAtMs(this.state, by); }

  /** The swing may be cut by `by` now. */
  cancellable(by: NativeCityCancelBy): boolean { return nativeCityPlayerSwingCancellable(this.state, by); }


  holdAt(ms: number, freezeMs = 0): void { this.own = holdNativeCityPlayerSwing(this.own, ms, freezeMs); }

  update(dtMs: number): NativeCityPlayerActionStep {
    const { state, ...step } = stepNativeCityPlayerSwing(this.own, dtMs, easeOutCubic);
    this.own = state;
    return step;
  }

  /**
   * 이번 프레임의 그림: 원화 프레임(+떨림), 없으면 null(호출자가 그 방향의 서 있는 프레임을 그린다) + 자리표시자 기울임.
   * `leanDeg` 는 화면 시계 방향 양수(오른쪽을 보면 앞으로 숙인다).
   */
  pose(pack: NativeCityOrthoPack | null): { readonly frame: ReturnType<typeof nativeCityOrthoActionFrame>; readonly leanDeg: number } | null {
    const action = this.state.current;
    if (!action) return null;
    const { warp } = action.timeline;
    const shown = Math.min(warp.art.at(-1) ?? 0, nativeCityWarpArtMs(warp, action.elapsedMs) + action.displaySkipMs);
    // An air move drawn from its own clip (`timeline.clip`), else the swing's kind. A look whose pack draws no air clip (a stock outfit's
    // duel clips over a body that has them) holds its own C / V clip on the move's contact in the air.
    const clip = action.timeline.clip;
    const frame = !action.timeline.art || !pack ? null : clip && !nativeCityOrthoActionClip(pack, action.facing, clip)
      ? nativeCityAirStandInFrame(pack, action.facing, action.kind, clip) : nativeCityOrthoActionFrame(pack, action.facing, clip ?? action.kind, shown);
    if (frame) return { frame, leanDeg: 0 };
    // Placeholder: lean into each contact over the lunge, ease back over 140 ms.
    const lead = Math.max(1, NATIVE_CITY_COMBAT.player.actions[action.kind].lungeLeadMs);
    let pulse = 0;
    for (const hitMs of action.timeline.hitsMs) {
      const t = action.elapsedMs - hitMs;
      pulse = Math.max(pulse, t < 0 ? clamp01(1 + t / lead) ** 2 : 1 - clamp01(t / 140));
    }
    const side = action.facing.endsWith("left") ? -1 : 1;
    return { frame: null, leanDeg: side * NATIVE_CITY_COMBAT.player.placeholderLeanDeg * pulse };
  }
}

/**
 * 쓰러지지 않은 한 방에 맞은 몸(2026-10-08).
 *
 * - 원화: 팩의 그 대각에 `hit` 클립이 있으면 한 번 돈다(젖힘 칸에서 그려진 떨림 `shake` 와 함께 멈췄다가 선 자세로 돌아온다).
 *   잠금은 `hitStunMs`. 클립이 잠금보다 길면 남은 꼬리는 서 있는 동안만 돌고, 걷거나 휘두르면 끊긴다(`cut`).
 * - 원화가 없으면(팩에 `hit` 없음) 옛 자리표시자: 서 있는 칸 + 절차 반응, 잠금 `hitStaggerMs`. 클립은 있는데 시트가 아직 오지 않았으면
 *   잠금은 원화 박자 그대로이고 그림만 서 있는 칸 + 절차 반응이 대신한다(`pose` 에 팩을 주지 않는다 — 2026-10-11).
 * - 방향은 맞은 순간 고정된다: 타격 축(때린 쪽이 그려진 방향)을 거슬러 때린 쪽을 보는 방향의 원화(정확한 8방향, 없으면 팩 해석기의
 *   폴백 — `nativeCityOrthoActionFacing`). 원화의 젖힘이 맞은 방향 반대로 간다.
 * - 잠금·끝의 규칙(시계)은 싸움 시뮬(`sim/cityFight`)의 것이다(`NativeCityFight` — `nativeCityFightHitTiming`·`stepNativeCityFightHit`). 대결 중에는
 *   진행자의 싸움 상태가 시계를 들고 이 몸은 그리기(방향·원화 칸·멈춤 동안의 떨림)만 한다.
 */
export interface NativeCityPlayerHitTimeline {
  /** 반응 전체 길이(원화 클립 길이, 자리표시자는 잠금과 같다). */
  readonly totalMs: number;
  /** 걷기·휘두르기가 막히는 시간(시작 칸부터). */
  readonly stunMs: number;
  readonly art: boolean;
  /** 반응이 시작하는 시각: 원화의 접촉 칸(`hitSequenceIndices[0]`) — 멈춤이 머리가 꺾인 칸을 붙든다. 자리표시자는 0. */
  readonly startMs: number;
  /** 그리는 클립: 보통의 `hit`, 가드가 깨진 반응 `guardBreak`(2026-10-17 — 그 방향에 없으면 `hit`). */
  readonly action: NativeCityHitReaction;
}

/**
 * `stunMs`: this blow's own lock (KUMA's slam, `kuma.strikes.slam.stunMs`); without it the default light lock. `reaction`: the
 * clip — a broken guard draws its own (`guardBreak`, as long as `guard.breakStunMs`) where the pack has it, else the plain `hit`.
 */
export function nativeCityPlayerHitTimeline(pack: NativeCityOrthoPack | null, facing: VillageFacing, stunMs?: number,
  reaction: NativeCityHitReaction = "hit"): NativeCityPlayerHitTimeline {
  for (const action of reaction === "guardBreak" ? ["guardBreak", "hit"] as const : ["hit"] as const) {
    const found = pack ? nativeCityOrthoActionClip(pack, facing, action) : null;
    if (!found) continue;
    const { totalMs, hitsMs } = nativeCityOrthoActionTiming(found.clip);
    if (totalMs > 0) return { ...nativeCityFightHitTiming({ totalMs, startMs: Math.min(totalMs, hitsMs[0] ?? 0) }, stunMs), art: true, action };
  }
  return { ...nativeCityFightHitTiming(null, stunMs), art: false, action: "hit" };
}

export class NativeCityPlayerHit {
  /** On its own (no fight clock): the lock's clock, stepped by the fight sim's rule. */
  private own: NativeCityFightHit | null = null;
  /**
   * What is drawn: the blow's facing and timeline; `frozenMs` the screen time spent before the fight clock first moved (the shared
   * freeze) — the drawn tremble plays through it on screen time.
   */
  private shown: { readonly facing: VillageFacing; readonly timeline: NativeCityPlayerHitTimeline; frozenMs: number; released: boolean } | null = null;

  /**
   * `clock`: the fight's hit lock (`NativeCityFightState.hit`, read live) — the controller starts, cuts and ends it in the world and this
   * body only draws it. Without one (a body on its own) it keeps its own clock by the same rule (`start` / `update` / `cut` / `cancel`).
   */
  constructor(private readonly clock?: () => NativeCityFightHit | null) {}

  private get lock(): NativeCityFightHit | null { return this.clock ? this.clock() : this.own; }

  /** 반응이 아직 그려진다(잠금 뒤 꼬리 포함). */
  get active(): boolean { return this.shown !== null && this.lock !== null; }
  /** 걷기·휘두르기가 막혀 있다. */
  get locksInput(): boolean { return nativeCityFightHitLocks(this.lock); }
  get facing(): VillageFacing | null { return this.active ? this.shown!.facing : null; }
  /** The reaction's clock (from `startMs`, fight time). */
  get elapsedMs(): number { return this.active ? this.lock!.elapsedMs : 0; }
  get timeline(): NativeCityPlayerHitTimeline | null { return this.active ? this.shown!.timeline : null; }
  /** The clip being drawn (its sheets' fight group). */
  get action(): NativeCityHitReaction { return this.shown?.timeline.action ?? "hit"; }

  /**
   * 새 반응(맞을 때마다 처음부터). `pack` 이 null 이면(팩 없음) 자리표시자. `stunMs` 는 이 한 방의 잠금(없으면 기본). 싸움 시계가
   * 있으면 그 시계는 진행자가 같은 박자(반환값)로 world 에서 시작한다.
   */
  start(facing: VillageFacing, pack: NativeCityOrthoPack | null, stunMs?: number, reaction: NativeCityHitReaction = "hit"): NativeCityPlayerHitTimeline {
    const timeline = nativeCityPlayerHitTimeline(pack, facing, stunMs, reaction);
    this.shown = { facing, timeline, frozenMs: 0, released: false };
    if (!this.clock) this.own = nativeCityFightHitClock(timeline);
    return timeline;
  }

  /**
   * 같은 공격의 다음 접촉(동작당 한 번 움찔, 2026-10-18): 반응은 처음부터 다시 그리지 않고 이어 간다 — 이번 멈춤 동안 그린 떨림만 다시
   * 돈다(싸움 시계의 잠금은 world 가 늘린다, `continueNativeCityFightHit`).
   */
  retremble(): void {
    if (!this.shown) return;
    this.shown.frozenMs = 0;
    this.shown.released = false;
  }

  /** 싸움 시계로 흐른다(히트스톱 동안 0 — 맞은 칸이 멈춰 있다). `screenDtMs` 는 멈춤 동안의 떨림 시계. 싸움 시계는 world 가 흘린다. */
  update(dtMs: number, screenDtMs = dtMs): void {
    const shown = this.shown;
    if (!shown || !this.lock) return;
    const dt = Number.isFinite(dtMs) ? Math.max(0, dtMs) : 0;
    if (dt > 0) shown.released = true;
    else if (!shown.released) shown.frozenMs += Number.isFinite(screenDtMs) ? Math.max(0, screenDtMs) : 0;
    if (!this.clock) this.own = stepNativeCityFightHit(this.own!, dt);
    if (!this.lock) this.shown = null;
  }

  /** 잠금이 풀린 뒤 걷거나 휘두르면 남은 꼬리를 끊는다. 잠금 중에는 아무것도 하지 않는다(싸움 시계는 `cutNativeCityFightHit`). */
  cut(): void { if (!this.locksInput) { this.own = null; this.shown = null; } }

  /** 쓰러짐처럼 반응을 통째로 덮는 일(싸움 시계는 world 연산이 끝낸다 — 여기는 그리기를 멈춘다). */
  cancel(): void { this.own = null; this.shown = null; }

  /** 이번 프레임의 원화 칸(+떨림, 반전 포함). 자리표시자거나 반응이 없으면 null. */
  pose(pack: NativeCityOrthoPack | null): NativeCityOrthoActionFrame | null {
    const shown = this.shown, lock = this.lock;
    if (!shown?.timeline.art || !lock || !pack) return null;
    return nativeCityOrthoActionFrame(pack, shown.facing, shown.timeline.action, lock.elapsedMs);
  }

  /**
   * 이번 프레임의 떨림(화면 px). 원화의 떨림 곡선(모양·감쇠·좌우 반전)은 그대로 두고, 그 클립에서 가장 큰 한 칸이
   * `peakScreenPx` 가 되게 크기만 맞춘다 — 몸 640px 기준 몇 px 는 마을 몸(75~130px)에서 1px 도 안 됐다.
   */
  shakeScreenPx(pack: NativeCityOrthoPack | null, peakScreenPx: number): readonly [number, number] {
    const hit = this.shown, pose = this.pose(pack), found = pose && pack && hit ? nativeCityOrthoActionClip(pack, hit.facing, hit.timeline.action) : null;
    const peak = found ? nativeCityOrthoShakePeak(found.clip) : 0;
    if (!hit || !pose || !pack || !(peak > 0) || !(peakScreenPx > 0)) return [0, 0];
    const k = peakScreenPx / peak;
    // Inside the freeze the drawn tremble runs on screen time over the held frame; a long freeze has spent it, so the rest is
    // skipped once the clip moves again (`player.hitShakeSkipFreezeMs`).
    if (!hit.released) {
      const shake = nativeCityOrthoActionFrame(pack, hit.facing, hit.timeline.action, hit.timeline.startMs + hit.frozenMs)?.shake ?? [0, 0];
      return [shake[0] * k, shake[1] * k];
    }
    if (hit.frozenMs >= NATIVE_CITY_COMBAT.player.hitShakeSkipFreezeMs) return [0, 0];
    // A short freeze: the tremble goes on from where the freeze left it (the clip's clock + the screen time it held), not from its first
    const lock = this.lock, on = lock ? nativeCityOrthoActionFrame(pack, hit.facing, hit.timeline.action, lock.elapsedMs + hit.frozenMs) : null;
    const shake = on?.shake ?? [0, 0];
    return [shake[0] * k, shake[1] * k];
  }
}

/**
 * HP 가 0 이 되어 쓰러진 몸(2026-10-08 KO 원화).
 *
 * - 원화: 팩의 그 대각에 `ko` 클립이 있으면 쓰러짐(`player.ko.leadSkipArtMs` → `lieSequenceIndex` 앞 — 서 있는 앞 칸은 건너뛴다)을 `player.ko.fallRate` 배로 돌고(바닥 떨림 칸만 그린 시간 그대로) — 바닥에 닿는 칸(`hitSequenceIndices[0]`)에서
 *   그려진 떨림과 함께 한 번 `landed` — 누운 칸을 `player.ko.lieMs` 붙든 뒤, 쓰러짐 칸들을 거꾸로 `getUpSpeed` 배 빠르게 돌아
 *   일어선다(같은 칸이 이어진 멈춤은 한 박자로 접는다). 시계는 싸움 시계다(히트스톱·슬로모를 따른다).
 * - 원화가 없으면(팩에 `ko` 없음) 자리표시자: 길이 `player.ko.downMs`, 그림은 호출자의 절차 기울임. 시트가 아직 오지 않았으면 박자는
 *   원화의 것이고 호출자의 절차 기울임이 그 박자(바닥에 닿음·일어남)를 따라 대신 그린다.
 * - 방향은 쓰러지는 순간 고정된다(맞은 몸과 같은 규칙 — 때린 쪽을 보고, 원화는 타격 축을 따라 뒤로 넘어진다).
 * - 시계(바닥에 닿음·다시 섬)의 규칙은 싸움 시뮬(`sim/cityFight`)의 것이다(`NativeCityFight` — `stepNativeCityFightKo`). 대결 중에는 진행자의 싸움
 *   상태가 시계를 들고(누가 쓰러뜨렸나·패배 카드도) 이 몸은 원화 박자(쓰러짐 빨리 감기·일어나기 칸)로 그리기만 한다.
 */
export interface NativeCityPlayerKoTimeline {
  readonly art: boolean;
  /** 바닥에 닿는 시각(먼지·쿵·소리). 자리표시자는 기울임이 다 넘어간 `fallMs`. */
  readonly impactMs: number;
  /** 누운 칸이 시작하는 시각(쓰러짐 길이). */
  readonly lieAtMs: number;
  /** 일어나기 시작하는 시각(`lieAtMs + lieMs`). */
  readonly riseAtMs: number;
  /** 다시 섰다(HP 가 찬다). */
  readonly totalMs: number;
  /** 원화 누운 칸의 시퀀스 번호. */
  readonly lieIndex: number;
  /** 일어나기: 쓰러짐 칸을 거꾸로(누운 칸 바로 앞 → 0), 박자는 `getUpSpeed` 로 나눴다. */
  readonly getUp: readonly { readonly frame: number; readonly durationMs: number }[];
  /**
   * 쓰러짐의 빨리 감기(`player.ko.fallRate`): 바닥에 닿기 전과 닿은 뒤 눕기까지는 `rate` 배로, 바닥에 닿아 같은 칸을 붙든
   * 떨림(`impactArtMs` ~ `holdEndArtMs`)만 그린 시간 그대로. 위 시각들(`impactMs`·`lieAtMs`…)은 모두 감긴 뒤의 시각이다.
   * 원화 시각은 `nativeCityPlayerKoArtMs`. 자리표시자는 null. `skipArtMs`: 쓰러짐은 원화의 이 시각부터 시작한다
   * (`player.ko.leadSkipArtMs` — 서 있는 앞 칸들을 건너뛰고 첫 넘어지는 칸부터, 바닥에 닿는 칸을 넘지 않는다).
   */
  readonly fall: { readonly rate: number; readonly impactArtMs: number; readonly holdEndArtMs: number; readonly holdEndMs: number;
    readonly skipArtMs: number } | null;
  /**
   * A THROWN knock-out (KUMA's grab, 2026-10-14 — `NativeCityKoLanding`): he flies until `impactMs` (drawn by the launch's flight cell, not
   * this clip) and lands into the fall from its ground-impact step. Null: an ordinary fall from standing.
   */
  readonly thrown: { readonly flightMs: number } | null;
}

/** 쓰러진 지 `elapsedMs`(싸움 시계)일 때 그릴 원화 시각(누운 칸 전까지 — `fall` 의 빨리 감기를 되돌린다). */
export function nativeCityPlayerKoArtMs(timeline: NativeCityPlayerKoTimeline, elapsedMs: number): number {
  const fall = timeline.fall, t = Math.max(0, elapsedMs);
  if (!fall) return t;
  // (A thrown knock-out starts at the ground impact itself: its flight holds that step.)
  if (t <= timeline.impactMs) return fall.skipArtMs + Math.min(t * fall.rate, fall.impactArtMs - fall.skipArtMs);
  if (t <= fall.holdEndMs) return fall.impactArtMs + (t - timeline.impactMs);
  return fall.holdEndArtMs + (t - fall.holdEndMs) * fall.rate;
}

export function nativeCityPlayerKoTimeline(pack: NativeCityOrthoPack | null, facing: VillageFacing,
  landing?: { readonly flightMs: number; readonly lieMs: number }): NativeCityPlayerKoTimeline {
  const tuning = NATIVE_CITY_COMBAT.player.ko;
  const flightMs = landing ? Math.max(1, landing.flightMs) : 0, lieMs = landing ? Math.max(0, landing.lieMs) : tuning.lieMs;
  const found = pack ? nativeCityOrthoActionClip(pack, facing, "ko") : null;
  const steps = found?.clip.sequence ?? [];
  if (found && steps.length > 1) {
    const { startsMs } = nativeCityOrthoActionTiming(found.clip);
    const authored = found.clip.lieSequenceIndex;
    const lieIndex = Number.isInteger(authored) && authored! > 0 && authored! < steps.length ? authored! : steps.length - 1;
    const lieArtMs = startsMs[lieIndex]!;
    const authoredGround = nativeCityOrthoHitSteps(found.clip)[0];
    const ground = authoredGround !== undefined && authoredGround <= lieIndex ? authoredGround : lieIndex;
    const impactArtMs = startsMs[ground] ?? lieArtMs;
    // The held ground frames (the impact step's frame repeated — its tremble) keep their drawn time; the rest of the fall is sped up.
    let holdEnd = ground;
    while (holdEnd < lieIndex && steps[holdEnd]!.frame === steps[ground]!.frame) holdEnd++;
    const holdEndArtMs = startsMs[holdEnd] ?? lieArtMs, rate = Math.max(0.1, tuning.fallRate);
    // He goes down on the blow: the upright lead of the drawn fall is skipped (`leadSkipArtMs`, never past the ground impact).
    // Thrown: the whole fall before the ground impact is skipped — the flight is his (`thrown`).
    const skipArtMs = landing ? impactArtMs : Math.max(0, Math.min(impactArtMs, tuning.leadSkipArtMs ?? 0));
    const impactMs = landing ? flightMs : (impactArtMs - skipArtMs) / rate, holdEndMs = impactMs + (holdEndArtMs - impactArtMs);
    const lieAtMs = holdEndMs + (lieArtMs - holdEndArtMs) / rate;
    const speed = Math.max(0.1, tuning.getUpSpeed), getUp: { frame: number; durationMs: number }[] = [];
    // Back from the step before the lying one to the first; a run of one held frame (the impact's tremble) is one beat.
    let last = steps[lieIndex]!.frame;
    for (let index = lieIndex - 1; index >= 0; index--) {
      const step = steps[index]!;
      if (step.frame === last) continue;
      getUp.push({ frame: step.frame, durationMs: Math.max(0, step.durationMs) / speed });
      last = step.frame;
    }
    const riseAtMs = lieAtMs + lieMs;
    return { art: true, impactMs, lieAtMs, riseAtMs, totalMs: riseAtMs + stepsTotal(getUp), lieIndex, getUp,
      fall: { rate, impactArtMs, holdEndArtMs, holdEndMs, skipArtMs }, thrown: landing ? { flightMs } : null };
  }
  if (landing) {
    // The procedural stand-in of a thrown knock-out: down on the landing, `lieMs`, then the tilt's rise.
    return { art: false, impactMs: flightMs, lieAtMs: flightMs, riseAtMs: flightMs + lieMs, totalMs: flightMs + lieMs + tuning.riseMs, lieIndex: 0,
      getUp: [], fall: null, thrown: { flightMs } };
  }
  return { ...nativeCityPlaceholderKoTiming(), lieIndex: 0, getUp: [], fall: null, thrown: null };
}

export class NativeCityPlayerKo {
  /** On its own (no fight clock): the KO's clock, stepped by the fight sim's rule. */
  private own: NativeCityFightKoClock | null = null;
  /** What is drawn: the facing he fell at and the drawn timeline (the fall's warp, the get-up steps). */
  private shown: { readonly facing: VillageFacing; readonly timeline: NativeCityPlayerKoTimeline; readonly contact?: "stone" } | null = null;

  /**
   * `clock`: the fight's knock-out (`NativeCityFightState.ko`, read live) — the controller starts, steps and ends it in the world and this
   * body only draws it (`cancel` when he stands). Without one (a body on its own) it keeps its own clock by the same rule (`update`).
   */
  constructor(private readonly clock?: () => NativeCityFightKoClock | null) {}

  /** Fight ms since the blow (the fight sim's clock, or its own). */
  private get clockMs(): number { return (this.clock ? this.clock() : this.own)?.elapsedMs ?? 0; }

  get active(): boolean { return this.shown !== null; }
  /** 원화 KO 가 돌고 있다(절차 기울임·어둡게 하기는 쉰다). */
  get drawn(): boolean { return this.shown?.timeline.art === true; }
  get facing(): VillageFacing | null { return this.shown?.facing ?? null; }
  get elapsedMs(): number { return this.shown ? this.clockMs : 0; }
  get timeline(): NativeCityPlayerKoTimeline | null { return this.shown?.timeline ?? null; }
  get landingContact(): "stone" | undefined { return this.shown?.contact; }
  /** A thrown knock-out still in its flight (before the ground impact): the launch's flight cell draws him, not this clip. */
  get flying(): boolean { const ko = this.shown; return ko?.timeline.thrown != null && this.clockMs < ko.timeline.impactMs; }
  /** Registered body's floor centre in world pixels; unregistered views keep the directional fallback. */
  groundOffset(pack: NativeCityOrthoPack | null, bodyPx: number): readonly [number, number] | null {
    const found = this.shown && pack ? nativeCityOrthoActionClip(pack, this.shown.facing, "ko") : null;
    if (!found?.clip.lieOffset) return null;
    const frame = found.clip.sequence?.[this.shown!.timeline.lieIndex]?.frame;
    if (frame === undefined || !found.clip.origins[frame]?.groundContacts?.length) return null;
    return [found.clip.lieOffset[0] * (found.flipX ? -1 : 1) * bodyPx / found.clip.bodyHeight, 0];
  }
  get phase(): "fall" | "lie" | "getUp" | null {
    const ko = this.shown;
    if (!ko) return null;
    const t = this.clockMs;
    return t < ko.timeline.lieAtMs ? "fall" : t < ko.timeline.riseAtMs ? "lie" : "getUp";
  }

  /**
   * 쓰러진다. `pack` 이 null 이면(팩 없음) 자리표시자. 싸움 시계가 있으면 그 시계는 진행자가 같은 박자로 world 에서 시작한다. `landing`: 던져진
   * 넉아웃(쿠마의 잡기) — 날아간 뒤 땅 충격 칸부터.
   */
  start(facing: VillageFacing, pack: NativeCityOrthoPack | null, landing?: NativeCityKoLanding): NativeCityPlayerKoTimeline {
    const timeline = nativeCityPlayerKoTimeline(pack, facing, landing);
    this.shown = { facing, timeline, ...(landing?.contact ? { contact: landing.contact } : {}) };
    if (!this.clock) this.own = nativeCityFightKoClock(timeline);
    return timeline;
  }

  /**
   * 싸움 시계로 흐른다. `landed`: 이번 갱신에 원화의 몸이 바닥에 닿았다(한 번). `done`: 다시 섰다. 싸움 시계가 있으면 world 가
   * 흘리고(`stepNativeCityFight` 의 `koLanded`·`stood`) 여기는 아무것도 하지 않는다.
   */
  update(dtMs: number): { readonly landed: boolean; readonly done: boolean } {
    if (this.clock || !this.own) return { landed: false, done: false };
    const step = stepNativeCityFightKo(this.own, dtMs);
    this.own = step.ko;
    return { landed: step.landed, done: step.done };
  }

  cancel(): void { this.own = null; this.shown = null; }

  /** 이번 프레임의 원화 칸(+쓰러짐의 떨림, 반전 포함). 자리표시자거나 쓰러져 있지 않으면 null. */
  pose(pack: NativeCityOrthoPack | null): { readonly frame: ReturnType<typeof nativeCityOrthoClipCell>; readonly shake: readonly [number, number] } | null {
    const ko = this.shown;
    const found = ko?.timeline.art && pack ? nativeCityOrthoActionClip(pack, ko.facing, "ko") : null;
    if (!ko || !found) return null;
    const { timeline } = ko, t = this.clockMs;
    if (timeline.thrown && t < timeline.impactMs) {
      if (ko.contact !== "stone" || !timeline.fall) return null;
      // The same fall cels lean back, lift the feet and lower the back, ending exactly on the ground-contact cel.
      const end = timeline.fall.impactArtMs, from = Math.min(end, NATIVE_CITY_COMBAT.player.ko.leadSkipArtMs);
      const fall = nativeCityOrthoActionFrame(pack!, ko.facing, "ko", from + (end - from) * clamp01(t / timeline.impactMs));
      return fall ? { frame: fall.frame, shake: [0, 0] } : null;
    }
    if (t < timeline.lieAtMs) {
      const fall = nativeCityOrthoActionFrame(pack!, ko.facing, "ko", nativeCityPlayerKoArtMs(timeline, t));
      return fall ? { frame: fall.frame, shake: fall.shake } : null;
    }
    let frame = found.clip.sequence?.[timeline.lieIndex]?.frame ?? 0;
    if (t >= timeline.riseAtMs) frame = timeline.getUp[stepIndexAt(timeline.getUp, t - timeline.riseAtMs, "hold")]?.frame ?? frame;
    return { frame: nativeCityOrthoClipCell(found.clip, frame, found.flipX), shake: [0, 0] };
  }

  /** 쓰러짐의 떨림(화면 px): 원화 곡선을 그 클립의 가장 큰 한 칸이 `peakScreenPx` 가 되게 맞춘다(`NativeCityPlayerHit` 와 같다). */
  shakeScreenPx(pack: NativeCityOrthoPack | null, peakScreenPx: number): readonly [number, number] {
    const ko = this.shown, pose = this.pose(pack), found = pose && pack && ko ? nativeCityOrthoActionClip(pack, ko.facing, "ko") : null;
    const peak = found ? nativeCityOrthoShakePeak(found.clip) : 0;
    if (!pose || !(peak > 0) || !(peakScreenPx > 0)) return [0, 0];
    return [pose.shake[0] * peakScreenPx / peak, pose.shake[1] * peakScreenPx / peak];
  }

  /** 누워 있는 정도(0..1): 누운 칸에서 150ms 에 걸쳐 1, 일어나는 동안 0 으로. 원화 KO 의 어둡게 하기 가중치. */
  lieShade(): number {
    const ko = this.shown;
    if (!ko?.timeline.art) return 0;
    const { lieAtMs, riseAtMs, totalMs } = ko.timeline, t = this.clockMs;
    if (t < lieAtMs) return 0;
    if (t < riseAtMs) return clamp01((t - lieAtMs) / 150);
    return 1 - clamp01((t - riseAtMs) / Math.max(1, totalMs - riseAtMs));
  }
}

/** 클립 떨림 곡선의 가장 큰 한 칸(몸 px, 길이). 떨림이 없으면 0. */
export function nativeCityOrthoShakePeak(clip: { readonly sequence?: readonly { readonly shake?: readonly number[] }[] }): number {
  return Math.max(0, ...(clip.sequence ?? []).map(step => Math.hypot(step.shake?.[0] ?? 0, step.shake?.[1] ?? 0)));
}
