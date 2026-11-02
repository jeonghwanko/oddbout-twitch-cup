/**
 * "예고장 임팩트 프레임" — 결판이 난 한 방(피니셔로 쓰러뜨림·완벽 반격·금고지기 쓰러뜨림)에만 거는 세 박자.
 *
 *   A 0~50ms   상아 종이 판(알파 .9)이 배경을 덮고, 배우는 잉크 실루엣, 잉크 가시·네모,
 *              접점에는 열쇠구멍(줄타기 물림과 같은 도형)이 뚫린다.
 *   B 50~67ms  반전: 잉크 판, 배우는 warm[2](금빛), 열쇠구멍은 hotGold.
 *   D 67~84ms  색이 돌아온 첫 프레임에 한 번 긋는 섬광띠(hotGold → warm[0], 가산, 두께 14,
 *              화면 폭 1.2배, -12°). 피니셔의 코어·조각·고리는 그 뒤(화면 시간 100ms)부터 터진다.
 *
 * 전부 170ms 히트스톱 안에서 끝난다. HUD 는 다른 씬이라 색을 유지한다.
 * 광과민 안전: 밝음↔어둠 교대는 A→B 한 번뿐, 판 알파 상한 .9, 2.5초 쿨다운. 모션 감소에서는
 * 끄고, 맞은 몸의 흰 실루엣 한 프레임으로 대신한다(쿨다운에 걸렸을 때도 같다).
 *
 * Phaser 를 모른다. 시트 CLI 가 node 로 직접 읽으므로 import 는 `.ts` 확장자 모듈만 쓴다.
 */

import { PALETTE } from "../art/palette.ts";
import type { SimEvent } from "../../sim/types";
import { COMBAT_HIT_CONTACT_LIFT_PX, ENCOUNTER_BOSS_VICTIM_SCALE } from "./CombatHitFx.ts";
import { ROPE_FX_INK, ROPE_FX_RAMPS, ropeKeyholeOutline } from "./RopeTraversalFx.ts";
import { FX_GRID_PX, fxGridPoly, fxSnap, type FxPoint, type FxPolyPrim, type FxPrim } from "./FxPrim.ts";
import { fxRng } from "./FxRandom.ts";

export const COMBAT_IMPACT_FRAME = Object.freeze({
  // 종이 판을 세 프레임(50ms)으로 늘리고 잉크 반전은 한 프레임만 — 반전의 흰 배우(warm[0])가 두 프레임 번쩍여
  // 결판 뒤에 흰 섬광이 한 번 더 온 것으로 읽혔다(2026-09-27 리뷰). 반전의 배우는 금빛 warm[2] 다.
  paperEndMs: 50,
  inkEndMs: 67,
  /** 섬광띠 한 프레임. */
  bandEndMs: 84,
  cooldownMs: 2_500,
  plateAlpha: 0.9,
  spikes: 10,
  spikeLengthPx: [40, 120] as const,
  spikeWidthPx: [6, 12] as const,
  squares: [6, 8] as const,
  keyholePx: 26,
  bandThicknessPx: 14,
  bandWidthScale: 1.2,
  bandAngleDeg: -12,
  /** 모션 감소·쿨다운 대체: 맞은 몸의 흰 실루엣 한 프레임. */
  flashMs: 16,
  /**
   * 배경 누르기(2026-10-16 엣지 연출): 큰 한 방(돌진·피니셔·완벽 반격·공개 결투 상대 쓰러짐)의 정지 동안 배우 아래에 잉크 막(`alpha`).
   * 풀리면 한 프레임 절반, 그다음 꺼진다(`releaseMs`). 모션 감소에서는 없다. 마을은 `feel.screenGrade.backdrop`.
   */
  backdrop: Object.freeze({ alpha: 0.35, releaseMs: 33 }),
});

export type CombatImpactFramePhase = "paper" | "ink" | "band";

/**
 * 첫 판(A)의 명도: 배경의 반대(2026-10-15 프레임 검수 — 밝은 광장 위 상아 판은 장면과 명도 차가 30 단계뿐이라 세피아 페이드로
 * 읽혔다). `paper`: 어두운 저택 — 상아 판·잉크 실루엣. `ink`: 밝은 마을 — 잉크 판·형광 노랑 실루엣(그 뒤 반전 없이 띠로 간다).
 */
export type CombatImpactFrameTone = "paper" | "ink";

export interface CombatImpactFrameTrigger {
  readonly guardId: string;
  readonly at: FxPoint;
  /** 맞은 몸이 밀려나는 쪽. 섬광띠 기울기가 이 방향을 따른다. */
  readonly facing: -1 | 1;
  /** `keeper-ko`: 공개 결투 상대가 쓰러졌다 — 마지막 한 방의 티어와 무관하게 결판이다. */
  readonly cause: "finisher-ko" | "counter" | "keeper-ko";
}

/**
 * 이 스텝에 임팩트 프레임을 걸 사건. 피니셔가 쓰러뜨린 타격(같은 스텝의 CombatHit tier
 * finisher + CombatDefeated), 완벽 반격, 공개 결투 상대(`encounterBoss`)의 쓰러짐만 해당한다.
 * 평범한 피니셔·강타는 걸지 않는다 — 흔해지면 결판의 무게가 사라진다.
 *
 * `encounterBoss` 는 호출자가 준다(`isEncounterBoss`) — 이 파일은 시트 CLI 가 node 로 읽어 sim 값을 가져오지 않는다.
 */
export function combatImpactFrameTrigger(
  events: readonly SimEvent[],
  encounterBoss: (guardId: string) => boolean = () => false,
): CombatImpactFrameTrigger | null {
  const defeated = new Set(events.filter((event) => event.kind === "CombatDefeated").map((event) => event.guardId));
  for (const event of events) {
    if (event.kind !== "CombatDefeated" || !encounterBoss(event.guardId)) continue;
    const hit = events.find((candidate) => candidate.kind === "CombatHit" && candidate.guardId === event.guardId);
    const facing = hit?.kind === "CombatHit" && hit.facing === -1 ? -1 : 1;
    return { guardId: event.guardId, at: contact(event.contactAt ?? event.at, ENCOUNTER_BOSS_VICTIM_SCALE), facing, cause: "keeper-ko" };
  }
  for (const event of events) {
    if (event.kind === "CombatHit" && event.tier === "finisher" && defeated.has(event.guardId)) {
      return { guardId: event.guardId, at: contact(event.at), facing: event.facing === -1 ? -1 : 1, cause: "finisher-ko" };
    }
  }
  for (const event of events) {
    if (event.kind !== "PerfectCounter") continue;
    const hit = events.find((candidate) => candidate.kind === "CombatHit" && candidate.guardId === event.guardId);
    const facing = hit?.kind === "CombatHit" && hit.facing === -1 ? -1 : 1;
    return { guardId: event.guardId, at: contact(event.at), facing, cause: "counter" };
  }
  return null;
}

/** sim 경비 좌표는 발바닥이다. 접촉 VFX 와 같은 높이(상체, 키에 비례)로 올린다. */
function contact(at: FxPoint, victimScale = 1): FxPoint {
  return { x: at.x, y: at.y - COMBAT_HIT_CONTACT_LIFT_PX * victimScale };
}

export type CombatImpactFrameMode = "frame" | "flash";

/**
 * 트리거가 왔을 때 무엇을 틀지. 모션 감소면 언제나 흰 실루엣 한 프레임, 쿨다운 안이어도
 * 흰 실루엣으로 대신한다(결판이 무음이 되지는 않게).
 */
export function combatImpactFrameMode(lastFrameMs: number, nowMs: number, reducedMotion: boolean): CombatImpactFrameMode {
  if (reducedMotion) return "flash";
  return nowMs - lastFrameMs >= COMBAT_IMPACT_FRAME.cooldownMs ? "frame" : "flash";
}

export function combatImpactFramePhase(ageMs: number): CombatImpactFramePhase | null {
  if (ageMs < 0) return null;
  if (ageMs < COMBAT_IMPACT_FRAME.paperEndMs) return "paper";
  if (ageMs < COMBAT_IMPACT_FRAME.inkEndMs) return "ink";
  if (ageMs < COMBAT_IMPACT_FRAME.bandEndMs) return "band";
  return null;
}

/** 배우 실루엣의 단색. 섬광띠 단계부터는 원래 색으로 돌아온다(null). */
export function combatImpactFrameActorTint(phase: CombatImpactFramePhase | null, tone: CombatImpactFrameTone = "paper"): number | null {
  if (phase === "paper") return tone === "ink" ? PALETTE.combatNeonYellow : PALETTE.paperInk;
  if (phase === "ink") return ROPE_FX_RAMPS.warm[2]!;
  return null;
}

export interface CombatImpactFrameView {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface CombatImpactFramePrims {
  /** 배우 뒤 — 판·가시·네모·열쇠구멍. 보통 합성. */
  readonly plate: FxPrim[];
  /** 배우 앞 — 섬광띠. 가산 합성. */
  readonly front: FxPrim[];
}


/**
 * `ageMs` 시각의 임팩트 프레임 도형. `view` 는 카메라가 보는 월드 사각형(흔들림 여유 포함),
 * `linePx` 는 화면 논리 1px 의 월드 길이 — 섬광띠·가시 굵기는 화면 기준이다.
 */
export function combatImpactFramePrims(
  ageMs: number,
  trigger: Pick<CombatImpactFrameTrigger, "at" | "facing">,
  view: CombatImpactFrameView,
  seed: number,
  linePx = 1,
  tone: CombatImpactFrameTone = "paper",
): CombatImpactFramePrims {
  const phase = combatImpactFramePhase(ageMs);
  const plate: FxPrim[] = [];
  const front: FxPrim[] = [];
  if (phase === null) return { plate, front };
  const { x, y } = trigger.at;
  if (phase === "band") {
    front.push(...slashBand(trigger, view, linePx));
    return { plate, front };
  }
  const paper = phase === "paper", inkPlate = paper && tone === "ink";
  const plateColor = inkPlate ? ROPE_FX_INK : paper ? PALETTE.paper : ROPE_FX_INK;
  const markColor = inkPlate ? PALETTE.combatNeonYellow : paper ? ROPE_FX_INK : PALETTE.paper;
  const margin = 64;
  plate.push({
    kind: "poly",
    points: [
      view.x - margin, view.y - margin, view.x + view.width + margin, view.y - margin,
      view.x + view.width + margin, view.y + view.height + margin, view.x - margin, view.y + view.height + margin,
    ],
    color: plateColor,
    alpha: Math.min(0.9, COMBAT_IMPACT_FRAME.plateAlpha),
    additive: false,
  });
  // 가시·네모는 두 박자가 같은 배치여야 반전이 "뒤집힘"으로 읽힌다 — 같은 시드.
  const rng = fxRng(seed);
  const c = COMBAT_IMPACT_FRAME;
  for (let i = 0; i < c.spikes; i += 1) {
    const angle = (i / c.spikes) * Math.PI * 2 + (rng() - 0.5) * 0.4;
    const length = (c.spikeLengthPx[0] + (c.spikeLengthPx[1] - c.spikeLengthPx[0]) * rng()) * linePx;
    const width = (c.spikeWidthPx[0] + (c.spikeWidthPx[1] - c.spikeWidthPx[0]) * rng()) * linePx;
    const inner = c.keyholePx * 0.7;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const bx = x + dx * inner;
    const by = y + dy * inner;
    plate.push(fxGridPoly([
      bx - dy * width / 2, by + dx * width / 2,
      bx + dx * length, by + dy * length,
      bx + dy * width / 2, by - dx * width / 2,
    ], markColor));
  }
  const squares = c.squares[0] + Math.floor(rng() * (c.squares[1] - c.squares[0] + 1));
  for (let i = 0; i < squares; i += 1) {
    const angle = rng() * Math.PI * 2;
    const distance = (30 + rng() * 70) * linePx;
    const size = Math.max(FX_GRID_PX, fxSnap((4 + rng() * 6) * linePx));
    const cx = fxSnap(x + Math.cos(angle) * distance - size / 2);
    const cy = fxSnap(y + Math.sin(angle) * distance - size / 2);
    plate.push({ kind: "poly", points: [cx, cy, cx + size, cy, cx + size, cy + size, cx, cy + size], color: markColor, alpha: 1, additive: false });
  }
  // 열쇠구멍: 종이 판에서는 잉크 구멍, 반전에서는 금빛.
  plate.push(fxGridPoly(ropeKeyholeOutline(x, y, c.keyholePx), inkPlate ? PALETTE.combatNeonYellow : paper ? ROPE_FX_INK : ROPE_FX_RAMPS.warm[1]!));
  return { plate, front };
}

/** 섬광띠: 접점을 지나는 긴 사선. 바깥 hotGold, 안쪽 warm[0]. 맞은 쪽으로 기운다. */
function slashBand(
  trigger: Pick<CombatImpactFrameTrigger, "at" | "facing">,
  view: CombatImpactFrameView,
  linePx: number,
): FxPrim[] {
  const c = COMBAT_IMPACT_FRAME;
  const angle = (c.bandAngleDeg * Math.PI / 180) * trigger.facing;
  const half = (view.width * c.bandWidthScale) / 2;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const band = (thickness: number, color: number): FxPolyPrim => {
    const t = (thickness * linePx) / 2;
    // 띠의 수직 방향(-dy, dx)으로 ±t 만큼 벌린 긴 사각형.
    const px = -dy * t;
    const py = dx * t;
    const ax = trigger.at.x - dx * half;
    const ay = trigger.at.y - dy * half;
    const bx = trigger.at.x + dx * half;
    const by = trigger.at.y + dy * half;
    return {
      kind: "poly",
      points: [ax - px, ay - py, bx - px, by - py, bx + px, by + py, ax + px, ay + py],
      color,
      alpha: 1,
      additive: true,
    };
  };
  return [band(c.bandThicknessPx, ROPE_FX_RAMPS.warm[1]!), band(c.bandThicknessPx * 0.4, ROPE_FX_RAMPS.warm[0]!)];
}
