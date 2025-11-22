import React, { useRef, useEffect, useState, useCallback } from 'react';
import { X, Mic, MicOff, SwitchCamera, Sparkles, ChefHat } from 'lucide-react';
import { useLiveAPI } from '../hooks/useLiveAPI';
import { cookingTools } from '../services/geminiService';

interface CookModeProps {
  systemInstruction: string;
  onExit: () => void;
}

export const CookMode: React.FC<CookModeProps> = ({ systemInstruction, onExit }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment'); // Default to back camera for cooking
  const [stream, setStream] = useState<MediaStream | null>(null);
  
  const { connect, disconnect, sendVideoFrame, connected } = useLiveAPI();

  // Initialize Camera
  useEffect(() => {
    const startCamera = async () => {
      try {
        if (stream) {
          stream.getTracks().forEach(t => t.stop());
        }
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facingMode },
          audio: false // Audio is handled by useLiveAPI's recorder separately
        });
        setStream(newStream);
        if (videoRef.current) {
          videoRef.current.srcObject = newStream;
        }
      } catch (err) {
        console.error("Camera error:", err);
      }
    };

    startCamera();
  }, [facingMode]);

  const toggleCamera = useCallback(() => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  }, []);

  const toggleMute = useCallback(() => {
      setIsMuted(prev => !prev);
      // Note: Actual audio stream muting would require updating the AudioRecorder, 
      // but for this visual UI state we just toggle the icon for now.
  }, []);

  const handleEndSession = useCallback(() => {
      onExit();
  }, [onExit]);

  // Connect to Gemini with Function Registry
  useEffect(() => {
    const registry = {
        flipCamera: toggleCamera,
        toggleMute: toggleMute,
        endSession: handleEndSession
    };

    connect({
      model: 'gemini-2.5-flash-native-audio-preview-09-2025',
      systemInstruction: systemInstruction,
      voiceName: 'Kore',
      tools: cookingTools // Pass the tool definitions
    }, registry); // Pass the function implementations

    return () => {
      disconnect();
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
    };
  }, []); // Run once on mount

  // Send Video Frames Loop
  useEffect(() => {
    if (!connected || !videoRef.current || !canvasRef.current) return;

    const interval = setInterval(() => {
      if (videoRef.current && canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          canvasRef.current.width = videoRef.current.videoWidth / 4; // Downscale for bandwidth
          canvasRef.current.height = videoRef.current.videoHeight / 4;
          ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
          
          const base64 = canvasRef.current.toDataURL('image/jpeg', 0.5).split(',')[1];
          sendVideoFrame(base64);
        }
      }
    }, 800); // ~1.2 FPS is sufficient for cooking steps

    return () => clearInterval(interval);
  }, [connected, sendVideoFrame]);

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Hidden Canvas for processing */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Camera Feed */}
      <div className="relative flex-1 bg-slate-900 overflow-hidden">
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted 
          className="w-full h-full object-cover"
        />
        
        {/* Overlay Gradients */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/80 pointer-events-none"></div>

        {/* Top Header */}
        <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start z-10">
          <div className="flex flex-col gap-1">
             <div className="flex items-center gap-2 text-orange-500">
               <ChefHat size={28} className="drop-shadow-lg" />
               <span className="font-bold text-xl tracking-tight drop-shadow-md text-white">Let's Cook</span>
             </div>
             <p className="text-xs text-slate-300 font-medium ml-1">Powered by Tukatuu ThirdEye</p>
          </div>
          
          <button 
            onClick={onExit}
            className="p-3 bg-black/40 backdrop-blur-md border border-white/10 rounded-full text-white hover:bg-red-500/20 hover:text-red-400 transition-all"
          >
            <X size={24} />
          </button>
        </div>

        {/* Center Status */}
        {!connected && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-black/60 backdrop-blur-xl px-6 py-3 rounded-full flex items-center gap-3 border border-orange-500/30">
              <Sparkles className="animate-pulse text-orange-500" size={20} />
              <span className="text-white font-medium">Connecting to Chef AI...</span>
            </div>
          </div>
        )}

        {/* Bottom Controls */}
        <div className="absolute bottom-0 left-0 right-0 p-8 flex items-center justify-around z-10">
           
           {/* Flip Camera */}
           <button 
             onClick={toggleCamera}
             className="w-14 h-14 rounded-full bg-slate-800/60 backdrop-blur-md flex items-center justify-center text-white border border-white/10 hover:bg-orange-500 hover:border-orange-500 transition-all"
           >
             <SwitchCamera size={24} />
           </button>

           {/* Audio Indicator / Mute */}
           <div className="relative">
              {connected && !isMuted && (
                  <div className="absolute inset-0 bg-orange-500/20 rounded-full animate-ping"></div>
              )}
              <button 
                onClick={toggleMute}
                className={`
                  w-20 h-20 rounded-full border-4 flex items-center justify-center text-white shadow-2xl relative z-10 transition-colors
                  ${isMuted ? 'bg-slate-700 border-slate-600' : 'bg-orange-600 border-black/50'}
                `}
              >
                 {isMuted ? <MicOff size={32} /> : <Mic size={32} />}
              </button>
           </div>

           {/* End Session */}
           <button
             onClick={onExit}
              className="w-14 h-14 rounded-full bg-red-500/80 backdrop-blur-md flex items-center justify-center text-white border border-white/10 hover:bg-red-600 transition-all"
           >
              <X size={24} />
           </button>

        </div>
      </div>
    </div>
  );
};