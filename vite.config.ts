import { defineConfig } from "vite";
export default defineConfig({
  server: { port: 5178, strictPort: true, watch: null },
  build: { rolldownOptions: { input: { twitch: "twitch.html", twitchAuth: "twitch-auth.html", fighter: "fighter.html" } } },
});
