# Accord - Real-time Chat Application

A Discord-inspired, modern real-time chat application built with Cloudflare Workers (using Workers Assets), Durable Objects, D1 database, and R2 storage.

## Features

- User registration with password authentication (SHA-256 hashing)
- Recovery key system for password reset (one-time display)
- Profile management (display name, avatar upload)
- Real-time messaging using WebSockets and Durable Objects
- Multiple channels with create/delete functionality
- Persistent chat history using D1 database
- Message editing and deletion
- Message replies with preview
- Link preview (Open Graph metadata)
- File uploads (up to 50MB) via R2
- Emoji reactions + custom emoji uploads
- @mentions with highlighting
- Typing indicators
- Read receipts per channel
- Search (text, user, channel, date range)
- Online user presence tracking
- PWA support (Service Worker for offline capabilities)
- Beautiful, responsive Discord-inspired UI
- Automatic reconnection on disconnect

## Architecture

```
┌─────────────────┐
│  Cloudflare      │
│     Worker       │  (API, Routing & Static Assets)
└────────┬────────┘
         │
         ├───► Durable Object (WebSocket connections & real-time state)
         │
         ├───► D1 Database (Chat history, users, channels)
         │
         └───► R2 Bucket (Files, avatars, emojis)
```

## Project Structure

```
chat-app/
├── worker/                     # Worker with Durable Object
│   ├── public/                 # Frontend static assets
│   │   ├── index.html        # Login/Register page
│   │   ├── chat.html         # Chat page
│   │   ├── style.css         # Styles (Tailwind + custom)
│   │   ├── app.js           # Auth logic
│   │   └── chat.js          # Chat functionality
│   ├── src/
│   │   ├── index.ts         # Worker entry point (API routes)
│   │   └── ChatRoom.ts      # Durable Object class
│   ├── wrangler.toml          # Worker configuration
│   ├── package.json
│   └── tsconfig.json
├── database/
│   └── migrations/          # D1 migration files (one per table)
│       ├── 0000_drop_all.sql         # Drop all tables
│       ├── 0001_messages.sql         # Messages table
│       ├── 0002_channels.sql         # Channels table
│       ├── 0003_users.sql            # Users table
│       ├── 0004_reactions.sql        # Reactions table
│       ├── 0005_custom_emojis.sql    # Custom emojis table
│       ├── 0006_channel_last_read.sql # Read receipts table
│       ├── 9999_migrate_all.sql     # Run all migrations
│       └── test_schema.sql           # 20 test queries
├── doc/                        # Documentation
│   ├── task.md                  # Implementation tasks
│   └── research.md              # Technical research
├── README.md
└── .gitignore
```

## Quick Start

**Deploy to Cloudflare:**
```bash
cd chat-app/worker
npx wrangler d1 create chat-history  # Create D1 database
npx wrangler r2 bucket create chat-files  # Create R2 bucket
# Update wrangler.toml with database_id
npx wrangler d1 execute chat-history --remote --file="../database/migrations/0001_messages.sql"
# Run remaining migrations (0002-0006)
npx wrangler deploy  # Deploy to production
```

**Local Development:**
```bash
cd chat-app/worker
npx wrangler dev  # Starts on http://localhost:8787
```

## Prerequisites

- Node.js 16.17.0 or later
- Cloudflare account (free tier works)
- Wrangler CLI (installed via project)

## Setup Instructions

### 1. Clone the Project

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

Copy the `database_id` from the output and update `chat-app/worker/wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "chat-history"
database_id = "<YOUR_DATABASE_ID>"
```

### 4. Create R2 Bucket

```bash
npx wrangler r2 bucket create chat-files
```

Update `chat-app/worker/wrangler.toml`:

```toml
[[r2_buckets]]
binding = "BUCKET"
bucket_name = "chat-files"
```

### 5. Apply Database Migrations

**Option A: Run all migrations at once**

```bash
cd worker
npx wrangler d1 execute chat-history --local --file="../database/migrations/9999_migrate_all.sql"
```

**Option B: Run migrations individually**

```bash
cd worker

# Drop existing tables (if needed)
npx wrangler d1 execute chat-history --local --file="../database/migrations/0000_drop_all.sql"

# Create tables
npx wrangler d1 execute chat-history --local --file="../database/migrations/0001_messages.sql"
npx wrangler d1 execute chat-history --local --file="../database/migrations/0002_channels.sql"
npx wrangler d1 execute chat-history --local --file="../database/migrations/0003_users.sql"
npx wrangler d1 execute chat-history --local --file="../database/migrations/0004_reactions.sql"
npx wrangler d1 execute chat-history --local --file="../database/migrations/0005_custom_emojis.sql"
npx wrangler d1 execute chat-history --local --file="../database/migrations/0006_channel_last_read.sql"
```

**For production**, add `--remote` flag instead of `--local`.

### 6. Verify Database Schema

Run the test suite to verify all tables are created correctly:

```bash
cd worker
npx wrangler d1 execute chat-history --local --file="../database/migrations/test_schema.sql"
```

## Local Development

### 1. Start the Worker

In one terminal:

```bash
cd chat-app/worker
npx wrangler dev
```

The Worker will start on `http://localhost:8787`.

### 2. Test the Application

1. Open `http://localhost:8787` in your browser
2. Click "Register" to create an account
3. **Save your recovery key** - this is the only way to reset your password!
4. Login with your credentials
5. Start chatting!

Test with multiple browser tabs to simulate multiple users.

## Deployment

### Production Deployment

Follow these steps to deploy Accord to Cloudflare:

#### 1. Verify Authentication

Check if you're logged in to Cloudflare:

```bash
npx wrangler whoami
```

If not logged in, authenticate:
```bash
npx wrangler login
```

#### 2. Create D1 Database

```bash
cd chat-app/worker
npx wrangler d1 create chat-history
```

Copy the `database_id` from the output (e.g., `c020574a-5623-407b-be0c-cd192bab9545`).

#### 3. Create R2 Bucket

```bash
npx wrangler r2 bucket create chat-files
```

#### 4. Update wrangler.toml

Copy the example config and add your database_id:

```bash
cd chat-app/worker
cp wrangler.toml.example wrangler.toml
```

Update `chat-app/worker/wrangler.toml` with the database_id:

```toml
[[d1_databases]]
binding = "DB"
database_name = "chat-history"
database_id = "c020574a-5623-407b-be0c-cd192bab9545"
```

**Note:** `wrangler.toml` is in `.gitignore` to avoid committing your database_id. Use `wrangler.toml.example` as a template.

#### 5. Apply Database Migrations (Remote)

Apply all migrations to the production database:

```bash
npx wrangler d1 execute chat-history --remote --file="../database/migrations/0001_messages.sql"
npx wrangler d1 execute chat-history --remote --file="../database/migrations/0002_channels.sql"
npx wrangler d1 execute chat-history --remote --file="../database/migrations/0003_users.sql"
npx wrangler d1 execute chat-history --remote --file="../database/migrations/0004_reactions.sql"
npx wrangler d1 execute chat-history --remote --file="../database/migrations/0005_custom_emojis.sql"
npx wrangler d1 execute chat-history --remote --file="../database/migrations/0006_channel_last_read.sql"
```

#### 6. Deploy Worker

```bash
npx wrangler deploy
```

The deployment will output your live URL, for example:
```
https://chat-worker.junida1999.workers.dev
```

#### 7. Verify Deployment

1. Visit your worker URL in a browser
2. Test user registration
3. Login and verify WebSocket connects (check browser console for "Connected to chat server")
4. Test messaging, file uploads, and other features

### Adding a Custom Domain

To use your own domain:

1. **Add Custom Domain** via Cloudflare Dashboard:
   - Go to Workers & Pages
   - Select your worker
   - Click "Custom Domains"
   - Add your domain (e.g., `chat.example.com`)

2. **Configure DNS** (if using a non-Cloudflare domain):
   - Add CNAME record pointing to your worker's URL

### Updating Your Deployment

After making code changes:

```bash
cd chat-app/worker
npx wrangler deploy
```

This will automatically upload and deploy updated files.

## API Endpoints

### WebSocket Connection

**Endpoint:** `ws://<your-domain>/ws?username=<username>&channelId=<channelId>`

- **Local development:** `ws://localhost:8787/ws?...`
- **Production:** `wss://<your-domain>/ws?...` (secure WebSocket)

The frontend automatically uses the correct protocol (`ws://` for HTTP, `wss://` for HTTPS).

Connects to the chat room and establishes a WebSocket connection.

**Message Types:**
- `history` - Array of historical messages
- `chat` - New chat message
- `presence` - User presence updates (joined/left)
- `typing` - Typing indicator
- `edit` - Message edited
- `delete` - Message deleted
- `reaction` - Reaction added/removed
- `online_list` - List of online users
- `refresh_channels` - Refresh channels list
- `refresh_users` - Refresh users list

### REST API

**Authentication**

- `POST /api/auth/register` - Register new user (returns recovery key)
- `POST /api/auth/login` - Login user
- `POST /api/auth/reset-password` - Reset password with recovery key

**User Profile**

- `POST /api/user/profile` - Update display name, avatar, regenerate recovery key
- `GET /api/users/list` - Get all registered users

**Channels**

- `GET /api/channels` - List all channels
- `POST /api/channels` - Create new channel
- `DELETE /api/channels/<id>` - Delete channel (except #general)

**Messages**

- `GET /api/history?channelId=<id>` - Get chat history (100 messages)
- `POST /api/search` - Search messages (supports query, username, channel, date range)

**Files**

- `GET /api/file/<key>` - Get file from R2

**Emojis**

- `GET /api/emojis` - Get all custom emojis
- `POST /api/emojis` - Upload custom emoji

## D1 Database Schema

### messages
```sql
CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    message TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    link_url TEXT,
    link_title TEXT,
    link_description TEXT,
    link_image TEXT,
    file_name TEXT,
    file_type TEXT,
    file_size INTEGER,
    file_key TEXT,
    reply_to INTEGER REFERENCES messages(id),
    reply_username TEXT,
    reply_message TEXT,
    reply_timestamp INTEGER,
    reply_file_name TEXT,
    reply_file_type TEXT,
    reply_file_size INTEGER,
    reply_file_key TEXT,
    is_edited INTEGER DEFAULT 0,
    edited_at INTEGER,
    channel_id INTEGER REFERENCES channels(id) DEFAULT 1
);

CREATE INDEX idx_messages_timestamp ON messages(timestamp);
CREATE INDEX idx_messages_channel_id ON messages(channel_id);
CREATE INDEX idx_messages_username ON messages(username);
```

### channels
```sql
CREATE TABLE channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
```

### users
```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    avatar_key TEXT,
    recovery_key_hash TEXT,
    created_at INTEGER NOT NULL
);

CREATE INDEX idx_users_username ON users(username);
```

### reactions
```sql
CREATE TABLE reactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    emoji TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    UNIQUE(message_id, username, emoji)
);

CREATE INDEX idx_reactions_message_id ON reactions(message_id);
```

### custom_emojis
```sql
CREATE TABLE custom_emojis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    file_key TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE INDEX idx_custom_emojis_name ON custom_emojis(name);
```

### channel_last_read
```sql
CREATE TABLE channel_last_read (
    username TEXT NOT NULL,
    channel_id INTEGER NOT NULL,
    message_id INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (username, channel_id)
);
```

## Testing Database Schema

The `test_schema.sql` file contains 20 test queries to verify the database is set up correctly:

```bash
cd worker
npx wrangler d1 execute chat-history --local --file="../database/migrations/test_schema.sql"
```

Or run individual tests:

```bash
# Check all tables exist
npx wrangler d1 execute chat-history --local --command="SELECT name FROM sqlite_master WHERE type='table'"

# Check table structure
npx wrangler d1 execute chat-history --local --command="PRAGMA table_info(messages)"

# Check indexes
npx wrangler d1 execute chat-history --local --command="SELECT name, tbl_name FROM sqlite_master WHERE type='index'"

# Check foreign keys
npx wrangler d1 execute chat-history --local --command="PRAGMA foreign_key_list(messages)"
```

## Technologies Used

- **Cloudflare Workers** - Serverless backend & Static Assets hosting (Workers Assets)
- **Cloudflare Durable Objects** - Real-time WebSocket management
- **Cloudflare D1** - Serverless SQL database
- **Cloudflare R2** - Object storage for files
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **Lucide Icons** - Beautiful icon set
- **Wrangler CLI** - Development and deployment tool

## Features Deep Dive

### Authentication & Security
- Password hashing with SHA-256
- Recovery key system (one-time display, stored as hash)
- No email required - recovery key is the backup method

### Real-time Messaging
Messages are delivered instantly to all connected users using WebSocket connections managed by Durable Objects.

### Multi-Channel Support
- Create and delete channels (except #general)
- Unread indicators per channel
- Last read position tracking

### Message Features
- Edit your own messages
- Delete your own messages
- Reply to messages with preview
- @mentions with highlighting
- Emoji reactions (toggle on/off)
- Custom emoji uploads

### File Sharing
- Upload images, videos, audio, documents
- 50MB file size limit
- Stored in R2 bucket
- Preview thumbnails for images

### Link Previews
- Automatic metadata extraction
- YouTube thumbnail support
- Open Graph tags parsing

### Search
- Full-text message search
- Filter by username
- Filter by channel
- Date range filtering

## Troubleshooting

### Mixed Content Error (ws:// vs wss://)
If you see "Mixed Content: The page was loaded over HTTPS, but attempted to connect to insecure WebSocket endpoint", ensure:
- The WebSocket protocol matches the page protocol (`wss://` for HTTPS pages)
- The code in `chat.js` uses dynamic protocol detection

**Fix:** The deployment uses dynamic protocol detection to automatically use `wss://` on HTTPS.

### WebSocket Connection Fails
- Ensure Worker dev server is running (`npx wrangler dev` in worker directory)
- Check browser console for errors
- Verify your firewall allows WebSocket connections

### Messages Not Persisting
- Verify D1 database binding is configured correctly
- Check that migrations were applied
- Test D1 directly: `npx wrangler d1 execute chat-history --local --command="SELECT * FROM messages"`

### Files Not Uploading
- Verify R2 bucket is created and bound
- Check file size is under 50MB
- Test R2 directly with `npx wrangler r2 object get chat-files <key>`

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
- [R2 Storage Documentation](https://developers.cloudflare.com/r2/)
- [Wrangler CLI Documentation](https://developers.cloudflare.com/workers/wrangler/)
- [Cloudflare Community Discord](https://discord.cloudflare.com)

## Support

For issues or questions:
- Check the [troubleshooting section](#troubleshooting)
- Visit the [Cloudflare Discord](https://discord.cloudflare.com)
- Open an issue on GitHub
