/**
 * 경비 아키타입 데이터.
 *
 * 슬라이스는 3종만 둔다. 각각 "플레이어가 배워야 할 규칙" 이 하나씩 다르다.
 *   순찰병  — 순찰 주기를 읽는다
 *   경비반장 — 평온해도 위를 본다. 기다려야 하는 상대
 *   감시 촛대 — 완벽히 주기적이다. 예측 가능성이 선물이고 복도가 리듬 게임이 된다
 */

import type { IntelId } from "./types";
import type { CombatWeaponId } from "./CombatDamage";
import type { WeaponModId } from "./WeaponModRules";

/**
 * 전투 능력. 이 필드가 있는 아키타입만 싸울 수 있다.
 *
 * 일반 경비에게는 없다 — 아무나 정면으로 이길 수 있으면 플레이어가 회피가 아니라
 * 소탕을 시도하고, 순찰 주기를 읽는 설계가 통째로 무의미해진다.
 */
export interface CombatProfile {
  readonly attackKind: "melee" | "ranged";
  /** The attack source shared by HP rules and contact presentation. */
  readonly weaponId: CombatWeaponId;
  readonly hp: number;
  /** HP armor. Front immunity and poise are separate guard rules. */
  readonly armor?: number;
  /**
   * 반격·후방 공격이 아닌 평타로는 이 체력 아래로 내릴 수 없다.
   * 곤봉병처럼 공격 박자를 읽어야 마무리할 수 있는 상대만 사용한다.
   */
  readonly nonPunishHpFloor?: number;
  /**
   * 모든 타격을 막는다(피해·경직 없음, `CombatBlocked`). 보스의 페이즈 전환 포효처럼 저작된 한 박자에만
   * 프로필 덮어쓰기(`CombatState.profileOverride`)로 켠다. 원형 표에는 쓰지 않는다.
   */
  readonly invulnerable?: boolean;
  /**
   * 공격이 닿는 거리.
   * 반드시 engageRangePx 보다 커야 한다 — 공격 중에는 발이 묶이므로,
   * 커밋 거리가 더 멀면 휘두르기가 영원히 허공을 가른다.
   */
  readonly attackRangePx: number;
  /** 이 거리 안에 들어오면 공격을 시작한다. */
  readonly engageRangePx: number;
  /** 선부 → 판정 → 후딜. 후딜이 플레이어의 반격 창이다. */
  readonly windupMs: number;
  readonly strikeMs: number;
  readonly recoveryMs: number;
  /** 공격 사이 최소 간격. 무한 연타를 막는다. */
  readonly cooldownMs: number;
  /** 정면 피격을 무효화하는가. 기사가 이 값을 쓴다. */
  readonly frontImmune: boolean;
  /**
   * 판정 구간 동안 공격자의 몸이 공격 방향으로 전진하는 남은 거리(px). 돌진처럼 몸째 달려드는
   * 공격만 채운다. 현재 위치 기준이고 막힌 곳(벽·아레나 경계)에서 이미 잘려 있으므로,
   * 텔레그래프 레인은 `attackRangePx + strikeTravelPx` 까지 그리고 회피 타이밍도 이 전진을 더해
   * 접촉 시각을 계산한다. 없으면 제자리 휘두르기다.
   */
  readonly strikeTravelPx?: number;
  /** `strikeTravelPx` 전진의 순항 속도(px/s). 회피 타이밍이 접촉 시각을 역산할 때 쓴다. */
  readonly strikeTravelSpeedPxPerSec?: number;
  /** 판정 시작부터 순항 속도에 이르는 가속 시간(ms). 위치는 easeIn quad(속도는 선형)로 오른다. */
  readonly strikeTravelRampMs?: number;
}

export interface GuardArchetype {
  readonly id: string;
  /** 표시 이름. 두 언어를 같은 표가 소유한다(초대장 파수꾼 이름 등). */
  readonly name: { readonly ko: string; readonly en: string };
  readonly viewRange: number;
  readonly halfAngleDeg: number;
  readonly walkSpeed: number;
  readonly chaseSpeed: number;
  readonly hearRange: number;
  /** 지면 기준 공용 눈높이에 더할 관측 원점 보정. 촛대처럼 렌즈가 높은 개체가 사용한다. */
  readonly visionOriginOffsetY?: number;
  /** 사람의 코앞 후방 감각. 고정식 광학 장치는 false로 방향 반대편을 안전하게 보장한다. */
  readonly peripheralVision?: boolean;
  /** 평온 상태에서도 위를 보는 정도. 기본 규칙(+8°)에 더해진다. */
  readonly calmPitchBonusDeg: number;
  /** 제자리 스캔 주기와 길이. 0 이면 하지 않는다. */
  readonly scanIntervalMs: number;
  readonly scanDurationMs: number;
  /** 순찰 끝에서 다음 방향을 몸보다 먼저 보여 주는 시간. 없으면 공용 튜닝을 쓴다. */
  readonly turnWindupMs?: number;
  /** 회전 예고가 시작되기 전에 반드시 남겨 둘 실제 통과 빈틈. */
  readonly minimumOpeningMs?: number;
  /** 고정형인가. 촛대는 움직이지 않는다. */
  readonly stationary: boolean;
  /** 없으면 싸울 수 없는 상대다. */
  readonly combat?: CombatProfile;
  /** 등 뒤 소매치기로 얻는 정보. 값이 있으면 무력화 대신 소매치기가 우선한다. */
  readonly intelId?: IntelId;
}

const guardArchetypes = {
  patroller: {
    id: "patroller",
    name: { ko: "순찰병", en: "Patroller" },
    viewRange: 300,
    halfAngleDeg: 22,
    walkSpeed: 70,
    chaseSpeed: 195,
    hearRange: 260,
    calmPitchBonusDeg: 0,
    scanIntervalMs: 0,
    scanDurationMs: 0,
    stationary: false,
  },
  warden: {
    id: "warden",
    name: { ko: "경비반장", en: "Warden" },
    viewRange: 380,
    halfAngleDeg: 26,
    walkSpeed: 55,
    chaseSpeed: 190,
    hearRange: 300,
    calmPitchBonusDeg: 20,
    scanIntervalMs: 8000,
    scanDurationMs: 2500,
    turnWindupMs: 1200,
    minimumOpeningMs: 600,
    stationary: false,
    intelId: "patrol-schedule",
  },
  /** 안내원 — 입구 구역의 잠긴 서비스 통로 열쇠를 가진 비전투 정보원. */
  usher: {
    id: "usher",
    name: { ko: "안내원", en: "Usher" },
    viewRange: 250,
    halfAngleDeg: 22,
    walkSpeed: 48,
    // 공식 예고장·영구 숙련의 최대 걷기 조합보다 빨라야 단순 보행으로 영구히 따돌릴 수 없다.
    chaseSpeed: 185,
    hearRange: 230,
    calmPitchBonusDeg: 0,
    scanIntervalMs: 0,
    scanDurationMs: 0,
    stationary: false,
    intelId: "area-key",
  },
  /** 집사 — 금고 번호를 가진 비전투 정보원. 금고 근처를 느리게 순찰한다. */
  butler: {
    id: "butler",
    name: { ko: "집사", en: "Butler" },
    viewRange: 290,
    halfAngleDeg: 24,
    walkSpeed: 44,
    // 안내원보다 집요하지만 반장의 추격보다는 느리다.
    chaseSpeed: 188,
    hearRange: 260,
    calmPitchBonusDeg: 8,
    scanIntervalMs: 7000,
    scanDurationMs: 1800,
    stationary: false,
    intelId: "vault-code",
  },
  /**
   * 곤봉병 — 타이밍을 가르치는 상대.
   *
   * 선부 1.4초가 크게 보이고, 후딜 0.9초에 강한 반격이 들어간다.
   * 무작정 두들기면 반격당하고, 회피로 통과하면 등을 잡을 수 있다.
   * 잠입의 "등 뒤" 규칙이 전투에서도 이어지도록 한 것이 핵심이다.
   */
  bruiser: {
    id: "bruiser",
    name: { ko: "곤봉병", en: "Bruiser" },
    viewRange: 260,
    halfAngleDeg: 26,
    walkSpeed: 60,
    chaseSpeed: 150,
    hearRange: 260,
    calmPitchBonusDeg: 0,
    scanIntervalMs: 0,
    scanDurationMs: 0,
    stationary: false,
    combat: {
      attackKind: "melee",
      weaponId: "club",
      hp: 3,
      nonPunishHpFloor: 1,
      // 곤봉 길이만큼 한 보폭 떨어져 공격을 시작한다. 두 실루엣이 겹치기 전에 예고가
      // 보여야 방향·사거리·구르기 선택을 읽을 수 있다. 명중 60 > 커밋 52라 단순 뒷걸음은
      // 공짜 회피가 아니고, 구르기로 통과하거나 확실히 거리를 벌려야 한다.
      attackRangePx: 60,
      engageRangePx: 52,
      windupMs: 1400,
      strikeMs: 150,
      recoveryMs: 900,
      cooldownMs: 350,
      frontImmune: false,
    },
  },
  /**
   * 석궁병 — 엄폐와 재장전 창을 가르치는 원거리 세트피스 적.
   * 조준선이 solid/blocker에 닿으면 발사가 막히고, 1.6초 재장전 동안 접근할 수 있다.
   */
  crossbow: {
    id: "crossbow",
    name: { ko: "석궁병", en: "Crossbowman" },
    // 투척 도구 최대 사거리보다 짧아야 유인구를 던진 플레이어를 즉시 보지 않는다.
    // 한 번 발각된 뒤의 석궁 사거리와는 별개다.
    viewRange: 380,
    halfAngleDeg: 24,
    walkSpeed: 45,
    chaseSpeed: 90,
    hearRange: 280,
    calmPitchBonusDeg: 8,
    scanIntervalMs: 0,
    scanDurationMs: 0,
    stationary: false,
    combat: {
      attackKind: "ranged",
      weaponId: "crossbow",
      hp: 2,
      attackRangePx: 520,
      engageRangePx: 420,
      windupMs: 800,
      strikeMs: 120,
      recoveryMs: 1600,
      cooldownMs: 250,
      frontImmune: false,
    },
  },
  /**
   * 기사 — 정면 난타를 거부하고 공간 퍼즐을 요구하는 금고 수호자.
   * 후방 단검은 3 피해라 두 번 필요하고, 샹들리에 낙하는 방어를 우회한다.
   */
  knight: {
    id: "knight",
    name: { ko: "기사", en: "Knight" },
    viewRange: 300,
    halfAngleDeg: 25,
    walkSpeed: 70,
    chaseSpeed: 125,
    hearRange: 300,
    calmPitchBonusDeg: 4,
    scanIntervalMs: 0,
    scanDurationMs: 0,
    stationary: false,
    combat: {
      attackKind: "melee",
      weaponId: "blade",
      hp: 6,
      attackRangePx: 44,
      engageRangePx: 36,
      windupMs: 700,
      strikeMs: 180,
      recoveryMs: 900,
      cooldownMs: 500,
      frontImmune: true,
    },
  },
  candelabra: {
    id: "candelabra",
    name: { ko: "감시 로봇", en: "Camera Sentinel" },
    viewRange: 260,
    halfAngleDeg: 18,
    walkSpeed: 0,
    chaseSpeed: 0,
    hearRange: 0,
    visionOriginOffsetY: -10,
    peripheralVision: false,
    calmPitchBonusDeg: 0,
    scanIntervalMs: 4000,
    scanDurationMs: 1200,
    stationary: true,
  },
} as const satisfies Readonly<Record<string, GuardArchetype>>;

/** 배치·카드·렌더가 공유하는 경비 콘텐츠 ID. 표에 없는 값은 컴파일되지 않는다. */
export type GuardArchetypeId = keyof typeof guardArchetypes;

export const GUARD_ARCHETYPES: Readonly<Record<GuardArchetypeId, GuardArchetype>> = Object.freeze(guardArchetypes);

export function archetypeOf(id: GuardArchetypeId): GuardArchetype {
  const found = GUARD_ARCHETYPES[id];
  if (found === undefined) {
    throw new Error(`알 수 없는 경비 아키타입: ${id}`);
  }
  return found;
}

/**
 * 적 상성: 전투 적마다 "이 무기 개조로 뚫는 법". 기본 해법(단도 경직·회피 반격·연막 사선 차단·후면 단도)은
 * 개조 없이도 있고, 이 표는 개조가 더하는 해법이다. 각 항목은 `weapon-mods.test.ts`가 실제 sim으로 확인한다.
 * 공개 결투의 보스는 개조가 페이즈를 건너뛰지 않으므로 표에 없다.
 */
export const GUARD_WEAPON_MOD_ANSWERS: Readonly<Partial<Record<GuardArchetypeId, readonly WeaponModId[]>>> = Object.freeze({
  bruiser: Object.freeze(["snare-throw", "dagger-counter-throw", "smoke-tear-gas"] as const),
  crossbow: Object.freeze(["wire-pull", "wire-kick", "dagger-counter-throw"] as const),
  knight: Object.freeze(["mask-ambush", "snare-chain"] as const),
});

/** 이 개조가 상성으로 뚫는 적. 브리핑 개조 칸의 상성 표시가 읽는다. */
export function weaponModAnswersFor(mod: WeaponModId): readonly GuardArchetypeId[] {
  return (Object.keys(GUARD_WEAPON_MOD_ANSWERS) as GuardArchetypeId[])
    .filter((id) => GUARD_WEAPON_MOD_ANSWERS[id]?.includes(mod) === true);
}

/**
 * 개체 고유 회전 예고가 순찰 대기 전체를 삼키지 않도록 콘텐츠 입력을 정규화한다.
 *
 * 레이아웃 생성·예고장·메타 대응과 런타임 방어선이 이 함수를 함께 사용한다. 어느 한
 * 조립 경로가 짧은 dwell을 만들더라도 반장의 `opening -> turn-warning` 계약은 보존된다.
 */
export function readablePatrolDwellMs(
  id: GuardArchetypeId,
  requestedMs: number,
  fallbackTurnWindupMs = 0,
): number {
  const archetype = archetypeOf(id);
  const minimum = (archetype.turnWindupMs ?? fallbackTurnWindupMs) + (archetype.minimumOpeningMs ?? 0);
  return Math.max(0, requestedMs, minimum);
}
