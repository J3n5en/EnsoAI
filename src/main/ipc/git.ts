import type { ChildProcess } from 'node:child_process';
import { execSync, spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { type FileChangeStatus, IPC_CHANNELS } from '@shared/types';
import { ipcMain } from 'electron';
import { GitService } from '../services/git/GitService';
import { getEnvForCommand, getShellForCommand } from '../utils/shell';

const gitServices = new Map<string, GitService>();

// Active code review processes
const activeCodeReviews = new Map<string, ChildProcess>();

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

  ipcMain.handle(IPC_CHANNELS.GIT_FETCH, async (_, workdir: string, remote?: string) => {
    const git = getGitService(workdir);
    await git.fetch(remote);
  });

  ipcMain.handle(
    IPC_CHANNELS.GIT_DIFF,
    async (_, workdir: string, options?: { staged?: boolean }) => {
      const git = getGitService(workdir);
      return git.getDiff(options);
    }
  );

  ipcMain.handle(IPC_CHANNELS.GIT_INIT, async (_, workdir: string) => {
    const resolved = path.resolve(workdir);

    // For git init, only validate path exists and is a directory (no .git check)
    if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
      throw new Error('Invalid workdir: path does not exist or is not a directory');
    }

    // Create GitService and init
    const git = new GitService(resolved);
    await git.init();

    // Register as authorized and cache the service
    authorizedWorkdirs.add(resolved);
    gitServices.set(resolved, git);
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

  ipcMain.handle(IPC_CHANNELS.GIT_DISCARD, async (_, workdir: string, paths: string[]) => {
    const git = getGitService(workdir);
    await git.discard(paths);
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
      options: { maxDiffLines: number; timeout: number; model: string }
    ): Promise<{ success: boolean; message?: string; error?: string }> => {
      const resolved = validateWorkdir(workdir);

      // Helper to run git commands
      const runGit = (cmd: string): string => {
        try {
          return execSync(cmd, {
            cwd: resolved,
            encoding: 'utf-8',
            timeout: 5000,
          }).trim();
        } catch {
          return '';
        }
      };

      // Gather git info - only staged changes for commit message
      const recentCommits = runGit('git --no-pager log -5 --format="%s"');
      const stagedStat = runGit('git --no-pager diff --cached --stat');
      const stagedDiff = runGit('git --no-pager diff --cached');

      const truncatedDiff =
        stagedDiff.split('\n').slice(0, options.maxDiffLines).join('\n') ||
        '(no staged changes detected)';

      const prompt = `你无法调用任何工具，我消息里已经包含了所有你需要的信息，无需解释，直接返回一句简短的 commit message。

参考风格：
${recentCommits || '(no recent commits)'}

变更摘要：
${stagedStat || '(no stats)'}

变更详情：
${truncatedDiff}`;

      return new Promise((resolve) => {
        const timeoutMs = options.timeout * 1000;
        const { shell, args: shellArgs } = getShellForCommand();

        const claudeArgs = [
          '-p',
          '--output-format',
          'json',
          '--no-session-persistence',
          '--tools',
          '',
          '--model',
          options.model || 'haiku',
        ];
        const command = `claude ${claudeArgs.join(' ')}`;

        const proc = spawn(shell, [...shellArgs, command], {
          cwd: resolved,
          env: getEnvForCommand(),
        });

        // Handle stdin errors to prevent EPIPE crashes
        proc.stdin.on('error', (err) => {
          if ((err as NodeJS.ErrnoException).code !== 'EPIPE') {
            console.error('[GenerateCommitMsg] stdin error:', err.message);
          }
        });

        // Write prompt to stdin for both Claude and Droid CLI
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
            // 清理 ANSI 转义码（与 StreamJsonParser 保持一致）
            // biome-ignore lint/complexity/useRegexLiterals: Using RegExp constructor to avoid control character lint error
            const ansiRegex = new RegExp(
              '[\\u001b\\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]',
              'g'
            );
            let jsonStr = stdout.replace(ansiRegex, '').trim();

            // 尝试找到第一个完整的 JSON 对象
            const jsonStart = jsonStr.indexOf('{');
            const jsonEnd = jsonStr.lastIndexOf('}');

            if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
              jsonStr = jsonStr.slice(jsonStart, jsonEnd + 1);
            }

            const result = JSON.parse(jsonStr);

            console.log('[GenerateCommitMsg] Parsed result:', JSON.stringify(result, null, 2));

            if (result.type === 'result' && result.subtype === 'success' && result.result) {
              resolve({ success: true, message: result.result });
            } else {
              console.error('[GenerateCommitMsg] Unexpected result format:', result);
              resolve({
                success: false,
                error: result.error || 'Unknown error',
              });
            }
          } catch (err) {
            console.error('[GenerateCommitMsg] Failed to parse stdout:', stdout);
            console.error('[GenerateCommitMsg] Parse error:', err);
            console.error('[GenerateCommitMsg] stderr:', stderr);
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

  // Code Review - Start
  ipcMain.handle(
    IPC_CHANNELS.GIT_CODE_REVIEW_START,
    async (
      event,
      workdir: string,
      options: {
        model: string;
        language?: string;
        continueConversation?: boolean;
        sessionId?: string;
        reviewId: string;
      }
    ): Promise<{ success: boolean; error?: string; sessionId?: string }> => {
      const resolved = validateWorkdir(workdir);
      const {
        model,
        language = '中文',
        continueConversation = false,
        sessionId,
        reviewId,
      } = options;

      // Helper to run git commands
      const runGit = (cmd: string): string => {
        try {
          return execSync(cmd, {
            cwd: resolved,
            encoding: 'utf-8',
            timeout: 10000,
          }).trim();
        } catch {
          return '';
        }
      };

      // Gather git info
      const gitDiff = runGit('git --no-pager diff HEAD');
      const defaultBranch =
        runGit(
          "git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@'"
        ) || 'main';
      const gitLog = runGit(
        `git --no-pager log origin/${defaultBranch}..HEAD --oneline 2>/dev/null || git --no-pager log -10 --oneline`
      );

      if (!gitDiff && !gitLog) {
        return { success: false, error: 'No changes to review' };
      }

      const prompt = `Always reply in ${language}. You are performing a code review on the changes in the current branch.


## Code Review Instructions

The entire git diff for this branch has been provided below, as well as a list of all commits made to this branch.

**CRITICAL: EVERYTHING YOU NEED IS ALREADY PROVIDED BELOW.** The complete git diff and full commit history are included in this message.

**DO NOT run git diff, git log, git status, or ANY other git commands.** All the information you need to perform this review is already here.

When reviewing the diff:
1. **Focus on logic and correctness** - Check for bugs, edge cases, and potential issues.
2. **Consider readability** - Is the code clear and maintainable? Does it follow best practices in this repository?
3. **Evaluate performance** - Are there obvious performance concerns or optimizations that could be made?
4. **Assess test coverage** - Does the repository have testing patterns? If so, are there adequate tests for these changes?
5. **Ask clarifying questions** - Ask the user for clarification if you are unsure about the changes or need more context.
6. **Don't be overly pedantic** - Nitpicks are fine, but only if they are relevant issues within reason.

In your output:
- Provide a summary overview of the general code quality.
- Present the identified issues in a table with the columns: index (1, 2, etc.), line number(s), code, issue, and potential solution(s).
- If no issues are found, briefly state that the code meets best practices.

## Full Diff

**REMINDER: Output directly, DO NOT output, provide feedback, or ask questions via tools, DO NOT use any tools to fetch git information.** Simply read the diff and commit history that follow.

${gitDiff || '(No diff available)'}

## Commit History

${gitLog || '(No commit history available)'}`;

      const claudeArgs = [
        '-p',
        '--output-format',
        'stream-json',
        ...(continueConversation && sessionId
          ? ['--session-id', sessionId]
          : ['--no-session-persistence']),
        '--disallowedTools',
        '"Bash(git:*)" Edit',
        '--model',
        model,
        '--verbose',
        '--include-partial-messages',
      ];

      const claudeCommand = `claude ${claudeArgs.join(' ')}`;
      const { shell, args: shellArgs } = getShellForCommand();

      const proc = spawn(shell, [...shellArgs, claudeCommand], {
        cwd: resolved,
        env: getEnvForCommand(),
      });

      activeCodeReviews.set(reviewId, proc);

      const sender = event.sender;

      // Handle stdin errors to prevent EPIPE crashes
      proc.stdin.on('error', (err) => {
        // Ignore EPIPE - process may have exited before we finished writing
        if ((err as NodeJS.ErrnoException).code !== 'EPIPE') {
          console.error('[CodeReview] stdin error:', err.message);
        }
      });

      proc.stdin.write(prompt);
      proc.stdin.end();

      proc.stdout.on('data', (data) => {
        if (!sender.isDestroyed()) {
          sender.send(IPC_CHANNELS.GIT_CODE_REVIEW_DATA, {
            reviewId,
            type: 'data',
            data: data.toString(),
          });
        }
      });

      proc.stderr.on('data', (data) => {
        if (!sender.isDestroyed()) {
          sender.send(IPC_CHANNELS.GIT_CODE_REVIEW_DATA, {
            reviewId,
            type: 'error',
            data: data.toString(),
          });
        }
      });

      proc.on('close', (code) => {
        activeCodeReviews.delete(reviewId);
        if (!sender.isDestroyed()) {
          sender.send(IPC_CHANNELS.GIT_CODE_REVIEW_DATA, {
            reviewId,
            type: 'exit',
            exitCode: code,
          });
        }
      });

      proc.on('error', (err) => {
        activeCodeReviews.delete(reviewId);
        if (!sender.isDestroyed()) {
          sender.send(IPC_CHANNELS.GIT_CODE_REVIEW_DATA, {
            reviewId,
            type: 'error',
            data: err.message,
          });
        }
      });

      return { success: true, sessionId: continueConversation ? sessionId : undefined };
    }
  );

  // Code Review - Stop
  ipcMain.handle(IPC_CHANNELS.GIT_CODE_REVIEW_STOP, async (_, reviewId: string): Promise<void> => {
    const proc = activeCodeReviews.get(reviewId);
    if (proc) {
      proc.kill('SIGTERM');
      activeCodeReviews.delete(reviewId);
    }
  });

  // GitHub CLI - Status
  ipcMain.handle(IPC_CHANNELS.GIT_GH_STATUS, async (_, workdir: string) => {
    const git = getGitService(workdir);
    return git.getGhCliStatus();
  });

  // GitHub CLI - List PRs
  ipcMain.handle(IPC_CHANNELS.GIT_PR_LIST, async (_, workdir: string) => {
    const git = getGitService(workdir);
    return git.listPullRequests();
  });

  // GitHub CLI - Fetch PR (without checkout)
  ipcMain.handle(
    IPC_CHANNELS.GIT_PR_FETCH,
    async (_, workdir: string, prNumber: number, localBranch: string) => {
      const git = getGitService(workdir);
      return git.fetchPullRequest(prNumber, localBranch);
    }
  );
}
