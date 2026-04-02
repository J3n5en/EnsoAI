import type { GitLogEntry } from '@shared/types';

export const GIT_LOG_FIELD_SEPARATOR = '\x1f';
export const GIT_LOG_RECORD_SEPARATOR = '\x1e';
export const GIT_LOG_PRETTY_FORMAT = '%H%x1f%ai%x1f%an%x1f%ae%x1f%s%x1f%B%x1f%D%x1e';

export function parseGitLogOutput(output: string): GitLogEntry[] {
  // Git log --pretty=format adds a newline after each record, so we need to
  // trim each record to remove leading/trailing whitespace including newlines
  return output
    .split(GIT_LOG_RECORD_SEPARATOR)
    .map((record) => record.trim())
    .filter((record) => record.length > 0)
    .map((record) => {
      const parts = record.split(GIT_LOG_FIELD_SEPARATOR);
      const message = (parts[4] || '').trim();
      const fullMessage = (parts[5] || '').trim() || message;
      const refs = parts[6] || '';

      return {
        hash: parts[0] || '',
        date: parts[1] || '',
        author_name: parts[2] || '',
        author_email: parts[3] || '',
        message,
        fullMessage,
        refs: refs ? refs.replace('HEAD ->', '').trim() || undefined : undefined,
      };
    });
}
