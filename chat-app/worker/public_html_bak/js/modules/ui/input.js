import { state, updateState } from '../state.js';
import { api } from '../api.js';
import { basicEscapeHtml, getCaretCoordinates } from '../utils/helpers.js';
import { apiBaseUrl, isLocalDev } from '../config.js';

/**
 * Handles @mention autocomplete logic.
 */
export function handleMentionAutocomplete(e) {
    const input = e.target;
    const value = input.value;
    const selectionStart = input.selectionStart;

    const beforeCursor = value.slice(0, selectionStart);
    const lastAt = beforeCursor.lastIndexOf('@');

    if (lastAt !== -1) {
        const query = beforeCursor.slice(lastAt + 1);
        const charBeforeAt = beforeCursor[lastAt - 1];
        if (!charBeforeAt || /\s/.test(charBeforeAt)) {
            showAutocomplete(query, lastAt);
            return;
        }
    }

    hideAutocomplete();
}

export function showAutocomplete(query, atIndex) {
    const autocomplete = document.getElementById('mentionAutocomplete');
    const filteredUsers = state.allUsers.filter(u =>
        u.username.toLowerCase().includes(query.toLowerCase()) ||
        (u.display_name && u.display_name.toLowerCase().includes(query.toLowerCase()))
    ).slice(0, 8);

    if (filteredUsers.length === 0) {
        hideAutocomplete();
        return;
    }

    updateState({ filteredUsers, selectedAutocompleteIndex: 0 });
    renderAutocomplete(filteredUsers, atIndex);
    autocomplete.classList.remove('hidden');
}

export function renderAutocomplete(users, atIndex) {
    const autocomplete = document.getElementById('mentionAutocomplete');
    const selectedIndex = state.selectedAutocompleteIndex || 0;
    
    autocomplete.innerHTML = users.map((user, index) => {
        const displayName = user.display_name || user.username;
        const avatarUrl = user.avatar_key
            ? (isLocalDev ? `${apiBaseUrl}/api/file/${user.avatar_key}` : `/api/file/${user.avatar_key}`)
            : `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`;

        return `
            <div class="autocomplete-item ${index === selectedIndex ? 'selected' : ''}" onclick="window.selectMention(${JSON.stringify(user).replace(/"/g, '&quot;')}, ${atIndex})">
                <img src="${avatarUrl}" class="w-6 h-6 rounded-full mr-2 object-cover">
                <div class="flex flex-col">
                    <span class="text-sm font-medium text-[#dbdee1]">${basicEscapeHtml(displayName)}</span>
                    <span class="text-xs text-[#949BA4]">@${basicEscapeHtml(user.username)}</span>
                </div>
            </div>`;
    }).join('');
}

export function hideAutocomplete() {
    const autocomplete = document.getElementById('mentionAutocomplete');
    if (autocomplete) autocomplete.classList.add('hidden');
}

export function selectMention(user, atIndex) {
    if (!user) return;
    const input = document.getElementById('message-input');
    const value = input.value;
    const selectionStart = input.selectionStart;
    const beforeCursor = value.slice(0, selectionStart);

    if (atIndex === undefined) {
        atIndex = beforeCursor.lastIndexOf('@');
    }

    const afterMention = value.slice(selectionStart);
    const newValue = value.slice(0, atIndex) + '@' + user.username + ' ' + afterMention;

    input.value = newValue;
    const newCursorPos = atIndex + user.username.length + 2;
    input.setSelectionRange(newCursorPos, newCursorPos);
    
    input.style.height = 'auto';
    input.style.height = (input.scrollHeight) + 'px';
    
    input.focus();
    hideAutocomplete();
}

export function handleAutocompleteKeydown(e) {
    const autocomplete = document.getElementById('mentionAutocomplete');
    if (autocomplete.classList.contains('hidden')) return;

    const filteredUsers = state.filteredUsers || [];
    let selectedIndex = state.selectedAutocompleteIndex || 0;

    if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex = (selectedIndex - 1 + filteredUsers.length) % filteredUsers.length;
        updateState({ selectedAutocompleteIndex: selectedIndex });
        renderAutocomplete(filteredUsers);
    } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex = (selectedIndex + 1) % filteredUsers.length;
        updateState({ selectedAutocompleteIndex: selectedIndex });
        renderAutocomplete(filteredUsers);
    } else if (e.key === 'Escape') {
        hideAutocomplete();
    } else if (e.key === 'Tab') {
        e.preventDefault();
        selectMention(filteredUsers[selectedIndex]);
    }
}

import { 
    handleFileSelect, handlePaste, handleDragEnter, handleDragOver, handleDragLeave, handleDrop,
    uploadFileWithProgress, updateSendButtonVisibility, hideFilePreview
} from './upload.js';

/**
 * Initializes listeners for static input elements.
 */
export function initInputListeners() {
    document.querySelectorAll('.tooltip-btn').forEach(btn => {
        if (btn.dataset.marker) {
            btn.addEventListener('click', () => applyMarkdown(btn.dataset.marker));
        }
    });

    document.getElementById('tooltip-spoiler-btn')?.addEventListener('click', wrapSelectionWithSpoiler);

    document.getElementById('fileInput')?.addEventListener('change', handleFileSelect);
    document.getElementById('attach-file-btn')?.addEventListener('click', () => document.getElementById('fileInput')?.click());
}

/**
 * Text Selection Tooltip Logic
 */
export function handleTextSelection() {
    const tooltip = document.getElementById('selection-tooltip');
    if (!tooltip) return;

    const input = document.getElementById('message-input');
    if (!input) return;

    const start = input.selectionStart;
    const end = input.selectionEnd;

    if (start !== end) {
        tooltip.classList.remove('hidden');
        tooltip.style.display = 'flex';
        tooltip.style.pointerEvents = 'auto';
        
        const coords = getCaretCoordinates(input, start);
        const rect = input.getBoundingClientRect();
        
        const tooltipWidth = tooltip.offsetWidth;
        const tooltipHeight = tooltip.offsetHeight;
        
        let top = rect.top + coords.top - input.scrollTop - tooltipHeight - 10;
        let left = rect.left + coords.left - input.scrollLeft + (getCaretCoordinates(input, end).left - coords.left) / 2 - (tooltipWidth / 2);
        
        if (top < 10) top = rect.top + coords.top - input.scrollTop + 30;
        if (left < 10) left = 10;
        if (left + tooltipWidth > window.innerWidth - 10) left = window.innerWidth - tooltipWidth - 10;
        
        tooltip.style.top = `${top}px`;
        tooltip.style.left = `${left}px`;
        
        if (window.lucide) window.lucide.createIcons();
    } else {
        tooltip.classList.add('hidden');
    }
}

export function applyMarkdown(marker) {
    const input = document.getElementById('message-input');
    const tooltip = document.getElementById('selection-tooltip');
    if (!input) return;

    const start = input.selectionStart;
    const end = input.selectionEnd;
    const val = input.value;

    if (start !== end) {
        const selectedText = val.substring(start, end);
        const markerLen = marker.length;
        
        if (selectedText.startsWith(marker) && selectedText.endsWith(marker)) {
            input.value = val.substring(0, start) + selectedText.substring(markerLen, selectedText.length - markerLen) + val.substring(end);
            input.setSelectionRange(start, end - (markerLen * 2));
        } else {
            input.value = val.substring(0, start) + marker + selectedText + marker + val.substring(end);
            input.setSelectionRange(start, end + (markerLen * 2));
        }
        
        tooltip.classList.add('hidden');
        input.focus();
        input.style.height = 'auto';
        input.style.height = input.scrollHeight + 'px';
        if (window.updateSendButtonVisibility) window.updateSendButtonVisibility();
    }
}

export function wrapSelectionWithSpoiler() {
    applyMarkdown('||');
}

// Global exposes for generated HTML and legacy listeners
window.selectMention = selectMention;
window.applyMarkdown = applyMarkdown;
window.wrapSelectionWithSpoiler = wrapSelectionWithSpoiler;
