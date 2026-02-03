import { DurableObjectNamespace } from "cloudflare:workers";
import { ChatRoom } from "./ChatRoom";

export interface Env {
  CHAT_ROOM: DurableObjectNamespace<ChatRoom>;
  DB: D1Database;
  BUCKET: R2Bucket;
  ASSETS: Fetcher;
}


async function hashPassword(password: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

function generateRecoveryKey(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let key = "";
    for (let i = 0; i < 12; i++) {
        if (i > 0 && i % 4 === 0) key += "-";
        key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
}

function handleCors(request: Request) {
  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.set("Access-Control-Max-Age", "86400");

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  return headers;
}

function corsResponse(body: any, status: number = 200, extraHeaders?: Headers) {
    const headers = extraHeaders || new Headers();
    if (!headers.has("Access-Control-Allow-Origin")) {
      headers.set("Access-Control-Allow-Origin", "*");
    }
    headers.set("Content-Type", "application/json");
    
    const responseBody = typeof body === "string" ? body : JSON.stringify(body);
    return new Response(responseBody, { status, headers });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const corsHeaders = handleCors(request);
    if (corsHeaders instanceof Response) return corsHeaders;

    if (url.pathname === "/ws") {
      const username = url.searchParams.get("username");
      if (!username) return corsResponse("Username required", 400, corsHeaders);
      const stub = env.CHAT_ROOM.getByName("main-room");
      return stub.fetch(request);
    }

    if (url.pathname.startsWith("/api/file/")) {
      const key = url.pathname.replace("/api/file/", "");
      if (!key) return corsResponse("File key required", 400, corsHeaders);

      const object = await env.BUCKET.get(key);
      if (!object) return corsResponse("File not found", 404, corsHeaders);

      const headers = new Headers(corsHeaders);
      object.writeHttpMetadata(headers);
      return new Response(object.body, { headers });
    }

    if (url.pathname === "/api/auth/register" && request.method === "POST") {
      const { username, password } = await request.json();
      if (!username || !password) return corsResponse("Missing fields", 400, corsHeaders);

      const recoveryKey = generateRecoveryKey();
      const passwordHash = await hashPassword(password);
      const recoveryKeyHash = await hashPassword(recoveryKey);

      try {
        await env.DB.prepare(
          "INSERT INTO users (username, password_hash, display_name, recovery_key_hash, created_at) VALUES (?, ?, ?, ?, ?)"
        ).bind(username, passwordHash, username, recoveryKeyHash, Date.now()).run();
        
        // Notify Durable Object to broadcast new user registration
        const stub = env.CHAT_ROOM.getByName("main-room");
        await stub.fetch(new Request("http://durable/refresh_users"));

        return corsResponse({ success: true, recoveryKey }, 201, corsHeaders);
      } catch (e: any) {
        console.error("Register error:", e);
        return corsResponse("Username taken", 409, corsHeaders);
      }
    }

    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      const { username, password } = await request.json();
      const user: any = await env.DB.prepare("SELECT * FROM users WHERE username = ?").bind(username).first();
      
      if (!user) return corsResponse("Invalid credentials", 401, corsHeaders);
      
      const passwordHash = await hashPassword(password);
      if (user.password_hash !== passwordHash) return corsResponse("Invalid credentials", 401, corsHeaders);

      return corsResponse({ 
        username: user.username, 
        displayName: user.display_name,
        avatarKey: user.avatar_key 
      }, 200, corsHeaders);
    }

    if (url.pathname === "/api/auth/reset-password" && request.method === "POST") {
      const { username, recoveryKey, newPassword } = await request.json();
      const user: any = await env.DB.prepare("SELECT recovery_key_hash FROM users WHERE username = ?").bind(username).first();
      
      if (!user) return corsResponse("Invalid user", 404, corsHeaders);
      
      const recoveryKeyHash = await hashPassword(recoveryKey.toUpperCase());
      if (user.recovery_key_hash !== recoveryKeyHash) {
        return corsResponse("Invalid recovery key", 401, corsHeaders);
      }

      const newPasswordHash = await hashPassword(newPassword);
      await env.DB.prepare("UPDATE users SET password_hash = ? WHERE username = ?")
        .bind(newPasswordHash, username).run();

      return corsResponse({ success: true }, 200, corsHeaders);
    }

    if (url.pathname === "/api/user/profile" && request.method === "POST") {
      const { username, displayName, avatarImage, generateNewRecoveryKey } = await request.json();
      let avatarKey = null;
      let newRecoveryKey = null;

      if (avatarImage) {
        avatarKey = `avatar-${username}-${Date.now()}`;
        const binaryData = Uint8Array.from(atob(avatarImage.split(',')[1] || avatarImage), c => c.charCodeAt(0));
        await env.BUCKET.put(avatarKey, binaryData, {
          httpMetadata: { contentType: "image/png" }
        });
      }

      if (generateNewRecoveryKey) {
          newRecoveryKey = generateRecoveryKey();
          const newHash = await hashPassword(newRecoveryKey);
          await env.DB.prepare("UPDATE users SET recovery_key_hash = ? WHERE username = ?")
            .bind(newHash, username).run();
      }

      if (avatarKey) {
        await env.DB.prepare("UPDATE users SET display_name = ?, avatar_key = ? WHERE username = ?")
          .bind(displayName, avatarKey, username).run();
      } else {
        await env.DB.prepare("UPDATE users SET display_name = ? WHERE username = ?")
          .bind(displayName, username).run();
      }

      return corsResponse({ success: true, avatarKey, newRecoveryKey }, 200, corsHeaders);
    }

    if (url.pathname === "/api/users/list" && request.method === "GET") {
      const { results } = await env.DB.prepare(
        "SELECT username, display_name, avatar_key FROM users ORDER BY display_name ASC"
      ).all();
      return corsResponse(results, 200, corsHeaders);
    }

    if (url.pathname === "/api/emojis" && request.method === "GET") {
      const { results } = await env.DB.prepare(
        "SELECT id, name, file_key, created_by, created_at FROM custom_emojis ORDER BY name ASC"
      ).all();
      return corsResponse(results, 200, corsHeaders);
    }

    if (url.pathname === "/api/emojis" && request.method === "POST") {
      const { name, image, username } = await request.json();
      if (!name || !image || !username) return corsResponse("Missing required fields", 400, corsHeaders);

      const emojiName = name.replace(/:/g, "");
      const timestamp = Date.now();
      const key = `emoji-${timestamp}-${emojiName}`;

      try {
        const binaryData = Uint8Array.from(atob(image.split(',')[1] || image), c => c.charCodeAt(0));
        await env.BUCKET.put(key, binaryData, { httpMetadata: { contentType: "image/png" } });
        await env.DB.prepare(
          "INSERT INTO custom_emojis (name, file_key, created_by, created_at) VALUES (?, ?, ?, ?)"
        ).bind(emojiName, key, username, timestamp).run();
        return corsResponse({ name: emojiName, file_key: key }, 201, corsHeaders);
      } catch (e: any) {
        return corsResponse(e.message, 500, corsHeaders);
      }
    }

    if (url.pathname === "/api/channels" && request.method === "GET") {
      const { results } = await env.DB.prepare("SELECT id, name, created_by, created_at FROM channels ORDER BY id ASC").all();
      return corsResponse(results, 200, corsHeaders);
    }

    if (url.pathname === "/api/channels" && request.method === "POST") {
      const { name, createdBy } = await request.json();
      if (!name || !createdBy) return corsResponse("Name and createdBy are required", 400, corsHeaders);

      try {
        const result = await env.DB.prepare(
          "INSERT INTO channels (name, created_by, created_at) VALUES (?, ?, ?)"
        ).bind(name, createdBy, Date.now()).run();
        const channel = await env.DB.prepare("SELECT id, name, created_by, created_at FROM channels WHERE id = ?")
            .bind(result.meta.last_row_id).first();
        
        // Notify Durable Object to broadcast channel creation
        const stub = env.CHAT_ROOM.getByName("main-room");
        await stub.fetch(new Request("http://durable/refresh_channels"));

        return corsResponse(channel, 200, corsHeaders);
      } catch (error: any) {
        if (error.message?.includes("UNIQUE")) return corsResponse("Channel name already exists", 409, corsHeaders);
        return corsResponse("Failed to create channel", 500, corsHeaders);
      }
    }

    if (url.pathname.match(/^\/api\/channels\/\d+$/) && request.method === "DELETE") {
      const channelId = url.pathname.split("/").pop();
      if (channelId === "1") return corsResponse("Cannot delete general channel", 403, corsHeaders);
      await env.DB.prepare("DELETE FROM messages WHERE channel_id = ?").bind(channelId).run();
      await env.DB.prepare("DELETE FROM channels WHERE id = ?").bind(channelId).run();
      
      // Notify Durable Object to broadcast channel deletion
      const stub = env.CHAT_ROOM.getByName("main-room");
      await stub.fetch(new Request("http://durable/refresh_channels"));

      return corsResponse("Channel deleted", 200, corsHeaders);
    }

    if (url.pathname === "/api/history") {
      const channelId = url.searchParams.get("channelId") || "1";
      const { results: messages } = await env.DB.prepare(
        `SELECT m.*, u.display_name, u.avatar_key as user_avatar 
         FROM messages m 
         LEFT JOIN users u ON m.username = u.username 
         WHERE m.channel_id = ? 
         ORDER BY m.timestamp DESC LIMIT 100`
      ).bind(channelId).all() as { results: any[] };

      if (messages.length > 0) {
        const messageIds = messages.map(m => m.id);
        const placeholders = messageIds.map(() => '?').join(',');
        const { results: reactions } = await env.DB.prepare(
          `SELECT message_id, emoji, username FROM reactions WHERE message_id IN (${placeholders})`
        ).bind(...messageIds).all() as { results: any[] };
        messages.forEach(m => {
          m.reactions = reactions.filter(r => r.message_id === m.id);
        });
      }
      return corsResponse(messages.reverse(), 200, corsHeaders);
    }

    if (url.pathname === "/api/search" && request.method === "POST") {
      const { query, username: searchUser, channelId, startDate, endDate } = await request.json();
      let sql = `SELECT m.*, c.name as channel_name, u.display_name, u.avatar_key as user_avatar FROM messages m 
                 LEFT JOIN channels c ON m.channel_id = c.id LEFT JOIN users u ON m.username = u.username WHERE 1=1`;
      const params = [];
      if (query && query.trim()) {
        sql += " AND (m.message LIKE ? OR m.link_title LIKE ?)";
        const searchTerm = `%${query.trim()}%`;
        params.push(searchTerm, searchTerm);
      }
      if (searchUser && searchUser.trim()) {
        sql += " AND m.username LIKE ?";
        params.push(`%${searchUser.trim()}%`);
      }
      if (channelId && channelId !== "all") {
        sql += " AND m.channel_id = ?";
        params.push(channelId);
      }
      if (startDate) {
        sql += " AND m.timestamp >= ?";
        params.push(new Date(startDate).getTime());
      }
      if (endDate) {
        sql += " AND m.timestamp <= ?";
        params.push(new Date(endDate).getTime());
      }
      sql += " ORDER BY m.timestamp DESC LIMIT 100";
      const { results } = await env.DB.prepare(sql).bind(...params).all();
      return corsResponse(results, 200, corsHeaders);
    }

    try {
      return await env.ASSETS.fetch(request);
    } catch {
      return corsResponse("Not Found", 404, corsHeaders);
    }
  },
};


export { ChatRoom };
