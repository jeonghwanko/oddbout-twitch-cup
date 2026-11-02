/**
 * 플레이어 무브 표.
 *
 * 적의 공격은 이미 `GuardArchetypes.CombatProfile` 이라는 콘텐츠 표에 있는데, 플레이어
 * 평타만 타이밍은 튜닝에, 피해·경직·넉백은 `combo === 3 ?` 코드 분기에 흩어져 있었다.
 * 그래서 타수 하나의 성격을 바꾸려면 서로 다른 파일 여덟 곳을 찾아다녀야 했고,
 * 캐릭터별 무브셋이나 보스 패턴은 시작할 수조차 없었다.
 *
 * 여기 있는 것은 개체별 무브 정의다. 전역 전투 계수(사거리 기준, 콤보 창 길이, 스태미나
 * 비용)는 여전히 `tuning.ts` 가 소유한다 — 적 프로필과 같은 경계다.
 *
 * `followUp` 이 콤보를 그래프로 만든다. 3연타는 그 그래프의 유일한 사슬이고,
 * 강공격·대시 공격은 사슬 밖에서 자기 입력으로 시작하는 단발 무브다.
 */

import type { CombatWeaponId } from "./CombatDamage";

export interface AttackMove {
  readonly id: AttackMoveId;
  /**
   * 입력부터 완전 신장 접촉 프레임까지. 판정이 열리는 시각이다.
   *
   * 렌더가 이 값으로 원화 타임라인을 역산해 모든 타수를 같은 키포즈에 맞추므로
   * 적의 `windupMs` 와 이름을 합치지 않는다 — 의미가 다르다.
   */
  readonly contactMs: number;
  /** 이동을 잠그고 공격 자세를 유지하는 전체 시간. */
  readonly actionMs: number;
  /** 다음 공격을 시작할 수 있을 때까지. */
  readonly cooldownMs: number;
  readonly damage: number;
  /** Physical attack source; legacy move IDs do not imply a blade. */
  readonly weaponId: CombatWeaponId;
  /** 비전투 대상에게 남기는 비틀거림. */
  readonly grazeStaggerMs: number;
  /**
   * 명중 시 공간을 만드는 충격의 무게.
   *
   * 실제 거리·경직 수치는 `tuning.combat.tierImpulse` 가 소유하고, 여기는 "어떤
   * 무게인가" 만 선언한다. 렌더(히트스톱·피격 반응·카메라·이펙트)도 같은 이름을 읽는다.
   */
  readonly tier: AttackTier;
  /** 이 무브만의 전방 판정. null 이면 `tuning.combat.attackReachPx` 를 쓴다. */
  readonly reachPx: number | null;
  /**
   * 접촉 정산 뒤 공격자 자신이 한 틱에 튀어 나가는 거리(돌진). 대시 공격만 0이 아니다.
   * 렌더가 `PlayerLunged` 로 따라잡는 순간 이동이라, 걸음(`stepInPx`)과 섞지 않는다.
   */
  readonly lungePx: number;
  /**
   * 입력부터 접촉까지 몸이 실제로 딛는 거리. 헛쳐도 간다.
   *
   * 예비 동작 동안 ease-in 으로 늘어나 접촉 틱에 정확히 이 값에 닿는다 — 앞발이 닿는
   * 순간이 곧 판정 순간이다. 벽·난간·다른 몸 앞에서는 `simulation` 이 자른다.
   */
  readonly stepInPx: number;
  /**
   * 접촉 뒤 회수 동안 몸이 더 가는 거리(부호 있음). 이징이 있는 걸음이지 순간 이동이 아니다.
   * 원화의 뒷발이 따라 들어오는 구간이라, 없으면 회수 끝에 몸이 뒤로 튄다. 음수면 원화가 든 발을
   * 몸 뒤로 내려 가드로 서는 무브다(어퍼컷·돌려차기) — 몸이 실제로 물러난다.
   */
  readonly followStepPx: number;

  readonly rootMotion?: readonly (readonly [atMs: number, px: number])[];
  /**
   * 명중 시 공간을 만드는 충격의 이름. 지금은 티어가 곧 충격이다.
   * 무브가 자기 티어와 다른 충격을 타야 할 날이 오면 여기서 갈라진다.
   */
  readonly onHit: ImpulseId;
  /** 콤보 창 안의 다음 C가 내는 무브. 헛쳐도 열린다. null 이면 사슬의 끝이다. */
  readonly followUp: AttackMoveId | null;
}

/**
 * 공격의 무게 등급. sim 이벤트에 실려 렌더(히트스톱·피격 반응·카메라·이펙트)가
 * 같은 이름으로 세기를 고른다. 수치는 각 층이 자기 표에서 소유한다.
 */
export type AttackTier = "light" | "heavy" | "dash" | "finisher";

/** 충격의 이름은 곧 무게 등급이다. */
export type ImpulseId = AttackTier;

/** C 한 입력으로 이어지는 사슬. `playerMove(combo)` 가 여기만 인덱싱한다. */
export const PLAYER_COMBO_IDS = ["slash1", "slash2", "slash3"] as const;

/** 사슬 밖의 단발 무브까지 포함한 전체 표. */
export const PLAYER_MOVE_IDS = [...PLAYER_COMBO_IDS, "heavy", "dashSlash"] as const;
export type AttackMoveId = (typeof PLAYER_MOVE_IDS)[number];
export type ComboMoveId = (typeof PLAYER_COMBO_IDS)[number];

/**
 * 1타 기준 → 2타 빠른 연결 → 3타 무거운 마무리의 결정론적 세 박자.
 * 세 타 모두 공간을 만들지만 평타의 8px는 상대의 공격 페이즈를 되감지 않는다 —
 * 1·2타가 적 선딜을 지우면 `연타 → 영구 경직` 이 성립한다.
 *
 * 접촉 시점이 95~145ms였던 시절에는 렌더가 12fps 원화를 1.45~1.75배속으로 늘려야
 * 접촉 키포즈에 맞출 수 있었다. 예비 동작을 사람이 읽을 수 있는 길이로 늘리고
 * 회수를 줄이는 쪽이 "애니가 너무 빠르다"의 실제 해법이다.
 */
export const PLAYER_MOVES: Readonly<Record<AttackMoveId, AttackMove>> = Object.freeze({
  slash1: Object.freeze({
    id: "slash1",
    contactMs: 150,
    actionMs: 290,
    cooldownMs: 260,
    damage: 1,
    weaponId: "fist",
    grazeStaggerMs: 260,
    tier: "light",
    reachPx: null,
    lungePx: 0,
    // codex 키프레임 `attack`(한 발 딛는 잽, 2026-09-25 3차)의 포즈별 몸통 이동 × 0.486 월드px.
    // 셀은 몸통을 128에 고정하고 발이 셀 안에서 움직인다 — 뒷발을 딛고 장전(P1 +3), 앞발을 내디디며 접촉(P3 +19),
    // 앞발에 실려 반동(P4 +10)한 뒤 뒷발을 끌어와 가드(P5 +6).
    // 2026-09-26 끊어지는 평타: 포즈 시작 20·130·150·190·230ms. 가드는 한 프레임, 장전을 붙든 채(P1 110)
    // 반쯤 뻗은 P2 는 한 프레임(20ms)만 지나 접촉으로 튄다 — 50ms 짜리 중간 컷이 뻗음을 느슨하게 만들었다.
    stepInPx: 10.7,
    followStepPx: 7.8,
    rootMotion: Object.freeze([
      Object.freeze([0, 0] as const), Object.freeze([20, 1.5] as const), Object.freeze([150, 10.7] as const),
      Object.freeze([190, 15.5] as const), Object.freeze([230, 18.5] as const),
    ]),
    onHit: "light",
    followUp: "slash2",
  }),
  slash2: Object.freeze({
    id: "slash2",
    contactMs: 110,
    actionMs: 250,
    // 190 → 160(2026-09-25): 연타 간격이 피니셔로 갈수록 줄게 3타를 당긴다(레퍼런스 규칙, 약 0.8배씩).
    // 헛침 접촉→접촉 370(1→2) → 330(2→3), 명중은 경량 히트스톱 67이 더해져 437 → 397.
    cooldownMs: 160,
    damage: 1,
    weaponId: "fist",
    grazeStaggerMs: 260,
    tier: "light",
    reachPx: null,
    lungePx: 0,
    // codex 키프레임 `attack-2`(뒷손 스트레이트, 2026-09-25)의 포즈별 몸통 이동 × 0.486 월드px.
    // 셀은 몸통을 128에 고정하고 발이 셀 안에서 움직이게 그렸다 — 뒷발을 딛고(P1→P3 +26 원화px)
    // 접촉 뒤 과회전·가드 복귀에서 몸통이 뒤로 돌아온다(P3→P5 −9.5). 뒤로 가는 키도 원화 그대로다.
    // 2026-09-26 끊어지는 평타: 1타 가드에서 한 프레임(P0 10), 뒷손을 당긴 채 버티고(P1 80), 딛는 P2 는 한 프레임(20ms).
    stepInPx: 12.6,
    followStepPx: -4.6,
    rootMotion: Object.freeze([
      Object.freeze([0, 0] as const), Object.freeze([90, 3.6] as const), Object.freeze([110, 12.6] as const),
      Object.freeze([150, 10.9] as const), Object.freeze([190, 8] as const),
    ]),
    onHit: "light",
    followUp: "slash3",
  }),
  slash3: Object.freeze({
    id: "slash3",
    // 2026-09-25 연타 박자(레퍼런스: 간격은 피니셔로 갈수록 줄고 그 뒤에 긴 호흡)와 애니메이터 2차 리뷰:
    // 접촉은 가장 뻗은 포즈(P5 주먹 머리 위·까치발)이고 무릎 올린 P4는 마지막 도약 컷이다. 220/460/400 → 170/410/350.
    contactMs: 170,
    actionMs: 410,
    cooldownMs: 350,
    damage: 2,
    weaponId: "fist",
    grazeStaggerMs: 520,
    tier: "finisher",
    reachPx: 118,
    lungePx: 0,
    // codex 키프레임 `attack-3`(무릎 올린 어퍼컷). 앞발이 들어가고(P1), 웅크리며 몸통이 뒷발 쪽으로
    // 물러났다가(P2 −5.3), 앞발을 축으로 무릎을 차올리고(P4 +40) 까치발로 주먹을 머리 위까지 뻗어 접촉(P5 +38.9).
    // 회수에서 든 무릎 발을 몸 뒤로 내려 가드의 뒷발로 삼으니 몸통이 약 25px 물러난다 — 디딘 앞발이 제자리에 남는다.
    // 2026-09-25 2차 원화: 내려오는 사이 컷 P5r(무릎 발이 몸 뒤에 닿음, −19.0)이 P5와 P6 사이에 들어가 그 물러남을
    // 두 걸음(−19.0 → −5.8)으로 나눈다. 키 시각은 원화 포즈 시작
    // (P0 0·P1 10·P2 50·P3 140·P4 160·P5 170·P5r 230·P6 300, frames/attack-3 metadata timing).
    // 2026-09-26 끊어지는 평타: 피니셔만 크게 감는다 — 웅크림 P2 를 90ms 붙들고, 도약 P3·무릎 P4 는 한 프레임씩
    // 지나 접촉으로 터진다. 주먹을 올린 채 버팀은 120 → 60(맞히면 183ms 멈춤·슬로모가 한참 더 붙든다 — 풀린 뒤
    // 20ms 만 남긴다), 착지(P5r)는 제동 한 번, 가드 정착은 70 → 110.
    stepInPx: 38.9,
    followStepPx: -24.8,
    rootMotion: Object.freeze([
      Object.freeze([0, 0] as const), Object.freeze([10, 9.5] as const), Object.freeze([50, 4.1] as const),
      Object.freeze([140, 9.2] as const), Object.freeze([160, 40] as const), Object.freeze([170, 38.9] as const),
      Object.freeze([230, 19.9] as const), Object.freeze([300, 14.1] as const),
    ]),
    onHit: "finisher",
    followUp: null,
  }),
  /**
   * V 강공격. 예전 밀치기 자리다.
   *
   * 밀치기는 "피해 없는 탈출기" 였고, 그래서 위기에서만 눌렀다. 같은 손가락에
   * 240ms 예비 동작이 보이는 2피해 강공격을 두면 같은 키가 공격 문법의 일부가 된다.
   */
  heavy: Object.freeze({
    id: "heavy",
    contactMs: 240,
    actionMs: 540,
    cooldownMs: 720,
    damage: 2,
    weaponId: "kick",
    grazeStaggerMs: 620,
    tier: "heavy",
    reachPx: 120,
    lungePx: 0,
    // codex 키프레임 `heavy`(가로 돌려차기, 2026-09-25 2차 원화 kick-chamber·kick-recovery). 앞발을 조금 딛고
    // 비틀어(P1 +5.6) 그 발을 축으로 몸통이 넘어가 챔버(P2 +32.9, 무릎이 몸통 띠 안에 들어와 조금 크게 잰다)·
    // 접촉(P3 +32.6). 다시 접은 뒤(P4 +29.6) 찬 발을 몸 뒤에 내려놓고(P4r +13.6) 가드로 선다(P5 +7.3) — 축발이 제자리에 남는다.
    stepInPx: 32.6,
    followStepPx: -25.3,
    rootMotion: Object.freeze([
      // 홀드(플라밍고 리뷰 + 2차): 비틀기 P1 180 · 챔버 P2 30 · 접촉 240 · 재챔버 P4 40 · 내려놓기 P4r 100 · 가드 P5 120.
      // 2026-09-26 끊어지는 박자: 챔버 70 → 30(두 프레임). 70ms 챔버는 "딛고 → 멈추고 → 찬다" 로 디딤의
      // 가속을 끊었다. 비틀기에서 장전한 채 멈췄다가(P1 홀드) 27px 디딤이 곧장 접촉으로 이어진다.
      Object.freeze([0, 0] as const), Object.freeze([30, 5.6] as const), Object.freeze([210, 32.9] as const),
      // 회수(2026-09-26 애니메이터 리뷰): 재챔버 P4 50 → 40, 내려놓기 P4r 50 → 100(낮은 제동 자세가 버틴다),
      // 가드 P5 160 → 120. 찬 발이 몸 뒤에 딛는 순간 몸이 한 번에 멈추고, 가드는 짧게 정착한다.
      Object.freeze([240, 32.6] as const), Object.freeze([280, 29.6] as const), Object.freeze([320, 13.6] as const),
      Object.freeze([420, 7.3] as const),
    ]),
    onHit: "heavy",
    followUp: null,
  }),
  /** 달리는 중 C. 가장 빠르게 열리고 가장 멀리 날리는 대신 회수가 가장 길다. */
  dashSlash: Object.freeze({
    id: "dashSlash",
    contactMs: 130,
    actionMs: 380,
    cooldownMs: 560,
    damage: 2,
    weaponId: "fist",
    grazeStaggerMs: 620,
    tier: "dash",
    reachPx: 130,
    lungePx: 90,
    // 접촉까지의 몸 이동은 달리던 관성 + 접촉 틱의 돌진 90px 가 소유한다. 원화 `dash` 가 그 구간에
    // 그린 몸통 이동(P0→P2 +5.8)은 그 안에 이미 들어 있어 더하면 두 번 간다. 돌진이 끝난 뒤 디딘
    // 앞발로 뒷발을 끌어와 가드로 서는 한 걸음(P3→P4 +4.9)만은 아무도 옮기지 않으므로 싣는다.
    // 2026-09-26 끊어지는 대시: 뻗은 채 발뒤꿈치로 버티는 제동 컷 P3 를 30 → 90ms 붙든 뒤(260ms) 한 걸음에 가드로 선다.
    stepInPx: 0,
    followStepPx: 4.9,
    rootMotion: Object.freeze([Object.freeze([0, 0] as const), Object.freeze([260, 4.9] as const)]),
    onHit: "dash",
    followUp: null,
  }),
});

/** 1-based 콤보 번호를 사슬 표에 안전하게 연결한다. */
export function playerMove(combo: 1 | 2 | 3): AttackMove {
  return PLAYER_MOVES[PLAYER_COMBO_IDS[combo - 1]!];
}

export function moveOf(id: AttackMoveId): AttackMove {
  return PLAYER_MOVES[id];
}

/**
 * 공격 시각 비교의 공용 여유(ms). 키 시각에 "닿았다" 를 판정하는 모든 곳(sim 걸음 `rootMotionPxAt`,
 * 원화 컷 `authoredAttackFrame`, 실험실 접촉)이 같은 값을 써야 60Hz 누적 오차로 몸과 포즈가 한 틱
 * 어긋나지 않는다 — 16.67ms 를 아홉 번 더한 149.99999999999997 도 150ms 키에 닿은 것이다.
 */
export const ATTACK_KEY_EPSILON_MS = 1e-6;

/**
 * 공격 시작부터 `elapsedMs` 까지 몸이 계획대로 딛은 누적 거리(앞 = +, 뒤로 물러나는 원화 키는 줄어든다, 벽 무시).
 *
 * 틱마다 이 값의 차이만큼 옮기므로 접촉 틱에 누적이 정확히 `stepInPx` 가 된다.
 * 실제로 얼마나 갔는지는 기하를 아는 `simulation` 이 자른다.
 */
export function rootMotionPxAt(move: AttackMove, elapsedMs: number): number {
  const t = Math.min(move.actionMs, Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0));
  if (move.rootMotion !== undefined) {
    // 입력 순간에는 아직 아무 데도 안 갔다. `[0, px]` 키는 "첫 틱에 딛는다" 는 뜻이다 —
    // 틱 걸음이 누적 차이라서, 0ms 값이 0이 아니면 그 걸음이 통째로 사라진다.
    if (t <= 0) return 0;
    let px = 0;
    for (const [atMs, value] of move.rootMotion) {
      if (t + ATTACK_KEY_EPSILON_MS < atMs) break;
      px = value;
    }
    return px;
  }
  if (t < move.contactMs) return move.stepInPx * (t / Math.max(1, move.contactMs)) ** 2;
  const recoveryMs = move.actionMs - move.contactMs;
  const r = recoveryMs <= 0 ? 1 : (t - move.contactMs) / recoveryMs;
  return move.stepInPx + move.followStepPx * (1 - (1 - r) ** 2);
}

/** 이 무브가 몸을 스스로 옮기는가(앞이든 뒤든). 돌진(`lungePx`)은 별개다. */
export function movesBody(move: AttackMove): boolean {
  return move.stepInPx !== 0 || move.followStepPx !== 0 || move.rootMotion !== undefined;
}

/**
 * 시작 틱에 걷던 관성을 끊고 걸음 곡선만 타는가. 돌진 무브(대시)는 달리던 관성이 곧 예비 동작이라
 * 끊지 않는다 — 회수 걸음만 곡선이 소유한다.
 */
export function brakesIntoStep(move: AttackMove): boolean {
  return movesBody(move) && move.lungePx === 0;
}

/** 이 무브의 실제 전방 판정. 표가 비워 두면 전역 기준을 쓴다. */
export function moveReachPx(move: AttackMove, defaultReachPx: number): number {
  return move.reachPx ?? defaultReachPx;
}
