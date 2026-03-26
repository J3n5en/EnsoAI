import type { AIProvider, ModelId } from '@shared/types';
import type { CommonAICLIOptions } from '@shared/types/ai';
import { parseCLIOutput, spawnCLI } from './providers';

export interface BranchNameOptions extends CommonAICLIOptions {
  workdir: string;
  prompt: string;
  timeout?: number;
}

export interface BranchNameResult {
  success: boolean;
  branchName?: string;
  error?: string;
}

export async function generateBranchName(options: BranchNameOptions): Promise<BranchNameResult> {
  const {
    workdir,
    prompt,
    provider,
    model,
    reasoningEffort,
    bare,
    claudeEffort,
    timeout = 120,
  } = options;

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
        console.error(`[branch-name] Exit code: ${code}, stderr: ${stderr}`);
        resolve({ success: false, error: stderr || `Exit code: ${code}` });
        return;
      }

      const result = parseCLIOutput(provider, stdout);

      if (result.success && result.text) {
        resolve({ success: true, branchName: result.text.trim() });
      } else {
        resolve({ success: false, error: result.error || 'Unknown error' });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      console.error(`[branch-name] Process error:`, err);
      resolve({ success: false, error: err.message });
    });
  });
}
