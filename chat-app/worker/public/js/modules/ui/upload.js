import { state, updateState } from '../state.js';
import { api } from '../api.js';
import { getFileIcon, formatFileSize, basicEscapeHtml } from '../utils/helpers.js';
import { maintainScrollBottom } from './messages.js';

/**
 * Handles file selection from input.
 */
export function handleFileSelect(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    if (state.selectedFiles.length + files.length > 20) {
        alert('You can only upload up to 20 files at a time.');
        return;
    }

    files.forEach(file => {
        if (file.size > 50 * 1024 * 1024) {
            alert(`File "${file.name}" is too large (max 50MB).`);
        } else {
            processFile(file);
        }
    });

    event.target.value = ''; // Reset input
}

/**
 * Processes a file for staging.
 */
export function processFile(file) {
    const fileItem = {
        file: file,
        name: file.name,
        type: file.type,
        size: file.size,
        isSpoiler: false,
        previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null
    };

    state.selectedFiles.push(fileItem);
    showFilePreview();
    updateSendButtonVisibility();
}

/**
 * Clipboard paste handler.
 */
export function handlePaste(event) {
    const items = Array.from(event.clipboardData?.items || []);
    const files = [];

    for (const item of items) {
        if (item.type.startsWith('image/') || item.type.startsWith('video/')) {
            const file = item.getAsFile();
            if (file) files.push(file);
        }
    }

    if (files.length > 0) {
        event.preventDefault();
        files.forEach(file => processFile(file));
    }
}

/**
 * Drag and drop handlers.
 */
export function handleDragEnter(event) {
    event.preventDefault();
    event.stopPropagation();
    const overlay = document.getElementById('drag-drop-overlay');
    if (overlay) {
        overlay.classList.remove('hidden');
        if (window.lucide) window.lucide.createIcons();
    }
}

export function handleDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
}

export function handleDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    const overlay = document.getElementById('drag-drop-overlay');
    const relatedTarget = event.relatedTarget;
    if (overlay && (!relatedTarget || !overlay.contains(relatedTarget))) {
        overlay.classList.add('hidden');
    }
}

export function handleDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    document.getElementById('drag-drop-overlay')?.classList.add('hidden');

    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) {
        files.forEach(file => processFile(file));
    }
}

/**
 * Calculates SHA-256 hash of a file for deduplication.
 */
export async function calculateFileHash(file) {
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Uploads a file with progress tracking and deduplication.
 */
export async function uploadFileWithProgress(fileItem, index, onProgress) {
    // 1. Deduplication Check
    try {
        const hash = await calculateFileHash(fileItem.file);
        const checkData = await api.checkFileHash(hash);
        if (checkData.exists) {
            if (onProgress) onProgress(100);
            return {
                name: fileItem.name,
                type: fileItem.type,
                size: fileItem.size,
                key: checkData.key,
                isSpoiler: fileItem.isSpoiler
            };
        }
    } catch (e) {
        console.warn('Deduplication check failed', e);
    }

    // 2. Actual Upload
    return await api.uploadFile(fileItem.file, state.username, onProgress);
}

/**
 * Renders file previews in the input area.
 */
export function showFilePreview() {
    maintainScrollBottom(() => {
        const preview = document.getElementById('filePreview');
        if (state.selectedFiles.length === 0) {
            hideFilePreview();
            return;
        }

        preview.classList.remove('hidden');
        preview.innerHTML = state.selectedFiles.map((file, index) => {
            const isSpoiler = file.isSpoiler;
            const spoilerClass = isSpoiler ? 'border-[#faa61a] ring-2 ring-[#faa61a]/50' : 'border-[#404249]';
            const icon = isSpoiler ? 'eye' : 'eye-off';

            if (file.type.startsWith('image/')) {
                return `
                    <div class="relative group" id="preview-${index}">
                        <img src="${file.previewUrl}" class="w-16 h-16 rounded-lg object-cover border ${spoilerClass}">
                        <button type="button" class="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center" onclick="window.removeFile(${index})">✕</button>
                        <button type="button" class="absolute -bottom-1 -right-1 ${isSpoiler ? 'bg-[#faa61a]' : 'bg-[#232428]'} text-white rounded-full w-6 h-6 flex items-center justify-center border border-[#404249]" onclick="window.toggleFileSpoiler(${index})">
                            <i data-lucide="${icon}" class="w-3.5 h-3.5"></i>
                        </button>
                        <div class="upload-progress-container" id="progress-container-${index}"><div class="upload-progress-bar" id="progress-bar-${index}"></div></div>
                    </div>`;
            } else {
                return `
                    <div class="relative group bg-[#2B2D31] p-3 rounded-lg border ${spoilerClass} flex items-center gap-2" id="preview-${index}">
                        <div class="text-xl">${getFileIcon(file.type)}</div>
                        <div class="text-[10px] text-[#dbdee1] max-w-[60px] truncate">${basicEscapeHtml(file.name)}</div>
                        <button type="button" class="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center" onclick="window.removeFile(${index})">✕</button>
                        <button type="button" class="absolute -bottom-1 -right-1 ${isSpoiler ? 'bg-[#faa61a]' : 'bg-[#232428]'} text-white rounded-full w-6 h-6 flex items-center justify-center border border-[#404249]" onclick="window.toggleFileSpoiler(${index})">
                            <i data-lucide="${icon}" class="w-3.5 h-3.5"></i>
                        </button>
                        <div class="upload-progress-container" id="progress-container-${index}"><div class="upload-progress-bar" id="progress-bar-${index}"></div></div>
                    </div>`;
            }
        }).join('');
        if (window.lucide) lucide.createIcons();
    });
}

export function hideFilePreview() {
    const preview = document.getElementById('filePreview');
    if (preview) {
        preview.classList.add('hidden');
        preview.innerHTML = '';
    }
}

export function toggleFileSpoiler(index) {
    if (state.selectedFiles[index]) {
        state.selectedFiles[index].isSpoiler = !state.selectedFiles[index].isSpoiler;
        showFilePreview();
    }
}

export function removeFile(index) {
    const file = state.selectedFiles[index];
    if (file && file.previewUrl) URL.revokeObjectURL(file.previewUrl);
    state.selectedFiles.splice(index, 1);
    if (state.selectedFiles.length === 0) hideFilePreview();
    else showFilePreview();
    updateSendButtonVisibility();
}

/**
 * Updates the visibility of the send button based on input content.
 */
export function updateSendButtonVisibility() {
    const sendBtn = document.getElementById('send-message-btn');
    const input = document.getElementById('message-input');
    if (!sendBtn || !input) return;

    const hasContent = input.value.trim().length > 0 || state.selectedFiles.length > 0;
    if (hasContent) sendBtn.classList.add('visible');
    else sendBtn.classList.remove('visible');
}

// Global exposes
window.removeFile = removeFile;
window.toggleFileSpoiler = toggleFileSpoiler;
window.updateSendButtonVisibility = updateSendButtonVisibility;
