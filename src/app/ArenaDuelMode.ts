import type { ArenaDuelData } from "./ArenaDuel";
import { sameDuelResult, type ServerDuelMatch } from "./RankedDuel";
import type { CityFightBoutResult } from "../sim/cityFight/bout/CityFightFighterBout";


export type ArenaDuelMode =
  /** 화면 밖에 실린 방송: 결과는 엔진 콜백으로만 — 전송·기록·보상 없음. */
  | { readonly kind: "broadcast"; readonly broadcast: NonNullable<ArenaDuelData["broadcast"]> }
  /** 16강 컵 대결(대표 선수의 판, 또는 이미 정해진 판을 다시 보는 `watch`). */
  | { readonly kind: "cup"; readonly cup: NonNullable<ArenaDuelData["cup"]> }
  /** 컵 기록실의 판 다시 보기 — 아무것도 기록하지 않는다. */
  | { readonly kind: "replay"; readonly replay: NonNullable<ArenaDuelData["replay"]> }
  /** 플레이어의 주간 토너먼트 판 — 결과는 대진표로. */
  | { readonly kind: "tournament"; readonly entry: NonNullable<ArenaDuelData["tournament"]>["entry"] }
  /** 플레이어 자기 선수의 연습 판 — 손님 기록에 연습 판으로. */
  | { readonly kind: "practice" }
  /** 아무의 것도 아닌 AI 대결(마을 선수끼리) — 기록 없음. */
  | { readonly kind: "exhibition" }
  /** 등록 선수끼리의 대결 — 서버가 정한 판이면 그 결과가 우선이다(`arenaServerDuelResult`). */
  | { readonly kind: "registered"; readonly server: ServerDuelMatch | null };


export function arenaDuelMode(data: ArenaDuelData, builtIn: boolean): ArenaDuelMode {
  if (data.broadcast) return { kind: "broadcast", broadcast: data.broadcast };
  if (!builtIn) return { kind: "registered", server: data.serverMatch ?? null };
  if (data.cup) return { kind: "cup", cup: data.cup };
  if (data.replay) return { kind: "replay", replay: data.replay };
  if (data.tournament) return { kind: "tournament", entry: data.tournament.entry };
  if (data.player) return { kind: "practice" };
  return { kind: "exhibition" };
}

/**
 * 등록 선수 대결의 결과로 남길 판. 서버가 이미 계산해 확정한 판이면 서버의 결과와 끝난 시각을 쓴다 — 이 기기의 재생이 달라도 덮어쓰지 않고,
 * 다르다는 것(`matches: false`)만 알린다. 서버 판이 없으면 이 기기의 결과와 지금 시각.
 */
export function arenaServerDuelResult(result: CityFightBoutResult, server: ServerDuelMatch | null, nowMs: number):
  { readonly result: CityFightBoutResult; readonly matches: boolean; readonly atMs: number } {
  if (!server) return { result, matches: true, atMs: nowMs };
  return { result: server.result, matches: sameDuelResult(result, server.result), atMs: Date.parse(server.completedAt) };
}
