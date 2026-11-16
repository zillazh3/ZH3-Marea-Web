export type LyricsErrorCode =
  | 'ttmlInvalid'
  | 'ttmlNotTtml'
  | 'ttmlTooLarge'
  | 'ttmlUnsafe'
  | 'badTime'
  | 'lyricsfileTooLarge'
  | 'lyricsfileInvalid'
  | 'lyricsfileVersion';

/** A lyrics file that cannot be read. The UI turns `code` into a sentence in the user's language; `message` is for logs. */
export class LyricsError extends Error {
  readonly code: LyricsErrorCode;

  constructor(code: LyricsErrorCode, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'LyricsError';
    this.code = code;
  }
}
