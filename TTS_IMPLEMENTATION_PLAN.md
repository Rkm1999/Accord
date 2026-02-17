# TTS Implementation Plan (Sender-Side Trigger)

This plan outlines the implementation of a browser-based Text-to-Speech (TTS) system for Accord. The system will allow a sender to mark a message for TTS, which will then be read aloud automatically by receivers in the same voice channel.

## 1. Goal
Provide a toggleable feature for senders to mark their messages as TTS. When a message with the `tts: true` flag is received by someone in the same voice channel, their browser will use the native `window.speechSynthesis` API to read it.

## 2. Technical Approach: Sender-Side Trigger
- **Sender:** Toggles a "Send as TTS" mode. When active, all chat messages sent include a `tts: true` property.
- **Receiver:** If they are in the same voice channel as the message's destination, their browser generates the audio locally.

## 3. Implementation Steps

### Step 1: State Management (`useVoiceStore.ts`)
- Keep `isTtsEnabled: boolean` but rename its intent (internally or via tooltip) to "Send messages as TTS".
- This state controls whether the `tts` flag is added to outgoing messages.

### Step 2: UI Integration (`VoiceControlPanel.tsx`)
- Keep the toggle button.
- **Tooltip Update:** Change to "Send messages as TTS" / "Send messages normally".
- **Visuals:** Keep existing active/inactive styling.

### Step 3: Message Sending (`ChatInput.tsx`)
- When calling `socketClient.send` for a 'chat' message:
    1.  Check `voiceStore.isTtsEnabled`.
    2.  If true, add `tts: true` to the message payload.

### Step 4: Core Logic (Receiver Processing in `socket.ts`)
Inside the `handleMessage` function, specifically for `case 'chat'`:
1.  **Condition:** If `data.tts === true` AND `data.channelId === voiceStore.activeVoiceChannelId`.
2.  **Formatting:** Prepare a string: `"${data.displayName} says: ${data.message}"`.
3.  **Execution:** Use `window.speechSynthesis.speak()`.

### Step 5: Refinements & Edge Cases
- **Self-TTS:** The sender might not want to hear their own TTS. We should probably keep the "exclude self-messages" check or make it a preference.
- **Platform Handling:** Ensure `speechSynthesis` exists before calling.
- **Clean up:** Call `window.speechSynthesis.cancel()` on disconnect.

## 4. File Changes Required
1.  `chat-app/frontend/src/store/useVoiceStore.ts` (Renaming/Clarification)
2.  `chat-app/frontend/src/components/chat/VoiceControlPanel.tsx` (Tooltip updates)
3.  `chat-app/frontend/src/components/chat/ChatInput.tsx` (Adding the flag to outgoing messages)
4.  `chat-app/frontend/src/lib/socket.ts` (Triggering based on message flag instead of local state)
