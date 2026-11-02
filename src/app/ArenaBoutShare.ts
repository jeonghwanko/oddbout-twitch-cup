import { arenaBoutLinkShape, arenaBoutReplayQuery, type ArenaBout } from "./ArenaBoutLink";
import { arenaPlayable } from "./ArenaRoster";
import { CITY_TOURNAMENT } from "./CityTournamentProgress";
import type { Locale } from "./Locale";

export { arenaBoutPlayQuery, type ArenaBout } from "./ArenaBoutLink";

/**
 * 경기 공유(2026-10-24, ODDBOUT — 사용자: IP 확산, "우리 감각으로 좋은 것을 추천해서 제작"): AI 대 AI 경기는 두 코너와 시드로 똑같이 다시
 * 돈다. 그래서 링크 하나가 경기 전체다 — 영상을 올리지 않아도 받은 사람이 같은 경기를 처음부터 본다. 링크는 홈 PLAY 의 짝 링크
 * (`?play=1&fighter=&opponent=` — `ArenaQuickStart`)에 시드(`bout`)와 그 경기의 규칙 판(`rules`)을 더한 것이다. 규칙 판이 바뀌면 같은
 * 시드라도 결과가 달라질 수 있어 받은 쪽이 알린다(`arenaSharedBoutRulesChanged`).
 */


export function arenaBoutShareable(a: string, b: string): boolean {
  const first = arenaPlayable(a)?.kind, second = arenaPlayable(b)?.kind;
  return first === "fighter" && second === "fighter" && a !== b;
}

/**
 * 링크로 다시 볼 수 있는 경기(2026-10-27, 2단계 공용 무대): 위의 기본 선수 짝, 또는 AI 대결이 승인된 등록 선수와 마을 파이터의 경기(어느 코너든)다.
 * 등록 선수 경기는 컵과 같은 엔진(`cityTournamentBoutSetup`의 등록 선수 코너)으로 그의 지금 패키지로 돈다. 주인이 그 사이 선수를 고쳤으면
 * 결과 지문(`d`)이 갈라 받은 쪽이 다른 경기임을 안다. 대진 페이지(카드 그림)는 기본 선수 짝만 굽는다.
 */
export function arenaBoutLinkable(a: string, b: string): boolean {
  return arenaBoutLinkShape(a, b) && [a, b].every(id => {
    const playable = arenaPlayable(id);
    return playable?.kind === "fighter" || playable?.kind === "registered" && playable.duelApproved === true;
  });
}

/**
 * 대진별 미리보기(2026-10-25, 사용자: 대전 상대별 OG 이미지): 링크 미리보기를 읽는 크롤러는 스크립트를 돌리지 않아 `fighter.html` 의 질의로는
 * 대진마다 다른 카드를 보일 수 없다. 사이트 빌드가 짝마다 페이지(언어별)와 카드를 굽고(`tools/ai-fighter/bout-share-pages.mjs`), 공유 링크는
 * 그 페이지로 간다. 페이지는 그 대진의 og 태그만 두고 곧바로 경기 링크로 넘긴다(`ArenaBoutSharePages`).
 */
export function arenaBoutSharePagePath(a: string, b: string, locale: Locale): string { return `vs/${a}-vs-${b}.${locale}.html`; }
/** 그 짝의 카드 그림(1200×630 JPEG, 두 언어 공용). */
export function arenaBoutShareCardPath(a: string, b: string): string { return `vs/${a}-vs-${b}.jpg`; }

/** 이 빌드에 대진 페이지가 실렸는가: 사이트 빌드의 플러그인만 켠다. 개발 서버·본편 빌드는 경기 페이지로 바로 가는 링크다. */
export function arenaBoutSharePagesBuilt(value: unknown = import.meta.env.VITE_ODDBOUT_BOUT_PAGES): boolean { return value === "1"; }

/**
 * 이 경기를 다시 여는 링크: 대진 페이지가 실린 빌드면 그 페이지(시드·규칙 판만 질의로), 아니면 `page`(지금 페이지 주소)의 같은 페이지.
 * 다른 질의는 버린다. 유입 태그는 공유 링크를 나타내며 Discord 가입을 뜻하지 않는다.
 */
export function arenaBoutShareUrl(page: string, bout: ArenaBout, locale: Locale, rules: number = CITY_TOURNAMENT.rulesVersion,
  pages: boolean = arenaBoutSharePagesBuilt()): string {
  // A registered fighter's bout has no pair page (the build bakes the built-in pairs only): the bout page itself.
  const paged = pages && arenaBoutShareable(bout.a, bout.b);
  const url = new URL(paged ? arenaBoutSharePagePath(bout.a, bout.b, locale) : page, page);
  const query = arenaBoutReplayQuery(bout, rules, locale, !paged);
  query.set("utm_source", "player_share");
  query.set("utm_medium", "referral");
  query.set("utm_campaign", "bout");
  url.search = query.toString();
  url.hash = "";
  return url.toString();
}

/**
 * 받은 쪽에서 돈 경기가 공유한 그 경기인가(2026-10-26): 결과 지문(`d`)을 아는 링크는 지문으로 정한다 — 규칙 판이 바뀌어도 같은 경기일 수 있고
 * (그 판이 이 짝·시드를 바꾸지 않았다), 판이 같아도 다른 기기에서 갈릴 수 있다. 지문이 없는 옛 링크는 판으로만 짐작한다("maybe").
 * `digest` 는 받은 쪽이 돈 경기의 지문(아직 모르면 null — 판으로 짐작).
 */
export type ArenaSharedBoutVerdict = "same" | "changed" | "maybe";
export function arenaSharedBoutVerdict(shared: { readonly rules: number | null; readonly digest?: string | null }, digest: string | null,
  current: number = CITY_TOURNAMENT.rulesVersion): ArenaSharedBoutVerdict {
  if (shared.digest && digest) return shared.digest === digest ? "same" : "changed";
  return arenaSharedBoutRulesChanged(shared.rules, current) ? "maybe" : "same";
}

/** 공유한 경기의 규칙 판이 지금과 다른가(판을 모르는 링크는 다르다고 하지 않는다). */
export function arenaSharedBoutRulesChanged(rules: number | null, current: number = CITY_TOURNAMENT.rulesVersion): boolean {
  return rules !== null && rules !== current;
}
