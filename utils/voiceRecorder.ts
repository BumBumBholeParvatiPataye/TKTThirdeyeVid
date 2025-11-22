export class VoiceRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;
  
  // Silence Detection
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private lastSoundTime: number = 0;
  private silenceThreshold = 15; // Adjust based on background noise
  private silenceDuration = 1500; // Stop after 1.5 seconds of silence
  
  // Speech Recognition
  private recognition: any | null = null;
  private finalTranscript: string = "";
  
  // Callbacks
  private onStopCallback: ((data: { base64: string; mimeType: string; transcript: string }) => void) | null = null;
  private onSilenceCallback: (() => void) | null = null;

  constructor() {
    // Initialize Speech Recognition if available
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';
    }
  }

  async start(onStop: (data: { base64: string; mimeType: string; transcript: string }) => void, onSilenceDetected: () => void) {
    this.onStopCallback = onStop;
    this.onSilenceCallback = onSilenceDetected;
    this.chunks = [];
    this.finalTranscript = "";
    this.lastSoundTime = Date.now();

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(this.stream);
      
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.chunks.push(e.data);
      };

      this.mediaRecorder.onstop = async () => {
        this.cleanup();
        const blob = new Blob(this.chunks, { type: 'audio/webm' }); 
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            const base64 = reader.result.split(',')[1];
            if (this.onStopCallback) {
                // Prefer transcript, fallback to generic if empty
                const text = this.finalTranscript.trim() || "🎤 Audio Message";
                this.onStopCallback({ base64, mimeType: blob.type, transcript: text });
            }
          }
        };
      };

      // Start Recording
      this.mediaRecorder.start();
      
      // Start Transcription
      if (this.recognition) {
        this.recognition.onresult = (event: any) => {
          let interimTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              this.finalTranscript += event.results[i][0].transcript;
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }
        };
        this.recognition.start();
      }

      // Start Silence Detection
      this.startSilenceDetection();

    } catch (error) {
      console.error("Error accessing microphone:", error);
      throw error;
    }
  }

  stop() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    if (this.recognition) {
        try {
            this.recognition.stop();
        } catch (e) {
            // Ignore if already stopped
        }
    }
  }

  private startSilenceDetection() {
    if (!this.stream) return;
    
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const source = this.audioContext.createMediaStreamSource(this.stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    source.connect(this.analyser);

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const checkSilence = () => {
      if (!this.analyser || !this.mediaRecorder || this.mediaRecorder.state === 'inactive') return;

      this.analyser.getByteFrequencyData(dataArray);
      
      // Calculate average volume
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const average = sum / bufferLength;

      if (average > this.silenceThreshold) {
        // Sound detected, reset timer
        this.lastSoundTime = Date.now();
      } 

      // Check how long it has been since last sound
      if (Date.now() - this.lastSoundTime > this.silenceDuration) {
        // Silence timeout reached
        if (this.onSilenceCallback) this.onSilenceCallback();
        return;
      }

      requestAnimationFrame(checkSilence);
    };

    checkSilence();
  }

  private cleanup() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}