
/**
 * Captures microphone input and streams it as PCM16 via an AudioWorklet.
 */
export class AudioRecorder {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private onAudioData: (base64: string) => void;

  constructor(onAudioData: (base64: string) => void) {
    this.onAudioData = onAudioData;
  }

  async start() {
    // Gemini Live input expects 16kHz
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ 
      sampleRate: 16000 
    });

    // Load the AudioWorklet
    const workletCode = `
      class PCMProcessor extends AudioWorkletProcessor {
        process(inputs, outputs, parameters) {
          const input = inputs[0];
          if (input.length > 0) {
            const float32Tensor = input[0];
            const int16Array = new Int16Array(float32Tensor.length);
            for (let i = 0; i < float32Tensor.length; i++) {
              // Clamp and scale to Int16
              let s = Math.max(-1, Math.min(1, float32Tensor[i]));
              int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            this.port.postMessage(int16Array.buffer, [int16Array.buffer]);
          }
          return true;
        }
      }
      registerProcessor("pcm-processor", PCMProcessor);
    `;

    const blob = new Blob([workletCode], { type: 'application/javascript' });
    const workletUrl = URL.createObjectURL(blob);
    
    await this.audioContext.audioWorklet.addModule(workletUrl);
    
    if (!this.audioContext) {
       // Context was closed during addModule
       return;
    }

    // Get Microphone Access
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          channelCount: 1, 
          sampleRate: 16000 
        } 
      });
    } catch (e) {
      console.error("Failed to access microphone", e);
      throw e;
    }

    if (!this.audioContext) {
      // If context was closed while getting media, clean up the stream
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(t => t.stop());
      }
      return;
    }

    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
    this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-processor');

    // Handle data from the worklet
    this.workletNode.port.onmessage = (event) => {
      const int16Buffer = event.data;
      const base64 = this.arrayBufferToBase64(int16Buffer);
      this.onAudioData(base64);
    };

    this.sourceNode.connect(this.workletNode);
    this.workletNode.connect(this.audioContext.destination); // Necessary to keep the graph alive
  }

  stop() {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}