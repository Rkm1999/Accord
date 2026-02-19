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
  JWT_SECRET: string;
}


async function legacyHashPassword(password: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

function generateSalt(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return [...array].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const passwordBuffer = new TextEncoder().encode(password);
  const saltBuffer = new TextEncoder().encode(salt);
  
  const baseKey = await crypto.subtle.importKey(
    "raw",
    passwordBuffer,
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );
  
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBuffer,
      iterations: 100000,
      hash: "SHA-256"
    },
    baseKey,
    256
  );
  
  return [...new Uint8Array(derivedBits)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function signJWT(payload: any, secret: string): Promise<string> {
  if (!secret) {
    console.error("JWT_SECRET is missing or empty!");
    secret = "default-dev-secret-unsafe"; 
  }
  const encoder = new TextEncoder();
  const header = { alg: "HS256", typ: "JWT" };
  
  const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const encodedPayload = btoa(JSON.stringify({
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
  })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  
  const data = encoder.encode(`${encodedHeader}.${encodedPayload}`);
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signature = await crypto.subtle.sign("HMAC", key, data);
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  
  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

async function verifyJWT(token: string, secret: string): Promise<any | null> {
  if (!secret) {
    console.error("JWT_SECRET is missing or empty!");
    secret = "default-dev-secret-unsafe";
  }
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    
    const [header, payload, signature] = parts;
    const encoder = new TextEncoder();
    const data = encoder.encode(`${header}.${payload}`);
    
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    
    const sigBytes = Uint8Array.from(atob(signature.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
    const isValid = await crypto.subtle.verify("HMAC", key, sigBytes, data);
    
    if (!isValid) return null;
    
    const decodedPayload = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    if (decodedPayload.exp && decodedPayload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    
    return decodedPayload;
  } catch {
    return null;
  }
}

function getCookie(request: Request, name: string): string | null {
  const cookieString = request.headers.get("Cookie");
  if (!cookieString) return null;
  const cookies = cookieString.split(";").map(c => c.trim());
  for (const cookie of cookies) {
    if (cookie.startsWith(`${name}=`)) {
      return cookie.substring(name.length + 1);
    }
  }
  return null;
}

async function authenticate(request: Request, env: Env): Promise<string | null> {
  const token = getCookie(request, "token");
  if (!token) return null;
  const payload = await verifyJWT(token, env.JWT_SECRET);
  return payload ? payload.username : null;
}

async function checkRateLimit(request: Request, env: Env): Promise<boolean> {
  const ip = request.headers.get("cf-connecting-ip") || "127.0.0.1";
  
  // Bypass rate limiting for localhost/loopback in dev
  if (ip === "127.0.0.1" || ip === "::1" || ip === "unknown") {
    return true; 
  }

  const now = Date.now();
  const windowMs = 1 * 60 * 1000; // 1 minute window for dev/testing
  const maxAttempts = 100;

  const record: any = await env.DB.prepare("SELECT * FROM auth_attempts WHERE ip = ?").bind(ip).first();

  if (record) {
    if (now - record.last_attempt > windowMs) {
      // Reset window
      await env.DB.prepare("UPDATE auth_attempts SET attempts = 1, last_attempt = ? WHERE ip = ?").bind(now, ip).run();
      return true;
    }
    if (record.attempts >= maxAttempts) {
      return false;
    }
    await env.DB.prepare("UPDATE auth_attempts SET attempts = attempts + 1, last_attempt = ? WHERE ip = ?").bind(now, ip).run();
  } else {
    await env.DB.prepare("INSERT INTO auth_attempts (ip, attempts, last_attempt) VALUES (?, 1, ?)").bind(ip, now).run();
  }
  return true;
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
  const origin = request.headers.get("Origin");
  // Update this list with your production domain
  const allowedOrigins = ["http://localhost:5173", "http://localhost:3000", "https://accord-chat.pages.dev"];
  
  const headers = new Headers();
  if (origin && allowedOrigins.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  
  headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Max-Age", "86400");

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  return headers;
}

function corsResponse(body: any, status: number = 200, extraHeaders?: Headers) {
    const headers = extraHeaders || new Headers();
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
      let username = await authenticate(request, env);
      console.log(`WS Handshake: Authenticated via cookie: ${!!username}`);
      
      // Fallback: Check query params for token (useful for cross-origin WebSockets in dev)
      if (!username) {
        const token = url.searchParams.get("token");
        console.log(`WS Handshake: Token in query params: ${!!token}`);
        if (token) {
          const payload = await verifyJWT(token, env.JWT_SECRET);
          username = payload?.username || null;
          console.log(`WS Handshake: Authenticated via token: ${!!username}`);
        }
      }

      if (!username) {
        console.warn("WS Handshake: Unauthorized");
        return corsResponse("Unauthorized", 401, corsHeaders);
      }
      
      const stub = env.CHAT_ROOM.getByName("main-room");
      // Re-construct request with authenticated username in searchParams for the DO
      const newUrl = new URL(request.url);
      newUrl.searchParams.set("username", username);
      return stub.fetch(new Request(newUrl.toString(), request));
    }

    if (url.pathname.startsWith("/api/file/")) {
      const authUser = await authenticate(request, env);
      if (!authUser) return corsResponse("Unauthorized", 401, corsHeaders);

      const parts = url.pathname.split("/");
      // Path format: /api/file/{key} or /api/file/{key}/{filename}
      const key = decodeURIComponent(parts[3]); 
      if (!key) return corsResponse("File key required", 400, corsHeaders);

      const object = await env.BUCKET.get(key);
      if (!object) return corsResponse("File not found", 404, corsHeaders);

      const headers = new Headers(corsHeaders);
      object.writeHttpMetadata(headers);
      
      // Security: Prevent Stored XSS by forcing downloads for unsafe types
      // and setting a strict CSP.
      const contentType = headers.get("Content-Type") || "";
      const safeTypes = [
        'image/png', 'image/jpeg', 'image/gif', 'image/webp',
        'video/mp4', 'video/webm', 'video/ogg',
        'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm'
      ];

      // Even for safe types, we restrict execution context
      headers.set("Content-Security-Policy", "default-src 'none'; sandbox");
      headers.set("X-Content-Type-Options", "nosniff");

      const filename = url.searchParams.get("filename") || (parts.length > 4 ? decodeURIComponent(parts[4]) : null);
      
      if (filename || !safeTypes.includes(contentType)) {
        const downloadName = filename || "download";
        headers.set("Content-Disposition", `attachment; filename="${encodeURIComponent(downloadName)}"`);
        // If it's not a safe type, we treat it as binary stream to prevent browser execution
        if (!safeTypes.includes(contentType)) {
          headers.set("Content-Type", "application/octet-stream");
        }
      }
      
      return new Response(object.body, { headers });
    }

    if (url.pathname === "/api/auth/register" && request.method === "POST") {
      // if (!(await checkRateLimit(request, env))) return corsResponse("Too many attempts. Try again later.", 429, corsHeaders);
      const { username, password } = await request.json() as any;
      if (!username || !password) return corsResponse("Missing fields", 400, corsHeaders);
      if (username.length > 32 || password.length > 128) return corsResponse("Input too long", 400, corsHeaders);

      const recoveryKey = generateRecoveryKey();
      const salt = generateSalt();
      const passwordHash = await hashPassword(password, salt);
      const recoveryKeyHash = await hashPassword(recoveryKey, salt);

      try {
        await env.DB.prepare(
          "INSERT INTO users (username, password_hash, display_name, recovery_key_hash, salt, hash_version, created_at) VALUES (?, ?, ?, ?, ?, 2, ?)"
        ).bind(username, passwordHash, username, recoveryKeyHash, salt, Date.now()).run();
        
        // Notify Durable Object to broadcast new user registration
        const stub = env.CHAT_ROOM.getByName("main-room");
        await stub.fetch(new Request("http://durable/refresh_users"));

        const token = await signJWT({ username }, env.JWT_SECRET);
        const headers = new Headers(corsHeaders);
        headers.append("Set-Cookie", `token=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${24 * 60 * 60}`);

        return corsResponse({ success: true, recoveryKey, token }, 201, headers);
      } catch (e: any) {
        console.error("Register error:", e);
        return corsResponse("Username taken", 409, corsHeaders);
      }
    }

    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      // if (!(await checkRateLimit(request, env))) return corsResponse("Too many attempts. Try again later.", 429, corsHeaders);
      const { username, password } = await request.json() as any;
      const user: any = await env.DB.prepare("SELECT * FROM users WHERE username = ?").bind(username).first();
      
      if (!user) return corsResponse("Invalid credentials", 401, corsHeaders);
      
      let isValid = false;
      const hashVersion = user.hash_version || 1;

      if (hashVersion === 1) {
        // Legacy SHA-256
        const legacyHash = await legacyHashPassword(password);
        if (user.password_hash === legacyHash) {
          isValid = true;
          // Migrate to PBKDF2
          const newSalt = generateSalt();
          const newHash = await hashPassword(password, newSalt);
          await env.DB.prepare("UPDATE users SET password_hash = ?, salt = ?, hash_version = 2 WHERE username = ?")
            .bind(newHash, newSalt, username).run();
        }
      } else if (hashVersion === 2) {
        // PBKDF2
        const currentHash = await hashPassword(password, user.salt);
        if (user.password_hash === currentHash) {
          isValid = true;
        }
      }

      if (!isValid) return corsResponse("Invalid credentials", 401, corsHeaders);

      const token = await signJWT({ username }, env.JWT_SECRET);
      const headers = new Headers(corsHeaders);
      headers.append("Set-Cookie", `token=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${24 * 60 * 60}`);

      return corsResponse({ 
        username: user.username, 
        displayName: user.display_name,
        avatarKey: user.avatar_key,
        token: token
      }, 200, headers);
    }

    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      const headers = new Headers(corsHeaders);
      headers.append("Set-Cookie", "token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
      return corsResponse({ success: true }, 200, headers);
    }

    if (url.pathname === "/api/auth/reset-password" && request.method === "POST") {
      // if (!(await checkRateLimit(request, env))) return corsResponse("Too many attempts. Try again later.", 429, corsHeaders);
      const { username, recoveryKey, newPassword } = await request.json() as any;
      const user: any = await env.DB.prepare("SELECT recovery_key_hash, salt, hash_version FROM users WHERE username = ?").bind(username).first();
      
      if (!user) return corsResponse("Invalid user", 404, corsHeaders);
      
      const hashVersion = user.hash_version || 1;
      let isRecoveryValid = false;

      if (hashVersion === 1) {
        const legacyRecHash = await legacyHashPassword(recoveryKey.toUpperCase());
        if (user.recovery_key_hash === legacyRecHash) isRecoveryValid = true;
      } else {
        const currentRecHash = await hashPassword(recoveryKey.toUpperCase(), user.salt);
        if (user.recovery_key_hash === currentRecHash) isRecoveryValid = true;
      }

      if (!isRecoveryValid) {
        return corsResponse("Invalid recovery key", 401, corsHeaders);
      }

      const newSalt = generateSalt();
      const newPasswordHash = await hashPassword(newPassword, newSalt);
      // When resetting password, we also need a new recovery key hash using the new salt
      // But wait, the recovery key stays the same unless regenerated? 
      // Actually, it's better to force a new salt for everything.
      // For simplicity in reset-password, we'll keep the SAME recovery key but re-hash it with new salt
      // OR just generate a new one? The UI doesn't expect a new recovery key here.
      // We'll re-hash the EXISTING recovery key with the new salt.
      const newRecoveryHash = await hashPassword(recoveryKey.toUpperCase(), newSalt);

      await env.DB.prepare("UPDATE users SET password_hash = ?, recovery_key_hash = ?, salt = ?, hash_version = 2 WHERE username = ?")
        .bind(newPasswordHash, newRecoveryHash, newSalt, username).run();

      return corsResponse({ success: true }, 200, corsHeaders);
    }

    if (url.pathname === "/api/user/profile" && request.method === "POST") {
      const authUser = await authenticate(request, env);
      if (!authUser) return corsResponse("Unauthorized", 401, corsHeaders);

      const { displayName, avatarImage, generateNewRecoveryKey } = await request.json() as any;
      if (typeof displayName !== 'string' || displayName.length > 32) {
        return corsResponse("Invalid display name", 400, corsHeaders);
      }
      const username = authUser;
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
          const user: any = await env.DB.prepare("SELECT salt FROM users WHERE username = ?").bind(username).first();
          let salt = user?.salt;
          if (!salt) {
            salt = generateSalt();
          }

          newRecoveryKey = generateRecoveryKey();
          const newHash = await hashPassword(newRecoveryKey, salt);
          await env.DB.prepare("UPDATE users SET recovery_key_hash = ?, salt = ?, hash_version = 2 WHERE username = ?")
            .bind(newHash, salt, username).run();
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
      const authUser = await authenticate(request, env);
      if (!authUser) return corsResponse("Unauthorized", 401, corsHeaders);

      const { results } = await env.DB.prepare(
        "SELECT username, display_name, avatar_key FROM users ORDER BY display_name ASC"
      ).all();
      return corsResponse(results, 200, corsHeaders);
    }

    if (url.pathname === "/api/emojis" && request.method === "GET") {
      const authUser = await authenticate(request, env);
      if (!authUser) return corsResponse("Unauthorized", 401, corsHeaders);

      const { results } = await env.DB.prepare(
        "SELECT id, name, file_key, created_by, created_at FROM custom_emojis ORDER BY name ASC"
      ).all();
      return corsResponse(results, 200, corsHeaders);
    }

    if (url.pathname === "/api/emojis" && request.method === "POST") {
      const authUser = await authenticate(request, env);
      if (!authUser) return corsResponse("Unauthorized", 401, corsHeaders);

      const { name, image } = await request.json() as any;
      if (!name || !image) return corsResponse("Missing required fields", 400, corsHeaders);

      const username = authUser;
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
      const authUser = await authenticate(request, env);
      if (!authUser) return corsResponse("Unauthorized", 401, corsHeaders);

      const { results } = await env.DB.prepare("SELECT id, name, created_by, created_at, kind FROM channels WHERE type = 'public' ORDER BY id ASC").all();
      return corsResponse(results, 200, corsHeaders);
    }

    if (url.pathname === "/api/dms" && request.method === "GET") {
      const authUser = await authenticate(request, env);
      if (!authUser) return corsResponse("Unauthorized", 401, corsHeaders);

      const username = authUser;
      const { results } = await env.DB.prepare(
        `SELECT c.id, c.created_at, c.kind, u.username as other_username, u.display_name as other_display_name, u.avatar_key as other_avatar_key
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
      const authUser = await authenticate(request, env);
      if (!authUser) return corsResponse("Unauthorized", 401, corsHeaders);

      const { targetUsername } = await request.json() as any;
      if (!targetUsername) return corsResponse("Missing target user", 400, corsHeaders);

      const username = authUser;
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
          "INSERT INTO channels (name, created_by, created_at, type, kind) VALUES (?, ?, ?, 'dm', 'text')"
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
      const authUser = await authenticate(request, env);
      if (!authUser) return corsResponse("Unauthorized", 401, corsHeaders);

      const { name, kind = 'text' } = await request.json() as any;
      if (!name || typeof name !== 'string' || name.length > 50) return corsResponse("Invalid name", 400, corsHeaders);

      const createdBy = authUser;
      try {
        const result = await env.DB.prepare(
          "INSERT INTO channels (name, created_by, created_at, kind) VALUES (?, ?, ?, ?)"
        ).bind(name, createdBy, Date.now(), kind).run();
        const channel = await env.DB.prepare("SELECT id, name, created_by, created_at, kind FROM channels WHERE id = ?")
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
      const authUser = await authenticate(request, env);
      if (!authUser) return corsResponse("Unauthorized", 401, corsHeaders);

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
      const authUser = await authenticate(request, env);
      if (!authUser) return corsResponse("Unauthorized", 401, corsHeaders);

      const channelId = url.searchParams.get("channelId") || "1";
      const before = url.searchParams.get("before");
      
      let query = `
        SELECT m.*, u.display_name, u.avatar_key as user_avatar
        FROM messages m
        LEFT JOIN users u ON m.username = u.username
        WHERE m.channel_id = ?
      `;
      const params: any[] = [channelId];

      if (before) {
        query += " AND m.timestamp < ? ";
        params.push(parseInt(before));
      }

      query += " ORDER BY m.timestamp DESC LIMIT 26 ";

      const result: any = await env.DB.prepare(query).bind(...params).all();

      let messages = result.results;
      console.log(`[D1 READ] History API: ${result.meta.rows_read || 0} rows read (cursor: ${before || 'start'})`);

      const hasMore = messages.length > 25;
      if (hasMore) {
        messages = messages.slice(0, 25);
      }

      if (messages.length > 0) {
        const messageIds = messages.map((m: any) => m.id);
        const placeholders = messageIds.map(() => '?').join(',');
        const reactResult: any = await env.DB.prepare(
          `SELECT message_id, emoji, username FROM reactions WHERE message_id IN (${placeholders})`
        ).bind(...messageIds).all();
        
        console.log(`[D1 READ] Reactions API: ${reactResult.meta.rows_read || 0} rows read`);

        messages.forEach((m: any) => {
          m.reactions = reactResult.results.filter((r: any) => r.message_id === m.id);
        });
      }
      return corsResponse({
        messages: messages.reverse(),
        before: before,
        hasMore: hasMore
      }, 200, corsHeaders);
    }

    if (url.pathname === "/api/search" && request.method === "POST") {
      const authUser = await authenticate(request, env);
      if (!authUser) return corsResponse("Unauthorized", 401, corsHeaders);

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
      const authUser = await authenticate(request, env);
      if (!authUser) return corsResponse("Unauthorized", 401, corsHeaders);

      const { token, platform } = await request.json() as any;
      if (!token) return corsResponse("Missing fields", 400, corsHeaders);

      const username = authUser;
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
      const authUser = await authenticate(request, env);
      if (!authUser) return corsResponse("Unauthorized", 401, corsHeaders);

      const { token } = await request.json() as any;
      if (!token) return corsResponse("Missing fields", 400, corsHeaders);

      const username = authUser;
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
      const authUser = await authenticate(request, env);
      if (!authUser) return corsResponse("Unauthorized", 401, corsHeaders);

      const username = authUser;
      const { results } = await env.DB.prepare(
        "SELECT channel_id, level FROM notification_settings WHERE username = ?"
      ).bind(username).all();
      
      return corsResponse(results, 200, corsHeaders);
    }

    if (url.pathname === "/api/notifications/settings" && request.method === "POST") {
      const authUser = await authenticate(request, env);
      if (!authUser) return corsResponse("Unauthorized", 401, corsHeaders);

      const { channelId, level } = await request.json() as any;
      if (!channelId) return corsResponse("Missing fields", 400, corsHeaders);
      
      const username = authUser;
      if (level !== undefined) {
        await env.DB.prepare(
          "INSERT INTO notification_settings (username, channel_id, level, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(username, channel_id) DO UPDATE SET level = ?, updated_at = ?"
        ).bind(username, channelId, level, Date.now(), level, Date.now()).run();
      }
      
      return corsResponse({ success: true }, 200, corsHeaders);
    }

    if (url.pathname === "/api/upload/check" && request.method === "GET") {
      const authUser = await authenticate(request, env);
      if (!authUser) return corsResponse("Unauthorized", 401, corsHeaders);

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
      const authUser = await authenticate(request, env);
      if (!authUser) return corsResponse("Unauthorized", 401, corsHeaders);

      try {
        const formData = await request.formData();
        const file = formData.get("file") as unknown as File;
        const username = authUser;

        if (!file) {
          return corsResponse("Missing file", 400, corsHeaders);
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

    // React SPA Routing
    if (url.pathname === "/chat" || (url.pathname === "/" && !url.pathname.includes("."))) {
      const indexUrl = new URL("/index.html", url.origin);
      const res = await env.ASSETS.fetch(new Request(indexUrl.toString(), request));
      const headers = new Headers(res.headers);
      headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' wss: https:;");
      return new Response(res.body, { ...res, headers });
    }

    try {
      const response = await env.ASSETS.fetch(request);
      // Fallback for sub-routes
      if (response.status === 404 && !url.pathname.startsWith("/api/") && !url.pathname.includes(".")) {
        const indexUrl = new URL("/index.html", url.origin);
        const res = await env.ASSETS.fetch(new Request(indexUrl.toString(), request));
        const headers = new Headers(res.headers);
        headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' wss: https:;");
        return new Response(res.body, { ...res, headers });
      }
      return response;
    } catch {
      return corsResponse("Not Found", 404, corsHeaders);
    }

  },
};


export { ChatRoom };
