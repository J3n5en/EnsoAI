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
 * Animated glow effect for "outputting" state
 * Soft breathing glow with subtle edge highlight
 */
function OutputtingGlow() {
  return (
    <>
      {/* Soft radial glow from center - behind content */}
      <motion.div
        className="absolute inset-0 rounded-[inherit]"
        style={{
          background:
            'radial-gradient(ellipse at 50% 50%, rgba(34, 197, 94, 0.18) 0%, transparent 70%)',
        }}
        animate={{
          opacity: [0.6, 1, 0.6],
        }}
        transition={{
          duration: 3,
          repeat: Number.POSITIVE_INFINITY,
          ease: 'easeInOut',
        }}
      />
      {/* Top edge highlight - above content to show through selected state */}
      <motion.div
        className="absolute inset-x-0 top-0 h-[1px] rounded-t-[inherit] z-20"
        style={{
          background:
            'linear-gradient(90deg, transparent 5%, rgba(34, 197, 94, 0.8) 50%, transparent 95%)',
        }}
        animate={{
          opacity: [0.5, 1, 0.5],
        }}
        transition={{
          duration: 2,
          repeat: Number.POSITIVE_INFINITY,
          ease: 'easeInOut',
        }}
      />
      {/* Outer soft glow */}
      <motion.div
        className="absolute -inset-[2px] rounded-[inherit] -z-10"
        style={{
          boxShadow: '0 0 25px rgba(34, 197, 94, 0.35)',
        }}
        animate={{
          opacity: [0.5, 1, 0.5],
        }}
        transition={{
          duration: 3,
          repeat: Number.POSITIVE_INFINITY,
          ease: 'easeInOut',
        }}
      />
    </>
  );
}

/**
 * Glow effect for "unread" state
 * Warm ambient glow with subtle pulse
 */
function UnreadGlow() {
  return (
    <>
      {/* Soft radial glow - behind content */}
      <motion.div
        className="absolute inset-0 rounded-[inherit]"
        style={{
          background:
            'radial-gradient(ellipse at 50% 50%, rgba(251, 191, 36, 0.15) 0%, transparent 70%)',
        }}
        animate={{
          opacity: [0.6, 1, 0.6],
        }}
        transition={{
          duration: 3.5,
          repeat: Number.POSITIVE_INFINITY,
          ease: 'easeInOut',
        }}
      />
      {/* Top edge warm highlight - above content */}
      <motion.div
        className="absolute inset-x-0 top-0 h-[1px] rounded-t-[inherit] z-20"
        style={{
          background:
            'linear-gradient(90deg, transparent 5%, rgba(251, 191, 36, 0.7) 50%, transparent 95%)',
        }}
        animate={{
          opacity: [0.5, 0.9, 0.5],
        }}
        transition={{
          duration: 2.5,
          repeat: Number.POSITIVE_INFINITY,
          ease: 'easeInOut',
        }}
      />
      {/* Outer warm glow */}
      <motion.div
        className="absolute -inset-[2px] rounded-[inherit] -z-10"
        style={{
          boxShadow: '0 0 20px rgba(251, 191, 36, 0.25)',
        }}
        animate={{
          opacity: [0.5, 0.9, 0.5],
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
 * Lightweight glow effect for tree items and list rows
 * Uses the same animated glow as GlowCard for consistency
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

      {/* Content - above glow background */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
