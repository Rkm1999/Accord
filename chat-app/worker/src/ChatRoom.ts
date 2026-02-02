import { DurableObject } from "cloudflare:workers";

export interface Env {
  DB: D1Database;
}

interface UserState {
  username: string;
  joinedAt: number;
}

export class ChatRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const username = url.searchParams.get("username") || "Anonymous";

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server);

    server.serializeAttachment({
      username,
      joinedAt: Date.now(),
    } as UserState);

    this.broadcastUserEvent("user_joined", username);

    await this.sendChatHistory(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async webSocketMessage(ws: WebSocket, message: string) {
    const state = ws.deserializeAttachment() as UserState;
    const { username } = state;

    const data = JSON.parse(message);

    if (data.type === "typing") {
      this.broadcastTypingIndicator(username, data.isTyping);
      return;
    }

    await this.env.DB.prepare(
      "INSERT INTO messages (username, message, timestamp) VALUES (?, ?, ?)"
    )
      .bind(username, data.message, Date.now())
      .run();

    this.broadcastMessage(username, data.message);
  }

  async webSocketClose(ws: WebSocket) {
    const state = ws.deserializeAttachment() as UserState;
    this.broadcastUserEvent("user_left", state.username);
  }

  private broadcastMessage(username: string, message: string) {
    const webSockets = this.ctx.getWebSockets();
    const payload = JSON.stringify({
      type: "chat",
      username,
      message,
      timestamp: Date.now(),
    });

    for (const ws of webSockets) {
      ws.send(payload);
    }
  }

  private broadcastUserEvent(eventType: string, username: string) {
    const webSockets = this.ctx.getWebSockets();
    const userCount = webSockets.length;
    const payload = JSON.stringify({
      type: "presence",
      event: eventType,
      username,
      userCount,
    });

    for (const ws of webSockets) {
      ws.send(payload);
    }
  }

  private broadcastTypingIndicator(username: string, isTyping: boolean) {
    const webSockets = this.ctx.getWebSockets();
    const payload = JSON.stringify({
      type: "typing",
      username,
      isTyping,
    });

    for (const ws of webSockets) {
      ws.send(payload);
    }
  }

  private async sendChatHistory(ws: WebSocket) {
    const { results } = await this.env.DB.prepare(
      "SELECT username, message, timestamp FROM messages ORDER BY timestamp DESC LIMIT 50"
    ).all();

    const history = results.reverse();
    ws.send(JSON.stringify({
      type: "history",
      messages: history,
    }));
  }
}
