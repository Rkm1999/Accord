import { DurableObjectNamespace } from "cloudflare:workers";
import { ChatRoom } from "./ChatRoom";

export interface Env {
  CHAT_ROOM: DurableObjectNamespace<ChatRoom>;
  DB: D1Database;
  BUCKET: R2Bucket;
}

async function hashPassword(password: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

export default {

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      const username = url.searchParams.get("username");
      if (!username) {
        return new Response("Username required", { status: 400 });
      }

      const stub = env.CHAT_ROOM.getByName("main-room");
      return stub.fetch(request);
    }

    if (url.pathname.startsWith("/api/file/")) {
      const key = url.pathname.replace("/api/file/", "");
      if (!key) {
        return new Response("File key required", { status: 400 });
      }

      const object = await env.BUCKET.get(key);
      if (!object) {
        return new Response("File not found", { status: 404 });
      }

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("Access-Control-Allow-Origin", "*");

      return new Response(object.body, { headers });
    }

    if (url.pathname === "/api/users") {
      const stub = env.CHAT_ROOM.getByName("main-room");
      const response = await stub.fetch(request);
      const newResponse = new Response(response.body, response);
      newResponse.headers.set("Access-Control-Allow-Origin", "*");
      return newResponse;
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

      const headers = new Headers();
      headers.set("Access-Control-Allow-Origin", "*");
      return new Response(JSON.stringify(messages.reverse()), { headers });
    }

    if (url.pathname === "/api/auth/register" && request.method === "POST") {
      const { username, password } = await request.json();
      if (!username || !password) return new Response("Missing fields", { status: 400 });

      const passwordHash = await hashPassword(password);
      try {
        await env.DB.prepare(
          "INSERT INTO users (username, password_hash, display_name, created_at) VALUES (?, ?, ?, ?)"
        ).bind(username, passwordHash, username, Date.now()).run();
        
        const headers = new Headers();
        headers.set("Access-Control-Allow-Origin", "*");
        return new Response(JSON.stringify({ success: true }), { headers });
      } catch (e: any) {
        return new Response("Username taken", { status: 409 });
      }
    }

    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      const { username, password } = await request.json();
      const user: any = await env.DB.prepare("SELECT * FROM users WHERE username = ?").bind(username).first();
      
      if (!user) return new Response("Invalid credentials", { status: 401 });
      
      const passwordHash = await hashPassword(password);
      if (user.password_hash !== passwordHash) return new Response("Invalid credentials", { status: 401 });

      const headers = new Headers();
      headers.set("Access-Control-Allow-Origin", "*");
      return new Response(JSON.stringify({ 
        username: user.username, 
        displayName: user.display_name,
        avatarKey: user.avatar_key 
      }), { headers });
    }

    if (url.pathname === "/api/user/profile" && request.method === "POST") {
      const { username, displayName, avatarImage } = await request.json();
      let avatarKey = null;

      if (avatarImage) {
        avatarKey = `avatar-${username}-${Date.now()}`;
        const binaryData = Uint8Array.from(atob(avatarImage.split(',')[1] || avatarImage), c => c.charCodeAt(0));
        await env.BUCKET.put(avatarKey, binaryData, {
          httpMetadata: { contentType: "image/png" }
        });
      }

      if (avatarKey) {
        await env.DB.prepare("UPDATE users SET display_name = ?, avatar_key = ? WHERE username = ?")
          .bind(displayName, avatarKey, username).run();
      } else {
        await env.DB.prepare("UPDATE users SET display_name = ? WHERE username = ?")
          .bind(displayName, username).run();
      }

      const headers = new Headers();
      headers.set("Access-Control-Allow-Origin", "*");
      return new Response(JSON.stringify({ success: true, avatarKey }), { headers });
    }

    if (url.pathname === "/api/user/info" && request.method === "GET") {
        const username = url.searchParams.get("username");
        const user: any = await env.DB.prepare("SELECT username, display_name, avatar_key FROM users WHERE username = ?")
            .bind(username).first();
        
        const headers = new Headers();
        headers.set("Access-Control-Allow-Origin", "*");
        return new Response(JSON.stringify(user), { headers });
    }

    if (url.pathname === "/api/users/list" && request.method === "GET") {
      const { results } = await env.DB.prepare(
        "SELECT username, display_name, avatar_key FROM users ORDER BY display_name ASC"
      ).all();

      const headers = new Headers();
      headers.set("Access-Control-Allow-Origin", "*");
      return new Response(JSON.stringify(results), { headers });
    }

    if (url.pathname === "/api/emojis" && request.method === "GET") {
      const { results } = await env.DB.prepare(
        "SELECT id, name, file_key, created_by, created_at FROM custom_emojis ORDER BY name ASC"
      ).all();

      const headers = new Headers();
      headers.set("Access-Control-Allow-Origin", "*");
      return new Response(JSON.stringify(results), { headers });
    }

    if (url.pathname === "/api/emojis" && request.method === "POST") {
      const { name, image, username } = await request.json();

      if (!name || !image || !username) {
        const headers = new Headers();
        headers.set("Access-Control-Allow-Origin", "*");
        return new Response("Name, image, and username are required", { status: 400, headers });
      }

      const emojiName = name.replace(/:/g, "");
      const timestamp = Date.now();
      const key = `emoji-${timestamp}-${emojiName}`;

      try {
        const binaryData = Uint8Array.from(atob(image.split(',')[1] || image), c => c.charCodeAt(0));
        await env.BUCKET.put(key, binaryData, {
          httpMetadata: { contentType: "image/png" } // Assume PNG for emojis
        });

        await env.DB.prepare(
          "INSERT INTO custom_emojis (name, file_key, created_by, created_at) VALUES (?, ?, ?, ?)"
        ).bind(emojiName, key, username, timestamp).run();

        const headers = new Headers();
        headers.set("Access-Control-Allow-Origin", "*");
        return new Response(JSON.stringify({ name: emojiName, file_key: key }), { status: 201, headers });
      } catch (error: any) {
        console.error("Emoji upload error:", error);
        const headers = new Headers();
        headers.set("Access-Control-Allow-Origin", "*");
        return new Response(error.message, { status: 500, headers });
      }
    }


    if (url.pathname === "/api/channels" && request.method === "GET") {
      const { results } = await env.DB.prepare(
        "SELECT id, name, created_by, created_at FROM channels ORDER BY id ASC"
      ).all();

      const headers = new Headers();
      headers.set("Access-Control-Allow-Origin", "*");

      return new Response(JSON.stringify(results), { headers });
    }

    if (url.pathname === "/api/channels" && request.method === "POST") {
      const { name, createdBy } = await request.json();

      if (!name || !createdBy) {
        const headers = new Headers();
        headers.set("Access-Control-Allow-Origin", "*");
        return new Response("Name and createdBy are required", { status: 400, headers });
      }

      try {
        const result = await env.DB.prepare(
          "INSERT INTO channels (name, created_by, created_at) VALUES (?, ?, ?)"
        ).bind(name, createdBy, Date.now()).run();

        const channel = await env.DB.prepare(
          "SELECT id, name, created_by, created_at FROM channels WHERE id = ?"
        ).bind(result.meta.last_row_id).first();

        const headers = new Headers();
        headers.set("Access-Control-Allow-Origin", "*");

        return new Response(JSON.stringify(channel), { headers });
      } catch (error: any) {
        if (error.message?.includes("UNIQUE")) {
          const headers = new Headers();
          headers.set("Access-Control-Allow-Origin", "*");
          return new Response("Channel name already exists", { status: 409, headers });
        }
        const headers = new Headers();
        headers.set("Access-Control-Allow-Origin", "*");
        return new Response("Failed to create channel", { status: 500, headers });
      }
    }

    if (url.pathname.match(/^\/api\/channels\/\d+$/) && request.method === "DELETE") {
      const channelId = url.pathname.split("/").pop();

      if (channelId === "1") {
        const headers = new Headers();
        headers.set("Access-Control-Allow-Origin", "*");
        return new Response("Cannot delete general channel", { status: 403, headers });
      }

      await env.DB.prepare(
        "DELETE FROM messages WHERE channel_id = ?"
      ).bind(channelId).run();

      await env.DB.prepare(
        "DELETE FROM channels WHERE id = ?"
      ).bind(channelId).run();

      const headers = new Headers();
      headers.set("Access-Control-Allow-Origin", "*");
      return new Response("Channel deleted", { status: 200, headers });
    }

    if (url.pathname === "/api/search" && request.method === "POST") {
      const { query, username: searchUser, channelId, startDate, endDate } = await request.json();

      let sql = `
        SELECT m.*, c.name as channel_name, u.display_name, u.avatar_key as user_avatar
        FROM messages m
        LEFT JOIN channels c ON m.channel_id = c.id
        LEFT JOIN users u ON m.username = u.username
        WHERE 1=1
      `;

      const params = [];

      if (query && query.trim()) {
        sql += " AND (m.message LIKE ? OR m.link_title LIKE ?)";
        const searchTerm = `%${query.trim()}%`;
        params.push(searchTerm, searchTerm);
      }

      if (username && username.trim()) {
        sql += " AND m.username LIKE ?";
        params.push(`%${username.trim()}%`);
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

      const headers = new Headers();
      headers.set("Access-Control-Allow-Origin", "*");
      return new Response(JSON.stringify(results), { headers });
    }

    if (request.method === "OPTIONS") {
      const headers = new Headers();
      headers.set("Access-Control-Allow-Origin", "*");
      headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
      headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
      return new Response(null, { headers });
    }

    return new Response("Not Found", { status: 404 });
  },
};

export { ChatRoom };
