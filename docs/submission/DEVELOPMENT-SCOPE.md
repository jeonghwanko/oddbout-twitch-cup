# ODDBOUT Twitch Cup

## Tagline

Your characters. Your community. One Twitch Cup.

## Elevator pitch

A live four-fighter tournament powered by Twitch chat. Viewers join with !join, enter built-in or approved creator fighters, and watch the bracket play out to a champion.

## Inspiration

I wanted a character created with an agent to have somewhere to compete in front of a live audience. ODDBOUT already provided automatic battles; this project adds a way for a Twitch community to enter fighters, follow a bracket, and share the result.

During the hackathon, I built the new Twitch experience and substantially expanded oddbout-starter, the open-source creator kit that supports the journey from character creation to registration and participation on stream.

## What it does

The streamer connects their Twitch channel, and viewers choose a fighter with `!join <fighter>`. The first four eligible entries fill the bracket, with a different viewer and fighter in each slot. Once the host starts the cup, two semifinals and a final run automatically. The screen follows the bracket through to the champion and the viewer who entered that fighter.

Viewers can choose from nine bundled fighters or approved creator fighters available through the connected ODDBOUT service. The creator tools handle generation and registration; the Cup loads approved fighters for competition. This connects characters made with an agent to a shared live event.

Stream view hides the host controls for broadcast capture. Solo rehearsal lets the verified broadcaster enter four different fighters, while a local demo runs without a Twitch account. A failed match can be retried with the same pairing and seed.

## What I built during the hackathon

### The Twitch experience

The Twitch-specific application was developed during the submission period:

- Twitch authentication and a read-only chat connection.
- Chat-command registration, viewer and fighter uniqueness, and the four-entry lobby.
- Tournament rules, automatic semifinal and final progression, and champion display.
- Stream and host views, solo rehearsal, and a local demo.
- An embedded battle host that validates message origin, iframe, attempt ID, fighter pairing, and seed before accepting results.
- Loading recovery, retry handling, and protection against delayed or duplicate results.
- Approved creator-fighter integration and a standalone client with setup instructions and regression tests.

### The creator tools: oddbout-starter

A substantial part of the same period's work expanded the creation side of the experience:

- **Cloud access and registration:** hosted MCP connectivity, Google-authorized account access, fighter registration, and cloud plugin integration.
- **Agent creation workflows:** tools for hosted creation requests and reviews, fighter entry, and profile and fighting-style editing.
- **Hosted generation and motion automation:** generation workers, appearance selection, automated motion production, host setup, cancellation, and recovery. The hosted pipeline was developed in the game repository on October 27–28 and transferred into starter's host tooling on October 28.
- **Dots support:** workspace setup, version-pinned installation and resume, diagnostics, and private reference-image transfer.
- **Packaging:** asset-preserving package assembly, recovery, and byte/pixel fitting while preserving the fighter's in-game size, alongside further sprite-gen-agent integration.

These additions extend the earlier local creator kit into connected and hosted workflows. The creator tools have their own public repository and development history. The Twitch client remains independently runnable with its bundled fighters.

## Existing components and engine changes

ODDBOUT's combat engine, seeded simulation, shared Phaser renderer, fighter-package format, registration foundation, and much of its art, sound, and font library predate the hackathon. The nine bundled character identities also existed beforehand.

An earlier version of oddbout-starter already supported local generation, review, packaging, registration, a local MCP server, and a creator plugin. The project also builds on the third-party sprite-gen engine and earlier sprite-gen-agent work.

During the submission period, I also changed the reused engine: AI reaction and grab timing; cross-through, rope-pinball, and rush exchanges; registered-fighter temperament and signature skills; shared skill and projectile behavior; and state/allocation handling. Shared rendering changes covered camera framing, reactions, effects, localization, and asset loading. Some character artwork and presentation assets were revised or added.

Twitch integration added a broadcast duel mode and result callbacks. Further client work separated arena dependencies, reduced unnecessary asset loading, overlapped startup tasks, and improved the broadcast presentation clock. These are modifications to the existing game foundation, disclosed separately from the new Twitch application and creator-tool development.

## How I used Codex

I used Codex to implement and review Twitch authentication, chat integration, tournament rules, page flow, and the battle-host protocol, and to extract the runnable standalone client. Codex also supported the creator-kit workflows and tools in oddbout-starter.

The test suite covers duplicate entries, stale match results, authentication and message validation, recovery, and the broadcast frame clock. This helped make the interaction between chat, the bracket, and the battle engine explicit and testable.

## Challenges and what I learned

A live tournament must stay consistent through delayed messages, reconnects, and failed loads. I separated tournament rules from browser and network behavior, and required each battle result to match the active attempt before advancing the bracket.

The other challenge was connecting creation to play across separate systems. Keeping generation and registration in the creator tools, and approved-fighter loading in the Cup, gave each component a clear role while making the resulting characters available to a Twitch audience.

## Demo and source

The Twitch demonstration uses solo rehearsal with one broadcaster account.

- [Play Twitch Cup](https://oddbout.com/twitch.html)
- [Watch the demo](https://youtu.be/Nu2VzDw-ilY)
- [Twitch Cup source](https://github.com/jeonghwanko/oddbout-twitch-cup)
- [oddbout-starter source](https://github.com/jeonghwanko/oddbout-starter)

**Built with:** OpenAI Codex, TypeScript, Vite, Phaser 3, Vitest, Twitch OAuth and chat. Supporting creator tools use Node.js, Python, MCP, Grok, sprite-gen/sprite-gen-agent, and Supabase.

oddbout-starter is MIT-licensed. Third-party software retains its own licenses, including sprite-gen's Apache-2.0 license. Media and font credits are documented in the Twitch client's [NOTICE.md](https://github.com/jeonghwanko/oddbout-twitch-cup/blob/main/NOTICE.md).
