import type { VillageFacing } from "./VillageFacing";

/**
 * 경로 추종의 8방향 — 2:1 판정(`mansionEntryFacing` 과 같은 규칙). 마을 데이터를 읽지 않는 잎 모듈(2026-10-22 — 싸움 규칙과 서버 엔진이
 * `VillageNavigation` 을 거쳐 마을 정의·원화 목록까지 끌어왔다).
 */
export function villagePathFacing(dx: number, dy: number): VillageFacing {
  return Math.abs(dx) > Math.abs(dy) * 2 ? (dx > 0 ? "right" : "left")
    : Math.abs(dy) > Math.abs(dx) * 2 ? (dy > 0 ? "down" : "up")
    : dy > 0 ? (dx > 0 ? "down-right" : "down-left") : (dx > 0 ? "up-right" : "up-left");
}
