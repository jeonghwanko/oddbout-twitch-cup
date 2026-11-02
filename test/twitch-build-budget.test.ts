import { describe, expect, it } from "vitest";
import { build } from "vite";

describe("first-bout production dependencies", () => {
  it("keeps the engine and arena within their byte budgets without village compression data", async () => {
    const result = await build({ logLevel: "silent", build: { write: false, copyPublicDir: false } });
    const chunks = (Array.isArray(result) ? result : [result]).flatMap(item => {
      if (!("output" in item)) throw new Error("Expected a one-shot build");
      return item.output;
    }).filter(item => item.type === "chunk");
    const includes = (suffix: string) => chunks.find(chunk => chunk.moduleIds.some(id => id.replaceAll("\\", "/").endsWith(suffix)));
    const engine = includes("/node_modules/phaser/dist/phaser-arcade-physics.js");
    const arena = includes("/src/render/scenes/ArenaDuelScene.ts");
    expect(engine).toBeDefined();
    expect(arena).toBeDefined();
    expect(Buffer.byteLength(engine!.code)).toBeLessThan(1_300_000);
    expect(Buffer.byteLength(arena!.code)).toBeLessThan(950_000);
    expect(includes("/src/assets/native-city-ktx2.json")).toBeUndefined();
    expect(includes("/node_modules/phaser/dist/phaser.js")).toBeUndefined();
  }, 20_000);
});
