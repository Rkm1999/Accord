import { basicEscapeHtml } from './helpers.js';
import { apiBaseUrl, isLocalDev } from '../config.js';

/**
 * Extracts a YouTube Video ID from various URL patterns.
 */
export function extractYouTubeVideoId(url) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([^&?#]+)/,
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) {
            return match[1];
        }
    }
    return null;
}

/**
 * Returns the HTML for a YouTube iframe.
 */
export function getYouTubeIframe(videoId) {
    return `
        <div class="relative w-full aspect-video rounded-lg overflow-hidden bg-black mt-2">
            <iframe 
                src="https://www.youtube.com/embed/${videoId}?autoplay=1" 
                class="absolute top-0 left-0 w-full h-full" 
                frameborder="0" 
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                referrerpolicy="strict-origin-when-cross-origin" 
                allowfullscreen>
            </iframe>
        </div>
    `;
}

/**
 * Parses a raw message string into HTML with Markdown, emojis, and mentions.
 */
export function parseMessage(text, customEmojis = [], allUsers = [], currentUsername = '') {
    if (!text) return '';

    // 1. Basic HTML escaping
    let html = basicEscapeHtml(text);

    // 2. Custom emojis :name:
    customEmojis.forEach(emoji => {
        const fileUrl = isLocalDev ? `${apiBaseUrl}/api/file/${emoji.file_key}` : `/api/file/${emoji.file_key}`;
        const emojiTag = `<img src="${fileUrl}" alt=":${emoji.name}:" title=":${emoji.name}:" class="inline-block w-6 h-6 mx-0.5 align-bottom" oncontextmenu="return false;">`;
        const regex = new RegExp(`:${emoji.name}:`, 'g');
        html = html.replace(regex, emojiTag);
    });

    // 3. Spoilers ||text||
    // Using inline toggle for simplicity in vanilla JS
    const spoilerRegex = /\|\|(.*?)\|\|/g;
    html = html.replace(spoilerRegex, (match, p1) => {
        return `<span class="spoiler-text" onclick="this.classList.toggle('revealed'); event.stopPropagation();">${p1}</span>`;
    });

    // 4. Bold **text**
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // 5. Italic *text*
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // 6. Strikethrough ~~text~~
    html = html.replace(/~~(.*?)~~/g, '<del>$1</del>');

    // 7. Inline Code `text`
    html = html.replace(/`([^`]+)`/g, '<code class="bg-[#1e1f22] px-1 rounded text-[#e3e5e8] font-mono text-[0.9em]">$1</code>');

    // 8. Mentions @username
    const mentionRegex = /@([\p{L}\p{N}_]+)/gu;
    html = html.replace(mentionRegex, (match, p1) => {
        const user = allUsers.find(u => u.username === p1);
        const dName = user ? (user.display_name || user.username) : p1;
        const isSelf = p1 === currentUsername;
        return `<span class="user-mention ${isSelf ? 'mention-self' : ''}">@${basicEscapeHtml(dName)}</span>`;
    });

    return html;
}
