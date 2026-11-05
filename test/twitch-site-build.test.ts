import { describe, expect, it } from "vitest";
import { resolveConfig } from "vite";
describe("standalone cup build", () => {
  it("builds the cup, OAuth callback, battle host, agent exhibition and bet booth", async () => {
    const config = await resolveConfig({}, "build");
    expect(config.build.rolldownOptions.input).toEqual({ twitch: "twitch.html", twitchAuth: "twitch-auth.html", fighter: "fighter.html", broadcast: "broadcast.html", bet: "bet.html" });
    expect(config.server.port).toBe(5178);
    expect(config.server.strictPort).toBe(true);
  });
});
