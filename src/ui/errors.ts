import type { Messages } from '@/features/i18n/messages';
import { LyricsError } from '@/features/lyrics/errors';
import { ProviderError } from '@/features/providers/errors';
import { ProjectError } from '@/features/projects/errors';
import { FileReadError } from './files';

/** The sentence the user reads for a failure: what happened and, when there is one, how to fix it. */
export function describeError(m: Messages, error: unknown): string {
  if (error instanceof LyricsError) return m.errors.lyrics[error.code];
  if (error instanceof ProjectError) {
    const text = m.errors.project[error.code];
    return error.where ? `${text} ${m.errors.where(error.where)}` : text;
  }
  if (error instanceof ProviderError) {
    return m.errors.provider[error.code](error.service, error.seconds);
  }
  if (error instanceof FileReadError) return m.errors.fileRead;
  return m.errors.unknown;
}
