import { execSync } from 'node:child_process';
import { generateText } from 'ai';
import { type AIProvider, getModel, type ModelId, type ReasoningEffort } from './providers';

export interface CommitMessageOptions {
  workdir: string;
  maxDiffLines: number;
  timeout: number;
  provider: AIProvider;
  model: ModelId;
  reasoningEffort?: ReasoningEffort;
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
  const { workdir, maxDiffLines, timeout, provider, model, reasoningEffort } = options;

  const recentCommits = runGit('git --no-pager log -5 --format="%s"', workdir);
  const stagedStat = runGit('git --no-pager diff --cached --stat', workdir);
  const stagedDiff = runGit('git --no-pager diff --cached', workdir);

  const truncatedDiff =
    stagedDiff.split('\n').slice(0, maxDiffLines).join('\n') || '(no staged changes detected)';

  const prompt = `你无法调用任何工具，我消息里已经包含了所有你需要的信息，无需解释，直接返回一句简短的 commit message。

参考风格：
${recentCommits || '(no recent commits)'}

变更摘要：
${stagedStat || '(no stats)'}

变更详情：
${truncatedDiff}`;

  try {
    const { text } = await generateText({
      model: getModel(model, { provider, reasoningEffort }),
      prompt,
      abortSignal: AbortSignal.timeout(timeout * 1000),
    });
    return { success: true, message: text.trim() };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error };
  }
}
