import { defineConfig } from "vite";
import { runtimeMediaPlugin } from "./build/runtimeMedia.ts";
export default defineConfig({
  plugins: [runtimeMediaPlugin()],
  // The standalone engine owns physics. This official build omits Phaser's unused Matter integration.
  resolve: { alias: [{ find: /^phaser$/, replacement: "phaser/dist/phaser-arcade-physics.js" }] },
  server: { port: 5178, strictPort: true },
  build: { rolldownOptions: { input: { twitch: "twitch.html", twitchAuth: "twitch-auth.html", fighter: "fighter.html", broadcast: "broadcast.html", bet: "bet.html" } } },
});
