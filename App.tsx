import React, { useState, useRef, useEffect } from 'react';
import { Chat } from '@google/genai';
import { Send, Trash2, AlertCircle, ScanEye, Box, Activity, Type, MapPin, Youtube, Sparkles, RotateCw, Mic, Square, Volume2, VolumeX, ChefHat } from 'lucide-react';
import { VideoUploader } from './components/VideoUploader';
import { ChatBubble } from './components/ChatBubble';
import { LoadingDots } from './components/LoadingDots';
import { CookMode } from './components/CookMode';
import { Message, VideoFile, ChatStatus } from './types';
import { fileToBase64, formatFileSize, fetchVideoUrlToFile, extractYouTubeId } from './utils/fileHelpers';
import { VoiceRecorder } from './utils/voiceRecorder';
import { createChatSession, sendChatMessageStream, generateVideoSummaryStream, generateWelcomeMessageStream, generateTTS, generateCookingContext } from './services/geminiService';
import ReactMarkdown from 'react-markdown';
import { AudioPlayer } from './utils/audioPlayer';

export default function App() {
  // State
  const [video, setVideo] = useState<VideoFile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<ChatStatus>(ChatStatus.IDLE);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<{lat: number, lng: number} | undefined>(undefined);
  const [locationStatus, setLocationStatus] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  
  // Summary State
  const [summary, setSummary] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);

  // Voice State
  const [isRecording, setIsRecording] = useState(false);
  const isRecordingRef = useRef(false);

  // TTS State
  const [isTTSEnabled, setIsTTSEnabled] = useState(true);

  // Cook Mode State
  const [isCookMode, setIsCookMode] = useState(false);
  const [cookContext, setCookContext] = useState<string>("");
  const [isPreparingCookMode, setIsPreparingCookMode] = useState(false);

  // Refs
  const chatSessionRef = useRef<Chat | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<VoiceRecorder>(new VoiceRecorder());
  const audioPlayerRef = useRef<AudioPlayer>(new AudioPlayer());
  const ttsChainRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!isTTSEnabled) {
      audioPlayerRef.current.stop();
    }
  }, [isTTSEnabled]);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
          setLocationStatus('granted');
        },
        (err) => {
          console.warn("Location access denied or failed", err);
          setLocationStatus('denied');
        }
      );
    }
  }, []);

  // --- Real-time TTS Handler ---
  // Buffers text, splits by sentence, cleans emojis, and queues audio serially
  const streamTextToVoice = async (textStream: AsyncGenerator<string>, onTextUpdate: (fullText: string) => void) => {
    let fullText = "";
    let sentenceBuffer = "";

    // Reset chain for new stream
    ttsChainRef.current = Promise.resolve();

    // Stop any previous audio before starting new response
    if (isTTSEnabled) {
      audioPlayerRef.current.stop();
    }

    for await (const textChunk of textStream) {
      fullText += textChunk;
      onTextUpdate(fullText);

      if (isTTSEnabled) {
        sentenceBuffer += textChunk;
        
        // Split on punctuation (. ? ! \n)
        // Removed splitting on commas/colons to prevent "blurting" of short list items
        let match;
        while ((match = sentenceBuffer.match(/^(.+?([.!?\n]))(\s+|$)/))) {
            const sentence = match[1];
            const separator = match[3]; // the whitespace after
            
            // Clean Emojis for TTS
            const textForTTS = sentence.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F018}-\u{1F270}\u{238C}\u{2B06}\u{2B07}\u{2B05}\u{2B95}\u{2934}\u{2935}\u{200D}]/gu, '');

            if (textForTTS.trim()) {
                // PARALLEL FETCH, SERIAL QUEUE
                // We start fetching audio immediately...
                const fetchAudioPromise = generateTTS(textForTTS);
                
                // ...but we wait for previous chunks to be queued before queuing this one.
                ttsChainRef.current = ttsChainRef.current.then(async () => {
                    try {
                        const audio = await fetchAudioPromise;
                        if (audio && isTTSEnabled) {
                            // Queueing is async because it might decode data
                            await audioPlayerRef.current.queue(audio);
                        }
                    } catch (e) {
                        console.error("TTS Error in chain", e);
                    }
                });
            }

            // Remove processed sentence from buffer
            sentenceBuffer = sentenceBuffer.substring(sentence.length + separator.length);
        }
      }
    }

    // Process remaining buffer at the end
    if (isTTSEnabled && sentenceBuffer.trim()) {
         const textForTTS = sentenceBuffer.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F018}-\u{1F270}\u{238C}\u{2B06}\u{2B07}\u{2B05}\u{2B95}\u{2934}\u{2935}\u{200D}]/gu, '');
         if (textForTTS.trim()) {
             const fetchAudioPromise = generateTTS(textForTTS);
             ttsChainRef.current = ttsChainRef.current.then(async () => {
                try {
                    const audio = await fetchAudioPromise;
                    if (audio && isTTSEnabled) {
                        await audioPlayerRef.current.queue(audio);
                    }
                } catch (e) {
                    console.error("TTS Error in chain (final)", e);
                }
             });
         }
    }
    
    return fullText;
  };

  const triggerWelcome = async (videoData: VideoFile, chat: Chat) => {
    const botMessageId = "welcome-msg";
    setMessages([{
        id: botMessageId,
        role: 'model',
        text: '',
        timestamp: Date.now()
    }]);
    
    setStatus(ChatStatus.STREAMING);

    try {
        const stream = generateWelcomeMessageStream(chat, {
            base64: videoData.base64,
            mimeType: videoData.mimeType,
            url: videoData.url
        });

        const fullBotResponse = await streamTextToVoice(stream, (currentText) => {
            setMessages(prev => prev.map(msg => 
                msg.id === botMessageId ? { ...msg, text: currentText } : msg
            ));
        });
        
        setSummary(fullBotResponse); 
        setStatus(ChatStatus.READY);

    } catch (e) {
        console.error("Welcome message failed", e);
        setMessages([]); 
        setStatus(ChatStatus.READY);
    }
  };

  const handleFileSelection = async (file: File) => {
    if (file.size > 25 * 1024 * 1024) {
      setError("This video is large. Browser-based processing may be slow or crash. Recommended < 25MB.");
    } else {
      setError(null);
    }

    setStatus(ChatStatus.PROCESSING_VIDEO);
    
    try {
      const base64 = await fileToBase64(file);
      const url = URL.createObjectURL(file);
      
      const videoData = {
        source: 'file' as const,
        file,
        url,
        base64,
        mimeType: file.type || 'video/mp4'
      };

      setVideo(videoData);

      const chat = createChatSession(location);
      chatSessionRef.current = chat;
      
      setMessages([]);
      setSummary(null);
      
      await triggerWelcome(videoData, chat);
      
    } catch (e) {
      console.error(e);
      setError("Failed to process video file.");
      setStatus(ChatStatus.ERROR);
    }
  };

  const handleUrlSelection = async (url: string, isYouTube: boolean = false) => {
    setStatus(ChatStatus.PROCESSING_VIDEO);
    setError(null);

    if (isYouTube) {
      const videoData = {
        source: 'youtube' as const,
        url: url,
        mimeType: 'video/x-youtube'
      };
      setVideo(videoData);

      const chat = createChatSession(location);
      chatSessionRef.current = chat;
      
      setMessages([]);
      setSummary(null);

      await triggerWelcome(videoData, chat);
      return;
    }

    try {
      const file = await fetchVideoUrlToFile(url);
      await handleFileSelection(file);
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Failed to fetch video from URL.");
      setStatus(ChatStatus.IDLE);
    }
  };

  const clearVideo = () => {
    if (video?.source === 'file' && video.url) {
      URL.revokeObjectURL(video.url);
    }
    setVideo(null);
    setMessages([]);
    setSummary(null);
    chatSessionRef.current = null;
    setStatus(ChatStatus.IDLE);
    setError(null);
    setInput('');
    audioPlayerRef.current.stop();
  };

  const startCookMode = async () => {
    if (!chatSessionRef.current) return;
    
    // Stop audio
    audioPlayerRef.current.stop();
    setIsPreparingCookMode(true);

    try {
        // Generate bridging context from the current chat session
        const context = await generateCookingContext(chatSessionRef.current);
        setCookContext(context);
        setIsCookMode(true);
    } catch (e) {
        console.error("Failed to start cook mode", e);
        alert("Couldn't start Cook Mode. Try again.");
    } finally {
        setIsPreparingCookMode(false);
    }
  };

  const toggleRecording = async () => {
    audioPlayerRef.current.stop();

    if (isRecording) {
      setIsRecording(false);
      recorderRef.current.stop();
    } else {
      try {
        setIsRecording(true);
        await recorderRef.current.start(
            (data) => {
                performSendMessage(data.transcript, { base64: data.base64, mimeType: data.mimeType });
                setIsRecording(false);
            },
            () => {
                if (isRecordingRef.current) {
                    setIsRecording(false);
                    recorderRef.current.stop();
                }
            }
        );
      } catch (e) {
        console.error("Failed to start recording", e);
        setIsRecording(false);
        alert("Could not access microphone. Please allow permissions.");
      }
    }
  };

  const performSendMessage = async (textOverride?: string, audioData?: { base64: string, mimeType: string }) => {
    const prompt = audioData ? audioData : (textOverride || input);

    if (!audioData && typeof prompt === 'string' && !prompt.trim()) return;
    if (!video || !chatSessionRef.current || status === ChatStatus.STREAMING) return;

    if (!textOverride && !audioData) {
      setInput(''); 
    }
    
    const newMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: textOverride || (typeof prompt === 'string' ? prompt.trim() : ''),
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, newMessage]);
    setStatus(ChatStatus.STREAMING);

    const botMessageId = (Date.now() + 1).toString();

    setMessages(prev => [...prev, {
      id: botMessageId,
      role: 'model',
      text: '',
      timestamp: Date.now()
    }]);

    try {
      const stream = sendChatMessageStream(
          chatSessionRef.current,
          prompt
      );

      await streamTextToVoice(stream, (currentText) => {
          setMessages(prev => prev.map(msg => 
            msg.id === botMessageId ? { ...msg, text: currentText } : msg
          ));
      });

      setStatus(ChatStatus.READY);

    } catch (e: any) {
      console.error("Gemini Error:", e);
      setStatus(ChatStatus.READY);
      setMessages(prev => prev.map(msg => 
        msg.id === botMessageId 
          ? { ...msg, text: "I encountered an error processing your request. Please try again.", isError: true }
          : msg
      ));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      performSendMessage();
    }
  };

  const analysisOptions = [
    { label: "Describe Scene", icon: ScanEye, prompt: "Analyze the visual setting and environment in detail." },
    { label: "Detect Objects", icon: Box, prompt: "List the main objects visible in this video with their visual characteristics." },
    { label: "Track Actions", icon: Activity, prompt: "Chronologically list the key actions and movements happening in the video." },
    { label: "Read Text", icon: Type, prompt: "Transcribe any text visible in the video." },
  ];

  const youtubeId = video?.source === 'youtube' ? extractYouTubeId(video.url) : null;

  if (isCookMode) {
      return <CookMode systemInstruction={cookContext} onExit={() => setIsCookMode(false)} />;
  }

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden text-slate-200 font-sans">
      {/* Left Panel: Video Context */}
      <div className={`
        flex flex-col border-r border-slate-800 bg-slate-900/50 transition-all duration-500 ease-in-out
        ${video ? 'w-full md:w-1/2 lg:w-5/12' : 'w-full'}
      `}>
        {/* Header */}
        <header className="h-16 border-b border-slate-800 flex items-center px-6 justify-between bg-slate-900/80 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-3">
            <img src="https://i.ibb.co/wZZ6h454/tukatuulong.png" alt="Tukatuu Logo" className="h-8 md:h-10 object-contain" />
            <h1 className="text-lg md:text-xl font-bold tracking-tight text-white">
              Tukatuu <span className="text-orange-500">ThirdEye</span>
            </h1>
          </div>
          {video && (
             <button 
               onClick={clearVideo}
               className="p-2 hover:bg-red-500/10 text-slate-400 hover:text-red-400 rounded-full transition-colors"
               title="Remove video"
             >
               <Trash2 size={20} />
             </button>
          )}
        </header>

        {/* Main Content Area */}
        <div className="flex-1 flex items-center justify-center relative overflow-y-auto custom-scrollbar">
          {!video ? (
            <VideoUploader 
              onFileSelected={handleFileSelection} 
              onUrlSelected={handleUrlSelection}
              error={error}
              isProcessing={status === ChatStatus.PROCESSING_VIDEO} 
            />
          ) : (
            <div className="w-full min-h-min flex flex-col p-4 gap-4">
               {/* Video Player */}
               <div className="relative w-full bg-black rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10 aspect-video shrink-0">
                 {video.source === 'youtube' && youtubeId ? (
                   <iframe
                     src={`https://www.youtube.com/embed/${youtubeId}?origin=${window.location.origin}&modestbranding=1&rel=0`}
                     className="w-full h-full"
                     title="YouTube Video"
                     allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                     allowFullScreen
                   />
                 ) : video.source === 'youtube' ? (
                   <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2">
                      <AlertCircle size={32} />
                      <p>Invalid YouTube URL</p>
                   </div>
                 ) : (
                   <video 
                     src={video.url} 
                     controls 
                     className="w-full h-full object-contain"
                   />
                 )}
               </div>

               {/* Video Metadata */}
               <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 shrink-0">
                 <div className="flex justify-between items-start">
                    <div className="flex flex-col gap-1">
                        <h2 className="font-semibold text-slate-200 truncate max-w-[250px] mb-1">
                          {video.source === 'youtube' ? 'YouTube Video' : video.file?.name}
                        </h2>
                        <div className="flex gap-3 text-xs text-slate-400 font-mono items-center">
                           {video.source === 'youtube' ? (
                             <span className="flex items-center gap-1 text-red-400"><Youtube size={12} /> Native Analysis</span>
                           ) : (
                             <>
                               <span>{video.mimeType}</span>
                               <span>{video.file && formatFileSize(video.file.size)}</span>
                             </>
                           )}
                        </div>
                    </div>
                    
                    <div className="flex flex-col gap-2 items-end">
                      {locationStatus === 'granted' && (
                        <div className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full border border-emerald-500/20">
                           <MapPin size={10} />
                           <span>Loc: ON</span>
                        </div>
                      )}
                    </div>
                 </div>
               </div>

               {/* Visual Cue Analysis Panel */}
               <div className="flex-1 bg-slate-900/30 rounded-xl p-5 border border-slate-800/50 flex flex-col min-h-[200px]">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Visual Extraction Tools</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {analysisOptions.map((opt) => (
                      <button
                        key={opt.label}
                        onClick={() => performSendMessage(opt.prompt)}
                        disabled={status !== ChatStatus.READY}
                        className="flex items-center gap-3 p-3 bg-slate-800/60 hover:bg-orange-600/20 hover:border-orange-500/30 border border-slate-700/50 rounded-lg transition-all text-left group disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className="p-2 bg-slate-900 rounded-md text-orange-500 group-hover:text-orange-400 transition-colors">
                          <opt.icon size={18} />
                        </div>
                        <span className="text-sm text-slate-300 group-hover:text-white font-medium">
                          {opt.label}
                        </span>
                      </button>
                    ))}
                  </div>
               </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Panel: Chat Interface */}
      {video && (
        <div className="w-full md:w-1/2 lg:w-7/12 flex flex-col h-full bg-slate-950 relative">
            
          {/* TEXT CHAT MODE */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 scroll-smooth custom-scrollbar pt-4">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 opacity-40 select-none animate-pulse">
                    <div className="flex flex-col items-center gap-4">
                       <div className="w-16 h-16 rounded-full bg-orange-500/20 flex items-center justify-center">
                          <ScanEye size={32} className="text-orange-500" />
                       </div>
                       <p>Awakening Third Eye...</p>
                    </div>
                </div>
              ) : (
                <div className="flex flex-col max-w-3xl mx-auto pt-4 relative">
                  {/* Let's Cook Button (Appears if conversation exists) */}
                  <div className="absolute right-0 top-0 transform -translate-y-2 z-10">
                     <button
                        onClick={startCookMode}
                        disabled={isPreparingCookMode}
                        className="flex items-center gap-2 bg-gradient-to-r from-orange-600 to-orange-500 text-white px-4 py-2 rounded-full shadow-lg shadow-orange-500/30 hover:shadow-orange-500/50 transition-all hover:scale-105 active:scale-95 disabled:opacity-70 text-sm font-bold border border-orange-400/50"
                     >
                        {isPreparingCookMode ? <LoadingDots /> : (
                            <>
                                <ChefHat size={16} />
                                <span>Let's Cook!</span>
                            </>
                        )}
                     </button>
                  </div>

                  {messages.map((msg) => (
                    <ChatBubble key={msg.id} message={msg} />
                  ))}
                  {status === ChatStatus.STREAMING && !messages[messages.length - 1]?.text && (
                    <div className="flex justify-start w-full mb-6">
                      <div className="bg-slate-800/80 p-4 rounded-2xl rounded-tl-none">
                        <LoadingDots />
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} className="h-4" />
                </div>
              )}
            </div>

            {/* Input Area */}
            <div className="p-4 md:p-6 bg-slate-950/90 backdrop-blur-lg border-t border-slate-800/50">
              <div className="max-w-3xl mx-auto relative flex items-end gap-2">
                <div className="relative flex-1">
                    <textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={isRecording ? "Listening... (Auto-stop on silence)" : "Ask Tukatuu ThirdEye about details..."}
                      disabled={status === ChatStatus.PROCESSING_VIDEO || status === ChatStatus.STREAMING || isRecording}
                      className="w-full bg-slate-900 text-slate-200 rounded-2xl pl-5 pr-14 py-4 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/50 resize-none border border-slate-800 shadow-inner disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-slate-600 h-[60px] max-h-[120px] overflow-y-auto font-medium"
                      rows={1}
                    />
                    
                    <div className="absolute right-2 top-2 bottom-2 flex items-center gap-1">
                        {/* TTS Toggle */}
                        <button
                            onClick={() => setIsTTSEnabled(!isTTSEnabled)}
                            className={`
                                w-8 h-8 flex items-center justify-center rounded-lg transition-colors
                                ${isTTSEnabled 
                                    ? 'text-orange-400 bg-orange-500/10 hover:bg-orange-500/20' 
                                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                                }
                            `}
                            title={isTTSEnabled ? "Mute Answers" : "Read Answers Aloud"}
                        >
                            {isTTSEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
                        </button>

                        {/* Send Button */}
                        <button
                        onClick={() => performSendMessage()}
                        disabled={!input.trim() || status !== ChatStatus.READY}
                        className={`
                            w-10 h-full flex items-center justify-center rounded-xl transition-all duration-200
                            ${!input.trim() || status !== ChatStatus.READY
                            ? 'text-slate-600 bg-transparent' 
                            : 'text-white bg-orange-600 hover:bg-orange-500 shadow-lg shadow-orange-500/20'
                            }
                        `}
                        >
                        {status === ChatStatus.STREAMING ? (
                            <LoadingDots />
                        ) : (
                            <Send size={18} />
                        )}
                        </button>
                    </div>
                </div>

                {/* Mic Button */}
                <button
                  onClick={toggleRecording}
                  disabled={status !== ChatStatus.READY && !isRecording}
                  className={`
                    h-[60px] w-[60px] rounded-2xl flex items-center justify-center transition-all duration-300 border border-slate-800 shadow-lg relative overflow-hidden
                    ${isRecording 
                       ? 'bg-red-500 text-white shadow-red-500/30 border-red-400' 
                       : 'bg-slate-900 text-slate-400 hover:text-orange-500 hover:bg-slate-800 hover:border-orange-500/30'
                    }
                  `}
                  title={isRecording ? "Listening (Click to stop)" : "Voice Input"}
                >
                  {isRecording ? (
                      <>
                        <div className="absolute inset-0 bg-white/20 animate-ping rounded-2xl"></div>
                        <Square size={20} fill="currentColor" className="relative z-10" />
                      </>
                  ) : (
                      <Mic size={22} />
                  )}
                </button>
              </div>
            </div>
        </div>
      )}
    </div>
  );
}