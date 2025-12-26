import { execSync, spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { type FileChangeStatus, IPC_CHANNELS } from '@shared/types';
import { ipcMain } from 'electron';
import { GitService } from '../services/git/GitService';
import { getEnhancedPath } from '../services/terminal/PtyManager';

const gitServices = new Map<string, GitService>();

// Authorized workdirs (registered when worktrees are loaded)
const authorizedWorkdirs = new Set<string>();

export function registerAuthorizedWorkdir(workdir: string): void {
  authorizedWorkdirs.add(path.resolve(workdir));
}

export function unregisterAuthorizedWorkdir(workdir: string): void {
  const resolved = path.resolve(workdir);
  authorizedWorkdirs.delete(resolved);
  gitServices.delete(resolved);
}

export function clearAllGitServices(): void {
  gitServices.clear();
  authorizedWorkdirs.clear();
}

function validateWorkdir(workdir: string): string {
  const resolved = path.resolve(workdir);

  // Check if workdir is authorized
  if (!authorizedWorkdirs.has(resolved)) {
    // Fallback: check if it's a valid git directory
    if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
      throw new Error('Invalid workdir: path does not exist or is not a directory');
    }
    // Check for .git folder
    const gitDir = path.join(resolved, '.git');
    if (!existsSync(gitDir)) {
      throw new Error('Invalid workdir: not a git repository');
    }
  }

  return resolved;
}

function getGitService(workdir: string): GitService {
  const resolved = validateWorkdir(workdir);
  if (!gitServices.has(resolved)) {
    gitServices.set(resolved, new GitService(resolved));
  }
  return gitServices.get(resolved)!;
}

export function registerGitHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.GIT_STATUS, async (_, workdir: string) => {
    const git = getGitService(workdir);
    return git.getStatus();
  });

  ipcMain.handle(
    IPC_CHANNELS.GIT_LOG,
    async (_, workdir: string, maxCount?: number, skip?: number) => {
      const git = getGitService(workdir);
      return git.getLog(maxCount, skip);
    }
  );

  ipcMain.handle(IPC_CHANNELS.GIT_BRANCH_LIST, async (_, workdir: string) => {
    const git = getGitService(workdir);
    return git.getBranches();
  });

  ipcMain.handle(
    IPC_CHANNELS.GIT_BRANCH_CREATE,
    async (_, workdir: string, name: string, startPoint?: string) => {
      const git = getGitService(workdir);
      await git.createBranch(name, startPoint);
    }
  );

  ipcMain.handle(IPC_CHANNELS.GIT_BRANCH_CHECKOUT, async (_, workdir: string, branch: string) => {
    const git = getGitService(workdir);
    await git.checkout(branch);
  });

  ipcMain.handle(
    IPC_CHANNELS.GIT_COMMIT,
    async (_, workdir: string, message: string, files?: string[]) => {
      const git = getGitService(workdir);
      return git.commit(message, files);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GIT_PUSH,
    async (_, workdir: string, remote?: string, branch?: string) => {
      const git = getGitService(workdir);
      await git.push(remote, branch);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GIT_PULL,
    async (_, workdir: string, remote?: string, branch?: string) => {
      const git = getGitService(workdir);
      await git.pull(remote, branch);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GIT_DIFF,
    async (_, workdir: string, options?: { staged?: boolean }) => {
      const git = getGitService(workdir);
      return git.getDiff(options);
    }
  );

  ipcMain.handle(IPC_CHANNELS.GIT_INIT, async (_, workdir: string) => {
    const resolved = validateWorkdir(workdir);
    const git = getGitService(resolved);
    await git.init();
    // Clear the service cache after init to get fresh instance
    gitServices.delete(resolved);
  });

  ipcMain.handle(IPC_CHANNELS.GIT_FILE_CHANGES, async (_, workdir: string) => {
    const git = getGitService(workdir);
    return git.getFileChanges();
  });

  ipcMain.handle(
    IPC_CHANNELS.GIT_FILE_DIFF,
    async (_, workdir: string, filePath: string, staged: boolean) => {
      const git = getGitService(workdir);
      return git.getFileDiff(filePath, staged);
    }
  );

  ipcMain.handle(IPC_CHANNELS.GIT_STAGE, async (_, workdir: string, paths: string[]) => {
    const git = getGitService(workdir);
    await git.stage(paths);
  });

  ipcMain.handle(IPC_CHANNELS.GIT_UNSTAGE, async (_, workdir: string, paths: string[]) => {
    const git = getGitService(workdir);
    await git.unstage(paths);
  });

  ipcMain.handle(IPC_CHANNELS.GIT_DISCARD, async (_, workdir: string, filePath: string) => {
    const git = getGitService(workdir);
    await git.discard(filePath);
  });

  ipcMain.handle(IPC_CHANNELS.GIT_COMMIT_SHOW, async (_, workdir: string, hash: string) => {
    const git = getGitService(workdir);
    return git.showCommit(hash);
  });

  ipcMain.handle(IPC_CHANNELS.GIT_COMMIT_FILES, async (_, workdir: string, hash: string) => {
    const git = getGitService(workdir);
    return git.getCommitFiles(hash);
  });

  ipcMain.handle(
    IPC_CHANNELS.GIT_COMMIT_DIFF,
    async (_, workdir: string, hash: string, filePath: string, status?: FileChangeStatus) => {
      const git = getGitService(workdir);
      return git.getCommitDiff(hash, filePath, status);
    }
  );

  ipcMain.handle(IPC_CHANNELS.GIT_DIFF_STATS, async (_, workdir: string) => {
    const git = getGitService(workdir);
    return git.getDiffStats();
  });

  ipcMain.handle(
    IPC_CHANNELS.GIT_GENERATE_COMMIT_MSG,
    async (
      _,
      workdir: string,
      options: { maxDiffLines: number; timeout: number }
    ): Promise<{ success: boolean; message?: string; error?: string }> => {
      const resolved = validateWorkdir(workdir);

      // Helper to run git commands
      const runGit = (cmd: string): string => {
        try {
          return execSync(cmd, { cwd: resolved, encoding: 'utf-8', timeout: 5000 }).trim();
        } catch {
          return '';
        }
      };

      // Gather git info
      const recentCommits = runGit('git --no-pager log -5 --format="%s"');
      const stagedStat = runGit('git --no-pager diff --cached --stat');
      const unstagedStat = runGit('git --no-pager diff --stat');
      const stagedDiff = runGit('git --no-pager diff --cached');
      const unstagedDiff = runGit(`git --no-pager diff | head -${options.maxDiffLines}`);

      const diffStat = [stagedStat, unstagedStat].filter(Boolean).join('\n');
      const diffContent = [stagedDiff, unstagedDiff].filter(Boolean).join('\n');

      const truncatedDiff =
        diffContent.split('\n').slice(0, options.maxDiffLines).join('\n') ||
        '(no changes detected)';

      const prompt = `你无法调用任何工具，我消息里已经包含了所有你需要的信息，无需解释，直接返回一句简短的 commit message。

参考风格：
${recentCommits || '(no recent commits)'}

变更摘要：
${diffStat || '(no stats)'}

变更详情：
${truncatedDiff}`;

      return new Promise((resolve) => {
        const timeoutMs = options.timeout * 1000;

        const args = [
          '-p',
          '--output-format',
          'json',
          '--no-session-persistence',
          '--tools',
          '',
          '--model',
          'haiku',
        ];

        const proc = spawn('claude', args, {
          cwd: resolved,
          shell: true,
          env: {
            ...process.env,
            PATH: getEnhancedPath(),
          },
        });

        proc.stdin.write(prompt);
        proc.stdin.end();

        let stdout = '';
        let stderr = '';

        const timer = setTimeout(() => {
          proc.kill('SIGTERM');
          resolve({ success: false, error: 'timeout' });
        }, timeoutMs);

        proc.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        proc.on('close', (code) => {
          clearTimeout(timer);

          if (code !== 0) {
            resolve({ success: false, error: stderr || `Exit code: ${code}` });
            return;
          }

          try {
            const result = JSON.parse(stdout);
            if (result.type === 'result' && result.subtype === 'success' && result.result) {
              resolve({ success: true, message: result.result });
            } else {
              resolve({ success: false, error: result.error || 'Unknown error' });
            }
          } catch {
            resolve({ success: false, error: 'Failed to parse response' });
          }
        });

        proc.on('error', (err) => {
          clearTimeout(timer);
          resolve({ success: false, error: err.message });
        });
      });
    }
  );
}
