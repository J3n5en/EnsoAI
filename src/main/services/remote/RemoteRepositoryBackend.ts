import type {
  CommitFileChange,
  ContentSearchParams,
  ContentSearchResult,
  FileChangesResult,
  FileDiff,
  FileEntry,
  FileReadResult,
  FileSearchResult,
  GitBranch,
  GitLogEntry,
  GitStatus,
  GitWorktree,
  WorktreeCreateOptions,
  WorktreeRemoveOptions,
} from '@shared/types';
import { remoteConnectionManager } from './RemoteConnectionManager';
import { createRemoteError } from './RemoteI18n';
import { isRemoteVirtualPath, parseRemoteVirtualPath, toRemoteVirtualPath } from './RemotePath';

function toRemotePath(inputPath: string): { connectionId: string; remotePath: string } {
  return parseRemoteVirtualPath(inputPath);
}

export class RemoteRepositoryBackend {
  private toVirtualPath(connectionId: string, remotePath: string): string {
    return toRemoteVirtualPath(connectionId, remotePath);
  }

  private toRemoteRelativePath(targetPath: string, remoteRootPath: string): string {
    if (!targetPath || !isRemoteVirtualPath(targetPath)) {
      return targetPath;
    }

    const { remotePath } = toRemotePath(targetPath);
    if (remotePath === remoteRootPath) {
      return '.';
    }
    const prefix = remoteRootPath.endsWith('/') ? remoteRootPath : `${remoteRootPath}/`;
    if (remotePath.startsWith(prefix)) {
      return remotePath.slice(prefix.length);
    }
    return remotePath;
  }

  async listFiles(dirPath: string): Promise<FileEntry[]> {
    const { connectionId, remotePath } = toRemotePath(dirPath);
    const entries = await remoteConnectionManager.call<FileEntry[]>(connectionId, 'fs:list', {
      path: remotePath,
    });
    return entries.map((entry) => ({
      ...entry,
      path: this.toVirtualPath(connectionId, entry.path),
    }));
  }

  async readFile(filePath: string): Promise<FileReadResult> {
    const { connectionId, remotePath } = toRemotePath(filePath);
    return remoteConnectionManager.call<FileReadResult>(connectionId, 'fs:read', {
      path: remotePath,
    });
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const { connectionId, remotePath } = toRemotePath(filePath);
    await remoteConnectionManager.call(connectionId, 'fs:write', {
      path: remotePath,
      content,
    });
  }

  async createFile(
    filePath: string,
    content = '',
    options?: { overwrite?: boolean }
  ): Promise<void> {
    const { connectionId, remotePath } = toRemotePath(filePath);
    await remoteConnectionManager.call(connectionId, 'fs:createFile', {
      path: remotePath,
      content,
      overwrite: options?.overwrite ?? false,
    });
  }

  async createDirectory(dirPath: string): Promise<void> {
    const { connectionId, remotePath } = toRemotePath(dirPath);
    await remoteConnectionManager.call(connectionId, 'fs:createDirectory', { path: remotePath });
  }

  async rename(fromPath: string, toPath: string): Promise<void> {
    const fromTarget = toRemotePath(fromPath);
    const toTarget = toRemotePath(toPath);
    if (fromTarget.connectionId !== toTarget.connectionId) {
      throw createRemoteError('Renaming across remote connections is not supported');
    }
    await remoteConnectionManager.call(fromTarget.connectionId, 'fs:rename', {
      fromPath: fromTarget.remotePath,
      toPath: toTarget.remotePath,
    });
  }

  async move(fromPath: string, toPath: string): Promise<void> {
    await this.rename(fromPath, toPath);
  }

  async delete(targetPath: string, options?: { recursive?: boolean }): Promise<void> {
    const { connectionId, remotePath } = toRemotePath(targetPath);
    await remoteConnectionManager.call(connectionId, 'fs:delete', {
      path: remotePath,
      recursive: options?.recursive ?? true,
    });
  }

  async exists(filePath: string): Promise<boolean> {
    const { connectionId, remotePath } = toRemotePath(filePath);
    return remoteConnectionManager.call<boolean>(connectionId, 'fs:exists', {
      path: remotePath,
    });
  }

  async getStatus(workdir: string): Promise<GitStatus> {
    const { connectionId, remotePath } = toRemotePath(workdir);
    return remoteConnectionManager.call<GitStatus>(connectionId, 'git:status', {
      rootPath: remotePath,
    });
  }

  async getBranches(workdir: string): Promise<GitBranch[]> {
    const { connectionId, remotePath } = toRemotePath(workdir);
    return remoteConnectionManager.call<GitBranch[]>(connectionId, 'git:branches', {
      rootPath: remotePath,
    });
  }

  async getLog(workdir: string, maxCount?: number, skip?: number): Promise<GitLogEntry[]> {
    const { connectionId, remotePath } = toRemotePath(workdir);
    return remoteConnectionManager.call<GitLogEntry[]>(connectionId, 'git:log', {
      rootPath: remotePath,
      maxCount,
      skip,
    });
  }

  async getDiff(workdir: string, staged?: boolean): Promise<string> {
    const { connectionId, remotePath } = toRemotePath(workdir);
    return remoteConnectionManager.call<string>(connectionId, 'git:diff', {
      rootPath: remotePath,
      staged: staged ?? false,
    });
  }

  async getFileChanges(workdir: string): Promise<FileChangesResult> {
    const { connectionId, remotePath } = toRemotePath(workdir);
    return remoteConnectionManager.call<FileChangesResult>(connectionId, 'git:fileChanges', {
      rootPath: remotePath,
    });
  }

  async getFileDiff(workdir: string, filePath: string, staged: boolean): Promise<FileDiff> {
    const { connectionId, remotePath } = toRemotePath(workdir);
    return remoteConnectionManager.call<FileDiff>(connectionId, 'git:fileDiff', {
      rootPath: remotePath,
      filePath: this.toRemoteRelativePath(filePath, remotePath),
      staged,
    });
  }

  async stage(workdir: string, paths: string[]): Promise<void> {
    const { connectionId, remotePath } = toRemotePath(workdir);
    await remoteConnectionManager.call(connectionId, 'git:stage', {
      rootPath: remotePath,
      paths: paths.map((item) => this.toRemoteRelativePath(item, remotePath)),
    });
  }

  async unstage(workdir: string, paths: string[]): Promise<void> {
    const { connectionId, remotePath } = toRemotePath(workdir);
    await remoteConnectionManager.call(connectionId, 'git:unstage', {
      rootPath: remotePath,
      paths: paths.map((item) => this.toRemoteRelativePath(item, remotePath)),
    });
  }

  async discard(workdir: string, paths: string[]): Promise<void> {
    const { connectionId, remotePath } = toRemotePath(workdir);
    await remoteConnectionManager.call(connectionId, 'git:discard', {
      rootPath: remotePath,
      paths: paths.map((item) => this.toRemoteRelativePath(item, remotePath)),
    });
  }

  async commit(workdir: string, message: string): Promise<string> {
    const { connectionId, remotePath } = toRemotePath(workdir);
    return remoteConnectionManager.call<string>(connectionId, 'git:commit', {
      rootPath: remotePath,
      message,
    });
  }

  async push(
    workdir: string,
    remote?: string,
    branch?: string,
    setUpstream?: boolean
  ): Promise<void> {
    const { connectionId, remotePath } = toRemotePath(workdir);
    await remoteConnectionManager.call(connectionId, 'git:push', {
      rootPath: remotePath,
      remote,
      branch,
      setUpstream,
    });
  }

  async pull(workdir: string, remote?: string, branch?: string): Promise<void> {
    const { connectionId, remotePath } = toRemotePath(workdir);
    await remoteConnectionManager.call(connectionId, 'git:pull', {
      rootPath: remotePath,
      remote,
      branch,
    });
  }

  async fetch(workdir: string, remote?: string): Promise<void> {
    const { connectionId, remotePath } = toRemotePath(workdir);
    await remoteConnectionManager.call(connectionId, 'git:fetch', {
      rootPath: remotePath,
      remote,
    });
  }

  async listWorktrees(workdir: string): Promise<GitWorktree[]> {
    const { connectionId, remotePath } = toRemotePath(workdir);
    const worktrees = await remoteConnectionManager.call<GitWorktree[]>(
      connectionId,
      'worktree:list',
      {
        rootPath: remotePath,
      }
    );
    return worktrees.map((worktree) => ({
      ...worktree,
      path: this.toVirtualPath(connectionId, worktree.path),
    }));
  }

  async addWorktree(workdir: string, options: WorktreeCreateOptions): Promise<void> {
    const { connectionId, remotePath } = toRemotePath(workdir);
    const remoteOptions: WorktreeCreateOptions = {
      ...options,
      path: this.toRemoteRelativePath(options.path, remotePath),
    };
    await remoteConnectionManager.call(connectionId, 'worktree:add', {
      rootPath: remotePath,
      options: remoteOptions,
    });
  }

  async removeWorktree(workdir: string, options: WorktreeRemoveOptions): Promise<void> {
    const { connectionId, remotePath } = toRemotePath(workdir);
    const remoteOptions: WorktreeRemoveOptions = {
      ...options,
      path: this.toRemoteRelativePath(options.path, remotePath),
    };
    await remoteConnectionManager.call(connectionId, 'worktree:remove', {
      rootPath: remotePath,
      options: remoteOptions,
    });
  }

  async searchFiles(
    rootPath: string,
    query: string,
    maxResults?: number
  ): Promise<FileSearchResult[]> {
    const { connectionId, remotePath } = toRemotePath(rootPath);
    const entries = await remoteConnectionManager.call<FileSearchResult[]>(
      connectionId,
      'search:files',
      {
        rootPath: remotePath,
        query,
        maxResults,
      }
    );
    return entries.map((entry) => ({
      ...entry,
      path: this.toVirtualPath(connectionId, entry.path),
    }));
  }

  async searchContent(params: ContentSearchParams): Promise<ContentSearchResult> {
    const {
      rootPath,
      query,
      maxResults,
      caseSensitive,
      wholeWord,
      regex,
      filePattern,
      useGitignore,
    } = params;
    const { connectionId, remotePath } = toRemotePath(rootPath);
    const result = await remoteConnectionManager.call<ContentSearchResult>(
      connectionId,
      'search:content',
      {
        rootPath: remotePath,
        query,
        maxResults,
        caseSensitive,
        wholeWord,
        regex,
        filePattern,
        useGitignore,
      }
    );
    return {
      ...result,
      matches: result.matches.map((match) => ({
        ...match,
        path: this.toVirtualPath(connectionId, match.path),
      })),
    };
  }

  async createBranch(workdir: string, name: string, startPoint?: string): Promise<void> {
    const { connectionId, remotePath } = toRemotePath(workdir);
    await remoteConnectionManager.call(connectionId, 'git:branchCreate', {
      rootPath: remotePath,
      name,
      startPoint,
    });
  }

  async checkout(workdir: string, branch: string): Promise<void> {
    const { connectionId, remotePath } = toRemotePath(workdir);
    await remoteConnectionManager.call(connectionId, 'git:checkout', {
      rootPath: remotePath,
      branch,
    });
  }

  async showCommit(workdir: string, hash: string): Promise<string> {
    const { connectionId, remotePath } = toRemotePath(workdir);
    return remoteConnectionManager.call<string>(connectionId, 'git:commitShow', {
      rootPath: remotePath,
      hash,
    });
  }

  async getCommitFiles(workdir: string, hash: string): Promise<CommitFileChange[]> {
    const { connectionId, remotePath } = toRemotePath(workdir);
    return remoteConnectionManager.call<CommitFileChange[]>(connectionId, 'git:commitFiles', {
      rootPath: remotePath,
      hash,
    });
  }

  async getCommitDiff(workdir: string, hash: string, filePath: string): Promise<FileDiff> {
    const { connectionId, remotePath } = toRemotePath(workdir);
    return remoteConnectionManager.call<FileDiff>(connectionId, 'git:commitDiff', {
      rootPath: remotePath,
      hash,
      filePath: this.toRemoteRelativePath(filePath, remotePath),
    });
  }

  async getDiffStats(workdir: string): Promise<{ insertions: number; deletions: number }> {
    const { connectionId, remotePath } = toRemotePath(workdir);
    return remoteConnectionManager.call<{ insertions: number; deletions: number }>(
      connectionId,
      'git:diffStats',
      {
        rootPath: remotePath,
      }
    );
  }
}

export const remoteRepositoryBackend = new RemoteRepositoryBackend();
