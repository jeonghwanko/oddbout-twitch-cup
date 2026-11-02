import { BLACKTHORNE_ROOMS } from "./BlackthorneManorDefinition";
import type { ManorExplorationState } from "./ManorExplorationRules";

/**
 * 블랙손 방문 기억. 옛 저장의 `openedPassageIds`(지금 판에 없는 비밀 통로)는 읽을 때 조용히 버린다.
 */
export interface ManorMemory {
  readonly visits: number;
  readonly visitedRoomIds: readonly string[];
}
export function sanitizeManorMemory(value: unknown): ManorMemory {
  const raw = value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const ids = (key: string, allowed: readonly string[]) => allowed.filter((id) => Array.isArray(raw[key]) && raw[key].includes(id));
  return {
    visits: typeof raw.visits === "number" && Number.isFinite(raw.visits) ? Math.max(0, Math.min(1000000, Math.floor(raw.visits))) : 0,
    visitedRoomIds: ids("visitedRoomIds", BLACKTHORNE_ROOMS.map((room) => room.id)),
  };
}
export function rememberManor(memory: ManorMemory | undefined, discovery: Pick<ManorExplorationState, "visitedRoomIds">, entered = false): ManorMemory {
  const previous = sanitizeManorMemory(memory);
  return sanitizeManorMemory({
    visits: previous.visits + (entered ? 1 : 0),
    visitedRoomIds: [...previous.visitedRoomIds, ...discovery.visitedRoomIds],
  });
}
