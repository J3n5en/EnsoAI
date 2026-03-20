import { type AgentStopNotificationData, TASK_COMPLETION_MARKER } from '@shared/types/agent';
import { useCallback, useEffect, useRef } from 'react';
import type { ResolvedAgent } from '@/components/todo/useEnabledAgents';
import { useAgentSessionsStore } from '@/stores/agentSessions';
import { INITIAL_AUTO_EXECUTE, useTodoStore } from '@/stores/todo';

// Re-export for convenience
export { TASK_COMPLETION_MARKER };

/**
 * Build prompt with auto-execute rules
 */
export function buildAutoExecutePrompt(title: string, description?: string): string {
  return `
${title}

${description || ''}

---
【自动执行规则 - 必须遵守】
1. 任务完成后，在回复的最后单独一行输出：${TASK_COMPLETION_MARKER}
2. 不要调用 AskUserQuestion 工具，不要让用户选择方案，直接选择最优方案执行。
3. 遇到问题自己判断并解决，不要中断流程等待用户输入。
`.trim();
}

/**
 * Hook to manage auto-execute task completion detection
 *
 * Listens for agent stop events and:
 * 1. Marks current task as done
 * 2. Advances to next task in queue
 */
export function useAutoExecuteTask(
  repoPath: string,
  worktreePath: string | undefined,
  onSwitchToAgent?: () => void,
  enabledAgents?: ResolvedAgent[]
) {
  const autoExecute = useTodoStore((s) => s.autoExecute[repoPath] ?? INITIAL_AUTO_EXECUTE);
  const advanceQueue = useTodoStore((s) => s.advanceQueue);
  const stopAutoExecute = useTodoStore((s) => s.stopAutoExecute);
  const updateTask = useTodoStore((s) => s.updateTask);
  const setCurrentExecution = useTodoStore((s) => s.setCurrentExecution);

  // Use ref to break circular dependency between handleAgentStop and executeTask
  const executeTaskRef = useRef<(taskId: string) => void>(() => {});

  // Execute a single task
  const executeTask = useCallback(
    (taskId: string) => {
      console.log('[AutoExecute] executeTask called', {
        taskId,
        worktreePath,
        enabledAgentsCount: enabledAgents?.length,
      });

      if (!worktreePath || !enabledAgents || enabledAgents.length === 0) {
        console.warn('[AutoExecute] executeTask early return', { worktreePath, enabledAgents });
        return;
      }

      const tasks = useTodoStore.getState().tasks[repoPath] ?? [];
      const task = tasks.find((t) => t.id === taskId);
      if (!task) {
        console.warn('[AutoExecute] Task not found', taskId);
        stopAutoExecute(repoPath);
        return;
      }

      // Build prompt with auto-execute rules
      const taskContext = buildAutoExecutePrompt(task.title, task.description);

      // Use default agent or first available
      const agent = enabledAgents.find((a) => a.isDefault) ?? enabledAgents[0];
      console.log('[AutoExecute] Creating session for task', { taskId, agentId: agent.agentId });

      const sessionId = crypto.randomUUID();

      // Create session with pending command
      useAgentSessionsStore.setState((state) => {
        const worktreeSessions = state.sessions.filter(
          (s) => s.repoPath === repoPath && s.cwd === worktreePath
        );
        const maxOrder = worktreeSessions.reduce(
          (max, s) => Math.max(max, s.displayOrder ?? 0),
          -1
        );

        return {
          sessions: [
            ...state.sessions,
            {
              id: sessionId,
              sessionId,
              name: `Task: ${task.title}`,
              userRenamed: true,
              agentId: agent.agentId,
              agentCommand: agent.command,
              customPath: agent.customPath,
              customArgs: agent.customArgs,
              initialized: false,
              repoPath,
              cwd: worktreePath,
              environment: agent.environment,
              displayOrder: maxOrder + 1,
              pendingCommand: taskContext,
            },
          ],
          activeIds: {
            ...state.activeIds,
            [worktreePath.replace(/\\/g, '/')]: sessionId,
          },
          enhancedInputStates: {
            ...state.enhancedInputStates,
            [sessionId]: { open: false, content: '', imagePaths: [] },
          },
        };
      });

      // Update task status and link session
      updateTask(repoPath, taskId, { status: 'in-progress', sessionId });
      setCurrentExecution(repoPath, taskId, sessionId);

      onSwitchToAgent?.();
    },
    [
      repoPath,
      worktreePath,
      enabledAgents,
      updateTask,
      setCurrentExecution,
      onSwitchToAgent,
      stopAutoExecute,
    ]
  );

  // Keep ref in sync to avoid circular dependency in handleAgentStop
  executeTaskRef.current = executeTask;

  // Handle task completion based on stop notification
  const handleAgentStop = useCallback(
    (data: AgentStopNotificationData) => {
      // Read latest state to avoid stale closure
      const currentAutoExecute =
        useTodoStore.getState().autoExecute[repoPath] ?? INITIAL_AUTO_EXECUTE;

      if (!worktreePath || !currentAutoExecute.running) return;
      if (data.sessionId !== currentAutoExecute.currentSessionId) return;

      const currentTaskId = currentAutoExecute.currentTaskId;
      if (!currentTaskId) return;

      console.log('[AutoExecute] Agent stopped, marking task as done');

      // All stops are treated as completion - mark done and advance
      updateTask(repoPath, currentTaskId, { status: 'done', sessionId: undefined });

      // Advance to next task
      const nextTaskId = advanceQueue(repoPath);
      if (nextTaskId && enabledAgents && enabledAgents.length > 0) {
        executeTaskRef.current(nextTaskId);
      } else {
        stopAutoExecute(repoPath);
      }
    },
    [repoPath, worktreePath, updateTask, advanceQueue, stopAutoExecute, enabledAgents]
  );

  // Use ref for handler to avoid re-subscription on every callback change
  const handleAgentStopRef = useRef(handleAgentStop);
  handleAgentStopRef.current = handleAgentStop;

  // Start auto-execute with a list of tasks
  const startAutoExecute = useCallback(
    (taskIds: string[]) => {
      console.log('[AutoExecute] startAutoExecute called', {
        taskIdsCount: taskIds.length,
        enabledAgentsCount: enabledAgents?.length,
        worktreePath,
      });

      if (taskIds.length === 0 || !enabledAgents || enabledAgents.length === 0) {
        console.warn('[AutoExecute] startAutoExecute early return', {
          taskIdsLength: taskIds.length,
          enabledAgents,
        });
        return;
      }

      const [firstTaskId, ...rest] = taskIds;

      // Queue only remaining tasks (exclude the first one being executed now)
      useTodoStore.getState().startAutoExecute(repoPath, rest);

      // Execute first task
      executeTask(firstTaskId);
    },
    [repoPath, enabledAgents, executeTask, worktreePath]
  );

  // Stop auto-execute
  const stop = useCallback(() => {
    stopAutoExecute(repoPath);
  }, [repoPath, stopAutoExecute]);

  // Reorder queue
  const reorderQueue = useCallback(
    (fromIndex: number, toIndex: number) => {
      useTodoStore.getState().reorderAutoExecuteQueue(repoPath, fromIndex, toIndex);
    },
    [repoPath]
  );

  // Remove from queue
  const removeFromQueue = useCallback(
    (taskId: string) => {
      useTodoStore.getState().removeFromAutoExecuteQueue(repoPath, taskId);
    },
    [repoPath]
  );

  // Listen for agent stop events - only subscribe when running
  useEffect(() => {
    if (!autoExecute?.running) return;

    const unsubscribe = window.electronAPI.notification.onAgentStop((data) =>
      handleAgentStopRef.current(data)
    );
    return unsubscribe;
  }, [autoExecute?.running]);

  return {
    autoExecute,
    startAutoExecute,
    stop,
    reorderQueue,
    removeFromQueue,
    executeTask,
  };
}
