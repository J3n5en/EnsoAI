import { motion } from 'framer-motion';
import { forwardRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';

export type GlowState = 'idle' | 'running' | 'waiting_input' | 'completed';

/**
 * Hook to check if glow effect is enabled (Beta feature)
 */
export function useGlowEffectEnabled(): boolean {
  return useSettingsStore((s) => s.glowEffectEnabled);
}

interface GlowCardProps {
  state: GlowState;
  children: ReactNode;
  className?: string;
  as?: 'div' | 'button';
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  tabIndex?: number;
  role?: string;
  title?: string;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}

/**
 * GlowCard - A card component with animated glow effects based on agent activity state
 *
 * States:
 * - idle: No glow effect
 * - running: Animated green flowing glow (Claude is actively working)
 * - waiting_input: Animated amber pulsing glow (Claude waiting for user input)
 * - completed: Subtle blue static glow (Claude finished working)
 */
export const GlowCard = forwardRef<HTMLDivElement, GlowCardProps>(
  (
    {
      state,
      children,
      className,
      as = 'div',
      onClick,
      onContextMenu,
      onKeyDown,
      tabIndex,
      role,
      title,
      draggable,
      onDragStart,
      onDragEnd,
      onDragOver,
      onDragLeave,
      onDrop,
    },
    ref
  ) => {
    const Component = as === 'button' ? 'button' : 'div';

    return (
      <Component
        ref={ref as React.Ref<HTMLDivElement & HTMLButtonElement>}
        className={cn('relative overflow-hidden', className)}
        onClick={onClick}
        onContextMenu={onContextMenu}
        onKeyDown={onKeyDown}
        tabIndex={tabIndex}
        role={role}
        title={title}
        draggable={draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {/* Glow effect layer */}
        {state === 'running' && <RunningGlow />}
        {state === 'waiting_input' && <WaitingInputGlow />}
        {state === 'completed' && <CompletedGlow />}

        {/* Content rendered directly to preserve flex layout, z-index applied via relative positioning */}
        {children}
      </Component>
    );
  }
);

GlowCard.displayName = 'GlowCard';

/**
 * Simple inline indicator dot for smaller UI elements
 */
export function GlowIndicator({
  state,
  size = 'md',
  className,
}: {
  state: GlowState;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  if (state === 'idle') return null;

  const sizeClasses = {
    sm: 'h-1.5 w-1.5',
    md: 'h-2 w-2',
    lg: 'h-2.5 w-2.5',
  };

  const colorClasses: Record<GlowState, string> = {
    running: 'bg-green-500',
    waiting_input: 'bg-amber-500',
    completed: 'bg-blue-400',
    idle: '',
  };

  return (
    <motion.span
      className={cn(
        'inline-block rounded-full shrink-0',
        sizeClasses[size],
        colorClasses[state],
        className
      )}
      animate={
        state === 'running'
          ? {
              scale: [1, 1.2, 1],
              opacity: [1, 0.8, 1],
            }
          : {
              opacity: [0.6, 1, 0.6],
            }
      }
      transition={{
        duration: state === 'running' ? 1 : 2,
        repeat: Number.POSITIVE_INFINITY,
        ease: 'easeInOut',
      }}
      title={
        state === 'running'
          ? 'Claude is working'
          : state === 'waiting_input'
            ? 'Waiting for user input'
            : 'Task completed'
      }
    />
  );
}

/**
 * Lightweight glow effect for tree items and list rows
 */
export function GlowBorder({
  state,
  children,
  className,
}: {
  state: GlowState;
  children: ReactNode;
  className?: string;
}) {
  if (state === 'idle') {
    return <div className={cn('relative', className)}>{children}</div>;
  }

  return (
    <div className={cn('relative', className)}>
      {/* Glow effect layer */}
      {state === 'running' && <RunningGlow />}
      {state === 'waiting_input' && <WaitingInputGlow />}
      {state === 'completed' && <CompletedGlow />}

      {/* Content - above glow background */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

/**
 * Glow effect for "running" state - animated green flowing glow
 * Used when Claude is actively working
 */
function RunningGlow() {
  return (
    <>
      {/* Soft radial glow from center */}
      <motion.div
        className="absolute inset-0 rounded-[inherit]"
        style={{
          background:
            'radial-gradient(ellipse at 50% 50%, rgba(34, 197, 94, 0.25) 0%, transparent 70%)',
        }}
        animate={{
          opacity: [0.3, 1, 0.3],
        }}
        transition={{
          duration: 2,
          repeat: Number.POSITIVE_INFINITY,
          ease: 'easeInOut',
        }}
      />
      {/* Complete border highlight */}
      <motion.div
        className="absolute inset-0 rounded-[inherit] pointer-events-none z-20"
        style={{
          border: '1.5px solid rgba(34, 197, 94, 0.9)',
        }}
        animate={{
          opacity: [0.2, 1, 0.2],
        }}
        transition={{
          duration: 1.8,
          repeat: Number.POSITIVE_INFINITY,
          ease: 'easeInOut',
        }}
      />
      {/* Outer soft glow */}
      <motion.div
        className="absolute -inset-[3px] rounded-[inherit] -z-10"
        style={{
          boxShadow: '0 0 40px rgba(34, 197, 94, 0.5)',
        }}
        animate={{
          opacity: [0.2, 1, 0.2],
        }}
        transition={{
          duration: 2,
          repeat: Number.POSITIVE_INFINITY,
          ease: 'easeInOut',
        }}
      />
    </>
  );
}

/**
 * Glow effect for "waiting_input" state - animated amber pulsing glow
 * Used when Claude is waiting for user input
 */
function WaitingInputGlow() {
  return (
    <>
      {/* Soft radial glow */}
      <motion.div
        className="absolute inset-0 rounded-[inherit]"
        style={{
          background:
            'radial-gradient(ellipse at 50% 50%, rgba(251, 191, 36, 0.22) 0%, transparent 70%)',
        }}
        animate={{
          opacity: [0.3, 1, 0.3],
        }}
        transition={{
          duration: 2.8,
          repeat: Number.POSITIVE_INFINITY,
          ease: 'easeInOut',
        }}
      />
      {/* Complete border highlight */}
      <motion.div
        className="absolute inset-0 rounded-[inherit] pointer-events-none z-20"
        style={{
          border: '1.5px solid rgba(251, 191, 36, 0.9)',
        }}
        animate={{
          opacity: [0.2, 1, 0.2],
        }}
        transition={{
          duration: 2.5,
          repeat: Number.POSITIVE_INFINITY,
          ease: 'easeInOut',
        }}
      />
      {/* Outer amber glow */}
      <motion.div
        className="absolute -inset-[3px] rounded-[inherit] -z-10"
        style={{
          boxShadow: '0 0 40px rgba(251, 191, 36, 0.5)',
        }}
        animate={{
          opacity: [0.2, 1, 0.2],
        }}
        transition={{
          duration: 2.8,
          repeat: Number.POSITIVE_INFINITY,
          ease: 'easeInOut',
        }}
      />
    </>
  );
}

/**
 * Glow effect for "completed" state - blue pulsing glow
 * Used when Claude has finished working
 */
function CompletedGlow() {
  return (
    <>
      {/* Soft radial glow - blue tint */}
      <motion.div
        className="absolute inset-0 rounded-[inherit]"
        style={{
          background:
            'radial-gradient(ellipse at 50% 50%, rgba(59, 130, 246, 0.22) 0%, transparent 70%)',
        }}
        animate={{
          opacity: [0.3, 1, 0.3],
        }}
        transition={{
          duration: 3.5,
          repeat: Number.POSITIVE_INFINITY,
          ease: 'easeInOut',
        }}
      />
      {/* Complete border highlight */}
      <motion.div
        className="absolute inset-0 rounded-[inherit] pointer-events-none z-20"
        style={{
          border: '1.5px solid rgba(59, 130, 246, 0.9)',
        }}
        animate={{
          opacity: [0.2, 1, 0.2],
        }}
        transition={{
          duration: 3.2,
          repeat: Number.POSITIVE_INFINITY,
          ease: 'easeInOut',
        }}
      />
      {/* Outer blue glow */}
      <motion.div
        className="absolute -inset-[3px] rounded-[inherit] -z-10"
        style={{
          boxShadow: '0 0 40px rgba(59, 130, 246, 0.5)',
        }}
        animate={{
          opacity: [0.2, 1, 0.2],
        }}
        transition={{
          duration: 3.5,
          repeat: Number.POSITIVE_INFINITY,
          ease: 'easeInOut',
        }}
      />
    </>
  );
}
