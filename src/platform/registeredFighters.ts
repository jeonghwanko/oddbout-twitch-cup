import { edgeFetch } from "./edgePacer";
import type { FighterManifest } from "./FighterManifest";
import { parseUtf8Json, readBoundedBody } from "./boundedResponse";
import { parseFighterNames, type FighterNames } from "./fighterNames";
import { fighterApiLiveBase } from "./fighterApiBase";

export type { FighterManifest } from "./FighterManifest";
/**
 * `madeWith` (2026-10-27, 3단계): the agent that made him — the OAuth client named on his earliest cloud MCP submission, as it named itself
 * (`GET /roster`); absent for a fighter made on the creator page or with the kit.
 */
export interface RegisteredFighterEntry { readonly id: string; readonly name: string; readonly names?: FighterNames; readonly manifestSha256: string; readonly duelApproved?: boolean;
  readonly madeWith?: string; readonly profileSet?: FighterProfileSet }
/** A picture of a profile set: its public address and the content hash that address names. */
export interface ProfileSetImage { readonly url: string; readonly sha256: string }
/**
 * His approved profile set (선수 프로필 세트, 2026-10-31 — `docs/Plan/2026-10-31-oddbout-profile-set`): his front card (the figure cut to 600 px
 * high, with its face square in card px) and his round face (`size` px square). Both lie in the API project's public bucket at a content-hash
 * path. Absent until an operator approves one; a malformed one is left out and he keeps his side pictures.
 */
export interface FighterProfileSet {
  readonly id: string;
  readonly card: ProfileSetImage & { readonly width: number; readonly height: number; readonly face: { readonly x: number; readonly y: number; readonly side: number } };
  readonly face: ProfileSetImage & { readonly size: number };
}
/**
 * `duelApproved`: he may meet other people — ranked duels, cups, the pick screens. Since 출전 (2026-10-30) that is also his owner's entry:
 * the API's `entered` (absent from an API before it, which entered every fighter). One in production (`entered: false`) is served by his
 * address for his owner's previews and practice only.
 */
export interface RegisteredFighterPackage {
  readonly entry: RegisteredFighterEntry;
  readonly manifest: FighterManifest;
  readonly files: ReadonlyMap<string, string>;
  readonly duelApproved: boolean;
  readonly entered: boolean;
}
export interface VerifiedFighterPackage extends RegisteredFighterPackage { readonly manifestText: string }
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
export const ARENA_RUNTIME_SCOPE = "arena-player-v1";
/** A profile set's public picture: `af-profile-sets/<fighter>/<sha256>.webp` (the server copies an approved set there). */
const PROFILE_SET_PATH = /^\/storage\/v1\/object\/public\/af-profile-sets\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\/([a-f0-9]{64})\.webp$/;
/** The largest profile picture the client takes (the card is 600 px high; the face 192 px). */
const PROFILE_IMAGE_BYTES = 2 * 1024 * 1024;

/**
 * 제작 규격 검사기(JSON Schema·ajv, 압축 전 약 160 KB)는 패키지를 검사할 때 불러온다. 무투장 고르기 화면의 첫 그림은 이것을 기다리지 않는다 —
 * 선수 목록 요청 뒤 패키지를 받을 때 함께 받는다(2026-10-30).
 */
const fighterContract = () => import("../../contracts/ai-fighter/validate.mjs");

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid-fighter-response");
  return value as Record<string, unknown>;
}
export { fighterApiBase, fighterApiLiveBase, fighterApiLocalStage } from "./fighterApiBase";
async function bounded(response: Response, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  if (!response.ok || Number(response.headers.get("content-length")) > limit) throw new Error("fighter-download-failed");
  return readBoundedBody(response, limit, { missing: "fighter-empty-response", tooLong: "fighter-response-limit" });
}
const fetchOptions = (signal?: AbortSignal): RequestInit => ({ redirect: "error", credentials: "omit",
  signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000) });
async function json(url: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
  // An Edge read (`edgeFetch`): a 429 or no answer is named so the creator page's pacer retries it; every caller here catches either way.
  return record(parseUtf8Json(await bounded(await edgeFetch(url, fetchOptions(signal)), 524288)));
}
/** The project whose public bucket may serve profile pictures: the API's own, or the live API's on the local stage (which forwards its reads). */
function profileOrigins(base: string): Set<string> {
  const live = fighterApiLiveBase();
  return new Set([new URL(base).origin, ...(live ? [new URL(live).origin] : [])]);
}
function profileImage(value: unknown, origins: ReadonlySet<string>, fighterId: string): ProfileSetImage | null {
  if (typeof value !== "string") return null;
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  const match = PROFILE_SET_PATH.exec(url.pathname);
  if (!match || !origins.has(url.origin) || url.search || url.hash || match[1] !== fighterId) return null;
  return { url: url.href, sha256: match[2]! };
}
const whole = (value: unknown, min: number, max: number): value is number => Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
/** `fighterId`'s profile set as the roster states it, or undefined when absent or malformed (he keeps his side pictures). */
export function parseProfileSet(value: unknown, base: string, fighterId: string): FighterProfileSet | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>, origins = profileOrigins(base);
  const card = row.card && typeof row.card === "object" ? row.card as Record<string, unknown> : null;
  const face = row.face && typeof row.face === "object" ? row.face as Record<string, unknown> : null;
  const box = card?.face && typeof card.face === "object" ? card.face as Record<string, unknown> : null;
  if (typeof row.id !== "string" || !UUID.test(row.id) || !card || !face || !box) return undefined;
  const cardImage = profileImage(card.url, origins, fighterId), faceImage = profileImage(face.url, origins, fighterId);
  const { width, height } = card, { x, y, side } = box;
  if (!cardImage || !faceImage || !whole(width, 16, 2048) || !whole(height, 16, 2048) || !whole(side, 8, 2048) || !whole(x, 0, 2048) || !whole(y, 0, 2048)
    || x + side > width || y + side > height || !whole(face.size, 16, 512)) return undefined;
  return { id: row.id, card: { ...cardImage, width, height, face: { x, y, side } }, face: { ...faceImage, size: face.size } };
}
/** A profile picture's bytes, checked against the hash its address names. */
export async function fetchProfileImage(image: ProfileSetImage, signal?: AbortSignal): Promise<Blob> {
  const bytes = await bounded(await fetch(image.url, fetchOptions(signal)), PROFILE_IMAGE_BYTES);
  if (await fighterSha256(bytes) !== image.sha256) throw new Error("profile-image-hash");
  return new Blob([bytes], { type: "image/webp" });
}
export async function fighterSha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b => b.toString(16).padStart(2, "0")).join("");
}
/** The arena loads a bounded window of image packs; the homepage fetches metadata separately. */
export async function fetchRegisteredFighters(base: string, signal?: AbortSignal): Promise<RegisteredFighterEntry[]> {
  return parseRoster(await json(`${base}/roster`, signal), base);
}
/** Stable cursors survive inserts/removals while paging. Bound the entire metadata refresh, not each page alone. */
export async function fetchCommunityFighters(base: string, signal?: AbortSignal): Promise<RegisteredFighterEntry[]> {
  const entries = new Map<string, RegisteredFighterEntry>(), cursors = new Set<string>();
  const timeout = AbortSignal.timeout(20_000), requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let cursor: string | null = null;
  for (;;) {
    requestSignal.throwIfAborted();
    const response = await json(`${base}/roster${cursor ? `?after=${encodeURIComponent(cursor)}` : ""}`, requestSignal);
    for (const entry of parseRoster(response, base)) entries.set(entry.id, entry);
    if (response.hasMore !== true) return [...entries.values()];
    if (typeof response.nextCursor !== "string" || !response.nextCursor || response.nextCursor.length > 100 || cursors.has(response.nextCursor)) throw new Error("invalid-fighter-cursor");
    cursor = response.nextCursor; cursors.add(cursor);
  }
}
function parseRoster(response: Record<string, unknown>, base: string): RegisteredFighterEntry[] {
  if (response.ok !== true || !Array.isArray(response.fighters) || response.fighters.length > 20) throw new Error("invalid-fighter-roster");
  const seen = new Set<string>();
  return response.fighters.map(value => {
    const row = record(value);
    if (typeof row.id !== "string" || !UUID.test(row.id) || seen.has(row.id) || typeof row.name !== "string" || row.name.length > 48
      || typeof row.manifestSha256 !== "string" || !HASH.test(row.manifestSha256) || row.runtimeScope !== ARENA_RUNTIME_SCOPE) throw new Error("invalid-fighter-entry");
    seen.add(row.id);
    const names = parseFighterNames(row.names);
    // A self-named client: plain text, at most 40 characters, or nothing.
    const madeWith = typeof row.madeWith === "string" && /^[^\u0000-\u001f\u007f]{1,40}$/.test(row.madeWith) ? row.madeWith.trim() : "";
    const profileSet = parseProfileSet(row.profileSet, base, row.id);
    return { id: row.id, name: row.name, ...(names ? { names } : {}), manifestSha256: row.manifestSha256, duelApproved: row.duelApproved === true && row.entered !== false,
      ...(madeWith ? { madeWith } : {}), ...(profileSet ? { profileSet } : {}) };
  });
}
export async function fetchRegisteredPackage(base: string, entry: RegisteredFighterEntry, signal?: AbortSignal): Promise<VerifiedFighterPackage> {
  const response = await json(`${base}/roster/${entry.id}`, signal);
  return verifyRegisteredPackage(base, entry, response);
}
/** Public profile lookup by ID; independent of the roster's top-20 window. */
export async function fetchPublicFighterPackage(base: string, id: string, signal?: AbortSignal): Promise<VerifiedFighterPackage> {
  if (!UUID.test(id)) throw new Error("invalid-fighter-entry");
  const response = await json(`${base}/roster/${id}`, signal);
  if (typeof response.manifestSha256 !== "string" || !HASH.test(response.manifestSha256) || typeof response.manifestText !== "string") throw new Error("invalid-fighter-response");
  const { parseFighterJson } = await fighterContract();
  const parsed = parseFighterJson(response.manifestText);
  const name = parsed.ok ? (parsed.data as FighterManifest)?.profile?.name : undefined;
  if (typeof name !== "string" || name.length > 48) throw new Error("invalid-fighter-manifest");
  const names = parsed.ok ? parseFighterNames((parsed.data as { profile?: { names?: unknown } })?.profile?.names) : undefined;
  const profileSet = parseProfileSet(response.profileSet, base, id);
  return verifyRegisteredPackage(base, { id, name, ...(names ? { names } : {}), manifestSha256: response.manifestSha256, ...(profileSet ? { profileSet } : {}) }, response);
}
async function verifyRegisteredPackage(base: string, entry: RegisteredFighterEntry, response: Record<string, unknown>): Promise<VerifiedFighterPackage> {
  if (response.ok !== true || response.fighterId !== entry.id || response.manifestSha256 !== entry.manifestSha256
    || response.runtimeApproved !== true || response.runtimeScope !== ARENA_RUNTIME_SCOPE || typeof response.manifestText !== "string"
    || !Array.isArray(response.files)) throw new Error("fighter-not-approved");
  if (await fighterSha256(new TextEncoder().encode(response.manifestText)) !== entry.manifestSha256) throw new Error("fighter-manifest-hash");
  const { parseFighterJson, validateFighter } = await fighterContract();
  const parsed = parseFighterJson(response.manifestText);
  if (!parsed.ok || !validateFighter(parsed.data).ok) throw new Error("invalid-fighter-manifest");
  const manifest = parsed.data as FighterManifest;
  if (manifest.profile.name !== entry.name || response.files.length !== manifest.assets.length) throw new Error("fighter-identity-mismatch");
  const files = new Map<string, string>();
  for (const value of response.files) {
    const file = record(value);
    if (typeof file.id !== "string" || typeof file.downloadUrl !== "string" || files.has(file.id)
      || !manifest.assets.some(asset => asset.id === file.id)) throw new Error("invalid-fighter-file");
    const url = new URL(file.downloadUrl);
    if (url.origin !== new URL(base).origin || !url.pathname.startsWith("/storage/v1/object/sign/ai-fighter-beta/")) throw new Error("invalid-fighter-origin");
    files.set(file.id, url.href);
  }
  const entered = response.entered !== false;
  return { entry, manifest, manifestText: response.manifestText, files, duelApproved: response.duelApproved === true && entered, entered };
}
export async function fetchFighterAsset(pkg: RegisteredFighterPackage, assetId: string, signal?: AbortSignal): Promise<Blob> {
  const asset = pkg.manifest.assets.find(item => item.id === assetId), url = pkg.files.get(assetId);
  if (!asset || !url) throw new Error("missing-fighter-file");
  const bytes = await bounded(await fetch(url, fetchOptions(signal)), asset.bytes);
  if (bytes.length !== asset.bytes || await fighterSha256(bytes) !== asset.sha256) throw new Error("fighter-asset-hash");
  return new Blob([bytes], { type: "image/webp" });
}
