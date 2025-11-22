import React, { useEffect, useRef } from 'react';
import { Mic, StopCircle, Keyboard, Sparkles } from 'lucide-react';
import { LiveTranscript } from '../types';

interface LiveInterfaceProps {
  connected: boolean;
  transcripts: LiveTranscript[];
  onDisconnect: () => void;
}

export const LiveInterface: React.FC<LiveInterfaceProps> = ({ 
  connected, 
  transcripts, 
  onDisconnect 
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcripts]);

  return (
    <div className="flex flex-col h-full bg-black text-white relative overflow-hidden">
      {/* Ambient Background */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,_#f97316_0%,_transparent_50%)] opacity-10 pointer-events-none"></div>

      {/* Header */}
      <div className="shrink-0 p-6 flex justify-between items-center z-10">
        <div className="flex items-center gap-2 text-orange-500">
           <Sparkles size={20} className="animate-pulse" />
           <span className="text-sm font-medium tracking-wider uppercase">Live Session</span>
        </div>
        <button 
          onClick={onDisconnect}
          className="p-2 bg-slate-800 rounded-full hover:bg-slate-700 transition-colors"
        >
           <span className="text-xs text-slate-400 font-bold px-2">END</span>
        </button>
      </div>

      {/* Conversation Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth z-10 mask-gradient-bottom">
        {transcripts.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-slate-500">
             <p className="text-lg font-light">Listening...</p>
          </div>
        )}
        
        {transcripts.map((t) => (
          <div 
            key={t.id} 
            className={`flex w-full ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div 
              className={`
                max-w-[80%] p-4 rounded-2xl text-lg leading-relaxed
                ${t.role === 'user' 
                  ? 'bg-blue-500 text-white rounded-tr-sm' 
                  : 'bg-white text-black rounded-tl-sm'
                }
              `}
            >
              {t.text}
            </div>
            {t.role === 'user' && (
               <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center ml-3 shrink-0 border-2 border-black">
                  <span className="text-xs font-bold">YOU</span>
               </div>
            )}
            {t.role === 'model' && (
               <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center mr-3 shrink-0 border-2 border-black order-first">
                  <Sparkles size={16} className="text-black" />
               </div>
            )}
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="shrink-0 p-8 flex items-center justify-center gap-6 z-20 bg-gradient-to-t from-black to-transparent">
         <button className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:bg-slate-700 hover:text-white transition-all">
            <Keyboard size={20} />
         </button>
         
         <div className="relative">
           {/* Pulsing Ring */}
           <div className="absolute inset-0 bg-green-500/20 rounded-full animate-ping"></div>
           <div className="w-20 h-20 rounded-full bg-green-600 flex items-center justify-center text-white shadow-2xl shadow-green-500/30 border-4 border-black z-10 relative">
              <Mic size={32} />
           </div>
         </div>
         
         <button 
           onClick={onDisconnect}
           className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:bg-slate-700 hover:text-white transition-all"
         >
            <StopCircle size={20} />
         </button>
      </div>
    </div>
  );
};
