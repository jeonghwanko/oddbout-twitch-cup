/**
 * 두 색(0xRRGGBB)을 채널마다 `t`(0..1, 밖은 잘린다)만큼 섞는다 — 한 색 계열 안의 경사. 대결 효과·타격감·쿠마 테두리가 같은 식을 각자
 * 적고 있었다(2026-10-13 하나로).
 */
export function mixColor(a: number, b: number, t: number): number {
  const k = Math.max(0, Math.min(1, t));
  const channel = (shift: number) => Math.round(((a >> shift) & 255) * (1 - k) + ((b >> shift) & 255) * k) << shift;
  return channel(16) | channel(8) | channel(0);
}
