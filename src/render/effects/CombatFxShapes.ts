/**
 * 전투 VFX 의 곡선 도형 모음. 바닥 예고·보스 돌진이 같은 붓을 쓴다.
 *
 * 모든 함수는 평평한 [x0, y0, x1, y1, …] 꼭짓점 배열을 돌려주는 순수 함수다. 삼각형·마름모를
 * 크게 키우는 대신 휘어진 척추를 따라 가늘어지는 리본, 가운데가 두꺼운 초승달, 오목한 네 갈래
 * 반짝임으로 모양을 만든다(2026-09-26 보스 필름 리뷰: 평평한 쐐기·보석·천막 삼각형 거부).
 * FX 시트 CLI 가 node 로 직접 읽으므로 import 가 없다.
 */

/** 가운데(peak)에서 1, 양끝에서 0 인 둥근 두께 곡선. peak 가 0.5 가 아니면 한쪽이 길게 빠진다. */
export function taper(u: number, peak = 0.5): number {
  const t = Math.max(0, Math.min(1, u));
  const p = Math.max(0.05, Math.min(0.95, peak));
  return t < p ? Math.sin((Math.PI / 2) * (t / p)) : Math.cos((Math.PI / 2) * ((t - p) / (1 - p)));
}

/** 타원(또는 타원 호) 둘레. 원근 바닥 고리와 웅덩이에 쓴다. */
export function ellipsePoints(cx: number, cy: number, rx: number, ry: number, steps = 20,
  from = 0, to = Math.PI * 2): number[] {
  const points: number[] = [];
  const closed = Math.abs(to - from) >= Math.PI * 2 - 1e-6;
  const count = closed ? steps : steps + 1;
  for (let i = 0; i < count; i += 1) {
    const a = from + ((to - from) * i) / steps;
    points.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
  }
  return points;
}

/**
 * 척추를 따라 폭이 변하는 리본. `width(u)` 는 척추 비율 u(0 = 첫 점)에서의 전체 폭이다.
 * 왼쪽 가장자리를 따라간 뒤 오른쪽 가장자리로 돌아와 닫힌 윤곽을 만든다.
 */
export function ribbonPoints(spine: readonly number[], width: (u: number) => number): number[] {
  const n = Math.floor(spine.length / 2);
  const left: number[] = [];
  const right: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const prev = Math.max(0, i - 1);
    const next = Math.min(n - 1, i + 1);
    let tx = spine[next * 2]! - spine[prev * 2]!;
    let ty = spine[next * 2 + 1]! - spine[prev * 2 + 1]!;
    const length = Math.hypot(tx, ty) || 1;
    tx /= length;
    ty /= length;
    const half = Math.max(0, width(n <= 1 ? 0 : i / (n - 1))) / 2;
    const x = spine[i * 2]!;
    const y = spine[i * 2 + 1]!;
    left.push(x - ty * half, y + tx * half);
    right.push(x + ty * half, y - tx * half);
  }
  for (let i = n - 1; i >= 0; i -= 1) left.push(right[i * 2]!, right[i * 2 + 1]!);
  return left;
}

/**
 * 타원 호를 따라 가운데가 두껍고 양끝이 바늘처럼 빠지는 초승달 띠. 두께는 호 안쪽으로 쌓인다.
 * `peak` 로 가장 두꺼운 자리를 옮기면 한쪽으로 흐르는 휘두름 자국이 된다.
 */
export function crescentPoints(cx: number, cy: number, rx: number, ry: number, from: number, to: number,
  thickness: number, steps = 14, peak = 0.5): number[] {
  const points: number[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const a = from + ((to - from) * i) / steps;
    points.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
  }
  const squash = ry / Math.max(1e-6, rx);
  for (let i = steps; i >= 0; i -= 1) {
    const u = i / steps;
    const a = from + (to - from) * u;
    const th = thickness * taper(u, peak);
    points.push(cx + Math.cos(a) * Math.max(0, rx - th), cy + Math.sin(a) * Math.max(0, ry - th * squash));
  }
  return points;
}

/**
 * 오목한 변의 네 갈래 반짝임. `rx`·`ry` 는 가로·세로 팔 길이, `waist` 는 변이 안으로 파이는 정도
 * (0 = 한가운데까지, 1 = 곧은 마름모). 곧은 마름모 보석 대신 빛이 모인 한 점으로 읽힌다.
 */
export function sparklePoints(cx: number, cy: number, rx: number, ry: number, waist = 0.18,
  angle = 0, stepsPerSide = 4): number[] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const tip = (k: number): [number, number] => {
    const lx = [rx, 0, -rx, 0][k % 4]!;
    const ly = [0, ry, 0, -ry][k % 4]!;
    return [cx + lx * cos - ly * sin, cy + lx * sin + ly * cos];
  };
  const points: number[] = [];
  for (let k = 0; k < 4; k += 1) {
    const [ax, ay] = tip(k);
    const [bx, by] = tip(k + 1);
    // 두 팔 끝 사이의 조절점을 중심 쪽으로 당긴 2차 베지어.
    const qx = cx + ((ax + bx) / 2 - cx) * waist;
    const qy = cy + ((ay + by) / 2 - cy) * waist;
    for (let i = 0; i < stepsPerSide; i += 1) {
      const t = i / stepsPerSide;
      const m = 1 - t;
      points.push(m * m * ax + 2 * m * t * qx + t * t * bx, m * m * ay + 2 * m * t * qy + t * t * by);
    }
  }
  return points;
}

/** 둥근 머리에서 꼬리로 가늘어지는 혜성. `angle` 은 머리가 향하는 쪽이다. */
export function cometPoints(hx: number, hy: number, angle: number, length: number, width: number): number[] {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const r = width / 2;
  const points: number[] = [];
  for (let i = 0; i <= 6; i += 1) {
    const a = angle - Math.PI / 2 + (Math.PI * i) / 6;
    points.push(hx + Math.cos(a) * r, hy + Math.sin(a) * r);
  }
  // 꼬리는 곧은 쐐기가 아니라 살짝 부푼 두 곡선으로 모은다.
  const px = -dy;
  const py = dx;
  points.push(hx - dx * length * 0.45 - px * r * 0.55, hy - dy * length * 0.45 - py * r * 0.55);
  points.push(hx - dx * length, hy - dy * length);
  points.push(hx - dx * length * 0.45 + px * r * 0.55, hy - dy * length * 0.45 + py * r * 0.55);
  return points;
}

/** 척추 점 배열 헬퍼: `fn(s)` 를 steps+1 개 샘플로 편다. */
export function sampleSpine(steps: number, fn: (s: number) => readonly [number, number]): number[] {
  const points: number[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const [x, y] = fn(i / steps);
    points.push(x, y);
  }
  return points;
}

/** 0..1 에서 부드럽게 오르는 계단. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** 음수에서도 0..1 을 돌려주는 소수부. */
export function fract(x: number): number {
  return x - Math.floor(x);
}
