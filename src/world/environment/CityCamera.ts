import type { CityPoint, NativeCityDefinition } from '../NativeCityDefinition';
import { CITY_ENVIRONMENT } from './CityEnvironment';

export const NATIVE_CITY_FOV = CITY_ENVIRONMENT.camera.fov;
type Vector3 = readonly [number, number, number];
export interface CityCameraBasis {
  readonly scale: number;
  readonly elevation: number;
  readonly vertical: number;
  readonly right: Vector3;
  readonly direction: Vector3;
  readonly toward: Vector3;
  readonly viewDepth: CityPoint;
}

/** Keep the registered projection's operation order for world rendering and lens setup. */
export function cityCameraBasis(p: NativeCityDefinition['projection']): CityCameraBasis {
  const scale = Math.hypot(p.x[0], p.y[0]);
  const elevation = Math.asin(Math.hypot(p.x[1], p.y[1]) / scale), vertical = scale * Math.cos(elevation);
  return {
    scale, elevation, vertical,
    right: [p.x[0] / scale, p.y[0] / scale, 0],
    direction: [p.x[1] / scale / Math.tan(elevation), p.y[1] / scale / Math.tan(elevation), Math.sin(elevation)],
    toward: [p.x[1] / Math.tan(elevation), p.y[1] / Math.tan(elevation), scale * Math.sin(elevation)],
    viewDepth: [-p.x[1], -p.y[1]],
  };
}

export interface CityPerspective {
  readonly fov: number;
  readonly target: CityPoint;
  readonly direction: Vector3;
  readonly distance: number;
}

/** Keep the followed ground point and its local scale fixed when changing lenses. */
export function cityPerspective(projection: NativeCityDefinition['projection'], target: CityPoint,
  viewportWorldHeight: number, fov: number = NATIVE_CITY_FOV): CityPerspective | undefined {
  if (!Number.isFinite(fov) || fov < 0 || fov > 65) throw new Error('City FOV must be between 0 and 65 degrees');
  if (!fov) return undefined;
  const { scale, direction } = cityCameraBasis(projection);
  return { fov, target, direction,
    distance: viewportWorldHeight / scale / (2 * Math.tan(fov * Math.PI / 360)) };
}

export function cityPerspectiveWeight(point: CityPoint, lens: CityPerspective, height = 0): number {
  return 1 - (lens.direction[0] * (point[0] - lens.target[0])
    + lens.direction[1] * (point[1] - lens.target[1]) + lens.direction[2] * height) / lens.distance;
}

export function cityPerspectiveEye(lens: CityPerspective): Vector3 {
  return [lens.target[0] + lens.direction[0] * lens.distance,
    lens.target[1] + lens.direction[1] * lens.distance, lens.direction[2] * lens.distance];
}

/** Column-major clip matrix, shared by the game and lens comparison tool. */
export function cityPerspectiveMatrix(ortho: readonly number[], lens?: CityPerspective): number[] {
  if (!lens) return [...ortho];
  const { direction, distance, target } = lens;
  const w = [-direction[0] / distance, -direction[1] / distance, -direction[2] / distance,
    1 + (direction[0] * target[0] + direction[1] * target[1]) / distance];
  const center = [0, 1].map(row => ortho[row]! * target[0] + ortho[row + 4]! * target[1] + ortho[row + 12]!);
  const { near, far } = CITY_ENVIRONMENT.camera;
  const a = (far + near) / (far - near), b = 2 * far * near / (far - near);
  const result = [...ortho];
  for (let c = 0; c < 4; c++) {
    const delta = w[c]! - (c === 3 ? 1 : 0);
    result[c * 4] = ortho[c * 4]! + center[0]! * delta;
    result[c * 4 + 1] = ortho[c * 4 + 1]! + center[1]! * delta;
    result[c * 4 + 2] = a * w[c]! - (c === 3 ? b / distance : 0);
    result[c * 4 + 3] = w[c]!;
  }
  return result;
}
