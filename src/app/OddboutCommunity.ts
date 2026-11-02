import community from "./oddbout-community.json";

/** One public invite for the site and completed bouts. An unset invite must not create a dead call to action. */
export function oddboutDiscordInviteUrl(value: unknown = community.discordInviteUrl): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash) return null;
    const path = url.hostname === "discord.gg" ? /^\/[A-Za-z0-9-]+\/?$/
      : url.hostname === "discord.com" ? /^\/invite\/[A-Za-z0-9-]+\/?$/ : null;
    return path?.test(url.pathname) ? url.href : null;
  } catch { return null; }
}

/** A public profile address on one of `hosts` whose path matches `path` (HTTPS, no account, port, query or fragment), else null. */
function profileUrl(value: unknown, hosts: readonly string[], path: RegExp): string | null {
  if (typeof value !== "string" || value === "") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash) return null;
    return hosts.includes(url.hostname) && path.test(url.pathname) ? url.href : null;
  } catch { return null; }
}

/** ODDBOUT's Instagram profile (2026-10-25 — the footer's brand icons). */
export function oddboutInstagramUrl(value: unknown = community.instagramUrl): string | null {
  return profileUrl(value, ["www.instagram.com", "instagram.com"], /^\/[A-Za-z0-9._]+\/?$/);
}

/** Public entry to the bot's private character-request flow, not a private ticket address. */
export function oddboutDiscordRequestUrl(value: unknown = community.discordRequestUrl): string | null {
  return profileUrl(value, ["discord.com"], /^\/channels\/\d+\/\d+\/?$/);
}

/** ODDBOUT's YouTube channel (a handle, a channel id or a custom name). Unset: no icon. */
export function oddboutYoutubeUrl(value: unknown = community.youtubeUrl): string | null {
  return profileUrl(value, ["www.youtube.com", "youtube.com"], /^\/(@[A-Za-z0-9._-]+|channel\/[A-Za-z0-9_-]+|c\/[A-Za-z0-9._-]+)\/?$/);
}

export type OddboutSocialKind = "youtube" | "instagram" | "discord";

/**
 * The site's social channels in the footer's order — YouTube, Instagram, Discord (2026-10-25 사용자: "유튜브, 인스타그램, 디스코드는 각각의
 * 브랜드 아이콘을 사용해서 깔끔하게 연결") — each only when its address is set and well formed (an unset one shows no dead icon).
 */
export function oddboutSocialLinks(): readonly { readonly kind: OddboutSocialKind; readonly url: string }[] {
  const links: { kind: OddboutSocialKind; url: string | null }[] = [
    { kind: "youtube", url: oddboutYoutubeUrl() }, { kind: "instagram", url: oddboutInstagramUrl() }, { kind: "discord", url: oddboutDiscordInviteUrl() },
  ];
  return links.flatMap(link => link.url ? [{ kind: link.kind, url: link.url }] : []);
}
