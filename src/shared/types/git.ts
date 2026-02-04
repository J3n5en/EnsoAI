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
  /**
   * 变更数量过大时，为避免卡顿/内存暴涨，仅返回前 N 条文件路径。
   */
  truncated?: boolean;
  truncatedLimit?: number;
}

export interface GitBranch {
  name: string;
  current: boolean;
  commit: string;
  label: string;
  merged?: boolean;
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

export interface FileChangesResult {
  changes: FileChange[];
  skippedDirs?: string[]; // Directories skipped for performance (e.g., node_modules not in .gitignore)
  /**
   * 变更数量过大时，为避免卡顿/内存暴涨，仅返回前 N 条变更。
   */
  truncated?: boolean;
  truncatedLimit?: number;
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

// Pull Request types
export interface PullRequest {
  number: number;
  title: string;
  headRefName: string; // PR source branch name
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  author: string;
  updatedAt: string;
  isDraft: boolean;
}

export interface GhCliStatus {
  installed: boolean;
  authenticated: boolean;
  error?: string;
}

// Git Clone types
export interface CloneProgress {
  stage: 'counting' | 'compressing' | 'receiving' | 'resolving' | string;
  progress: number; // 0-100
}

export interface CloneResult {
  success: boolean;
  path: string;
  error?: string;
}

export interface ValidateUrlResult {
  valid: boolean;
  repoName?: string;
}

// Git Submodule types
export type SubmoduleStatus =
  | 'clean' // 干净
  | 'modified' // 有本地修改
  | 'outdated' // 需要更新
  | 'uninitialized'; // 未初始化

export interface GitSubmodule {
  name: string;
  path: string;
  url: string;
  branch?: string;
  head: string;
  status: SubmoduleStatus;
  initialized: boolean;
  // 远程同步状态
  tracking?: string;
  ahead: number;
  behind: number;
  // 本地变更状态
  hasChanges: boolean;
  stagedCount: number;
  unstagedCount: number;
}
