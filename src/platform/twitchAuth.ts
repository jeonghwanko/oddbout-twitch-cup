/** Twitch browser OAuth. Credentials live only in memory, never in browser storage. */
export interface TwitchSession { accessToken: string; login: string; userId: string; clientId: string; expiresIn: number }
export const TWITCH_AUTH_MESSAGE = "oddbout:twitch:oauth";

export function twitchAuthorizeUrl(clientId: string, redirectUri: string, state: string): string {
  if (!/^[a-z0-9]{10,100}$/i.test(clientId)) throw new Error("Enter your Twitch app Client ID.");
  const url = new URL("https://id.twitch.tv/oauth2/authorize");
  url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "token", scope: "chat:read", state }).toString();
  return url.href;
}

export async function validateTwitchSession(accessToken: string, clientId: string, fetcher: typeof fetch = fetch): Promise<TwitchSession> {
  const response = await fetcher("https://id.twitch.tv/oauth2/validate", {
    headers: { Authorization: `OAuth ${accessToken}` }, signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("Your Twitch session expired. Reconnect to continue.");
  const data: unknown = await response.json();
  if (!data || typeof data !== "object") throw new Error("Could not verify the Twitch response.");
  const value = data as Record<string, unknown>;
  if (value.client_id !== clientId || typeof value.login !== "string" || !/^[a-z0-9_]{1,25}$/.test(value.login)
    || typeof value.user_id !== "string" || !/^\d+$/.test(value.user_id)
    || !Array.isArray(value.scopes) || !value.scopes.includes("chat:read")
    || typeof value.expires_in !== "number" || value.expires_in <= 0) {
    throw new Error("Authorize chat read access for this app to continue.");
  }
  return { accessToken, clientId, login: value.login, userId: value.user_id, expiresIn: value.expires_in };
}

/** Popup state and source are both checked before accepting a credential. */
export function connectTwitch(clientId: string): Promise<TwitchSession> {
  const state = crypto.randomUUID();
  const redirectUri = new URL("twitch-auth.html", location.href).href;
  const url = twitchAuthorizeUrl(clientId, redirectUri, state);
  const popup = window.open(url, "oddbout-twitch-auth", "popup,width=520,height=760");
  if (!popup) return Promise.reject(new Error("Allow pop-ups, then connect again."));
  return new Promise((resolve, reject) => {
    let processing = false;
    const cleanup = (): void => { window.removeEventListener("message", receive); clearInterval(closed); clearTimeout(timeout); };
    const fail = (message: string): void => { cleanup(); reject(new Error(message)); };
    const receive = (event: MessageEvent): void => {
      if (processing || event.origin !== location.origin || event.source !== popup) return;
      const data = event.data as Record<string, unknown> | null;
      if (!data || data.type !== TWITCH_AUTH_MESSAGE || data.state !== state) return;
      if (typeof data.accessToken !== "string" || !/^[a-z0-9]+$/i.test(data.accessToken)) { fail("Twitch connection cancelled."); return; }
      processing = true;
      cleanup();
      popup.close();
      void validateTwitchSession(data.accessToken, clientId).then(resolve, reject);
    };
    window.addEventListener("message", receive);
    const closed = setInterval(() => { if (popup.closed && !processing) fail("The Twitch connection window was closed."); }, 500);
    const timeout = setTimeout(() => { popup.close(); fail("Twitch connection timed out. Try again."); }, 300_000);
  });
}
