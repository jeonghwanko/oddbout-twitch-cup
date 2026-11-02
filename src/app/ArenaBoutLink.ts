import type { Locale } from "./Locale";

/**
 * 경기 링크의 모양(2026-10-27, 2단계 공용 무대): 질의와 코너 규칙만 둔다. 명단을 읽지 않아 선수 페이지(제작자 사이트 번들)도 같은 링크를
 * 만든다. 명단으로 마저 확인하는 것은 `ArenaBoutShare.arenaBoutLinkable`이다.
 */
export interface ArenaBout { readonly a: string; readonly b: string; readonly seed: number; readonly digest?: string }

const REGISTERED_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const isPlayer = (id: string) => id.startsWith("player-");


export function arenaBoutLinkShape(a: string, b: string): boolean {
  const registered = [a, b].filter(id => REGISTERED_ID.test(id)).length;
  return a !== b && !isPlayer(b) && registered <= 1 && !(registered === 1 && isPlayer(a));
}

/** 이 짝을 바로 여는 PLAY 질의(시드 없음) — 경기 페이지가 받는다. */
export function arenaBoutPlayQuery(a: string, b: string, locale: Locale): URLSearchParams {
  return new URLSearchParams({ lang: locale, play: "1", fighter: a, opponent: b });
}

/**
 * 그 경기를 처음부터 다시 여는 질의: PLAY 짝에 시드(`bout`), 그 경기의 규칙 판(`rules`), 결과 지문(`d`)을 더한다(`RuntimeOptions`의
 * `arenaBoutSeed`·`arenaBoutRules`·`arenaBoutDigest`). `paired`가 false 면 짝 없이 — 짝을 아는 대진 페이지로 갈 때다.
 */
export function arenaBoutReplayQuery(bout: ArenaBout, rules: number, locale: Locale, paired = true): URLSearchParams {
  const query = paired ? arenaBoutPlayQuery(bout.a, bout.b, locale) : new URLSearchParams();
  query.set("bout", String(bout.seed));
  query.set("rules", String(rules));
  if (bout.digest !== undefined) query.set("d", bout.digest);
  return query;
}
