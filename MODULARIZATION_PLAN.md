# Frontend Modularization Plan - Accord Chat (Revised)

## 1. Updated Directory Structure
```text
public/
├── js/
│   ├── modules/
│   │   ├── api.js            # Fetch calls: Auth (Login/Reg), Profile, Emojis, Channels, Upload Checks
│   │   ├── socket.js         # WebSocket lifecycle, heartbeats, and message routing
│   │   ├── state.js          # Reactive store: users, unreads, current channel, custom emojis
│   │   ├── config.js         # Environment detection (isLocalDev), apiBaseUrl, platform tags
│   │   ├── utils/
│   │   │   ├── helpers.js    # Formatting (bytes, time), jumbo emoji check, getCaretCoordinates
│   │   │   ├── parser.js     # Markdown, Spoilers, YouTube extraction, and mention highlighting
│   │   │   └── downloader.js # iOS PWA navigation strategy vs standard download
│   │   ├── ui/
│   │   │   ├── auth.js       # NEW: Landing page toggle, recovery key copy, reset form logic
│   │   │   ├── messages.js   # Rendering, grouping (max 10), history pagination, scroll management
│   │   │   ├── sidebars.js   # Channel/DM list rendering, unread badge animations
│   │   │   ├── modals.js     # Modal management (Search, Profile, Notification Overrides)
│   │   │   ├── input.js      # Textarea auto-resize, Selection Tooltip, @mention autocomplete
│   │   │   ├── upload.js     # File staging, SHA-256 hashing, progress bars, paste/drag handlers
│   │   │   └── reactions.js  # Reaction picker (Mobile/Desktop) and badge updates
│   │   ├── gestures/
│   │   │   ├── mobile.js     # Long-press context menu, swipe-to-reply, sidebar drags
│   │   │   ├── viewport.js   # Visual Viewport API, iOS keyboard height detection
│   │   │   └── zoom.js       # Pinch-to-zoom and pan for the Image Modal
│   │   └── pwa/
│   │       ├── sw-manager.js # Service Worker registration and SKIP_WAITING update prompt
│   │       ├── push.js       # Firebase Push Notification permission/token sync
│   │       └── badging.js    # App Badging API and IndexedDB syncing for SW
│   └── chat.js               # Main entry point (Orchestrator for /chat)
│   └── app.js                # Main entry point (Orchestrator for landing page)
```

## 2. Feature-to-Module Mapping

| Feature | Source File | Target Module |
| :--- | :--- | :--- |
| **Auth Toggle/Reset** | `app.js` | `ui/auth.js` |
| **PWA Install Prompt** | `app.js` | `pwa/sw-manager.js` |
| **Emoji-Only Detection** | `chat.js` | `utils/helpers.js` |
| **Markdown / Spoilers** | `chat.js` | `utils/parser.js` |
| **YouTube Embeds** | `chat.js` | `utils/parser.js` |
| **Message Grouping** | `chat.js` | `ui/messages.js` |
| **SHA-256 Hashing** | `chat.js` | `ui/upload.js` |
| **Caret Coordinates** | `chat.js` | `utils/helpers.js` |
| **iOS stand-alone download**| `chat.js` | `utils/downloader.js` |
| **Visual Viewport fix** | `chat.js` | `gestures/viewport.js` |
| **App Badging / IndexedDB** | `chat.js` | `pwa/badging.js` |

## 3. Verification Checklist (No Logic Left Behind)
- [ ] **YouTube Player:** Verify extraction patterns and iframe injection work in modular parser.
- [ ] **Scrolling:** Ensure `maintainScrollBottom` correctly handles image loads in `ui/messages.js`.
- [ ] **iOS Fixes:** Verify `translateY(offsetTop)` logic is correctly ported to `gestures/viewport.js`.
- [ ] **Group logic:** Ensure the `recalculateAllGrouping` function remains accurate during prepending.
- [ ] **Download:** Ensure the special `about:blank` popup for iOS standalone is in `utils/downloader.js`.
