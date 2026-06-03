import type { OpenContext } from '@shared/types';
import { getPathBasename } from '@shared/utils/path';
import { useEffect, useRef } from 'react';
import { useAgentSessionsStore } from '@/stores/agentSessions';
import type { Repository, TabId } from '../constants';
import { pathsEqual } from '../storage';

interface UseOpenContextListenerOptions {
  repositories: Repository[];
  saveRepositories: (repos: Repository[]) => void;
  setSelectedRepo: (repo: string) => void;
  onSwitchWorktree: (path: string) => void;
  onSwitchTab: (tab: TabId) => void;
  tempWorkspaces: Array<{ path: string }>;
}

/**
 * Hook to handle deep linking via OpenContext.
 * Supports both URL scheme (enso://open?...) and CLI args (--open-* ...).
 *
 * Two distinct branches:
 *
 *   A) sessionId provided → session is the authoritative source.
 *      session.repoPath / session.cwd define both the repo and the worktree.
 *      URL `path` and `cwd` (if any) are ignored — eliminating any ambiguity
 *      about whether `path` is a repo root, a worktree, or something else.
 *      Recommended URL form: enso://open?sessionId=<uuid>
 *
 *   B) sessionId absent → fall back to URL path/cwd handling.
 *      Used for "just open this repo" or "open repo + worktree" flows that
 *      don't target a specific session. Unknown paths are registered as new
 *      repositories on the fly (preserved for external tool integration).
 */
export function useOpenContextListener({
  repositories,
  saveRepositories,
  setSelectedRepo,
  onSwitchWorktree,
  onSwitchTab,
  tempWorkspaces,
}: UseOpenContextListenerOptions) {
  const hasConsumedPendingRef = useRef(false);

  const processContext = (context: OpenContext) => {
    const { path, cwd, sessionId } = context;
    const cleanPath = path ? path.replace(/[\\/]+$/, '').replace(/^["']|["']$/g, '') : '';
    const cleanCwd = cwd ? cwd.replace(/[\\/]+$/, '').replace(/^["']|["']$/g, '') : '';

    // Branch A: sessionId-driven (preferred).
    if (sessionId) {
      const sessions = useAgentSessionsStore.getState().sessions;
      const session = sessions.find((s) => s.id === sessionId || s.sessionId === sessionId);

      if (session) {
        const existingRepo = repositories.find((r) => pathsEqual(r.path, session.repoPath));
        if (existingRepo) {
          setSelectedRepo(existingRepo.path);
        } else {
          console.warn(
            '[OpenContext] session repoPath not in repositories list:',
            session.repoPath
          );
        }

        if (session.cwd && session.cwd !== session.repoPath) {
          onSwitchWorktree(session.cwd);
        }

        useAgentSessionsStore.getState().setActiveId(session.repoPath, session.cwd, session.id);
      } else {
        console.warn('[OpenContext] sessionId not found:', sessionId);
      }

      onSwitchTab('chat');
      return;
    }

    // Branch B: path/cwd-driven (no session targeted).
    if (cleanPath) {
      const tempMatch = tempWorkspaces.find((item) => item.path === cleanPath);
      if (tempMatch) {
        onSwitchWorktree(tempMatch.path);
      } else {
        const existingRepo = repositories.find((r) => pathsEqual(r.path, cleanPath));
        if (existingRepo) {
          setSelectedRepo(existingRepo.path);
        } else {
          // Register the path as a new repository on the fly — lets external
          // tools "add & open" a directory in one step.
          const name = getPathBasename(cleanPath);
          const newRepo: Repository = { name, path: cleanPath };
          const updated = [...repositories, newRepo];
          saveRepositories(updated);
          setSelectedRepo(cleanPath);
        }
      }
    }

    if (cleanCwd && cleanCwd !== cleanPath) {
      onSwitchWorktree(cleanCwd);
    }

    onSwitchTab('chat');
  };

  // Consume pending context on startup (only once)
  // biome-ignore lint/correctness/useExhaustiveDependencies: startup one-shot — intentionally fires once
  useEffect(() => {
    if (hasConsumedPendingRef.current) return;
    hasConsumedPendingRef.current = true;

    window.electronAPI.app.consumePendingOpenContext().then((context) => {
      if (context) {
        console.log('[OpenContext] Processing pending context:', context);
        processContext(context);
      }
    });
  }, []);

  // Listen for runtime OpenContext events
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-subscribe when inputs that processContext closes over change
  useEffect(() => {
    const cleanup = window.electronAPI.app.onOpenContext((context: OpenContext) => {
      console.log('[OpenContext] Received context:', context);
      processContext(context);
    });
    return cleanup;
  }, [
    repositories,
    saveRepositories,
    setSelectedRepo,
    onSwitchWorktree,
    onSwitchTab,
    tempWorkspaces,
  ]);
}
