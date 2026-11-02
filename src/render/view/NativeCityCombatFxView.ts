import type Phaser from "phaser";
import { cityProject, cityUnproject, type CityPoint, type NativeCityDefinition } from "../../world/NativeCityDefinition";
import { VILLAGE_DEPTHS, villageYSorted } from "../depths";
import { clamp01 } from "../../sim/geom";
import { easeOutCubic } from "../art/easing";
import { drawNativeCityCombatFx, nativeCityBodyPressureWave, nativeCityExchangeDrawnByArt, type NativeCityFxArt, nativeCityComicGroundSlam, nativeCityFxLifeMs, pushNativeCityFxElement, nativeCityKumaAuraPrims, nativeCitySlamTelegraphPrims, type NativeCityCombatFxSink,
  type NativeCityExchangeFrame, type NativeCityFxElement, type NativeCityImpactCue, type NativeCityKumaAura, type NativeCitySlamGroundCue,
  type NativeCitySlamTelegraph } from "../effects/NativeCityCombatFx";
import { NATIVE_CITY_EXCHANGE_FX, NATIVE_CITY_SUPER_FX, nativeCityExchangeDizzyPrims, nativeCityExchangeSweatPrims, type NativeCityExchangeCue } from "../effects/NativeCityExchangeFx";
import { nativeCityKumaCounterGaugePrims, nativeCityKumaGradeKeycapLetter, nativeCityKumaGradeMarkPrims } from "../effects/NativeCityKumaGradeMark";
import type { NativeCityKumaGrade } from "../../sim/cityFight/NativeCityCombatTuning";
import { NATIVE_CITY_COMBAT } from "../../sim/cityFight/NativeCityCombatTuning";
import { RopeFxPhaserRenderer } from "../effects/RopeFxPhaserRenderer";
import { nativeCityWireNetDraw, type NativeCityWireNetFrame } from '../effects/NativeCityWireNetFx';
import { WIRE_NET_ART, WIRE_NET_CEL_ANCHORS, WIRE_NET_CELS } from '../../assets/WireNetArtCatalog';
import { preloadSpriteSheets } from '../art/PhaserAssetLoader';
import { artTextureKey } from '../art/ArtFallback';
import { NativeCityImpactSequence, nativeCityHeavyFlowPrims, nativeCityHeavyTrailFrame, type NativeCityHeavyFlowFrame, type NativeCityImpactMotionSample } from "../effects/NativeCityImpactSequence";
import type { NativeCityAttackTrailFrame } from "../effects/NativeCityAttackTrail";
import { NativeCityAttackTrailSequence } from "../effects/NativeCityAttackTrailSequence";
import { nativeCityComicContact, type NativeCitySmashDraw } from "../effects/NativeCityBallSmashFx";
import { NativeCitySmashFlipbookView } from "./NativeCitySmashFlipbookView";
import { NativeCityShockwaveView, type NativeCityShockwaveDraw } from "./NativeCityShockwaveView";
import type { NativeCityFloorDecal } from "./NativeCityFloorDecal";
import { SMASH_FLIPBOOKS, SMASH_GROUND_LAYERS } from "../../assets/NativeCitySmashFxCatalog";
import type { FxPrim } from "../effects/FxPrim";
import { cssHex, FONT, PALETTE } from "../art/palette";
import { DuelComicArtView } from "./DuelComicArtView";
import { CombatSmearArtView } from "./CombatSmearArtView";
import { nativeCityComicArtCommand, nativeCityHypeContact } from "../effects/NativeCityComicArt";
import { NativeCityOttoSlamFx, type NativeCityOttoSlamCue } from "../effects/NativeCityOttoSlamFx";
import { isOttoComboTrail, NativeCityOttoComboFx, type OttoComboContactCue, type OttoSeizureLandingCue } from "../effects/NativeCityOttoComboFx";

/**
 * Above every y-sorted actor (feet are inside the 1080 px plate, so bodies stop below 21.001 + 1.08) and below the near
 * foreground layer (22.4): a contact burst sits over both fighters.
 */
const BURST_DEPTH = villageYSorted(VILLAGE_DEPTHS.actorAdornment, 1200);
/** The grade badge's keycap letter: just over the burst layer that draws the keycap. */
const BADGE_KEY_DEPTH = villageYSorted(VILLAGE_DEPTHS.actorAdornment, 1201);
/**
 * The burst-layer flipbooks this view draws (`NativeCitySmashFxCatalog`): the clean blunt contact, the iron ball's ground impact and a
 * broken guard's shards. The ground dust (dust, skid, puff) is `groundArt`'s; the retired swing cels (gather, swing) are never asked for.
 */
const BURST_FLIPBOOKS = ["contact", "impact", "shatter", "crescent", "crack"] as const;
/**
 * The super's drawn strikes (2026-10-21, `superCrescent` / `superRupture` / `superCrack`): the crescent and the burst this many bodies wide,
 * the crack this many views wide (it swells by `crackSwell` as it is blown out), the shards this many bodies.
 */
/** Glass shards held under a ceiling shrink about their contact no smaller than this share before they move down (`SmashCeilingFit`). */
const SHATTER_UNDER_CEILING_MIN_SHARE = 0.6;

const SUPER_DRAW = Object.freeze({ crescentBodies: 2.1, ruptureBodies: 2.6, crackViews: 1.25, crackSwell: 0.14, shatterBodies: 3.2 });
const SUPER_STRIKES: ReadonlySet<string> = new Set(["superCrescent", "superRupture", "superCrack"]);

const WIRE_NET_DEPTH = BURST_DEPTH - .0003;
/** KUMA's aura sits just behind his body at his feet' y (`villageYSorted(actorBody, y)`), so he is drawn over it. */
const AURA_BEHIND = 0.0004;

/**
 * 마을 대결의 절차 이펙트를 그린다(`NativeCityCombatFx`). 바닥 층(발밑 빛·먼지 고리·충격파·예고·기 모으기 발밑 빛)은 접지
 * 먼지 깊이에, 접촉 층(심·초승달·혜성·흰 섬광)은 배우들 위에, 쿠마 기 모으기(테·리본·몸 빛)는 그의 몸 바로 뒤에 앉는다.
 * 효과 시계는 진행자가 주는 배율로 흐르고(히트스톱 동안 반속, 슬로모 동안 그 배율), 접촉 심은 화면 시계다. 월드 카메라
 * 전용 — 씬이 UI 카메라를 만들기 전에 만든다.
 */
export class NativeCityCombatFxView implements NativeCityCombatFxSink {
  private readonly ground: RopeFxPhaserRenderer;
  private readonly burst: RopeFxPhaserRenderer;
  private readonly aura: RopeFxPhaserRenderer;
  private elements: NativeCityFxElement[] = [];
  private nowMs = 0;
  private screenMs = 0;
  private net: NativeCityWireNetFrame | null = null;

  private readonly netCel: Phaser.GameObjects.Sprite;
  private readonly impactSequence = new NativeCityImpactSequence();
  private heavy: NativeCityHeavyFlowFrame | null = null;
  private readonly trails = new NativeCityAttackTrailSequence();
  private readonly smashArt: NativeCitySmashFlipbookView;
  private readonly comicArt: DuelComicArtView;
  /** The drawn swing smears (`CombatSmear`), just under the contact art. */
  private readonly smearArt: CombatSmearArtView;
  private readonly fresh = new WeakSet<NativeCityFxElement>();
  private readonly shockwaves: NativeCityShockwaveView;
  /** The ground dust flipbooks (dust, skid, puff) as 3D cards on their ground point (B072: on the 2D layer they drew over buildings). */
  private readonly groundArt: NativeCitySmashFlipbookView;
  /** The 3D card view draws the floor: the ground shapes and pressure rings go to its floor layer (`floorDecals`), not the 2D layer. */
  private floorInSpatial = false;
  private decals: NativeCityFloorDecal[] = [];
  private reducedMotion = false;
  private readonly ottoSlams = new NativeCityOttoSlamFx();
  private readonly ottoCombo = new NativeCityOttoComboFx();
  /** The grade badge's keycap letter (2026-10-19 D3 — `nativeCityKumaGradeKeycapLetter`): the best answer's key as bound now. */
  private readonly badgeKey: Phaser.GameObjects.Text;
  private gradeKeys: Readonly<Record<NativeCityKumaGrade, string>> | null = null;

  /** A super's cut-in plays (2026-10-21): the grade badge, its ring and keycap stay off the stage until the super resolves. */
  private quiet = false;
  setQuiet(quiet: boolean): void { this.quiet = quiet; }

  /** Each grade's best-answer key as bound now (white V, gold X, red C — `triangle.best`), lettered on the badge's keycap. */
  setGradeKeys(keys: Readonly<Record<NativeCityKumaGrade, string>> | null): void { this.gradeKeys = keys; }

  clearMotion(): void {
    this.ottoCombo.clear();
    this.ottoSlams.clear(); this.groundArt.draw([]);
    this.impactSequence.clear(); this.smashArt.draw([]);
    this.shockwaves.draw([]);
    this.comicArt.clear();
    this.smearArt.draw([]);
    this.elements = []; this.heavy = null; this.net = null; this.netCel.setVisible(false); this.trails.clear(); this.badgeKey.setVisible(false);
  }
  heavyFlow(frame: NativeCityHeavyFlowFrame | null): void { this.heavy = frame; }
  attackTrails(frames: readonly NativeCityAttackTrailFrame[], reducedMotion = false): void {
    this.reducedMotion = reducedMotion;
    this.ottoCombo.update(frames, point => cityProject(point, this.projection()), reducedMotion);
    if (reducedMotion) {
      this.ottoSlams.clear();
      this.trails.clear(); this.impactSequence.clear(); this.smashArt.draw([]); this.shockwaves.draw([]); return;
    }
    // Start loading during anticipation, before a cold first contact needs its core frame (and the landing dust its sheet).
    if (frames.length || this.heavy || this.net) { this.smashArt.prepare(); this.groundArt.prepare(); }
    // The iron-ball smash draws no ribbon: his drawn keyposes carry that swing.
    this.trails.update([...frames.filter(f => f.technique !== "ballSmash" && !isOttoComboTrail(f)), ...(this.heavy ? [nativeCityHeavyTrailFrame(this.heavy)] : [])],
      point => cityProject(point, this.projection()));
  }

  motionFrame(dtMs: number, bodies: readonly NativeCityImpactMotionSample[]): void {
    this.impactSequence.frame(dtMs, bodies);
  }

  wireNet(frame: NativeCityWireNetFrame | null): void { this.net = frame; }

  /**
   * `ceiling`: the highest world y the glass shards (a broken guard's, a super's — `shatter`) may reach now (the arena's face HUD floor,
   * 2026-10-24); absent, anywhere. The super's screen crack is the glass in front of the screen: it is not held under it.
   */
  constructor(private readonly scene: Phaser.Scene, private readonly projection: () => NativeCityDefinition, ceiling: (() => number) | null = null) {
    this.netCel = scene.add.sprite(0, 0, "__DEFAULT").setVisible(false).setDepth(WIRE_NET_DEPTH).setName("native-city-wire-net");
    this.badgeKey = scene.add.text(0, 0, "", { fontFamily: FONT.hudSans, fontSize: "48px", fontStyle: "bold", color: cssHex(PALETTE.navyInk),
      align: "center" }).setOrigin(0.5).setResolution(2).setDepth(BADGE_KEY_DEPTH).setVisible(false).setName("native-city-kuma-grade-key");
    preloadSpriteSheets(scene, [WIRE_NET_ART]);
    if (!scene.load.isLoading() && scene.load.list.size > 0) scene.load.start();
    this.smashArt = new NativeCitySmashFlipbookView(scene, BURST_DEPTH, BURST_FLIPBOOKS, null,
      ceiling ? { kinds: ["shatter"], ceiling, minShare: SHATTER_UNDER_CEILING_MIN_SHARE } : null);
    this.groundArt = new NativeCitySmashFlipbookView(scene, BURST_DEPTH, ["dust", "skid", "puff", "ottoRock"], { behindPx: 2 });
    this.comicArt = new DuelComicArtView(scene, BURST_DEPTH);
    this.smearArt = new CombatSmearArtView(scene, BURST_DEPTH - .0002);
    const groundDepth = VILLAGE_DEPTHS.actorFootDust;
    this.shockwaves = new NativeCityShockwaveView(scene, groundDepth, BURST_DEPTH - .0001);
    this.ground = new RopeFxPhaserRenderer(scene, groundDepth, groundDepth, "native-city-combat-ground-fx", groundDepth, 4);
    this.burst = new RopeFxPhaserRenderer(scene, BURST_DEPTH, BURST_DEPTH, "native-city-combat-burst-fx", BURST_DEPTH, 6);
    this.aura = new RopeFxPhaserRenderer(scene, VILLAGE_DEPTHS.actorBody, VILLAGE_DEPTHS.actorBody, "native-city-kuma-aura-fx",
      VILLAGE_DEPTHS.actorBody, 2);
  }

  /** The ground dust cards (the scene stands them up with the fight's other card sprites). */
  get cardObjects(): readonly Phaser.GameObjects.Sprite[] { return this.groundArt.objects; }

  /** This frame's floor-layer shapes (plan) while the 3D card view draws the floor (`setFloorInSpatial`). */
  get floorDecals(): readonly NativeCityFloorDecal[] { return this.decals; }

  /** The 3D card view draws the floor this frame: the ground shapes and pressure rings move to its floor layer. */
  setFloorInSpatial(on: boolean): void { this.floorInSpatial = on; }

  impact(cue: NativeCityImpactCue): void {
    if (!cue.reducedMotion && (nativeCityComicContact(cue) || (cue.skidUnits ?? 0) >= cue.stepUnits * NATIVE_CITY_COMBAT.feel.fx.sequence.minTravelStrides)) {
      this.smashArt.prepare(); this.groundArt.prepare();
    }
    this.impactSequence.impact(cue);
    this.add({ kind: "impact", cue, bornMs: this.nowMs, bornScreenMs: this.screenMs });
  }

  slamGround(cue: NativeCitySlamGroundCue): void { this.add({ kind: "slam", cue, bornMs: this.nowMs, bornScreenMs: this.screenMs }); }

  ottoSlam(cue: NativeCityOttoSlamCue | null): void {
    if (cue) this.groundArt.prepare();
    this.ottoSlams.sync(cue);
  }

  ottoComboContact(cue: OttoComboContactCue): void { this.ottoCombo.contact(cue); }
  ottoSeizureLanding(cue: OttoSeizureLandingCue): void { this.ottoCombo.land(cue); }

  /** The first rising pile is the actual ground contact, including a miss. Its existing event supplies the thump. */
  ottoGroundImpact(cue: NativeCityOttoSlamCue): void {
    const first = cue.rocks[0];
    if (first) this.ottoCombo.land({ feet: first.center, bodyPx: cue.bodyPx, reducedMotion: cue.reducedMotion });
  }

  exchange(cue: NativeCityExchangeCue): void {
    // The drawn ground dust takes over a slide's / duck's / KO's dust once its sheets are in: ask for them with the first exchange.
    if (!cue.reducedMotion) this.groundArt.prepare();
    this.add({ kind: "exchange", cue, bornMs: this.nowMs, bornScreenMs: this.screenMs });
  }

  /** At most `rules.maxConcurrentFx` live effects (the recipes' cap): the oldest one gives way. */
  private add(element: NativeCityFxElement): void {
    this.fresh.add(element);
    pushNativeCityFxElement(this.elements, element, NATIVE_CITY_EXCHANGE_FX.rules.maxConcurrentFx);
  }

  frame(dtMs: number, rate: number, telegraph: NativeCitySlamTelegraph | null, aura: NativeCityKumaAura | null, stepUnits: number,
    exchange?: NativeCityExchangeFrame): void {
    const dt = Number.isFinite(dtMs) ? Math.max(0, Math.min(100, dtMs)) : 0;
    this.screenMs += dt;
    const fxDt = dt * (Number.isFinite(rate) ? Math.max(0, rate) : 1);
    this.nowMs += fxDt;
    // Every confirmed contact presents frame zero, including a slow first render.
    this.elements = this.elements.map(element => this.fresh.has(element)
      ? { ...element, bornMs: this.nowMs, bornScreenMs: this.screenMs } : element);
    // Released trails erase on screen time: gone within two frames of the contact, frozen or not.
    this.trails.frame(dt);
    this.ottoCombo.frame(dt);
    this.elements = this.elements.filter(element => this.nowMs - element.bornMs < nativeCityFxLifeMs(element));
    const definition = this.projection();
    const project = (point: CityPoint) => cityProject(point, definition);
    const art = this.fxArt();
    const layers = drawNativeCityCombatFx(this.elements, this.nowMs, project, this.screenMs, undefined, undefined, art);
    const contacts = this.elements.flatMap(e => {
      const command = nativeCityComicArtCommand(e, this.screenMs, project);
      return command ? [command] : [];
    });
    const blocked = this.elements.flatMap(e => {
      // The iron ball's ground impact has its own drawn cels (`impact`, 2026-10-17) once they are in: no light-layer slam (star, gold
      // needles, sparks, stones) over them — one owner for the beat. Until the sheet is in, the light layer stands in.
      if (e.kind === "slam" && e.cue.technique === "ballSmash" && this.smashArt.ready("impact")) return [];
      // A broken guard's shards are drawn (`shatter`, 2026-10-17) once they are in — not the light layer's procedural ones too.
      if (e.kind === "exchange" && e.cue.kind === "guardShatter" && this.smashArt.ready("shatter")) return [];
      const contact = nativeCityHypeContact(e, this.screenMs, project);
      return contact ? [contact] : [];
    });
    this.comicArt.draw(this.reducedMotion ? [] : contacts, this.reducedMotion ? [] : blocked, this.screenMs);
    const sequence = this.impactSequence.draw(project);
    const charge = aura ? nativeCityKumaAuraPrims(aura, project) : null;
    const ground = [...(telegraph ? nativeCitySlamTelegraphPrims(telegraph, stepUnits, project) : []), ...(charge?.ground ?? []), ...layers.ground, ...sequence.ground];
    // On the 3D view the ground shapes lie on its floor layer (buildings in front cover them); the 2D layer draws them only without it.
    this.decals = this.floorInSpatial ? groundPrimDecals(ground, definition) : [];
    this.ground.draw(this.floorInSpatial ? [] : ground, this.elements.length + (telegraph ? 1 : 0) + (charge ? 1 : 0));
    const dizzy = exchange?.dizzy;
    const stars = dizzy ? nativeCityExchangeDizzyPrims(dizzy.head, dizzy.scale, dizzy.timeMs, dizzy.alpha, dizzy.reducedMotion) : [];
    const sweat = exchange?.sweat, poise = NATIVE_CITY_COMBAT.feel.tells.poise;
    const live = this.quiet ? null : exchange?.gradeMark, gauge = this.quiet ? null : exchange?.counterGauge;
    const markLift = NATIVE_CITY_COMBAT.feel.tells.gradeMark.liftPx;
    // The badge drawn: the live one, else the one playing out its answer (2026-10-20 `gradeMark.resolve` — the cues hand one or the other).
    const ending = live || this.quiet ? null : exchange?.gradeMarkResolve ?? null, shown = live ?? ending;
    // The link window's keycap is the "attack now" magenta, not the white grade's pearl (2026-10-19 신호 정리); its pop brightens out of it.
    const mark = shown ? { grade: shown.grade, ageMs: shown.ageMs, scale: 1, reducedMotion: shown.reducedMotion,
      at: [project(shown.feet)[0], project(shown.feet)[1] - shown.bodyPx - markLift] as const,
      ...shown.attackNow ? { color: PALETTE.fightAttackNow } : {}, ...ending ? { outcome: ending.outcome } : {} } : null;
    const tells = [...sweat ? nativeCityExchangeSweatPrims(sweat.head, sweat.scale, sweat.timeMs, poise.sweatEveryMs, poise.sweatLifeMs) : [],
      // V's counter gauge rings the badge (behind its icon).
      ...gauge ? nativeCityKumaCounterGaugePrims({ fill: gauge.fill, open: gauge.open, ...gauge.draining ? { draining: true } : {}, timeMs: gauge.timeMs, scale: 1,
        reducedMotion: gauge.reducedMotion, at: [project(gauge.feet)[0], project(gauge.feet)[1] - gauge.bodyPx - markLift] }) : [],
      ...mark ? nativeCityKumaGradeMarkPrims(mark) : []];
    // The keycap's letter over the badge's face (a text: the key is the player's binding — keyboard or pad); it rides the answer's press and pop.
    const letter = mark ? nativeCityKumaGradeKeycapLetter(mark) : null, keyText = mark ? this.gradeKeys?.[mark.grade] ?? "" : "";
    if (letter && keyText) {
      if (this.badgeKey.text !== keyText) this.badgeKey.setText(keyText);
      this.badgeKey.setPosition(letter.x, letter.y).setAlpha(letter.alpha).setVisible(true)
        .setScale(letter.heightPx / Math.max(1, this.badgeKey.height) * Math.min(1, 2 / Math.max(1, keyText.length)));
    } else this.badgeKey.setVisible(false);
    const landings = this.impactSequence.landingFrames(project);
    const waves: NativeCityShockwaveDraw[] = landings.map(c => ({ x: c.x, y: c.y, width: c.width * 1.35,
      height: c.width * .32, ageMs: c.ageMs, ground: true, seed: 23 }));
    waves.push(...this.ottoCombo.waves(project));
    // The iron-ball swing's old raster cels (the yellow gather blob and swing crescent) are retired (2026-10-17 쿠마전 액션 개편): his
    // drawn keyposes (the scoop, the arch, the smear frame) carry the swing now.
    const raster: NativeCitySmashDraw[] = [...landings, ...this.impactSequence.skidFrames(project), ...this.ottoSlams.draw(project)];
    for (const e of this.elements) {
      if (e.kind === "exchange" && SUPER_STRIKES.has(e.cue.kind)) {
        const drawn = this.superStrike(e.cue, this.nowMs - e.bornMs, this.screenMs - e.bornScreenMs, project);
        // The crack is the glass in front of the screen, but drawn first: the crescent under it must still read.
        if (e.cue.kind === "superCrack") raster.unshift(...drawn); else raster.push(...drawn);
        continue;
      }
      if (e.kind === "exchange" && e.cue.kind === "guardShatter" && !e.cue.reducedMotion) {
        // "깨짐!": the guard bursts like a padlock popping, on the fight clock (held through the freeze, released with it).
        const c = e.cue, [px, py] = project(c.feet), [dx] = project([c.feet[0] + c.direction[0], c.feet[1] + c.direction[1]]);
        raster.push({ kind: "shatter", x: px + (c.offsetPx?.[0] ?? 0), y: py + (c.offsetPx?.[1] ?? 0) - c.height * c.bodyPx,
          width: c.bodyPx * .62, ageMs: this.nowMs - e.bornMs, flipX: dx < px });
        continue;
      }
      if (e.kind === "exchange" && nativeCityExchangeDrawnByArt(e.cue, art)) {
        // The ground dust in the drawn hand (2026-10-17 이펙트 화풍 통일 — the procedural ring and puffs read flat; 2026-10-18 the slide's
        // bloom and the dodge's puffs too): the knocked-out body lands in the big dust, a slide kicks the skid back along the cue's
        // direction (the art trails left of its leading edge), a duck stirs a small puff.
        const c = e.cue, [px, py] = project(c.feet), x = px + (c.offsetPx?.[0] ?? 0), y = py + (c.offsetPx?.[1] ?? 0);
        const [dx] = project([c.feet[0] + c.direction[0], c.feet[1] + c.direction[1]]);
        raster.push(c.kind === "koDustRing" ? { kind: "dust", x, y, width: c.bodyPx * 1.4, ageMs: this.nowMs - e.bornMs }
          : c.kind === "slideDust" ? { kind: "skid", x, y, width: c.bodyPx * 1.2, ageMs: this.nowMs - e.bornMs, flipX: dx > px }
          : { kind: "puff", x, y, width: c.bodyPx * .9, ageMs: this.nowMs - e.bornMs });
        continue;
      }
      if (e.kind === "exchange" || e.cue.reducedMotion) continue;
      const c = e.cue;
      if (e.kind === "impact") {
        const hit = e.cue;
        if (nativeCityBodyPressureWave(hit)) {
          const [x, y] = project(hit.victim);
          const [dx, dy] = project([hit.victim[0] + hit.direction[0], hit.victim[1] + hit.direction[1]]);
          const inset = Math.cos(Math.atan2(dy - y, dx - x)) * (hit.contactInset ?? NATIVE_CITY_COMBAT.feel.fx.contactInset) * hit.bodyPx;
          waves.push({ x: x - inset, y: y - hit.contactHeight * hit.bodyPx, width: hit.bodyPx * 1.25, height: hit.bodyPx * 1.1,
            ageMs: this.screenMs - e.bornScreenMs, ground: false, seed: hit.seed });
        }
        const contact = nativeCityComicArtCommand(e, this.screenMs, project);
        if (!nativeCityComicContact(hit) || (contact && this.comicArt.ready(contact.kind))) continue;
        const [x, y] = project(hit.victim), [dx, dy] = project([hit.victim[0] + hit.direction[0], hit.victim[1] + hit.direction[1]]);
        const angle = Math.atan2(dy - y, dx - x);
        raster.push({ kind: "contact", x: x - Math.cos(angle) * (hit.contactInset ?? NATIVE_CITY_COMBAT.feel.fx.contactInset) * c.bodyPx,
          y: y - hit.contactHeight * c.bodyPx, width: c.bodyPx * (hit.tier === "light" ? .43 : .6),
          ageMs: this.screenMs - e.bornScreenMs, flipX: Math.cos(angle) > 0 });
      } else {
        if (!nativeCityComicGroundSlam(e.cue)) continue;
        const seated = e.cue.technique === "buttSlam";
        const [x, y] = project(e.cue.center);
        if (!seated) {
          // The iron ball meets the ground (2026-10-17, user's pick "B"): one ink-and-gold impact driven down along the blow, held by the
          // fight clock through the freeze — no yellow dust cloud, no body-wide yellow ring (one owner per beat).
          const [fx] = project(e.cue.feet);
          raster.push({ kind: "impact", x, y: y - .12 * c.bodyPx, width: c.bodyPx * 1.05, ageMs: this.nowMs - e.bornMs, flipX: x > fx });
          continue;
        }
        raster.push({ kind: "dust", x, y, width: c.bodyPx * (seated ? 1.65 : 1.2), ageMs: this.nowMs - e.bornMs });
        // Contact pressure expands during the freeze; the longer dust tail follows fight time.
        waves.push({ x, y, width: c.bodyPx * (seated ? 2.05 : 1.7), height: c.bodyPx * (seated ? .52 : .42),
          ageMs: seated ? this.screenMs - e.bornScreenMs : this.nowMs - e.bornMs, ground: true, seed: c.seed });
      }
    }
    this.smashArt.draw(this.reducedMotion ? [] : raster.filter(draw => !SMASH_GROUND_LAYERS.has(draw.kind)));
    this.groundArt.draw(this.reducedMotion ? [] : raster.filter(draw => SMASH_GROUND_LAYERS.has(draw.kind)));
    // The ground pressure rings: the 3D floor's rings on its view (the shader would draw over buildings), else the shader.
    if (this.floorInSpatial && !this.reducedMotion) for (const wave of waves) if (wave.ground) this.decals.push(...groundWaveDecals(wave, definition));
    this.shockwaves.draw(this.reducedMotion ? [] : this.floorInSpatial ? waves.filter(wave => !wave.ground) : waves);
    this.smearArt.draw(this.reducedMotion ? [] : this.trails.smears(project));
    // The C1 net: its cel (drawn art) and its cord and glints (code); a still wrap under reduced motion (`nativeCityWireNetDraw`).
    const net = this.drawNet();
    const motion = [...net, ...this.reducedMotion ? [] : [...this.trails.draw(project, this.smearArt.ready), ...nativeCityHeavyFlowPrims(this.heavy),
      ...sequence.burst, ...this.ottoCombo.draw(project)]];
    const burst = [...motion, ...layers.burst, ...stars, ...tells];
    this.burst.draw(burst, this.elements.length + (stars.length > 0 ? 1 : 0) + (tells.length > 0 ? 1 : 0));
    if (aura) {
      // surface, where the opponent-side flames are faint instead).
      const y = Math.min(project(aura.feet)[1], aura.opponent ? project(aura.opponent)[1] : Number.POSITIVE_INFINITY);
      const depth = villageYSorted(VILLAGE_DEPTHS.actorBody, y) - AURA_BEHIND;
      this.aura.setDepths(depth, depth, depth);
    }
    this.aura.draw(charge?.back ?? [], charge ? 1 : 0);
  }

  /** The net's cel on its sprite (hidden until the sheet is in, or with no net); returns its cord and glints. */
  /** What the raster side can draw this frame (`drawNativeCityCombatFx` leaves those beats to it). */
  private fxArt(): NativeCityFxArt {
    return { comicContact: this.smashArt.ready("contact"), contacts: this.comicArt.readiness(), groundDust: this.groundArt.ready("dust"),
      skidDust: this.groundArt.ready("skid"), puffDust: this.groundArt.ready("puff") };
  }

  private drawNet() {
    const net = this.net ? { ...this.net, reducedMotion: this.net.reducedMotion || this.reducedMotion } : null;
    const draw = nativeCityWireNetDraw(net), cel = draw.cel;
    if (!cel || artTextureKey(this.scene, WIRE_NET_ART.key, "decorative") === null) { this.netCel.setVisible(false); return draw.prims; }
    const [cx, cy] = WIRE_NET_CEL_ANCHORS[cel.name].centre;
    this.netCel.setTexture(WIRE_NET_ART.key, WIRE_NET_CELS.indexOf(cel.name)).setOrigin(cel.flipX ? 1 - cx : cx, cy).setFlipX(cel.flipX)
      .setPosition(cel.x, cel.y).setScale(cel.width / WIRE_NET_ART.frameWidth).setAlpha(cel.alpha).setVisible(true);
    return draw.prims;
  }

  /** Live effects (capture labels, debugging). */
  get count(): number { return this.elements.length; }

  /**
   * A super's drawn strike at `ageMs` (effect clock — still through the freeze, slow through a slow-mo): the gold crescent on the contact
   * (drawn travelling right: flipped for a blow to the left), the ground burst under him (drawn driven down-left: flipped for a blow to the
   * right); the screen crack round the KO contact at `screenAgeMs` — held, then swelling out and fading while the shards fly
   * (`NATIVE_CITY_SUPER_FX`).
   */
  private superStrike(c: NativeCityExchangeCue, ageMs: number, screenAgeMs: number,
    project: (point: CityPoint) => readonly [number, number]): NativeCitySmashDraw[] {
    const [px, py] = project(c.feet), x = px + (c.offsetPx?.[0] ?? 0), y = py + (c.offsetPx?.[1] ?? 0) - c.height * c.bodyPx;
    const toward = c.blow ?? c.direction, [dx] = project([c.feet[0] + toward[0], c.feet[1] + toward[1]]), right = dx >= px;
    if (c.kind === "superCrescent") return [{ kind: "crescent", x, y, width: c.bodyPx * SUPER_DRAW.crescentBodies, ageMs, flipX: !right }];
    if (c.kind === "superRupture") {
      return [{ kind: "impact", x, y, width: c.bodyPx * SUPER_DRAW.ruptureBodies * (c.drawnScale ?? 1), ageMs, flipX: right,
        ...(c.behindBodies ? { behind: true } : {}) }];
    }
    const F = NATIVE_CITY_SUPER_FX, blow = clamp01((screenAgeMs - F.crackHoldMs) / F.crackBlowMs), view = this.scene.cameras.main.worldView;
    const crack: NativeCitySmashDraw = { kind: "crack", x, y, width: view.width * SUPER_DRAW.crackViews * (1 + SUPER_DRAW.crackSwell * easeOutCubic(blow)),
      ageMs: 0, alpha: 1 - blow * blow };
    if (blow >= 1) return [];
    // The shards from the sheet's third cel on: its first two are the guard's keyhole plate, not glass.
    const shards = screenAgeMs - F.crackHoldMs + SMASH_FLIPBOOKS.shatter.durationsMs.slice(0, 2).reduce((a, b) => a + b, 0);
    return blow > 0 ? [crack, { kind: "shatter", x, y, width: c.bodyPx * SUPER_DRAW.shatterBodies, ageMs: shards, flipX: !right }] : [crack];
  }

  destroy(): void {
    this.netCel.destroy();
    this.ground.destroy();
    this.burst.destroy();
    this.aura.destroy();
    this.smashArt.destroy();
    this.groundArt.destroy();
    this.comicArt.destroy();
    this.smearArt.destroy();
    this.shockwaves.destroy();
  }
}

/** Screen-space ground shapes carried onto the 3D floor (plan): each polygon unprojected point by point (a floor point projects
 *  exactly there), a light pool as three nested ellipses (its soft falloff in steps). */
function groundPrimDecals(prims: readonly FxPrim[], projection: NativeCityDefinition): NativeCityFloorDecal[] {
  const out: NativeCityFloorDecal[] = [];
  const plan = (x: number, y: number) => cityUnproject([x, y], projection);
  for (const prim of prims) {
    if (prim.kind === "poly") {
      const points: CityPoint[] = [];
      for (let i = 0; i + 1 < prim.points.length; i += 2) points.push(plan(prim.points[i]!, prim.points[i + 1]!));
      if (points.length >= 3) out.push({ points, concave: true, fill: prim.color, fillAlpha: prim.alpha, edge: prim.color, edgeAlpha: 0, edgeWidth: 0 });
    } else {
      const ry = prim.radius * (prim.squash ?? 1);
      for (const share of [1, .66, .33]) {
        const points: CityPoint[] = [];
        for (let i = 0; i < 20; i++) {
          const a = i / 20 * Math.PI * 2;
          points.push(plan(prim.x + Math.cos(a) * prim.radius * share, prim.y + Math.sin(a) * ry * share));
        }
        out.push({ points, fill: prim.color, fillAlpha: prim.alpha * .4, edge: prim.color, edgeAlpha: 0, edgeWidth: 0 });
      }
    }
  }
  return out;
}

/** A ground pressure wave on the 3D floor: the shader's expanding front (`DUEL_SHOCKWAVE_FRAGMENT` — 230 ms burst, 540 ms life) as an
 *  ink-rimmed orange ring, thinning and fading as it widens. */
function groundWaveDecals(wave: NativeCityShockwaveDraw, projection: NativeCityDefinition): NativeCityFloorDecal[] {
  if (wave.ageMs < 0 || wave.ageMs >= 540) return [];
  const burst = Math.min(1, wave.ageMs / 230), expand = 1 - (1 - burst) ** 2.6;
  const k = Math.max(0, Math.min(1, (burst - .24) / .76)), front = .12 + expand * .72, fade = 1 - k * k * (3 - 2 * k);
  if (fade <= .01) return [];
  const rx = wave.width / 2 * front, ry = wave.height / 2 * front, points: CityPoint[] = [];
  for (let i = 0; i < 32; i++) {
    const a = i / 32 * Math.PI * 2;
    points.push(cityUnproject([wave.x + Math.cos(a) * rx, wave.y + Math.sin(a) * ry], projection));
  }
  // Ring width in plan: the screen band (4.6 % of the wave thinning to 1.3 %) over the depth axis's px per plan unit.
  const pxPerPlan = Math.hypot(projection.projection.x[1], projection.projection.y[1]);
  const width = wave.height / 2 * (.046 + (.013 - .046) * burst) * 2 / pxPerPlan;
  return [
    { points, fill: PALETTE.webtoonInk, fillAlpha: 0, edge: PALETTE.webtoonInk, edgeAlpha: .55 * fade, edgeWidth: width * 2.2 },
    { points, fill: PALETTE.combatNeonOrange, fillAlpha: 0, edge: PALETTE.combatNeonOrange, edgeAlpha: .85 * fade, edgeWidth: width },
  ];
}
