import runtimeMediaFile from "./runtime-media.json";

/**
 * 파일 매체 — 오디오·글꼴. 경로·해시·길이·출처는 `runtime-media.json` 이 소유하고, 이 파일은 그 표에서 이름 붙은 항목을 꺼낸다.
 * 이 standalone runtime 에 없는 공유 자산은 빈 경로의 비활성 정의로 남고 `AUDIO_ASSETS` 에서 빠진다.
 */

/**
 * standalone runtime 의 audio/font media 형태. Source metadata 는 build-time 검증에만 쓴다.
 */
interface RuntimeMediaClient {
  readonly audio: readonly FightVoiceEntry[];
  readonly fonts: readonly (Omit<FontAssetDefinition, "role"> & { readonly role: string })[];
}
const runtimeMedia: RuntimeMediaClient = runtimeMediaFile;

/** 파일형 오디오는 출처·해시가 등록된 항목만 런타임에 들어올 수 있다. */
export interface AudioAssetDefinition {
  readonly key: string;
  readonly path: string;
  readonly sha256: string;
  readonly durationMs: number;
}

function audioAsset(key: string): AudioAssetDefinition {
  const asset = runtimeMedia.audio.find((candidate) => candidate.key === key);
  // The standalone Twitch build retains a few shared legacy modules for type-level reuse. Their
  // non-bout cues are intentionally absent from its media registry; an empty path keeps those
  // constants inert, and AUDIO_ASSETS below excludes them from fetch/preload.
  if (asset === undefined) return Object.freeze({ key, path: "", sha256: "", durationMs: 0 });
  return Object.freeze({
    key: asset.key,
    path: asset.path,
    sha256: asset.sha256,
    durationMs: asset.durationMs,
  });
}

/**
 * 번들 글꼴도 오디오와 같은 규칙을 따른다 — 출처·라이선스·해시가 등록된 항목만
 * 런타임에 실린다. `index.html` 의 `@font-face` 와 이 목록이 어긋나면
 * `font-contract.test.ts` 가 잡는다.
 */
export interface FontAssetDefinition {
  readonly key: string;
  readonly path: string;
  readonly sha256: string;
  readonly family: string;
  readonly weight: number;
  readonly role: "ui" | "hud" | "display" | "lettering";
}

function fontAsset(key: string): FontAssetDefinition {
  const asset = runtimeMedia.fonts.find((candidate) => candidate.key === key);
  if (asset === undefined) throw new Error(`등록되지 않은 글꼴 자산: ${key}`);
  const role = asset.role;
  if (role !== "ui" && role !== "hud" && role !== "display" && role !== "lettering") {
    throw new Error(`알 수 없는 글꼴 역할: ${key} → ${role}`);
  }
  return Object.freeze({
    key: asset.key,
    path: asset.path,
    sha256: asset.sha256,
    family: asset.family,
    weight: asset.weight,
    role,
  });
}

/** 본문 글꼴. 부팅을 막고 기다리는 대상이다(render/art/fontLoading). */
export const UI_FONTS: readonly FontAssetDefinition[] = Object.freeze([
  fontAsset("pretendard-regular"),
  fontAsset("pretendard-bold"),
]);

/** 전투·잠입 HUD 산세리프. 첫 Canvas Text 측정 전에 로드한다. */
export const HUD_FONTS: readonly FontAssetDefinition[] = Object.freeze([
  fontAsset("pretendard-regular"),
  fontAsset("pretendard-bold"),
]);

/** 예고장 표제 글꼴. 통짜라 부팅을 막지 않고 늦게 도착한다. */
export const DISPLAY_FONT = fontAsset("pretendard-bold");

/** 웹툰 식자 글꼴(첫 타이틀 프롤로그 대사). 쓰는 글자만 남긴 10KB 서브셋이라 본문과 함께 부팅에서 기다린다. */
export const LETTERING_FONT = fontAsset("black-han-sans-lettering");

/** 주머니에 동전이 들어오는 실제 폴리. 합성 확인음은 런타임에서 사용하지 않는다. */
export const LOOT_COLLECTED_SFX = audioAsset("loot-confirm");

/** Cici Fyre CC0 목재·금속 클릭. 편집 원본과 출처는 runtime-media.json에서 추적한다. */
export const UI_SFX = Object.freeze({
  hover: audioAsset("ui-hover"),
  press: audioAsset("ui-press"),
  reject: audioAsset("ui-reject"),
  confirm: audioAsset("ui-confirm"),
});

/** 무투장 화면(고르기·대진표·경기)의 호버·누름(2026-10-24). 거절·확정은 `UI_SFX` 를 함께 쓴다. */
export const ARENA_UI_SFX = Object.freeze({
  hover: audioAsset("ui-arena-hover"),
  press: audioAsset("ui-arena-press"),
});

/** CC0 호기심 테마. 타이틀과 캐릭터 선택을 한 대기 공간으로 묶는다. */
export const LOBBY_BGM = audioAsset("lobby-bgm");

/**
 * 타이틀 괴도 펑크(2026-10-17, OpenTracks 「屋根裏で怪盗が作戦会議する的なBGM」). 102 BPM 24마디 루프이고
 * 타이틀 프롤로그·활자가 이 박자에 붙는다(`titleBgmBpm`). 포장 파일이다(`ScrambledAudio`, tools/audio/build-opentracks-bgm.py).
 */
export const TITLE_BGM = audioAsset("title-bgm");

/** 마을 테마(2026-10-17, OpenTracks 「石畳の街並み」). 아코디언 3/4박 96마디 루프. 대기(캐릭터 선택·경매 로비)도 이어 쓴다. */
export const VILLAGE_BGM = audioAsset("village-bgm");

/** 마을 1:1 대결(2026-10-17, OpenTracks 「夏はsummer!!」). 호른·슬랩 베이스 펑크 80마디 루프. 대결 동안만 마을 곡을 대신한다. */
export const VILLAGE_FIGHT_BGM = audioAsset("village-fight-bgm");

/** open-RPGBGM 태엽실 루프. 예고장 선택에 정교한 작전 준비의 분위기를 준다. */
export const BRIEFING_BGM = audioAsset("briefing-bgm");

/** open-RPGBGM 시계 미궁 루프. 위험 단계의 비선율 타악층과 함께 재생한다. */
export const HEIST_BGM = audioAsset("heist-bgm");

/** CC0 오케스트라 추격 루프. 블랙손 옥상 금고지기 결투 동안만 저택 곡을 대신한다. */
export const BOSS_BGM = audioAsset("boss-bgm");

/** CC0 어두운 전투 루프(120 BPM). 저택에서 무장 경비와 맞붙은 동안만 저택 곡을 대신한다. */
export const COMBAT_BGM = audioAsset("combat-bgm");

/** CC0 저택 환경 루프. 저역 바람과 물방울로 빈 공간의 깊이를 만든다. */
export const MANSION_AMBIENCE = audioAsset("mansion-ambience");

/**
 * 근접 전투 음원. 이 프로젝트용으로 생성한 Grok Imagine 폴리(타격·피격 몸통)에 CC0 펀치 녹음(샌드백·권투
 * 타격·손바닥 스맥)과 서브 저역을 층으로 쌓았다. 원본·층 출처는 runtime-media.json `source`/`layers`.
 * 무게 티어마다 다른 파일이다 — 같은 샘플의 음량만 키우면 강타가 "큰 잽" 으로 들린다.
 */
export const COMBAT_SFX = Object.freeze({
  hitLight: Object.freeze([audioAsset("combat-hit-light-1"), audioAsset("combat-hit-light-2"), audioAsset("combat-hit-light-3")]),
  hitHeavy: Object.freeze([audioAsset("combat-hit-heavy-1"), audioAsset("combat-hit-heavy-2")]),
  /** 슈퍼아머·장갑 가드: 짧은 CC0 몸통 타격 3종. 금속 링을 겹치지 않는다. */
  hitResist: Object.freeze([1, 2, 3].map(n => audioAsset(`combat-hit-resist-${n}`))),
  /** 무기별 접촉: 짧은 절삭음 / 금속 링 없는 낮은 둔기음. 각 강도는 서로 다른 편집본이다. */
  hitSharp: Object.freeze([1, 2, 3].map(n => audioAsset(`combat-hit-sharp-${n}`))),
  hitSharpHeavy: Object.freeze([1, 2, 3].map(n => audioAsset(`combat-hit-sharp-heavy-${n}`))),
  hitBlunt: Object.freeze([1, 2, 3].map(n => audioAsset(`combat-hit-blunt-${n}`))),
  hitBluntHeavy: Object.freeze([1, 2, 3].map(n => audioAsset(`combat-hit-blunt-heavy-${n}`))),
  hitFinisher: audioAsset("combat-hit-finisher"),
  /** 플레이어이 맞는 소리. 적을 때리는 소리와 음색이 달라야 누가 맞았는지 귀로 안다. */
  hurt: Object.freeze([audioAsset("combat-hurt-1"), audioAsset("combat-hurt-2")]),
  hurtHeavy: audioAsset("combat-hurt-heavy"),
  swingLight: Object.freeze([audioAsset("combat-swing-light-1"), audioAsset("combat-swing-light-2")]),
  swingHeavy: audioAsset("combat-swing-heavy"),
  dash: audioAsset("combat-dash"),
  /** 강타 예비동작의 빨아들이는 소리. 정점이 파일 끝이라 접촉 시각에 끝을 맞춘다. */
  charge: audioAsset("combat-charge"),
  /** 보스 선딜 라이저. */
  bossCharge: audioAsset("combat-boss-charge"),
  clang: audioAsset("combat-clang"),
  crash: audioAsset("combat-crash"),
  bodyFall: audioAsset("combat-body-fall"),
});

/** 이동·착탄의 재질을 합성 노이즈 대신 실제 폴리로 읽히게 하는 짧은 샘플. */
export const LANDING_SFX = audioAsset("landing-soft");
export const THROW_IMPACT_SFX = audioAsset("throw-impact-metal");
export const DODGE_SFX = audioAsset("dodge-cloth");

/** 합성 오실레이터를 대신하는 제작 완료 CC0 폴리 팔레트. */
export const ALERT_BELL_SFX = audioAsset("alert-bell");
export const ATTACK_SWISH_SFX = audioAsset("attack-swish");
export const WEAPON_DRAW_SFX = audioAsset("weapon-draw");
export const CLOTH_LIGHT_SFX = audioAsset("cloth-light");
export const CLOTH_HEAVY_SFX = audioAsset("cloth-heavy");
export const LEATHER_DROP_SFX = audioAsset("leather-drop");
export const METAL_LATCH_SFX = audioAsset("metal-latch");
export const DOOR_OPEN_SFX = audioAsset("door-open");
export const GLASS_BREAK_SFX = audioAsset("glass-break");
export const WOOD_IMPACT_HEAVY_SFX = audioAsset("wood-impact-heavy");
export const METAL_IMPACT_SFX = audioAsset("metal-impact");
export const BODY_IMPACT_HEAVY_SFX = audioAsset("body-impact-heavy");
export const TOOL_HANDLE_SFX = audioAsset("tool-handle");
export const AUTHORED_EFFECT_SFX: readonly AudioAssetDefinition[] = Object.freeze([
  ALERT_BELL_SFX,
  ATTACK_SWISH_SFX,
  WEAPON_DRAW_SFX,
  CLOTH_LIGHT_SFX,
  CLOTH_HEAVY_SFX,
  LEATHER_DROP_SFX,
  METAL_LATCH_SFX,
  DOOR_OPEN_SFX,
  GLASS_BREAK_SFX,
  WOOD_IMPACT_HEAVY_SFX,
  METAL_IMPACT_SFX,
  BODY_IMPACT_HEAVY_SFX,
  TOOL_HANDLE_SFX,
]);

/**
 * 마을 발소리(계획 1e). 이 프로젝트용 Grok Imagine 영상 오디오 폴리를 온셋으로 잘랐다(원본·가공은
 * runtime-media.json `source`, 후보 전체는 `assets/art-archive/village-footsteps-20260929`). 표면마다 4개.
 * 나무 표면은 v6 마을에 없어(운하 다리도 돌 아치) 싣지 않았다.
 */
export const VILLAGE_FOOTSTEP_SFX = Object.freeze({
  stone: Object.freeze([1, 2, 3, 4].map((n) => audioAsset(`village-step-stone-${n}`))),
  grass: Object.freeze([1, 2, 3, 4].map((n) => audioAsset(`village-step-grass-${n}`))),
  dirt: Object.freeze([1, 2, 3, 4].map((n) => audioAsset(`village-step-dirt-${n}`))),
});

/**
 * 대결 목소리(2026-10-21, docs/kaito-web/fight-voices.md): `audio/voice/` 아래 VoxCPM2 생성 클립. 누가(`speaker`) 어느 소리(`cue`)를 내는지,
 * 화면에 뜨는 대사라면 그 i18n 키(`textKey`)는 등록부 항목의 `voice` 가 소유한다. 언제 무엇을 내는지는 `app/FightVoiceCues.ts`.
 * 첫 입력에 받지 않는다 — 대결이 두 사람 몫만 `prefetch` 한다(`AudioEngine` onDemandSample).
 */
export const FIGHT_VOICE_DIR = "audio/voice/";

export interface FightVoiceAssetDefinition extends AudioAssetDefinition {
  readonly speaker: string;
  readonly cue: string;
  readonly textKey: string | null;
}

interface FightVoiceEntry {
  readonly key: string;
  readonly path: string;
  readonly sha256: string;
  readonly durationMs: number;
  readonly voice?: { readonly speaker: string; readonly cue: string; readonly textKey: string | null };
}

export const FIGHT_VOICE_SFX: readonly FightVoiceAssetDefinition[] = Object.freeze(
  runtimeMedia.audio.filter((entry) => entry.path.startsWith(FIGHT_VOICE_DIR)).map((entry) => {
    if (entry.voice === undefined) throw new Error(`fight voice ${entry.key} has no voice (speaker, cue, textKey)`);
    return Object.freeze({ key: entry.key, path: entry.path, sha256: entry.sha256, durationMs: entry.durationMs,
      speaker: entry.voice.speaker, cue: entry.voice.cue, textKey: entry.voice.textKey });
  }),
);

/** 파일 자산 목록의 오디오 SSOT. AudioEngine과 배포 검증이 같은 JSON을 소비한다. */
export const AUDIO_ASSETS: readonly AudioAssetDefinition[] = Object.freeze([
  LOOT_COLLECTED_SFX,
  ...Object.values(UI_SFX),
  ...Object.values(ARENA_UI_SFX),
  LOBBY_BGM,
  TITLE_BGM,
  VILLAGE_BGM,
  VILLAGE_FIGHT_BGM,
  BRIEFING_BGM,
  HEIST_BGM,
  BOSS_BGM,
  COMBAT_BGM,
  MANSION_AMBIENCE,
  ...COMBAT_SFX.hitLight,
  ...COMBAT_SFX.hitHeavy,
  ...COMBAT_SFX.hitResist,
  ...COMBAT_SFX.hitSharp,
  ...COMBAT_SFX.hitSharpHeavy,
  ...COMBAT_SFX.hitBlunt,
  ...COMBAT_SFX.hitBluntHeavy,
  COMBAT_SFX.hitFinisher,
  ...COMBAT_SFX.hurt,
  COMBAT_SFX.hurtHeavy,
  ...COMBAT_SFX.swingLight,
  COMBAT_SFX.swingHeavy,
  COMBAT_SFX.dash,
  COMBAT_SFX.charge,
  COMBAT_SFX.bossCharge,
  COMBAT_SFX.clang,
  COMBAT_SFX.crash,
  COMBAT_SFX.bodyFall,
  LANDING_SFX,
  THROW_IMPACT_SFX,
  DODGE_SFX,
  ...AUTHORED_EFFECT_SFX,
  ...VILLAGE_FOOTSTEP_SFX.stone,
  ...VILLAGE_FOOTSTEP_SFX.grass,
  ...VILLAGE_FOOTSTEP_SFX.dirt,
  ...FIGHT_VOICE_SFX,
].filter((asset) => asset.path !== ""));
