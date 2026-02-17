# Accord: Real-time Voice & Video Implementation Plan

This document outlines the architectural and technical strategy for implementing P2P Voice and Video chat within the Accord platform using WebRTC and Cloudflare Durable Objects.

---

## 1. Architectural Strategy

### WebRTC Topology: Mesh (P2P)
For the initial implementation, we will use a **Full Mesh** topology.
- **How it works:** Every participant in a voice channel establishes a direct peer-to-peer connection with every other participant.
- **Pros:** No media server costs, low latency, end-to-peer encryption by default.
- **Cons:** Bandwidth and CPU usage scale exponentially ($N(N-1)/2$ connections). Ideal for 2–8 participants.

### Signaling Infrastructure
We will utilize the existing `ChatRoom` Durable Object as the signaling server.
- **Events:** We will introduce new WebSocket message types: `rtc_offer`, `rtc_answer`, and `rtc_ice_candidate`.
- **Routing:** Signaling messages will be targeted. If User A wants to connect to User B, the DO will route the message specifically to User B's WebSocket.

---

## 2. Database & Backend Changes

### Schema Updates (D1)
Update the `channels` table to support different channel types.
```sql
ALTER TABLE channels ADD COLUMN type TEXT DEFAULT 'text'; -- 'text' or 'voice'
```

### Durable Object Logic (`ChatRoom.ts`)
1. **Voice State Tracking:** Maintain a map of `voiceRoomMembers` (ChannelID -> Set of Usernames) in the DO's memory.
2. **Event Handling:**
   - `join_voice`: Adds user to the map and broadcasts `user_joined_voice` to all members in that channel.
   - `leave_voice`: Removes user and broadcasts `user_left_voice`.
   - `rtc_signal`: Acts as a relay. Receives a payload containing a `targetUsername` and forwards the SDP/ICE data to that specific user's connection.

---

## 3. Frontend Implementation

### State Management (`useVoiceStore.ts`)
Create a new Zustand store to manage the complex WebRTC lifecycle:
- **Active State:** `currentVoiceChannelId`, `participants` (List of users in the current room).
- **Media Streams:** `localStream` (MediaStream), `remoteStreams` (Map of Username -> MediaStream).
- **Peer Connections:** `peers` (Map of Username -> RTCPeerConnection).
- **Device State:** `audioInputId`, `videoInputId`, `audioOutputId`, `isMuted`, `isCameraOn`.

### Device Management Utility (`lib/devices.ts`)
A utility class to wrap the `navigator.mediaDevices` API:
- `getDevices()`: Returns lists of mics, cameras, and speakers.
- `createLocalStream(audioId, videoId)`: Requests permissions and returns a stream.
- `switchDevice(type, deviceId)`: Dynamically replaces tracks in active peer connections using `RTCRtpSender.replaceTrack()`.

---

## 4. UI/UX Component Plan

### A. Sidebar Enhancements (`ChannelSidebar.tsx`)
- **Category Headers:** Group channels into "Text Channels" and "Voice Channels."
- **Channel Rows:** 
  - Clicking a voice channel joins it.
  - Active users appear in a vertical list immediately below the channel name with a small green "speaking" ring around their avatar.
- **Creation Dropdown:** A small "+" icon next to the Voice category to trigger the creation modal.

### B. Voice Control Panel (`VoiceControlPanel.tsx`)
A persistent widget appearing at the bottom of the sidebar (above the profile) when connected:
- **Connection Status:** "Voice Connected" + Channel Name + Signal Strength icon.
- **Action Buttons:** 
  - **Mute/Unmute** (Mic icon).
  - **Video Toggle** (Camera icon).
  - **Deafen** (Headphone icon).
  - **Disconnect** (Phone-down icon in Red).

### C. Video Grid (`VoiceRoomOverlay.tsx`)
When a voice channel is active, the main chat area can optionally display a grid of participant videos:
- Responsive grid (CSS Grid or Flexbox).
- Local user is always pinned or small.
- Remote audio elements (hidden) to play the incoming streams.

### D. Settings Integration (`ProfileModal.tsx`)
Add a "Voice & Video" tab to the existing settings:
- **Input/Output Selectors:** Custom dropdowns for hardware selection.
- **Input Sensitivity:** A volume meter visualization using `Web Audio API` (AudioContext).
- **Video Preview:** A small `<video>` element to test the camera before joining.

---

## 5. Connection Lifecycle (The "Handshake")

1. **User A joins "General Voice":**
   - Fetches `localStream`.
   - Sends `join_voice` via WebSocket.
2. **User B (Already in room) receives `user_joined_voice` (User A):**
   - B creates an `RTCPeerConnection` for User A.
   - B adds `localStream` tracks to the connection.
   - B creates an `Offer` (SDP) and sends it to User A via DO.
3. **User A receives `rtc_offer` from B:**
   - A creates an `RTCPeerConnection` for User B.
   - A adds its own `localStream` tracks.
   - A sets the Remote Description (B's offer).
   - A creates an `Answer` (SDP) and sends it to User B.
4. **ICE Exchange:**
   - Both exchange `rtc_ice_candidate` messages as the browser finds valid network paths (using STUN).
5. **Stream Success:**
   - `onTrack` event fires on both ends.
   - Store updates, UI renders the new `<audio>` or `<video>`.

---

## 6. Technical Requirements
- **STUN Servers:** Use Google's public servers (`stun:stun.l.google.com:19302`).
- **Permissions:** Robust error handling for `NotAllowedError` or `NotFoundError`.
- **Browser Compatibility:** Use `adapter.js` to ensure consistent WebRTC behavior across Safari (iOS) and Chrome.

---

## 7. Future Scalability (Next Phase)
- **TURN Server:** Required for users behind strict symmetric NATs/Firewalls (e.g., corporate networks).
- **SFU (Selective Forwarding Unit):** Transition from P2P to a media server (like LiveKit or Mediasoup) if room sizes need to exceed 10–15 participants.
