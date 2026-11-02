import {
  accentPulseValue,
  cameraAccentFactor,
  holdPulse,
  punchZoomPulse,
  combatZoomPulse,
  pushPulse,
  rollPulse,
  screenShakeAmplitude,
  screenShakeOffset,
  screenShakeReplaces,
  screenThumpOffset,
  type AccentPulse,
  type ScreenShake,
} from "./CameraAccents";
import { advanceCameraBlend, startCameraBlend, type CameraBlend, type CameraPose, type CameraShotSpec } from "./CameraShot";

/** 리그가 쓰는 Phaser 카메라의 부분. 테스트는 이 모양의 가짜 객체를 넘긴다. */
export interface RigCamera {
  readonly width: number;
  readonly height: number;
  readonly zoom: number;
  readonly scrollX: number;
  readonly scrollY: number;
  setZoom(zoom: number): unknown;
  setScroll(x: number, y: number): unknown;
  setRotation(rad: number): unknown;
  setBounds(x: number, y: number, width: number, height: number): unknown;
  getBounds(): { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
}

/**
 * 씬이 공급하는 기본 구도. 지난 프레임의 기본 자세(강조·샷이 섞이지 않은 값)를 받아
 * 이번 프레임 자세를 돌려준다. null 이면 기본 자세를 그대로 붙든다(포박 잠금, 클리어 화면).
 */
export type CameraFramer = (deltaMs: number, previous: CameraPose) => CameraPose | null;

export interface CameraRigOptions {
  /** 흔들림·펀치·롤·밀기를 막는 구간(튜토리얼, 모션 감소 등). 덜컹(nudge)은 막지 않는다. */
  readonly quiet?: () => boolean;
}

export interface CameraShotHandle {
  readonly id: string;
  /** 이 샷이 아직 카메라를 쥐고 있는가. 다른 샷에 밀려났거나 풀렸으면 거짓이다. */
  readonly active: boolean;
  /** 기본 구도로 돌아간다. 0ms 면 곧장 붙는다. 이미 밀려난 샷의 해제는 아무것도 하지 않는다. */
  release(durationMs?: number, ease?: string): void;
}

interface ActiveAccent {
  readonly pulse: AccentPulse;
  readonly startMs: number;
}

interface ActiveScreenShake {
  readonly shake: ScreenShake;
  readonly startMs: number;
}

interface ActiveShot {
  readonly spec: CameraShotSpec;
  readonly blend: CameraBlend;
  entering: boolean;
}

/** 월드 px 한 점이 이 카메라의 화면(게임 캔버스 px)에 그려지는 자리. 회전은 0 이라 본다(마을 카메라). */
export function cameraScreenPoint(camera: Pick<RigCamera, "width" | "height" | "zoom" | "scrollX" | "scrollY">, x: number, y: number): [number, number] {
  return [camera.width / 2 + (x - camera.scrollX - camera.width / 2) * camera.zoom,
    camera.height / 2 + (y - camera.scrollY - camera.height / 2) * camera.zoom];
}

/** Phaser 스크롤은 줌과 무관하게 "중심 − 카메라 크기의 절반"이다. */
export function cameraPoseFromScroll(camera: Pick<RigCamera, "width" | "height">, scrollX: number, scrollY: number, zoom: number): CameraPose {
  return { centerX: scrollX + camera.width / 2, centerY: scrollY + camera.height / 2, zoom };
}

/**
 * `cameras.main` 의 유일한 쓰기 지점. 매 프레임 세 층을 합성해 한 번에 적용한다.
 *
 * 1. 기본 구도 — 씬의 `CameraFramer`(플레이어 추적, 층 스냅, 마을 배율 단계).
 * 2. 샷 — 연출이 빌려 가는 한 컷. 한 번에 하나이며, 풀면 기본 구도로 섞여 돌아간다.
 * 3. 강조 — 펀치 줌(배율 곱)·밀기·덜컹·px 흔들림과 세로 쿵(중심 가산)·롤(회전). 화면 흔들림의 입구는
 *    `shakePx` 하나다. Phaser `camera.shake` 는 쓰지 않는다(리그 없는 화면은 `SceneCameraShake`).
 *
 * 예전에는 씬마다 "카메라 트윈이 없을 때만 줌 보간", 매 프레임 `killTweensOf(cam)`,
 * 대리 트윈의 `followOffset`/`rotation` 손 복원으로 우선순위를 가렸다. 이제 순서는 여기 하나다.
 */
/** 히트스톱이 풀린 뒤 추적을 빨리 돌리는 시간과 배율. */
export const RELEASE_CATCH_UP = Object.freeze({ ms: 120, rate: 3 });

export class CameraRig {
  private base: CameraPose;
  private framer: CameraFramer | null = null;
  private wasHitStopped = false;
  private releaseCatchUpMs = 0;
  private shot: ActiveShot | null = null;
  private returning: CameraBlend | null = null;
  /** 복귀 전환 중이면 방금 풀린 샷의 id. */
  private returningId: string | null = null;
  private displayed: CameraPose;
  private nowMs = 0;
  /**
   * 밀기·롤·펀치 줌의 시계. 히트스톱(`update(dt, true)`) 동안 서고 풀리면 이어 흐른다. 흔들림·덜컹은
   * 벽시계(`nowMs`)다 — 멈춘 그림 위의 진동과 한 프레임 덜컹이 곧 정지의 판독이다. 예전에는 7px 밀기가
   * 배우·이펙트가 다 선 150ms 동안 혼자 9프레임을 흘러가 "멈춤" 이 "미끄러지는 카메라" 로 읽혔다
   * (2026-09-26 강공격 필름). 이제 밀기는 풀리는 순간 맞은 몸의 넉백과 함께 나간다.
   */
  private accentMs = 0;
  private lastAccentMs = Number.NEGATIVE_INFINITY;
  private punchAccent: ActiveAccent | null = null;
  private rollAccent: ActiveAccent | null = null;
  private pushAccent: ActiveAccent | null = null;
  private nudgeAccent: ActiveAccent | null = null;
  private jerkAccent: ActiveAccent | null = null;
  private shakeAccent: ActiveScreenShake | null = null;
  private thumpAccent: ActiveScreenShake | null = null;
  private shotSerial = 0;
  /** 이 리그가 쓴 배율·스크롤·회전을 그대로 받아 쓰는 거울 카메라(후처리 없는 표기층). */
  private readonly mirrors = new Set<Pick<RigCamera, "setZoom" | "setScroll" | "setRotation">>();

  constructor(private readonly camera: RigCamera, private readonly options: CameraRigOptions = {}) {
    this.base = cameraPoseFromScroll(camera, camera.scrollX, camera.scrollY, camera.zoom);
    this.displayed = this.base;
  }

  /**
   * 거울 카메라를 단다. 리그가 월드 카메라에 쓰는 순간 같은 값을 거울에도 쓴다 — 거울은 월드와
   * 한 몸으로 흔들리고 당겨진다(`CombatOverlayCamera`). 돌려준 함수로 뗀다.
   */
  addMirror(camera: Pick<RigCamera, "setZoom" | "setScroll" | "setRotation">): () => void {
    this.mirrors.add(camera);
    this.apply();
    return () => { this.mirrors.delete(camera); };
  }

  /** 강조·샷을 뺀 기본 구도의 자세. */
  get basePose(): CameraPose { return this.base; }

  /** 샷까지 섞은, 강조를 빼고 화면에 걸린 자세. */
  get pose(): CameraPose { return this.displayed; }

  /** 지금 카메라를 쥔 샷 id(없으면 null). 복귀 전환 중에도 null 이다. */
  get shotId(): string | null { return this.shot?.spec.id ?? null; }

  /** 샷을 쥐고 있거나 그 샷에서 기본 구도로 섞여 돌아오는 중이면 그 샷 id. 컷의 전체 길이를 읽을 때 쓴다. */
  get presentingShotId(): string | null { return this.shot?.spec.id ?? (this.returning === null ? null : this.returningId); }

  /** 샷으로 섞여 들어가거나 기본 구도로 섞여 돌아오는 중인가(예전 `panEffect.isRunning` 자리). */
  get blending(): boolean { return this.shot?.entering === true || this.returning !== null; }

  setFramer(framer: CameraFramer | null): void {
    this.framer = framer;
  }

  /** 바뀌었을 때만 경계를 건다 — 매 프레임 같은 값을 걸어도 Phaser 는 내부 사각형을 다시 만든다. */
  setBounds(x: number, y: number, width: number, height: number): void {
    const current = this.camera.getBounds();
    if (current.x === x && current.y === y && current.width === width && current.height === height) return;
    this.camera.setBounds(x, y, width, height);
  }

  /**
   * 기본 구도를 곧장 옮긴다(씬 시작, 창 크기 변경, 순간이동한 배우 따라잡기).
   * 진행 중이던 복귀 전환은 버린다 — 옛 자세에서 섞어 오면 한 번 더 미끄러진다.
   */
  snapTo(pose: Partial<CameraPose>): void {
    this.base = {
      centerX: pose.centerX ?? this.base.centerX,
      centerY: pose.centerY ?? this.base.centerY,
      zoom: pose.zoom ?? this.base.zoom,
    };
    this.returning = null;
    if (this.shot === null) this.displayed = this.base;
    this.apply();
  }

  /**
   * 기본 구도를 바깥에서 매 프레임 정하는 씬의 쓰기(마을 — 투영과 3D 카드 뷰가 같은 프레임 안에서 이 자세를 곧장 읽는다).
   * `snapTo` 와 달리 진행 중인 복귀 전환을 지우지 않는다: 샷을 풀면 매 프레임 새로 정해지는 기본 구도로 섞여 돌아온다.
   */
  setBase(pose: CameraPose): void {
    this.base = pose;
    if (this.shot === null && this.returning === null) this.displayed = this.base;
    this.apply();
  }
  /**
   * 샷을 건다. 지금 화면의 자세에서 `durationMs` 동안 목표로 섞여 들어간다.
   * 이미 샷이 있으면 그 샷을 밀어내고 이어서 섞는다(밀려난 핸들의 해제는 무시된다).
   */
  pushShot(spec: CameraShotSpec): CameraShotHandle {
    const serial = ++this.shotSerial;
    this.returning = null;
    this.shot = { spec, blend: startCameraBlend(this.displayed, spec.durationMs, spec.ease), entering: true };
    const rig = this;
    const owns = () => rig.shot !== null && rig.shotSerial === serial;
    if (spec.durationMs <= 0) this.update(0);
    return {
      id: spec.id,
      get active() { return owns(); },
      release(durationMs = 0, ease = "Sine.easeInOut") {
        if (!owns()) return;
        rig.shot = null;
        rig.returning = durationMs > 0 ? startCameraBlend(rig.displayed, durationMs, ease) : null;
        rig.returningId = durationMs > 0 ? spec.id : null;
        if (durationMs <= 0) rig.update(0);
      },
    };
  }

  /**
   * 펀치 줌. 장식 줌 정책(`cameraAccentFactor`: 0.98~1.025, 2.5초 쿨다운)을 여기서 한 번만 적용한다.
   * 재생했으면 참.
   */
  punch(requested: number, durationMs: number): boolean {
    const accent = cameraAccentFactor(requested, this.quiet(), this.nowMs - this.lastAccentMs);
    if (accent === null) return false;
    this.lastAccentMs = this.nowMs;
    this.punchAccent = { pulse: punchZoomPulse(accent, durationMs), startMs: this.accentMs };
    return true;
  }

  /**
   * 전투 결판의 펀치 줌(`combatZoomPulse`). 장식 줌의 상한·쿨다운 대신 전투 상한(1.08)만 건다.
   * 금지 구간(`quiet`)은 그대로 따른다. 재생했으면 참.
   */
  impactZoom(factor: number, riseMs: number, fallMs: number): boolean {
    if (this.quiet() || factor <= 1) return false;
    this.punchAccent = { pulse: combatZoomPulse(factor, riseMs, fallMs), startMs: this.accentMs };
    return true;
  }

  /** 타격 방향 한 프레임 덜컹(월드 px, 부호가 방향). 오르내림 없이 붙었다 떨어진다. */
  jerk(dx: number, durationMs: number): void {
    if (this.quiet() || dx === 0) return;
    this.jerkAccent = { pulse: holdPulse(dx, durationMs), startMs: this.nowMs };
  }

  /** 화면 롤(rad). 새 롤은 진행 중인 롤을 대신한다. */
  roll(rad: number, durationMs: number): void {
    if (this.quiet()) return;
    this.rollAccent = { pulse: rollPulse(rad, durationMs), startMs: this.accentMs };
  }

  /** 가로 밀기(월드 px, 부호가 방향). 새 밀기는 진행 중인 밀기를 대신한다. */
  push(dx: number, durationMs: number): void {
    if (this.quiet()) return;
    this.pushAccent = { pulse: pushPulse(dx, durationMs), startMs: this.accentMs };
  }

  /** 세로 덜컹(화면 px). 정해진 시간 동안 그대로 붙어 있다가 떨어진다. `quiet` 와 무관하다. */
  nudge(screenDy: number, durationMs: number): void {
    this.nudgeAccent = { pulse: holdPulse(screenDy, durationMs), startMs: this.nowMs };
  }

  /**
   * 화면 흔들림의 유일한 입구. 진폭(`px`)은 게임 캔버스 px 이고 (1−t)² 로 잦아든다. 잡음은 경과 시간의 해시라
   * 리플레이·테스트가 같은 그림을 낸다. 금지 구간(`quiet` — 모션 감소 포함)에서는 걸지 않는다.
   * 진행 중인 흔들림보다 약하면, 그 흔들림이 거의 잦아들었을 때만 대신한다(`screenShakeReplaces`).
   * `verticalShare`(0~1)만큼은 가로 떨림 대신 세로 쿵(22Hz 튐, `screenThumpOffset`)으로 건다 — 마을 대결의
   * 내려찍기처럼 땅이 울리는 박자. 어느 한쪽이라도 걸었으면 참.
   */
  shakePx(durationMs: number, px: number, verticalShare = 0): boolean {
    if (this.quiet() || !(px > 0) || !(durationMs > 0)) return false;
    const vertical = Math.max(0, Math.min(1, verticalShare));
    // 세로로 거의 다 보낸 쿵의 가로 몫(0.2px 이하)은 떨림으로 읽히지 않는다.
    const horizontal = px * (1 - vertical) > 0.2 && this.startShake("shakeAccent", durationMs, px * (1 - vertical));
    const thump = vertical > 0 && this.startShake("thumpAccent", durationMs, px * vertical);
    return horizontal || thump;
  }

  /** 지금 걸린 가로 px 흔들림의 남은 진폭(화면 px). 없으면 0. */
  get shakeAmplitudePx(): number {
    const current = this.shakeAccent;
    return current === null ? 0 : screenShakeAmplitude(current.shake, this.nowMs - current.startMs);
  }

  /** 가로 흔들림이나 세로 쿵이 아직 화면을 흔드는가. */
  get shaking(): boolean {
    const thump = this.thumpAccent;
    return this.shakeAmplitudePx > 0 || thump !== null && screenShakeAmplitude(thump.shake, this.nowMs - thump.startMs) > 0;
  }

  stopShake(): void {
    this.shakeAccent = this.thumpAccent = null;
  }

  stopPunch(): void {
    this.punchAccent = null;
  }

  /** 진행 중인 강조를 모두 걷고 카메라를 수평·제자리로 돌린다(정산 전환, 탈출, 씬 정리). */
  resetAccents(): void {
    this.punchAccent = this.rollAccent = this.pushAccent = this.nudgeAccent = this.jerkAccent = null;
    this.stopShake();
    this.apply();
  }

  /**
   * 한 프레임. 히트스톱 중에도 불러야 한다 — 흔들림·덜컹·샷은 화면 시간으로 흐른다. `hitStopped` 면
   * 밀기·롤·펀치 줌(`accentMs`)과 기본 구도(추적)가 제자리에 선다. 대시가 90px 를 한 틱에 돌진하면 추적
   * 카메라가 멈춤 150ms 내내 45px 를 미끄러져 세계 전체가 흘렀다(2026-09-26 대시 필름) — 따라잡기는 풀린 뒤다.
   */
  update(deltaMs: number, hitStopped = false): void {
    const dt = Math.max(0, deltaMs);
    this.nowMs += dt;
    if (!hitStopped) this.accentMs += dt;
    // 멈춤이 풀리는 순간부터 잠깐 추적을 빨리 돌린다. 대시가 멈춤 안에 64px 를 돌진하면 추적이 풀린 뒤 약
    // 14프레임 동안 뒤늦게 따라와 "끝났는데 화면이 흐른다" 로 읽혔다(2026-09-26 대시 필름) — 넉백과 같은
    // 박자(약 5프레임) 안에 따라잡는다.
    if (this.wasHitStopped && !hitStopped) this.releaseCatchUpMs = RELEASE_CATCH_UP.ms;
    this.wasHitStopped = hitStopped;
    if (this.framer !== null && !hitStopped) {
      const boosted = this.releaseCatchUpMs > 0;
      this.releaseCatchUpMs = Math.max(0, this.releaseCatchUpMs - dt);
      const next = this.framer(boosted ? dt * RELEASE_CATCH_UP.rate : dt, this.base);
      if (next !== null) this.base = next;
    }
    if (this.shot !== null) {
      const target = this.shot.spec.target();
      if (this.shot.entering) {
        const step = advanceCameraBlend(this.shot.blend, target, dt);
        this.displayed = step.pose;
        if (step.done) this.shot.entering = false;
      } else {
        this.displayed = target;
      }
    } else if (this.returning !== null) {
      const step = advanceCameraBlend(this.returning, this.base, dt);
      this.displayed = step.pose;
      if (step.done) this.returning = null;
    } else {
      this.displayed = this.base;
    }
    this.apply();
  }

  private quiet(): boolean {
    return this.options.quiet?.() ?? false;
  }

  private startShake(slot: "shakeAccent" | "thumpAccent", durationMs: number, px: number): boolean {
    const current = this[slot];
    if (current !== null && !screenShakeReplaces(current.shake, this.nowMs - current.startMs, px)) return false;
    this[slot] = { shake: { px, durationMs }, startMs: this.nowMs };
    return true;
  }

  private sample(slot: "punchAccent" | "rollAccent" | "pushAccent" | "nudgeAccent" | "jerkAccent"): number {
    const accent = this[slot];
    if (accent === null) return 0;
    const now = slot === "nudgeAccent" || slot === "jerkAccent" ? this.nowMs : this.accentMs;
    const value = accentPulseValue(accent.pulse, now - accent.startMs);
    if (value === null) {
      this[slot] = null;
      return 0;
    }
    return value;
  }

  /** px 흔들림과 세로 쿵의 이번 프레임 오프셋(화면 px). 끝난 채널은 비운다. */
  private sampleShake(): { readonly x: number; readonly y: number } {
    let x = 0, y = 0;
    const current = this.shakeAccent;
    if (current !== null) {
      const offset = screenShakeOffset(current.shake, this.nowMs - current.startMs);
      if (offset === null) this.shakeAccent = null;
      else ({ x, y } = offset);
    }
    const thump = this.thumpAccent;
    if (thump !== null) {
      const dy = screenThumpOffset(thump.shake, this.nowMs - thump.startMs);
      if (dy === null) this.thumpAccent = null;
      else y += dy;
    }
    return { x, y };
  }

  private apply(): void {
    const zoom = this.displayed.zoom * (1 + this.sample("punchAccent"));
    const screenToWorld = 1 / Math.max(0.0001, zoom);
    const shake = this.sampleShake();
    const centerX = this.displayed.centerX + this.sample("pushAccent") + this.sample("jerkAccent") + shake.x * screenToWorld;
    const centerY = this.displayed.centerY + (this.sample("nudgeAccent") + shake.y) * screenToWorld;
    if (this.camera.zoom !== zoom) this.camera.setZoom(zoom);
    this.camera.setScroll(centerX - this.camera.width / 2, centerY - this.camera.height / 2);
    const roll = this.sample("rollAccent");
    this.camera.setRotation(roll);
    for (const mirror of this.mirrors) {
      mirror.setZoom(zoom);
      mirror.setScroll(centerX - this.camera.width / 2, centerY - this.camera.height / 2);
      mirror.setRotation(roll);
    }
  }
}
