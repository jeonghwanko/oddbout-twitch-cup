import { describe, expect, it } from "vitest";
import { resolveConfig } from "vite";
describe("standalone cup build", () => {
  it("builds exactly the cup, OAuth callback and battle host", async () => {
    const config = await resolveConfig({}, "build");
    expect(config.build.rolldownOptions.input).toEqual({ twitch: "twitch.html", twitchAuth: "twitch-auth.html", fighter: "fighter.html" });
    expect(config.server.port).toBe(5178);
    expect(config.server.strictPort).toBe(true);
  });
});
