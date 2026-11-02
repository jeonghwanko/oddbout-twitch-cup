import { TWITCH_AUTH_MESSAGE } from "./platform/twitchAuth";

const fragment = new URLSearchParams(location.hash.slice(1));
const query = new URLSearchParams(location.search);
// Clear the address before rendering anything or importing the game.
history.replaceState(null, "", location.pathname);
const status = document.querySelector("#auth-status");
if (window.opener && fragment.get("state")) {
  window.opener.postMessage({ type: TWITCH_AUTH_MESSAGE, state: fragment.get("state"), accessToken: fragment.get("access_token") }, location.origin);
  if (status) status.textContent = "Connection received. Return to Twitch Cup.";
} else if (window.opener && query.get("state")) {
  window.opener.postMessage({ type: TWITCH_AUTH_MESSAGE, state: query.get("state"), accessToken: null }, location.origin);
  if (status) status.textContent = "Connection cancelled. You can close this window.";
} else if (status) status.textContent = "Return to Twitch Cup and select Connect Twitch.";
