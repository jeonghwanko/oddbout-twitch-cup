# Media credits and licenses

The source code in this repository is licensed under the [MIT License](LICENSE). The MIT License does not cover the ODDBOUT artwork, voices, names, and logo described below, or the third-party media and fonts, which keep their own licenses.

This standalone Twitch Cup bundles combat and interface sound effects, generated fighter voices, and the fonts loaded by its pages. The source, checksum, cue, and license record for each shipped media file is in [`src/assets/runtime-media.json`](src/assets/runtime-media.json). The bout does not bundle background music.

## ODDBOUT artwork, voices, and names

The images under `public/art/`, the fight voice and announcer clips under `public/audio/voice/`, the ODDBOUT name and logo, and the names and designs of the built-in fighters are copyright jeonghwanko. All rights are reserved, except that you may use these files unmodified to build, run, test, and evaluate this project, including for judging and reviewing it. Any other use, including redistribution outside this project, modification, or commercial use, requires the owner's permission.

Approved creator fighters that the page loads at runtime from the ODDBOUT service are not part of this repository and are not licensed by it.

## Sound effects

The following source audio is licensed under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/):

- **AudioPapkin**, “Riser Hit sfx 010.wav.”
- **BarryTheWhite**, “Smacks And Thwacks (m).wav.”
- **Breviceps**, “Thud / Falling on wooden floor.”
- **Cici Fyre**, “Free Natural UI SFX Pack.”
- **Empiremonkey**, “block3.wav.”
- **Independent.nu** (submitted by qubodup), “37 hits/punches.”
- **Kastenfrosch**, “Whoosh / Dash.”
- **Kenney**, “Impact Sounds 1.0,” “Interface Sounds 1.0,” and “RPG Audio 1.0.”
- **LunaFarrowe**, “Heavy Wall Pounding.”
- **artisticdude**, “RPG Sound Pack” and “Swishes Sound Pack.”
- **cryanrautha**, “CLARKS Punches Hits heavier big boxing.”
- **leonelmail**, “BODY FALL - V HVY - DIRT.”
- **qubodup**, “Punching Bag Sound Effects” and “Swosh Sword Swing.”
- **rubberduck**, “100 CC0 metal and wood SFX.”
- Project-created procedural audio layers, dedicated under CC0 1.0.

Individual source URLs and filenames are recorded in `runtime-media.json`.

## Generated fight voices

The built-in fighters' fight voices and announcer clips were generated with **OpenBMB VoxCPM2** (Apache License 2.0). The license text is included at [`public/audio/voice/APACHE-2.0.txt`](public/audio/voice/APACHE-2.0.txt). Per-clip speaker, cue, prompt, generation date, source, and checksum are recorded in `runtime-media.json`.

## Fonts

- **Pretendard 1.3.9**, © 2021 Kil Hyung-jin / orioncactus; SIL Open Font License 1.1. The license is included at [`public/fonts/Pretendard-LICENSE.txt`](public/fonts/Pretendard-LICENSE.txt).
- **Black Han Sans** subset, © 2015 The Black Han Sans Project Authors; SIL Open Font License 1.1. The license is included at [`public/fonts/BlackHanSans-OFL.txt`](public/fonts/BlackHanSans-OFL.txt).

The manifest records the Pretendard 1.3.9 and Black Han Sans font versions, checksums, source URLs, and modification status.
