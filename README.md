# ODDBOUT Twitch Cup

Run a four-fighter tournament from Twitch chat. Viewers type `!join <fighter>`, two semifinals and a final play automatically in the arena, and the winner becomes champion. A hosted version runs at https://oddbout.com/twitch.html.

Requires **Node.js 22** and npm.

```sh
npm ci
cp .env.example .env
npm run dev
```

Open http://localhost:5178/twitch.html?lang=en. The server uses strict port 5178 so the OAuth callback stays consistent.

Create an app in the [Twitch developer console](https://dev.twitch.tv/console/apps). Use `http://localhost:5178/twitch-auth.html` as the OAuth redirect URL. Copy the public Client ID into `VITE_TWITCH_CLIENT_ID` in `.env`, then restart the server, or paste it in the page's Connection settings. The app requests only `chat:read`; no client secret is needed. Connect the broadcaster account; the page reads that account’s own chat channel.

For a **solo rehearsal**, enable rehearsal mode and send `!join <fighter>` four times from one broadcaster account in its own chat. For **live mode**, let four different viewers join. For a **local demo**, select **Try without Twitch**, then **Fill all 4 slots** and **Start cup**; no Twitch connection is needed.

The built-in fighters are `kuma`, `yume`, `bravow`, `beotim`, `quickcat`, `kungjjak`, `sikeundung`, `duldul`, and `eoridung`.

Approved creator fighters load from the public ODDBOUT service at runtime. Join with the fighter's English name normalized to lowercase a–z and 0–9, for example `!join velora`. An empty name or an already-used name falls back to `f` plus the first six hexadecimal characters of the fighter's ID (more characters resolve a further collision). The list is read once when the page opens; reload to refresh it. Packages and art remain runtime data and are not included in this repository. If the service is unavailable, the cup uses only the nine built-in fighters. Remove `VITE_AI_FIGHTER_API_BASE` from `.env` to run without the service.

```sh
npm test
npm run lint:types
npm run build
```

The build produces only `twitch.html`, `twitch-auth.html`, and the embedded `fighter.html` battle host. Serve `dist/` with a static HTTP server for a production build. For a different origin, add that origin's `/twitch-auth.html` URL to the Twitch app's redirect URLs.

This standalone extraction keeps the Twitch URL parameters and iframe messaging protocol. The battle host omits account sign-in, the gold counter, arena selection and weekly tournaments. The source site's build-plugin test was adapted to check the standalone three-page build and strict development port. Site background music and ambience are omitted; combat effects, voices, and UI sounds remain. Shared deterministic combat and rendering utilities remain where the battle engine needs them. Ranked duel creation is disabled; Twitch Cup results remain local exhibitions.

See [NOTICE.md](NOTICE.md) for shipped third-party media and font credits. No project license is granted by this repository; the owner decides the license.
