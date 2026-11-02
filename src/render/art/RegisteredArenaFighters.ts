import { toDuelStats, toDuelStyle, toSidePreviewPack, type FighterDuelStats, type FighterDuelStyle } from "../../../contracts/ai-fighter/validate.mjs";
import { addRegisteredArenaFighters, arenaPlayable, setRegisteredArenaRoster, type RegisteredArenaPlayable } from "../../app/ArenaRoster";
import { parseFighterLines, type FighterLines } from "../../platform/fighterLines";
import { fetchFighterAsset, fetchProfileImage, fetchRegisteredFighters, fetchRegisteredPackage, fetchPublicFighterPackage, fighterApiBase,
  type FighterProfileSet, type RegisteredFighterEntry, type RegisteredFighterPackage } from "../../platform/registeredFighters";
import { nativeCityOrthoActionAssets, nativeCityOrthoGaitAssets, type NativeCityOrthoPack } from "./NativeCityOrthoPack";
import type { SpriteSheetAssetDefinition } from "../../assets/RuntimeArtTypes";
import { setRegisteredArenaCards, type ArenaConceptArt } from "../../assets/ArenaArtCatalog";
import type { SuperCutInArt } from "../../assets/SuperCutInArtCatalog";
import type { CityTournamentRegisteredFighter } from "../../app/CityTournamentBouts";

interface LoadedFighter { pkg: RegisteredFighterPackage; urls: Map<string, string>; pack: NativeCityOrthoPack }
const loaded = new Map<string, LoadedFighter>();
/** His approved profile set's card (선수 프로필 세트, 2026-10-31), its hash-checked picture held as an object URL. */
interface LoadedCard { sha256: string; art: ArenaConceptArt }
const cards = new Map<string, LoadedCard>();
const preparing = new Map<string, Promise<void>>();
let loading: Promise<boolean> | null = null;
/** At most this many of one fighter's files on the wire at once (signed storage addresses — not the Edge reads `edgeFetch` paces). */
const FILES_AT_ONCE = 4;
/**
 * The cup's own fighters (`loadRegisteredCupFighters`): his load under way, the ids the cup holds now and their roster entries. A roster
 * refresh keeps a held fighter — his entry, and his whole files rather than its idle-only copy.
 */
const cupLoads = new Map<string, Promise<void>>();
let held: ReadonlySet<string> = new Set();
const heldEntries = new Map<string, RegisteredArenaPlayable>();
/** Told each time a cup fighter stands on the playable roster (his name, idle and card in) — the screen draws him (`loadRegisteredCupFighters`). */
let cupLanded: ((id: string) => void) | null = null;

function packOf(pkg: RegisteredFighterPackage, urls: ReadonlyMap<string, string>): NativeCityOrthoPack {
  const preview = toSidePreviewPack(pkg.manifest);
  const side = Object.fromEntries(Object.entries(preview.directions.side).map(([name, clip]) => {
    const assetId = pkg.manifest.clips[name as keyof typeof pkg.manifest.clips].assetId;
    return [name, { ...clip, key: `registered-${pkg.entry.id}-${pkg.entry.manifestSha256}-${name}`, path: urls.get(assetId) ?? "" }];
  }));
  // This adapter is only passed to arena left/right consumers, never to world cameras.
  return { ...preview, adopted: { ...preview.adopted, runtimeApproved: true }, directions: { side } } as unknown as NativeCityOrthoPack;
}
export function registeredArenaPack(id: string): NativeCityOrthoPack | null {
  return arenaPlayable(id)?.kind === "registered" ? loaded.get(id)?.pack ?? null : null;
}
/**
 * His face beside the HP bar and on the KO cards: his approved profile set's front card (its face square), else the verified package's authored
 * portrait crop.
 */
export function registeredArenaFaceArt(id: string): ArenaConceptArt | null {
  const item = arenaPlayable(id)?.kind === "registered" ? loaded.get(id) : null;
  if (!item) return null;
  const card = cards.get(id);
  if (card) return card.art;
  const { assetId, crop } = item.pkg.manifest.profile.portrait;
  const asset = item.pkg.manifest.assets.find(asset => asset.id === assetId), path = item.urls.get(assetId);
  if (!asset || !path) return null;
  const side = Math.min(crop.width, crop.height);
  return { key: `registered-${id}-${item.pkg.entry.manifestSha256}-portrait`, path, width: asset.width, height: asset.height,
    face: { x: crop.x + (crop.width - side) / 2, y: crop.y + (crop.height - side) / 2, side } };
}
/**
 * His super's cut-in close-up (2026-10-28 — a registered fighter's awakening): his portrait's face square as the painted close-ups are kept
 * (`SuperCutInArt` — the eye a little above the square's middle, the band its rows). His side sheets face right (`appearance.sourceFacing`),
 * as the close-ups do. Null while his package is not in.
 */
export function registeredSuperCutInArt(id: string): SuperCutInArt | null {
  const art = registeredArenaFaceArt(id);
  if (!art) return null;
  const { x, y, side } = art.face;
  return { key: art.key, path: art.path, width: art.width, height: art.height, eye: [x + side * 0.5, y + side * 0.42],
    band: [y + side * 0.06, y + side * 0.94] };
}
/** His duel grades, read from the same hash-checked manifest as his pack (2026-10-23). */
export function registeredArenaStats(id: string): FighterDuelStats | null {
  const item = loaded.get(id);
  return item ? toDuelStats(item.pkg.manifest) : null;
}
/**
 * His package as a cup bout fights him (내 선수 출전, 2026-10-27): its side pack, grades and hash — or null while his package is not in. The
 * cup holds a bout of his until it is (`ArenaCupStepper`), and only on the hash the cup started with (`arenaCupRegistered`).
 */
export function registeredCupFighter(id: string): CityTournamentRegisteredFighter | null {
  const item = arenaPlayable(id)?.kind === "registered" ? loaded.get(id) : null;
  return item ? { pack: item.pack, stats: toDuelStats(item.pkg.manifest), style: toDuelStyle(item.pkg.manifest), manifestSha256: item.pkg.entry.manifestSha256 } : null;
}
/** His own lines (2026-10-27, `profile.lines` — his challenge before a bout, his win and loss after it), or null. Text as he wrote it. */
export function registeredArenaLines(id: string): FighterLines | null {
  return parseFighterLines((loaded.get(id)?.pkg.manifest.profile as { lines?: unknown } | undefined)?.lines) ?? null;
}
/** His fighting style from the same hash-checked manifest (2026-10-27), or null — the standard kit. */
export function registeredArenaStyle(id: string): FighterDuelStyle | null {
  const item = loaded.get(id);
  return item ? toDuelStyle(item.pkg.manifest) : null;
}
export function registeredArenaFighterReady(id: string): boolean {
  const item = loaded.get(id);
  return !!item && item.urls.size === item.pkg.manifest.assets.length && arenaPlayable(id)?.kind === "registered";
}
/** How much of his package's files are in (0~1; 0 until his package is) — the VS card's bar (2026-11-02). */
export function registeredArenaFighterProgress(id: string): number {
  const item = loaded.get(id);
  return item ? Math.min(1, item.urls.size / Math.max(1, item.pkg.manifest.assets.length)) : 0;
}
export function registeredArenaDuelReady(id: string): boolean {
  return registeredArenaFighterReady(id) && loaded.get(id)?.pkg.duelApproved === true;
}
/**
 * His duel sheets for a bout's preload: none until every file of his package is in (`registeredArenaFighterReady`). The roster brings only his
 * idle, so a pack read before `prepareRegisteredArenaFighter` has clips with no path (2026-11-02 — the live cup's reload loop threw on them).
 */
export function registeredArenaSheets(id: string): SpriteSheetAssetDefinition[] {
  const pack = registeredArenaFighterReady(id) ? registeredArenaPack(id) : null;
  return pack ? [...nativeCityOrthoGaitAssets(pack, ["idle", "walk", "run"]), ...nativeCityOrthoActionAssets(pack)] : [];
}

/** Both current package approvals must be rechecked even when all textures are cached. */
export async function prepareRegisteredArenaDuel(a: string, b: string): Promise<void> {
  if (a === b || arenaPlayable(a)?.kind !== "registered" || arenaPlayable(b)?.kind !== "registered") throw new Error("invalid-duel-pair");
  await Promise.all([prepareRegisteredArenaFighter(a), prepareRegisteredArenaFighter(b)]);
  if (!registeredArenaDuelReady(a) || !registeredArenaDuelReady(b)) throw new Error("duel-not-approved");
}

/**
 * Only the idle art is downloaded for each roster card. Full clips load when that fighter enters a bout. Fighters off the server's latest-20
 * window come in too: a homepage link's (`requestedId` — false when he did not), this browser's own (`mine`, 내 선수 출전 — one the server
 * no longer has is left out quietly).
 */
export function loadRegisteredArenaRoster(requestedId?: string, mine: readonly string[] = []): Promise<boolean> {
  return loading ??= refresh(requestedId, mine).finally(() => { loading = null; });
}
async function refresh(requestedId: string | undefined, mine: readonly string[]): Promise<boolean> {
  const base = fighterApiBase();
  if (!base) { setRegisteredArenaRoster(withHeld([])); return true; }
  try {
    const entries = await fetchRegisteredFighters(base); let complete = true;
    const requestedPackages = new Map<string, RegisteredFighterPackage>();
    // A homepage link (or this browser's own fighters) may name a fighter outside the arena's latest-20 window.
    const outside = [...new Set([...(requestedId ? [requestedId] : []), ...mine])].filter(id => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)
      && !entries.some(entry => entry.id === id));
    const fetched = await Promise.all(outside.map(id => fetchPublicFighterPackage(base, id).catch(() => null)));
    for (const [index, pkg] of [...fetched.entries()].reverse()) {
      if (!pkg) { if (outside[index] === requestedId) complete = false; continue; }
      requestedPackages.set(pkg.entry.id, pkg);
      entries.unshift({ ...pkg.entry, duelApproved: pkg.duelApproved });
    }
    // Every fighter's package and idle art at once, kept in the roster's order (2026-10-24: one after another, the live site's three
    // fighters took about 4 s).
    const results = await Promise.all(entries.map(async entry => {
      try {
        // The cup's own load of him under way: its package and files, not a second read.
        await cupLoads.get(entry.id)?.catch(() => undefined);
        const item = loaded.get(entry.id);
        if (!item || item.pkg.entry.manifestSha256 !== entry.manifestSha256) {
          const pkg = requestedPackages.get(entry.id) ?? await fetchRegisteredPackage(base, entry), urls = new Map<string, string>();
          const idle = pkg.manifest.clips.idle.assetId;
          urls.set(idle, URL.createObjectURL(await fetchFighterAsset(pkg, idle)));
          // The cup's load landed him meanwhile with this package: his whole files stay, this idle copy goes.
          const old = loaded.get(entry.id);
          if (old && old.pkg.entry.manifestSha256 === entry.manifestSha256) urls.forEach(url => URL.revokeObjectURL(url));
          else { old?.urls.forEach(url => URL.revokeObjectURL(url)); loaded.set(entry.id, { pkg, urls, pack: packOf(pkg, urls) }); }
        }
        return { ...entry, kind: "registered" as const };
      } catch { complete = false; return null; }
    }));
    const accepted = results.filter(entry => entry !== null);
    await loadCards(accepted);
    setRegisteredArenaRoster(withHeld(accepted));
    for (const [id, item] of loaded) if (!accepted.some(entry => entry.id === id) && !held.has(id)) {
      item.urls.forEach(url => URL.revokeObjectURL(url)); loaded.delete(id);
    }
    return complete;
  } catch { setRegisteredArenaRoster(withHeld([])); return false; }
}
/** The roster's entries and, after them, the cup's held fighters it did not bring (one off its window, or one it failed to read). */
function withHeld(accepted: readonly RegisteredArenaPlayable[]): RegisteredArenaPlayable[] {
  return [...accepted, ...[...held].flatMap(id => accepted.some(entry => entry.id === id) ? [] : heldEntries.get(id) ?? [])];
}

/**
 * The roster's approved front cards (선수 프로필 세트), each fetched once per picture and checked against its hash; one that fails leaves him on
 * his side pictures. Cards of fighters gone from the roster, or replaced by a newer set, are let go.
 */
async function loadCards(entries: readonly RegisteredFighterEntry[]): Promise<void> {
  const wanted = new Map(entries.flatMap(entry => entry.profileSet ? [[entry.id, entry.profileSet] as const] : []));
  await Promise.all([...wanted].map(([id, set]) => loadCard(id, set)));
  // A cup's held fighter keeps the card his own load brought (`loadRegisteredCupFighters`).
  for (const id of [...cards.keys()]) if (wanted.get(id)?.card.sha256 !== cards.get(id)?.sha256 && !held.has(id)) dropCard(id);
  setRegisteredArenaCards(new Map([...cards].map(([id, card]) => [id, card.art])));
}
/** His approved card, fetched once per picture and checked against its hash (none: he keeps his side pictures). */
async function loadCard(id: string, set: FighterProfileSet | undefined): Promise<void> {
  if (!set || cards.get(id)?.sha256 === set.card.sha256) return;
  try {
    const url = URL.createObjectURL(await fetchProfileImage(set.card));
    dropCard(id); cards.set(id, { sha256: set.card.sha256, art: cardArt(id, set, url) });
  } catch { /* he keeps his side pictures */ }
}
function cardArt(id: string, set: FighterProfileSet, path: string): ArenaConceptArt {
  return { key: `registered-${id}-card-${set.card.sha256.slice(0, 16)}`, path, width: set.card.width, height: set.card.height, face: { ...set.card.face } };
}
function dropCard(id: string): void {
  const card = cards.get(id);
  if (card) { URL.revokeObjectURL(card.art.path); cards.delete(id); }
}

/** Rechecks current approval before every entry, including cached packages and expired signed URLs. */
export function prepareRegisteredArenaFighter(id: string): Promise<void> {
  if (arenaPlayable(id)?.kind !== "registered") return Promise.resolve();
  const pending = preparing.get(id); if (pending) return pending;
  const request = prepare(id).finally(() => { preparing.delete(id); });
  preparing.set(id, request); return request;
}
/**
 * A cup corner's whole package (내 선수 출전): his own cup load first (`loadRegisteredCupFighters` — straight by id, not the roster), then the
 * approval checked again. The bracket takes 경기 시작 before the roster lands, and `prepareRegisteredArenaFighter` passes over an id the
 * roster does not hold yet — the bout then preloaded his idle-only pack and threw (2026-11-02, the live reload loop). One the server does not
 * hold cannot fight.
 */
export async function prepareRegisteredCupFighter(id: string): Promise<void> {
  await loadRegisteredCupFighter(id).catch(() => undefined);
  if (arenaPlayable(id)?.kind !== "registered") throw new Error("fighter-unavailable");
  await prepareRegisteredArenaFighter(id);
}
async function prepare(id: string): Promise<void> {
  const base = fighterApiBase(), item = loaded.get(id);
  if (!base || !item) throw new Error("fighter-unavailable");
  await fetchFiles(item, await fetchRegisteredPackage(base, item.pkg.entry));
}
/**
 * `pkg`'s files `item` lacks (of `only`, when given), `FILES_AT_ONCE` at a time (one after another, a fighter's 11 files took seconds); then
 * his pack on them.
 */
async function fetchFiles(item: LoadedFighter, pkg: RegisteredFighterPackage, only?: readonly string[]): Promise<void> {
  const missing = pkg.manifest.assets.filter(asset => !item.urls.has(asset.id) && (!only || only.includes(asset.id)));
  let next = 0;
  const lane = async () => {
    while (next < missing.length) {
      const asset = missing[next++]!, url = URL.createObjectURL(await fetchFighterAsset(pkg, asset.id));
      // Another lane (a retry's) took it first.
      if (item.urls.has(asset.id)) URL.revokeObjectURL(url); else item.urls.set(asset.id, url);
    }
  };
  await Promise.all(Array.from({ length: Math.min(FILES_AT_ONCE, missing.length) }, lane));
  item.pkg = pkg;
  item.pack = packOf(pkg, item.urls);
}

/**
 * The confirmed cup's own fighters (2026-11-02 사용자: "16강 대전을 확정지었으면 이들을 로딩해야 돼", "대기리스트는 천천히 로딩되더라도"):
 * each straight by id (the roster's off-window read, `fetchPublicFighterPackage`) with every file, one after another in `ids`' order (the next
 * bout's first), ahead of the roster — the waiting list may come in slowly. He joins the playable roster as soon as his package, his idle
 * and his approved card are in, as the roster stands a fighter (the cup's headless bouts fight on his package; the portraits preload his
 * idle), and `landed` is told so the screen draws his name and face; a roster refresh keeps him whole while the cup holds him: `ids` are the
 * ones held from now on (none once no cup is under way). Network only — his pictures are decoded by the bout that shows him. A fighter who
 * fails is left to the bout's own load (`prepareRegisteredCupFighter`), which says why.
 */
export async function loadRegisteredCupFighters(ids: readonly string[], landed: ((id: string) => void) | null = null): Promise<void> {
  held = new Set(ids); cupLanded = landed;
  for (const id of heldEntries.keys()) if (!held.has(id)) heldEntries.delete(id);
  const base = fighterApiBase();
  if (!base) return;
  for (const id of ids) await cupLoad(base, id).catch(() => undefined);
}
/** One cup fighter's load (`loadRegisteredCupFighters`' — started now when it is not under way); rejects when he could not come in. */
export function loadRegisteredCupFighter(id: string): Promise<void> {
  const base = fighterApiBase();
  return base ? cupLoad(base, id) : Promise.resolve();
}
function cupLoad(base: string, id: string): Promise<void> {
  const running = cupLoads.get(id);
  if (running) return running;
  const load = loadCupFighter(base, id).finally(() => { if (cupLoads.get(id) === load) cupLoads.delete(id); });
  cupLoads.set(id, load);
  return load;
}
async function loadCupFighter(base: string, id: string): Promise<void> {
  const known = arenaPlayable(id);
  if (known?.kind === "registered" && loaded.has(id)) {
    if (held.has(id)) heldEntries.set(id, known);
    // On the roster: whole already, or with its idle alone — the rest of his files (his approval read again, as before a bout).
    if (!registeredArenaFighterReady(id)) await prepareRegisteredArenaFighter(id);
    return;
  }
  const pkg = await fetchPublicFighterPackage(base, id);
  // The roster landed him meanwhile with this package: his idle stays and the rest comes in on it.
  let item = loaded.get(id);
  if (!item || item.pkg.entry.manifestSha256 !== pkg.entry.manifestSha256) {
    item?.urls.forEach(url => URL.revokeObjectURL(url));
    const urls = new Map<string, string>();
    item = { pkg, urls, pack: packOf(pkg, urls) };
    loaded.set(id, item);
  }
  await Promise.all([fetchFiles(item, pkg, [pkg.manifest.clips.idle.assetId]), loadCard(id, pkg.entry.profileSet)]);
  setRegisteredArenaCards(new Map([...cards].map(([cardId, card]) => [cardId, card.art])));
  const entry: RegisteredArenaPlayable = { ...pkg.entry, duelApproved: pkg.duelApproved, kind: "registered" };
  if (held.has(id)) heldEntries.set(id, entry);
  if (arenaPlayable(id)?.kind !== "registered") addRegisteredArenaFighters([entry]);
  cupLanded?.(id);
  await fetchFiles(item, pkg);
}
