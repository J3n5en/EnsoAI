import type { GitWorktree, TerminalSession } from '@shared/types';
import { Activity, Bot, FolderGit2, Search, Terminal } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { TabId } from '@/App/constants';
import type { Session } from '@/components/chat/SessionBar';
import { Dialog, DialogPopup } from '@/components/ui/dialog';
import { useWorktreeListMultiple } from '@/hooks/useWorktree';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { useAgentSessionsStore } from '@/stores/agentSessions';
import { useTerminalStore } from '@/stores/terminal';
import { useWorktreeActivityStore } from '@/stores/worktreeActivity';

interface RunningProjectsPopoverProps {
  onSelectWorktreeByPath: (worktreePath: string) => Promise<void> | void;
  onSwitchTab?: (tab: TabId) => void;
}

interface GroupedProject {
  path: string;
  repoPath: string;
  repoName: string;
  branchName: string;
  worktree: GitWorktree | undefined;
  agents: Session[];
  terminals: TerminalSession[];
}

export function RunningProjectsPopover({
  onSelectWorktreeByPath,
  onSwitchTab,
}: RunningProjectsPopoverProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const activities = useWorktreeActivityStore((s) => s.activities);
  const agentSessions = useAgentSessionsStore((s) => s.sessions);
  const terminalSessions = useTerminalStore((s) => s.sessions);
  const setAgentActiveId = useAgentSessionsStore((s) => s.setActiveId);
  const setTerminalActive = useTerminalStore((s) => s.setActiveSession);

  const activeWorktreePaths = useMemo(() => {
    return Object.entries(activities)
      .filter(([, act]) => act.agentCount > 0 || act.terminalCount > 0)
      .map(([path]) => path);
  }, [activities]);

  const { worktreesMap } = useWorktreeListMultiple(activeWorktreePaths);

  useEffect(() => {
    if (open) {
      setSearchQuery('');
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [open]);

  const worktreeByPath = useMemo(() => {
    const map = new Map<string, GitWorktree>();
    for (const worktrees of Object.values(worktreesMap)) {
      for (const wt of worktrees) {
        map.set(wt.path, wt);
      }
    }
    return map;
  }, [worktreesMap]);

  const groupedProjects = useMemo<GroupedProject[]>(() => {
    return activeWorktreePaths.map((path) => {
      const worktree = worktreeByPath.get(path);
      const agents = agentSessions.filter((s) => s.cwd === path);
      const terminals = terminalSessions.filter((s) => s.cwd === path);
      const repoPath = agents[0]?.repoPath || path;
      return {
        path,
        repoPath,
        repoName: repoPath.split('/').pop() || repoPath,
        branchName: worktree?.branch || path.split('/').pop() || path,
        worktree,
        agents,
        terminals,
      };
    });
  }, [activeWorktreePaths, agentSessions, terminalSessions, worktreeByPath]);

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return groupedProjects;
    const query = searchQuery.toLowerCase();
    return groupedProjects.filter((project) => {
      if (project.repoName.toLowerCase().includes(query)) return true;
      if (project.branchName.toLowerCase().includes(query)) return true;
      if (project.path.toLowerCase().includes(query)) return true;
      if (project.agents.some((a) => (a.name || a.agentId).toLowerCase().includes(query)))
        return true;
      if (project.terminals.some((t) => (t.title || 'Terminal').toLowerCase().includes(query)))
        return true;
      return false;
    });
  }, [groupedProjects, searchQuery]);

  const totalRunning = groupedProjects.length;

  const handleSelectProject = async (project: GroupedProject) => {
    await onSelectWorktreeByPath(project.path);
    setOpen(false);
  };

  const handleSelectAgent = async (session: Session) => {
    await onSelectWorktreeByPath(session.cwd);
    setAgentActiveId(session.cwd, session.id);
    onSwitchTab?.('chat');
    setOpen(false);
  };

  const handleSelectTerminal = async (terminal: TerminalSession) => {
    await onSelectWorktreeByPath(terminal.cwd);
    setTerminalActive(terminal.id);
    onSwitchTab?.('terminal');
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className={cn(
          'relative flex h-8 w-8 items-center justify-center rounded-md no-drag text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors',
          totalRunning > 0 && 'text-green-500'
        )}
        title={t('Running Projects')}
        onClick={() => setOpen(true)}
      >
        <Activity className="h-4 w-4" />
        {totalRunning > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-green-500 px-1 text-[10px] font-medium text-white">
            {totalRunning}
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPopup className="sm:max-w-2xl p-0" showCloseButton={false}>
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder={t('Search running projects...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
            />
          </div>
          <div className="max-h-[60vh] overflow-y-auto p-2">
            {filteredProjects.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                {searchQuery ? t('No matching results') : t('No running projects')}
              </div>
            ) : (
              <div className="space-y-1">
                {filteredProjects.map((project) => (
                  <div key={project.path}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-accent/50"
                      onClick={() => handleSelectProject(project)}
                    >
                      <FolderGit2 className="h-4 w-4 shrink-0 text-yellow-500" />
                      <span className="min-w-0 flex-1 truncate text-left">
                        <span className="text-muted-foreground">{project.repoName}</span>
                        <span className="mx-1 text-muted-foreground/50">/</span>
                        <span>{project.branchName}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {project.agents.length + project.terminals.length}
                      </span>
                    </button>
                    {project.agents.map((session) => (
                      <button
                        key={session.id}
                        type="button"
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1 pl-6 text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                        onClick={() => handleSelectAgent(session)}
                      >
                        <Bot className="h-3.5 w-3.5 shrink-0" />
                        <span className="min-w-0 flex-1 truncate text-left">
                          {session.name || session.agentId}
                          {session.terminalTitle && (
                            <span className="ml-1 text-muted-foreground/70">
                              ({session.terminalTitle})
                            </span>
                          )}
                        </span>
                      </button>
                    ))}
                    {project.terminals.map((terminal) => (
                      <button
                        key={terminal.id}
                        type="button"
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1 pl-6 text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                        onClick={() => handleSelectTerminal(terminal)}
                      >
                        <Terminal className="h-3.5 w-3.5 shrink-0" />
                        <span className="min-w-0 flex-1 truncate text-left">
                          {terminal.title || 'Terminal'}
                        </span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogPopup>
      </Dialog>
    </>
  );
}
