import type { WorkspaceRecord } from '@shared/types';
import { Separator } from '@/components/ui/separator';
import { WorkspaceSelector } from '@/components/workspace';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { useWorkspaceStore } from '@/stores/workspace';
import { FolderIcon, GitBranchIcon, GitCommitIcon, MessageSquareIcon, SettingsIcon } from './Icons';

type TabId = 'worktrees' | 'chat' | 'files' | 'git' | 'settings';

interface SidebarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const { t } = useI18n();
  const { workspaces, currentWorkspace, setCurrentWorkspace } = useWorkspaceStore();
  const tabs: Array<{ id: TabId; label: string; icon: React.ElementType; shortcut: string }> = [
    { id: 'worktrees', label: t('Worktrees'), icon: GitBranchIcon, shortcut: '⌘1' },
    { id: 'chat', label: t('Chat'), icon: MessageSquareIcon, shortcut: '⌘2' },
    { id: 'files', label: t('Files'), icon: FolderIcon, shortcut: '⌘3' },
    { id: 'git', label: t('Git'), icon: GitCommitIcon, shortcut: '⌘4' },
    { id: 'settings', label: t('Settings'), icon: SettingsIcon, shortcut: '⌘,' },
  ];

  const handleSelectWorkspace = (workspace: WorkspaceRecord) => {
    setCurrentWorkspace(workspace);
  };

  const handleCreateNewWorkspace = () => {
    // TODO: Open create workspace dialog
  };

  const handleOpenFolder = async () => {
    // TODO: Open folder picker via IPC
  };

  return (
    <aside className="flex w-60 flex-col border-r bg-muted/30">
      {/* Traffic light spacer for macOS */}
      <div className="h-12 shrink-0 drag-region" />

      {/* Workspace Selector */}
      <div className="shrink-0 px-2">
        <WorkspaceSelector
          workspaces={workspaces}
          currentWorkspace={currentWorkspace}
          onSelect={handleSelectWorkspace}
          onCreateNew={handleCreateNewWorkspace}
          onOpenFolder={handleOpenFolder}
        />
      </div>

      <Separator className="my-2" />

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1 px-2">
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              'flex h-9 items-center gap-3 rounded-md px-3 text-sm transition-colors no-drag',
              activeTab === tab.id
                ? 'bg-accent text-accent-foreground font-medium'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
            title={`${tab.label} (${tab.shortcut})`}
          >
            <tab.icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{tab.label}</span>
            <kbd className="ml-auto text-xs opacity-50">{tab.shortcut}</kbd>
          </button>
        ))}
      </nav>

      {/* Agent Status */}
      <div className="shrink-0 border-t p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          <span>{t('Claude • Ready')}</span>
        </div>
      </div>
    </aside>
  );
}
