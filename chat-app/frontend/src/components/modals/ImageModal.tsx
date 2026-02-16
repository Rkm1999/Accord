import { useState } from 'react';
import { X, Download } from 'lucide-react';
import { useUIStore } from '@/store/useUIStore';
import { downloadFile } from '@/utils/downloader';

export const ImageModal = () => {
  const { selectedImageUrl, closeModal } = useUIStore();
  const [scale] = useState(1);


  if (!selectedImageUrl) return null;

  return (
    <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-[200] p-4" onClick={closeModal}>
      <button 
        className="absolute top-6 right-6 text-white/70 hover:text-white transition-colors z-[210] p-2 bg-black/20 rounded-full backdrop-blur-sm"
        onClick={closeModal}
      >
        <X className="w-8 h-8" />
      </button>

      <button 
        className="absolute top-6 left-6 text-white/70 hover:text-white transition-colors z-[210] p-2 bg-black/20 rounded-full backdrop-blur-sm"
        onClick={(e) => {
          e.stopPropagation();
          downloadFile(selectedImageUrl, 'image.png');
        }}
      >
        <Download className="w-8 h-8" />
      </button>

      <img 
        src={selectedImageUrl} 
        alt="Full size"
        className="max-w-full max-h-full object-contain relative z-[205] transition-transform duration-200 ease-out cursor-zoom-in"
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
        style={{ transform: `scale(${scale})` }}
      />
    </div>
  );
};
