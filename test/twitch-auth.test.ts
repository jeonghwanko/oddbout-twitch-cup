import { describe, expect, it, vi } from "vitest";
import { twitchAuthorizeUrl, validateTwitchSession } from "../src/platform/twitchAuth";

describe("Twitch 인증 경계", () => {
  it("읽기 권한만 요청하고 리디렉션과 CSRF state를 보존한다", () => {
    const url = new URL(twitchAuthorizeUrl("exampleclientid123", "http://localhost:5178/twitch-auth.html", "test-state"));
    expect(url.origin).toBe("https://id.twitch.tv");
    expect(Object.fromEntries(url.searchParams)).toEqual({ client_id: "exampleclientid123", redirect_uri: "http://localhost:5178/twitch-auth.html", response_type: "token", scope: "chat:read", state: "test-state" });
    expect(() => twitchAuthorizeUrl("", "http://localhost/", "x")).toThrow();
  });

  it("검증된 계정으로만 채팅 연결 정보를 만든다", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ client_id: "exampleclientid123", login: "streamer", user_id: "123", scopes: ["chat:read"], expires_in: 3600 })));
    const session = await validateTwitchSession("testtoken", "exampleclientid123", fetcher);
    expect(session.login).toBe("streamer");
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual({ Authorization: "OAuth testtoken" });
  });

  it.each([
    { client_id: "otherclient", scopes: ["chat:read"], expires_in: 3600 },
    { client_id: "exampleclientid123", scopes: [], expires_in: 3600 },
    { client_id: "exampleclientid123", scopes: ["chat:read"], expires_in: 0 },
  ])("다른 앱·권한 누락·만료 토큰을 거부한다", async invalid => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ login: "streamer", user_id: "123", ...invalid })));
    await expect(validateTwitchSession("testtoken", "exampleclientid123", fetcher)).rejects.toThrow();
  });
});
