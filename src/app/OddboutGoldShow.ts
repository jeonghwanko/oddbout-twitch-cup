/**
 * 동전 연출과 위 막대 금화 카운터의 넘겨받기(2026-10-27, docs/Plan/2026-10-27-oddbout-cup-champion-and-gold G3 — 사용자: "경기에서 승리하면
 * 골드가 드롭되었다가 우상단으로 빨려들어가게"). 금화는 기록할 때 이미 지갑에 들어가 있다(`creditOddboutGold`). 카운터는 받은 금화를 다음
 * 마이크로태스크에 센다 — 그 사이(같은 호출 안)에 씬이 `claimOddboutGold` 로 그 몫을 맡으면 카운터는 그만큼 세지 않고 기다렸다가, 동전이
 * 닿을 때마다(`land`) 올리고 `finish` 에 끝값이 된다. 카운터가 없는 페이지(마을 등)에서는 맡을 곳이 없다(null) — 동전도 날리지 않는다.
 */

/** A claimed payment on its way to the counter. */
export interface OddboutGoldDelivery {
  /** Where the coins fly to: the counter's coin (page px, its middle), null once it is off the page. */
  anchor(): { readonly x: number; readonly y: number } | null;
  /** `amount` of the claimed gold arrived (a coin): the number goes up by it. */
  land(amount: number): void;
  /** The rest arrived at once (the drop ended or was cut — the scene left): the number is the wallet's. Again is nothing. */
  finish(): void;
}

/** The counter on this page. */
export interface OddboutGoldTarget {
  claim(amount: number): OddboutGoldDelivery;
  /** One shine of the counter (no gold) — the champion's ceremony's gold stamp (C3). */
  pulse(): void;
}

let target: OddboutGoldTarget | null = null;

/** The counter takes the claims (one per page); the returned call lets go. */
export function setOddboutGoldTarget(next: OddboutGoldTarget): () => void {
  target = next;
  return () => { if (target === next) target = null; };
}

/** The counter shines once (the ceremony's "이번 컵 +300 골드" stamp points at it); nothing without a counter. */
export function pulseOddboutGold(): void {
  target?.pulse();
}

/** Takes `amount` just paid (in the same call as the payment) for coins to bring to the counter; null without a counter or gold. */
export function claimOddboutGold(amount: number): OddboutGoldDelivery | null {
  return amount > 0 && target ? target.claim(amount) : null;
}
