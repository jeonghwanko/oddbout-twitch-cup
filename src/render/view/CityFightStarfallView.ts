import type Phaser from "phaser";
import { clamp01 } from "../../sim/geom";
import { cityFightFollowUpById } from "../../sim/cityFight/CityFightAwakening";
import { geometryMask } from "../art/GeometryMask";
import { easeInCubic, easeOutCubic } from "../art/easing";
import { FONT, PALETTE, TITLE_OPENING_COLORS, cssHex } from "../art/palette";
import { VILLAGE_DEPTHS } from "../depths";
import type { NativeCityBackdropFrame } from "../effects/NativeCityScreenGrade";
import { cityFightBodyBox, cityFightCoveredAlpha, cityFightLightTexture, type CityFightLightBox, type CityFightLightCover } from "./CityFightLightKit";
import { CITY_FIGHT_AWAKENING_READABLE, type CityFightAwakeningReadableStage } from "./CityFightAwakeningMotifView";


export const CITY_FIGHT_STARFALL = Object.freeze({
  night: { inMs: 140, missMs: 2000, outMs: 500 },
  /**
   * His super's start: a flare over `ms` — `rays` light rays out to `rayBodies` of his height, a ring out to `ringBodies` over `ringMs`, a
   * soft glow at most `glowAlpha`. It rises `forward` of his height in front of his chest toward his opponent (2026-10-23 arena audit, b01
   * #1733–1755: on his chest it whited him out — a 560 px ring for 370 ms), its white heart only `coreMs` at most `coreBodies` across (0.6
   * of his torso), its tinted flare at most `flareAlpha` (it lies over his body).
   */
  charge: { ms: 520, rays: 12, rayBodies: 1.4, flareBodies: 1.8, glowBodies: 2, glowAlpha: 0.45, flareAlpha: 0.45, forward: 0.24,
    coreMs: 34, coreBodies: 0.15, ringBodies: 0.7, ringMs: 300 },
  /** His kick's contact: a light crescent `arcBodies` of his height round it swept over `sweepMs`, a flare, `glints` thrown out, over `ms`. */
  kick: { ms: 420, sweepMs: 80, arcBodies: 0.6, flareBodies: 1.5, glints: 8 },
  /** 0. The shaft: from `fromMs` after the super's start it reaches down over `reachMs`, `slant` view heights off vertical at the top. */
  beam: { fromMs: 690, reachMs: 110, slant: 0.06, corePx: 3, glowPx: 16 },
  /**
   * 1. The cut, on the follow-up's fight clock: from `atMs` after the kick, drawn across `reachViews` of the view each side of him over
   * `drawMs`, `angleDeg` off level; a glass tick every `tickPx` screen px.
   */
  slash: { atMs: 20, drawMs: 70, reachViews: 0.85, angleDeg: 22, corePx: 2, glowPx: 9, tickPx: 38 },
  /** 2. Its light: from the cut's end, swelling over `swellMs` and easing out over `holdMs` (fight ms); `motes` rising off it. */
  glow: { swellMs: 90, holdMs: 140, motes: 20 },
  /**
   * 3. The split, fight ms before the slam: the rift opens `openBeforeMs` ahead over `openMs`, `widthViews` of the view's height wide, and
   * closes over `closeMs` (screen) from the slam; `shards` fly off its edges; the camera jolts (`shakePx`, `shakeMs`). The card falls the
   * last `fallMs` before the slam.
   */
  rift: { openBeforeMs: 110, openMs: 70, widthViews: 0.05, closeMs: 160, shards: 16, shardMs: 360, shakePx: 10, shakeMs: 170, fallMs: 110 },
  /** 4. The impact frames from the slam (screen, inside its freeze): `frames` of `frameMs`; the clock ring by frame, `spikes`, `ticks`. */
  impact: { frames: 3, frameMs: 50, ringViews: [0.24, 0.34, 0.38] as readonly number[], spikes: 26, ticks: 60 },
  /**
   * The card: `heightBodies` of his height (at most `maxViews` of the view), its blade tip `sink` of it under his feet, tilted `tiltDeg`,
   * out of cream over `revealMs`, settling; its shine sweeps across over `shineMs` from `shineFromMs` after it lands.
   */
  card: { heightBodies: 1.25, maxViews: 0.42, sink: 0.14, tiltDeg: -9, revealMs: 110, settle: 0.06, settleMs: 160, shineFromMs: 40, shineMs: 320,
    /** Its spin as it falls: `turns` half turns on its long axis (back, face, back …), landing face out. */
    spinHalfTurns: 5,

    awayWidths: 0.38 },
  /** 4. The burst once colour is back: a hot flash, the ground shockwave, sharp rays, glass glints. */
  burst: { flashBodies: 2.2, flashMs: 220, waveViews: 0.55, waveMs: 360, rays: 14, rayBodies: 1.7, rayMs: 240, shards: 18, shardMs: 650 },
  /** The clock ring round the card, its arcs closing in over the ground, the light column on him. */
  ring: { fromViews: 0.3, toViews: 0.36, ringMs: 560, ticks: 60, major: 5, arcs: 4, arcFrom: 0.34, arcTo: 0.1, arcMs: 620, columnBodies: 1.1,
    columnMs: 700 },
  /** The mist rolled out along the ground from the card's foot, gone over `outMs` once the card breaks. */
  mist: { puffs: 18, spreadViews: 0.42, growMs: 520, sizeBodies: 0.7, driftViewsPerSec: 0.025, outMs: 480 },
  /**
   * 5. The shatter, screen ms after colour is back: cracks run over the card from `crackMs` over `crackGrowMs`; at `breakMs` it breaks into
   * its shards (`CARD_SHARDS`) flung out `flingCards` of its height over `flingMs`, which swirl in onto him over `homeMs` (each up to
   * `staggerMs` late) from `orbitBodies` of his height round to `wrapBodies`, `turnsPerSec` round him.
   */
  shatter: { crackMs: 120, crackGrowMs: 100, breakMs: 230, flingCards: 0.55, flingMs: 120, homeMs: 180, staggerMs: 80,
    orbitBodies: 1.2, wrapBodies: 0.36, turnsPerSec: 1.6 },
  /** 6. A shard's blow on him: a flare `sparkMs` long, `sparkBodies` of his height, a ring of light out to `ringBodies` (his flash is the hit's). */
  hits: { sparkMs: 210, sparkBodies: 0.6, ringBodies: 0.7 },
  /**
   * 7. The finale's card: falling spinning over `fallMs` (screen, inside the blow's freeze), `heightBodies` of his height (at most
   * `maxViews` of the view), its foot `sink` of it into the ground, tilted `tiltDeg`, out of cream over `revealMs`; its burst — a flare
   * `flareBodies` across, a ring of light out to `waveViews` over `waveMs`, `rays` rays `rayBodies` long over `rayMs`; it stands `holdMs`
   * from the blow before the fade. In the fade it turns edge-on by `spinOut` of the fade (the way it came in), is a line of light that
   * thins away by `goneOut`, `motes` glints rising off it — gone while the night still stands (never a see-through card over the day).
   */
  finale: { fallMs: 100, heightBodies: 0.95, maxViews: 0.34, sink: 0.12, tiltDeg: 11, revealMs: 80, flareBodies: 1.8, waveViews: 0.32, waveMs: 320,
    rays: 10, rayBodies: 1.1, rayMs: 220, holdMs: 560, spinOut: 0.26, goneOut: 0.6, motes: 16 },
  /** 8. The fade: `afterLastMs` after the last blow the light swells off him to `bodies` of his height over `ms`, the night going with it. */
  fade: { afterLastMs: 140, cutShortMs: 360, noFollowUpMs: 300, ms: 650, bodies: 5, motes: 14 },
  /**
   * The framing: as the cut starts the camera leans toward him (`cue("lead")`) — enough that he stands within `keepViews` of the view's
   * width from its middle — easing in over `inMs` and back over `outMs`.
   */
  lead: { keepViews: 0.12, inMs: 240, outMs: 2000 },
});

/** A body on screen for the starfall (world px): its middle x, its feet y, its height. */
export interface CityFightStarfallBody { readonly x: number; readonly y: number; readonly h: number }

/** The camera beats the fight's presenter plays (render only): `lead` (the lean, CSS px — signed along x), `split` (the rift's jolt). */
export type CityFightStarfallCue = "lead" | "split";

const F = CITY_FIGHT_STARFALL;
/** The rules' follow-up: when its slam lands (fight ms after the kick), how many shards. */
/** Its rules' follow-up (`CityFightAwakening` `starfall`): the card's slam (the launch), the spike (the last shard), the last card (the down beat). */
const SF = cityFightFollowUpById("starfall");
const SLAM_BEAT = SF?.beats.findIndex(beat => beat.kind === "launch") ?? 0;
const SLAM_AT = SF?.beats[SLAM_BEAT]?.atMs ?? 0;
const SHARDS = SF?.beats.findIndex(beat => beat.kind === "spike") ?? 0;
const FINALE = SF?.beats.findIndex(beat => beat.kind === "down") ?? SHARDS + 1;
/** Screen ms from the slam: colour back (the impact frames' end), the card breaking. */
const COLOUR_AT = F.impact.frames * F.impact.frameMs;
const BREAK_AT = COLOUR_AT + F.shatter.breakMs;
/** Under reduced motion: the card stands this long from the slam before the fade. */
const REDUCED_HOLD_MS = 900;

/** The layers, back to front: rings, pieces behind him, card, its cream, the fighters, mist, the front pieces and light, the sparks. */
const BACK_DEPTH = VILLAGE_DEPTHS.fightSuperProp;
const CARD_DEPTH = BACK_DEPTH + 0.01;
const CARD_CREAM_DEPTH = BACK_DEPTH + 0.011;
const CARD_LIGHT_DEPTH = CARD_DEPTH + 0.002;
const CARD_DETAIL_DEPTH = CARD_DEPTH + 0.004;
const INDEX_DEPTH = CARD_DEPTH + 0.005;
const CARD_CREAM_OVER_DEPTH = CARD_DEPTH + 0.006;
const PIECE_BACK_DEPTH = BACK_DEPTH + 0.012;
const FRONT_BODY_DEPTH = BACK_DEPTH + 0.015;
const MIST_DEPTH = BACK_DEPTH + 0.02;
const FRONT_DEPTH = BACK_DEPTH + 0.03;
const SPARK_DEPTH = BACK_DEPTH + 0.04;
const PLATE_DEPTH = VILLAGE_DEPTHS.fightSuperStage;
const PLATE_BODY_DEPTH = PLATE_DEPTH + 0.001;
const PLATE_LINE_DEPTH = PLATE_DEPTH + 0.002;

/** The corner index's drawn size (scaled to the card). */
const INDEX_FONT_PX = 96;
/** The light pools (added light): behind the card, over everything. */
const BACK_LIGHTS = 24;
const LIGHTS = 120;
const CARD_LIGHTS = 32;
/** The shards' texture: the card as it stood, drawn once as it breaks (a new key each time — the last one is let go). */
const SNAP_KEY = "city-fight-starfall-card-snap";
type LightKind = "ray" | "streak" | "flare";

/** A deterministic 0..1 per piece. */
const jitter = (i: number, salt: number) => ((i * 7919 + salt * 104729) % 1000 + 1000) % 1000 / 1000;
const bell = (k: number) => Math.sin(Math.PI * clamp01(k));
type Point = { readonly x: number; readonly y: number };
type Cut = { readonly at: Point; readonly dir: Point; readonly half: number };

/** A playing card's proportions (width over height, 2.5 : 3.5) and its corner radius (of its width). */
const CARD_ASPECT = 2.5 / 3.5;
const CARD_RADIUS = 0.075;
/** A rounded rectangle in card space (`u` across −0.5..0.5 of its width, `v` up from its foot 0..1 of its height), `half` wide. */
function cardRoundRect(half: number, v0: number, v1: number, ru: number, rv: number, steps = 4): [number, number][] {
  const points: [number, number][] = [];
  const corners: [number, number, number][] = [[half - ru, v1 - rv, 0], [-half + ru, v1 - rv, Math.PI / 2], [-half + ru, v0 + rv, Math.PI],
    [half - ru, v0 + rv, Math.PI * 1.5]];
  for (const [cu, cv, a0] of corners) {
    for (let k = 0; k <= steps; k++) { const a = a0 + (k / steps) * Math.PI / 2; points.push([cu + Math.cos(a) * ru, cv + Math.sin(a) * rv]); }
  }
  return points;
}
/** Its outline (card space). */
const CARD_OUTLINE = cardRoundRect(0.5, 0, 1, CARD_RADIUS, CARD_RADIUS * CARD_ASPECT);
/** Its middle (the ace pip). */
const CARD_MID = [0, 0.5] as const;
/**
 * Its shards: triangles from a point near its middle to `count` points along its edge, each slice split once more across — two rings of
 * triangles (card space).
 */
const CARD_SHARDS: readonly (readonly (readonly [number, number])[])[] = (() => {
  const count = 12, edge: [number, number][] = [], lengths: number[] = [0], n = CARD_OUTLINE.length;
  for (let i = 0; i < n; i++) {
    const [u0, v0] = CARD_OUTLINE[i]!, [u1, v1] = CARD_OUTLINE[(i + 1) % n]!;
    lengths.push(lengths[i]! + Math.hypot((u1 - u0) * CARD_ASPECT, v1 - v0));
  }
  const total = lengths[n]!;
  for (let k = 0; k < count; k++) {
    const at = (k + 0.37) / count * total;
    let i = 0;
    while (lengths[i + 1]! < at) i++;
    const t = (at - lengths[i]!) / Math.max(1e-9, lengths[i + 1]! - lengths[i]!), [u0, v0] = CARD_OUTLINE[i]!, [u1, v1] = CARD_OUTLINE[(i + 1) % n]!;
    edge.push([u0 + (u1 - u0) * t, v0 + (v1 - v0) * t]);
  }
  const mid: [number, number] = [0.04, 0.52], shards: [number, number][][] = [];
  const along = (a: readonly [number, number], b: readonly [number, number], t: number): [number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  for (let k = 0; k < count; k++) {
    const a = edge[k]!, b = edge[(k + 1) % count]!, ia = along(mid, a, 0.45 + 0.15 * ((k * 7) % 3) / 2), ib = along(mid, b, 0.5);
    shards.push([mid, ia, ib], [ia, a, b], [ia, b, ib]);
  }
  return shards;
})();
/** The card on screen: its foot's middle at (x, footY), `w` × `h`, tilted `tilt`, turned on its long axis `turn` (cos — below 0 its back). */
interface CardPose { readonly x: number; readonly footY: number; readonly w: number; readonly h: number; readonly tilt: number; readonly turn: number }

interface Run {
  /** Screen ms since the super started; since its kick landed (null: not yet); since the slam (null: not yet); since the fade began. */
  ms: number;
  sinceHit: number | null;
  sinceSlam: number | null;
  fadeMs: number | null;
  readonly reduced: boolean;
  readonly target: () => CityFightStarfallBody | null;
  readonly cue: (cue: CityFightStarfallCue, value?: number) => void;
  /** The rules' follow-up clock (fight ms since the kick), null when there is none (yet / any more). */
  readonly progress: () => number | null;
  /** Fight ms until the last card's blow on him lying (null: not waiting for it) — its fall starts so that it lands on the blow. */
  readonly finaleIn: () => number | null;
  /** Its last reading (the fight clock stops in the freezes; the follow-up's end clears it). */
  lastProgress: number;
  /** Where the kick landed (the fallback body), the cut, where the card fell on him and its height then. */
  contact: Point | null;
  cut: Cut | null;
  hit: CityFightStarfallBody | null;
  cardH: number;
  /** The shards' blows seen so far (beat k at screen age), the last beat seen, screen ms since it. */
  readonly shards: { readonly beat: number; ageMs: number }[];
  lastBeat: number;
  sinceBeat: number;
  /** The camera beats already played (each once). */
  readonly played: Set<CityFightStarfallCue>;
  /** The finale: screen ms since its card started falling (its blow lands at `finale.fallMs`; null: not yet) and where he lay. */
  finaleMs: number | null;
  finaleAt: CityFightStarfallBody | null;
  /** His chest as the super started (its flare), the kick's contact (its crescent; null before it). */
  chest: (Point & { readonly h: number }) | null;
  kickAt: (Point & { readonly h: number }) | null;
}

export class CityFightStarfallView {
  private run: Run | null = null;
  private readonly back: Phaser.GameObjects.Graphics;
  /**
   * The card drawn in code, back to front: its glass (`cardG`), the light inside it (`cardLights` — nebula, stars, the ace's glow), its
   * details (`cardDetail` — frame, sunburst, the ace), its indexes, its cream (`cardCreamG`), its edge glow (`cardGlow` — added light); its
   * shards on either side of him.
   */
  private readonly cardG: Phaser.GameObjects.Graphics;
  private readonly cardDetail: Phaser.GameObjects.Graphics;
  private readonly cardCreamG: Phaser.GameObjects.Graphics;
  private readonly cardLights: Phaser.GameObjects.Image[] = [];
  private cardUsed = 0;
  /** Screen ms of the run (the card's twinkle and breath). */
  private clockMs = 0;
  private readonly cardGlow: Phaser.GameObjects.Graphics;
  private readonly shardBack: Phaser.GameObjects.Graphics;
  private readonly shardFront: Phaser.GameObjects.Graphics;
  /** The shards as pieces of the card itself: each an image of its snapshot clipped to its triangle (`shardClips`). */
  private readonly shardImages: Phaser.GameObjects.Image[] = [];
  private readonly shardClips: Phaser.GameObjects.Graphics[] = [];
  private snap: { readonly rt: Phaser.GameObjects.RenderTexture; readonly key: string; readonly bx: number; readonly by: number;
    readonly zoom: number; readonly w: number; readonly h: number } | null = null;
  private snaps = 0;
  /** Its corner indexes ("A", top left and bottom right — text, so the letter stays crisp). */
  private readonly indexes: Phaser.GameObjects.Text[] = [];
  private readonly fronts: Phaser.GameObjects.Image[] = [];
  private readonly puffs: Phaser.GameObjects.Image[] = [];
  private readonly front: Phaser.GameObjects.Graphics;
  private readonly bloom: Phaser.GameObjects.Image;
  private readonly sparks: Phaser.GameObjects.Graphics;
  private readonly plate: Phaser.GameObjects.Graphics;
  private readonly silhouettes: Phaser.GameObjects.Image[] = [];
  private readonly plateLines: Phaser.GameObjects.Graphics;
  private readonly backLights: Phaser.GameObjects.Image[] = [];
  private readonly lights: Phaser.GameObjects.Image[] = [];
  private backUsed = 0;
  private used = 0;
  /** The readable stage's dimming of the light over both bodies this frame (`CITY_FIGHT_AWAKENING_READABLE`), else null. */
  private cover: CityFightLightCover | null = null;

  /**
   * `actors`: the two fighters' sprites (the caster's, the struck's — `CityFightAwakeningStages` orders them) — drawn again over the card and
   * as the impact frames' silhouettes;
   * `worldPxPerScreenPx`: world px per CSS px (the camera lean's unit).
   */
  constructor(private readonly scene: Phaser.Scene, private readonly camera: () => Phaser.Cameras.Scene2D.Camera,
    private readonly actors: () => readonly (Phaser.GameObjects.Sprite | null | undefined)[], private readonly worldPxPerScreenPx: () => number,
    private readonly readable: CityFightAwakeningReadableStage | null = null) {
    const image = (depth: number, name: string) => scene.add.image(0, 0, "__DEFAULT").setDepth(depth).setName(name).setVisible(false);
    const graphics = (depth: number, name: string) => scene.add.graphics().setDepth(depth).setName(name).setVisible(false);
    // The readable stage (the arena's AI duel, 2026-10-23 audit): its rings and column behind both fighters, not over them.
    const back = readable ? readable.behindDepth : BACK_DEPTH, backLight = back + 0.001;
    this.back = graphics(back, "city-fight-starfall-back");
    this.cardG = graphics(CARD_DEPTH, "city-fight-starfall-card");
    this.cardDetail = graphics(CARD_DETAIL_DEPTH, "city-fight-starfall-card-detail");
    this.cardCreamG = graphics(CARD_CREAM_OVER_DEPTH, "city-fight-starfall-card-cream");
    for (let i = 0; i < CARD_LIGHTS; i++) this.cardLights.push(image(CARD_LIGHT_DEPTH, "city-fight-starfall-card-light").setBlendMode("ADD"));
    this.cardGlow = graphics(CARD_CREAM_DEPTH, "city-fight-starfall-card-glow").setBlendMode("ADD");
    this.shardBack = graphics(PIECE_BACK_DEPTH, "city-fight-starfall-shards-back");
    this.shardFront = graphics(FRONT_DEPTH, "city-fight-starfall-shards").setBlendMode("ADD");
    for (let i = 0; i < CARD_SHARDS.length; i++) {
      const clip = scene.make.graphics({}, false);
      this.shardClips.push(clip);
      this.shardImages.push(image(FRONT_DEPTH, "city-fight-starfall-shard").setMask(geometryMask(clip)));
    }
    for (let i = 0; i < 2; i++) {
      this.indexes.push(scene.add.text(0, 0, "A", { fontFamily: FONT.serifLatin, fontSize: `${INDEX_FONT_PX}px`, fontStyle: "bold",
        color: cssHex(PALETTE.fxWarmGold) }).setOrigin(0.5).setDepth(INDEX_DEPTH).setName("city-fight-starfall-card-index").setVisible(false));
    }
    for (let i = 0; i < 2; i++) this.fronts.push(image(FRONT_BODY_DEPTH, "city-fight-starfall-front-body"));
    for (let i = 0; i < F.mist.puffs; i++) this.puffs.push(image(MIST_DEPTH, "city-fight-starfall-mist"));
    this.front = graphics(FRONT_DEPTH, "city-fight-starfall-front");
    this.bloom = image(FRONT_DEPTH, "city-fight-starfall-bloom").setBlendMode("ADD");
    this.sparks = graphics(SPARK_DEPTH, "city-fight-starfall-sparks");
    this.plate = graphics(PLATE_DEPTH, "city-fight-starfall-plate");
    for (let i = 0; i < 2; i++) this.silhouettes.push(image(PLATE_BODY_DEPTH, "city-fight-starfall-silhouette"));
    this.plateLines = graphics(PLATE_LINE_DEPTH, "city-fight-starfall-plate-lines");
    // Light is added, never painted: the rings, the column, the cut, the burst and the sparks.
    for (const g of [this.back, this.front, this.sparks]) g.setBlendMode("ADD");
    for (let i = 0; i < BACK_LIGHTS; i++) this.backLights.push(image(backLight, "city-fight-starfall-back-light").setBlendMode("ADD"));
    for (let i = 0; i < LIGHTS; i++) this.lights.push(image(SPARK_DEPTH + 0.001, "city-fight-starfall-light").setBlendMode("ADD"));
  }

  get active(): boolean { return this.run !== null; }

  /**
   * His super starts: `target` — the body it is thrown at (read live); `cue` — the camera beats; `progress` — the rules' follow-up clock
   * (fight ms since his kick; null without one); `finaleIn` — fight ms until the last card's blow on him lying (null: not waiting).
   */
  play(reducedMotion: boolean, target: () => CityFightStarfallBody | null, cue: (cue: CityFightStarfallCue, value?: number) => void,
    progress: () => number | null, finaleIn: () => number | null = () => null): void {
    this.stop();
    this.dropSnap();
    this.run = { ms: 0, sinceHit: null, sinceSlam: null, fadeMs: null, reduced: reducedMotion, target, cue, progress, finaleIn, lastProgress: 0,
      contact: null, cut: null, hit: null, cardH: 0, shards: [], lastBeat: -1, sinceBeat: 0, played: new Set(), chest: null, kickAt: null,
      finaleMs: null, finaleAt: null };
    const player = this.actors()[0], box = player?.getBounds(), h = target()?.h ?? 0;
    if (player && box) this.run.chest = { x: player.x, y: player.y - h * 0.58, h };
  }

  /** The super's kick landed on the body at `at` (world px). */
  resolve(at: Point): void {
    const r = this.run;
    if (r && r.sinceHit === null) {
      const h = r.target()?.h ?? this.camera().worldView.height * 0.3;
      r.sinceHit = 0; r.contact = { x: at.x, y: at.y }; r.kickAt = { x: at.x, y: at.y - h * 0.55, h };
    }
  }


  beat(beat: number): void {
    const r = this.run;
    if (!r || beat <= r.lastBeat) return;
    r.lastBeat = beat; r.sinceBeat = 0;
    if (beat === SLAM_BEAT) {
      r.sinceSlam = 0;
      const view = this.camera().worldView;
      this.landing(r, view);
    } else if (beat === FINALE) {
      // It lands on the blow: already falling (`finaleIn`) it drops the rest at once, else it comes in landed.
      r.finaleMs = Math.max(r.finaleMs ?? 0, F.finale.fallMs);
      r.finaleAt ??= r.target();
    }
    else r.shards.push({ beat, ageMs: 0 });
  }

  /** The night over the town this frame (the fight's backdrop pass takes it over its own while it runs), or null. */
  backdrop(): NativeCityBackdropFrame | null {
    const r = this.run;
    if (!r) return null;
    const alpha = clamp01(r.ms / F.night.inMs) * (1 - this.out(r));
    return alpha > 0.001 ? { alpha, mode: "night", clockMs: r.reduced ? 0 : r.ms } : null;
  }

  /** One frame on screen ms (it reads through the fight's freezes). */
  update(screenDtMs: number): void {
    const r = this.run;
    if (!r) return;
    const dt = Math.max(0, Number.isFinite(screenDtMs) ? screenDtMs : 0);
    r.ms += dt; r.sinceBeat += dt;
    this.clockMs = r.ms;
    if (r.sinceHit !== null) r.sinceHit += dt;
    if (r.sinceSlam !== null) r.sinceSlam += dt;
    for (const shard of r.shards) shard.ageMs += dt;
    if (r.finaleMs !== null) r.finaleMs += dt;
    else if (r.lastBeat === SHARDS) {
      // The last card starts falling so that it meets the blow (the rules strike him `finale.afterDownMs` after he lies down).
      const due = r.finaleIn();
      if (due !== null && due <= F.finale.fallMs) { r.finaleMs = F.finale.fallMs - due; r.finaleAt = r.target(); }
    }
    const progress = r.progress();
    if (progress !== null) r.lastProgress = progress;
    // The fade: after the last blow; a follow-up cut short (a KO) or never started (no follow-up); a super that never landed.
    // (After the shards the rules wait for him to lie down for the finale; a follow-up with no finale — he never went down, a KO — ends.)
    const fadeDue = r.lastBeat >= FINALE && r.sinceBeat >= F.finale.holdMs
      || r.sinceSlam !== null && r.lastBeat < FINALE && progress === null && r.sinceBeat >= F.fade.cutShortMs
      || r.sinceHit !== null && r.sinceSlam === null && progress === null && r.sinceHit >= F.fade.noFollowUpMs
      || r.reduced && r.sinceSlam !== null && r.sinceSlam >= REDUCED_HOLD_MS
      || r.sinceHit === null && r.ms >= F.night.missMs;
    if (r.fadeMs === null && fadeDue) r.fadeMs = 0;
    else if (r.fadeMs !== null) r.fadeMs += dt;
    if (this.out(r) >= 1) { this.stop(); return; }
    this.hide();
    const view = this.camera().worldView, perPx = view.width / Math.max(1, this.camera().width);
    this.cover = this.readable ? this.bodyCover(r) : null;
    if (r.reduced) this.reducedFrame(r, view);
    else this.frame(r, view, perPx);
  }

  stop(): void { this.run = null; this.hide(); }

  destroy(): void {
    for (const piece of this.all()) piece.destroy();
    for (const clip of this.shardClips) clip.destroy();
    this.dropSnap();
  }

  private all(): (Phaser.GameObjects.Graphics | Phaser.GameObjects.Image | Phaser.GameObjects.Text)[] {
    return [this.back, this.cardG, this.cardDetail, this.cardCreamG, ...this.cardLights, this.cardGlow, this.shardBack, this.shardFront, ...this.shardImages,
      ...this.indexes, ...this.fronts, ...this.puffs, this.front, this.bloom, this.sparks, this.plate,
      ...this.silhouettes, this.plateLines, ...this.backLights, ...this.lights];
  }

  private hide(): void {
    for (const piece of this.all()) piece.setVisible(false);
    for (const g of [this.back, this.front, this.sparks, this.plate, this.plateLines, this.cardG, this.cardDetail, this.cardCreamG, this.cardGlow,
      this.shardBack, this.shardFront]) g.clear();
    this.backUsed = 0; this.used = 0; this.cardUsed = 0;
  }

  private once(r: Run, cue: CityFightStarfallCue, value?: number): void {
    if (r.played.has(cue)) return;
    r.played.add(cue);
    r.cue(cue, value);
  }

  /** How far it has faded out (0..1): over `fade.ms` (or `night.outMs` for a super that never landed / under reduced motion). */
  private out(r: Run): number {
    if (r.fadeMs === null) return 0;
    return clamp01(r.fadeMs / (r.sinceHit === null || r.reduced ? F.night.outMs : F.fade.ms));
  }

  private reducedFrame(r: Run, view: Phaser.Geom.Rectangle): void {
    if (r.sinceSlam === null || !r.hit) return;
    const fade = 1 - this.out(r), cardH = r.cardH, cardW = cardH * CARD_ASPECT;
    this.drawCard(this.cardPose(r.hit.x, r.hit.y + cardH * F.card.sink, cardW, cardH), clamp01(r.sinceSlam / F.card.revealMs) * fade, 0, null);
    this.copyBodies(this.fronts, null);
    void view;
  }


  private frame(r: Run, view: Phaser.Geom.Rectangle, perPx: number): void {
    const p = r.sinceHit === null ? null : r.lastProgress, fade = 1 - this.out(r);
    this.drawCharge(r, perPx);
    this.drawKick(r);
    if (r.sinceSlam === null) {
      if (p === null || r.sinceHit === null || r.progress() === null || p < F.slash.atMs) {
        // 0. The shaft on him from the cut-in's wipe, through the kick and its freeze.
        const target = r.target(), since = r.ms - F.beam.fromMs;
        if (target && since >= 0) this.drawShaft(this.front, view, perPx, target, easeOutCubic(clamp01(since / F.beam.reachMs)),
          (0.8 + 0.2 * Math.sin(r.ms * 0.07)) * fade);
        return;
      }
      // 1-3 on the follow-up's clock, so the card meets the slam: the cut, its light, the rift, the card through it.
      const cut = r.cut ?? (r.cut = this.cutThrough(r, view));
      const off = cut.at.x - view.centerX, keep = view.width * F.lead.keepViews;
      if (Math.abs(off) > keep) this.once(r, "lead", (off - Math.sign(off) * keep) / Math.max(1e-6, this.worldPxPerScreenPx()));
      const riftAt = SLAM_AT - F.rift.openBeforeMs, fallAt = SLAM_AT - F.rift.fallMs;
      if (p < riftAt) { const target = r.target(); if (target) this.drawShaft(this.front, view, perPx, target, 1, 1 - clamp01((p - F.slash.atMs) / F.slash.drawMs)); }
      this.drawCut(r, view, perPx, cut, p, clamp01((p - riftAt) / F.rift.openMs), p - riftAt);
      if (p >= fallAt) {
        // The card through the rift: its cream silhouette streaking down onto him on three sharp lines.
        const hit = this.landing(r, view), cardH = r.cardH, cardW = cardH * CARD_ASPECT;
        const footY = hit.y + cardH * F.card.sink, k = easeInCubic(clamp01((p - fallAt) / F.rift.fallMs)), y = view.y + (footY - view.y) * k;
        // Spinning on its long axis as it falls (back, face, back …), face out as it lands; a little of its cream on it (it is light).
        const turn = Math.cos((1 - easeOutCubic(clamp01((p - fallAt) / F.rift.fallMs))) * F.card.spinHalfTurns * Math.PI / 2 * 2);
        this.drawCard(this.cardPose(hit.x, y, cardW, cardH, turn), 1, 0.25, null);
        for (const [dx, width] of [[-0.32, 2], [0, 4], [0.32, 2]] as const) {
          this.front.lineStyle(width * perPx, PALETTE.fxWarmCream, 0.85).lineBetween(hit.x + dx * cardW, view.y, hit.x + dx * cardW, y - cardH * 0.9);
        }
      }
      return;
    }
    const s = r.sinceSlam, hit = this.landing(r, view), cut = r.cut ?? (r.cut = this.cutThrough(r, view));
    const cardH = r.cardH, cardW = cardH * CARD_ASPECT, footY = hit.y + cardH * F.card.sink;
    if (s < COLOUR_AT) {
      // 4. The impact frames inside the slam's freeze: the navy plate, the bodies, the card and the cut cream, the clock ring.
      this.drawImpactFrame(view, perPx, hit, cardH, cut, Math.min(F.impact.frames - 1, Math.floor(s / F.impact.frameMs)));
      this.drawCard(this.cardPose(hit.x, footY, cardW, cardH), 0, 1, null, this.plateLines);
      return;
    }
    const after = s - COLOUR_AT, him = r.target() ?? hit;
    // 4. Round the card: the light column, the clock ring, the arcs; the closing rift's last light; the mist; the burst.
    this.drawColumn(view, hit, footY, 1 - clamp01(after / F.ring.columnMs));
    const R = F.ring, middle = { x: hit.x, y: footY - cardH * 0.5 };
    this.drawClock(perPx, middle, view.height * (R.fromViews + (R.toViews - R.fromViews) * easeOutCubic(clamp01(after / R.ringMs))),
      (1 - clamp01(after / R.ringMs)) * fade);
    this.drawArcs(view, perPx, hit.x, footY, after, fade);
    if (s < F.rift.closeMs) this.drawCut(r, view, perPx, cut, SLAM_AT, 1 - s / F.rift.closeMs, F.rift.openMs + s);
    this.drawMist(view, hit, footY, after, fade * (1 - clamp01((s - BREAK_AT) / F.mist.outMs)));
    if (s < BREAK_AT) {
      // The card planted where he stood, out of its cream with a settle; the fighters before it, the struck one flashing white; 5. glass
      // cracks running over it.
      const settleK = clamp01(after / F.card.settleMs), settle = F.card.settle * Math.sin(Math.PI * settleK) * (1 - settleK);
      const shine = (after - F.card.shineFromMs) / F.card.shineMs;
      this.drawCard(this.cardPose(hit.x, footY, cardW * (1 + settle), cardH * (1 - settle)), 1, 1 - easeOutCubic(clamp01(after / F.card.revealMs)),
        shine >= 0 && shine <= 1 ? shine : null);
      this.copyBodies(this.fronts, null);
      this.fronts[1]?.setVisible(false);
      this.drawCracks(perPx, this.cardPose(hit.x, footY, cardW, cardH), clamp01((after - F.shatter.crackMs) / F.shatter.crackGrowMs));
    } else this.drawShatter(r, view, hit, him, footY, cardW, cardH, s - BREAK_AT, fade);
    this.drawBurst(view, perPx, hit, footY, after);
    this.drawShardBlows(r, him, perPx);
    if (r.finaleMs !== null && r.finaleAt) this.drawFinale(r.finaleAt, r.finaleMs, view, perPx, this.out(r));
    if (r.fadeMs !== null) this.drawFade(him, r.fadeMs);
  }

  /** The cut: his middle as it starts, its direction (`slash.angleDeg`) and half length. */
  private cutThrough(r: Run, view: Phaser.Geom.Rectangle): Cut {
    const body = r.target() ?? { x: r.contact?.x ?? view.centerX, y: r.contact?.y ?? view.bottom, h: view.height * 0.3 };
    const a = F.slash.angleDeg * Math.PI / 180;
    return { at: { x: body.x, y: body.y - body.h * 0.5 }, dir: { x: Math.cos(a), y: Math.sin(a) }, half: view.width * F.slash.reachViews };
  }

  /** Where the card falls: on him as it starts to fall (his kick held him there), its height set by the view then. */
  private landing(r: Run, view: Phaser.Geom.Rectangle): CityFightStarfallBody {
    if (!r.hit) {
      const contact = r.contact ?? { x: view.centerX, y: view.bottom };
      const him = r.target() ?? { x: contact.x, y: contact.y, h: view.height * 0.3 }, player = this.actors()[0];
      r.cardH = Math.min(view.height * F.card.maxViews, him.h * F.card.heightBodies);
      const away = player ? Math.sign(him.x - player.x) || 1 : 0;
      r.hit = { ...him, x: him.x + away * r.cardH * CARD_ASPECT * F.card.awayWidths };
    }
    return r.hit;
  }

  /**
   * 1-3 on the cut's line, at follow-up ms `p`: the razor line drawn out, its soft light and motes, the rift `open` (0..1) with shards off its
   * edges (`riftMs` since it began opening).
   */
  private drawCut(r: Run, view: Phaser.Geom.Rectangle, perPx: number, cut: Cut, p: number, open: number, riftMs: number): void {
    const S = F.slash, g = this.front.setVisible(true), n = { x: -cut.dir.y, y: cut.dir.x };
    const draw = easeOutCubic(clamp01((p - S.atMs) / S.drawMs));
    const a = { x: cut.at.x - cut.dir.x * cut.half, y: cut.at.y - cut.dir.y * cut.half };
    const b = { x: a.x + cut.dir.x * cut.half * 2 * draw, y: a.y + cut.dir.y * cut.half * 2 * draw };
    const along = (u: number) => ({ x: a.x + cut.dir.x * cut.half * 2 * u, y: a.y + cut.dir.y * cut.half * 2 * u });
    // 2. Its light: wide soft bands along it, swelling from the cut's end, motes rising off it.
    const glowT = p - S.atMs - S.drawMs, glow = glowT < 0 ? 0 : glowT < F.glow.swellMs ? easeOutCubic(glowT / F.glow.swellMs)
      : 1 - clamp01((glowT - F.glow.swellMs) / F.glow.holdMs) * 0.6;
    if (glow > 0) {
      for (const [width, alpha, color] of [[34, 0.1, PALETTE.hotGold], [18, 0.18, PALETTE.fxWarmCream], [9, 0.3, PALETTE.white]] as const) {
        g.lineStyle(width * perPx * (0.6 + 0.4 * glow), color, alpha * glow).lineBetween(a.x, a.y, b.x, b.y);
      }
      for (let i = 0; i < F.glow.motes; i++) {
        const k = clamp01(glowT / (F.glow.swellMs + F.glow.holdMs) + jitter(i, 71) * 0.2), q = along(jitter(i, 72));
        const rise = view.height * 0.08 * k * (0.5 + jitter(i, 73));
        g.fillStyle(i % 3 === 0 ? PALETTE.hotGold : PALETTE.white, bell(k) * 0.9).fillCircle(q.x + n.x * rise * 0.3, q.y - rise, (1.5 + 2 * jitter(i, 74)) * perPx);
      }
    }
    // 3. The rift: the line opened into a bright band, its cut edges in ink, shards breaking off them.
    if (open > 0) {
      const w = view.height * F.rift.widthViews * easeOutCubic(open), quad = (half: number) => [
        { x: a.x + n.x * half, y: a.y + n.y * half }, { x: b.x + n.x * half, y: b.y + n.y * half },
        { x: b.x - n.x * half, y: b.y - n.y * half }, { x: a.x - n.x * half, y: a.y - n.y * half }];
      // Light opening in layers: a wide pale halo, the bright seam, its two cut edges as hairlines of white.
      g.fillStyle(PALETTE.titleMoonMote, 0.18).fillPoints(quad(w * 1.6), true);
      g.fillStyle(PALETTE.titleMoonMote, 0.35).fillPoints(quad(w * 0.95), true);
      g.fillStyle(PALETTE.white, 0.9).fillPoints(quad(w * 0.45), true);
      g.lineStyle(1.4 * perPx, PALETTE.white, 1).lineBetween(a.x + n.x * w * 0.5, a.y + n.y * w * 0.5, b.x + n.x * w * 0.5, b.y + n.y * w * 0.5)
        .lineBetween(a.x - n.x * w * 0.5, a.y - n.y * w * 0.5, b.x - n.x * w * 0.5, b.y - n.y * w * 0.5);
      this.once(r, "split");
    }
    const shardK = riftMs / F.rift.shardMs;
    if (shardK > 0 && shardK < 1) {
      for (let i = 0; i < F.rift.shards; i++) {
        const side = i % 2 === 0 ? 1 : -1, q = along(0.15 + 0.7 * jitter(i, 81)), d = view.height * (0.04 + 0.1 * jitter(i, 82)) * easeOutCubic(shardK);
        const x = q.x + n.x * side * d, y = q.y + n.y * side * d + view.height * 0.05 * shardK * shardK, size = (5 + 6 * jitter(i, 83)) * perPx;
        const spin = shardK * 9 * (jitter(i, 84) - 0.5) + i;
        this.flare(x, y, size * 3, i % 4 === 0 ? PALETTE.hotGold : PALETTE.titleMoonMote, 1 - shardK, spin);
      }
    }
    // 1. The razor line itself over its light: an icy glow, a white core, glass ticks along it, a glint at its running tip.
    g.lineStyle(S.glowPx * perPx, PALETTE.titleMoonMote, 0.45).lineBetween(a.x, a.y, b.x, b.y);
    g.lineStyle(S.corePx * perPx, PALETTE.white, 1).lineBetween(a.x, a.y, b.x, b.y);
    const length = Math.hypot(b.x - a.x, b.y - a.y), step = S.tickPx * perPx;
    for (let d = step * 0.5, i = 0; d < length; d += step, i++) {
      const q = { x: a.x + cut.dir.x * d, y: a.y + cut.dir.y * d }, side = i % 2 === 0 ? 1 : -1, len = (5 + 9 * jitter(i, 91)) * perPx;
      g.lineStyle(1.2 * perPx, PALETTE.white, 0.75).lineBetween(q.x, q.y, q.x + (n.x * side + cut.dir.x * 0.4) * len, q.y + (n.y * side + cut.dir.y * 0.4) * len);
    }
    if (draw < 1) this.star(g, b.x, b.y, 22 * perPx, PALETTE.white, 1);
  }

  /**
   * 5. The card's shards (`CARD_SHARDS`): pieces of the card itself — the card as it stood is drawn once into a texture as it breaks
   * (`snapshotCard`) and each shard is that texture clipped to its triangle, moved with it — flung out from where they sat (bent toward the
   * view's middle), then swirling in round him up in the air, the ones on his far side smaller and dimmer; a hairline of ice light on each
   * edge, a glint flashing on a piece as it turns.
   */
  private drawShatter(r: Run, view: Phaser.Geom.Rectangle, hit: CityFightStarfallBody, him: CityFightStarfallBody, footY: number, cardW: number,
    cardH: number, since: number, fade: number): void {
    const P = F.shatter, pose = this.cardPose(hit.x, footY, cardW, cardH), snap = this.snap ?? this.snapshotCard(pose);
    const center = { x: him.x, y: him.y - him.h * 0.5 }, cardMid = this.cardPoint(pose, CARD_MID[0], CARD_MID[1]);
    const spin = (since / 1000) * P.turnsPerSec * Math.PI * 2, edge = Math.max(1, cardW * 0.006);
    // They go once the spike has struck (the finale's card comes alone), or with the fade.
    const spiked = r.shards.find(shard => shard.beat === SHARDS);
    const alpha = fade * (r.fadeMs === null ? 1 : 1 - clamp01(r.fadeMs / (F.fade.ms * 0.6))) * (spiked ? 1 - clamp01(spiked.ageMs / 380) : 1);
    if (alpha <= 0.001) { for (const image of this.shardImages) image.setVisible(false); return; }
    const back = this.shardBack.setVisible(true), front = this.shardFront.setVisible(true);
    CARD_SHARDS.forEach((shard, i) => {
      const image = this.shardImages[i]!, clip = this.shardClips[i]!;
      const corners = shard.map(([u, v]) => this.cardPoint(pose, u, v));
      const sx = (corners[0]!.x + corners[1]!.x + corners[2]!.x) / 3, sy = (corners[0]!.y + corners[1]!.y + corners[2]!.y) / 3;
      const inward = Math.sign(view.centerX - cardMid.x) * cardW * 0.6;
      const out = { x: sx - cardMid.x + (jitter(i, 111) - 0.5) * cardW * 0.4 + inward, y: sy - cardMid.y + (jitter(i, 112) - 0.5) * cardH * 0.3 };
      const len = Math.max(1, Math.hypot(out.x, out.y)), fling = easeOutCubic(clamp01(since / P.flingMs)) * cardH * P.flingCards;
      const fx = sx + out.x / len * fling, fy = sy + out.y / len * fling;
      const home = clamp01((since - P.flingMs - jitter(i, 113) * P.staggerMs) / P.homeMs), ease = home * home * (3 - 2 * home);
      const theta = jitter(i, 114) * Math.PI * 2 + spin * (1 + 0.3 * jitter(i, 115));
      const radius = him.h * (P.orbitBodies + (P.wrapBodies - P.orbitBodies) * easeInCubic(home)) * (0.8 + 0.4 * jitter(i, 116));
      const ox = center.x + Math.cos(theta) * radius, oy = center.y + Math.sin(theta) * radius * 0.5 + him.h * 0.25 * Math.sin(theta * 0.5 + i);
      // The ones on the far side of him read as behind: smaller and dimmer (his body is drawn under every Phaser layer).
      const x = fx + (ox - fx) * ease, y = fy + (oy - fy) * ease, behind = Math.sin(theta) < 0 && home >= 0.5;
      const scale = (1 - 0.45 * ease) * (behind ? 0.8 : 1), turn = (jitter(i, 117) - 0.5) * 12 * (since / 1000), cos = Math.cos(turn), sin = Math.sin(turn);
      const points = corners.map(c => ({ x: x + ((c.x - sx) * cos - (c.y - sy) * sin) * scale, y: y + ((c.x - sx) * sin + (c.y - sy) * cos) * scale }));
      const a = alpha * (behind ? 0.55 : 1), depth = behind ? PIECE_BACK_DEPTH : FRONT_DEPTH;
      // The piece of the card: its snapshot pinned at the shard's own place, moved and turned with it, clipped to its triangle.
      clip.clear().fillStyle(PALETTE.white, 1).fillTriangle(points[0]!.x, points[0]!.y, points[1]!.x, points[1]!.y, points[2]!.x, points[2]!.y);
      if (snap) {
        image.setTexture(snap.key).setOrigin((sx - snap.bx) * snap.zoom / snap.w, (sy - snap.by) * snap.zoom / snap.h).setPosition(x, y)
          .setRotation(turn).setScale(scale / snap.zoom).setAlpha(a).setDepth(depth).setVisible(true);
      } else image.setVisible(false);
      // Its glass edge: a hairline of ice light, a glint as the piece turns to the light.
      const g = behind ? back : front;
      g.lineStyle(edge * 2.4, PALETTE.titleMoonMote, 0.25 * a).strokePoints(points, true, true);
      g.lineStyle(edge, PALETTE.white, 0.85 * a).strokePoints(points, true, true);
      const catchLight = Math.max(0, Math.sin(turn * 1.7 + i)) ** 6;
      if (catchLight > 0.05) this.flare(points[0]!.x, points[0]!.y, cardW * 0.22 * scale, PALETTE.white, catchLight * a);
    });
  }

  /**
   * The card as it stands, drawn once into a texture (its glass, the light inside it, its frame, the ace, its indexes, its edge glow) at the
   * camera's zoom, for its shards to cut. Null where no texture can be made.
   */
  private snapshotCard(p: CardPose): CityFightStarfallView["snap"] {
    this.drawCard(p, 1, 0, null);
    const outline = this.cardOutline(p, -p.w * 0.06), xs = outline.map(q => q.x), ys = outline.map(q => q.y);
    const bx = Math.min(...xs), by = Math.min(...ys), bw = Math.max(...xs) - bx, bh = Math.max(...ys) - by;
    const zoom = Math.max(1, Math.min(2, this.camera().zoom)), w = Math.max(2, Math.ceil(bw * zoom)), h = Math.max(2, Math.ceil(bh * zoom));
    let snap: CityFightStarfallView["snap"] = null;
    try {
      const rt = this.scene.make.renderTexture({ x: 0, y: 0, width: w, height: h }, false);
      rt.camera.setOrigin(0, 0).setZoom(zoom);
      for (const piece of [this.cardG, ...this.cardLights, this.cardDetail, ...this.indexes, this.cardGlow]) {
        if (piece.visible) rt.draw(piece, piece.x - bx, piece.y - by);
      }
      const key = `${SNAP_KEY}-${this.snaps++}`;
      rt.saveTexture(key);
      snap = { rt, key, bx, by, zoom, w, h };
    } catch { snap = null; }
    // The card itself is gone this frame: its pieces carry it.
    for (const piece of [this.cardG, this.cardDetail, this.cardCreamG, this.cardGlow]) piece.clear().setVisible(false);
    for (const piece of [...this.cardLights, ...this.indexes]) piece.setVisible(false);
    this.cardUsed = 0;
    this.snap = snap;
    return snap;
  }

  /** Lets the last snapshot (and its texture) go. */
  private dropSnap(): void {
    if (!this.snap) return;
    this.snap.rt.destroy();
    this.snap = null;
  }

  /**
   * His super's start: a flare in front of his chest — light rays out, a ring, a soft glow — while the cut-in comes in. Its white heart
   * only the first frames, small; the rest pale light at most `flareAlpha` / `glowAlpha` (it lies over his body).
   */
  private drawCharge(r: Run, perPx: number): void {
    const C = F.charge, chest = r.chest;
    if (!chest || r.ms >= C.ms) return;
    const k = r.ms / C.ms, grow = easeOutCubic(Math.min(1, k * 1.8)), fall = (1 - k) ** 1.5, h = chest.h;
    // In front of him, toward the one it is cast at.
    const target = r.target(), toward = target ? Math.sign(target.x - chest.x) || 1 : 1, at = { x: chest.x + toward * h * C.forward, y: chest.y };
    this.glow(at.x, at.y, h * C.glowBodies * (0.4 + 0.6 * easeOutCubic(k)), PALETTE.titleMoonMote, C.glowAlpha * fall);
    const flare = h * C.flareBodies * (0.5 + 0.5 * grow);
    this.light(false, this.lightTexture("flare"), at.x, at.y, flare, flare, k * 0.5, PALETTE.titleMoonMote, C.flareAlpha * fall);
    if (r.ms < C.coreMs) this.light(false, this.puffTexture(), at.x, at.y, h * C.coreBodies, h * C.coreBodies, 0, PALETTE.white, 1);
    for (let i = 0; i < C.rays; i++) {
      const a = (i / C.rays) * Math.PI * 2 + 0.13 + (jitter(i, 141) - 0.5) * 0.25, inner = h * 0.12;
      this.ray(at.x + Math.cos(a) * inner, at.y + Math.sin(a) * inner, a, h * C.rayBodies * (0.55 + 0.6 * jitter(i, 142)) * grow,
        h * 0.035 * (1 - 0.6 * k), i % 4 === 0 ? PALETTE.hotGold : PALETTE.titleMoonMote, fall);
    }
    const ring = clamp01(r.ms / C.ringMs);
    if (ring < 1) this.ring(this.sparks, perPx, at.x, at.y, h * (0.2 + C.ringBodies * easeOutCubic(ring)), (1 - ring) ** 1.5 * 0.9);
  }


  private bodyCover(r: Run): CityFightLightCover {
    const him = r.target(), player = this.actors()[0], h = him?.h ?? 0, boxes: CityFightLightBox[] = [];
    if (him) boxes.push(cityFightBodyBox(him));
    if (player && h > 0) boxes.push(cityFightBodyBox({ x: player.x, y: player.y, h }));
    return { boxes, maxAlpha: CITY_FIGHT_AWAKENING_READABLE.overBodyAlpha };
  }

  /** His kick's contact: a crescent of light swept round it, a flare, glints thrown out. */
  private drawKick(r: Run): void {
    const K = F.kick, at = r.kickAt, t = r.sinceHit;
    if (!at || t === null || t >= K.ms) return;
    const k = t / K.ms, sweep = easeOutCubic(clamp01(t / K.sweepMs)), fall = (1 - k) ** 1.4, h = at.h, g = this.sparks.setVisible(true);
    const radius = h * K.arcBodies, from = -Math.PI * 0.85, to = from + Math.PI * 1.25 * sweep;
    for (const [width, color, alpha] of [[0.1, PALETTE.titleMoonMote, 0.22], [0.045, PALETTE.titleMoonMote, 0.5], [0.014, PALETTE.white, 1]] as const) {
      g.lineStyle(h * width * (1 - 0.5 * k), color, alpha * fall);
      g.beginPath(); g.arc(at.x, at.y, radius * (1 + 0.15 * k), from, to, false); g.strokePath();
    }
    this.flare(at.x, at.y, h * K.flareBodies * bell(Math.min(1, t / 160 + 0.35)), PALETTE.white, fall);
    for (let i = 0; i < K.glints; i++) {
      const a = (jitter(i, 151) - 0.5) * Math.PI * 1.6 - Math.PI / 2, d = h * (0.3 + 0.9 * jitter(i, 152)) * easeOutCubic(k);
      this.flare(at.x + Math.cos(a) * d, at.y + Math.sin(a) * d, h * 0.16 * (0.6 + 0.6 * jitter(i, 153)), i % 3 === 0 ? PALETTE.hotGold : PALETTE.white,
        fall, k * 3);
    }
  }

  /** A ring of light: a wide pale halo under a thin white core. */
  private ring(g: Phaser.GameObjects.Graphics, perPx: number, x: number, y: number, radius: number, alpha: number): void {
    if (alpha <= 0.003) return;
    g.setVisible(true);
    g.lineStyle(9 * perPx, PALETTE.titleMoonMote, 0.16 * alpha).strokeCircle(x, y, radius);
    g.lineStyle(3.5 * perPx, PALETTE.titleMoonMote, 0.35 * alpha).strokeCircle(x, y, radius);
    g.lineStyle(1.4 * perPx, PALETTE.white, alpha).strokeCircle(x, y, radius);
  }

  /** One image of the light pools (added light): `key` at (x, y), `w` × `h`, turned `rotation`, tinted. */
  private light(back: boolean, key: string, x: number, y: number, w: number, h: number, rotation: number, tint: number, alpha: number,
    originX = 0.5): void {
    if (alpha <= 0.003 || w <= 0.5 || h <= 0.5) return;
    const image = back ? this.backLights[this.backUsed++] : this.lights[this.used++];
    const shown = back ? alpha : cityFightCoveredAlpha(this.cover, x, y, w, h, rotation, originX, Math.min(1, alpha));
    image?.setTexture(key).setOrigin(originX, 0.5).setPosition(x, y).setDisplaySize(w, h).setRotation(rotation).setTint(tint).setAlpha(shown)
      .setVisible(true);
  }

  /** A ray of light from (x, y) along `angle`, tapering from its root: a wide pale halo and a thin white core. */
  private ray(x: number, y: number, angle: number, length: number, width: number, tint: number, alpha: number, back = false): void {
    const key = this.lightTexture("ray");
    this.light(back, key, x, y, length, width * 3.2, angle, tint, alpha * 0.5, 0);
    this.light(back, key, x, y, length * 0.9, width, angle, PALETTE.white, alpha, 0);
  }

  /** A streak of light through (x, y) along `angle`, fading at both ends. */
  private streak(x: number, y: number, angle: number, length: number, width: number, tint: number, alpha: number, back = false): void {
    const key = this.lightTexture("streak");
    this.light(back, key, x, y, length, width * 3.2, angle, tint, alpha * 0.5);
    this.light(back, key, x, y, length * 0.85, width, angle, PALETTE.white, alpha);
  }

  /** A four-point flare `size` across at (x, y), turned `rotation`, with a white heart. */
  private flare(x: number, y: number, size: number, tint: number, alpha: number, rotation = 0, back = false): void {
    this.light(back, this.lightTexture("flare"), x, y, size, size, rotation, tint, alpha);
    this.light(back, this.puffTexture(), x, y, size * 0.32, size * 0.32, 0, PALETTE.white, alpha * 0.9);
  }

  /** A soft round glow `size` across. */
  private glow(x: number, y: number, size: number, tint: number, alpha: number, back = false): void {
    this.light(back, this.puffTexture(), x, y, size, size, 0, tint, alpha);
  }

  /** The light textures (`CityFightLightKit` — made in code once per scene). */
  private lightTexture(kind: LightKind): string { return cityFightLightTexture(this.scene, kind); }

  /**
   * 7. The finale: the last ace comes down spinning onto him where he lies (`at`, `since` screen ms from its blow), stabs in face out with a
   * flare, a ring of light along the ground, rays and glints, and stands by him until the fade.
   */
  private drawFinale(at: CityFightStarfallBody, since: number, view: Phaser.Geom.Rectangle, perPx: number, out: number): void {
    const N = F.finale, cardH = Math.min(view.height * N.maxViews, at.h * N.heightBodies), cardW = cardH * CARD_ASPECT;
    const footY = at.y + cardH * N.sink;
    if (since < N.fallMs) {
      const k = easeInCubic(since / N.fallMs), y = view.y - cardH * 0.2 + (footY - view.y + cardH * 0.2) * k;
      const turn = Math.cos((1 - easeOutCubic(since / N.fallMs)) * 4 * Math.PI);
      this.drawCard(this.cardPose(at.x, y, cardW, cardH, turn, N.tiltDeg), 1, 0.2, null);
      for (const [dx, width] of [[-0.3, 1.5], [0, 3], [0.3, 1.5]] as const) {
        this.front.setVisible(true).lineStyle(width * perPx, PALETTE.titleMoonMote, 0.8)
          .lineBetween(at.x + dx * cardW, view.y, at.x + dx * cardW, y - cardH * 0.9);
      }
      return;
    }
    const after = since - N.fallMs, shine = (after - 60) / F.card.shineMs;
    // In the fade: it turns edge-on, then is a line of light thinning away with glints rising off it.
    const spin = clamp01(out / N.spinOut), gone = clamp01((out - N.spinOut) / (N.goneOut - N.spinOut));
    const pose = this.cardPose(at.x, footY, cardW, cardH, 1, N.tiltDeg);
    if (spin < 1) {
      const reveal = 1 - easeOutCubic(clamp01(after / N.revealMs));
      this.drawCard({ ...pose, turn: Math.cos(easeInCubic(spin) * Math.PI / 2) }, 1, Math.max(reveal, 0.35 * spin),
        shine >= 0 && shine <= 1 && spin === 0 ? shine : null);
    }
    if (spin > 0.6 && gone < 1) {
      const top = this.cardPoint(pose, 0, 1.04), bottom = this.cardPoint(pose, 0, -0.04), mid = this.cardPoint(pose, 0, 0.5);
      const k = clamp01((spin - 0.6) / 0.4) * (1 - easeInCubic(gone)), along = Math.atan2(top.y - bottom.y, top.x - bottom.x);
      this.streak(mid.x, mid.y, along, cardH * 1.15 * (1 + 0.25 * gone), cardW * 0.07 * (1 - gone), PALETTE.titleMoonMote, k);
      this.flare(mid.x, mid.y, cardH * 0.8 * (1 - 0.6 * gone), PALETTE.white, k, along - Math.PI / 2);
    }
    if (spin >= 1) {
      for (let i = 0; i < N.motes; i++) {
        const k = clamp01(gone * 1.4 - jitter(i, 175) * 0.4), edge = this.cardPoint(pose, (jitter(i, 176) - 0.5) * 0.3, jitter(i, 177));
        if (k <= 0 || k >= 1) continue;
        this.flare(edge.x + (jitter(i, 178) - 0.5) * cardW * 0.8 * k, edge.y - cardH * 0.5 * easeOutCubic(k), cardH * 0.07 * (1 + jitter(i, 179)),
          i % 3 === 0 ? PALETTE.hotGold : PALETTE.white, bell(k), k * 2);
      }
    }
    if (out > 0) return;
    // Its burst where it went in: a flare, a ring of light along the ground, rays, glints.
    const cx = at.x, cy = footY - cardH * 0.45, flash = clamp01(after / 240);
    if (flash < 1) this.flare(cx, cy, at.h * N.flareBodies * (0.6 + 0.4 * easeOutCubic(flash)), PALETTE.white, (1 - flash) ** 1.3, flash * 0.5);
    const wave = clamp01(after / N.waveMs);
    if (wave < 1) {
      const rx = view.width * N.waveViews * easeOutCubic(wave), ry = rx * 0.16, g = this.front.setVisible(true);
      for (const [width, color, alpha] of [[14, PALETTE.titleMoonMote, 0.16], [5, PALETTE.titleMoonMote, 0.4], [1.8, PALETTE.white, 1]] as const) {
        g.lineStyle(width * perPx * (0.5 + 0.5 * (1 - wave)), color, alpha * (1 - wave)).strokeEllipse(at.x, footY, rx * 2, ry * 2);
      }
    }
    const ray = clamp01(after / N.rayMs);
    if (ray < 1) {
      for (let i = 0; i < N.rays; i++) {
        const a = -Math.PI / 2 + ((i / (N.rays - 1)) - 0.5) * Math.PI * 1.3, inner = at.h * 0.12;
        this.ray(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner, a, at.h * N.rayBodies * (0.6 + 0.5 * jitter(i, 171)) * easeOutCubic(Math.min(1, ray * 2.5)),
          at.h * 0.035 * (1 - 0.6 * ray), i % 3 === 0 ? PALETTE.hotGold : PALETTE.titleMoonMote, (1 - ray) ** 1.2);
      }
    }
    for (let i = 0; i < 6; i++) {
      const k = clamp01(after / 520), a = -Math.PI / 2 + (jitter(i, 172) - 0.5) * 2.4, d = at.h * (0.3 + 0.7 * jitter(i, 173)) * easeOutCubic(k);
      this.flare(cx + Math.cos(a) * d, cy + Math.sin(a) * d - at.h * 0.2 * k, at.h * 0.12, i % 2 === 0 ? PALETTE.hotGold : PALETTE.white, (1 - k));
    }
  }

  /**
   * 6. The shards' blows (the rules' — `beat`): a flare and a cut of light on him at each, glints thrown off it, his body flashing on every
   * other one and the last (gold).
   */
  private drawShardBlows(r: Run, him: CityFightStarfallBody, perPx: number): void {
    const H = F.hits;
    for (const { beat, ageMs } of r.shards) {
      if (ageMs >= H.sparkMs) continue;
      const last = beat === SHARDS, i = beat, k = ageMs / H.sparkMs, fall = 1 - k * k;
      const px = him.x + (jitter(i, 121) - 0.5) * him.h * 0.55, py = him.y - him.h * (0.25 + 0.6 * jitter(i, 122));
      const size = him.h * H.sparkBodies * (last ? 2.2 : 1.3) * bell(Math.min(1, k * 1.6 + 0.2));
      this.ring(this.sparks, perPx, px, py, him.h * H.ringBodies * (last ? 1.6 : 1) * easeOutCubic(k), fall * 0.8);
      this.flare(px, py, size, last || i % 3 === 0 ? PALETTE.hotGold : PALETTE.titleMoonMote, fall, jitter(i, 125) * 0.8);
      const a = (jitter(i, 124) - 0.5) * 2.4, len = him.h * (last ? 1.3 : 0.8) * easeOutCubic(Math.min(1, k * 3));
      this.streak(px, py, a, len, him.h * (last ? 0.06 : 0.035) * (1 - k), PALETTE.titleMoonMote, fall);
      for (let j = 0; j < 4; j++) {
        const g = j / 4 * Math.PI * 2 + jitter(i * 4 + j, 123) * 1.2, d = him.h * (0.15 + 0.45 * easeOutCubic(k)) * (0.6 + 0.6 * jitter(i * 4 + j, 126));
        this.flare(px + Math.cos(g) * d, py + Math.sin(g) * d, him.h * 0.1 * (1 - k), PALETTE.white, fall);
      }
    }
  }

  /** The shaft from the top of the view onto `body` (reached `reach` of the way), a soft glow round a white core. */
  private drawShaft(g: Phaser.GameObjects.Graphics, view: Phaser.Geom.Rectangle, perPx: number, body: CityFightStarfallBody, reach: number,
    alpha: number): void {
    if (alpha <= 0.001) return;
    const B = F.beam, x0 = body.x + B.slant * view.height, y0 = view.y - 8 * perPx, y1 = body.y - body.h * 0.1;
    const x = x0 + (body.x - x0) * reach, y = y0 + (y1 - y0) * reach;
    g.setVisible(true);
    g.lineStyle(B.glowPx * perPx, PALETTE.titleMoonMote, 0.22 * alpha).lineBetween(x0, y0, x, y);
    g.lineStyle(B.glowPx * 0.45 * perPx, PALETTE.titleMoonMote, 0.35 * alpha).lineBetween(x0, y0, x, y);
    g.lineStyle(B.corePx * perPx, PALETTE.white, alpha).lineBetween(x0, y0, x, y);
    if (reach >= 1) this.flare(x, y, body.h * 0.5, PALETTE.white, alpha);
  }

  /** The card's pose: its foot's middle at (x, footY), `w` × `h`, tilted `card.tiltDeg`, turned `turn` (1: face out). */
  private cardPose(x: number, footY: number, w: number, h: number, turn = 1, tiltDeg: number = F.card.tiltDeg): CardPose {
    return { x, footY, w, h, tilt: tiltDeg * Math.PI / 180, turn };
  }

  /** A point of the card (card space) on screen (world px). */
  private cardPoint(p: CardPose, u: number, v: number): Point {
    const lx = u * p.w * p.turn, ly = -v * p.h, c = Math.cos(p.tilt), s = Math.sin(p.tilt);
    return { x: p.x + lx * c - ly * s, y: p.footY + lx * s + ly * c };
  }

  /** Its outline inset `inset` world px (its corners rounding in with it). */
  private cardOutline(p: CardPose, inset = 0): Point[] {
    const r = Math.max(0.5, CARD_RADIUS * p.w - inset);
    return cardRoundRect(0.5 - inset / p.w, inset / p.h, 1 - inset / p.h, r / p.w, r / p.h).map(([u, v]) => this.cardPoint(p, u, v));
  }

  /**
   * The card, drawn in code: its face (or its back, turned past the edge) at `alpha`, its edge glow, the shine sweeping across (`shine` 0..1,
   * null none) and its cream silhouette over it at `cream` (the reveal, the impact frames). `g`: where the silhouette goes when it is not the
   * card's own layer (the impact frames' plate).
   */
  private drawCard(p: CardPose, alpha: number, cream: number, shine: number | null, g: Phaser.GameObjects.Graphics = this.cardG): void {
    const own = g === this.cardG, unit = Math.max(1, p.w * 0.01), back = p.turn < 0;
    for (const index of this.indexes) index.setVisible(false);
    if (own && alpha > 0.001) {
      this.cardG.setVisible(true); this.cardDetail.setVisible(true);
      if (back) this.drawCardBack(p, unit, alpha); else this.drawCardFace(p, unit, alpha);
      const glow = this.cardGlow.setVisible(true);
      glow.lineStyle(p.w * 0.07, PALETTE.titleMoonMote, 0.22 * alpha).strokePoints(this.cardOutline(p, -p.w * 0.02), true, true);
      glow.lineStyle(unit * 0.8, PALETTE.white, 0.6 * alpha).strokePoints(this.cardOutline(p), true, true);
      if (shine !== null && !back) {
        // The shine: a band of light sweeping across along its diagonal, its colour turning ice → violet → gold (a holographic sheen).
        const at = this.cardPoint(p, -0.6 + 1.2 * easeOutCubic(shine), 1.05 - 1.1 * easeOutCubic(shine));
        const tint = shine < 0.33 ? PALETTE.titleMoonMote : shine < 0.66 ? PALETTE.villageMoonShade : PALETTE.hotGold;
        this.streak(at.x, at.y, p.tilt - Math.PI / 4, Math.hypot(p.w, p.h) * 0.9, p.w * 0.08, tint, bell(shine) * alpha);
      }
    }
    if (cream > 0.001) (own ? this.cardCreamG : g).setVisible(true).fillStyle(PALETTE.fxWarmCream, cream).fillPoints(this.cardOutline(p), true);
  }

  /** One image of the card's own light (inside its glass, under its details). */
  private cardLight(key: string, at: Point, w: number, h: number, rotation: number, tint: number, alpha: number, originX = 0.5): void {
    if (alpha <= 0.003 || w <= 0.5 || h <= 0.5) return;
    this.cardLights[this.cardUsed++]?.setTexture(key).setOrigin(originX, 0.5).setPosition(at.x, at.y).setDisplaySize(w, h).setRotation(rotation)
      .setTint(tint).setAlpha(alpha).setVisible(true);
  }

  /**
   * Its face: night glass with a nebula and stars inside, a gold foil edge and frame, an ice hairline, stepped chevrons, a sunburst, the ace
   * of stars cut like a gem in its own breathing light, the gold corner indexes.
   */
  private drawCardFace(p: CardPose, unit: number, alpha: number): void {
    const base = this.cardG, g = this.cardDetail, gold = PALETTE.fxWarmGold, t = this.clockMs, h = p.h, turn = Math.abs(p.turn);
    const puff = this.puffTexture(), flare = this.lightTexture("flare"), ray = this.lightTexture("ray");
    const mid = this.cardPoint(p, CARD_MID[0], CARD_MID[1]), pulse = 0.85 + 0.15 * Math.sin(t * 0.008);
    // The glass: deep night, a lighter inner panel.
    base.fillStyle(PALETTE.villageMoonFill, alpha).fillPoints(this.cardOutline(p), true);
    base.fillStyle(PALETTE.navyInk, 0.85 * alpha).fillPoints(this.cardOutline(p, p.w * 0.05), true);
    // Inside it: a violet and an ice nebula, small stars twinkling, the ace's red light breathing behind it, slow rays.
    this.cardLight(puff, this.cardPoint(p, -0.17, 0.76), p.w * 0.62 * turn, p.w * 0.62, 0, PALETTE.villageMoonShade, 0.32 * alpha);
    this.cardLight(puff, this.cardPoint(p, 0.19, 0.24), p.w * 0.55 * turn, p.w * 0.55, 0, PALETTE.titleMoonMote, 0.22 * alpha);
    for (let i = 0; i < 9; i++) {
      const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 0.006 * (1 + jitter(i, 163)) + i * 1.7)), size = p.w * (0.05 + 0.06 * jitter(i, 164));
      this.cardLight(flare, this.cardPoint(p, (jitter(i, 161) - 0.5) * 0.76, 0.1 + 0.8 * jitter(i, 162)), size * turn, size, 0,
        i % 3 === 0 ? PALETTE.hotGold : PALETTE.white, twinkle * 0.8 * alpha);
    }
    this.cardLight(puff, mid, h * 0.95 * pulse * turn, h * 0.95 * pulse, 0, PALETTE.alarm, 0.5 * alpha);
    this.cardLight(puff, mid, h * 0.45 * turn, h * 0.45, 0, PALETTE.hotGold, 0.28 * alpha);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + t * 0.0006 + p.tilt;
      this.cardLight(ray, mid, h * 0.44, h * 0.035, a, PALETTE.hotGold, 0.32 * alpha * pulse, 0);
    }
    // The frame: gold foil edge and frame, an ice hairline.
    g.lineStyle(unit * 1.8, gold, alpha).strokePoints(this.cardOutline(p), true, true);
    g.lineStyle(unit * 1.1, gold, alpha).strokePoints(this.cardOutline(p, p.w * 0.05), true, true);
    g.lineStyle(unit * 0.5, PALETTE.titleMoonMote, 0.6 * alpha).strokePoints(this.cardOutline(p, p.w * 0.075), true, true);
    // Stepped chevrons top and bottom (Art Deco), three nested V's pointing in.
    for (const [v, dir] of [[0.92, -1], [0.08, 1]] as const) {
      for (let i = 0; i < 3; i++) {
        const half = 0.08 - i * 0.022, dv = 0.035 * CARD_ASPECT;
        const l = this.cardPoint(p, -half, v - dir * i * 0.018), m = this.cardPoint(p, 0, v - dir * i * 0.018 + dir * dv), r = this.cardPoint(p, half, v - dir * i * 0.018);
        g.lineStyle(unit * 0.6, gold, alpha).lineBetween(l.x, l.y, m.x, m.y).lineBetween(m.x, m.y, r.x, r.y);
      }
    }
    // The sunburst in a fine ring, behind the ace.
    g.lineStyle(unit * 0.5, gold, 0.55 * alpha).strokeEllipse(mid.x, mid.y, h * 0.66 * turn, h * 0.66);
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2, from = this.cardPointPolar(p, a, h * 0.2), to = this.cardPointPolar(p, a, h * (i % 2 === 0 ? 0.32 : 0.27));
      g.lineStyle(unit * (i % 2 === 0 ? 0.6 : 0.4), gold, 0.55 * alpha).lineBetween(from.x, from.y, to.x, to.y);
    }
    this.drawAce(g, p, unit, alpha, CARD_MID[0], CARD_MID[1], h * 0.34, h * 0.25, h * 0.065, true);
    // Its heart: a jewel of light; a glint running up its lit ridge.
    g.fillStyle(PALETTE.hotGold, alpha).fillCircle(mid.x, mid.y, h * 0.02);
    this.cardLight(flare, mid, h * 0.32 * pulse * turn, h * 0.32 * pulse, t * 0.001, PALETTE.white, 0.85 * alpha);
    this.cardLight(puff, mid, h * 0.1 * turn, h * 0.1, 0, PALETTE.white, 0.8 * alpha);
    const run = (t * 0.0011) % 1, glint = this.cardPoint(p, CARD_MID[0], CARD_MID[1] + 0.34 * run);
    this.cardLight(flare, glint, h * 0.13 * turn, h * 0.13, 0, PALETTE.white, bell(run) * alpha);
    // The corner indexes: a gold "A" over a red star pip, top left and (turned round) bottom right.
    const corners = [[-0.36, 0.865, 0.775, 0], [0.36, 0.135, 0.225, Math.PI]] as const;
    corners.forEach(([u, vText, vPip, flip], i) => {
      this.drawAce(g, p, unit * 0.5, alpha, u, vPip, h * 0.042, h * 0.031, h * 0.009, false);
      const text = this.indexes[i]!, at = this.cardPoint(p, u, vText), size = h * 0.105 / INDEX_FONT_PX;
      text.setPosition(at.x, at.y).setScale(size * turn, size).setRotation(p.tilt + flip).setAlpha(alpha).setVisible(true);
    });
  }

  /**
   * A four-point star cut like a gem at (u, v) on the card: each arm a lit and a shaded facet (the light from the upper left), a gold rim
   * and, when `ridges`, bright ridges to the tips and dark ones to the waists.
   */
  private drawAce(g: Phaser.GameObjects.Graphics, p: CardPose, unit: number, alpha: number, u: number, v: number, long: number, wide: number,
    waist: number, ridges: boolean): void {
    const at = (x: number, y: number) => this.cardPoint(p, u + x / p.w, v + y / p.h), c = at(0, 0);
    const tips: [number, number][] = [[0, long], [wide, 0], [0, -long], [-wide, 0]];
    const waists: [number, number][] = [[waist, waist], [waist, -waist], [-waist, -waist], [-waist, waist]];
    const light = [-0.6, 0.8] as const, shades = [PALETTE.alarm, TITLE_OPENING_COLORS.redLine, TITLE_OPENING_COLORS.cardSeal, TITLE_OPENING_COLORS.redBottom];
    for (let k = 0; k < 4; k++) {
      const tip = tips[k]!, before = waists[(k + 3) % 4]!, after = waists[k]!;
      for (const side of [before, after]) {
        const mx = (tip[0] + side[0]) / 2, my = (tip[1] + side[1]) / 2, len = Math.max(1e-6, Math.hypot(mx, my));
        const lit = (mx * light[0] + my * light[1]) / len, shade = shades[lit > 0.45 ? 0 : lit > 0 ? 1 : lit > -0.45 ? 2 : 3]!;
        const a = at(tip[0], tip[1]), b = at(side[0], side[1]);
        g.fillStyle(shade, alpha).fillTriangle(c.x, c.y, a.x, a.y, b.x, b.y);
      }
    }
    const outline: Point[] = [];
    for (let k = 0; k < 4; k++) { outline.push(at(tips[k]![0], tips[k]![1])); outline.push(at(waists[k]![0], waists[k]![1])); }
    g.lineStyle(unit * 1.4, PALETTE.fxWarmGold, alpha).strokePoints(outline, true, true);
    if (!ridges) return;
    for (let k = 0; k < 4; k++) {
      const tip = at(tips[k]![0], tips[k]![1]), w = at(waists[k]![0], waists[k]![1]);
      g.lineStyle(unit * 0.8, PALETTE.hotGold, 0.85 * alpha).lineBetween(c.x, c.y, tip.x, tip.y);
      g.lineStyle(unit * 0.5, TITLE_OPENING_COLORS.redInk, 0.5 * alpha).lineBetween(c.x, c.y, w.x, w.y);
    }
  }

  /** Its back: navy, a gold foil edge and frame, a gold lattice, a star medallion in the middle. */
  private drawCardBack(p: CardPose, unit: number, alpha: number): void {
    const g = this.cardDetail, base = this.cardG, gold = PALETTE.fxWarmGold, navy = PALETTE.navyInk;
    base.fillStyle(PALETTE.villageMoonFill, alpha).fillPoints(this.cardOutline(p), true);
    this.cardLight(this.puffTexture(), this.cardPoint(p, 0, 0.5), p.w * 0.9 * Math.abs(p.turn), p.w * 0.9, 0, PALETTE.villageMoonShade, 0.3 * alpha);
    g.lineStyle(unit * 1.8, gold, alpha).strokePoints(this.cardOutline(p), true, true);
    g.lineStyle(unit * 1, gold, alpha).strokePoints(this.cardOutline(p, p.w * 0.05), true, true);
    // The lattice: diagonals both ways inside the frame (in the card's square measure), clipped to it.
    const x0 = -0.41 * p.w, x1 = 0.41 * p.w, y0 = 0.07 * p.h, y1 = 0.93 * p.h, step = p.w * 0.1;
    g.lineStyle(unit * 0.5, gold, 0.55 * alpha);
    for (const sign of [1, -1]) {
      for (let c = -(x1 - x0) - (y1 - y0); c <= (x1 - x0) + (y1 - y0) + y1; c += step) {
        // Y = sign·X + c, X within [x0, x1] and Y within [y0, y1].
        const lo = Math.max(x0, sign > 0 ? y0 - c : c - y1), hi = Math.min(x1, sign > 0 ? y1 - c : c - y0);
        if (hi <= lo) continue;
        const a = this.cardPoint(p, lo / p.w, (sign * lo + c) / p.h), b = this.cardPoint(p, hi / p.w, (sign * hi + c) / p.h);
        g.lineBetween(a.x, a.y, b.x, b.y);
      }
    }
    const mid = this.cardPoint(p, CARD_MID[0], CARD_MID[1]), r = p.w * 0.2, turn = Math.abs(p.turn);
    g.fillStyle(navy, alpha).fillEllipse(mid.x, mid.y, r * 2 * turn, r * 2);
    g.lineStyle(unit * 1, gold, alpha).strokeEllipse(mid.x, mid.y, r * 2 * turn, r * 2);
    this.drawAce(g, p, unit, alpha, CARD_MID[0], CARD_MID[1], r * 0.8, r * 0.6, r * 0.16, false);
  }

  /** A point at `angle` and `radius` world px round the card's middle, in its plane (turned with it). */
  private cardPointPolar(p: CardPose, angle: number, radius: number): Point {
    return this.cardPoint(p, CARD_MID[0] + Math.cos(angle) * radius / p.w, CARD_MID[1] + Math.sin(angle) * radius / p.h);
  }

  /** One impact frame: the plate, the bodies cream, the cut cream across, the clock ring — rays on the first frame, ticks after. */
  private drawImpactFrame(view: Phaser.Geom.Rectangle, perPx: number, hit: CityFightStarfallBody, cardH: number,
    cut: { at: Point; dir: Point; half: number }, frame: number): void {
    const I = F.impact, cream = PALETTE.fxWarmCream;
    this.plate.setVisible(true).fillStyle(PALETTE.navyInk, 1).fillRect(view.x - 8, view.y - 8, view.width + 16, view.height + 16);
    this.copyBodies(this.silhouettes, cream);
    const g = this.plateLines.setVisible(true), cx = hit.x, cy = hit.y - cardH * 0.5;
    g.lineStyle(3 * perPx, cream, 1).lineBetween(cut.at.x - cut.dir.x * cut.half, cut.at.y - cut.dir.y * cut.half,
      cut.at.x + cut.dir.x * cut.half, cut.at.y + cut.dir.y * cut.half);
    const r = view.height * (I.ringViews[frame] ?? I.ringViews[I.ringViews.length - 1]!);
    g.lineStyle((frame === 0 ? 6 : 3) * perPx, cream, 1).strokeCircle(cx, cy, r);
    if (frame === 0) {
      // Slim tapered spikes (wide at the ring, a needle at the tip).
      for (let i = 0; i < I.spikes; i++) {
        const a = (i / I.spikes) * Math.PI * 2 + jitter(i, 21) * 0.2, reach = 1.25 + 0.9 * jitter(i, 22), half = (2 + 4 * jitter(i, 23)) * perPx;
        const cos = Math.cos(a), sin = Math.sin(a), bx = cx + cos * r * 1.08, by = cy + sin * r * 1.08;
        g.fillStyle(cream, 1).fillTriangle(bx - sin * half, by + cos * half, bx + sin * half, by - cos * half, cx + cos * r * reach, cy + sin * r * reach);
      }
      return;
    }
    for (let i = 0; i < I.ticks; i++) {
      const a = (i / I.ticks) * Math.PI * 2, long = i % 5 === 0, inner = long ? 0.8 : 0.9;
      g.lineStyle((long ? 4 : 1.5) * perPx, cream, 1).lineBetween(cx + Math.cos(a) * r * inner, cy + Math.sin(a) * r * inner, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    g.lineStyle(1.5 * perPx, cream, 1).strokeCircle(cx, cy, r * 1.14);
  }

  /** The two fighters' sprites copied onto `images`: filled with `fill`, or as they are drawn (their own tint) when null. */
  private copyBodies(images: readonly Phaser.GameObjects.Image[], fill: number | null): void {
    const actors = this.actors();
    images.forEach((image, i) => {
      const actor = actors[i];
      if (!actor || !actor.visible || !actor.texture) { image.setVisible(false); return; }
      image.setTexture(actor.texture.key, actor.frame.name).setOrigin(actor.originX, actor.originY).setFlipX(actor.flipX)
        .setScale(actor.scaleX, actor.scaleY).setAngle(actor.angle).setPosition(actor.x, actor.y).setAlpha(actor.alpha).setVisible(true);
      if (fill !== null) image.setTintFill(fill);
      else if (actor.isTinted && actor.tintFill) image.setTintFill(actor.tintTopLeft);
      else if (actor.isTinted) image.setTint(actor.tintTopLeft);
      else image.clearTint();
    });
  }

  /** The light column on him: a ray of light from the card's foot up past the top of the view, fading over `k`. */
  private drawColumn(view: Phaser.Geom.Rectangle, hit: CityFightStarfallBody, footY: number, k: number): void {
    if (k <= 0) return;
    const w = hit.h * F.ring.columnBodies, length = footY - view.y + 16;
    this.ray(hit.x, footY, -Math.PI / 2, length * 1.4, w * 0.35 * (0.5 + 0.5 * k), PALETTE.titleMoonMote, k * k, true);
    this.glow(hit.x, footY - hit.h * 0.3, w * 2.2, PALETTE.titleMoonMote, 0.5 * k * k, true);
  }

  /** The clock ring round the card's middle: a thin rim, its ticks (every `major`-th long) and an inner rim. */
  private drawClock(perPx: number, at: Point, r: number, alpha: number): void {
    if (alpha <= 0.001) return;
    const R = F.ring, g = this.back.setVisible(true);
    this.ring(g, perPx, at.x, at.y, r, alpha);
    g.lineStyle(1.2 * perPx, PALETTE.titleMoonMote, alpha * 0.7).strokeCircle(at.x, at.y, r * 0.86);
    for (let i = 0; i < R.ticks; i++) {
      const a = (i / R.ticks) * Math.PI * 2, long = i % R.major === 0, inner = long ? 0.88 : 0.94;
      g.lineStyle((long ? 2.5 : 1.2) * perPx, PALETTE.white, alpha)
        .lineBetween(at.x + Math.cos(a) * r * inner, at.y + Math.sin(a) * r * inner, at.x + Math.cos(a) * r, at.y + Math.sin(a) * r);
    }
  }

  /** The half arcs over the ground closing in on the card's foot, one after another. */
  private drawArcs(view: Phaser.Geom.Rectangle, perPx: number, x: number, footY: number, after: number, fade: number): void {
    const R = F.ring, g = this.back.setVisible(true);
    for (let i = 0; i < R.arcs; i++) {
      const k = clamp01((after - i * 70) / R.arcMs);
      if (k <= 0 || k >= 1) continue;
      const r = view.height * (R.arcFrom + (R.arcTo - R.arcFrom) * easeOutCubic(k));
      for (const [width, color, alpha] of [[8, PALETTE.titleMoonMote, 0.15], [1.5, PALETTE.white, 0.9]] as const) {
        g.lineStyle(width * perPx, color, alpha * (1 - k) * fade);
        g.beginPath(); g.arc(x, footY, r, Math.PI, Math.PI * 2, false); g.strokePath();
      }
    }
  }

  /** The mist rolling out along the ground from the card's foot, then drifting, at `alpha`. */
  private drawMist(view: Phaser.Geom.Rectangle, hit: CityFightStarfallBody, footY: number, after: number, alpha: number): void {
    const M = F.mist, key = this.puffTexture(), half = M.puffs / 2;
    if (alpha <= 0.001) return;
    const grow = easeOutCubic(clamp01(after / M.growMs)), drift = (after / 1000) * M.driftViewsPerSec * view.width;
    this.puffs.forEach((puff, i) => {
      const side = i % 2 === 0 ? -1 : 1, k = Math.floor(i / 2) / half;
      const x = hit.x + side * (view.width * M.spreadViews * (0.04 + 0.96 * k) * grow + drift * (0.5 + k));
      const y = footY - hit.h * (0.06 + 0.16 * jitter(i, 31)) * (1 - 0.4 * k);
      const size = hit.h * M.sizeBodies * (0.7 + 0.6 * jitter(i, 32)) * (1 - 0.35 * k) * (0.45 + 0.55 * grow);
      puff.setTexture(key).setPosition(x, y).setDisplaySize(size * 1.6, size).setTint(PALETTE.fxWarmCream)
        .setAlpha((0.78 - 0.4 * k) * alpha).setVisible(true);
    });
  }

  /** 5. Glass cracks running out over the card from near its middle (`k` of the way): thin lines of light. */
  private drawCracks(perPx: number, p: CardPose, k: number): void {
    if (k <= 0) return;
    const g = this.front.setVisible(true), o = this.cardPoint(p, 0.04, 0.52), reach = Math.min(p.w, p.h) * 0.75;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + jitter(i, 101) * 0.6, length = reach * (0.45 + 0.4 * jitter(i, 102)) * easeOutCubic(k);
      let px = o.x, py = o.y;
      for (let step = 1; step <= 4; step++) {
        const bend = a + (jitter(i * 4 + step, 103) - 0.5) * 0.8, nx = o.x + Math.cos(bend) * length * step / 4, ny = o.y + Math.sin(bend) * length * step / 4;
        g.lineStyle(5 * perPx, PALETTE.titleMoonMote, 0.3).lineBetween(px, py, nx, ny);
        g.lineStyle(1.4 * perPx, PALETTE.white, 1).lineBetween(px, py, nx, ny);
        px = nx; py = ny;
      }
    }
  }

  /** 4. The strike's burst on him: a hot flash and flare, the shockwave of light along the ground, rays out of his middle, glass glints. */
  private drawBurst(view: Phaser.Geom.Rectangle, perPx: number, hit: CityFightStarfallBody, footY: number, after: number): void {
    const B = F.burst, h = hit.h, cx = hit.x, cy = footY - h * 0.45, g = this.front.setVisible(true);
    const flash = clamp01(after / B.flashMs), size = h * B.flashBodies * (0.55 + 0.75 * easeOutCubic(flash));
    if (flash < 1) {
      this.bloom.setTexture(this.puffTexture()).setPosition(cx, cy).setDisplaySize(size, size).setTint(PALETTE.titleMoonMote)
        .setAlpha(cityFightCoveredAlpha(this.cover, cx, cy, size, size, 0, 0.5, (1 - flash) * (1 - flash))).setVisible(true);
      this.flare(cx, cy, h * 2.6 * (0.6 + 0.4 * easeOutCubic(flash)), PALETTE.white, (1 - flash) ** 1.3, flash * 0.4);
    }
    const wave = clamp01(after / B.waveMs);
    if (wave < 1) {
      const rx = view.width * B.waveViews * easeOutCubic(wave), ry = rx * 0.16, fall = 1 - wave;
      for (const [width, color, alpha] of [[16, PALETTE.titleMoonMote, 0.16], [6, PALETTE.titleMoonMote, 0.4], [2, PALETTE.white, 1]] as const) {
        g.lineStyle(width * perPx * (0.5 + 0.5 * fall), color, alpha * fall).strokeEllipse(cx, footY, rx * 2, ry * 2);
      }
    }
    const ray = clamp01(after / B.rayMs);
    if (ray < 1) {
      const grow = easeOutCubic(Math.min(1, ray * 2.5));
      for (let i = 0; i < B.rays; i++) {
        const a = (i / B.rays) * Math.PI * 2 + (jitter(i, 51) - 0.5) * 0.35, inner = h * 0.18;
        this.ray(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner, a, h * B.rayBodies * (0.55 + 0.6 * jitter(i, 52)) * grow,
          h * 0.04 * (1 - 0.6 * ray), i % 4 === 0 ? PALETTE.hotGold : PALETTE.titleMoonMote, (1 - ray) ** 1.2);
      }
    }
    const k = after / B.shardMs;
    if (k < 1) {
      for (let i = 0; i < B.shards; i++) {
        const a = -Math.PI / 2 + (jitter(i, 61) - 0.5) * 2.6, speed = h * (1.1 + 1.5 * jitter(i, 62));
        const x = cx + Math.cos(a) * speed * k, y = cy + Math.sin(a) * speed * k + h * 1.8 * k * k;
        this.flare(x, y, h * (0.1 + 0.12 * jitter(i, 63)), i % 3 === 0 ? PALETTE.hotGold : PALETTE.white, (1 - k * k) * (0.6 + 0.4 * Math.sin(k * 20 + i)),
          k * 6 * (jitter(i, 64) - 0.5));
      }
    }
  }

  /** 7. The fade: the last hit's light swelling softly off him, motes drifting up out of it. */
  private drawFade(him: CityFightStarfallBody, since: number): void {
    const k = clamp01(since / F.fade.ms), cx = him.x, cy = him.y - him.h * 0.5;
    const size = him.h * (1 + (F.fade.bodies - 1) * easeOutCubic(k));
    this.bloom.setTexture(this.puffTexture()).setPosition(cx, cy).setDisplaySize(size, size).setTint(PALETTE.titleMoonMote)
      .setAlpha(cityFightCoveredAlpha(this.cover, cx, cy, size, size, 0, 0.5, 0.85 * Math.pow(1 - k, 1.5))).setVisible(true);
    for (let i = 0; i < F.fade.motes; i++) {
      const a = jitter(i, 131) * Math.PI * 2, r = him.h * (0.3 + 1.2 * jitter(i, 132)) * easeOutCubic(k);
      this.flare(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.6 - him.h * 0.5 * k, him.h * 0.09 * (1 + jitter(i, 133)),
        i % 3 === 0 ? PALETTE.hotGold : PALETTE.white, (1 - k) * 0.9);
    }
  }

  /** A four-point star of arm `r` at (x, y): a flare of light. */
  private star(_g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, color: number, alpha: number): void {
    if (r <= 0.5 || alpha <= 0.001) return;
    this.flare(x, y, r * 2.4, color, alpha);
  }

  /** The soft puff (the mist, the flashes): a white radial falloff (a canvas texture, made once per scene). */
  private puffTexture(): string { return cityFightLightTexture(this.scene, "puff"); }
}
