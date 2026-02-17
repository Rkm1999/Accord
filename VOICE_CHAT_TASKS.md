# Voice & Video Chat Task Breakdown

This list breaks down the [Voice Chat Implementation Plan](./VOICE_CHAT_IMPLEMENTATION_PLAN.md) into actionable development tasks.

## Phase 1: Foundation & Database
- [x] **Database Migration:** Create a migration to add `kind` column to `channels` table (defaulting to 'text').
- [x] **API Update:** Update the `Channel` type in both frontend and backend to include the `kind` field.
- [x] **State Separation:** Update `useChatStore` and backend to track `activeVoiceChannelId` independently of the current text channel.
- [x] **Signaling Logic (Backend):** 
    - [x] Update `ChatRoom.ts` to maintain `voiceRoomMembers` state.
    - [x] Implement `join_voice` and `leave_voice` WebSocket event handlers.
    - [x] Add cleanup logic in `webSocketClose` to remove users from voice rooms on disconnect.
    - [x] Implement `rtc_signal` relay logic to target specific users for WebRTC handshakes.

## Phase 2: Frontend State & Device Management
- [x] **Voice Store:** Create `src/store/useVoiceStore.ts` to track active channel, local/remote streams, and peer connections.
- [x] **Device Utility:** Create `src/lib/devices.ts` to handle `enumerateDevices` and `getUserMedia`.
- [x] **Hardware Persistence:** Logic to save/load preferred device IDs from `localStorage`.
- [x] **Speaking Detection:** Implement `AudioContext` analyzer to detect when the local user is talking.
- [x] **Settings UI:**
    - [x] Add "Voice & Video" tab to `ProfileModal.tsx`.
    - [x] Implement dropdowns for Mic, Camera, and Speaker selection.
    - [x] Add a live camera preview and mic activity meter.

## Phase 3: Sidebar & Channel UI
- [x] **Sidebar Restructure:** Update `ChannelSidebar.tsx` to group channels by "Text" and "Voice" categories.
- [x] **Voice Channel Creation:** Update `CreateChannelModal.tsx` to allow selecting the channel type.
- [x] **Participant List:** Implement the real-time list of users appearing under an active voice channel name.
- [x] **Voice Control Panel:** Create `VoiceControlPanel.tsx` at the bottom of the sidebar with Mute, Video, Deafen, and Disconnect buttons.

## Phase 4: WebRTC Core (The Handshake)
- [x] **Connection Manager:** Implement the logic to create `RTCPeerConnection` when a `user_joined_voice` event is received.
- [x] **Signal Handling:** Implement frontend handlers for `rtc_offer`, `rtc_answer`, and `rtc_ice_candidate`.
- [x] **Stream Integration:** Logic to add local tracks to peers and capture remote tracks (`onTrack`) into the store.

## Phase 5: Media Rendering & Polish
- [x] **Video Grid:** Create `VoiceRoomOverlay.tsx` to render participant videos in a responsive grid when a voice channel is active.
- [x] **Audio Elements:** Ensure remote audio streams are played through hidden `<audio>` elements.
- [x] **Visual Feedback:** Add a "speaking" indicator (green ring) around avatars in the sidebar based on audio levels.
- [x] **Error Handling:** Add UI prompts for "Camera/Mic Permission Denied" and "Connection Failed" states.
