
export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  isError?: boolean;
}

export type VideoSource = 'file' | 'youtube';

export interface VideoFile {
  source: VideoSource;
  file?: File;
  url: string;
  base64?: string;
  mimeType: string;
}

export enum ChatStatus {
  IDLE = 'IDLE',
  PROCESSING_VIDEO = 'PROCESSING_VIDEO',
  READY = 'READY',
  STREAMING = 'STREAMING',
  ERROR = 'ERROR'
}

export interface LiveConfig {
  model: string;
  systemInstruction: string;
  voiceName?: string;
  tools?: any[];
}

export interface LiveTranscript {
  id: string;
  role: 'user' | 'model';
  text: string;
  isFinal: boolean;
  timestamp: number;
}

export type FunctionRegistry = {
  [key: string]: () => void | Promise<void>;
};
