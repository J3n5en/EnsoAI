import { create } from 'zustand';

export interface StatusData {
  model: {
    id: string;
    displayName: string;
  };
  contextWindow: {
    totalInputTokens: number;
    totalOutputTokens: number;
    contextWindowSize: number;
    currentUsage: {
      inputTokens: number;
      outputTokens: number;
      cacheCreationInputTokens: number;
      cacheReadInputTokens: number;
    } | null;
  };
  cost: {
    totalCostUsd: number;
    totalDurationMs: number;
    totalApiDurationMs: number; // API 耗时
    totalLinesAdded: number;
    totalLinesRemoved: number;
  };
  workspace: {
    currentDir: string;
    projectDir: string;
  };
  version: string; // Claude version
  updatedAt: number;
}

interface AgentStatusStore {
  // Status data keyed by sessionId
  statuses: Record<string, StatusData>;

  // Update status for a session
  updateStatus: (sessionId: string, data: Partial<StatusData>) => void;

  // Clear status for a session
  clearStatus: (sessionId: string) => void;

  // Get status for a session
  getStatus: (sessionId: string) => StatusData | undefined;
}

export const useAgentStatusStore = create<AgentStatusStore>((set, get) => ({
  statuses: {},

  updateStatus: (sessionId, data) =>
    set((state) => ({
      statuses: {
        ...state.statuses,
        [sessionId]: {
          ...state.statuses[sessionId],
          ...data,
          updatedAt: Date.now(),
        } as StatusData,
      },
    })),

  clearStatus: (sessionId) =>
    set((state) => {
      const { [sessionId]: _, ...rest } = state.statuses;
      return { statuses: rest };
    }),

  getStatus: (sessionId) => get().statuses[sessionId],
}));

/**
 * Initialize agent status listener
 * Call this once on app startup
 */
export function initAgentStatusListener(): () => void {
  return window.electronAPI.notification.onAgentStatusUpdate((data) => {
    const { sessionId, model, contextWindow, cost, workspace, version } = data;

    // Update status data - stored by sessionId, no need for session to exist
    const statusData: Partial<StatusData> = {};

    if (model) {
      statusData.model = {
        id: model.id,
        displayName: model.display_name,
      };
    }

    if (contextWindow) {
      statusData.contextWindow = {
        totalInputTokens: contextWindow.total_input_tokens,
        totalOutputTokens: contextWindow.total_output_tokens,
        contextWindowSize: contextWindow.context_window_size,
        currentUsage: contextWindow.current_usage
          ? {
              inputTokens: contextWindow.current_usage.input_tokens,
              outputTokens: contextWindow.current_usage.output_tokens,
              cacheCreationInputTokens: contextWindow.current_usage.cache_creation_input_tokens,
              cacheReadInputTokens: contextWindow.current_usage.cache_read_input_tokens,
            }
          : null,
      };
    }

    if (cost) {
      statusData.cost = {
        totalCostUsd: cost.total_cost_usd,
        totalDurationMs: cost.total_duration_ms,
        totalApiDurationMs: cost.total_api_duration_ms ?? 0,
        totalLinesAdded: cost.total_lines_added,
        totalLinesRemoved: cost.total_lines_removed,
      };
    }

    if (workspace) {
      statusData.workspace = {
        currentDir: workspace.current_dir,
        projectDir: workspace.project_dir,
      };
    }

    if (version) {
      statusData.version = version;
    }

    useAgentStatusStore.getState().updateStatus(sessionId, statusData);
  });
}
