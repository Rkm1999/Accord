# Modularization Tasks

## Phase 1: Foundation & Utilities
- [x] **T1.1: Directory Setup**
  - Create `public/js/modules/utils`, `public/js/modules/ui`, `public/js/modules/gestures`, `public/js/modules/pwa`.
- [x] **T1.2: Global Config**
  - Create `js/modules/config.js`.
  - Port `isLocalDev`, `apiBaseUrl`, `platform` detection, and `wsUrl` generation.
- [x] **T1.3: Core Helpers**
  - Create `js/modules/utils/helpers.js`.
  - Port `escapeHtml`, `isEmojiOnly`, `formatFileSize`, `getFileIcon`.
  - Port `getCaretCoordinates` (DOM ghost helper).
- [x] **T1.4: Download Strategy**
  - Create `js/modules/utils/downloader.js`.
  - Port `downloadFile` including the special `about:blank` popup logic for iOS PWAs.
- [x] **T1.5: Module Entry Prep**
  - Update `index.html` and `chat.html` script tags to use `type="module"`.

## Phase 2: State & API Layer
- [x] **T2.1: Centralized State**
  - Create `js/modules/state.js`.
  - Initialize store for `unreadChannels`, `onlineUsernames`, `allUsers`, `customEmojis`, and `currentChannelId`.
- [x] **T2.2: API Service**
  - Create `js/modules/api.js`.
  - Port all fetch calls: `login`, `register`, `fetchChannels`, `fetchDMs`, `uploadEmoji`, `updateProfile`.
- [x] **T2.3: Rich Text Parser**
  - Create `js/modules/utils/parser.js`.
  - Port Markdown regex, Spoiler logic, and YouTube ID extraction/player injection.

## Phase 3: Real-time Networking
- [x] **T3.1: Socket Manager**
  - Create `js/modules/socket.js`.
  - Port WebSocket init, auto-reconnect, and heartbeat interval.
- [x] **T3.2: Message Dispatcher**
  - Implement a listener system in `socket.js` to allow UI modules to "subscribe" to `chat`, `presence`, and `typing` events.

## Phase 4: UI Componentization
- [x] **T4.1: Auth UI**
  - Create `js/modules/ui/auth.js`.
  - Port landing page logic: toggle login/reg, recovery key display, and password reset form.
- [x] **T4.2: Messaging & Scroll**
  - Create `js/modules/ui/messages.js`.
  - Port `createMessageElement`, `recalculateAllGrouping`, `maintainScrollBottom`, and history pagination logic.
- [x] **T4.3: Sidebars & Members**
  - Create `js/modules/ui/sidebars.js`.
  - Port rendering for Channels, DMs, and the Online/Offline member list.
- [x] **T4.4: Modals Manager**
  - Create `js/modules/ui/modals.js`.
  - Port Search logic (with its own pagination), Profile editing, and Notification settings.
- [x] **T4.5: Input & Tooltips**
  - Create `js/modules/ui/input.js`.
  - Port `textarea` auto-resize, `@mention` autocomplete, and the Markdown Selection Tooltip.
- [x] **T4.6: Upload Handler**
  - Create `js/modules/ui/upload.js`.
  - Port drag-and-drop overlays, clipboard paste handling, and SHA-256 deduplication checks.
- [x] **T4.7: Reactions**
  - Create `js/modules/ui/reactions.js`.
  - Port the Reaction Picker (positioning logic for mobile/desktop) and reaction badge updates.

## Phase 5: Gestures & PWA
- [x] **T5.1: Mobile Interaction**
  - Create `js/modules/gestures/mobile.js`.
  - Port swipe-to-reply indicator and long-press context menu logic.
- [x] **T5.2: Viewport & Keyboard**
  - Create `js/modules/gestures/viewport.js`.
  - Port `VisualViewport` resize/scroll listeners to fix iOS keyboard layout issues.
- [x] **T5.3: Image Zoom**
  - Create `js/modules/gestures/zoom.js`.
  - Port multi-touch pinch/pan logic for the image modal.
- [x] **T5.4: PWA Features**
  - Create `js/modules/pwa/sw-manager.js` (SW Registration).
  - Create `js/modules/pwa/push.js` (Firebase token sync).
  - Create `js/modules/pwa/badging.js` (Badge API & IndexedDB sync).

## Phase 6: Orchestration & Cleanup
- [x] **T6.1: Refactor Entry Points**
  - Transform `public/chat.js` and `public/app.js` into thin module entry points.
  - Import and initialize modules within these files.
  - Note: Keep files at the root to maintain compatibility with `firebase-messaging-sw.js` (CRITICAL_ASSETS).
- [x] **T6.2: Variable Cleanup**
  - Eliminated inline event handlers in `index.html` and `chat.html`.
  - Moved logic to modern event listeners in UI modules.
  - Isolated remaining global exposes to `chat.js` for generated HTML compatibility.
- [x] **T6.3: Final Parity Audit**
  - Verified all core features (Search, DMs, PWA, Gestures) are functional in modular structure.
  - Verified no logic was lost from original `chat.js` and `app.js`.
