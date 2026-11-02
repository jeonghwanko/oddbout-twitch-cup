import tuning from "../../world/native-city-combat.json";
import type { DuelImpactTier } from "../duel/DuelImpact";
import type { DuelHpKnockTuning } from "../duel/DuelKnockback";

/**
 * 마을 1:1 대결 수치의 형태와 그 SSOT(`src/world/native-city-combat.json` → `NATIVE_CITY_COMBAT`). 규칙(sim)·연출(render)이 모두 이 표를
 * 읽는다. 2026-10-13 `NativeCityMelee` 에서 떼어 냈다 — 그 파일은 근접 판정 규칙만 남는다.
 */
export type NativeCityMeleeTier = "light" | "heavy";

/** C (`combo`), V (`attack`) and the double-tap toward the opponent (`dashAttack`, the sliding tackle — 2026-10-12). */
export type NativeCityPlayerActionKind = "attack" | "combo" | "dashAttack";
/**
 * slam, the full 4-swipe combo, the fast combo (its first two swipes, 2026-10-09 traditional exchange), the dash, the grab (출입 금지
 * 잡기, 2026-10-14 — `kuma.grab`), and the summon cast (2026-10-20 — `KumaTuning.summon`: a planted cast whose release puts a summoned object
 * on the stage, `CityFightSummons`; no contact of its own).
 */
export type NativeCityKumaActionKind = "slam" | "combo" | "fast" | "dash" | "grab" | "summon";
/**
 * The triangle (`triangle`, 2026-10-14): the class of each KUMA-type action — white (Z answers it), gold (X answers it, a block is crushed),
 * red (the grab: cut its windup or be out of reach).
 */
export type NativeCityKumaGrade = "white" | "gold" | "red";

export type NativeCityKumaBestAnswer = "counter" | "evade" | "cut";

export type NativeCityImpactTier = DuelImpactTier;
/** `HIT_STOP_BY_TIER` 의 키(렌더 표) — 이 파일은 렌더를 가져오지 않아 이름만 둔다. */
export type NativeCityHitStopKey = "light" | "heavy" | "dash" | "finisher" | "counter";

export interface NativeCityFeelTier {
  readonly hitStop: NativeCityHitStopKey;
  readonly hitStopScale: number;
  readonly shakePx: number;
  readonly shakeMs: number;
  readonly fxScale: number;
}

export interface NativeCityKumaStrikeTuning {
  readonly reachExtraStrides: number;
  readonly knockbackStrides: number;
  /**
   * The push of the swing's LAST contact (strides; absent: `knockbackStrides`) — 2026-10-10 3단계: his string ends on a shove that opens
   * the space between them (the earlier swipes keep their small push so the string stays in reach).
   */
  readonly lastKnockbackStrides?: number;

  readonly stunMs?: number;

  readonly invulnerableMs: number;
}

/** 쿠마 균형(`native-city-combat.json` poise). */
export interface NativeCityPoiseTuning {
  readonly max: number;
  readonly drain: Readonly<Record<NativeCityPlayerActionKind, readonly number[]>>;
  readonly armorScale: number;
  readonly armorDamageScale: number;
  readonly armorFloor: number;
  readonly counterScale: number;
  readonly regenDelayMs: number;
  readonly regenPerSec: number;
  readonly break: {
    readonly damageScale: number;
    readonly knockbackScale: number;
    readonly framesBeforeRecoil: number;
    readonly frameMs: number;
    readonly holdMs: number;
    readonly staggerMs: number;
    readonly staggerFrameMs: number;
    readonly recoverFrameMs: number;
    /** The hit clip's step the break holds through its stagger (2026-10-22, moved from `exchangeFx.rig.kuma` — it sets the break's length). */
    readonly groggyFrame: number;
  };
}

export interface NativeCityExchangeTuning {
  readonly counter: { readonly afterWhiffOnly: boolean; readonly cooldownMs: number; readonly chainHitStop: "base" | "counter" };
  /** |screen dy| < slope·|dx| counts as horizontal: the front diagonal is drawn. */
  readonly frontBiasSlope: number;
}

/** 크기는 맞은 몸 키의 비율(바닥 고리는 보), 수명은 ms. */
export interface NativeCityFxTuning {
  /** Contact release -> actual receiver travel -> landing/settle. Lengths are body fractions or explicit strides. */
  readonly sequence: { readonly minTravelStrides: number; readonly releaseMs: number; readonly trailEveryMs: number;
    readonly trailLifeMs: number; readonly settleMs: number; readonly maxMs: number;
    readonly ribbonWidth: number; readonly ribbonLength: number };
  readonly contactHeight: number;
  /** The burst sits this far (body fraction) back toward the attacker along the blow. */
  readonly contactInset: number;
  readonly slamContactHeight: number;
  /** 접촉 순간 1–2 프레임의 밝은 심(화면 시간). alpha*: 가산 빛의 세기(평타·강타·반격, 갑옷, 붕괴·KO). */
  readonly core: { readonly radius: number; readonly holdMs: number; readonly fadeMs: number; readonly alpha: number; readonly armoredAlpha: number;
    readonly finaleAlpha: number };
  /** The ink line under every code crescent / comet: band `thickness`× as thick, at `alpha`× the shape's opacity. */
  readonly inkStroke: { readonly thickness: number; readonly alpha: number };
  /** 타격 방향으로 짧게 튀는 바늘 불꽃. radius는 길이, thickness는 폭이다. */
  readonly sparks: { readonly count: Readonly<Record<NativeCityImpactTier, number>>; readonly radius: number; readonly thickness: number;
    readonly travel: number; readonly spreadDeg: number; readonly lifeMs: number };
  readonly comets: { readonly count: number; readonly length: number; readonly width: number; readonly travel: number; readonly lifeMs: number };
  /** Split pressure front released by a clean heavy contact after its own freeze (screen ms, body fractions). */
  readonly aftershock: { readonly radius: number; readonly growTo: number; readonly thickness: number; readonly travel: number;
    readonly lifeMs: number; readonly alpha: number };
  readonly flash: { readonly radius: number; readonly whiteMs: number; readonly lifeMs: number };
  readonly groundGlow: { readonly radius: number; readonly squash: number; readonly lifeMs: number };
  readonly dustRing: { readonly radiusStrides: number; readonly growToStrides: number; readonly bandStrides: number; readonly lifeMs: number };
  readonly shockwave: { readonly radiusStrides: number; readonly growToStrides: number; readonly bandStrides: number; readonly lifeMs: number;
    readonly secondDelayMs: number; readonly brightShare: number };
  /** Dust and ember flecks thrown from the contact along the blow (an arc that rises `lift` and falls back). */
  readonly debris: { readonly count: Readonly<Record<NativeCityImpactTier, number>>; readonly size: number; readonly travel: number;
    readonly lift: number; readonly spreadDeg: number; readonly lifeMs: number };
  /** The victim's skid: dust puffs left every `puffEveryStrides` along the knockback while it slides, and a scuff on the paving. */
  readonly skid: { readonly minStrides: number; readonly puffEveryStrides: number; readonly puffRadius: number; readonly puffLifeMs: number;
    readonly rise: number; readonly scuffWidthStrides: number; readonly scuffAlpha: number; readonly scuffLifeMs: number;
    readonly shadeAlpha: number; readonly brightAlpha: number };
  readonly dustPuffs: { readonly count: number; readonly radius: number; readonly spreadStrides: number; readonly rise: number; readonly lifeMs: number;
    readonly yRatio: number; readonly shadeAlpha: number; readonly brightAlpha: number };
  readonly telegraph: { readonly fillAlpha: number; readonly edgeAlpha: number; readonly startScale: number; readonly bandStrides: number };
  /** The body-sized blunt pressure wave: tier rank ≥ `minRank` and a loud accent only (json note). */
  readonly pressureWave: { readonly minRank: number };
}

/** 쿠마 기 모으기(내려찍기·콤보 예비). 크기는 그의 몸 키 비율. */
export interface NativeCityAuraTuning {
  readonly slamPeak: number;
  readonly comboPeak: number;
  /** The red grab's charge (presentation): its windup glows at this from its first frame. */
  readonly grabPeak: number;
  readonly windupShare: number;
  readonly rampPower: number;
  readonly pulseHz: readonly [number, number];
  /** His body as an ellipse (fractions of his body height): the flames hug its edges. */
  readonly silhouette: { readonly width: number; readonly height: number };
  readonly flames: { readonly count: number; readonly length: number; readonly width: number; readonly curl: number;
    readonly riseHz: readonly [number, number]; readonly innerAlpha: number; readonly opponentSideAlpha: number };
  readonly embers: { readonly count: number; readonly size: number; readonly riseHz: number };
  readonly rimGlow: { readonly alpha: number };
  /** The last `ms` before contact: the flames pull in to `widthScale` and the rim glows at `rimAlpha`. */
  /** The inhale before contact (the parry's "now"); under reduced motion the rim steps to `reducedRimAlpha` instead of drawing in. */
  /** The inhale's look; its length is the rules' (`tempo.kuma.inhaleMs`, 2026-10-22). */
  readonly inhale: { readonly widthScale: number; readonly rimAlpha: number; readonly reducedRimAlpha: number };
  readonly groundGlow: { readonly radius: number; readonly squash: number; readonly alpha: number };

  readonly hitQuiet: { readonly ms: number; readonly alpha: number };
  readonly collapseMs: number;
  readonly collapseFlash: { readonly radiusStrides: number; readonly ms: number };
  /** A first contact's windup never glows under this (2026-10-14 fun audit): the grade's colour shows from the first frame. */
  readonly onsetFloor: number;
}

export interface NativeCityFeelTuning {
  readonly tiers: Readonly<Record<NativeCityImpactTier, NativeCityFeelTier>>;
  readonly armoredHitStopScale: number;
  readonly armoredFxScale: number;
  /** 맞힌 쪽의 역경직 뒤 되튐(화면 px). 멈춤 자체는 히트스톱이 둘 다에 건다. */
  readonly hitLag: { readonly attackerPushbackPx: Readonly<Record<NativeCityImpactTier, number>>; readonly pushbackRiseMs: number;
    readonly pushbackFallMs: number; readonly contactHoldMinMs: number };
  /** The poise break's slow-mo; `desaturate` (0..1) is how much colour the whole screen loses at its depth (`feel.screenGrade`). */
  readonly slowMo: { readonly scale: number; readonly holdMs: number; readonly releaseMs: number; readonly desaturate: number };
  readonly slamGround: { readonly shakePx: number; readonly shakeMs: number; readonly verticalShare: number };
  readonly fx: NativeCityFxTuning;
  readonly aura: NativeCityAuraTuning;
  readonly sfx: { readonly swingLeadMs: number };
  /** Per-hit body feel both ways (`feel.impact`, see the json note). */
  readonly impact: NativeCityImpactFeelTuning;
  /** Every hidden rule's look (`feel.tells`, json note): armour rim, opening, invulnerability, low poise, the dash glint. */
  readonly tells: NativeCityTellsTuning;
  /** In-world comic letters (`feel.letters`, `render/effects/webtoon/SfxLetter`). */
  readonly letters: NativeCitySfxLetterTuning;
  /** The mansion's ink impact frame on the city's decisive blows (`feel.impactFrame`). */
  readonly impactFrame: NativeCityImpactFrameTuning;
  /** The drawn hit effects at the contact (`feel.hitFx`, `render/view/NativeCityHitFxView`). */
  readonly hitFx: NativeCityHitFxTuning;
  /** Whole-screen colour beats on both canvases (`feel.screenGrade`, `render/effects/NativeCityScreenGrade`). */
  readonly screenGrade: NativeCityScreenGradeTuning;
  /** One strong accent per exchange (`feel.budget`, `render/effects/NativeCityAccentBudget`). */
  readonly budget: NativeCityAccentBudgetTuning;
  /** The opponent's big fight HP bar (`feel.fightBar`, `render/effects/NativeCityFightHpBar`). */
  readonly fightBar: NativeCityFightBarTuning;
  /** Pose-to-pose holds and stepped shakes on both bodies (`feel.staccato`, `render/effects/NativeCityStaccato`). */
  readonly staccato: NativeCityStaccatoTuning;
}

/** `feel.staccato` (2026-10-11 '뚝뚝 끊기는 맛'): see the json note. */
export interface NativeCityStaccatoTuning {
  readonly stepMs: number;
  readonly recoverStepMs: number;
  /** Signed shake levels, one per `stepMs` (× the tier's shake amplitude). */
  readonly shake: readonly number[];
  readonly victim: { readonly holdShare: number; readonly tail: readonly number[] };
  readonly squash: { readonly holdMs: number; readonly overshoot: number };
  readonly hop: { readonly holdShare: number; readonly tail: readonly number[] };
  /** KUMA's dash crouch: these levels for `recoverStepMs` each, then the full crouch held. */
  readonly anticipation: readonly number[];
}

/**
 * `feel.fightBar` (2026-10-10 3단계): the opponent's fight HP bar under his name. A blow drops the fill at once; the lost share stays as a
 * white chunk for `holdMs` (another blow inside it adds to the same chunk and holds it again), then drains to the fill over `drainMs`;
 * `flashMs` after a blow the chunk is pure white, then ivory. It shakes `shakePx` at `shakeHz` for `shakeMs` (none under reduced
 * motion). Layout (screen px): `widthShare` of the screen, within [`minWidthPx`, `maxWidthPx`] and `edgeMarginPx` of either edge,
 * `heightPx` tall, centred at the top (`topShare`; 2026-10-16 at the top right, before that centred in the bottom letterbox band) —
 * `ticks` quarter marks (Otto's bar: one part per scoring hit); it fades over `fadeMs`.
 * `bandShare` is still the stage's bottom letterbox band: the HUD's fight hints sit above it.
 */
export interface NativeCityFightBarTuning {
  readonly holdMs: number;
  readonly drainMs: number;
  readonly flashMs: number;
  readonly shakePx: number;
  readonly shakeHz: number;
  readonly shakeMs: number;
  readonly widthShare: number;
  readonly minWidthPx: number;
  readonly maxWidthPx: number;
  readonly heightPx: number;
  readonly bandShare: number;

  readonly topShare: number;
  readonly edgeMarginPx: number;
  readonly ticks: number;
  readonly fadeMs: number;
}

/**
 * `feel.screenGrade`: the parry's decisive frame (2026-10-16, was a CSS grayscale ink flip) — `parry.mode`'s shader on the town through the
 * parry's freeze, at most once per `parry.minGapMs` (screen ms; null: none, 2026-10-17) — and the backdrop pass. Every whole-screen pass
 * waits `minGapMs` (screen ms) after the last one; only the KO may come sooner (2026-10-17, the fight film was dizzy).
 */
export interface NativeCityScreenGradeTuning {
  readonly parry: { readonly mode: NativeCityBackdropShader | null; readonly minGapMs: number };
  readonly minGapMs: number;
  /**
   * The backdrop dim (2026-10-16): through the freeze of a loud blow of one of `tiers`, an ink sheet at `alpha` over the town with the two
   * fighters drawn over it; on the release it steps to half for one frame, then off (`releaseMs`). None under reduced motion.
   */
  readonly backdrop: {
    readonly alpha: number; readonly tiers: readonly NativeCityImpactTier[]; readonly releaseMs: number;
    /**
     * The decisive frame (2026-10-16): these tiers swap the ink sheet for a full-screen shader on the town under the two fighters —
     * `negative` (the town inverted into paper / ink in `negative.steps`) or `screentone` (ink dots on paper, `pitchPx` logical px, solid
     * ink below `solidBelow` luma, blurred toward the fighters by `zoomBlur` of the distance). Other tiers keep the sheet.
     */
    readonly modes: Readonly<Partial<Record<NativeCityImpactTier, NativeCityBackdropShader>>>;
    readonly negative: { readonly steps: number };
    readonly screentone: { readonly pitchPx: number; readonly solidBelow: number; readonly zoomBlur: number };
    /**
     * A super's flash (2026-10-21): the town as ink silhouettes under the two fighters — pure ink below luma `from`, rising to `lift` of the
     * way to paper at luma `to` (the sky and the bright paving stay a dim ink grey, so the shapes still read).
     */
    readonly silhouette: { readonly from: number; readonly to: number; readonly lift: number };
  };
}

/** A decisive frame's shader on the town (`feel.screenGrade.backdrop.modes`). */
export type NativeCityBackdropShader = "negative" | "screentone" | "silhouette" | "night";
/** What the backdrop pass draws this frame: the ink sheet or a decisive frame's shader. */
export type NativeCityBackdropMode = "dim" | NativeCityBackdropShader;


export type NativeCityAccentKind = "ender" | "heavy" | "counter" | "knockdown" | "break" | "ko";

/**
 * `feel.budget` (2026-10-10 3단계, "정신없음"): a strong accent (its letter, zoom pulse / camera punch, impact frame, speed lines) plays
 * only `accentGapMs` after the last one, unless it out-ranks it (`rank`); a suppressed one keeps the hit (freeze, flash, star, sound)
 * with its shake × `quietShakeScale`.
 */
export interface NativeCityAccentBudgetTuning {
  readonly accentGapMs: number;
  readonly rank: Readonly<Record<NativeCityAccentKind, number>>;
  readonly quietShakeScale: number;
}

/** `feel.hitFx`: the drawn impact star, ink slash and speed lines at a blow's contact (json note). */
export interface NativeCityHitFxTuning {
  /** Star / slash strips: `startFrame` at once, `peakFrame` from `leadMs` held through the freeze (≥ `peakMinMs`), then `tailFrameMs` each. */
  readonly frames: { readonly startFrame: number; readonly peakFrame: number; readonly leadMs: number; readonly peakMinMs: number;
    readonly tailFrameMs: number; readonly lightTailFrameMs: number };
  readonly maxOnScreen: number;
  readonly star: { readonly size: Readonly<Record<string, number>>; readonly armoredScale: number };
  readonly slash: { readonly tiltDeg: number };
  /** The focus-line ring behind the victim (opening counter, poise break, KUMA's dash hit): `frames` × `frameMs`, `size` × body, `alpha`. */
  readonly speedLines: { readonly frames: number; readonly frameMs: number; readonly size: number; readonly heavySize: number; readonly alpha: number };
}

/** `feel.tells`: what makes each hidden rule readable on screen. */
export interface NativeCityTellsTuning {
  /** KUMA's attack armour: an iron rim round his silhouette (`rimPx` screen px) shimmering to brass over `shimmerMs`. */
  readonly armor: { readonly rimPx: number;
    /** The navy ink line round the rim (screen px; 2026-10-19 — the steel sank into the paving without it). Absent: none. */
    readonly inkPx?: number;
    /** How far the rim's breath swings from the steel toward the steel light (0..1). Absent: 0.35. */
    readonly shimmerShare?: number;
    /** How many "슈퍼아머!" letters a fight shows (2026-10-19 신호 정리 — later blows keep the clang and the rim's flash). Absent: every time. */
    readonly letterTimes?: number;
    readonly shimmerMs: number; readonly flashMs: number; readonly attackerPushbackPx: number;
    readonly recoilDeg: number; readonly recoilMs: number;
    /** A blow his rhythm armour took whole (`kuma.rhythm.armor`, damage 0): the bigger throw-back, its lean and the status's height. */
    readonly bounce: { readonly pushbackPx: number; readonly recoilDeg: number; readonly recoilMs: number; readonly statusHeight: number } };
  /** His counter window opening: the "attack now" magenta rim pulsing `pulseMs` on / off over `flashMs`. */
  readonly opening: { readonly flashMs: number; readonly pulseMs: number };

  readonly invulnerable: { readonly blinkMs: number; readonly blinkAlpha: number };
  /** KUMA's poise at or under `wobbleAt`: a sway and sweat drops (one every `sweatEveryMs`). */
  readonly poise: { readonly wobbleAt: number; readonly wobbleDeg: number; readonly wobbleMs: number; readonly sweatEveryMs: number;
    readonly sweatLifeMs: number };
  /** The dash's eye glint: `leadMs` before the charge, at `height` of his body, with a zoom punch. */
  readonly dashGlint: { readonly leadMs: number; readonly height: number; readonly zoom: number; readonly zoomMs: number };
  /** The last chain hit (hook, V): a bigger zoom punch and a cross swing of the camera. */
  readonly enderPunch: { readonly zoom: number; readonly zoomMs: number; readonly swingPx: number };
  /**
   * The coming move's grade badge over his name plate (2026-10-14 fun audit, json note): the answer's icon `sizePx` tall, centred `liftPx`
   * over the top of his body, in the grade's colour outlined `outlinePx` in the HUD's ink (flat, 2026-10-15), popping in from `startScale`
   * over `popMs`.
   */
  readonly gradeMark: { readonly sizePx: number; readonly liftPx: number; readonly outlinePx: number;
    readonly popMs: number; readonly startScale: number;

    readonly resolve: { readonly pressMs: number; readonly pressScale: number; readonly pressTravel: number; readonly popMs: number;
      readonly popScale: number; readonly fadeMs: number; readonly fadeScale: number; readonly brighten: number; readonly glowPx: number;
      readonly glowAlpha: number; readonly bits: number; readonly bitPx: number; readonly bitTravelPx: number; readonly safeFadeMs: number;
      readonly reducedFlashMs: number; readonly reducedFadeMs: number; readonly linkHoldMs: number } };
  /** V's counter gauge round the badge (2026-10-18, json note, `kuma.rhythm.counter`): the ring, its outline and the window's glow. */
  readonly counterGauge: { readonly radiusPx: number; readonly bandPx: number; readonly outlinePx: number; readonly glowPx: number;
    readonly pulseMs: number };
}

export type NativeCitySfxLetterWeight = "light" | "heavy" | "call";

/** `feel.letters`: the comic letters' pop, hold, drift and size. */
export interface NativeCitySfxLetterTuning {
  readonly popMs: number;
  readonly startScale: number;
  readonly overshoot: number;
  readonly lingerMs: Readonly<Record<NativeCitySfxLetterWeight, number>>;
  readonly driftMs: number;
  /** How far it drifts along the push (fractions of its own height). */
  readonly driftShare: number;
  readonly tiltDeg: Readonly<Record<NativeCitySfxLetterWeight, number>>;
  /** Letter height as a fraction of the body it sits on. */
  readonly size: Readonly<Record<NativeCitySfxLetterWeight, number>>;
  /** Alternating offset by chain index (fractions of the letter height). */
  readonly offset: { readonly side: number; readonly up: number };

  readonly aboveHead: number;
  /**
   * A blow's own call-out (what hit him, e.g. "엉덩이 쾅!") stands BESIDE the struck body instead, on his far side: its centre this far
   * from the blow's contact (fraction of that body), at the contact's height over his drawn lift (2026-10-21; `besideNote`).
   */
  readonly beside: number;
  /** A call-out on a body thrown up (lying flat in the air) stands under it, its centre this much of that body below his lifted feet (`besideNote`). */
  readonly besideAirDrop: number;
  readonly maxOnScreen: number;
  /** The heavy letters' ink burst behind them. */
  readonly burst: { readonly scale: number; readonly ms: number };
  /** Reduced motion: no overshoot, no drift — a plain fade. */
  readonly reducedLingerScale: number;
  /**
   * A heavy letter breaks instead of drifting (2026-10-16): cut, then the six drawn shards over `ms` — thrown out at `speed` letter
   * heights per second (a seeded range), falling at `gravity` heights per s², spinning up to `spinDegPerS`, shrinking from `size` × the
   * letter height to nothing. None under reduced motion.
   */
  readonly shatter: { readonly ms: number; readonly speed: readonly [number, number]; readonly gravity: number;
    readonly spinDegPerS: number; readonly size: number };
}

/** `feel.impactFrame`: which blows get the ink frame, how long, and the photosensitivity cooldowns. */
export interface NativeCityImpactFrameTuning {
  /** The short plate's length (0: no short plate, 2026-10-17). */
  readonly shortPaperMs: number;
  readonly bandMs: number;
  readonly shortCooldownMs: number;
  readonly fullCooldownMs: number;
}

/** Who took the blow (`feel.impact` tables keyed by the struck body). */
export type NativeCityFighter = "player" | "kuma";
type ByTier = Readonly<Record<NativeCityImpactTier, number>>;
type ByFighter = Readonly<Record<NativeCityFighter, number>>;

/** `feel.impact`: victim flash, squash, hop, follow-through, camera kick, hurt vignette, rumble, HP chip, layered sound. */
export interface NativeCityImpactFeelTuning {
  readonly flash: { readonly fillMs: ByTier; readonly fadeMs: ByTier; readonly fadeStrength: ByTier; readonly armoredFadeScale: number;
    readonly reducedFillMs: number; readonly reducedFadeScale: number;
    /** An ink outline this many screen px round the victim while his fill flash shows (it must not melt into the bright paving). */
    readonly outlinePx: number };
  /** `uppercut`: the hook (drawn as an uppercut) stretches the struck body UP instead — scaleX −x, scaleY +y on the same spring. */
  readonly squash: { readonly x: ByTier; readonly y: ByTier; readonly ms: ByFighter; readonly kumaScale: number; readonly armoredScale: number;
    readonly uppercut: { readonly x: number; readonly y: number };
    /** The heel drop crushes the struck body flat (scaleX +x, scaleY −y) on the same spring. */
    readonly crush: { readonly x: number; readonly y: number } };
  readonly hop: { readonly height: ByTier; readonly ms: ByFighter; readonly kumaScale: number };
  readonly followThrough: { readonly px: ByTier };
  readonly camera: { readonly directionalShare: number; readonly shakeHz: number; readonly nudgePx: ByTier; readonly nudgeInMs: number;
    readonly nudgeOutMs: number; readonly zoomPulse: ByTier; readonly zoomMs: number };
  readonly vignette: { readonly alpha: ByTier; readonly inMs: number; readonly fadeMs: number; readonly reducedScale: number };
  readonly rumble: { readonly ms: ByTier; readonly strong: ByTier; readonly weak: ByTier; readonly armoredScale: number };
  readonly hpBar: { readonly chipDelayMs: number; readonly chipDrainMs: number; readonly shakePx: number; readonly shakeHz: number;
    readonly shakeMs: number };
  readonly sfx: { readonly thudGain: ByTier; readonly thudRate: ByFighter; readonly thudDelayMs: number; readonly boomGain: ByTier;
    readonly boomRate: number; readonly boomDelayMs: number; readonly kumaRateScale: number; readonly kumaGainScale: number;
    readonly pitchSpread: number; readonly gainSpread: number };
}


export interface NativeCityGuardTuning {
  readonly coneHalfAngleDeg: number;
  readonly moveScale: number;
  readonly max: number;
  readonly cost: { readonly light: number; readonly slam: number; readonly dash: number };
  readonly regenDelayMs: number;
  readonly regenPerSec: number;
  readonly reopenAt: number;
  readonly pushStrides: { readonly light: number; readonly slam: number; readonly dash: number };
  readonly blockStunMs: { readonly light: number; readonly slam: number; readonly dash: number };
  readonly breakStunMs: number;
  /** The HUD's guard pips blink alarm red on / off every this many ms while the guard is broken. */
  readonly meterBlinkMs: number;
}

/** A guard press just before a KUMA contact (Heist's counter window, moved to the city). */
export interface NativeCityParryTuning {
  /**
   * The timed parry is on (2026-10-18 손맛 2단계, user: "z = 막기" — Z only blocks now; its reward moved to V's counter, `kuma.rhythm.counter`).
   * false: a press arms `windowMs` of guard (a tap still blocks) but nothing parries and a re-press never whiffs.
   */
  readonly enabled: boolean;
  readonly windowMs: number;
  readonly pressLockMs: number;
  readonly actions: readonly NativeCityKumaActionKind[];
  readonly poiseDrain: number;
  readonly groggyHitIndex: number;
  readonly recoilMs: number;
  readonly kumaPushStrides: number;
  readonly poseMs: number;
  /** A re-press (guard up, or lowered under `whiffLoweredMs` ago) that no block or parry consumes within `windowMs` costs this much guard. */
  readonly whiffCost: number;
  readonly whiffLoweredMs: number;
}

/**
 * The dodge's hop (2026-10-16, user: "the dodge reads as a bow"): he springs back off `takeoffMs`, lands at `landMs` `backStrides` away
 * from the opponent, springs forward from `springMs` and is back where he started by `returnMs` — in punishing range. Eased out going,
 * smooth coming back. The drawn side dodge is authored to these beats.
 */
export interface NativeCityDodgeHopTuning {
  readonly takeoffMs: number;
  readonly landMs: number;
  readonly springMs: number;
  readonly returnMs: number;
  readonly backStrides: number;
}

/** X: the dodge — the hop back and the spring back in (it was the bow-duck until 2026-10-16). */
export interface NativeCityDodgeTuning {
  readonly totalMs: number;
  readonly hop: NativeCityDodgeHopTuning;
  readonly invulnerableMs: readonly [number, number];
  /** From this many ms into the dodge a guard press (Z) cuts its tail and guards/parries at once. */
  readonly cancelAfterMs: number;
  readonly cooldownMs: number;
  readonly evades: readonly NativeCityKumaActionKind[];

  readonly vault: NativeCityVaultTuning;
}


export interface NativeCityBackstepTuning {
  readonly travelStrides: number;
  /** The flight's speed left at the landing, as a share of its average (the skid then carries on from it, never re-accelerating). */
  readonly airEndSpeedShare: number;
  /** The hop's arc over the drawn cells (body heights at its peak; drawing only): it peaks `hopPeakShare` into the flight. */
  readonly hopApexBodies: number;
  readonly hopPeakShare: number;
  readonly lockAfterLandMs: number;
  readonly cooldownMs: number;
  readonly placeholderTakeoffMs: number;
  readonly placeholderLandMs: number;
  readonly placeholderTotalMs: number;
}

/** `dodge.vault` (2026-10-11): when it triggers, where it lands, its i-frames and lock (fight ms from its start / its landing step). */
export interface NativeCityVaultTuning {
  /** KUMA within this many strides beyond body contact … */
  readonly triggerGapStrides: number;
  /**
   * … else, up to this many strides between their bodies, X runs in (`player.pursuit`'s pace and limits) and vaults on reaching
   * `triggerGapStrides` (2026-10-18 손맛 2단계); farther (or no room behind him): the hop in place.
   */
  readonly chargeMaxGapStrides: number;
  /** … and inside this cone of the aimed X. */
  readonly coneHalfAngleDeg: number;
  /** He lands this far beyond body contact behind KUMA. */
  readonly landGapStrides: number;
  readonly invulnerableFromMs: number;
  readonly invulnerableAfterLandMs: number;
  readonly lockAfterLandMs: number;
  /**
   * The apex beat (2026-10-17): as his palms land on the crown the fight drops to `slowScale`; after `slowFightMs` of fight time on his head
   * the slow motion snaps off into a `snapStopMs` freeze (the glint), then the fight runs at `whipScale` for `whipMs` (screen) and whips
   * him over. None under reduced motion.
   */
  readonly apex: { readonly slowScale: number; readonly slowFightMs: number; readonly snapStopMs: number; readonly whipScale: number;
    readonly whipMs: number; readonly desaturate: number };
}

/** KUMA's guard stance between attacks. */
/** V's charge (json `player.actions.attack.charge` note). */
export interface NativeCityHeavyChargeTuning {
  /** Fight ms of the drawn steps up to the crouch (squeezed, never stretched): the shortest tap. */
  readonly entryMs: number;
  /** V held this long from the press is a full charge (the level rises linearly from the crouch). */
  readonly fullMs: number;
  /** Held longer than this, it fires by itself. */
  readonly maxHoldMs: number;
  /** Fight ms of the chamber steps before the contact (squeezed, never stretched). */
  readonly releaseStartupMs: number;
  /** At a full charge: damage and poise drain x their scale (a tap x 1), the clean hit's freeze. */
  readonly full: { readonly damageScale: number; readonly poiseScale: number; readonly hitStopMs: number;
    /**
     * The full charge's launch in slow motion after its freeze (2026-10-19 game-animator: the top of the ladder differs by a slow-mo, not a
     * longer bare freeze — a stop past ~200 ms reads sluggish). None under reduced motion. Absent: none.
     */
    readonly slowMo?: { readonly scale: number; readonly holdMs: number; readonly releaseMs: number; readonly desaturate: number } };
  /** What a held charge shows (presentation): the tremble's step and its px at the crouch / full, the full charge's gold blink. */
  readonly tell: { readonly trembleStepMs: number; readonly tremblePx: readonly [number, number]; readonly fullBlinkMs: number };
}

export interface NativeCityKumaGuardTuning {
  readonly raiseMs: number;
  /** Fight ms to hold the guard after contact, so the next chain blow can meet it before the stand expires. */
  readonly holdAfterBlockMs: number;
  /** Only the stand after every `every`-th attack (by attack id) raises the guard; the others are open (0 = never). */
  readonly every: number;
  readonly coneHalfAngleDeg: number;
  readonly poiseScale: number;
  readonly poiseFloor: number;
  readonly pushStrides: number;
  readonly pierce: Readonly<Record<NativeCityPlayerActionKind, readonly boolean[]>>;

  readonly counterAfterBlocks: number;
  /**
   * A person's held guard (2026-10-22, `KumaControl.guard`): each blocked contact drains `drainScale` × the AI's, with no floor and no refill
   * while it is held — the guard breaks. Absent: ×1.
   */
  readonly held?: { readonly drainScale: number };
}


export interface NativeCityKumaHurtTuning {
  /** Steps of the hit clip before the recoil key (0 = the frozen frame already is the recoil: the snap). */
  readonly framesBeforeRecoil: number;
  readonly frameMs: number;
  /** A chain flinch: the recoil key held this long, then the stagger frames fill the middle, then the recover frames. */
  readonly holdMs: number;
  /** Preserve the hit silhouette through this share of a longer chain flinch. */
  readonly holdShare: number;
  readonly recoverFrameMs: number;
  /** No drawn step shorter than this (a compressed recover samples fewer frames instead of snapping through them). */
  readonly minFrameMs: number;
  /** Added to the computed chain gap (frame quantization, the release burst). */
  readonly chainMarginMs: number;
  /** A chain flinch when no clip timing is known (the placeholder, tests). */
  readonly fallbackFlinchMs: number;
  /** The `stringCap`-th flinch in one unbroken string is taken as its ender (no endless restarted chains). */
  readonly stringCap: number;
  /** The ender's flinch: the recoil key held `enderHoldMs` through the skid, then a sampled recover, `enderMs` in all. */
  readonly enderMs: number;
  readonly enderHoldMs: number;
  /** The ender pushes him at least this far (strides): the skid. */
  readonly enderKnockbackStrides: number;
  /** When the ender's flinch ends he swings at once (his turn). */
  readonly retaliate: boolean;
}

/** How KUMA rises from a knockdown (`kuma.knockdown.wakeup.pattern`, by knockdown count). */
export type NativeCityKumaWakeup = "reversal" | "guard";


export interface NativeCityKumaKnockdownTuning {
  readonly lieMs: number;
  /** Drawn knockdown's extra flight height, as a receiver body fraction; zero at contact and landing. */
  readonly liftBodies: number;
  /** Initial unweighting pose overlaps flight; it adds no delay after hit stop. */
  readonly takeoffPoseMs: number;
  /**
   * The string's link tell (2026-10-19, `kumaCombatLinkWindow`): it closes this long before a V pressed now would land after his flinch.
   * Absent: 0.
   */
  readonly linkTellMarginMs?: number;
  readonly wakeup: {
    readonly pattern: readonly NativeCityKumaWakeup[];
    readonly reversalAction: NativeCityKumaActionKind;
    readonly reversalWindupRate: number;
    readonly guardMs: number;
    readonly tellLeadMs: number;
  };
}


export interface NativeCityKumaCounterTuning {
  readonly windowMs: number;
  readonly reachSlackStrides: number;
  /**
   * The counter's own beat (2026-10-19, user: "카운터 쳤을 때 '내가 때렸나보다' — 삥~ 하고 순간적으로 엄청 슬로우 걸렸다가 팡!!!"): the
   * accept freezes `freezeMs` (screen ms, not the parry's), then `slowMo` — a deep hold, the release WHIPS above 1 (`whipRate`) into the
   * heel, and the heel's contact ends it (its own freeze is the 팡). The camera pushes in through it (`focus`, render). Absent: the
   * parry's freeze and `chance.slowMo`.
   */
  readonly accent?: {
    readonly freezeMs: number;
    readonly slowMo: { readonly scale: number; readonly holdMs: number; readonly releaseMs: number; readonly whipRate: number;
      readonly desaturate: number };
    readonly focus: { readonly zoom: number; readonly inMs: number; readonly maxMs: number };
  };
}

/** A just dodge's / a parry's opening (`kuma.rhythm.chance.<kind>`): how long it holds and the damage his body takes in it. */
export interface NativeCityKumaChanceKindTuning {
  readonly ms: number;
  readonly damageScale: number;
}

/** What opened a chance (`kuma.rhythm.chance`): a just dodge / vault, or a parry. */
export type NativeCityKumaChanceKind = "dodge" | "parry";


export interface NativeCityKumaRhythmTuning {
  /** × his seeded rotation windup rate (`attack.windupRates`): below 1 is slower. */
  readonly windupScale: number;
  /** Every `every`-th rotation swing (seeded) winds up at `rate` instead (× `tempo.kuma.windupRate`): the late beat. */
  readonly delay: { readonly every: number; readonly rate: number };

  readonly armor: { readonly damageScale: number; readonly poiseScale: number; readonly bounceStunMs: number;

    readonly pushStrides?: number; readonly recoilStrides?: number };
  /**
   * A C pressed `pressFromMs`..`pressToMs` (fight ms) into a swing from his stand or chase, from a free stance, cuts it as a counter. Retired
   * 2026-10-18 (손맛 2단계 — V's counter took its place): absent, the window never opens.
   */
  readonly jabCut?: { readonly pressFromMs: number; readonly pressToMs: number };
  /** V's counter on his armoured swing's last contact (2026-10-18 손맛 2단계, json note). Absent: V is only the heavy blow. */
  readonly counter?: NativeCityKumaCounterTuning;
  readonly chance: {
    /** A dodge / vault whose i-frames began at most this long (fight ms) before his contact passed is a just one. */
    readonly justMs: number;
    readonly slowMo: { readonly scale: number; readonly holdMs: number; readonly releaseMs: number; readonly desaturate: number };
    readonly dodge: NativeCityKumaChanceKindTuning;
    readonly parry: NativeCityKumaChanceKindTuning;
  };
  /**
   * A counter string's launching ender leaves him open `followMs` (once per exchange, `maxFollowUps`). `air` (2026-10-21): it throws him
   * up instead, for the air combo (`NativeCityKumaAir`); absent: the launch stays on the ground.
   */
  readonly launch: { readonly followMs: number; readonly maxFollowUps: number; readonly air?: NativeCityKumaAirTuning };
  /** V's knockdown lies `lieMs`; one V on the body on the ground deals × `groundDamageScale`. */
  readonly down: { readonly lieMs: number; readonly groundDamageScale: number };
}

/**
 * The air combo on a fighter (`kuma.rhythm.launch.air`, 2026-10-21, json note; `NativeCityKumaAir`): the launch's height and gravities, the
 * air hits' lifts, the ground blow's reach up to him and the spike's bounce.
 */
export interface NativeCityKumaAirTuning {
  /** The launch rises to this height (body heights) in `riseMs` (fight ms), slowing to its top. */
  readonly liftBodies: number;
  readonly riseMs: number;
  /** He falls under this many times the rise's gravity. */
  readonly fallScale: number;

  readonly pushStrides: number;
  /** Each air hit lifts him this much more (the n-th hit's; the last repeats) and pushes him `hitPushStrides`. */
  readonly hitLiftBodies: readonly number[];
  readonly hitPushStrides: number;

  readonly maxHits: number;

  readonly groundReachBodies: number;

  readonly spike: { readonly speedBodiesPerSec: number; readonly bounceBodies: number };
  /** His landing out of the air holds both clocks this long (fight ms, × `hitStopScale`): the combo's last beat. */
  readonly landHitStopMs: number;
  /**
   * The blow that throws him up holds both clocks this long (fight ms, × `hitStopScale`) — the launch is the string's turn into the air,
   * frozen long enough to read who hit whom (2026-10-21 user: the bomber's contact "너무 빨라서 무슨 상황인지 전혀 안 보임"; it froze
   * 133 ms, barely over the chain's 125).
   */
  readonly launchHitStopMs: number;
}


export interface NativeCityPlayerAirMoveTuning {
  readonly damage: number;
  readonly tier: NativeCityMeleeTier;
  readonly poise: number;
  readonly contactMs: number;
  /** A clean light contact's freeze (fight ms); absent: its tier's. */
  readonly hitStopMs?: number;
}


export type NativeCityPlayerAirMove = "c" | "v" | "stomp";

/**
 * A move that comes down on him from above (the spike, the stomp): a small rise over where it starts (`riseBodies`, at most `maxRiseBodies`)
 * to its top at `apexMs`, then the dive (`diveScale` × the plain fall) to his feet `apexOverBodies` over the opponent's height at the contact.
 * It travels toward him on the way: his root ends `rootGapStrides` short of the opponent's (negative: past it, over a body lying flat
 * along the push), at most `maxTravelStrides`.
 */
export interface NativeCityPlayerAirDiveTuning extends NativeCityPlayerAirMoveTuning {
  readonly riseBodies: number;
  readonly apexMs: number;
  readonly apexOverBodies: number;
  readonly maxRiseBodies: number;
  readonly diveScale: number;
  readonly rootGapStrides: number;
  readonly maxTravelStrides: number;
}


export interface NativeCityPlayerAirTuning {
  readonly gravityBodiesPerSec2: number;
  /** The drawn landing crouch after his feet touch down (fight ms; an air clip's `keys.land`). */
  readonly landHoldMs: number;
  readonly c: NativeCityPlayerAirMoveTuning & {
    /** The C chain segment whose drawn swing he throws in the air. */
    readonly segment: number;
    /** He leaves the ground this far (fight ms) into it. */
    readonly takeoffMs: number;
    /** His feet at the contact: the opponent's then + `apexOverBodies`, kept within [`minApexBodies`, `maxApexBodies`]. */
    readonly apexOverBodies: number;
    readonly minApexBodies: number;
    readonly maxApexBodies: number;
    /** No air C at an opponent lower than this at the contact (the ground C reaches him there). */
    readonly minFoeBodies: number;
    /** He keeps rising this long past the contact before the fall. */
    readonly hangMs: number;
    /** The jump's travel toward him: to `contactGapStrides` beyond body contact, at most `maxTravelStrides`. */
    readonly contactGapStrides: number;
    readonly maxTravelStrides: number;
  };

  readonly v: NativeCityPlayerAirDiveTuning & {
    /**
     * The spike's drawing (2026-10-21, user: it lands on the legs — "이펙트를 크게 해서 타격하는 느낌"): its contact is drawn as the
     * `presentAs` tier's (the burst art, the light layer, the camera kick — its freeze, damage and sound stay its own) at `scale` × its
     * size, and a downward thump on top (`shakePx` screen px over `shakeMs`, `verticalShare` of it a vertical bounce). Not a tier that
     * dims the screen (`feel.screenGrade.backdrop.tiers`): a blind read of the hip drop (2026-10-21) could not tell what hit him under the
     * break tier's dimmed screen and 1.5× burst.
     */
    readonly fx: { readonly presentAs: NativeCityImpactTier; readonly scale: number; readonly shakePx: number; readonly shakeMs: number;
      readonly verticalShare: number };
  };
  /**
   * C on his bounce after the spike (2026-10-22, user: "마지막 손 뻗어서 타격하는 게 아니라, 발로 걷어차거나 밟는 모션"): a hop and a heel stamped
   * down on the low body, one contact — the ground C's three palm strikes ran on over him lying there. From the ground (`fromBodies` 0).
   * V at him lying on the ground (his ground blow) is the same stomp, no charge crouch first.
   */
  readonly stomp: NativeCityPlayerAirDiveTuning;
}

/** KUMA's swing before its commit point: tracking and the abort (`kuma.attack`). */
export interface NativeCityKumaAttackTuning {
  /** A swipe commits this long before its first contact (the slam at its apex-hold start). */
  readonly commitLeadMs: number;
  /** Step-in budget before the commit, in screen strides. */
  readonly trackStrides: number;
  /** Step-in speed × his walk pace. */
  readonly trackPaceScale: number;
  readonly abortRecoveryMs: number;
  /** Share of the abort recovery spent rewinding the windup (the rest stands). */
  readonly abortRewindShare: number;

  readonly abortPredictScale: number;
  /** A rotation swing's windup to its first contact (the slam: to its apex hold) runs at one of these × `tempo.kuma.windupRate`, seeded per attack id. */
  readonly windupRates: readonly number[];
}


export interface NativeCityKumaSpacingTuning {
  readonly backStrides: number;
  readonly backPaceScale: number;
  readonly maxGapStrides: number;
  readonly withinMs: number;
}

/** KUMA's chase gait (`kuma.chase`). */
export interface NativeCityKumaChaseTuning {
  readonly runBeyondStrides: number;
  readonly runPaceScale: number;
  readonly runWhenOpeningMs: number;
  readonly leaveStandBeyondStrides: number;

  readonly reengageRunBeyondStrides: number;
}

/** KUMA's answer to kiting (`kuma.antiKite`). */
export interface NativeCityKumaAntiKiteTuning {
  readonly threshold: number;
  readonly action: NativeCityKumaActionKind;
  readonly startStrides: number;
  readonly chargeMs: number;
  readonly trackStrides: number;
  readonly trackPaceScale: number;
  readonly commitLeadMs: number;
  readonly auraLevel: number;
}

/** His red grab (`kuma.grab`, json note): when he picks it, how far he steps in, its freezes, the throw and the landing. */
export interface NativeCityKumaGrabTuning {

  readonly every: number;

  readonly turtleMs: number;
  /** … or this many contacts of KUMA's previous attack blocked. */
  readonly turtleBlocks: number;

  readonly startStrides: number;
  /** His step-in before the commit (screen strides) — short: the grab is planted. */
  readonly trackStrides: number;
  readonly catchHitStopMs: number;
  readonly squeezeHitStopMs: number;
  /** The throw's flight along his facing (strides, the launch curve). */
  readonly throwStrides: number;

  readonly lieMs: number;

  readonly holdFailsafeMs: number;

  readonly move?: string;
}

/** One of KUMA's three shifts (`kuma.phases`, json note): from which HP share it applies and what it changes. */
export interface NativeCityKumaPhaseStep {
  /** It applies while his HP is at most this share of `kuma.hp` (the last such step wins; the first has 1). */
  readonly fromHpShare: number;
  /** The red grab is picked in this shift (the turtle punish included). */
  readonly grab: boolean;
  /** `kuma.grab.every` in this shift. */
  readonly grabEvery: number;
  /** His stand after a swing × this (`tempo.kuma.cooldownMs`). */
  readonly cooldownScale: number;

  readonly chainGrab: boolean;
}

/** KUMA's dash attack (`kuma.dash`, json note). */
export interface NativeCityKumaDashTuning {
  /** The dash sticks on contact before its pop-out: shared freeze, then the attacker's two-beat recoil. */
  readonly contact: { readonly hitStopMs: number; readonly guardStopMs: number; readonly catchMs: number;
    readonly recoilHoldMs: number; readonly settleMs: number; readonly recoilPx: number };

  readonly fleeRadiusStrides: number;
  /** Fleeing within this (strides beyond body contact) is dashed at; farther, the old cancel / run-chase. */
  readonly maxStrides: number;

  readonly fleeGraceMs: number;
  /** The next dash may start this long after the last one started (no back-to-back spam). */
  readonly cooldownMs: number;
  /**
   * The crouch (2026-10-16: long enough that X answered 350-400 ms after the dash's first frame — its gold mark — still lets it pass;
   * the prediction and the homing still catch a runner).
   */
  readonly windupMs: number;
  /** The crouch when the dash comes out of a chase (he is already moving). */
  readonly chaseWindupMs: number;

  readonly closeRangeStrides: number;
  readonly closeWindupMs: number;
  readonly crouchSquash: number;
  readonly crouchLeanDeg: number;
  /**
   * The crouch on a borrowed crouch cell (the side's combo coil, `keys.standIns.windup` on his dash clip — 2026-10-10 KOF pass): the
   * cell is already low, so a lighter squash and lean on top.
   */
  readonly crouchCellSquash: number;
  readonly crouchCellLeanDeg: number;
  /** The crouch pulls back this far against the charge (screen strides) before the launch. */
  readonly windBackStrides: number;
  readonly auraLevel: number;

  readonly evadeMinStridesPerSec: number;
  readonly approachShare: number;
  /** Top charge speed, screen strides per second. */
  readonly topSpeedStrides: number;
  /** The ease-in burst to top speed. */
  readonly accelMs: number;

  readonly predictMaxMs: number;

  readonly leadStrides: number;

  readonly homingDeg: number;
  readonly maxTravelStrides: number;
  /** A whiffed charge brakes from top speed to a stop over brakeMs, skidding at most skidStrides (through bodies). */
  readonly brakeMs: number;
  readonly skidStrides: number;
  /** The camera leans toward the charge by `px` screen px (in over inMs, back over outMs); none under reduced motion. */
  readonly cameraLead: { readonly px: number; readonly inMs: number; readonly outMs: number };
  /** The hit: KUMA's own quick flash tier (fill + fade; flash only, no squash). */
  readonly attackerFlashTier: NativeCityImpactTier;
  /** Open after a whiff (his counter window). */
  readonly whiffRecoverMs: number;
  /** Without the `dash` still: his run frame tilted this far. */
  readonly fallbackTiltDeg: number;
  /** The one-frame `dash` still on the charge and the slide: a ±px screen tremble across the travel at Hz, a stretch along it. */
  readonly stillTremblePx: number;
  readonly stillTrembleHz: number;
  readonly stillStretch: number;
}


export interface NativeCityPlayerStunTuning {
  readonly ms: number;
  /** The stun lasts at least until KUMA's restarted attack's first contact + this. */
  readonly afterImpactMs: number;
  /** Invulnerable (with full control) this long after the stun. */
  readonly recoverMs: number;
  readonly spinStartFps: number;
  readonly spinEndFps: number;
  readonly wobbleDeg: number;
  readonly wobbleMs: number;
  readonly reducedWobbleScale: number;
  /** While the dash's knockback flies: a tilt toward the travel and a parabolic lift (body heights) off his shadow. */
  readonly launchTiltDeg: number;
  readonly launchLift: number;
}

/**
 * A body thrown up for the air combo (`exchangeFx.rig.kuma.air`, 2026-10-23 — the fighter view's `poseAir`, `NativeCityAirReaction`): its
 * drawn fall cell held up there turns its head–feet line toward the flight's (degrees, + head down) and flinches at each air blow, about
 * its drawn middle. The staccato curves are `[fight ms, share]` steps held in turn.
 */
export interface NativeCityAirReactionTuning {
  readonly riseDeg: number;
  /** Rising faster than this share of the launch's speed holds the full `riseDeg`. */
  readonly riseFullShare: number;
  readonly apexDeg: number;
  readonly fallDeg: number;
  readonly spikeDeg: number;
  /** The spike may turn a cell up to twice its limit, at most this (deg). */
  readonly spikeLimitDeg: number;
  readonly turnDegPerSec: number;
  /** The turn's centre over the feet (body heights) for a cell not measured. */
  readonly pivotFallbackBodies: number;
  readonly kickDeg: number;
  readonly kickHeavyDeg: number;
  readonly kickSteps: readonly (readonly [number, number])[];
  /** An air blow under `chainMs` after the one before: `chainSteps` (a barrage flutters). */
  readonly chainMs: number;
  readonly chainSteps: readonly (readonly [number, number])[];
  readonly pushBodies: number;
  readonly pushHeavyBodies: number;
  readonly pushSteps: readonly (readonly [number, number])[];
  /** Reduced motion's shares of the kick, the turn and the push. */
  readonly reduced: { readonly kick: number; readonly turn: number; readonly push: number };
}

/** The exchange's presentation numbers over the FX recipes (`native-city-exchange-fx-recipes.json`). */
export interface NativeCityExchangeFxTuning {
  readonly sampleBodyPx: number;
  readonly ko: { readonly launchMs: number; readonly cardDelayMs: number; readonly bowDelayMs: number; readonly bowMs: number };
  readonly rig: {
    readonly player: { readonly guardBreathMs: number; readonly guardBreath: number; readonly guardSquash: number; readonly blockTiltDeg: number;
      readonly dodgeSquash: number; readonly dodgeLeanDeg: number; readonly dodgeInMs: number; readonly dodgeOutMs: number;
      readonly bowSquash: number; readonly bowLeanDeg: number; readonly bowInMs: number; readonly bowOutMs: number; readonly parryLeanDeg: number;
      readonly drawnGuardFrame: number; readonly drawnBowFrame: number; readonly parryHandForward: number; readonly parryHandHeight: number };
    readonly kuma: { readonly guardFrame: number; readonly blockFrame: number; readonly drawnGuardFrame: number; readonly drawnGroggyBackSwayDeg: number;
      readonly guardBreathMs: number; readonly guardBreath: number;
      readonly blockTiltDeg: number; readonly blockMs: number; readonly parriedFrames: readonly [number, number]; readonly parriedRotDeg: number;
      readonly groggySwayDeg: number; readonly groggySwayMs: number; readonly groggyShiftPx: number;
      readonly groggyShiftMs: number; readonly koFrame: number; readonly koStartDeg: number; readonly getUpMs: number;
      /** His swing before his fight sheets are in (2026-10-11): the rules swing on his pack's beats; his standing frame leans into each contact. */
      readonly attackStandInLeanDeg: number;
      /** A body thrown up for the air combo, over its held fall cell (`NativeCityAirReaction`, 2026-10-23). */
      readonly air: NativeCityAirReactionTuning };
  };
}


export interface NativeCityCancelTuning {
  readonly afterHitMs: number;
  readonly afterWhiffMs: number;
}


export interface NativeCityTempoTuning {
  readonly kuma: {
    /** The windup to his first contact (1 = as drawn). */
    readonly windupRate: number;
    /**
     * The windup's last stretch before its first contact that keeps the windup speed under the white floor (2026-10-22, moved from
     * `feel.aura.inhale.ms`): it moves the contact times. The aura's inhale tell lasts as long.
     */
    readonly inhaleMs: number;
    /**
     * A white swing's (fast, combo) windup to its first contact lasts at least this ÷ its windupScale on any fighter's art (2026-10-16:
     * YUME's drawn swipe struck 140 ms after its tell — under any answer; the old floor held only on KUMA's art).
     */
    readonly whiteWindupFloorMs: number;
    /** The rest of a string and the other non-telegraph stretches. */
    readonly actionRate: number;
    /** His stand after an attack: [min, max] ms, seeded per attack. */
    readonly cooldownMs: readonly [number, number];
    /** His chase walk × his patrol walk pace. */
    readonly chasePaceScale: number;
    readonly slam: { readonly apexHoldMs: number; readonly landingHoldMs: number; readonly recoverMs: number };
    readonly combo: { readonly gapMs: number; readonly tailMs: number };
    readonly fast: { readonly tailMs: number };
  };
  readonly player: {
    readonly chainRate: number;
    readonly heavyRate: number;
    /** A C within this long of the last swing's end continues the chain; later it starts over at the jab. */
    readonly chainResetMs: number;
    /**
     * The C beat (2026-10-18, json `chainTiming` note): in a chain swing with a next segment, a C from `openBeforeContactMs` before its first
     * contact on is timed (kept until the cut); one pressed earlier breaks the chain.
     */
    readonly chainTiming: { readonly openBeforeContactMs: number };
    /**
     * The startup warp (fight ms from the swing's start to its first contact): the steps before it are squeezed so the contact lands
     * this soon — never stretched (a shorter drawn windup keeps its own length). The contact hold and the rest keep their rules.
     */
    readonly startupMs: { readonly jab: number; readonly straight: number; readonly hook: number; readonly heavy: number;
      /** The sliding tackle's placeholder windup (its drawn clip is staccato: as authored). */
      readonly dash: number };
    readonly cancel: { readonly chain: NativeCityCancelTuning; readonly heavy: NativeCityCancelTuning; readonly dash: NativeCityCancelTuning };
    /** A second press of the same arrow within this many screen ms is a double tap (→→ sliding tackle, ←← backstep). */
    readonly doubleTapMs: number;
    /** Chain hits 1-2 ("타타") freeze this long instead of the light tier's, per segment (jab, straight): the ladder's first steps. */
    readonly chainLightHitStopMs: readonly number[];

    readonly enderRecoveryMs: number;
    /**
     * The input buffer (fight ms; a freeze does not age a press): a press that waits — for a swing's cancel point, or through a hit
     * lock, block stun, parry pose or dodge — runs only if it is no older than this when it first could (C / V `swing`, X / Z `defense`).
     */
    readonly bufferMs: { readonly swing: number; readonly defense: number };
  };
  /** After a freeze lets go, both fighters' clocks run at `rate` for `ms` of screen time (the snap out). */
  /** After a freeze lets go: both clocks ease back in from `fromRate` (`DuelReleaseRamp`, 2026-10-17 — was a 1.6× snap out). */
  readonly releaseRamp: { readonly fromRate: number; readonly perFreeze: number; readonly maxMs: number };
  /**
   * Two clock speeds only (2026-10-21): no release ramp, and the read slow-mos (chance, counter, full charge, break) held as a freeze of
   * the screen time they added (`nativeCityCrispHoldMs`). The KO finisher and the vault apex stay slow motion.
   */
  readonly crisp: { readonly enabled: boolean };
  /** The whole fight's playback speed while engaged (fight ms per screen ms before freezes and slow-mo; `stepDuelClock` baseRate). */
  readonly playbackRate: number;
  readonly finisherSlowMo: { readonly scale: number; readonly holdMs: number; readonly releaseMs: number; readonly desaturate: number };
}

/**
 * `melee.reachFromArt` (2026-10-11): a contact whose clip records its drawn tip (`hitReachPx`) reaches clamp(tip strides +
 * `tipOffsetStrides`, `minExtraStrides`, `maxExtraStrides`) beyond body contact (`nativeCityArtReachExtraStrides`).
 */
export interface NativeCityArtReachTuning {
  /** Explicit move ranges survive anatomy / atlas changes. */
  readonly moveExtraStrides?: Readonly<Record<string, number>>;
  readonly tipOffsetStrides: number;
  readonly minExtraStrides: number;
  readonly maxExtraStrides: number;
  /** A named clip move's own cap instead of `maxExtraStrides` (2026-10-11 user: 보이는 대로 맞게 — the C3 `tieWhip` hits as far as it is drawn). */
  readonly moveMaxExtraStrides?: Readonly<Record<string, number>>;
}

/** `knockback.launch`: the launch curve (fast out, hard stop) and the wall splat. */
export interface NativeCityLaunchTuning {
  readonly tauMs: number;
  readonly stopStridesPerSec: number;
  /** A launch cut by the stage line's end with at least this much (strides) still to go splats on it. */
  readonly wallMinStrides: number;
  /** Both clocks hold this long on the splat. */
  readonly wallHitStopMs: number;
  /** The splat's camera jolt (presentation; mostly sideways). */
  readonly wallShake: { readonly px: number; readonly ms: number; readonly verticalShare: number };
}

/**
 * `knockback.ko` (2026-10-20, the Rivals reference): the KO blow sends the loser flying. He travels `strides` in his drawn fall's flight
 * (to its ground-impact step), lifted up to `liftBodies` body heights on the way. A flight cut by the stage line's end splats on it like a
 * launch (`knockback.launch.wallMinStrides`).
 */
export interface NativeCityKoLaunchTuning {
  readonly strides: number;
  readonly liftBodies: number;
  /** The flight's front-loading (`DuelKnock.flightEase`): fast off the blow, slowing into the landing. */
  readonly flightEase: number;
}


export interface NativeCitySuperTuning {
  readonly max: number;
  readonly gainHit: number;
  readonly gainBlocked: number;
  readonly gainTaken: number;
  readonly flashMs: number;
  readonly damageScale: number;
  /** KUMA's super swing (a fighter's row names his own `superAction`). */
  readonly kumaAction: NativeCityKumaActionKind;
  /** A fighter with a full meter spends it on the attack whose seeded share is under this (deterministic, not every swing). */
  readonly aiShareUnder: number;

  readonly crouchLeadMs: number;

  readonly runInPaceScale: number;

  readonly trailMs: number;
  /** The camera's push-in on the flash (presentation, 2026-10-21): it holds until the super's contact kick lets it go (`focusNote`). */
  readonly focus: { readonly zoom: number; readonly inMs: number; readonly maxMs: number };
}

/** `player.actions.combo.launch`: per chain contact, its knockback on KUMA from its drawn reach (json note). */
export interface NativeCityChainLaunchTuning {
  readonly reachShare: readonly number[];
  readonly minStrides: readonly number[];
  readonly maxStrides: readonly number[];
  /** Flies on the launch curve (`knockback.launch`). */
  readonly curve: readonly boolean[];
  /** His guard takes this share of it. */
  readonly guardShare: number;
}

/** `player.actions.attack.jump`: the heel drop's jump (json note). */
export interface NativeCityPlayerJumpTuning {
  readonly riseMs: number;
  readonly hangMs: number;
  readonly fallMs: number;
  /** The arc's height at the apex, in body heights (on top of the cells' baked height). */
  readonly apexBodies: number;
  /**
   * The float at the apex (variable gravity, 2026-10-11): over `hangMs` he only sinks this share of `apexBodies` (low gravity — the hang
   * time is felt, not a flat hold), then falls the rest under a stronger gravity that keeps accelerating to the contact.
   */
  readonly apexDip: number;
  /** Forward travel from the takeoff to the contact (strides): fast off the ground, slowest at the apex, fast again into the slam. */
  readonly travelStrides: number;
  /** How much the forward speed swings around its average (0 = even pace; 0.5: ×1.5 at takeoff/landing, ×0.5 at the apex). */
  readonly travelEase: number;
  /** The heel's ground impact: a strong, mostly vertical camera shake (presentation). */
  readonly landShake: { readonly px: number; readonly ms: number; readonly verticalShare: number };
}

export interface NativeCityCombatTuning {
  readonly melee: { readonly coneHalfAngleDeg: number; readonly reachExtraStrides: number; readonly minGapStrides: number;
    readonly reachFromArt: NativeCityArtReachTuning };
  readonly knockback: { readonly lightStrides: number; readonly heavyStrides: number; readonly tauMs: number; readonly stopStridesPerSec: number;
    /** The opening counter pushes KUMA this much further (its chained follow-ups and the breaking hit push like their tier). */
    readonly counterScale: number;

    readonly launch: NativeCityLaunchTuning;
    /** The KO blow on a fighter (`knockback.ko`, 2026-10-20): how far the loser flies and how high the drawn fall rises. */
    readonly ko: NativeCityKoLaunchTuning;
    /** The push growing as the struck body's HP runs out (`knockback.hpScale`, 2026-10-20, `duelHpKnockScale`). */
    readonly hpScale: DuelHpKnockTuning };
  /** The meter and the super (`super`, 2026-10-20, `CityFightMeter`). */
  readonly super: NativeCitySuperTuning;
  readonly hitStopScale: number;
  readonly tempo: NativeCityTempoTuning;
  readonly player: {
    /** Lock after a blow when no `hit` art plays (procedural stagger). */
    readonly hitStaggerMs: number;
    /** Lock after a blow while the drawn `hit` reaction plays. */
    readonly hitStunMs: number;
    /** The drawn `hit` tremble's largest step, in screen px (the art's curve is normalized to it). */
    readonly hitShakePeakScreenPx: number;
    /** A freeze at least this long has spent the drawn tremble: the rest of it is skipped once the clip moves. */
    readonly hitShakeSkipFreezeMs: number;
    readonly aimAssistStrides: number;
    readonly pursuit: { readonly startGapStrides: number; readonly stopGapStrides: number; readonly maxTravelStrides: number;
      readonly paceStridesPerSec: number; readonly maxMs: number };
    /** His air moves on a fighter thrown up (`player.air`, 2026-10-21); absent: none. */
    readonly air?: NativeCityPlayerAirTuning;
    readonly aimAssistHalfAngleDeg: number;
    readonly placeholderLeanDeg: number;
    /** A step away from the opponent on the side-scroll stage: he backs up facing him, at `speedScale` of his walk (never a run). */
    readonly backWalk: { readonly speedScale: number };

    readonly backstep: NativeCityBackstepTuning;
    /** KUMA's dash stun (`player.stun`). */
    readonly stun: NativeCityPlayerStunTuning;
    readonly ko: NativeCityPlayerKoTuning;
    readonly actions: Readonly<Record<NativeCityPlayerActionKind, {
      readonly placeholderHitsMs: readonly number[];
      readonly placeholderTotalMs: number;
      readonly damage: readonly number[];
      readonly tiers: readonly NativeCityMeleeTier[];
      readonly lungeStrides: readonly number[];
      readonly lungeLeadMs: number;
      /**
       * The step-in's shape between the drawn release and the contact: `in` (default) accelerates into the contact (a punch's weight
       * transfer), `out` launches at full speed and slows into it (the sliding tackle's friction — and the contact is judged where he
       * nearly stopped).
       */
      readonly lungeEase?: "in" | "out";
      /**
       * With `lungeEase: "out"`: the speed left at the contact, as a share of the step-in's average (0 = it has stopped; game-animator
       * 2026-10-12: a tackle that lands at speed 0 reads as "slid, stopped, then hit"). The curve is share·p + (1−share)·(1−(1−p)²).
       */
      readonly lungeEndSpeedShare?: number;
      /**
       * A skid after the last contact (the sliding tackle, game-animator 2026-10-12): `skidStrides` more on the fight clock over `skidMs`,
       * eased out — it starts once the freeze lets go (the swing's clock holds through it) and stops at bodies like the step-in.
       */
      readonly skidStrides?: number;
      readonly skidMs?: number;
      /** Its ender knocks KUMA down on a counter or into a chain flinch (V, the sliding tackle). */
      readonly knockdown?: boolean;
      /** The camera's lean into a travelling move as it launches (presentation, the sliding tackle; `kuma.dash.cameraLead`'s shape). */
      readonly cameraLead?: { readonly px: number; readonly inMs: number; readonly outMs: number };
      /** Shared freeze of the last ordinary clean hit. Guard, armour, counter, break and KO retain their own beat. */
      readonly enderHitStopMs?: number;
      /** An automatic burst inside one C input; rules stay independent of sprite bounds. */
      readonly bursts?: Readonly<Record<number, {
        readonly damage: readonly number[]; readonly tiers: readonly NativeCityMeleeTier[];
        readonly lungeStrides: readonly number[]; readonly poise: readonly number[];
        readonly reachExtraStrides: number;
        readonly hitStopMs: readonly number[];
      }>>;
      /** V's charge (`player.actions.attack.charge`, 2026-10-18): hold to crouch, let go for the one kick. Absent: the swing never charges. */
      readonly charge?: NativeCityHeavyChargeTuning;
      /** The chain contacts' knockback on KUMA (`player.actions.combo.launch`); absent: the tier push only. */
      readonly launch?: NativeCityChainLaunchTuning;
      /** The side heel drop's real jump (`player.actions.attack.jump`); absent: no jump. */
      readonly jump?: NativeCityPlayerJumpTuning;
    }>>;
  };
  readonly kuma: {
    readonly hp: number;
    readonly invulnerableMs: number;
    readonly stopStrides: number;
    readonly attackStartStrides: number;
    readonly comboEvery: number;
    readonly armorDuringAttack: boolean;
    readonly actions: Readonly<Record<NativeCityKumaActionKind, NativeCityKumaActionSpec>>;

    readonly strikes: Readonly<Record<NativeCityKumaActionKind, NativeCityKumaStrikeTuning>>;
    readonly fastCombo: { readonly every: number; readonly endKey: string };
    /** Track before the commit, abort instead of whiffing (json note). */
    readonly attack: NativeCityKumaAttackTuning;
    readonly chase: NativeCityKumaChaseTuning;
    /** His step back after a string (`kuma.spacing`); absent: none. */
    readonly spacing?: NativeCityKumaSpacingTuning;
    readonly antiKite: NativeCityKumaAntiKiteTuning;
    /** The red grab (`kuma.grab`). */
    readonly grab: NativeCityKumaGrabTuning;
    /** His three shifts by HP (`kuma.phases`, json note); absent (the skinned fighters): one shift, today's rules. */
    readonly phases?: { readonly steps: readonly NativeCityKumaPhaseStep[] };

    readonly dash: NativeCityKumaDashTuning;
    readonly guard: NativeCityKumaGuardTuning;
    readonly hurt: NativeCityKumaHurtTuning;
    readonly down: { readonly staggerOffset: number; readonly ms: number; readonly darken: number; readonly getUpFrameMs: number };
    /** V's knockdown and his wake-up mix-up (`kuma.knockdown`, json note). */
    readonly knockdown: NativeCityKumaKnockdownTuning;
    /** The duel's rhythm (`kuma.rhythm`, 2026-10-18; the skinned fighters too since 2026-10-20); absent (the fighter-vs-fighter bout): the fight as before. */
    readonly rhythm?: NativeCityKumaRhythmTuning;
  };
  readonly poise: NativeCityPoiseTuning;
  readonly exchange: NativeCityExchangeTuning;
  /**
   * The triangle (`triangle`): each KUMA-type action's class; `guardCrush` — the grades whose contact on the guard empties it (and lands
   * its damage); `vaultPasses` — the grades the vault's i-frames let pass (2026-10-18 손맛 2단계: white and gold, the red grab still catches);
   * `best` — each grade's one best answer, the only one that opens his chance (2026-10-19 읽기 보상, `bestNote`).
   */
  readonly triangle: { readonly classes: Readonly<Record<NativeCityKumaActionKind, NativeCityKumaGrade>>;
    readonly guardCrush: readonly NativeCityKumaGrade[]; readonly vaultPasses: readonly NativeCityKumaGrade[];
    readonly best: Readonly<Record<NativeCityKumaGrade, NativeCityKumaBestAnswer>> };
  readonly guard: NativeCityGuardTuning;
  readonly parry: NativeCityParryTuning;
  readonly dodge: NativeCityDodgeTuning;
  readonly exchangeFx: NativeCityExchangeFxTuning;
  readonly feel: NativeCityFeelTuning;
}

/**
 * One of KUMA's swings (`kuma.actions.<action>`): damage per contact and the reaction tier. Per contact, optionally (2026-10-10 KOF pass,
 * the combo's climax): `impacts` — the impact tier each contact lands with (the shake, the letter, his rebound; default light), and
 * `lightHitStopMs` — the freeze of each light contact (ms; default the light tier's) — one weight step up the string.
 */
export interface NativeCityKumaActionSpec {
  readonly damage: readonly number[];
  readonly tier: NativeCityMeleeTier;
  readonly impacts?: readonly NativeCityImpactTier[];
  readonly lightHitStopMs?: readonly number[];
}


export interface NativeCityPlayerKoTuning {
  readonly downMs: number;
  readonly tiltDeg: number;
  readonly fallMs: number;
  readonly riseMs: number;
  readonly darken: number;
  readonly lieMs: number;
  readonly getUpSpeed: number;
  /** The drawn fall plays this many times faster than drawn; its held ground-impact frames (the tremble) keep their drawn time. */
  readonly fallRate: number;
  /** The drawn fall starts this far (art ms) into its clip: the upright lead frames are skipped (never past the ground-impact step). */
  readonly leadSkipArtMs: number;
  /** A blow that only knocks him down (HP left) pushes him at least this far (strides): it must not crumple in place. */
  readonly minKnockbackStrides: number;

  readonly launchStrides: number;

  readonly hitStopMs: number;
  /** The drawn ground-impact tremble's largest step, in screen px (like `hitShakePeakScreenPx`). */
  readonly shakePeakScreenPx: number;
  /** Brightness while he lies in the drawn KO (1 = off). */
  readonly drawnLieDarken: number;
  /** Ground impact: dust ring scale, its centre this far behind his feet (strides, away from KUMA), and a camera thump. */
  readonly dustScale: number;
  readonly dustOffsetStrides: number;
  readonly thumpPx: number;
  readonly thumpMs: number;
  readonly thumpVerticalShare: number;
}

/**
 * A JSON table's shape as a JSON import infers it: string unions widen to `string`, tuples to arrays (the cast below names them). The
 * rest — every key, number, flag and nesting — must match the interface (`lint:types` fails on a missing or mistyped field).
 */
export type NativeCityJsonShape<T> = T extends string ? string : T extends readonly (infer U)[] ? readonly NativeCityJsonShape<U>[]
  : T extends object ? { readonly [K in keyof T]: NativeCityJsonShape<T[K]> } : T;

/** 마을 전투 수치 SSOT(`src/world/native-city-combat.json`). Its shape is checked against the interface (`NativeCityJsonShape`). */
export const NATIVE_CITY_COMBAT: NativeCityCombatTuning = Object.freeze((tuning satisfies NativeCityJsonShape<NativeCityCombatTuning>) as unknown as
  NativeCityCombatTuning);
