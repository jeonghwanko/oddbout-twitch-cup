/**
 * 전투 접촉 한 번의 순수 레시피 — 흰 코어 → 계단 네모로 부서짐 → 네모 조각이 식는다.
 *
 * 줄타기 "Icicle" 문법(`RopeTraversalFx`)과 같은 집안이다. 같은 5단 팔레트(`ROPE_FX_RAMPS`),
 * 같은 2px 격자, 같은 방사형 빛 텍스처(`TEX.ropeFxLight`)를 쓴다. 다른 게임 필살기의 문법
 * (그림이 아니라 박자)을 옮겼다: 접촉 코어는 두 프레임만 흰색이고, 계단진 네모로 부서진 뒤
 * 조각이 색 한 칸·크기 한 칸씩 동시에 내려가며 식는다. 회전한 마름모는 보석(전리품) 문양이라
 * 여기서는 쓰지 않는다 — 전부 격자에 붙은 정사각형이다.
 *
 * 규칙: 튀는 이징 금지(easeOutCubic 만), 알파는 계단으로만 꺼진다, 가산 합성은 코어·가시·궤적·
 * 넉백 충격파·빛 웅덩이만. 조각·고리·속도선은 보통 합성이다(회화 배경 위에서 번지지 않게).
 *
 * 게임(`ActionEffectView`)·효과 실험실·시트 CLI(`tools/fx/combat-fx-sheet.mjs`)가 같은 레시피를
 * 읽는다. CLI 가 node strip-types 로 직접 읽으므로 import 는 `.ts` 확장자를 붙인 모듈만,
 * parameter property·enum 은 쓰지 않는다. 모든 요소는 태어난 시각과 시드만으로 정해진다.
 */

import { easeOutCubic } from "../art/easing.ts";
import { knockbackProgress, knockbackStopMs } from "./KnockbackCurve.ts";
import { PALETTE } from "../art/palette.ts";
import { ROPE_FX_CARD, ROPE_FX_RAMPS, type RopeFxRamp } from "./RopeTraversalFx.ts";
import { FX_GRID_PX, fxGridPoly, fxSnap, type FxPoint, type FxPolyPrim, type FxPrim } from "./FxPrim.ts";
import { fxRng } from "./FxRandom.ts";
import { cometPoints, crescentPoints, ellipsePoints, ribbonPoints, sampleSpine, taper } from "./CombatFxShapes.ts";
import { HIT_STOP_BY_TIER } from "./CombatPresentation.ts";
import { COMBAT_FX_FREEZE_RATE } from "./CombatFxClock.ts";

/** 히트스톱 동안 효과 나이가 흐르는 배율(공통 정책 `COMBAT_FX_FREEZE_RATE`). */
const HIT_STOP_FX_RATE = COMBAT_FX_FREEZE_RATE;


export type CombatHitTier = "light" | "heavy" | "dash" | "finisher" | "struck";

/** 경비 접촉 VFX 가 발바닥에서 상체로 올라가는 높이(px, 표준 경비 키). 큰 몸은 `victimScale` 배. */
export const COMBAT_HIT_CONTACT_LIFT_PX = 22;

/**
 * 공개 결투 상대(금고지기)의 화면 키 ÷ 표준 경비 키. 접촉 높이와 불꽃 크기가 이 배율을 따른다 —
 * 같은 22px 평타 가시는 큰 몸의 흰 플래시 위에서 사라졌다(2026-09-25 보스 필름 리뷰).
 */
export const ENCOUNTER_BOSS_VICTIM_SCALE = 1.3;

export interface CombatHitTierTuning {
  /** 코어 가로·세로(px). 대시만 납작한 타원이다. */
  readonly coreW: number;
  readonly coreH: number;
  readonly spikes: number;
  readonly spikeLengthPx: readonly [number, number];
  /** 진행 방향으로 선 주 가시. 0 이면 따로 두지 않는다. */
  readonly heroSpikePx: number;
  readonly spikeWidthPx: number;
  /**
   * 가시가 퍼지는 반각(rad). π 면 사방이다. 좁으면 주 가시 방향(진행 + `heroTiltRad`)을 가운데로 둔 부채꼴 —
   * 대시 ±35°(수평), 평타 ±25°(앞 위), 피니셔 ±35°(올려친 쪽).
   */
  readonly spikeSpreadRad: number;
  readonly spikeLifeMs: number;
  /**
   * 가시의 휨(가시 길이에 대한 끝의 옆 비킴 비율). 0 이면 곧은 쐐기, 0 보다 크면 부채꼴 바깥쪽으로 휘며
   * 끝으로 가늘어지는 곡선 날(`CombatFxShapes.ribbonPoints`)이다. 피니셔만 — 곧은 삼각형 열여섯 개가
   * 가슴 위에서 별 모양 판으로 뭉쳤다(2026-09-27 C-C-C 캡처).
   */
  readonly spikeCurve: number;
  /** 주 가시의 기울기(rad, 오른쪽을 볼 때 기준, 음수 = 위). 피니셔는 올려치기라 -60°. */
  readonly heroTiltRad: number;
  readonly rings: readonly {
    readonly fromPx: number;
    readonly toPx: number;
    readonly ramp: RopeFxRamp;
    /** 팔레트 몇 번째 칸에서 시작하는가. */
    readonly step: number;
    readonly thicknessPx: number;
    readonly lifeMs: number;
  }[];
  readonly debris: number;
  /** 조각 한 변의 격자 칸 수(1 칸 = 2px). 2/4px → [1, 2]. */
  readonly debrisCells: readonly [number, number];
  /** 맞은 쪽 반구 안에서 진행 방향 기준 반각(rad). 90° 를 넘지 않는다. */
  readonly debrisSpreadRad: number;
  /** 조각 부채꼴의 가운데(rad, 오른쪽 기준, 음수 = 위). 피니셔는 앞 위 -40°. 반구 밖으로는 안 나간다. */
  readonly debrisAngleRad: number;
  /** `debrisRadiusAtMs` 에 조각이 닿는 거리(px). 속도는 이 값에서 역산한다. */
  readonly debrisRadiusPx: number;
  readonly debrisGravity: number;
  readonly debrisLifeMs: number;
  /** 크리스털(차가운) 조각의 비율. 대시만 차가운 쪽이 주인이다. */
  readonly debrisCoolChance: number;
  readonly poolPx: number;
  readonly poolAlpha: number;
  readonly poolRamp: RopeFxRamp;
  /** 대시 접점의 가로 속도선. 줄마다 세 토막(40/30/20%, 4px 틈)으로 끊긴다. */
  readonly streakRowsPx: readonly number[];
  readonly streakLengthPx: readonly [number, number];
  /**
   * 밀랍 얼룩의 바깥 반지름(px). 0 이면 없다. 강타·(쓰러뜨리지 않은) 피니셔만.
   * 얼룩이 떠 있는 동안 계단 코어는 한 칸 식은 색이다.
   */
  readonly splatPx: number;
  /** 올려치기의 궤적 가시(아래-뒤로 36px). 피니셔만. */
  readonly trail: { readonly lengthPx: number; readonly widthPx: number; readonly lifeMs: number } | null;

  readonly anchor: { readonly liftPx: number };
  /** 빛 웅덩이(고리 안을 채우는 빛)의 수명(ms). null 이면 `poolHalvingMs × poolSteps` 계단. */
  readonly poolLifeMs: number | null;
  /**
   * 가시가 첫 프레임(흰색) 뒤 버티는 팔레트 칸: [진행 쪽, 반대쪽]. 평타는 [2, 3] — hotGold(1)는
   * 흰 피격 섬광 위에서 흰색과 구분되지 않았다. 계단이 식어도 3 칸(warm[3])보다 어두워지지 않는다.
   */
  readonly spikeHoldStep: readonly [number, number];
  /**
   * 몸 너머 터짐: 고리의 가까운 가장자리와 맞은 몸의 먼 쪽 실루엣 사이 틈(px, 표준 몸 — `victimScale` 배).
   * 0 이면 없다(가시·충격파는 코어 자리에서 뻗는다). 피니셔만 쓴다 — 올려친 날·초승달·고리가 몸 위에서 솟으면
   * 히트스톱 내내 맞은 몸 몸통을 가로질렀다(2026-09-27 최종 필름 보스 +44~+50, 경비 +47~+54). 터짐 중심은
   * 실루엣 + 틈 + 바깥 고리 반지름 — 고리·가시·충격파가 모두 여기서 솟아 몸 뒤·너머의 한 덩어리로 읽힌다.
   */
  readonly farSidePx: number;
  /**
   * 넉백 충격파: 맞은 몸 쪽으로 밀려 나가는 초승달 두 겹(가산). 볼록한 등이 날아가는 방향을 가리켜
   * 사방으로 터지는 가시만으로는 안 읽히던 "어느 쪽으로 날아가는가"를 말한다(2026-09-26 전투 VFX 개편).
   * `arcRad` 는 진행 방향 기준 반각, `echoDelayMs` 뒤 작은 메아리가 따라 나간다. null 이면 없다.
   */
  readonly shock: {
    readonly fromPx: number;
    readonly toPx: number;
    readonly arcRad: number;
    readonly thicknessPx: number;
    readonly lifeMs: number;
    readonly echoDelayMs: number;
    readonly ramp: RopeFxRamp;
  } | null;
  /**
   * 바닥 미끄럼: 맞은 몸이 바닥 면 위로 밀려 간 자국(접촉 → 이동 → 멈춤). 거리·감쇠는 맞은 몸의
   * 렌더 넉백(`VICTIM_REACTION_BY_TIER.knockbackPx·knockbackTauMs·knockbackStopPxPerMs`)과 같은 값이어야
   * 몸과 자국이 함께 멈춘다 — 테스트가 두 표를 대조한다. null 이면 없다.
   */
  readonly skid: { readonly knockbackPx: number; readonly tauMs: number; readonly stopPxPerMs: number } | null;
}

/** 바닥 미끄럼 도형. 바닥 면 위의 납작한 자국이라 세로는 가로의 약 ¼ 이다. */
export const COMBAT_FLOOR_SKID = Object.freeze({
  /** 자국 띠의 반폭(px, 표준 몸). */
  halfWidthPx: 3,
  /** 멈춤 고리: 반지름 from → to(px, 표준 몸), 세로 눌림, 수명(ms). */
  settleRing: Object.freeze({ fromPx: 8, toPx: 26, squash: 0.24, lifeMs: 180 }),
  /** 머리 먼지 타원(px, 표준 몸). */
  headDustPx: 9,
  /** 이 거리보다 짧게 밀리면 자국을 남기지 않는다(막힘·흡수). */
  minPx: 8,
});

export interface CombatHitFxTuning {
  readonly gridPx: number;
  /** 코어가 흰 원으로 버티는 시간(한 프레임 — 흰색은 결판 몫이다). */
  readonly coreWhiteMs: number;
  /** 계단 네모까지 끝나고 코어가 사라지는 시각. */
  readonly coreGoneMs: number;
  /**
   * 코어·가시 원점을 접점에서 공격자 쪽으로 코어 폭의 몇 배만큼 물리는가. 접점은 맞은 몸 위라,
   * 가운데에 두면 흰 코어가 흰 피격 섬광 속에 묻힌다 — 절반쯤은 몸 밖(공격자 쪽)에 걸친다.
   */
  readonly coreBackShare: number;
  /** 가시 밑동이 코어 중심에서 떨어진 거리(코어 긴 변의 배수). 크면 코어가 꺼진 뒤 가운데가 빈다. */
  readonly spikeOffsetShare: number;
  readonly spikeGrowMs: number;
  readonly spikeStaggerMs: number;
  /** 빛 웅덩이 알파가 반으로 떨어지는 계단 간격. */
  readonly poolHalvingMs: number;
  readonly poolSteps: number;
  readonly debrisRadiusAtMs: number;
  readonly debrisDrag: number;
  readonly streakLifeMs: number;
  readonly streakSpeedPx: number;
  readonly streakJitterPx: number;
  readonly streakGapPx: number;
  readonly streakSegments: readonly [number, number, number];
  /** 가시는 줄어들지 않고 가늘어진다: 계단마다 폭 ×[1,.6,.35](최소 2px), 길이 ×[1,1.08,1.15]. */
  readonly spikeWidthSteps: readonly [number, number, number];
  readonly spikeLengthSteps: readonly [number, number, number];
  /** 얼룩: 33ms 에 밀랍 한 프레임, 50ms 에 사라진다(종이 단계는 lifeMs 가 waxMs 보다 길 때만). 이는 10개. */
  readonly splat: { readonly bornMs: number; readonly waxMs: number; readonly lifeMs: number; readonly teeth: number };
  /** 화면 전체에 살아 있을 수 있는 조각 상한. 넘치면 가장 오래된 것부터 걷는다. */
  readonly maxLiveDebris: number;
  /**
   * 2타: 조각 +3, 코어 +6px, 가시 각도는 수평축 대칭, 맞은 쪽으로 밀려 나가는 작은 충격파 초승달 한 겹
   * (`shock`, 메아리 없음) — 1타와 같은 불꽃에 크기만 다르면 복사본으로 읽혔다(2026-09-27).
   */
  readonly beat2: {
    readonly extraDebris: number;
    readonly extraCorePx: number;
    readonly shock: {
      readonly fromPx: number;
      readonly toPx: number;
      readonly arcRad: number;
      readonly thicknessPx: number;
      readonly lifeMs: number;
      readonly ramp: RopeFxRamp;
    };
  };
  /** 경직 저항에 먹힌 평타: 조각 5, 코어 8px, 팔레트는 warm[2] 에서 시작. */
  readonly absorbed: { readonly debris: number; readonly corePx: number; readonly rampFrom: number };
  /**
   * 예고장 임팩트 프레임이 뜬 피니셔의 코어·조각·고리 지연(효과 나이 ms). 히트스톱 동안 효과는
   * 0.5 배로 흐르므로 50ms 가 화면 시간 100ms — 판·반전·섬광띠가 끝난 뒤 터진다.
   */
  readonly impactFrameDelayMs: number;
  /**
   * 큰 몸(`victimScale` > 1)의 고리 색. 바깥 차가운 고리는 싸움 전체에서 유일한 파랑이었다(2026-09-25 보스
   * 필름 #36–45) — 따뜻한 램프 `coolToWarmStep` 칸으로. 반지름은 모든 몸에서 키(`victimScale`)를 따른다.
   */
  readonly bigVictimRings: { readonly coolToWarmStep: number };
  /**
   * 표준 경비의 화면 몸(px): 서 있는 키(32 × 2.475 ≈ 79)와 몸 반폭(경비 필름 실측 약 19 — 여유 있게 20).
   * 몸 너머 터짐(`farSidePx`)의 실루엣 기준이다. 큰 몸은 둘 다 `victimScale` 배.
   */
  readonly victimBody: {
    readonly heightPx: number;
    readonly halfWidthPx: number;
    /**
     * 몸 너머 터짐이 더 비켜야 하는 맞은 몸의 젖힘(px). 피니셔 반응(`VICTIM_REACTION_BY_TIER.finisher`)이 몸을 발 원점
     * 기준 14° 젖히고 4px 밀어, 머리·등이 서 있는 실루엣보다 키 × sin 14° + 4 = 79 × 0.242 + 4 = 23.1 → 24px 더 맞은 쪽으로
     * 나온다. 고리가 서 있는 실루엣만 비키면 커지는 동안 가까운 호가 등·머리에 걸쳤다(2026-09-27 경비 필름 round4
     * light-chain +50~+56). 큰 몸은 `victimScale` 배.
     */
    readonly reactionLeanPx: number;
  };
  /** 대시 잔상: 33ms 간격 세 장, cool[2] 가산, 알파 .42/.24/.1 계단. */
  readonly afterimage: {
    readonly count: number;
    readonly everyMs: number;
    readonly stepMs: number;
    readonly alphas: readonly [number, number, number];
  };
  readonly tiers: Readonly<Record<CombatHitTier, CombatHitTierTuning>>;
}

const DEG = Math.PI / 180;
/** 90° 정확히면 cos 가 부동소수 잔재로 음수가 될 수 있다. 반구 계약을 지키는 여유. */
const HEMISPHERE = 88 * DEG;

export const COMBAT_HIT_FX_TUNING: CombatHitFxTuning = {
  gridPx: FX_GRID_PX,
  // 2026-09-27 리뷰: 흰색은 결판·KO 몫이다. 평범한 타격의 흰 코어는 한 프레임(17)만, 그 뒤는 따뜻한 불씨다.
  // 코어를 공격자 쪽으로 더 물려(.4 → .6) 맞은 몸 위의 흰 덩어리가 줄어든다.
  coreWhiteMs: 17,
  coreGoneMs: 67,
  coreBackShare: 0.6,
  spikeOffsetShare: 0.1,
  spikeGrowMs: 33,
  spikeStaggerMs: 6,
  poolHalvingMs: 50,
  poolSteps: 4,
  debrisRadiusAtMs: 170,
  debrisDrag: 6,
  streakLifeMs: 133,
  streakSpeedPx: 240,
  streakJitterPx: 8,
  streakGapPx: 4,
  streakSegments: [0.4, 0.3, 0.2],
  spikeWidthSteps: [1, 0.6, 0.35],
  spikeLengthSteps: [1, 1.08, 1.15],
  splat: { bornMs: 33, waxMs: 17, lifeMs: 17, teeth: 10 },
  maxLiveDebris: 60,
  beat2: {
    extraDebris: 3,
    // 2타의 차이는 충격파·가시 대칭이 말한다 — 코어를 6px 키우면 흰 덩어리만 커졌다.
    extraCorePx: 2,
    shock: { fromPx: 10, toPx: 34, arcRad: 25 * DEG, thicknessPx: 4, lifeMs: 90, ramp: "warm" },
  },
  absorbed: { debris: 5, corePx: 8, rampFrom: 2 },
  impactFrameDelayMs: 50,
  bigVictimRings: { coolToWarmStep: 2 },
  victimBody: { heightPx: 79, halfWidthPx: 20, reactionLeanPx: 24 },
  afterimage: { count: 3, everyMs: 33, stepMs: 40, alphas: [0.42, 0.24, 0.1] },
  tiers: {
    // 평타(2026-09-27 C-C-C 캡처 실측): 불꽃이 주먹보다 약 40px 아래(허리)에서 터졌고, 사방 여덟 가시는 방향이
    // 없었으며, 흰 코어(12px)는 흰 피격 채움 속에 묻혔다. 코어를 16px 로 키워 주먹 높이로 올리고(`anchor.liftPx`),
    // 가시 다섯을 앞 위 ±25° 부채꼴로 모아 주 가시(30px)가 주먹이 나간 쪽을 가리킨다.
    light: {
      coreW: 16, coreH: 16,
      spikes: 5, spikeLengthPx: [10, 18], heroSpikePx: 30, spikeWidthPx: 4, spikeSpreadRad: 25 * DEG, spikeLifeMs: 100,
      spikeCurve: 0,
      heroTiltRad: -15 * DEG,
      rings: [],
      // 불씨 6개 — 혜성 꼬리가 붙어 한 개가 네모보다 커 보인다(10 은 주먹 앞을 점묘로 덮었다).
      debris: 6, debrisCells: [1, 2], debrisSpreadRad: 70 * DEG, debrisAngleRad: -25 * DEG, debrisRadiusPx: 30, debrisGravity: 180, debrisLifeMs: 300,
      debrisCoolChance: 0.12,
      poolPx: 20, poolAlpha: 0.55, poolRamp: "warm",
      streakRowsPx: [], streakLengthPx: [0, 0],
      splatPx: 0, trail: null,
      // 주먹 높이: 큐 접점(발 + 22px)에서 40px 더 — 발에서 62px, 서 있는 키(79px)의 약 0.78(잽·스트레이트의 주먹).
      anchor: { liftPx: 40 }, poolLifeMs: null,
      spikeHoldStep: [2, 3],
      farSidePx: 0,
      shock: null,
      skid: null,
    },
    // 2026-09-27 C-C-C 캡처: 빛 웅덩이(.65)·흰 코어·두 고리(바깥 차가운 고리는 청록 네온)·밀랍 얼룩·사방 16 가시·
    // 궤적이 가슴 위에 쌓여 약 11 프레임 동안 두 몸을 다 가렸다. 웅덩이 .35, 고리 하나를 속이 빈 34→52 로 키워
    // 몸이 가운데로 비치게, 차가운 고리는 걷고, 가시 일곱을 올려친 쪽 ±35° 곡선 날로, 조각 16·300ms·차가운 5%.
    finisher: {
      coreW: 24, coreH: 24,
      // 날 폭 8 → 5: 가시 일곱이 모인 부채가 한 덩어리 초승달로 뭉쳐 몸통을 덮었다(최종 필름).
      spikes: 7, spikeLengthPx: [24, 50], heroSpikePx: 64, spikeWidthPx: 5, spikeSpreadRad: 35 * DEG, spikeLifeMs: 110,
      spikeCurve: 0.18,
      // 3타는 올려치기다 — 주 가시·조각이 앞 위로 솟는다.
      heroTiltRad: -60 * DEG,
      // 고리는 맞은 몸 키에 비례하고(표준 26px ≈ 키의 ⅓, `victimScale` 배) 몸 너머에 선다(`farSidePx`). 34→52 는
      // 몸 앞 21px 에 서서 경비 몸 전체를 약 8 프레임 감쌌고(경비 필름 tension-final2 +47~+54) 보스 가슴을 호가
      // 가로질렀다(보스 +46~+50). 133 → 110ms: 히트스톱이 풀려 날아가는 몸이 고리 안으로 들어가기 전에 꺼진다.
      rings: [
        { fromPx: 16, toPx: 26, ramp: "warm", step: 1, thicknessPx: 4, lifeMs: 110 },
      ],
      debris: 16, debrisCells: [1, 4], debrisSpreadRad: 70 * DEG, debrisAngleRad: -40 * DEG, debrisRadiusPx: 50, debrisGravity: 220, debrisLifeMs: 300,
      debrisCoolChance: 0.05,
      // 빛 웅덩이는 터짐 중심(고리 안)에 — 36 은 실루엣 안쪽까지 번졌다.
      poolPx: 30, poolAlpha: 0.35, poolRamp: "warm",
      streakRowsPx: [], streakLengthPx: [0, 0],
      // 밀랍 얼룩은 쓰러뜨린 피니셔에만(`ko`) — 사슬 완주가 매번 얼룩을 찍으면 결판의 도장이 흔해진다.
      splatPx: 22, trail: { lengthPx: 36, widthPx: 6, lifeMs: 50 },
      // 주먹 높이 ≈ 서 있는 키(32 × 2.475 = 79px)의 0.85 = 발에서 67px. 큐 접점이 이미 22px 위라 45px 더 올린다.
      // 가로로는 몸 너머 티어라 먼 쪽 실루엣(`victimBody.halfWidthPx`)까지 간다 — 코어·조각이 몸 가장자리에서 튄다.
      anchor: { liftPx: 45 },
      // 고리 안을 채우는 빛은 흰 코어와 같은 두 프레임만 — 그 뒤로는 속 빈 고리만 남아 몸을 가리지 않는다.
      poolLifeMs: 33,
      // 금빛(warm[2]·[3])으로 버틴다 — hotGold(warm[1])는 화면에서 흰색으로 읽혔다(최종 필름).
      spikeHoldStep: [2, 3],
      // 실루엣과 고리 가까운 가장자리 사이 4px(표준 몸) — 터짐 중심은 몸 중심에서 20 + 4 + 26 = 50px(보스 65px).
      farSidePx: 4,
      // 올려치기: 앞 위로 부푸는 충격파. 72/12 는 흰 첫 프레임과 함께 맞은 몸 상체를 통째로 덮었다(2026-09-27) —
      // 52/7 로 몸 가장자리에서 끝낸다. 첫 프레임은 warm[1](`SHOCK_FIRST_STEP`).
      // 최종 필름: 7 도 hotGold 첫 칸과 함께 몸통 위 흰 초승달로 남았다 — 5, 첫 칸 warm[2](`SHOCK_FIRST_STEP`).
      // 2026-09-27 tension-final2: 고리와 같은 터짐 중심에서 고리 가장자리(26)부터 46 까지 동심으로 — 호의 가장 뒤
      // 끝(-96°)도 실루엣 너머에 남는다. 몸 키를 따라(`victimScale`) 크고, 180 → 150ms 로 날아오는 몸보다 먼저 꺼진다.
      shock: { fromPx: 26, toPx: 46, arcRad: 66 * DEG, thicknessPx: 5, lifeMs: 150, echoDelayMs: 33, ramp: "warm" },
      skid: { knockbackPx: 96, tauMs: 80, stopPxPerMs: 0.12 },
    },
    // 2026-09-26 끊어지는 박자: 강타 접촉 VFX 가 히트스톱(반속) 내내 두 몸을 덮어 멈춘 자세가 안 읽혔다
    // (보스 필름 player-heavy #16–31). 가시·고리·웅덩이·충격파를 가늘고 짧게 — 흰 코어 두 프레임과
    // 첫 퍼짐이 무게를 말하고, 히트스톱 후반에는 멈춘 두 몸이 보여야 한다.
    heavy: {
      coreW: 18, coreH: 18,
      spikes: 8, spikeLengthPx: [16, 30], heroSpikePx: 40, spikeWidthPx: 6, spikeSpreadRad: Math.PI, spikeLifeMs: 120,
      spikeCurve: 0,
      heroTiltRad: 0,
      // 퍼지는 고리·충격파 초승달은 손그림 금박·먹 충격파 플립북(`heavyImpact`)이 그린다 — 절차 다각형과 겹치면
      // 둥근 금 테가 원화의 초승달 위에 한 겹 더 앉아 맞은 몸통을 덮었다.
      rings: [],
      debris: 22, debrisCells: [1, 3], debrisSpreadRad: HEMISPHERE, debrisAngleRad: -20 * DEG, debrisRadiusPx: 38, debrisGravity: 260, debrisLifeMs: 400,
      debrisCoolChance: 0.12,
      poolPx: 24, poolAlpha: 0.45, poolRamp: "warm",
      streakRowsPx: [], streakLengthPx: [0, 0],
      splatPx: 16, trail: null,
      anchor: { liftPx: 0 }, poolLifeMs: null,
      spikeHoldStep: [1, 2],
      farSidePx: 0,
      // 고리(36px) 밖으로 확실히 빠져나가야 고리의 한쪽 테두리로 안 읽힌다.
      // 넉백 방향 초승달은 `heavyImpact` 원화가 소유한다(위 고리와 같은 이유).
      shock: null,
      skid: { knockbackPx: 44, tauMs: 70, stopPxPerMs: 0.12 },
    },
    dash: {
      coreW: 26, coreH: 12,
      spikes: 6, spikeLengthPx: [18, 52], heroSpikePx: 0, spikeWidthPx: 6, spikeSpreadRad: 35 * DEG, spikeLifeMs: 133,
      spikeCurve: 0,
      heroTiltRad: 0,
      rings: [],
      debris: 18, debrisCells: [1, 2], debrisSpreadRad: 30 * DEG, debrisAngleRad: 0, debrisRadiusPx: 46, debrisGravity: 60, debrisLifeMs: 360,
      debrisCoolChance: 0.8,
      poolPx: 26, poolAlpha: 0.45, poolRamp: "cool",
      streakRowsPx: [-10, 0, 10], streakLengthPx: [38, 56],
      splatPx: 0, trail: null,
      // 겹친 두 몸 위의 차가운 빛 웅덩이는 흰 코어와 함께 세 프레임만 — 남으면 두 실루엣을 청록으로 덮었다.
      anchor: { liftPx: 0 }, poolLifeMs: 50,
      spikeHoldStep: [1, 2],
      farSidePx: 0,
      // 대시는 납작하고 멀리 — 찌르고 지나간 공기가 앞으로 밀린다.
      shock: { fromPx: 14, toPx: 60, arcRad: 42 * DEG, thicknessPx: 8, lifeMs: 140, echoDelayMs: 20, ramp: "cool" },
      skid: { knockbackPx: 68, tauMs: 80, stopPxPerMs: 0.14 },
    },
    struck: {
      coreW: 14, coreH: 14,
      spikes: 0, spikeLengthPx: [0, 0], heroSpikePx: 0, spikeWidthPx: 0, spikeSpreadRad: Math.PI, spikeLifeMs: 0,
      spikeCurve: 0,
      heroTiltRad: 0,
      rings: [],
      debris: 12, debrisCells: [1, 2], debrisSpreadRad: 60 * DEG, debrisAngleRad: -20 * DEG, debrisRadiusPx: 30, debrisGravity: 220, debrisLifeMs: 300,
      debrisCoolChance: 0,
      poolPx: 26, poolAlpha: 0.55, poolRamp: "warm",
      streakRowsPx: [], streakLengthPx: [0, 0],
      splatPx: 0, trail: null,
      anchor: { liftPx: 40 }, poolLifeMs: 33,
      spikeHoldStep: [1, 2],
      farSidePx: 0,
      shock: null,
      skid: null,
    },
  },
};

// ── 요소 ─────────────────────────────────────────────────────────────

interface CombatFxBase {
  readonly bornMs: number;
  readonly lifeMs: number;
}

/** 접촉 코어. 흰 원 두 프레임 → 계단 네모 → 사라짐. */
export interface CombatFxCore extends CombatFxBase {
  readonly kind: "core";
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly rampFrom: number;
  /** 계단 네모 단계에서 더 식히는 칸 수(얼룩이 떠 있으면 1). */
  readonly steppedShift: number;
}

/** 밀랍 → 종이 얼룩. 코어 뒤·조각 위, 보통 합성. 같은 시드라 두 프레임이 같은 모양이다. */
export interface CombatFxSplat extends CombatFxBase {
  readonly kind: "splat";
  readonly x: number;
  readonly y: number;
  readonly radiusPx: number;
  readonly seed: number;
}

/** 올려치기의 궤적: 접점에서 폭 6, 아래-뒤로 가늘어진다. 가산. */
export interface CombatFxTrail extends CombatFxBase {
  readonly kind: "trail";
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly lengthPx: number;
  readonly widthPx: number;
}

/** 코어에서 뻗는 가늘어지는 가시. 가산 합성. */
export interface CombatFxSpike extends CombatFxBase {
  readonly kind: "spike";
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly offsetPx: number;
  readonly lengthPx: number;
  readonly widthPx: number;
  readonly growMs: number;
  readonly ramp: RopeFxRamp;
  /** 버티는 동안의 팔레트 칸. 진행 쪽 반은 1(hotGold), 반대쪽은 2. */
  readonly step: number;
  /** 끝의 옆 비킴(부호 있음, 가시 길이 비율). 0 이면 곧은 쐐기. 양수면 가시 각도가 커지는 쪽으로 휜다. */
  readonly curve: number;
}

/** 퍼지는 다각 고리. 보통 합성. */
export interface CombatFxRing extends CombatFxBase {
  readonly kind: "ring";
  readonly x: number;
  readonly y: number;
  readonly fromPx: number;
  readonly toPx: number;
  readonly thicknessPx: number;
  readonly ramp: RopeFxRamp;
  readonly step: number;
}

/** 격자에 붙은 정사각 조각. 닫힌 식의 탄도라 어느 시각이든 바로 그린다. */
export interface CombatFxDebris extends CombatFxBase {
  readonly kind: "debris";
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly gravity: number;
  readonly drag: number;
  readonly cells: number;
  readonly ramp: RopeFxRamp;
  readonly rampFrom: number;
}

/** 부드러운 가산 빛 웅덩이. 알파가 50ms 마다 반으로 계단져 떨어진다. */
export interface CombatFxPool extends CombatFxBase {
  readonly kind: "pool";
  readonly x: number;
  readonly y: number;
  readonly radiusPx: number;
  readonly alpha: number;
  readonly color: number;
}

/** 대시 접점의 수평 속도선. 보통 합성. */
export interface CombatFxStreak extends CombatFxBase {
  readonly kind: "streak";
  readonly x: number;
  readonly y: number;
  readonly direction: -1 | 1;
  readonly lengthPx: number;
  readonly widthPx: number;
  readonly speedPx: number;
}

/** 넉백 충격파 초승달. 볼록한 등이 `angle` 을 향해 퍼지며 가늘어진다. 가산. */
export interface CombatFxShock extends CombatFxBase {
  readonly kind: "shock";
  /** 초승달 호의 중심. 접점보다 진행 반대쪽에 있어 호가 접점 바로 앞에서 출발한다. */
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly fromPx: number;
  readonly toPx: number;
  readonly arcRad: number;
  readonly thicknessPx: number;
  readonly ramp: RopeFxRamp;
  /** 뒤따르는 작은 메아리면 한 칸 식은 색에서 시작한다. */
  readonly echo: boolean;
}

/**
 * 바닥 미끄럼(보통 합성 + 가산 심). 히트스톱이 풀린 뒤 태어나 맞은 몸의 넉백 따라잡기와 같은
 * 곡선(`KnockbackCurve`)으로 머리가 나아가고(`combatSkidProgress`), 몸이 서는 시각에 그 자리에서
 * 멈춤 고리가 퍼진다.
 */
export interface CombatFxSkid extends CombatFxBase {
  readonly kind: "skid";
  /** 접촉 순간 발 위치(바닥 면). */
  readonly x: number;
  readonly y: number;
  readonly facing: -1 | 1;
  readonly distancePx: number;
  readonly tauMs: number;
  /** 넉백 곡선의 최저 속도(px/ms, `KnockbackCurve`). 맞은 몸과 같은 값이라 머리와 몸이 한 프레임에 선다. */
  readonly stopPxPerMs: number;
  readonly scale: number;
}

export type CombatFxElement =
  | CombatFxCore | CombatFxSpike | CombatFxRing | CombatFxDebris | CombatFxPool | CombatFxStreak | CombatFxSplat | CombatFxTrail
  | CombatFxShock | CombatFxSkid;

export interface CombatHitFxInput {
  readonly tier: CombatHitTier;
  readonly at: FxPoint;
  /** 피격자가 밀려나는 쪽(+1 = 화면 오른쪽). 조각은 이 반구에만 흩어진다. */
  readonly facing: -1 | 1;
  readonly nowMs: number;
  /** 없으면 `combatHitFxSeed(at)`. */
  readonly seed?: number;
  /** 평타 교대 박자. 2 면 조각 +3·코어 +2px·가시 대칭. */
  readonly beat?: 1 | 2 | 3;
  readonly absorbed?: boolean;
  /** 이 시간 안에 모든 요소가 꺼진다(큐의 `LIFE_MS`, 바닥 미끄럼 제외). 없으면 자르지 않는다. */
  readonly budgetMs?: number;
  /** 모든 요소를 이만큼 늦게 태운다(예고장 임팩트 프레임 뒤). */
  readonly delayMs?: number;
  /** 화면 논리 1px 의 월드 길이(`worldUnitsPerLogicalPixel`). 선 굵기에만 곱한다. */
  readonly linePx?: number;
  /** 이 타격이 쓰러뜨렸는가. 쓰러뜨린 피니셔는 예고장 임팩트 프레임이 맡으므로 얼룩을 싣지 않는다. */
  readonly ko?: boolean;
  /**
   * 맞은 몸의 키 ÷ 표준 경비 키(없으면 1). 코어·가시·빛 웅덩이·조각 반경이 이 배율을 따른다
   * (주 가시는 2px 격자로 올림 — 평타 22px → 1.3 배에서 30px). 원점 높이는 그대로, 피니셔 고리·충격파는 키를 따라 커지되 몸 너머로 함께 밀린다(`farSidePx`) —
   * 큰 몸의 이름표(발 위 약 112px)를 고리가 덮지 않게.
   */
  readonly victimScale?: number;
  /**
   * 조각이 튀는 쪽. `both` 면 번갈아 양쪽 반구로 나눈다 — 누가 어느 쪽에서 때렸는지 사건이 싣지 않은
   * 피격(곤봉 한 대)에서, 한쪽으로만 튀면 절반은 틀린 방향이 된다. 없으면 `facing` 쪽만.
   */
  readonly spray?: "facing" | "both";
  /**
   * sim 이 이 타격에 실제로 밀어낸 거리(px). 없으면 티어 기본값(`skid.knockbackPx`). 바닥 미끄럼의
   * 길이만 바꾼다. `at` 은 넉백 전 접촉점(발 − `COMBAT_HIT_CONTACT_LIFT_PX × victimScale`)이어야 한다.
   */
  readonly knockbackPx?: number;
  /**
   * 큐 접점(`at`) 위 레시피 원점까지의 높이(px). 있으면 티어의 `anchor.liftPx` 대신 쓴다 — 주인공 외형·기술마다 잰
   * 실제 주먹·발 높이(`PlayerLookStrikeAnchor`)를 저택 이펙트 큐가 싣는다(2026-10-16). 없으면 티어 기본값.
   */
  readonly contactLiftPx?: number;
}

// ── 난수·격자 ───────────────────────────────────────────────────────

/** 큐 좌표에서 시드를 만든다. 같은 자리의 같은 타격은 같은 폭발이다(리플레이·스냅샷). */
export function combatHitFxSeed(at: FxPoint): number {
  const x = Math.round(at.x) | 0;
  const y = Math.round(at.y) | 0;
  return (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ 0x5eed) >>> 0;
}

const between = (rng: () => number, lo: number, hi: number): number => lo + (hi - lo) * rng();
const rampColor = (ramp: RopeFxRamp, step: number): number =>
  ROPE_FX_RAMPS[ramp][Math.max(0, Math.min(4, Math.floor(step)))]!;

/** 버티는 동안 세 계단으로 꺼지는 알파. 부드럽게 녹이면 회화 위에서 얼룩으로 읽힌다. */
export const COMBAT_FX_STEP_ALPHAS: readonly [number, number, number] = [1, 0.8, 0.6];

// ── 박자 한 번 ──────────────────────────────────────────────────────

/**
 * 레시피가 실제로 터지는 원점. 큐 접점에서 `contactLiftPx`(없으면 티어의 `anchor.liftPx`)만큼 위로, 몸 너머 티어
 * (`farSidePx` > 0)는 맞은 몸의 먼 쪽 실루엣(`victimBody.halfWidthPx × victimScale`)까지 맞은 쪽으로 옮긴 자리다.
 */
export function combatHitFxAnchor(
  input: Pick<CombatHitFxInput, "tier" | "at" | "facing" | "victimScale" | "contactLiftPx">,
  t: CombatHitFxTuning = COMBAT_HIT_FX_TUNING,
): FxPoint {
  const spec = t.tiers[input.tier];
  const far = spec.farSidePx > 0 ? t.victimBody.halfWidthPx * victimScaleOf(input) : 0;
  return { x: input.at.x + input.facing * far, y: input.at.y - (input.contactLiftPx ?? spec.anchor.liftPx) };
}

/**
 * 몸 너머 터짐의 중심(고리·가시·충격파·빛 웅덩이). 먼 쪽 실루엣에서 반응 젖힘(`victimBody.reactionLeanPx`)·
 * 틈(`farSidePx`)·**최대** 고리 반지름만큼 더 — 고리가 가장 커졌을 때도 가까운 가장자리가 젖혀진 등·머리 밖에 선다.
 * 모두 맞은 몸 키(`victimScale`)를 따른다. 몸 너머 티어가 아니면 null.
 */
export function combatHitFxBurstCenter(
  input: Pick<CombatHitFxInput, "tier" | "at" | "facing" | "victimScale" | "contactLiftPx">,
  t: CombatHitFxTuning = COMBAT_HIT_FX_TUNING,
): FxPoint | null {
  const spec = t.tiers[input.tier];
  if (spec.farSidePx <= 0) return null;
  const anchor = combatHitFxAnchor(input, t);
  const ringReach = spec.rings.reduce((reach, ring) => Math.max(reach, ring.toPx), 0);
  const clearance = t.victimBody.reactionLeanPx + spec.farSidePx + ringReach;
  return { x: anchor.x + input.facing * clearance * victimScaleOf(input), y: anchor.y };
}

function victimScaleOf(input: Pick<CombatHitFxInput, "victimScale">): number {
  return Math.max(0.5, input.victimScale ?? 1);
}

/**
 * 접촉 한 번의 요소 묶음. 코어는 가장 먼저 흰색으로, 조각은 코어가 네모로 부서지는 순간
 * (`coreWhiteMs`) 맞은 쪽 반구로만 흩어진다.
 */
export function spawnCombatHitFx(input: CombatHitFxInput, t: CombatHitFxTuning = COMBAT_HIT_FX_TUNING): CombatFxElement[] {
  const spec = t.tiers[input.tier];
  const rng = fxRng(input.seed ?? combatHitFxSeed(input.at));
  const t0 = input.nowMs + Math.max(0, input.delayMs ?? 0);
  const { x, y } = combatHitFxAnchor(input, t);
  const facing = input.facing;
  const travel = facing > 0 ? 0 : Math.PI;
  const absorbed = input.absorbed === true;
  const beat2 = input.beat === 2 && input.tier === "light";
  const rampFrom = absorbed ? t.absorbed.rampFrom : 0;
  const linePx = input.linePx ?? 1;
  const scale = victimScaleOf(input);
  // 몸 너머 터짐(피니셔): 고리·가시·충격파·빛 웅덩이가 실루엣 너머 한 중심에서 솟는다.
  const burst = combatHitFxBurstCenter(input, t);
  const out: CombatFxElement[] = [];

  // 빛 웅덩이 → 코어. 웅덩이는 코어보다 넓고 늦게 꺼져 접점 주변 벽을 잠깐 밝힌다.
  out.push({
    kind: "pool", bornMs: t0, lifeMs: spec.poolLifeMs ?? t.poolHalvingMs * t.poolSteps, x: burst?.x ?? x, y,
    radiusPx: spec.poolPx * scale, alpha: spec.poolAlpha * (absorbed ? 0.5 : 1),
    color: rampColor(spec.poolRamp, absorbed ? t.absorbed.rampFrom : 1),
  });
  const corePad = beat2 ? t.beat2.extraCorePx : 0;
  const coreScale = absorbed ? t.absorbed.corePx / Math.max(spec.coreW, spec.coreH) : 1;
  const coreW = spec.coreW * coreScale * scale + corePad;
  const coreH = spec.coreH * coreScale * scale + corePad;
  // 코어·가시는 공격자 쪽으로 물려 절반쯤 맞은 몸 밖에 걸친다(흰 피격 섬광에 안 묻힌다). 피니셔는 원점이 이미
  // 먼 쪽 실루엣이라 코어를 물리지 않고(물리면 몸통 위다), 가시·충격파는 몸 너머 터짐 중심에서 솟는다.
  const coreX = burst === null ? x - facing * coreW * t.coreBackShare : x;
  const bladeX = burst?.x ?? coreX;
  // 피니셔의 밀랍 얼룩은 쓰러뜨린 한 방에만(2026-09-27). 사슬 완주는 속 빈 고리·곡선 날만 남긴다.
  const splat = spec.splatPx > 0 && !absorbed && (input.tier !== "finisher" || input.ko === true);
  out.push({
    kind: "core", bornMs: t0, lifeMs: t.coreGoneMs, x: coreX, y,
    w: coreW, h: coreH, rampFrom,
    steppedShift: splat ? 1 : 0,
  });
  if (splat) {
    out.push({
      kind: "splat", bornMs: t0 + t.splat.bornMs, lifeMs: t.splat.lifeMs, x, y,
      radiusPx: spec.splatPx, seed: Math.floor(rng() * 0x7fffffff),
    });
  }
  if (spec.trail !== null) {
    // 주먹이 올라온 길: 올려친 방향의 반대(아래-뒤). 몸 너머 터짐이면 터짐 중심에서 — 실루엣에서 그으면 아래-뒤로
    // 맞은 몸 어깨를 가로질렀다(2026-09-27 tension-final2 시트).
    out.push({
      kind: "trail", bornMs: t0, lifeMs: spec.trail.lifeMs, x: burst?.x ?? x, y,
      angle: travel + spec.heroTiltRad * facing + Math.PI,
      lengthPx: spec.trail.lengthPx, widthPx: spec.trail.widthPx,
    });
  }

  // 가시. 주 가시는 진행 방향으로 들리고(피니셔는 올려치기라 -60°), 2타는 수평축 대칭이라
  // 1·2타가 위아래로 교대한다.
  const mirror = beat2 ? -1 : 1;
  const heroTilt = spec.heroTiltRad * facing;
  const order = Array.from({ length: spec.spikes }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  // 좁은 부채꼴의 가운데: 주 가시 방향(진행 + 기울기). 대시는 기울기 0 이라 수평 그대로다.
  const fanCenter = mirrorAngle(travel + heroTilt, mirror);
  const fanSpikes = spec.heroSpikePx > 0 ? spec.spikes - 1 : spec.spikes;
  for (let i = 0; i < spec.spikes; i += 1) {
    const hero = i === 0 && spec.heroSpikePx > 0;
    let angle: number;
    if (spec.spikeSpreadRad >= Math.PI) {
      angle = hero ? travel + heroTilt : travel + heroTilt + (i / spec.spikes) * Math.PI * 2 + (rng() - 0.5) * 0.3;
    } else if (hero) {
      angle = travel + heroTilt;
    } else {
      // 좁은 부채꼴: 가운데 ±spread 를 고르게 나눈다. 가운데가 가장 길다. 주 가시가 있으면 나머지가 양옆을 채운다.
      const n = spec.heroSpikePx > 0 ? i - 1 : i;
      const k = fanSpikes === 1 ? 0.5 : n / (fanSpikes - 1);
      angle = travel + heroTilt + (k - 0.5) * 2 * spec.spikeSpreadRad + (rng() - 0.5) * 0.08;
    }
    angle = mirrorAngle(angle, mirror);
    const fromCenter = normalizedAngle(angle - fanCenter);
    const narrowCenter = spec.spikeSpreadRad < Math.PI ? 1 - Math.abs(fromCenter) / spec.spikeSpreadRad : 0;
    const lengthPx = hero
      ? scale === 1 ? spec.heroSpikePx : Math.ceil(spec.heroSpikePx * scale / FX_GRID_PX) * FX_GRID_PX
      : scale * (spec.spikeSpreadRad < Math.PI
        ? spec.spikeLengthPx[0] + (spec.spikeLengthPx[1] - spec.spikeLengthPx[0]) * Math.max(0, narrowCenter)
        : between(rng, spec.spikeLengthPx[0], spec.spikeLengthPx[1]));
    const travelSide = Math.cos(angle) * facing > 0;
    out.push({
      kind: "spike",
      bornMs: t0 + (hero ? 0 : order[i]! * t.spikeStaggerMs),
      lifeMs: spec.spikeLifeMs + (hero ? 17 : 0),
      x: bladeX, y, angle,
      offsetPx: Math.max(spec.coreW, spec.coreH) * scale * t.spikeOffsetShare,
      lengthPx,
      widthPx: hero ? spec.spikeWidthPx + 2 : spec.spikeWidthPx,
      growMs: t.spikeGrowMs,
      ramp: input.tier === "dash" ? "cool" : "warm",
      step: rampFrom + (travelSide ? spec.spikeHoldStep[0] : spec.spikeHoldStep[1]),
      // 부채꼴 바깥쪽으로 휜다(주 가시는 곧게) — 가운데에서 먼 날일수록 더 벌어진다.
      curve: hero || spec.spikeCurve === 0 ? 0 : spec.spikeCurve * Math.sign(fromCenter),
    });
  }

  // 고리: 반지름은 맞은 몸 키를 따르고(`victimScale`) 몸 너머 터짐 중심에 선다. 큰 몸의 차가운 고리는 따뜻하게.
  const bigVictim = scale > 1;
  for (const ring of spec.rings) {
    const warmed = bigVictim && ring.ramp === "cool";
    out.push({
      kind: "ring", bornMs: t0, lifeMs: ring.lifeMs, x: burst?.x ?? x, y,
      fromPx: ring.fromPx * scale, toPx: ring.toPx * scale, thicknessPx: ring.thicknessPx * linePx,
      ramp: warmed ? "warm" : ring.ramp, step: (warmed ? t.bigVictimRings.coolToWarmStep : ring.step) + rampFrom,
    });
  }

  // 넉백 충격파: 맞은 쪽(피니셔는 올려친 쪽)으로 밀려 나가는 초승달과 뒤따르는 메아리.
  // 흡수된 타격은 몸이 밀리지 않으므로 싣지 않는다.
  if (spec.shock !== null && !absorbed) {
    const shock = spec.shock;
    const angle = travel + spec.heroTiltRad * 0.5 * facing;
    for (const echo of [false, true]) {
      const size = (echo ? 0.72 : 1) * scale;
      const from = shock.fromPx * size;
      // 몸 너머 터짐은 고리와 동심(고리 가장자리에서 바깥으로), 나머지는 접점 바로 앞에서 출발하도록 호 중심을 뒤로 문다.
      const center = burst ?? { x: x - Math.cos(angle) * from * 0.6, y: y - Math.sin(angle) * from * 0.6 };
      out.push({
        kind: "shock", bornMs: t0 + (echo ? shock.echoDelayMs : 0), lifeMs: shock.lifeMs * (echo ? 0.85 : 1),
        x: center.x, y: center.y, angle,
        fromPx: from, toPx: shock.toPx * size, arcRad: shock.arcRad * (echo ? 0.85 : 1),
        thicknessPx: shock.thicknessPx * size * (echo ? 0.6 : 1), ramp: shock.ramp, echo,
      });
    }
  }

  // 2타의 충격파: 맞은 쪽으로 밀려 나가는 작은 초승달 한 겹(메아리 없음). 1타에는 없다.
  if (beat2 && !absorbed) {
    const shock = t.beat2.shock;
    const angle = travel;
    const from = shock.fromPx * scale;
    out.push({
      kind: "shock", bornMs: t0, lifeMs: shock.lifeMs,
      x: x - Math.cos(angle) * from * 0.6, y: y - Math.sin(angle) * from * 0.6, angle,
      fromPx: from, toPx: shock.toPx * scale, arcRad: shock.arcRad,
      thicknessPx: shock.thicknessPx * scale, ramp: shock.ramp, echo: false,
    });
  }

  // 바닥 미끄럼: 접촉(히트스톱) 동안은 몸이 멈춰 있으므로 태어나지 않는다. 히트스톱이 풀리는 효과 나이
  // (히트스톱 × 반속)에 태어나 몸의 넉백 따라잡기와 함께 바닥 면을 긁고, 멈출 때 고리를 남긴다.
  const skidDistance = input.knockbackPx ?? spec.skid?.knockbackPx ?? 0;
  if (spec.skid !== null && !absorbed && skidDistance >= COMBAT_FLOOR_SKID.minPx && input.tier !== "struck") {
    const stopMs = HIT_STOP_BY_TIER[input.tier] * HIT_STOP_FX_RATE;
    out.push({
      kind: "skid", bornMs: t0 + stopMs,
      lifeMs: knockbackStopMs(skidDistance, spec.skid) + COMBAT_FLOOR_SKID.settleRing.lifeMs,
      x: input.at.x, y: input.at.y + COMBAT_HIT_CONTACT_LIFT_PX * scale,
      facing, distancePx: skidDistance, tauMs: spec.skid.tauMs, stopPxPerMs: spec.skid.stopPxPerMs, scale,
    });
  }

  // 조각: 맞은 쪽 반구에만. `debrisRadiusAtMs` 에 반경에 닿도록 항력 해에서 속도를 역산한다.
  const count = absorbed ? t.absorbed.debris : spec.debris + (beat2 ? t.beat2.extraDebris : 0);
  const k = t.debrisDrag;
  const reach = (1 - Math.exp(-k * t.debrisRadiusAtMs / 1000)) / k;
  const baseSpeed = spec.debrisRadiusPx * scale / reach;
  const both = input.spray === "both";
  for (let i = 0; i < count; i += 1) {
    const side: -1 | 1 = both && i % 2 === 1 ? (facing === 1 ? -1 : 1) : facing;
    const center = spec.debrisAngleRad * side;
    // 가운데를 기울여도(피니셔 -40°) 맞은 쪽 반구 밖으로는 내보내지 않는다.
    const offset = Math.max(-HEMISPHERE, Math.min(HEMISPHERE, center + (rng() * 2 - 1) * spec.debrisSpreadRad));
    const a = (side > 0 ? 0 : Math.PI) + offset;
    const v = baseSpeed * between(rng, 0.75, 1.1);
    const [c0, c1] = spec.debrisCells;
    out.push({
      kind: "debris",
      bornMs: t0 + t.coreWhiteMs + Math.floor(rng() * 2) * 8,
      lifeMs: spec.debrisLifeMs * between(rng, 0.8, 1),
      x: x + Math.cos(a) * spec.coreW * scale * 0.25,
      y: y + Math.sin(a) * spec.coreH * scale * 0.25,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      gravity: spec.debrisGravity,
      drag: k,
      cells: Math.round(between(rng, c0, c1)),
      ramp: rng() < spec.debrisCoolChance ? "cool" : "warm",
      rampFrom: rampFrom + 1,
    });
  }

  spec.streakRowsPx.forEach((row, i) => {
    out.push({
      kind: "streak", bornMs: t0 + (i % 2) * 8, lifeMs: t.streakLifeMs,
      x: x + facing * 4 + (rng() * 2 - 1) * t.streakJitterPx, y: y + row, direction: facing,
      lengthPx: between(rng, spec.streakLengthPx[0], spec.streakLengthPx[1]),
      widthPx: 2 * linePx, speedPx: t.streakSpeedPx,
    });
  });

  return input.budgetMs === undefined ? out : clampToBudget(out, input.nowMs + input.budgetMs);
}

/**
 * 큐의 화면 수명 안에 모든 요소가 꺼지도록 자른다. 태어나기 전에 끝나는 요소는 버린다.
 * 바닥 미끄럼은 예외다 — 맞은 몸의 넉백 곡선(τ)과 멈춤 박자에 묶인 바닥 자국이라 접촉 큐의
 * 수명보다 길다. 자르면 멈춤 고리가 퍼지다 끊긴다(대시 360ms 예산에서 고리의 12%만 보였다).
 */
function clampToBudget(elements: CombatFxElement[], endMs: number): CombatFxElement[] {
  const out: CombatFxElement[] = [];
  for (const element of elements) {
    if (element.kind === "skid") {
      out.push(element);
      continue;
    }
    const lifeMs = Math.min(element.lifeMs, endMs - element.bornMs);
    if (lifeMs <= 0) continue;
    out.push(lifeMs === element.lifeMs ? element : { ...element, lifeMs });
  }
  return out;
}

function mirrorAngle(angle: number, mirror: 1 | -1): number {
  return mirror === 1 ? angle : -angle;
}

function normalizedAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

// ── 풀 ─────────────────────────────────────────────────────────────

/**
 * 새 요소를 받아들이고 죽은 요소를 걷는다. 살아 있는(또는 곧 태어날) 조각이 `maxLiveDebris`
 * 를 넘으면 가장 먼저 태어난 조각부터 버린다 — 연타 폭주가 드로우 비용을 밀어 올리지 않게.
 */
export function admitCombatHitFx(
  field: readonly CombatFxElement[],
  incoming: readonly CombatFxElement[],
  nowMs: number,
  maxDebris: number = COMBAT_HIT_FX_TUNING.maxLiveDebris,
): CombatFxElement[] {
  const alive = [...field, ...incoming].filter((element) => nowMs < element.bornMs + element.lifeMs);
  const debris = alive.filter((element) => element.kind === "debris");
  if (debris.length <= maxDebris) return alive;
  const evict = new Set<CombatFxElement>(
    [...debris].sort((a, b) => a.bornMs - b.bornMs).slice(0, debris.length - maxDebris),
  );
  return alive.filter((element) => !evict.has(element));
}

/** 이 묶음이 전부 꺼지는 시각. 시트 CLI 가 몇 프레임을 뽑을지 여기서 정한다. */
export function combatHitFxEndMs(elements: readonly CombatFxElement[]): number {
  return elements.reduce((end, element) => Math.max(end, element.bornMs + element.lifeMs), 0);
}

/** 대시 잔상의 계단 알파. 태어난 뒤 `stepMs` 마다 한 칸씩, 세 칸이 끝나면 사라진다(null). */
export function combatAfterimageAlpha(ageMs: number, t: CombatHitFxTuning = COMBAT_HIT_FX_TUNING): number | null {
  if (ageMs < 0) return null;
  const step = Math.floor(ageMs / t.afterimage.stepMs);
  return t.afterimage.alphas[step] ?? null;
}

// ── 그리기 ──────────────────────────────────────────────────────────

/**
 * 살아 있는 요소를 `nowMs` 시각의 도형으로 푼다. 순서가 곧 판독이다:
 * 빛 → 고리 → 속도선 → 조각 → 가시 → 코어. 코어가 맨 위라 흰 두 프레임이 무엇에도 안 가린다.
 */
export function drawCombatHitFx(elements: readonly CombatFxElement[], nowMs: number, out: FxPrim[] = []): FxPrim[] {
  const pass = (kind: CombatFxElement["kind"], fn: (element: CombatFxElement, age: number, u: number) => void): void => {
    for (const element of elements) {
      if (element.kind !== kind) continue;
      const age = nowMs - element.bornMs;
      if (age < 0 || age >= element.lifeMs) continue;
      fn(element, age, age / element.lifeMs);
    }
  };
  pass("pool", (e, a) => drawPool(e as CombatFxPool, a, out));
  pass("skid", (e, a) => drawSkid(e as CombatFxSkid, a, out));
  pass("ring", (e, _a, u) => drawRing(e as CombatFxRing, u, out));
  pass("shock", (e, a, u) => drawShock(e as CombatFxShock, a, u, out));
  pass("streak", (e, a, u) => drawStreak(e as CombatFxStreak, a, u, out));
  pass("debris", (e, a, u) => drawDebris(e as CombatFxDebris, a, u, out));
  pass("splat", (e, a) => drawSplat(e as CombatFxSplat, a, out));
  pass("trail", (e, _a, u) => drawTrail(e as CombatFxTrail, u, out));
  pass("spike", (e, a) => drawSpike(e as CombatFxSpike, a, out));
  pass("core", (e, a) => drawCore(e as CombatFxCore, a, out));
  return out;
}

function square(cx: number, cy: number, size: number, color: number, additive = false, alpha = 1): FxPolyPrim {
  const x = fxSnap(cx - size / 2);
  const y = fxSnap(cy - size / 2);
  return { kind: "poly", points: [x, y, x + size, y, x + size, y + size, x, y + size], color, alpha, additive };
}

function rect(cx: number, cy: number, w: number, h: number, color: number, additive: boolean): FxPolyPrim {
  const x = fxSnap(cx - w / 2);
  const y = fxSnap(cy - h / 2);
  const sw = Math.max(FX_GRID_PX, fxSnap(w));
  const sh = Math.max(FX_GRID_PX, fxSnap(h));
  return { kind: "poly", points: [x, y, x + sw, y, x + sw, y + sh, x, y + sh], color, alpha: 1, additive };
}

/** 빛 웅덩이 알파: 50ms 마다 반으로. 부드럽게 녹지 않고 계단진다. */
export function combatPoolAlpha(pool: Pick<CombatFxPool, "alpha">, ageMs: number, t: CombatHitFxTuning = COMBAT_HIT_FX_TUNING): number {
  return pool.alpha * 0.5 ** Math.floor(Math.max(0, ageMs) / t.poolHalvingMs);
}

function drawPool(pool: CombatFxPool, age: number, out: FxPrim[]): void {
  out.push({ kind: "light", x: pool.x, y: pool.y, radius: pool.radiusPx, color: pool.color, alpha: combatPoolAlpha(pool, age) });
}

/**
 * 코어: 0~17ms 흰 원 한 프레임, 그 뒤 67ms 까지 따뜻한 불씨 — 식어 가는 둥근 심과 대각 네 방향으로 흩어지는 혜성
 * 불씨. 옛 계단 네모(가운데 네모 + 네 변의 반쪽 네모)는 평평한 도형이라 거부됐다(2026-09-27 이펙트 리뷰).
 */
function drawCore(core: CombatFxCore, age: number, out: FxPrim[]): void {
  const t = COMBAT_HIT_FX_TUNING;
  if (age < t.coreWhiteMs) {
    out.push(fxGridPoly(ellipsePoints(core.x, core.y, core.w / 2, core.h / 2, 12), rampColor("warm", core.rampFrom), 1, true));
    return;
  }
  const u = Math.min(1, (age - t.coreWhiteMs) / Math.max(1, t.coreGoneMs - t.coreWhiteMs));
  const hot = rampColor("warm", core.rampFrom + core.steppedShift + 1);
  const cool = rampColor("warm", core.rampFrom + core.steppedShift + 2);
  const r = Math.max(FX_GRID_PX, Math.min(core.w, core.h) * 0.3 * (1 - 0.5 * u));
  out.push(fxGridPoly(ellipsePoints(core.x, core.y, r, r, 10), hot, 1 - 0.4 * u, true));
  const reach = Math.min(core.w, core.h) * (0.35 + 0.45 * easeOutCubic(u));
  const width = Math.max(FX_GRID_PX, Math.min(core.w, core.h) * 0.22 * (1 - 0.5 * u));
  for (let i = 0; i < 4; i += 1) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    out.push(fxGridPoly(cometPoints(core.x + Math.cos(a) * reach, core.y + Math.sin(a) * reach, a, reach * 0.8, width),
      cool, 1 - 0.5 * u, true));
  }
}

/**
 * 가시: 33ms 에 easeOutCubic 으로 다 솟고(넘치지 않는다), 나머지 수명을 세 계단으로 식는다 —
 * 줄어들지 않고 가늘어진다(폭 ×1/.6/.35, 길이 ×1/1.08/1.15), 계단마다 색 한 칸, 알파도 한 칸.
 * 첫 프레임만 흰색이다.
 */
function drawSpike(spike: CombatFxSpike, age: number, out: FxPrim[]): void {
  const t = COMBAT_HIT_FX_TUNING;
  const grow = Math.min(1, age / Math.max(1, spike.growMs));
  const hold = Math.max(1, spike.lifeMs - spike.growMs);
  const step = age < spike.growMs ? 0 : Math.min(2, Math.floor(((age - spike.growMs) / hold) * 3));
  const length = spike.lengthPx * easeOutCubic(grow) * t.spikeLengthSteps[step]!;
  if (length < FX_GRID_PX) return;
  // 첫 프레임은 버티는 칸보다 한 칸 뜨겁게(흰 칸 0 은 결판 코어 몫 — 가시는 흰색으로 시작하지 않는다).
  const color = age < 17 ? rampColor(spike.ramp, Math.max(1, spike.step - 1))
    : rampColor(spike.ramp, Math.min(SPIKE_COOLEST_STEP, spike.step + step));
  const dx = Math.cos(spike.angle);
  const dy = Math.sin(spike.angle);
  const half = Math.max(FX_GRID_PX, spike.widthPx * t.spikeWidthSteps[step]!) / 2;
  const bx = spike.x + dx * spike.offsetPx;
  const by = spike.y + dy * spike.offsetPx;
  if (spike.curve !== 0) {
    // 곡선 날: 척추가 끝으로 갈수록 옆으로 비키고(s²), 폭은 밑동 가까이에서 가장 두껍게 끝으로 가늘어진다.
    const bend = spike.curve * length;
    const spine = sampleSpine(8, (s) => [
      bx + dx * length * s - dy * bend * s * s,
      by + dy * length * s + dx * bend * s * s,
    ]);
    out.push(fxGridPoly(ribbonPoints(spine, (u) => half * 2 * taper(u, 0.18)), color, COMBAT_FX_STEP_ALPHAS[step], true));
    return;
  }
  out.push(fxGridPoly([
    bx - dy * half, by + dx * half,
    bx + dx * length, by + dy * length,
    bx + dy * half, by - dx * half,
  ], color, COMBAT_FX_STEP_ALPHAS[step], true));
}

/** 가시가 식어 내려갈 수 있는 가장 어두운 칸. 마지막 칸(warm[4])은 회화 위에서 진흙색으로 읽힌다. */
const SPIKE_COOLEST_STEP = 3;
/**
 * 충격파 초승달의 첫 프레임 칸. 0(흰색)이면 흰 초승달이 맞은 몸 상체를 한 프레임 덮었다 — 흰색은 결판 몫이라
 * 첫 프레임부터 금빛 warm[2] 다. warm[1](hotGold)도 화면에서 흰 초승달로 읽혔다(2026-09-27 최종 필름).
 */
const SHOCK_FIRST_STEP = 2;
/** 불씨 꼬리 길이: 조각이 지난 `EMBER_TRAIL_MS` 동안 지나온 거리(최소 한 칸 반). */
const EMBER_TRAIL_MS = 24;

/** 고리 한 토막의 최소 호 길이(px, 출발 반지름 기준). 2px 격자 두 칸 굵기와 함께 토막이 무너지지 않는 바닥. */
const RING_SEGMENT_ARC_PX = 5;

function drawRing(ring: CombatFxRing, u: number, out: FxPrim[]): void {
  const radius = ring.fromPx + (ring.toPx - ring.fromPx) * easeOutCubic(u);
  const step = Math.min(2, Math.floor(u * 3));
  const g = FX_GRID_PX;
  // 굵기도 세 계단으로 한 칸씩 준다. 2px(한 칸)까지 내려가면 안팎 꼭짓점이 같은 격자로 스냅돼
  // 토막이 선으로 무너진다 — 두 칸이 바닥이다.
  const thick = Math.max(2 * g, fxSnap(ring.thicknessPx * (1 - step / 3)));
  const inner = Math.max(0, radius - thick);
  const color = rampColor(ring.ramp, ring.step + step);
  // 토막 수는 출발 반지름의 둘레에서 한 토막 호가 `RING_SEGMENT_ARC_PX` 이상이 되게(짝수, 16‥32). 32 토막은 큰
  // 고리(52px)의 모서리를 지웠지만, 몸 키에 맞춰 줄인 고리(16px 출발)에서는 토막이 격자에 뭉개졌다.
  const sides = Math.min(32, Math.max(16, 2 * Math.floor((Math.PI * ring.fromPx) / RING_SEGMENT_ARC_PX)));
  for (let i = 0; i < sides; i += 1) {
    // 마지막 계단에서 고리가 부서진다: 홀수 토막만(점선).
    if (step === 2 && i % 2 === 0) continue;
    const a0 = (i / sides) * Math.PI * 2;
    const a1 = ((i + 1) / sides) * Math.PI * 2;
    out.push(fxGridPoly([
      ring.x + Math.cos(a0) * radius, ring.y + Math.sin(a0) * radius,
      ring.x + Math.cos(a1) * radius, ring.y + Math.sin(a1) * radius,
      ring.x + Math.cos(a1) * inner, ring.y + Math.sin(a1) * inner,
      ring.x + Math.cos(a0) * inner, ring.y + Math.sin(a0) * inner,
    ], color));
  }
}

/**
 * 바닥 면 위 미끄럼 머리의 진행률(넉백 거리 비율). 맞은 몸의 렌더 넉백 지연(`nextKnockbackLag`)과 같은
 * 곡선(`KnockbackCurve`: 빠르게 나가서 서는 시각에 정확히 1)이다 — 미끄럼도 히트스톱이 풀리는 효과 나이에
 * 태어나므로 머리가 몸의 발밑을 따라가고(프레임 이산화·0.4px 스냅·반동 `recoilX` 만큼의 차이는 있다),
 * 몸과 같은 프레임에 선다.
 */
export function combatSkidProgress(skid: Pick<CombatFxSkid, "tauMs" | "stopPxPerMs" | "distancePx">, ageMs: number): number {
  return knockbackProgress(skid.distancePx, ageMs, skid);
}

/** 미끄럼 머리가 서고 멈춤 고리가 퍼지는 나이(ms). */
export function combatSkidSettleMs(skid: Pick<CombatFxSkid, "tauMs" | "stopPxPerMs" | "distancePx">): number {
  return knockbackStopMs(skid.distancePx, skid);
}

/**
 * 바닥 미끄럼. 바닥 면의 원근 타원이라 2px 격자에 붙이지 않는다 — 세로 2~6px 자국이 격자에서 선으로
 * 무너진다. 이동: 뒤가 가늘고 머리가 굵은 그을음 띠 + 머리의 돌먼지 반타원. 멈춤: 끝에서 납작한
 * 먼지 고리가 퍼지며(가까운 반원이 진하다) 그을음은 계단으로 식는다. 먼지는 차가운 돌색, 열기만 따뜻하다.
 */
function drawSkid(skid: CombatFxSkid, age: number, out: FxPrim[]): void {
  const S = COMBAT_FLOOR_SKID;
  const settleMs = combatSkidSettleMs(skid);
  const p = combatSkidProgress(skid, age);
  const head = skid.distancePx * p;
  const X = (f: number) => skid.x + skid.facing * f;
  const y = skid.y + 1;
  const settled = age >= settleMs;
  const ringU = settled ? (age - settleMs) / S.settleRing.lifeMs : 0;
  // 그을음은 이동 중 두 계단(절반 지점에서 한 칸), 멈춘 뒤 한 계단 더 식어 사라진다.
  const step = settled ? 2 : p < 0.5 ? 0 : 1;
  const scorchAlpha = COMBAT_FX_STEP_ALPHAS[step] * (settled ? 1 - ringU : 1);
  const tail = Math.max(0, head - skid.distancePx * 0.7);
  if (head - tail > 1) {
    const halfW = S.halfWidthPx * skid.scale;
    const band = (w: number) => {
      const top: number[] = [];
      const bottom: number[] = [];
      for (let i = 0; i <= 8; i += 1) {
        const u = i / 8;
        const f = tail + (head - tail) * u;
        const h = w * (0.2 + 0.8 * u) * Math.sin(Math.PI * Math.min(1, 0.15 + u * 0.85));
        top.push(X(f), y - h * 0.45);
        bottom.unshift(X(f), y + h);
      }
      return [...top, ...bottom];
    };
    out.push({ kind: "poly", points: band(halfW * 1.7), color: PALETTE.dark, alpha: 0.35 * scorchAlpha, additive: false });
    out.push({ kind: "poly", points: band(halfW), color: rampColor("warm", 3), alpha: 0.7 * scorchAlpha, additive: false });
    if (!settled) out.push({ kind: "poly", points: band(halfW * 0.4), color: rampColor("warm", 1 + step), alpha: 0.8 * scorchAlpha, additive: true });
  }
  if (!settled) {
    // 머리 먼지: 밀리는 쪽으로 볼록한 가까운 반타원.
    const rx = S.headDustPx * skid.scale * (0.6 + 0.4 * p);
    out.push({ kind: "poly", points: crescentPoints(X(head), y, rx, rx * 0.3, 0, Math.PI, Math.max(1.5, rx * 0.28), 10),
      color: PALETTE.manorIronEdge, alpha: 0.55 * (1 - 0.5 * p), additive: false });
    return;
  }
  const ring = S.settleRing;
  const rx = (ring.fromPx + (ring.toPx - ring.fromPx) * easeOutCubic(ringU)) * skid.scale;
  const ringStep = Math.min(2, Math.floor(ringU * 3));
  const thick = Math.max(1.2, 4 * skid.scale * (1 - ringStep / 3));
  const alpha = COMBAT_FX_STEP_ALPHAS[ringStep]! * 0.7;
  // 고리는 멈춤 박자 순간 몸이 선 자리(머리)에 편다.
  const cx = X(head);
  out.push({ kind: "poly", points: crescentPoints(cx, y, rx, rx * ring.squash, Math.PI, Math.PI * 2, thick * 0.6, 12),
    color: PALETTE.manorIronEdge, alpha: alpha * 0.45, additive: false });
  out.push({ kind: "poly", points: crescentPoints(cx, y, rx, rx * ring.squash, 0, Math.PI, thick, 12),
    color: PALETTE.manorIronEdge, alpha, additive: false });
}

/**
 * 넉백 충격파: easeOutCubic 으로 넘치지 않고 퍼지며, 세 계단으로 가늘어지고 식는다. 첫 프레임만
 * 흰색(메아리는 한 칸 식은 색). 양끝이 바늘처럼 빠지는 초승달이라 고리·판자로 읽히지 않는다.
 */
function drawShock(shock: CombatFxShock, age: number, u: number, out: FxPrim[]): void {
  const step = Math.min(2, Math.floor(u * 3));
  const radius = shock.fromPx + (shock.toPx - shock.fromPx) * easeOutCubic(u);
  const thick = shock.thicknessPx * [1, 0.62, 0.34][step]!;
  if (thick < 1) return;
  const first = shock.echo ? SHOCK_FIRST_STEP + 1 : SHOCK_FIRST_STEP;
  const color = age < 17 ? rampColor(shock.ramp, first) : rampColor(shock.ramp, Math.min(SPIKE_COOLEST_STEP, first + 1 + step));
  const points = crescentPoints(shock.x, shock.y, radius, radius * 0.94,
    shock.angle - shock.arcRad, shock.angle + shock.arcRad, thick, 12, 0.5);
  out.push(fxGridPoly(points, color, COMBAT_FX_STEP_ALPHAS[step], true));
}

/**
 * 대시 속도선 한 줄: 세 토막(앞 40% cool[1] · 30% cool[2] · 뒤 20% cool[3], 4px 틈). 앞머리는
 * 진행 방향으로 흐르고, 알파는 세 계단으로 꺼진다.
 */
function drawStreak(streak: CombatFxStreak, age: number, u: number, out: FxPrim[]): void {
  const t = COMBAT_HIT_FX_TUNING;
  const step = Math.min(2, Math.floor(u * 3));
  const alpha = COMBAT_FX_STEP_ALPHAS[step]! * (step === 2 ? 0.5 : 1);
  const head = streak.x + streak.direction * (streak.speedPx * age) / 1000;
  const w = Math.max(FX_GRID_PX, streak.widthPx);
  let cursor = head;
  t.streakSegments.forEach((share, i) => {
    const length = streak.lengthPx * share;
    const tail = cursor - streak.direction * length;
    const prim = rect((cursor + tail) / 2, streak.y, Math.abs(cursor - tail), w, rampColor("cool", 1 + i), false);
    out.push({ ...prim, alpha });
    cursor = tail - streak.direction * t.streakGapPx;
  });
}

/** 톱니 얼룩의 꼭짓점. 반지름이 1.0/.55 로 번갈며 ±20% 흔들린다(같은 시드 = 같은 모양). */
export function combatSplatPoints(splat: Pick<CombatFxSplat, "x" | "y" | "radiusPx" | "seed">, teeth = COMBAT_HIT_FX_TUNING.splat.teeth): number[] {
  const rng = fxRng(splat.seed);
  const points: number[] = [];
  const n = teeth * 2;
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    const r = splat.radiusPx * (i % 2 === 0 ? 1 : 0.55) * (0.8 + 0.4 * rng());
    points.push(splat.x + Math.cos(a) * r, splat.y + Math.sin(a) * r);
  }
  return points;
}

/** 밀랍 한 프레임(17ms). `splat.lifeMs` 가 더 길면 같은 모양의 종이 프레임이 뒤따른다. */
function drawSplat(splat: CombatFxSplat, age: number, out: FxPrim[]): void {
  const color = age < COMBAT_HIT_FX_TUNING.splat.waxMs ? ROPE_FX_CARD.wax : PALETTE.paper;
  out.push(fxGridPoly(combatSplatPoints(splat), color));
}

/** 올려치기 궤적: 접점에서 가장 굵고 끝으로 가늘어진다. 반을 넘기면 한 칸 식고 알파 .6. */
function drawTrail(trail: CombatFxTrail, u: number, out: FxPrim[]): void {
  const dx = Math.cos(trail.angle);
  const dy = Math.sin(trail.angle);
  const half = trail.widthPx / 2;
  const late = u >= 0.5;
  out.push(fxGridPoly([
    trail.x - dy * half, trail.y + dx * half,
    trail.x + dx * trail.lengthPx, trail.y + dy * trail.lengthPx,
    trail.x + dy * half, trail.y - dx * half,
  // 금빛 warm[2] → warm[3]: hotGold(warm[1]) 궤적은 코어 아래 흰 쐐기로 읽혔다(2026-09-27 최종 필름).
  ], rampColor("warm", late ? 3 : 2), late ? 0.6 : 1, true));
}

/** 선형 항력 + 중력의 닫힌 해. 프레임 누적이 없어 되감아도 같은 자리다. */
export function combatDebrisAt(debris: CombatFxDebris, ageMs: number): FxPoint {
  const a = Math.max(0, ageMs) / 1000;
  const k = debris.drag;
  const f = k > 0 ? (1 - Math.exp(-k * a)) / k : a;
  const fall = k > 0 ? debris.gravity * (a - f) / k : 0.5 * debris.gravity * a * a;
  return { x: debris.x + debris.vx * f, y: debris.y + debris.vy * f + fall };
}

/**
 * 조각의 식음 단계: 수명을 남은 팔레트 칸 수로 나눠, 칸마다 색 한 칸·크기 한 칸씩 동시에 내려간다.
 * 끝 칸은 warm[3]/cool[3] 이다 — 마지막 칸(warm[4])은 회화 위에서 진흙색 얼룩으로 읽혔다.
 */
export function combatDebrisStep(debris: Pick<CombatFxDebris, "rampFrom" | "cells">, u: number): { readonly color: number; readonly step: number; readonly cells: number } | null {
  const notches = Math.max(1, 4 - debris.rampFrom);
  const step = Math.floor(Math.max(0, u) * notches);
  if (step >= notches) return null;
  return { color: debris.rampFrom + step, step, cells: Math.max(1, debris.cells - step) };
}

/**
 * 조각은 혜성 불씨다: 둥근 머리가 날아가는 쪽을 향하고, 지난 `EMBER_TRAIL_MS` 동안 지나온 길로 꼬리가 가늘어진다.
 * 네모 조각은 평평한 도형이라 거부됐다(2026-09-27 이펙트 리뷰). 식음 계단(색·크기)은 그대로다.
 */
function drawDebris(debris: CombatFxDebris, age: number, u: number, out: FxPrim[]): void {
  const state = combatDebrisStep(debris, u);
  if (state === null) return;
  const at = combatDebrisAt(debris, age);
  const back = combatDebrisAt(debris, Math.max(0, age - EMBER_TRAIL_MS));
  const width = state.cells * FX_GRID_PX;
  const travel = Math.hypot(at.x - back.x, at.y - back.y);
  const angle = travel > 1e-3 ? Math.atan2(at.y - back.y, at.x - back.x) : Math.PI / 2;
  out.push(fxGridPoly(cometPoints(at.x, at.y, angle, Math.max(width * 1.5, travel), width), rampColor(debris.ramp, state.color)));
}

// ── 벽 충돌 ─────────────────────────────────────────────────────────

/**
 * 돌진하던 몸이 벽에 부딪힌 자리(`GuardChargeCrashed`). 접촉 폭발은 강타 레시피를 벽 반대쪽(경기장
 * 안)으로 뒤집어 쓰고, 여기서는 벽(기둥 면)에 남는 금 한 줄만 소유한다.
 */
export const CHARGE_CRASH_FX = Object.freeze({
  /**
   * 레시피 원점을 발에서 올리는 높이 — 어깨가 벽에 닿는 자리. 45 는 큰 몸의 배 높이라 폭발이
   * 몸통 한가운데를 덮었다(2026-09-25 보스 필름 #34–38).
   */
  liftPx: 60,
  /**
   * 발 중심에서 레시피 원점까지(벽 쪽). 몸의 반폭(20)이면 폭발이 몸 위에 얹혔다 — 벽 면을 조금 넘겨
   * 고리 절반이 기둥에 걸치고 몸은 안쪽에 드러나게 한다.
   */
  wallOffsetPx: 38,
  /** 금을 기둥 면에서 벽 안쪽으로 들이는 거리. 금은 기둥 몸에 그어져야 "벽에 난 금"이다. */
  crackInsetPx: 6,
  /** 부딪힌 점의 잉크 폭(px). 두 갈래 끝으로 갈수록 1px 까지 가늘어진다. */
  crackInkPx: 3,
  /** 경기장 쪽(빛 쪽)에 붙는 종이색 모서리 폭(px). 어두운 철 위에서 잉크만으로는 안 읽혔다. */
  crackEdgePx: 1,
  /**
   * 위·아래 두 갈래의 꺾인 점(부딪힌 점 기준, x 는 경기장 쪽이 +). 위 32px + 아래 24px = 56px.
   * 곧은 막대는 벽의 이음매로 읽혀 금으로 보이지 않았다.
   */
  crackUp: Object.freeze([[0, 0], [-3, -9], [2, -17], [-2, -26], [1, -32]] as const),
  crackDown: Object.freeze([[0, 0], [3, 8], [-1, 16], [2, 24]] as const),
  /** 알파 계단 [1, 1, .6, .3], 한 칸 133ms. 부드럽게 녹이면 회화 위에서 얼룩으로 읽힌다. */
  crackAlphas: Object.freeze([1, 1, 0.6, 0.3] as const),
  crackStepMs: 133,
});

/**
 * 벽에 남는 금. `at` 은 부딪힌 점(기둥 면 안쪽·어깨 높이), `inward` 는 경기장 쪽 방향, `ageMs` 는
 * 효과 나이. 종이색 모서리를 먼저 깔고 그 위에 잉크를 얹어 빛 쪽에 1px 테두리만 남긴다. 끝나면 빈 목록.
 */
export function chargeCrashCrackPrims(at: FxPoint, ageMs: number, inward: -1 | 1 = 1): FxPrim[] {
  const c = CHARGE_CRASH_FX;
  if (ageMs < 0) return [];
  const alpha = c.crackAlphas[Math.floor(ageMs / c.crackStepMs)];
  if (alpha === undefined) return [];
  const edge: FxPrim[] = [];
  const ink: FxPrim[] = [];
  for (const branch of [c.crackUp, c.crackDown]) {
    const reach = Math.abs(branch[branch.length - 1]![1]);
    const widthAt = (dy: number): number => c.crackInkPx - (c.crackInkPx - 1) * Math.abs(dy) / reach;
    for (let i = 0; i + 1 < branch.length; i += 1) {
      const [x0, y0] = branch[i]!;
      const [x1, y1] = branch[i + 1]!;
      const ax = at.x + inward * x0;
      const bx = at.x + inward * x1;
      const w0 = widthAt(y0) / 2;
      const w1 = widthAt(y1) / 2;
      const quad = (shift: number): number[] => [
        ax - w0 + shift, at.y + y0, ax + w0 + shift, at.y + y0,
        bx + w1 + shift, at.y + y1, bx - w1 + shift, at.y + y1,
      ];
      edge.push({ kind: "poly", points: quad(inward * c.crackEdgePx), color: PALETTE.paper, alpha, additive: false });
      ink.push({ kind: "poly", points: quad(0), color: PALETTE.paperInk, alpha, additive: false });
    }
  }
  return [...edge, ...ink];
}

// ── 휘두름·예비 ──────────────────────────────────────────────────────
//
// 공격 큐(`PlayerAttacked`)는 접촉 순간에 태어난다. 레퍼런스의 "접촉 전" 프레임은 여기서
// 접촉 뒤 첫 프레임부터 같은 길이로 이어 그린다(총 길이는 같다: 평타 67ms, 돌려차기 134ms).
// 전부 보통 합성, 2px 격자. 4갈래 별은 마법·반짝임 전용이라 타격에는 쓰지 않는다 —
// 유일한 예외가 피니셔 예비의 반짝임(`finisherChargeGlintPrims`)이다.

/**
 * 잽·스트레이트의 찌르기 날. 평평한 삼각 쐐기는 거부됐다(2026-09-27 — 전투 VFX 는 곡선·겹층) — 밑동 가까이
 * 가장 두껍고 끝으로 바늘처럼 빠지는, 살짝 위로 휜 리본 날이다. 높이는 주먹(평타 접촉 레시피의
 * `anchor.liftPx` 와 같은 줄)이다 — 허리 높이(발 -18)에서 그리면 주먹 아래 허공을 찔렀다.
 */
export const THRUST_WEDGE = Object.freeze({
  /** 가장 두꺼운 자리(밑동 쪽 `peak`)의 폭(px). */
  baseWidthPx: 8,
  /** 주먹 끝을 넘어 튀어나오는 길이(px). */
  tipOverPx: 4,
  lengthPx: Object.freeze({ 1: 28, 2: 34, 3: 34 } as const),
  /**
   * `PlayerAttacked.at`(발 -18) 기준 높이. 1타는 주먹 높이(-`anchor.liftPx`), 2타는 6px 낮게, 3타(올려치기)는
   * 조금 더 아래에서 -60° 로 솟는다.
   */
  offsetY: Object.freeze({
    1: -COMBAT_HIT_FX_TUNING.tiers.light.anchor.liftPx,
    2: -COMBAT_HIT_FX_TUNING.tiers.light.anchor.liftPx + 6,
    3: -COMBAT_HIT_FX_TUNING.tiers.light.anchor.liftPx - 2,
  } as const),
  /** 팔꿈치(밑동)가 몸 중심에서 떨어진 거리. */
  elbowPx: 6,
  /** 날의 휨(길이 대비 끝의 옆 비킴, 위쪽). 가장 두꺼운 자리(척추 비율). */
  curve: 0.12,
  peak: 0.22,
  frameMs: 33,
});

/**
 * 찌르기 쐐기 두 프레임. F0: 종이색 알파 1, F1: 폭 ×0.5 카드 테두리색 알파 .6, 그 뒤 사라진다.
 * `at` 은 `PlayerAttacked.at`(발 -18px, 허리 높이).
 */
export function thrustWedgePrims(at: FxPoint, facing: -1 | 1, beat: 1 | 2 | 3, ageMs: number): FxPrim[] {
  const w = THRUST_WEDGE;
  const frame = Math.floor(Math.max(0, ageMs) / w.frameMs);
  if (ageMs < 0 || frame > 1) return [];
  const length = w.lengthPx[beat] + w.tipOverPx;
  const angle = beat === 3 ? (facing > 0 ? -60 * DEG : Math.PI + 60 * DEG) : facing > 0 ? 0 : Math.PI;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const bx = at.x + facing * w.elbowPx;
  const by = at.y + w.offsetY[beat];
  const width = w.baseWidthPx * (frame === 0 ? 1 : 0.5);
  // 날은 위(화면 -y)로 휜다: 진행 방향의 왼쪽 법선(-dy, dx)을 위쪽이 되게 고른다.
  const nx = facing > 0 ? dy : -dy;
  const ny = facing > 0 ? -dx : dx;
  const bend = w.curve * length;
  const spine = sampleSpine(8, (s) => [
    bx + dx * length * s + nx * bend * s * s,
    by + dy * length * s + ny * bend * s * s,
  ]);
  return [fxGridPoly(ribbonPoints(spine, (u) => width * taper(u, w.peak)),
    frame === 0 ? PALETTE.paper : ROPE_FX_CARD.edge, frame === 0 ? 1 : 0.6)];
}

/** 돌려차기 초승달 번짐. 엉덩이(발 -38px)를 중심으로 뒤-아래에서 머리 위를 넘어 앞 수평까지. */
export const ROUNDHOUSE_SMEAR = Object.freeze({
  /** `PlayerAttacked.at`(발 -18) 에서 엉덩이(발 -38)까지. */
  hipLiftPx: 20,
  outerPx: 44,
  /** 앞날 두께. 꼬리 60% 에 걸쳐 0 으로 가늘어진다. */
  leadThicknessPx: 14,
  taperShare: 0.6,
  /** 바깥 → 안: warm[0] 2px, 종이 6px, 나머지 카드 테두리색. */
  bandsPx: Object.freeze([2, 4] as const),
  /** 160 → 130(2026-09-26): 꼬리가 머리 위·얼굴 앞을 지나 흰 피격 섬광과 한 덩어리가 됐다 — 어깨 뒤에서 끝낸다. */
  fullArcDeg: 130,
  /**
   * 효과 나이 17ms 한 장. 번짐은 접촉 틱에 태어나 히트스톱(효과 반속) 안에서 재생된다 — 33.5ms 네 장은
   * 화면 약 11 프레임 동안 찬 다리를 덮어 멈춘 접촉 자세가 안 읽혔다(2026-09-26 보스 필름 player-heavy).
   * 이제 화면 약 6 프레임에 끝나고 히트스톱 후반은 다리가 맨몸으로 보인다.
   */
  frameMs: 17,
  /**
   * 접촉 틱의 다리는 이미 끝까지 돌았다: F0 전체 130°(두께 12), F1 꼬리를 먹은 90°(두께 7, 한 칸 식음),
   * F2 앞 60° 에 네모 다섯.
   */
  frames: Object.freeze([
    Object.freeze({ arcDeg: 130, thicknessPx: 12, cool: false }),
    Object.freeze({ arcDeg: 90, thicknessPx: 7, cool: true }),
  ] as const),
  tailSquares: 5,
  tailArcDeg: 60,
});

/**
 * 돌려차기 번짐 세 장(효과 나이 51ms). 오른쪽을 볼 때 앞날은 0°(앞 수평), 꼬리는 -160°(뒤, 머리
 * 위를 넘어온 쪽). 띠는 바깥에서 안으로 warm[0] · 종이 · 카드 테두리, F1 은 한 칸씩 식는다.
 */
export function roundhouseSmearPrims(at: FxPoint, facing: -1 | 1, ageMs: number): FxPrim[] {
  const r = ROUNDHOUSE_SMEAR;
  if (ageMs < 0) return [];
  const frame = Math.floor(ageMs / r.frameMs);
  const cx = at.x;
  const cy = at.y - r.hipLiftPx;
  // 오른쪽 기준 각도(y 아래 양수)를 보는 쪽으로 뒤집는다.
  const point = (deg: number, radius: number): [number, number] => {
    const a = deg * DEG;
    return [cx + Math.cos(a) * radius * facing, cy + Math.sin(a) * radius];
  };
  const out: FxPrim[] = [];
  if (frame === r.frames.length) {
    // 꼬리가 네모 다섯으로 부서진다: 앞 60° 를 따라 2px, 카드 테두리색 .6.
    for (let i = 0; i < r.tailSquares; i += 1) {
      const deg = -(i / (r.tailSquares - 1)) * r.tailArcDeg;
      const [x, y] = point(deg, r.outerPx - 4);
      out.push(square(x, y, FX_GRID_PX, ROPE_FX_CARD.edge, false, 0.6));
    }
    return out;
  }
  const spec = r.frames[frame];
  if (spec === undefined) return [];
  const colors = spec.cool
    ? [PALETTE.paper, ROPE_FX_CARD.edge, PALETTE.paperMuted]
    : [ROPE_FX_RAMPS.warm[0]!, PALETTE.paper, ROPE_FX_CARD.edge];
  // 띠 경계(바깥에서 잰 깊이). 마지막 띠는 그 자리 두께까지.
  const bandEdges = [0, r.bandsPx[0], r.bandsPx[0] + r.bandsPx[1]];
  const segments = 12;
  const arc = spec.arcDeg;
  for (let band = 0; band < 3; band += 1) {
    for (let i = 0; i < segments; i += 1) {
      // 앞날(0°)에서 꼬리(-arc)로. 두께는 앞 40% 는 그대로, 꼬리 60% 에서 0 으로.
      const u0 = i / segments;
      const u1 = (i + 1) / segments;
      const thick = (u: number): number => {
        const k = u <= 1 - r.taperShare ? 1 : Math.max(0, 1 - (u - (1 - r.taperShare)) / r.taperShare);
        return spec.thicknessPx * k;
      };
      const depth = (u: number, edge: number): number => Math.min(thick(u), edge);
      const from0 = depth(u0, bandEdges[band]!);
      const from1 = depth(u1, bandEdges[band]!);
      const to0 = band === 2 ? thick(u0) : depth(u0, bandEdges[band + 1]!);
      const to1 = band === 2 ? thick(u1) : depth(u1, bandEdges[band + 1]!);
      if (to0 - from0 <= 0.01 && to1 - from1 <= 0.01) continue;
      const d0 = -u0 * arc;
      const d1 = -u1 * arc;
      const [ax, ay] = point(d0, r.outerPx - from0);
      const [bx, by] = point(d1, r.outerPx - from1);
      const [cx1, cy1] = point(d1, r.outerPx - to1);
      const [dx0, dy0] = point(d0, r.outerPx - to0);
      out.push(fxGridPoly([ax, ay, bx, by, cx1, cy1, dx0, dy0], colors[band]!));
    }
  }
  return out;
}

/** 피니셔 예비의 반짝임 — 주먹 위, 접촉 100ms 전부터 33ms 씩 세 프레임(6 → 12 → 6px). */
export const FINISHER_GLINT = Object.freeze({
  leadMs: 100,
  frameMs: 33.4,
  /** 프레임별 배율(가운데 프레임이 세로 팔 12·가로 팔 8). */
  scales: Object.freeze([0.5, 1, 0.5] as const),
  verticalArmPx: 12,
  horizontalArmPx: 8,
  armWidthPx: 2,
  centerPx: 4,
  /** 주먹 위치: 몸 중심에서 앞으로, 발에서 위로. */
  fistForwardPx: 16,
  fistLiftPx: 40,
});

/**
 * 반짝임 한 프레임. `msToContact` 는 접촉까지 남은 sim 시간(`playerCombat.attackContactMs`),
 * `feet` 는 플레이어 발. 가운데 4×4 warm[0], 팔은 cool[1], 가산 합성. 창 밖이면 빈 목록.
 */
export function finisherChargeGlintPrims(msToContact: number, feet: FxPoint, facing: -1 | 1): FxPrim[] {
  const g = FINISHER_GLINT;
  if (!(msToContact > 0) || msToContact > g.leadMs) return [];
  const frame = Math.min(2, Math.floor((g.leadMs - msToContact) / g.frameMs));
  const scale = g.scales[frame]!;
  const x = fxSnap(feet.x + facing * g.fistForwardPx);
  const y = fxSnap(feet.y - g.fistLiftPx);
  const v = Math.max(FX_GRID_PX, fxSnap(g.verticalArmPx * scale));
  const h = Math.max(FX_GRID_PX, fxSnap(g.horizontalArmPx * scale));
  const arm = g.armWidthPx;
  const armColor = ROPE_FX_RAMPS.cool[1]!;
  const box = (x0: number, y0: number, w: number, hh: number, color: number): FxPolyPrim =>
    ({ kind: "poly", points: [x0, y0, x0 + w, y0, x0 + w, y0 + hh, x0, y0 + hh], color, alpha: 1, additive: true });
  return [
    box(x - arm / 2, y - v, arm, v * 2, armColor),
    box(x - h, y - arm / 2, h * 2, arm, armColor),
    box(x - g.centerPx / 2, y - g.centerPx / 2, g.centerPx, g.centerPx, ROPE_FX_RAMPS.warm[0]!),
  ];
}
