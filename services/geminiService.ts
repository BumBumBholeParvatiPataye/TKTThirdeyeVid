import { GoogleGenAI, Chat, GenerateContentResponse, Modality, FunctionDeclaration, Type } from "@google/genai";

// Initialize the API client
const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

/**
 * Creates a chat session with the Gemini model.
 */
export const createChatSession = (location?: { lat: number; lng: number }): Chat => {
  
  const tools: any[] = [{ googleSearch: {} }, { googleMaps: {} }];
  
  let toolConfig = undefined;
  if (location) {
    toolConfig = {
      retrievalConfig: {
        latLng: {
          latitude: location.lat,
          longitude: location.lng
        }
      }
    };
  }

  return ai.chats.create({
    model: 'gemini-2.5-flash',
    config: {
      tools,
      toolConfig,
      systemInstruction: `You are "Tukatuu ThirdEye", an all-seeing, witty, and sharp AI video analyst. 

**YOUR PERSONA:**
*   **The Vibe:** You are like that smart, slightly chaotic best friend who notices everything. You are helpful but fun.
*   **The "Third Eye":** You play into the "Third Eye" trope (like Mahadev's all-seeing eye) but keep it techy and modern. You see what standard cameras miss.
*   **Tone:** Conversational, confident, slightly humorous, but deeply knowledgeable. Use emojis occasionally.
*   **Honesty:** If you don't know, you find out (using Search/Maps). If you assume something, you say "I'm guessing..."

**CORE DIRECTIVE: INFER AND AUGMENT**
If the user asks for info not visually present (e.g., prep time, history), DO NOT say "I don't see it."
1.  **Identify missing info.**
2.  **Use Tools/Knowledge** to fill the gap.
3.  **Answer** with context. "The video doesn't show a timer, but typically this takes 10 mins."

**Behaviors:**
*   **Native YouTube:** You watch YouTube videos directly via tokens.
*   **Audio Input:** You can hear the user. Respond naturally to voice.
`,
    },
  });
};

/**
 * Generates the initial "Welcome + Summary" message automatically.
 */
export const generateWelcomeMessageStream = async function* (
    chat: Chat,
    videoData: { base64?: string; mimeType: string; url: string }
) {
    const messageParts = constructVideoMessageParts(videoData, 
        "Introduce yourself as Tukatuu ThirdEye (make a brief, fun reference to having an all-seeing eye like Mahadev but for videos). Then, immediately provide a punchy, interesting summary of what is happening in this video. Keep it conversational."
    );

    const responseStream = await chat.sendMessageStream({
        message: messageParts
    });

    for await (const chunk of responseStream) {
        const c = chunk as GenerateContentResponse;
        if (c.text) {
            yield c.text;
        }
    }
};

/**
 * Sends the initial message containing the video data and the user's prompt (text or audio).
 */
export const sendInitialVideoMessageStream = async function* (
  chat: Chat,
  videoData: {
    base64?: string;
    mimeType: string;
    url: string;
  },
  prompt: string | { base64: string; mimeType: string }
) {
  const messageParts = constructVideoMessageParts(videoData, prompt);

  const responseStream = await chat.sendMessageStream({
    message: messageParts
  });

  for await (const chunk of responseStream) {
    const c = chunk as GenerateContentResponse;
    if (c.text) {
      yield c.text;
    }
  }
};

/**
 * Generates a standalone summary of the video content.
 */
export const generateVideoSummaryStream = async function* (
  videoData: {
    base64?: string;
    mimeType: string;
    url: string;
  }
) {
  const messageParts = constructVideoMessageParts(videoData, "Provide a concise, objective summary of this video's visual content, key actions, and narrative.");

  const responseStream = await ai.models.generateContentStream({
    model: 'gemini-2.5-flash',
    contents: { parts: messageParts },
    config: {
      systemInstruction: "You are a precise video summarizer. Output a single concise paragraph describing the video."
    }
  });

  for await (const chunk of responseStream) {
    if (chunk.text) {
      yield chunk.text;
    }
  }
};

// --- COOK MODE TOOLS & CONTEXT ---

export const cookingTools = [
  {
    functionDeclarations: [
      {
        name: "flipCamera",
        description: "Switch between front and back cameras. Call this when the user asks to 'flip', 'switch', or 'turn' the camera.",
        parameters: {
          type: Type.OBJECT,
          properties: {},
        },
      },
      {
        name: "toggleMute",
        description: "Mute or unmute the audio. Call this when the user asks to 'mute', 'unmute', or 'silence' audio.",
        parameters: {
          type: Type.OBJECT,
          properties: {},
        },
      },
      {
        name: "endSession",
        description: "End the cooking session. Call this when the user says 'goodbye', 'stop', 'end', or indicates they are done.",
        parameters: {
          type: Type.OBJECT,
          properties: {},
        },
      }
    ]
  }
];

/**
 * Generates a context briefing for the Cook Mode (Live API).
 */
export const generateCookingContext = async (chat: Chat): Promise<string> => {
    try {
        const response = await chat.sendMessage({
            message: `
            We are switching to 'Live Camera Mode' where I will cook. 
            Write a strict SYSTEM INSTRUCTION for your other self (the Live Vision AI) to ensure consistent personality and capabilities.
            
            **INSTRUCTIONS FOR THE LIVE AI:**
            1. **Persona:** You are Tukatuu ThirdEye (witty, smart, helpful, Mahadev reference). You are NOT a robot. You are a Cooking Companion.
            2. **Context:** Summarize EXACTLY what food/recipe we just watched in the video. This is the recipe the user is cooking.
            3. **Visual Intelligence:** 
               - Actively identify ingredients on the counter/pan. 
               - If you see an ingredient NOT in the recipe, ask: "Ooh, I see [ingredient]. Are we getting creative?"
               - Watch for visual doneness (e.g., "That looks golden brown!").
            4. **Gesture Recognition:** 
               - Watch for the user giving a "Thumbs Up" gesture to the camera. 
               - If you see a Thumbs Up, interpret it as confirmation ("Great, moving to next step!") or success.
            5. **Proactive Coaching:** 
               - If the user seems stuck or adds something weird, offer gentle, real-time corrections ("Wait, that looks like sugar, not salt!").
               - Proactively offer tips like "Make sure the pan is hot enough!" or "Don't overmix it!" based on what you see.
            6. **Tool Use:**
               - You have access to tools: 'flipCamera', 'toggleMute', 'endSession'. 
               - Call them if the user commands it verbally (e.g., "Flip the camera", "Shut up for a sec").
            
            Output ONLY the system instruction paragraph.
            `
        });
        return response.text || "You are Tukatuu ThirdEye. Guide the user through cooking. Identify ingredients, watch for thumbs-up gestures to confirm steps, and call tools if asked.";
    } catch (e) {
        console.error("Failed to generate cooking context", e);
        return "You are Tukatuu ThirdEye. Help the user cook. The user has just watched a food video.";
    }
};

/**
 * Helper to construct the video payload for both Chat and GenerateContent.
 */
const constructVideoMessageParts = (
  videoData: { base64?: string; mimeType: string; url: string },
  prompt: string | { base64: string; mimeType: string }
): any[] => {
  let videoPart: any;

  if (videoData.base64) {
    // Binary file case
    videoPart = {
      inlineData: {
        data: videoData.base64,
        mimeType: videoData.mimeType,
      },
    };
  } else {
    // YouTube / URL case
    const isYouTube = videoData.url.match(/youtu\.?be|youtube\.com/);
    
    if (isYouTube) {
      videoPart = {
        fileData: {
          mimeType: 'video/mp4', 
          fileUri: videoData.url
        }
      };
    } else {
      // Fallback for generic URLs if deep scraping failed
      videoPart = { text: `I am watching this video URL: ${videoData.url}\n\n` };
    }
  }

  // Construct prompt part (Text or Audio)
  let promptPart: any;
  if (typeof prompt === 'string') {
    promptPart = { text: prompt };
  } else {
    promptPart = {
      inlineData: {
        data: prompt.base64,
        mimeType: prompt.mimeType
      }
    };
  }

  return [videoPart, promptPart];
};

/**
 * Sends a subsequent message (text or audio) in the existing chat session.
 */
export const sendChatMessageStream = async function* (
  chat: Chat,
  content: string | { base64: string; mimeType: string }
) {
  let message;
  
  if (typeof content === 'string') {
    message = content;
  } else {
    // Multimodal Audio Message
    message = [
      {
        inlineData: {
          data: content.base64,
          mimeType: content.mimeType
        }
      }
    ];
  }

  const responseStream = await chat.sendMessageStream({
    message: message,
  });

  for await (const chunk of responseStream) {
    const c = chunk as GenerateContentResponse;
    if (c.text) {
      yield c.text;
    }
  }
};

/**
 * Generates Text-to-Speech audio from the Gemini model.
 */
export const generateTTS = async (text: string): Promise<string | undefined> => {
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: 'Kore' }, // Using Kore for a calm, helpful female voice
                    },
                },
            },
        });
        
        return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    } catch (error) {
        console.error("TTS Generation Error:", error);
        return undefined;
    }
};