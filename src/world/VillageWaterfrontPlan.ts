/** Shared source-image registration for the canal art, water collision and bridge route. */
export const VILLAGE_WATERFRONT = {
  art: { x: 820, y: 510, scale: 0.5, width: 910, height: 526 },
  water: [[66,400],[655,55],[850,175],[220,470]],
  bridge: [[250,200],[350,160],[705,350],[585,420]],
  route: [[950,490],[920,565],[980,603],[1115,680],[1190,713]],
  garden: [[1140,682],[1210,660],[1260,710],[1190,750]],
} as const;
export function waterfrontWorldPoint(point: readonly [number,number]) {
  return {x: VILLAGE_WATERFRONT.art.x + point[0]*VILLAGE_WATERFRONT.art.scale,
    y: VILLAGE_WATERFRONT.art.y + point[1]*VILLAGE_WATERFRONT.art.scale};
}
export const VILLAGE_WATER_POLYGON = VILLAGE_WATERFRONT.water.map(waterfrontWorldPoint);
export const VILLAGE_BRIDGE_POLYGON = VILLAGE_WATERFRONT.bridge.map(waterfrontWorldPoint);


type CanalPoint = readonly [number, number];

/** Sample the same smooth centreline for water collision, banks and vegetation exclusion. */
function canalCurve(a: CanalPoint, b: CanalPoint, c: CanalPoint, d: CanalPoint): CanalPoint[] {
  const length = Math.hypot(b[0]-a[0],b[1]-a[1]) + Math.hypot(c[0]-b[0],c[1]-b[1]) + Math.hypot(d[0]-c[0],d[1]-c[1]);
  const steps = Math.ceil(length / 6);
  return Array.from({length: steps + 1}, (_, i) => {
    const t = i / steps, u = 1 - t;
    return [u*u*u*a[0]+3*u*u*t*b[0]+3*u*t*t*c[0]+t*t*t*d[0],
      u*u*u*a[1]+3*u*u*t*b[1]+3*u*t*t*c[1]+t*t*t*d[1]] as const;
  });
}

/** Tangents follow the painted canal mouths; both curves leave the visible ground. */
export const VILLAGE_CANAL_EXTENSIONS: readonly (readonly CanalPoint[])[] = [
  canalCurve([918,714],[855,743],[842,778],[867,835]),
  [...canalCurve([1185,584],[1235,552],[1264,568],[1360,626]),
    ...canalCurve([1360,626],[1456,684],[1534,736],[1615,785]).slice(1)],
];
export const VILLAGE_CANAL_HALF_WIDTH = 25;
export function canalStrip(points: readonly (readonly [number,number])[], width: number) {
  const sides=[1,-1].map(side=>points.map((p,i)=>{
    const a=points[Math.max(0,i-1)]!,b=points[Math.min(points.length-1,i+1)]!;
    const length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    return {x:p[0]-(b[1]-a[1])/length*width*side,y:p[1]+(b[0]-a[0])/length*width*side};
  }));
  return [...sides[0]!,...sides[1]!.reverse()];
}
export const VILLAGE_CANAL_EXTENSION_POLYGONS=VILLAGE_CANAL_EXTENSIONS.map(points=>canalStrip(points,VILLAGE_CANAL_HALF_WIDTH));
