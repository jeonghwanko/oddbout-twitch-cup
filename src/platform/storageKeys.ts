
/**
 * 격리 저장 주소(네임스페이스). 켜져 있으면 진행·곁 기록 키(`developmentStorageKey`·`activeSlotKey` 를 거치는 것)가 앞에 접두사를 단다.
 * - `city-v1`: `?stage=city-v1` 개발 하네스(`app/NativeCityPlaytest`).
 * - `playtest`: `?playtest=kuma` 사람 플레이테스트(2026-10-20, `app/KumaPlaytest`) — 배포 빌드에서도 켜진다. 새 테스터면
 *   `kaito_web.playtest.` 아래를 통째로 비운다(`platform/kumaPlaytestStorage`). 설정도 이 아래에 둔다(`playtestScopedKey` — 테스터마다 기본 설정).
 */
type StorageNamespace = "city-v1" | "playtest";
const STORAGE_NAMESPACE_PREFIX: Readonly<Record<StorageNamespace, string>> = Object.freeze({
  "city-v1": "kaito_web.city-v1.",
  playtest: "kaito_web.playtest.",
});
let storageNamespace: StorageNamespace | null = null;
/** Boot opts into the local experiment before scenes read any progress. Node tooling leaves this off. */
export function setDevelopmentCityStorage(enabled: boolean): void { storageNamespace = enabled ? "city-v1" : null; }
/** Boot opts into the KUMA playtest's own save (`?playtest=kuma`) before scenes read any progress. */
export function setPlaytestStorage(enabled: boolean): void { storageNamespace = enabled ? "playtest" : null; }
export function developmentStorageKey(key: string): string {
  return storageNamespace === null ? key : `${STORAGE_NAMESPACE_PREFIX[storageNamespace]}${key}`;
}
/** The playtest's own save is on (`setPlaytestStorage`). */
export function playtestStorageActive(): boolean { return storageNamespace === "playtest"; }
/**
 * A key that is global in normal play but the tester's own in the playtest (the player settings — each tester starts on the defaults).
 * The city-v1 harness keeps the developer's settings.
 */
export function playtestScopedKey(key: string): string { return storageNamespace === "playtest" ? developmentStorageKey(key) : key; }
/** A development record that must outlive a new tester's wipe (the city fight log): only the city-v1 harness moves it. */
export function recordStorageKey(key: string): string { return storageNamespace === "city-v1" ? developmentStorageKey(key) : key; }
/** The playtest namespace's prefix: a new tester's wipe removes every key under it. */
export const PLAYTEST_STORAGE_PREFIX = STORAGE_NAMESPACE_PREFIX.playtest;

export const STORAGE_KEYS = Object.freeze({
  /** Rosaline request receipt only; no AI output or image data. */
  outfitCommissionReceipt: "kaito_web.outfitCommissionReceipt.v1",
  // --- localStorage: kaito_web. 접두사 (정상) ---
  /** `MetaState` v4 JSON. 같은 키로 v1~v3 를 legacy 읽기만 한다. */
  meta: "kaito_web.meta.v1",
  /** 최근 런의 `ReplayBundle` JSON. 버그 리포트 내보내기가 읽는다. */
  latestReplay: "kaito_web.latestReplay.v1",
  /** balance 50 + QA 20런의 `RunPlayLog[]`. */
  playLogs: "kaito_web.playLogs.v4",
  /** 익명 브라우저 source ID. */
  playLogSource: "kaito_web.playLogSource.v1",
  /** source 별 런 순번. */
  playLogSequence: "kaito_web.playLogSequence.v1",
  /** 키 재지정·모션·색각 보조·텍스트 배율. */
  playerSettings: "kaito_web.playerSettings.v1",
  /** 마을 퀘스트 HUD 접기 상태. */
  villageHudPreferences: "kaito_web.villageHudPreferences.v1",
  /** Learned village controls and last observed objective, scoped to the active save. */
  villageJourney: "kaito_web.villageJourney.v1",
  /** 부팅 인트로 영상을 한 번 끝까지 봤거나 재생 중 건너뛰었음. 다음 부팅부터 영상 없이 타이틀 프롤로그로 간다. */
  introSeen: "kaito_web.introSeen.v1",
  /** 무투장 1:1 경기의 게스트 전적(`app/BoutRecord` — 주간 대진표 경기와 직접 링크 연습 경기, 최근 50경기와 캐릭터별 승·패). */
  boutRecord: "kaito_web.boutRecord.v1",
  serverDuelRequest: "kaito_web.serverDuelRequest.v1",

  arenaCostumes: "kaito_web.arenaCostumes.v1",
  /** 무투장 16강 컵(`sim/tournament/ArenaCupRules` — 짜던 대진·진행 중인 컵·대표별 기록과 우승 도감, `{version:1, draft, cup, records}`). */
  arenaCup: "kaito_web.arenaCup.v1",
  /** 무투장 16강 컵 기록실(`sim/tournament/ArenaCupArchive` — 끝난 컵의 대진과 15경기의 기록, `{version:1, cups}`, 최근 50 + 핀 20). */
  arenaCupArchive: "kaito_web.arenaCupArchive.v1",
  /** 공유 링크로 연 무투장 경기의 승자 찍기(`app/ArenaPicks` — 경기 열쇠별로 찍은 코너와 맞힘, `{version:1, picks}`, 최근 200개). */
  arenaPicks: "kaito_web.arenaPicks.v1",
  /** 무투장 내 선수 출전(`platform/arenaMyFighterStorage` — 제작자 페이지가 넘긴 등록 선수 UUID, 최근 것 먼저, `{version:1, ids}`). */
  arenaMyFighters: "kaito_web.arenaMyFighters.v1",
  /**
   * ODDBOUT 계정의 금화(`platform/oddboutGoldStorage` — 로그인한 계정마다 서버 잔액의 사본·이 계정에 묶인 컵 표·받은 경기 열쇠·아직 서버에 청하지
   * 못한 경기, `{version:1, accounts:{<uuid>:{gold, cups, paid, pending}}}`, 계정 4개까지). 서버(`af_gold_wallets`)가 원본이다. 금화는 서버가 직접
   * 돌린 경기에서만 나온다 — 로그아웃 상태의 브라우저 지갑(`kaito_web.oddboutGold.v1`)은 2026-10-27에 없앴다.
   */
  oddboutGoldAccount: "kaito_web.oddboutGoldAccount.v1",
  /**
   * ODDBOUT 로그인 세션(`platform/oddboutSession` — supabase-js 가 이 열쇠에 접근·갱신 토큰과 사용자를 쓴다. PKCE 검증값은
   * `<이 열쇠>-code-verifier`). 사이트 전체(같은 출처의 모든 페이지·탭)가 한 세션을 쓴다(2026-10-27 사용자 결정).
   */
  oddboutSession: "kaito_web.oddboutSession.v1",
  /** sessionStorage: Google 로그인으로 떠날 때 페이지의 해시 경로(`#fighter=…`·`#device=…`) — 돌아오면 되살리고 지운다(1회성). */
  oddboutSignInReturn: "kaito_web.oddboutSignInReturn.v1",
  /**
   * 이 브라우저가 승인을 부탁받은 작업 공간 로그인 코드(`platform/devicePairingStorage` — `{version:1, code, seenAt}`). 승인·취소·거절하면 지운다.
   * 로그인을 거쳐 `#device=`가 사라져도 승인 화면을 되살리고, 10분이 지났으면 만료를 알린다(2026-10-28).
   */
  oddboutDevicePairing: "kaito_web.oddboutDevicePairing.v1",
  /**
   * 로그아웃 상태로 연 에이전트의 그림 보내기 링크(`platform/pictureTicketStorage` — `{version:1, ticket, seenAt}`). 로그인을 거쳐 `#view=upload`가
   * 사라져도 그 화면을 되살린다. 로그인한 화면이 서면 지우고, 표의 30분이 지나도 지운다(2026-11-01).
   */
  oddboutPictureTicket: "kaito_web.oddboutPictureTicket.v1",
  /** 제작자 페이지의 "다른 방법"을 펴 둔 채 떠났음(`platform/creatorFoldStorage` — `"1"`이면 펴 둠, 없으면 접힘). 보는 사람의 편의다(2026-10-29). */
  oddboutCreatorOtherWays: "kaito_web.oddboutCreatorOtherWays.v1",
  /**
   * sessionStorage: 로그아웃 랜딩에서 적은 첫 선수 한 줄(`platform/hostedDraftStorage` — `{version:1, concept, language, key, savedAt}`).
   * Google 로그인에서 돌아온 생성 패널이 한 번 읽어 그 멱등 열쇠로 신청하고 지운다. 30분이 지났으면 버린다(2026-10-30, 첫 선수 무료).
   */
  oddboutHostedDraft: "kaito_web.oddboutHostedDraft.v1",
  /** 타이틀 웹툰 프롤로그를 끝까지 봤거나 건너뛰었음. 다음 부팅부터는 줌아웃 박에서 시작하는 짧은 판을 튼다. */
  titlePrologueSeen: "kaito_web.titlePrologueSeen.v1",
  /** 첫 세션 이탈 퍼널 시도 기록. */
  firstSessionFunnel: "kaito_web.firstSessionFunnel.v1",
  /** 전송 실패한 초대장 결과의 재시도 큐. */
  invitationResultOutbox: "kaito_web.invitationResultOutbox.v1",
  /** 지금 플레이하는 저장 슬롯 번호(`"1"`~`"3"`). 없으면 1 — 슬롯 도입 이전 저장이 그대로 슬롯 1이다. */
  activeSaveSlot: "kaito_web.activeSaveSlot.v1",
  /** 슬롯별 `{version:1, savedAt}` — 타이틀 슬롯 카드의 "마지막 플레이" 시각. 나머지 요약은 meta 에서 파생한다. */
  saveSlotSummary: "kaito_web.saveSlotSummary.v1",
  /** sessionStorage: 슬롯 전환 새로고침 뒤 타이틀이 곧바로 시작할 슬롯(1회성). */
  saveSlotLaunch: "kaito_web.saveSlotLaunch.v1",
  /** 슬롯별 마을 재개 지점 `{version:1, savedAt, x, y, facing}` — 이어하기가 돌아갈 마지막 좌표. */
  villageResume: "kaito_web.villageResume.v1",
  /** 슬롯별 아직 도시에서 읽을 만큼 보이지 못한 귀환 보고 `{version:1, report}`. 보이면 지운다. */
  villageHomecoming: "kaito_web.villageHomecoming.v1",
  /** 슬롯별 로잘린 자유 대화·사용자가 남긴 기억·대화 설정. */
  companionJournal: "kaito_web.companionJournal.v1",
  /** 슬롯별 잠입 일시 저장(SimState 스냅샷). 이어하면 지워지는 1회성 저장이다. */
  heistSuspend: "kaito_web.heistSuspend.v1",
  /** 슬롯별 시설 화면 재개(옷가게·계약 화면·경매 통로·정산) — 마지막 시설 화면 하나. 떠나면 지운다. */
  facilityResume: "kaito_web.facilityResume.v1",
  /**
   * 쿠마전 한 판씩의 기록(`app/CityFightLogRecord` `{version:1, bouts}` — 최근 500판, 2026-10-20 사람 플레이테스트). 일반 플레이도 남기고,
   * 플레이테스트의 판에만 테스터 표식이 붙어 내보내진다. 새 테스터의 비우기에서 빠진다.
   */
  cityFightLog: "kaito_web.cityFightLog.v1",
  /** `?playtest=kuma` 의 지금 테스터 세션 `{version:1, id, name, serial, startedAt, seeded, retired}`(`app/KumaPlaytest`). */
  playtestSession: "kaito_web.playtestSession.v1",

  // --- localStorage: ai-fighter. 접두사 (예외, 제작자 페이지가 먼저 배포한 주소) ---
  /**
   * ODDBOUT 모든 페이지가 함께 쓰는 언어 선택(`platform/localePreference` — `"en"`·`"ko"`). 사용자가 언어 토글을 눌렀을 때만 쓴다.
   * 제작자 페이지 전용으로 배포된 주소를 그대로 이어 쓴다(2026-11-01). fighter.html 의 부팅 인라인 스크립트도 이 문자열을 읽는다.
   */
  oddboutLocale: "ai-fighter.creator.locale.v1",

  /** 코옵 게스트 토큰. */
  coopGuestToken: "wonder-player.coop.guest-token.v1",
  /** 코옵 전용 키/패드 바인딩. */
  coopControls: "wonder-player.coop.controls.v1",

  // --- IndexedDB 데이터베이스 이름 ---
  /** 받은 초대장. */
  invitationsDb: "kaito_web.invitations",
  /** 내가 발행한 초대장의 관리 capability. */
  publishedInvitationsDb: "kaito_web.publishedInvitations",
  /** 내 사진으로 생성한 플레이어 WebP와 프레임 계약. */
  playerLookDb: "kaito_web.playerLook",
  /** 개인 유물 등록 결과. */
  personalArtifactDb: "kaito_web.personalArtifact",
} as const);

/** IndexedDB object store 이름. DB 이름과 짝을 이룬다. */
export const INDEXED_DB_STORES = Object.freeze({
  invitations: "received",
  publishedInvitations: "management",
  personalArtifact: "artifacts",
  playerLook: "looks",
} as const);

/**
 * 이관 목적으로만 읽는 옛 키. 새 코드가 여기에 쓰면 안 된다.
 *
 * 읽고 나면 지운다 — 남겨 두면 다음 이관이 같은 데이터를 두 번 본다.
 */
export const LEGACY_STORAGE_KEYS = Object.freeze({
  /** `kaito_web.playLogs.v4` 이전의 플레이 로그. 결측 필드는 `null` 로 이관한다. */
  playLogs: Object.freeze(["kaito_web.playLogs.v3", "kaito_web.playLogs.v2", "kaito_web.playLogs.v1"] as const),
} as const);

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
export type StorageKeyName = keyof typeof STORAGE_KEYS;

/**
 * 저장 슬롯 분류. 새 키는 여기서 둘 중 하나를 **반드시** 고른다 — `Record` 라 빠뜨리면 타입이
 * 깨지고, `test/save-slots.test.ts` 가 한 번 더 확인한다.
 *
 * - `slot` — 플레이하면 바뀌는 진행. 슬롯 1은 원래 키 그대로, 슬롯 2·3은 `<key>@slot2` 처럼
 *   접미사를 붙인다(`app/SaveSlots.slotScopedKey`). IndexedDB 는 DB 이름이 아니라 레코드 키에 붙인다.
 * - `global` — 사람·기기에 속한 것: 설정, 개발용 기록·분석, 내가 받은/만든 초대장, 코옵, 슬롯 포인터.
 *
 * 경계 판단(이유는 docs/kaito-web/runtime-foundations.md "저장 슬롯"):
 * `villageHudPreferences` 는 진행이 아니라 화면 배치 취향이라 global, `personalArtifactDb` 는 초대장
 * 작성에서도 쓰는 내 사진 자산이라 global, `playerLookDb` 는 슬롯마다 고르는 주인공 외형이라 slot.
 * `introSeen` 은 부팅 영상을 이 브라우저에서 이미 본 사람의 기록이라 global(슬롯을 바꿔도 영상을 다시 틀지 않는다).
 */
export type StorageScope = "slot" | "global";
export const STORAGE_KEY_SCOPES: Readonly<Record<StorageKeyName, StorageScope>> = Object.freeze({
  outfitCommissionReceipt: "global",
  meta: "slot",
  latestReplay: "global",
  playLogs: "global",
  playLogSource: "global",
  playLogSequence: "global",
  playerSettings: "global",
  villageHudPreferences: "global",
  villageJourney: "slot",
  introSeen: "global",
  boutRecord: "global",
  serverDuelRequest: "global",
  arenaCostumes: "global",
  arenaCup: "global",
  arenaCupArchive: "global",
  arenaPicks: "global",
  arenaMyFighters: "global",
  oddboutGoldAccount: "global",
  oddboutSession: "global",
  oddboutSignInReturn: "global",
  oddboutDevicePairing: "global",
  oddboutPictureTicket: "global",
  oddboutCreatorOtherWays: "global",
  oddboutHostedDraft: "global",
  titlePrologueSeen: "global",
  firstSessionFunnel: "global",
  invitationResultOutbox: "global",
  activeSaveSlot: "global",
  saveSlotSummary: "slot",
  saveSlotLaunch: "global",
  villageResume: "slot",
  villageHomecoming: "slot",
  companionJournal: "slot",
  heistSuspend: "slot",
  facilityResume: "slot",
  cityFightLog: "global",
  playtestSession: "global",
  oddboutLocale: "global",
  coopGuestToken: "global",
  coopControls: "global",
  invitationsDb: "global",
  publishedInvitationsDb: "global",
  playerLookDb: "slot",
  personalArtifactDb: "global",
});
