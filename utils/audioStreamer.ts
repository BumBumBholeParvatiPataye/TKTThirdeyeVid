/**
 * Handles playing raw PCM audio chunks from the server with gapless playback.
 */
export class AudioStreamer {
  public audioContext: AudioContext;
  private nextStartTime: number = 0;
  private isPlaying: boolean = false;
  private scheduledSources: AudioBufferSourceNode[] = [];

  constructor() {
    // Gemini Live output is 24kHz
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ 
      sampleRate: 24000 
    });
  }

  /**
   * Decodes base64 PCM data and schedules it for playback.
   */
  async addPCMChunk(base64Chunk: string) {
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    const audioBuffer = await this.convertPCMToAudioBuffer(base64Chunk);
    
    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);

    // Schedule the chunk to play immediately after the previous one finishes
    const currentTime = this.audioContext.currentTime;
    const startTime = Math.max(currentTime, this.nextStartTime);
    
    source.start(startTime);
    this.nextStartTime = startTime + audioBuffer.duration;
    
    this.scheduledSources.push(source);
    
    // Cleanup finished sources occasionally could be implemented here, 
    // but for simple sessions we rely on garbage collection after they stop.
  }

  /**
   * Stops all currently playing audio and resets the scheduler.
   */
  stop() {
    this.scheduledSources.forEach(source => {
      try {
        source.stop();
      } catch (e) {
        // Ignore errors if source already stopped
      }
    });
    this.scheduledSources = [];
    this.nextStartTime = 0;
  }

  private async convertPCMToAudioBuffer(base64: string): Promise<AudioBuffer> {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Convert Uint8Array (representing Int16) to Int16Array
    const dataInt16 = new Int16Array(bytes.buffer);
    
    // Create AudioBuffer (1 channel, 24kHz)
    const buffer = this.audioContext.createBuffer(1, dataInt16.length, 24000);
    const channelData = buffer.getChannelData(0);
    
    // Convert Int16 to Float32 (-1.0 to 1.0)
    for (let i = 0; i < channelData.length; i++) {
      channelData[i] = dataInt16[i] / 32768.0;
    }
    
    return buffer;
  }
}
