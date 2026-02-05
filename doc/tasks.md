# Accord Development Tasks

This document outlines the current status and planned development tasks for the Accord chat application.

## 📋 Current Project Status

### ✅ Completed Features
- Real-time chat with WebSocket connections via Durable Objects
- User authentication with registration/login
- Multiple channels with create/delete functionality
- Message sending, editing, and deletion
- File uploads to R2 (images, videos, documents)
- Emoji reactions and custom emojis
- @mention system with highlighting
- Message replies and threading
- Link previews and OpenGraph metadata
- Search functionality with filters
- PWA with offline support
- Mobile-responsive design with gestures
- Presence tracking and typing indicators
- Unread message tracking per channel

### 🛠️ Technical Implementation
- **Backend**: Cloudflare Workers (TypeScript)
- **Real-time**: Durable Objects for WebSocket management
- **Database**: D1 (SQLite) with proper schema
- **Storage**: R2 for files and avatars
- **Frontend**: Vanilla JavaScript with Tailwind CSS
- **Deployment**: Cloudflare Pages & Workers

---

## 🎯 Phase 1 Tasks (High Priority)

### 1. Markdown Support
**Description**: Enable rich text formatting in messages
**Estimated Effort**: 2-3 days

**Tasks**:
- [ ] Choose and integrate markdown parser library
- [ ] Implement sanitization for security
- [ ] Update message rendering pipeline
- [ ] Add preview mode while typing
- [ ] Test various markdown syntaxes

**Implementation Notes**:
- Use `marked.js` or similar lightweight library
- Enable: `**bold**`, `*italic*`, `~~strikethrough~~`, `` `code` ``, `> quotes`
- Sanitize HTML to prevent XSS attacks
- Consider adding code syntax highlighting

### 2. Desktop Notifications
**Description**: Browser notifications for mentions and messages
**Estimated Effort**: 1-2 days

**Tasks**:
- [ ] Implement notification API integration
- [ ] Add notification preferences UI
- [ ] Handle permission requests gracefully
- [ ] Set up notification triggers for @mentions
- [ ] Test across different browsers

**Implementation Notes**:
- Request permission on first message mention
- Show notification for @mentions and DMs
- Add sound effects option
- Handle permission denials gracefully

### 3. Pinned Messages
**Description**: Allow users to pin important messages in channels
**Estimated Effort**: 2 days

**Tasks**:
- [ ] Add `pinned_at` column to messages table
- [ ] Create migration script
- [ ] Add pin/unpin message endpoints
- [ ] Display pinned messages section
- [ ] Add pin limit per channel (3-5 messages)

**Implementation Notes**:
- Add new database migration
- Pin icon in message actions menu
- Pinned messages shown at top of channel
- Only moderators/admins can pin

### 4. @everyone and @here Mentions
**Description**: System-wide mentions for all users or online users
**Estimated Effort**: 1 day

**Tasks**:
- [ ] Add mention detection for @everyone and @here
- [ ] Implement permission checks (admin only for @everyone)
- [ ] Highlight mentioned messages for all users
- [ ] Add notification triggers
- [ ] Update presence tracking

**Implementation Notes**:
- @everyone notifies all registered users
- @here notifies only currently online users
- Only admin/moderator role can use @everyone
- Any user can use @here

### 5. Light/Dark Mode Toggle
**Description**: User theme preference switcher
**Estimated Effort**: 1-2 days

**Tasks**:
- [ ] Create CSS variable system for theming
- [ ] Add theme toggle in user settings
- [ ] Store preference in localStorage
- [ ] Implement smooth theme transitions
- [ ] Test color accessibility

**Implementation Notes**:
- Use CSS custom properties for easy theming
- Default to system preference
- Add smooth transition effects
- Ensure good contrast ratios

---

## 🎨 Phase 2 Tasks (Medium Priority)

### 1. Direct Messages (DMs)
**Description**: Private one-on-one and group conversations
**Estimated Effort**: 5-7 days

**Tasks**:
- [ ] Design DM database schema
- [ ] Create separate Durable Object for DMs
- [ ] Add DM creation/management endpoints
- [ ] Implement DM UI in frontend
- [ ] Add DM sidebar section
- [ ] Handle privacy and permissions

**Database Changes Needed**:
```sql
CREATE TABLE direct_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, -- For group DMs, NULL for 1-on-1
    created_at INTEGER NOT NULL,
    is_group INTEGER DEFAULT 0
);

CREATE TABLE dm_participants (
    dm_id INTEGER REFERENCES direct_messages(id),
    username TEXT REFERENCES users(username),
    added_at INTEGER NOT NULL,
    PRIMARY KEY (dm_id, username)
);
```

### 2. Custom Status & Presence
**Description**: User status messages and presence states
**Estimated Effort**: 3-4 days

**Tasks**:
- [ ] Add status management system
- [ ] Create status UI components
- [ ] Implement presence states (Online, Idle, DND, Invisible)
- [ ] Add status persistence
- [ ] Update member list with status

**Database Changes Needed**:
```sql
CREATE TABLE user_status (
    username TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'online',
    status_message TEXT,
    status_emoji TEXT,
    updated_at INTEGER NOT NULL
);
```

### 3. Slash Commands
**Description**: Command system for quick actions
**Estimated Effort**: 2-3 days

**Tasks**:
- [ ] Implement command parser
- [ ] Create command registry system
- [ ] Add basic commands: `/giphy`, `/shrug`, `/nick`, `/clear`
- [ ] Add command help system
- [ ] Handle command errors gracefully

**Commands to Implement**:
- `/giphy [query]` - Search and send GIF
- `/shrug` - Append ¯\\_(ツ)\\_/¯ to message
- `/nick [name]` - Change display name
- `/clear` - Clear chat window locally
- `/away` - Set status to idle
- `/dnd` - Set status to do not disturb

### 4. Message History Viewer
**Description**: View edit history of messages
**Estimated Effort**: 2 days

**Tasks**:
- [ ] Add audit trail for message edits
- [ ] Create history viewer modal
- [ ] Add edit history button to own messages
- [ ] Display timeline of changes
- [ ] Add compare views

**Database Changes Needed**:
```sql
CREATE TABLE message_edit_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL REFERENCES messages(id),
    original_message TEXT NOT NULL,
    edited_at INTEGER NOT NULL
);
```

### 5. Advanced Search Filters
**Description**: Enhanced search with more filtering options
**Estimated Effort**: 2-3 days

**Tasks**:
- [ ] Add search operators support
- [ ] Implement `from:user`, `in:channel`, `has:image` filters
- [ ] Add date range picker improvements
- [ ] Add search by attachment type
- [ ] Optimize search queries with indexes

---

## 🚀 Phase 3 Tasks (Advanced Features)

### 1. Voice Channels
**Description**: Real-time voice chat via WebRTC
**Estimated Effort**: 2-3 weeks

**Tasks**:
- [ ] Set up WebRTC infrastructure
- [ ] Implement voice channel Durable Objects
- [ ] Create voice UI components
- [ ] Add audio processing and mixing
- [ ] Handle connection management
- [ ] Add push-to-talk and voice activity detection

### 2. Threads
**Description**: Organized conversations within channels
**Estimated Effort**: 1-2 weeks

**Tasks**:
- [ ] Design thread database schema
- [ ] Create thread creation/management
- [ ] Implement thread UI in chat
- [ ] Add thread sidebar
- [ ] Handle thread permissions

### 3. User Roles & Permissions
**Description**: Role-based access control
**Estimated Effort**: 1-2 weeks

**Tasks**:
- [ ] Design role system
- [ ] Create role management UI
- [ ] Implement permission checks
- [ ] Add role assignments
- [ ] Create admin dashboard

---

## 🧪 Testing & Quality Assurance

### Automated Testing
- [ ] Set up unit tests for utility functions
- [ ] Add integration tests for API endpoints
- [ ] Create WebSocket connection tests
- [ ] Add end-to-end tests with Playwright

### Manual Testing Checklist
- [ ] Test all authentication flows
- [ ] Verify file upload functionality
- [ ] Test real-time message delivery
- [ ] Check mobile responsiveness
- [ ] Test offline functionality
- [ ] Verify security measures

### Performance Optimization
- [ ] Monitor Durable Object memory usage
- [ ] Optimize database queries with proper indexes
- [ ] Implement request caching where appropriate
- [ ] Test under load with multiple users

---

## 📊 Metrics & Monitoring

### Analytics Implementation
- [ ] Track user engagement metrics
- [ ] Monitor system performance
- [ ] Set up error tracking
- [ ] Add usage analytics dashboard

### Health Checks
- [ ] Create health check endpoints
- [ ] Monitor database connection health
- [ ] Track WebSocket connection stats
- [ ] Set up uptime monitoring

---

## 📅 Release Planning

### Version 1.1 (Target: 2-3 weeks)
- Markdown support
- Desktop notifications
- Pinned messages
- @everyone/@here mentions
- Light/dark mode

### Version 1.2 (Target: 1-2 months)
- Direct Messages
- Custom status & presence
- Slash commands
- Message history viewer
- Advanced search

### Version 2.0 (Target: 3-6 months)
- Voice channels
- Threads
- User roles & permissions
- Rich embeds
- Bot system foundation

---

## 🤝 Contribution Guidelines

### Code Review Process
1. All changes must be tested locally
2. Create pull request with clear description
3. Code review by at least one team member
4. Automated tests must pass
5. Manual verification of functionality

### Development Guidelines
- Follow existing code style and patterns
- Add proper error handling
- Include documentation for new features
- Update API documentation
- Consider mobile implementation

---

*Last updated: February 2026*
*Next review: Every sprint planning*