export type PresetErrorCode =
  | 'tooLarge'
  | 'invalidJson'
  | 'notObject'
  | 'unsupportedSchema'
  | 'badVersion'
  | 'unsupportedVersion'
  | 'emptyName'
  | 'nameTooLong'
  | 'duplicateName'
  | 'notFound'
  | 'builtinReadOnly';

export class PresetError extends Error {
  readonly code: PresetErrorCode;
  readonly detail: string;

  constructor(code: PresetErrorCode, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'PresetError';
    this.code = code;
    this.detail = detail;
  }
}
