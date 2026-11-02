import Phaser from "phaser";
import { readRuntimeOptions } from "../../app/RuntimeOptions";
import { effectiveReducedMotion, playerSettingsFor } from "../accessibility/AccessibilityRuntime";
import { easeOutCubic } from "../art/easing";
import { PALETTE } from "../art/palette";
import { sfx } from "../audio/sfx";
import { uiSoundSetOf, type UiSoundSet } from "../audio/ui";
import { UI_FEEDBACK_DEPTH_LIFT } from "../depths";
import {
  CENTER_ANCHOR,
  UI_FEEDBACK,
  bracketArm,
  breatheOffset,
  curveAt,
  curveDone,
  framePunchOutset,
  pressBurstFrame,
  pressedScale,
  rejectShakeOffset,
  restingBounds,
  restingLift,
  retarget,
  sameSlot,
  scaleRectAbout,
  sheenPolygon,
  tapHoldMs,
  trackRest,
  type RestTrack,
  type UiAnchor,
  type UiCurve,
  type UiFeedbackIntensity,
  type UiPoint,
  type UiRect,
} from "./UiFeedbackSpec";

/**
 * 공용 UI 반응 — 호버·누름·거절·포커스.
 *
 * 모든 씬에 게임 설정의 씬 플러그인(`UiFeedbackPlugin.ts`)으로 설치된다. 손 모양 커서를 가진
 * 인터랙티브 오브젝트(`setInteractive({ useHandCursor: true })`)는 아무 것도 하지 않아도
 * 반응한다: 호버에 황동 꺾쇠·빛줄기·가벼운 틱, 누름에 섬광·인장 테·불티·딸깍. 손 커서가 없는
 * 막(스크림·입력 차단막)은 버튼이 아니므로 반응하지 않는다.
 *
 * 씬이 더 알려 줄 것이 있을 때만 `uiFeedback(target, options)` 로 등록한다 — 히트 zone 이
 * 그림과 따로 있을 때 함께 움직일 그림(`visuals`), 꺼진 상태(`isEnabled`), 입력을 받지 않는 순간
 * (`suppressed`), 이미 제 소리를 가진 메뉴(`sound: false`), 키보드·패드 커서(`setFocused`)와
 * 확정(`press`). 월드에 박힌 클릭 대상(마을 건물·경매장 손님처럼 제 연출을 가진 것)은
 * `exemptFromUiFeedback`.
 *
 * 누름은 창의 캡처 단계에서 잡는다. Phaser 는 대상의 `pointerdown` 핸들러를 먼저 부르고,
 * 그 핸들러가 버튼을 다시 그리거나(파괴) 씬을 넘기면 씬 단위 `gameobjectdown` 을 건너뛴다.
 * 버튼이 사라져도 섬광은 누른 자리에 남아야 "눌렸다"가 읽힌다. 무엇을 눌렀는지는 호버 장부가
 * 아니라 그 순간 Phaser 의 히트 판정(맨 위 씬의 맨 위 오브젝트)으로 정한다 — 불투명한 막이
 * 덮은 버튼이나 움직이지 않고 누른 클릭도 Phaser 가 실제로 처리할 대상과 같다.
 *
 * 몸짓(떠오름·눌림·떨림)은 오브젝트에 "자기가 준 차이"만 소유한다. 반응 도중 씬이 레이아웃·
 * 트윈으로 오브젝트를 옮기면 그 이동은 쉬는 자리에 흡수되고, 끝나면 씬이 둔 자리로 돌아간다.
 */

export interface UiFeedbackOptions {
  /**
   * 함께 떠오르고 눌릴 그림. 생략하면 대상 자신(글자·컨테이너처럼 스스로 완결된 것일 때만).
   * 빈 배열이면 몸은 움직이지 않는다. 넘기면 꺾쇠·섬광도 히트 사각형이 아니라 이 그림들의
   * 테두리를 감싼다(넉넉한 히트가 그림 밖으로 새지 않는다).
   */
  readonly visuals?: readonly Phaser.GameObjects.GameObject[];
  /** 호버·포커스의 황동 꺾쇠와 빛. 제 선택 표시(밑줄 등)를 가진 메뉴는 끈다. 기본 켜짐. */
  readonly frame?: boolean;
  /** 호버·누름·거절 소리. 제 커서음·확정음을 가진 메뉴는 끈다. 기본 켜짐. */
  readonly sound?: boolean;
  /** 누른 자리의 섬광·인장 테·불티. 기본 켜짐. */
  readonly burst?: boolean;
  /** 큰 결정 버튼(잠입 개시 등)은 `hero`, 칩·탭은 `subtle`. */
  readonly intensity?: UiFeedbackIntensity;
  /**
   * 호버·포커스 배율. 생략하면 크기에 맞춘 공용 값(최대 3.5%, 8px). 활자 메뉴처럼 크기 변화가
   * 곧 반응인 곳만 직접 고른다.
   */
  readonly hoverScale?: number;
  /** 배율의 기준점(0..1). 기본은 가운데. 왼쪽 정렬 활자는 `{ x: 0, y: 0.5 }` 로 오른쪽으로 커진다. */
  readonly anchor?: UiAnchor;
  /** 거짓이면 호버는 흐리게, 누름은 붉게 떨며 거절한다. */
  readonly isEnabled?: () => boolean;
  /** 참이면 입력을 받지 않는 순간(확정 뒤 전환 중 등)이다 — 호버도 누름도 아무 반응이 없다. */
  readonly suppressed?: () => boolean;
}

export interface UiFeedbackHandle {
  /** 키보드·패드 커서가 이 대상에 있다. 씬마다 하나만 — 다른 대상을 켜면 이전 것은 꺼진다. */
  setFocused(focused: boolean): void;
  /** 키보드·패드 확정. 가운데에서 누름 연출을 한 번 재생한다(꺼져 있으면 거절). */
  press(): void;
  /** 씬이 판단한 거절(살 돈이 없음 등). 붉은 떨림과 거절음. */
  reject(): void;
  /** 소리·붉은 빛 없이 몸만 떤다 — "한 번 더 누르면 확정" 같은 경고. */
  shake(): void;
}

interface Registration {
  readonly visuals: readonly Phaser.GameObjects.GameObject[] | null;
  readonly frame: boolean;
  readonly sound: boolean;
  readonly burst: boolean;
  readonly intensity: number;
  readonly hoverScale: number | null;
  readonly anchor: UiAnchor;
  readonly isEnabled: () => boolean;
  readonly suppressed: () => boolean;
}

const registrations = new WeakMap<Phaser.GameObjects.GameObject, Registration>();
/** 여러 조각이 한 버튼일 때 조각 → 대표(첫 조각). 조각 사이를 오가도 한 번만 반응한다. */
const owners = new WeakMap<Phaser.GameObjects.GameObject, Phaser.GameObjects.GameObject>();
const exempted = new WeakSet<Phaser.GameObjects.GameObject>();

/** 이 대상은 공용 반응을 받지 않는다(월드 오브젝트·제 연출을 가진 대상). */
export function exemptFromUiFeedback<T extends Phaser.GameObjects.GameObject>(target: T): T {
  exempted.add(target);
  return target;
}

/** 마우스 호버 반응을 끈 씬(`setUiFeedbackHoverOff`). 누름 반응과 키보드·패드 포커스는 그대로다. */
const hoverOffScenes = new WeakSet<Phaser.Scene>();

/**
 * 씬 전체의 마우스 호버 반응을 끄고 켠다(2026-10-19 사용자: 1:1 대결 중 캐릭터 주변에 마우스 오버 효과가 뜨면 안 된다 — 대결 상대의
 * 스프라이트는 대화용 클릭 대상이라 손 커서가 있다). 꺼진 동안 새 호버는 무시하고, 이미 떠 있던 호버 표시는 다음 프레임에 걷힌다.
 */
export function setUiFeedbackHoverOff(scene: Phaser.Scene, off: boolean): void {
  if (off) hoverOffScenes.add(scene);
  else hoverOffScenes.delete(scene);
}

/**
 * 버튼 하나를 등록한다. 히트를 가진 조각이 여럿이면(프레임과 글자가 각자 인터랙티브) 배열로
 * 넘긴다 — 첫 조각이 대표이고 나머지 위의 호버·누름도 대표 하나의 반응이 된다.
 */
export function uiFeedback(
  targets: Phaser.GameObjects.GameObject | readonly Phaser.GameObjects.GameObject[],
  options: UiFeedbackOptions = {},
): UiFeedbackHandle {
  const parts = Array.isArray(targets) ? targets as readonly Phaser.GameObjects.GameObject[] : [targets as Phaser.GameObjects.GameObject];
  const target = parts[0];
  if (target === undefined) return NO_HANDLE;
  for (const part of parts) {
    exempted.delete(part);
    owners.set(part, target);
  }
  registrations.set(target, {
    visuals: options.visuals ?? null,
    frame: options.frame ?? true,
    sound: options.sound ?? true,
    burst: options.burst ?? true,
    intensity: UI_FEEDBACK.intensity[options.intensity ?? "standard"],
    hoverScale: options.hoverScale ?? null,
    anchor: options.anchor ?? CENTER_ANCHOR,
    isEnabled: options.isEnabled ?? ALWAYS,
    suppressed: options.suppressed ?? NEVER,
  });
  return {
    setFocused: (focused) => {
      const director = directorOf(target.scene);
      if (director === null) return;
      if (focused) director.focus(target);
      else director.unfocus(target);
    },
    press: () => directorOf(target.scene)?.press(target, null),
    reject: () => directorOf(target.scene)?.reject(target),
    shake: () => directorOf(target.scene)?.shake(target),
  };
}

const ALWAYS = (): boolean => true;
const NEVER = (): boolean => false;
const NO_HANDLE: UiFeedbackHandle = Object.freeze({
  setFocused: () => undefined, press: () => undefined, reject: () => undefined, shake: () => undefined,
});

function ownerOf(part: Phaser.GameObjects.GameObject): Phaser.GameObjects.GameObject {
  return owners.get(part) ?? part;
}

/** 씬 플러그인이 씬마다 한 번 부른다. 플러그인 클래스는 `UiFeedbackPlugin.ts` 에 있다. */
export function installUiFeedback(scene: Phaser.Scene): void {
  directorOf(scene);
}

// ── 씬 하나의 연출 장부 ─────────────────────────────────────────────────

interface VisualRest extends RestTrack {
  readonly object: Transformable;
}

interface Entry {
  readonly target: Phaser.GameObjects.GameObject;
  readonly salt: number;
  /** 포인터가 올라 있는 조각들. 비면 다음 그림 틱에서 물러난다(조각 사이 이동은 끊기지 않는다). */
  readonly parts: Set<Phaser.GameObjects.GameObject>;
  /** 호버·포커스 연출이 켜져 있다. */
  shown: boolean;
  focused: boolean;
  pressed: boolean;
  /** 떠오름·눌림 배율. */
  scale: UiCurve;
  /** 꺾쇠의 드러남 0..1. */
  reveal: UiCurve;
  activeSinceMs: number;
  sheenStartMs: number | null;
  punchStartMs: number | null;
  shakeStartMs: number | null;
  rejectStartMs: number | null;
  pressReleaseAtMs: number | null;
  rest: VisualRest[] | null;
  /** 쉬는 자리의 테두리(몸짓을 뺀 값). */
  bounds: UiRect;
  /** 지난 프레임에 몸에 써 넣은 배율과 수평 떨림. 테두리를 되찾을 때 쓴다. */
  appliedK: number;
  appliedShake: number;
  frameGfx: Phaser.GameObjects.Graphics | null;
  glowGfx: Phaser.GameObjects.Graphics | null;
  dead: boolean;
}

/** 파괴된 버튼이 비운 자리. 같은 자리에 다시 그려진 버튼이 호버·누름을 이어받는다. */
interface VacatedSlot {
  readonly bounds: UiRect;
  readonly atMs: number;
  readonly pressedAtMs: number | null;
}

interface Burst {
  readonly startMs: number;
  readonly bounds: UiRect;
  readonly origin: UiPoint;
  readonly intensity: number;
  readonly salt: number;
  readonly reject: boolean;
  readonly reducedMotion: boolean;
  readonly gfx: Phaser.GameObjects.Graphics;
  /** 누른 순간 대상의 카메라 경로. 대상이 사라져도 같은 카메라에 마저 그린다. */
  readonly route: OverlayRoute;
}

interface OverlayRoute {
  readonly depth: number;
  readonly scrollX: number;
  readonly scrollY: number;
  readonly cameraFilter: number;
}

const directors = new Map<Phaser.Scene, UiFeedbackDirector>();
/** 파괴 리스너를 대상마다 한 번만 건다 — 오래 사는 HUD 버튼에 호버마다 쌓이지 않는다. */
const destroyWatched = new WeakSet<Phaser.GameObjects.GameObject>();
let hoverSoundAtMs = -Infinity;
let hoverSoundStep = 0;
let burstSalt = 0;

function directorOf(scene: Phaser.Scene | undefined): UiFeedbackDirector | null {
  if (scene === undefined) return null;
  let director = directors.get(scene);
  if (director === undefined) {
    director = new UiFeedbackDirector(scene);
    directors.set(scene, director);
  }
  return director;
}

type Transformable = Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform;
type Bounded = Phaser.GameObjects.GameObject & { getBounds(output?: Phaser.Geom.Rectangle): Phaser.Geom.Rectangle };

function isTransformable(object: Phaser.GameObjects.GameObject): object is Transformable {
  return typeof (object as Partial<Transformable>).setScale === "function"
    && typeof (object as Partial<Transformable>).x === "number";
}

function hasBounds(object: Phaser.GameObjects.GameObject): object is Bounded {
  return typeof (object as Partial<Bounded>).getBounds === "function";
}

function rootOf(object: Phaser.GameObjects.GameObject): Phaser.GameObjects.GameObject {
  let current: Phaser.GameObjects.GameObject = object;
  while (current.parentContainer) current = current.parentContainer;
  return current;
}

/** 지금 화면에 보이는가 — 자신과 모든 부모 컨테이너가 보이고 투명하지 않다. */
function isShowing(object: Phaser.GameObjects.GameObject): boolean {
  let current: Phaser.GameObjects.GameObject | null = object;
  while (current) {
    const view = current as Partial<Phaser.GameObjects.Components.Visible & Phaser.GameObjects.Components.Alpha>;
    if (!current.active || view.visible === false || (typeof view.alpha === "number" && view.alpha <= 0)) return false;
    current = current.parentContainer ?? null;
  }
  return true;
}

/** 포인터를 받을 수 있는 조각인가. Phaser 는 입력이 꺼진 대상에 out 을 보내지 않는다. */
function isLive(part: Phaser.GameObjects.GameObject): boolean {
  return part.input?.enabled === true && isShowing(part);
}

class UiFeedbackDirector {
  private readonly entries = new Map<Phaser.GameObjects.GameObject, Entry>();
  private readonly bursts: Burst[] = [];
  private readonly vacated: VacatedSlot[] = [];
  private focused: Phaser.GameObjects.GameObject | null = null;
  private attachedInput: Phaser.Input.InputPlugin | null = null;
  private repollFrame: number | null = null;
  private reducedCache = { atMs: -Infinity, value: false };
  /** 이 회차에 포커스를 한 번이라도 받았는가. 메뉴가 열리며 받는 첫 포커스는 틱을 울리지 않는다. */
  private hadFocus = false;

  constructor(private readonly scene: Phaser.Scene) {
    const events = scene.sys.events;
    events.on(Phaser.Scenes.Events.START, this.attach, this);
    events.on(Phaser.Scenes.Events.SHUTDOWN, this.reset, this);
    events.on(Phaser.Scenes.Events.PRE_RENDER, this.tick, this);
    events.once(Phaser.Scenes.Events.DESTROY, this.dispose, this);
    const status = scene.sys.settings.status;
    if (status >= Phaser.Scenes.START && status < Phaser.Scenes.SHUTDOWN) this.attach();
    ensureWindowHooks();
  }

  /** 입력 플러그인의 리스너는 씬 shutdown 이 모두 걷는다(계약 2). 씬이 다시 시작하면 다시 건다. */
  private attach(): void {
    const input = this.scene.input;
    if (input === undefined || this.attachedInput === input) return;
    input.on(Phaser.Input.Events.GAMEOBJECT_OVER, this.onOver, this);
    input.on(Phaser.Input.Events.GAMEOBJECT_OUT, this.onOut, this);
    this.attachedInput = input;
  }

  private reset(): void {
    // 표시 오브젝트는 디스플레이 리스트 shutdown 이 이미 파괴한다. 장부만 비운다.
    this.entries.clear();
    this.bursts.length = 0;
    this.vacated.length = 0;
    this.focused = null;
    this.hadFocus = false;
    this.attachedInput = null;
    this.restorePoll();
  }

  private dispose(): void {
    const events = this.scene.sys.events;
    events.off(Phaser.Scenes.Events.START, this.attach, this);
    events.off(Phaser.Scenes.Events.SHUTDOWN, this.reset, this);
    events.off(Phaser.Scenes.Events.PRE_RENDER, this.tick, this);
    this.reset();
    directors.delete(this.scene);
  }

  /** 반응할 대상의 등록. 제외·손 커서 없음·입력을 받지 않는 순간이면 null. */
  private registrationOf(target: Phaser.GameObjects.GameObject): Registration | null {
    const registration = this.anyRegistrationOf(target);
    return registration === null || registration.suppressed() ? null : registration;
  }

  private anyRegistrationOf(target: Phaser.GameObjects.GameObject): Registration | null {
    const registered = registrations.get(target);
    if (registered !== undefined) return registered;
    if (exempted.has(target)) return null;
    // 손 커서가 곧 "버튼"의 표시다. 커서 없는 인터랙티브는 입력을 막는 막이다.
    if (!target.input?.cursor) return null;
    return AUTO_REGISTRATION;
  }

  private onOver(_pointer: Phaser.Input.Pointer, part: Phaser.GameObjects.GameObject): void {
    if (hoverOffScenes.has(this.scene)) return;
    const target = ownerOf(part);
    const registration = this.registrationOf(target);
    if (registration === null) return;
    const entry = this.ensure(target, registration);
    if (entry === null) return;
    entry.parts.add(part);
    if (!entry.shown) this.activate(entry, registration, false);
  }

  private onOut(_pointer: Phaser.Input.Pointer, part: Phaser.GameObjects.GameObject): void {
    const entry = this.entries.get(ownerOf(part));
    if (entry === undefined) return;
    entry.parts.delete(part);
    if (entry.pressed && entry.parts.size === 0) this.release(entry);
  }

  focus(target: Phaser.GameObjects.GameObject): void {
    if (this.focused === target) return;
    if (this.focused !== null) this.unfocus(this.focused);
    const registration = this.anyRegistrationOf(target);
    if (registration === null) return;
    const entry = this.ensure(target, registration);
    if (entry === null) return;
    this.focused = target;
    entry.focused = true;
    const first = !this.hadFocus;
    this.hadFocus = true;
    // 포인터가 다른 버튼 위에 있으면 포커스 꺾쇠는 잠시 물러나 있다가 포인터가 떠나면 조용히 돌아온다.
    if (!entry.shown && this.wantsShown(entry, registration, this.pointerOnOther(entry))) {
      this.activate(entry, registration, first);
    }
  }

  unfocus(target: Phaser.GameObjects.GameObject): void {
    if (this.focused === target) this.focused = null;
    const entry = this.entries.get(target);
    if (entry !== undefined) entry.focused = false;
  }

  /**
   * 이 씬이 지금 누름을 받는가, 받는다면 무엇인가. Phaser 와 같은 판정으로 포인터 아래 맨 위
   * 오브젝트를 찾는다. `null` — 이 씬은 아무것도 맞히지 않았다(아래 씬에 넘긴다).
   * `"blocked"` — 무언가(막·반응 없는 오브젝트)가 맞았다(아래 씬도 받지 않는다).
   */
  pressTargetAt(event: PointerEvent): { readonly owner: Phaser.GameObjects.GameObject; readonly part: Phaser.GameObjects.GameObject } | "blocked" | null {
    const input = this.scene.input;
    if (input === undefined || !input.enabled || !this.scene.sys.isActive()) return null;
    const manager = input.manager;
    const pointer = manager.activePointer;
    // 창 캡처는 Phaser 보다 먼저 온다. 움직이지 않고 누른 클릭도 이 누름의 좌표로 판정한다.
    manager.transformPointer(pointer, event.pageX, event.pageY, false);
    const hits = input.hitTestPointer(pointer);
    if (hits.length === 0) return null;
    const top = input.sortGameObjects(hits, pointer)[0];
    if (top === undefined) return null;
    const owner = ownerOf(top);
    if (this.registrationOf(owner) === null || !isLive(top)) return "blocked";
    return { owner, part: top };
  }

  /** 누름. `origin` 이 없으면(키보드·패드) 대상 가운데에서 번진다. */
  press(target: Phaser.GameObjects.GameObject, origin: UiPoint | null): void {
    const registration = this.registrationOf(target);
    if (registration === null) return;
    if (!registration.isEnabled()) {
      this.reject(target, origin);
      return;
    }
    const entry = this.ensure(target, registration);
    if (entry === null) return;
    const now = this.now();
    const reduced = this.reducedMotion();
    this.refreshBounds(entry, registration);
    const at = origin ?? rectCenter(entry.bounds);
    this.captureRest(entry, registration, reduced);
    entry.pressed = true;
    entry.pressReleaseAtMs = origin === null ? now + tapHoldMs(registration.intensity) : null;
    entry.scale = retarget(curveAt(entry.scale, now), pressedScale(entry.bounds, reduced), now, UI_FEEDBACK.press.squashMs, "out");
    entry.punchStartMs = now;
    if (registration.sound) sfx.uiPress(this.soundSet());
    if (registration.burst) this.spawnBurst(target, entry.bounds, at, registration.intensity, false, reduced);
  }

  /** 거절: 밀어 봤는데 안 들어간다 — 살짝 눌렸다가(30ms) 붉게 떤다. */
  reject(target: Phaser.GameObjects.GameObject, origin: UiPoint | null = null): void {
    const registration = this.registrationOf(target);
    if (registration === null) return;
    const entry = this.ensure(target, registration);
    if (entry === null) return;
    const now = this.now();
    const reduced = this.reducedMotion();
    const reject = UI_FEEDBACK.reject;
    this.refreshBounds(entry, registration);
    this.captureRest(entry, registration, reduced);
    entry.rejectStartMs = now;
    entry.shakeStartMs = now + reject.squashMs;
    if (!reduced) {
      entry.pressed = true;
      entry.pressReleaseAtMs = now + reject.squashMs;
      entry.scale = retarget(curveAt(entry.scale, now), reject.squash, now, reject.squashMs, "out");
    }
    if (registration.sound) sfx.uiReject(this.soundSet());
    this.spawnBurst(target, entry.bounds, origin ?? rectCenter(entry.bounds), registration.intensity, true, reduced);
  }

  shake(target: Phaser.GameObjects.GameObject): void {
    const registration = this.registrationOf(target);
    if (registration === null) return;
    const entry = this.ensure(target, registration);
    if (entry === null) return;
    this.captureRest(entry, registration, this.reducedMotion());
    entry.shakeStartMs = this.now();
  }

  releaseAll(): void {
    for (const entry of this.entries.values()) if (entry.pressed) this.release(entry);
  }

  private release(entry: Entry): void {
    entry.pressed = false;
    entry.pressReleaseAtMs = null;
    const registration = this.anyRegistrationOf(entry.target) ?? AUTO_REGISTRATION;
    const now = this.now();
    const target = this.liftFor(entry, registration, entry.shown);
    entry.scale = retarget(curveAt(entry.scale, now), target, now, UI_FEEDBACK.press.releaseMs, "spring");
  }

  private liftFor(entry: Entry, registration: Registration, active: boolean): number {
    return restingLift(entry.bounds, active, registration.isEnabled(), this.reducedMotion(), registration.hoverScale);
  }

  private ensure(target: Phaser.GameObjects.GameObject, registration: Registration): Entry | null {
    const existing = this.entries.get(target);
    if (existing !== undefined && !existing.dead) return existing;
    const bounds = unionBounds(drawnParts(target, registration));
    if (bounds === null) return null;
    const now = this.now();
    const entry: Entry = {
      target,
      salt: burstSalt++,
      parts: new Set(),
      shown: false,
      focused: false,
      pressed: false,
      scale: { from: 1, to: 1, startMs: now, durMs: 0, ease: "out" },
      reveal: { from: 0, to: 0, startMs: now, durMs: 0, ease: "out" },
      activeSinceMs: now,
      sheenStartMs: null,
      punchStartMs: null,
      shakeStartMs: null,
      rejectStartMs: null,
      pressReleaseAtMs: null,
      rest: null,
      bounds,
      appliedK: 1,
      appliedShake: 0,
      frameGfx: null,
      glowGfx: null,
      dead: false,
    };
    this.entries.set(target, entry);
    if (!destroyWatched.has(target)) {
      destroyWatched.add(target);
      target.once(Phaser.GameObjects.Events.DESTROY, () => this.onTargetDestroyed(target));
    }
    return entry;
  }

  /**
   * 호버·포커스 연출을 켠다. 같은 자리에서 방금 파괴된 버튼이 있으면(클릭·커서 이동이 다시 그림)
   * 새 호버가 아니라 이어받기다 — 꺾쇠는 제자리에 바로 앉고 틱도 빛줄기도 되풀이하지 않는다.
   * `silent` — 포인터가 떠나 포커스 꺾쇠가 돌아오는 것처럼 새 사건이 아닌 재등장.
   */
  /** 이 씬의 UI 소리 묶음(무투장 화면은 `arena`, `uiSoundSetOf`). */
  private soundSet(): UiSoundSet {
    return uiSoundSetOf(this.scene.scene.key);
  }

  private activate(entry: Entry, registration: Registration, silent: boolean): void {
    const now = this.now();
    const reduced = this.reducedMotion();
    const enabled = registration.isEnabled();
    this.refreshBounds(entry, registration);
    entry.shown = true;
    entry.activeSinceMs = now;
    const slot = this.takeVacated(entry.bounds, now);
    const quiet = silent || slot !== null;
    const enterMs = reduced || quiet ? 0 : UI_FEEDBACK.hover.inMs;
    entry.sheenStartMs = reduced || quiet || !enabled || !registration.frame ? null : now + UI_FEEDBACK.hover.sheenDelayMs;
    entry.reveal = retarget(curveAt(entry.reveal, now), 1, now, enterMs, "back");
    this.captureRest(entry, registration, reduced);
    const lift = this.liftFor(entry, registration, true);
    if (slot?.pressedAtMs != null) {
      // 옛 몸은 파괴됐다. 새 몸이 눌린 자세에서 이어 튕겨 올라, 누름의 탄력이 다시 그리기를 건너간다.
      entry.scale = { from: pressedScale(entry.bounds, reduced), to: lift, startMs: now, durMs: UI_FEEDBACK.press.releaseMs, ease: "spring" };
      entry.punchStartMs = slot.pressedAtMs;
    } else if (slot !== null) {
      entry.scale = { from: lift, to: lift, startMs: now, durMs: 0, ease: "out" };
    } else {
      entry.scale = retarget(curveAt(entry.scale, now), lift, now, enterMs, "back");
    }
    if (!quiet && registration.sound && enabled && now - hoverSoundAtMs >= UI_FEEDBACK.hoverSoundCooldownMs) {
      hoverSoundAtMs = now;
      sfx.uiHover(hoverSoundStep++, this.soundSet());
    }
  }

  private deactivate(entry: Entry): void {
    entry.shown = false;
    const now = this.now();
    const registration = this.anyRegistrationOf(entry.target) ?? AUTO_REGISTRATION;
    entry.reveal = retarget(curveAt(entry.reveal, now), 0, now, this.reducedMotion() ? 0 : UI_FEEDBACK.hover.outMs, "out");
    if (!entry.pressed) entry.scale = retarget(curveAt(entry.scale, now), this.liftFor(entry, registration, false), now, UI_FEEDBACK.hover.outMs, "out");
    entry.sheenStartMs = null;
  }

  private takeVacated(bounds: UiRect, now: number): VacatedSlot | null {
    for (let index = this.vacated.length - 1; index >= 0; index -= 1) {
      const slot = this.vacated[index]!;
      if (now - slot.atMs > UI_FEEDBACK.press.continuityMs) {
        this.vacated.splice(index, 1);
      } else if (sameSlot(slot.bounds, bounds)) {
        this.vacated.splice(index, 1);
        return slot;
      }
    }
    return null;
  }

  private onTargetDestroyed(target: Phaser.GameObjects.GameObject): void {
    const entry = this.entries.get(target);
    if (this.focused === target) this.focused = null;
    if (entry === undefined) return;
    entry.dead = true;
    entry.frameGfx?.destroy();
    entry.glowGfx?.destroy();
    entry.frameGfx = null;
    entry.glowGfx = null;
    this.entries.delete(target);
    // 호버·포커스·누름 중이던 자리는 비운 자리로 남긴다. 같은 자리에 다시 그려진 버튼이 이어받는다.
    const now = this.now();
    const pressedAtMs = entry.punchStartMs !== null && now - entry.punchStartMs < UI_FEEDBACK.press.continuityMs ? entry.punchStartMs : null;
    if (entry.shown || pressedAtMs !== null) {
      this.vacated.push({ bounds: entry.bounds, atMs: now, pressedAtMs });
      if (this.vacated.length > VACATED_LIMIT) this.vacated.shift();
    }
    // 클릭이 버튼을 다시 그리면 포인터는 가만히 새 버튼 위에 있다. Phaser 는 움직일 때만
    // 다시 판정하므로, 한 번만 판정을 강제해 새 버튼이 곧바로 호버를 이어받게 한다.
    if (entry.parts.size > 0) this.requestRepoll();
  }

  private requestRepoll(): void {
    const input = this.scene.input;
    if (input === undefined || input.pollRate !== -1) return;
    input.pollRate = 0;
    this.repollFrame = this.scene.game.loop.frame;
  }

  private restorePoll(): void {
    if (this.repollFrame === null) return;
    const input = this.scene.input;
    if (input !== undefined && input.pollRate === 0) input.pollRate = -1;
    this.repollFrame = null;
  }

  /** 떠오르는 몸의 쉬는 테두리. 부모 컨테이너가 움직여도 매 프레임 따라간다. */
  private refreshBounds(entry: Entry, registration: Registration): void {
    const parts = drawnParts(entry.target, registration);
    const measured = unionBounds(parts);
    if (measured === null) return;
    const bodyMoves = entry.rest !== null && parts.every((part) => entry.rest!.some((rest) => rest.object === part));
    entry.bounds = bodyMoves ? restingBounds(measured, entry.appliedK, entry.appliedShake, registration.anchor) : measured;
  }

  private captureRest(entry: Entry, registration: Registration, reduced: boolean): void {
    // 모션 감소에서는 몸을 움직이지 않으므로 몸을 붙잡지도 않는다 — 씬의 레이아웃과 싸울 일이 없다.
    if (entry.rest !== null || reduced) return;
    const visuals = registration.visuals ?? (selfContained(entry.target) ? [entry.target] : []);
    const anchorPoint = {
      x: entry.bounds.x + entry.bounds.width * registration.anchor.x,
      y: entry.bounds.y + entry.bounds.height * registration.anchor.y,
    };
    entry.rest = visuals.filter(isTransformable).filter((object) => object.active).map((object) => {
      const pivot = toParentSpace(object, anchorPoint);
      return { object, x: object.x, y: object.y, scaleX: object.scaleX, scaleY: object.scaleY, pivotX: pivot.x, pivotY: pivot.y, applied: null };
    });
    entry.appliedK = 1;
    entry.appliedShake = 0;
  }

  private tick(): void {
    if (this.repollFrame !== null && this.scene.game.loop.frame > this.repollFrame) this.restorePoll();
    if (this.entries.size === 0 && this.bursts.length === 0) return;
    const now = this.now();
    const reduced = this.reducedMotion();
    let hovering: Entry | null = null;
    for (const entry of this.entries.values()) {
      for (const part of entry.parts) if (!isLive(part)) entry.parts.delete(part);
      if (entry.parts.size > 0) hovering = entry;
    }
    for (const entry of [...this.entries.values()]) this.tickEntry(entry, now, reduced, hovering !== null && hovering !== entry);
    for (let index = this.bursts.length - 1; index >= 0; index -= 1) {
      const burst = this.bursts[index]!;
      if (!this.drawBurst(burst, now)) {
        burst.gfx.destroy();
        this.bursts.splice(index, 1);
      }
    }
  }

  private pointerOnOther(entry: Entry): boolean {
    for (const other of this.entries.values()) if (other !== entry && other.parts.size > 0) return true;
    return false;
  }

  /** 켜져 있어야 하는가: 포인터가 올라 있거나, 포커스이고 포인터가 다른 버튼 위에 있지 않다. 보여야 한다. */
  private wantsShown(entry: Entry, registration: Registration, pointerOnOther: boolean): boolean {
    if (!isShowing(entry.target)) return false;
    if (entry.parts.size > 0) return !hoverOffScenes.has(this.scene);
    return entry.focused && !pointerOnOther && !registration.suppressed();
  }

  private tickEntry(entry: Entry, now: number, reduced: boolean, pointerOnOther: boolean): void {
    if (entry.dead || !entry.target.active) return;
    const registration = this.anyRegistrationOf(entry.target) ?? AUTO_REGISTRATION;
    const enabled = registration.isEnabled();
    const wanted = this.wantsShown(entry, registration, pointerOnOther);
    if (entry.shown && !wanted) this.deactivate(entry);
    else if (!entry.shown && wanted) this.activate(entry, registration, true);
    if (entry.pressReleaseAtMs !== null && now >= entry.pressReleaseAtMs) this.release(entry);
    // 모션 설정·활성 상태가 바뀌면 떠오른 배율도 새 목표로 옮긴다.
    if (!entry.pressed && curveDone(entry.scale, now)) {
      const lift = this.liftFor(entry, registration, entry.shown);
      if (entry.scale.to !== lift) entry.scale = retarget(curveAt(entry.scale, now), lift, now, UI_FEEDBACK.hover.outMs, "out");
    }

    this.refreshBounds(entry, registration);

    // 몸: 기준점을 고정한 배율 + 거절 떨림. 씬이 그 사이 옮긴 값은 쉬는 자리에 흡수한다.
    const k = curveAt(entry.scale, now);
    const shake = entry.shakeStartMs === null ? 0 : rejectShakeOffset(now - entry.shakeStartMs, reduced);
    if (entry.rest !== null) {
      for (const rest of entry.rest) {
        if (!rest.object.active) continue;
        const next = trackRest(rest, rest.object, k, shake);
        rest.object.setPosition(next.x, next.y).setScale(next.scaleX, next.scaleY);
      }
      entry.appliedK = k;
      entry.appliedShake = shake;
    }

    // 꺾쇠·빛.
    const reveal = Math.max(0, Math.min(1.2, curveAt(entry.reveal, now)));
    const rejecting = entry.rejectStartMs !== null && now - entry.rejectStartMs < UI_FEEDBACK.reject.tintMs;
    const showFrame = registration.frame && isShowing(entry.target) && (reveal > 0.001 || rejecting);
    if (showFrame) this.drawFrame(entry, registration, now, reveal, enabled, rejecting, reduced, shake);
    else this.hideFrame(entry);

    const settled = !entry.shown && !entry.pressed && curveDone(entry.scale, now) && curveDone(entry.reveal, now)
      && (entry.rejectStartMs === null || now - entry.rejectStartMs >= UI_FEEDBACK.reject.tintMs)
      && (entry.shakeStartMs === null || now - entry.shakeStartMs >= UI_FEEDBACK.reject.shakeMs)
      && (entry.punchStartMs === null || now - entry.punchStartMs >= UI_FEEDBACK.press.framePunchMs);
    // 포커스는 장부에 남는다(다음에 다시 보일 수 있다). 나머지는 쉬는 자리로 돌려놓고 뺀다.
    if (settled && !entry.focused) this.retire(entry);
    else if (!entry.shown && !entry.pressed && curveDone(entry.scale, now) && entry.scale.to === 1 && shake === 0) this.restoreRest(entry);
  }

  /** 쉬는 자리·배율로 정확히 돌려놓고 장부에서 뺀다. 다음 호버는 그때의 자리를 다시 잡는다. */
  private retire(entry: Entry): void {
    this.restoreRest(entry);
    this.hideFrame(entry);
    entry.frameGfx?.destroy();
    entry.glowGfx?.destroy();
    entry.frameGfx = null;
    entry.glowGfx = null;
    this.entries.delete(entry.target);
  }

  private restoreRest(entry: Entry): void {
    if (entry.rest === null) return;
    for (const rest of entry.rest) {
      if (!rest.object.active) continue;
      // 마지막으로 써 넣은 뒤 씬이 옮긴 값까지 흡수한 쉬는 자리로 돌린다.
      const next = trackRest(rest, rest.object, 1, 0);
      rest.object.setPosition(next.x, next.y).setScale(next.scaleX, next.scaleY);
    }
    entry.rest = null;
    entry.appliedK = 1;
    entry.appliedShake = 0;
  }

  private drawFrame(
    entry: Entry,
    registration: Registration,
    now: number,
    reveal: number,
    enabled: boolean,
    rejecting: boolean,
    reduced: boolean,
    shake: number,
  ): void {
    const frame = entry.frameGfx ??= this.overlay(Phaser.BlendModes.NORMAL);
    const glow = entry.glowGfx ??= this.overlay(Phaser.BlendModes.ADD);
    const route = routeOf(entry.target);
    applyRoute(frame, route);
    applyRoute(glow, route);
    frame.clear();
    glow.clear();

    const hover = UI_FEEDBACK.hover;
    const k = curveAt(entry.scale, now);
    const grown = scaleRectAbout({ ...entry.bounds, x: entry.bounds.x + shake }, k, registration.anchor);
    const rejectFade = rejecting && entry.rejectStartMs !== null ? 1 - (now - entry.rejectStartMs) / UI_FEEDBACK.reject.tintMs : 0;
    const alpha = Math.min(1, Math.max(rejectFade, reveal));
    const enter = reduced ? hover.frameOutset : hover.frameOutsetFrom + (hover.frameOutset - hover.frameOutsetFrom) * Math.min(1.2, reveal);
    let outset = entry.shown ? enter + breatheOffset(now - entry.activeSinceMs - hover.inMs, reduced) : enter;
    if (entry.punchStartMs !== null) outset = Math.min(outset, framePunchOutset(now - entry.punchStartMs, outset, reduced));
    const color = rejecting ? PALETTE.alarm : enabled ? PALETTE.accent : PALETTE.dim;
    const tip = rejecting ? PALETTE.alarm : enabled ? PALETTE.hotGold : PALETTE.dim;
    drawBrackets(frame, grown, outset, alpha, color, tip);

    if (!enabled && !rejecting) return;
    const tint = rejecting ? PALETTE.alarm : PALETTE.hotGold;
    glow.fillStyle(tint, hover.glowAlpha * alpha).fillRect(grown.x, grown.y, grown.width, grown.height);
    for (const [spread, strength] of GLOW_RINGS) {
      glow.lineStyle(3, tint, strength * alpha)
        .strokeRect(grown.x - spread, grown.y - spread, grown.width + spread * 2, grown.height + spread * 2);
    }
    if (entry.sheenStartMs !== null && now >= entry.sheenStartMs) {
      const progress = (now - entry.sheenStartMs) / hover.sheenMs;
      if (progress >= 1) {
        entry.sheenStartMs = null;
      } else {
        const polygon = sheenPolygon(grown, easeOutCubic(progress));
        if (polygon.length >= 3) {
          glow.fillStyle(PALETTE.hotGold, hover.sheenAlpha * Math.sin(Math.PI * progress) * alpha)
            .fillPoints(scratchPoints(polygon), true);
        }
      }
    }
  }

  private hideFrame(entry: Entry): void {
    entry.frameGfx?.clear();
    entry.glowGfx?.clear();
  }

  private spawnBurst(target: Phaser.GameObjects.GameObject, bounds: UiRect, origin: UiPoint, intensity: number, reject: boolean, reducedMotion: boolean): void {
    const gfx = this.overlay(Phaser.BlendModes.ADD);
    const route = routeOf(target);
    const burst: Burst = { startMs: this.now(), bounds, origin, intensity, salt: burstSalt++, reject, reducedMotion, gfx, route };
    this.bursts.push(burst);
    this.drawBurst(burst, burst.startMs);
  }

  /** 한 장 그린다. 끝났으면 거짓. 대상이 사라져도 제자리에서 마저 번진다. */
  private drawBurst(burst: Burst, now: number): boolean {
    const elapsed = now - burst.startMs;
    const peak = burst.reject ? UI_FEEDBACK.reject.flashAlpha : UI_FEEDBACK.press.flashAlpha;
    // 거절은 번지는 움직임 없이 제자리에서 붉게 번쩍인다.
    const frame = pressBurstFrame(elapsed, burst.bounds, burst.origin, burst.intensity, burst.salt, burst.reject || burst.reducedMotion, peak);
    const g = burst.gfx;
    applyRoute(g, burst.route);
    g.clear();
    const b = burst.bounds;
    const inset = UI_FEEDBACK.press.flashInsetPx;
    const flashRect = { x: b.x + inset, y: b.y + inset, width: Math.max(0, b.width - inset * 2), height: Math.max(0, b.height - inset * 2) };
    // 누른 프레임의 흰 심 → 금빛(거절은 붉게)으로 식는다.
    if (frame.coreAlpha > 0.001) g.fillStyle(PALETTE.white, frame.coreAlpha).fillRect(flashRect.x, flashRect.y, flashRect.width, flashRect.height);
    const flashColor = burst.reject ? PALETTE.alarm : PALETTE.accent;
    if (frame.flashAlpha > 0.001) g.fillStyle(flashColor, frame.flashAlpha).fillRect(flashRect.x, flashRect.y, flashRect.width, flashRect.height);
    // 인장 테: 버튼 사각형이 바깥으로 밀려난다. 첫 프레임에는 몸에 붙은 꺾쇠 자세와 같아서,
    // 클릭이 버튼을 다시 그려 꺾쇠가 한 프레임 비어도 누른 자리의 테두리가 끊기지 않는다.
    for (const ring of frame.rings) {
      const left = b.x - ring.outset, top = b.y - ring.outset;
      const right = b.x + b.width + ring.outset, bottom = b.y + b.height + ring.outset;
      g.lineStyle(ring.width, PALETTE.hotGold, ring.alpha).strokeRect(left, top, right - left, bottom - top);
      g.fillStyle(PALETTE.hotGold, ring.alpha);
      fillDiamond(g, left, top, 2.5, 0);
      fillDiamond(g, right, top, 2.5, 0);
      fillDiamond(g, left, bottom, 2.5, 0);
      fillDiamond(g, right, bottom, 2.5, 0);
    }
    frame.shards.forEach((shard, index) => {
      g.fillStyle(index % 2 === 0 ? PALETTE.hotGold : PALETTE.accent, shard.alpha);
      fillDiamond(g, shard.x, shard.y, shard.size / 2, shard.angle);
    });
    return !frame.done;
  }

  private overlay(blend: Phaser.BlendModes): Phaser.GameObjects.Graphics {
    return this.scene.add.graphics().setBlendMode(blend).setName("ui-feedback");
  }

  private now(): number {
    return this.scene.game.loop.time;
  }

  /** 모션 설정은 URL·OS 질의를 거치므로 매 프레임 다시 읽지 않는다. 설정 변경은 한 박자 안에 반영된다. */
  private reducedMotion(): boolean {
    const now = this.now();
    if (now - this.reducedCache.atMs >= REDUCED_MOTION_CACHE_MS) {
      this.reducedCache = { atMs: now, value: effectiveReducedMotion(readRuntimeOptions(), playerSettingsFor(this.scene)) };
    }
    return this.reducedCache.value;
  }
}

const AUTO_REGISTRATION: Registration = Object.freeze({
  visuals: null,
  frame: true,
  sound: true,
  burst: true,
  intensity: UI_FEEDBACK.intensity.standard,
  hoverScale: null,
  anchor: CENTER_ANCHOR,
  isEnabled: ALWAYS,
  suppressed: NEVER,
});

const VACATED_LIMIT = 8;
const REDUCED_MOTION_CACHE_MS = 250;

/** 꺾쇠 바깥으로 번지는 두 겹 빛(거리, 세기). 블룸 셰이더 없이 Canvas 에서도 같다. */
const GLOW_RINGS: readonly (readonly [number, number])[] = [[2, 0.1], [5, 0.05]];

/**
 * 자동 등록에서 몸째 떠오를 수 있는 대상. 글자·컨테이너는 스스로 완결된 버튼이지만, 사각형·
 * 이미지 히트는 대개 따로 얹힌 글자의 바탕이라 바탕만 키우면 글자와 어긋난다 — 꺾쇠만 준다.
 */
function selfContained(target: Phaser.GameObjects.GameObject): boolean {
  return target instanceof Phaser.GameObjects.Text || target instanceof Phaser.GameObjects.Container;
}

function rectCenter(rect: UiRect): UiPoint {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/** 그리기용 점 배열을 매 프레임 새로 만들지 않는다. */
const SCRATCH: Phaser.Math.Vector2[] = [];
function scratchPoints(points: readonly UiPoint[]): Phaser.Math.Vector2[] {
  while (SCRATCH.length < points.length) SCRATCH.push(new Phaser.Math.Vector2());
  const out = SCRATCH.slice(0, points.length);
  points.forEach((point, index) => out[index]!.set(point.x, point.y));
  return out;
}

function drawBrackets(g: Phaser.GameObjects.Graphics, b: UiRect, outset: number, alpha: number, color: number, tip: number): void {
  const arm = bracketArm(b);
  const left = b.x - outset;
  const right = b.x + b.width + outset;
  const top = b.y - outset;
  const bottom = b.y + b.height + outset;
  // 남색 밑선이 밝은 원화·상아 종이 위에서도 황동선의 경계를 세운다.
  for (const [width, lineColor, lineAlpha] of BRACKET_STROKES) {
    g.lineStyle(width, lineColor === "ink" ? PALETTE.outline : color, lineAlpha * alpha);
    for (const [x, y, sx, sy] of [[left, top, 1, 1], [right, top, -1, 1], [left, bottom, 1, -1], [right, bottom, -1, -1]] as const) {
      g.beginPath();
      g.moveTo(x + sx * arm, y);
      g.lineTo(x, y);
      g.lineTo(x, y + sy * arm);
      g.strokePath();
    }
  }
  // 모서리 끝의 작은 마름모 — 타이틀 메뉴 커서와 같은 모양말.
  g.fillStyle(tip, alpha);
  fillDiamond(g, left, top, 3, 0);
  fillDiamond(g, right, top, 3, 0);
  fillDiamond(g, left, bottom, 3, 0);
  fillDiamond(g, right, bottom, 3, 0);
}

const BRACKET_STROKES: readonly (readonly [number, "ink" | "brass", number])[] = [[5, "ink", 0.8], [2, "brass", 1]];

/** 중심·반지름·회전으로 마름모 하나. 꺾쇠 끝·인장 테 모서리·불티 조각이 같은 모양을 쓴다. */
function fillDiamond(g: Phaser.GameObjects.Graphics, x: number, y: number, radius: number, angle: number): void {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  // 진행 방향으로 길쭉한 조각(가로 1.6 : 세로 1).
  const along = radius * 1.6;
  g.fillPoints(scratchPoints([
    { x: x + cos * along, y: y + sin * along },
    { x: x - sin * radius, y: y + cos * radius },
    { x: x - cos * along, y: y - sin * along },
    { x: x + sin * radius, y: y - cos * radius },
  ]), true);
}

/**
 * 대상과 같은 카메라·스크롤 계수·깊이(바로 위)로 그린다. 마을 HUD 카메라는 매 갱신마다 루트
 * 오브젝트의 카메라를 다시 나누므로(`VillageHudSpace`), 그림 직전에 매번 다시 맞춘다.
 */
function routeOf(target: Phaser.GameObjects.GameObject): OverlayRoute {
  const root = rootOf(target) as Phaser.GameObjects.GameObject & Partial<Phaser.GameObjects.Components.Depth & Phaser.GameObjects.Components.ScrollFactor>;
  return {
    depth: (root.depth ?? 0) + UI_FEEDBACK_DEPTH_LIFT,
    scrollX: root.scrollFactorX ?? 1,
    scrollY: root.scrollFactorY ?? 1,
    cameraFilter: root.cameraFilter,
  };
}

function applyRoute(gfx: Phaser.GameObjects.Graphics, route: OverlayRoute): void {
  if (gfx.depth !== route.depth) gfx.setDepth(route.depth);
  gfx.setScrollFactor(route.scrollX, route.scrollY);
  gfx.cameraFilter = route.cameraFilter;
}

/** 테두리를 재는 조각: 등록한 그림이 있으면 그 그림들, 없으면 히트 대상 자신. */
function drawnParts(target: Phaser.GameObjects.GameObject, registration: Registration): readonly Phaser.GameObjects.GameObject[] {
  const visuals = registration.visuals?.filter((visual) => visual.active) ?? [];
  return visuals.length > 0 ? visuals : [target];
}

function unionBounds(parts: readonly Phaser.GameObjects.GameObject[]): UiRect | null {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const part of parts) {
    const rect = boundsOf(part);
    if (rect === null) continue;
    left = Math.min(left, rect.x);
    top = Math.min(top, rect.y);
    right = Math.max(right, rect.x + rect.width);
    bottom = Math.max(bottom, rect.y + rect.height);
  }
  return right > left && bottom > top ? { x: left, y: top, width: right - left, height: bottom - top } : null;
}

function boundsOf(target: Phaser.GameObjects.GameObject): UiRect | null {
  if (!target.active || !hasBounds(target)) return null;
  const rect = target.getBounds();
  if (!Number.isFinite(rect.x) || !Number.isFinite(rect.y) || rect.width <= 0 || rect.height <= 0) return null;
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

/** 월드 점을 오브젝트 부모의 좌표로. 컨테이너 안의 그림도 버튼 기준점에서 커진다. */
function toParentSpace(object: Transformable, world: UiPoint): UiPoint {
  const parent = object.parentContainer;
  if (!parent) return world;
  const out = new Phaser.Math.Vector2();
  parent.getBoundsTransformMatrix().applyInverse(world.x, world.y, out);
  return { x: out.x, y: out.y };
}

/** 포인터가 대상 위 어디를 눌렀는가(월드). 방금 한 히트 판정의 지역 좌표를 쓴다. */
function pressOrigin(target: Phaser.GameObjects.GameObject): UiPoint | null {
  const input = target.input;
  const transform = target as Partial<Transformable & Phaser.GameObjects.Components.Origin>;
  if (!input || typeof transform.getWorldTransformMatrix !== "function") return null;
  const matrix = transform.getWorldTransformMatrix();
  const point = matrix.transformPoint(input.localX - (transform.displayOriginX ?? 0), input.localY - (transform.displayOriginY ?? 0));
  return Number.isFinite(point.x) && Number.isFinite(point.y) ? { x: point.x, y: point.y } : null;
}

// ── 창 캡처 누름 ────────────────────────────────────────────────────────

let windowHooksInstalled = false;

/**
 * 앱 수명 동안 한 번만 건다(씬이 아니라 앱의 입력 경계라 씬 scope 로 걷지 않는다). Phaser 의
 * 전역 topOnly 처럼 가장 위 씬부터 내려가며, 무언가를 맞힌 첫 씬에서 멈춘다.
 */
function ensureWindowHooks(): void {
  if (windowHooksInstalled || typeof globalThis.addEventListener !== "function") return;
  windowHooksInstalled = true;
  globalThis.addEventListener("pointerdown", (event: PointerEvent) => {
    if (event.button !== 0) return;
    const ordered = [...directors.entries()]
      .filter(([scene]) => event.target === scene.game.canvas)
      .sort(([a], [b]) => sceneIndex(b) - sceneIndex(a));
    for (const [, director] of ordered) {
      const hit = director.pressTargetAt(event);
      if (hit === null) continue;
      if (hit !== "blocked") director.press(hit.owner, pressOrigin(hit.part));
      return;
    }
  }, { capture: true });
  const release = (): void => { for (const director of directors.values()) director.releaseAll(); };
  globalThis.addEventListener("pointerup", release, { capture: true });
  globalThis.addEventListener("pointercancel", release, { capture: true });
}

function sceneIndex(scene: Phaser.Scene): number {
  return scene.sys.game?.scene.getIndex(scene) ?? -1;
}
