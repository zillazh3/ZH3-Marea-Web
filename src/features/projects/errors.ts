export type ProjectErrorCode =
  | 'invalidJson'
  | 'notObject'
  | 'notList'
  | 'notNumber'
  | 'notText'
  | 'missingKey'
  | 'endsBeforeStart'
  | 'noLines'
  | 'unsupportedSchema'
  | 'badVersion'
  | 'unsupportedVersion'
  | 'badArtists';

/**
 * A `.marea.json` that cannot be opened. `where` is the path of the offending field (`lyrics.lines[2].start`) and `detail` the
 * value or name involved; the UI builds the sentence in the user's language from those.
 */
export class ProjectError extends Error {
  readonly code: ProjectErrorCode;
  readonly where: string;
  readonly detail: string;

  constructor(code: ProjectErrorCode, where = '', detail = '') {
    super(`${code} at ${where || 'file'}${detail ? `: ${detail}` : ''}`);
    this.name = 'ProjectError';
    this.code = code;
    this.where = where;
    this.detail = detail;
  }
}
