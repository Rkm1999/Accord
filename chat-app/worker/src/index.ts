import { ChatRoom } from "./ChatRoom";

export interface Env {
  CHAT_ROOM: any;
  DB: D1Database;
  BUCKET: R2Bucket;
  ASSETS: Fetcher;
  FIREBASE_PROJECT_ID: string;
  FIREBASE_CLIENT_EMAIL: string;
  FIREBASE_PRIVATE_KEY: string;
  // Firebase Client Config (for the frontend)
  FIREBASE_API_KEY: string;
  FIREBASE_AUTH_DOMAIN: string;
  FIREBASE_STORAGE_BUCKET: string;
  FIREBASE_MESSAGING_SENDER_ID: string;
  FIREBASE_APP_ID: string;
  FIREBASE_MEASUREMENT_ID: string;
  FIREBASE_VAPID_PUBLIC_KEY: string;
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

    if (url.pathname === "/api/config" && request.method === "GET") {
      return corsResponse({
        firebaseConfig: {
          apiKey: env.FIREBASE_API_KEY,
          authDomain: env.FIREBASE_AUTH_DOMAIN,
          projectId: env.FIREBASE_PROJECT_ID,
          storageBucket: env.FIREBASE_STORAGE_BUCKET,
          messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID,
          appId: env.FIREBASE_APP_ID,
          measurementId: env.FIREBASE_MEASUREMENT_ID,
        },
        vapidKey: env.FIREBASE_VAPID_PUBLIC_KEY,
      }, 200, corsHeaders);
    }

    if (url.pathname === "/ws") {
      const username = url.searchParams.get("username");
      if (!username) return corsResponse("Username required", 400, corsHeaders);
      const stub = env.CHAT_ROOM.getByName("main-room");
      return stub.fetch(request);
    }

    if (url.pathname.startsWith("/api/file/")) {
      const key = decodeURIComponent(url.pathname.replace("/api/file/", ""));
      if (!key) return corsResponse("File key required", 400, corsHeaders);

      const object = await env.BUCKET.get(key);
      if (!object) return corsResponse("File not found", 404, corsHeaders);

      const headers = new Headers(corsHeaders);
      object.writeHttpMetadata(headers);
      return new Response(object.body, { headers });
    }

    if (url.pathname === "/api/auth/register" && request.method === "POST") {
      const { username, password } = await request.json() as any;
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
      const { username, password } = await request.json() as any;
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
      const { username, recoveryKey, newPassword } = await request.json() as any;
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
      const { username, displayName, avatarImage, generateNewRecoveryKey } = await request.json() as any;
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
      const { name, image, username } = await request.json() as any;
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
      const { results } = await env.DB.prepare("SELECT id, name, created_by, created_at FROM channels WHERE type = 'public' ORDER BY id ASC").all();
      return corsResponse(results, 200, corsHeaders);
    }

    if (url.pathname === "/api/dms" && request.method === "GET") {
      const username = url.searchParams.get("username");
      if (!username) return corsResponse("Username required", 400, corsHeaders);

      const { results } = await env.DB.prepare(
        `SELECT c.id, c.created_at, u.username as other_username, u.display_name as other_display_name, u.avatar_key as other_avatar_key
         FROM channels c
         JOIN channel_members cm_me ON c.id = cm_me.channel_id
         JOIN channel_members cm_other ON c.id = cm_other.channel_id
         JOIN users u ON cm_other.username = u.username
         WHERE c.type = 'dm' 
           AND cm_me.username = ?
           AND cm_other.username != ?
         ORDER BY c.created_at DESC`
      ).bind(username, username).all();
      
      return corsResponse(results, 200, corsHeaders);
    }

    if (url.pathname === "/api/dm" && request.method === "POST") {
      const { username, targetUsername } = await request.json() as any;
      if (!username || !targetUsername) return corsResponse("Missing users", 400, corsHeaders);

      // Check if DM already exists
      // We assume strict 1:1 DMs for now
      const existing = await env.DB.prepare(
        `SELECT c.id 
         FROM channels c
         JOIN channel_members cm1 ON c.id = cm1.channel_id
         JOIN channel_members cm2 ON c.id = cm2.channel_id
         WHERE c.type = 'dm' 
           AND cm1.username = ? 
           AND cm2.username = ?`
      ).bind(username, targetUsername).first();

      if (existing) {
        return corsResponse({ id: existing.id }, 200, corsHeaders);
      }

      // Create new DM
      const sortedUsers = [username, targetUsername].sort();
      const dmName = `dm_${sortedUsers[0]}_${sortedUsers[1]}`;
      const timestamp = Date.now();

      try {
        // Create channel
        const result = await env.DB.prepare(
          "INSERT INTO channels (name, created_by, created_at, type) VALUES (?, ?, ?, 'dm')"
        ).bind(dmName, username, timestamp).run();
        
        const channelId = result.meta.last_row_id;

        // Add members
        await env.DB.batch([
          env.DB.prepare("INSERT INTO channel_members (channel_id, username, joined_at) VALUES (?, ?, ?)").bind(channelId, username, timestamp),
          env.DB.prepare("INSERT INTO channel_members (channel_id, username, joined_at) VALUES (?, ?, ?)").bind(channelId, targetUsername, timestamp)
        ]);

        return corsResponse({ id: channelId }, 201, corsHeaders);
      } catch (e: any) {
        console.error("DM creation error:", e);
        if (e.message?.includes("UNIQUE")) {
             // Fallback if race condition created it
             const retry = await env.DB.prepare("SELECT id FROM channels WHERE name = ?").bind(dmName).first();
             if (retry) return corsResponse({ id: retry.id }, 200, corsHeaders);
        }
        return corsResponse("Failed to create DM", 500, corsHeaders);
      }
    }

    if (url.pathname === "/api/channels" && request.method === "POST") {
      const { name, createdBy } = await request.json() as any;
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
      const offset = parseInt(url.searchParams.get("offset") || "0");
      const { results: messages } = await env.DB.prepare(
        `SELECT m.*, u.display_name, u.avatar_key as user_avatar
         FROM messages m
         LEFT JOIN users u ON m.username = u.username
         WHERE m.channel_id = ?
         ORDER BY m.timestamp DESC LIMIT 25 OFFSET ?`
      ).bind(channelId, offset).all() as { results: any[] };

      const totalCount = await env.DB.prepare(
        "SELECT COUNT(*) as count FROM messages WHERE channel_id = ?"
      ).bind(channelId).first<{ count: number }>();

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
      return corsResponse({
        messages: messages.reverse(),
        offset: offset,
        hasMore: offset + 25 < (totalCount?.count || 0),
        total: totalCount?.count || 0
      }, 200, corsHeaders);
    }

    if (url.pathname === "/api/search" && request.method === "POST") {
      const { query, username: searchUser, channelId, startDate, endDate, offset = 0 } = await request.json() as any;

      let countSql = `SELECT COUNT(*) as count FROM messages m
                    LEFT JOIN channels c ON m.channel_id = c.id
                    LEFT JOIN users u ON m.username = u.username WHERE 1=1`;
      const countParams = [];

      let sql = `SELECT m.*, c.name as channel_name, u.display_name, u.avatar_key as user_avatar FROM messages m
                 LEFT JOIN channels c ON m.channel_id = c.id LEFT JOIN users u ON m.username = u.username WHERE 1=1`;
      const params = [];

      if (query && query.trim()) {
        const searchCondition = " AND (m.message LIKE ? OR m.link_title LIKE ?)";
        const searchTerm = `%${query.trim()}%`;
        sql += searchCondition;
        countSql += searchCondition;
        params.push(searchTerm, searchTerm);
        countParams.push(searchTerm, searchTerm);
      }
      if (searchUser && searchUser.trim()) {
        sql += " AND m.username LIKE ?";
        countSql += " AND m.username LIKE ?";
        params.push(`%${searchUser.trim()}%`);
        countParams.push(`%${searchUser.trim()}%`);
      }
      if (channelId && channelId !== "all") {
        sql += " AND m.channel_id = ?";
        countSql += " AND m.channel_id = ?";
        params.push(channelId);
        countParams.push(channelId);
      }
      if (startDate) {
        sql += " AND m.timestamp >= ?";
        countSql += " AND m.timestamp >= ?";
        params.push(new Date(startDate).getTime());
        countParams.push(new Date(startDate).getTime());
      }
      if (endDate) {
        sql += " AND m.timestamp <= ?";
        countSql += " AND m.timestamp <= ?";
        params.push(new Date(endDate).getTime());
        countParams.push(new Date(endDate).getTime());
      }

      sql += " ORDER BY m.timestamp DESC LIMIT 100 OFFSET ?";
      countSql += " ORDER BY m.timestamp DESC";
      params.push(offset);

      const { results } = await env.DB.prepare(sql).bind(...params).all();

      const totalCountResult = await env.DB.prepare(countSql).bind(...countParams).first<{ count: number }>();

      return corsResponse({
        results,
        offset,
        hasMore: offset + 100 < (totalCountResult?.count || 0),
        total: totalCountResult?.count || 0
      }, 200, corsHeaders);
    }

    if (url.pathname === "/api/push/register" && request.method === "POST") {
      const { username, token, platform } = await request.json() as any;
      if (!username || !token) return corsResponse("Missing fields", 400, corsHeaders);

      try {
        await env.DB.prepare(
          "INSERT INTO push_tokens (username, token, platform, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(username, token) DO UPDATE SET platform = ?, updated_at = ?"
        ).bind(username, token, platform || "web", Date.now(), platform || "web", Date.now()).run();
        return corsResponse({ success: true }, 200, corsHeaders);
      } catch (e: any) {
        console.error("Push register error:", e);
        return corsResponse("Internal error", 500, corsHeaders);
      }
    }

    if (url.pathname === "/api/push/unregister" && request.method === "POST") {
      const { username, token } = await request.json() as any;
      if (!username || !token) return corsResponse("Missing fields", 400, corsHeaders);

      try {
        await env.DB.prepare("DELETE FROM push_tokens WHERE username = ? AND token = ?")
          .bind(username, token).run();
        return corsResponse({ success: true }, 200, corsHeaders);
      } catch (e: any) {
        console.error("Push unregister error:", e);
        return corsResponse("Internal error", 500, corsHeaders);
      }
    }

    if (url.pathname === "/api/notifications/settings" && request.method === "GET") {
      const username = url.searchParams.get("username");
      if (!username) return corsResponse("Username required", 400, corsHeaders);
      
      const { results } = await env.DB.prepare(
        "SELECT channel_id, level FROM notification_settings WHERE username = ?"
      ).bind(username).all();
      
      return corsResponse(results, 200, corsHeaders);
    }

    if (url.pathname === "/api/notifications/settings" && request.method === "POST") {
      const { username, channelId, level } = await request.json() as any;
      if (!username || !channelId) return corsResponse("Missing fields", 400, corsHeaders);
      
      if (level !== undefined) {
        await env.DB.prepare(
          "INSERT INTO notification_settings (username, channel_id, level, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(username, channel_id) DO UPDATE SET level = ?, updated_at = ?"
        ).bind(username, channelId, level, Date.now(), level, Date.now()).run();
      }
      
      return corsResponse({ success: true }, 200, corsHeaders);
    }

    if (url.pathname === "/api/upload/check" && request.method === "GET") {
      const hash = url.searchParams.get("hash");
      if (!hash) return corsResponse("Hash required", 400, corsHeaders);
      
      const key = `file-${hash}`;
      const existing = await env.BUCKET.head(key);
      
      if (existing) {
        // Return basic metadata if found. 
        // Note: filename isn't stored in R2 metadata here for simplicity, 
        // but we can return the key so the client knows we have it.
        return corsResponse({ exists: true, key }, 200, corsHeaders);
      }
      return corsResponse({ exists: false }, 200, corsHeaders);
    }

    if (url.pathname === "/api/upload" && request.method === "POST") {
      try {
        const formData = await request.formData();
        const file = formData.get("file") as File;
        const username = formData.get("username") as string;

        if (!file || !username) {
          return corsResponse("Missing file or username", 400, corsHeaders);
        }

        // Calculate SHA-256 Hash
        const arrayBuffer = await file.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
        
        const key = `file-${hashHex}`;

        // Check if exists
        const existing = await env.BUCKET.head(key);
        if (!existing) {
          await env.BUCKET.put(key, arrayBuffer, {
            httpMetadata: {
              contentType: file.type,
            },
            customMetadata: {
              originalName: file.name,
              uploadedBy: username
            }
          });
        }

        return corsResponse({
          name: file.name,
          type: file.type,
          size: file.size,
          key: key
        }, 201, corsHeaders);
      } catch (e: any) {
        console.error("Upload error:", e);
        return corsResponse("Upload failed", 500, corsHeaders);
      }
    }

    if (url.pathname === "/chat") {
      const chatUrl = new URL("/chat.html", url.origin);
      return await env.ASSETS.fetch(new Request(chatUrl.toString(), request));
    }

    try {
      const response = await env.ASSETS.fetch(request);
      if (response.status === 404 && !url.pathname.startsWith("/api/") && !url.pathname.includes(".")) {
        const indexUrl = new URL("/index.html", url.origin);
        return await env.ASSETS.fetch(new Request(indexUrl.toString(), request));
      }
      return response;
    } catch {
      return corsResponse("Not Found", 404, corsHeaders);
    }
  },
};


export { ChatRoom };
