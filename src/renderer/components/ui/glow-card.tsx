import { motion } from 'framer-motion';
import { forwardRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';

export type GlowState = 'idle' | 'outputting' | 'unread';

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
 * GlowCard - A card component with animated glow effects based on AI state
 *
 * States:
 * - idle: No glow effect
 * - outputting: Animated flowing glow effect (AI is responding)
 * - unread: Static pulse glow effect (AI finished, user hasn't seen)
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
        {state === 'outputting' && <OutputtingGlow />}
        {state === 'unread' && <UnreadGlow />}

        {/* Content rendered directly to preserve flex layout, z-index applied via relative positioning */}
        {children}
      </Component>
    );
  }
);

GlowCard.displayName = 'GlowCard';

/**
 * Animated flowing glow effect for "outputting" state
 * Creates a border glow that flows around the card
 */
function OutputtingGlow() {
  return (
    <>
      {/* Animated gradient border */}
      <motion.div
        className="absolute inset-0 rounded-[inherit]"
        style={{
          background:
            'linear-gradient(90deg, transparent, rgba(34, 197, 94, 0.6), rgba(34, 197, 94, 0.8), rgba(34, 197, 94, 0.6), transparent)',
          backgroundSize: '200% 100%',
        }}
        animate={{
          backgroundPosition: ['200% 0%', '-200% 0%'],
        }}
        transition={{
          duration: 2,
          repeat: Number.POSITIVE_INFINITY,
          ease: 'linear',
        }}
      />
      {/* Inner mask to create border effect */}
      <div className="absolute inset-[1px] rounded-[inherit] bg-background z-[1]" />
      {/* Outer glow */}
      <motion.div
        className="absolute -inset-[2px] rounded-[inherit] opacity-50"
        style={{
          background:
            'linear-gradient(90deg, transparent, rgba(34, 197, 94, 0.4), rgba(34, 197, 94, 0.6), rgba(34, 197, 94, 0.4), transparent)',
          backgroundSize: '200% 100%',
          filter: 'blur(4px)',
        }}
        animate={{
          backgroundPosition: ['200% 0%', '-200% 0%'],
        }}
        transition={{
          duration: 2,
          repeat: Number.POSITIVE_INFINITY,
          ease: 'linear',
        }}
      />
    </>
  );
}

/**
 * Static pulse glow effect for "unread" state
 * Creates a subtle pulsing amber/yellow glow
 */
function UnreadGlow() {
  return (
    <>
      {/* Pulsing border */}
      <motion.div
        className="absolute inset-0 rounded-[inherit]"
        style={{
          background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.6), rgba(245, 158, 11, 0.6))',
        }}
        animate={{
          opacity: [0.6, 1, 0.6],
        }}
        transition={{
          duration: 2,
          repeat: Number.POSITIVE_INFINITY,
          ease: 'easeInOut',
        }}
      />
      {/* Inner mask */}
      <div className="absolute inset-[1px] rounded-[inherit] bg-background z-[1]" />
      {/* Outer glow */}
      <motion.div
        className="absolute -inset-[2px] rounded-[inherit]"
        style={{
          background: 'rgba(251, 191, 36, 0.3)',
          filter: 'blur(6px)',
        }}
        animate={{
          opacity: [0.3, 0.6, 0.3],
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

  const colorClasses = {
    outputting: 'bg-green-500',
    unread: 'bg-amber-500',
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
        state === 'outputting'
          ? {
              scale: [1, 1.2, 1],
              opacity: [1, 0.8, 1],
            }
          : {
              opacity: [0.6, 1, 0.6],
            }
      }
      transition={{
        duration: state === 'outputting' ? 1 : 2,
        repeat: Number.POSITIVE_INFINITY,
        ease: 'easeInOut',
      }}
      title={state === 'outputting' ? 'AI is responding' : 'New response available'}
    />
  );
}

/**
 * Lightweight glow border effect for tree items and list rows
 * Uses the same animated gradient border as GlowCard for consistency
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
    <div className={cn('relative overflow-hidden', className)}>
      {/* Glow effect layer */}
      {state === 'outputting' && <OutputtingGlow />}
      {state === 'unread' && <UnreadGlow />}

      {/* Content - must be above the glow inner mask (z-[1]) */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
