import timing from './native-city-walk-contacts.json';

const clips: Readonly<Record<string, { readonly frameCount: number; readonly frames: readonly number[] }>> = timing.clips;

/** Normalized authored contact times. An unknown/replaced clip retains its legacy fallback. */
export function nativeCityWalkContacts(key: string, count: number): readonly [number, number] | undefined {
  const entry = clips[key];
  if (!entry || entry.frameCount !== count) return undefined;
  return [entry.frames[0]! / count, entry.frames[1]! / count];
}

/** Shared phase 0 / .5 means contact, .25 / .75 passing, for every authored direction. */
export function nativeCityContactTime(phase: number, contacts?: readonly [number, number]): number {
  if (!contacts) return phase;
  const [a, b] = contacts, half = (b - a + 1) % 1;
  return (a + (phase < .5 ? phase * 2 * half : half + (phase - .5) * 2 * (1 - half))) % 1;
}

/** Count real crossings, including loop wrap. Changing clip/direction never creates a contact. */
export function nativeCityCrossedContact(from: number, advance: number): boolean {
  return advance > 0 && Math.floor((from + advance) * 2 + 1e-9) > Math.floor(from * 2 + 1e-9);
}
