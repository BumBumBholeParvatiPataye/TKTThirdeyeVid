import React from 'react';
import { Mic, MicOff, PhoneOff } from 'lucide-react';

interface ControlTrayProps {
  connected: boolean;
  isRecording: boolean;
  onToggleConnection: () => void;
}

export const ControlTray: React.FC<ControlTrayProps> = ({ connected, isRecording, onToggleConnection }) => {
  return (
    <div className="flex items-center justify-center gap-6 p-6">
      <button
        onClick={onToggleConnection}
        className={`
          relative flex items-center justify-center w-16 h-16 rounded-full transition-all duration-300 shadow-xl
          ${connected 
            ? 'bg-red-500 hover:bg-red-600 shadow-red-500/30' 
            : 'bg-orange-600 hover:bg-orange-500 shadow-orange-500/30 animate-pulse'
          }
        `}
        title={connected ? "End Call" : "Start Live Chat"}
      >
        {connected ? (
          <PhoneOff className="text-white" size={28} />
        ) : (
          <Mic className="text-white" size={28} />
        )}
        
        {/* Ripple effect when connected */}
        {connected && (
             <span className="absolute inset-0 rounded-full border border-red-400 animate-ping opacity-75"></span>
        )}
      </button>
      
      <div className="text-center absolute bottom-20 md:static md:mt-0">
         <p className="text-sm font-medium text-slate-300">
             {connected ? "Live Session Active" : "Start Voice Chat"}
         </p>
         <p className="text-xs text-slate-500">
             {connected ? "Gemini is listening" : "Tap to talk"}
         </p>
      </div>
    </div>
  );
};
