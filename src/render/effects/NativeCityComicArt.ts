import type { NativeCityFxElement, NativeCityFxProject } from "./NativeCityCombatFx";
import { NATIVE_CITY_COMBAT } from "../../sim/cityFight/NativeCityCombatTuning";
import type { DuelComicArtCommand } from "./DuelComicArt";
import type { HypeRank, KeyedHypeContact } from "./HypeImpactFx";
import { COMBAT_BLOCK_ART_WIDTH, COMBAT_IMPACT_RECIPES, combatContactArt, combatImpactGrade } from "./CombatImpactRecipe";
import { NATIVE_CITY_EXCHANGE_COLORS, type NativeCityExchangeCue, type NativeCityExchangeFxKind } from "./NativeCityExchangeFx";
import { nativeCityKumaGradeColors } from "./NativeCityKumaGrade";
import { COMIC_IMPACT_EXPOSURES, type ComicImpactArtKind } from "../../assets/ComicImpactArtCatalog";
import type { CityPoint } from "../../world/NativeCityDefinition";
import { easeOutCubic } from "../art/easing";


const EXCHANGE_ART: Partial<Record<NativeCityExchangeFxKind, { readonly kind: ComicImpactArtKind; readonly width: number;
  readonly rank: HypeRank; readonly holdMs?: number; readonly risePx?: number; readonly tint?: (cue: NativeCityExchangeCue) => number }>> = {
  guardSpark: { kind: "block", width: COMBAT_BLOCK_ART_WIDTH.block.light, rank: 0 },
  clashSpark: { kind: "clang", width: COMBAT_BLOCK_ART_WIDTH.clang.heavy, rank: 1 },
  eyeGlint: { kind: "glint", width: .7, rank: 1, tint: () => NATIVE_CITY_EXCHANGE_COLORS.hotGold },
  guardGlint: { kind: "twinkle", width: .45, rank: 0, risePx: 18, tint: () => NATIVE_CITY_EXCHANGE_COLORS.pearl },
  windupGlint: { kind: "twinkle", width: .6, rank: 1, holdMs: 250, tint: cue => nativeCityKumaGradeColors(cue.grade).glint },
};
/** A net cinch's strike cel: this share of a plain hit's (the net itself carries the squeeze). */
const NETTED_ART_SHARE = 0.6;

const BODY_SIZED: ReadonlySet<NativeCityExchangeFxKind> = new Set(["guardSpark", "clashSpark"]);

/**
 * The light layer for the contacts that have no comic art (2026-10-15 쿠마전): the shattered guard "깨짐!" and the ground slams.
 * Clean hits, the parry, the stopped blows and the tells come through `nativeCityComicArtCommand` instead (2026-10-17).
 */
export function nativeCityHypeContact(e: NativeCityFxElement, screenMs: number, project: NativeCityFxProject): KeyedHypeContact | null {
  if (e.cue.reducedMotion) return null;
  const ageMs = screenMs - e.bornScreenMs;
  const angleOf = (from: CityPoint, d: CityPoint) => {
    const [x, y] = project(from), [dx, dy] = project([from[0] + d[0], from[1] + d[1]]);
    return Math.hypot(dx - x, dy - y) < 1e-6 ? 0 : Math.atan2(dy - y, dx - x);
  };
  const keyed = (c: Omit<KeyedHypeContact, "key">): KeyedHypeContact => ({ ...c, key: `${c.seed}:${c.kind}:${Math.round(c.x)}:${Math.round(c.y)}` });
  if (e.kind === "slam") {
    const cue = e.cue, [x, y] = project(cue.center), step = Math.max(1e-6, cue.stepUnits);
    const [rx] = project([cue.center[0] + step, cue.center[1]]), [, ry] = project([cue.center[0], cue.center[1] + step]);
    const squash = Math.abs(rx - x) < 1e-6 ? undefined : Math.abs(ry - y) / Math.abs(rx - x);
    return keyed({ kind: "slam", rank: cue.noAura ? 1 : 2, x, y, bodyPx: cue.bodyPx, angle: -Math.PI / 2, ageMs, holdMs: 0, seed: cue.seed,
      ...(squash === undefined ? {} : { squash }), ...(cue.hit ? {} : { muted: true }) });
  }
  if (e.kind !== "exchange" || e.cue.kind !== "guardShatter") return null;
  const cue = e.cue, [x, y] = project(cue.feet);
  return keyed({ kind: "shatter", rank: 1, x: x + (cue.offsetPx?.[0] ?? 0), y: y - cue.height * cue.bodyPx + (cue.offsetPx?.[1] ?? 0),
    bodyPx: cue.bodyPx, angle: angleOf(cue.feet, cue.blow ?? cue.direction), ageMs, holdMs: 0, seed: cue.seed });
}

/** Project the same confirmed contacts as the fallback recipe. A missed swing has no element. */
export function nativeCityComicArtCommand(e: NativeCityFxElement, screenMs: number, project: NativeCityFxProject): DuelComicArtCommand | null {
  if (e.kind === "slam" || e.cue.reducedMotion) return null;
  const c = e.cue;
  if (e.kind === "exchange") {
    const cue = e.cue, [x0, y0] = project(cue.feet);
    const x = x0 + (cue.offsetPx?.[0] ?? 0), y = y0 - cue.height * cue.bodyPx + (cue.offsetPx?.[1] ?? 0), ageMs = screenMs - e.bornScreenMs;
    if (cue.kind === "parryRingFlash") {
      const [dx, dy] = project([cue.feet[0] + cue.direction[0], cue.feet[1] + cue.direction[1]]);
      const a = Math.atan2(dy - y0, dx - x0), flipX = Math.cos(a) < 0, parry = COMBAT_IMPACT_RECIPES.parry;
      return { kind: parry.art, x, y, width: cue.bodyPx * parry.artWidth, ageMs, holdMs: 0, angle: a - (flipX ? Math.PI : 0), flipX,
        rank: parry.light, bodyPx: cue.bodyPx, seed: cue.seed };
    }
    const spec = EXCHANGE_ART[cue.kind];
    if (!spec) return null;
    // The guards sit on the blow (attacker → defender, `blow`); the tells only face his way.
    const toward = cue.blow ?? cue.direction, [dx, dy] = project([cue.feet[0] + toward[0], cue.feet[1] + toward[1]]);
    const tell = !BODY_SIZED.has(cue.kind), a = Math.hypot(dx - x0, dy - y0) < 1e-6 ? 0 : Math.atan2(dy - y0, dx - x0);
    const flipX = Math.cos(a) < 0, sample = cue.scale * NATIVE_CITY_COMBAT.exchangeFx.sampleBodyPx;
    const t = COMIC_IMPACT_EXPOSURES[spec.kind], life = Math.max(t.leadMs + t.peakMs, spec.holdMs ?? 0) + t.tailMs.reduce((s, d) => s + d, 0);
    const rise = (spec.risePx ?? 0) * cue.scale * easeOutCubic(Math.min(1, ageMs / life));
    return { kind: spec.kind, x, y: y - rise, width: (tell ? sample : cue.bodyPx) * spec.width, ageMs, holdMs: spec.holdMs ?? 0,
      angle: tell ? 0 : a - (flipX ? Math.PI : 0), flipX, rank: spec.rank, bodyPx: cue.bodyPx, seed: cue.seed,
      ...(spec.tint ? { tint: spec.tint(cue) } : {}) };
  }
  const hit = e.cue;
  // A squeeze of KUMA's hug draws only its compression ring (`squeezed`, 2026-10-19 — one picture on the body).
  if (hit.dustOnly || hit.squeezed) return null;
  const [x, y] = project(hit.victim), [dx, dy] = project([hit.victim[0] + hit.direction[0], hit.victim[1] + hit.direction[1]]);
  const a = Math.atan2(dy - y, dx - x), flipX = Math.cos(a) < 0;
  if (hit.armored || hit.guarded) {
    // A stopped blow (iron armour / the iron ball "텅!", a raised guard "막!"): the drawn clang / block, held through the contact freeze
    // like a clean hit's peak. The light layer keeps only its core and sparks (`HypeContact.drawn`).
    const kind = hit.armored ? "clang" : "block", size = COMBAT_BLOCK_ART_WIDTH[kind][hit.tier === "light" ? "light" : "heavy"];
    return { kind, x: x - Math.cos(a) * (hit.contactInset ?? NATIVE_CITY_COMBAT.feel.fx.contactInset) * c.bodyPx, y: y - hit.contactHeight * c.bodyPx,
      width: hit.bodyPx * size, ageMs: screenMs - e.bornScreenMs, holdMs: hit.freezeMs ?? 0, angle: a - (flipX ? Math.PI : 0), flipX,
      rank: hit.armored && hit.tier === "light" ? 0 : 1, bodyPx: hit.bodyPx, seed: hit.seed };
  }
  if (hit.netted) {
    // 터지고, 인과 관계가 잘 보여야" — with no cel the cinches read as nothing happening to KUMA).
    return { kind: "strike", x: x - Math.cos(a) * (hit.contactInset ?? NATIVE_CITY_COMBAT.feel.fx.contactInset) * c.bodyPx, y: y - hit.contactHeight * c.bodyPx,
      width: hit.bodyPx * COMBAT_IMPACT_RECIPES.light.artWidth * NETTED_ART_SHARE, ageMs: screenMs - e.bornScreenMs, holdMs: hit.freezeMs ?? 0,
      angle: a - (flipX ? Math.PI : 0), flipX, rank: 0, bodyPx: hit.bodyPx, seed: hit.seed };
  }
  // The shared impact recipe (`CombatImpactRecipe`): the tier's grade picks the art, its width and the light layer's rank.
  const grade = combatImpactGrade(hit.tier), { kind, widthPerBody: size } = combatContactArt(grade, hit.weaponKind === "sharp");
  // The spent accent budget (`emphasis: false`) keeps the hit but steps the light layer down one rank.
  const rank = Math.max(0, COMBAT_IMPACT_RECIPES[grade].light - (hit.emphasis === false ? 1 : 0)) as HypeRank;
  return { kind, x: x - Math.cos(a) * (hit.contactInset ?? NATIVE_CITY_COMBAT.feel.fx.contactInset) * c.bodyPx, y: y - hit.contactHeight * c.bodyPx,
    width: hit.bodyPx * (hit.victimId === "player" ? COMBAT_IMPACT_RECIPES.struck.artWidth : size) * (hit.emphasis === false ? .8 : 1),
    ageMs: screenMs - e.bornScreenMs, holdMs: hit.freezeMs ?? 0, angle: a - (flipX ? Math.PI : 0), flipX,
    rank, bodyPx: hit.bodyPx, seed: hit.seed, ...(hit.victimId === "player" ? { hurt: true } : {}),
    // Its held peak steps aside after its own beat: the struck pose (who hit with what) reads through the freeze (`COMIC_IMPACT_CLEAR_HOLD`).
    clearHold: true,
    // The counter hit's light is pearl, not the hit's gold (2026-10-19 신호 정리: pearl / white = the white grade — the counter is the white
    // swing's answer; gold = the gold grade only).
    ...(hit.victimId !== "player" && hit.tier === "counter" ? { tone: "pearl" as const } : {}) };
}
