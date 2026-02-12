import { DurableObject } from "cloudflare:workers";
import { FirebaseService } from "./FirebaseService";

export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  FIREBASE_PROJECT_ID: string;
  FIREBASE_CLIENT_EMAIL: string;
  FIREBASE_PRIVATE_KEY: string;
}

interface UserState {
  username: string;
  displayName: string;
  avatarKey: string | null;
  joinedAt: number;
  channelId: number;
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

interface Reaction {
  emoji: string;
  username: string;
  message_id?: number;
}

export class ChatRoom extends DurableObject {

  constructor(public ctx: any, public env: any) {
    super(ctx, env);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/refresh_channels") {
      this.broadcastChannelEvent("refresh_channels");
      return new Response("OK");
    }

    if (url.pathname === "/refresh_users") {
      this.broadcastChannelEvent("refresh_users");
      return new Response("OK");
    }

    const username = url.searchParams.get("username") || "Anonymous";
    const channelId = parseInt(url.searchParams.get("channelId") || "1");

    // Security check: If it's a DM, ensure user is a member
    const channel = await this.env.DB.prepare("SELECT type FROM channels WHERE id = ?").bind(channelId).first();
    if (channel?.type === 'dm') {
        const isMember = await this.env.DB.prepare(
            "SELECT 1 FROM channel_members WHERE channel_id = ? AND username = ?"
        ).bind(channelId, username).first();
        
        if (!isMember) {
            return new Response("Unauthorized: You are not a member of this DM", { status: 403 });
        }
    }

    const user: any = await this.env.DB.prepare("SELECT display_name, avatar_key FROM users WHERE username = ?")
      .bind(username).first();
    
    const displayName = user?.display_name || username;
    const avatarKey = user?.avatar_key || null;

    // Check if user is already online in another tab BEFORE accepting this one
    const isAlreadyOnline = this.ctx.getWebSockets().some((ws: any) => {
        try {
            const state = ws.deserializeAttachment();
            return state && state.username === username;
        } catch {
            return false;
        }
    });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server);

    server.serializeAttachment({
      username,
      displayName,
      avatarKey,
      joinedAt: Date.now(),
      channelId,
    } as UserState);

    // Only broadcast "joined" if this is the first connection for this user
    if (!isAlreadyOnline) {
        this.broadcastUserEvent("user_joined", username, channelId, displayName, avatarKey);
    }

    await this.sendChatHistory(server, channelId);
    this.sendOnlineUsers(server);
    this.broadcastOnlineList(); // Sync everyone

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }


  async webSocketMessage(ws: WebSocket, message: string) {
    const state = ws.deserializeAttachment() as UserState;
    const { username, channelId, displayName, avatarKey } = state;

    const data = JSON.parse(message);

    if (data.type === "heartbeat") {
        return; // Just to keep connection alive
    }

    if (data.type === "switch_channel") {

      const newChannelId = data.channelId;
      ws.serializeAttachment({
        username,
        joinedAt: Date.now(),
        channelId: newChannelId,
      } as UserState);

      await this.sendChatHistory(ws, newChannelId);

      ws.send(JSON.stringify({
        type: "channel_switched",
        channelId: newChannelId,
      }));

      return;
    }

    if (data.type === "typing") {
      this.broadcastTypingIndicator(username, data.isTyping, channelId);
      return;
    }

    if (data.type === "edit") {
      await this.editMessage(data.messageId, data.newMessage, username, channelId);
      return;
    }

    if (data.type === "delete") {
      await this.deleteMessage(data.messageId, username, channelId);
      return;
    }

    if (data.type === "reaction") {
      await this.handleReaction(data.messageId, data.emoji, username, channelId);
      return;
    }

    if (data.type === "mark_read") {
        await this.env.DB.prepare(
            "INSERT INTO channel_last_read (username, channel_id, message_id, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(username, channel_id) DO UPDATE SET message_id = ?, updated_at = ?"
        ).bind(username, channelId, data.messageId, Date.now(), data.messageId, Date.now()).run();
        return;
    }

    if (data.type === "load_more" || data.type === "load_history") {
      await this.sendChatHistory(ws, channelId, data.offset || 0);
      return;
    }

    if (data.type !== "chat") {
      return;
    }

    const linkMetadata = await this.fetchLinkMetadata(data.message);

    const fileAttachment = data.file ? await this.uploadFile(data.file) : null;
    const timestamp = Date.now();

    let replyData = null;
    if (data.replyTo) {
      const result = await this.env.DB.prepare(
        "SELECT id, username, message, timestamp, file_name, file_type, file_size, file_key FROM messages WHERE id = ? AND channel_id = ?"
      ).bind(data.replyTo, channelId).first();

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

    let query = "INSERT INTO messages (username, message, timestamp, channel_id";
    let values = [username, data.message, timestamp, channelId];
    let placeholders = "?, ?, ?, ?";

    if (replyData) {
      query += ", reply_to, reply_username, reply_message, reply_timestamp, reply_file_name, reply_file_type, reply_file_size, reply_file_key";
      values.push(
        replyData.replyTo, 
        replyData.replyUsername, 
        replyData.replyMessage, 
        replyData.replyTimestamp,
        replyData.replyFileName || null,
        replyData.replyFileType || null,
        replyData.replyFileSize || null,
        replyData.replyFileKey || null
      );
      placeholders += ", ?, ?, ?, ?, ?, ?, ?, ?";
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

    // Extract mentions
    const mentions: string[] = [];
    const mentionRegex = /@(\w+)/g;
    let match;
    while ((match = mentionRegex.exec(data.message)) !== null) {
      mentions.push(match[1]);
    }

    if (replyData) {
      mentions.push(replyData.replyUsername);
    }

    // @ts-ignore
    this.broadcastMessage(username, data.message, linkMetadata || undefined, fileAttachment || undefined, replyData || undefined, messageId, channelId, displayName, avatarKey, mentions);

    // Trigger push notifications
    this.ctx.waitUntil(this.sendPushNotifications(username, data.message, channelId, mentions));
  }

  private async sendPushNotifications(senderUsername: string, message: string, channelId: number, mentions: string[]) {
    try {
      if (!this.env.FIREBASE_PROJECT_ID) return;

      const firebase = new FirebaseService(
        this.env.FIREBASE_PROJECT_ID,
        this.env.FIREBASE_CLIENT_EMAIL,
        this.env.FIREBASE_PRIVATE_KEY
      );

      // Check if it's a DM
      const channel = await this.env.DB.prepare("SELECT name, type FROM channels WHERE id = ?").bind(channelId).first();
      const isDm = channel?.type === 'dm';

      // Find who to notify
      let usersToNotify: string[] = [];
      if (isDm) {
        const members: any = await this.env.DB.prepare("SELECT username FROM channel_members WHERE channel_id = ? AND username != ?")
          .bind(channelId, senderUsername).all();
        usersToNotify = members.results.map((r: any) => r.username);
      } else {
        // Notify mentions + @everyone/@here if applicable (later)
        usersToNotify = mentions.filter(u => u !== senderUsername);
        
        if (message.includes("@everyone")) {
             const allUsers: any = await this.env.DB.prepare("SELECT username FROM users WHERE username != ?").bind(senderUsername).all();
             usersToNotify = [...new Set([...usersToNotify, ...allUsers.results.map((r: any) => r.username)])];
        }
      }

      if (usersToNotify.length === 0) return;

      // Get tokens for these users
      const placeholders = usersToNotify.map(() => "?").join(",");
      const { results: tokens }: any = await this.env.DB.prepare(
        `SELECT username, token FROM push_tokens WHERE username IN (${placeholders})`
      ).bind(...usersToNotify).all();

      if (!tokens || tokens.length === 0) return;

      const channelName = isDm ? senderUsername : (channel?.name || "channel");

      for (const { token } of tokens as any) {
        await firebase.sendNotification(
          token,
          isDm ? `Message from ${senderUsername}` : `#${channelName}`,
          `${senderUsername}: ${message.substring(0, 100)}${message.length > 100 ? "..." : ""}`,
          {
            link: `/chat`,
            channelId: channelId.toString(),
          }
        );
      }
    } catch (e) {
      console.error("Error sending push notifications:", e);
    }
  }

  async webSocketClose(ws: WebSocket) {
    const state = ws.deserializeAttachment() as UserState;
    if (!state) return;
    const username = state.username;

    // Check if any OTHER connections for this user still exist
    const allSockets = this.ctx.getWebSockets();
    const hasRemainingTabs = allSockets.some((s: any) => {
        try {
            const sState = s.deserializeAttachment() as any;
            return s !== ws && sState && sState.username === username;
        } catch {
            return false;
        }
    });

    // Only broadcast "left" if no more tabs are open
    if (!hasRemainingTabs) {
        this.broadcastUserEvent("user_left", username);
    }
    
    // Broadcast updated list to everyone EXCEPT the closing socket
    this.broadcastOnlineList(ws); 
  }

  private broadcastMessage(username: string, message: string, linkMetadata?: LinkMetadata | null, fileAttachment?: FileAttachment | null, replyData?: {
    replyTo: number;
    replyUsername: string;
    replyMessage: string;
    replyTimestamp: number;
    replyFileName?: string | null;
    replyFileType?: string | null;
    replyFileSize?: number | null;
    replyFileKey?: string | null;
  }, messageId?: number, channelId?: number, displayName?: string, avatarKey?: string | null, mentions?: string[]) {
    const webSockets = this.ctx.getWebSockets();
    const payload = JSON.stringify({
      type: "chat",
      id: messageId,
      username,
      displayName,
      avatarKey,
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
      mentions: mentions || [],
      channelId,
    });



    for (const ws of webSockets) {
      ws.send(payload);
    }
  }


  private broadcastChannelEvent(type: string) {
    const webSockets = this.ctx.getWebSockets();
    const payload = JSON.stringify({ type });

    for (const ws of webSockets) {
      ws.send(payload);
    }
  }

  private broadcastUserEvent(eventType: string, username: string, channelId?: number, displayName?: string, avatarKey?: string | null) {
    const webSockets = this.ctx.getWebSockets();
    const userCount = webSockets.length;
    const payload = JSON.stringify({
      type: "presence",
      event: eventType,
      username,
      displayName,
      avatarKey,
      userCount,
      channelId,
    });


    for (const ws of webSockets) {
      const state = ws.deserializeAttachment() as any;
      if (state.channelId === channelId) {
        ws.send(payload);
      }
    }
  }

  private broadcastTypingIndicator(username: string, isTyping: boolean, channelId?: number) {
    const webSockets = this.ctx.getWebSockets();
    const payload = JSON.stringify({
      type: "typing",
      username,
      isTyping,
    });

    for (const ws of webSockets) {
      const state = ws.deserializeAttachment() as any;
      if (state.channelId === channelId) {
        ws.send(payload);
      }
    }
  }

  private sendOnlineUsers(ws: WebSocket) {
    const webSockets = this.ctx.getWebSockets();
    const uniqueUsernames = [...new Set(webSockets.map((s: any) => {
        try { return (s.deserializeAttachment() as any)?.username; } catch { return null; }
    }))].filter(u => u !== null);
    
    ws.send(JSON.stringify({
      type: "online_list",
      usernames: uniqueUsernames,
    }));
  }

  private broadcastOnlineList(excludeSocket?: WebSocket) {
    const webSockets = this.ctx.getWebSockets();
    const uniqueUsernames = [...new Set(webSockets.map((s: any) => {
        if (excludeSocket && s === excludeSocket) return null;
        try { return (s.deserializeAttachment() as any)?.username; } catch { return null; }
    }))].filter(u => u !== null);

    const payload = JSON.stringify({
      type: "online_list",
      usernames: uniqueUsernames,
    });

    for (const ws of webSockets) {
      if (excludeSocket && ws === excludeSocket) continue;
      ws.send(payload);
    }
  }

  private async sendChatHistory(ws: WebSocket, channelId: number, offset = 0) {
    const state = ws.deserializeAttachment() as any;
    const username = state.username;

    const lastRead = await this.env.DB.prepare(
        "SELECT message_id FROM channel_last_read WHERE username = ? AND channel_id = ?"
    ).bind(username, channelId).first() as any;

    const { results: messages }: any = await this.env.DB.prepare(
      `SELECT m.*, u.display_name, u.avatar_key as user_avatar 
       FROM messages m 
       LEFT JOIN users u ON m.username = u.username 
       WHERE m.channel_id = ? 
       ORDER BY m.timestamp DESC LIMIT 25 OFFSET ?`
    ).bind(channelId, offset).all();

    if (messages.length > 0) {
        const messageIds = messages.map((m: any) => m.id);
      const placeholders = messageIds.map(() => '?').join(',');
      const { results: reactions } = await this.env.DB.prepare(
        `SELECT message_id, emoji, username FROM reactions WHERE message_id IN (${placeholders})`
      ).bind(...messageIds).all() as { results: any[] };

      messages.forEach((m: any) => {
        m.reactions = reactions.filter(r => r.message_id === m.id);
      });
    }

    const history = messages.reverse();

    const totalCount = await this.env.DB.prepare(
      "SELECT COUNT(*) as count FROM messages WHERE channel_id = ?"
    ).bind(channelId).first() as any;

    ws.send(JSON.stringify({
      type: "history",
      messages: history,
      offset: offset,
      hasMore: offset + 25 < (totalCount?.count || 0),
      lastReadMessageId: lastRead?.message_id || 0
    }));
  }

  private async handleReaction(messageId: number, emoji: string, username: string, channelId: number) {
    try {
      const existing = await this.env.DB.prepare(
        "SELECT id FROM reactions WHERE message_id = ? AND username = ? AND emoji = ?"
      ).bind(messageId, username, emoji).first();

      if (existing) {
        await this.env.DB.prepare(
          "DELETE FROM reactions WHERE id = ?"
        ).bind(existing.id).run();
      } else {
        await this.env.DB.prepare(
          "INSERT INTO reactions (message_id, username, emoji, created_at) VALUES (?, ?, ?, ?)"
        ).bind(messageId, username, emoji, Date.now()).run();
      }

      const reactions = await this.getMessageReactions(messageId);
      this.broadcastReaction(messageId, reactions, channelId);
    } catch (error) {
      console.error('Error handling reaction:', error);
    }
  }

  private async getMessageReactions(messageId: number) {
    const { results } = await this.env.DB.prepare(
      "SELECT emoji, username FROM reactions WHERE message_id = ? ORDER BY created_at ASC"
    ).bind(messageId).all();
    return results;
  }

  private broadcastReaction(messageId: number, reactions: any[], channelId: number) {
    const webSockets = this.ctx.getWebSockets();
    const payload = JSON.stringify({
      type: "reaction",
      messageId,
      reactions,
    });

    for (const ws of webSockets) {
      const state = ws.deserializeAttachment() as any;
      if (state.channelId === channelId) {
        ws.send(payload);
      }
    }
  }

  private async fetchLinkMetadata(message: string): Promise<LinkMetadata | null> {
    if (!message) return null;

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

      // Helper to extract meta tags regardless of attribute order
      const getMeta = (prop: string) => {
        const patterns = [
          new RegExp(`<meta[^>]+(?:property|name)=["'](?:og|twitter):${prop}["'][^>]+content=["']([^"']+)["']`, 'i'),
          new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og|twitter):${prop}["']`, 'i')
        ];
        for (const p of patterns) {
          const m = html.match(p);
          if (m) return m[1];
        }
        return '';
      };

      // 1. Try standard OpenGraph / Twitter Tags first
      title = getMeta('title');
      description = getMeta('description');
      image = getMeta('image');

      // 2. YouTube Specific Enhancements
      const urlObj = new URL(url);
      if (urlObj.hostname.includes('youtube.com') || urlObj.hostname.includes('youtu.be')) {
        const videoId = this.extractYouTubeVideoId(url);
        if (videoId) {
          // Construct high-quality thumbnail URL
          image = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

          // Try YouTube oEmbed API for reliable title
          try {
            const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
            const oembedRes = await fetch(oembedUrl);
            if (oembedRes.ok) {
              const oembedData: any = await oembedRes.json();
              if (oembedData.title) title = oembedData.title;
            }
          } catch (e) {
            console.error('YouTube oEmbed fetch failed:', e);
          }

          // Force override if generic or numeric
          const isGeneric = (str: string) => !str || str === 'YouTube' || /^\d+(\.\d+)?[KMB]?$/.test(str) || 
                                           str.includes('Enjoy the videos') || 
                                           str.includes('Share your videos') || 
                                           str.includes('YouTube is an American') ||
                                           str.includes('YouTube에서 마음에 드는') ||
                                           str.includes('YouTube でお気に入りの');

          if (isGeneric(title)) {
            const ytTitleMatch = html.match(/"videoDetails":\{.*?"title":"([^"]+)"/i) || 
                                html.match(/<meta[^>]+itemprop=["']name["'][^>]+content=["']([^"']+)["']/i) ||
                                html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+itemprop=["']name["']/i);
            if (ytTitleMatch) {
              title = ytTitleMatch[1].replace(/\\u0026/g, '&').replace(/\\u003c/g, '<').replace(/\\u003e/g, '>');
            }
          }

          if (isGeneric(description)) {
            const ytDescMatch = html.match(/"shortDescription":"([^"]+)"/i) ||
                               html.match(/"videoDetails":\{.*?"shortDescription":"([^"]+)"/i) ||
                               html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
                               html.match(/<meta[^>]+itemprop=["']description["'][^>]+content=["']([^"']+)["']/i) ||
                               html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+itemprop=["']description["']/i);
            if (ytDescMatch) {
              description = ytDescMatch[1].replace(/\\n/g, ' ').replace(/\\u0026/g, '&');
            }
          }
        }
      }

      // 3. Fallbacks for title and description
      if (!title) {
        const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        title = titleMatch ? titleMatch[1].trim() : url;
      }

      if (!description) {
        const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
                        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
        description = descMatch ? descMatch[1] : '';
      }

      // Cleanup entities and extra whitespace
      const decode = (str: string) => str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();

      if (title || description || image) {
        return {
          url,
          title: decode(title),
          description: decode(description),
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

  private async editMessage(messageId: number, newMessage: string, username: string, channelId: number): Promise<boolean> {
    try {
      const result = await this.env.DB.prepare(
        "SELECT username, reply_to, reply_username, reply_message, reply_timestamp, link_url, link_title, link_description, link_image, file_name, file_type, file_size, file_key FROM messages WHERE id = ? AND channel_id = ?"
      ).bind(messageId, channelId).first();

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

      this.broadcastEdit(messageId, newMessage, editData, channelId);
      return true;
    } catch (error) {
      console.error('Error editing message:', error);
      return false;
    }
  }

  private async deleteMessage(messageId: number, username: string, channelId: number): Promise<boolean> {
    try {
      const result = await this.env.DB.prepare(
        "SELECT username FROM messages WHERE id = ? AND channel_id = ?"
      ).bind(messageId, channelId).first();

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

      await this.broadcastDelete(messageId, channelId);
      return true;
    } catch (error) {
      console.error('Error deleting message:', error);
      return false;
    }
  }

  private broadcastEdit(messageId: number, newMessage: string, replyData?: any, channelId?: number) {
    const webSockets = this.ctx.getWebSockets();

    const payload = JSON.stringify({
      type: "edit",
      messageId,
      newMessage,
      ...replyData
    });

    for (const ws of webSockets) {
      const state = ws.deserializeAttachment() as any;
      if (state.channelId === channelId) {
        ws.send(payload);
      }
    }
  }

  private broadcastDelete(messageId: number, channelId?: number) {
    const webSockets = this.ctx.getWebSockets();
    const payload = JSON.stringify({
      type: "delete",
      messageId,
    });

    for (const ws of webSockets) {
      const state = ws.deserializeAttachment() as any;
      if (state.channelId === channelId) {
        ws.send(payload);
      }
    }
  }

  private broadcastError(username: string, message: string) {
    const webSockets = this.ctx.getWebSockets();

    for (const ws of webSockets) {
      if ((ws.deserializeAttachment() as any)?.username === username) {
        ws.send(JSON.stringify({
          type: "error",
          message,
        }));
      }
    }
  }
}
