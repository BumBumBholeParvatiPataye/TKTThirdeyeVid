import { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import { AudioRecorder } from '../utils/audioRecorder';
import { AudioStreamer } from '../utils/audioStreamer';
import { LiveConfig, FunctionRegistry } from '../types';

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

export const useLiveAPI = () => {
  const [connected, setConnected] = useState(false);
  
  const recorderRef = useRef<AudioRecorder | null>(null);
  const streamerRef = useRef<AudioStreamer | null>(null);
  const sessionRef = useRef<Promise<any> | null>(null);

  useEffect(() => {
    streamerRef.current = new AudioStreamer();
    return () => {
      if (streamerRef.current) {
        streamerRef.current.stop();
      }
    };
  }, []);

  const cleanup = useCallback(() => {
     if (recorderRef.current) {
        recorderRef.current.stop();
     }
     if (streamerRef.current) {
        streamerRef.current.stop();
     }
     sessionRef.current = null;
     setConnected(false);
  }, []);

  const disconnect = useCallback(() => {
    if (sessionRef.current) {
        sessionRef.current.then((session: any) => {
            try {
                session.close();
            } catch(e) {
                console.error("Error closing session", e);
            }
        });
    }
    cleanup();
  }, [cleanup]);

  // Send a video frame (base64) to the model
  const sendVideoFrame = useCallback((base64Image: string) => {
    if (sessionRef.current) {
      sessionRef.current.then((session: any) => {
        try {
          session.sendRealtimeInput({
            media: {
              mimeType: "image/jpeg",
              data: base64Image
            }
          });
        } catch (e) {
          console.error("Error sending video frame", e);
        }
      });
    }
  }, []);

  const connect = useCallback(async (config: LiveConfig, functionRegistry?: FunctionRegistry) => {
    if (!config.systemInstruction) {
      console.error("System instruction missing for Live API");
      return;
    }

    // 1. Setup Audio Recorder
    recorderRef.current = new AudioRecorder((base64Data) => {
      if (sessionRef.current) {
        sessionRef.current.then((session: any) => {
          try {
            session.sendRealtimeInput({
              media: {
                mimeType: "audio/pcm;rate=16000",
                data: base64Data
              }
            });
          } catch (e) {
            console.error("Error sending realtime input", e);
          }
        });
      }
    });

    // 2. Connect to Gemini Live
    const sessionPromise = ai.live.connect({
      model: config.model || 'gemini-2.5-flash-native-audio-preview-09-2025',
      callbacks: {
        onopen: async () => {
          console.log("Live Session Connected");
          setConnected(true);
          await recorderRef.current?.start();
        },
        onmessage: async (msg: any) => {
          // Handle Audio Output
          const base64Audio = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
          if (base64Audio) {
            streamerRef.current?.addPCMChunk(base64Audio);
          }

          // Handle Tool Calls (Function Calling)
          if (msg.toolCall) {
            const functionResponses = [];
            for (const fc of msg.toolCall.functionCalls) {
              const func = functionRegistry?.[fc.name];
              if (func) {
                 console.log(`Executing tool: ${fc.name}`);
                 try {
                   await func();
                   // Acknowledge execution
                   functionResponses.push({
                     id: fc.id,
                     name: fc.name,
                     response: { result: "success" }
                   });
                 } catch (e) {
                    console.error(`Tool execution failed: ${fc.name}`, e);
                    functionResponses.push({
                     id: fc.id,
                     name: fc.name,
                     response: { result: "error", error: String(e) }
                   });
                 }
              } else {
                 console.warn(`Tool not found: ${fc.name}`);
              }
            }
            
            // Send response back to model so conversation continues
            if (functionResponses.length > 0) {
               sessionRef.current?.then(session => {
                 session.sendToolResponse({ functionResponses });
               });
            }
          }
        },
        onclose: () => {
          console.log("Live Session Closed");
          cleanup();
        },
        onerror: (err: any) => {
          console.error("Live Session Error", err);
          cleanup();
        }
      },
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: config.systemInstruction,
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: config.voiceName || 'Kore' } },
        },
        tools: config.tools || [{ googleSearch: {} }],
      }
    });

    sessionRef.current = sessionPromise;
  }, [cleanup]);

  return {
    connect,
    disconnect,
    sendVideoFrame,
    connected,
  };
};