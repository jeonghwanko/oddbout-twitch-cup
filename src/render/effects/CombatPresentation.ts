import type { AttackTier } from "../../sim/AttackMoves";
import type { SimEvent } from "../../sim/types";
import { consumeDuelFreeze } from "../../sim/duel/DuelClock";
import { weaponModHitStopMs, weaponModPayoffStopMs } from "./WeaponModFeel.ts";

/**
 * 렌더 전용 공격 무게. sim 의 4티어에 "퍼펙트 반격"을 더해 연출 강도를 한 표에서 고른다.
 * counter 는 sim 의 공격 종류가 아니라 반격 성공이라는 사건이므로 여기서만 존재한다.
 */
export type PresentationTier = AttackTier | "counter";

/**
 * 티어별 히트스톱의 프로젝트 조정값. 예비·회수 시간은 AttackMoves가 소유하고,
 * 이 표는 접촉 순간의 강조만 소유한다. 외부 게임의 표준 수치를 뜻하지 않는다.
 */
export const HIT_STOP_BY_TIER: Record<PresentationTier, number> = Object.freeze({
  // 평타는 네 프레임(약 67ms) 고정. 멈추는 것은 배우의 자세뿐이고 이펙트는 반속으로 흐른다.
  light: 67,
  heavy: 133,
  // 150 → 140(2026-09-27): 피니셔가 150 으로 내려와 "무게 순서대로 멈춘다" 를 지키려 ms 만 내린다 — 60Hz 에서
  // 그대로 9 프레임이다.
  dash: 140,
  // 183 → 150(2026-09-27 C-C-C 캡처): 11 프레임 멈춤 동안 접촉 VFX 가 두 몸을 덮은 채 굳었다. 9 프레임 —
  // 뒤따르는 슬로모(`COMBAT_SLOW_MO.finisher`)가 무게를 잇는다. 1·2타(50·83)와의 계단은 그대로다.
  finisher: 150,
  // 167 → 140: 반격은 결말이 아니라 기회라 피니셔보다 짧게 멈춘다(피니셔가 150 으로 내려와 함께 내린다).
  counter: 140,
});

/**
 * 사슬 평타의 박자별 멈춤. 같은 경량 67ms 를 1·2타가 나눠 쓰면 두 타격이 복사본처럼 읽혔다(2026-09-26 애니메이터
 * 리뷰) — 잽은 세 프레임(50)으로 튕기고 스트레이트는 다섯 프레임(83)으로 한 단 무겁게, 피니셔(150)로 올라간다.
 * sim 접촉·취소 창은 그대로고 화면 시간만 ±17ms 다. 박자는 같은 스텝의 `ComboConfirmed` 가 싣는다.
 */
export const LIGHT_CHAIN_HIT_STOP_MS: Readonly<Record<1 | 2, number>> = Object.freeze({ 1: 50, 2: 83 });

/** 히트스톱 잔여를 한 프레임만큼 줄인다. 게임(HeistScene)과 애니메이션 실험실이 같은 식을 쓴다. */
export function nextHitStopMs(remainingMs: number, dtMs: number): number {
  return consumeDuelFreeze(remainingMs, dtMs).remainingMs;
}

/** 타격 한 번(CombatHit)이 세계를 멈출 수 있는 상한. 처벌·벽 충돌이 겹쳐도 조작을 오래 묶지 않는다. */
const HIT_STOP_CAP_MS = 200;
/** 같은 프레임에 추가로 맞은 사람 1명당 더하는 시간. 합산이 아니라 인원수 가산이다. */
const MULTI_VICTIM_BONUS_MS = 18;
const MULTI_VICTIM_CAP_MS = 260;
/** 모션 감소에서도 "맞았다"는 판독은 남긴다. 12ms 정지는 프레임 하나라 안 보인다. */
const REDUCED_MOTION_FLOOR_MS = 24;
const DEFEATED_FLOOR_MS = 140;
/**
 * 공개 결투 상대(금고지기)의 쓰러짐. 마지막 체력은 보통 잽으로 깎이는데, 그 한 방이 평타 무게로
 * 멈추면 보스전의 결말이 일반 경비 쓰러짐보다 가볍게 읽혔다(2026-09-25 보스 필름 리뷰).
 */
export const ENCOUNTER_BOSS_KO_FLOOR_MS = 217;

/**
 * 적의 공격이 플레이어에게 닿은 순간. 티어가 없으면 곤봉 한 대(110ms)다 — 보스처럼 공격마다
 * 무게가 다른 적만 티어를 싣는다. 휩쓸기(heavy)는 곤봉과 같고, 돌진(dash)은 몸째 부딪혀 더 길다.
 */
export const PLAYER_STRUCK_HIT_STOP_MS = Object.freeze({ club: 110, heavy: 110, dash: 150 });

/** 돌진하던 적이 벽에 몸째 부딪힌 순간(`GuardChargeCrashed`). 일반 벽꿍보다 짧은 반격 기회다. */
export const CHARGE_CRASH_HIT_STOP_MS = 133;

/** 카메라 한 박자. 흔들림·덜컹·밀기 모두 px 단위다. */
export interface CombatCameraBeat {
  /**
   * 흔들림 첫 진폭(화면 px). `CameraRig.shakePx` 가 그대로 화면 px 로 흔들고 (1−t)² 로 잦아든다.
   * 2026-09-25 전까지는 화면 높이 비율로 Phaser 흔들림에 넘겨 1.7 배율에서 약 3 배로 흔들렸다.
   */
  readonly shakePx: number;
  readonly durationMs: number;
  /** 카메라 롤(rad). 0 이면 굴리지 않는다. */
  readonly rollRad: number;
  /** 타격 방향으로 카메라를 미는 거리(px). */
  readonly pushPx: number;
  /** 타격 방향으로 한 프레임만 튀는 덜컹(px). 0 이면 없다. 흔들림 대신 방향이 있는 한 번. */
  readonly jerkPx: number;
  /**
   * 펀치 줌 배율. 1 이면 없다. `zoomInMs` 에 당기고 `zoomOutMs` 에 걸쳐 easeOutCubic 으로
   * 돌아온다. 모션 감소에는 없다 — 카메라 리그의 금지 구간(`quiet`)이 거른다(2026-10-18: 한 단 낮춘 모션 감소 배율은
   * 리그가 막아 한 번도 재생되지 않던 값이라 지웠다).
   */
  readonly zoom: number;
  readonly zoomInMs: number;
  readonly zoomOutMs: number;
}

/** 덜컹 한 프레임(60fps). */
export const COMBAT_CAMERA_JERK_MS = 17;

/**
 * 티어별 카메라. 흔들림만으로는 약·강이 구분되지 않아 대시·피니시·반격에만
 * 롤과 밀기를 준다 — 화면 자체가 타격 방향으로 기울어야 무게가 읽힌다.
 */
export type CombatCameraBeatId =
  | PresentationTier
  | "blocked"
  /** 돌진하던 적이 벽에 부딪힘. 벽 쪽 덜컹 11px + 흔들림 + 롤. */
  | "crash"
  /** 플레이어가 휩쓸기(heavy)에 맞음. 흔들림만 — 밀기·덜컹은 맞은 쪽 판독을 흐린다. */
  | "struckHeavy"
  /** 플레이어가 돌진(dash)에 맞음. 더 센 흔들림 + 작은 펀치 줌. */
  | "struckDash"
  /**
   * 사슬 2타(스트레이트). 1타(`light`)와 같은 밀기면 두 타격이 복사본이다 — 조금 더 길게 밀고 타격 방향으로
   * 한 프레임 2px 덜컹을 더한다. 박자는 같은 스텝의 `ComboConfirmed` 가 싣는다.
   */
  | "lightChain2"
  /** 큰 보스에게 들어간 평타. 네 번 연타에 3px 밀기가 누적되면 화면이 흐른다 — 덜컹 2px 한 번. */
  | "keeperLight"
  /** 쓰러진 보스 몸이 바닥에 닿는 두 번째 박자(엎드림 칸이 뜨는 프레임). 쿵 흔들림 + 짧은 정지(`KEEPER_FLOOR_BEAT`). */
  | "keeperFloor"
  /** 금고지기 결판. 피니셔 카메라에 전투에서 가장 큰 흔들림(10px) — 결말은 한 번뿐이다. */
  | "keeperKo";

export const COMBAT_CAMERA: Record<CombatCameraBeatId, CombatCameraBeat> = Object.freeze({
  // 평타는 흔들지 않는다 — 네 번 연타에 매번 화면이 떨면 판독이 무너진다. 1타는 밀기 2px/60ms 만,
  // 2타(`lightChain2`)는 3px/80ms + 덜컹 2px — 박자마다 한 단 무거워진다(2026-09-27). 카메라가 살아 있는
  // 씬(저택·금고지기 결투)에서만 보인다.
  light: { shakePx: 0, durationMs: 60, rollRad: 0, pushPx: 2, jerkPx: 0, zoom: 1, zoomInMs: 0, zoomOutMs: 0 },
  lightChain2: { shakePx: 0, durationMs: 80, rollRad: 0, pushPx: 3, jerkPx: 2, zoom: 1, zoomInMs: 0, zoomOutMs: 0 },
  // 강타: 타격 방향 8px 덜컹 한 프레임으로 무게를 옮긴다.
  heavy: { shakePx: 5, durationMs: 180, rollRad: 0, pushPx: 7, jerkPx: 8, zoom: 1, zoomInMs: 0, zoomOutMs: 0 },
  dash: { shakePx: 7, durationMs: 170, rollRad: 0.007, pushPx: 9, jerkPx: 0, zoom: 1, zoomInMs: 0, zoomOutMs: 0 },
  // 피니시: 밀기 13px, 타격 프레임에 1.07 로 한 번에 당겨(zoomInMs 0) 멈춤 내내 그 배율로 붙들고, 풀린 뒤
  // 280ms easeOutCubic 으로 돌아온다. 45ms 에 당기던 때는 멈춤이 밀기·롤·줌을 함께 세운 뒤(2026-09-26) 줌 정점이
  // 풀린 뒤 67ms 에 따로 와서 섬광·별·줌·롤이 네 번 따로 치솟았다(애니메이터 리뷰) — 줌은 섬광과 한 프레임이다.
  finisher: { shakePx: 8, durationMs: 230, rollRad: 0.012, pushPx: 13, jerkPx: 0, zoom: 1.07, zoomInMs: 0, zoomOutMs: 280 },
  // 완벽 반격: 피니셔(8px) 아래, 강타(5px) 위. 10px 일 때는 반격이 3타 결판보다 세게 흔들렸다(2026-10-18 점검).
  counter: { shakePx: 6, durationMs: 210, rollRad: 0.009, pushPx: 8, jerkPx: 0, zoom: 1.03, zoomInMs: 40, zoomOutMs: 220 },
  blocked: { shakePx: 1.5, durationMs: 70, rollRad: 0, pushPx: 1, jerkPx: 0, zoom: 1, zoomInMs: 0, zoomOutMs: 0 },
  // 벽 충돌: 벽 쪽으로 11px 덜컹, 8px/190ms 흔들림, 0.6° 롤. 밀기는 없다 — 몸이 멈춘 사건이다. 돌진을 피해 낸
  // 보상 박자라 1.05 로 40ms 에 당겨 240ms 에 푼다(2026-09-27 리뷰 — 흔들림만으로는 "해냈다" 가 안 읽혔다).
  crash: { shakePx: 8, durationMs: 190, rollRad: 0.012, pushPx: 0, jerkPx: 11, zoom: 1.05, zoomInMs: 40, zoomOutMs: 240 },
  struckHeavy: { shakePx: 4, durationMs: 120, rollRad: 0, pushPx: 0, jerkPx: 0, zoom: 1, zoomInMs: 0, zoomOutMs: 0 },
  struckDash: { shakePx: 6, durationMs: 160, rollRad: 0, pushPx: 0, jerkPx: 0, zoom: 1.04, zoomInMs: 40, zoomOutMs: 200 },
  keeperLight: { shakePx: 0, durationMs: 90, rollRad: 0, pushPx: 0, jerkPx: 2, zoom: 1, zoomInMs: 0, zoomOutMs: 0 },
  // 쓰러진 몸이 바닥에 닿는 쿵: 4px/180ms. 옛 1.5–2px/100ms 는 몸이 아직 선 채로(고정 450ms) 울려 안 읽혔다.
  keeperFloor: { shakePx: 4, durationMs: 180, rollRad: 0, pushPx: 0, jerkPx: 0, zoom: 1, zoomInMs: 0, zoomOutMs: 0 },
  keeperKo: { shakePx: 10, durationMs: 270, rollRad: 0.012, pushPx: 13, jerkPx: 0, zoom: 1.07, zoomInMs: 45, zoomOutMs: 280 },
});

/**
 * 연출이 카메라를 잠깐 빌리는 컷(`CameraRig.pushShot`). 흔들림·줌 강조와 달리 구도 자체를 옮긴다.
 * `logicalZoom` 은 렌더 배율 전의 절대 배율, `zoomScale` 은 지금 기본 구도에 곱하는 배율이다.
 */
export interface CombatCameraShot {
  readonly logicalZoom?: number;
  readonly zoomScale?: number;
  /** 모션 감소에서 쓰는 `zoomScale`. 없으면 모션 감소에서 이 컷을 걸지 않는다. */
  readonly reducedZoomScale?: number;
  readonly inMs: number;
  readonly holdMs: number;
  readonly outMs: number;
}

export const COMBAT_CAMERA_SHOTS = Object.freeze({
  // 금고지기 등장: 두 배우의 가운데로 한 단 물러나(1.7 → 1.45) 둘을 한 화면에 세운다. 등장 연출(900ms)이
  // 끝나고도 한 박자 더(합 1150ms) 붙들어 이름표를 읽게 한 뒤, 보스 쪽으로 기운 교전 구도
  // (`KEEPER_ENCOUNTER_FRAMING`)로 풀린다. 400ms 는 등장 도중 풀려 보스가 화면 끝에 걸렸다.
  keeperIntro: { logicalZoom: 1.45, inMs: 250, holdMs: 900, outMs: 250 },
  // 금고지기 쓰러짐: 결판 카메라 뒤에 보스 쪽으로 1.08 배 당겨 쓰러지는 몸을 붙든다. 바닥 박자(450ms)와
  // 먼지가 가라앉을 때까지 1000ms 를 붙든다 — 650ms 는 몸이 닿자마자 풀려 결말이 서둘렀다.
  keeperKo: { zoomScale: 1.08, reducedZoomScale: 1.02, inMs: 180, holdMs: 1000, outMs: 500 },
} satisfies Record<string, CombatCameraShot>);

/**
 * 쓰러진 보스 몸이 바닥에 닿는 두 번째 박자. 쿵(`COMBAT_CAMERA.keeperFloor` + `hitStopMs`)은 쓰러짐 원화가 엎드림
 * 칸에 닿는 프레임에 씬이 건다(`GuardView.consumeBodyLandings`). `delayMs` 는 먼지 큐의 고정 지연(쓰러짐 프레임
 * 기준 이펙트 ms)으로만 남는다.
 */
export const KEEPER_FLOOR_BEAT = Object.freeze({
  delayMs: 450,
  /** 몸이 바닥에 닿는 프레임의 짧은 정지. */
  hitStopMs: 50,
  dustScale: 1.4,
  /** 먼지 두 번, 67ms 간격. */
  dustGapMs: 67,
  /**
   * 먼지는 바닥 박자보다 100ms 늦게, 알파 ⅔ 로(흰 연기 플립북 .9 → 약 .6) 인다. 박자와 함께 짙게
   * 피우면 쓰러지는 몸이 흰 연기에 덮였다(2026-09-25 보스 필름 #27–40).
   */
  dustLagMs: 100,
  dustOpacity: 0.67,
});

/**
 * 판정과 무관한 전투 히트스톱.
 *
 * 가장 강한 사건 하나만 골라 같은 스텝의 CombatHit + CombatDefeated가 시간을 두 번
 * 멈추지 않게 한다. sim은 정지한 렌더 프레임 동안 전진하지 않아 리플레이 결과가 바뀌지 않는다.
 */
export function combatHitStopMs(
  events: readonly SimEvent[],
  reducedMotion: boolean,
  grandEscapeActive = false,
  /** 공개 결투 상대인가(`isEncounterBoss`). 이 파일은 시트 CLI 가 node 로 읽어 sim 값을 가져오지 않는다. */
  encounterBoss: (guardId: string) => boolean = () => false,
): number {
  let durationMs = 0;
  const victims = new Set<string>();
  const chainBeats = new Map<string, 1 | 2>();
  for (const event of events) if (event.kind === "ComboConfirmed") chainBeats.set(event.guardId, event.combo);
  for (const event of events) {
    // 탈출 2막의 자동 연쇄는 배경에서 진행된다. 장치마다 세계를 멈추면
    // 사다리 입력과 무관한 NPC까지 반복 정지한다. 실제 전투 타격은 그대로 읽는다.
    if (grandEscapeActive && event.kind === "CaperDeviceTriggered") continue;
    const candidate = durationFor(event, encounterBoss, chainBeats);
    if (candidate > durationMs) durationMs = candidate;
    for (const id of victimIds(event)) victims.add(id);
  }
  if (durationMs === 0) return 0;
  // 합산은 여전히 금지 — 기준은 가장 강한 한 번이다. 다만 한 프레임에 여러 명이
  // 날아가는데 한 명일 때와 똑같이 멈추면 다수전의 무게가 사라지므로 인원수만큼만 얇게 더한다.
  const crowdMs = Math.max(0, victims.size - 1) * MULTI_VICTIM_BONUS_MS;
  const totalMs = Math.min(MULTI_VICTIM_CAP_MS, durationMs + crowdMs);
  if (!reducedMotion) return totalMs;
  return Math.max(REDUCED_MOTION_FLOOR_MS, Math.round(totalMs * 0.45));
}

function durationFor(
  event: SimEvent,
  encounterBoss: (guardId: string) => boolean,
  chainBeats: ReadonlyMap<string, 1 | 2> = new Map(),
): number {
  switch (event.kind) {
    case "CaperDeviceTriggered": return 24 + event.chainIndex * 10;
    case "CombatDefeated":
      return Math.max(tierStopMs(event), encounterBoss(event.guardId) ? ENCOUNTER_BOSS_KO_FLOOR_MS : DEFEATED_FLOOR_MS);
    // HP metadata shares the same impact: PlayerStruck owns hit-stop and sound.
    case "PlayerDamaged": return 0;
    case "PlayerStruck":
      return event.tier === "dash" ? PLAYER_STRUCK_HIT_STOP_MS.dash
        : event.tier === "heavy" ? PLAYER_STRUCK_HIT_STOP_MS.heavy
          : PLAYER_STRUCK_HIT_STOP_MS.club;
    case "GuardChargeCrashed": return CHARGE_CRASH_HIT_STOP_MS;
    case "PerfectCounter": return HIT_STOP_BY_TIER.counter;
    case "ComboFinisherLaunched": return HIT_STOP_BY_TIER.finisher;
    // 짧은 판독 정지 뒤 같은 자리의 금색 반격 표식으로 넘긴다. 타격 정지보다 짧아
    // 구르기의 흐름은 살리면서도 성공 순간을 놓치지 않게 한다.
    case "PerfectDodge": return 56;
    // 170 → 140(2026-09-27): 피니셔(150)보다 짧게 — 벽에 박힌 피니셔는 피니셔의 멈춤을 쓴다.
    case "GuardWallSlammed": return 140;
    case "GuardChainShoved": return 90;
    case "CombatHit": return combatHitStop(event, chainBeats.get(event.guardId));
    // 밀치기 자체는 같은 프레임의 CombatHit 이 이미 티어만큼 멈춘 뒤의 부수 사건이다.
    case "GuardShoved": return 60;
    case "CombatBlocked": return 40;
    case "GuardGrazed": return 20;
    // 단도가 일반 경비를 세운 순간(전투 상대는 같은 스텝의 CombatHit 이 티어로 멈춘다). 판금 막기(40)보다 무겁다.
    case "DaggerDazed": return DAGGER_DAZED_HIT_STOP_MS;
    // 괴도 무기 개조: 무게 하나에서 로그 보간한 멈춤(`WeaponModFeel`). 잠입 개조는 0 — 숨는 흐름을 끊지 않는다.
    case "WeaponModTriggered": return weaponModHitStopMs(event.mod);
    default: return 0;
  }
}

/**
 * 강타 한 번의 멈춤 상한. 처벌 +20·벽 +30 이 겹치면 183ms(11–12 프레임)로 늘어 "끊어진 멈춤" 이 아니라
 * "입력이 먹힌 정지" 로 읽혔다(2026-09-26 애니메이터 리뷰). 9 프레임 — 평타(4)의 두 배를 넘는 무게는 그대로다.
 */
export const HEAVY_HIT_STOP_CAP_MS = 150;

/** 단도 명중 멈춤(60Hz 세 프레임) — 경비 "빡" 별(`ThrownToolFx`)이 정지 안에서 선다. */
export const DAGGER_DAZED_HIT_STOP_MS = 50;

/** 무기 빈틈을 닫은 첫 타격에 더하는 멈춤(60Hz 두 프레임). */
export const TOOL_CASH_EXTRA_STOP_MS = 33;

function combatHitStop(event: Extract<SimEvent, { kind: "CombatHit" }>, chainBeat: 1 | 2 | undefined): number {
  const tier = event.tier ?? "light";
  let durationMs = tier === "light" && chainBeat !== undefined ? LIGHT_CHAIN_HIT_STOP_MS[chainBeat] : HIT_STOP_BY_TIER[tier];
  if (event.punish) durationMs += 20;
  if (event.wallHit === true) durationMs += 30;
  if (event.tier === "heavy") durationMs = Math.min(HEAVY_HIT_STOP_CAP_MS, durationMs);
  // 무기가 연 빈틈을 닫은 첫 타격(`ToolCashLedger`)은 두 프레임 더 붙든다. 여는 쪽(올가미 50ms)보다 닫는 쪽
  // (잽 50 + 처벌 20 + 33 = 103ms)이 확실히 무거워야 보상이 준비 동작보다 크게 읽힌다(2026-09-29 애니메이터 리뷰).
  // 강타 상한 **뒤에** 더한다 — 앞에 더하면 V 로 닫은 빈틈이 상한(150)에 잘려 보통 강타와 똑같이 멈췄다(적대적 리뷰).
  if (event.toolOpening === true) durationMs += TOOL_CASH_EXTRA_STOP_MS;
  // 개조의 결과 타격(반격 단도의 박힘)은 그 개조의 무게로 멈춘다 — 던지는 순간이 아니라 박히는 순간이 절정이다.
  if (event.viaMod !== undefined) durationMs = Math.max(durationMs, weaponModPayoffStopMs(event.viaMod));
  // 경직 저항이 먹은 타격은 화면도 절반만 멈춘다. 같은 시간 멈추면 "막혔다"가 안 읽힌다.
  if (event.absorbed === true) durationMs *= 0.55;
  return Math.min(HIT_STOP_CAP_MS, Math.round(durationMs));
}

/** sim 이 아직 티어를 채우지 않은 사건도 그대로 읽는다. 없으면 약공으로 본다. */
function tierStopMs(event: SimEvent): number {
  const tier = (event as { readonly tier?: AttackTier }).tier;
  return HIT_STOP_BY_TIER[tier ?? "light"];
}

/**
 * 이 프레임에 실제로 맞은 몸. 플레이어 피격(`PlayerStruck`)의 guardId 는 때린 쪽이라
 * 세지 않는다 — 다수 피격 가산은 "여러 명이 동시에 날아갔다"에만 붙는다.
 */
function victimIds(event: SimEvent): readonly string[] {
  switch (event.kind) {
    case "CombatHit":
    case "CombatDefeated":
    case "DaggerDazed":
    case "GuardShoved":
    case "GuardWallSlammed":
    case "GuardChargeCrashed":
      return [event.guardId];
    case "GuardChainShoved":
      return event.guardIds;
    // 개조가 넘어뜨리거나 끌어온 몸도 "맞은 몸" 이다 — 연쇄 올가미로 셋이 넘어지면 인원수만큼 얇게 더 멈춘다.
    // 멈추지 않는 개조(잠입·떨어진 제어)는 세지 않는다 — 딱총에 멀리서 둘이 넘어졌다고 옆 평타가 더 멈추면 안 된다.
    case "WeaponModTriggered":
      return event.guardId !== undefined && weaponModHitStopMs(event.mod) > 0 ? [event.guardId] : [];
    default:
      return [];
  }
}
