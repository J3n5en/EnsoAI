import { execSync } from 'node:child_process';
import type { AIProvider, ModelId } from '@shared/types';
import type { CommonAICLIOptions } from '@shared/types/ai';
import { isWslGitRepository, spawnGit } from '../git/runtime';
import { parseCLIOutput, spawnCLI, stripCodeFence } from './providers';

export interface CommitMessageOptions extends CommonAICLIOptions {
  workdir: string;
  maxDiffLines: number;
  timeout: number;
  prompt?: string; // Custom prompt template
}

export interface CommitMessageResult {
  success: boolean;
  message?: string;
  error?: string;
}

function runGit(args: string[], cwd: string): Promise<string> {
  if (!isWslGitRepository(cwd)) {
    try {
      return Promise.resolve(
        execSync(`git ${args.join(' ')}`, { cwd, encoding: 'utf-8', timeout: 5000 }).trim()
      );
    } catch {
      return Promise.resolve('');
    }
  }

  return new Promise((resolve) => {
    let stdout = '';
    let settled = false;

    const proc = spawnGit(cwd, args);

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      if (!proc.killed) {
        proc.kill('SIGKILL');
      }
      resolve('');
    }, 5000);

    proc.stdout.on('data', (data) => {
      stdout += data.toString('utf-8');
    });

    // Drain stderr to avoid child process blocking on full pipe buffer.
    proc.stderr.on('data', () => {});

    proc.on('error', () => {
      clearTimeout(timeout);
      if (settled) return;
      settled = true;
      resolve('');
    });

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (settled) return;
      settled = true;
      resolve(code === 0 ? stdout.trim() : '');
    });
  });
}

export async function generateCommitMessage(
  options: CommitMessageOptions
): Promise<CommitMessageResult> {
  const {
    workdir,
    maxDiffLines,
    timeout,
    provider,
    model,
    reasoningEffort,
    bare,
    claudeEffort,
    prompt: customPrompt,
  } = options;

  const [recentCommits, stagedStat, stagedDiff] = await Promise.all([
    runGit(['--no-pager', 'log', '-5', '--format=%s'], workdir),
    runGit(['--no-pager', 'diff', '--cached', '--stat'], workdir),
    runGit(['--no-pager', 'diff', '--cached'], workdir),
  ]);

  const truncatedDiff =
    stagedDiff.split('\n').slice(0, maxDiffLines).join('\n') || '(no staged changes detected)';

  // Build prompt - use custom template or default
  // Use single-pass replacement to avoid injection from git content containing placeholders
  const variables: Record<string, string> = {
    '{recent_commits}': recentCommits || '(no recent commits)',
    '{staged_stat}': stagedStat || '(no stats)',
    '{staged_diff}': truncatedDiff,
  };

  const prompt = customPrompt
    ? customPrompt.replace(
        /\{recent_commits\}|\{staged_stat\}|\{staged_diff\}/g,
        (match) => variables[match] ?? match
      )
    : `你无法调用任何工具，我消息里已经包含了所有你需要的信息，无需解释，直接返回一句简短的 commit message。

参考风格：
${recentCommits || '(no recent commits)'}

变更摘要：
${stagedStat || '(no stats)'}

变更详情：
${truncatedDiff}`;

  return new Promise((resolve) => {
    const timeoutMs = timeout * 1000;

    const { proc, kill } = spawnCLI({
      provider,
      model,
      prompt,
      cwd: workdir,
      reasoningEffort,
      bare,
      claudeEffort,
      outputFormat: 'json',
    });

    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      kill();
      resolve({ success: false, error: 'timeout' });
    }, timeoutMs);

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      clearTimeout(timer);

      if (code !== 0) {
        console.error(`[commit-msg] Exit code: ${code}, stderr: ${stderr}`);
        resolve({ success: false, error: stderr || `Exit code: ${code}` });
        return;
      }

      const result = parseCLIOutput(provider, stdout);

      if (result.success && result.text) {
        resolve({ success: true, message: stripCodeFence(result.text) });
      } else {
        resolve({ success: false, error: result.error || 'Unknown error' });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      console.error(`[commit-msg] Process error:`, err);
      resolve({ success: false, error: err.message });
    });
  });
}
