import { describe, expect, it } from "vitest";
import registry from "../src/assets/runtime-media.json";
import { runtimeMediaClient } from "../build/runtimeMedia";
import { AUDIO_ASSETS, FIGHT_VOICE_SFX, UI_FONTS, LETTERING_FONT } from "../src/assets/RuntimeMediaCatalog";

describe("runtime media projection", () => {
  it("keeps every playable asset identity, voice cue and font while leaving provenance in the source", () => {
    const client = runtimeMediaClient(registry);
    expect(client.audio).toHaveLength(registry.audio.length);
    expect(client.fonts).toHaveLength(registry.fonts.length);
    const audio = new Map(client.audio.map(asset => [asset.key, asset]));
    for (const asset of AUDIO_ASSETS) expect(audio.get(asset.key)).toMatchObject({
      key: asset.key, path: asset.path, sha256: asset.sha256, durationMs: asset.durationMs,
    });
    for (const voice of FIGHT_VOICE_SFX) expect(audio.get(voice.key)?.voice).toEqual({
      speaker: voice.speaker, cue: voice.cue, textKey: voice.textKey,
    });
    for (const font of [...UI_FONTS, LETTERING_FONT]) expect(client.fonts.find(asset => asset.key === font.key)).toEqual(font);
    expect(registry.audio[0]).toHaveProperty("source");
    expect(client.audio[0]).not.toHaveProperty("source");
    expect(client.fonts[0]).not.toHaveProperty("source");
    expect(JSON.stringify(client).length).toBeLessThan(JSON.stringify(registry).length / 2);
  });
});
