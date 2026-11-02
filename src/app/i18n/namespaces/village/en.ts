import { defineBase } from "../../catalog";

/** 마을·퀘스트·저널·시계공·캠페인 이야기 문구. 키 접두사: `village.` */
export const VILLAGE_EN = defineBase({
  // 도시의 곰 탈 장사 KUMA. 말을 걸면 맨주먹 대결을 청한다(NativeCityScene 쿠마 대화). 답 두 개는 대화 판의 고르기 단추다.
  "village.kuma.name": "KUMA",
  "village.kuma.challenge": "...What are you looking at? Fancy a round?",
  "village.kuma.rematch": "Back again? One more round?",
  "village.kuma.fight": "Let's fight",
  "village.kuma.decline": "Never mind",
  // 첫 의상 뒤 로잘린의 평소 대사 끝 답 두 개(2026-10-18). "가게로"를 고르면 의상실(주문 제작)로 들어간다.
  "village.rosaline.enterShop": "Step inside",
  "village.rosaline.later": "Maybe later",
  "village.kumaExchange.sorryDodge": "Pardon me!",
  "village.kumaExchange.goodWorkBow": "As announced.",
  // 승리 상금(2026-10-15, `CityFightRewardRules`): 이긴 인사에 상금을 붙인다.
  "village.kumaExchange.goodWorkPrize": "As announced. · Prize +{gold}",
  // 쿠마 3단계 근무(2026-10-15, `kuma.phases`): 근무 선을 넘어 넘어졌다 일어날 때 쿠마 머리 위 한마디. 2 야근(잡기가 끼어든다), 3 곰탈에 금.
  "village.kumaExchange.shiftNight": "Playtime's over!",
  "village.kumaExchange.shiftCrack": "My mask... cracked?!",
  // 쿠마전 상성 레슨 카드(2026-10-15, app/CityFightLesson): 정답 키캡 옆의 규칙 한 줄, 멈춘 싸움을 푸는 안내.
  // 2026-10-19 읽기 보상(`triangle.best`): 카드는 색마다 최선의 답(기회를 여는 답)을 말하고, 살아남기만 하는 답을 덧붙인다.
  "village.kumaLesson.white": "White swing · V when the ring fills — a block only holds",
  "village.kumaLesson.gold": "Gold smash · a timed vault opens him — a block only holds",
  "village.kumaLesson.red": "Red grab · cut it before it lands",
  "village.kumaLesson.whiteCall": "COUNTER!",
  "village.kumaLesson.goldCall": "VAULT!",
  "village.kumaLesson.redCall": "HIT FIRST!",
  "village.kumaLesson.pauseToggle": "Guide pause",
  "village.kumaLesson.pauseOn": "On",
  "village.kumaLesson.pauseOff": "Off",
  "village.kumaLesson.pauseToggleHint": "Stop the fight on a new attack and wait for the right key",
  "village.fightAuto.toggle": "Auto play",
  "village.fightAuto.mark": "AUTO",
  "village.kumaLesson.pressToGo": "Press {key} to go on",
  "village.fightCombo.hits": "HITS",
  // 필살기 컷인의 기술 이름(2026-10-21, `CityFightSuperFlashView`): 이름이 없는 시전자는 이름판 없이 얼굴만.
  "village.fightSuper.kuma": "BEAR HAMMER",
  "village.fightSuper.yume": "BLOSSOM DROP",
  "village.fightSuper.bravow": "SPOTLIGHT STEAL",
  "village.fightSuper.beotim": "HOLD THE LINE",
  "village.fightSuper.quickcat": "RAINBOW COMET",
  "village.fightSuper.kungjjak": "ENCORE FINALE",
  "village.fightSuper.sikeundung": "THAT'S FAR ENOUGH",
  "village.fightSuper.duldul": "EXTRA REACH",
  "village.fightSuper.eoridung": "WHAT WAS THAT",
  // 다시/돌아가기 고르기. 짧고 웃기게 — 근엄한 곰 탈 경비의 회사 말투가 "칼퇴 완료" 개그와 맞물린다.
  "village.kumaFight.calmCaption": "...Pardon.",
  "village.kumaFight.defeat.1": "Your fists are too light.",
  "village.kumaFight.defeat.2": "Win first. Then talk.",
  "village.kumaFight.defeat.3": "This mask isn't for show.",
  "village.kumaFight.retry": "Retry",
  "village.kumaFight.leave": "Walk away",
  // 옷가게 첫 변신(2026-10-13, OutfitTransformationView)의 팝아트 만화 효과음 글자: 하트 고리가 뜰 때 "뿅!", 팡에 "짠!".
  "village.outfitTransform.pop": "Boing!",
  "village.outfitTransform.tada": "Ta-da!",
  // 컵 표(2026-10-26): 시작이 랭킹 서버의 표를 기다리는 동안, 표가 오지 않아 다음 누름이 랭킹 없이 시작할 때.
});
