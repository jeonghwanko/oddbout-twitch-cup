import type { NativeCityKumaActionKind } from "./NativeCityCombatTuning";
import type { KumaCombatState, KumaTuning } from "./NativeCityKumaCombatState";
import { kumaCombatAirborne, kumaCombatRecovering } from "./NativeCityKumaSwing";
import { nativeCityKumaBestAnswer } from "./NativeCityExchange";

/**
 * V 카운터의 게이지(2026-10-18 손맛 2단계, json `kuma.rhythm.counter`): 갑옷을 입은 그의 휘두름 동안 예비동작 첫 프레임부터 차오르고, 꽉 찬 때부터
 * 그 접촉까지가 카운터 창이다. 2026-10-19 읽기 보상(`triangle.best`, docs/Plan/2026-10-19-kuma-read-reward): 고리는 최선의 답이 카운터인 색(흰)의
 * 휘두름에만 있고, 그 대상은 **첫 접촉**이다 — 첫 접촉 `windowMs` 전에 꽉 차고, 창 안의 V 는 연타 전체를 끊는다. 첫 접촉이 나가면 고리는 꺼진다
 * (앞서: 마지막 접촉이 대상이라 연타는 앞 접촉 직후 0→가득으로 깜빡 켜졌고, 4연타의 창은 119 ms였다). 금 공격엔 고리가 없다(V 는 갑옷에 튕긴다).
 * 박자는 그 휘두름의 시간표(`hitsMs` — 늦은 박자·예비동작 배율이 이미 들어 있다)에서 읽으므로 게이지가 늘 그와 같이 늘어난다. 순수하다.
 */
export interface KumaCounterGauge {

  readonly attackId: number;
  readonly action: NativeCityKumaActionKind;
  /** 0..1 from his windup's first frame to the window's opening; 1 inside the window. */
  readonly fill: number;
  /** Inside the window: V now is the counter. */
  readonly open: boolean;
  /** Fight ms to the contact it counters (his first). */
  readonly untilMs: number;
}

/**
 * The string's link now (`kuma.knockdown`, 2026-10-19 user — "연계할 타이밍 + 안내가 필요하다"): he flinches from an EARLIER swing of the
 * string (not an ender's — `stringHits`, `retaliate`), so a V that lands clean before the flinch ends knocks him down. It is open while a V
 * pressed now (`leadMs` — its tap to contact) still lands `knockdown.linkTellMarginMs` before the flinch ends; `fill`: the share of it left
 * (1 → 0). Null otherwise. The tell only — the rule is the hit's (`kumaCombatHit`'s `knocks`).
 */
export function kumaCombatLinkWindow(state: KumaCombatState, leadMs: number, t: KumaTuning): { readonly fill: number } | null {
  if (state.mode !== "hurt" || state.retaliate || !(state.stringHits > 0) || !(state.hurtMs > 0)) return null;
  const closeMs = state.hurtMs - Math.max(0, leadMs) - Math.max(0, t.knockdown.linkTellMarginMs ?? 0);
  if (!(closeMs > 0) || state.modeMs >= closeMs) return null;
  return { fill: Math.max(0, Math.min(1, 1 - state.modeMs / closeMs)) };
}

/**
 * His counter gauge now (`kuma.rhythm.counter`), or null: no counter in his tuning (the fighter-vs-fighter bout's corners), not a swing whose best answer is
 * the counter (`triangle.best` — the gold swings, the grab), no armoured swing with a fixed contact (the dash, the butt slam in the air, a
 * chance), its first contact already thrown, or no timing (`hitsMs` null — his art is not in).
 */
export function kumaCombatCounterGauge(state: KumaCombatState, hitsMs: readonly number[] | null, t: KumaTuning): KumaCounterGauge | null {
  const spec = t.rhythm?.counter;
  if (!spec || !t.armorDuringAttack || state.mode !== "attack" || !state.action || state.chance) return null;
  if (nativeCityKumaBestAnswer(state.action) !== "counter") return null;
  if (kumaCombatRecovering(state) || kumaCombatAirborne(state) || !hitsMs || state.attackHits <= 0 || state.hitsFired > 0) return null;
  // A V pressed before the ring filled spent this swing's counter (`counterSpentId`): no ring, no window.
  if (state.counterSpentId === state.attackId) return null;
  const first = hitsMs[0];
  if (first === undefined) return null;
  // It fills from the windup's first frame and is full `windowMs` before the first contact.
  const openMs = Math.max(0, first - Math.max(0, spec.windowMs)), untilMs = first - state.modeMs;
  const open = state.modeMs >= openMs;
  return { attackId: state.attackId, action: state.action, fill: open ? 1 : Math.max(0, Math.min(1, state.modeMs / Math.max(1, openMs))), open, untilMs };
}
