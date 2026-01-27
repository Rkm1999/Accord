# Accord (Harmony in Messaging)

A high-performance, real-time chat application built on Cloudflare Workers, Durable Objects, D1, and R2. This project implements many core features of Discord with a focus on speed, reliability, and modern UI.

## 🚀 Features

### Core Messaging
- **Real-time Chat**: Instant message delivery using WebSockets and Durable Objects.
- **Message History**: Persistent chat history with automatic synchronization between Durable Objects (SQLite) and D1 (PostgreSQL-compatible).
- **Rich Text Rendering**: Clean, modern message display with support for emojis and formatting.
- **Image Uploads**: Direct image sharing via Cloudflare R2 with optimized delivery.

### Real-time Polish
- **Typing Indicators**: See when others are typing in real-time ("Alice and Bob are typing...").
- **Presence Tracking**: Global member list showing who is online and offline across the entire server.
- **Message Replies**: Contextual replies with "Jump to Message" functionality and flash-highlight animations.
- **User Mentions**: @username highlighting and real-time notifications for mentioned users.

### Navigation & UX
- **Channel Management**: Create and switch between public channels seamlessly.
- **Direct Messaging (DMs)**: Private 1-on-1 conversations with persistent history and dedicated sidebar section.
- **Unread Tracking**:
    - **Account-Level Sync**: Your read progress is saved to your account, ensuring consistency across devices.
    - **"New Messages" Divider**: Visual indicator showing exactly where you left off.
    - **Jump to Unread Banner**: Floating notification that allows you to fly back to your last-seen position.
    - **Persistent Dots**: Notification dots in the sidebar that survive page reloads and re-logins.

### Security
- **JWT Authentication**: Secure user sessions and protected API endpoints.
- **Password Hashing**: Secure storage of user credentials.

## 🛠️ Technology Stack

- **Runtime**: [Cloudflare Workers](https://workers.cloudflare.com/) 
- **Real-time Logic**: [Durable Objects](https://developers.cloudflare.com/workers/learning/using-durable-objects/) (with SQLite storage)
- **Database**: [Cloudflare D1](https://developers.cloudflare.com/d1/)
- **File Storage**: [Cloudflare R2](https://developers.cloudflare.com/r2/)
- **Framework**: [Hono](https://hono.dev/) (Web standards-based router)
- **Frontend**: Vanilla HTML5, CSS3 (Modern HSL variables), and JavaScript/WebSockets.

## 🏁 Getting Started

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Run locally**:
   ```bash
   npm run dev
   ```

3. **Deploy**:
   ```bash
   npx wrangler deploy
   ```

## 📂 Architecture Overview

The system uses a **Durable Object-per-Room** architecture. This ensures that every channel and DM session has its own high-speed, in-memory state and consistent SQLite storage, while Cloudflare D1 acts as the cold-storage archive for long-term history and cross-room discovery.
