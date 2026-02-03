# Realtime Chat Website - Cloudflare Services Research

## Project Overview
Build a realtime chat website with the following requirements:
- Users enter username on landing page (no registration required)
- Chat page shows: connected users, chat history, and chat input
- Deploy locally using Cloudflare Wrangler
- Use Cloudflare Pages, Workers, Durable Objects, and D1

## Architecture

```
┌─────────────────┐
│  Cloudflare      │
│     Pages        │  (Frontend - HTML/CSS/JS)
└────────┬────────┘
         │ HTTP/WebSocket
         ▼
┌─────────────────┐
│  Cloudflare      │
│     Worker       │  (API & Routing)
└────────┬────────┘
         │
         ├───► Durable Object (WebSocket connections & real-time state)
         │
         └───► D1 Database (Chat history)
```

## Services Overview

### 1. Cloudflare Pages
**Purpose:** Frontend hosting for the chat interface

**Key Features:**
- Instant deployment to Cloudflare's global network
- Supports static assets and Pages Functions
- Can be deployed via Git integration or Direct Upload
- Integrates with Workers and other Cloudflare services via bindings

**For this project:**
- Host HTML, CSS, and JavaScript files for the chat UI
- Use Pages Functions (optional) to handle API endpoints

### 2. Cloudflare Workers
**Purpose:** Backend API and WebSocket routing

**Key Features:**
- Serverless execution environment
- Global deployment with low latency
- Supports TypeScript, JavaScript, Python, Rust
- Can bind to other Cloudflare services

**For this project:**
- Handle HTTP requests (API endpoints)
- Route WebSocket connections to Durable Objects
- Serve as the entry point for client connections

### 3. Cloudflare Durable Objects
**Purpose:** Real-time WebSocket connection management

**Key Features:**
- Stateful serverless applications
- Manages WebSocket connections for multiple clients
- Each DO instance has globally unique name
- Built-in SQLite storage for persistence
- Supports WebSocket Hibernation to reduce costs

**For this project:**
- Maintain active WebSocket connections
- Track connected users
- Broadcast messages to all connected clients
- Store connection state per user

**Why Durable Objects for Chat:**
- Can coordinate connections among multiple clients
- Provides strongly consistent storage
- One DO can handle thousands of WebSocket connections
- Perfect for chat rooms, multiplayer games, collaborative editing

### 4. Cloudflare D1
**Purpose:** Persistent chat history storage

**Key Features:**
- Serverless SQL database (SQLite semantics)
- Fast global queries
- Built-in disaster recovery with Time Travel
- Supports migrations
- No egress bandwidth fees

**For this project:**
- Store chat messages with timestamps
- Query chat history when users join
- Persist messages across sessions

## Development Setup

### Prerequisites
1. Node.js 16.17.0 or later installed
2. Cloudflare account (free tier works)
3. Wrangler CLI installed

### Installing Wrangler

**Recommended: Install locally per project**
```bash
npm install -D wrangler@latest
# or
yarn add -D wrangler@latest
# or
pnpm add -D wrangler@latest
```

**Verify installation:**
```bash
npx wrangler --version
```

### Project Structure

```
chat-app/
├── public/                 # Pages static assets
│   ├── index.html          # Landing page (username input)
│   ├── chat.html           # Chat page
│   ├── style.css           # Styles
│   └── app.js             # Frontend JavaScript
├── functions/              # Pages Functions (optional)
│   └── [[path]].js       # API endpoints
├── worker/                 # Worker with Durable Object
│   ├── src/
│   │   └── index.ts       # Worker entry point
│   └── wrangler.toml      # Worker config
├── database/
│   └── migrations/        # D1 migration files
│       └── 0001_init.sql
└── wrangler.toml           # Pages config
```

## Configuration

### Pages Configuration (wrangler.toml)
```toml
name = "chat-app"
compatibility_date = "2024-01-01"

# Bind D1 database for chat history
[[d1_databases]]
binding = "DB"
database_name = "chat-history"
database_id = "<DATABASE_ID>"

# Bind Worker via service binding
[[services]]
binding = "BACKEND"
service = "chat-worker"
entrypoint = "Worker"
```

### Worker Configuration (worker/wrangler.toml)
```toml
name = "chat-worker"
main = "src/index.ts"
compatibility_date = "2024-01-01"

# Durable Object binding
[[durable_objects.bindings]]
name = "CHAT_ROOM"
class_name = "ChatRoom"

# D1 database binding
[[d1_databases]]
binding = "DB"
database_name = "chat-history"
database_id = "<DATABASE_ID>"

# Migrations for Durable Object
[[migrations]]
tag = "v1"
new_sqlite_classes = ["ChatRoom"]
```

## Implementation Guide

### 1. Database Schema (D1)

**Migration file: 0001_init.sql**
```sql
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    message TEXT NOT NULL,
    timestamp INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_timestamp ON messages(timestamp);
```

**Apply migration locally:**
```bash
npx wrangler d1 execute chat-history --local --file=./database/migrations/0001_init.sql
```

**Apply migration to production:**
```bash
npx wrangler d1 execute chat-history --remote --file=./database/migrations/0001_init.sql
```

### 2. Durable Object Implementation

**Purpose:** Manage WebSocket connections and broadcast messages

**Key Methods:**
- `fetch()`: Handle WebSocket upgrade requests
- `webSocketMessage()`: Receive messages from clients
- `webSocketClose()`: Handle disconnections
- `serializeAttachment()` / `deserializeAttachment()`: Persist per-connection state

**Example ChatRoom Durable Object:**

```typescript
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

  // Handle WebSocket connection
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const username = url.searchParams.get("username") || "Anonymous";

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Accept WebSocket with hibernation support
    this.ctx.acceptWebSocket(server);

    // Serialize per-connection state
    server.serializeAttachment({
      username,
      joinedAt: Date.now(),
    } as UserState);

    // Notify others of new user
    this.broadcastUserEvent("user_joined", username);

    // Send chat history to new user
    await this.sendChatHistory(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  // Handle incoming messages
  async webSocketMessage(ws: WebSocket, message: string) {
    const state = ws.deserializeAttachment() as UserState;
    const { username } = state;

    // Store message in D1
    await this.env.DB.prepare(
      "INSERT INTO messages (username, message, timestamp) VALUES (?, ?, ?)"
    )
      .bind(username, message, Date.now())
      .run();

    // Broadcast to all connected clients
    this.broadcastMessage(username, message);
  }

  // Handle disconnections
  async webSocketClose(ws: WebSocket) {
    const state = ws.deserializeAttachment() as UserState;
    this.broadcastUserEvent("user_left", state.username);
  }

  // Broadcast message to all connected clients
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

  // Broadcast user join/leave events
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

  // Send chat history to newly connected user
  private async sendChatHistory(ws: WebSocket) {
    const { results } = await this.env.DB.prepare(
      "SELECT username, message, timestamp FROM messages ORDER BY timestamp DESC LIMIT 50"
    ).all();

    const history = results.reverse(); // Oldest first
    ws.send(JSON.stringify({
      type: "history",
      messages: history,
    }));
  }
}
```

### 3. Worker Entry Point

**Purpose:** Route requests to Durable Object

```typescript
import { DurableObjectNamespace } from "cloudflare:workers";

export interface Env {
  CHAT_ROOM: DurableObjectNamespace<ChatRoom>;
  DB: D1Database;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade
    if (url.pathname === "/ws") {
      const username = url.searchParams.get("username");
      if (!username) {
        return new Response("Username required", { status: 400 });
      }

      // Get or create Durable Object instance
      const stub = env.CHAT_ROOM.getByName("main-room");
      return stub.fetch(request);
    }

    // API: Get connected users count
    if (url.pathname === "/api/users") {
      const stub = env.CHAT_ROOM.getByName("main-room");
      const response = await stub.fetch(request);
      return response;
    }

    // API: Get chat history
    if (url.pathname === "/api/history") {
      const { results } = await env.DB.prepare(
        "SELECT username, message, timestamp FROM messages ORDER BY timestamp DESC LIMIT 100"
      ).all();

      return Response.json(results.reverse());
    }

    return new Response("Not Found", { status: 404 });
  },
};
```

### 4. Frontend Implementation

**Landing Page (index.html):**
```html
<!DOCTYPE html>
<html>
<head>
  <title>Chat App - Join</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="container">
    <h1>Join Chat</h1>
    <form id="joinForm">
      <input type="text" id="username" placeholder="Enter your username" required>
      <button type="submit">Join Chat</button>
    </form>
  </div>
  <script src="app.js"></script>
</body>
</html>
```

**Chat Page (chat.html):**
```html
<!DOCTYPE html>
<html>
<head>
  <title>Chat App</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="container">
    <div class="sidebar">
      <h3>Connected Users</h3>
      <ul id="userList"></ul>
    </div>
    <div class="chat-area">
      <div id="chatHistory"></div>
      <form id="chatForm">
        <input type="text" id="message" placeholder="Type a message..." required>
        <button type="submit">Send</button>
      </form>
    </div>
  </div>
  <script src="chat.js"></script>
</body>
</html>
```

**Frontend JavaScript (app.js):**
```javascript
// Landing page logic
document.getElementById('joinForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value;
  localStorage.setItem('username', username);
  window.location.href = 'chat.html';
});
```

**Frontend JavaScript (chat.js):**
```javascript
const username = localStorage.getItem('username') || 'Anonymous';
const wsUrl = `wss://${window.location.host}/ws?username=${encodeURIComponent(username)}`;
let ws;

// Connect WebSocket
function connect() {
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('Connected to chat server');
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    switch (data.type) {
      case 'history':
        displayHistory(data.messages);
        break;
      case 'chat':
        displayMessage(data);
        break;
      case 'presence':
        updatePresence(data);
        break;
    }
  };

  ws.onclose = () => {
    console.log('Disconnected, reconnecting...');
    setTimeout(connect, 3000);
  };
}

function displayHistory(messages) {
  const chatHistory = document.getElementById('chatHistory');
  chatHistory.innerHTML = '';
  messages.forEach(msg => displayMessage(msg));
}

function displayMessage(data) {
  const chatHistory = document.getElementById('chatHistory');
  const time = new Date(data.timestamp).toLocaleTimeString();
  const msgEl = document.createElement('div');
  msgEl.className = 'message';
  msgEl.innerHTML = `
    <span class="time">${time}</span>
    <span class="username">${data.username}:</span>
    <span class="content">${data.message}</span>
  `;
  chatHistory.appendChild(msgEl);
  chatHistory.scrollTop = chatHistory.scrollHeight;
}

function updatePresence(data) {
  const userList = document.getElementById('userList');
  const countEl = document.getElementById('userCount');

  if (countEl) {
    countEl.textContent = `(${data.userCount} online)`;
  }

  // Update user list based on events
  if (data.event === 'user_joined') {
    // Add user to list
  } else if (data.event === 'user_left') {
    // Remove user from list
  }
}

// Send message
document.getElementById('chatForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('message');
  const message = input.value.trim();

  if (message && ws.readyState === WebSocket.OPEN) {
    ws.send(message);
    input.value = '';
  }
});

// Start connection
connect();
```

## Local Development

### 1. Create Projects

**Create Pages project:**
```bash
npm create cloudflare@latest chat-app
```

**Create Worker project:**
```bash
npm create cloudflare@latest chat-worker
```

### 2. Configure Bindings

**Create D1 database:**
```bash
npx wrangler d1 create chat-history
```

Update wrangler.toml files with the database ID returned.

### 3. Develop Locally

**Start Worker with Durable Object:**
```bash
cd worker
npx wrangler dev
```

**Start Pages with bindings:**
```bash
cd ../
npx wrangler pages dev public
```

**Note:** For local development with Durable Objects:
- Run `wrangler dev` in Worker directory first
- Run `wrangler pages dev` in a separate terminal
- The Durable Object runs locally with simulated storage

### 4. Test WebSocket Locally

Open browser to `http://localhost:8787` (default Pages dev port) and test the chat functionality.

## Deployment

### 1. Deploy Worker

```bash
cd worker
npx wrangler deploy
```

### 2. Deploy Pages

```bash
cd ../
npx wrangler pages deploy public
```

Or use Git integration for automatic deployments.

### 3. Verify Deployment

After deployment:
1. Test the username input page
2. Verify WebSocket connection
3. Test message sending and receiving
4. Check chat history persistence
5. Test multiple browser tabs (simulating multiple users)

## Advanced Features

### WebSocket Hibernation

Durable Objects support WebSocket Hibernation to reduce costs:
- Clients remain connected while DO sleeps
- Billable Duration charges pause during hibernation
- DO wakes up automatically on message receipt

**Implementation:**
- Use `this.ctx.acceptWebSocket(server)` instead of `server.accept()`
- Store per-connection state with `serializeAttachment()` and `deserializeAttachment()`
- Minimize work in constructor when using hibernation

### Multiple Chat Rooms

Create separate Durable Object instances for different rooms:
```typescript
const roomName = url.searchParams.get("room") || "general";
const stub = env.CHAT_ROOM.getByName(roomName);
```

### Rate Limiting

Implement rate limiting to prevent spam:
```typescript
const RATE_LIMIT = 10; // messages per minute
const userTimestamps = new Map<string, number[]>();

function checkRateLimit(username: string): boolean {
  const now = Date.now();
  const timestamps = userTimestamps.get(username) || [];

  const recent = timestamps.filter(t => now - t < 60000);
  if (recent.length >= RATE_LIMIT) {
    return false;
  }

  recent.push(now);
  userTimestamps.set(username, recent);
  return true;
}
```

### Message Persistence Beyond Chat History

Store additional metadata:
- User avatars (store URLs or file references to R2)
- Message reactions/emojis
- Message editing/deletion history
- File attachments (upload to R2)

## Best Practices

### Security
1. **Validate all user input** - Sanitize usernames and messages
2. **Use parameterized queries** - Prevent SQL injection
3. **Implement rate limiting** - Prevent spam/abuse
4. **Secure WebSocket connections** - Use wss:// in production
5. **Never commit secrets** - Use `.dev.vars` for local development

### Performance
1. **Use WebSocket Hibernation** - Reduce costs when idle
2. **Limit chat history queries** - Use pagination or time-based limits
3. **Implement connection cleanup** - Handle stale connections
4. **Cache user presence** - Don't query D1 for every presence update

### Scalability
1. **Single Durable Object** - Can handle thousands of connections for one chat room
2. **Multiple rooms** - Create separate DO instances per room
3. **Load testing** - Test with many simultaneous connections
4. **Monitor usage** - Check D1 queries and DO duration

## Wrangler Commands Reference

### Development
```bash
# Start local development
npx wrangler dev                          # Worker
npx wrangler pages dev public               # Pages

# With remote bindings
npx wrangler dev --remote

# Tail logs
npx wrangler tail
```

### D1 Database
```bash
# Create database
npx wrangler d1 create <NAME>

# List databases
npx wrangler d1 list

# Execute SQL locally
npx wrangler d1 execute <NAME> --local --command="<SQL>"

# Execute SQL remotely
npx wrangler d1 execute <NAME> --remote --command="<SQL>"

# Execute SQL file
npx wrangler d1 execute <NAME> --local --file=./schema.sql

# Create migration
npx wrangler d1 migrations create <NAME> <MESSAGE>

# Apply migrations locally
npx wrangler d1 migrations apply <NAME> --local

# Apply migrations remotely
npx wrangler d1 migrations apply <NAME> --remote
```

### Deployment
```bash
# Deploy Worker
npx wrangler deploy

# Deploy Pages
npx wrangler pages deploy public

# Deploy with environment
npx wrangler deploy --env production
```

### Secrets Management
```bash
# Add secret
npx wrangler secret put <KEY>

# List secrets
npx wrangler secret list
```

## Troubleshooting

### WebSocket Connection Fails
1. Check firewall settings
2. Verify wrangler is running (for local dev)
3. Ensure Durable Object is properly configured
4. Check browser console for errors

### Messages Not Persisting
1. Verify D1 database binding
2. Check migration was applied
3. Test SQL query manually: `npx wrangler d1 execute <NAME> --local --command="SELECT * FROM messages"`
4. Check Worker logs: `npx wrangler tail`

### High Latency
1. Use local development for testing
2. Consider using remote bindings for D1 if needed
3. Optimize SQL queries with indexes
4. Limit chat history queries

### Durable Object Not Starting
1. Verify migration was applied
2. Check wrangler configuration for DO binding
3. Ensure class name matches exactly
4. Check Workers dashboard for errors

## Resources

### Documentation
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)
- [Cloudflare Pages](https://developers.cloudflare.com/pages/)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [D1 Database](https://developers.cloudflare.com/d1/)

### Templates & Examples
- [Workers Chat Demo](https://github.com/cloudflare/workers-chat-demo) - Full chat example with DO
- [WebSocket Template](https://github.com/cloudflare/websocket-template) - WebSocket basics
- [D1 Get Started](https://developers.cloudflare.com/d1/get-started/) - Database setup
- [DO Get Started](https://developers.cloudflare.com/durable-objects/get-started/) - DO basics

### Community
- [Cloudflare Discord](https://discord.cloudflare.com)
- [GitHub Issues](https://github.com/cloudflare/workers-sdk/issues)
- [Workers Reddit](https://www.reddit.com/r/cloudflareworkers/)

## Conclusion

This architecture provides a scalable, low-latency realtime chat application using Cloudflare's serverless platform:

- **Pages**: Fast global frontend delivery
- **Workers**: Efficient API routing and processing
- **Durable Objects**: Real-time WebSocket coordination
- **D1**: Reliable chat history storage
- **Wrangler**: Seamless local development and deployment

The no-registration requirement is satisfied by using simple username storage (localStorage) and anonymous access to the chat room. All features (connected users, chat history, real-time messaging) are implemented through the WebSocket connections managed by Durable Objects.

## Next Steps

1. Set up the project structure
2. Configure Wrangler with appropriate bindings
3. Create and apply D1 migrations
4. Implement the Durable Object class
5. Create the Worker entry point
6. Build the frontend UI
7. Test locally with multiple browser tabs
8. Deploy to Cloudflare and test in production
