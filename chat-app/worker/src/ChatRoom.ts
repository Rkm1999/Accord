import { DurableObject } from "cloudflare:workers";

export interface Env {
  DB: D1Database;
}

interface UserState {
  username: string;
  joinedAt: number;
}

interface LinkMetadata {
  url: string;
  title: string;
  description: string;
  image: string;
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

    const linkMetadata = await this.fetchLinkMetadata(data.message);
    const timestamp = Date.now();

    let query = "INSERT INTO messages (username, message, timestamp";
    let values = [username, data.message, timestamp];
    let placeholders = "?, ?, ?";

    if (linkMetadata) {
      query += ", link_url, link_title, link_description, link_image";
      values.push(linkMetadata.url, linkMetadata.title, linkMetadata.description, linkMetadata.image);
      placeholders += ", ?, ?, ?, ?";
    }

    query += `) VALUES (${placeholders})`;

    await this.env.DB.prepare(query).bind(...values).run();

    this.broadcastMessage(username, data.message, linkMetadata);
  }

  async webSocketClose(ws: WebSocket) {
    const state = ws.deserializeAttachment() as UserState;
    this.broadcastUserEvent("user_left", state.username);
  }

  private broadcastMessage(username: string, message: string, linkMetadata?: LinkMetadata) {
    const webSockets = this.ctx.getWebSockets();
    const payload = JSON.stringify({
      type: "chat",
      username,
      message,
      timestamp: Date.now(),
      linkMetadata,
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
      "SELECT username, message, timestamp, link_url, link_title, link_description, link_image FROM messages ORDER BY timestamp DESC LIMIT 50"
    ).all();

    const history = results.reverse();
    ws.send(JSON.stringify({
      type: "history",
      messages: history,
    }));
  }

  private async fetchLinkMetadata(message: string): Promise<LinkMetadata | null> {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const matches = message.match(urlRegex);

    if (!matches) return null;

    const url = matches[0];

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        },
      });

      if (!response.ok) return null;

      const html = await response.text();

      let title = '';
      let description = '';
      let image = '';

      const urlObj = new URL(url);

      if (urlObj.hostname.includes('youtube.com') || urlObj.hostname.includes('youtu.be')) {
        const videoId = this.extractYouTubeVideoId(url);

        if (videoId) {
          image = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

          const ytTitleMatch = html.match(/"title":"([^"]+)"/i) ||
                              html.match(/<meta itemprop="name" content="([^"]+)"/i);
          if (ytTitleMatch) {
            title = ytTitleMatch[1].replace(/\\u0026/g, '&').replace(/\\u003c/g, '<').replace(/\\u003e/g, '>');
          }

          const ytDescMatch = html.match(/"shortDescription":"([^"]+)"/i);
          if (ytDescMatch) {
            description = ytDescMatch[1].replace(/\\n/g, ' ').replace(/\\u0026/g, '&');
          }
        }
      }

      if (!image) {
        const imageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
                          html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
        image = imageMatch ? imageMatch[1] : '';
      }

      if (!title) {
        const titleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
                          html.match(/<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i);
        title = titleMatch ? titleMatch[1] : '';
      }

      if (!title) {
        const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        title = titleMatch ? titleMatch[1].trim() : url;
      }

      if (!description) {
        const descMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
                        html.match(/<meta[^>]+name=["']twitter:description["'][^>]+content=["']([^"']+)["']/i) ||
                        html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
        description = descMatch ? (descMatch[1] || descMatch[2] || descMatch[3]) : '';
      }

      if (title || description || image) {
        return {
          url,
          title,
          description,
          image,
        };
      }

      return null;
    } catch (error) {
      console.error('Error fetching link metadata:', error);
      return null;
    }
  }

  private extractYouTubeVideoId(url: string): string | null {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([^&\n?#]+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return null;
  }
}
