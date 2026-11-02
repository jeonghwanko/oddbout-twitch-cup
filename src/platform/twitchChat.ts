export const TWITCH_IRC_URL = "wss://irc-ws.chat.twitch.tv:443";
const MAX_PENDING_IRC_CHARS = 32_768;
const MAX_IRC_LINE_CHARS = 16_384;

export type TwitchChatStatus = "idle" | "connecting" | "joining" | "connected" | "reconnecting" | "stopped" | "error";
export type TwitchChatIdentity = { kind: "twitch-user-id" | "twitch-login"; value: string };
export type TwitchChatMessage = {
  channel: string;
  login: string;
  displayName: string;
  userId: string | null;
  identity: TwitchChatIdentity;
  messageId: string | null;
  text: string;
};

export type ParsedIrcMessage = { tags: Record<string, string>; prefix: string; command: string; params: string[] };
type WebSocketLike = {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: string, listener: (event: any) => void): void;
};
export type WebSocketConstructor = new (url: string) => WebSocketLike;

export type TwitchChatClientOptions = {
  login: string;
  accessToken: string;
  channel: string;
  WebSocketCtor?: WebSocketConstructor;
  reconnectAttempts?: number;
  reconnectBaseDelayMs?: number;
};

export type TwitchChatCallbacks = {
  onStatus?: (status: TwitchChatStatus) => void;
  onMessage?: (message: TwitchChatMessage) => void;
  onError?: (message: string) => void;
};

const decodeTagValue = (value: string): string => value.replace(/\\s/g, " ").replace(/\\:/g, ";").replace(/\\r/g, "\r").replace(/\\n/g, "\n").replace(/\\\\/g, "\\");

export function parseTwitchIrcMessage(line: string): ParsedIrcMessage | null {
  let rest = line.replace(/[\r\n]+$/, "");
  if (!rest) return null;
  const tags: Record<string, string> = {};
  if (rest.startsWith("@")) {
    const end = rest.indexOf(" ");
    if (end < 0) return null;
    for (const pair of rest.slice(1, end).split(";")) {
      const equals = pair.indexOf("=");
      tags[equals < 0 ? pair : pair.slice(0, equals)] = decodeTagValue(equals < 0 ? "" : pair.slice(equals + 1));
    }
    rest = rest.slice(end + 1);
  }
  let prefix = "";
  if (rest.startsWith(":")) {
    const end = rest.indexOf(" ");
    if (end < 0) return null;
    prefix = rest.slice(1, end);
    rest = rest.slice(end + 1);
  }
  const trailingAt = rest.indexOf(" :");
  const head = trailingAt < 0 ? rest : rest.slice(0, trailingAt);
  const params = head.split(" ").filter(Boolean);
  const command = params.shift()?.toUpperCase();
  if (!command) return null;
  if (trailingAt >= 0) params.push(rest.slice(trailingAt + 2));
  return { tags, prefix, command, params };
}

function normalizeLogin(value: string): string {
  return value.trim().replace(/^#/, "").toLowerCase();
}

function prefixLogin(prefix: string): string {
  const bang = prefix.indexOf("!");
  return (bang < 0 ? prefix : prefix.slice(0, bang)).toLowerCase();
}

function getWebSocketCtor(): WebSocketConstructor | undefined {
  return typeof WebSocket === "undefined" ? undefined : WebSocket as unknown as WebSocketConstructor;
}

export class TwitchChatClient {
  private socket: WebSocketLike | null = null;
  private currentStatus: TwitchChatStatus = "idle";
  private stopped = true;
  private reconnectCount = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingData = "";
  private readonly seen = new Set<string>();
  private readonly login: string;
  private readonly channel: string;
  private readonly accessToken: string;
  private readonly WebSocketCtor?: WebSocketConstructor;
  private readonly maxReconnectAttempts: number;
  private readonly reconnectBaseDelayMs: number;

  constructor(options: TwitchChatClientOptions, private readonly callbacks: TwitchChatCallbacks = {}) {
    this.login = normalizeLogin(options.login);
    this.channel = normalizeLogin(options.channel);
    this.accessToken = options.accessToken.trim().replace(/^oauth:/i, "");
    this.WebSocketCtor = options.WebSocketCtor ?? getWebSocketCtor();
    this.maxReconnectAttempts = Math.max(0, Math.floor(options.reconnectAttempts ?? 5));
    this.reconnectBaseDelayMs = Math.max(100, options.reconnectBaseDelayMs ?? 500);
  }

  get status(): TwitchChatStatus { return this.currentStatus; }

  connect(): void {
    if (this.currentStatus === "connecting" || this.currentStatus === "joining" || this.currentStatus === "connected") return;
    this.stopped = false;
    this.reconnectCount = 0;
    this.openSocket(false);
  }

  disconnect(): void {
    this.stopped = true;
    this.pendingData = "";
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState < 2) socket.close(1000, "Client stopped");
    this.setStatus("stopped");
  }

  private setStatus(status: TwitchChatStatus): void {
    if (this.currentStatus === status) return;
    this.currentStatus = status;
    this.callbacks.onStatus?.(status);
  }

  private openSocket(reconnecting: boolean): void {
    if (this.stopped) return;
    if (!/^[a-z0-9_]{1,25}$/.test(this.login) || !/^[a-z0-9_]{1,25}$/.test(this.channel)
      || !this.accessToken || /[\r\n\s]/.test(this.accessToken) || !this.WebSocketCtor) {
      this.callbacks.onError?.("Twitch chat needs a login, chat:read access token, channel, and WebSocket support.");
      this.setStatus("error");
      return;
    }
    this.setStatus(reconnecting ? "reconnecting" : "connecting");
    let socket: WebSocketLike;
    try {
      socket = new this.WebSocketCtor(TWITCH_IRC_URL);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    socket.addEventListener("open", () => {
      if (this.socket !== socket || this.stopped) return;
      this.setStatus("joining");
      socket.send(`PASS oauth:${this.accessToken}\r\n`);
      socket.send(`NICK ${this.login}\r\n`);
      socket.send("CAP REQ :twitch.tv/membership twitch.tv/tags twitch.tv/commands\r\n");
      socket.send(`JOIN #${this.channel}\r\n`);
    });
    socket.addEventListener("message", event => {
      if (this.socket !== socket || this.stopped) return;
      this.handleData(typeof event.data === "string" ? event.data : "");
    });
    socket.addEventListener("error", () => {
      if (this.socket === socket && !this.stopped) this.callbacks.onError?.("Twitch chat WebSocket error.");
    });
    socket.addEventListener("close", () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.pendingData = "";
      this.scheduleReconnect();
    });
  }

  private handleData(data: string): void {
    const combined = this.pendingData + data;
    let cursor = 0;
    let boundary = combined.indexOf("\r\n", cursor);
    while (boundary >= 0) {
      const line = combined.slice(cursor, boundary);
      cursor = boundary + 2;
      if (line.length > MAX_IRC_LINE_CHARS) this.callbacks.onError?.("Twitch chat sent an oversized IRC message; that line was discarded.");
      else if (line) this.handleLine(line);
      if (this.stopped) break;
      boundary = combined.indexOf("\r\n", cursor);
    }
    this.pendingData = this.stopped ? "" : combined.slice(cursor);
    if (this.pendingData.length > MAX_PENDING_IRC_CHARS) {
      this.pendingData = "";
      this.callbacks.onError?.("Twitch chat sent an oversized incomplete IRC message; it was discarded.");
    }
  }

  private handleLine(line: string): void {
    const message = parseTwitchIrcMessage(line);
    if (!message) return;
    if (message.command === "PING") {
      const pingPayload = message.params[0] ?? "tmi.twitch.tv";
      this.socket?.send(`PONG :${pingPayload}\r\n`);
      return;
    }
    if (message.command === "RECONNECT") {
      const socket = this.socket;
      this.socket = null;
      this.pendingData = "";
      if (socket && socket.readyState < 2) socket.close(1012, "Twitch requested reconnect");
      this.scheduleReconnect();
      return;
    }
    if (message.command === "NOTICE" && /authentication failed|improperly formatted auth/i.test(message.params.at(-1) ?? "")) {
      this.stopped = true;
      if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      this.pendingData = "";
      this.callbacks.onError?.("Twitch rejected chat authentication. Check the chat:read token and login.");
      this.setStatus("error");
      this.socket?.close(1008, "Authentication failed");
      return;
    }
    if (message.command === "PRIVMSG") this.emitPrivmsg(message);
    if (message.command === "JOIN" && normalizeLogin(message.params[0] ?? "") === this.channel && prefixLogin(message.prefix) === this.login) {
      this.reconnectCount = 0;
      this.setStatus("connected");
    }
    if (message.command === "ROOMSTATE" && normalizeLogin(message.params[0] ?? "") === this.channel) {
      this.reconnectCount = 0;
      this.setStatus("connected");
    }
  }

  private emitPrivmsg(message: ParsedIrcMessage): void {
    const target = normalizeLogin(message.params[0] ?? "");
    const login = prefixLogin(message.prefix);
    const text = message.params[1] ?? "";
    if (!target || target !== this.channel || !login || !text) return;
    const userId = message.tags["user-id"]?.trim() || null;
    const messageId = message.tags.id?.trim() || null;
    const sentAt = message.tags["tmi-sent-ts"]?.trim();
    const dedupKey = messageId ? `id:${messageId}` : sentAt ? `fallback:${target}:${login}:${sentAt}:${text}` : null;
    if (dedupKey) {
      if (this.seen.has(dedupKey)) return;
      this.seen.add(dedupKey);
      if (this.seen.size > 1000) this.seen.delete(this.seen.values().next().value as string);
    }
    this.callbacks.onMessage?.({
      channel: target,
      login,
      displayName: message.tags["display-name"]?.trim() || login,
      userId,
      identity: userId ? { kind: "twitch-user-id", value: userId } : { kind: "twitch-login", value: login },
      messageId,
      text,
    });
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    if (this.reconnectCount >= this.maxReconnectAttempts) {
      this.setStatus("error");
      this.callbacks.onError?.("Twitch chat disconnected after the reconnect limit was reached.");
      return;
    }
    const delay = this.reconnectBaseDelayMs * 2 ** this.reconnectCount;
    this.reconnectCount++;
    this.setStatus("reconnecting");
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket(true);
    }, delay);
  }
}
