/**
 * 키 하나가 어떻게 생겼는가의 단일 원본(색·글꼴·높이). Phaser 를 들이지 않는다 — DOM 화면(컷신 건너뛰기 안내
 * `CutsceneSkipHintView`)도 같은 키캡을 그리고, 그 화면을 쓰는 뷰가 Phaser 없이 시험된다. 그리기는 `KeycapArt` 가 한다.
 *
 * 튜토리얼 코치와 타이틀이 같은 "누를 것"을 서로 다른 모양으로 그리면, 플레이어는
 * 둘이 같은 종류의 안내인지 매번 다시 판단해야 한다. 모양·색·크기는 여기서만 정하고
 * 화면은 라벨과 위치만 고른다.
 *
 * 라벨 글꼴이 본문 세리프를 따르지 않는 것은 의도다 — 키캡은 물리적인 키를 흉내 내는
 * 물건이라 산세리프가 맞고, 실제 라벨도 ENTER·S·SPACE·화살표처럼 라틴이 대부분이다.
 */
export const KEYCAP_FONT = '"Noto Sans CJK KR", "Noto Sans KR", sans-serif';

export const KEYCAP_HEIGHT = 27;

export const KEYCAP_COLORS = {
  shell: 0x241728,
  side: 0x6f5b4e,
  sideHighlight: 0x9c8265,
  top: 0xf7e9c8,
  topShade: 0xd8bd84,
  topHighlight: 0xfff8e8,
} as const;
