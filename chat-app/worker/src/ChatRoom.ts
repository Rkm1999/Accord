import { DurableObject } from "cloudflare:workers";

export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
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

interface FileAttachment {
  name: string;
  type: string;
  size: number;
  key: string;
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

    if (data.type === "edit") {
      await this.editMessage(data.messageId, data.newMessage, username);
      return;
    }

    if (data.type === "delete") {
      await this.deleteMessage(data.messageId, username);
      return;
    }

    const linkMetadata = await this.fetchLinkMetadata(data.message);
    const fileAttachment = data.file ? await this.uploadFile(data.file) : null;
    const timestamp = Date.now();

    let replyData = null;
    if (data.replyTo) {
      const result = await this.env.DB.prepare(
        "SELECT id, username, message, timestamp, file_name, file_type, file_size, file_key FROM messages WHERE id = ?"
      ).bind(data.replyTo).first();

      if (result) {
        replyData = {
          replyTo: result.id as number,
          replyUsername: result.username as string,
          replyMessage: result.message as string,
          replyTimestamp: result.timestamp as number,
          replyFileName: result.file_name as string | null,
          replyFileType: result.file_type as string | null,
          replyFileSize: result.file_size as number | null,
          replyFileKey: result.file_key as string | null,
        };
      }
    }

    let query = "INSERT INTO messages (username, message, timestamp";
    let values = [username, data.message, timestamp];
    let placeholders = "?, ?, ?";

    if (replyData) {
      query += ", reply_to, reply_username, reply_message, reply_timestamp";
      values.push(replyData.replyTo, replyData.replyUsername, replyData.replyMessage, replyData.replyTimestamp);
      placeholders += ", ?, ?, ?, ?";
    }

    if (linkMetadata) {
      query += ", link_url, link_title, link_description, link_image";
      values.push(linkMetadata.url, linkMetadata.title, linkMetadata.description, linkMetadata.image);
      placeholders += ", ?, ?, ?, ?";
    }

    if (fileAttachment) {
      query += ", file_name, file_type, file_size, file_key";
      values.push(fileAttachment.name, fileAttachment.type, fileAttachment.size, fileAttachment.key);
      placeholders += ", ?, ?, ?, ?";
    }

    query += `) VALUES (${placeholders})`;

    const result = await this.env.DB.prepare(query).bind(...values).run();
    const messageId = result.meta.last_row_id;

    this.broadcastMessage(username, data.message, linkMetadata, fileAttachment, replyData, messageId);
  }

  async webSocketClose(ws: WebSocket) {
    const state = ws.deserializeAttachment() as UserState;
    this.broadcastUserEvent("user_left", state.username);
  }

  private broadcastMessage(username: string, message: string, linkMetadata?: LinkMetadata, fileAttachment?: FileAttachment, replyData?: {
    replyTo: number;
    replyUsername: string;
    replyMessage: string;
    replyTimestamp: number;
    replyFileName?: string | null;
    replyFileType?: string | null;
    replyFileSize?: number | null;
    replyFileKey?: string | null;
  }, messageId?: number) {
    const webSockets = this.ctx.getWebSockets();
    const payload = JSON.stringify({
      type: "chat",
      id: messageId,
      username,
      message,
      timestamp: Date.now(),
      linkMetadata,
      fileAttachment,
      reply_to: replyData?.replyTo,
      reply_username: replyData?.replyUsername,
      reply_message: replyData?.replyMessage,
      reply_timestamp: replyData?.replyTimestamp,
      reply_file_name: replyData?.replyFileName,
      reply_file_type: replyData?.replyFileType,
      reply_file_size: replyData?.replyFileSize,
      reply_file_key: replyData?.replyFileKey,
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
      "SELECT id, username, message, timestamp, link_url, link_title, link_description, link_image, file_name, file_type, file_size, file_key, reply_to, reply_username, reply_message, reply_timestamp, is_edited, edited_at FROM messages ORDER BY timestamp DESC LIMIT 50"
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

  private async uploadFile(file: { name: string; type: string; data: string }): Promise<FileAttachment | null> {
    if (!file || !file.data) return null;

    try {
      const fileData = this.base64ToArrayBuffer(file.data);
      const timestamp = Date.now();
      const key = `${timestamp}-${this.sanitizeFileName(file.name)}`;

      await this.env.BUCKET.put(key, fileData, {
        httpMetadata: {
          contentType: file.type,
        },
      });

      return {
        name: file.name,
        type: file.type,
        size: fileData.byteLength,
        key: key,
      };
    } catch (error) {
      console.error('Error uploading file:', error);
      return null;
    }
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  private sanitizeFileName(fileName: string): string {
    return fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
  }

  private async editMessage(messageId: number, newMessage: string, username: string): Promise<boolean> {
    try {
      const result = await this.env.DB.prepare(
        "SELECT username, reply_to, reply_username, reply_message, reply_timestamp, link_url, link_title, link_description, link_image, file_name, file_type, file_size, file_key FROM messages WHERE id = ?"
      ).bind(messageId).first();

      if (!result) {
        return false;
      }

      if (result.username !== username) {
        this.broadcastError(username, "You can only edit your own messages");
        return false;
      }

      const hasReply = result.reply_to ? true : false;
      const originalFileKey = result.file_key;
      const originalLinkUrl = result.link_url;

      await this.env.DB.prepare(
        "UPDATE messages SET message = ?, is_edited = 1, edited_at = ? WHERE id = ?"
      ).bind(newMessage, Date.now(), messageId).run();

      const editData: any = {
        messageId,
        newMessage
      };

      if (hasReply) {
        editData.reply_to = result.reply_to;
        editData.reply_username = result.reply_username;
        editData.reply_message = result.reply_message;
        editData.reply_timestamp = result.reply_timestamp;
      }

      if (originalLinkUrl) {
        editData.link_url = originalLinkUrl;
        editData.link_title = result.link_title;
        editData.link_description = result.link_description;
        editData.link_image = result.link_image;
      }

      if (originalFileKey) {
        editData.file_name = result.file_name;
        editData.file_type = result.file_type;
        editData.file_size = result.file_size;
        editData.file_key = originalFileKey;
      }

      this.broadcastEdit(messageId, newMessage, editData);
      return true;
    } catch (error) {
      console.error('Error editing message:', error);
      return false;
    }
  }

  private async deleteMessage(messageId: number, username: string): Promise<boolean> {
    try {
      const result = await this.env.DB.prepare(
        "SELECT username FROM messages WHERE id = ?"
      ).bind(messageId).first();

      if (!result) {
        return false;
      }

      if (result.username !== username) {
        this.broadcastError(username, "You can only edit your own messages");
        return false;
      }

      await this.env.DB.prepare(
        "DELETE FROM messages WHERE id = ?"
      ).bind(messageId).run();

      await this.broadcastDelete(messageId);
      return true;
    } catch (error) {
      console.error('Error deleting message:', error);
      return false;
    }
  }

  private broadcastEdit(messageId: number, newMessage: string, replyData?: any) {
    const webSockets = this.ctx.getWebSockets();

    const payload = JSON.stringify({
      type: "edit",
      messageId,
      newMessage,
      ...replyData
    });

    for (const ws of webSockets) {
      ws.send(payload);
    }
  }

  private broadcastDelete(messageId: number) {
    const webSockets = this.ctx.getWebSockets();
    const payload = JSON.stringify({
      type: "delete",
      messageId,
    });

    for (const ws of webSockets) {
      ws.send(payload);
    }
  }

  private broadcastError(username: string, message: string) {
    const webSockets = this.ctx.getWebSockets();

    for (const ws of webSockets) {
      if (ws.deserializeAttachment<UserState>().username === username) {
        ws.send(JSON.stringify({
          type: "error",
          message,
        }));
      }
    }
  }
}
