export interface GitStatus {
  isClean: boolean;
  current: string | null;
  tracking: string | null;
  ahead: number;
  behind: number;
  staged: string[];
  modified: string[];
  deleted: string[];
  untracked: string[];
  conflicted: string[];
}

export interface GitBranch {
  name: string;
  current: boolean;
  commit: string;
  label: string;
}

export interface GitLogEntry {
  hash: string;
  date: string;
  message: string;
  author_name: string;
  author_email: string;
  refs?: string;
}

export interface GitWorktree {
  path: string;
  head: string;
  branch: string | null;
  isMainWorktree: boolean;
  isLocked: boolean;
  prunable: boolean;
}

// Source Control types
// M=Modified, A=Added(staged), D=Deleted, R=Renamed, C=Copied, U=Untracked, X=Conflict
export type FileChangeStatus = 'M' | 'A' | 'D' | 'R' | 'C' | 'U' | 'X';

export interface FileChange {
  path: string;
  status: FileChangeStatus;
  staged: boolean;
  originalPath?: string; // for renames
}

export interface FileDiff {
  path: string;
  original: string; // HEAD version (empty for new files)
  modified: string; // working tree version (empty for deleted files)
}

// Commit history detail types
export interface CommitFileChange {
  path: string;
  status: FileChangeStatus;
}

export interface CommitDetail {
  hash: string;
  date: string;
  message: string;
  author_name: string;
  author_email: string;
  refs?: string;
  files: CommitFileChange[];
  fullDiff: string;
}
