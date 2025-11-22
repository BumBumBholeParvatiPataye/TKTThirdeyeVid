import React, { useCallback, useState } from 'react';
import { Upload, Link as LinkIcon, AlertTriangle, ArrowRight, Youtube } from 'lucide-react';
import { extractYouTubeId } from '../utils/fileHelpers';

interface VideoUploaderProps {
  onFileSelected: (file: File) => void;
  onUrlSelected: (url: string, isYouTube?: boolean) => void;
  error?: string | null;
  isProcessing?: boolean;
}

export const VideoUploader: React.FC<VideoUploaderProps> = ({ 
  onFileSelected, 
  onUrlSelected, 
  error,
  isProcessing = false
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [urlInput, setUrlInput] = useState('');

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('video/')) {
        onFileSelected(file);
      }
    }
  }, [onFileSelected]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelected(e.target.files[0]);
    }
  }, [onFileSelected]);

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUrl = urlInput.trim();
    if (trimmedUrl) {
      const ytId = extractYouTubeId(trimmedUrl);
      if (ytId) {
        onUrlSelected(trimmedUrl, true);
      } else {
        onUrlSelected(trimmedUrl, false);
      }
    }
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto">
      {/* Drag and Drop Area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          w-full p-8 rounded-3xl border-2 border-dashed transition-all duration-300 cursor-pointer group relative
          ${isDragging 
            ? 'border-orange-500 bg-orange-500/10 scale-[1.02]' 
            : 'border-slate-700 hover:border-orange-400/50 hover:bg-slate-800/50'
          }
          ${error ? 'border-red-500/50 bg-red-500/5' : ''}
        `}
      >
        <input 
          type="file" 
          accept="video/*" 
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          onChange={handleFileInput}
          disabled={isProcessing}
        />
        
        <div className="flex flex-col items-center gap-4">
          <div className={`
            p-4 rounded-full transition-colors duration-300
            ${isDragging ? 'bg-orange-500 text-white' : 'bg-slate-800 text-orange-500 group-hover:bg-orange-500 group-hover:text-white'}
          `}>
            <Upload size={32} />
          </div>
          
          <div className="space-y-2">
            <h3 className="text-xl font-semibold text-slate-200">Upload a Video</h3>
            <p className="text-slate-400 text-sm">Drag and drop or click to browse</p>
          </div>

          <div className="text-xs text-slate-500 bg-slate-900/50 px-3 py-1 rounded-full border border-slate-800">
            MP4, WebM, MOV (Max ~20MB)
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="flex items-center w-full gap-4 my-6">
        <div className="h-px bg-slate-800 flex-1"></div>
        <span className="text-slate-500 text-sm font-medium">OR</span>
        <div className="h-px bg-slate-800 flex-1"></div>
      </div>

      {/* URL Input */}
      <form onSubmit={handleUrlSubmit} className="w-full relative group">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-orange-400 transition-colors">
          <LinkIcon size={18} />
        </div>
        <input
          type="url"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="Paste URL (YouTube, Streamable, etc.)"
          disabled={isProcessing}
          className="w-full bg-slate-800/50 text-slate-200 pl-12 pr-12 py-3.5 rounded-xl border border-slate-700 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/50 transition-all placeholder:text-slate-600 font-medium"
        />
        <button
          type="submit"
          disabled={!urlInput.trim() || isProcessing}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-orange-600 text-white rounded-lg hover:bg-orange-500 disabled:opacity-0 disabled:pointer-events-none transition-all shadow-lg shadow-orange-500/20"
        >
          <ArrowRight size={16} />
        </button>
      </form>
      <p className="text-[10px] text-slate-500 mt-2 text-left w-full px-1 leading-relaxed flex flex-col gap-1">
        <span className="flex items-center gap-1">
           <Youtube size={12} className="text-red-500"/> 
           Supported: YouTube, Streamable, Direct MP4 links.
        </span>
        <span>* YouTube videos are analyzed using Gemini's native URL capabilities.</span>
      </p>

      {error && (
        <div className="w-full flex items-center gap-2 text-red-400 text-sm mt-6 bg-red-500/10 p-3 rounded-lg border border-red-500/20 text-left">
          <AlertTriangle size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};