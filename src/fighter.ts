import { readRuntimeOptions } from "./app/RuntimeOptions";
import { twitchArenaBoutRequest } from "./app/TwitchArenaBout";
import { readLocalePreference } from "./platform/localePreference";
import { bootTwitchArenaBout } from "./render/boot/TwitchArenaBoot";
const options = { ...readRuntimeOptions(), locale: readLocalePreference() };
const request = twitchArenaBoutRequest(options);
if (request) await bootTwitchArenaBout(request, options);
else document.getElementById("boot-loading")!.textContent = "Open this battle host through the Twitch Cup.";
