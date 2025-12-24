import { OpenInMenu } from '@/components/app/OpenInMenu';
import { AgentPanel } from '@/components/chat/AgentPanel';
import { FilePanel } from '@/components/files';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import { FileCode, FolderOpen, GitBranch, Plus, Sparkles, Terminal } from 'lucide-react';
import { TerminalPanel } from '../terminal';

type TabId = 'chat' | 'file' | 'terminal' | 'source-control';

interface MainContentProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  workspaceName?: string;
  repoPath?: string; // repository path for session storage
  worktreePath?: string;
  workspaceCollapsed?: boolean;
  worktreeCollapsed?: boolean;
  onExpandWorkspace?: () => void;
  onExpandWorktree?: () => void;
}

const tabs: Array<{ id: TabId; icon: React.ElementType; label: string }> = [
  { id: 'chat', icon: Sparkles, label: 'Agent' },
  { id: 'file', icon: FileCode, label: 'File' },
  { id: 'terminal', icon: Terminal, label: 'Terminal' },
  { id: 'source-control', icon: GitBranch, label: 'VSC' },
];

export function MainContent({
  activeTab,
  onTabChange,
  workspaceName: _workspaceName,
  repoPath,
  worktreePath,
  workspaceCollapsed = false,
  worktreeCollapsed = false,
  onExpandWorkspace,
  onExpandWorktree,
}: MainContentProps) {
  // Need extra padding for traffic lights when both panels are collapsed
  const needsTrafficLightPadding = workspaceCollapsed && worktreeCollapsed;

  return (
    <main className="flex min-w-[535px] flex-1 flex-col overflow-hidden bg-background">
      {/* Header with tabs */}
      <header
        className={cn(
          'flex h-12 shrink-0 items-center justify-between border-b px-4 drag-region',
          needsTrafficLightPadding && 'pl-[70px]'
        )}
      >
        {/* Left: Expand buttons + Tabs */}
        <div className="flex items-center gap-1 no-drag">
          {/* Expand buttons when panels are collapsed */}
          <AnimatePresence mode="popLayout">
            {worktreeCollapsed && (
              <motion.div
                key="expand-buttons"
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 'auto', opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className="flex items-center overflow-hidden"
              >
                {/* Left separator */}
                {needsTrafficLightPadding && <div className="mx-1 h-4 w-px bg-border" />}
                {/* Workspace expand button - shown when both panels are collapsed */}
                {workspaceCollapsed && onExpandWorkspace && (
                  <button
                    type="button"
                    onClick={onExpandWorkspace}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
                    title="展开 Workspace"
                  >
                    <FolderOpen className="h-4 w-4" />
                  </button>
                )}
                {/* Worktree expand button */}
                {onExpandWorktree && (
                  <button
                    type="button"
                    onClick={onExpandWorktree}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
                    title="展开 Worktree"
                  >
                    <GitBranch className="h-4 w-4" />
                  </button>
                )}
                {/* Right separator */}
                <div className="mx-1 h-4 w-px bg-border" />
              </motion.div>
            )}
          </AnimatePresence>
          {tabs.map((tab) => (
            <button
              type="button"
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-md px-3 text-sm transition-colors',
                activeTab === tab.id
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Right: Open In Menu */}
        <div className="flex items-center gap-2 no-drag">
          <OpenInMenu path={worktreePath} />
        </div>
      </header>

      {/* Content */}
      <div className="relative flex-1 overflow-hidden">
        {/* Chat tab - keep mounted to preserve terminal session */}
        <div className={cn('absolute inset-0', activeTab !== 'chat' && 'invisible')}>
          {repoPath && worktreePath ? (
            <AgentPanel repoPath={repoPath} cwd={worktreePath} isActive={activeTab === 'chat'} />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <p>请先选择一个 Worktree</p>
            </div>
          )}
        </div>
        {/* Terminal tab - keep mounted to preserve shell sessions */}
        <div className={cn('absolute inset-0', activeTab !== 'terminal' && 'invisible')}>
          <TerminalPanel cwd={worktreePath} isActive={activeTab === 'terminal'} />
        </div>
        {/* File tab - keep mounted to preserve editor state */}
        <div className={cn('absolute inset-0', activeTab !== 'file' && 'invisible')}>
          <FilePanel rootPath={worktreePath} />
        </div>
        {activeTab === 'source-control' && <SourceControlPlaceholder />}
      </div>
    </main>
  );
}

function SourceControlPlaceholder() {
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      <p>Source Control - Coming Soon</p>
    </div>
  );
}
