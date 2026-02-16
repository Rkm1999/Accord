import React, { useState } from 'react';
import { Search, X, Calendar, Hash, User } from 'lucide-react';
import { useUIStore } from '@/store/useUIStore';
import { useChatStore } from '@/store/useChatStore';
import { apiClient } from '@/lib/api';
import { Message } from '@/types';

export const SearchModal = () => {
  const { closeModal, setSearchTargetId } = useUIStore();
  const { channels, setCurrentChannelId, clearChannelUnread } = useChatStore();
  
  const [query, setQuery] = useState('');
  const [username, setUsername] = useState('');
  const [channelId, setChannelId] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  const [results, setResults] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setHasSearched(true);
    try {
      const data = await apiClient.searchMessages({
        query: query.trim(),
        username: username.trim(),
        channelId: channelId === 'all' ? undefined : channelId,
        startDate,
        endDate
      });
      setResults(data.results);
    } catch (error) {
      alert('Search failed');
    } finally {
      setIsLoading(false);
    }
  };

  const jumpToMessage = (msg: Message) => {
    setCurrentChannelId(msg.channel_id);
    clearChannelUnread(msg.channel_id);
    setSearchTargetId(msg.id);
    closeModal();
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={closeModal}>
      <div 
        className="bg-accord-dark-300 rounded-lg max-w-2xl w-full shadow-2xl border border-accord-dark-100 overflow-hidden animate-slide-in flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-accord-dark-700 flex items-center justify-between">
          <h3 className="font-bold text-lg text-white flex items-center gap-2">
            <Search className="w-5 h-5" /> Search Messages
          </h3>
          <button onClick={closeModal} className="text-accord-text-muted hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-4 bg-accord-dark-400">
          <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-accord-text-muted" />
              <input 
                type="text" 
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search text..." 
                className="w-full bg-accord-dark-600 text-accord-text-normal rounded px-10 py-2 focus:outline-none focus:ring-2 focus:ring-accord-blurple"
              />
            </div>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-accord-text-muted" />
              <input 
                type="text" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="From user..." 
                className="w-full bg-accord-dark-600 text-accord-text-normal rounded px-10 py-2 focus:outline-none focus:ring-2 focus:ring-accord-blurple"
              />
            </div>
            <div className="relative">
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-accord-text-muted" />
              <select 
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
                className="w-full bg-accord-dark-600 text-accord-text-normal rounded px-10 py-2 focus:outline-none focus:ring-2 focus:ring-accord-blurple appearance-none"
              >
                <option value="all">All Channels</option>
                {channels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
              </select>
            </div>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-accord-text-muted" />
              <input 
                type="date" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-accord-dark-600 text-accord-text-normal rounded px-10 py-2 focus:outline-none focus:ring-2 focus:ring-accord-blurple"
              />
            </div>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-accord-text-muted" />
              <input 
                type="date" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-accord-dark-600 text-accord-text-normal rounded px-10 py-2 focus:outline-none focus:ring-2 focus:ring-accord-blurple"
              />
            </div>
            <button 
              type="submit" 
              disabled={isLoading}
              className="md:col-span-2 btn-ripple bg-accord-blurple hover:bg-[#4752C4] text-white font-bold py-2 rounded transition-all disabled:opacity-50"
            >
              {isLoading ? 'Searching...' : 'Search'}
            </button>
          </form>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
          {results.map((msg) => (
            <div 
              key={msg.id}
              onClick={() => jumpToMessage(msg)}
              className="p-3 bg-accord-dark-400 hover:bg-accord-dark-200 rounded-lg cursor-pointer transition-colors border border-transparent hover:border-accord-dark-100"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="font-bold text-white text-sm">{msg.displayName || msg.username}</span>
                <span className="text-xs text-accord-text-muted">{new Date(msg.timestamp).toLocaleString()}</span>
                <span className="ml-auto text-[10px] uppercase font-bold text-accord-blurple bg-accord-blurple/10 px-1.5 py-0.5 rounded">
                  #{channels.find(c => c.id === msg.channel_id)?.name || 'unknown'}
                </span>
              </div>
              <p className="text-accord-text-normal text-sm line-clamp-2">{msg.message || 'File attachment'}</p>
            </div>
          ))}
          {hasSearched && results.length === 0 && !isLoading && (
            <div className="p-12 text-center text-accord-text-muted">No results found</div>
          )}
          {!hasSearched && (
            <div className="p-12 text-center text-accord-text-muted">Enter search criteria above</div>
          )}
        </div>
      </div>
    </div>
  );
};
