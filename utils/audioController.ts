
export class AudioController {
  protected inputAudioContext: AudioContext;
  protected outputAudioContext: AudioContext;
  protected nextStartTime: number = 0;
  protected recordingScriptProcessor: ScriptProcessorNode | null = null;
  protected inputMediaStream: MediaStream | null = null;
  protected inputSource: MediaStreamAudioSourceNode | null = null;

  constructor() {
    // Gemini Live expects 16kHz input
    this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    // Gemini Live sends 24kHz output
    this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  }

  async startRecording(onAudioData: (base64: string) => void) {
    try {
      this.inputAudioContext.resume();
      this.inputMediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.inputSource = this.inputAudioContext.createMediaStreamSource(this.inputMediaStream);
      
      // Using ScriptProcessor for browser compatibility in simple setups
      // Buffer size 4096, 1 input channel, 1 output channel
      this.recordingScriptProcessor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);
      
      this.recordingScriptProcessor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const base64Data = this.pcmFloat32ToBase64(inputData);
        onAudioData(base64Data);
      };

      this.inputSource.connect(this.recordingScriptProcessor);
      this.recordingScriptProcessor.connect(this.inputAudioContext.destination); // Mute locally but keep active
    } catch (error) {
      console.error("Error starting recording:", error);
      throw error;
    }
  }

  stopRecording() {
    if (this.inputMediaStream) {
      this.inputMediaStream.getTracks().forEach(track => track.stop());
      this.inputMediaStream = null;
    }
    if (this.recordingScriptProcessor) {
      this.recordingScriptProcessor.disconnect();
      this.recordingScriptProcessor = null;
    }
    if (this.inputSource) {
      this.inputSource.disconnect();
      this.inputSource = null;
    }
  }

  async playAudioChunk(base64Audio: string) {
    try {
      this.outputAudioContext.resume();
      const audioBuffer = await this.base64ToAudioBuffer(base64Audio);
      this.queueAudio(audioBuffer);
    } catch (e) {
      console.error("Error decoding audio chunk", e);
    }
  }

  protected queueAudio(buffer: AudioBuffer) {
    const source = this.outputAudioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.outputAudioContext.destination);

    const currentTime = this.outputAudioContext.currentTime;
    // Schedule next start time
    const startTime = Math.max(currentTime, this.nextStartTime);
    source.start(startTime);
    
    this.nextStartTime = startTime + buffer.duration;
  }

  // --- Helpers ---

  protected pcmFloat32ToBase64(data: Float32Array): string {
    // Downsample/Convert Float32 (-1.0 to 1.0) to Int16
    const int16 = new Int16Array(data.length);
    for (let i = 0; i < data.length; i++) {
      // Clamp and scale
      let s = Math.max(-1, Math.min(1, data[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    
    // Convert to binary string
    let binary = '';
    const bytes = new Uint8Array(int16.buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  protected async base64ToAudioBuffer(base64: string): Promise<AudioBuffer> {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    const dataInt16 = new Int16Array(bytes.buffer);
    const sampleRate = 24000; // Gemini usually returns 24kHz
    const buffer = this.outputAudioContext.createBuffer(1, dataInt16.length, sampleRate);
    const channelData = buffer.getChannelData(0);
    
    for (let i = 0; i < channelData.length; i++) {
      channelData[i] = dataInt16[i] / 32768.0;
    }
    
    return buffer;
  }
  
  resumeContext() {
      if (this.inputAudioContext.state === 'suspended') {
          this.inputAudioContext.resume();
      }
      if (this.outputAudioContext.state === 'suspended') {
          this.outputAudioContext.resume();
      }
  }
}