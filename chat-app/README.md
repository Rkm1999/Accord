# Realtime Chat Website

A modern, realtime chat application built with Cloudflare Pages, Workers, Durable Objects, and D1 database.

## Features

- No registration required - just enter a username and start chatting
- Real-time messaging using WebSockets and Durable Objects
- Persistent chat history using D1 database
- Online user presence tracking
- Beautiful, responsive design
- Automatic reconnection on disconnect

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

## Project Structure

```
chat-app/
├── public/                 # Pages static assets
│   ├── index.html          # Landing page (username input)
│   ├── chat.html           # Chat page
│   ├── style.css           # Styles
│   ├── app.js             # Landing page script
│   └── chat.js            # Chat page script
├── worker/                 # Worker with Durable Object
│   ├── src/
│   │   ├── index.ts       # Worker entry point
│   │   └── ChatRoom.ts    # Durable Object class
│   ├── wrangler.toml      # Worker configuration
│   ├── package.json
│   └── tsconfig.json
├── database/
│   └── migrations/        # D1 migration files
│       └── 0001_init.sql
├── wrangler.toml           # Pages configuration
├── package.json
├── .gitignore
└── README.md
```

## Prerequisites

- Node.js 16.17.0 or later
- Cloudflare account (free tier works)
- Wrangler CLI (installed via project)

## Setup Instructions

### 1. Clone or Download the Project

```bash
cd chat-app
```

### 2. Authenticate with Cloudflare

```bash
npx wrangler login
```

This will open your browser to authenticate with Cloudflare.

### 3. Create D1 Database

```bash
npx wrangler d1 create chat-history
```

Copy the `database_id` from the output and update both `wrangler.toml` files:
- `chat-app/wrangler.toml`
- `chat-app/worker/wrangler.toml`

Update the `database_id` field with your actual database ID.

### 4. Apply Database Migrations

Apply migrations locally for development:

```bash
npx wrangler d1 execute chat-history --local --file=./database/migrations/0001_init.sql
```

Apply migrations to production:

```bash
npx wrangler d1 execute chat-history --remote --file=./database/migrations/0001_init.sql
```

## Local Development

### 1. Start the Worker

In one terminal:

```bash
cd chat-app/worker
npx wrangler dev
```

The Worker will start on `http://localhost:8787`.

### 2. Start Pages

In another terminal:

```bash
cd chat-app
npx wrangler pages dev public
```

Pages will start on `http://localhost:8788`.

### 3. Test the Application

1. Open `http://localhost:8788` in your browser
2. Enter a username and click "Join Chat"
3. Start chatting!

Test with multiple browser tabs to simulate multiple users.

## Deployment

### Deploy the Worker

```bash
cd chat-app/worker
npx wrangler deploy
```

### Deploy Pages

```bash
cd chat-app
npx wrangler pages deploy public
```

Your chat application will be live at the URL provided by Wrangler!

## API Endpoints

### WebSocket Connection

**Endpoint:** `ws://<your-domain>/ws?username=<username>`

Connects to the chat room and establishes a WebSocket connection.

**Message Types:**

- `history` - Array of historical messages
- `chat` - New chat message
- `presence` - User presence updates (joined/left)

### REST API

**GET /api/history**

Returns the last 100 chat messages in JSON format:

```json
[
  {
    "username": "Alice",
    "message": "Hello!",
    "timestamp": 1234567890
  }
]
```

**GET /api/users**

Returns the current count of connected users.

## D1 Database Schema

```sql
CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    message TEXT NOT NULL,
    timestamp INTEGER NOT NULL
);

CREATE INDEX idx_timestamp ON messages(timestamp);
```

## Technologies Used

- **Cloudflare Pages** - Frontend hosting
- **Cloudflare Workers** - Serverless backend
- **Cloudflare Durable Objects** - Real-time WebSocket management
- **Cloudflare D1** - Serverless SQL database
- **TypeScript** - Type-safe development
- **Wrangler CLI** - Development and deployment tool

## Features

### Real-time Messaging
Messages are delivered instantly to all connected users using WebSocket connections managed by Durable Objects.

### Message Persistence
All messages are stored in D1 database and loaded when users join, ensuring chat history is preserved.

### User Presence
See who's online in real-time with live user count and presence notifications when users join or leave.

### Automatic Reconnection
If a user's connection drops, the client automatically attempts to reconnect after 3 seconds.

### Responsive Design
Beautiful, modern UI that works on desktop, tablet, and mobile devices.

## Troubleshooting

### WebSocket Connection Fails
- Ensure the Worker dev server is running (`npx wrangler dev` in the worker directory)
- Check browser console for errors
- Verify your firewall allows WebSocket connections

### Messages Not Persisting
- Verify D1 database binding is configured correctly
- Check that migrations were applied
- Test D1 directly: `npx wrangler d1 execute chat-history --local --command="SELECT * FROM messages"`

### High Latency
- Use local development mode (default)
- Optimize SQL queries with indexes
- Limit chat history queries

### Authentication Issues
- Run `npx wrangler login` to authenticate
- Run `npx wrangler whoami` to verify authentication
- Check your Cloudflare account permissions

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

ISC

## Resources

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Durable Objects Documentation](https://developers.cloudflare.com/durable-objects/)
- [D1 Database Documentation](https://developers.cloudflare.com/d1/)
- [Wrangler CLI Documentation](https://developers.cloudflare.com/workers/wrangler/)
- [Cloudflare Community Discord](https://discord.cloudflare.com)

## Support

For issues or questions:
- Check the [troubleshooting section](#troubleshooting)
- Visit the [Cloudflare Discord](https://discord.cloudflare.com)
- Open an issue on GitHub
