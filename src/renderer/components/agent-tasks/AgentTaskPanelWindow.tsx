import type { AgentTask } from '@shared/types';
import { ListTodo, RotateCcw, X } from 'lucide-react';
import { type CSSProperties, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useI18n } from '@/i18n';
import { initAgentTaskPanelListeners, loadSnapshot, useAgentTasksStore } from '@/stores/agentTasks';
import { AgentTaskList } from './AgentTaskList';
import { getAgentTaskPanelHeaderClassName, isMacPlatform } from './agentTaskPanelTitleBar';

const platform = window.electronAPI.env.platform;
const isMac = isMacPlatform(platform);
const dragRegionStyle = { WebkitAppRegion: 'drag' } as CSSProperties;
const noDragRegionStyle = { WebkitAppRegion: 'no-drag' } as CSSProperties;

export function AgentTaskPanelWindow() {
  const { t } = useI18n();
  const activeTaskCount = useAgentTasksStore((s) => s._activeTaskCountCache);

  // Initialize listeners and load initial snapshot
  useEffect(() => {
    const unsub = initAgentTaskPanelListeners();

    // Request initial snapshot from main window
    window.electronAPI.agentTaskPanel.getSnapshot();

    return unsub;
  }, []);

  // Listen for snapshot response
  useEffect(() => {
    return window.electronAPI.agentTaskPanel.onSnapshotResponse((snapshot) => {
      loadSnapshot(snapshot as Record<string, AgentTask>);
    });
  }, []);

  const handleTaskClick = useCallback((task: AgentTask) => {
    window.electronAPI.agentTaskPanel.navigateToSession({
      sessionId: task.sessionId,
      repoPath: task.repoPath,
      cwd: task.cwd,
    });
  }, []);

  const handleResetBounds = useCallback(() => {
    window.electronAPI.agentTaskPanel.resetBounds();
  }, []);

  const handleClose = useCallback(() => {
    window.electronAPI.agentTaskPanel.toggle();
  }, []);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Header bar - draggable title area */}
      <div className={getAgentTaskPanelHeaderClassName(platform)} style={dragRegionStyle}>
        <div className="flex items-center gap-2">
          <ListTodo className="h-4 w-4" />
          <span className="text-sm font-medium">{t('Agent Tasks')}</span>
          {activeTaskCount > 0 && (
            <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-normal text-primary">
              {activeTaskCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1" style={noDragRegionStyle}>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleResetBounds}
            className="h-7 w-7"
            title={t('Reset Position & Size')}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          {!isMac && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="h-7 w-7"
              title={t('Close')}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Content area */}
      <ScrollArea className="flex-1">
        <div className="p-3">
          <AgentTaskList onTaskClick={handleTaskClick} />
        </div>
      </ScrollArea>
    </div>
  );
}
