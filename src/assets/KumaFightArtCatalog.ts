/**
 * KUMA fight presentation art (2026-10-09, generated through the codex subscription). Paths are under `public/`.
 *
 * The fight code reads every piece through this catalog and falls back when a piece is not in `KUMA_FIGHT_ART_READY` yet
 * (letters: the code font; cut-ins: crops of existing portraits). The art pass adds an id to the set once its file is in
 * `public/` — nothing here may name a file that does not exist while it is listed as ready.
 */

/** Comic sound / call-out letters. Each has a Korean and an English drawing (`kumaFightLetterPath`). */
export const KUMA_FIGHT_LETTERS = Object.freeze({

  puk: { ko: "퍽!", en: "POW!" },
  /** A heavy blow landed (the hook, V, KUMA's slam). */
  kwang: { ko: "쾅!", en: "BAM!" },
  /** A blow on KUMA's attack armour: he does not flinch. */
  teong: { ko: "텅!", en: "CLANG!" },
  /**
   * KUMA's swing ate the blow (2026-10-19, user: 갑옷 → "슈퍼아머", 타격 부위 근처에 크게). Popped at the contact, not over his head
   * (`NativeCityFightStagecraft.contactLetter`). Drawn 2026-10-19 in cold steel (raw/letters-d, codex gpt-6-sol).
   */
  superArmor: { ko: "슈퍼아머!", en: "SUPER ARMOR!" },
  /** KUMA's guard took it. */
  mak: { ko: "막!", en: "BLOCK!" },
  /** A guard crushed / poise broken. */
  kkaejim: { ko: "깨짐!", en: "BREAK!" },
  /** A whiff or a dodge. */
  hwik: { ko: "휙!", en: "WHOOSH!" },
  /** KUMA is open for a counter (after a whiff, a parry). */
  bintum: { ko: "빈틈!", en: "OPENING!" },

  seuk: { ko: "스윽!", en: "SWIPE!" },
  /** A counter hit landed. */
  counter: { ko: "카운터!", en: "COUNTER!" },

  hipBump: { ko: "엉덩이 쾅!", en: "HIP BUMP!" },

  ttak: { ko: "딱!", en: "SNAP!" },
  ppyong: { ko: "뿅!", en: "POP!" },
  jjuuk: { ko: "쭈욱!", en: "SLIDE!" },
  /**
   * ODDBOUT 01~07's (2026-10-23, same brush, raw/letters-f · letters-g): 브라보우's feint charge, 퀵캣's flight, 시큰둥's brace shove,
   * 둘둘's long arm, 어리둥's poke.
   */
  jjajan: { ko: "짜잔!", en: "TA-DA!" },
  syung: { ko: "슝!", en: "WHOOSH!" },
  tak: { ko: "탁!", en: "SHOVE!" },
  jjuk: { ko: "쭉!", en: "STRETCH!" },
  kok: { ko: "콕!", en: "POKE!" },

  kung: { ko: "쿵!", en: "THUD!" },
  jjak: { ko: "짝!", en: "SMACK!" },
  peong: { ko: "펑!", en: "POOF!" },
  paat: { ko: "파앗!", en: "FWOOM!" },
  abyo: { ko: "아뵤!", en: "WATAA!" },
  ttabong: { ko: "따봉!", en: "LIKE!" },
  chakryuk: { ko: "착륙!", en: "LANDED!" },
  cheolpeok: { ko: "철퍽!", en: "SPLAT!" },
  disco: { ko: "디스코!", en: "DISCO!" },
  ppaak: { ko: "빠악!", en: "UPPERCUT!" },
  anboyeo: { ko: "안 보여!", en: "CAN'T SEE!" },
  kungjjak: { ko: "쿵짝!", en: "BA-DUM!" },

  tang: { ko: "탕!", en: "BANG!" },
  ahem: { ko: "에헴!", en: "AHEM!" },

  deopseok: { ko: "덥석!", en: "GOTCHA!" },
  /** Fight intro (2026-10-10 round start, KOF style): the same Latin text and drawing in both locales (drawn 2026-10-18, raw/letters-c). */
  ready: { ko: "READY", en: "READY" },
  fight: { ko: "FIGHT!", en: "FIGHT!" },
  /** The old cut-in intro's letters (drawn; no longer shown). */
  duel: { ko: "결투!", en: "DUEL!" },
  vs: { ko: "VS", en: "VS" },
  /** Victory slam. */
  ko: { ko: "K.O.", en: "K.O." },
  /** Victory stamp (office-worker gag). */
} as const);

export type KumaFightLetterId = keyof typeof KUMA_FIGHT_LETTERS;
export type KumaFightLocale = "ko" | "en";

/**
 * Each fighter's own call on his heavy in the AI duel (2026-10-24), by the move he swings (`combat.special ?? combat.action` — the move-FX
 * cues' clip name): for fighters whose clips name none themselves (`keys.contactLetter` — the ODDBOUT skills'). A move missing here keeps
 * the blow's own letter ("쾅!" on a loud heavy); a light blow says nothing either way.
 */
export const FIGHTER_CONTACT_LETTERS: Readonly<Record<string, Readonly<Record<string, KumaFightLetterId>>>> = Object.freeze({
  kuma: { slam: "kung", buttSlam: "hipBump" },
  yume: { slam: "paat" },
  kungjjak: { slam: "kungjjak" },
});

/** Fighter `fighterId`'s own call on `move` (`FIGHTER_CONTACT_LETTERS`), else null. */
export function fighterContactLetter(fighterId: string, move: string | null): KumaFightLetterId | null {
  return move === null ? null : FIGHTER_CONTACT_LETTERS[fighterId]?.[move] ?? null;
}

/** The drawn letter for `id` in `locale` (`public/` path). Check `kumaFightArtReady` first. */
export function kumaFightLetterPath(id: KumaFightLetterId, locale: KumaFightLocale): string {
  return `art/ui/kuma-fight-v1/letters/${locale}/${id}.webp`;
}

/** Ready-art key for a letter (`KUMA_FIGHT_ART_READY` entry and texture key suffix). */
export function kumaFightLetterArtId(id: KumaFightLetterId, locale: KumaFightLocale): string {
  return `letter-${locale}-${id}`;
}

/** Illustrations and effect sheets (`public/` paths). */
export const KUMA_FIGHT_ART = Object.freeze({

  cutinKuma: "art/ui/kuma-fight-v1/cutin-kuma.webp",


  /** KUMA expression busts, transparent. */
  kumaFaceShock: "art/ui/kuma-fight-v1/kuma-face-shock.webp",
  kumaFaceGroggy: "art/ui/kuma-fight-v1/kuma-face-groggy.webp",
  kumaFaceAnger: "art/ui/kuma-fight-v1/kuma-face-anger.webp",
  kumaFacePanic: "art/ui/kuma-fight-v1/kuma-face-panic.webp",
  /** Ink shard strip for breaking letters / panels (one row of shards). */
  letterShards: "art/ui/kuma-fight-v1/letter-shards.webp",
  /**
   * Effect strips, one row of frames each, transparent (frame count / size in the art pass's README): a curved ink slash, an
   * ink impact star, radial speed lines (focus lines) for cut-ins.
   */
  fxInkSlash: "art/ui/kuma-fight-v1/fx-ink-slash.webp",
  fxImpactStar: "art/ui/kuma-fight-v1/fx-impact-star.webp",
  fxSpeedLines: "art/ui/kuma-fight-v1/fx-speed-lines.webp",
} as const);

export type KumaFightArtId = keyof typeof KUMA_FIGHT_ART;

/**
 * Ids whose files are in `public/`: `KumaFightArtId`s and `kumaFightLetterArtId(...)` keys. The art pass fills this in; until
 * then everything draws its fallback.
 */
export const KUMA_FIGHT_ART_READY: ReadonlySet<string> = new Set<string>([
  // Illustrations and effect strips (frame counts / sizes: assets/art/kuma-fight-20261009/README.md).
  "cutinKuma",

  "kumaFaceShock",
  "kumaFaceGroggy",
  "kumaFaceAnger",
  "kumaFacePanic",
  "letterShards",
  "fxInkSlash",
  "fxImpactStar",
  "fxSpeedLines",
  // Letters, ko + en.
  "letter-ko-puk",
  "letter-ko-kwang",
  "letter-ko-teong",
  "letter-ko-superArmor",
  "letter-ko-mak",
  "letter-ko-kkaejim",
  "letter-ko-hwik",
  "letter-ko-bintum",
  "letter-ko-counter",
  "letter-ko-seuk",
  "letter-ko-deopseok",
  "letter-ko-ttak",
  "letter-ko-ppyong",
  "letter-ko-jjuuk",
  "letter-ko-jjajan",
  "letter-ko-syung",
  "letter-ko-tak",
  "letter-ko-jjuk",
  "letter-ko-kok",
  "letter-ko-hipBump",
  "letter-ko-kung",
  "letter-ko-jjak",
  "letter-ko-peong",
  "letter-ko-paat",
  "letter-ko-abyo",
  "letter-ko-ttabong",
  "letter-ko-chakryuk",
  "letter-ko-cheolpeok",
  "letter-ko-disco",
  "letter-ko-ppaak",
  "letter-ko-anboyeo",
  "letter-ko-kungjjak",
  "letter-ko-tang",
  "letter-ko-ahem",
  "letter-ko-ready",
  "letter-ko-fight",
  "letter-ko-duel",
  "letter-ko-vs",
  "letter-ko-ko",
  "letter-en-puk",
  "letter-en-kwang",
  "letter-en-teong",
  "letter-en-superArmor",
  "letter-en-mak",
  "letter-en-kkaejim",
  "letter-en-hwik",
  "letter-en-bintum",
  "letter-en-counter",
  "letter-en-seuk",
  "letter-en-deopseok",
  "letter-en-ttak",
  "letter-en-ppyong",
  "letter-en-jjuuk",
  "letter-en-jjajan",
  "letter-en-syung",
  "letter-en-tak",
  "letter-en-jjuk",
  "letter-en-kok",
  "letter-en-hipBump",
  "letter-en-kung",
  "letter-en-jjak",
  "letter-en-peong",
  "letter-en-paat",
  "letter-en-abyo",
  "letter-en-ttabong",
  "letter-en-chakryuk",
  "letter-en-cheolpeok",
  "letter-en-disco",
  "letter-en-ppaak",
  "letter-en-anboyeo",
  "letter-en-kungjjak",
  "letter-en-tang",
  "letter-en-ahem",
  "letter-en-ready",
  "letter-en-fight",
  "letter-en-duel",
  "letter-en-vs",
  "letter-en-ko",
  // 승리 도장(kaltoe)은 구운 글자 원화(옛 직장 개그 "칼퇴 완료")를 쓰지 않는다 — 코드 도장(`bakeStamp`)이 위 문구를 그린다(2026-10-17).
]);

export function kumaFightArtReady(id: string): boolean {
  return KUMA_FIGHT_ART_READY.has(id);
}

/**
 * Every ready file (`public/` paths) — the asset table's audit list (`ALL_IMAGE_FILE_PATHS`). The fight loads them lazily when
 * KUMA is challenged (outside the load bundles).
 */
export const KUMA_FIGHT_ART_FILE_PATHS: readonly string[] = Object.freeze([
  ...(Object.keys(KUMA_FIGHT_ART) as KumaFightArtId[]).filter(kumaFightArtReady).map(id => KUMA_FIGHT_ART[id]),
  ...(["ko", "en"] as const).flatMap(locale => (Object.keys(KUMA_FIGHT_LETTERS) as KumaFightLetterId[])
    .filter(id => kumaFightArtReady(kumaFightLetterArtId(id, locale))).map(id => kumaFightLetterPath(id, locale))),
]);
