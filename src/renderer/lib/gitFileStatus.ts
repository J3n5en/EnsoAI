import type { FileChangeStatus } from '@shared/types';

export const GIT_FILE_STATUS_PRIORITY: readonly FileChangeStatus[] = [
  'X',
  'D',
  'M',
  'R',
  'A',
  'C',
  'U',
];

export const GIT_FILE_STATUS_COLOR: Record<FileChangeStatus, string> = {
  M: 'text-orange-500',
  A: 'text-green-500',
  D: 'text-red-500',
  R: 'text-blue-500',
  C: 'text-blue-500',
  U: 'text-green-500',
  X: 'text-purple-500',
};

export const GIT_FILE_STATUS_LABEL: Record<FileChangeStatus, string> = {
  M: 'Modified',
  A: 'Added',
  D: 'Deleted',
  R: 'Renamed',
  C: 'Copied',
  U: 'Untracked',
  X: 'Conflict',
};

export function pickHigherPriorityGitStatus(
  current: FileChangeStatus | undefined,
  candidate: FileChangeStatus
): FileChangeStatus {
  if (!current) return candidate;
  return GIT_FILE_STATUS_PRIORITY.indexOf(candidate) < GIT_FILE_STATUS_PRIORITY.indexOf(current)
    ? candidate
    : current;
}
