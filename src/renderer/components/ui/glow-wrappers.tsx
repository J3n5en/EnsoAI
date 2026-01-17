import type { ReactNode } from 'react';
import { GlowBorder, useGlowEffectEnabled } from '@/components/ui/glow-card';
import { useRepoOutputState, useWorktreeOutputState } from '@/hooks/useOutputState';

/**
 * Shared wrapper component that applies glow effect based on repo output state.
 * Used by RepositorySidebar and TreeSidebar.
 */
export function RepoItemWithGlow({
  repoPath,
  children,
  className = 'relative rounded-xl',
}: {
  repoPath: string;
  children: ReactNode;
  className?: string;
}) {
  const outputState = useRepoOutputState(repoPath);
  const glowEnabled = useGlowEffectEnabled();

  // When glow effect is disabled, just render children in a plain div
  if (!glowEnabled) {
    return <div className="relative">{children}</div>;
  }

  return (
    <GlowBorder state={outputState} className={className}>
      {children}
    </GlowBorder>
  );
}

/**
 * Shared wrapper component that applies glow effect based on worktree output state.
 * Used by WorktreePanel and TreeSidebar for worktree items.
 */
export function WorktreeItemWithGlow({
  worktreePath,
  children,
  className = 'rounded-xl',
}: {
  worktreePath: string;
  children: ReactNode;
  className?: string;
}) {
  const outputState = useWorktreeOutputState(worktreePath);
  const glowEnabled = useGlowEffectEnabled();

  // When glow effect is disabled, just render children in a plain div
  if (!glowEnabled) {
    return <div className="relative">{children}</div>;
  }

  return (
    <GlowBorder state={outputState} className={className}>
      {children}
    </GlowBorder>
  );
}
