/**
 * 실행 URL의 모든 옵션을 한 번에 해석한다.
 * 부팅과 실제 런이 같은 결과를 보도록 main과 각 씬은 이 파서만 사용한다.
 */
export interface RuntimeOptions {
  /** 번역 QA용 언어. 전체 화면 번역 완료 전에는 URL override로만 노출한다. */
  readonly locale: Locale;
  readonly debug: boolean;
  readonly seed: number;
  readonly seedPinned: boolean;
  readonly floor: number | null;
  readonly startX: number | null;
  readonly timeSec: number | null;
  readonly stage: string | null;
  /** Isolated village dialogue in development or an explicit local playtest build. */
  readonly incident?: 'deception-001' | 'guard-conflict' | null;
  readonly cardId: string | null;
  /** 공유 링크로 받은 초대 코드. 검증과 저장은 platform 초대장 경계가 소유한다. */
  readonly inviteCode: string | null;
  readonly tutorialBeat: string | null;
  /** QA: `?stage=blackthorne&keeper=1` 로 금고지기 회랑 체크포인트(보스전 입구)에서 바로 시작한다. */
  readonly keeper?: boolean;
  /** QA: `&keeperHp=N` 으로 금고지기 시작 체력을 정한다(2막 문턱 6, 무방비 1). keeper 와 함께만 쓴다. */
  readonly keeperHp?: number | null;
  /** QA: `?lobbyCrowd=hold` 로 경매 직원 통로 손님들을 제자리에 세운다(시간표 정지). E2E 가 쓴다. */
  readonly lobbyCrowdHold?: boolean;
  /** `?perf=1`: 실제 기기에서 읽는 성능 표시(`dev/PerfOverlay.ts`). 표시만 하고 규칙을 바꾸지 않아 밸런스 표본에서 빼지 않는다. */
  readonly perf?: boolean;
  /**
   * `?mobile=1|0`(2026-10-23): 이 기기를 모바일로 다룰지 강제한다(`render/DeviceProfile` — 백버퍼 배율 상한, 모바일 원화). 없으면 null 이고
   * 터치가 주 입력인 화면이 모바일이다. 그림의 해상도만 바꾸고 규칙은 바꾸지 않아 밸런스 표본에서 빼지 않는다.
   */
  readonly mobile?: boolean | null;
  /**
   * `?arena=1`(2026-10-19): 무투장 직접 링크. 인트로·타이틀·마을을 건너뛰고 캐릭터 고르기(`ArenaSelectScene`)부터 연다. 연습 경기만
   * 하므로 밸런스·초대 결과 표본에서 뺀다.
   */
  readonly arena?: boolean;
  /** Profile deep link: initial arena selection only; the loaded roster validates the ID. */
  readonly arenaPlayer?: string | null;
  /**
   * 내 선수 출전(2026-10-27): `&cup=<uuid>` — the creator page's "컵 출전" sends his registered fighter. The arena remembers him as this
   * browser's own (`platform/arenaMyFighterStorage`) and opens the pick screen on him. Null when absent or not a UUID.
   */
  readonly arenaCupFighter?: string | null;
  /** 주간 공용 컵(2026-10-27, `?week=2026-W44` — the Discord card's link): the arena opens that week's cup in its archive. Null when absent or malformed. */
  readonly arenaPublicWeek?: string | null;
  /**
   * `?cupDemo=champion|spectated`(개발 빌드만 — `app/ArenaCupDemo`): 무투장 첫 씬이 끝난 컵을 메모리에만 세워 우승 의식(C3)이나 관전 끝 축하(C4)를
   * 본다. 저장하지 않는다. 개발 빌드인지는 쓰는 쪽(`ArenaSelectScene`)이 본다.
   */
  readonly arenaCupDemo?: "champion" | "spectated" | null;
  /** Homepage PLAY: one direct practice bout, before returning to the normal roster. */
  readonly arenaQuickStart?: boolean;
  readonly arenaOpponent?: string | null;
  /** Embedded local Twitch match token. The broadcast adapter validates its format and loaded roster. */
  readonly arenaBroadcastId?: string | null;
  /**
   * A shared bout (2026-10-24, `app/ArenaBoutShare`): `&bout=<seed>` on the PLAY pairing replays that very AI bout (the engine is seeded),
   * `&rules=<판>` is the rules version it was fought under (`city-tournament.json` rulesVersion). Null when absent or malformed. The seed is
   * a whole 32-bit one: a cup bout's (`arenaCupBoutSeed`) runs past 2³¹ about half the time, and the engine seeds on `seed >>> 0`.
   */
  readonly arenaBoutSeed?: number | null;
  readonly arenaBoutRules?: number | null;
  /** `&d=<지문>`: the shared bout's result digest (8 hex, 2026-10-26) — the replay knows whether it played the very bout shared. */
  readonly arenaBoutDigest?: string | null;
  /**
   * `?playtest=kuma`(2026-10-20): 쿠마전 사람 플레이테스트 입구(`app/KumaPlaytest`). 배포 빌드에서도 켜진다 — 타이틀·고르기·튜토리얼을 건너뛰어
   * 쿠마 근처의 마을에서 시작하고, 진행·설정은 테스터 전용 저장(`kaito_web.playtest.`)에 둔다. 규칙·디버그는 바꾸지 않는다. 시작 상태가
   * 정상 진행이 아니므로 밸런스·초대 표본에서 뺀다. `stage`·`arena`·`debug` 와 함께면 켜지지 않는다.
   */
  readonly playtest?: "kuma" | null;
  /** `&tester=<이름>`: 플레이테스트의 테스터 이름(앞뒤 공백 제거, 40자). 이름이 바뀌면 새 테스터로 처음부터 시작한다. */
  readonly tester?: string | null;

  readonly summon?: SummonOption | null;
  /** URL QA override. null이면 저장 설정과 OS 기본값이 우선순위를 정한다. */
  readonly motionOverride: "reduce" | "full" | null;
  /** OS 설정을 기본값으로 쓰되 `?motion=reduce|full`로 QA 재현이 가능하다. */
  readonly reducedMotion: boolean;
}

const DEFAULT_SEED = 20260807;

/** `?summon=` values (`CityFightSummonKind` — app reads no sim table here, so the list is spelled out; `runtime-options.test.ts` keeps it whole). */
export const SUMMON_OPTIONS = Object.freeze(["crane", "sportsCar", "roadster", "bolt", "drill", "bullet"] as const);
export type SummonOption = (typeof SUMMON_OPTIONS)[number];
const isSummonOption = (value: string | null): boolean => value !== null && (SUMMON_OPTIONS as readonly string[]).includes(value);

/**
 * 마을은 매 프레임 이 파서를 부른다(모션 설정·개발 하네스 판정). `matchMedia` 는 부를 때마다 새 질의 객체를 만들므로
 * 하나를 두고 `matches` 만 읽는다. 같은 URL·같은 OS 모션 설정이면 앞의 결과(읽기 전용)를 그대로 준다.
 */
let reducedMotionQuery: MediaQueryList | null | undefined;
const osPrefersReducedMotion = (): boolean =>
  (reducedMotionQuery ??= globalThis.matchMedia?.("(prefers-reduced-motion: reduce)") ?? null)?.matches ?? false;
let lastParsed: { readonly search: string; readonly prefersReducedMotion: boolean; readonly options: RuntimeOptions } | null = null;

export function readRuntimeOptions(
  search: string = globalThis.location?.search ?? "",
  prefersReducedMotion: boolean = osPrefersReducedMotion(),
): RuntimeOptions {
  if (lastParsed?.search === search && lastParsed.prefersReducedMotion === prefersReducedMotion) return lastParsed.options;
  const options = parseRuntimeOptions(search, prefersReducedMotion);
  lastParsed = { search, prefersReducedMotion, options };
  return options;
}

/** A whole decimal number in [0, `max`] spelled with digits only (a shared link's seed or rules version), else null. */
function asWhole(raw: string | null, max: number): number | null {
  if (raw === null || !/^\d{1,10}$/.test(raw)) return null;
  const value = Number(raw);
  return value <= max ? value : null;
}

function parseRuntimeOptions(search: string, prefersReducedMotion: boolean): RuntimeOptions {
  const params = new URLSearchParams(search);
  const asInt = (raw: string | null): number | null => {
    if (raw === null || raw.trim() === "") return null;
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) ? value : null;
  };
  const parsedSeed = asInt(params.get("seed"));
  const motion = params.get("motion"), cupDemo = params.get("cupDemo");

  return {
    locale: parseLocale(params.get("lang")),
    debug: params.get("debug") === "1",
    seed: parsedSeed ?? DEFAULT_SEED,
    seedPinned: parsedSeed !== null,
    floor: asInt(params.get("floor")),
    startX: asInt(params.get("x")),
    timeSec: asInt(params.get("time")),
    stage: params.get("stage"),
    incident: params.get('incident') === 'guard-conflict' ? 'guard-conflict' : params.get('incident') === 'deception-001' ? 'deception-001' : null,
    cardId: params.get("card"),
    inviteCode: params.get("invite"),
    tutorialBeat: params.get("tutorialBeat"),
    keeper: params.get("keeper") === "1",
    keeperHp: asInt(params.get("keeperHp")),
    lobbyCrowdHold: params.get("lobbyCrowd") === "hold",
    perf: params.get("perf") === "1",
    mobile: params.get("mobile") === "1" ? true : params.get("mobile") === "0" ? false : null,
    arena: params.get("arena") === "1",
    arenaPlayer: params.get("fighter") || null,
    arenaCupFighter: /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(params.get("cup") ?? "") ? params.get("cup") : null,
    arenaPublicWeek: /^\d{4}-W\d{2}$/.test(params.get("week") ?? "") ? params.get("week") : null,
    arenaCupDemo: cupDemo === "champion" || cupDemo === "spectated" ? cupDemo : null,
    arenaQuickStart: params.get("play") === "1",
    arenaOpponent: params.get("opponent") || null,
    arenaBroadcastId: params.get("twitchBout"),
    arenaBoutSeed: asWhole(params.get("bout"), 0xffffffff),
    arenaBoutRules: asWhole(params.get("rules"), 9999),
    arenaBoutDigest: /^[a-f0-9]{8}$/.test(params.get("d") ?? "") ? params.get("d") : null,
    playtest: params.get("playtest") === "kuma" ? "kuma" : null,
    tester: params.get("tester")?.trim().slice(0, 40) || null,
    summon: isSummonOption(params.get("summon")) ? params.get("summon") as SummonOption : null,
    motionOverride: motion === "reduce" || motion === "full" ? motion : null,
    reducedMotion: motion === "reduce" || (motion !== "full" && prefersReducedMotion),
  };
}

/** 명시한 시드는 재현용으로 고정하고, 기본 시드는 런 횟수로 변화시킨다. */
export function runSeed(options: RuntimeOptions, runs: number): number {
  return options.seedPinned ? options.seed : options.seed + runs;
}

/**
 * 개발 재현 옵션이 섞인 런은 사람 플레이 밸런스 표본으로 쓰지 않는다.
 * 모션 감소는 접근성/연출 옵션일 뿐 규칙을 바꾸지 않으므로 허용한다.
 */
export function isBalanceSample(
  options: RuntimeOptions,
  search: string = globalThis.location?.search ?? "",
): boolean {
  const params = new URLSearchParams(search);
  const qaParameters = ["debug", "seed", "floor", "x", "time", "stage", "card", "invite", "tutorialBeat", "keeper", "keeperHp", "lobbyCrowd",
    "arena", "playtest", "summon"];
  return !qaParameters.some((key) => params.has(key)) &&
    options.playtest == null &&
    !options.debug &&
    !options.seedPinned &&
    options.floor === null &&
    options.startX === null &&
    options.timeSec === null &&
    options.stage === null &&
    options.cardId === null &&
    options.inviteCode === null &&
    options.tutorialBeat === null &&
    options.arena !== true &&
    (options.summon ?? null) === null;
}

/**
 * 제작자에게 보낼 친선 결과는 공유 코드·언어·모션 설정만 허용한다.
 * 개발용 저택·시간·스폰·DevBridge가 섞인 런은 화면에서 QA로 즐길 수 있어도
 * 같은 초대의 공식 비동기 결과함에는 들어가지 않는다.
 */
export function isInvitationResultEligible(
  options: RuntimeOptions,
  search: string = globalThis.location?.search ?? "",
): boolean {
  const params = new URLSearchParams(search);
  const gameplayQaParameters = ["debug", "seed", "floor", "x", "time", "stage", "card", "tutorialBeat", "keeper", "keeperHp", "lobbyCrowd",
    "arena", "playtest", "summon"];
  return !gameplayQaParameters.some((key) => params.has(key)) &&
    options.playtest == null &&
    !options.debug &&
    !options.seedPinned &&
    options.floor === null &&
    options.startX === null &&
    options.timeSec === null &&
    options.stage === null &&
    options.cardId === null &&
    options.tutorialBeat === null &&
    options.arena !== true &&
    (options.summon ?? null) === null;
}

/** 층/좌표 오버라이드를 적용한 시작 지점. */
export function resolveSpawn(
  options: RuntimeOptions,
  layout: { readonly spawn: { readonly x: number; readonly y: number } },
  floorHeightPx: number,
  slabThicknessPx: number,
): { x: number; y: number } {
  const x = options.startX ?? layout.spawn.x;
  const y =
    options.floor === null
      ? layout.spawn.y
      : (options.floor + 1) * floorHeightPx - slabThicknessPx - 4;
  return { x, y };
}
import { parseLocale } from "./Locale";
import type { Locale } from "./Locale";
