import type { ComicImpactArtKind } from "../../assets/ComicImpactArtCatalog";
import { hypeRankOf, type HypeKind, type HypeRank, type KeyedHypeContact } from "./HypeImpactFx";
export interface DuelComicArtCommand {
  readonly kind: ComicImpactArtKind;
  readonly x: number; readonly y: number; readonly width: number;
  readonly ageMs: number; readonly holdMs: number;
  readonly angle: number; readonly flipX: boolean;
  /** 빛 터짐 층(`HypeImpactFx`)의 입력. 없으면 원화 크기에서 짐작한다. */
  readonly rank?: HypeRank;
  readonly bodyPx?: number;
  /** 한 접촉의 정체 — 같은 접촉의 명령은 매 프레임 같은 값. */
  readonly seed?: number;
  readonly hurt?: boolean;
  /** 빛 층의 색 가족(`HypeContact.tone`): "pearl" — 마을 대결의 카운터 명중(2026-10-19 신호 정리: 진주·흰색은 흰 등급, 금은 금 등급만). */
  readonly tone?: "gold" | "pearl";
  /** 원화에 곱하는 색(눈빛 원화는 크림·남색으로 그려져 쓰는 곳이 색을 입힌다 — 돌진 금, 가드 진주, 예고 등급색). */
  readonly tint?: number;
  /** 원화와 빛 층에 곱하는 불투명도 — 버틴 평타(`COMBAT_ABSORBED_HIT`). 없으면 1. */
  readonly alpha?: number;
  /** 정지가 늘린 정점이 제 길이를 지나면 작고 옅어져 맞은 자세를 비켜 준다(`COMIC_IMPACT_CLEAR_HOLD`, 마을 대결). */
  readonly clearHold?: boolean;
}

/** 빛 터짐 층이 없는 원화(예고 눈빛·반짝임): 원화 하나가 그 순간 전부다. */
export function duelComicArtHasLight(kind: ComicImpactArtKind): boolean { return kind !== "glint" && kind !== "twinkle"; }

/** 원화 종류 → 빛 터짐 층의 종류. 막힘 원화(clang·block)는 갑옷·가드 막힘이고, 모양은 원화가 맡는다(`drawn`). */
const HYPE_KIND: Readonly<Record<ComicImpactArtKind, HypeKind>> = Object.freeze({
  strike: "strike", heavy: "heavy", slash: "slash", parry: "parry", clang: "armor", block: "guard", glint: "glint", twinkle: "glint",
});

/** 원화 크기 배율(`width / bodyPx`) — 몸 키를 모르는 옛 명령에서 거꾸로 짐작할 때. */
const ART_WIDTH_PER_BODY = 1.25;

/** 원화 명령 → 빛 터짐 접촉. 방향은 원화가 이미 뒤집혀 있으므로 되돌린다. `artReady` 가 거짓이면 막힘의 별·호를 빛 층이 대신 그린다. */
export function hypeContactOf(command: DuelComicArtCommand, artReady = true): KeyedHypeContact {
  const rank = command.rank ?? hypeRankOf(command.kind === "strike" ? "light" : "heavy");
  const seed = command.seed ?? Math.round(command.x * 7 + command.y * 13);
  const kind = HYPE_KIND[command.kind], drawn = artReady && (kind === "armor" || kind === "guard");
  return { key: `${seed}:${command.kind}:${Math.round(command.x)}:${Math.round(command.y)}`, kind, rank, ...(drawn ? { drawn: true } : {}),
    x: command.x, y: command.y, bodyPx: command.bodyPx ?? command.width / ART_WIDTH_PER_BODY,
    angle: command.angle + (command.flipX ? Math.PI : 0), ageMs: command.ageMs, holdMs: command.holdMs, seed,
    ...(command.hurt ? { hurt: true } : {}), ...(command.tone ? { tone: command.tone } : {}),
    ...(command.alpha === undefined ? {} : { alpha: command.alpha }) };
}
