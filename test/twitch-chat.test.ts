import { describe, expect, it, vi } from "vitest";
import { TwitchChatClient, TWITCH_IRC_URL, parseTwitchIrcMessage, type WebSocketConstructor } from "../src/platform/twitchChat";

class FakeSocket {
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  listeners = new Map<string, ((event: any) => void)[]>();
  constructor(readonly url: string) { FakeSocket.instances.push(this); }
  send(data: string): void { this.sent.push(data); }
  close(): void { this.readyState = 3; this.fire("close", {}); }
  addEventListener(type: string, listener: (event: any) => void): void { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]); }
  fire(type: string, event: any): void { for (const listener of this.listeners.get(type) ?? []) listener(event); }
  open(): void { this.readyState = 1; this.fire("open", {}); }
  receive(data: string): void { this.fire("message", { data }); }
}
const Ctor = FakeSocket as unknown as WebSocketConstructor;

describe("Twitch IRC readonly adapter", () => {
  it("parses Twitch tags and IRC trailing message text", () => {
    expect(parseTwitchIrcMessage("@id=abc;display-name=Foo\\sBar;user-id=42 :foo!foo@foo.tmi.twitch.tv PRIVMSG #channel :!join fighter-1"))
      .toEqual({ tags: { id: "abc", "display-name": "Foo Bar", "user-id": "42" }, prefix: "foo!foo@foo.tmi.twitch.tv", command: "PRIVMSG", params: ["#channel", "!join fighter-1"] });
  });

  it("authenticates in memory, distinguishes joining from connected, replies to PING, and only emits target channel messages once", () => {
    FakeSocket.instances = [];
    const statuses: string[] = [];
    const messages: any[] = [];
    const client = new TwitchChatClient({ login: "Streamer", accessToken: "oauth:token-for-test", channel: "MyChannel", WebSocketCtor: Ctor }, {
      onStatus: status => statuses.push(status), onMessage: message => messages.push(message),
    });
    client.connect();
    const socket = FakeSocket.instances[0]!;
    expect(socket.url).toBe(TWITCH_IRC_URL);
    socket.open();
    expect(client.status).toBe("joining");
    expect(socket.sent).toEqual([
      "PASS oauth:token-for-test\r\n", "NICK streamer\r\n", "CAP REQ :twitch.tv/membership twitch.tv/tags twitch.tv/commands\r\n", "JOIN #mychannel\r\n",
    ]);
    socket.receive(":tmi.twitch.tv ROOMSTATE #mychannel\r\nPING :tmi.twitch.tv\r\n");
    expect(client.status).toBe("connected");
    expect(socket.sent.at(-1)).toBe("PONG :tmi.twitch.tv\r\n");

    const line = "@id=message-1;user-id=998;display-name=Display :viewer!viewer@viewer.tmi.twitch.tv PRIVMSG #mychannel :!join alpha";
    socket.receive(`${line}\r\n${line}\r\n@id=wrong-room;user-id=998 :viewer!viewer@viewer.tmi.twitch.tv PRIVMSG #elsewhere :!join beta\r\n`);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ channel: "mychannel", login: "viewer", displayName: "Display", userId: "998", identity: { kind: "twitch-user-id", value: "998" }, messageId: "message-1", text: "!join alpha" });

    socket.receive(":another!another@another.tmi.twitch.tv PRIVMSG #mychannel :!join bravo\r\n");
    expect(messages[1]).toMatchObject({ userId: null, identity: { kind: "twitch-login", value: "another" } });
    client.disconnect();
    expect(client.status).toBe("stopped");
    expect(statuses).toContain("joining");
    expect(statuses).toContain("connected");
  });

  it("honors RECONNECT and caps retry attempts", () => {
    vi.useFakeTimers();
    FakeSocket.instances = [];
    const statuses: string[] = [];
    const errors: string[] = [];
    const client = new TwitchChatClient({ login: "streamer", accessToken: "test", channel: "channel", WebSocketCtor: Ctor, reconnectAttempts: 1, reconnectBaseDelayMs: 100 }, {
      onStatus: status => statuses.push(status), onError: error => errors.push(error),
    });
    client.connect();
    const first = FakeSocket.instances[0]!;
    first.open();
    first.receive(":tmi.twitch.tv RECONNECT\r\n");
    expect(client.status).toBe("reconnecting");
    vi.advanceTimersByTime(100);
    expect(FakeSocket.instances).toHaveLength(2);
    FakeSocket.instances[1]!.open();
    FakeSocket.instances[1]!.fire("close", {});
    vi.advanceTimersByTime(100);
    expect(client.status).toBe("error");
    expect(errors).toHaveLength(1);
    expect(statuses).toContain("reconnecting");
    client.disconnect();
    vi.useRealTimers();
  });

  it("retains IRC data split across WebSocket frames without losing the CRLF boundary", () => {
    FakeSocket.instances = [];
    const messages: any[] = [];
    const client = new TwitchChatClient({ login: "streamer", accessToken: "test", channel: "channel", WebSocketCtor: Ctor }, { onMessage: message => messages.push(message) });
    client.connect();
    const socket = FakeSocket.instances[0]!;
    socket.open();
    const line = "@id=split-message;user-id=17 :viewer!viewer@viewer.tmi.twitch.tv PRIVMSG #channel :!join alpha";
    socket.receive(`${line}\r`);
    expect(messages).toHaveLength(0);
    socket.receive(`\nPING :tmi.twitch.tv\r\n`);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ messageId: "split-message", text: "!join alpha" });
    expect(socket.sent.at(-1)).toBe("PONG :tmi.twitch.tv\r\n");
    client.disconnect();
  });

  it("drops an oversized incomplete frame buffer and continues parsing later lines", () => {
    FakeSocket.instances = [];
    const messages: any[] = [];
    const errors: string[] = [];
    const client = new TwitchChatClient({ login: "streamer", accessToken: "test", channel: "channel", WebSocketCtor: Ctor }, {
      onMessage: message => messages.push(message), onError: error => errors.push(error),
    });
    client.connect();
    const socket = FakeSocket.instances[0]!;
    socket.open();
    socket.receive("x".repeat(33_000));
    expect(errors).toHaveLength(1);
    socket.receive("@id=after-overflow;user-id=18 :viewer!viewer@viewer.tmi.twitch.tv PRIVMSG #channel :!join bravo\r\n");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ messageId: "after-overflow", text: "!join bravo" });
    client.disconnect();
  });

  it("does not reconnect after Twitch rejects authentication", () => {
    vi.useFakeTimers();
    FakeSocket.instances = [];
    const errors: string[] = [];
    const client = new TwitchChatClient({ login: "streamer", accessToken: "test", channel: "channel", WebSocketCtor: Ctor }, { onError: error => errors.push(error) });
    client.connect();
    const socket = FakeSocket.instances[0]!;
    socket.open();
    socket.receive(":tmi.twitch.tv NOTICE * :Login authentication failed\r\n");
    expect(client.status).toBe("error");
    expect(errors).toEqual(["Twitch rejected chat authentication. Check the chat:read token and login."]);
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.instances).toHaveLength(1);
    client.disconnect();
    vi.useRealTimers();
  });
});
