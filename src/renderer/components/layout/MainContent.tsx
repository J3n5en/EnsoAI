import { AnimatePresence, motion } from 'framer-motion';
import { FileCode, FolderOpen, GitBranch, Sparkles, Terminal } from 'lucide-react';
import { OpenInMenu } from '@/components/app/OpenInMenu';
import { AgentPanel } from '@/components/chat/AgentPanel';
import { FilePanel } from '@/components/files';
import { SourceControlPanel } from '@/components/source-control';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { TerminalPanel } from '../terminal';

type TabId = 'chat' | 'file' | 'terminal' | 'source-control';

interface MainContentProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  repoPath?: string; // repository path for session storage
  worktreePath?: string;
  repositoryCollapsed?: boolean;
  worktreeCollapsed?: boolean;
  onExpandRepository?: () => void;
  onExpandWorktree?: () => void;
  onSwitchWorktree?: (worktreePath: string) => void;
}

export function MainContent({
  activeTab,
  onTabChange,
  repoPath,
  worktreePath,
  repositoryCollapsed = false,
  worktreeCollapsed = false,
  onExpandRepository,
  onExpandWorktree,
  onSwitchWorktree,
}: MainContentProps) {
  const { t } = useI18n();
  const tabs = [
    { id: 'chat', icon: Sparkles, label: t('Agent') },
    { id: 'file', icon: FileCode, label: t('File') },
    { id: 'terminal', icon: Terminal, label: t('Terminal') },
    { id: 'source-control', icon: GitBranch, label: t('Source Control') },
  ] satisfies Array<{ id: TabId; icon: React.ElementType; label: string }>;
  // Need extra padding for traffic lights when both panels are collapsed (macOS only)
  const isMac = window.electronAPI.env.platform === 'darwin';
  const needsTrafficLightPadding = isMac && repositoryCollapsed && worktreeCollapsed;

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
                {/* Repository expand button - shown when both panels are collapsed */}
                {repositoryCollapsed && onExpandRepository && (
                  <button
                    type="button"
                    onClick={onExpandRepository}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
                    title={t('Expand Repository')}
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
                    title={t('Expand Worktree')}
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
        </div>

        {/* Right: Open In Menu */}
        <div className="flex items-center gap-2 no-drag">
          <OpenInMenu path={worktreePath} />
        </div>
      </header>

      {/* Content */}
      <div className="relative flex-1 overflow-hidden">
        {/* Chat tab - keep mounted to preserve terminal session */}
        <div
          className={cn(
            'absolute inset-0 bg-background',
            activeTab === 'chat' ? 'z-10' : 'invisible pointer-events-none z-0'
          )}
        >
          {repoPath && worktreePath ? (
            <AgentPanel
              repoPath={repoPath}
              cwd={worktreePath}
              isActive={activeTab === 'chat'}
              onSwitchWorktree={onSwitchWorktree}
            />
          ) : (
            <Empty>
              <EmptyMedia variant="icon">
                <Sparkles className="h-4.5 w-4.5" />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>{t('Start using AI Agent')}</EmptyTitle>
                <EmptyDescription>
                  {t('Select a Worktree to start using AI coding assistant')}
                </EmptyDescription>
              </EmptyHeader>
              {onExpandWorktree && worktreeCollapsed && (
                <Button onClick={onExpandWorktree} variant="outline" className="mt-2">
                  <GitBranch className="mr-2 h-4 w-4" />
                  {t('Choose Worktree')}
                </Button>
              )}
            </Empty>
          )}
        </div>
        {/* Terminal tab - keep mounted to preserve shell sessions */}
        <div
          className={cn(
            'absolute inset-0 bg-background',
            activeTab === 'terminal' ? 'z-10' : 'invisible pointer-events-none z-0'
          )}
        >
          <TerminalPanel cwd={worktreePath} isActive={activeTab === 'terminal'} />
        </div>
        {/* File tab - keep mounted to preserve editor state */}
        <div
          className={cn(
            'absolute inset-0 bg-background',
            activeTab === 'file' ? 'z-10' : 'invisible pointer-events-none z-0'
          )}
        >
          <FilePanel rootPath={worktreePath} isActive={activeTab === 'file'} />
        </div>
        {/* Source Control tab - keep mounted to preserve selection state */}
        <div
          className={cn(
            'absolute inset-0 bg-background',
            activeTab === 'source-control' ? 'z-10' : 'invisible pointer-events-none z-0'
          )}
        >
          <SourceControlPanel
            rootPath={worktreePath}
            isActive={activeTab === 'source-control'}
            onExpandWorktree={onExpandWorktree}
            worktreeCollapsed={worktreeCollapsed}
          />
        </div>
      </div>
    </main>
  );
}
