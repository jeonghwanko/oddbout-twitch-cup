/**
 * 렌더 깊이(z-순서)의 단일 진실원.
 *
 * 깊이는 씬 하나의 디스플레이 리스트 안에서만 의미가 있다. 그래서 씬별로 나눈다:
 * HeistScene(모든 월드 뷰가 공유하는 큰 스택), HudScene, 마을(NativeCityScene).
 * TitleScene·LoadingScene 은 자기완결이라 여기 없다 — test/depths.test.ts 의
 * 예외 목록에 이유와 승격 조건이 적혀 있다.
 *
 * 값은 전부 이관 전 리터럴 그대로다(동결). 같은 값이 여럿인 곳(충돌)은 고치지 않고
 * `[충돌: …]` 주석으로만 표시한다 — 지금은 HeistScene.create 의 뷰 생성 순서
 * (= 디스플레이 리스트 삽입 순서)가 유일한 타이브레이커고, Phaser 의 깊이 정렬은
 * 안정적이라 그 순서가 보존된다. 재배치는 별도의 시각 QA 결정이다. 그때는 이 파일과
 * test/depths.test.ts 의 충돌 명부를 함께 고쳐야 테스트가 통과한다.
 *
 * 미세 간격 상수는 부동소수점상 정확히 일치할 때만 식으로 쓴다 — 3.7 + 0.2 는
 * 3.9 가 아니다(IEEE754). 아래 식들은 전부 비트 단위 일치가 검증된 것만 남겼고,
 * test/depths.test.ts 의 anchor 단언이 표류를 잡는다.
 */

/** 배우 층의 기준. 자루·군중·운반 시체·전경 승격이 전부 이 값에 상대적이다. */
const PLAYER_BODY = 10;

/** 협동 아이소메트릭 월드. 같은 높이의 발끝 순서가 건축·배우에 함께 적용된다. */
export const COOP_DEPTHS = Object.freeze({ backdrop: -30, scenery: -20, foundation: -1, floor: 0, inlay: 0.5, groundCue: 1, world: 10, carriedRelicOffset: 1, effect: 2000, overlay: 3000, finale: 3010, finaleRelic: 3020 });
export function coopYSorted(y: number): number { return COOP_DEPTHS.world + y; }

export const HEIST_DEPTHS = Object.freeze({
  // ── 배경 (-20 … -9) ──────────────────────────────────────────────
  auctionBackstageVoid: -20.1, // 경매장 홀·무대 뒤 밖의 어둠 — 모든 원경 아래
  backgroundTile: -20, // 층 원경 타일
  tutorialWindowScenery: -19.99, // 기존 창 유리 안쪽에만 보이는 먼 지붕
  tutorialWindowCloud: -19.98, // 같은 유리 마스크 내부의 느린 구름
  interiorNight: -19.95, // 블랙손 외벽 밖 밤 — 실내 타일과 같은 영역을 공유하지 않는다
  interiorCity: -19.94, // 실내에서 보이는 외벽 너머 도시
  auctionHallBackground: -19.9, // 고정 경매장 전용 원경 — 공용 층 타일 위, 판정 지오메트리 아래
  rooftopEscapeSky: -19.8, // 옥상 창 피날레의 5단 하늘 — 기존 층 원경을 덮고 지오메트리 뒤
  rooftopEscapeClouds: -19.7, // 오로라·별 위를 흐르는 입체 구름
  rooftopEscapeFarRain: -19.6, // 건축·배우 뒤 원경 비
  rooftopEscapeSilhouette: -19.5, // 하늘을 끊는 먼 지붕선·충돌 스플래시
  backgroundVeil: -15, // 층별 색 베일 — 원경을 층 분위기로 물들인다
  archShading: -14, // 아치 음영
  windowMoonlight: -13.5, // 구조 창에 고정된 냉색 월광 — 벽 위, 대표 방·판정 지오메트리 아래
  tutorialBackdropGlow: -13.4, // 튜토리얼 1~6의 장별 색·초점광 — 구조 뒤, 대표 방·판정 아래
  signatureRoomArt: -13, // 대표 방 투명 건축 — 배경 위, 판정 지오메트리 아래
  geometry: -10, // 벽·바닥 지오메트리 (sim 사각형을 그대로 그린 것)
  bandLabel: -9, // 층 이름 라벨

  // ── 구조물·소품 (2 … 5.5) ────────────────────────────────────────
  auctionFloorCarpet: 1.9, // 경매장 플레이 바닥 — 원경 위, 모든 배우·소품 아래
  interiorFloor: 1.8, // 블랙손 실제 층 바닥 면 — 가구/해치/그림자 아래
  interiorWallFixture: 1.7, // 벽 부착물 — 바닥과 벽 앞 가구 뒤
  interiorWallPlaque: 1.72, // 벽에 박힌 갈림길 안내 명판(글자를 구운 원화) — 벽 부착물·샤프트 뒷벽 위, 천장 아래
  interiorCeiling: 1.75, // 윗층 슬래브와 뒷벽 사이 천장 — 벽기둥 위, 실제 사다리 아래
  interiorFurnitureShadow: 3.55, // 비충돌 벽 앞 가구의 접지 그림자
  interiorWallFurniture: 3.6, // 벽 앞 장비장·이젤 — 통행 배우 뒤
  interiorFurnitureDetail: 3.61, // 이젤의 그림·문구 — 물체와 같은 공간, HUD 아님
  interiorFloorShade: 1.81, // 바닥 뒤쪽 벽 접점
  interiorFloorLip: 10.32, // 발보다 10px 아래의 2px 전경 마감 — 보행면과 몸은 가리지 않는다
  interiorEndWall: 1.83, // 우측 실제 경계벽의 석재 마감
  interiorRoofPreview: 1.84, // 실내에서 보이는 짧은 창밖 발판 — 옥외 전환판 아래
  auctionStageLight: 1.95, // 경매장 중앙 광량·활성 입찰자 초점 — 바닥 위, 객석 배우 아래
  fixture: 2, // 사다리·낙하판·환기구 — 판정 사각형과 1:1 인 붙박이
  physicsProp: 4.1, // 움직이는 충돌 소품 — 장식 원화 앞, 조명·배우 뒤
  physicsCue: 4.2, // 물리 소품의 밧줄·충격·접촉 표식 — 본체 위
  auctionAudience: 2.2, // 경매장 좌석 배우 — 원경 위, 진열대·플레이 배우 아래
  lampProp: 3, // 등 원화 (불빛은 조명 층이 따로 그린다)
  atmosphereAirGlow: 3.45, // 공기 입자 글로우
  atmosphereAirInk: 3.5,
  propShadow: 3.7, // 소품 발밑 타원 그림자
  hideSpotShadow: 3.8, // 은신처 발밑 그림자
  propSilhouette: 3.9, // 사방 1px 큰 암색 복제 — 같은 톤의 벽에서 실루엣을 끊는다
  hiddenPlayerBody: 3.95, // 은신 중 플레이어 실루엣 — 은신처 원화 뒤, 바닥 소품 실루엣 위
  propArt: 4, // 소품·은신처 원화
  hazardRope: 4.5, // 샹들리에 밧줄
  caperDevice: 4.6, // 연쇄극 소품 원화 — 붙박이 소품 위, 경비 아래
  caperDeviceCue: 4.61, // 발동 범위·완료선 — 원화를 가리지 않고 앞에서 읽힌다
  mansionResponseArt: 4.7, // 지난 성공을 기억한 저택의 물리적 대응 표식
  hazardChandelier: 5, // 샹들리에 본체
  lootExitArt: 5.5, // 탈출구 원화
  auctionPlinth: 5.45, // 경매 진열대 — 전리품 바로 뒤

  // ── 전리품·잠금 (6 … 6.5) ────────────────────────────────────────
  passageLock: 6, // 잠긴 통로 표시
  lootGraphics: 6, // [충돌: passageLock] 전리품 도형 표기
  lootImage: 6.5, // 전리품 원화
  exhibitionSeal: 6.52, // 잠긴 진열장의 판유리 반사·자물쇠 — 태엽새 원화 앞(유리 너머로 보이게), 등불 워시 아래

  // ── 조명 (6.45 … 6.65) ───────────────────────────────────────────
  // 암막 6.45 는 의도된 끼어들기다: 전리품 도형(6)은 어둠에 잠기고
  // 원화(6.5)는 어둠 위에서 빛난다. 재배치할 때 이 관계부터 지켜라.
  lightingDarkness: 6.45,
  passageCueBack: 6.452, // 통로 빛의 사다리 역광 — 암막 위, 밟는 면(가로대) 아래라 가로대가 실루엣으로 선다
  traversalSurface: 6.46, // 발판·사다리의 실제 밟는 면 — 암막 위, 배우 아래
  exhibitionMotion: 6.47, // 이동 전시대의 윤곽·권양 장치 — 암막 위, 태엽새 아래
  objectiveGroundCue: 6.49, // 목표 유물 접지 VFX(`ObjectiveGroundFxView`) — 암부 위에서 보이되 유물 원화는 덮지 않는다
  lampWash: 6.55, // 등불 벽면 워시
  lampFloorPool: 6.6, // 바닥 빛 웅덩이
  // 통로·출구 빛 표시(`PassageCueView`) — 표지판 대신 바닥 웅덩이·빛줄기·먼지. 암막·등불 웅덩이 위, 배우 그림자 아래.
  passageCueLight: 6.605,
  passageCue: 6.606,
  passageCueGlow: 6.607,
  tutorialStageMotif: 6.62, // 장별 그림자·채광·굴절광 — 조명 위, 광원 코어·배우 아래
  lampCore: 6.65, // 광원 코어
  characterWallShadow: 6.8, // 복도 벽에 투영되는 배우 실루엣 — 라벨·접지 그림자·본체 아래

  // ── 라벨·큐 글로우 (7 … 7.1) ─────────────────────────────────────
  lootLabel: 7, // 전리품·탈출구 라벨
  hideSpotHalo: 7, // [충돌: lootLabel] 은신처 금빛 헐레이션
  signatureRoomLabel: 7.05, // 대표 방 이름·실제 공략 규칙 — 조명 위, 배우 아래
  hideCueGlow: 7.1, // 손잡이 반짝임 — 암막(lightingDarkness) 위, 캐릭터(playerBody) 아래

  // ── 캐릭터 그림자 (7.1 … 7.4) ────────────────────────────────────
  crowdShadow: 7.1, // [충돌: hideCueGlow]
  surveillanceDeviceField: 7.15, // 고정식 감시 촛대의 실제 시야 면 — 환경·전리품 위, 배우 그림자 아래
  surveillanceDeviceGlow: 7.16, // 촛대 시야의 낮은 광량층
  surveillanceDeviceEdge: 7.17, // 방향 광축·실제 사거리 경계
  guardShadow: 7.2,
  surveillanceGroundGlow: 7.21, // 경비 발밑 감시 표식 잔광 — 접지 그림자 위, 배우 아래
  surveillanceGround: 7.22, // 방향·사거리·판정 타입 접지 표식
  playerSoftShadow: 7.3,
  playerShadow: 7.4,
  exteriorBackdrop: 7.75, // 외벽 모드 플레이트 — 실내 지오메트리·조명 위, 사슬·배우 아래
  exteriorArtwork: 7.751, // 옥상 너머 먼 도시 원화 — sky fallback 위, 실제 지붕 아래
  exteriorCityHaze: 7.7515, // 먼 도시의 저대비 냉색 헤이즈
  exteriorParapet: 7.752, // 실제 지붕 구간별 낮은 뒷난간 — 도시 앞, 보행면 뒤
  exteriorStageBacklight: 7.7522, // 배우 뒤 난간·도시 띠의 달빛 역광 — 난간 위(몸통 뒤 띠를 밝힌다), 판석 아래
  exteriorFloor: 7.753, // 보스전의 깊은 지붕 보행면 — 외벽 위, 실제 지붕 틈·배우 아래
  exteriorFloorFalloff: 7.7532, // 판석 앞쪽을 어둡게 떨어뜨리는 감쇠 — 판석 위, 달빛 웅덩이 아래
  exteriorFloorMoonPool: 7.7535, // 전투 면에 고이는 달빛 웅덩이 — 감쇠 위, 등불 빛 아래
  exteriorLanternLight: 7.754, // 입구 등불의 절제된 바닥 웅덩이 — 판석 위, 바닥 판정 아래
  exteriorFacade: 7.7545, // 앞턱 아래로 이어지는 저택 윗층 외벽 원화 — 먼 도시를 덮고, 실제 지붕 틈·복구 발판 아래
  passageCueExteriorBack: 7.7549, // 사다리 역광·출구 바닥 빛 — 바닥·외벽 위, 사다리·코핑·가고일 아래
  exteriorSurface: 7.755, // 실제 지붕 틈·복구 사다리 — 외벽·바닥 원화 위, 배우 아래
  grappleRing: 7.758, // 천장에 박힌 고리 원화 — 사슬이 그 아랫단을 감아 지나간다
  grappleChain: 7.76, // 외벽 플레이트를 덮고 배우 뒤에 남는 실제 사슬
  exteriorEntryArchitecture: 7.765, // 왼쪽 진입 탑과 아치 — 보행면 위, 경비와 실제 문 표시 아래
  exteriorLanternWallLight: 7.767, // 등불이 입구 벽에 남기는 약한 감쇠광
  exteriorLantern: 7.768, // 벽에 고정된 등불 — 입구 탑 위, 배우 뒤
  blackthorneHeistFixture: 7.77, // 외벽 플레이트 위의 실제 문·걸쇠
  blackthorneHeistKey: 7.78, // 금고지기에게서 드러난 제어키
  exteriorActorShadow: 7.79, // 외벽 플레이트 위의 접지 그림자 — 보스전 보행면과 배우 사이
  combatBackdrop: 7.84, // 큰 한 방의 정지 동안 배경을 누르는 잉크 막(2026-10-16) — 배경·조명·사슬 위, 임팩트 판·모든 배우 아래
  impactPaper: 7.85, // 예고장 임팩트 프레임의 종이·잉크 판 — 배경·조명·사슬 위, 모든 배우 아래
  impactPaperInk: 7.86, // 판 위의 잉크 가시·네모·열쇠구멍 — 판 위, 배우 아래

  // ── 배우 (8 … 11) ────────────────────────────────────────────────
  manorStageActor: 7.9, // 저택의 대화 배우 — 접지 그림자 위, 실제 경비·플레이어 아래
  manorStageProp: 10.1, // 배우 사이 초대장 전달·연단
  manorSpeechBackdrop: 25.7, // 월드 배우 말풍선 바탕
  manorSpeech: 25.8, // 월드 배우 말풍선·대화 입력
  combatGroundFxLight: 7.95, // 근접 선딜 바닥 에너지·보스 외투의 가산 빛 — 외벽 원화 위, 배우 아래
  combatGroundFx: 7.955, // 바닥 에너지의 그을음·열기 면(보통 합성)
  combatGroundFxGlow: 7.96, // 바닥 에너지의 가산 심·볏·불씨
  keeperChargeTrail: 7.99, // 금고지기 돌진의 잔상·속도선 — 몸 바로 뒤
  guardBody: 8,
  keeperKeyBeacon: 8.02, // 쓰러진 금고지기 곁 제어키의 금빛 신호 — 몸 위(손에 깔린 열쇠가 보이게), 순찰 힌트 아래
  keeperKeyLoose: 8.03, // 신호 위에 놓인 제어키 원화 — 가산 빛이 열쇠 형태를 태우지 않게 빛 위
  patrolIntel: 8.5, // 순찰 경로 힌트
  runDust: 8.5, // [충돌: patrolIntel] 질주 흙먼지
  blackthorneKeeperReadout: 8.52, // 금고지기 이름·체력, 외벽과 경비 위
  sprintLinesGlow: 8.6, // 플레이어 후방 속도선 — 먼지 위, 자루·본체 아래
  sprintLinesInk: 8.7,
  parkourGhost: 8.8, // 줄타기 금빛 잔상 — 속도선 위, 자루·본체 아래
  combatAfterimage: 8.85, // 대시 타격의 차가운 잔상 세 장 — 줄타기 잔상과 같은 층위, 본체 뒤
  carriedSack: PLAYER_BODY - 1, // 9 — 자루는 평소 플레이어 등 뒤
  stealthCrisisRopeBack: PLAYER_BODY - 0.04, // 9.96 — 포박 밧줄의 등 뒤 반원
  guestGuiseFxBack: PLAYER_BODY - 0.03, // 9.97 — 망토 펼침에 내던진 주홍 예복과 그 꼬리(배우 뒤)
  playerBody: PLAYER_BODY, // 10
  auctionDisguisePlayer: PLAYER_BODY + 0.01, // 경매에서 원래 플레이어 외형을 덮는 위장 배우
  stealthCrisisRopeFront: PLAYER_BODY + 0.02, // 10.02 — 몸통을 실제로 감싸는 앞 반원
  parkourFlash: PLAYER_BODY + 0.03, // 10.03 — 완벽한 놓음의 흰 실루엣 두 프레임, 본체를 덮는다
  guestGuiseFx: PLAYER_BODY + 0.035, // 10.035 — 귀빈 변장 연기·외알 안경·리본(배우 앞). 흰 실루엣 위, 전투 실루엣 아래
  combatSilhouette: PLAYER_BODY + 0.04, // 10.04 — 임팩트 프레임의 잉크/반전 배우·피격 흰 실루엣, 경비·플레이어 본체를 덮는다
  crowdBody: PLAYER_BODY + 0.05, // 10.05 — 군중이 플레이어를 가려야 인파에 숨는 그림이 된다
  keeperKeyHeld: PLAYER_BODY + 0.06, // 10.06 — 플레이어이 잡아 든 제어키(치켜들고 코트에 넣기까지) — 몸·피격 겹침 위
  draggedGuardBody: PLAYER_BODY + 0.2, // 10.2 — 어깨에 걸친 시체는 플레이어 앞에 얹힌다
  corridorForegroundLip: PLAYER_BODY + 0.3, // 10.3 — 발끝 1px을 가리는 복도 전경 턱
  exteriorForegroundLip: 7.975, // 보스전 석재 전면 — 바닥 예고 위, 모든 배우 아래
  exteriorGapArchitecture: 7.976, // 옥상 틈의 모서리 탑·골목·사다리 — 전면 턱 위, 모든 배우 아래
  exteriorGapFalloff: 7.977, // 옥상 틈 골목·모서리 벽이 끝나는 아래쪽을 어둠으로 녹인다 — 틈 원화 위, 비네트 아래
  exteriorVignette: 7.978, // 배경만 누르는 무대 비네트 — 외벽 원화·전면 턱·틈 위, 돌진 잔상·배우 아래
  exteriorExitArt: 7.9785, // 최종 출구문 — 외부 배경·감쇠 위, 통로 빛·배우 아래
  // 외벽 판이 덮는 동안의 통로 빛 — 비네트 위(아래 두면 옥상 출구가 눌려 사라졌다), 돌진 잔상·배우 아래.
  passageCueExteriorLight: 7.979,
  passageCueExterior: 7.98,
  passageCueExteriorGlow: 7.981,
  tutorialForegroundMotes: 10.34, // 튜토리얼 구간의 느린 근경 먼지 — 배우 앞, 전경 프레임 아래
  foregroundDressing: 10.35, // 판정 없는 목재·벨벳 전경 프레임 — 배우 앞, 기능 이펙트 아래
  parkourFxGlow: 10.38, // 줄타기 박자의 가산 빛 — 배우 앞, 조각 아래
  parkourFx: 10.39, // 줄타기 박자의 별·가시·고리·조각
  combatFxLight: 10.4, // 전투 접촉의 빛 웅덩이(방사형 가산 빛) — 배우 앞, 조각 아래
  combatFx: 10.41, // 전투 접촉의 네모 조각·고리·속도선·얼룩(보통 합성)
  combatFxGlow: 10.42, // 전투 접촉의 가산 코어·가시·궤적·섬광띠 — 조각 위(실험실 칠하는 순서와 같다), HUD(별도 씬) 아래
  foregroundLift: PLAYER_BODY + 1, // 11 — 등반 중 자루처럼 잠깐 플레이어 앞으로 승격하는 부착물

  // ── 세계 효과 (11 … 14) ──────────────────────────────────────────
  mischiefGlow: 11, // [충돌: foregroundLift] 장난 표적 글로우
  mischiefInk: 12,
  // 던지는 도구의 도트 이펙트(`ThrownToolFx`): 발사·비행·착탄·바닥의 유인구. 연막 구름(mischiefInk) 위여야 연막 터짐이
  // 구름 원에 묻히지 않고, 배우 앞이어야 경비 가슴에 꽂히는 불꽃이 몸에 가리지 않는다. 개조 무늬(12.2) 아래.
  thrownToolFxLight: 12.05,
  thrownToolFx: 12.1,
  thrownToolFxGlow: 12.15,
  // 괴도 무기 개조의 무늬(`WeaponModFx`)·닫힘 서명. 연막 구름(mischiefInk) 위여야 연막 개조의 고리·방울이 구름에 묻히지
  // 않는다(2026-09-29 VFX 리뷰). 소음 파문(13) 아래.
  weaponModFxLight: 12.2,
  weaponModFx: 12.3,
  weaponModFxGlow: 12.4,
  noiseGlow: 13, // 소음 결의 잉크 밑선(`NoiseRingView`, 보통 합성)
  noiseLine: 14,
  caperLink: 18, // 괴도의 눈에서만 선명해지는 장치 연결선
  mansionResponseLabel: 18.5, // 괴도의 눈에서 대응과 역이용 약점을 같은 월드 좌표에 설명

  // ── 판정 오버레이 (19 … 23) ──────────────────────────────────────
  actionFxGlow: 19, // 행동 이펙트 글로우
  actionFxFlipbook: 19.5, // 손그림 플립북 — 절차 글로우 위, 판정선(ink) 아래에서 순간만 강조한다
  keeperKeyFlying: 19.7, // 결판에 쳐 낸 제어키(날고 있는 동안) — 접촉 불꽃·플립북·임팩트 판 위에서 첫 프레임부터 읽힌다
  actionFxInk: 20,
  suspicionPips: 20, // [충돌: actionFxInk] 기상·무력화 진행 등 상태 링
  contextFocusInk: 22,
  escapeRouteCue: 22.5, // 개인 유물 회수 뒤 추천 출구·화면 가장자리 비컨
  objectiveTargetCue: 22.6, // 회수 전 목표 유물·화면 가장자리 방향 비컨
  comboFinishRing: 22.95, // 3/3 완주 때 발밑 판 뒤에서 퍼지는 금빛 고리 플립북 — 전투 예고 표기 바로 아래
  combatCue: 23, // 전투 예고 표기
  rivalIdentity: 23.2, // 활성 라이벌 이름·표식 — 전투 예고 위, 팝 텍스트 아래
  auctionBidCue: 23.3, // 입찰 패와 호가 지점 — 배우 위, 화면 상태 패널 아래
  auctionForegroundArchitecture: 23.4, // 밝은 커튼·기둥 근경 — 배우 위, 안내 UI 아래
  auctionForegroundAudience: 23.5, // 망치·교란 cue에 반응하는 좌우 근경 관객
  tutorialTarget: 23, // [충돌: combatCue] 튜토리얼 목표 링
  followLessonDim: 23.8, // 따라하기 레슨 멈춤의 어둠 — 적·플레이어 창 밖의 세계·판정 표기 위, 키캡·머리 위 정보 아래

  // ── 카드·코치 (24 … 26) ──────────────────────────────────────────
  lootDetailPanel: 24,
  // 줍기: 물건 원화가 자리에서 머리 위 보상 카드로 날아간다(`LootPickupFx`). 배우·상세 판 위, 머리 위 게이지 아래.
  lootPickupTrailLight: 24.1,
  lootPickupTrail: 24.15,
  lootPickupTrailGlow: 24.2,
  lootPickupFlight: 24.25,
  // 머리 위 생체 신호 — 기력 게이지와 저체력 하트. 배우·판정 오버레이 위, 같은 머리 위 자리를
  // 다투는 것들(전리품 카드·월드 말풍선·포박 위기 아이콘·NPC 심볼·결과 토스트) 아래다. 깊이만으로
  // 겹침을 정리하지 않는다 — 그들이 뜨면 `overheadVitalsYield`가 게이지를 먼저 걷는다.
  overheadVitalsGauge: 24.5,
  overheadVitalsHeart: 24.6,
  keycapCoach: 25, // 키캡 코치 기준 깊이 — 글자는 뷰 내부에서 +1 (26, 아래 경보 밴드와 겹침)
  lootRewardCard: 25, // [충돌: keycapCoach]
  mischiefLabel: 25, // [충돌: 위 둘]

  // ── 월드 경보 (26 … 32) ──────────────────────────────────────────
  threatFlare: 26, // 발각 플레어
  popText: 26, // [충돌: threatFlare] 만화 효과음 팝 텍스트
  damageNumberBacking: 26.4, // 결판 대미지 숫자 뒤 잉크·금박 폭발 원화 — 팝 텍스트 위, 숫자 아래
  damageNumber: 26.45, // 대미지 숫자 — 접촉 불꽃·팝 텍스트 위, 발각 광량 아래
  threatGlow: 27,
  threatInk: 28,
  stealthCrisisGlow: 29, // 추격선·포박 턱의 광량층
  stealthCrisisInk: 30, // 위기 상태를 색 없이도 가르는 실루엣층
  stealthCrisisStatus: 30.2, // 플레이어 머리 위 포박 상태·실패 카운트다운
  npcStateSymbolGlow: 30.4, // NPC 머리 위 상태 심볼의 얕은 후광
  npcStateSymbolProgress: 30.5, // 경직·기상·전투·포박 진행 호
  npcStateSymbol: 31, // 한 NPC당 하나만 보이는 이미지젠 상태 심볼
  npcStateSymbolLabel: 31.2, // 상태 심볼 위 상태명·실제 남은 시간
  interactionFeedback: 32, // 상호작용 결과 토스트

  // ── 화면 후처리 (48 … 60) ────────────────────────────────────────
  rooftopEscapeNearRain: 47.6, // 배우 앞 근경 비 — HUD와 비네트 아래
  rooftopEscapeLightning: 47.8, // 옥상 섬광·다중 코어 번개 — 비네트가 가장자리를 다시 잡는다
  combatSlowMoInk: 47.9, // 전투 슬로모의 가장자리 먹 번짐 — 근경 비·번개 위, 분위기 비네트 아래
  vignette: 48,
  combatHitCounter: 48.3, // 연타 수 결판 폭발 받침 — 화면 고정, 슬로모 먹 번짐·비네트 위, 시계 압박 장막 아래
  combatHitCounterGauge: 48.31, // 연타 수 아래 남은 창 게이지
  combatHitCounterText: 48.32, // 연타 수 숫자·단위
  runPressureOverlay: 48.5, // 시계 압박 장막 — 분위기 비네트 위, 대탈출 막 전환 아래
  grandEscapeOverlay: 49,
  stealthCrisisOverlay: 49.25, // 체포 확정 셔터 — 월드 연출 위, 디버그·HUD 아래
  debugOverlay: 50, // ?debug=1 (src/dev/DebugDraw)
  screenFlash: 60,
  grandEscapeBanner: 61,
  auctionSwapGlow: 61.95, // 바꿔치기 받음의 흰 반짝임·빛 — 진품 원화(auctionStatus) 아래에서 역광으로
  auctionStatus: 62, // 단일 화면 경매 박자·도입 연출
  auctionStatusText: 62.1, // 경매 플랫 패널 위 입찰자 이름·예산
  facilityReveal: 62.5, // 시설 첫 입장 실내 스틸 — 화면 연출 위, 도착 표제 카드 아래
  locationTitleCard: 63, // 저택 도착 표제 카드 — 화면 연출 위, 대화 리더 아래

  // ── 대화 리더 (100) ──────────────────────────────────────────────
  // 읽는 동안 화면을 소유하는 층. 월드 말풍선(25.8)·경보·비네트·화면 연출을 전부 덮어야
  // 초상과 대사가 끊기지 않는다. 값은 HUD_DEPTHS.dialogue 와 같은 100 — 어느 씬에서 열리든
  // 리더는 같은 계층이라는 약속이다. 깊이는 씬 안에서만 의미가 있고 HudScene 은 HeistScene
  // 뒤에 렌더되므로, 이 층이 상시 HUD 위로 올라오는 것은 리더가 열린 동안 HudScene 이
  // 스스로 물러나 주는 것으로 완성된다 (HudScene.update 의 stageOwnsHud).
  checkpointChoiceBackdrop: 99.5, // 붙잡힌 화면 재시도 안내 뒤 에나멜 판 — 체포 셔터 위, 안내 글 아래
  manorArrivalDialogue: 100, // 저택 첫 입장 대화 패널 · 붙잡힌 화면 재시도 안내 글
});

/** 옷가게: 방 원화 < 문 햇빛(바닥 위·배우 아래, `OutfitShopExitCueView`) < 배우(y 정렬) < 커튼 < 글자·상호작용 프롬프트. */
export const OUTFIT_SHOP_DEPTHS = Object.freeze({ background: -10, floorLight: 0, actor: 10, shadowOffset: -0.002, blendOffset: 0.001, occlusionOffset: 0.003, curtain: 12, labels: 30 });

/** HudScene의 상시 셸은 panel → ornament → meter → text → icon 순서로 고정한다. */
export const HUD_DEPTHS = Object.freeze({
  panel: 0,
  ornament: 1,
  meter: 2,
  text: 3,
  icon: 4, // 스태미나·무게·기술·시계·가젯 아이콘 공용
  radioDialogue: 84, // 적응형 무전 — 상시 HUD 위, 위기·전술 배너 아래
  worldDialogue: 85, // 인물·사물 발화 — 무전 위, 위기·전술 배너 아래
  guideHistory: 88, // 좌측 접이식 통신 기록 — 무전 위, 즉시 생존 배너 아래
  banner: 90, // 중앙 상태 배너
  tacticKeycaps: 91, // 곤봉 전술 입력 순서 — 배너 위, 괴도의 눈·대화 아래
  questHitArea: 93, // 우상단 목표 카드 클릭 — 카드 위, 대화·유물 전체 화면 연출 아래
  eyeIcon: 94, // 괴도의 눈 — 배너 위에도 보여야 한다
  facilityReveal: 95, // 시설 첫 입장 실내 스틸 — 상시 HUD 위, 도착 표제 카드 아래
  locationTitleCard: 96, // 도착 표제 카드 — 상시 HUD 위, 대화·전면 연출 아래
  dialogueBackdrop: 99, // 시네마틱 전용 전경 — 상시 HUD와 월드를 덮고 대화 프레임 아래
  dialogue: 100, // DialogueView 루트 컨테이너 (파일 간 계약) — 통신 기록·배너·전술 키캡·
                 // 괴도의 눈 같은 상시 HUD 위. 대화를 읽는 동안 가려지는 글자가 없어야 한다.
  dialogueHint: 101, // 자막을 꺼도 남는 옥상 홀드 스킵 안내
  commissionBanner: 102, // 첫 의뢰 수락 표제 — 걷히는 의뢰서 암막(대화 깊이) 위에 선다
  artifactMoment: 500, // 애장품 연출 카드 — HUD 전부를 덮는다
  artifactMomentGlow: 500.1, // 회수 받음의 흰 반짝임·빛 — 카드 판 위, 사진 아래(역광)
  artifactMomentArt: 500.2, // 플레이어가 올린 유물 사진
  artifactMomentCatch: 500.3, // 회수 받음의 고리·도트 — 사진 위
});

/** y-sort 간격. 발끝 y 를 1/1000 로 눌러 정수 밴드를 넘지 못하게 한다. */
export function villageYSorted(base: number, baseY: number): number {
  return base + baseY / 1000;
}

/**
 * 어떤 월드 물체 **바로 위** 깊이. y-sort 한 픽셀(1/1000)보다 작은 간격이라 사이에 다른 물체가
 * 끼지 않는다. 저택 현관 계단을 오르는 동안 주인공을 파사드 앞에 두는 데 쓴다.
 */
export function villageDepthJustAbove(depth: number): number {
  return depth + 0.0001;
}

/**
 * 배우 하나에 붙는 연출 층(귀빈 순간 변장의 연기·리본·바닥 고리). `step` 은 −3..3 층 순번이고 한 층은 0.00002 —
 * 가장 먼 층도 `villageDepthJustAbove` 간격(0.0001) 안이라 이웃 물체가 끼지 않는다. 음수는 배우 뒤, 양수는 앞.
 */
export function villageActorFxDepth(actorDepth: number, step: -3 | -2 | -1 | 1 | 2 | 3): number {
  return actorDepth + step * 0.00002;
}

/**
 * 대결 무대 선 위 두 몸 **모두 뒤**의 연출 층(파이터 고유 동작 이펙트의 회오리·마법진, 2026-10-21): 배우 깊이에서 y-sort 한 픽셀 뒤.
 * 같은 선에 선 상대 몸도 그 앞에 그려진다 — `villageActorFxDepth` −3 은 상대와 거의 같은 깊이라 회오리가 상대를 덮었다(vfx 리뷰).
 */
export function villageBehindStageBodiesDepth(actorDepth: number): number {
  return actorDepth - 0.001;
}

/** 잔상 유령 `index`(0 = 가장 최근)의 깊이: 배우 바로 뒤 `villageActorFxDepth` −1, −2, −3 층(더 오래된 것은 −3). */
export function villageAfterimageDepth(actorDepth: number, index: number): number {
  return villageActorFxDepth(actorDepth, -Math.min(3, Math.max(1, Math.floor(index) + 1)) as -1 | -2 | -3);
}

/**
 * 건물 원화에 붙는 선택 들림 겹(가산 밝기·광택)의 깊이. 파사드 바로 위이되 문간 빛(+0.00005)과
 * 계단을 오르는 주인공(`villageDepthJustAbove`)보다 아래라, 들린 건물이 그 앞의 몸을 덮지 않는다.
 */
export function villageBuildingLiftDepth(facadeDepth: number): number {
  return facadeDepth + 0.00002;
}

/** 분리된 마을 원경·지면 위에서 건물·플레이어·기능 오브젝트·동적 효과가 깊이를 공유한다. */
export const VILLAGE_DEPTHS = Object.freeze({
  distantLayer: 0, // 산·강·먼 마을 — 카메라에 느리게 반응하는 후경
  skyGrade: 0.4, // 원경의 하늘만 깊은 밤으로 눌러 주는 색 층
  skyDeep: 0.8, // 은하수와 먼 별 — 구름·달 아래
  skyAurora: 1, // 네 겹 오로라 리본 — 먼 별 위, 구름 아래
  skyCloud: 1.2, // 지평선 mask 안에서 흐르는 입체 구름
  skyBright: 1.6, // 달·반짝이는 별·유성 — 달빛 베일 아래
  skyHaze: 1.8, // 지평선 안개·필름 그레인 — 지면 아래
  groundLayer: 2, // 투명 길·정원·분수대 — 원경과 건물 사이
  groundFinish: 2.2, // 길의 미세 반사·재질 변화 — 원화 위, 접지 암부 아래
  backgroundBuilding: 2.52, // 미개방·보조 건물 복원층 — 환경보다 선명하지만 주요 시설보다 뒤
  interactableBuilding: 2.7, // 실제 입장 가능한 건물 크롭 — 원화와 독립 색보정되는 랜드마크
  atmosphereBack: 3, // 달빛 색 베일 — 지형 위, 모든 구조물 아래
  atmosphereMist: 19, // 낮은 안개 — 시설·배우 그림자 아래
  actorCastShadow: 20, // 배우의 넓고 옅은 투영 — 접촉 그림자와 본체 아래
  actorContactShadow: 20.1, // 발을 지면에 봉합하는 짙은 접촉 그림자
  actorFootDust: 20.15, // 주인공 발먼지 — 투영·접촉 그림자 위, 접지 림·본체 아래(발끝 y 정렬)
  actorRim: 20.2, // 배우 접지 림 — 그림자 위, 월드 오브젝트 아래
  worldObject: 21, // 건물·분수·분리 기능 오브젝트의 발끝 y-sort 기준
  worldGlow: 21.04, // 전체 원화 위의 창·가로등 광량층
  worldWater: 21.08, // 분수 원화 바로 위의 수면 파문·물방울
  foregroundLayer: 22.4, // 좌우 근경 건물·수목 — 배우 앞, 라벨·판정 표시 아래
  mansionDoorInterior: 22.38, // 저택 원화의 열린 문 안쪽
  mansionDoorActor: 22.385, // 열린 문 안쪽과 문짝 사이의 실제 캐릭터
  trainingPassageFoundation: 22.42, // 원화 지면·울타리와 독립 회랑을 잇는 접합부
  trainingPassageFacade: 22.45, // 근경에 붙은 회랑 현관 — 접근한 배우를 문 안쪽으로 받아들이는 외관
  worldLighting: 24, // 지형·건물·배우 공통 광원, 안내 UI 아래
  otherworldDebris: 69, // 자판기가 박힐 때 튀는 돌조각·먼지 — 월드 소품 위, 축하 효과 아래
  ambientFx: 70, // 반딧불·축하 효과 — 모든 월드 소품 위, 배우 아래
  otherworldLandingEmote: 71, // 자판기가 박힐 때 놀란 주민 머리 위 "!" — 월드 효과 위, 이름표·안내 아래
  // 무투장 AI 대결의 머리 옆 상황 기호(땀방울·핏대·놀람 획 — `ArenaReactionMarks`, 2026-10-24) — 임팩트 띠(ambientFx + 2) 위, 대미지 숫자 아래
  fightReactionMark: 72.4,
  // 마을 대결의 대미지 숫자·상태 글자(`NativeCityFloatTextView`) — 임팩트 띠(ambientFx + 2) 위, 만화 효과음 글자(ambientFx + 3) 아래
  fightFloatText: 72.5,
  // 마을 대결의 연타 수(`CityFightComboCounterView`, 2026-10-20) — 대미지 숫자 위, 만화 효과음 글자(ambientFx + 3) 아래
  fightComboCounter: 72.6,
  // 필살기 섬광의 컷인 띠와 시전자의 큰 몸(`CityFightSuperFlashView`, 2026-10-20) — 연타 수 위, 만화 효과음 글자 아래
  fightSuperCut: 72.7,
  fightSuperStage: 72.65,
  fightSuperProp: 70.5,
  actorBody: 21.001, // 건물·수목과 같은 발끝 Y 정렬: 앞뒤로 걸으며 자연스럽게 가려진다
  actorAdornment: 21.002, // 손소품은 소유자 발끝에 정렬하며 같은 위치의 본체 바로 위
  labelPlate: 79.9, // ImageGen 건물 명판 배경 — 현지화 이름 문자열 바로 아래
  storyCaption: 310, // 선택 사건 안내는 목표 비컨·상호작용 표식 위, 고정 HUD 아래
  fightStageBars: 309, // 마을 격투 무대의 레터박스 띠(UI 카메라) — 월드 위, 사건 안내·이름표·HUD 아래
  fightLesson: 309.6, // 쿠마전 상성 레슨 카드 바탕(UI 카메라) — HP 막대 위, 사건 안내 아래
  fightLessonText: 309.61, // 레슨 카드의 키캡·글자
  // 귀빈 소품 획득 비행(`GuestListPropPickupView`): 손 → DOM HUD 소품 칸. 월드 카메라의 모든 층 위 — 칸 그림(DOM)은 그 위에 선다.
  guestListPropFlightFx: 320,
  guestListPropFlight: 320.5,
  clockmakerDialoguePanel: 517, // 시계공 대화 패널 바탕
  clockmakerLetter: 519, // 봉투·편지지·기증서·도장 — 대화 판 위에서만 읽힌다
  hudPanel: 500, // 화면 고정 HUD
  hurtVignette: 499, // 플레이어 피격 가장자리 빛(UI 카메라) — 고정 HUD 바로 아래
  otherworldLandingFlash: 498, // 자판기 착지의 흰 섬광(UI 카메라) — 월드 전체 위, 피격 빛·HUD 아래
  hudText: 501,
  otherworldCardScrim: 507, // 자판기에서 꺼낸 물건 카드의 암막 — 표제 카드 위, 첫 도착 연출 아래
  otherworldGachaScrim: 507.2, // 자판기 뽑기의 암막 — 카드 암막과 같은 농도라 카드로 넘어갈 때 깜빡이지 않는다
  otherworldGacha: 507.5, // 뽑기 릴·바늘·별·빛살 — 공개 끝 프레임에 카드(508)가 같은 자리를 이어받는다
  otherworldCard: 508, // 물건 원화·이름·효과·회상 한 줄
  // 마을에 들어올 때 3D 마을이 첫 그림을 그릴 때까지의 가림막(`NativeCityArrivalVeil`, UI 카메라) — 마을의 모든 층 위
  arrivalVeil: 530,
  arrivalVeilCaption: 530.5, // 오래 기다릴 때만 뜨는 "마을을 불러오는 중" 한 줄
});

/** 마을 사이드 콘텐츠인 경매관 직원 통로의 자기완결 월드·UI 스택. */
export const AUCTION_LOBBY_DEPTHS = Object.freeze({
  background: 0,
  backdropGlow: 1,
  veil: 2,
  stageLight: 3,
  panel: 4,
  cards: 5,
  atmosphereRear: 5.5,
  // 파티 배우 층(AuctionLobbyCrowdView): 옷장 덜컹 선 → 옷장 속 구두 → 대체 커튼 뭉치 → 서 있는 손님들.
  // 손님은 crowdActor 위에 레인 y(±4px) × AUCTION_LOBBY_CROWD_LANE_DEPTH_STEP 만큼 얹혀 겹칠 때 깜박이지 않는다.
  wardrobeRattle: 5.9,
  wardrobeBound: 5.91,
  wardrobeCurtain: 5.94,
  crowdActor: 5.95,
  actor: 6,
  foregroundMotes: 7,
  foregroundFrame: 8,
  focus: 9,
  effect: 10,
  text: 20,
  noticeRings: 20.5, // 목격 게이지 고리 — 신분 카드(text)보다 위
  noticeMarker: 20.6, // 목격자 머리 위 "?"/"!"
  prompt: 21,
  facilityReveal: 29, // 로비 첫 입장 실내 스틸 — 통로의 모든 자막 위, 표제 카드 아래
  locationTitleCard: 30, // 로비 도착 표제 카드 — 통로의 모든 자막 위
});
/** 파티 손님 레인 y 1px 당 깊이 간격. ±4px 레인이 crowdActor 에서 ±0.004 안에 머문다. */
export const AUCTION_LOBBY_CROWD_LANE_DEPTH_STEP = 0.001;
/** 손님 그림자는 제 몸 바로 아래에 둔다. */
export const AUCTION_LOBBY_CROWD_SHADOW_DROP = 0.0005;

/** 실전 사이 메인 사건: 배경 → 배우 → 증거 소품 → 자막. */
export const CAMPAIGN_DEPTHS = Object.freeze({
  background: 0,
  shade: 10,
  shadow: 20,
  actor: 71,
  prop: 80,
  panel: 100,
  text: 101,
});

/**
 * 토너먼트 무투장(2026-10-18, `ArenaScene`): 마을 대결 조각(배우·연출·HUD)이 쓰는 마을 깊이 위·아래에 무투장만의 층을 끼운다 —
 * 배경(링·관중석)은 배우의 그림자 아래, 결정타 어둡게는 배경 위·그림자 아래. 경기 앞 도전 대화(2026-10-19, `ArenaChallengeTalk`)는
 * 마을 대결의 도전 대화와 같은 대화 판 층이다.
 */
export const ARENA_DEPTHS = Object.freeze({
  backdrop: VILLAGE_DEPTHS.groundLayer - 1,
  ring: VILLAGE_DEPTHS.groundLayer,
  /** The ODDBOUT airship (`ArenaAirship`): over the ring picture, under the decisive blows' ink — the KO dims it with the ring. */
  airship: VILLAGE_DEPTHS.groundLayer + 0.5,
  /**
   * The pinball's ropes at a corner post (2026-10-26, `ArenaPinballRopeView`): over the ring picture and the airship, under the decisive ink
   * and the bodies — the body thrown into them hides the part it bows out.
   */
  pinballRope: VILLAGE_DEPTHS.groundLayer + 0.6,
  backdropDim: VILLAGE_DEPTHS.actorCastShadow - 0.5,
  /** The KO's light at the blow over that ink (2026-10-23 arena audit — `ArenaGround.koLight`): under the winner's spotlight and the bodies. */
  koLight: VILLAGE_DEPTHS.actorCastShadow - 0.4,
  /** Its spotlight on the winner: over that ink (the lit pair), under the bodies and their shadows. */
  spotlight: VILLAGE_DEPTHS.actorCastShadow - 0.25,
  /** The skills' traces on the ring (2026-10-22 4차 `ArenaTraceView` — the penguin's ice, the gopher's holes): on the floor, under the light. */
  trace: VILLAGE_DEPTHS.actorCastShadow - 0.3,
  /**
   * An awakening's back light and painted floor in the AI duel (2026-10-23 arena audit — `CityFightAwakeningMotifView`, the starfall): behind
   * both fighters (the bear spirit, a dark room, a spotlight's cone), over the spotlight and the traces, under the bodies' shadows.
   */
  awakeningBehind: VILLAGE_DEPTHS.actorCastShadow - 0.2,
  shadow: VILLAGE_DEPTHS.actorContactShadow,
  /** The cross's cut across the passed body (2026-10-25, `ArenaCrossSlashView`): over the bodies and the world's effects, under the impact band. */
  crossSlash: VILLAGE_DEPTHS.ambientFx + 1.5,
  hud: VILLAGE_DEPTHS.hudPanel,
  overlay: VILLAGE_DEPTHS.clockmakerLetter + 1,
  talk: VILLAGE_DEPTHS.clockmakerDialoguePanel,
});

/** Loading illustration below a flat white gauge and its copy. */
export const LOADING_DEPTHS = Object.freeze({ backdrop: 0, track: 10, copy: 12 });

/**
 * 타이틀: 원화 → 왼쪽 베일 → 활자 메뉴 → 저장 슬롯 패널.
 * 슬롯 패널(`scenes/TitleSlotPanel.ts`)이 같은 디스플레이 리스트에 그리면서 자기완결 예외에서 승격됐다.
 */
export const TITLE_DEPTHS = Object.freeze({
  backdrop: 0,
  veil: 10,
  selection: 19,
  copyFx: 19.5, // 활자 등장의 먹 튐·속도선·펜선 외곽선·스크린톤 — 밑줄 위, 활자 뒤(`view/TitleUiInkFx`)
  copy: 20,
  menuHit: 21,
  slotScrim: 40, // 메뉴 전체를 덮는 어둠 — 패널이 열리면 뒤의 활자 메뉴는 입력도 받지 않는다
  slotCard: 41, // 평평한 종이 카드와 행동 버튼 면
  slotText: 42,
  slotShade: 43, // 고르지 않은 카드를 덮는 어둠 — 글자까지 함께 가라앉힌다
  slotCardHit: 44, // 카드 빈 곳 포인터 → 슬롯 이동. 버튼 zone 이 위에서 먼저 받는다
  slotHit: 45,
  // 첫 타이틀 웹툰 프롤로그(`view/TitleWebtoonPrologueView`) — 메뉴·슬롯 패널 전부를 덮고, 마지막 칸이 곧 타이틀이 된다.
  prologuePage: 50, // 망점 바탕·A 진입의 먹 둘레·몽타주 컷·종이 페이지
  prologueTitle: 50.5, // 페이지의 마지막 칸에 끼운 타이틀 원화(`TitleArtView.setFrame`) — 종이 위, 다른 칸 아래
  prologueShards: 51, // 페이지 칸·타이틀 칸 테두리·균열·파쇄 조각
  prologueInk: 52, // 컷 전환의 금빛 섬광
  prologueOpening: 52.5, // 타이틀 칸이 화면을 채운 뒤의 애니 오프닝(`view/TitleAnimeOpeningView`) — 페이지·섬광 위, 대사 아래
  prologueLine: 53, // 대사 세 낱말·"지난 이야기" 칸 글·입력 가림막
  prologueSkipHint: 53.5, // 프롤로그 동안 오른쪽 아래의 "건너뛰기" 안내 — 가림막 위
});

/**
 * 공용 UI 반응(`ui/UiFeedback.ts`)의 꺾쇠·섬광은 씬 루트에 그리며, 반응하는 대상의 최상위
 * 조상 깊이에 이 값을 더한다. 어느 씬의 어느 층 버튼이든 제 바로 위에서만 빛난다.
 */
export const UI_FEEDBACK_DEPTH_LIFT = 0.001;

/** 싸움 게이지의 상대 썸네일·상태 아이콘·아이콘 이름표가 막대(그 깊이) 위에 서는 몫(`NativeCityFightHpBarView`·`FightStatusIconRow`). */
export const FIGHT_STATUS_DEPTH_LIFT = Object.freeze({ thumb: 0.1, icons: 0.2, tip: 0.1 });

/** Native city ground blends precede upright cards and follow building contact shading. */
export const NATIVE_CITY_FLOOR_DEPTHS = Object.freeze({
  actorShadow: Number.MIN_SAFE_INTEGER + 10,
  /** 바닥 판정 표시(`NativeCityFloorDecalView`)의 시작 순서 — 배우 그림자 위, 건물·배우 카드(-depth) 아래. 면·테두리 메시마다 한 칸씩 쓴다. */
  decal: Number.MIN_SAFE_INTEGER + 20,
});

/**
 * 튜토리얼 대상 강조(`TargetEmphasisView`)가 대상 원화 깊이에서 띄우는 간격. 바닥 빛은 원화 바로 아래
 * (`-`), 반짝임은 원화 바로 위(`+`)에 둔다 — 고정 깊이에 두면 바닥 빛이 옷장 앞면을 덮고(6.49) 반짝임이 앞에 선
 * 배우를 뚫고 보였다(23). 원화가 없는 길 목적지의 바닥 빛만 `objectiveGroundCue` 를 쓴다.
 */
export const TARGET_EMPHASIS_DEPTH_LIFT = 0.002;

/**
 * 캔버스 위에 서는 DOM 층의 쌓임 순서(z-index) — 문서에 함께 서는 층끼리의 표 하나(2026-10-17). 전에는 숫자가 파일·CSS 마다 흩어졌고
 * 두 곳은 Phaser 깊이(`VILLAGE_DEPTHS.hudPanel`, `HEIST_DEPTHS.contextFocusInk * 100`)를 빌려 z-index 로 썼다(`depths.test.ts` 가 막는다).
 * 한 층 안의 자리(20 아래 — 도입 영상 층의 칸, 건너뛰기 안내)는 그 층이 정한다. 네이티브 모달 창(`showModal()` — 장비창)과 오류 화면
 * (`platform/fatalErrorOverlay` — 최댓값, 그리고 자신도 모달)은 최상위 층이라 이 표 밖이다.
 */
export const DOM_LAYER_Z = Object.freeze({
  /** The village HUD (`ApprovedVillageHudView`). */
  villageHud: 20,
  /** A short notice that Rosaline's commission finished while its window was closed (`watchOutfitCommissions`). Above the HUD, never takes input. */
  commissionNotice: 40,
  /** A cutscene's skip hint over the canvas (the outfit transformation, the fight's webtoon cuts). */
  cutsceneSkip: 20,
  /** The local village deception prototype's input. */
  villageDeception: 60,
  /** The local guard-conflict prototype's panel. */
  guardConflict: 500,
  /** Clockmaker documents occupy only the space above the canvas dialogue; companion conversations hide them. */
  clockmakerEvidence: 1200,
  /** Full-screen native modal for optional resident conversations. */
  companionDialog: 1400,
  /** A picture opened full size from a conversation (`imageViewer` — Rosaline's commission art first). Above the conversation it came from. */
  imageViewer: 1420,
  /** Audience-only Otto memory and rescue close-up; Grieves' scene (it never overlaps Otto's). */
  storyPanel: 1450,
  /** The heist's cut-aways over the canvas: the tutorial clear webtoon, the manor fold transition. */
  heistCutaway: 2200,
  /** The game's DOM dialogs (invitations, the personal artifact, the photo look — `openDomModal`). */
  gameDialog: 10000,
});
/**
 * 금고지기 회랑 뒷벽의 퇴장문(`GrievesCorridorView`). 외벽 등불(7.768) 위, 배우(10) 아래의 뒷벽 층이다 — 사용인은 늘 배우 뒤를 걷는다.
 * 닫힌 문 뒤: 방 안(열린 문 그림을 창살 창 크기로 자른 것) < 문 뒤 사용인 < 문(창 판이 뚫려 얼굴만 보인다).
 * 문 위: 빗장 < 걸쇠 고리·자물쇠 상자(빗장이 그 밑으로 미끄러진다) < 문간 사용인의 그림자 < 문간·걷는 사용인 < 열쇠구멍 빛.
 */
export const GRIEVES_WORLD_DEPTHS = Object.freeze({
  interior: 7.7692, workerBehind: 7.7696, door: 7.77, bolt: 7.7703, doorFront: 7.7706, workerShadow: 7.775, worker: 7.78, lock: 7.79,
});
