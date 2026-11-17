export type ProviderErrorCode =
  /** The service answered 429 or 5xx. */
  | 'busy'
  /** The network request failed or timed out. */
  | 'noResponse'
  /** The service (or our own limiter) asked to wait; `seconds` says how long. */
  | 'wait'
  | 'spicyKeyMissing'
  | 'spicyKeyRejected'
  | 'spotifyClientMissing'
  | 'spotifyInvalidClient'
  | 'spotifyRejected'
  | 'spotifyNotConnected'
  | 'spotifyStateMismatch'
  | 'spotifyDenied'
  | 'spotifyCoverFailed';

/** A lyrics service that cannot answer. The UI turns `code` into a sentence that says what happened and how to fix it. */
export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly service: string;
  readonly seconds: number;

  constructor(code: ProviderErrorCode, service: string, seconds = 0) {
    super(`${service}: ${code}`);
    this.name = 'ProviderError';
    this.code = code;
    this.service = service;
    this.seconds = seconds;
  }
}
