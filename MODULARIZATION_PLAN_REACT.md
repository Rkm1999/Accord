# Accord React + TypeScript Migration Plan

This document outlines the architectural shift from Vanilla JS ES Modules to a modern React stack. The goal is 100% feature parity while improving maintainability, type safety, and component reusability.

## 1. Core Tech Stack
- **Framework:** React 18+ (Vite)
- **Language:** TypeScript (Strict Mode)
- **State Management:** Zustand (Global) + React Query (Server Cache)
- **Styling:** Tailwind CSS
- **Animations:** Framer Motion (for sidebars, modals, and swipe gestures)
- **Icons:** Lucide React
- **PWA:** Vite PWA Plugin + Custom Service Worker logic for FCM

## 2. Infrastructure & State Mapping

### A. Global State (Zustand)
- `useAuthStore`: `username`, `displayName`, `avatarKey`, `fcmToken`.
- `useChatStore`: 
    - `channels`, `dms` (mapped lists).
    - `currentChannelId`.
    - `unreadChannels` (Set).
    - `onlineUsernames` (Set).
    - `typingUsers` (Map of username -> timestamp).
- `useMessageStore`:
    - `messagesByChannel` (Record<number, Message[]>).
    - `paginationState` (hasMore, loading).
- `useUIStore`:
    - `activeModals` (enum/stack).
    - `sidebars` (left/right open states).
    - `keyboardHeight` (cached from Visual Viewport).
    - `replyingTo` (Message object).

### B. Socket Integration
- A custom `SocketProvider` or `useSocket` hook will initialize the WebSocket.
- It will map raw socket events (`chat`, `edit`, `reaction`) directly to Zustand actions.
- **Heartbeat:** Maintained via `useEffect` within the provider.

## 3. Component Architecture

### Layouts
- `MainLayout`: Manages the 3-pane flexbox and handles `VisualViewport` resizing to prevent iOS keyboard layout shifts.
- `SidebarOverlay`: Mobile-only backdrop for gestures.

### Navigation
- `ChannelSidebar`: Port of `sidebars.js`. Uses `NavLink` for active state.
- `UserPanel`: Bottom-left profile area.
- `MemberSidebar`: Right-side presence list.

### Chat Components
- `MessageList`: 
    - Virtuallist-like behavior or `ResizeObserver` for scroll anchoring.
    - Implements `maintainScrollBottom` logic.
    - Renders `UnreadDivider`.
- `MessageItem`: 
    - Handles visual grouping (hide avatar if same user < 10 messages).
    - **Gestures:** `framer-motion` for swipe-to-reply.
    - **Long Press:** Custom hook to trigger `MobileActionSheet`.
- `MessageParser`: A functional component that converts message strings into arrays of JSX (Emojis, Mentions, Spoilers, Markdown).
- `ChatInput`: 
    - `react-textarea-autosize`.
    - Floating `MentionAutocomplete` (Port of `input.js`).
    - Multi-file preview row with upload progress.

## 4. Critical Preservation Checklist (Gaps Fixed)

### iOS PWA & Gestures
- [ ] **Viewport Resize:** Must preserve `viewport.js` logic where `app.style.height = visualViewport.height` to fix the "floating input" bug on iOS.
- [ ] **Download Workaround:** Preserve `about:blank` popup strategy in `downloader.ts` for iOS standalone mode.
- [ ] **Edge Swipe:** Implement edge-detection (first 40px) to slide sidebars on mobile.

### PWA & Push
- [ ] **AccordBadgeDB:** Main thread must sync `unreadChannels.size` to IndexedDB so the `firebase-messaging-sw.js` (Background) can read it for `setAppBadge`.
- [ ] **SW Updates:** Maintain the `SKIP_WAITING` prompt UI for seamless PWA updates.

### Data Logic
- [ ] **Deduplication:** Preserve `calculateFileHash` (SHA-256) before upload to save server bandwidth.
- [ ] **Grouping Logic:** Limit grouping to 10 consecutive messages to maintain visual readability.
- [ ] **Spoilers:** Standardize `||text||` and `is_spoiler` flag on files.

## 5. Implementation Phases

1. **Phase 1: Project Setup** - Vite, TS, Tailwind, and Folder structure.
2. **Phase 2: Types & API** - Port `api.js` to typed `lib/api.ts` and define all Interfaces.
3. **Phase 3: Auth & Shell** - Login page and the main 3-pane layout shell.
4. **Phase 4: Real-time Core** - Socket hook, Zustand store, and basic message fetching.
5. **Phase 5: UI Components** - Message rendering, Input area, and Sidebars.
6. **Phase 6: Mobile & Polish** - Framer Motion gestures, Pinch-to-zoom modal, and PWA setup.
7. **Phase 7: Cleanup** - Remove legacy JS modules and update build scripts.
