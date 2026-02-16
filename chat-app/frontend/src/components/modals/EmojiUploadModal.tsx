import React, { useState } from 'react';
import { X, Upload } from 'lucide-react';
import { useUIStore } from '@/store/useUIStore';
import { useChatStore } from '@/store/useChatStore';
import { useAuthStore } from '@/store/useAuthStore';
import { apiClient } from '@/lib/api';

export const EmojiUploadModal = () => {
  const { closeModal } = useUIStore();
  const { username } = useAuthStore();
  const { setCustomEmojis } = useChatStore();
  
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      // Auto-fill name if empty
      if (!name) {
        const fileName = selectedFile.name.split('.')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_');
        setName(fileName);
      }
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !file || !username) return;

    setIsLoading(true);
    try {
      const reader = new FileReader();
      const base64Image = await new Promise<string>((resolve) => {
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsDataURL(file);
      });

      await apiClient.uploadEmoji({
        name: name.trim().toLowerCase().replace(/\s+/g, '_'),
        image: base64Image,
        username
      });

      // Refresh emojis list
      const updated = await apiClient.fetchEmojis();
      setCustomEmojis(updated);
      
      alert('Emoji uploaded successfully!');
      closeModal();
    } catch (error: any) {
      alert(error.message || 'Failed to upload emoji');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[200] p-4" onClick={closeModal}>
      <div 
        className="bg-accord-dark-300 rounded-lg max-w-sm w-full shadow-2xl border border-accord-dark-100 overflow-hidden animate-slide-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-accord-dark-700">
          <h3 className="font-bold text-lg text-white">Upload Custom Emoji</h3>
          <button onClick={closeModal} className="text-accord-text-muted hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleUpload} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-accord-text-muted uppercase mb-2">Emoji Name</label>
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. party_blob" 
              className="w-full bg-accord-dark-600 text-accord-text-normal rounded px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-accord-blurple"
              maxLength={32}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-accord-text-muted uppercase mb-2">Image File</label>
            <input 
              type="file" 
              onChange={handleFileChange}
              accept="image/*"
              className="w-full text-sm text-accord-text-muted file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-accord-blurple file:text-white hover:file:bg-[#4752C4] cursor-pointer"
            />
          </div>

          <div className="flex space-x-3 pt-2">
            <button 
              type="button" 
              onClick={closeModal}
              className="flex-1 bg-transparent hover:underline text-accord-text-muted"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={isLoading || !name || !file}
              className="btn-ripple flex-1 bg-accord-blurple hover:bg-[#4752C4] text-white font-semibold py-2 rounded transition-colors flex items-center justify-center disabled:opacity-50"
            >
              <Upload className="w-4 h-4 mr-2" />
              {isLoading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
