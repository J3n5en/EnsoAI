import { execSync } from 'node:child_process';
import type { AIProvider, ModelId, ReasoningEffort } from '@shared/types';
import { parseCLIOutput, spawnCLI } from './providers';

export interface CommitMessageOptions {
  workdir: string;
  maxDiffLines: number;
  timeout: number;
  provider: AIProvider;
  model: ModelId;
  reasoningEffort?: ReasoningEffort;
  prompt?: string; // Custom prompt template
}

export interface CommitMessageResult {
  success: boolean;
  message?: string;
  error?: string;
}

function runGit(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, { cwd, encoding: 'utf-8', timeout: 5000 }).trim();
  } catch {
    return '';
  }
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
    prompt: customPrompt,
  } = options;

  const recentCommits = runGit('git --no-pager log -5 --format="%s"', workdir);
  const stagedStat = runGit('git --no-pager diff --cached --stat', workdir);
  const stagedDiff = runGit('git --no-pager diff --cached', workdir);

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

    console.log(`[commit-msg] Starting with provider=${provider}, model=${model}, cwd=${workdir}`);

    const { proc, kill } = spawnCLI({
      provider,
      model,
      prompt,
      cwd: workdir,
      reasoningEffort,
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
      console.log(`[commit-msg] Parse result:`, result);

      if (result.success && result.text) {
        resolve({ success: true, message: result.text.trim() });
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
