import { localeText, type Locale } from "./Locale";
import { t } from "./i18n";

/** One score owns both audible notes and the bird's visible performance. */
export const CLOCKWORK_BIRD_SCORE = Object.freeze({
  frequencies: [784, 988, 1175, 1047, 988, 784, 880, 784] as readonly number[],
  noteMs: 360,
  spacingMs: 290,
});
export const CLOCKWORK_BIRD_CLUE = Object.freeze({
  noteCount: 4,
  startMs: 400,
  durationMs: 3 * CLOCKWORK_BIRD_SCORE.spacingMs + CLOCKWORK_BIRD_SCORE.noteMs,
});
export const BIRD_RETURN_PRESENTATION = Object.freeze({
  durationMs: (CLOCKWORK_BIRD_SCORE.frequencies.length - 1) * CLOCKWORK_BIRD_SCORE.spacingMs + CLOCKWORK_BIRD_SCORE.noteMs,
  handoffMs: 900,
  windingMs: 1100,
  quietBreathMs: 710,
});
export const BLACKTHORNE_COPY = {
  loan: ["대여품 · 마을 시계공", "ON LOAN · VILLAGE CLOCKMAKER"],

  letterPromise: ["하룻밤 전시 후 반환", "Return after one evening"],
  donation: ["블랙손 기증 예정", "TO BE DONATED BY BLACKTHORNE"],
  vault: ["태엽새 · 위층 수장고", "CLOCKWORK BIRD · UPSTAIRS VAULT"],
  invitation: ["빌려온 박수", "BORROWED APPLAUSE"],
  promise: ["시계공에게 태엽새 돌려주기", "Bring the bird home to the clockmaker"],
  guest: ["걸어서 둘러보기 · 위층 출입 제한", "WALK AS A GUEST · RESTRICTED UPSTAIRS"],
  composed: ["손님처럼 천천히 걷자", "Walk calmly to blend in"],
  restricted: ["제한 구역 · 경비의 눈을 피하자", "RESTRICTED · Stay out of sight"],
  exposed: ["정체가 드러났다 · 손님 신분을 잃었다", "COVER LOST · Guards know you"],
  return: ["태엽새 돌려주기", "Return the clockwork bird"],
  talk: ["시계공에게 말 걸기", "Talk to the clockmaker"],
  play: ["태엽새 노래 듣기", "Wind the clockwork bird"],
  pending: ["약속을 지킬 차례다. 시계공의 빈 받침으로.", "One promise left. Take the bird to the clockmaker’s empty stand."],
  returned: ["내일 정오에도 들을 수 있겠네요.", "We will hear it again tomorrow at noon."],
  applause: ["저택에서는 박수까지 받았습니다.", "They even applauded my departure."],
  machine: ["작동·탈출 연동\n아래층에 큰 소음 / 회수 때 한 번 더", "PLAY & LINK TO ALARM\nLoud noise below / again on recovery"],
  machineUsed: ["박수까지 직접 준비하셨군.", "He even prepared his own applause."],
} as const;
export function blackthorneCopy(id: keyof typeof BLACKTHORNE_COPY, locale: Locale): string {
  const [ko, en] = BLACKTHORNE_COPY[id]; return localeText(locale, ko, en);
}

export function blackthorneObjective(recovered: boolean, rehearsal: boolean, locale: Locale): string {
  if (rehearsal) return recovered ? t(locale, "manor.story.practiceEscape") : t(locale, "manor.story.practiceApproach");
  return recovered ? t(locale, "manor.objective.escapeWithBird") : t(locale, "manor.story.recoverBird");
}
export function blackthorneSpeaker(actor: "clockmaker" | "steward" | "player" | "blackthorne" | "guests", locale: Locale): string {
  const names = { clockmaker: ["시계공", "Clockmaker"], steward: ["관리인", "Steward"], player: ["플레이어", "Player"], blackthorne: ["블랙손", "Blackthorne"], guests: ["손님", "Guest"] } as const;
  return localeText(locale, names[actor][0], names[actor][1]);
}
