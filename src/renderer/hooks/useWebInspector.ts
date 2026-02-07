import type { InspectPayload } from '@shared/types/webInspector';
import { useEffect } from 'react';
import { useAgentSessionsStore } from '@/stores/agentSessions';
import { useSettingsStore } from '@/stores/settings';
import { useTerminalWriteStore } from '@/stores/terminalWrite';

function formatInspectData(data: InspectPayload): string {
  const lines = [
    '',
    `[Web Inspector] ${data.url}`,
    `Element: ${data.element}`,
    `Path: ${data.path}`,
    `Attributes: ${JSON.stringify(data.attributes)}`,
    `Styles: ${JSON.stringify(data.styles)}`,
    `Position: ${data.position.width} x ${data.position.height} @ (${data.position.left}, ${data.position.top})`,
  ];

  // Add component source info if available
  if (data.component) {
    const { framework, file, line, column } = data.component;
    const location = line !== undefined ? `:${line}${column !== undefined ? `:${column}` : ''}` : '';
    lines.push(`Component: [${framework}] ${file}${location}`);
  }

  if (data.innerText) {
    const truncatedText =
      data.innerText.length > 200 ? `${data.innerText.substring(0, 200)}...` : data.innerText;
    lines.push(`Text: "${truncatedText}"`);
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Hook to handle Web Inspector data from the main process.
 * Listens for element inspection data and writes it to the active agent session terminal.
 *
 * @param activeWorktreePath - The path of the currently active worktree
 * @param repoPath - The path of the current repository
 */
export function useWebInspector(
  activeWorktreePath: string | undefined,
  repoPath: string | undefined
) {
  const webInspectorEnabled = useSettingsStore((s) => s.webInspectorEnabled);

  useEffect(() => {
    if (!webInspectorEnabled) {
      return;
    }

    const cleanup = window.electronAPI.webInspector.onData((data: InspectPayload) => {
      // Get the active session for the current worktree
      if (!activeWorktreePath || !repoPath) {
        console.warn('[WebInspector] No active worktree, cannot write to terminal');
        return;
      }

      const { getActiveSessionId } = useAgentSessionsStore.getState();
      const activeSessionId = getActiveSessionId(repoPath, activeWorktreePath);

      if (!activeSessionId) {
        console.warn('[WebInspector] No active agent session, cannot write to terminal');
        return;
      }

      // Format the data and write to the terminal
      const formattedData = formatInspectData(data);
      const { write, focus } = useTerminalWriteStore.getState();

      // Focus the terminal first, then write the data
      focus(activeSessionId);
      write(activeSessionId, formattedData);
    });

    return cleanup;
  }, [webInspectorEnabled, activeWorktreePath, repoPath]);
}
