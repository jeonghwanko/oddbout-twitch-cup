/**
 * 고정 팔레트.
 *
 * 플레이 월드는 높은 채도의 판정색을 유지하되, 메뉴와 예고장은 남색 잉크·상아 종이·
 * 얇은 황동 테두리로 괴도극의 물성을 만든다. 생성 원화도 이 색을 기준으로 보정한다.
 */
/** Bright equipment folio. Runtime owner of the approved design's neutral paper tokens. */
export const EQUIPMENT_THEME = Object.freeze({
  // 승인 장비 시안의 따뜻한 상아 종이(docs/Plan/2026-10-11-relic-integration/bright-hud-design/design-tokens.json).
  paper: "#fcfaf5", raised: "#ffffff", inset: "#ede8df", ink: "#242321",
  muted: "#625d56", rule: "#ddd6c9", edge: "#777066", selection: "#f2b400",
  /** 캐릭터 뒤 비스듬한 예고장 면. */
  card: "#efe8da",
  error: "#9b3029", success: "#3e654d",
});

export const PALETTE = Object.freeze({
  /** Neutral tint, masks, light and white effect highlights. */
  white: 0xffffff,
  /** Plain white loading gauge and progress text over the illustration. */
  loadingWhite: 0xffffff,
  sky: 0x150d2a,
  /** Native city daytime sky and matching far-building haze, without a warm screen filter. */
  cityDaySkyZenith: 0x227ed1,
  cityDaySkyHorizon: 0xa6d4ed,
  cityDayCloudLight: 0xfffdf7,
  cityDayCloudShade: 0xc4d9ed,
  cityCathedralSun: 0xffefd6,
  cityCathedralShade: 0xb5bddb,
  cityCathedralInk: 0x66506b,
  /** Cathedral source limestone has a warmer diffuse response than the supplementary elevation. */
  cityCathedralStoneBalance: 0xfff5ef,
  cityCathedralStoneFill: 0xfff4df,
  cityCathedralCastTint: 0xc8cfdf,
  cityNprSun: 0xfff1db,
  cityNprSkyFill: 0xdce5f5,
  cityNprGroundFill: 0xe7d7c2,
  cityNprShadow: 0xc8c1dd,
  cityHouseContact: 0xf6f7ff,
  cityNprCastInk: 0x4c465e,
  background: 0x2a1b4e,
  backgroundVeil: 0x62675b,
  lightAmbient: 0x898596,
  lampLight: 0xffc66d,
  wall: 0x6c4ba0,
  floor: 0x3e2a6e,
  outline: 0x140b26,
  accent: 0xffd447,
  /**
   * Comic impact emission over the normal-blended ink silhouette. Since 2026-10-17 (사용자 결정, 쿠마전 이펙트 정리) these are the warm
   * ramp's gold / amber / cream below, not fluorescent lemon / orange: the neon yellow was only ΔL* 11 from the plaza floor and the
   * neon orange the same lightness as KUMA's fur, so neither read without its ink rim. The names stay for their callers.
   */
  combatNeonYellow: 0xf5c451,
  combatNeonOrange: 0xd9822b,
  combatNeonCore: 0xfffdf2,
  // accent 보다 한 단계 위의 "충전·임팩트" 금색. 행동 이펙트·장난 도구·경비 가드
  // 플래시가 같은 순간을 같은 온도로 빛나게 한다.
  hotGold: 0xfff4b0,
  /**
   * The warm light ramp every combat / action effect shares (cream → hotGold → gold → amber → sienna; one navy ink `navyInk`).
   * `ROPE_FX_RAMPS.warm` is this ramp; 2026-10-17 it became the fight's contact colour too (`combatNeon*`).
   */
  fxWarmCream: 0xfffdf2,
  fxWarmGold: 0xf5c451,
  fxWarmAmber: 0xd9822b,
  fxWarmSienna: 0x9c4a1e,
  /** The ODDBOUT penguin's sheet ice (his awakening's rink — `AuroraExpressMotif`, 2026-10-23): pale sheet ice and its shine. */
  oddboutIce: 0xbfe6f4,
  oddboutIceShine: 0xf2fbff,
  /**
   * A village fighter's ARMOUR (2026-10-18 user: the body that takes a blow without flinching and goes on with its move is outlined).
   * 2026-10-19 읽기 보상 (docs/Plan/2026-10-19-kuma-read-reward): steel, not the old deep orange #c8501a — that sat next to the gold grade
   * and KUMA's gold-orange fur, and read as the same olive under deuteranopia. The value is `throwSteelShade`'s.
   */
  fightArmorRim: 0x7f93ad,
  /**
   * "지금 쳐라" (2026-10-19 사용자 D4: B 마젠타): the ONE colour of "hit him now" in a village duel — V's counter ring filling and full, the
   * opening rim on his body, the "opening" status badge. Gold now means only the gold grade. Picked from a three-way sheet (cyan · magenta
   * · violet) for the farthest ΔE from pearl, gold, red, steel, the plaza floor and KUMA's fur, normal and deuteranopic alike.
   */
  fightAttackNow: 0xf03cff,
  loot: 0x4fe3c1,
  alarm: 0xff4d6d,
  guardCalm: 0xbfd8ff,
  guardCurious: 0xffd447,
  guardAlert: 0xff9d3d,
  guardSpotted: 0xff4d6d,
  playerBody: 0x2f3a63,
  playerScarf: 0xe8384f,
  eyeWhite: 0xfdf6e3,
  dark: 0x0d0720,
  ladder: 0xc98b4b,
  /** Blackthorne fixtures use material edges, separate from gold action/impact cues. */
  manorWood: 0x665044,
  manorWoodEdge: 0xa18d73,
  manorIron: 0x586369,
  manorIronEdge: 0x929f9f,
  manorFocus: 0xc2d1d3,
  vent: 0x8fa3c4,
  hide: 0x7a4fbf,
  ui: 0xfdf6e3,
  // CSS.dim 의 숫자 쌍. 흐릿한 보조 표기가 tint 로도 같은 색이어야 한다.
  dim: 0x9d8fc4,
  // 마을 월드 레이어가 화면 밖을 드러낼 때 사용하는 카메라 클리어색.
  villageMoonlight: 0x788db4,
  // 첫 도착 "마을이 깨어난다"의 새벽 전 어둠(곱하기)과 암부를 남색으로 들어 올리는 달빛 채움(더하기).
  // 회청색 달빛을 두 번 곱하면 파랑은 못 더하고 채도만 깎여 회색 진흙이 됐다(VFX 리뷰 실측).
  villagePredawn: 0x3a4680,
  villageMoonFill: 0x0a1230,
  villageSunsetTint: 0xffe2cc,
  villageShadowInk: 0x293449,
  villageDawnMist: 0xbecfd1,
  villageSea: 0x82b9bc,
  villageMoonReflection: 0x95b8d5,
  villageWaterFoam: 0xd9f5ef,
  villageWaterCaustic: 0x91dfd5,
  villageGround: 0x668c57,
  // 마을 독립 시설의 접합부가 원화의 회베이지 석재와 공유하는 재질색.
  villagePaving: 0xa79a80,
  villagePavingPaper: 0xe8dcc4,
  villageMeadowPaint: 0x7e9057,
  villageLeafMidtone: 0x788b4f,
  villageLeafShadow: 0x52705b,
  villageLeafSun: 0xc0ce86,
  villageStone: 0x746b5e,
  villageRoofSlate: 0x526e89,
  villageRoofTerracotta: 0xa76446,
  villageRoofCopper: 0x5c7b67,
  villageRoofCharcoal: 0x616674,
  villageRoofUmber: 0x7e6653,
  villageWallIvory: 0xe7dfc9,
  villageWallSand: 0xd7c3a3,
  villageWallRose: 0xe4cec3,
  villageWallSage: 0xccd7bd,
  villageWalnut: 0x5c4032,
  villageWalnutLight: 0x92704b,
  villageWalnutShade: 0x362b29,
  /** 마을 아트 디렉션의 레이어별 색온도. 원화에 굽지 않고 개별 Image/Sprite tint로만 쓴다. */
  villageFarCoolTint: 0xeff5f8,
  villageEnvironmentTint: 0xf7f4ef,
  villageSecondaryTint: 0xf4f2eb,
  villageFocusWarmTint: 0xfff7e9,
  villagePlayerWarmTint: 0xfff9f0,
  villagePlayerRim: 0xffe7a3,
  /** 마을의 절차 밤하늘. 원화 위 색보정·별·구름·달이 이 색군만 공유한다. */
  villageSkyZenith: 0x030518,
  villageSkyUpper: 0x080b2b,
  villageSkyMid: 0x10143f,
  villageSkyLower: 0x1b1b4a,
  villageSkyHorizon: 0x312455,
  villageMilkyWay: 0x9b7ed7,
  villageMilkyWayCool: 0x68b7d9,
  villageAuroraGreen: 0x4df0a7,
  villageAuroraBlue: 0x4ebcff,
  villageAuroraViolet: 0xb47dff,
  villageAuroraPink: 0xff78b8,
  villageHorizonHaze: 0x7f78a8,
  villageStarCool: 0xc8e7ff,
  villageStarWarm: 0xffddb0,
  /** 선택된 마을 건물 위를 한 번 긋는 촛불색 광택(`VillageBuildingLiftView`). */
  villageBuildingSheen: 0xffd98a,
  villageCloudShadow: 0x11142f,
  villageCloudBody: 0x303864,
  villageCloudRim: 0xaebfff,
  villageMoon: 0xfff1c9,
  villageMoonCool: 0xb8d7ff,
  villageMoonShade: 0x8f8db3,
  /** 예고장·귀족 경매 UI의 재질색. 판정색과 섞지 않는다. */
  navyInk: 0x17243d,
  paper: 0xf1e4c3,
  paperInk: 0x24192c,
  // 상아 종이 위 보조 문구도 WCAG AA 4.5:1을 넘겨야 한다.
  paperMuted: 0x6f5f62,
  burgundyInk: 0x8d3042,
  /** 남색 가죽 위에서 읽히는 밀랍 장밋빛. 되돌릴 수 없는 행동의 "한 번 더" 확인 문구 전용. */
  waxRose: 0xe27a86,
  rewardInk: 0x246052,
  /** 이미지젠 HUD 시안의 어두운 에나멜·보조 청색·양피지 재질. */
  hudEnamel: 0x071526,
  hudEnamelRaised: 0x192646,
  hudFlatPanel: 0x0b1523,
  hudFlatSelected: 0x203145,
  hudFlatChip: 0x263647,
  hudFlatMuted: 0xb7c5d1,
  hudFlatText: 0xf2f5f7,
  hudParchment: 0xead9b5,
  /**
   * ODDBOUT(2026-10-22): the league homepage's poster look carried into the arena's select screen (fighter.html) — ink ground, one acid
   * lime accent (the picked fighter's name, the active tab, the FIGHT action), white type. Nothing else in the game uses these two.
   */
  oddboutInk: 0x071923,
  oddboutAcid: 0xeaff50,

  oddboutPink: 0xff4f9a,
  /**
   * ODDBOUT 금화(2026-10-27, docs/Plan/2026-10-27-oddbout-cup-champion-and-gold 정할 것 3): 위 막대의 카운터와 떨어지는 동전. 돈은 금색이어야
   * 바로 읽혀서, 라임 하나 규칙의 하나뿐인 예외다. 금화 말고는 쓰지 않는다.
   */
  oddboutGold: 0xffc83d,
  /** 이세계 자판기의 차원 균열·안대 렌즈 청록. 원화의 균열선 색에서 뽑았다. */
  otherworldRift: 0x5ff2e8,
  otherworldScrim: 0x252a25,
  otherworldIvory: 0xfff5db,
  otherworldReel: 0xfaf3e4,
  otherworldBrass: 0xd9b872,
  /** Vivid coral-orange echoes the wordmark against the cream/mint housing. */
  otherworldButton: 0xff9160,
  otherworldButtonInk: 0x513426,
  otherworldButtonDisabled: 0xc9bfae,
  otherworldButtonShadow: 0x163c38,
  otherworldEnamel: 0x77b5a3,
  otherworldCreamEdge: 0xe4d6b8,
  otherworldCoral: 0xec9b7f,
  /** 자판기가 박힐 때 튀는 광장 석재 먼지. 광장 크림 석재보다 한 단계 어둡다. */
  otherworldDust: 0xc9b48c,
  /** 하늘 균열 안쪽의 거의 흰 청록 빛(빛기둥 심지). */
  otherworldRiftCore: 0xeafffb,
  /** 착지 때 튀는 포석 조각의 그늘 면과 밝은 면. */
  otherworldDebris: 0x9a8262,
  otherworldDebrisLight: 0xe8d9ba,
  /** 자판기가 박힌 자리의 포석 균열선. 먹선보다 따뜻한 흙색이라 바닥에 묻힌다. */
  otherworldCrackInk: 0x3d2e22,
  /** 통신 UI의 황동·상아색. 세 대화 채널이 같은 재질 계층을 공유한다. */
  dialogueGold: 0xd5a45c,
  dialogueGoldBright: 0xe3b964,
  // 금박 활자의 세로 그라디언트 끝점(가운데는 dialogueGoldBright). 단색 금은 명도 폭이 없어 겨자색 자막처럼 읽혔다.
  gildHighlight: 0xfbe7b0,
  gildShadow: 0xb07f38,
  dialogueGoldMuted: 0xc9a875,
  dialogueCopy: 0xf1d8a0,
  dialogueAction: 0xd6b477,
  dialoguePortrait: 0x080b20,
  /** Flat 대화 카드. 기존 예고장·월드의 남색과 독립된 표면이다. */
  companionNight: 0x191e25,
  companionPanel: 0x252a32,
  companionEdge: 0x4c5058,
  companionMuted: 0xb3b5bc,
  dialogueSurface: 0xf7f8f6,
  dialogueSurfaceDark: 0x202526,
  /** 마을의 주변 대사·장소 안내에 쓰는 중성 웜 차콜. */
  cityNoticeSurface: 0x292824,
  cityNoticeMuted: 0xc9c6bd,
  dialogueScrim: 0x101415,
  dialogueInk: 0x263132,
  dialogueMuted: 0x617173,
  dialogueBorder: 0x899596,
  dialogueHover: 0xe5eae8,
  dialogueAccent: 0x9bd8ca,
  /** 밝은 타이틀 키아트가 아직 준비되지 않은 첫 preload 프레임의 하늘색. */
  titleSky: 0xbcecf1,
  /** 타이틀 달빛 띠 안의 먼지. 달빛 줄기 원화보다 조금 더 희고 차갑다. */
  titleMoonMote: 0xcfe2ff,
  /** 로고 루비를 스치는 별빛. 흰 별 대신 붉은 보석의 반사로 읽히게 살짝 분홍빛이다. */
  titleRubyGlint: 0xffd0d8,
  /**
   * 첫 타이틀 웹툰 프롤로그(`view/TitleWebtoonPrologueView`)의 무채 먹: 칸 테두리·베기·균열·대사 외곽선.
   * 남색이 아니라 DOM 영상의 검은 레터박스와 이어지는 거의 검정이다(진입 A 의 P1 둘레).
   */
  webtoonInk: 0x0e0d12,
  /** 웹툰 프롤로그 망점 바탕의 밤 남색. 금빛 망점(`dialogueGoldBright`)이 그 위에 옅게 찍힌다. */
  webtoonNight: 0x0d1020,
  /** 웹툰 프롤로그 컷 전환(합치기·펀치 인·타이틀 칸)의 금빛 섬광. */
  webtoonFlash: 0xffe2a0,
  /**
   * 토너먼트 무투장(2026-10-18, `ArenaGround`): 링 원화 바깥의 밤 바탕(원화 가장자리가 이 색으로 녹는다 — `tools/art/import-arena-ring.mjs`),
   * 원화를 못 받았을 때 깔리는 링 바닥 띠.
   */
  arenaNight: 0x0b0a1a,
  arenaCanvas: 0x2a2440,
  /**
   * The arena's decisive-blow ink over the ring (`ArenaGround.dimTo`, 2026-10-23 arena audit — b02 #2070–2080, b07 #2693–2703): about 10 %
   * value, not black, so a black suit still reads on it (the KO's light at the blow does the rest).
   */
  arenaKoBackdrop: 0x15131c,
  /**
   * The arena AI duel's corner outlines (2026-10-23 arena audit — `NativeCityKumaView` corner rim): round each body while the two are close,
   * the left corner warm, the right cool — a same-colour or black-suited pair no longer reads as one lump.
   */
  arenaCornerWarm: 0xff7f3a,
  arenaCornerCool: 0x45b8ff,

  arenaRopePink: 0xf738bf,
  arenaRopeCyan: 0x48e4fc,

  fightLetterMiss: 0x8ea2c6,
  /**
   * 던지는 도구(단도·태엽 유인구·연막 부채)의 도트 이펙트 재질색(`ThrownToolFx`). 불꽃·유리는 줄타기 램프
   * (`ROPE_FX_RAMPS`)를, 흰 섬광·금빛은 `white`·`hotGold`·`accent` 를 그대로 쓴다. 여기는 그 밖의 재질만이다.
   */
  throwSteel: 0xd8e8f4,
  throwSteelShade: 0x7f93ad,
  throwSteelDeep: 0x3b4658,
  throwBrass: 0xe0aa48,
  throwBrassShade: 0x9a6428,
  throwSmokeLight: 0xc9c2d6,
  throwSmoke: 0x8d84a3,
  throwSmokeShade: 0x554b6b,
  throwDust: 0xc7b79a,
  throwDustShade: 0x7d6c55,
  throwSilk: 0xc23a52,
  throwSilkShade: 0x7a2234,
  /**
   * 마을 1:1 대결 공방 FX(`effects/NativeCityExchangeFx`, 쿠마 전통 공방 명세에서 시작)의 금·진주·먼지 팔레트(명세 docs/Plan/2026-10-08-kuma-exchange-fx). 흰 심은
   * `white`, 뜨거운 심은 `hotGold` 를 그대로 쓴다. 공방 FX(불꽃·먼지·임팩트)엔 네온 시안·마젠타가 없다 — 마젠타 `fightAttackNow` 는 FX 가 아니라
   * "지금 쳐라" 규칙 표시(고리·빈틈 테두리·기회 배지)만의 색이다(2026-10-19).
   */
  /** 밝은 결판 금(금고지기 열쇠 도트·쿠마 공방 불꽃이 같이 쓴다). */
  brightGold: 0xf2c14e,
  /** 진주 하이라이트·먼지(행동 이펙트·쿠마 공방이 같이 쓴다). */
  pearl: 0xdaf6ff,
  dust: 0xd7c5a2,
  nativeCityExchangeInk: 0x17243d,
  nativeCityExchangeIvory: 0xfdf6e3,
  nativeCityExchangeGold: 0xd5a45c,
  /** 스트립의 어두운 끝(`tintFrom`): 먼지·불꽃·바람의 그늘과 바람의 밝은 끝. */
  nativeCityExchangeDustShade: 0x786450,
  nativeCityExchangeGoldShade: 0xb07c34,
  nativeCityExchangeWindShade: 0x6e645a,
  nativeCityExchangeWindLight: 0xf6eedc,
} as const);

/**
 * 씬 전환 암전색의 채널 삼중항. `Camera.fadeOut(ms, r, g, b)` 은 숫자 색을 받지 않는다.
 *
 * 예전에는 씬마다 `(9,8,24)`·`(21,13,42)`·`(13,7,32)` 를 손으로 적어 같은 암전이
 * 화면마다 다른 색이었다. 전환 암전은 한 색뿐이고 그 원본은 `PALETTE.dark` 다.
 */
export const TRANSITION_FADE_RGB = Object.freeze({
  r: (PALETTE.dark >> 16) & 0xff,
  g: (PALETTE.dark >> 8) & 0xff,
  b: PALETTE.dark & 0xff,
});

/** Cold exterior world palette for the Blackthorne window-crossing sequence. */
export const MANOR_EXTERIOR_PALETTE = Object.freeze({
  entryMoonTint: 0xd9dce2,
  skyZenith: 0x07111f,
  skyUpper: 0x0b1a2b,
  skyHorizon: 0x213348,
  skyHaze: 0x34506a,
  star: 0xb4cad7,
  starDim: 0x829bae,
  moon: 0xa8c4d3,
  moonShade: 0x819eaf,
  city: 0x111f31,
  cityWindow: 0x8bb1c5,
  stone: 0x172432,
  stonePillar: 0x263747,
  stoneEdge: 0x566b7c,
  stoneCap: 0x697b87,
  stoneGlint: 0x9bb4c1,
  floor: 0x263544,
  floorEdge: 0x8da0aa,
  floorJoint: 0x83949c,
  /** 먼 도시 원화를 반 단계 눌러 배우 뒤 명도를 비운다. */
  cityPlateTint: 0x91a5bb,
  /** Keep stone joints subordinate to the actor, hatch and ladder. Coping retains the cold rim. */
  roofFloorTint: 0xc1cedb,
  roofFacadeTint: 0x9baabd,
  /** 옥상 틈 원화(탑·골목·사다리)를 판석보다 한 단계 어둡게 누른다. */
  gapArtTint: 0x9eabb9,
  /** 탑 아래로 이어지는 건물 끝 벽 — 탑 몸통보다 한 단계 더 그늘에 든다. */
  gapShaftTint: 0x76828f,
  /** 배우 뒤 난간 띠에 고이는 달빛 역광과 바닥 달빛 웅덩이. 무채색 검정 옷과 색으로도 갈라지게 푸른 쪽. */
  stageBacklight: 0x9bbfe2,
  /** 비네트·바닥 앞쪽 감쇠 — 밤하늘 가장 어두운 남색보다 한 톤 짙다. */
  stageShade: 0x040a13,
});

/**
 * 첫 타이틀 애니 오프닝(`view/TitleAnimeOpeningView`, 2026-10-17). 사카모토 데이즈 OP1 61~75초의 문법:
 * 구간마다 한 색(청색 단색조 → 형광 노랑 → 보라 → 흰 종이 → 진홍)과 인쇄가 어긋난 듯한 색 잔상, 데이터모시 블록.
 */
export const TITLE_OPENING_COLORS = Object.freeze({
  /** 청색 단색조 그레이디언트 맵 5단(검정 군청 → 코발트 → 청록 흰빛). 휘도 0, 0.30, 0.58, 0.82, 1 에 놓인다(레퍼런스 62초의 명도 분포). */
  mono: Object.freeze([0x010309, 0x04103a, 0x0f2f86, 0x2a78c4, 0xbfefff] as const),
  /** 진홍 컷의 블랙손 듀오톤(같은 다섯 자리). */
  redMono: Object.freeze([0x1a0306, 0x4a0e14, 0x8a3a36, 0xc98e7c, 0xf0d2c0] as const),
  cloth: 0x060a1c,
  /** 겹친 천의 뒤 자락 — 앞 자락보다 반 단계 밝아 겹이 읽힌다. */
  clothDeep: 0x0c1738,
  clothFold: 0x1b3170,
  clothRim: 0x6283e0,

  lining: 0x9a1230,
  liningDeep: 0x5a0a1c,
  liningFold: 0xc8243e,
  /** 마지막 천의 테두리 — 다음 컷(촛불 타이틀)의 빛이 먼저 비친다. */
  candleRim: 0xffcf7a,
  eyeCore: 0xf4f8ff,
  eyeHalo: 0x3f6cff,
  /** 차가운 화면 속 단 한 점의 따뜻한 불티(장갑 끝): 흰 심, 바늘, 주황 후광. */
  sparkCore: 0xfff2c8,
  sparkHalo: 0xff7a1a,
  /** 예고장 컷의 어두운 청록 바탕(레퍼런스 63초 금총 컷). */
  tealDeep: 0x0b1a1d,
  tealLit: 0x22363a,
  yellow: 0xd2cd3a,
  yellowLine: 0xb3ae22,
  magenta: 0xe03c8a,
  violet: 0x6e66d8,
  violetLine: 0x5a50c4,
  /** 오토 돌진의 잔상(보라 카드 위의 군청 실루엣). */
  violetTrail: 0x4a3cc8,
  cyan: 0x40e0e8,
  lime: 0xd8f24c,
  limeShade: 0x7fae2e,
  gold: 0xf0c048,
  goldShade: 0xa87a1c,
  paper: 0xf6f3ec,
  white: 0xffffff,
  red: 0xb00a2c,
  redTop: 0xc41634,
  redBottom: 0x6e0915,
  redLine: 0xe0203c,
  redShade: 0x2a0008,
  /** 진홍 범람 위에 남는 인물 실루엣. */
  redInk: 0x1a0006,
  /** 컷인이 박히는 첫 프레임의 먹 실루엣. */
  ink: 0x14101c,
  /** 점화 직전 숨을 들이쉬는 거의 검정. */
  inhale: 0x05030a,
  /** 점화 하드컷의 따뜻한 섬광. */
  litFlash: 0xfff1cc,
  duskLeak: 0xff9a50,
  glitchGreen: 0x3ce63c,
  glitchOrange: 0xf2a01e,
  blade: 0x1c1f2a,
  bladeEdge: 0xdfe6f0,
  cardSeal: 0xc4122e,
});

/** PALETTE 숫자를 CSS 16진 문자열로. 이 변환을 손으로 다시 쓰지 않는다. */
export function cssHex(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

/** 숫자 팔레트에 CSS 알파만 결합한다. 화면 파일에서 같은 RGB를 다시 쓰지 않는다. */
export function cssAlpha(color: number, alphaHex: string): string {
  return `${cssHex(color)}${alphaHex}`;
}

/** Phaser Text·DOM 스타일이 쓰는 문자열 판. PALETTE 에서 파생하므로 두 벌이 어긋날 수 없다. */
export const CSS = Object.freeze({
  loadingWhite: cssHex(PALETTE.loadingWhite),
  /** "지금 쳐라" (2026-10-19 D4): the fight key panel's V row while his counter ring is full. */
  fightAttackNow: cssHex(PALETTE.fightAttackNow),
  /**
   * 마을 HUD 글자·아이콘(2026-10-18 결정: 순백 + `navyInk` 1px 외곽선, 가끔 뜨는 판은 `navyInk`). 상아·밝은 회색은
   * 누런 포석·크림 벽과 같은 계열이라 덩어리로 섞였다(docs/Plan/2026-10-18-village-hud-hip-mockup).
   */
  white: cssHex(PALETTE.white),
  /** 원본 비율 영상 밖의 레터박스. 영상의 검은 프레임과 이어지는 무채색이다. */
  introBlack: "rgb(0 0 0)",
  ui: cssHex(PALETTE.ui),
  outline: cssHex(PALETTE.outline),
  background: cssHex(PALETTE.background),
  accent: cssHex(PALETTE.accent),
  /** 완료 순간의 임팩트 금색. 행동 이펙트와 같은 온도를 글자에서도 쓴다. */
  hotGold: cssHex(PALETTE.hotGold),
  alarm: cssHex(PALETTE.alarm),
  dim: cssHex(PALETTE.dim),
  loot: cssHex(PALETTE.loot),
  navyInk: cssHex(PALETTE.navyInk),
  paper: cssHex(PALETTE.paper),
  paperInk: cssHex(PALETTE.paperInk),
  paperMuted: cssHex(PALETTE.paperMuted),
  burgundyInk: cssHex(PALETTE.burgundyInk),
  waxRose: cssHex(PALETTE.waxRose),
  rewardInk: cssHex(PALETTE.rewardInk),
  hudEnamel: cssHex(PALETTE.hudEnamel),
  hudEnamelRaised: cssHex(PALETTE.hudEnamelRaised),
  hudFlatMuted: cssHex(PALETTE.hudFlatMuted),
  hudFlatText: cssHex(PALETTE.hudFlatText),
  otherworldButtonInk: cssHex(PALETTE.otherworldButtonInk),
  hudFlatChip: cssHex(PALETTE.hudFlatChip),
  hudFlatPanel: cssHex(PALETTE.hudFlatPanel),
  hudParchment: cssHex(PALETTE.hudParchment),
  oddboutInk: cssHex(PALETTE.oddboutInk),
  oddboutAcid: cssHex(PALETTE.oddboutAcid),
  oddboutPink: cssHex(PALETTE.oddboutPink),
  oddboutGold: cssHex(PALETTE.oddboutGold),
  dialogueGold: cssHex(PALETTE.dialogueGold),
  dialogueGoldBright: cssHex(PALETTE.dialogueGoldBright),
  gildHighlight: cssHex(PALETTE.gildHighlight),
  gildShadow: cssHex(PALETTE.gildShadow),
  dialogueGoldMuted: cssHex(PALETTE.dialogueGoldMuted),
  dialogueCopy: cssHex(PALETTE.dialogueCopy),
  dialogueAction: cssHex(PALETTE.dialogueAction),
  dialoguePortrait: cssHex(PALETTE.dialoguePortrait),
  companionNight: cssHex(PALETTE.companionNight),
  companionPanel: cssHex(PALETTE.companionPanel),
  companionEdge: cssHex(PALETTE.companionEdge),
  companionMuted: cssHex(PALETTE.companionMuted),
  dialogueSurface: cssHex(PALETTE.dialogueSurface),
  dialogueSurfaceDark: cssHex(PALETTE.dialogueSurfaceDark),
  cityNoticeMuted: cssHex(PALETTE.cityNoticeMuted),
  dialogueInk: cssHex(PALETTE.dialogueInk),
  dialogueMuted: cssHex(PALETTE.dialogueMuted),
  dialogueHover: cssHex(PALETTE.dialogueHover),
  dialogueBorder: cssHex(PALETTE.dialogueBorder),
  dialogueAccent: cssHex(PALETTE.dialogueAccent),
});

/**
 * 잉크색 스크림. 패널·백드롭의 반투명 배경은 전부 outline 색에 알파를 붙인 것이다.
 * "#140b26dd" 를 다시 타이핑하지 않는다 — 알파 두 자리만 고르면 된다.
 */
export function scrim(alphaHex: string): string {
  return `${CSS.outline}${alphaHex}`;
}

/**
 * 글꼴 스택. 스택 순서는 "어떤 글꼴이 이기는가" 라서 곧 외형이다.
 *
 * 마루 부리(OFL)와 조선궁서체를 `public/fonts/` 에 함께 실어 나른다. 예전에는
 * 여기에 적힌 "Noto Serif KR" 이 어디에서도 로드되지 않아 실제로는 OS 폴백이,
 * 화면 파일의 "monospace" 리터럴 자리에서는 고정폭 폴백이 이겼다 — 한글에 고정폭이
 * 걸리면 글자마다 같은 폭이 강제돼 단어가 뜯어진다. 실제 로드는 `fontLoading.ts`.
 *
 * 마루 부리 바로 뒤의 "Pretendard" 는 AI Fighter 페이지(`fighter.html`)의 몫이다. 그 페이지는 마루 부리와
 * 조선궁서체의 `@font-face` 를 싣지 않아(2026-10-29, 휴대폰 첫 접속 4.5MB) 같은 스택이 Pretendard 로 넘어간다.
 * 본편(`index.html`)은 마루 부리를 부팅 전에 받으므로 그대로 마루 부리가 이긴다.
 */
export const FONT = Object.freeze({
  /**
   * 예고장·표제 전용 장식면. 괴도가 손으로 쓴 문서라는 물성을 활자가 맡는다.
   * 3.4MB 통짜라 늦게 도착하므로, 반드시 `fontLoading.useDisplayFont` 를 거친다.
   */
  display: '"ChosunGs", "MaruBuri", "Pretendard", "Noto Serif KR", Georgia, serif',
  /** HUD·설정·메뉴 본문. 화면 파일이 "monospace" 를 다시 쓰지 않는다. */
  ui: '"MaruBuri", "Pretendard", "Noto Serif KR", "Noto Serif CJK KR", Georgia, serif',
  /** Persistent combat/stealth and village HUD: plain and compact beside the painted world. */
  hudSans: '"Pretendard", "Malgun Gothic", sans-serif',
  /** 한글이 주인 텍스트. 라틴·숫자도 한글 세리프의 톤을 따른다. */
  serifKorean: '"MaruBuri", "Pretendard", "Noto Serif KR", "Noto Serif CJK KR", Georgia, serif',
  /** 숫자·라틴이 주인 텍스트. 마루 부리의 라틴이 한글과 같은 손에서 나왔다. */
  serifLatin: '"MaruBuri", "Pretendard", Georgia, "Noto Serif KR", serif',
  /**
   * 웹툰 식자(첫 타이틀 프롤로그의 대사·"지난 이야기" 칸 글). 블랙한산스에서 쓰는 글자만 남긴 10KB 서브셋이라
   * 본문 글꼴과 함께 부팅에서 기다린다(`fontLoading.loadUiFont`). 서브셋 밖 글자는 다음 스택으로 넘어가니 새 문구는
   * 서브셋부터 다시 만든다.
   */
  lettering: '"Black Han Sans", "Pretendard", "Malgun Gothic", sans-serif',
} as const);

/**
 * 1280x720 기준 UI 타이포그래피 단계.
 *
 * 화면마다 9~17px 리터럴을 다시 고르면 같은 위계가 서로 다른 크기로 보인다.
 * micro는 진단·순번처럼 없어도 플레이할 수 있는 정보에만 쓰고, 행동과 판단에
 * 필요한 문구는 caption 이상을 사용한다.
 */
export const TYPE = Object.freeze({
  micro: "12px",
  caption: "13px",
  npcName: "10px",
  body: "14px",
  label: "16px",
  section: "18px",
  dialogue: "24px",
  title: "22px",
  display: "28px",
} as const);

/** 메뉴와 카드가 공유하는 최소 상호작용 크기·포커스 계약. */
export const UI_METRICS = Object.freeze({
  controlHeight: 42,
  cornerRadius: 12,
  focusStroke: 3,
} as const);

/** 퀘스트 팝업: DOM과 Canvas가 같은 읽기 크기와 평면 색을 사용한다. */
export const QUEST_POPUP = Object.freeze({
  title: "28px", section: "22px", body: "18px", action: "17px", note: "16px",
  height: 620, compactHeight: 420, composerHeight: 860, evidenceHeight: 480,
  radius: 4,
} as const);

/** 주변 NPC의 짧은 말풍선. 글자 확대 전 CSS px 기준이다. */
export const WORLD_SPEECH = Object.freeze({
  surfaceAlpha: 0.82,
  paddingX: 10,
  paddingY: 8,
  speakerGap: 3,
  tailHeight: 6,
  tailHalfWidth: 5,
  headGap: 10,
  maxTextWidth: 230,
  screenMargin: 16,
  maxPlacementShift: 64,
} as const);

/** 중앙 나침반 아래의 장소 발견·귀환 안내. 안쪽 여백은 말풍선과 공유한다. */
export const CITY_NOTICE = Object.freeze({
  maxTextWidth: 380,
  compassGap: 12,
  /**
   * 장소 발견·행동 알림·귀환 보고 칸 = "가끔 뜨는 중요한 정보"라 판을 깐다(2026-10-18 HUD 확정안). 거리 법랑 표지판처럼
   * `navyInk` 판 + 안쪽 흰 선 하나, 흰 글자, 그림자 없음. 상시 HUD 는 판 없이 1px 외곽선만 쓴다.
   */
  surfaceAlpha: 0.94,
  frameInset: 3,
  frameAlpha: 0.75,
  paddingX: 18,
  paddingY: 10,
} as const);



export const GRAB_REVEAL_COLORS = Object.freeze({ aura: 0xff3a22, rays: 0xffa13b, core: 0xfff0d8 });

/**
 * 캐릭터 각성기 모티프의 색(2026-10-23, `render/view/awakening/*` — 기획 docs/Plan/2026-10-23-character-awakenings). 캐릭터마다 하늘 네 색
 * (`sky` — 배경 패스 밤 셰이더의 깊은 색·밝은 색·구름·별)과 자기 빛·칠 색, 합계 도장 색(`stamp`)이다. 흰 빛 심·금빛은 `PALETTE` 를 쓴다.
 * 하늘은 무투장에서만 칠해진다(`CityFightAwakeningMotifView` `skyColours`) — 시전자 주색에서 색상 90° 이상 떨어진다(2026-10-23 무투장
 * 감사: 주황 곰 아래 주황 하늘, 분홍 형님 아래 자홍 하늘, 갈색 개 아래 갈색 하늘에 시전자가 묻혔다).
 */
export const AWAKENING_COLORS = Object.freeze({
  /** 쿠마 「곰의 철퇴」: 차가운 남청 밤하늘(주황 곰과 반대 색), 불씨, 빛으로 된 곰, 붉은 눈, 쇠공. */
  bearSpirit: Object.freeze({
    sky: Object.freeze({ deep: 0x06101c, high: 0x1e4a6e, cloud: 0x0f2a40, star: 0xff8a3d }),
    bear: 0xff9a3c, ember: 0xff7a2a, hot: 0xffe2a0, eye: 0xff2a1f, iron: 0x2e2b2b, stamp: 0xffa04a,
  }),
  /** 유메 「천근추 낙화장」: 보랏빛 새벽, 꽃잎, 비단 소매. */
  blossom: Object.freeze({
    sky: Object.freeze({ deep: 0x1d1030, high: 0x8e6aa8, cloud: 0x4a2f63, star: 0xffc6dc }),
    petal: 0xffa9c8, petalLight: 0xffe3ee, silk: 0xb07ee0, silkLight: 0xe7d2ff, ink: 0x2b1640, stamp: 0xffa9c8,
  }),

  tome: Object.freeze({
    sky: Object.freeze({ deep: 0x04140f, high: 0x1f6b4f, cloud: 0x0d3a2a, star: 0xd8e6e0 }),
    glyph: 0x2fe39a, glyphLight: 0xc8ffe6, cover: 0x173f2f, page: 0xf3ead2, pageShade: 0xc9bd9c, potion: 0x5cff7a, potionLight: 0xd6ffcf,
    stamp: 0xd62f3a,
  }),

  liftoff: Object.freeze({
    sky: Object.freeze({ deep: 0x02030a, high: 0x2b3350, cloud: 0x0b0f22, star: 0xffffff }),
    flame: 0xff8a2a, flameCore: 0xfff0c2, smoke: 0x8a8f99, smokeLight: 0xd5d8de, beam: 0x8fd8ff, hull: 0xe8ebf0, hullShade: 0xb5bcc8,
    band: 0x23262d, tower: 0x3a3f48, towerLine: 0x1a1d22,
  }),

  mirrorRoom: Object.freeze({
    sky: Object.freeze({ deep: 0x05070d, high: 0x3b4256, cloud: 0x151a26, star: 0xe8eef8 }),
    glass: 0x9fb2c8, glassLight: 0xe6f1ff, frame: 0xc9d4e2, flash: 0xffd83a,
  }),

  countdown: Object.freeze({
    sky: Object.freeze({ deep: 0x07060a, high: 0x3a2f2a, cloud: 0x16121a, star: 0xfff1c9 }),
    spot: 0xfff1c9, weave: 0xffc93d, glove: 0x8a1018, bell: 0xffd45a,
  }),

  dreamBeach: Object.freeze({
    sky: Object.freeze({ deep: 0x2a0f2e, high: 0xff9a5c, cloud: 0x6a2a45, star: 0xffe7b0 }),
    sunTop: 0xffd36b, sunLow: 0xff6f7d, sea: 0x5b3a8c, haze: 0xfff2d6, sand: 0xe8c48a, car: 0x9ce04a, carShade: 0x2d3a1f, carGlass: 0xd8f3ff,
  }),

  cageMatch: Object.freeze({
    sky: Object.freeze({ deep: 0x050b18, high: 0x1e3f6b, cloud: 0x0f2a4a, star: 0x7fe8ff }),
    steel: 0x2a313d, steelLight: 0x8d9aab, mesh: 0x9fb0c4, pad: 0x161b24, grid: 0x3fe0ff, laser: 0x48e6ff,
  }),

  fanfare: Object.freeze({
    sky: Object.freeze({ deep: 0x0d1209, high: 0x4f5a2c, cloud: 0x232a14, star: 0xffd66b }),
    gold: 0xffc83d, red: 0xff4d5e, green: 0x5fd36b, ink: 0x1d2410,
  }),

  auroraExpress: Object.freeze({
    sky: Object.freeze({ deep: 0x031019, high: 0x1c5d6a, cloud: 0x0e3a3c, star: 0xe9fffb }),
    aurora: 0x3df2a8, auroraBlue: 0x46b8ff, ice: 0xbfefff, iceDeep: 0x5fb6d9,
  }),

  noPassing: Object.freeze({
    sky: Object.freeze({ deep: 0x170b05, high: 0x5a3218, cloud: 0x2e180a, star: 0xffb23d }),
    red: 0xe8303a, beacon: 0xff9a1f, paper: 0xfff8e6, ink: 0x22140c,
  }),

  burrowRush: Object.freeze({
    sky: Object.freeze({ deep: 0x0d1a2c, high: 0x5f86b0, cloud: 0x2c4566, star: 0xcfe6ff }),
    dirt: 0x6b4a2b, dirtLight: 0xb08453, hole: 0x1c1209, gopher: 0x7fc7ec,
  }),
  /**
   * 브라보우 「시선 강탈」: 남색 밤(갈색 개와 반대 색) 위 금빛 스포트라이트, 파스텔 감탄 글자, 금메달. 메달의 금(2026-10-23 입체로 다시 그림): 빛 받는 경사 `goldLight`,
   * 몸 `goldMid`, 그늘 `goldShade`, 두께 `goldEdge`, 볼록한 면의 어두운 끝 `faceDark`·밝은 끝 `faceLight`, 양각 별의 밝은 면 `starLight`.
   * 리본은 두 색마다 접힌 쪽 그늘 `*Dark`와 바깥 가장자리 빛 `*Light`.
   */
  spotlightSteal: Object.freeze({
    sky: Object.freeze({ deep: 0x060c1a, high: 0x1f3a6e, cloud: 0x0f1f3a, star: 0xffd76a }),
    gold: 0xffc93d, goldDeep: 0xc98a12, ribbonA: 0x3d6fe0, ribbonB: 0xe03d4f, pastelPink: 0xffb3d9, pastelGreen: 0xa8f0b4, pastelBlue: 0xa8d8ff,
    pastelYellow: 0xfff2a0, ink: 0x2a1d08,
    goldLight: 0xfff3c4, goldMid: 0xf1b52c, goldShade: 0x8f5a0d, goldEdge: 0x6a4108, faceDark: 0xd9961c, faceLight: 0xffe48a, starLight: 0xfff7d6,
    ribbonADark: 0x24479f, ribbonALight: 0x86a8ff, ribbonBDark: 0x9f2232, ribbonBLight: 0xff8a96,
  }),
  /** 버팀 「끝까지 버팀」: 차가운 코발트 밤, 떨림 획, 식은땀, 코발트 파편. */
  tremble: Object.freeze({
    sky: Object.freeze({ deep: 0x050c1f, high: 0x2a4a8f, cloud: 0x14275a, star: 0xb9cdff }),
    ink: 0x1b2440, sweat: 0xd8f1ff, cobalt: 0x2f5fe0, cobaltLight: 0x9fc0ff, dizzy: 0xffe27a,
  }),
  /** 쿵짝 「앙코르 피날레」: 재즈 바의 민트·남색, 오선과 음표. */
  encore: Object.freeze({
    sky: Object.freeze({ deep: 0x07181a, high: 0x2f6e66, cloud: 0x123a38, star: 0xb6ffe6 }),
    staff: 0xf4fff9, mint: 0x5ff2c2, ink: 0x0c2622,
  }),
  /** 시큰둥 「여기까지라고」: 흐린 회색, 바닥의 선, 노란 눈, 화난 김. */
  thatsFar: Object.freeze({
    sky: Object.freeze({ deep: 0x2a2a2c, high: 0x8c8c90, cloud: 0x4c4c50, star: 0x4c4c50 }),
    line: 0xfff6c8, eye: 0xffd21f, steam: 0xe9e9ec, ink: 0x1e1e20,
  }),
  /** 둘둘 「두 뼘 더」: 크림색 종이, 먹 낙서 선, 연두 새싹. */
  doodleReach: Object.freeze({
    sky: Object.freeze({ deep: 0xd9cfb6, high: 0xfaf5e8, cloud: 0xcbbf9f, star: 0x3b362d }),
    ink: 0x2f2b25, green: 0x7bc96f, greenDeep: 0x3f8a3a,
  }),
  /** 어리둥 「방금 그거 뭐야」: 밝게 하얘진 하늘, 메아리 고리. */
  huh: Object.freeze({
    sky: Object.freeze({ deep: 0xb9bec7, high: 0xffffff, cloud: 0xe2e5ea, star: 0x8a8f99 }),
    word: 0xffffff, ink: 0x2a2c33, ring: 0x8fd3ff,
  }),

  confession: Object.freeze({
    room: 0x07080b, cord: 0x2b2722, socket: 0x47403a, bulb: 0xffcf73, bulbCore: 0xfff4d8, dimBody: 0x75624d, door: 0xffe0a3,
    doorFloor: 0xd9a560, cuffDark: 0x5a3d12, stamp: 0xffcf73,
  }),

  disco: Object.freeze({
    sky: Object.freeze({ deep: 0x080a26, high: 0x2a3a8a, cloud: 0x141c4f, star: 0xffd1ef }),
    magenta: 0xff5fae, hot: 0xff2e93, violet: 0xa66bff, tileDark: 0x2a0f35, tileEdge: 0x4d1f5c, ball: 0xc3c6d4, ballShade: 0x6b6f84,
    ballLine: 0x3a3d4f, stamp: 0xff7fc0,
  }),
  /** 퀵캣 「무지개 혜성」: 8비트 남색 우주, 픽셀 별, 여섯 색 무지개. */
  rainbow: Object.freeze({
    sky: Object.freeze({ deep: 0x0b2860, high: 0x1f4f97, cloud: 0x14397a, star: 0xffffff }),
    bands: Object.freeze([0xff3b3b, 0xff9a1f, 0xffe53b, 0x46e04a, 0x2f9bff, 0x7a4dff] as const),
    magenta: 0xff9fd0, stamp: 0xffe53b,
  }),

  resolve: Object.freeze({
    sky: Object.freeze({ deep: 0x070b18, high: 0x1c2b4f, cloud: 0x111a33, star: 0xe8eefc }),
    tracer: 0xfff3c4, ring: 0xdfe8ff, word: 0xffffff, ink: 0x10131c, stamp: 0xdfe8ff,
  }),

  poleVault: Object.freeze({
    sky: Object.freeze({ deep: 0x2a1d12, high: 0x8a6a45, cloud: 0x5a4430, star: 0xf3dfb5 }),
    brass: 0xe0b45c, dust: 0xd8c3a0, word: 0xfff1d0, ink: 0x2b2017, stamp: 0xe0b45c,
  }),
  /**
   * 등록 선수 각성기(2026-10-28 — `RegisteredAwakeningMotifs`): 하늘·빛은 그의 초상에서 뽑은 색(`registeredAccent`)이고, 여기는 색을 뽑지 못한
   * 선수(회색·흑백)의 대체 강조색과 모든 등록 선수가 함께 쓰는 먼지·먹 색이다.
   */
  registered: Object.freeze({ accent: 0x63d2ff, dust: 0xe6dccb, ink: 0x0d1424 }),
});
