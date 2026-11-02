// 금고지기(블랙손 공개 결투의 상대)의 경비 ID. 결투 규칙(`BlackthorneBossRules`)과 떼어, ID 만 묻는 곳(잠입 전투 소리표 `CombatAudio` 등)이
// 결투 규칙과 그 밑의 경비·이동·런 규칙을 끌어오지 않게 한다(2026-10-30 — 효과음 재생기를 거쳐 무투장 첫 화면까지 실렸다).

export const BLACKTHORNE_BOSS_ID = "manor-vault-watch";

/**
 * 공개 결투의 상대. 잠입 위기 표식(발각선·수색 과녁·포박)과 일반 경비 쓰러짐 표식 대신
 * 보스 연출을 쓴다. 보스가 늘어나면 이 목록만 넓힌다.
 */
export function isEncounterBoss(guardId: string): boolean {
  return guardId === BLACKTHORNE_BOSS_ID;
}
