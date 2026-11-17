export type AudioErrorCode = 'decodeFailed' | 'emptyAudio' | 'fileTooLarge';

export class AudioError extends Error {
  readonly code: AudioErrorCode;

  constructor(code: AudioErrorCode) {
    super(code);
    this.name = 'AudioError';
    this.code = code;
  }
}
