import type { AIProvider, ModelId, ReasoningEffort } from '@shared/types';
import { parseCLIOutput, spawnCLI } from './providers';

export interface TodoPolishOptions {
  text: string; // Raw requirement text to polish
  timeout: number; // in seconds
  provider: AIProvider;
  model: ModelId;
  reasoningEffort?: ReasoningEffort;
  prompt?: string; // Custom prompt template (with {text} placeholder)
}

export interface TodoPolishResult {
  success: boolean;
  title?: string;
  description?: string;
  error?: string;
}

/** Strip markdown code fence from AI output */
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```\w*\s*[\r\n]+([\s\S]*?)[\r\n]+\s*```\s*$/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }
  return trimmed
    .replace(/^```\w*\s*[\r\n]*/, '')
    .replace(/[\r\n]*\s*```\s*$/, '')
    .trim();
}

/** Parse JSON output from AI (expects { title, description } format) */
function parsePolishOutput(raw: string): { title: string; description: string } | null {
  const cleaned = stripCodeFence(raw);

  // Try direct JSON parse
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed.title === 'string' && typeof parsed.description === 'string') {
      return { title: parsed.title.trim(), description: parsed.description.trim() };
    }
  } catch {
    // Try extracting JSON from text
    const jsonMatch = cleaned.match(/\{[\s\S]*?"title"[\s\S]*?"description"[\s\S]*?\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed && typeof parsed.title === 'string' && typeof parsed.description === 'string') {
          return { title: parsed.title.trim(), description: parsed.description.trim() };
        }
      } catch {
        // ignore
      }
    }
  }

  return null;
}

export async function polishTodoTask(options: TodoPolishOptions): Promise<TodoPolishResult> {
  const { text, timeout, provider, model, reasoningEffort, prompt: customPrompt } = options;

  const defaultPrompt = `You are a task management assistant. Convert the following raw requirement text into a structured todo task.

Output a JSON object with exactly two fields:
- "title": A concise, action-oriented title (max 60 characters)
- "description": A clear, detailed description that is AI-agent-friendly. Include context, acceptance criteria, and any technical details from the input. Write it so an AI coding agent can understand and execute the task directly.

Important: Output ONLY the JSON object, no explanation, no markdown fences.

Raw requirement:
{text}`;

  const promptTemplate = customPrompt || defaultPrompt;
  const prompt = promptTemplate.replace(/\{text\}/g, text);

  return new Promise((resolve) => {
    const timeoutMs = timeout * 1000;

    console.log(`[todo-polish] Starting with provider=${provider}, model=${model}`);

    const { proc, kill } = spawnCLI({
      provider,
      model,
      prompt,
      cwd: process.cwd(),
      reasoningEffort,
      outputFormat: 'json',
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      settled = true;
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
      if (settled) return;
      settled = true;

      if (code !== 0) {
        console.error(`[todo-polish] Exit code: ${code}, stderr: ${stderr}`);
        resolve({ success: false, error: stderr || `Exit code: ${code}` });
        return;
      }

      const result = parseCLIOutput(provider, stdout);
      console.log(`[todo-polish] Parse result:`, result);

      if (result.success && result.text) {
        const parsed = parsePolishOutput(result.text);
        if (parsed) {
          resolve({ success: true, title: parsed.title, description: parsed.description });
        } else {
          resolve({ success: false, error: 'Failed to parse AI output as JSON' });
        }
      } else {
        resolve({ success: false, error: result.error || 'Unknown error' });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      console.error(`[todo-polish] Process error:`, err);
      resolve({ success: false, error: err.message });
    });
  });
}
