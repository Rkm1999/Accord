# React Migration Task List

## Phase 1: Foundation & Infrastructure
- [x] **Project Setup**
    - [x] Initialize Vite with `react-ts` template.
    - [x] Install dependencies: `zustand`, `lucide-react`, `framer-motion`, `axios`, `react-router-dom`, `clsx`, `tailwind-merge`.
    - [x] Configure Tailwind CSS with Accord's specific theme colors (`#313338`, `#5865F2`).
    - [x] Set up absolute imports (`@/components`, `@/lib`, etc.).
- [x] **Strict Typing**
    - [x] Define `User`, `Channel`, `Message`, `Attachment`, and `Reaction` interfaces in `src/types`.
- [x] **API & Utility Porting**
    - [x] Port `api.js` to `src/lib/api.ts` with full type safety.
    - [x] Port `helpers.js` (including `getCaretCoordinates`) and `parser.js` utilities to TypeScript.
    - [x] Port `downloader.ts` ensuring the iOS PWA download workaround is intact.
- [x] **State Management**
    - [x] Implement `useAuthStore` with persistence middleware.
    - [x] Implement `useChatStore` (channels, DMs, unread counts).
    - [x] Implement `useUIStore` (modals, sidebars, keyboard height).

## Phase 2: Real-time Communication
- [x] **WebSocket Singleton**
    - [x] Create `SocketClient` class with auto-reconnect and 20s heartbeat.
    - [x] Map socket events (`chat`, `edit`, `delete`, `reaction`, `presence`, `typing`) to Zustand store actions.
- [x] **Presence Tracking**
    - [x] Implement `onlineUsernames` Set logic.
    - [x] Implement `typingUsers` Map with auto-expiry.



## Phase 3: Routing & Auth
- [x] **Navigation & Guards**
    - [x] Set up `BrowserRouter` with routes for `/` and `/chat`.
    - [x] Add `ProtectedRoute` component to redirect non-logged-in users.
- [x] **Authentication Flow**
    - [x] Create `AuthPage` with Login/Register toggle.
    - [x] Implement `RecoveryModal` for new registrations.
    - [x] Implement `ResetPasswordModal` using recovery keys.


## Phase 4: Main App Shell & Sidebars
- [x] **App Layout**
    - [x] Implement 3-pane responsive grid.
    - [x] Port `VisualViewport` resize listener to a custom `useViewportFix` hook for iOS keyboard stability.
- [x] **Channel Sidebar (Left)**
    - [x] Render Channel List and DM List.
    - [x] Implement unread badge logic (syncing to Zustand).
    - [x] Add `UserControlPanel` (bottom left) with profile and settings access.
- [x] **Member Sidebar (Right)**
    - [x] Render Online/Offline groups.
    - [x] Implement user detail modal trigger.


## Phase 5: Chat Engine
- [x] **Message Rendering**
    - [x] Create `MessageList` with scroll anchoring and pagination (`loadMore`).
    - [x] Implement `UnreadBanner` (top jump-to-unread) and `ScrollToBottom` button.
    - [x] Create `MessageItem` with visual grouping (hide avatar/name for consecutive msgs).
    - [x] Implement `MessageParser` component (Markdown, Emojis, Mentions, Spoilers).
- [x] **Interactions**
    - [x] Implement Reaction Badges with pop-up animation.
    - [x] Implement Reply Banner logic.
    - [x] Port `InlineMessageEditor` (replaces content during edit) and Delete actions.
- [x] **Media Support**
    - [x] YouTube iframe player (click-to-load component).
    - [x] Image/Video attachment renderer with spoiler overlay.


## Phase 6: Input & File Handling
- [x] **Chat Input**
    - [x] Auto-expanding `textarea` using `react-textarea-autosize`.
    - [x] `SelectionTooltip` component for markdown formatting markers.
    - [x] Mention Autocomplete popup.
    - [x] Paste-from-clipboard support.
- [x] **File Uploads**
    - [x] Implement multi-file staging area with thumbnails.
    - [x] Integrate SHA-256 deduplication check before upload.
    - [x] Add spoiler toggle for individual files.
    - [x] Show upload progress bars.


## Phase 7: Modals & Polish
- [x] **Global Modals**
    - [x] `SearchModal` with date/channel filtering.
    - [x] `CreateChannelModal`.
    - [x] `ProfileSettingsModal` (Avatar upload, display name, recovery key regeneration).
    - [x] `NotificationSettingsModal` (Channel-specific overrides).
- [x] **Image Modal**
    - [x] Implement pinch-to-zoom and pan for mobile/desktop.


## Phase 8: Mobile & PWA Optimization
- [x] **Mobile Gestures**
    - [x] Swipe-to-reply on messages using `framer-motion`.
    - [x] Edge-swipe to toggle sidebars.
    - [x] Long-press for `MobileActionSheet` with haptic feedback (`vibrate`).
- [x] **PWA Integration**
    - [x] Configure `vite-plugin-pwa`.
    - [x] Port `AccordBadgeDB` sync (IndexedDB) for background notification badge calculation.
    - [x] Port PWA meta tags and icons to root `index.html`.
    - [x] Re-implement PWA Install/Update prompts.
- [x] **Global Interactions**
    - [x] Implement background click listener to dismiss pickers/keyboards.


