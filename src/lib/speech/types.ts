export interface SttResult {
  text: string;
  isFinal: boolean;
  /** 0..1; Chrome often reports 0 for interim results. */
  confidence: number;
  /** performance.now() when the result arrived. */
  at: number;
}

export interface SpeechToText {
  readonly name: string;
  readonly supported: boolean;
  start(): void;
  stop(): void;
  onResult(cb: (r: SttResult) => void): () => void;
  /** Raw error code (Web Speech codes such as "network", "not-allowed"; map with mapSttError). */
  onError(cb: (code: string) => void): () => void;
  /** Waits until speech captured so far has been delivered as final results. */
  flush(): Promise<void>;
}

export type SttEngine = "web-speech" | "groq-whisper";

export interface SpeakOptions {
  /** Called with the character index as each word starts (drives captions/avatar). */
  onBoundary?: (charIndex: number) => void;
}

export interface TextToSpeech {
  readonly name: string;
  readonly supported: boolean;
  /** Resolves when speech finishes or is cancelled. */
  speak(text: string, opts?: SpeakOptions): Promise<void>;
  /** Stops immediately (barge-in). */
  cancel(): void;
  readonly speaking: boolean;
}
