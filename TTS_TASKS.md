# TTS Implementation Tasks (Sender-Side)

## Phase 1: State Management & UI Refinement
- [x] **Update `useVoiceStore.ts`**: (Already has `isTtsEnabled`).
- [x] **Update `VoiceControlPanel.tsx` Tooltips**: Update descriptions to "Send messages as TTS".

## Phase 2: Message Sending
- [x] **Update `ChatInput.tsx`**:
    - [x] Import `useVoiceStore`.
    - [x] In `handleSend`, include `tts: voiceStore.isTtsEnabled` in the message payload.

## Phase 3: Receiver Logic
- [x] **Update `socket.ts`**:
    - [x] Change `case 'chat'` logic to check for `data.tts === true` instead of `voiceStore.isTtsEnabled`.
    - [x] Maintain checks for `channelId` matching `voiceStore.activeVoiceChannelId`.
    - [x] Maintain message sanitization and self-message exclusion.

## Phase 4: Verification
- [x] **Verify Build**
- [x] **Deploy to Worker**
