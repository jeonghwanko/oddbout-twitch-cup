/**
 * 벨의 따라하기 레슨 — 새 조작을 처음 만난 순간부터 보조를 단계적으로 걷는 진행 규칙.
 *
 * 저장되는 메타 진행이므로 런 판정·리플레이·난수와 무관하다. 보조 단계는 이 파일 하나가
 * 정한다: 처음 한 번은 멈춤 레슨, 다음 한 번은 슬로모션 + 체크 줄, 그 뒤로는 체크 줄만,
 * 연속 성공이 쌓이면 체크 줄도 끈다. 연속 실패가 쌓이면 멈춤 레슨으로 되돌린다.
 *
 * 집계 규칙(2026-10-17 사용자 결정, 세 엔진 공통): 멈춤 레슨으로 멈춘 만남은 성공·실패로 세지 않는다. 박자를 레슨이 잡아 줬으므로
 * 익혔다는 증거가 아니다. 엔진은 그 만남의 결과를 `recordFollowLessonOutcome`에 넘기지 않는다(`FollowLessonDirector.settle`,
 * `AuctionLesson`의 `attempt`, `CityFightLessonDirector`의 `scored`). 멈추지 않고 실제 속도로 받은 만남은 센다 — 쿠마전의 멈춤을 끈
 * 첫 만남(큰 카드만 뜬다)도 여기에 든다. 다시 가르칠 때는 처음 가르칠 때와 같은 진행에서 시작한다(`recordFollowLessonTaught`).
 */
/**
 * `auction-attention`은 경매장의 첫 시선 창 레슨이다. 같은 보조 단계를 쓰되 잠입 전투 레슨
 * 엔진(`FollowLessonDirector`)이 아니라 `AuctionLesson`이 판정한다. `kuma-white`·`kuma-gold`·`kuma-red`는 마을 쿠마전의
 * 상성 레슨이다(2026-10-15, `app/CityFightLesson.ts`가 판정한다).
 */
export const FOLLOW_LESSON_IDS = ["bruiser-dodge", "counter-strike", "warden-pass", "auction-attention", "kuma-white", "kuma-gold",
  "kuma-red"] as const;
export type FollowLessonId = (typeof FOLLOW_LESSON_IDS)[number];

export type FollowLessonAssist = "pause" | "slow" | "check" | "none";
export type FollowLessonOutcome = "success" | "fail";

export interface FollowLessonProgress {
  /** 멈춤 레슨을 본 적 있는가. 연속 실패로 다시 가르치면 false로 돌아간다. */
  readonly taught: boolean;
  /**
   * 멈춤 레슨 뒤 판정이 난 만남 수. 슬로모션 단계를 한 번만 주는 데 쓴다.
   * 연속 실패로 `taught`가 false가 돼도 다음 멈춤까지 남겨 두어 그 멈춤이 재교습임을 안다. 멈추면 0으로 돌아간다.
   */
  readonly attempts: number;
  readonly successStreak: number;
  readonly failStreak: number;
}

export type FollowLessonMemory = Readonly<Partial<Record<FollowLessonId, FollowLessonProgress>>>;

export const FOLLOW_LESSON_RULES = Object.freeze({
  /** 멈춤 레슨 직후 슬로모션을 주는 만남 수. */
  slowAttempts: 1,
  /** 연속 성공이 이만큼 쌓이면 체크 줄도 끈다. */
  retireAfterSuccesses: 3,
  /** 연속 실패가 이만큼 쌓이면 멈춤 레슨을 다시 연다. */
  reteachAfterFailures: 3,
});

export const EMPTY_FOLLOW_LESSON_PROGRESS: FollowLessonProgress = Object.freeze({
  taught: false,
  attempts: 0,
  successStreak: 0,
  failStreak: 0,
});

export function followLessonProgress(memory: FollowLessonMemory | undefined, id: FollowLessonId): FollowLessonProgress {
  return memory?.[id] ?? EMPTY_FOLLOW_LESSON_PROGRESS;
}

/** 연속 실패로 멈춤 레슨을 다시 여는 중인가. 벨의 첫 한 줄이 달라진다. */
export function followLessonReteaching(progress: FollowLessonProgress): boolean {
  return !progress.taught && progress.attempts > 0;
}

export function followLessonAssist(progress: FollowLessonProgress): FollowLessonAssist {
  if (!progress.taught) return "pause";
  if (progress.successStreak >= FOLLOW_LESSON_RULES.retireAfterSuccesses) return "none";
  if (progress.attempts < FOLLOW_LESSON_RULES.slowAttempts) return "slow";
  return "check";
}

/** 멈춤 레슨을 연 순간 기록한다. 레슨 도중 창을 닫아도 다시 멈추지 않는다. 재교습도 같은 진행에서 다시 시작한다. */
export function recordFollowLessonTaught(): FollowLessonProgress {
  return { taught: true, attempts: 0, successStreak: 0, failStreak: 0 };
}

/** 한 번의 만남 결과를 반영한다. 멈춤 레슨으로 멈춘 만남은 넘기지 않는다(파일 머리의 집계 규칙). */
export function recordFollowLessonOutcome(
  progress: FollowLessonProgress,
  outcome: FollowLessonOutcome,
): FollowLessonProgress {
  if (outcome === "success") {
    return {
      taught: progress.taught,
      attempts: progress.attempts + 1,
      successStreak: progress.successStreak + 1,
      failStreak: 0,
    };
  }
  const failStreak = progress.failStreak + 1;
  if (failStreak >= FOLLOW_LESSON_RULES.reteachAfterFailures) {
    return { taught: false, attempts: progress.attempts + 1, successStreak: 0, failStreak: 0 };
  }
  return {
    taught: progress.taught,
    attempts: progress.attempts + 1,
    successStreak: 0,
    failStreak,
  };
}

/** 저장 codec용. 알 수 없는 ID·손상 값은 버리고 음이 아닌 정수만 남긴다. */
export function sanitizeFollowLessonMemory(raw: unknown): FollowLessonMemory {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const record = raw as Record<string, unknown>;
  const memory: Partial<Record<FollowLessonId, FollowLessonProgress>> = {};
  for (const id of FOLLOW_LESSON_IDS) {
    const value = record[id];
    if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
    const entry = value as Record<string, unknown>;
    memory[id] = {
      taught: entry["taught"] === true,
      attempts: count(entry["attempts"]),
      successStreak: count(entry["successStreak"]),
      failStreak: Math.min(count(entry["failStreak"]), FOLLOW_LESSON_RULES.reteachAfterFailures - 1),
    };
  }
  return memory;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}
