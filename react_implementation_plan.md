# React + TypeScript Implementation Plan - Accord

This plan details the technical steps to migrate the Accord frontend to a React-based architecture, ensuring 100% feature parity with the current vanilla implementation.

## 1. Project Initialization
- **Environment:** Vite + React + TypeScript.
- **Styling:** Tailwind CSS (configured with `313338` as dark background and `5865F2` as primary blue).
- **Icons:** `lucide-react`.

## 2. Data & State Layer
### TypeScript Interfaces (`src/types/`)
- `User`: id, username, display_name, avatar_key, status.
- `Channel`: id, name, type (public/dm), created_by.
- `Message`: id, channel_id, username, message, file_attachment, reactions, reply_to, is_edited, is_spoiler.
- `Emoji`: name, file_key.

### Global Store (Zustand - `src/store/`)
- **State:** `currentUser`, `channels`, `dms`, `messagesByChannel`, `onlineUsers`, `unreadCounts`, `activeModals`, `keyboardHeight`.
- **Actions:** `setCurrentChannel`, `addMessage`, `updateReaction`, `setTyping`, `toggleSidebar`.

### API & Sockets (`src/lib/`)
- `api.ts`: Axios/Fetch wrapper with `apiBaseUrl` logic and `Auth` header management.
- `socket.ts`: Singleton WebSocket class with auto-reconnect and heartbeat (20s). Maps events to Zustand actions.

## 3. Component Breakdown

### Layout & Navigation
- `AppShell`: Responsive container handling `VisualViewport` (iOS fix).
- `SidebarLeft`: Search, Channel List, DM List, and User Panel.
- `SidebarRight`: Member list with online/offline groupings.

### Chat Engine
- `MessageList`:
    - Handles pagination (onScroll top).
    - `UnreadDivider` logic.
    - Scroll anchoring (bottom-lock).
- `MessageItem`:
    - Conditional rendering for "grouped" vs "full" messages.
    - `MessageActions` (Edit, Delete, Reply, React).
    - `FileAttachment` renderer (Image, Video, or File with Spoiler support).
- `ChatInput`:
    - Textarea with auto-height.
    - Mention Autocomplete popup.
    - File staging area (Drag & Drop support).

### Interactivity (Modals & Popovers)
- `ModalProvider`: Global container for `CreateChannel`, `Search`, `Profile`, `UserDetail`.
- `EmojiPicker`:
    - Floating UI for desktop.
    - Slide-up Bottom Sheet for mobile.
- `ImageModal`: Pinch-to-zoom and pan support for images.

## 4. Feature Parity Gaps & Solutions

| Feature | Implementation Strategy |
| :--- | :--- |
| **iOS Keyboard Fix** | Use `VisualViewport` API to set `app.height` and `translateY`. |
| **PWA Badging** | Sync Zustand unread count to `AccordBadgeDB` (IndexedDB) for SW access. |
| **iOS Download** | Preserve `about:blank` + `blob` + `FileReader` workaround in `downloader.ts`. |
| **File Deduplication** | Compute SHA-256 hash in a Web Worker before upload. |
| **Message Parsing** | Regex-based tokenizer that converts string -> `ReactNode[]` (bold, italic, mentions, custom emojis). |
| **Swipe-to-Reply** | `framer-motion` `drag="x"` with constraints and `onDragEnd` trigger. |

## 5. Migration Roadmap
1. **Sprint 1:** Setup Vite, Tailwind, Types, and API/Socket infrastructure.
2. **Sprint 2:** Auth pages (Login/Register/Recovery) and basic App Shell.
3. **Sprint 3:** Channel/Member sidebars and Socket-driven message history.
4. **Sprint 4:** Chat Input, File Uploads, and Mention Autocomplete.
5. **Sprint 5:** Modals (Search, Profile, Channel Creation).
6. **Sprint 6:** Mobile Polish (Gestures, Viewport, PWA Installation).
7. **Sprint 7:** Production build, SW verification, and performance audit.
