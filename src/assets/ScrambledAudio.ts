/**
 * 받은 그대로는 음원 파일이 아닌 배포 포장(2026-10-17). OpenTracks(옛 DOVA-SYNDROME) 라이선스는 "변환 없이 엔드유저가 음원 파일에
 * 음성 파일로 쉽게 접근·복제할 수 있는 상태"의 이용을 금지한다. 웹 게임은 파일을 그대로 내보내므로 그 곡은 이 포장으로만 싣는다.
 *
 * 형식: 머리표 `WLA1` 4바이트 + OGG Vorbis 바이트를 32바이트 열쇠로 순환 XOR 한 것. 암호가 아니라 포장이다(열쇠는 번들에 있다).
 * 같은 열쇠를 쓰는 곳은 셋이다: 굽기 `tools/audio/build-opentracks-bgm.py`, 풀기 `AudioEngine`, 검사 `asset-manifest.test.ts`
 * (풀어서 `OggS` 가 나오는지 본다 — 굽기와 풀기의 열쇠가 어긋나면 거기서 깨진다).
 */

/** 포장한 음원의 확장자. 등록부 경로가 이것으로 끝나면 풀어서 디코드한다. */
export const SCRAMBLED_AUDIO_EXTENSION = ".bin";

const MAGIC = Uint8Array.from([0x57, 0x4c, 0x41, 0x31]); // "WLA1"
const KEY = Uint8Array.from([
  0x9c, 0xed, 0x45, 0x30, 0xdb, 0x03, 0xbf, 0x0b, 0x41, 0x6d, 0x96, 0x9e, 0x76, 0x3f, 0x64, 0x3e,
  0x06, 0xdd, 0x86, 0xee, 0xa7, 0x88, 0xdb, 0x84, 0x42, 0xb4, 0x06, 0x6d, 0x5a, 0x7e, 0x9b, 0x9d,
]);

export function isScrambledAudioPath(path: string): boolean {
  return path.endsWith(SCRAMBLED_AUDIO_EXTENSION);
}

/** 포장을 벗긴 OGG 바이트. 머리표가 없으면 던진다(잘못 받은 파일을 디코더에 넘기지 않는다). */
export function unscrambleAudio(bytes: ArrayBuffer): ArrayBuffer {
  const input = new Uint8Array(bytes);
  if (input.length < MAGIC.length || MAGIC.some((value, index) => input[index] !== value)) {
    throw new Error("포장 머리표(WLA1)가 없는 음원");
  }
  const output = new Uint8Array(input.length - MAGIC.length);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = input[index + MAGIC.length]! ^ KEY[index % KEY.length]!;
  }
  return output.buffer;
}
