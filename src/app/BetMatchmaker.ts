/** An unordered pairing's key: `kuma|yume` and `yume|kuma` are one matchup. */
export function matchupKey(a: string, b: string): string { return a < b ? `${a}|${b}` : `${b}|${a}`; }

/**
 * The next red and blue corners from the roster: two different fighters chosen uniformly, avoiding a pairing in `recent` (the latest
 * matchups' keys) while another one remains. `random` returns [0, 1).
 */
export function pickBetMatchup(ids: readonly string[], recent: readonly string[], random: () => number): readonly [string, string] {
  const pool = [...new Set(ids)];
  if (pool.length < 2) throw new Error("The bet booth needs at least two fighters.");
  const pick = (count: number): number => Math.min(count - 1, Math.floor(random() * count));
  const avoid = new Set(recent);
  const fresh: [string, string][] = [];
  for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) if (!avoid.has(matchupKey(pool[i]!, pool[j]!))) fresh.push([pool[i]!, pool[j]!]);
  if (fresh.length) {
    const pair = fresh[pick(fresh.length)]!;
    return pick(2) === 0 ? pair : [pair[1], pair[0]];
  }
  const red = pool[pick(pool.length)]!, others = pool.filter(id => id !== red);
  return [red, others[pick(others.length)]!];
}
