import type { Plugin } from "vite";
import type { RuntimeMediaClient } from "../src/assets/RuntimeMediaCatalog.ts";

/** Preserve runtime identity/voice/font fields; provenance stays in the source registry and NOTICE. */
export function runtimeMediaClient(source: RuntimeMediaClient): RuntimeMediaClient {
  return {
    audio: source.audio.map(({ key, path, sha256, durationMs, voice }) => ({ key, path, sha256, durationMs,
      ...(voice ? { voice: { speaker: voice.speaker, cue: voice.cue, textKey: voice.textKey } } : {}),
    })),
    fonts: source.fonts.map(({ key, path, sha256, family, weight, role }) => ({ key, path, sha256, family, weight, role })),
  };
}

export function runtimeMediaPlugin(): Plugin {
  return {
    name: "runtime-media-client",
    enforce: "pre",
    transform(code, id) {
      if (!id.replaceAll("\\", "/").endsWith("/src/assets/runtime-media.json")) return;
      return { code: JSON.stringify(runtimeMediaClient(JSON.parse(code))), map: null };
    },
  };
}
