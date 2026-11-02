/**
 * A response body read whole, never past `limit` bytes (2026-10-25: the fighter roster, the ranked duels and the fighter statistics each
 * wrote this read). `missing` is thrown for a response without a body, `tooLong` past the limit — the read is cancelled first. Each caller
 * keeps its own error codes and its own check of the status.
 */
export async function readBoundedBody(response: Response, limit: number, codes: { readonly missing: string; readonly tooLong: string })
  : Promise<Uint8Array<ArrayBuffer>> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error(codes.missing);
  const parts: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error(codes.tooLong); }
      parts.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return bytes;
}

/** Strict UTF-8 JSON (a broken byte throws rather than turning into U+FFFD). */
export function parseUtf8Json(bytes: Uint8Array): unknown {
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}
