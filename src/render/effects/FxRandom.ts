/*
 * 이펙트의 결정적 난수(2026-10-16, 이펙트 리팩터 4단계). 같은 시드는 같은 폭발·흙·별을 낸다 — 실험실 되감기와 그림 골든 테스트의 전제다.
 * 전에는 mulberry32 세 벌, 문자열 해시·섞기·단위화 세 벌이 이펙트 파일마다 따로 있었다. 게임 규칙의 난수는 `sim/rng.ts` 이고 이 파일과 섞지 않는다.
 * 노드 도구(시트 CLI)도 이 파일을 읽는다.
 */

/** mulberry32: 시드 하나로 0..1 수열을 낸다. */
export function fxRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 문자열의 32비트 해시(FNV-1a). 배치 id 같은 이름에서 시드를 만든다. */
export function fxHashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** 시드와 소금을 섞은 32비트 정수(murmur3 마무리 섞기). 같은 시드에서 소금마다 독립인 값을 꺼낸다. */
export function fxMix(seed: number, salt: number): number {
  let value = (seed ^ Math.imul(salt, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}

/** 32비트 정수 → 0..1. */
export function fxUnit(value: number): number {
  return value / 0x1_0000_0000;
}

/** 정수 하나를 섞어 0..1 로(`fxUnit(fxMix(value, 0))`). */
export function fxHashUnit(value: number): number {
  return fxUnit(fxMix(value, 0));
}
