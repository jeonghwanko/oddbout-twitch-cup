
import type { CityPoint } from "../../world/NativeCityDefinition";
import { cityFightStageSnap, type CityFightStageLine } from "./CityFightStageLine";
import { NATIVE_CITY_OTTO, ottoBlockUnits, ottoBodyRadius, ottoCaptureWindowOpen, type OttoEvent,
  type OttoState } from "./NativeCityOttoEncounter";

const DRIVE = NATIVE_CITY_OTTO.patterns.drive;

export type OttoCard = "empty" | "stored";

export interface OttoPickpocketState {
  /** 카드 한 칸. 조준·취소 상태는 없다(선 위 방향은 좌우 둘뿐). */
  readonly card: OttoCard;

  readonly pass: number | null;
  /** 카드를 담은 프레임 번호(그 프레임에는 방출하지 않는다). */
  readonly storedFrame: number;
}

export function createOttoPickpocket(): OttoPickpocketState {
  return Object.freeze({ card: "empty", pass: null, storedFrame: -1 });
}

/** 띠가 끊기는 땅: 걸을 수 있는 길이(`citySegmentClearLength` — 첫 벽·고정 장애물) 와 옆보기 무대 선(양 끝). 없으면 끊지 않는다. */
export interface OttoBandGround {
  readonly clear?: ((from: CityPoint, to: CityPoint) => number) | null;
  readonly line?: CityFightStageLine | null;
}

/** 직진 한 줄의 띠(평면): `from` 에서 `direction`(길이 1)으로 `length`, 양옆 `halfWidth`. 직진 예고·포획·방출이 같은 정의를 쓴다. */
export interface OttoDriveBand {
  readonly from: CityPoint;
  readonly direction: CityPoint;
  readonly length: number;
  readonly halfWidth: number;
}

function unit(v: CityPoint): CityPoint | null {
  const length = Math.hypot(v[0], v[1]);
  return length > 1e-9 ? [v[0] / length, v[1] / length] : null;
}


export function ottoDriveBand(from: CityPoint, direction: CityPoint, playerRadius: number, ground: OttoBandGround = {}): OttoDriveBand {
  const b = ottoBlockUnits(playerRadius), full = DRIVE.travelB * b, halfWidth = DRIVE.widthB * b / 2;
  const dir = unit(direction);
  if (!dir) return Object.freeze({ from, direction: [1, 0] as CityPoint, length: 0, halfWidth });
  let length = full;
  if (ground.clear) length = Math.min(length, Math.max(0, ground.clear(from, [from[0] + dir[0] * full, from[1] + dir[1] * full])));
  const line = ground.line;
  if (line) {
    const along = dir[0] * line.direction[0] + dir[1] * line.direction[1];
    if (Math.abs(along) > 1e-6) {
      const t = (from[0] - line.origin[0]) * line.direction[0] + (from[1] - line.origin[1]) * line.direction[1];
      length = Math.min(length, Math.max(0, (along > 0 ? line.max - t : t - line.min) / Math.abs(along)));
    }
  }
  return Object.freeze({ from, direction: dir, length, halfWidth });
}

/** 원(`point`, `radius`)이 띠에 닿는다(띠 사각형과 겹친다). 길이 0 인 띠는 아무것도 닿지 않는다. */
export function ottoBandTouches(band: OttoDriveBand, point: CityPoint, radius: number): boolean {
  if (!(band.length > 0)) return false;
  const dx = point[0] - band.from[0], dy = point[1] - band.from[1];
  const along = dx * band.direction[0] + dy * band.direction[1], side = dx * -band.direction[1] + dy * band.direction[0];
  const ax = Math.max(0, Math.min(band.length, along)), sx = Math.max(-band.halfWidth, Math.min(band.halfWidth, side));
  return Math.hypot(along - ax, side - sx) <= radius;
}

/**
 * 오토의 지금 직진 띠(예고·판정 중의 drive, 아니면 null): 예고는 발에서, 돌진은 출발점에서 조준 방향으로. 예고 띠 그림과 포획의 공간
 * 판정이 이 하나를 쓴다.
 */
export function ottoDriveTelegraph(otto: OttoState, playerRadius: number, ground: OttoBandGround = {}): OttoDriveBand | null {
  if (otto.pattern !== "drive" || (otto.phase !== "windup" && otto.phase !== "active")) return null;
  const from = otto.phase === "active" && otto.driveFrom ? otto.driveFrom : otto.point;
  return ottoDriveBand(from, otto.aim, playerRadius, ground);
}

export interface OttoCaptureInput {

  readonly player: CityPoint;
  readonly playerRadius: number;
  /** 지금 프레임 번호(같은 프레임 방출 금지). */
  readonly frame: number;
  readonly ground?: OttoBandGround;
}

/**
 * 가드 키의 누름 에지 하나(프레임 시작 상태의 오토로): 빈 칸·포획 창·띠 안이면 그 실행을 카드에 담고 표식한다(`captured`). 아니면
 * 아무것도 바꾸지 않는다 — 그 누름은 평소의 가드다.
 */
export function ottoCanCapture(pocket: OttoPickpocketState, otto: OttoState, input: Omit<OttoCaptureInput, "frame">): boolean {
  if (pocket.card !== "empty" || !ottoCaptureWindowOpen(otto)) return false;
  const band = ottoDriveTelegraph(otto, input.playerRadius, input.ground);
  return band !== null && ottoBandTouches(band, input.player, input.playerRadius);
}

/** 포획 입력과 HUD의 가능 표시가 같은 창·거리·막힘 판정을 쓴다. 조회는 카드를 만들거나 상태를 바꾸지 않는다. */
export function ottoCapture(pocket: OttoPickpocketState, otto: OttoState, input: OttoCaptureInput)
  : { readonly pocket: OttoPickpocketState; readonly captured: boolean } {
  if (!ottoCanCapture(pocket, otto, input)) return { pocket, captured: false };
  return { pocket: Object.freeze({ card: "stored", pass: otto.execution, storedFrame: input.frame }), captured: true };
}


export function ottoPassing(pocket: OttoPickpocketState, otto: OttoState): boolean {
  return pocket.pass !== null && pocket.pass === otto.execution && (otto.phase === "windup" || otto.phase === "active");
}

export interface OttoPassGround {
  readonly player: CityPoint;
  readonly playerRadius: number;
  readonly stride: number;
  /** 옆보기 무대 선(밀어낼 자리를 그 위로). */
  readonly line?: CityFightStageLine | null;
  /** 오토 발에서 그 자리까지 걸을 수 있는가(선이 없을 때만 본다 — 선은 걸을 수 있는 땅으로 잘린 것이다). */
  readonly walkable?: ((from: CityPoint, to: CityPoint) => boolean) | null;
}


export function settleOttoPass(pocket: OttoPickpocketState, otto: OttoState, ground: OttoPassGround)
  : { readonly pocket: OttoPickpocketState; readonly place: CityPoint | null } {
  if (pocket.pass === null || ottoPassing(pocket, otto)) return { pocket, place: null };
  const cleared = Object.freeze({ ...pocket, pass: null });
  if (otto.phase === "defeated") return { pocket: cleared, place: null };
  const gap = ottoBodyRadius(ground.stride) + ground.playerRadius;
  if (Math.hypot(ground.player[0] - otto.point[0], ground.player[1] - otto.point[1]) >= gap) return { pocket: cleared, place: null };
  const reach = gap * 1.02;
  let place: CityPoint = [otto.point[0] - otto.aim[0] * reach, otto.point[1] - otto.aim[1] * reach];
  if (ground.line) place = cityFightStageSnap(ground.line, place);
  else if (ground.walkable && !ground.walkable(otto.point, place)) return { pocket: cleared, place: null };
  return { pocket: cleared, place };
}

/**
 * 방출 방향: 무대 선 위면 바라보는 쪽(`heading`)의 선 방향(선과 직각이면 오토 쪽), 선이 없으면 `heading` 그대로(없으면 오토 쪽).
 */
export function ottoReleaseDirection(heading: CityPoint, from: CityPoint, otto: CityPoint, line?: CityFightStageLine | null): CityPoint {
  const toward = unit([otto[0] - from[0], otto[1] - from[1]]) ?? [1, 0];
  if (!line) return unit(heading) ?? toward;
  const along = heading[0] * line.direction[0] + heading[1] * line.direction[1];
  const sign = Math.abs(along) > 1e-6 ? Math.sign(along)
    : Math.sign(toward[0] * line.direction[0] + toward[1] * line.direction[1]) || 1;
  // + 0: no negative zero in a plan direction.
  return [line.direction[0] * sign + 0, line.direction[1] * sign + 0];
}

/**
 * 오토가 자기 갈고리에 걸린다(방출이 닿았다): 예고·돌진·회수·단추 떨굼 어느 단계든 끊고 `snag`(snagRecoveryMs, 빈틈 유효타 0 — 상한
 * `hitsPerOpening.snag`). 피해는 없다. 이미 걸렸거나 쓰러졌으면 그대로(`snagged` false).
 */
export function ottoSnag(otto: OttoState): { readonly state: OttoState; readonly events: readonly OttoEvent[]; readonly snagged: boolean } {
  if (otto.phase === "snag" || otto.phase === "defeated") return { state: otto, events: [], snagged: false };
  // The caught hook fixes his body here. Cancel a prior throw and its scoring-swing permission at this new opening.
  const state = Object.freeze({ ...otto, phase: "snag" as const, ms: 0, pattern: "drive" as const, openingHits: 0,
    openingAttackId: null, knock: null, hitReaction: null, locked: false, driveFrom: null, comboBeat: 0 as const });
  return { state, events: [{ kind: "snag" }, { kind: "recover-open", snag: true }], snagged: true };
}

export interface OttoReleaseInput {

  readonly player: CityPoint;
  readonly heading: CityPoint;
  readonly playerRadius: number;
  readonly stride: number;
  /** 지금 프레임 번호. 카드를 담은 프레임이면 거절한다. */
  readonly frame: number;

  readonly free: boolean;
  readonly ground?: OttoBandGround;
}

export interface OttoReleaseResult {
  readonly pocket: OttoPickpocketState;
  readonly otto: OttoState;
  /** 수락되어 카드를 썼다. */
  readonly accepted: boolean;
  /** 띠가 오토 몸에 닿았다. */
  readonly touched: boolean;
  /** 그 닿음으로 오토가 걸렸다(이미 걸렸거나 쓰러졌으면 false). */
  readonly snagged: boolean;
  /** 판정한 띠(그림이 같은 길이·폭으로 그린다). 거절이면 null. */
  readonly band: OttoDriveBand | null;
  readonly events: readonly OttoEvent[];
}

/** 방출 키의 누름 하나(같은 프레임의 근접 접촉 뒤에 부른다). */
export function ottoRelease(pocket: OttoPickpocketState, otto: OttoState, input: OttoReleaseInput): OttoReleaseResult {
  if (pocket.card !== "stored" || pocket.storedFrame >= input.frame || !input.free) {
    return { pocket, otto, accepted: false, touched: false, snagged: false, band: null, events: [] };
  }
  const spent = Object.freeze({ ...pocket, card: "empty" as const });
  const direction = ottoReleaseDirection(input.heading, input.player, otto.point, input.ground?.line);
  const band = ottoDriveBand(input.player, direction, input.playerRadius, input.ground);
  const touched = otto.phase !== "defeated" && ottoBandTouches(band, otto.point, ottoBodyRadius(input.stride));
  if (!touched) return { pocket: spent, otto, accepted: true, touched: false, snagged: false, band, events: [] };
  const snag = ottoSnag(otto);
  return { pocket: spent, otto: snag.state, accepted: true, touched: true, snagged: snag.snagged, band, events: snag.events };
}
