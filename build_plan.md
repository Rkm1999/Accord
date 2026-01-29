Phase 1: The "Iron Skeleton" (Infrastructure)
Goal: Initialize the Cloudflare ecosystem and ensure all bindings can talk to each other.
Monorepo Setup:
Initialize pnpm workspaces: /apps/api, /apps/web, /packages/shared.
Provision Resources (wrangler.toml):
D1: Create chat_db.
KV: Create PRESENCE_KV (for friend status) and PREVIEW_KV (for link caches).
Queues: Create message_persistence_queue.
R2: Create chat_media.
Database Migration (Init):
Create channels table: id (TEXT), name (TEXT), type (public/private).
Create messages table: id, channel_id, user_id, content, created_at.
Phase 2: Identity & Authentication (The New Layer)
Goal: Secure the platform. No user ID = No chat.
Schema Update (Users):
Create users table in D1:
SQL

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);
Auth Worker (Control Plane):
Crypto Utils: Implement a helper using crypto.subtle (PBKDF2) for password hashing. Avoid bcryptjs as it is slow on the Edge.
POST /auth/register: Validate input $\rightarrow$ Check D1 for duplicates $\rightarrow$ Hash password $\rightarrow$ Insert User $\rightarrow$ Return JWT.
POST /auth/login: specific User lookup $\rightarrow$ Verify Hash $\rightarrow$ Sign JWT (using Hono/jwt).
API Middleware:
Create a Hono middleware authMiddleware that verifies the Authorization: Bearer <token> header and injects c.var.user into the context for all protected API routes.
Phase 3: The Real-Time Engine (Authenticated)
Goal: Secure WebSocket connections via Durable Objects.
The Handshake (Critical):
Modify the Durable Object fetch() handler.
Logic: The browser cannot send custom headers on a WebSocket handshake. Therefore, the client must send the token in the URL: wss://api.app.com/room/123?token=ey....
The DO validates this token before upgrading the connection (see code below).
Connection State:
Store the user_id and username inside the WebSocket attachment (ws.serializeAttachment(...)) so every message sent by this socket is automatically tagged with the correct user.
Typing Indicators:
Implement broadcast("USER_TYPING", { userId: ... }).
Phase 4: Persistence Pipeline (Queues)
Goal: Decouple real-time speed from database limits.
Queue Producer (Inside DO):
When a message arrives:
Broadcast to users (Instant).
await env.QUEUE.send({ ...msg_payload }) (Async).
Queue Consumer (Worker):
Batch insert logic: INSERT INTO messages VALUES (?), (?), (?).
History API:
Implement GET /channels/:id/messages (Protected by authMiddleware) to fetch the last 50 messages from D1.
Phase 5: Global Awareness (KV Presence)
Goal: "Is my friend online?"
Heartbeat API:
Frontend loops every 30s: POST /user/heartbeat.
Worker: env.PRESENCE_KV.put("user:123", "online", { expirationTtl: 45 }).
Friend List:
GET /friends returns list of friends + their KV status.
Phase 6: Enrichment (Media & Unfurl)
Goal: Rich content support.
Unfurl Worker: POST /utils/preview with KV caching.
R2 Uploads: Presigned URL generation for secure uploads.
Technical Implementation: The Durable Object Handshake
This code solves the "How do I secure the WebSocket?" problem. It goes inside your ChatRoom class.
TypeScript

// apps/api/src/durable-objects/ChatRoom.tsimport { DurableObject } from "cloudflare:workers";import { verify } from "hono/jwt"; // Using Hono's JWT helperexport class ChatRoom extends DurableObject {
  // In-memory state for active sessions
  sessions = new Set<WebSocket>();

  async fetch(request: Request) {
    const url = new URL(request.url);

    // 1. Check for WebSocket Upgrade Header
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    // 2. AUTHENTICATION: Extract Token from Query Param
    // Client connects via: wss://api.app.com/room/123?token=ey...
    const token = url.searchParams.get("token");
    if (!token) {
      return new Response("Missing Auth Token", { status: 401 });
    }

    let payload;
    try {
      // Verify JWT using the secret from env
      payload = await verify(token, this.env.JWT_SECRET);
    } catch (err) {
      return new Response("Invalid Auth Token", { status: 403 });
    }

    // 3. Upgrade the connection
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // 4. Handle Hibernation & Metadata
    // We attach the User ID to the socket so we know who sent what later
    this.ctx.acceptWebSocket(server, [payload.sub as string]); 
    
    // Store user info (optional, for roster logic)
    // You might also want to store username here if it's in the JWT
    
    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    // Retrieve the User ID we attached during the handshake
    const userId = this.ctx.getTags(ws)[0];
    
    const data = JSON.parse(message as string);

    // Broadcast logic...
    this.broadcast({
      ...data,
      senderId: userId // Securely stamp the sender ID
    });
    
    // Queue logic for D1 persistence...
    await this.env.MESSAGE_QUEUE.send({ ...data, senderId: userId });
  }

  broadcast(message: any) {
    const msgString = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      ws.send(msgString);
    }
  }
}

