# Judging guide: ODDBOUT Twitch Cup

This page is the shortest route to seeing the Twitch Cup work. You don't need a Twitch account, an API key or an `.env` file for options A and B.

| Option | Setup | Time |
| --- | --- | --- |
| [A. Hosted cup](#a-hosted-cup-no-install) | A browser | About 3 minutes |
| [B. Run from source](#b-run-from-source) | Node.js 22, npm, Git | About 5 minutes |
| [C. Automated checks](#c-automated-checks) | Option B plus installed Google Chrome | About 4 minutes |
| [D. Live Twitch chat](#d-optional-live-twitch-chat) (optional) | A Twitch account and a Twitch app Client ID | About 10 minutes |

A full cup is three automatic bouts (two semifinals and a final). Each bout plays out in real time, so a whole cup takes about two and a half minutes. **Keep the tab visible while it plays.** Browsers slow down hidden tabs.

## A. Hosted cup (no install)

1. Open **<https://oddbout.com/twitch.html?lang=en>**.
2. Scroll to **Try it solo**, expand it, and select **Try without Twitch**.
3. Select **Fill all 4 slots**. Four simulated viewers join, each with a different fighter.
4. Select **Start cup**.
5. Watch Semifinal 1, Semifinal 2 and the Final play out. The bracket updates after each bout, and the champion, along with the viewer who entered that fighter, appears at the end.
6. Select **New cup**. The lineup returns to `0 / 4` and the bracket resets.

## B. Run from source

Use **Node.js 22**. The commands are the same in macOS/Linux shells and Windows PowerShell.

```sh
git clone https://github.com/jeonghwanko/oddbout-twitch-cup.git
cd oddbout-twitch-cup
npm ci
npm run dev
```

Then open **<http://localhost:5178/twitch.html?lang=en>** and follow steps 2–6 of option A.

- There is no `index.html`. Open `/twitch.html`, not `/`.
- Port 5178 is fixed. If `npm run dev` says the port is in use, stop the other process first.
- `?lang=en` selects English.
- Without an `.env` file, **Activity** shows "Creator fighters are unavailable · shipped fighters only". This is expected. The nine built-in fighters are enough for the whole cup.

### What to try in the local demo

| Try this | Expected result |
| --- | --- |
| **Choose a fighter** panel | Lists the nine built-in fighters with their `!join` commands |
| Instead of **Fill all 4 slots**, enter a **Viewer name**, pick a **Fighter** and select **Add player** | That viewer takes the next slot, as if they had sent `!join <fighter>` in chat |
| Add the same viewer name or the same fighter twice | Rejected. **Activity** shows "You have already joined" or "That fighter is taken" |
| **Stream view** / **Host view** | Hides or restores the host controls for broadcast capture |
| **New cup** after the champion appears | A fresh lobby with an empty bracket |

If a bout fails to load, a **Retry match** button replays it with the same pairing and seed. The bracket cannot be advanced twice by a repeated or stale result.

## C. Automated checks

Run these from the repository root after `npm ci`.

```sh
npm run check
```

This runs TypeScript checking, the unit test suite (23 files, 178 tests) and the production build. A warning about chunks larger than 500 kB is expected and is not a failure.

To play a real three-bout cup in headless Chrome, keep `npm run dev` running in one terminal and run this in another:

```sh
npm run test:browser -- --seed=123
```

The script fills the lobby, plays all three bouts, checks that the final contains both semifinal winners and that a champion is shown, then presses **New cup** and checks the reset. It prints `"outcome":"complete"` and saves `browser-report/report.json` and a screenshot. It needs Google Chrome installed, because it uses Chrome rather than Playwright's bundled browser.

## D. (Optional) Live Twitch chat

The submitted demo video uses **solo rehearsal**: one broadcaster account enters all four fighters from its own chat.

1. Create an app in the [Twitch developer console](https://dev.twitch.tv/console/apps) and add `http://localhost:5178/twitch-auth.html` as an OAuth redirect URL.
2. Run option B, open **Connection settings**, and paste the app's public **Client ID**.
3. Select **Connect Twitch** and sign in as the broadcaster. The app only requests `chat:read` and never posts to chat.
4. Open **Try it solo** and select **Enable solo rehearsal**.
5. In your channel's chat, send four different commands, one per message, for example `!join kuma`, `!join yume`, `!join bravow` and `!join beotim`.
6. Select **Start cup**.

With four real viewers instead, skip step 4. Each viewer sends one `!join <fighter>` command. Available commands are `kuma`, `yume`, `bravow`, `beotim`, `quickcat`, `kungjjak`, `sikeundung`, `duldul` and `eoridung`.

## Scope of the entry

- **The entry is the Twitch Cup (`twitch.html`)**: Twitch sign-in and chat, `!join` registration, the four-entry lobby, the bracket, the battle host's result validation, and recovery. [DEVELOPMENT-SCOPE.md](docs/submission/DEVELOPMENT-SCOPE.md) lists what was built during the hackathon and which parts (the combat engine, renderer, art and the nine fighter identities) existed before it.
- **Other pages are not part of the entry.** This repository also contains `broadcast.html`, `bet.html` and `spotlight.html`. They are separate work and aren't needed to evaluate the Twitch Cup.
- **Creator fighters are optional.** Without the public ODDBOUT fighter service, the nine built-in fighters are used. The creator tools live in [oddbout-starter](https://github.com/jeonghwanko/oddbout-starter).

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Blank page at `http://localhost:5178/` | Open `/twitch.html?lang=en` |
| `npm run dev` fails with "Port 5178 is in use" | Stop the other process or dev server using port 5178 |
| A bout seems frozen | Bring the tab to the front. Browsers throttle hidden tabs |
| `npm run test:browser` reports a connection error | Start `npm run dev` first and keep it running |
| `npm run test:browser` cannot find Chrome | Install Google Chrome, or skip it and use option A or B to check the cup by hand |
| Twitch sign-in fails | Check the Client ID and that the redirect URL is exactly `http://localhost:5178/twitch-auth.html` |

More detail: [README](README.md) · [Architecture](docs/architecture.md) · [Testing guide (Korean)](docs/testing.md)
