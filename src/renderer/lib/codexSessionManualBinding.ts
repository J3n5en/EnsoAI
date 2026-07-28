import type { CodexRuntime } from '@shared/types';

interface CanSubmitCodexManualSessionOptions {
  hasValidSessionId: boolean;
  runtime?: CodexRuntime;
  loading: boolean;
  hasError: boolean;
  wslDistro?: string;
}

/**
 * 原生 Codex 只需有效会话号；WSL 还必须确认会话所在发行版，避免恢复到错误环境。
 */
export function canSubmitCodexManualSession({
  hasValidSessionId,
  runtime,
  loading,
  hasError,
  wslDistro,
}: CanSubmitCodexManualSessionOptions): boolean {
  if (!hasValidSessionId) return false;
  if (runtime !== 'wsl') return true;

  return !loading && !hasError && Boolean(wslDistro);
}
