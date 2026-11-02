import concepts from "./arena-concept-runtime.json";
import airship from "./arena-airship-runtime.json";
import ring from "./arena-ring-runtime.json";

/**
 * The tournament arena's ring background (2026-10-18, 2단계 — 사용자: 네온 아케이드 링): one Codex image_gen picture of the neon arcade
 * ring seen side-on, padded into the arena's night by `tools/art/import-arena-ring.mjs` (source and prompt in
 * `assets/art/arena-neon-ring-20261018`). `arena-ring-runtime.json` owns its size and registration in runtime pixels: the corner posts'
 * centres, the canvas's far and near edges, and the line the fighters' feet stand on. `ArenaGround` stretches the posts over the ring's ends.
 * The arena's preload asks for it (the board starts that behind the "입장" fade); it is outside every load bundle.
 */
export const ARENA_RING_ART = Object.freeze({
  key: "arena-neon-ring-v1",
  path: ring.path,
  width: ring.width,
  height: ring.height,
  /** The corner posts' centres (x, runtime px). */
  posts: Object.freeze([ring.posts[0]!, ring.posts[1]!] as const),
  /** The canvas's far edge (under the posts) and near edge (the apron lip) (y, runtime px). */
  canvasBack: ring.canvasBack,
  canvasFront: ring.canvasFront,
  /** The fighters' feet line (y, runtime px). */
  feet: ring.feet,
  /** The three ropes' heights at the corner posts' pads (y, runtime px, top first), and how far the pads' inner faces stand in from a post's centre. */
  pads: Object.freeze([...ring.pads]),
  padInset: ring.padInset,
});

/**
 * The AI Fighter wordmark (2026-10-19), cut by `tools/art/build-ai-fighter-logo.py` from `assets/art-archive/title-logo-ai-fighter-20261018`.
 * It headed the arena's select screen until the ODDBOUT redesign (2026-10-22): the page's brand is now the ODDBOUT logo in fighter.html's DOM
 * bar (`public/art/ui/oddbout-logo.webp`), and no screen loads this one. Kept with its record while the page is still named AI Fighter.
 */
export const ARENA_FIGHTER_LOGO = Object.freeze({
  key: "ai-fighter-logo",
  path: "art/ui/ai-fighter-logo.webp",
  width: 1024,
  height: 512,
});

/** The ODDBOUT wordmark (2026-10-22): fighter.html's DOM bar shows it (no scene loads it); the league page's logo, same bytes. */
export const ARENA_ODDBOUT_LOGO = Object.freeze({
  path: "art/ui/oddbout-logo.webp",
  width: 376,
  height: 76,
});

/**
 * The ODDBOUT event airship over the arena (2026-10-22, docs/kaito-web/tournament-arena.md): the level drawing of one codex image_gen picture
 * with the ODDBOUT wordmark laid on its banner (`tools/art/import-arena-airship.mjs`, source and prompt in `assets/art/arena-airship-20261022`).
 * It shows at the bout's two ends only (`ArenaAirship`). Loaded with the ring; outside every load bundle.
 */
export const ARENA_AIRSHIP_ART = Object.freeze({ key: "arena-oddbout-airship-v1", path: airship.path, width: airship.width, height: airship.height });

/** One card picture: its texture key, path and size (runtime px, trimmed head to feet). */
export interface ArenaConceptArt {
  readonly key: string;
  readonly path: string;
  readonly width: number;
  readonly height: number;
  /** His face: a square of the picture (runtime px, measured by the import) — the arena's HP bars show it beside each bar. */
  readonly face: { readonly x: number; readonly y: number; readonly side: number };
}

/**
 * The arena character select's front concepts (2026-10-19 — 사용자: 무투장 초대 첫 페이지를 위해서 각각의 캐릭터 정면 컨셉 원화): one
 * front-view full-body picture per playable and per costume, keyed by the playable's id (`-swim-tube` added for the stock swim costume;
 * `arenaConceptArt` picks one). Codex image_gen with the hero's front view as every other prompt's style anchor; the cat-bikini card is the costume's approved
 * concept (image_gen refused it). Sources, prompts and the record are in `assets/art/arena-front-concepts-20261019`;
 * `tools/art/import-arena-concepts.mjs` trims and scales them (`arena-concept-runtime.json`). The select screen loads them with the roster.
 */
export const ARENA_CONCEPT_ART: Readonly<Record<string, ArenaConceptArt>> = Object.freeze(Object.fromEntries(
  Object.entries(concepts.art).map(([id, art]) => [id, Object.freeze({ key: `arena-concept-${id}`, path: art.path, width: art.width, height: art.height,
    face: Object.freeze({ ...art.face }) })]),
));

/** The stock costume each card picture of a costume is drawn in (`STOCK_OUTFITS` id → the picture id's suffix). */
const COSTUME_SUFFIX: Readonly<Record<string, string>> = Object.freeze({
  "stock-swim-tube-v1": "swim-tube",
  "stock-swim-tube-female-v1": "swim-tube",
});

/**
 * The registered fighters' cards (선수 프로필 세트, 2026-10-31): each one's approved front card, set by the render layer as his roster entry and
 * picture come in (`RegisteredArenaFighters`). Same shape as a house concept, so every card, face and winner picture draws him from it.
 */
let registeredCards: ReadonlyMap<string, ArenaConceptArt> = new Map();
export function setRegisteredArenaCards(cards: ReadonlyMap<string, ArenaConceptArt>): void { registeredCards = cards; }

/** The card picture of `playableId` in `costumeId` (null: his own outfit), or null where none is drawn. */
export function arenaConceptArt(playableId: string, costumeId: string | null): ArenaConceptArt | null {
  const suffix = costumeId === null ? "" : COSTUME_SUFFIX[costumeId];
  if (suffix === undefined) return null;
  return ARENA_CONCEPT_ART[suffix ? `${playableId}-${suffix}` : playableId] ?? (suffix ? null : registeredCards.get(playableId) ?? null);
}

/**
 * The card picture whose face stands beside a corner's HP bar in the arena (2026-10-20 — the player's bout and the AI duel alike): his card in
 * `costumeId`, else in his own outfit; null where none is drawn (a registered fighter without an approved profile set).
 */
export function arenaFaceArt(playableId: string, costumeId: string | null = null): ArenaConceptArt | null {
  return arenaConceptArt(playableId, costumeId) ?? arenaConceptArt(playableId, null);
}

export const ARENA_ART_FILE_PATHS: readonly string[] = Object.freeze([ARENA_RING_ART.path, ARENA_AIRSHIP_ART.path, ARENA_FIGHTER_LOGO.path, ARENA_ODDBOUT_LOGO.path,
  ...Object.values(ARENA_CONCEPT_ART).map(art => art.path)]);
