import { state, updateState } from '../state.js';
import { startReply, scrollToBottom, openEditModal, deleteMessage } from '../ui/messages.js';
import { toggleReaction, toggleReactionPicker } from '../ui/reactions.js';
import { openEmojiUploadModal } from '../ui/modals.js';
import { isIOS, apiBaseUrl, isLocalDev } from '../config.js';
import { downloadFile } from '../utils/downloader.js';

/**
 * Initializes listeners for static mobile UI elements.
 */
export function initMobileListeners() {
    document.querySelectorAll('.mobile-picker-emoji-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const emoji = btn.dataset.emoji;
            sendMobileReaction(emoji);
        });
    });

    document.getElementById('mobileReactionPickerPlusBtn')?.addEventListener('click', (e) => {
        toggleReactionPicker(e, null, true);
    });

    document.getElementById('mobile-download-btn')?.addEventListener('click', () => handleMobileAction('download'));
    document.getElementById('mobile-reply-btn')?.addEventListener('click', () => handleMobileAction('reply'));
    document.getElementById('mobile-edit-btn')?.addEventListener('click', () => handleMobileAction('edit'));
    document.getElementById('mobile-copy-btn')?.addEventListener('click', () => handleMobileAction('copy'));
    document.getElementById('mobile-delete-btn')?.addEventListener('click', () => handleMobileAction('delete'));

    document.getElementById('mobileEmojiModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'mobileEmojiModal') closeMobileEmojiModal();
    });

    document.getElementById('mobileActionModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'mobileActionModal') closeMobileActionModal();
    });

    document.getElementById('mobileOpenEmojiModalBtn')?.addEventListener('click', () => {
        openEmojiUploadModal();
    });

    const emojiModal = document.getElementById('mobileEmojiModal');
    if (emojiModal) {
        emojiModal.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-emoji]');
            if (btn) {
                sendEmojiFromMobile(btn.dataset.emoji);
            }
        });
    }

    // Sidebar touch overlays
    document.getElementById('sidebar-overlay')?.addEventListener('click', closeAllSidebars);

    setupModalDrag();
    setupEmojiModalDrag();
    setupSidebarSwipeHandlers();
}

/**
 * Swipe gesture detection for mobile sidebars.
 */
export function setupSidebarSwipeHandlers() {
    const app = document.getElementById('app');
    if (!app || window.innerWidth >= 1024) return;

    let startX = 0, startY = 0;
    let activeSidebar = null;
    let dragStartX = 0;
    const edgeThreshold = 40;
    const sidebarWidth = 240;

    app.addEventListener('touchstart', (e) => {
        if (window.innerWidth >= 1024) return;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;

        const channelSidebar = document.getElementById('channel-sidebar');
        const membersSidebar = document.getElementById('members-sidebar');
        
        const isChannelOpen = channelSidebar?.classList.contains('active');
        const isMembersOpen = membersSidebar?.classList.contains('active');

        // Edge detection or start on open sidebar
        if ((!isChannelOpen && !isMembersOpen && startX < edgeThreshold) || (isChannelOpen && startX < sidebarWidth)) {
            activeSidebar = channelSidebar;
            dragStartX = startX;
            channelSidebar.classList.add('dragging');
            document.getElementById('sidebar-overlay')?.classList.remove('hidden');
            document.getElementById('sidebar-overlay')?.classList.add('dragging');
        } else if ((!isChannelOpen && !isMembersOpen && startX > window.innerWidth - edgeThreshold) || (isMembersOpen && startX > window.innerWidth - sidebarWidth)) {
            activeSidebar = membersSidebar;
            dragStartX = startX;
            membersSidebar.classList.add('dragging');
            document.getElementById('sidebar-overlay')?.classList.remove('hidden');
            document.getElementById('sidebar-overlay')?.classList.add('dragging');
        }
    }, { passive: true });

    app.addEventListener('touchmove', (e) => {
        if (!activeSidebar) return;
        const currentX = e.touches[0].clientX;
        const currentY = e.touches[0].clientY;

        if (Math.abs(currentY - startY) > 50 && Math.abs(currentX - startX) < 20) {
            activeSidebar = null;
            return;
        }

        const isChannel = activeSidebar.id === 'channel-sidebar';
        const isAlreadyOpen = activeSidebar.classList.contains('active');
        const overlay = document.getElementById('sidebar-overlay');

        if (isChannel) {
            let offset = isAlreadyOpen ? (sidebarWidth + (currentX - startX)) : currentX;
            offset = Math.min(Math.max(offset, 0), sidebarWidth);
            activeSidebar.style.transform = `translateX(${offset - sidebarWidth}px)`;
            activeSidebar.style.opacity = '1';
            activeSidebar.style.visibility = 'visible';
            if (overlay) {
                overlay.style.display = 'block';
                overlay.style.visibility = 'visible';
                overlay.style.opacity = offset / sidebarWidth;
            }
        } else {
            const screenWidth = window.innerWidth;
            let offset = isAlreadyOpen ? (sidebarWidth + (startX - currentX)) : (screenWidth - currentX);
            offset = Math.min(Math.max(offset, 0), sidebarWidth);
            activeSidebar.style.transform = `translateX(${sidebarWidth - offset}px)`;
            activeSidebar.style.opacity = '1';
            activeSidebar.style.visibility = 'visible';
            if (overlay) {
                overlay.style.display = 'block';
                overlay.style.visibility = 'visible';
                overlay.style.opacity = offset / sidebarWidth;
            }
        }
    }, { passive: true });

    app.addEventListener('touchend', (e) => {
        if (!activeSidebar) return;
        const endX = e.changedTouches[0].clientX;
        const diffX = endX - startX;
        const isChannel = activeSidebar.id === 'channel-sidebar';
        const isAlreadyOpen = activeSidebar.classList.contains('active');
        const overlay = document.getElementById('sidebar-overlay');

        let shouldBeOpen = false;
        const dragDistance = isChannel ? (isAlreadyOpen ? sidebarWidth + diffX : diffX) : (isAlreadyOpen ? sidebarWidth - diffX : -diffX);
        if (dragDistance > 80) shouldBeOpen = true;

        activeSidebar.classList.remove('dragging');
        overlay?.classList.remove('dragging');
        activeSidebar.style.transform = '';
        activeSidebar.style.opacity = '';
        activeSidebar.style.visibility = '';
        if (overlay) {
            overlay.style.opacity = '';
            overlay.style.display = '';
            overlay.style.visibility = '';
        }

        const sidebar = activeSidebar;
        if (shouldBeOpen) {
            sidebar.classList.add('active');
            overlay?.classList.add('visible');
        } else {
            sidebar.classList.remove('active');
            overlay?.classList.remove('visible');
            setTimeout(() => {
                if (!sidebar.classList.contains('active')) overlay?.classList.add('hidden');
            }, 300);
        }
        activeSidebar = null;
    }, { passive: true });
}

/**
 * Drag-to-close logic for the mobile action modal.
 */
function setupModalDrag() {
    const modal = document.getElementById('mobileActionModal');
    const content = document.getElementById('mobileActionContent');
    if (!content || !modal) return;

    let startY = 0;
    let isDragging = false;

    content.addEventListener('touchstart', (e) => {
        if (e.target.closest('button')) return;
        startY = e.touches[0].clientY;
        isDragging = true;
        content.style.transition = 'none';
    }, { passive: true });

    modal.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        const currentY = e.touches[0].clientY;
        const diffY = currentY - startY;

        if (diffY > 0) {
            content.style.transform = `translateY(${diffY}px)`;
            modal.style.backgroundColor = `rgba(0, 0, 0, ${0.6 * (1 - diffY / window.innerHeight)})`;
        }
    }, { passive: true });

    modal.addEventListener('touchend', (e) => {
        if (!isDragging) return;
        isDragging = false;
        content.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
        modal.style.backgroundColor = '';
        
        const diffY = e.changedTouches[0].clientY - startY;
        if (diffY > window.innerHeight * 0.2) closeMobileActionModal();
        else content.style.transform = 'translateY(0)';
    }, { passive: true });
}

/**
 * Drag-to-close logic for the mobile emoji picker.
 */
function setupEmojiModalDrag() {
    const modal = document.getElementById('mobileEmojiModal');
    const content = document.getElementById('mobileEmojiContent');
    const scrollArea = document.getElementById('mobileEmojiScrollArea');
    if (!content || !modal || !scrollArea) return;

    let startY = 0;
    let isDragging = false;

    content.addEventListener('touchstart', (e) => {
        if (state.reactionPickerMessageId === null) return;
        if (scrollArea.contains(e.target) && scrollArea.scrollTop > 0) return;
        if (e.target.closest('button')) return;
        
        startY = e.touches[0].clientY;
        isDragging = true;
        content.style.transition = 'none';
    }, { passive: true });

    modal.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        const currentY = e.touches[0].clientY;
        const diffY = currentY - startY;

        if (diffY > 0) {
            content.style.transform = `translateY(${diffY}px)`;
            modal.style.backgroundColor = `rgba(0, 0, 0, ${0.6 * (1 - diffY / window.innerHeight)})`;
        }
    }, { passive: true });

    modal.addEventListener('touchend', (e) => {
        if (!isDragging) return;
        isDragging = false;
        content.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
        modal.style.backgroundColor = '';
        
        const diffY = e.changedTouches[0].clientY - startY;
        if (diffY > window.innerHeight * 0.2) closeMobileEmojiModal();
        else content.style.transform = 'translateY(0)';
    }, { passive: true });
}

/**
 * Dismisses the mobile keyboard.
 */
export function dismissKeyboard() {
    document.getElementById('message-input')?.blur();
    closeMobileEmojiModal();
}

/**
 * Sidebar Toggle Logic
 */
export function closeAllSidebars() {
    if (window.innerWidth >= 1024) return;
    dismissKeyboard();

    document.getElementById('channel-sidebar')?.classList.remove('active');
    document.getElementById('members-sidebar')?.classList.remove('active');
    document.getElementById('sidebar-overlay')?.classList.remove('visible');
}

export function toggleSidebar(id) {
    if (window.innerWidth >= 1024) return;
    dismissKeyboard();

    const sidebar = document.getElementById(id);
    const otherId = id === 'channel-sidebar' ? 'members-sidebar' : 'channel-sidebar';
    const otherSidebar = document.getElementById(otherId);
    const overlay = document.getElementById('sidebar-overlay');

    if (!sidebar || !overlay) return;

    sidebar.style.transform = '';
    sidebar.style.opacity = '';
    overlay.style.opacity = '';
    overlay.style.display = '';

    if (!sidebar.classList.contains('active')) {
        otherSidebar?.classList.remove('active');
        sidebar.classList.add('active');
        overlay.classList.add('visible');
    } else {
        sidebar.classList.remove('active');
        overlay.classList.remove('visible');
    }
}

/**
 * Mobile Action Modal (Long Press Menu)
 */
export function openMobileActionModal(messageId) {
    updateState({ selectedMobileMessageId: messageId });
    const modal = document.getElementById('mobileActionModal');
    const content = document.getElementById('mobileActionContent');
    const msgEl = document.querySelector(`[data-message-id="${messageId}"]`);
    
    if (!modal || !content || !msgEl) return;

    if ('vibrate' in navigator) {
        try { navigator.vibrate(50); } catch (e) {}
    }

    msgEl.style.backgroundColor = 'rgba(88, 101, 242, 0.15)';
    const isOwn = msgEl.dataset.username === state.username;
    
    document.getElementById('mobile-edit-btn').style.display = isOwn ? 'flex' : 'none';
    document.getElementById('mobile-delete-btn').style.display = isOwn ? 'flex' : 'none';
    
    const downloadBtn = document.getElementById('mobile-download-btn');
    if (msgEl.dataset.fileKey) {
        downloadBtn.classList.remove('hidden');
        downloadBtn.style.display = 'flex';
    } else {
        downloadBtn.classList.add('hidden');
        downloadBtn.style.display = 'none';
    }

    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.style.opacity = '1';
        content.style.transform = 'translateY(0)';
    }, 10);
    if (window.lucide) lucide.createIcons();
}

export function closeMobileActionModal(immediate = false) {
    const modal = document.getElementById('mobileActionModal');
    const content = document.getElementById('mobileActionContent');
    
    if (!modal || !content) return;

    if (state.selectedMobileMessageId) {
        const msgEl = document.querySelector(`[data-message-id="${state.selectedMobileMessageId}"]`);
        if (msgEl) msgEl.style.backgroundColor = '';
    }

    if (immediate) {
        modal.classList.add('hidden');
        modal.style.opacity = '0';
        content.style.transform = 'translateY(100%)';
        updateState({ selectedMobileMessageId: null });
        return;
    }

    content.style.transform = 'translateY(100%)';
    modal.style.opacity = '0';
    setTimeout(() => {
        modal.classList.add('hidden');
        updateState({ selectedMobileMessageId: null });
    }, 300);
}

export function handleMobileAction(action) {
    const messageId = parseInt(state.selectedMobileMessageId);
    if (!messageId) return;

    const msgEl = document.querySelector(`[data-message-id="${messageId}"]`);
    closeMobileActionModal();

    switch(action) {
        case 'download':
            if (msgEl?.dataset.fileKey) {
                const fileUrl = isLocalDev ? `${apiBaseUrl}/api/file/${msgEl.dataset.fileKey}` : `/api/file/${msgEl.dataset.fileKey}`;
                downloadFile(fileUrl, msgEl.dataset.fileName || 'download');
            }
            break;
        case 'reply': startReply(messageId); break;
        case 'edit': openEditModal(messageId); break;
        case 'copy':
            if (msgEl?.dataset.text) navigator.clipboard.writeText(msgEl.dataset.text);
            break;
        case 'delete': deleteMessage(messageId); break;
    }
}

/**
 * Mobile Emoji Picker
 */
export function openMobileEmojiModal(messageId, isKeyboardMode = false) {
    updateState({ reactionPickerMessageId: messageId });
    const modal = document.getElementById('mobileEmojiModal');
    const content = document.getElementById('mobileEmojiContent');
    const spacer = document.getElementById('mobile-emoji-spacer');
    const handle = document.getElementById('mobile-emoji-handle');
    
    if (!modal || !content) return;

    if (isKeyboardMode && spacer) {
        handle?.classList.add('hidden');
        modal.style.backgroundColor = 'transparent';
        modal.style.pointerEvents = 'none';
        content.style.pointerEvents = 'auto';
        
        const input = document.getElementById('message-input');
        if (input) input.inputMode = 'none';

        // Use a default or stored height if not detected yet
        const h = state.lastKnownKeyboardHeight || 300;
        spacer.style.height = `${h}px`;
        spacer.classList.remove('hidden');
        content.style.height = `${h}px`;
        content.style.maxHeight = `${h}px`;
        setTimeout(scrollToBottom, 100);
    } else {
        handle?.classList.remove('hidden');
        modal.style.backgroundColor = '';
        modal.style.pointerEvents = '';
        content.style.pointerEvents = '';
        content.style.height = '';
        content.style.maxHeight = '';
        spacer?.classList.add('hidden');
        const input = document.getElementById('message-input');
        if (input) input.inputMode = '';
    }

    const customContainer = document.getElementById('mobileCustomEmojis');
    if (customContainer) {
        customContainer.innerHTML = state.customEmojis.length === 0 
            ? '<div class="col-span-full text-center py-4 text-[#949BA4] text-sm">No custom emojis yet</div>'
            : state.customEmojis.map(emoji => `
                <button class="bg-[#1E1F22] aspect-square rounded-xl flex items-center justify-center p-2" data-emoji=":${emoji.name}:">
                    <img src="${isLocalDev ? `${apiBaseUrl}/api/file/${emoji.file_key}` : `/api/file/${emoji.file_key}`}" class="w-full h-full object-contain pointer-events-none">
                </button>`).join('');
    }

    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.style.opacity = '1';
        content.style.transform = 'translateY(0)';
    }, 10);
}

export function closeMobileEmojiModal(immediate = false) {
    const modal = document.getElementById('mobileEmojiModal');
    const content = document.getElementById('mobileEmojiContent');
    const spacer = document.getElementById('mobile-emoji-spacer');
    
    if (!modal || !content) return;

    if (immediate) {
        modal.classList.add('hidden');
        modal.style.opacity = '0';
        content.style.transform = 'translateY(100%)';
        spacer?.classList.add('hidden');
        updateState({ reactionPickerMessageId: null });
        const input = document.getElementById('message-input');
        if (input) input.inputMode = '';
        return;
    }

    content.style.transform = 'translateY(100%)';
    modal.style.opacity = '0';
    spacer?.classList.add('hidden');
    setTimeout(() => {
        modal.classList.add('hidden');
        updateState({ reactionPickerMessageId: null });
        const input = document.getElementById('message-input');
        if (input) input.inputMode = '';
    }, 300);
}

export function sendEmojiFromMobile(emoji) {
    if (state.reactionPickerMessageId !== null) {
        toggleReaction(state.reactionPickerMessageId, emoji);
        closeMobileEmojiModal();
    } else {
        const input = document.getElementById('message-input');
        if (input) {
            const space = (input.value.length > 0 && !input.value.endsWith(' ')) ? ' ' : '';
            input.value += space + emoji + ' ';
            input.focus();
            // Trigger height calculation and send button visibility
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }
}

/**
 * Message Swipe Handler Initialization
 */
export function setupMessageSwipeHandlers() {
    const container = document.getElementById('messages-container');
    if (!container) return;

    const observer = new MutationObserver((mutations) => {
        mutations.forEach((m) => m.addedNodes.forEach((n) => {
            if (n.nodeType === 1 && n.classList?.contains('message-group')) attachSwipeHandler(n);
        }));
    });

    observer.observe(container, { childList: true });
    container.querySelectorAll('.message-group').forEach(attachSwipeHandler);
}

function attachSwipeHandler(el) {
    let startX = 0, startY = 0, determined = false, horizontal = false;
    let longPressTimer = null;
    const threshold = 100;

    el.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        determined = false;
        horizontal = false;

        if (longPressTimer) clearTimeout(longPressTimer);
        longPressTimer = setTimeout(() => {
            if (!determined) {
                const id = el.dataset.messageId;
                if (id) openMobileActionModal(id);
            }
        }, 500);
    }, { passive: true });

    el.addEventListener('touchmove', (e) => {
        const currentX = e.touches[0].clientX;
        const currentY = e.touches[0].clientY;
        const dx = currentX - startX;
        const dy = currentY - startY;

        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        }

        if (!determined) {
            if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
                determined = true;
                horizontal = Math.abs(dx) > Math.abs(dy) * 1.5 && dx < 0;
            }
            return;
        }

        if (horizontal) {
            const swipe = Math.min(Math.abs(dx), threshold);
            el.style.transform = `translateX(-${swipe}px)`;
            const indicator = el.querySelector('.reply-swipe-indicator');
            if (indicator) {
                indicator.style.opacity = Math.min(swipe / 50, 1);
                indicator.style.transform = `translateY(-50%) translateX(${Math.max(0, threshold - swipe)}px)`;
            }
        }
    }, { passive: true });

    el.addEventListener('touchend', (e) => {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
        const dx = e.changedTouches[0].clientX - startX;
        el.style.transform = '';
        const indicator = el.querySelector('.reply-swipe-indicator');
        if (indicator) {
            indicator.style.opacity = '0';
            indicator.style.transform = 'translateY(-50%) translateX(100%)';
        }

        if (horizontal && Math.abs(dx) > threshold * 0.7) {
            const id = el.dataset.messageId;
            if (id) startReply(parseInt(id));
        }
    }, { passive: true });
}

// Global exposes
window.dismissKeyboard = dismissKeyboard;
window.closeAllSidebars = closeAllSidebars;
window.toggleSidebar = toggleSidebar;
window.openMobileActionModal = openMobileActionModal;
window.closeMobileActionModal = closeMobileActionModal;
window.handleMobileAction = handleMobileAction;
window.openMobileEmojiModal = openMobileEmojiModal;
window.closeMobileEmojiModal = closeMobileEmojiModal;
window.sendEmojiFromMobile = sendEmojiFromMobile;
