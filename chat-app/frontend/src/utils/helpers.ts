import { CustomEmoji } from '../types';

/**
 * Formats a byte value into a human-readable string (e.g., 1.2 MB).
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Returns an emoji icon based on the file MIME type.
 */
export function getFileIcon(type: string): string {
  if (!type) return '📄';
  if (type.startsWith('image/')) return '🖼️';
  if (type.startsWith('video/')) return '🎬';
  if (type.startsWith('audio/')) return '🎵';
  if (type.includes('pdf')) return '📕';
  if (type.includes('word') || type.includes('document')) return '📘';
  if (type.includes('excel') || type.includes('spreadsheet')) return '📗';
  if (type.includes('powerpoint') || type.includes('presentation')) return '📙';
  if (type.includes('zip') || type.includes('rar') || type.includes('compressed')) return '📦';
  if (type.includes('text')) return '📝';
  return '📄';
}

/**
 * Checks if a string consists only of emojis (standard or custom).
 */
export function isEmojiOnly(text: string, customEmojis: CustomEmoji[] = []): boolean {
  if (!text) return false;

  // 1. Remove custom emoji tokens :name:
  let remaining = text;
  customEmojis.forEach((emoji) => {
    const regex = new RegExp(`:${emoji.name}:`, 'g');
    remaining = remaining.replace(regex, '');
  });

  // 2. Check if we have standard emojis or if it's just whitespace now
  // \p{Extended_Pictographic} is for icons, variation selectors and skin tones are also removed
  remaining = remaining.replace(/[\s\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{FE0E}\u{FE0F}]/gu, '');

  // 3. If nothing left, it was emoji-only.
  return remaining.length === 0 && text.trim().length > 0;
}

/**
 * Escapes HTML special characters in a string.
 */
export function basicEscapeHtml(text: string): string {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Gets coordinates of a character in a textarea for positioning tooltips.
 */
export function getCaretCoordinates(element: HTMLTextAreaElement | HTMLInputElement, position: number) {
  const div = document.createElement('div');
  const style = window.getComputedStyle(element);

  // Copy styles from textarea to ghost div
  const properties = [
    'direction', 'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderStyle',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'fontSizeAdjust', 'lineHeight', 'fontFamily',
    'textAlign', 'textTransform', 'textIndent', 'textDecoration', 'letterSpacing', 'wordSpacing', 'tabSize'
  ];

  div.style.position = 'absolute';
  div.style.visibility = 'hidden';
  div.style.whiteSpace = 'pre-wrap';
  div.style.wordBreak = 'break-word';

  properties.forEach((prop) => {
    (div.style as any)[prop] = (style as any)[prop];
  });

  // Content before selection
  div.textContent = element.value.substring(0, position);

  const span = document.createElement('span');
  span.textContent = element.value.substring(position) || '.';
  div.appendChild(span);

  document.body.appendChild(div);
  const { offsetTop: top, offsetLeft: left } = span;
  document.body.removeChild(div);

  return { top, left };
}

/**
 * Detects language based on script patterns (CJK, Cyrillic, Latin).
 * Returns a BCP 47 language tag (e.g., 'ko-KR', 'ja-JP', 'zh-CN', 'en-US').
 */
export function detectLanguage(text: string): string {
  if (!text) return 'en-US';

  // Korean
  if (/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/.test(text)) return 'ko-KR';
  
  // Japanese (Hiragana/Katakana)
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return 'ja-JP';
  
  // Chinese (Simplified/Traditional check is hard, default to CN)
  if (/[\u4E00-\u9FFF]/.test(text)) return 'zh-CN';
  
  // Russian / Cyrillic
  if (/[\u0400-\u04FF]/.test(text)) return 'ru-RU';
  
  // Default to English
  return 'en-US';
}
