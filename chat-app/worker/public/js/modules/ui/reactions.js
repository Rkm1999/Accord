import { state, updateState } from '../state.js';
import { api } from '../api.js';
import { send } from '../socket.js';
import { apiBaseUrl, isLocalDev } from '../config.js';

/**
 * Initializes listeners for static reaction elements.
 */
export function initReactionListeners() {
    const picker = document.getElementById('reactionPicker');
    if (picker) {
        picker.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-emoji]');
            if (btn) {
                sendReaction(btn.dataset.emoji);
            }
        });
    }

    document.getElementById('openEmojiModalBtn')?.addEventListener('click', () => {
        const modal = document.getElementById('emojiUploadModal');
        if (modal) {
            modal.classList.remove('hidden');
            if (window.lucide) window.lucide.createIcons();
        }
    });
}

/**
 * Toggles the reaction picker visibility and positions it.
 */
export function toggleReactionPicker(event, messageId, isFromMobile = false) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    
    // Check if we should use the mobile bottom sheet
    if (isFromMobile || window.innerWidth < 768) {
        if (isFromMobile && state.selectedMobileMessageId) {
            messageId = parseInt(state.selectedMobileMessageId);
            if (window.closeMobileActionModal) window.closeMobileActionModal(true);
        }
        
        if (messageId === null) {
            const modal = document.getElementById('mobileEmojiModal');
            if (modal && !modal.classList.contains('hidden')) {
                if (window.closeMobileEmojiModal) window.closeMobileEmojiModal(true);
                document.getElementById('message-input')?.focus();
                return;
            }
            if (document.activeElement && document.activeElement.id === 'message-input') {
                document.activeElement.blur();
            }
            if (window.openMobileEmojiModal) window.openMobileEmojiModal(null, true);
        } else {
            if (window.openMobileEmojiModal) window.openMobileEmojiModal(messageId);
        }
        return;
    }

    const picker = document.getElementById('reactionPicker');
    if (!picker) return;

    updateState({ reactionPickerMessageId: messageId });

    const isHidden = picker.classList.contains('hidden');
    if (!isHidden) {
        picker.classList.add('hidden');
        return;
    }

    // Populate custom emojis
    const customSection = document.getElementById('customEmojisInPicker');
    if (customSection) {
        if (state.customEmojis.length === 0) {
            customSection.innerHTML = '<div class="text-[10px] text-[#949BA4] w-full text-center py-2">No custom emojis</div>';
        } else {
            customSection.innerHTML = state.customEmojis.map(emoji => `
                <button class="hover:bg-[#35373C] p-1 rounded transition-colors" data-emoji=":${emoji.name}:">
                    <img src="${isLocalDev ? `${apiBaseUrl}/api/file/${emoji.file_key}` : `/api/file/${emoji.file_key}`}" class="w-6 h-6 object-contain pointer-events-none">
                </button>`).join('');
        }
    }

    picker.classList.remove('hidden');

    // Position picker relative to trigger
    const trigger = event?.target?.closest('.action-trigger') || event?.currentTarget;
    if (trigger && trigger !== document) {
        const rect = trigger.getBoundingClientRect();
        const pickerHeight = picker.offsetHeight;
        const pickerWidth = picker.offsetWidth;

        let top = rect.top - pickerHeight - 10;
        let left = rect.left - pickerWidth / 2 + rect.width / 2;

        if (top < 10) top = rect.bottom + 10;
        if (left < 10) left = 10;
        if (left + pickerWidth > window.innerWidth - 10) left = window.innerWidth - pickerWidth - 10;

        picker.style.top = `${top}px`;
        picker.style.left = `${left}px`;
    }

    if (messageId === null) document.getElementById('message-input')?.focus();
    if (window.lucide) window.lucide.createIcons();
}

/**
 * Sends a reaction to the server or adds emoji to input if messageId is null.
 */
export function sendReaction(emoji) {
    if (state.reactionPickerMessageId !== null) {
        toggleReaction(state.reactionPickerMessageId, emoji);
        document.getElementById('reactionPicker')?.classList.add('hidden');
    } else {
        const input = document.getElementById('message-input');
        if (input) {
            const space = (input.value.length > 0 && !input.value.endsWith(' ')) ? ' ' : '';
            input.value += space + emoji + ' ';
            input.focus();
            // Manually trigger input event to fire height adjustment logic
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }
}

/**
 * Toggles a reaction on a message via WebSocket.
 */
export function toggleReaction(messageId, emoji) {
    if (state.isConnected) {
        send({
            type: 'reaction',
            messageId,
            emoji
        });
    }
}

/**
 * Updates the reaction badges for a specific message.
 */
export function updateMessageReactions(messageId, reactions) {
    const container = document.getElementById(`reactions-${messageId}`);
    if (!container) return;

    if (!reactions || reactions.length === 0) {
        container.innerHTML = '';
        return;
    }

    const grouped = reactions.reduce((acc, r) => {
        acc[r.emoji] = acc[r.emoji] || [];
        acc[r.emoji].push(r.username);
        return acc;
    }, {});

    container.innerHTML = Object.entries(grouped).map(([emoji, users]) => {
        const hasReacted = users.includes(state.username);
        const isCustom = emoji.startsWith(':') && emoji.endsWith(':');
        let emojiDisplay = emoji;

        if (isCustom) {
            const name = emoji.slice(1, -1);
            const customEmoji = state.customEmojis.find(e => e.name === name);
            if (customEmoji) {
                const url = isLocalDev ? `${apiBaseUrl}/api/file/${customEmoji.file_key}` : `/api/file/${customEmoji.file_key}`;
                emojiDisplay = `<img src="${url}" class="w-4 h-4 inline-block">`;
            }
        }

        return `
            <div class="reaction-badge ${hasReacted ? 'active' : ''}" onclick="event.stopPropagation(); window.toggleReaction(${messageId}, '${emoji}')" title="${users.join(', ')}">
                <span>${emojiDisplay}</span>
                <span class="reaction-count">${users.length}</span>
            </div>`;
    }).join('');

    // Animation
    setTimeout(() => {
        const badges = container.querySelectorAll('.reaction-badge');
        badges.forEach(badge => {
            badge.classList.add('updated');
            setTimeout(() => badge.classList.remove('updated'), 300);
        });
    }, 10);
}

/**
 * Handles reactions from mobile long-press menu.
 */
export function sendMobileReaction(emoji) {
    const messageId = parseInt(state.selectedMobileMessageId);
    if (messageId) {
        toggleReaction(messageId, emoji);
        if (window.closeMobileActionModal) window.closeMobileActionModal();
    }
}

// Global exposes
window.toggleReactionPicker = toggleReactionPicker;
window.sendReaction = sendReaction;
window.toggleReaction = toggleReaction;
window.sendMobileReaction = sendMobileReaction;
