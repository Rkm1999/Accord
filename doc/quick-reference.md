# Accord Quick Reference

This document provides a quick reference for Accord's current features, API endpoints, and development information.

## 🚀 Current Features Summary

### User Management
- ✅ User registration/login with SHA-256 password hashing
- ✅ Recovery key system for password reset
- ✅ Profile management (display name, avatar upload)
- ✅ Online presence tracking

### Real-time Communication
- ✅ WebSocket connections via Durable Objects
- ✅ Instant message delivery
- ✅ Typing indicators
- ✅ Auto-reconnection on disconnect

### Messaging
- ✅ Send/receive text messages
- ✅ Edit own messages
- ✅ Delete own messages
- ✅ Reply to messages with preview
- ✅ @mention system with highlighting
- ✅ Message grouping (within 1 minute)
- ✅ Message timestamps

### Channels
- ✅ Multiple channels support
- ✅ Create/delete channels (#general protected)
- ✅ Channel switching
- ✅ Per-channel read tracking

### Media & Links
- ✅ File uploads (up to 50MB) to R2
- ✅ Image previews and lightbox
- ✅ Link previews (OpenGraph)
- ✅ YouTube thumbnail support
- ✅ File type icons and downloads

### Reactions & Emojis
- ✅ Built-in emoji picker (8 emojis)
- ✅ Custom emoji uploads
- ✅ Message reactions
- ✅ Reaction counts and toggle

### Search & Discovery
- ✅ Full-text search
- ✅ Filter by username, channel, date
- ✅ Jump to message from search
- ✅ Pagination

### Mobile & PWA
- ✅ Responsive design
- ✅ Swipe-to-reply gesture
- ✅ Collapsible sidebars
- ✅ Installable as PWA
- ✅ Offline support (Service Worker)
- ✅ Update notifications

### UI/UX
- ✅ Discord-inspired dark theme
- ✅ Smooth animations
- ✅ Hover effects
- ✅ Custom scrollbars
- ✅ Unread message indicators
- ✅ "Scroll to bottom" button
- ✅ Load more messages (25 at a time)

---

## 📡 API Endpoints

### Authentication
```
POST /api/auth/register     - User registration
POST /api/auth/login        - User login
POST /api/auth/reset-password - Password reset with recovery key
```

### User Management
```
POST /api/user/profile      - Update profile/avatar
GET  /api/users/list        - Get all registered users
```

### Channels
```
GET  /api/channels          - List all channels
POST /api/channels          - Create new channel
DELETE /api/channels/:id     - Delete channel
```

### Messages & History
```
GET  /api/history           - Get chat history (with pagination)
POST /api/search            - Search messages
```

### Media & Emojis
```
GET  /api/file/:key         - Get file from R2
GET  /api/emojis            - List custom emojis
POST /api/emojis            - Upload custom emoji
```

### WebSocket
```
WS   /ws?username=X&channelId=Y - WebSocket connection
```

---

## 💾 Database Schema

### Tables Overview
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `messages` | Chat messages | id, username, message, timestamp, channel_id |
| `channels` | Chat channels | id, name, created_by |
| `users` | User accounts | username, password_hash, display_name |
| `reactions` | Message reactions | message_id, username, emoji |
| `custom_emojis` | Custom emojis | name, file_key, created_by |
| `channel_last_read` | Read tracking | username, channel_id, message_id |

### Important Fields
- `messages.channel_id` - Links to channels table
- `messages.reply_to` - Self-reference for threaded replies
- `users.recovery_key_hash` - For password reset
- `reactions` has composite unique constraint

---

## 🔧 Development Commands

### Local Development
```bash
# Navigate to worker directory
cd chat-app/worker

# Install dependencies
npm install

# Start local development server
npx wrangler dev

# Apply database migrations
npx wrangler d1 migrations apply chat-history
```

### Deployment
```bash
# Deploy to Cloudflare Workers
npx wrangler deploy

# Deploy with staging environment
npx wrangler deploy --env staging
```

### Database Operations
```bash
# View database schema
npx wrangler d1 execute chat-history --command "SELECT sql FROM sqlite_master"

# Query messages
npx wrangler d1 execute chat-history --command "SELECT * FROM messages LIMIT 5"

# Check tables
npx wrangler d1 execute chat-history --command "SELECT name FROM sqlite_master WHERE type='table'"
```

---

## 🎨 Frontend Architecture

### Key JavaScript Files
| File | Purpose | Size |
|------|---------|------|
| `app.js` | Authentication and PWA logic | 281 lines |
| `chat.js` | Main chat functionality | 1500+ lines |
| `sw.js` | Service Worker for PWA | 108 lines |

### Key HTML Files
| File | Purpose |
|------|---------|
| `index.html` | Login/Register page |
| `chat.html` | Main chat interface |
| `manifest.json` | PWA manifest |

### CSS Structure
- Tailwind CSS via CDN
- Custom animations and transitions
- Responsive breakpoints:
  - Mobile: < 1024px
  - Desktop: ≥ 1024px

---

## ⚙️ Configuration Files

### wrangler.toml
```toml
name = "chat-worker"
main = "src/index.ts"
compatibility_date = "2024-01-01"

# R2 bucket binding
[[r2_buckets]]
binding = "BUCKET"
bucket_name = "chat-files"

# Durable Object binding
[[durable_objects.bindings]]
name = "CHAT_ROOM"
class_name = "ChatRoom"

# D1 database binding
[[d1_databases]]
binding = "DB"
database_name = "chat-history"
database_id = "c020574a-5623-407b-be0c-cd192bab9545"
```

### tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2021",
    "module": "ES2022",
    "types": ["@cloudflare/workers-types"]
  }
}
```

---

## 🔍 Common Troubleshooting

### WebSocket Issues
- Check Durable Object health: `wrangler tail`
- Verify environment: `wrangler whoami`
- Check CORS settings

### Database Issues
- Apply migrations: `wrangler d1 migrations apply`
- Check table structure with SQLite commands
- Verify database binding in wrangler.toml

### File Upload Issues
- Check R2 bucket permissions
- Verify CORS for file endpoints
- Check file size limits (50MB max)

### Performance Issues
- Monitor Durable Object memory (128MB limit)
- Check database query performance
- Optimize WebSocket message payload

---

## 📚 Useful Resources

### Cloudflare Documentation
- [Workers Documentation](https://developers.cloudflare.com/workers/)
- [Durable Objects](https://developers.cloudflare.com/workers/learning/using-durable-objects/)
- [D1 Database](https://developers.cloudflare.com/d1/)
- [R2 Storage](https://developers.cloudflare.com/r2/)

### Development Tools
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)
- [Workers Playground](https://cloudflareworkers.com/)

---

## 🔄 Workflow

1. **Setup**: Clone repo, `cd chat-app/worker`, `npm install`
2. **Development**: `wrangler dev` for local testing
3. **Database Changes**: Create migration files in `database/migrations/`
4. **Testing**: Manual testing in browser, check console logs
5. **Deployment**: `wrangler deploy` to production

---

*Quick Reference - For detailed implementation, see other documentation files*