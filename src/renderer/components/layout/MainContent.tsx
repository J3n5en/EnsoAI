import { OpenInMenu } from '@/components/app/OpenInMenu';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import { FileCode, FolderOpen, GitBranch, MessageSquare, Plus, Terminal } from 'lucide-react';

const buttonVariants = {
  initial: { scale: 0, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  exit: { scale: 0, opacity: 0 },
};

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
  { id: 'chat', icon: MessageSquare, label: 'Chat' },
  { id: 'file', icon: FileCode, label: 'File' },
  { id: 'terminal', icon: Terminal, label: 'Terminal' },
  { id: 'source-control', icon: GitBranch, label: 'Source Control' },
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
    <main className="flex flex-1 flex-col overflow-hidden bg-background">
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
          <AnimatePresence>
            {worktreeCollapsed && (
              <>
                {/* Left separator */}
                {needsTrafficLightPadding && (
                  <motion.div
                    key="left-sep"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="mx-1 h-4 w-px bg-border"
                  />
                )}
                {/* Workspace expand button - shown when both panels are collapsed */}
                {workspaceCollapsed && onExpandWorkspace && (
                  <motion.button
                    key="expand-workspace"
                    variants={buttonVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                    onClick={onExpandWorkspace}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
                    title="展开 Workspace"
                  >
                    <FolderOpen className="h-4 w-4" />
                  </motion.button>
                )}
                {/* Worktree expand button */}
                {onExpandWorktree && (
                  <motion.button
                    key="expand-worktree"
                    variants={buttonVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={{ type: 'spring', stiffness: 500, damping: 25, delay: 0.05 }}
                    onClick={onExpandWorktree}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
                    title="展开 Worktree"
                  >
                    <GitBranch className="h-4 w-4" />
                  </motion.button>
                )}
                {/* Right separator */}
                <motion.div
                  key="right-sep"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="mx-1 h-4 w-px bg-border"
                />
              </>
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

      {/* Session info bar */}
      {worktreePath && (
        <div className="flex h-8 items-center border-b px-4 text-xs text-muted-foreground">
          Session started with Claude in {worktreePath}
        </div>
      )}

      {/* Content */}
      <div className="relative flex-1 overflow-hidden">
        {/* Chat tab - keep mounted to preserve terminal session */}
        <div className={cn('absolute inset-0', activeTab !== 'chat' && 'invisible')}>
          {repoPath && worktreePath ? (
            <ChatPanel repoPath={repoPath} cwd={worktreePath} />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <p>请先选择一个 Worktree</p>
            </div>
          )}
        </div>
        {activeTab === 'file' && <FilePlaceholder />}
        {activeTab === 'terminal' && <TerminalPlaceholder />}
        {activeTab === 'source-control' && <SourceControlPlaceholder />}
      </div>
    </main>
  );
}

function FilePlaceholder() {
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      <p>File Explorer - Phase 4</p>
    </div>
  );
}

function TerminalPlaceholder() {
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      <p>Terminal - Phase 5</p>
    </div>
  );
}

function SourceControlPlaceholder() {
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      <p>Source Control - Coming Soon</p>
    </div>
  );
}
