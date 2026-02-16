import { ReactNode } from 'react';
import { CustomEmoji, User } from '../types';
import { apiBaseUrl, isLocalDev } from '../lib/config';

/**
 * Extracts a YouTube Video ID from various URL patterns.
 */
export function extractYouTubeVideoId(url: string): string | null {
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
 * Parses a raw message string into React Nodes with Markdown, emojis, and mentions.
 */
export function parseMessage(
  text: string, 
  customEmojis: CustomEmoji[] = [], 
  allUsers: User[] = [], 
  currentUsername: string = ''
): ReactNode[] {
  if (!text) return [];

  let nodes: ReactNode[] = [text];

  // 1. Spoilers ||text||
  nodes = splitAndMap(nodes, /\|\|(.*?)\|\|/g, (match, p1) => (
    <span 
      key={`spoiler-${match}`} 
      className="spoiler-text"
      onClick={(e) => {
        e.currentTarget.classList.toggle('revealed');
        e.stopPropagation();
      }}
    >
      {p1}
    </span>
  ));

  // 2. Custom emojis :name:
  customEmojis.forEach(emoji => {
    const fileUrl = isLocalDev ? `${apiBaseUrl}/api/file/${emoji.file_key}` : `/api/file/${emoji.file_key}`;
    const regex = new RegExp(`:${emoji.name}:`, 'g');
    nodes = splitAndMap(nodes, regex, () => (
      <img 
        key={`emoji-${emoji.name}-${Math.random()}`}
        src={fileUrl} 
        alt={`:${emoji.name}:`} 
        title={`:${emoji.name}:`} 
        className="inline-block w-[1.2em] h-[1.2rem] mx-0.5 align-bottom object-contain" 
        onContextMenu={(e) => e.preventDefault()}
      />
    ));

  });

  // 3. Bold **text**
  nodes = splitAndMap(nodes, /\*\*(.*?)\*\*/g, (_match, p1) => (
    <strong key={`bold-${p1}-${Math.random()}`}>{p1}</strong>
  ));

  // 4. Italic *text*
  nodes = splitAndMap(nodes, /\*(.*?)\*/g, (_match, p1) => (
    <em key={`italic-${p1}-${Math.random()}`}>{p1}</em>
  ));

  // 5. Strikethrough ~~text~~
  nodes = splitAndMap(nodes, /~~(.*?)~~/g, (_match, p1) => (
    <del key={`strike-${p1}-${Math.random()}`}>{p1}</del>
  ));

  // 6. Inline Code `text`
  nodes = splitAndMap(nodes, /`([^`]+)`/g, (_match, p1) => (
    <code key={`code-${p1}-${Math.random()}`} className="bg-accord-dark-600 px-1 rounded text-[#e3e5e8] font-mono text-[0.9em]">
      {p1}
    </code>
  ));

  // 7. Mentions @username
  nodes = splitAndMap(nodes, /@([\p{L}\p{N}_]+)/gu, (_match, p1) => {
    const user = allUsers.find(u => u.username === p1);
    const dName = user ? (user.display_name || user.username) : p1;
    const isSelf = p1 === currentUsername;
    return (
      <span key={`mention-${p1}-${Math.random()}`} className={`user-mention ${isSelf ? 'mention-self' : ''}`}>
        @{dName}
      </span>
    );
  });

  return nodes;
}

/**
 * Helper to split text nodes and map matches to components.
 */
function splitAndMap(
  nodes: ReactNode[], 
  regex: RegExp, 
  mapper: (match: string, ...groups: any[]) => ReactNode
): ReactNode[] {
  const result: ReactNode[] = [];

  nodes.forEach(node => {
    if (typeof node !== 'string') {
      result.push(node);
      return;
    }

    let lastIndex = 0;
    let match;
    // Reset regex index for global matches
    regex.lastIndex = 0;

    while ((match = regex.exec(node)) !== null) {
      // Add text before match
      if (match.index > lastIndex) {
        result.push(node.substring(lastIndex, match.index));
      }

      // Add mapped component
      result.push(mapper(match[0], ...match.slice(1)));
      lastIndex = regex.lastIndex;

      // Prevent infinite loops with zero-width matches
      if (match[0].length === 0) regex.lastIndex++;
    }

    // Add remaining text
    if (lastIndex < node.length) {
      result.push(node.substring(lastIndex));
    }
  });

  return result;
}
